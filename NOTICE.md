# Pink é um fork do Pi

Pink (`@thoth/pink`) é um fork do **Pi** (`@earendil-works/pi-coding-agent`, MIT, copyright (c) 2025 Mario Zechner). O texto da licença do Pi está em
`LICENSE-PI.txt` e acompanha este pacote, como a licença exige.

O que o Pink muda em relação ao Pi 1.4.0 (a lista completa e verificada está em `rebrand.json`, no repositório do Thoth):

- o nome: tudo que é Pi vira Pink (comando, título, diretório de configuração `~/.pink/agent` e `.pink/` no projeto, variáveis `PINK_*`, mensagens e prompt de sistema);
- o tema `pink` como tema padrão: texto do agente quase branco, mensagem do usuário em rosa, pensamento em cinza, rosa
  como cor da marca e dos destaques (2026-10-13; antes era tudo rosa);
- por privacidade, o Pink **não** envia a telemetria de instalação nem consulta versões no servidor do Pi: os endereços `pi.dev/api/*` foram trocados por `pink.invalid`
  e a telemetria de instalação vem desligada por padrão;
- a interface no estilo do OpenCode, na extensão `extensions/pink-ui.ts` (código do Pink, MIT), que o pacote carrega por padrão. Ela traz tela inicial, caixa de digitar,
  moldura de tela cheia (topo, colunas de sessões e de contexto, rodapé), fechamento, paleta de comandos, agentes Build e Plano, `/undo` e `/redo` com arquivos, lista de tarefas (`todowrite`), `/sessions`, `/themes`, `/init` e `/details`;
- alguns padrões: tela cheia, pensamento recolhido, início silencioso e barra de rolagem escondida. A troca de modelo passou de `ctrl+p` para `f2`/`shift+f2`, e o `ctrl+p` agora
  abre a paleta (2026-10-28).

O que o Pink **não** muda: o laço do agente, os provedores, o motor da TUI, as sessões e a compactação são os do Pi. Identificadores de protocolo enviados a terceiros
(`originator`, `referrer`, `x-opencode-client`) e os nomes de atributos de telemetria interna (`pi.*`) continuam como no Pi.
