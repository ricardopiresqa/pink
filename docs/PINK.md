# Pink e a documentação do Pi

Os arquivos `.md` desta pasta são a documentação do **Pi 1.4.0**, sem alteração: Pink é um fork do Pi. Ao ler, troque os nomes:

| Na documentação do Pi | No Pink |
|---|---|
| `pi` (comando) | `pink` |
| `~/.pi/agent/` | `~/.pink/agent/` (ou `$PINK_CODING_AGENT_DIR`) |
| `.pi/` no projeto | `.pink/` |
| `PI_*` (variáveis de ambiente) | `PINK_*` |
| tema `system` / `dark` / `light` (padrão `system`) | também o tema `pink`, que é o padrão |
| `ctrl+p` / `shift+ctrl+p` (`alt+p` no Windows) trocam o modelo | `f2` / `shift+f2`; `ctrl+p` abre a paleta de comandos || `pi.themes`, `pi.extensions` ... em `package.json` | continuam `pi.*` (é a chave que o código lê) |
| `@earendil-works/pi-*` (bibliotecas) | iguais (o Pink usa as mesmas bibliotecas) |

## A moldura de tela cheia (1.4.0-pink.2)

O layout raiz do Pi (`VStack(conversa, caixa)`) virou `VStack(topo, HStack(sessões, conversa + caixa, contexto), rodapé)`. Quem desenha cada parte é a extensão `extensions/pink-ui.ts` (funções puras `topBar`, `leftColumn`, `rightColumn`, `bottomBar`, `frameColumns`); o pacote só monta os espaços. Larguras: coluna de sessões 30, coluna de contexto 36. Breakpoints: 150+ três colunas, 115-149 duas (sem sessões), abaixo de 115 só a conversa; a tela inicial (sessão vazia) e `/lateral` escondem as colunas. Abaixo de 20 linhas o topo e o rodapé perdem a linha separadora.

Patches no pacote (`rebrand.json`; cada um aplica exatamente uma vez, senão o build FALHA com o id do patch, e `tests/roadmap/test_f50.py` confere que estão na especificação):

| id | onde | o que faz | se o Pi mudar |
|---|---|---|---|
| `frame-layout` | `createChatViewport` (chunk principal) | troca o `root` por topo + colunas + rodapé; cada espaço chama `globalThis.__pinkFrame.render/visible/mouse` (o clique na coluna SESSÕES) | o texto exato do `root` upstream não é achado: o build falha em `frame-layout` |
| `assistant-footer` | fim de `AssistantMessageComponent.updateContent` | rodapé `Pink · modelo · 20.5s · 45.6 tok/s` na resposta final (sem chamada de ferramenta), via `globalThis.__pinkAssistantFooter` (lido a cada quadro: o tempo chega no fim) | o texto do fim do método não é achado: o build falha em `assistant-footer` |
| `user-bar` | `UserMessageComponent.render` | desenha a mensagem uma coluna mais estreita e põe a barra rosa `▌` à esquerda, via `globalThis.__pinkUserBar` | idem, falha em `user-bar` |
| `thinking-label` | `AssistantMessageComponent.updateContent` (bloco de pensamento recolhido) | troca o rótulo fixo por `+ Pensou · 6.3s`, via `globalThis.__pinkThinkingLabel` | idem, falha em `thinking-label` |

Sem a extensão (`PINK_NO_BUILTIN_UI=1`) os quatro espaços ficam invisíveis e a tela é a do Pi. O rótulo `Você` usa a API pública `registerMarkdownTransformer`; os rodapés de uma linha (`setFooter`) só aparecem no modo regular (`--tui-mode regular`), porque na tela cheia o rodapé é o da moldura.

Na 1.4.0-pink.3 o `assistant-label` (rótulo `Pink · Build` no alto da resposta) deu lugar ao `assistant-footer`. As ferramentas compactas usam a API pública `registerToolRenderer` (`renderShell: "self"`; expandido, devolve os renderers do próprio Pi), e o idioma usa `before_agent_start`. Ao trocar de sessão, o contexto antigo da extensão fica inválido: a extensão limpa os quatro globais no `session_shutdown`, e tudo o que desenha com o contexto antigo devolve vazio em vez de derrubar o Pink (`live()` em `pink-ui.ts`).
