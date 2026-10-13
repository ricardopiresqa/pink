# Pink

Agente de código do Thoth. É um **fork do [Pi](https://github.com/earendil-works/pi-mono)** (MIT): tudo que era Pi virou Pink, com tema e interface próprios. O resto, o laço do agente, os provedores, a TUI, as sessões e a compactação, é o do Pi 0.84.3.

```text
npm install -g @thoth/pink      # depois da publicação (F47); hoje: npm install -g <arquivo .tgz gerado por build_pink.py>
pink                            # sessão interativa
pink -p "explique este repositório"
pink --help
```

- Configuração: `~/.pink/agent/` (ou `$PINK_CODING_AGENT_DIR`) e `.pink/` no projeto. Variáveis: `PINK_*`.
- Provedores e modelos: `~/.pink/agent/models.json` (formato do Pi; veja `docs/models.md`, lendo `pi` como `pink`).
- Interface no estilo do OpenCode (padrão): tela inicial com o **PINK** grande no centro e a caixa de digitar logo abaixo; na primeira mensagem a tela passa para a sessão, com a caixa fixa no rodapé (barra rosa, modelo e provedor sob o texto) e um rodapé de uma linha (pasta, contexto, versão). Vem da extensão `extensions/pink-ui.ts` (só a API pública de extensões) e do modo de tela cheia ligado por padrão. Para voltar ao visual do Pi: `PINK_NO_BUILTIN_UI=1 pink --tui-mode regular`.
- Tema: `pink` (padrão): o agente escreve em branco, você em rosa, o pensamento em cinza; o rosa marca a caixa de digitar e os destaques. Os temas `dark` e `light` continuam em `/settings`.
- Pensamento: fica atrás de um título, como no OpenCode — recolhido por padrão (`▸ Pensamento`); **clique no título** ou **ctrl+t** abre (`▾ Pensamento`) e recolhe; a escolha fica salva. Sob a caixa de digitar: o nome do modelo, o provedor só quando é outro, e o nível de pensamento só quando ligado.
- Ao sair, o terminal volta como estava e fica o logo do Pink com o resumo da sessão (título, tokens, custo e o comando para continuar), como no OpenCode. A tela inicial não rola com a roda do mouse. Para deixar a conversa impressa no terminal: `"fullscreenExitOutput": "transcript"` em `~/.pink/agent/settings.json`.
- Caixa de digitar: fundo rosa-escuro em todas as linhas (o mesmo da mensagem enviada), com a barra rosa à esquerda.
- Lateral (como a do OpenCode), com a janela larga (120+ colunas) e só na conversa: título da sessão, contexto (tokens, % usado, custo), tokens por modelo, modelo e pensamento, projeto do Thoth (pela pasta), ferramentas ativas, pasta, branch e versão. `/lateral` esconde e mostra. O Pink não tem MCP nem LSP próprios, então a lateral não inventa essas seções.
- Barra de rolagem escondida por padrão (a roda do mouse e as teclas continuam rolando); `"fullscreenScrollbar": "auto"` volta a mostrar ao rolar.
- Privacidade: o Pink não envia a telemetria de instalação nem consulta versões no servidor do Pi.

Licença: o Pi é MIT, copyright (c) 2025 Mario Zechner (`LICENSE-PI.txt`). Veja `NOTICE.md` para o que mudou.
