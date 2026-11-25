# ruff: noqa: E501, F811
"""Comandos com opções (owner 2026-11-25): "/microfone" + Enter não mostrava nada e o Tab não abria as opções.

Agora o Enter sem nada abre um menu com as opções do comando (a primeira é o padrão sem tela) e o Tab no nome do comando
já mostra as opções. Junto: a lista de subagentes acima da caixa quando a coluna da direita não está na tela, a linha
vazia entre o "Trabalhando" e a caixa, e as personas do Thoth (~/.claude/agents/thoth-*.md) como subagentes do Pink.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, cli, fake_provider, package_dir  # noqa: E402, F401

DRIVER = r"""
const [i18nUrl, uiUrl, agentsUrl, home] = process.argv.slice(1);
const out = {};
const { choose, completeFrom, setLang } = await import(i18nUrl);
setLang("pt");
const choices = () => [{ value: "status", description: "como está" }, { value: "falar" }, { value: "instalar" }];
out.completeAll = completeFrom(choices)("").map((item) => item.value);
out.completeFa = completeFrom(choices)("fa").map((item) => [item.value, item.label]);
out.completeNone = completeFrom(choices)("x");
const asked = [];
const ui = (answer) => ({ hasUI: true, ui: { select: async (title, labels) => (asked.push([title, labels]), answer(labels)) } });
out.picked = await choose(ui((labels) => labels[1]), "/microfone", choices());
out.cancelled = (await choose(ui(() => undefined), "/microfone", choices())) ?? null;
out.noScreen = await choose({ hasUI: false }, "/microfone", choices());
out.asked = asked[0];
const { aboveBox, agentLine } = await import(uiUrl);
const theme = { fg: (_color, text) => text, bold: (text) => text };
const agents = [{ agent: "tifa", task: "rodar os cenários", started: 1000 }];
out.aboveSide = aboveBox(theme, 60, { agents, side: true, now: 13000 });
out.aboveNoSide = aboveBox(theme, 60, { agents, side: false, now: 13000 });
out.aboveEmpty = aboveBox(theme, 60, {});
out.line = agentLine(theme, agents[0], 40, 13000);
process.env.USERPROFILE = home;
process.env.HOME = home;
const { discoverAgents } = await import(agentsUrl);
const found = discoverAgents(home, "user").agents;
const tifa = found.find((agent) => agent.name === "tifa");
out.tifa = tifa ? { model: tifa.model ?? null, description: tifa.description, prompt: tifa.systemPrompt.trim() } : null;
out.names = found.map((agent) => agent.name);
out.projectOnly = discoverAgents(home, "project").agents.map((agent) => agent.name);
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def menus(package_dir: Path, cli: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    # o node não tira tipos de .ts dentro de node_modules: o agents.ts vai para uma pasta própria, com o node_modules do
    # pacote instalado ao lado (ele importa o motor do Pink)
    loader = tmp_path_factory.mktemp("loader")
    for name in ("agents.ts", "external.ts"):
        shutil.copy(package_dir / "examples" / "extensions" / "subagent" / name, loader / name)
    engine = loader / "node_modules" / "@earendil-works" / "pi-coding-agent"  # o Pink é o motor: o import aponta para ele
    engine.parent.mkdir(parents=True)
    subprocess.run(["cmd", "/c", "mklink", "/J", str(engine), str(cli.parents[2])], capture_output=True, check=True) if sys.platform == "win32" else engine.symlink_to(cli.parents[2])
    home = tmp_path_factory.mktemp("home")
    agents = home / ".claude" / "agents"
    agents.mkdir(parents=True)
    (agents / "thoth-tifa.md").write_text('---\nname: thoth-tifa\ndescription: "Tudo que é teste"\nmodel: haiku\n---\nVocê é a persona tifa.\n', encoding="utf-8")
    (agents / "thoth-cloud.md").write_text("---\nname: thoth-cloud\ndescription: Faz a mudança\n---\nVocê é a persona cloud.\n", encoding="utf-8")
    (agents / "outro.md").write_text("---\nname: outro\ndescription: não é do Thoth\n---\nx\n", encoding="utf-8")
    urls = [(package_dir / "extensions" / "pink-i18n.ts").as_uri(), (package_dir / "extensions" / "pink-ui.ts").as_uri(),
            (loader / "agents.ts").as_uri()]
    done = subprocess.run(["node", "--input-type=module", "-e", DRIVER, *urls, str(home)], capture_output=True, text=True,
                          encoding="utf-8", timeout=120, check=False, cwd=loader)
    assert done.returncode == 0, done.stderr[-2000:]
    return json.loads(done.stdout.strip().splitlines()[-1])


def test_the_options_feed_the_autocomplete_and_the_menu(menus: dict) -> None:
    assert menus["completeAll"] == ["status", "falar", "instalar"]
    assert menus["completeFa"] == [["falar", "falar"]] and menus["completeNone"] is None
    assert menus["picked"] == "falar"  # o menu devolve o valor, não o rótulo com a descrição
    assert menus["cancelled"] is None  # Esc no menu: nada roda
    assert menus["noScreen"] == "status"  # sem tela (rpc, print): a primeira opção é o padrão
    assert menus["asked"] == ["/microfone", ["status · como está", "falar", "instalar"]]


def test_subagents_show_above_the_box_only_without_the_side_column(menus: dict) -> None:
    assert menus["aboveSide"] == [""]  # com a coluna: só a linha vazia entre o "Trabalhando" e a caixa
    assert menus["aboveEmpty"] == [""]
    lines = menus["aboveNoSide"]
    assert lines[-1] == "" and "SUBAGENTES  1" in lines[0]
    assert "tifa" in lines[1] and "rodar os cenários" in lines[1] and lines[1].rstrip().endswith("12s")
    assert menus["line"].startswith("● tifa")


def test_thoth_personas_are_pink_subagents_by_their_short_name(menus: dict) -> None:
    assert menus["tifa"] == {"model": None, "description": "Persona tifa do Thoth: Tudo que é teste", "prompt": "Você é a persona tifa."}
    assert {"tifa", "cloud"} <= set(menus["names"]) and "outro" not in menus["names"] and "thoth-tifa" not in menus["names"]
    assert "tifa" not in menus["projectOnly"]  # escopo só do projeto: as do usuário ficam de fora


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_tab_and_enter_on_a_command_show_its_options(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    from f50_tui_probe import run_tui
    from test_pink_questionnaire_tui import write_models

    write_models(tmp_path, fake_provider, "ask-long")
    screens = run_tui(cli, tmp_path, [(None, 8.0)] + [(ch, 0.8) for ch in "/microf"] + [("\t", 2.0)], columns=110, rows=30)
    tab = "\n".join(screens[-1])
    assert "/microfone" in tab and "falar" in tab and "instalar" in tab, tab  # o Tab completou e já abriu as opções
    screens = run_tui(cli, tmp_path, [(None, 8.0)] + [(ch, 0.8) for ch in "/microfone"] + [("\x1b", 1.0), ("\r", 2.5)], columns=110, rows=30)
    menu = "\n".join(screens[-1])
    assert "status · " in menu and "falar · " in menu and "instalar · " in menu, menu  # Enter sem nada: o menu
