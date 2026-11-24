# Pink é um fork do Pi

Pink (`@thothdev/pink`) é um fork do **Pi** (`@earendil-works/pi-coding-agent`, MIT, copyright (c) 2025 Mario Zechner). O texto da licença do Pi está em
`LICENSE-PI.txt` e acompanha este pacote, como a licença exige.

O que o Pink muda em relação ao Pi 1.4.0 (a lista completa e verificada está em `rebrand.json`, no repositório do Thoth):

- o nome: tudo que é Pi vira Pink (comando, título, diretório de configuração `~/.pink/agent` e `.pink/` no projeto, variáveis `PINK_*`, mensagens e prompt de sistema);
- o tema `pink` como tema padrão: texto do agente quase branco, mensagem do usuário em rosa, pensamento em cinza, rosa
  como cor da marca e dos destaques (2026-10-13; antes era tudo rosa);
- por privacidade, o Pink **não** envia a telemetria de instalação nem consulta versões no servidor do Pi: os endereços `pi.dev/api/*` foram trocados por `pink.invalid`
  e a telemetria de instalação vem desligada por padrão;
- a interface no estilo do OpenCode, na extensão `extensions/pink-ui.ts` (código do Pink, MIT), que o pacote carrega por padrão. Ela traz tela inicial, caixa de digitar,
  moldura de tela cheia (topo, colunas de sessões e de contexto, rodapé), fechamento, paleta de comandos, agentes Build e Plano, `/undo` e `/redo` com arquivos, lista de tarefas (`todowrite`), `/sessions`, `/themes`, `/init` e `/details`;
- temas extras (`theme/extra-themes.json`, gerado por `theme/make_themes.mjs`): os temas do OpenCode (MIT, copyright dos autores do opencode) convertidos para o formato do Pink, cores inspiradas nos temas do Claude Code e as paletas públicas base16, catppuccin e one-half
  dos temas de código do Codex (2026-11-15);
- ferramentas opcionais, todas desligadas até a pessoa ligar no `/ferramentas` (`extensions/pink-natives.ts`, 2026-11-15): o Ponytail (`@dietrichgebert/ponytail`, MIT, copyright de Dietrich Gebert) vem como
  dependência npm de versão fixa; RTK, Headroom e graphify **não** vêm junto (o RTK tem partes BUSL-1.1): o Pink só usa os que já estão instalados na máquina;
- só as próprias pastas de skills (`~/.pink/agent/skills`, `.pink/skills`, pacotes e MCP): as pastas `.agents/skills`, compartilhadas com outros agentes, ficam de fora;
- alguns padrões: tela cheia, pensamento recolhido, início silencioso e barra de rolagem escondida. A troca de modelo passou de `ctrl+p` para `f2`/`shift+f2`, e o `ctrl+p` agora
  abre a paleta (2026-10-28).

O que o Pink **não** muda: o laço do agente, os provedores, o motor da TUI, as sessões e a compactação são os do Pi. Identificadores de protocolo enviados a terceiros
(`originator`, `referrer`, `x-opencode-client`) e os nomes de atributos de telemetria interna (`pi.*`) continuam como no Pi.

Onde o nome Pi continua, e por quê (auditoria de 2026-11-15, card 1dfwh7kffk5; o resto do pacote diz Pink):

- o objeto `pi` da API de extensões (`export default function (pi) { pi.on(...) }`) e os nomes que começam por ele: toda extensão
  existente, inclusive o Ponytail, usa esse nome;
- os pacotes `@earendil-works/pi-*` nos `import` e nas dependências: são os módulos que o Pink entrega às extensões e as
  bibliotecas de que ele depende, publicados com esse nome;
- a chave `pi` do `package.json` dos pacotes de extensão (`pi.extensions`, `pi.themes`): é o que o carregador lê;
- identificadores internos que não aparecem na tela (`pi.bug-report`, `pi.virtual-model-state`, `pi:image-resize-response`) e
  o endereço `pi.dev/oauth`, que é o client ID real do login de MCP;
- valores de reserva e a detecção da distribuição oficial no código (`".pi"`, `OFFICIAL_APP_NAME`, o repositório
  `earendil-works/pi` do leitor de changelog): o `package.json` do Pink define nome e pasta, então valem `pink` e `.pink`;
- nomes de arquivo de módulos internos que o código importa (`pi-manifest`, `pi-user-agent`, `pi-logo`, `pi-messages-*`):
  não aparecem para a pessoa nem para o modelo;
- o nome que o Pink manda aos servidores MCP (`clientInfo` e `client_name` do OAuth) é `pink`, não `pi`: um servidor
  que só aceitava o Pi pela lista de clientes conhecidos pode recusar; `clientName` nas configurações do MCP troca o nome;
- a biblioteca/SDK (`dist/` fora do bundle, para quem embute o Pink num programa) lê as variáveis `PI_*`, como as
  dependências `@earendil-works/*` que ela importa; o Pink que a pessoa roda (o bundle) lê `PINK_*`;
- os schemas e o `$schema` dos temas apontam para `https://pink.invalid/...`: não há endereço publicado, então o editor
  não valida pelo link (os schemas vêm na pasta `schemas/`);
- nomes de bibliotecas de terceiros que não têm a ver com o produto (ex.: a constante matemática `PI` do realce de código);
- a atribuição exigida pela licença MIT: este arquivo, o `LICENSE-PI.txt`, a linha do Pi no `LICENSE`, o campo
  `thoth.fork_of` do `package.json` e a linha de fork do `README.md`. O `repository` do `package.json` aponta para o
  repositório do Pink.
