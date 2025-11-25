/**
 * @fileoverview Configurações do cliente
 * @module client/config
 */

/**
 * Configurações do grid musical
 */
export const GRID_CONFIG = {
    /** @type {number} Número de linhas */
    ROWS: 10,
    /** @type {number} Número de colunas */
    COLS: 32,
    /** @type {string[]} Labels das linhas */
    SCALE_LABELS: ["C5", "A4", "G4", "E4", "D4", "C4", "A3", "G3", "SNARE", "KICK"],
    /** @type {string[]} Notas melódicas */
    SCALE_NOTES: ["C5", "A4", "G4", "E4", "D4", "C4", "A3", "G3"]
};

/**
 * Configurações de áudio
 */
export const AUDIO_CONFIG = {
    /** @type {number} BPM padrão */
    BPM: 120,
    /** @type {string} Resolução temporal das notas */
    NOTE_DURATION: "8n"
};

/**
 * Configurações de cooldown
 */
export const COOLDOWN_CONFIG = {
    /** @type {number} Tempo de cooldown em milissegundos */
    DURATION_MS: 15000,
    /** @type {string} Chave do localStorage */
    STORAGE_KEY: 'lastClickTime'
};

/**
 * Modos de reprodução
 */
export const PLAYBACK_MODES = {
    LIVE: 'LIVE',
    LINEAR_REPLAY: 'LINEAR_REPLAY',
    CYCLIC_REPLAY: 'CYCLIC_REPLAY'
};
