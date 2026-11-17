# Changelog do Pink

O Pink é um fork do Pi (MIT, veja `LICENSE-PI.txt` e `NOTICE.md`). Aqui só entra o que mudou no Pink; a base de cada
versão está no campo `upstream` do `rebrand.json` do repositório.

## [1.4.0-pink.13] - 2026-11-17

- O logo e o resumo da sessão voltaram a aparecer ao sair (`/quit`, Ctrl+C duas vezes). Desde a lateral de sessões, a
  sessão roda num terminal virtual e o fechamento sumia junto com ele; agora a lateral o imprime no terminal real.
  Sair pelo menu da lateral ou pelo × também mostra: a lateral pede `/quit` à sessão e só encerra à força se ela não
  sair em 4 segundos.
- `tools/importar_claude.py`: converte uma sessão do Claude Code numa sessão do Pink (a conversa principal, com as
  compactações viradas em resumo do Pink; o raciocínio do Claude e os subagentes ficam fora).

## [1.4.0-pink.12] - 2026-11-17

- Web nativa, sem MCP: com modelo da OpenAI o Pink liga a busca do próprio provedor, como o Codex e o Claude Code
  (`PINK_WEB_HOSTED=0` desliga). Para qualquer modelo há `web_search` (DuckDuckGo, sem chave) e `web_fetch` (lê a
  página como texto, só http/https, até 40 mil caracteres, 20 s de limite), pelo codemode. O conteúdo da página vem
  marcado como dado de fora; sem rede ou com o buscador pedindo verificação, o erro é claro.

## [1.4.0-pink.11] - 2026-11-17

- Notificação do sistema quando o Pink termina e a janela está sem foco, como o Claude Code e o Codex: toast no Windows,
  aviso no macOS e no Linux (notify-send ou OSC 777). O foco vem do próprio terminal (Windows Terminal, iTerm2, kitty,
  WezTerm, Ghostty); terminal que não informa foco só avisa pedido de 20 s ou mais. `/notificacoes` liga e desliga
  (fica salvo) e `PINK_NOTIFY=0` desliga.
- `/undo` volta os arquivos também depois de reabrir a sessão: o ponto de restauração de cada mensagem fica salvo na
  sessão (o índice, o stash e os commits do projeto continuam intocados). Só vale no mesmo repositório da pasta atual.
- Hooks: a saída do `SessionStart` agora entra no prompt de sistema da sessão (antes ia como mensagem solta depois do
  pedido, e o modelo podia ignorar).

## [1.4.0-pink.10] - 2026-11-17

- Pergunta com opções nativa (como AskUserQuestion, request_user_input e question): a ferramenta `questionnaire` vem
  ligada, com uma ou várias perguntas, opções numeradas e "Escrever outra resposta", tela em português. Sem tela (`-p`,
  json) devolve erro na hora, não trava. É o exemplo `examples/extensions/questionnaire.ts` do Pi, carregado por padrão.
- Permissões nativas: antes de comando destrutivo (rm -r, Remove-Item -Recurse, rd /s, push forçado, reset --hard,
  sudo, baixar e executar script…) o Pink pergunta "Permitir uma vez / nesta sessão / Negar"; sem tela, recusa e diz o
  motivo ao modelo. Não edita `.env`, `.git`, chaves nem as próprias regras e hooks. Regras próprias `allow`/`ask`/`deny`
  em `~/.pink/agent/permissions.json` e, em pasta confiável, `.pink/permissions.json` (ex.: `"deny": ["bash(curl*)"]`);
  `/permissoes` mostra o que vale. É uma rede de segurança, não um sandbox: gravar pelo bash e comando ofuscado escapam.
- Hooks configuráveis no formato do Claude Code: `~/.pink/agent/hooks.json` e, em pasta confiável, `.pink/hooks.json`,
  com `PreToolUse` (saída 2 ou `{"decision":"block"}` bloqueia), `PostToolUse` (saída 2 manda o stderr ao modelo),
  `SessionStart` (stdout vira contexto) e `Stop`. Timeout por hook; `/hooks` lista o que está ligado.

## [1.4.0-pink.9] - 2026-11-16

- Subagentes nativos, como no Claude Code, no OpenCode e no Codex: a ferramenta `subagent` vem ligada. Cada subagente
  roda num processo `pink` à parte, com contexto próprio e as ferramentas dele (inclusive MCP), sozinho, em paralelo
  (até 8, 4 de cada vez) ou em cadeia (`{previous}` passa a saída adiante). O agente `general` (modelo e ferramentas da
  sessão) existe sempre; outros agentes ficam em `~/.pink/agent/agents/*.md` (`name`, `description`, `tools`, `model`)
  e, em pasta confiável, em `.pink/agents/`. Fora de pasta confiável os do projeto só rodam com confirmação na tela.
  Subagente não abre outro subagente. É o exemplo `examples/extensions/subagent` do Pi, carregado por padrão.

## [1.4.0-pink.8] - 2026-11-15

- O Google Antigravity (1.4.0-pink.7) saiu do Pink: o Google desativou o serviço na conta de teste por violação dos Termos (HTTP 403 TOS_VIOLATION). O provedor `google` volta a ser o embutido (chave do AI Studio).

## [1.4.0-pink.6] - 2026-11-15

- Ferramentas opcionais pelo `/ferramentas`, todas desligadas por padrão: Ponytail (vem junto), RTK, Headroom e
  graphify (usados só se estiverem instalados na máquina).
- Skills só das pastas do Pink: `~/.agents/skills` e `.agents/skills`, que são de outros agentes, ficam de fora.
- Tempo e tokens de cada pedido no rodapé da resposta (`6m 44s · ↓ 6.4k tokens`).
- Comandos `/` descritos em português; saiu o `/changelog`.
- Sem Radius e sem `/bug`; nome Pink em tudo que a pessoa e o modelo veem.
- Subcomandos pelo lançador, retomar sessão de qualquer pasta, cota do Claude e do Codex, lista de MCPs recolhível
  e temas extras.
- Lateral esquerda com várias sessões ao mesmo tempo; nova sessão escolhe a pasta.

## [1.4.0-pink.3] - 2026-10-29

- Layout em três colunas adaptativo, barra rosa, sessões com horário, apagar sessão, blocos compactos e rodapé por
  resposta.
- Lateral do Thoth.

## [1.4.0-pink.1] - 2026-10-13

- Primeira versão do Pink: nome, tema rosa, lateral no estilo do OpenCode, pensamento recolhível, logo e resumo da
  sessão ao sair.
