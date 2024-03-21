require('dotenv').config();
const { HOST_CLIENT, PORT, CLIENT } = process.env;
const express = require('express');
const qrcode = require('qrcode');
const http = require('http');
const path = require('path');
const cors = require('cors');
const app = express();

const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js')

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [`${HOST_CLIENT}`],
    methods: ["GET", "POST"]
  }
});

const client = new Client({
  restartOnAuthFail: true,
  authStrategy: new LocalAuth({
    clientId: 'client'
  }),
  puppeteer: {
	args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

client.once('ready', () => {
  console.log('Client is ready!');
});

client.on('qr', (qr) => {
  qrcode.toDataURL(qr, (error, url) => {
    io.emit('qrcode', url);
  });
	console.log('qrcode');
});

client.on('message', (message) => {
  console.log(message.body);
});

client.initialize();

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

io.on('connection', (socket) => {
  console.log('a user connected');
})

server.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
