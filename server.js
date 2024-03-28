require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const qrcode = require('qrcode');
const axios = require('axios');
const http = require('http');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const app = express();

const port = process.env.PORT;

const { Server } = require('socket.io');
const { Client, NoAuth, MessageMedia } = require('whatsapp-web.js')
const { phoneNumberFormatter, apiHistoryDatabase } = require('./helpers/formatter');

const dbPath = path.join(__dirname, 'database.db');
const exists = fs.existsSync(dbPath);

const server = http.createServer(app);

const io = new Server(server);

const client = new Client({
  restartOnAuthFail: true,
  authStrategy: new NoAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error('Error opening database:', error.message);
  } else {
    io.on('connection', () => {
      let text = 'Database Connected.';
      io.emit('logging', text);
      console.log(text);
    })
    server.listen(port, () => {
      console.log(`Server berjalan di http://localhost:${port}`);
    });
  }
});

if (!exists) {
  db.run('CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, status BOOLEAN)');
  db.run('CREATE TABLE autoreply (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger TEXT, message TEXT)');
}

db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (error, row) => {
  if (error) {
    console.error(`Error checking table existence: ${error.message}`);
  } else if (!row) {
    db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, identity VARCHAR(30), code TEXT, phone VARCHAR(30) DEFAULT NULL, qrcode TEXT, status BOOLEAN DEFAULT 0)', (error) => {
      if (error) {
        console.error(`Error creating table: ${error.message}`);
      } else {
        console.log('Table users created successfully.');
        db.run('INSERT INTO users (identity) VALUES ("00001")', (error) => {
          if (error) {
            console.error(`Error insert users: ${error.message}`);
          } else {
            let text = 'Berhasil membuat pengguna.';
            io.emit('logging', text);
            console.log(text);
          }
        });
      }
    });
  } else {
    db.run(`UPDATE users SET status = 0, qrcode = NULL`, (error) => {
      if (error) {
        console.error(`Error updating status: ${error.message}`);
      } else {
        let text = 'Berhasil update pengguna.';
        io.emit('logging', text);
        console.log(text);
      }
    });
  }
});

let numbers = [];
let image;
let pmb;
let identity;
let reqMessage;
let titleMessage;
let nameFile = '';
let typeFile = '';
let stopFlag = false;

client.on('ready', () => {
  try {
    const phone = client.info.wid.user;
    db.run(`UPDATE users SET phone = '${phone}', status = 1 WHERE identity = '00001'`, (error) => {
      if (error) {
        console.log(`Error update user: ${error.message}`);
      } else {
        let info = `Client ${phone} sudah berjalan!`;
        io.emit('ready', true);
        io.emit('logging', info);
        console.log(info);
      }
    });
  } catch (error) {
    io.emit('logging', error);
    console.log(error);
  }
});

client.on('changed_state', (data) => {
  try {
    io.emit('logging', data);
    console.log(data);
  } catch (error) {
    io.emit('logging', error);
    console.log(error);
  }
})

client.on('qr', (qr) => {
  try {
    qrcode.toDataURL(qr, (error, url) => {
      if (error) {
        console.error(`Error generating QR code: ${error.message}`);
      } else {
        db.run(`UPDATE users SET qrcode = "${url}" WHERE identity = '00001'`, (error) => {
          if (error) {
            console.log(`Error update user: ${error.message}`);
          } else {
            io.emit('qrcode', true);
            io.emit('qrcodeval', url);
            let text = 'QR Code tersedia.'
            io.emit('logging', text);
            console.log(text);
          }
        });
      }
    })
  } catch (error) {
    io.emit('logging', error);
    console.log(error);
  }
});

client.on('message', (message) => {
  try {
    let pesan = message.body;
    console.log(`-------\nFrom: ${message._data.notifyName}\nMessage: ${message.body}\n-------\n\n`);
    let messageAuto = pesan.replace(/['";]/g, '').toLowerCase();
    db.all(`SELECT * FROM autoreply WHERE trigger == "${messageAuto}" LIMIT 1`, (error, rows) => {
      if (error) {
        console.log(`Error get autoreply: ${error.message}`);
      } else {
        let data = rows;
        if (data.length > 0) {
          message.reply(data[0].message)
        }
      }
    });
  } catch (error) {
    io.emit('logging', error);
    console.log(error);
  }
});

client.on('loading_screen', (percent) => {
  try {
    io.emit('loading', percent);
    if (percent == 100) {
      io.emit('qrcode', false);
    }
  } catch (error) {
    io.emit('logging', error);
    console.log(error);
  }
});

client.on('disconnected', () => {
  try {
    db.run(`UPDATE users SET status = 0, qrcode = NULL`, (error) => {
      if (error) {
        console.error(`Error updating status: ${error.message}`);
      } else {
        let info = 'Status updated for all users.';
        console.log(info);
        io.emit('logging', info);
      }
    });
    io.emit('signout', true);
    client.initialize();
  } catch (error) {
    io.emit('logging', error);
    console.log(error);
  }
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'client')));

app.use(express.urlencoded({
  extended: true,
  limit: '25mb'
}));

app.get('/', (req, res) => {
  res.send(`Server Whatsapp Sender: @kanglerian`);
});

app.post('/send', (req, res) => {
  const statePromise = Promise.resolve(client.getState());
  statePromise.then((value) => {
    if (value === 'CONNECTED') {
      resetVariables();
      extractDataFromRequestBody(req.body);
      processContactList(req.body.upload0);
      console.log(numbers);
      startSendingProcess();
      emitInfoMessage();
    } else {
      emitErrorMessage();
    }
  }).catch((error) => {
    emitErrorMessage();
    io.emit('logging', error);
    console.log(error);
  })
});

const resetVariables = () => {
  image = null;
  pmb = '';
  identity = '';
  reqMessage = '';
  titleMessage = '';
  nameFile = '';
  typeFile = '';
  numbers = [];
}

const extractDataFromRequestBody = (body) => {
  pmb = body.pmb;
  identity = body.identity;
  reqMessage = body.message;
  titleMessage = body.titleMessage;
  image = body.upload1;
  if (body.upload1 != null) {
    nameFile += body.namefile;
    typeFile += body.type;
  }
}

const processContactList = (contactList) => {
  contactList.split("\n").forEach((item) => {
    let contact = item.split(",");
    if (contact.length >= 2) {
      let check = contact;
      if (check[1].length >= 10) {
        let contactString = JSON.stringify(Object.assign({}, contact));
        let contactObject = JSON.parse(contactString);
        numbers.push(contactObject);
      } else {
        check[1] = '0000000000';
        let contactString = JSON.stringify(Object.assign({}, contact));
        let contactObject = JSON.parse(contactString);
        numbers.push(contactObject);
      }
    } else if (contact.length == 1 && contact[0].length > 0) {
      let check = contact;
      if (check[0].length > 0) {
        check.push('0000000000');
        let contactString = JSON.stringify(Object.assign({}, check));
        let contactObject = JSON.parse(contactString);
        numbers.push(contactObject);
      }
    } else {
      let check = ['undefined', '0000000000'];
      let contactString = JSON.stringify(Object.assign({}, check));
      let contactObject = JSON.parse(contactString);
      numbers.push(contactObject);
    }
  });
}

const startSendingProcess = () => {
  stopFlag = false;
  startLoop(reqMessage, titleMessage, identity, pmb);
}

const emitInfoMessage = () => {
  let info = `
      <p class="w-1/2 text-center bg-emerald-500 hover:bg-emerald-600 rounded-lg mb-3 px-5 py-1 text-white text-xs">
          <i class="fa-solid fa-circle-info"></i> Pengiriman dimulai!
      </p>`;
  io.emit('info', info);
}

const emitErrorMessage = (error) => {
  let message = error ? error.message : 'Ada masalah pengiriman.';
  let info = `
      <p class="w-1/2 text-center bg-red-500 hover:bg-red-600 rounded-lg mb-3 px-5 py-1 text-white text-xs">
          <i class="fa-solid fa-circle-info"></i> ${message}
      </p>`;
  io.emit('info', info);
}

const checkRegisteredNumber = async function (phone) {
  const isRegistered = await client.isRegisteredUser(phone);
  return isRegistered;
}

const sendProcess = async (i, messageBucket, titleMessage, identity, pmb) => {
  let phone = phoneNumberFormatter(numbers[i]['1']);
  let history = apiHistoryDatabase(numbers[i]['1']);
  const isRegisteredNumber = await checkRegisteredNumber(phone);

  let subject = Object.assign(numbers[i]);
  let source = Object.values(subject);
  let object = {};
  object[`&fullname`] = source[0];
  object[`&firstname`] = source[0].split(" ")[0];
  object[`&whatsapp`] = source[1];

  for (let i = 2; i < source.length; i++) {
    object[`&var${i - 1}`] = source[i];
  }

  let key = Object.keys(object).join('|');
  let message = messageBucket.replace(new RegExp(key, "g"), matched => object[matched]);

  let media;
  if (typeof (image) == 'string') {
    let attachment = await axios.get(image, {
      responseType: 'arraybuffer'
    }).then(response => {
      return response.data.toString('base64');
    });
    media = new MessageMedia(typeFile, attachment, nameFile);
  }

  if (history !== '62000000000') {
    await axios.post('https://api.politekniklp3i-tasikmalaya.ac.id/history/store', {
      identity: identity,
      pmb: pmb,
      phone: history,
      title: titleMessage,
      result: message
    })
      .then((res) => {
        let text = 'Chat terbaru sudah tersimpan.'
        io.emit('logging', text);
        console.log(text);
      })
      .catch((error) => {
        let text = 'Gagal menyimpan chat.'
        io.emit('logging', text);
        console.log(text);
      })
  }

  if (isRegisteredNumber) {
    if (typeof (image) == 'string') {
      client.sendMessage(phone, media, {
        caption: message
      });
      let text = 'Mengirim media berhasil!';
      io.emit('logging', text);
      io.emit('send', true);
      console.log(text);
    } else {
      client.sendMessage(phone, message);
      let text = 'Mengirim pesan berhasil!';
      io.emit('logging', text);
      io.emit('send', true);
      console.log(text);
    }
    db.run(`INSERT INTO contacts (name, phone, status) VALUES ("${numbers[i]['0']}", "${numbers[i]['1']}", 1)`, (error) => {
      if (error) {
        console.error(`Error insert contact: ${error.message}`);
      } else {
        let info = `
        <p class="w-1/2 text-center bg-emerald-500 hover:bg-emerald-600 rounded-lg mb-3 px-5 py-1 text-white text-xs">
          <i class="fa-solid fa-circle-check"></i> ${numbers[i]['0']}  ${numbers[i]['1']}
        </p>`
        io.emit('info', info)
        io.emit('percent', { counter: i + 1, length: numbers.length })
      }
    });
  } else {
    db.run(`INSERT INTO contacts (name, phone, status) VALUES ("${numbers[i]['0']}", "${numbers[i]['1']}", 0)`, (error) => {
      if (error) {
        console.error(`Error insert contact: ${error.message}`);
      } else {
        let info = `
        <p class="w-1/2 text-center bg-red-500 hover:bg-red-600 rounded-lg mb-3 px-5 py-1 text-white text-xs">
          <i class="fa-solid fa-circle-xmark"></i> ${numbers[i]['0']}  ${numbers[i]['1']}
        </p>`
        io.emit('info', info)
        io.emit('percent', { counter: i + 1, length: numbers.length })
      }
    });
  }
}

async function startLoop(message, titleMessage, identity, pmb) {
  for (let i = 0; i < numbers.length; i++) {
    if (stopFlag) {
      break;
    }
    await delay(2000);
    sendProcess(i, message, titleMessage, identity, pmb);
  }
  let info = `
    <p class="w-1/2 text-center bg-emerald-500 hover:bg-emerald-600 rounded-lg mb-3 px-5 py-1 text-white text-xs">
    <i class="fa-solid fa-clipboard-check"></i> Pengiriman selesai!
    </p>`
  setTimeout(() => {
    io.emit('info', info)
  }, 2000);
  stopFlag = true;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

io.on('connection', (socket) => {

  let text = 'Client tersambung!'
  io.emit('logging', text);

  socket.on('disconnect', () => {
    let text = 'Client terputus!'
    io.emit('logging', text);
  });

  socket.emit('reset');

  socket.on('getUsers', () => {
    db.all(`SELECT * FROM users LIMIT 1`, (error, rows) => {
      if (error) {
        console.error(`Error get users: ${error.message}`);
      } else {
        let data = rows[0];
        io.emit('users', data);
        io.emit('logging', 'Berhasil mengambil data pengguna.')
        console.log('Berhasil mengambil data pengguna.');
      }
    });
  });

  socket.on('setIdentity', (data) => {
    db.run(`UPDATE users SET code = '${data}' WHERE identity = '00001'`, (error) => {
      if (error) {
        console.error(`Error update user: ${error.message}`);
      } else {
        let text = 'Identitas Client sudah terupdate!';
        io.emit('logging', text)
        console.log(text);
      }
    });
    db.all(`SELECT * FROM users LIMIT 1`, (error, rows) => {
      if (error) {
        console.error(`Error get user: ${error.message}`);
      } else {
        let data = rows[0];
        io.emit('users', data);
        let text = 'Berhasil mengambil pengguna.';
        io.emit('logging', text)
        console.log(text);
      }
    });
  });

  socket.on('stop', () => {
    stopFlag = true;
    let text = 'Berhenti pengiriman!';
    io.emit('logging', text)
    console.log(text);
  });

  socket.on('delete', () => {
    db.exec(`DELETE FROM contacts`);
    let text = 'Menghapus riwayat.';
    io.emit('logging', text);
    console.log(text);
  });

  socket.on('deleteauto', (data) => {
    db.exec(`DELETE FROM autoreply WHERE id = "${data}"`);
    let text = 'Menghapus Auto Reply.';
    io.emit('logging', text);
    console.log(text);
  });

  socket.on('getHistory', () => {
    db.all("SELECT * FROM contacts", (error, rows) => {
      if (error) {
        console.log(`Error get users: ${error.message}`);
      };
      io.emit('histories', rows)
      let text = 'Berhasil mengambil riwayat.';
      io.emit('logging', text);
      console.log(text);
    });
  });

  socket.on('getBot', () => {
    db.all("SELECT * FROM autoreply", (error, rows) => {
      if (error) {
        console.log(`Error get autoreply: ${error.message}`);
      } else {
        io.emit('bots', rows)
        let text = 'Berhasil mengambil BOT.';
        io.emit('logging', text);
        console.log(text);
      };
    });
  });

  socket.on('savebot', (data) => {
    let triggerCheck = data.trigger;
    let trigger = triggerCheck.replace(/['";]/g, '').toLowerCase();
    let message = data.automessage;
    db.run(`INSERT INTO autoreply (trigger, message) VALUES ("${trigger}", "${message}")`, (error) => {
      if (error) {
        console.log(`Error insert autoreply: ${error.message}`);
      } else {
        let info = `
        <p class="w-1/2 text-center bg-emerald-500 hover:bg-emerald-600 rounded-lg mb-3 px-5 py-1 text-white text-xs">
        <i class="fa-solid fa-circle-check"></i> ${data.trigger} telah ditambahkan!
        </p>`
        io.emit('info', info)
        let text = 'Berhasil menyimpan Auto Reply.';
        io.emit('logging', text);
        console.log(text);
      }
    });
  });

})

client.initialize();

process.on('beforeExit', () => {
  console.log('Server Express.js akan berhenti');
});

process.on('SIGINT', () => {
  io.emit('reset', true);
  console.log('Server Express.js dimatikan melalui SIGINT');
  process.exit(0);
});