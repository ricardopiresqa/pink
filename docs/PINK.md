# Pink: o que é próprio dele

Pink é um fork do Pi 1.4.0 (MIT). A documentação desta pasta já vem com os nomes do Pink (comando `pink`, pasta
`~/.pink/agent/` ou `$PINK_CODING_AGENT_DIR`, `.pink/` no projeto, variáveis `PINK_*`). O que continua com o nome
original, porque é o que o código lê:

| Nome | Por quê |
|---|---|
| `@earendil-works/pi-*` nos `import` | é o nome dos módulos que o Pink entrega às extensões |
| `pi.themes`, `pi.extensions` ... em `package.json` | é a chave que o código lê |
| nomes internos do motor compilado (`dist/`): chaves de telemetria `pi.ai.*`, `pi-virtual`, cabeçalho `x-opencode-client: pi`, variáveis minificadas, `update pi` como apelido de `update self` | protocolo e chaves que o motor e os provedores usam; não aparecem na tela |
| crédito do fork (README, CHANGELOG, esta página, `NOTICE.md`) | a licença MIT do Pi pede o crédito |

As extensões e os exemplos usam `pink` como nome do objeto da API (`export default function (pink) { pink.on(...) }`);
o nome do parâmetro é livre, então extensões antigas escritas com `pi` continuam funcionando.

Diferenças de uso: o tema padrão é `pink` (além de `system`, `dark` e `light`); `f2` / `shift+f2` trocam o modelo e
`ctrl+p` abre a paleta de comandos.

## A moldura de tela cheia (1.4.0-pink.2)

O layout raiz de base (`VStack(conversa, caixa)`) virou `VStack(topo, HStack(sessões, conversa + caixa, contexto), rodapé)`. Quem desenha cada parte é a extensão `extensions/pink-ui.ts` (funções puras `topBar`, `leftColumn`, `rightColumn`, `bottomBar`, `frameColumns`); o pacote só monta os espaços. Larguras: coluna de sessões 30, coluna de contexto 36. Breakpoints: 150+ três colunas, 115-149 duas (sem sessões), abaixo de 115 só a conversa; a tela inicial (sessão vazia) e `/lateral` escondem as colunas. Abaixo de 20 linhas o topo e o rodapé perdem a linha separadora.

Patches no pacote (`rebrand.json`; cada um aplica exatamente uma vez, senão o build FALHA com o id do patch, e `tests/roadmap/test_f50.py` confere que estão na especificação):

| id | onde | o que faz | se a base mudar |
|---|---|---|---|
| `frame-layout` | `createChatViewport` (chunk principal) | troca o `root` por topo + colunas + rodapé; cada espaço chama `globalThis.__pinkFrame.render/visible/mouse` (o clique na coluna SESSÕES) | o texto exato do `root` upstream não é achado: o build falha em `frame-layout` |
| `assistant-footer` | fim de `AssistantMessageComponent.updateContent` | rodapé `Pink · modelo · 20.5s · 45.6 tok/s` na resposta final (sem chamada de ferramenta), via `globalThis.__pinkAssistantFooter` (lido a cada quadro: o tempo chega no fim) | o texto do fim do método não é achado: o build falha em `assistant-footer` |
| `user-bar` | `UserMessageComponent.render` | desenha a mensagem uma coluna mais estreita e põe a barra rosa `▌` à esquerda, via `globalThis.__pinkUserBar` | idem, falha em `user-bar` |
| `working-close-to-editor` | `renderWidgetContainer` (área de widgets vazia acima da caixa) | some a linha em branco entre o "Trabalhando… (…)" e a caixa, que fica colado nela como no Claude Code | idem, falha em `working-close-to-editor` |
| `thinking-label` | `AssistantMessageComponent.updateContent` (bloco de pensamento recolhido) | troca o rótulo fixo por `+ Pensou · 6.3s`, via `globalThis.__pinkThinkingLabel` | idem, falha em `thinking-label` |

Sem a extensão (`PINK_NO_BUILTIN_UI=1`) os quatro espaços ficam invisíveis e a tela é a de base. O rótulo `Você` usa a API pública `registerMarkdownTransformer`; os rodapés de uma linha (`setFooter`) só aparecem no modo regular (`--tui-mode regular`), porque na tela cheia o rodapé é o da moldura.

Na 1.4.0-pink.3 o `assistant-label` (rótulo `Pink · Build` no alto da resposta) deu lugar ao `assistant-footer`. As ferramentas compactas usam a API pública `registerToolRenderer` (`renderShell: "self"`; expandido, devolve os renderers de base), e o idioma usa `before_agent_start`. Ao trocar de sessão, o contexto antigo da extensão fica inválido: a extensão limpa os quatro globais no `session_shutdown`, e tudo o que desenha com o contexto antigo devolve vazio em vez de derrubar o Pink (`live()` em `pink-ui.ts`).
