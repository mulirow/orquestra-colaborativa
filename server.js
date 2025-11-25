/**
 * @fileoverview Servidor principal da Orquestra Colaborativa
 * @description Aplicação de música colaborativa em tempo real usando Socket.IO
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./server/config');
const roomManager = require('./server/roomManager');
const { setupSocketHandlers } = require('./server/socketHandlers');

// ==================== SETUP DO SERVIDOR ====================

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ==================== INICIALIZAÇÃO ====================

/**
 * Inicializa o servidor e recursos
 */
function initialize() {
    // Cria salas padrão
    roomManager.initializeDefaultRooms(config.DEFAULT_ROOMS);

    // Configura event handlers do Socket.IO
    io.on('connection', (socket) => setupSocketHandlers(io, socket));

    // Inicia servidor HTTP
    server.listen(config.PORT, () => {
        console.log(`Orquestra Colaborativa rodando em http://localhost:${config.PORT}`);
        console.log(`Grid configurado: ${config.ROWS}x${config.COLS}`);
        console.log(`Salas iniciais: ${config.DEFAULT_ROOMS.join(', ')}`);
    });
}

// ==================== START ====================

initialize();

// Exporta para testes (opcional)
module.exports = { app, server, io };
