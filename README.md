# Orquestra Colaborativa

Uma experiência musical web inspirada no **r/Place**. Vários usuários interagem simultaneamente em um **sequenciador de passos (step sequencer)** de 64 batidas (4 compassos), compondo melodias e ritmos colaborativamente em tempo real.

O projeto permite não apenas a composição, mas a visualização da **história da música** através de modos de timelapse visual e auditivo, além de ferramentas para salvar e restaurar o progresso.

## Funcionalidades

*   **Colaboração em Tempo Real:** As notas clicadas por um usuário aparecem instantaneamente para todos os outros (via WebSockets).
*   **Grid (64 Steps):** O sequenciador possui 4 compassos completos.
    *   **Navegação por Abas:** Interface paginada para facilitar a edição em dispositivos móveis.
    *   **Foco de Reprodução:** Usuários podem mutar/desmutar compassos específicos individualmente para focar na composição de trechos específicos da música.
*   **Instrumentos Variados:**
    *   **Melódicos:** Sintetizador (Padrão), Piano, Violão, Guitarra Elétrica e Saxofone.
    *   **Percussão:** Canais dedicados para Kick (Bumbo) e Snare (Caixa).
*   **Salvar e Carregar:**
    *   **Exportar:** Baixe o estado atual da sala (notas e histórico) como um arquivo `.json`.
    *   **Importar:** Restaure uma composição antiga arrastando o arquivo de volta para a aplicação.
*   **Time Machine (Histórico):**
    *   **Histórico Visual:** Um replay acelerado de todas as alterações feitas desde o início da sessão (com controle de velocidade).
    *   **Timelapse:** Toca a música ciclicamente, avançando estados do histórico a cada loop, permitindo ouvir a evolução da composição.
*   **Motor de Áudio:** Sincronizado localmente no navegador do cliente para evitar latência de rede no som.

## Tecnologias Utilizadas

*   **Backend:** Node.js, Express, Socket.io.
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript.
*   **Áudio:** [Tone.js](https://tonejs.github.io/) (Web Audio API & Samplers).

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
O histórico e o estado da sala são mantidos na **Memória RAM** do servidor. Se o servidor reiniciar, a sala voltará ao estado vazio. Recomenda-se usar o botão **"Exportar Estado"** para salvar suas criações localmente em seu computador.