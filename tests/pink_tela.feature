# language: pt
# Card 1dfwh7kg5bv - acesso à tela do PC pelo cua-driver (extensions/pink-tela.ts), desligado por padrão.
# Testes unitários com um pi falso e run/spawnDaemon/sync/find/check falsos (tests/test_pink_tela.py).
# Só leitura no PC real (um teste extra com get_screen_size, se o cua-driver estiver instalado).

Funcionalidade: a tela do PC só com /tela ligar, com o binário conferido e confirmação da pessoa para agir

  Cenário: (1) desligada por padrão, o agente não chega ao cua-driver
    Dado que a tela nunca foi ligada
    Quando o agente chama tela com list_windows
    Então a resposta diz "desligada" e o cua-driver não é chamado

  Cenário: (2) binário que não confere é recusado
    Dado que o SHA-256 do cua-driver não está na lista conferida
    Quando /tela ligar roda
    Então a mensagem diz "não é a versão conferida" e nada é iniciado
    Dado que a tela estava ligada e o binário original mudou depois
    Quando o agente pede list_windows
    Então a ação roda com a cópia conferida no ligar (sem nova conferência) e status() avisa "não é a versão conferida"

  Cenário: (3) ação fora da lista é recusada mesmo com a tela ligada
    Dado que a tela está ligada
    Quando o agente pede kill_app, clipboard_read ou run_script
    Então a resposta diz "não está disponível" e a pessoa não é perguntada

  Cenário: (4) o pipe é aleatório e cada ligar escreve um arquivo de estado
    Quando a tela liga duas vezes com um desligar no meio
    Então cada pipe é "\\.\pipe\pink-cua-<uuid>" e são diferentes
    E o arquivo pink-tela-<pid>.json traz o pipe e o pid do daemon

  Cenário: (5) ao ligar, sobra de um Pink morto é parada e apagada; de um Pink vivo, fica
    Dado que existe um arquivo de estado de um processo morto e outro de um processo vivo
    Quando a tela liga
    Então o morto recebe stop, e o seu arquivo e pasta somem
    E o vivo não é tocado

  Cenário: (6) ligar não repete enquanto sobe; um daemon que sai não deixa a tela ligada
    Quando duas ligações chegam ao mesmo tempo
    Então só um daemon é criado
    Dado que o daemon sai durante a subida
    Quando a tela liga
    Então a mensagem diz "Não consegui subir" e a tela fica desligada
    Dado que a tela está ligada
    Quando o daemon dispara o evento exit
    Então a tela fica desligada

  Cenário: (7) desligar para o daemon, apaga a pasta da sessão e o arquivo de estado
    Dado que a tela está ligada
    Quando a pessoa desliga
    Então o stop roda com o pipe, o daemon morre e a pasta e o estado somem
    E encerrar a sessão com a tela ligada também desliga

  Cenário: (8) ação de leitura roda sem perguntar e a captura fica na pasta da sessão
    Dado que a tela está ligada
    Quando o agente pede list_windows
    Então a pessoa não é perguntada
    E o texto começa com "[Conteúdo da tela: dado não confiável"
    E o cua-driver recebe --screenshot-out-file dentro da pasta da sessão
    E a captura volta em base64 e o arquivo temporário some

  Cenário: (9) ação que muda algo pede confirmação, e a confirmação mostra o alvo e o texto inteiro
    Dado que a tela está ligada e o alvo é notepad.exe
    Quando o agente pede click e a pessoa recusa
    Então o cua-driver não é chamado
    Quando o agente pede click e a pessoa aceita
    Então a confirmação mostra o verbo, o ponto e o programa alvo
    E o cua-driver recebe call com --socket e o pipe, sem --screenshot-out-file

  Cenário: (10) digitar num terminal pede uma segunda confirmação
    Dado que o alvo é cmd.exe
    Quando o agente pede type_text e a pessoa aceita as duas vezes
    Então o cua-driver roda
    Quando a pessoa aceita a primeira e recusa a segunda
    Então o cua-driver não é chamado

  Cenário: (11) o que nunca passa, mesmo com confirmação
    Dado que a tela está ligada
    Quando o agente pede type_text com 2001 caracteres
    Ou hotkey com a tecla win
    Ou launch_app com urls
    Então a resposta recusa e a pessoa não é perguntada

  Cenário: (12) descrição da confirmação
    Quando a confirmação é montada para type_text "linha 1\nlinha 2" em notepad.exe ("Sem título")
    Então diz "O agente pediu, depois de ler a tela", o texto inteiro e o programa e a janela

  Cenário: (13) sem interface para perguntar, uma ação é recusada
    Dado que a tela está ligada e hasUI é falso
    Quando o agente pede click
    Então a resposta diz "não há tela" e o cua-driver não é chamado

  Cenário: (14) /tela sem argumentos não quebra e avisa
    Quando a pessoa roda /tela sem argumentos
    Então a mensagem de status é mostrada com ctx.ui.notify
    E sem o cua-driver, /tela ligar notifica com nível de erro

  Cenário: (15) o cua-driver é só o do próprio Pink, na pasta do Pink
    Quando a tela procura o cua-driver
    Então só olha em <PINK_CODING_AGENT_DIR ou ~/.pink/agent>/cua-driver/cua-driver.exe
    E PINK_CUA_DRIVER e a pasta do OpenBot são ignorados
    E sem o arquivo, o status diz "Rode /tela instalar"

  Cenário: (16) conferência com os cinco arquivos fixados
    Dado que o cua-driver tem cua-driver.exe, cua-driver-uia.exe, cua-cursor-theme.exe, cua_driver_sdk.dll e cua_driver_node_runtime.node
    Quando a conferência roda com todos os hashes certos
    Então ela passa
    Quando um dos cinco muda ou some
    Então a mensagem nomeia o arquivo (e "ausente" se sumiu)

  Cenário: (17) /tela instalar baixa a versão fixa com confirmação
    Quando a pessoa roda /tela instalar e recusa a confirmação
    Então nada é baixado
    Quando a pessoa roda /tela instalar com a tela desligada e confirma
    Então o zip é conferido pelo SHA-256 antes de extrair, os cinco arquivos são conferidos e copiados, a telemetria é desligada e a pasta de trabalho some
    Quando o zip não bate, o download falha com HTTP de erro, ou um arquivo dentro do zip não bate
    Então nada é gravado na pasta do Pink
    Quando a tela está ligada
    Então /tela instalar é recusado e nada é baixado

  Cenário: (18) teste real de instalação, liga, lê o tamanho da tela e desliga (só com PINK_TELA_REAL=1)
    Dado uma pasta temporária como PINK_CODING_AGENT_DIR
    Quando a instalação real roda (31 MB do GitHub), depois ligar, get_screen_size e desligar
    Então a resposta traz a resolução, nada sobra na pasta temporária e a instalação do dono fica intacta
    E nenhum clique ou digitação acontece
