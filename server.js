// server.js
const express = require('express');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync'); 
const path = require('path');
const { Server } = require("socket.io");
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Důležité: Opravená inicializace Lowdb pro novější verze
const adapter = new FileSync('/data/locations.json');
const db = low(adapter);

db.defaults({ locations: [] }).write();

io.on('connection', (socket) => {
  console.log('Nový uživatel se připojil:', socket.id);
  socket.on('disconnect', () => {
    console.log('Uživatel se odpojil:', socket.id);
  });
});

app.get('/api/locations', (req, res) => {
  const locations = db.get('locations').value();
  res.json(locations);
});

app.post('/api/locations', (req, res) => {
  const data = req.body;
  if (!data.coords || typeof data.coords.lat !== 'number' || typeof data.coords.lng !== 'number') {
    return res.status(400).json({ error: 'Neplatná data.' });
  }

  const newLocation = {
    _id: String(Date.now()),
    ...data,
    lastUpdated: new Date()
  };

  db.get('locations').push(newLocation).write();
  
  io.emit('location-updated');
  res.json(newLocation);
});

app.put('/api/locations/:id', (req, res) => {
  const locationId = req.params.id;
  const newData = req.body;

  const locationIndex = db.get('locations').value().findIndex(loc => loc._id === locationId);
  if (locationIndex === -1) {
    return res.status(404).json({ message: 'Místo nenalezeno.' });
  }

  db.get('locations').find({ _id: locationId }).assign(newData).write();

  io.emit('location-updated');
  res.json({ message: `Aktualizováno záznamů: 1` });
});

app.delete('/api/locations/:id', (req, res) => {
  const locationId = req.params.id;

  const locationExists = db.get('locations').find({ _id: locationId }).value();
  if (!locationExists) {
    return res.status(404).json({ message: 'Místo nenalezeno.' });
  }

  db.get('locations').remove({ _id: locationId }).write();

  io.emit('location-updated');
  res.status(200).json({ message: 'Místo úspěšně smazáno.' });
});

server.listen(port, () => {
  console.log(`Server poslouchá na http://localhost:${port}`);
});