# Changelog do Pink

O Pink é um fork do Pi (MIT, veja `LICENSE-PI.txt` e `NOTICE.md`). Aqui só entra o que mudou no Pink; a base de cada
versão está no campo `upstream` do `rebrand.json` do repositório.

## [1.0.15] - 2026-11-26

- /agente funciona como um modelo logado:
  - a sessão é gravada já na primeira mensagem ao agente e aparece na lista com o seu pedido como título (antes uma
    sessão só com o agente não ia para o disco e sumia se o Pink fechasse);
  - o fim de cada resposta do agente faz o mesmo que o do modelo do Pink: título automático, coluna de sessões
    atualizada, círculo do pink mux, sessão lembrada pelo mux, notificação e hook Stop;
  - /undo desfaz também o último pedido ao agente e os arquivos que ele mudou (a conversa interna do agente não volta).
- Trocar entre o modelo do Pink e o /agente continua de onde o outro parou, nos dois sentidos: o agente recebe o que
  aconteceu na conversa desde a última resposta dele, e ir para o agente com o modelo respondendo para o modelo e passa
  o pedido ao agente.
- Os subagentes do /agente seguem a mesma regra dos do Pink: com a lateral ligada, só nela; sem ela, embaixo da caixa.
- ctrl+enter funciona no Windows Terminal (o Pink pergunta ao Windows se o ctrl está apertado, como já fazia com o
  shift).

## [1.0.14] - 2026-11-25

- /agente opencode: os subagentes dele voltam a aparecer (o Pink olhava o transporte "acp" em vez do nome do agente).
- Uma linha vazia entre o "Trabalhando" e a caixa também no modelo do Pink, como já era com o /agente.
- Trocar o modelo do Pink com o agente trabalhando derruba o agente na hora e o novo modelo continua o pedido, com o
  que o agente já fez na conversa. Antes os dois trabalhavam ao mesmo tempo.
- Com o /agente trabalhando, o círculo da sessão gira na lateral do pink mux.

## [1.0.13] - 2026-11-25

- Subagentes: na tela cheia ficam na coluna da direita, abaixo da SESSÃO; fora dela (modo regular ou terminal
  estreito), embaixo da caixa de digitar, como no Claude Code. Vale para os do Pink, do DAG do Thoth e do /agente.

## [1.0.12] - 2026-11-25

- Comandos com opções: o Tab no nome (/microf + Tab) completa e já mostra as opções; Enter sem nada abre um menu
  (/microfone, /tela, /sandbox, /memoria, /processos, /subagentes). /agente e /modo seguem como eram.
- /microfone falar e /microfone parar: ditar sem clicar no botão, que só aparece na tela cheia.
- Sem a coluna da direita (modo regular ou terminal estreito), os subagentes do Pink e do DAG do Thoth aparecem acima da
  caixa enquanto rodam; uma linha vazia separa o "Trabalhando" da caixa de digitar.
- As personas do Thoth (instaladas pelo thoth-client) viram subagentes do Pink pelo nome curto: tifa, cloud, vincent...

## [1.0.11] - 2026-11-25

- /agente como o OpenCode: o trabalho antes da resposta vira uma linha "+ 2 comandos, 3 pensamentos" que abre com
  clique; cada "+ Pensou · 5.3s" abre e mostra o raciocínio. Ctrl+T abre o de todas.
- /agente: as mensagens na fila ficam em cima do "Trabalhando", com uma linha vazia até a caixa. Ctrl+Enter interrompe
  o agente e manda na hora, junto com a fila. A caixa mostra "esc interromper · ctrl+enter enviar agora".
- Permissão pedida pelo agente (opencode e os outros ACP) diz o que ele quer fazer: tipo, comando, arquivos e motivo.
  As opções aparecem como "Sim / Não".
- As personas do DAG do Thoth (`thoth-client dag run`) aparecem em SUBAGENTES enquanto ele roda: quem está rodando,
  esperando, pronto ou falhou (o Thoth grava `.thoth/dag/live.json`).
- /agente: os subagentes de todos os agentes aparecem em SUBAGENTES, rodando, pausado, pronto ou falhou: Claude Code
  (Task/Agent), Codex (spawnAgent) e os ACP (opencode, cline, gemini, qwen, goose, copilot). No opencode, o Pink lê
  também as sessões filhas no banco dele (só leitura), e os de segundo plano seguem na lista depois da resposta. Sem a
  lateral (terminal estreito), a lista fica acima da caixa.
- SUBAGENTES passou para o fim da lateral, abaixo da SESSÃO.
- A lista de comandos não some mais no meio da palavra (digitando /resume, ela sumia no "/resu").

## [1.0.10] - 2026-11-24

- Microfone opcional, como no Claude e no Codex desktop: `/microfone instalar` (com o seu ok, ~530 MB uma vez) põe o
  mesmo modelo do OpenBot, NVIDIA Parakeet TDT 0.6B v3, rodando local com o sherpa-onnx. Na tela cheia, a caixa de
  digitar ganha o botão "◉ falar": a fala aparece ao vivo na caixa, e "‖ pausar", "■ parar" (o texto fica na caixa)
  e "➤ enviar" (manda ao agente). O áudio não sai da máquina; sem instalar, nada muda.
- Inclui tudo da 1.0.9 (a 1.0.9 também está no npm).

## [1.0.9] - 2026-11-24

- COTA: quando o uso do plano não chega, a lateral diz o motivo (`thoth-client` fora do PATH, antigo, lento ou com
  resposta inválida) em vez de só "sem dado do plano"; um aviso impresso antes do JSON não quebra mais a leitura.
- THOTH: sem o Thoth instalado, a seção mostra uma apresentação curta com o site (thothdev.ia.br).
- Versão nova: ao abrir, o Pink avisa quando há versão mais nova no npm e diz para rodar `pink update` (com o Pink
  fechado); o link do changelog leva ao CHANGELOG no GitHub. `PINK_SKIP_VERSION_CHECK=1` desliga a consulta.
- `/agente`: a mensagem enviada enquanto o agente trabalha aparece em cinza acima da caixa, como no Claude Code, no
  lugar do aviso "Na fila"; ela some quando é enviada.
- `/agente` com opencode e outros agentes ACP: cada passo da partida (initialize, session/new, modelo) tem prazo de
  2 min e percebe o agente morto; um agente travado (ex.: um MCP que não abre na máquina) vira erro em vez de
  "Trabalhando" sem fim, e o Esc solta.
- Caixa de digitar: linha vazia também embaixo do rótulo ("Build · modelo"), como a do OpenCode.
- `/agente`: reabrir a mesma sessão do Pink (`/sessions`, `pink -c`) e escolher o mesmo agente continua a conversa
  dele (claude `--resume`, codex `thread/resume`, opencode e ACP `session/load`); sessão nova do Pink começa do zero.

## [1.0.8] - 2026-11-24

- Publicada no meio do trabalho, com só parte das mudanças acima; use a 1.0.9.

## [1.0.7] - 2026-11-24

- `/agente`: os menus de agente, modelo e esforço têm busca, como o `/model` (digite para filtrar, setas, Enter, Esc).
- `/agente` com opencode e outros agentes ACP: o agente já liga e abre a sessão quando é escolhido; a primeira mensagem
  não espera a partida a frio (19 s → 8 s no teste com o opencode).

## [1.0.6] - 2026-11-24

- `/agente`: ferramentas seguidas viram uma linha de resumo, como no Claude Code (`→ tela · 26 ações: click ×6, ...`,
  `→ Leu a.ts ×2`).
- Pink nativo: a tela tem nome próprio no grupo de ferramentas (`Usou a tela (26 ações), leu 1 arquivo`).
- A 1.0.5 ficou presa no npm (staged) e não foi publicada; o que estava nela vem nesta.

## [1.0.5] - 2026-11-24

- `/agente`: escolha do esforço (`/agente codex gpt-5.5 high`, ou o menu depois do modelo) no Claude e no codex; o
  opencode não tem esforço.
- `/agente`: mensagem enviada enquanto o agente trabalha entra na fila e vai quando ele terminar (`/agente off` descarta).
- `/agente`: as chamadas da tela dizem o que fizeram (`→ tela · click 120, 340`, `→ tela · type_text "RTX 5070 Ti"`) e
  ferramentas seguidas ficam juntas, sem linha em branco.
- `/agente` com codex: a tela do Pink e o `pink_tarefa` têm até 16 min por chamada (o padrão do codex, 60 s, estourava
  com a confirmação esperando a pessoa).
- Contorno da `/tela`: fica aceso enquanto o agente trabalha e apaga quando ele termina (antes apagava 4 s depois de
  cada ação e piscava).
- A ferramenta de tela pede ao agente que siga até terminar o pedido, sem parar depois de uma ação.

## [1.0.4] - 2026-11-24

- `/tela`: no pedido de confirmação, "Sim, e não perguntar de novo para o msedge.exe" libera aquele programa até
  `/tela desligar` (terminais seguem pedindo sempre, com a segunda confirmação). O título da janela sai com acento
  ("páginas", não "p�ginas").
- Contorno da `/tela`: por dentro da janela e só no monitor dela (por fora, a janela maximizada ficava só com a borda de
  baixo, ainda mais com dois monitores); na captura da tela inteira, um contorno em cada monitor.

## [1.0.3] - 2026-11-24

- `/agente`: só uma linha em branco entre o pedido e a resposta do agente (eram três).
- `/agente` com opencode e os outros agentes ACP: o programa do agente fica aberto entre as mensagens. Só a primeira
  demora (~15 s para subir e abrir a sessão); as seguintes levam ~2 a 4 s. Fecha no `/agente off`, ao trocar de agente,
  ao cancelar, se der erro e ao sair do Pink.
- "Trabalhando… (6s · ↓ 306 tokens)", com parênteses como no Claude Code, colado na caixa (sem a linha em branco entre
  os dois), no Pink e no `/agente`.
- `/agente`: o agente usa a tela do Pink pela ferramenta `pink_tela` (MCP do Pink): vale a tela que você ligou com
  `/tela ligar`, e cada clique ou digitação pede confirmação na janela do Pink. Antes ele ia pelo `pink_tarefa`, que roda
  outro Pink com a tela desligada. A linha da ferramenta mostra o nome dela (ex.: `→ pink_tela`), não `→ execute`.

## [1.0.2] - 2026-11-24

- `/agente`: a conversa fica igual à do Pink: "> oi", "+ Pensou", "→ Rodou: ...", "→ Leu ...", "●" e o rodapé
  "opencode · big-pickle · 7s · ↓ 49 tokens"; "Trabalhando · 2s · ↓ 0 tokens" acima da caixa, como o do Pink.
- `/agente` + espaço lista `off` e os agentes instalados; `/agente codex ` lista os modelos dele.
- Agentes ACP (opencode e outros): o comando e o arquivo de cada ferramenta, o pensamento e o modelo de verdade aparecem.

## [1.0.1] - 2026-11-23

- `/agente`: aparece "<agente> trabalhando · Ns" embaixo da caixa enquanto o agente responde; com um agente ligado, o
  primeiro item do menu é "Voltar ao Pink" (o mesmo que `/agente off`); as mensagens aparecem como "Você → opencode" e
  "opencode · modelo", em vez dos tipos crus `[pink-agente-pedido]` e `[pink-agente]`.
- README em inglês, com o logo e a tela.
- `/sugestao [texto]` abre a página de ideias do Pink (GitHub Discussions), com o texto como título. Doação pelo Ko-fi
  (`npm fund @thothdev/pink` e o botão Sponsor do GitHub).

## [1.0.0] - 2026-11-23

Primeira versão pública: código aberto (MIT) em https://github.com/ricardopiresqa/pink e pacote `@thothdev/pink` no npm. As
versões abaixo (`1.4.0-pink.N`, com o número do Pi 1.4.0 de base) eram internas.

- Agentes instalados (Claude Code, Codex e os que falam ACP: opencode, cline, copilot, qwen, goose, gemini) como subagentes e
  no `/agente <nome> [modelo]`, que passa a sessão a eles com continuidade, as regras, as skills e os MCPs do Pink, e o
  próprio Pink como MCP (`pink_tarefa`).

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
