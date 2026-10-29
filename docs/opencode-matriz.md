# Pink × OpenCode: matriz de funções

Data: 2026-10-28. Card ClickUp 86e3ptuv2. Comparação do Pink 1.4.0-pink.1 (Pi 1.4.0) com a TUI do OpenCode (v2.1.4 instalado, 2.2.0 no npm).

Fontes, só fatos conferidos:

- OpenCode: `packages/web/src/content/docs/tui.mdx` e `packages/tui/src/config/keybind.ts` do repositório `anomalyco/opencode` (branch `dev`).
- Pi 1.4.0: `docs/slash-commands.md`, `docs/keybindings.md`, `docs/usage.md`, `docs/extensions.md` e `dist/core/extensions/types.d.ts` do pacote do npm.
- Pink: `pink/extensions/pink-ui.ts`, `pink/rebrand.json` e os testes em `tests/roadmap/test_f50.py`.

O rascunho veio do plugin delegate (papel `aerith`, modelo `opencode/deepseek-v4.1-flash-free`). Conferi cada linha contra os fatos e corrigi quatro: lateral, `/init`, atalhos de sessão e paleta.

Legenda: **esforço** é baixo, médio ou alto. **API pública** responde se a função cabe só na API de extensões do Pi: sim, parcial (precisa de patch) ou não.

## Matriz

| Função | OpenCode | Pink | Esforço | API pública? |
|---|---|---|---|---|
| Comandos `/` | `/help`, `/models`, `/sessions`, `/themes`, `/undo` etc. | Tem. São os mais de 25 do Pi (`/model`, `/resume`, `/tree`, `/compact`, `/export` ...) e os do Pink | já tem | sim |
| Paleta de comandos `ctrl+p` | `ctrl+p` lista os comandos | **Novo:** `ctrl+p` (e `/help`) abre a paleta com os comandos em português; Enter põe o comando na caixa. Para liberar o `ctrl+p`, a troca de modelo foi para `f2`/`shift+f2`, como os "modelos recentes" do OpenCode | médio | parcial: a paleta usa a API (`select`, `getCommands`), mas mudar a tecla padrão exigiu o patch `model-cycle-on-f2`, porque o `ctrl+p` do Pi é reservado |
| Agentes Build / Plano | `shift+tab` alterna build/plan; `ctrl+x a` lista | **Novo:** `tab` com a caixa vazia (ou `/plan` e `/build`). O Plano só lê; pede confirmação antes do `bash` e bloqueia edição. O nome do agente aparece sob a caixa, antes do modelo | médio | sim: `tool_call` bloqueia, `before_agent_start` acrescenta ao prompt de sistema, e o editor próprio trata a tecla. O `shift+tab` é reservado no Pi (nível de pensamento) |
| `/undo` e `/redo` com arquivos | `ctrl+x u` / `ctrl+x r`; voltam a conversa e os arquivos (Git) | **Novo:** `/undo` volta a conversa (navega na árvore da sessão), restaura os arquivos e devolve o texto para a caixa; `/redo` refaz tudo. A foto dos arquivos usa índice e objetos próprios do Pink, sem mexer no índice, no stash nem no `.git/objects` do projeto | alto | sim: `navigateTree`, `agent_start` e `git` pelo `child_process` |
| Diff das edições | O diff aparece na conversa, e há um visualizador à parte | A ferramenta `edit` mostra o diff colorido na conversa (Pi). Não há visualizador à parte | baixo (o visualizador seria alto) | sim, com `registerToolRenderer`; o visualizador precisaria de `ctx.ui.custom` |
| Lista de tarefas | Ferramenta `todowrite`, com a lista visível | **Novo:** ferramenta `todowrite`, com a lista na lateral (ou sobre a caixa, se a lateral não couber) e o comando `/todos`. Ela acompanha a árvore da sessão | médio | sim: `registerTool`, `setWidget` e `session_tree` |
| `@arquivo` (busca difusa) | Tem | Tem (Pi), e o `Tab` completa caminhos | já tem | sim |
| Colar imagem | Tem; `ctrl+x i` mostra os anexos | `ctrl+v` (`alt+v` no Windows) cola imagem, arquivo ou texto (Pi) | já tem | sim |
| Lista e troca de sessões | `/sessions` (`ctrl+x l`) | **Novo:** `/sessions` lista as sessões da pasta e troca. O `/resume` do Pi continua | baixo | sim: `SessionManager.list` e `switchSession` |
| Temas | `/themes` (`ctrl+x t`) | **Novo:** `/themes` escolhe entre `pink`, `system`, `dark`, `light` e os temas do usuário, e salva a escolha. O `/settings` continua | baixo | sim: `getAllThemes` e `setTheme` |
| Seletor de modelo | `ctrl+x m`; `f2`/`shift+f2` para os recentes | `ctrl+l` ou `/model` escolhe; `f2`/`shift+f2` trocam (antes era `ctrl+p`) | já tem | sim |
| Toasts | Tem | `ctx.ui.notify` (Pi). As funções novas avisam por ele | já tem | sim |
| Permissões inline | Pede aprovação por ferramenta, conforme a configuração | Só no agente Plano (confirma o `bash`). No Build, o Pi não pergunta (decisão de projeto do Pi) | médio | sim: `tool_call` com `ctx.ui.confirm` (há o exemplo `permission-gate.ts`) |
| Rolagem e pulos na conversa | `pageup`/`pagedown`, primeira e última mensagem, `ctrl+x g` (linha do tempo) | `pageUp`/`pageDown`, `ctrl+up`/`ctrl+down` (mensagem anterior e próxima), `ctrl+f` (busca), `ctrl+home`/`ctrl+end`, `/tree` (Pi) | já tem (a linha do tempo visual seria média) | parcial: a linha do tempo exigiria `ctx.ui.custom` |
| Copiar mensagem | `ctrl+x y` | `ctrl+x` ou `/copy` (Pi) | já tem | sim |
| Editor externo (`$EDITOR`) | `/editor` (`ctrl+x e`) | `ctrl+g` (Pi) | já tem | sim |
| `/compact` | `ctrl+x c` | `/compact [instruções]` (Pi) | já tem | sim |
| `/export` | Exporta Markdown e abre no `$EDITOR` | `/export` em HTML ou JSONL (Pi). Não há Markdown | médio | parcial: daria para gerar o Markdown a partir de `getEntries` |
| `/init` (AGENTS.md) | Tem | **Novo:** `/init` pede ao agente que crie ou atualize o AGENTS.md | baixo | sim: `sendUserMessage` |
| `/details` | Mostra ou esconde detalhes das ferramentas | **Novo:** `/details` (o `ctrl+o` do Pi continua) | baixo | sim: `setToolsExpanded` |
| Lateral | `ctrl+x b` | `/lateral` (Pink) | já tem | parcial: o conteúdo vem da API, mas a coluna exige o patch `sidebar-column` |
| Renomear sessão | `ctrl+r` | `/name` (Pi) | já tem | sim |
| Atalhos de sessão (nova, árvore, retomar) | `ctrl+x n`, `ctrl+x l` | As ações `app.session.*` existem no Pi, mas sem tecla padrão. Dá para ligá-las em `~/.pink/agent/keybindings.json` | baixo | não precisa de código (é configuração) |
| MCP | Tem | Tem (Pi 0.99+: `/mcp`) | já tem | sim |
| Fila de mensagens | `ctrl+x enter`; stash | `alt+enter` (`ctrl+q` no Windows) põe na fila; `alt+up` devolve (Pi) | já tem | sim |
| Subagentes | Sessões filhas, com navegação entre elas | Não tem (o Pi deixa de fora de propósito; há um exemplo de extensão) | alto | parcial |
| Terminal embutido | `ctrl+x t` (dev) | Não tem | alto | não |
| LSP | Tem | Não tem | alto | não |
| Limites de uso | Tem | `/session` mostra tokens e custo; não há limites | médio | parcial |

## O que ficou de fora e por quê

- **Permissões no Build:** o Pi não pergunta antes de cada ferramenta, e o owner usa o Pink assim. Ligar confirmações por padrão mudaria o comportamento. A troca é simples (`tool_call` com `ctx.ui.confirm`) e pode virar uma opção depois.
- **Visualizador de diff, linha do tempo e terminal embutido:** cada um é um componente próprio em tela cheia (`ctx.ui.custom`). O custo é alto para o ganho, e o diff já aparece na conversa.
- **`/export` em Markdown:** o HTML e o JSONL do Pi já atendem; o Markdown fica para quando alguém pedir.
- **Subagentes e LSP:** são escolha de projeto do Pi. Exigiriam um motor novo, não uma extensão.

## Limites conhecidos das funções novas

- `/undo` só restaura arquivos dentro de um repositório Git, como no OpenCode. Arquivos do `.gitignore` não entram. Os pontos de restauração ficam na memória: depois de reabrir o Pink, o `/undo` volta só a conversa. A primeira foto de um repositório grande lê todos os arquivos uma vez; as seguintes só leem o que mudou.
- A paleta coloca o comando na caixa de digitar, e o Enter executa. A API do Pi não deixa uma extensão disparar um comando embutido diretamente.
