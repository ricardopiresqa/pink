# Changelog do Pink

O Pink é um fork do Pi (MIT, veja `LICENSE-PI.txt` e `NOTICE.md`). Aqui só entra o que mudou no Pink; a base de cada
versão está no campo `upstream` do `rebrand.json` do repositório.

## [1.4.0-pink.7] - 2026-11-15

- Google Antigravity no Pink, sempre ligado: `/login google` com uma conta, os modelos Gemini e Claude dele no `/model`
  e a cota de 5 horas e da semana na coluna COTA. Aviso: o uso viola os termos do Google e a conta pode ser suspensa.

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
