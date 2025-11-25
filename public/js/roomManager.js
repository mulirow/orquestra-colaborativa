/**
 * @fileoverview Gerenciador de salas do cliente
 * @module client/roomManager
 */

import { getElements } from './domManager.js';

/**
 * @typedef {Object} RoomInfo
 * @property {string} name - Nome da sala
 * @property {number} users - Número de usuários
 */

/** @type {string|null} */
let currentRoom = null;

/**
 * Obtém a sala atual
 * @returns {string|null}
 */
export function getCurrentRoom() {
    return currentRoom;
}

/**
 * Define a sala atual
 * @param {string} roomName - Nome da sala
 */
export function setCurrentRoom(roomName) {
    currentRoom = roomName;
}

/**
 * Renderiza lista de salas no modal
 * @param {RoomInfo[]} rooms - Array de informações das salas
 */
export function renderRoomList(rooms) {
    const elements = getElements();

    console.log('[ROOM] Renderizando lista de salas:', rooms.length);

    elements.roomList.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        elements.roomList.innerHTML = '<p class="no-rooms-message">Nenhuma sala disponível. Crie uma nova!</p>';
        return;
    }

    rooms.forEach((room, index) => {
        console.log(`[ROOM] ${index + 1}. ${room.name} - ${room.users} usuário(s)`);

        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        roomItem.innerHTML = `
            <span class="room-item-name">${room.name}</span>
            <span class="room-item-users">${room.users} online</span>
        `;

        roomItem.addEventListener('click', () => joinRoom(room.name));
        elements.roomList.appendChild(roomItem);
    });
}

/**
 * Entra em uma sala
 * @param {string} roomName - Nome da sala
 * @param {object} socket - Instância do socket.io
 */
export function joinRoom(roomName, socket = window.socket) {
    console.log('[ROOM] Entrando na sala:', roomName);

    const elements = getElements();

    setCurrentRoom(roomName);
    socket.emit('join-room', roomName);

    // Atualiza UI
    elements.roomModal.classList.add('hidden');
    elements.currentRoomName.innerText = `Sala: ${roomName}`;
    elements.currentRoomName.classList.add('active');
    elements.qrCodeBtn.classList.remove('hidden');

    console.log('[ROOM] Entrou na sala:', roomName);
}

/**
 * Solicita lista de salas ao servidor
 * @param {object} socket - Instância do socket.io
 */
export function requestRoomList(socket) {
    console.log('[ROOM] Solicitando lista de salas...');
    socket.emit('request-room-list');
}

/**
 * Atualiza contador de usuários na sala
 * @param {number} count - Número de usuários
 */
export function updateUserCount(count) {
    const elements = getElements();

    console.log('[ROOM] Atualizando contador:', count, 'na sala:', currentRoom);

    elements.userCount.innerText = `${count} online`;

    if (count > 1) {
        elements.userCount.classList.add('active');
    } else {
        elements.userCount.classList.remove('active');
    }
}

/**
 * Extrai nome da sala da URL
 * @returns {string|null} Nome da sala ou null
 */
export function getRoomFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('room');
}
