# Pink

Agente de código do Thoth. É um **fork do [Pi](https://github.com/earendil-works/pi-mono)** (MIT): tudo que era Pi virou Pink e as letras são rosa. O resto, o laço do agente, os provedores, a TUI, as sessões e a compactação, é o do Pi 0.84.3.

```text
npm install -g @thoth/pink      # depois da publicação (F47); hoje: npm install -g <arquivo .tgz gerado por build_pink.py>
pink                            # sessão interativa
pink -p "explique este repositório"
pink --help
```

- Configuração: `~/.pink/agent/` (ou `$PINK_CODING_AGENT_DIR`) e `.pink/` no projeto. Variáveis: `PINK_*`.
- Provedores e modelos: `~/.pink/agent/models.json` (formato do Pi; veja `docs/models.md`, lendo `pi` como `pink`).
- Interface no estilo do OpenCode (padrão): tela inicial com o **PINK** grande no centro e a caixa de digitar logo abaixo; na primeira mensagem a tela passa para a sessão, com a caixa fixa no rodapé (barra rosa, modelo e provedor sob o texto) e um rodapé de uma linha (pasta, contexto, versão). Vem da extensão `extensions/pink-ui.ts` (só a API pública de extensões) e do modo de tela cheia ligado por padrão. Para voltar ao visual do Pi: `PINK_NO_BUILTIN_UI=1 pink --tui-mode regular`.
- Tema: `pink` (padrão). Os temas `dark` e `light` continuam disponíveis em `/settings`.
- Privacidade: o Pink não envia a telemetria de instalação nem consulta versões no servidor do Pi.

Licença: o Pi é MIT, copyright (c) 2025 Mario Zechner (`LICENSE-PI.txt`). Veja `NOTICE.md` para o que mudou.
