const socket = io();

// --- Configuração ---
const rows = 10;
const cols = 32; // Aumentado de 16 para 32 colunas
const scaleLabels = ["C5", "A4", "G4", "E4", "D4", "C4", "A3", "G3", "SNARE", "KICK"];
const scaleNotes = ["C5", "A4", "G4", "E4", "D4", "C4", "A3", "G3"];

// --- Estado ---
let currentGrid = Array(rows).fill().map(() => Array(cols).fill(0));
let historyLog = [];
let playbackGrid = [];

let mode = 'LIVE';
let isAudioStarted = false;
let isPaused = false;
let currentStep = 0;

let replayIndex = 0;
let linearTimeout = null;
let cyclicStopRequest = false;

let lastClickTime = parseInt(localStorage.getItem('lastClickTime')) || 0;
const COOLDOWN_MS = 15000;
let cooldownInterval = null;

const containerDiv = document.getElementById('sequencer-container');
const audioBtn = document.getElementById('audioToggleBtn');
const linearBtn = document.getElementById('linearReplayBtn');
const cyclicBtn = document.getElementById('cyclicReplayBtn');
const speedRange = document.getElementById('speedRange');
const replayProgress = document.getElementById('replayProgress');
const statusText = document.getElementById('statusText');
const replayCounter = document.getElementById('replayCounter');
const userCountEl = document.getElementById('userCount');
const roomModal = document.getElementById('roomModal');
const roomListEl = document.getElementById('roomList');
const newRoomInput = document.getElementById('newRoomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const currentRoomNameEl = document.getElementById('currentRoomName');
const qrCodeBtn = document.getElementById('qrCodeBtn');
const qrModal = document.getElementById('qrModal');
const qrCodeContainer = document.getElementById('qrCodeContainer');
const roomUrlInput = document.getElementById('roomUrlInput');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const closeQrBtn = document.getElementById('closeQrBtn');
const roomExistsModal = document.getElementById('roomExistsModal');
const existingRoomNameEl = document.getElementById('existingRoomName');
const existingRoomUsersEl = document.getElementById('existingRoomUsers');
const joinExistingRoomBtn = document.getElementById('joinExistingRoomBtn');
const cancelRoomExistsBtn = document.getElementById('cancelRoomExistsBtn');
const viewRoomsBtn = document.getElementById('viewRoomsBtn');
const closeRoomModalSection = document.getElementById('closeRoomModalSection');
const closeRoomModalBtn = document.getElementById('closeRoomModalBtn');

let currentRoom = null;
let qrCodeInstance = null;
let pendingRoomName = null;

// --- Gestão de Salas ---
socket.on('room-list', (rooms) => {
    console.log('[CLIENTE] Lista de salas recebida do servidor:', rooms);
    console.log('[CLIENTE] Total de salas recebidas:', rooms ? rooms.length : 0);
    
    const isModalVisible = !roomModal.classList.contains('hidden');
    console.log('[CLIENTE] Modal visível?', isModalVisible);

    // Sempre atualiza a lista, mas só mostra se o modal estiver visível
    roomListEl.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        console.log('[CLIENTE] Nenhuma sala disponível');
        roomListEl.innerHTML = '<p class="no-rooms-message">Nenhuma sala disponível. Crie uma nova!</p>';
        return;
    }

    console.log('[CLIENTE] Renderizando salas na lista:');
    rooms.forEach((room, index) => {
        console.log(`   ${index + 1}. ${room.name} - ${room.users} usuário(s) online`);
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        roomItem.innerHTML = `
            <span class="room-item-name">${room.name}</span>
            <span class="room-item-users">${room.users} online</span>
        `;
        roomItem.addEventListener('click', () => joinRoom(room.name));
        roomListEl.appendChild(roomItem);
    });

    console.log('[CLIENTE] Lista de salas atualizada no DOM, total:', rooms.length);
});

// Solicita lista de salas quando o modal é mostrado
function showRoomModal() {
    console.log('[CLIENTE] Mostrando modal de salas');
    roomModal.classList.remove('hidden');
    
    // Se já está em uma sala, mostra botão para fechar e continuar
    if (currentRoom) {
        closeRoomModalSection.classList.remove('hidden');
    } else {
        closeRoomModalSection.classList.add('hidden');
    }
    
    console.log('[CLIENTE] Solicitando lista de salas ao servidor...');
    socket.emit('request-room-list');
}

// Botão para ver salas
viewRoomsBtn.addEventListener('click', () => {
    showRoomModal();
});

// Botão para fechar modal e continuar na sala atual
closeRoomModalBtn.addEventListener('click', () => {
    roomModal.classList.add('hidden');
    closeRoomModalSection.classList.add('hidden');
});

// Auto-join via URL parameter
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');

// Solicita lista ao conectar
socket.on('connect', () => {
    console.log('[CLIENTE] Conectado ao servidor');
    
    // Se tem room na URL, entra automaticamente (sem mostrar modal)
    if (roomParam) {
        setTimeout(() => {
            console.log('Entrando automaticamente na sala:', roomParam);
            joinRoom(roomParam);
        }, 300);
    } else if (!currentRoom) {
        // Se não tem room na URL e não está em uma sala, mostra modal
        console.log('[CLIENTE] Não está em uma sala, mostrando modal de salas...');
        showRoomModal();
    } else {
        console.log('[CLIENTE] Já está na sala:', currentRoom);
    }
});

createRoomBtn.addEventListener('click', () => {
    const roomName = newRoomInput.value.trim();
    
    // Validação: nome vazio
    if (!roomName) {
        showErrorMessage('Por favor, digite um nome para a sala.');
        return;
    }
    
    // Verifica se a sala já existe
    socket.emit('check-room-exists', roomName, (response) => {
        if (response.exists) {
            // Sala já existe - mostra popup
            pendingRoomName = roomName;
            existingRoomNameEl.innerText = roomName;
            existingRoomUsersEl.innerText = response.userCount;
            roomExistsModal.classList.remove('hidden');
        } else {
            // Sala não existe - cria e entra
            joinRoom(roomName);
            newRoomInput.value = '';
        }
    });
});

newRoomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        createRoomBtn.click();
    }
});

// Handlers do modal de sala existente
joinExistingRoomBtn.addEventListener('click', () => {
    if (pendingRoomName) {
        joinRoom(pendingRoomName);
        newRoomInput.value = '';
        roomExistsModal.classList.add('hidden');
        pendingRoomName = null;
    }
});

cancelRoomExistsBtn.addEventListener('click', () => {
    roomExistsModal.classList.add('hidden');
    pendingRoomName = null;
});

// Função para mostrar mensagem de erro
function showErrorMessage(message) {
    // Cria ou atualiza mensagem de erro
    let errorMsg = document.getElementById('roomErrorMsg');
    if (!errorMsg) {
        errorMsg = document.createElement('p');
        errorMsg.id = 'roomErrorMsg';
        errorMsg.className = 'error-message';
        const createSection = document.querySelector('.create-room-section');
        createSection.insertBefore(errorMsg, createSection.firstChild);
    }
    errorMsg.innerText = message;
    errorMsg.style.display = 'block';
    
    // Remove mensagem após 3 segundos
    setTimeout(() => {
        if (errorMsg) {
            errorMsg.style.display = 'none';
        }
    }, 3000);
}

// Remove mensagem de erro quando usuário começa a digitar
newRoomInput.addEventListener('input', () => {
    const errorMsg = document.getElementById('roomErrorMsg');
    if (errorMsg) {
        errorMsg.style.display = 'none';
    }
});

function joinRoom(roomName) {
    console.log('[CLIENTE] Entrando na sala:', roomName);
    currentRoom = roomName;
    socket.emit('join-room', roomName);
    roomModal.classList.add('hidden');
    closeRoomModalSection.classList.add('hidden');
    currentRoomNameEl.innerText = `Sala: ${roomName}`;
    currentRoomNameEl.classList.add('active');

    // Mostra botão de QR Code
    qrCodeBtn.classList.remove('hidden');
    console.log('[CLIENTE] Entrou na sala:', roomName);
}

// --- QR Code ---
qrCodeBtn.addEventListener('click', () => {
    if (!currentRoom) return;

    // Gera URL da sala com query parameter
    const roomUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
    roomUrlInput.value = roomUrl;

    // Limpa QR Code anterior
    qrCodeContainer.innerHTML = '';

    // Gera novo QR Code
    qrCodeInstance = new QRCode(qrCodeContainer, {
        text: roomUrl,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    qrModal.classList.remove('hidden');
});

copyUrlBtn.addEventListener('click', () => {
    roomUrlInput.select();
    navigator.clipboard.writeText(roomUrlInput.value).then(() => {
        copyUrlBtn.innerText = 'Copiado!';
        setTimeout(() => {
            copyUrlBtn.innerText = 'Copiar Link';
        }, 2000);
    });
});

closeQrBtn.addEventListener('click', () => {
    qrModal.classList.add('hidden');
});


// --- 1. Interface ---
function buildInterface() {
    containerDiv.innerHTML = '';
    for (let r = 0; r < rows; r++) {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('seq-row');
        if (r === 8) rowDiv.classList.add('snare');
        if (r === 9) rowDiv.classList.add('kick');

        const labelDiv = document.createElement('div');
        labelDiv.classList.add('row-label');
        labelDiv.innerText = scaleLabels[r];
        rowDiv.appendChild(labelDiv);

        const cellsDiv = document.createElement('div');
        cellsDiv.classList.add('row-cells');
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.id = `cell-${r}-${c}`;
            cell.addEventListener('click', () => {
                if (mode === 'LIVE') {
                    const now = Date.now();
                    if (now - lastClickTime < COOLDOWN_MS) return;
                    lastClickTime = now;
                    localStorage.setItem('lastClickTime', lastClickTime);
                    startCooldownVisuals();
                    socket.emit('toggle-note', { row: r, col: c });
                }
            });
            cellsDiv.appendChild(cell);
        }
        rowDiv.appendChild(cellsDiv);
        containerDiv.appendChild(rowDiv);
    }
}
buildInterface();

// persistent cooldown on page reload
if (Date.now() - lastClickTime < COOLDOWN_MS && mode === 'LIVE') {
    startCooldownVisuals();
}

function renderGrid(gridData) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.getElementById(`cell-${r}-${c}`);
            const isActive = gridData[r][c] === 1;
            if (isActive) cell.classList.add('active');
            else cell.classList.remove('active');
        }
    }
}

// --- 2. Socket ---
socket.on('initial-state', (data) => {
    currentGrid = data.grid;
    historyLog = data.history;
    if (mode === 'LIVE') renderGrid(currentGrid);
    updateUIState();
});

socket.on('update-note', ({ row, col, active }) => {
    currentGrid[row][col] = active;
    historyLog.push(JSON.parse(JSON.stringify(currentGrid)));
    if (mode === 'LIVE') {
        renderGrid(currentGrid);
        updateUIState();
    }
});

socket.on('user-count', (count) => {
    console.log('[CLIENTE] Contagem de usuários atualizada:', count, 'na sala:', currentRoom);
    userCountEl.innerText = `${count} online`;
    if (count > 1) {
        userCountEl.classList.add('active');
    } else {
        userCountEl.classList.remove('active');
    }
});

function updateUIState() {
    replayCounter.innerText = `Histórico: ${historyLog.length} versões`;
    const canReplay = isAudioStarted && mode === 'LIVE' && historyLog.length > 1;
    if (mode === 'LIVE') {
        linearBtn.disabled = !canReplay;
        cyclicBtn.disabled = !canReplay;
        linearBtn.innerText = "Histórico Visual";
        cyclicBtn.innerText = "Timelapse";
        linearBtn.classList.remove('btn-stop-replay');
        cyclicBtn.classList.remove('btn-stop-replay');
        replayProgress.style.width = '100%';
    }
}

// --- 3. Controle de Áudio ---

function resetCursor() {
    document.querySelectorAll('.playing-col').forEach(el => el.classList.remove('playing-col'));
    currentStep = 0;
}

audioBtn.addEventListener('click', async () => {
    if (!isAudioStarted) {
        await Tone.start();
        Tone.Transport.bpm.value = 120;
        Tone.Transport.scheduleRepeat(onStep, "8n");

        resetCursor();
        Tone.Transport.start();

        isAudioStarted = true;
        isPaused = false;
        audioBtn.innerText = "PAUSAR";
        statusText.innerText = "LIVE";
        updateUIState();
    } else {
        if (isPaused) {
            resetCursor();
            Tone.Transport.start();
            audioBtn.innerText = "PAUSAR";
            statusText.innerText = (mode === 'LIVE') ? "LIVE" : "REPLAY";
            statusText.style.color = (mode === 'LIVE') ? "#00ff9d" : "#ff9900";
            isPaused = false;
        } else {
            Tone.Transport.pause();
            audioBtn.innerText = "CONTINUAR";
            statusText.innerText = "PAUSADO";
            statusText.style.color = "#aaa";
            isPaused = true;
        }
    }
});

// --- 4. Motor de Áudio ---
const melodySynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "square" },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 1 },
    volume: -12
}).toDestination();
const kickSynth = new Tone.MembraneSynth({ volume: -6 }).toDestination();
const snareSynth = new Tone.NoiseSynth({ volume: -12 }).toDestination();

function onStep(time) {
    let prevStep = (currentStep - 1 + cols) % cols;
    highlightColumn(prevStep, false);
    highlightColumn(currentStep, true);

    if (mode === 'CYCLIC_REPLAY' && currentStep === 0) {
        if (cyclicStopRequest) {
            endReplay();
        } else {
            replayIndex += 8; // Aumentado de 4 para 8 - timelapse 2x mais rápido
            if (replayIndex >= historyLog.length - 1) {
                replayIndex = historyLog.length - 1;
                cyclicStopRequest = true;
            }
            playbackGrid = historyLog[replayIndex];
            renderGrid(playbackGrid);
            updateProgressBar(replayIndex);
        }
    }

    const gridToPlay = (mode === 'LIVE') ? currentGrid : playbackGrid;

    for (let r = 0; r < rows; r++) {
        if (gridToPlay[r][currentStep] === 1) {
            if (r < 8) melodySynth.triggerAttackRelease(scaleNotes[r], "8n", time);
            else if (r === 8) snareSynth.triggerAttackRelease("8n", time);
            else if (r === 9) kickSynth.triggerAttackRelease("C1", "8n", time);
        }
    }

    currentStep = (currentStep + 1) % cols;
}

function highlightColumn(colIndex, isHighlight) {
    for (let r = 0; r < rows; r++) {
        const cell = document.getElementById(`cell-${r}-${colIndex}`);
        if (cell) {
            if (isHighlight) cell.classList.add('playing-col');
            else cell.classList.remove('playing-col');
        }
    }
}

// --- 5. Lógica de Replay ---
function updateProgressBar(index) {
    const pct = ((index + 1) / historyLog.length) * 100;
    replayProgress.style.width = `${pct}%`;
}

function endReplay() {
    clearTimeout(linearTimeout);
    mode = 'LIVE';
            statusText.innerText = "LIVE";
    statusText.style.color = "#00ff9d";
    renderGrid(currentGrid);
    updateUIState();
}

linearBtn.addEventListener('click', () => {
    if (mode === 'LINEAR_REPLAY') { endReplay(); return; }

    mode = 'LINEAR_REPLAY';
    statusText.innerText = "HISTÓRICO VISUAL";
    statusText.style.color = "#00d2ff";
    linearBtn.innerText = "PARAR";
    linearBtn.classList.add('btn-stop-replay');
    cyclicBtn.disabled = true;

    resetCursor();
    replayIndex = 0;
    runLinearStep();
});

function runLinearStep() {
    if (mode !== 'LINEAR_REPLAY') return;
    if (replayIndex >= historyLog.length) { endReplay(); return; }

    playbackGrid = historyLog[replayIndex];
    renderGrid(playbackGrid);
    updateProgressBar(replayIndex);

    replayIndex++;

    const speedVal = parseInt(speedRange.value);
    const delay = 550 - (speedVal * 25);
    linearTimeout = setTimeout(runLinearStep, delay);
}

cyclicBtn.addEventListener('click', () => {
    if (mode === 'CYCLIC_REPLAY') {
        cyclicStopRequest = true;
        cyclicBtn.innerText = "PARANDO NO FIM DO LOOP...";
        return;
    }

    mode = 'CYCLIC_REPLAY';
    statusText.innerText = "TIMELAPSE";
    statusText.style.color = "#ff9900";
    cyclicBtn.innerText = "PARAR / PULAR PARA LIVE";
    cyclicBtn.classList.add('btn-stop-replay');
    linearBtn.disabled = true;

    resetCursor();
    replayIndex = 0;
    cyclicStopRequest = false;
    playbackGrid = historyLog[0];
    renderGrid(playbackGrid);
    updateProgressBar(0);
});

function startCooldownVisuals() {
    containerDiv.classList.add('cooldown-active');
    const elapsed = Date.now() - lastClickTime;
    let remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    statusText.innerText = `Aguarde (${remaining}s)`;
    statusText.style.color = "#ff4444";

    if (cooldownInterval) clearInterval(cooldownInterval);

    cooldownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(cooldownInterval);
            containerDiv.classList.remove('cooldown-active');
            statusText.innerText = "LIVE";
            statusText.style.color = "#00ff9d";
        } else {
            statusText.innerText = `Aguarde (${remaining}s)`;
        }
    }, 1000);
}