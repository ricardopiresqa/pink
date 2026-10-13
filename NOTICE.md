# Pink é um fork do Pi

Pink (`@thoth/pink`) é um fork do **Pi** (`@earendil-works/pi-coding-agent`, MIT, copyright (c) 2025 Mario Zechner). O texto da licença do Pi está em
`LICENSE-PI.txt` e acompanha este pacote, como a licença exige.

O que o Pink muda em relação ao Pi 0.84.3 (a lista completa e verificada está em `rebrand.json`, no repositório do Thoth):

- o nome: tudo que é Pi vira Pink (comando, título, diretório de configuração `~/.pink/agent` e `.pink/` no projeto, variáveis `PINK_*`, mensagens e prompt de sistema);
- o tema `pink` como tema padrão: texto do agente quase branco, mensagem do usuário em rosa, pensamento em cinza, rosa
  como cor da marca e dos destaques (2026-10-13; antes era tudo rosa);
- por privacidade, o Pink **não** envia a telemetria de instalação nem consulta versões no servidor do Pi: os endereços `pi.dev/api/*` foram trocados por `pink.invalid`
  e a telemetria de instalação vem desligada por padrão.

O que o Pink **não** muda: o laço do agente, os provedores, a TUI, as sessões e a compactação são os do Pi. Identificadores de protocolo enviados a terceiros
(`originator`, `referrer`, `x-opencode-client`) e os nomes de atributos de telemetria interna (`pi.*`) continuam como no Pi.
