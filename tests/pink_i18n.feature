# language: pt
# Card 1dfwh7kg5cg - idioma da interface do Pink (extensions/pink-i18n.ts). Unitários com env, platform, sync e intl
# falsos; o resto num terminal real (ConPTY, headless, 95x30) com PINK_LANG. Ver tests/test_pink_i18n.py.

Funcionalidade: a interface segue o Windows (pt, es, senão en) e PINK_LANG força

  Cenário: pt-BR, es-MX, en-US e fr-FR viram pt, es, en e en
    Quando pick recebe pt-BR, es-MX, en-US e fr-FR
    Então o resultado é pt, es, en e en

  Cenário: o primeiro idioma do Windows vence; PINK_LANG vence o Windows
    Dado que o registro do Windows diz es-MX
    Quando detect roda sem PINK_LANG
    Então o resultado é es
    Quando PINK_LANG é en
    Então o resultado é en, mesmo com o Windows em português

  Cenário: se o reg.exe falha, cai no LANG e depois no Intl
    Dado que o reg.exe falha e LANG é es_MX.UTF-8
    Então o resultado é es
    Dado que o reg.exe falha, não há LANG e o Intl diz pt-BR
    Então o resultado é pt

  Cenário: Pink em espanhol: o menu / e a tela inicial falam espanhol
    Dado PINK_LANG=es
    Quando a pessoa digita "/"
    Então a descrição de /new é "Empieza una sesión nueva"
    E nenhum texto só em português aparece

  Cenário: Pink em inglês: o menu / e a tela inicial falam inglês
    Dado PINK_LANG=en
    Quando a pessoa digita "/"
    Então a descrição de /new é "Start a new session"
    E nenhum texto só em português aparece

  Cenário: a pergunta do questionário em inglês
    Dado PINK_LANG=en e um questionário com duas perguntas
    Quando a tela mostra o questionário
    Então aparecem "Type something." e "Submit"
