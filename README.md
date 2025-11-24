# Orquestra Colaborativa

Uma experiência musical web inspirada no **r/Place**. Vários usuários interagem simultaneamente em um **sequenciador de passos (step sequencer)** de 16 batidas, compondo uma música estilo *chiptune* em tempo real.

O projeto permite não apenas a composição, mas a visualização da **história da música** através de modos de timelapse visual e auditivo.

## Funcionalidades

*   **Colaboração em Tempo Real:** As notas clicadas por um usuário aparecem instantaneamente para todos os outros (via WebSockets).
*   **Instrumentos:**
    *   **Sintetizador Polifônico:** 8 notas de escala pentatônica.
    *   **Bateria:** Canais dedicados para Kick (Bumbo) e Snare (Caixa).
*   **Time Machine (Histórico):**
    *   **Histórico Visual:** Um replay acelerado de todas as alterações feitas desde o início da sessão (com controle de velocidade).
    *   **Timelapse:** Toca a música ciclicamente, avançando 4 estados do histórico a cada loop, permitindo ouvir a evolução da composição.
*   **Motor de Áudio:** Sincronizado localmente no navegador do cliente para evitar latência de rede no som.

## Tecnologias Utilizadas

*   **Backend:** Node.js, Express, Socket.io.
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript.
*   **Áudio:** [Tone.js](https://tonejs.github.io/) (Web Audio API).

## Como rodar localmente

1.  Clone o repositório:
    ```bash
    git clone https://github.com/SEU_USUARIO/NOME_DO_REPO.git
    cd orquestra-colaborativa
    ```

2.  Instale as dependências:
    ```bash
    npm install
    ```

3.  Inicie o servidor:
    ```bash
    npm start
    # Ou: node server.js
    ```

4.  Acesse no navegador:
    `http://localhost:3000`

### Nota sobre Persistência de Dados
Atualmente, o histórico da música é armazenado na **Memória RAM** do servidor. Isso significa que se o servidor reiniciar (ou "dormir" em planos gratuitos), o histórico e o grid voltarão ao estado inicial (vazio).