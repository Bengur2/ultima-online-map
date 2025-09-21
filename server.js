// server.js
const express = require('express');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync'); 

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const adapter = new FileSync('locations.json');
const db = low(adapter);

db.defaults({ locations: [] }).write();

app.get('/api/locations', (req, res) => {
    const locations = db.get('locations').value();
    res.json(locations);
});

app.post('/api/locations', (req, res) => {
    const data = req.body;

    if (!data.coords || typeof data.coords.lat !== 'number' || typeof data.coords.lng !== 'number') {
        return res.status(400).json({ error: 'Neplatná data: Souřadnice jsou povinné a musí být čísla.' });
    }

    const newLocation = {
        _id: String(Date.now()),
        ...data,
        lastUpdated: new Date()
    };

    db.get('locations').push(newLocation).write();

    res.json(newLocation);
});

app.put('/api/locations/:id', (req, res) => {
    const locationId = req.params.id;
    const newData = req.body;
    newData.lastUpdated = new Date();

    const location = db.get('locations').find({ _id: locationId }).assign(newData).write();

    if (!location) {
        return res.status(404).json({ message: 'Místo nenalezeno.' });
    }

    res.json({ message: `Aktualizováno záznamů: 1` });
});

// Nový endpoint pro smazání bodu
app.delete('/api/locations/:id', (req, res) => {
    const locationId = req.params.id;

    const locationExists = db.get('locations').find({ _id: locationId }).value();
    if (!locationExists) {
        return res.status(404).json({ message: 'Místo nenalezeno.' });
    }

    db.get('locations').remove({ _id: locationId }).write();

    res.status(200).json({ message: 'Místo úspěšně smazáno.' });
});

app.listen(port, () => {
    console.log(`Server poslouchá na http://localhost:${port}`);
});