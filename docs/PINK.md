# Pink e a documentação do Pi

Os arquivos `.md` desta pasta são a documentação do **Pi 0.84.3**, sem alteração: Pink é um fork do Pi. Ao ler, troque os nomes:

| Na documentação do Pi | No Pink |
|---|---|
| `pi` (comando) | `pink` |
| `~/.pi/agent/` | `~/.pink/agent/` (ou `$PINK_CODING_AGENT_DIR`) |
| `.pi/` no projeto | `.pink/` |
| `PI_*` (variáveis de ambiente) | `PINK_*` |
| tema `dark` / `light` | também o tema `pink`, que é o padrão |
| `pi.themes`, `pi.extensions` ... em `package.json` | continuam `pi.*` (é a chave que o código lê) |
| `@earendil-works/pi-*` (bibliotecas) | iguais (o Pink usa as mesmas bibliotecas) |
