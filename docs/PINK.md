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
