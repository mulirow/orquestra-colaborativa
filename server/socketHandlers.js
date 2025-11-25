/**
 * @fileoverview Manipuladores de eventos Socket.IO
 * @module server/socketHandlers
 */

const roomManager = require('./roomManager');

/**
 * Envia a lista de salas para um socket específico
 * @param {import('socket.io').Socket} socket - Socket do cliente
 */
function sendRoomList(socket) {
    const roomList = roomManager.listRooms();

    console.log('Enviando lista de salas para:', socket.id);
    console.log('Salas disponíveis:', roomList.map(r => `${r.name} (${r.users} usuários)`).join(', '));

    socket.emit('room-list', roomList);
}

/**
 * Envia a lista de salas atualizada para todos os clientes
 * @param {import('socket.io').Server} io - Instância do Socket.IO
 */
function broadcastRoomList(io) {
    const roomList = roomManager.listRooms();

    console.log('Broadcast: Enviando lista atualizada');
    console.log('Total de salas:', roomList.length);

    io.emit('room-list', roomList);
}

/**
 * Manipula evento de entrada em uma sala
 * @param {import('socket.io').Server} io - Instância do Socket.IO
 * @param {import('socket.io').Socket} socket - Socket do cliente
 * @param {string} roomName - Nome da sala
 */
function handleJoinRoom(io, socket, roomName) {
    // Remove da sala anterior se existir
    if (socket.currentRoom && roomManager.roomExists(socket.currentRoom)) {
        const remainingUsers = roomManager.removeUserFromRoom(socket.currentRoom, socket.id);
        socket.leave(socket.currentRoom);

        if (remainingUsers !== null) {
            io.to(socket.currentRoom).emit('user-count', remainingUsers);
        }
    }

    // Adiciona à nova sala
    const userCount = roomManager.addUserToRoom(roomName, socket.id);
    socket.join(roomName);
    socket.currentRoom = roomName;

    // Envia estado inicial da sala
    const roomState = roomManager.getRoomState(roomName);
    if (roomState) {
        socket.emit('initial-state', roomState);
    }

    // Notifica todos na sala sobre o número de usuários
    io.to(roomName).emit('user-count', userCount);

    // Atualiza lista de salas para todos
    broadcastRoomList(io);
}

/**
 * Manipula evento de toggle de nota
 * @param {import('socket.io').Server} io - Instância do Socket.IO
 * @param {import('socket.io').Socket} socket - Socket do cliente
 * @param {{row: number, col: number}} data - Dados da nota
 */
function handleToggleNote(io, socket, data) {
    const { row, col } = data;
    const roomName = socket.currentRoom;

    if (!roomName || !roomManager.roomExists(roomName)) {
        console.warn(`${socket.id} tentou alterar nota sem estar em uma sala`);
        return;
    }

    const result = roomManager.toggleNote(roomName, row, col);

    if (!result.success) {
        console.warn(`Erro ao alternar nota: ${result.error}`);
        return;
    }

    // Emite atualização apenas para a sala específica
    io.to(roomName).emit('update-note', {
        row,
        col,
        active: result.active
    });
}

/**
 * Manipula evento de desconexão
 * @param {import('socket.io').Server} io - Instância do Socket.IO
 * @param {import('socket.io').Socket} socket - Socket do cliente
 */
function handleDisconnect(io, socket) {
    const roomName = socket.currentRoom;

    if (roomName && roomManager.roomExists(roomName)) {
        const remainingUsers = roomManager.removeUserFromRoom(roomName, socket.id);

        if (remainingUsers !== null) {
            io.to(roomName).emit('user-count', remainingUsers);
        }

        broadcastRoomList(io);
    } else {
        console.log(`${socket.id} desconectou sem estar em uma sala`);
    }
}

/**
 * Configura todos os manipuladores de eventos para um socket
 * @param {import('socket.io').Server} io - Instância do Socket.IO
 * @param {import('socket.io').Socket} socket - Socket do cliente
 */
function setupSocketHandlers(io, socket) {
    console.log('Usuário conectou:', socket.id);

    // Envia lista inicial de salas
    sendRoomList(socket);

    // Event listeners
    socket.on('join-room', (roomName) => handleJoinRoom(io, socket, roomName));
    socket.on('toggle-note', (data) => handleToggleNote(io, socket, data));
    socket.on('request-room-list', () => sendRoomList(socket));
    socket.on('check-room-exists', (roomName, callback) => {
        const exists = roomManager.roomExists(roomName);
        const userCount = exists ? roomManager.getRoomUserCount(roomName) : 0;
        callback({ exists, userCount });
    });
    socket.on('disconnect', () => handleDisconnect(io, socket));
}

module.exports = {
    setupSocketHandlers,
    sendRoomList,
    broadcastRoomList
};
