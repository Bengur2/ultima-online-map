// server.js
const express = require('express');
const cors = require('cors');
const http = require('http'); // Nový import pro vytvoření HTTP serveru
const { Low, JSONFile } = require('lowdb'); // Přejdeme zpět na asynchronní lowdb
const path = require('path');
const { Server } = require("socket.io"); // Nový import pro Socket.IO

const app = express();
const server = http.createServer(app); // Vytvoříme HTTP server
const io = new Server(server, { // Vytvoříme Socket.IO server
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const file = new JSONFile('/data/locations.json');
const db = new Low(file);

async function initDb() {
  await db.read();
  db.data = db.data || { locations: [] };
  await db.write();
}

initDb();

// WebSocket logika
io.on('connection', (socket) => {
  console.log('Nový uživatel se připojil:', socket.id);
  socket.on('disconnect', () => {
    console.log('Uživatel se odpojil:', socket.id);
  });
});

app.get('/api/locations', async (req, res) => {
  await db.read();
  res.json(db.data.locations);
});

app.post('/api/locations', async (req, res) => {
  const data = req.body;
  if (!data.coords || typeof data.coords.lat !== 'number' || typeof data.coords.lng !== 'number') {
    return res.status(400).json({ error: 'Neplatná data.' });
  }

  const newLocation = {
    _id: String(Date.now()),
    ...data,
    lastUpdated: new Date()
  };

  db.data.locations.push(newLocation);
  await db.write();
  
  io.emit('location-updated'); // Oznámíme klientům, že došlo ke změně
  res.json(newLocation);
});

app.put('/api/locations/:id', async (req, res) => {
  const locationId = req.params.id;
  const newData = req.body;

  const locationIndex = db.data.locations.findIndex(loc => loc._id === locationId);
  if (locationIndex === -1) {
    return res.status(404).json({ message: 'Místo nenalezeno.' });
  }

  db.data.locations[locationIndex] = { ...db.data.locations[locationIndex], ...newData, lastUpdated: new Date() };
  await db.write();

  io.emit('location-updated');
  res.json({ message: `Aktualizováno záznamů: 1` });
});

app.delete('/api/locations/:id', async (req, res) => {
  const locationId = req.params.id;

  const locationExists = db.data.locations.find(loc => loc._id === locationId);
  if (!locationExists) {
    return res.status(404).json({ message: 'Místo nenalezeno.' });
  }

  db.data.locations = db.data.locations.filter(loc => loc._id !== locationId);
  await db.write();

  io.emit('location-updated');
  res.status(200).json({ message: 'Místo úspěšně smazáno.' });
});

server.listen(port, () => {
  console.log(`Server poslouchá na http://localhost:${port}`);
});