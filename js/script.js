// script.js

// Globální proměnné pro mapu, seznam míst a markery
let map;
let locations = [];
const markers = {};
let addingMode = false;
let currentClickLatLng = null;

// Definice ikon pro markery
const defaultIcon = new L.Icon.Default();

const respawnReadyIcon = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const respawningIcon = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});


// Inicializace mapy a jejího nastavení
function setupMap() {
    map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 2,
        zoom: 0,
        center: [0, 0]
    });

    const imageUrl = 'images/uo_mapa.png';
    const bounds = [
        [-500, -500],
        [500, 500]
    ];
    L.imageOverlay(imageUrl, bounds).addTo(map);
    map.setMaxBounds(bounds);
}

// Funkce pro získání dat ze serveru
async function fetchLocations() {
    try {
        const response = await fetch('/api/locations');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        locations = await response.json();
        updateLocationList();
        renderMarkers();
    } catch (error) {
        console.error('Chyba při načítání dat z backendu:', error);
    }
}

// Funkce pro přidání nového místa
function addNewLocation(latlng, type, name) {
    const newLocation = {
        name: name || `Nové ${type}`,
        type: type,
        status: 'present',
        coords: { lat: latlng.lat, lng: latlng.lng }
    };
    
    fetch('/api/locations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(newLocation)
    })
    .then(response => response.json())
    .then(savedLocation => {
        locations.push(savedLocation);
        renderMarkers();
        updateLocationList();
    })
    .catch(error => console.error('Chyba při ukládání nové značky:', error));
}

// Funkce pro aktualizaci stavu značky
async function updateStatus(id, newStatus) {
    const location = locations.find(loc => loc._id === id);
    if (!location) return;

    let dataToUpdate = {
        status: newStatus,
        lastUpdated: new Date()
    };
    
    if (newStatus === 'looted' || newStatus === 'tamed') {
        dataToUpdate.status = 'respawning';
        dataToUpdate.spawnTime = new Date();
    } else if (newStatus === 'present') {
        dataToUpdate.status = 'present';
        dataToUpdate.spawnTime = null;
    }


    try {
        const response = await fetch(`/api/locations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToUpdate)
        });

        if (response.ok) {
            location.status = dataToUpdate.status;
            location.lastUpdated = dataToUpdate.lastUpdated;
            location.spawnTime = dataToUpdate.spawnTime;
            updateLocationList();
            
            const marker = markers[location._id];
            if (marker) {
                if (location.status === 'respawning' && !isRespawnReady(location)) {
                     marker.setIcon(respawningIcon);
                } else if (isRespawnReady(location)) {
                    marker.setIcon(respawnReadyIcon);
                } else {
                    marker.setIcon(defaultIcon);
                }
                
                if (marker.getPopup().isOpen()) {
                    marker.getPopup().setContent(createPopupContent(location));
                }
            }

        } else {
            console.error('Chyba při aktualizaci stavu na serveru.');
        }
    } catch (error) {
        console.error('Chyba při komunikaci s backendem:', error);
    }
}

// Funkce pro smazání bodu
async function deleteLocation(id) {
    if (!confirm("Opravdu chcete smazat toto místo?")) return;

    try {
        const response = await fetch(`/api/locations/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            locations = locations.filter(loc => loc._id !== id);
            map.removeLayer(markers[id]);
            delete markers[id];
            updateLocationList();
        } else {
            console.error('Chyba při mazání místa na serveru.');
        }
    } catch (error) {
        console.error('Chyba při komunikaci s backendem:', error);
    }
}

// Funkce pro editaci bodu
async function editLocation(id) {
    const location = locations.find(loc => loc._id === id);
    if (!location) return;

    const newName = prompt("Zadejte nové jméno:", location.name);
    if (newName === null) return; // Zrušeno uživatelem

    const respawnTimeInput = prompt("Zadejte čas respawnu v hodinách (nechte prázdné, pokud neznáte):", location.respawnTimeInHours || '');
    let newRespawnTime = respawnTimeInput === '' ? null : parseFloat(respawnTimeInput);
    if (isNaN(newRespawnTime)) {
        alert("Neplatný formát času. Čas nebyl upraven.");
        newRespawnTime = location.respawnTimeInHours;
    }

    const dataToUpdate = {
        name: newName,
        respawnTimeInHours: newRespawnTime
    };

    try {
        const response = await fetch(`/api/locations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToUpdate)
        });

        if (response.ok) {
            location.name = newName;
            location.respawnTimeInHours = newRespawnTime;
            updateLocationList();
            
            const marker = markers[location._id];
            if (marker && marker.getPopup().isOpen()) {
                marker.getPopup().setContent(createPopupContent(location));
            }

        } else {
            console.error('Chyba při editaci místa na serveru.');
        }
    } catch (error) {
        console.error('Chyba při komunikaci s backendem:', error);
    }
}

// Funkce pro editaci typu bodu
async function editLocationType(id, newType) {
    const location = locations.find(loc => loc._id === id);
    if (!location) return;

    const dataToUpdate = {
        type: newType
    };

    try {
        const response = await fetch(`/api/locations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToUpdate)
        });

        if (response.ok) {
            location.type = newType;
            updateLocationList();
            
            const marker = markers[location._id];
            if (marker && marker.getPopup().isOpen()) {
                marker.getPopup().setContent(createPopupContent(location));
            }

        } else {
            console.error('Chyba při editaci typu místa na serveru.');
        }
    } catch (error) {
        console.error('Chyba při komunikaci s backendem:', error);
    }
}


// Funkce pro vykreslení značek na mapě
function renderMarkers() {
    for (const id in markers) {
        if (markers.hasOwnProperty(id)) {
            map.removeLayer(markers[id]);
        }
    }

    locations.forEach(location => {
        if (!location.coords || typeof location.coords.lat !== 'number' || typeof location.coords.lng !== 'number') {
            console.warn(`Přeskočen záznam s neplatnými souřadnicemi:`, location);
            return;
        }

        let icon = defaultIcon;
        if (location.status === 'respawning') {
            if (isRespawnReady(location)) {
                icon = respawnReadyIcon;
            } else {
                icon = respawningIcon;
            }
        }
        
        const marker = L.marker([location.coords.lat, location.coords.lng], { icon: icon }).addTo(map);
        marker.bindPopup(() => createPopupContent(location));
        
        markers[location._id] = marker; 
    });
}

// Pomocná funkce pro kontrolu, zda je respawn hotov
function isRespawnReady(location) {
    if (!location.spawnTime || !location.respawnTimeInHours) return false;
    const respawnDurationMs = location.respawnTimeInHours * 60 * 60 * 1000;
    const respawnTimeMs = new Date(location.spawnTime).getTime() + respawnDurationMs;
    return new Date().getTime() >= respawnTimeMs;
}

// Pomocná funkce pro vytváření pop-up obsahu
function createPopupContent(location) {
    let statusButtons = '';
    if (location.type === 'poklad' || location.type === 'dungeon') {
        statusButtons = `
            <button onclick="updateStatus('${location._id}', 'looted')">Vybráno</button>
            <button onclick="updateStatus('${location._id}', 'present')">Spawnulo</button>
        `;
    } else if (location.type === 'spawn') {
        statusButtons = `
            <button onclick="updateStatus('${location._id}', 'tamed')">Ochočeno</button>
            <button onclick="updateStatus('${location._id}', 'present')">Spawnulo</button>
        `;
    }

    let respawnInfo = '';
    if (location.respawnTimeInHours) {
        const respawnDurationMs = location.respawnTimeInHours * 60 * 60 * 1000;
        const respawnTime = new Date(new Date(location.lastUpdated).getTime() + respawnDurationMs);
        const respawnTimeString = respawnTime.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });

        respawnInfo = `
            <br>
            Délka timeru: ${location.respawnTimeInHours}h<br>
            Odhadovaný spawn: ${respawnTimeString}
        `;
    }

    const editButtons = `
        <hr>
        <button onclick="editLocation('${location._id}')">Upravit jméno a timer</button>
        <br>
        <button onclick="editLocationType('${location._id}', 'poklad')">Změnit na poklad</button>
        <button onclick="editLocationType('${location._id}', 'spawn')">Změnit na spawn</button>
        <button onclick="editLocationType('${location._id}', 'dungeon')">Změnit na dungeon</button>
        <hr>
        <button onclick="deleteLocation('${location._id}')">Smazat</button>
    `;

    const lastUpdated = location.lastUpdated ? new Date(location.lastUpdated) : null;
    const lastUpdatedString = lastUpdated ? `<br>Naposledy změněno: ${lastUpdated.toLocaleDateString()} ${lastUpdated.toLocaleTimeString()}` : '';

    return `
        <b>${location.name}</b><br>
        Typ: ${location.type}<br>
        Stav: <span id="status-${location._id}">${location.status}</span><br>
        ${lastUpdatedString}
        ${respawnInfo}
        <div id="timer-${location._id}"></div>
        ${statusButtons}
        ${editButtons}
    `;
}

// Funkce pro řazení bodů
function sortLocations(criteria, direction) {
    locations.sort((a, b) => {
        let comparison = 0;

        if (criteria === 'name') {
            comparison = a.name.localeCompare(b.name);
        } else if (criteria === 'status') {
            const statusOrder = { 'present': 1, 'looted': 2, 'tamed': 2, 'respawning': 3 };
            const statusComparison = statusOrder[a.status] - statusOrder[b.status];
            if (statusComparison !== 0) {
                comparison = statusComparison;
            } else {
                comparison = a.name.localeCompare(b.name);
            }
        } else if (criteria === 'elapsed_time') {
            const timeA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
            const timeB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
            comparison = timeA - timeB;
        }

        return direction === 'desc' ? -comparison : comparison;
    });
}

// Funkce pro získání filtrovaného seznamu bodů
function getFilteredLocations() {
    const activeFilters = [];
    document.querySelectorAll('.filters input[type="checkbox"]:checked').forEach(checkbox => {
        activeFilters.push(checkbox.value);
    });

    if (activeFilters.length === 0) {
        return locations;
    } else {
        return locations.filter(location => activeFilters.includes(location.type));
    }
}

// Funkce pro aktualizaci seznamu míst
function updateLocationList() {
    const sortBy = document.getElementById('sort-by').value;
    const sortDirection = document.getElementById('sort-direction').value;
    sortLocations(sortBy, sortDirection);

    const listElement = document.getElementById('location-list');
    listElement.innerHTML = ''; 

    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    const filteredLocations = getFilteredLocations();
    
    filteredLocations.forEach(location => {
        if (searchTerm === '' || location.name.toLowerCase().includes(searchTerm)) {
            const listItem = document.createElement('li');
            let statusText = location.status;
            if (location.status === 'respawning') {
                statusText = 'čeká na spawn';
            } else if (location.status === 'looted') {
                statusText = 'vybráno';
            } else if (location.status === 'tamed') {
                statusText = 'ochočeno';
            } else if (location.status === 'present') {
                statusText = 'přítomno';
            }
            
            if (location.status === 'respawning' && isRespawnReady(location)) {
                listItem.classList.add('respawn-ready');
            } else {
                listItem.classList.remove('respawn-ready');
            }
            
            listItem.innerHTML = `
                <strong>${location.name}</strong> (${statusText})
                <div id="time-list-${location._id}"></div>
            `;
            
            listItem.onclick = () => {
                map.flyTo(location.coords, 2);
                if (markers[location._id]) {
                    markers[location._id].openPopup();
                }
            };

            listElement.appendChild(listItem);
            
            // Okamžitá aktualizace časovače po vytvoření prvku v seznamu
            updateTimer(location);
        }
    });
}

// Funkce pro aktualizaci časovače
function updateTimer(location) {
    const timerElementPopup = document.getElementById(`timer-${location._id}`);
    const timerElementList = document.getElementById(`time-list-${location._id}`);
    
    let lastUpdatedTimeStr = '';
    let remainingTimeStr = '';

    // Uplynulý čas od poslední změny
    if (location.lastUpdated) {
        const timeSinceUpdate = (new Date() - new Date(location.lastUpdated)) / 1000;
        const hours = Math.floor(timeSinceUpdate / 3600);
        const minutes = Math.floor((timeSinceUpdate % 3600) / 60);
        const seconds = Math.floor(timeSinceUpdate % 60);
        lastUpdatedTimeStr = `Uplynulý čas: ${hours}h ${minutes}m ${seconds}s`;
    }

    // Odpočet
    if (location.status === 'respawning' && location.spawnTime && location.respawnTimeInHours) {
        const respawnDurationMs = location.respawnTimeInHours * 60 * 60 * 1000;
        const respawnTimeMs = new Date(location.spawnTime).getTime() + respawnDurationMs;
        const remainingMs = respawnTimeMs - new Date().getTime();

        if (remainingMs > 0) {
            const hours = Math.floor(remainingMs / (1000 * 60 * 60));
            const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
            remainingTimeStr = `Zbývající čas: ${hours}h ${minutes}m ${seconds}s`;
        } else {
            remainingTimeStr = 'Spawn hotov!';
        }
    }
    
    // Zobrazení obou časů v pop-upu
    if (timerElementPopup) {
        const popupTimeString = [lastUpdatedTimeStr, remainingTimeStr].filter(Boolean).join('<br>');
        timerElementPopup.innerHTML = popupTimeString;
    }
    
    // Zobrazení obou časů v listu
    if (timerElementList) {
        const listTimeString = [lastUpdatedTimeStr, remainingTimeStr].filter(Boolean).join('<br>');
        timerElementList.innerHTML = listTimeString;
    }
    
    // Dynamická změna ikony markeoru
    if (location.status === 'respawning' && location.respawnTimeInHours) {
        if (isRespawnReady(location)) {
            markers[location._id]?.setIcon(respawnReadyIcon);
        } else {
            markers[location._id]?.setIcon(respawningIcon);
        }
    } else {
        markers[location._id]?.setIcon(defaultIcon);
    }
}

// Nová funkce pro aplikování filtrů
function applyFilters() {
    const activeFilters = [];
    document.querySelectorAll('.filters input[type="checkbox"]:checked').forEach(checkbox => {
        activeFilters.push(checkbox.value);
    });

    locations.forEach(location => {
        const marker = markers[location._id];
        if (!marker) return;

        if (activeFilters.length === 0 || activeFilters.includes(location.type)) {
            marker.addTo(map);
        } else {
            map.removeLayer(marker);
        }
    });
}

// Spuštění inicializačních funkcí po načtení DOM
document.addEventListener('DOMContentLoaded', () => {
    setupMap();
    fetchLocations();

    document.getElementById('add-location-btn').addEventListener('click', () => {
        addingMode = true;
        document.getElementById('add-location-btn').disabled = true;
        document.getElementById('instruction').style.display = 'block';
        document.getElementById('type-selection-container').style.display = 'none';
        map.getContainer().style.cursor = 'crosshair';
    });

    document.getElementById('sort-by').addEventListener('change', () => {
        updateLocationList();
        renderMarkers();
    });

    document.getElementById('sort-direction').addEventListener('change', () => {
        updateLocationList();
        renderMarkers();
    });

    document.querySelectorAll('.filters input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            applyFilters();
            updateLocationList();
        });
    });

    document.getElementById('search-input').addEventListener('input', () => {
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        
        updateLocationList();

        locations.forEach(location => {
            const marker = markers[location._id];
            if (!marker) return;
            
            if (location.name.toLowerCase().includes(searchTerm) || searchTerm === '') {
                marker.addTo(map);
            } else {
                map.removeLayer(marker);
            }
        });
    });

    document.querySelectorAll('.type-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const selectedType = e.target.dataset.type;
            const locationName = prompt("Zadej jméno pro bod:");

            if (locationName) {
                const respawnTimeInput = prompt("Zadejte čas respawnu v hodinách (nechte prázdné, pokud neznáte):", '');
                let respawnTime = respawnTimeInput === '' ? null : parseFloat(respawnTimeInput);
                if (isNaN(respawnTime)) {
                    alert("Neplatný formát času. Čas nebude uložen.");
                    respawnTime = null;
                }
                
                document.getElementById('type-selection-container').style.display = 'none';
                document.getElementById('instruction').style.display = 'none';
                document.getElementById('add-location-btn').disabled = false;
                map.getContainer().style.cursor = '';
                
                addNewLocation(currentClickLatLng, selectedType, locationName, respawnTime);
            } else {
                addingMode = false;
                document.getElementById('type-selection-container').style.display = 'none';
                document.getElementById('instruction').style.display = 'none';
                document.getElementById('add-location-btn').disabled = false;
                map.getContainer().style.cursor = '';
            }
        });
    });

    map.on('click', (e) => {
        if (addingMode) {
            currentClickLatLng = e.latlng;
            document.getElementById('instruction').style.display = 'none';
            document.getElementById('type-selection-container').style.display = 'block';
        }
    });

    setInterval(() => {
        locations.forEach(location => {
            updateTimer(location);
        });
    }, 1000);
});