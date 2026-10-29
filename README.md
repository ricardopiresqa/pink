# Pink

Agente de código do Thoth. É um **fork do [Pi](https://github.com/earendil-works/pi-mono)** (MIT): tudo que era Pi virou Pink, com tema e interface próprios. O resto, o laço do agente, os provedores, a TUI, as sessões e a compactação, é o do Pi 1.4.0.

```text
npm install -g @thoth/pink      # depois da publicação (F47); hoje: npm install -g <arquivo .tgz gerado por build_pink.py>
pink                            # sessão interativa
pink -p "explique este repositório"
pink --help
```

- Configuração: `~/.pink/agent/` (ou `$PINK_CODING_AGENT_DIR`) e `.pink/` no projeto. Variáveis: `PINK_*`.
- Provedores e modelos: `~/.pink/agent/models.json` (formato do Pi; veja `docs/models.md`, lendo `pi` como `pink`).
- Interface no estilo do OpenCode (padrão): tela inicial com o **PINK** grande no centro e a caixa de digitar logo abaixo; na primeira mensagem a tela passa para a sessão, com a caixa fixa no rodapé (barra rosa, modelo e provedor sob o texto) e um rodapé de uma linha (pasta, contexto, versão). Vem da extensão `extensions/pink-ui.ts` (só a API pública de extensões) e do modo de tela cheia ligado por padrão. Para voltar ao visual do Pi: `PINK_NO_BUILTIN_UI=1 pink --tui-mode regular`.
- Tema: `pink` (padrão): o agente escreve em branco, você em rosa, o pensamento em cinza; o rosa marca a caixa de digitar e os destaques. Os temas `system` (cores do terminal), `dark` e `light` continuam em `/themes` e `/settings`.
- Pensamento: fica atrás de um título, como no OpenCode — recolhido por padrão (`▸ Pensamento`); **clique no bloco** abre e recolhe aquele bloco, **ctrl+t** abre (`▾ Pensamento`) e recolhe todos e a escolha fica salva. Sob a caixa de digitar: o agente (Build ou Plano), o nome do modelo, o provedor só quando é outro, e o nível de pensamento só quando ligado.
- Funções do OpenCode (extensão `pink-ui.ts`; matriz completa em `docs/opencode-matriz.md`):
  - **ctrl+p** abre a paleta de comandos em português (também `/help`); a troca de modelo saiu do `ctrl+p` e foi para **f2** / **shift+f2**, como os modelos recentes do OpenCode;
  - **tab** com a caixa vazia troca o agente: **Build** (padrão, edita e roda comandos) e **Plano** (só lê e planeja: pede confirmação antes do `bash` e bloqueia edição); também `/build` e `/plan`;
  - **/undo** desfaz a última mensagem, as respostas e as mudanças nos arquivos e devolve o texto para a caixa; **/redo** refaz. Precisa de repositório Git (como no OpenCode); a foto usa índice e objetos próprios do Pink, sem tocar no índice, no stash nem no `.git` do projeto; vale para as mensagens desta execução do Pink;
  - **lista de tarefas**: o agente usa a ferramenta `todowrite`; a lista aparece na lateral (ou sobre a caixa, sem lateral) e em `/todos`;
  - **/sessions** lista as sessões da pasta e troca; **/themes** escolhe o tema e salva; **/init** cria ou atualiza o `AGENTS.md`; **/details** mostra ou esconde a saída das ferramentas.
- Do Pi 1.4 (de graça na atualização): MCP (`/mcp`), codemode, clique em cada bloco de pensamento, busca na conversa (`ctrl+f` no Windows), pular entre mensagens (`ctrl+up`/`ctrl+down`), fila de mensagens (`alt+enter`, `ctrl+q` no Windows), `/clone`, `/import`.
- Ao sair, o terminal volta como estava e fica o logo do Pink com o resumo da sessão (título, tokens, custo e o comando para continuar), como no OpenCode. A tela inicial não rola com a roda do mouse. Para deixar a conversa impressa no terminal: `"fullscreenExitOutput": "transcript"` em `~/.pink/agent/settings.json`.
- Caixa de digitar: fundo rosa-escuro em todas as linhas (o mesmo da mensagem enviada), com a barra rosa à esquerda.
- Lateral (como a do OpenCode), com a janela larga (120+ colunas) e só na conversa: título da sessão, contexto (tokens, % usado, custo), tokens por modelo, modelo e pensamento, projeto do Thoth (pela pasta), ferramentas ativas, pasta, branch e versão. Mostra também o agente e as tarefas. `/lateral` esconde e mostra. O Pink não tem LSP, e o MCP do Pi ainda não aparece na lateral, então a lateral não inventa essas seções.
- Barra de rolagem escondida por padrão (a roda do mouse e as teclas continuam rolando); `"fullscreenScrollbar": "auto"` volta a mostrar ao rolar.
- Privacidade: o Pink não envia a telemetria de instalação nem consulta versões no servidor do Pi.

Licença: o Pi é MIT, copyright (c) 2025 Mario Zechner (`LICENSE-PI.txt`). Veja `NOTICE.md` para o que mudou.
