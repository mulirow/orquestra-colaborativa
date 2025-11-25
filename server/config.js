/**
 * @fileoverview Configurações globais do servidor
 * @module server/config
 */

/**
 * Configurações do grid musical
 */
module.exports = {
    /**
     * Número de linhas do grid (10: 8 melódicas + 2 bateria)
     * @constant {number}
     */
    ROWS: 10,

    /**
     * Número de colunas do grid (passos no sequenciador)
     * @constant {number}
     */
    COLS: 32,

    /**
     * Porta do servidor
     * @constant {number}
     */
    PORT: process.env.PORT || 3000,

    /**
     * Salas padrão criadas ao iniciar o servidor
     * @constant {string[]}
     */
    DEFAULT_ROOMS: ['Sala 1', 'Sala 2']
};
