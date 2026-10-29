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
- Interface (padrão, tela cheia): tela inicial com o **PINK** grande no centro e a caixa de digitar logo abaixo; na primeira mensagem a tela vira a **moldura** de três colunas (owner 2026-10-29): barra do topo (marca e versão, pasta, branch, `THOTH · BUILD`/`PLANO` e o medidor de contexto `36% · 46k / 128k`), **SESSÕES** à esquerda (as desta pasta, a atual destacada, `+ Nova sessão` e, embaixo, **FERRAMENTAS** com quantas estão ativas), a conversa no centro com a caixa de envio, e à direita **CONTEXTO**, **PLANO** (a lista do `todowrite`), **ALTERAÇÕES** (arquivos que o `edit`/`write` tocaram nesta sessão: novo ou editado) e **SESSÃO** (tokens de entrada e saída; o custo só quando existe). Rodapé: pasta, branch e os atalhos reais (`ctrl+p` comandos, `ctrl+c` limpar, `/hotkeys` ajuda). As mensagens vêm com o rótulo **Você** e **Pink · Build** (ou Plano). Vem da extensão `extensions/pink-ui.ts` e de dois patches pequenos no pacote (veja `docs/PINK.md`). Para voltar ao visual do Pi: `PINK_NO_BUILTIN_UI=1 pink --tui-mode regular`.
- Tema: `pink` (padrão), com as cores do `pink-cli-preview.html` (rosa `#ff6eb4`, texto `#f2edf4`, linhas `#302936`): o agente escreve em branco, você em rosa, o pensamento em cinza; o rosa marca a caixa de digitar e os destaques. O fundo é o do seu terminal (para ficar igual à referência, use `#100d13` no esquema de cores do terminal). Os temas `system` (cores do terminal), `dark` e `light` continuam em `/themes` e `/settings`.
- Pensamento e ferramentas compactos, como no OpenCode (1.4.0-pink.3): cada bloco vira uma linha cinza: `+ Pensou · 6.3s`, `→ Leu src/x.ts`, `→ Editou src/x.ts +3 −1 · 0.4s`, `→ Rodou: npm test`. **ctrl+t** abre o pensamento (ou clique no bloco) e **ctrl+o** abre as ferramentas na visão completa do Pi, com o diff do edit. O tempo do pensamento só aparece nas respostas desta execução do Pink (sessão reaberta mostra só `+ Pensou`). Sob a caixa de digitar: o agente (Build ou Plano), o nome do modelo, o provedor só quando é outro, e o nível de pensamento só quando ligado.
- Funções do OpenCode (extensão `pink-ui.ts`; matriz completa em `docs/opencode-matriz.md`):
  - **ctrl+p** abre a paleta de comandos em português (também `/help`); a troca de modelo saiu do `ctrl+p` e foi para **f2** / **shift+f2**, como os modelos recentes do OpenCode;
  - **tab** com a caixa vazia troca o agente: **Build** (padrão, edita e roda comandos) e **Plano** (só lê e planeja: pede confirmação antes do `bash` e bloqueia edição); também `/build` e `/plan`;
  - **/undo** desfaz a última mensagem, as respostas e as mudanças nos arquivos e devolve o texto para a caixa; **/redo** refaz. Precisa de repositório Git (como no OpenCode); a foto usa índice e objetos próprios do Pink, sem tocar no índice, no stash nem no `.git` do projeto; vale para as mensagens desta execução do Pink;
  - **lista de tarefas**: o agente usa a ferramenta `todowrite`; a lista aparece na lateral (ou sobre a caixa, sem lateral) e em `/todos`;
  - **/sessions** lista as sessões da pasta e troca; **/themes** escolhe o tema e salva; **/init** cria ou atualiza o `AGENTS.md`; **/details** mostra ou esconde a saída das ferramentas.
- Do Pi 1.4 (de graça na atualização): MCP (`/mcp`), codemode, clique em cada bloco de pensamento, busca na conversa (`ctrl+f` no Windows), pular entre mensagens (`ctrl+up`/`ctrl+down`), fila de mensagens (`alt+enter`, `ctrl+q` no Windows), `/clone`, `/import`.
- Ao sair, o terminal volta como estava e fica o logo do Pink com o resumo da sessão (título, tokens, custo e o comando para continuar), como no OpenCode. A tela inicial não rola com a roda do mouse. Para deixar a conversa impressa no terminal: `"fullscreenExitOutput": "transcript"` em `~/.pink/agent/settings.json`.
- Caixa de digitar e mensagem do usuário: barra rosa cheia (`▌`, `#ff6eb4`) à esquerda e fundo escuro, como a barra do OpenCode; `Peça a próxima etapa...` quando vazia, o agente e o modelo (`Build · thoth`) à direita quando cabe, e as dicas reais `Enter enviar · shift+tab pensar · ctrl+t ver pensamento`. Cada resposta termina com um rodapé `Pink · <modelo> · 20.5s · 45.6 tok/s` (o tempo vai do pedido ao fim da resposta; tempo e velocidade só aparecem quando medidos nesta execução; `Plano` aparece quando a resposta foi do agente Plano). O Pink responde no idioma em que você escreve; sem como saber, em português do Brasil (instrução acrescentada ao prompt de sistema).
- Adaptativa pela largura, como os painéis do OBS (recalcula ao redimensionar): **150+ colunas** três colunas; **115 a 149** some a de sessões; **menos de 115** só a conversa (as tarefas aparecem sobre a caixa). No topo, o medidor some abaixo de 115 colunas, a versão abaixo de 100 e a branch abaixo de 80. Com menos de 20 linhas, topo e rodapé ficam com uma linha cada. `/lateral` esconde e mostra as colunas. O Pink não tem LSP, e o MCP do Pi ainda não aparece nas colunas, então elas não inventam essas seções.
- Barra de rolagem escondida por padrão (a roda do mouse e as teclas continuam rolando); `"fullscreenScrollbar": "auto"` volta a mostrar ao rolar.
- Privacidade: o Pink não envia a telemetria de instalação nem consulta versões no servidor do Pi.

Licença: o Pi é MIT, copyright (c) 2025 Mario Zechner (`LICENSE-PI.txt`). Veja `NOTICE.md` para o que mudou.

## Sessões (1.4.0-pink.3)

- A coluna **SESSÕES** mostra o horário de cada sessão à direita (`14:32` hoje, `ontem`, `3d`, depois `28/10`), então sessões de mesmo nome se distinguem. A sessão sem nome ganha um título automático, a primeira mensagem sua com mais de 3 palavras (comandos `/...` não contam).
- **Clique** numa sessão da coluna para abri-la; clique em `+ Nova sessão` para começar outra. Teclas: **ctrl+n** nova sessão; **alt+↑** / **alt+↓** a sessão anterior / seguinte da lista. Fora do Windows o Pi usa `alt+↑` para devolver mensagens da fila à caixa: quando essa tecla é a do Pi, ela continua sendo a do Pi. Trocar de sessão espera a resposta terminar.
- **Apagar sessão**: `/delete-session` (também na paleta `ctrl+p` e como primeiro item do `/sessions`). Pede confirmação e não deixa apagar a sessão aberta. Nada é excluído: o arquivo vai para `.trash/`, ao lado das sessões da pasta (`~/.pink/agent/sessions/<pasta>/.trash/`), que o Pink não lista. Para recuperar, mova o arquivo de volta para a pasta de cima. Para esvaziar a lixeira, apague você mesmo a pasta `.trash` (no PowerShell: `Remove-Item -Recurse "$HOME\.pink\agent\sessions\<pasta>\.trash"`).
- O painel **SESSÃO** (à direita) mostra os tokens, o modelo usado e o custo, este só quando o provedor informa um custo maior que zero.

## Fundo igual ao da referência no Windows Terminal

O Pink não pinta o fundo: ele usa o do terminal. Para o `#100d13` da referência, acrescente este esquema na lista `"schemes"` do `settings.json` do Windows Terminal (Configurações → Abrir arquivo JSON) e escolha **Pink** em Perfil → Aparência → Esquema de cores. Nada do Pink muda a sua configuração.

```json
{
    "name": "Pink",
    "background": "#100D13",
    "foreground": "#F2EDF4",
    "cursorColor": "#FF6EB4",
    "selectionBackground": "#49243D",
    "black": "#17131B",
    "red": "#E05555",
    "green": "#8DE0B1",
    "yellow": "#F0C487",
    "blue": "#6AA6F8",
    "purple": "#B7A4FF",
    "cyan": "#56C2C9",
    "white": "#D7CEDB",
    "brightBlack": "#6B6170",
    "brightRed": "#FF6E8A",
    "brightGreen": "#A8F0C6",
    "brightYellow": "#FFD9A3",
    "brightBlue": "#8FBCFF",
    "brightPurple": "#FF9BCE",
    "brightCyan": "#7FDDE3",
    "brightWhite": "#F2EDF4"
}
```
