const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// CONFIGURAÇÃO DO GRID
// 10 Linhas: 8 Melódicas + 2 Bateria
const ROWS = 10;
const COLS = 16;

// Inicializa a Matriz
let gridState = Array(ROWS).fill().map(() => Array(COLS).fill(0));

// Histórico para o Timelapse
let history = [JSON.parse(JSON.stringify(gridState))];

io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // Envia estado inicial
    socket.emit('initial-state', { grid: gridState, history: history });

    socket.on('toggle-note', (data) => {
        const { row, col } = data;

        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
            console.warn(`Tentativa inválida de acesso: Row ${row}, Col ${col}`);
            return;
        }

        gridState[row][col] = gridState[row][col] ? 0 : 1;

        // Salva Snapshot
        history.push(JSON.parse(JSON.stringify(gridState)));

        io.emit('update-note', {
            row,
            col,
            active: gridState[row][col]
        });
    });

    socket.on('disconnect', () => {
        console.log('Usuário desconectou');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Orquestra rodando em http://localhost:${PORT}`);
});