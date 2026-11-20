# ruff: noqa: E501
"""Card 1dfwh7kg4an - pergunta do agente (questionnaire) na tela partida, e o clique na opção.

Roda o Pink de verdade num terminal (ConPTY, como test_f50) com o provedor falso da F51. Os modelos ask-long (12 tarefas e uma
pergunta com 4 opções com descrição) e ask-tabs (2 perguntas) estão em tests/f51_fake_provider.py.
O clique vai como bytes SGR do mouse (\\x1b[<0;x;yM e ...m) pelo mesmo caminho do teclado; a linha y é a da tela capturada antes.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, cli, fake_provider, package_dir  # noqa: E402, F401 - fixtures do pacote construido e do provedor falso

OPEN = [(None, 6.0), ("\r", 6.0), ("pergunte", 1.0), ("\r", 20.0)]  # confiar na pasta, digitar, enviar e esperar a pergunta
CLICK_WAIT = 8.0


def write_models(home: Path, port: int, model: str) -> None:
    target = home / ".pink" / "agent"
    target.mkdir(parents=True, exist_ok=True)
    (target / "models.json").write_text(json.dumps({"providers": {"fake": {"baseUrl": f"http://127.0.0.1:{port}/v1", "api": "openai-completions", "apiKey": "fake-key-0123456789", "models": [{"id": "ask-long"}, {"id": "ask-tabs"}]}}}), encoding="utf-8")
    (target / "settings.json").write_text(json.dumps({"defaultProvider": "fake", "defaultModel": model}), encoding="utf-8")


def run(cli_path: Path, home: Path, port: int, model: str, steps: list) -> list[list[str]]:
    sys.path[:0] = [str(Path(__file__).resolve().parent)]
    from f50_tui_probe import run_tui

    write_models(home, port, model)
    return run_tui(cli_path, home, steps, columns=95, rows=30)


def row_of(screen: list[str], text: str) -> int:
    for index, line in enumerate(screen):
        if text in line:
            return index
    raise AssertionError(f"{text!r} nao esta na tela:\n" + "\n".join(screen))


def click(row: int) -> list:
    """Pressiona e solta o botão esquerdo na linha `row` (0 = topo da tela): o TUI manda 'click' e a pergunta escolhe."""
    y = row + 1  # SGR começa em 1
    return [(f"\x1b[<0;3;{y}M", 1.0), (f"\x1b[<0;3;{y}m", CLICK_WAIT)]


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_1_at_95x30_the_options_stay_visible_above_the_bottom_bar_and_the_task_list_is_capped(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screen = run(cli, tmp_path, fake_provider, "ask-long", OPEN)[3]
    joined = "\n".join(screen)
    assert "Publicar agora?" in joined
    for label in ("1. Sim, publicar", "2. Não, depois", "3. Só em teste", "4. Cancelar"):
        assert label in joined, joined
    for description in ("envia para produção hoje", "não publica nada"):
        assert description in joined, joined  # a descrição fica com a sua opção
    bottom = max(index for index, line in enumerate(screen) if line.strip())
    assert row_of(screen, "4. Cancelar") < bottom  # as opções estão acima da barra de baixo
    assert "ctrl+p" in screen[bottom] or "/hotkeys" in screen[bottom], screen[bottom]  # a barra de baixo continua na tela
    # a lista de tarefas tem teto: título, 4 em andamento/pendentes e o "+N"
    assert "Tarefas 2/12" in joined and "… +8 tarefas" in joined, joined
    items = [line for line in screen if line.startswith("  ") and any(mark in line for mark in ("◐", "○", "✓")) and "tarefa" in line]
    assert len(items) == 4, items  # 1 em andamento + 3 pendentes (o teto é max(3, linhas/5) = 6 linhas no total)


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_2_a_click_on_an_option_chooses_it_and_the_press_alone_does_not(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    first = run(cli, tmp_path / "a", fake_provider, "ask-long", OPEN)[3]
    (tmp_path / "a").mkdir(exist_ok=True)
    row = row_of(first, "2. Não, depois")
    second = tmp_path / "b"
    second.mkdir()
    screens = run(cli, second, fake_provider, "ask-long", OPEN + [click(row)[0]] + [click(row)[1]])
    assert row_of(screens[3], "2. Não, depois") == row  # a mesma tela nas duas execuções: o clique cai na linha certa
    assert "user selected" not in "\n".join(screens[4]), "so o pressionar nao deveria responder"
    assert "user selected: 2. Não, depois" in "\n".join(screens[-1]), screens[-1]


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_3_with_several_questions_a_click_moves_the_tab_and_the_last_click_reaches_submit(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    probe = tmp_path / "probe"
    probe.mkdir()
    # 1a execução: a linha da opção 1; 2a: depois do clique nela, a linha da opção 1 da pergunta 2 (Tab não serve: o editor o pega)
    row_env = row_of(run(cli, probe, fake_provider, "ask-tabs", OPEN)[3], "Produção")
    row_ver = row_of(run(cli, probe, fake_provider, "ask-tabs", OPEN + click(row_env) + [(None, 3.0)])[-1], "Versão 1")
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    steps = OPEN + click(row_env) + click(row_ver) + [("\r", 10.0)]  # OPEN=4 capturas; clique 1 = 4 e 5; clique 2 = 6 e 7; enviar = 8
    screens = run(cli, run_dir, fake_provider, "ask-tabs", steps)
    assert "Qual versão?" in "\n".join(screens[5]), screens[5]  # depois do primeiro clique, a segunda pergunta está na tela
    final = "\n".join(screens[-1])
    assert "Produção" in final and "Versão 1" in final and "eco:" in final, final


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_4_a_click_in_input_mode_does_nothing(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    probe = tmp_path / "probe"
    probe.mkdir()
    first = run(cli, probe, fake_provider, "ask-long", OPEN)[3]
    row = row_of(first, "2. Não, depois")
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    down = [("\x1b[B", 0.5)] * 4  # até "5. Escrever outra resposta"
    steps = OPEN + down + [("\r", 2.0)] + click(row)
    screens = run(cli, run_dir, fake_provider, "ask-long", steps)
    final = "\n".join(screens[-1])
    assert "user selected" not in final, final  # o clique não escolheu nada
    assert "Escrever outra resposta" in final  # continua em digitação


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_5_a_double_click_on_a_multi_question_form_answers_only_the_first_question(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    probe = tmp_path / "probe"
    probe.mkdir()
    first_tab = run(cli, probe, fake_provider, "ask-tabs", OPEN + [("\t", 2.0)])
    row_env = row_of(first_tab[3], "Produção")
    y = row_env + 1
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    # duplo clique: dois pares press/release em sequência rápida; o segundo cai na linha da opção 1 da pergunta 2
    double = [(f"\x1b[<0;3;{y}M", 0.05), (f"\x1b[<0;3;{y}m", 0.05), (f"\x1b[<0;3;{y}M", 0.05), (f"\x1b[<0;3;{y}m", 3.0)]
    screens = run(cli, run_dir, fake_provider, "ask-tabs", OPEN + double)
    final = "\n".join(screens[-1])
    assert "Qual versão?" in final, final  # a primeira pergunta foi respondida (abas avançaram)
    assert "eco:" not in final, final  # a pergunta 2 não foi respondida pelo segundo clique


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_6_after_the_400_ms_quiet_window_a_click_works_again(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    probe = tmp_path / "probe"
    probe.mkdir()
    row_env = row_of(run(cli, probe, fake_provider, "ask-tabs", OPEN)[3], "Produção")
    row_ver = row_of(run(cli, probe, fake_provider, "ask-tabs", OPEN + click(row_env) + [(None, 3.0)])[-1], "Versão 1")
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    y = row_env + 1
    # duplo clique (o segundo some), espera a janela de 400 ms passar, e então um clique na pergunta 2 responde
    steps = OPEN + [(f"\x1b[<0;3;{y}M", 0.05), (f"\x1b[<0;3;{y}m", 0.05), (f"\x1b[<0;3;{y}M", 0.05), (f"\x1b[<0;3;{y}m", 1.5)] + click(row_ver) + [("\r", 10.0)]
    screens = run(cli, run_dir, fake_provider, "ask-tabs", steps)
    final = "\n".join(screens[-1])
    assert "Versão 1" in final and "Produção" in final and "eco:" in final, final
