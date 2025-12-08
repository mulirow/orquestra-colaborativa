const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Constantes Globais
// TO-DO: deixar constantes globais dinâmicas por sala
const ROWS = 10;
const COLS = 16;

// ARMAZENAMENTO DAS SALAS
// Estrutura: { 'nome-da-sala': { grid: [...], history: [...] } }
const rooms = {};

function getOrCreateRoom(roomId) {
    if (!rooms[roomId]) {
        console.log(`Criando nova sala: ${roomId}`);
        const initialGrid = Array(ROWS).fill().map(() => Array(COLS).fill(0));
        rooms[roomId] = {
            grid: initialGrid,
            history: []  // Now stores individual actions instead of full snapshots
        };
    }
    return rooms[roomId];
}

io.on('connection', (socket) => {
    console.log('Usuário conectado:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.data.currentRoom = roomId;
        const roomData = getOrCreateRoom(roomId);
        socket.emit('initial-state', roomData);

        console.log(`Socket ${socket.id} entrou na sala ${roomId}`);
    });

    socket.on('toggle-note', (data) => {
        const roomId = socket.data.currentRoom;

        if (!roomId || !rooms[roomId]) return;

        const { row, col } = data;

        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

        const room = rooms[roomId];

        room.grid[row][col] = room.grid[row][col] ? 0 : 1;

        // Store individual action instead of full grid snapshot
        const action = {
            row,
            col,
            active: room.grid[row][col],
            timestamp: Date.now()
        };
        room.history.push(action);

        // Broadcast the grid update
        io.to(roomId).emit('update-note', {
            row,
            col,
            active: room.grid[row][col]
        });

        // Broadcast the updated history (single source of truth)
        io.to(roomId).emit('history-update', room.history);
    });

    socket.on('import-state', (stateData) => {
        const roomId = socket.data.currentRoom;

        if (!roomId || !rooms[roomId]) return;

        // Validate imported data
        if (!stateData.grid || !Array.isArray(stateData.grid)) {
            console.log('Invalid import: missing grid');
            return;
        }

        if (!stateData.history || !Array.isArray(stateData.history)) {
            console.log('Invalid import: missing history');
            return;
        }

        // Validate grid dimensions
        if (stateData.grid.length !== ROWS) {
            console.log(`Invalid import: grid should have ${ROWS} rows`);
            return;
        }

        for (let row of stateData.grid) {
            if (!Array.isArray(row) || row.length !== COLS) {
                console.log(`Invalid import: each row should have ${COLS} columns`);
                return;
            }
        }

        // Update room state
        const room = rooms[roomId];
        room.grid = stateData.grid;
        room.history = stateData.history;

        console.log(`State imported to room ${roomId}`);

        // Broadcast the new state to all clients in the room
        io.to(roomId).emit('initial-state', room);
    });

    socket.on('disconnect', () => {
        // TO-DO: limpar salas vazias
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Orquestras rodando em http://localhost:${PORT}`);
});