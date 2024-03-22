require('dotenv').config();
const { HOST_CLIENT, PORT, CLIENT } = process.env;
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const qrcode = require('qrcode');
const http = require('http');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const app = express();

const { Server } = require('socket.io');
const { Client, NoAuth, MessageMedia } = require('whatsapp-web.js')
const { phoneNumberFormatter, apiHistoryDatabase } = require('./helpers/formatter');

const dbPath = path.join(__dirname, 'database.db');
const exists = fs.existsSync(dbPath);

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error('Error opening database:', error.message);
  } else {
    console.log('Database connected.');
    server.listen(PORT, () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
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
  } else {
    if (!row) {
      db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, identity VARCHAR(30), code TEXT, phone VARCHAR(30) DEFAULT NULL, qrcode TEXT, status BOOLEAN DEFAULT 0)', (error) => {
        if (error) {
          console.error(`Error creating table: ${error.message}`);
        } else {
          console.log('Table users created successfully.');
          db.run('INSERT INTO users (identity) VALUES ("00001")', (error) => {
            if (error) {
              console.error(`Error insert users: ${error.message}`);
            } else {
              console.log('Insert users created successfully.');
            }
          });
        }
      });
    } else {
      db.run(`UPDATE users SET status = 0, qrcode = NULL`, (error) => {
        if (error) {
          console.error(`Error updating status: ${error.message}`);
        } else {
          console.log('Status updated for all users.');
        }
      });
    }
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [`${HOST_CLIENT}`],
    methods: ["GET", "POST"]
  }
});

const client = new Client({
  restartOnAuthFail: true,
  authStrategy: new NoAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});


let numbers = [];
let image;
let titleMessage = '';
let nameFile = '';
let typeFile = '';
let stopFlag = false;

io.emit('signout', true);

client.on('ready', () => {
  const phone = client.info.wid.user;
  db.run(`UPDATE users SET phone = '${phone}', status = 1 WHERE identity = '00001'`, (error) => {
    if (error) {
      console.log(`Error update user: ${error.message}`);
    } else {
      io.emit('ready', true);
      console.log(`Client ${phone} is ready!`);
    }
  });
});

client.on('qr', (qr) => {
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
          console.log(`QRcode generated.`);
        }
      });
    }
  })
});

client.on('message', message => {
  let pesan = message.body;
  console.log(pesan);
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
});

client.on('loading_screen', (percent) => {
  io.emit('loading', percent);
  if (percent == 100) {
    io.emit('qrcode', false);
  }
});

client.on('disconnected', () => {
  db.run(`UPDATE users SET status = 0, qrcode = NULL`, (error) => {
    if (error) {
      console.error(`Error updating status: ${error.message}`);
    } else {
      console.log('Status updated for all users.');
    }
  });
  io.emit('signout', true);
  client.initialize();
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'client')));

app.use(express.urlencoded({
  extended: true,
  limit: '25mb'
}));

app.get('/', (req, res) => {
  res.send(`Server Whatsapp Sender: ${CLIENT}`);
});

app.post('/send', (req, res) => {
  const state = client.getState();
  const statePromise = new Promise((resolve, reject) => {
    resolve(state);
  })
  statePromise.then(async (value) => {
    if (value === 'CONNECTED') {
      image = null;
      nameFile = '';
      typeFile = '';
      titleMessage = '';
      reqMessage = '';
      identity = '';
      pmb = '';
      numbers = [];
      let contacts = req.body.upload0;
      identity += req.body.identity;
      pmb += req.body.pmb;
      titleMessage += req.body.titleMessage;
      reqMessage += req.body.message;
      image = req.body.upload1;
      if (req.body.upload1 != null) {
        nameFile += req.body.namefile;
        typeFile += req.body.type;
      }
      let contactLength = contacts.split("\n").length;
      for (let i = 0; i < contactLength; i++) {
        let item = contacts.split("\n")[i];
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
        } else if (contact.length == 1) {
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
      }

      stopFlag = false;
      startLoop(reqMessage, titleMessage, identity, pmb);
      let info = `
        <p class="text-center bg-emerald-500 hover:bg-emerald-600 rounded-lg mb-3 px-3 py-1 text-white text-sm">
          <i class="fa-solid fa-circle-info"></i> Pengiriman dimulai!
        </p>`
      io.emit('info', info)
    } else {
      let info = `
        <p class="text-center bg-red-500 hover:bg-red-600 rounded-lg mb-3 px-3 py-1 text-white text-sm">
          <i class="fa-solid fa-circle-info"></i> Ada masalah pengiriman.
        </p>`
      io.emit('info', info)
    }
  })
    .catch((error) => {
      console.log(error);
    })
});

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
        console.log('Success set history');
      })
      .catch((error) => {
        console.log('Failed set history');
      })
  }

  if (isRegisteredNumber) {
    if (typeof (image) == 'string') {
      client.sendMessage(phone, media, {
        caption: message
      });
      console.log('Send media berhasil!');
    } else {
      client.sendMessage(phone, message);
      console.log('Send message berhasil!');
    }
    db.run(`INSERT INTO contacts (name, phone, status) VALUES ("${numbers[i]['0']}", "${numbers[i]['1']}", 1)`, (error) => {
      if (error) {
        console.error(`Error insert contact: ${error.message}`);
      } else {
        let info = `
        <p class="text-center bg-emerald-500 hover:bg-emerald-600 rounded-lg mb-3 px-3 py-1 text-white text-sm">
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
        <p class="text-center bg-red-500 hover:bg-red-600 rounded-lg mb-3 px-3 py-1 text-white text-sm">
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
    await delay(1700);
    sendProcess(i, message, titleMessage, identity, pmb);
  }
  let info = `
    <p class="text-center bg-emerald-500 hover:bg-emerald-600 rounded-lg mb-3 px-3 py-1 text-white text-sm">
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
  console.log('a user connected');

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
  
  socket.emit('reset');

  socket.on('getUsers', () => {
    db.all(`SELECT * FROM users LIMIT 1`, (error, rows) => {
      if (error) {
        console.error(`Error get users: ${error.message}`);
      } else {
        let data = rows[0];
        io.emit('users', data);
        console.log('Success get users.');
      }
    });
  });

  socket.on('setIdentity', (data) => {
    db.run(`UPDATE users SET code = '${data}' WHERE identity = '00001'`, (error) => {
      if (error) {
        console.error(`Error update user: ${error.message}`);
      } else {
        console.log(`Client identity is updated!`);
      }
    });
    db.all(`SELECT * FROM users LIMIT 1`, (error, rows) => {
      if (error) {
        console.error(`Error get user: ${error.message}`);
      } else {
        let data = rows[0];
        io.emit('users', data);
        console.log('Success get user.');
      }
    });
  });

  socket.on('stop', () => {
    stopFlag = true;
    console.log('stop send.');
  });

  socket.on('delete', () => {
    db.exec(`DELETE FROM contacts`);
    console.log('Delete history');
  });

  socket.on('deleteauto', (data) => {
    db.exec(`DELETE FROM autoreply WHERE id = "${data}"`);
    console.log('Delete autoreply');
  });

  socket.on('getHistory', () => {
    db.all("SELECT * FROM contacts", (error, rows) => {
      if (error) {
        console.log(`Error get users: ${error.message}`);
      };
      io.emit('histories', rows)
      console.log('success get histories.');
    });
  });

  socket.on('getBot', () => {
    db.all("SELECT * FROM autoreply", (error, rows) => {
      if (error) {
        console.log(`Error get autoreply: ${error.message}`);
      } else {
        io.emit('bots', rows)
        console.log('success get bots');
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
        <p class="text-center bg-emerald-500 hover:bg-emerald-600 rounded-lg mb-3 px-3 py-1 text-white text-sm">
        <i class="fa-solid fa-circle-check"></i> ${data.trigger} telah ditambahkan!
        </p>`
        io.emit('info', info)
        console.log('success save autoreply');
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