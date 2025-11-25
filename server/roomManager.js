/**
 * @fileoverview Gerenciador de salas para a Orquestra Colaborativa
 * @module server/roomManager
 */

const { ROWS, COLS } = require('./config');

/**
 * @typedef {Object} Room
 * @property {number[][]} gridState - Estado atual do grid (matriz de notas)
 * @property {number[][][]} history - Histórico de estados do grid
 * @property {Set<string>} users - IDs dos usuários conectados na sala
 */

/**
 * Armazena todas as salas ativas
 * @type {Object.<string, Room>}
 */
const rooms = {};

/**
 * Cria uma nova sala com grid vazio
 * @param {string} roomName - Nome da sala a ser criada
 * @returns {Room} A sala criada
 */
function createRoom(roomName) {
    const gridState = Array(ROWS).fill().map(() => Array(COLS).fill(0));

    rooms[roomName] = {
        gridState,
        history: [JSON.parse(JSON.stringify(gridState))],
        users: new Set()
    };

    console.log(`Sala criada: ${roomName}`);
    console.log(`Total de salas ativas: ${Object.keys(rooms).length}`);

    return rooms[roomName];
}

/**
 * Obtém uma sala existente ou cria se não existir
 * @param {string} roomName - Nome da sala
 * @returns {Room} A sala solicitada
 */
function getOrCreateRoom(roomName) {
    if (!rooms[roomName]) {
        console.log(`Sala ${roomName} não existe, criando...`);
        return createRoom(roomName);
    }
    return rooms[roomName];
}

/**
 * Verifica se uma sala existe
 * @param {string} roomName - Nome da sala
 * @returns {boolean} True se a sala existe
 */
function roomExists(roomName) {
    return roomName in rooms;
}

/**
 * Adiciona um usuário a uma sala
 * @param {string} roomName - Nome da sala
 * @param {string} socketId - ID do socket do usuário
 * @returns {number} Número de usuários na sala após adicionar
 */
function addUserToRoom(roomName, socketId) {
    const room = getOrCreateRoom(roomName);
    room.users.add(socketId);

    console.log(`${socketId} adicionado à ${roomName} | Total: ${room.users.size}`);
    console.log(`Usuários na sala ${roomName}:`, Array.from(room.users));

    return room.users.size;
}

/**
 * Remove um usuário de uma sala
 * @param {string} roomName - Nome da sala
 * @param {string} socketId - ID do socket do usuário
 * @returns {number|null} Número de usuários restantes ou null se sala não existe
 */
function removeUserFromRoom(roomName, socketId) {
    if (!roomExists(roomName)) {
        return null;
    }

    rooms[roomName].users.delete(socketId);
    const remainingUsers = rooms[roomName].users.size;

    console.log(`${socketId} removido da ${roomName} | Restantes: ${remainingUsers}`);
    console.log(`Usuários restantes:`, Array.from(rooms[roomName].users));

    return remainingUsers;
}

/**
 * Alterna o estado de uma nota no grid
 * @param {string} roomName - Nome da sala
 * @param {number} row - Linha da nota
 * @param {number} col - Coluna da nota
 * @returns {{success: boolean, active?: number, error?: string}}
 */
function toggleNote(roomName, row, col) {
    if (!roomExists(roomName)) {
        return { success: false, error: 'Sala não existe' };
    }

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
        return { success: false, error: `Posição inválida: Row ${row}, Col ${col}` };
    }

    const room = rooms[roomName];
    room.gridState[row][col] = room.gridState[row][col] ? 0 : 1;

    // Salva snapshot no histórico
    room.history.push(JSON.parse(JSON.stringify(room.gridState)));

    return {
        success: true,
        active: room.gridState[row][col]
    };
}

/**
 * Obtém o estado atual de uma sala
 * @param {string} roomName - Nome da sala
 * @returns {{grid: number[][], history: number[][][]}|null}
 */
function getRoomState(roomName) {
    if (!roomExists(roomName)) {
        return null;
    }

    const room = rooms[roomName];
    return {
        grid: room.gridState,
        history: room.history
    };
}

/**
 * Lista todas as salas com informações resumidas
 * @returns {Array<{name: string, users: number}>}
 */
function listRooms() {
    return Object.keys(rooms).map(roomName => ({
        name: roomName,
        users: rooms[roomName].users.size
    }));
}

/**
 * Obtém o número de usuários em uma sala
 * @param {string} roomName - Nome da sala
 * @returns {number} Número de usuários ou 0 se sala não existe
 */
function getRoomUserCount(roomName) {
    return roomExists(roomName) ? rooms[roomName].users.size : 0;
}

/**
 * Inicializa salas padrão
 * @param {string[]} defaultRooms - Array com nomes das salas padrão
 */
function initializeDefaultRooms(defaultRooms) {
    console.log('Criando salas padrão...');
    defaultRooms.forEach(roomName => createRoom(roomName));
    console.log(`Salas iniciais criadas: ${defaultRooms.join(', ')}`);
}

module.exports = {
    createRoom,
    getOrCreateRoom,
    roomExists,
    addUserToRoom,
    removeUserFromRoom,
    toggleNote,
    getRoomState,
    listRooms,
    getRoomUserCount,
    initializeDefaultRooms
};
