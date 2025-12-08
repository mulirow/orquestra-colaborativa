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
            history: [JSON.parse(JSON.stringify(initialGrid))]
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

        room.history.push(JSON.parse(JSON.stringify(room.grid)));

        io.to(roomId).emit('update-note', {
            row,
            col,
            active: room.grid[row][col]
        });
    });

    socket.on('disconnect', () => {
        // TO-DO: limpar salas vazias
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Orquestras rodando em http://localhost:${PORT}`);
});