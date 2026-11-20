# language: pt
# Card 1dfwh7kg4g2 - o Pink como o Claude Code: o diff aberto sob o edit e o painel de segundo plano abaixo da caixa.
# Os cenários rodam o Pink de verdade num terminal (ConPTY, 95x30 quando não diz outro) com o provedor falso da F51
# (tests/f51_fake_provider.py: os modelos edit-diff, write-big, read-line, bg-shell e bg-agent).

Funcionalidade: diff aberto e painel de segundo plano na tela partida

  Cenário: (a) um edit mostra o diff aberto, com número da linha, - e +, sem ctrl+o
    Dado que o modelo edit-diff cria notas.txt e depois o edita
    Quando a resposta termina
    Então o diff aparece aberto sob a linha do edit
    E há uma linha com "-" para "linha dois" e outra com "+" para "linha 2 alterada", cada uma com seu número
    E a tela não pede ctrl+o para ver o diff

  Cenário: (b) um write grande é cortado em 40 linhas com "… +N linhas (ctrl+o)"
    Dado que o modelo write-big grava um arquivo de 60 linhas
    Quando a resposta termina
    Então aparecem as 40 primeiras linhas (até "linha 40")
    E a última linha do diff é "… +20 linhas (ctrl+o)"
    E "linha 41" não aparece

  Cenário: (c) read, grep e bash continuam em uma linha só
    Dado que o modelo read-line lê, busca e roda um comando
    Quando a resposta termina
    Então cada ferramenta aparece em uma linha
    E nenhuma saída delas vira diff aberto

  Cenário: (d) um subagente e um comando em segundo plano aparecem abaixo da caixa e somem ao terminar
    Dado que o modelo bg-shell roda um comando com run_in_background e o bg-agent lança um subagente em segundo plano
    Quando o comando ou o subagente está rodando
    Então a linha de cada um aparece abaixo da caixa de digitar, com o tempo e os tokens
    Quando eles terminam
    Então as linhas somem

  Cenário: (e) em 95x30 a caixa e o painel continuam na tela
    Dado que um subagente e um comando estão em segundo plano
    Quando a tela tem 95 colunas e 30 linhas
    Então a caixa de digitar e o rodapé continuam visíveis
    E o painel de segundo plano continua abaixo da caixa

  Cenário: diffBlock e writeDiff (funções puras)
    Dado um diff com linhas + e - e uma linha longa
    Quando diffBlock recebe max 40 com 50 linhas
    Então sobram 40 linhas e a última diz "… +10 linhas (ctrl+o)"
    E writeDiff de "a\nb\n" devolve "+1 a\n+2 b"
    E writeDiff de nada devolve vazio
