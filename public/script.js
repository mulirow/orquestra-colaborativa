const socket = io();

// --- Configuração ---
const rows = 10;
const cols = 16;
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

const landingScreen = document.getElementById('landing-screen');
const appScreen = document.getElementById('app-screen');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const roomNameDisplay = document.getElementById('roomNameDisplay');

const containerDiv = document.getElementById('sequencer-container');
const audioBtn = document.getElementById('audioToggleBtn');
const linearBtn = document.getElementById('linearReplayBtn');
const cyclicBtn = document.getElementById('cyclicReplayBtn');
const speedRange = document.getElementById('speedRange');
const replayProgress = document.getElementById('replayProgress');
const statusText = document.getElementById('statusText');
const replayCounter = document.getElementById('replayCounter');

// --- 0. Lógica de Lobby / Sala ---

// Tenta pegar sala da URL (ex: ?room=minhasala)
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    joinRoom(roomFromUrl);
}

joinBtn.addEventListener('click', () => {
    const roomName = roomInput.value.trim();
    if (roomName) joinRoom(roomName);
});

roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const roomName = roomInput.value.trim();
        if (roomName) joinRoom(roomName);
    }
});

function joinRoom(roomName) {
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + roomName;
    window.history.pushState({ path: newUrl }, '', newUrl);

    landingScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    appScreen.style.flexDirection = 'column';
    appScreen.style.alignItems = 'center';

    roomNameDisplay.innerText = `Sala: ${roomName}`;

    socket.emit('join-room', roomName);
}


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

function updateUIState() {
    replayCounter.innerText = `Histórico: ${historyLog.length} versões`;
    const canReplay = isAudioStarted && mode === 'LIVE' && historyLog.length > 1;
    if (mode === 'LIVE') {
        linearBtn.disabled = !canReplay;
        cyclicBtn.disabled = !canReplay;
        linearBtn.innerText = "Histórico Visual ⏩";
        cyclicBtn.innerText = "Timelapse 🎵";
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
        audioBtn.innerText = "PAUSAR ⏸";
        statusText.innerText = "LIVE 🔴";
        updateUIState();
    } else {
        if (isPaused) {
            resetCursor();
            Tone.Transport.start();
            audioBtn.innerText = "PAUSAR ⏸";
            statusText.innerText = (mode === 'LIVE') ? "LIVE 🔴" : "REPLAY ⏪";
            statusText.style.color = (mode === 'LIVE') ? "#00ff9d" : "#ff9900";
            isPaused = false;
        } else {
            Tone.Transport.pause();
            audioBtn.innerText = "CONTINUAR ▶";
            statusText.innerText = "PAUSADO ⏸";
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
            replayIndex += 4;
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
    statusText.innerText = "LIVE 🔴";
    statusText.style.color = "#00ff9d";
    renderGrid(currentGrid);
    updateUIState();
}

linearBtn.addEventListener('click', () => {
    if (mode === 'LINEAR_REPLAY') { endReplay(); return; }

    mode = 'LINEAR_REPLAY';
    statusText.innerText = "HISTÓRICO VISUAL ⏩";
    statusText.style.color = "#00d2ff";
    linearBtn.innerText = "PARAR ⏹";
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
    statusText.innerText = "TIMELAPSE 🎵";
    statusText.style.color = "#ff9900";
    cyclicBtn.innerText = "PARAR / PULAR PARA LIVE ⏹";
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
    statusText.innerText = `COOLDOWN (${remaining}s) ⏳`;
    statusText.style.color = "#ff4444";

    if (cooldownInterval) clearInterval(cooldownInterval);

    cooldownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(cooldownInterval);
            containerDiv.classList.remove('cooldown-active');
            statusText.innerText = "LIVE 🔴";
            statusText.style.color = "#00ff9d";
        } else {
            statusText.innerText = `COOLDOWN (${remaining}s) ⏳`;
        }
    }, 1000);
}