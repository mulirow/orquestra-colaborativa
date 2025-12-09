const socket = io();

// --- Configuração ---
const rows = 10;
const cols = 16;
const scaleLabels = ["C5", "A4", "G4", "E4", "D4", "C4", "A3", "G3", "SNARE", "KICK"];
const scaleNotes = ["C5", "A4", "G4", "E4", "D4", "C4", "A3", "G3"];

// --- Estado ---
let currentGrid = Array(rows).fill().map(() => Array(cols).fill(0));
let historyLog = [];  // Now stores actions: [{row, col, active, timestamp}, ...]
let playbackGrid = [];

let mode = 'LIVE';
let isAudioStarted = false;
let isPaused = false;
let currentStep = 0;

let replayIndex = 0;
let linearTimeout = null;
let cyclicStopRequest = false;


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
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');
const instrumentSelect = document.getElementById('instrumentSelect');

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
let cellElements = []; // Cache to store DOM elements

function buildInterface() {
    containerDiv.innerHTML = '';
    cellElements = Array(rows).fill().map(() => Array(cols).fill(null));

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
                    const selectedInstrument = instrumentSelect.value;
                    
                    // Logic: Synth gets everything (including rows 8-9)
                    // Others get only melody (rows 0-7)
                    if (selectedInstrument !== 'Synth') {
                        if (r >= 8) return; // Restrict percussion rows for non-Synth
                    }

                    socket.emit('toggle-note', { row: r, col: c, instrument: selectedInstrument });
                }
            });
            cellsDiv.appendChild(cell);
            
            // Cache the element
            cellElements[r][c] = cell;
        }
        rowDiv.appendChild(cellsDiv);
        containerDiv.appendChild(rowDiv);
    }
}
buildInterface();

function renderGrid(gridData) {
    const currentInstrument = instrumentSelect ? instrumentSelect.value : 'Synth';

    // Update Row Visibility based on Instrument
    for (let r = 0; r < rows; r++) {
         const rowDiv = containerDiv.children[r];
         if (currentInstrument === 'Synth') {
             // Synth sees all
             rowDiv.classList.remove('disabled-row');
         } else {
             // Others only see melody
             if (r >= 8) rowDiv.classList.add('disabled-row');
             else rowDiv.classList.remove('disabled-row');
         }
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Use cached element
            const cell = cellElements[r][c];
            if (!cell) continue; // Safety check

            const cellData = gridData[r][c];
            
            // Normalize cell instruments to Set for easy lookup
            let cellInstruments = new Set();
            
            if (!cellData) {
                // empty
            } else if (Array.isArray(cellData)) {
                cellData.forEach(inst => cellInstruments.add(inst));
            } else if (typeof cellData === 'object' && cellData.instrument) {
                cellInstruments.add(cellData.instrument);
            } else if (cellData === 1) {
                cellInstruments.add('Synth');
            }

            // Check if active (truthy) and contains current instrument
            const isActive = cellInstruments.has(currentInstrument);
            const instClass = `inst-${currentInstrument.toLowerCase()}`;
            
            // Smart update: Only modify classes if needed
            if (isActive) {
                if (!cell.classList.contains('active')) {
                    cell.classList.add('active');
                }
                if (!cell.classList.contains(instClass)) {
                    cell.classList.add(instClass);
                }
            } else {
                if (cell.classList.contains('active')) {
                    cell.classList.remove('active');
                }
                // To be safe and clean: if not active in ANY way for THIS instrument, remove this instrument's class.
                if (cell.classList.contains(instClass)) {
                    cell.classList.remove(instClass);
                }
            }
        }
    }
}

// Add listener to update view when changing instrument
if (instrumentSelect) {
    instrumentSelect.addEventListener('change', () => {
        if (mode === 'LIVE') renderGrid(currentGrid);
        updateUIState();
        document.body.focus();
    });
}

// --- 2. Socket ---
socket.on('initial-state', (data) => {
    currentGrid = data.grid;
    historyLog = data.history;
    resetReplayCache();  // Reset cache when receiving initial state
    if (mode === 'LIVE') renderGrid(currentGrid);
    updateUIState();
});

socket.on('update-note', ({ row, col, active }) => {
    currentGrid[row][col] = active;
    // Don't push to history here - server is the source of truth
    // History will be synced via 'history-update' event
    if (mode === 'LIVE') {
        renderGrid(currentGrid);
    }
});

socket.on('history-update', (history) => {
    historyLog = history;
    resetReplayCache();  // Reset cache when history changes
    updateUIState();
});

function updateUIState() {
    replayCounter.innerText = `Histórico: ${historyLog.length} ações`;
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

// Cache for incremental reconstruction
let cachedReplayGrid = null;
let cachedReplayIndex = -1;

// Helper function to reconstruct grid state from actions up to a given index
function reconstructGridFromActions(actionIndex) {
    // If we're reconstructing the same or earlier state, use cache if available
    if (cachedReplayGrid && actionIndex <= cachedReplayIndex) {
        // Go backwards: start fresh and rebuild
        cachedReplayGrid = null;
        cachedReplayIndex = -1;
    }

    // Start from cache or empty grid
    let grid;
    let startIndex;

    if (cachedReplayGrid && actionIndex > cachedReplayIndex) {
        // Incremental: start from cached state
        grid = JSON.parse(JSON.stringify(cachedReplayGrid));
        startIndex = cachedReplayIndex + 1;
    } else {
        // From scratch: start with empty grid
        grid = Array(rows).fill().map(() => Array(cols).fill(0));
        startIndex = 0;
    }

    // Apply actions incrementally
    for (let i = startIndex; i <= actionIndex && i < historyLog.length; i++) {
        const action = historyLog[i];
        grid[action.row][action.col] = action.active;
    }

    // Update cache
    cachedReplayGrid = JSON.parse(JSON.stringify(grid));
    cachedReplayIndex = actionIndex;

    return grid;
}

// Reset cache when history changes or replay ends
function resetReplayCache() {
    cachedReplayGrid = null;
    cachedReplayIndex = -1;
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
const InstrumentManager = {
    synths: {},

    init() {
        // Create synths for all available types
        this.synths['Synth'] = new Tone.PolySynth(Tone.Synth, {
             oscillator: { type: "square" },
             envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 1 },
             volume: -12
        }).toDestination();



        // PIANO (Salamander)
        this.synths['Piano'] = new Tone.Sampler({
            urls: {
                "A0": "A0.mp3",
                "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3", "A1": "A1.mp3",
                "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3", "A2": "A2.mp3",
                "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", "A3": "A3.mp3",
                "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", "A4": "A4.mp3",
                "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3", "A5": "A5.mp3",
                "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3", "A6": "A6.mp3",
                "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3", "A7": "A7.mp3",
                "C8": "C8.mp3"
            },
            release: 1,
            baseUrl: "/samples/piano/"
        }).toDestination();
        
        // GUITAR (Acoustic)
        this.synths['Guitar'] = new Tone.Sampler({
            urls: {
                "A2": "A2.wav", "C3": "C3.wav", "D#3": "Ds3.wav", "F#3": "Fs3.wav", "A3": "A3.wav",
                "C4": "C4.wav", "D#4": "Ds4.wav", "F#4": "Fs4.wav", "A4": "A4.wav"
            },
            release: 1,
            baseUrl: "/samples/guitar-acoustic/"
        }).toDestination();
        // ELECTRIC GUITAR
        this.synths['ElectricGuitar'] = new Tone.Sampler({
            urls: {
                "A2": "A2.wav", "C3": "C3.wav", "D#3": "Ds3.wav", "F#3": "Fs3.wav", "A3": "A3.wav",
                "C4": "C4.wav", "D#4": "Ds4.wav", "F#4": "Fs4.wav", "A4": "A4.wav", "C5": "C5.wav", 
                "D#5": "Ds5.wav", "F#5": "Fs5.wav", "A5": "A5.wav", "C6": "C6.wav"
            },
            release: 1,
            baseUrl: "/samples/guitar-electric/"
        }).toDestination();
        
        // SAXOPHONE
        this.synths['Saxophone'] = new Tone.Sampler({
            urls: {
                "D#3": "Ds3.wav", "F#3": "Fs3.wav",
                "C4": "C4.wav", "D#4": "Ds4.wav", "F#4": "Fs4.wav", "A4": "A4.wav",
                "C5": "C5.wav", "D#5": "Ds5.wav", "F#5": "Fs5.wav", "A5": "A5.wav"
            },
            release: 1,
            baseUrl: "/samples/saxophone/"
        }).toDestination();


    },

    play(instrumentName, note, duration, time) {
        // Fallback for legacy data (check if instrumentName is undefined or "1")
        let name = instrumentName;
        if (!name || name === 1) name = 'Synth';

        const synth = this.synths[name];
        if (synth) {
            // Check if sample is loaded (only for samplers)
            if (synth.loaded === false) {
                 this.synths['Synth'].triggerAttackRelease(note, duration, time);
                 return;
            }
            synth.triggerAttackRelease(note, duration, time);
        } else {
            // Fallback if instrument not found
            this.synths['Synth'].triggerAttackRelease(note, duration, time);
        }
    }
};

// Initialize instruments immediately (AudioContext starts suspended)
InstrumentManager.init();

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
            playbackGrid = reconstructGridFromActions(replayIndex);
            renderGrid(playbackGrid);
            updateProgressBar(replayIndex);
        }
    }

    const gridToPlay = (mode === 'LIVE') ? currentGrid : playbackGrid;

    for (let r = 0; r < rows; r++) {
        const cellData = gridToPlay[r][currentStep];
        
        // Check if active
        if (cellData) {
            let instruments = [];
            
            // Normalize
            if (Array.isArray(cellData)) {
                instruments = cellData;
            } else if (typeof cellData === 'object' && cellData.instrument) {
                instruments = [cellData.instrument];
            } else if (cellData === 1) {
                instruments = ['Synth'];
            }

            if (r < 8) {
                // Play ALL instruments in the cell
                instruments.forEach(inst => {
                    InstrumentManager.play(inst, scaleNotes[r], "8n", time);
                });
            }
            else if (r === 8) snareSynth.triggerAttackRelease("8n", time);
            else if (r === 9) kickSynth.triggerAttackRelease("C1", "8n", time);
        }
    }

    currentStep = (currentStep + 1) % cols;
}

function highlightColumn(colIndex, isHighlight) {
    for (let r = 0; r < rows; r++) {
        // Use cached element
        const cell = cellElements[r][colIndex];
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
    resetReplayCache();  // Reset cache when replay ends
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
    resetReplayCache();  // Reset cache when starting replay
    replayIndex = 0;
    runLinearStep();
});

function runLinearStep() {
    if (mode !== 'LINEAR_REPLAY') return;
    if (replayIndex >= historyLog.length) { endReplay(); return; }

    playbackGrid = reconstructGridFromActions(replayIndex);
    renderGrid(playbackGrid);
    updateProgressBar(replayIndex);

    replayIndex++;

    // Delay fixo para suavizar a visualização do histórico (800ms por ação)
    const delay = 800;
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
    resetReplayCache();  // Reset cache when starting replay
    replayIndex = 0;
    cyclicStopRequest = false;
    playbackGrid = reconstructGridFromActions(0);
    renderGrid(playbackGrid);
    updateProgressBar(0);
});

// --- 6. Import/Export State ---

// Export current room state to JSON file
exportBtn.addEventListener('click', () => {
    const roomName = new URLSearchParams(window.location.search).get('room') || 'unknown-room';
    const stateData = {
        grid: currentGrid,
        history: historyLog,
        exportedAt: new Date().toISOString(),
        roomName: roomName
    };

    const dataStr = JSON.stringify(stateData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `orquestra-${roomName}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Visual feedback
    const originalText = exportBtn.innerText;
    exportBtn.innerText = "EXPORTADO ✓";
    exportBtn.disabled = true;
    setTimeout(() => {
        exportBtn.innerText = originalText;
        exportBtn.disabled = false;
    }, 2000);
});

// Trigger file input when import button is clicked
importBtn.addEventListener('click', () => {
    importFileInput.click();
});

// Handle file import
importFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const stateData = JSON.parse(e.target.result);

            // Validate the imported data
            if (!stateData.grid || !Array.isArray(stateData.grid)) {
                alert('Arquivo inválido: faltando grid');
                return;
            }
            if (!stateData.history || !Array.isArray(stateData.history)) {
                alert('Arquivo inválido: faltando histórico');
                return;
            }

            // Validate grid dimensions
            if (stateData.grid.length !== rows) {
                alert(`Arquivo inválido: grid deve ter ${rows} linhas`);
                return;
            }
            for (let row of stateData.grid) {
                if (row.length !== cols) {
                    alert(`Arquivo inválido: grid deve ter ${cols} colunas`);
                    return;
                }
            }

            // Send to server to update room state
            socket.emit('import-state', stateData);

            // Visual feedback
            const originalText = importBtn.innerText;
            importBtn.innerText = "IMPORTADO ✓";
            importBtn.disabled = true;
            setTimeout(() => {
                importBtn.innerText = originalText;
                importBtn.disabled = false;
            }, 2000);

        } catch (error) {
            alert('Erro ao ler arquivo: ' + error.message);
        }
    };
    reader.readAsText(file);

    // Reset file input so the same file can be imported again
    event.target.value = '';
});