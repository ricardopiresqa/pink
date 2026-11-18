# ruff: noqa: E501
"""Pink com várias sessões (card 1dfwh7kffcu): a lateral à esquerda do mux/pink.mjs.

As funções puras (quando abrir a lateral, teclas, estados, desenho da lateral) rodam em qualquer sistema; o teste de ponta a
ponta abre o Pink instalado num terminal de verdade (ConPTY), com o provedor falso da F51, e lê a tela.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_f50 import built, cli, fake_provider, write_models  # noqa: E402, F401 - fixtures do pacote instalado e do provedor falso

ROOT = Path(__file__).resolve().parents[1]
MUX = ROOT / "mux" / "pink.mjs"

DRIVER = r"""
const m = await import(process.argv[1]);
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const width = (s) => [...strip(s)].reduce((n, ch) => n + m.charWidth(ch), 0);
const s = (title, extra = {}) => ({ title, working: false, attention: false, exited: false, ...extra });
const facts = {};
facts.wants = {
  plain: m.wantsMux(["--provider", "thoth"], {}, true),
  noTty: m.wantsMux([], {}, false),
  child: m.wantsMux([], { PINK_MUX_CHILD: "1" }, true),
  optOut: m.wantsMux([], { PINK_NO_MUX: "1" }, true),
  flag: m.wantsMux(["--sem-sessoes"], {}, true),
  print: m.wantsMux(["-p", "oi"], {}, true),
  mode: m.wantsMux(["--mode=rpc"], {}, true),
  help: m.wantsMux(["--help"], {}, true),
  install: m.wantsMux(["install", "x"], {}, true),
  zero: m.wantsMux([], { PINK_NO_MUX: "0", PINK_MUX_CHILD: "0" }, true),
};
facts.later = {
  keeps: m.laterArgs(["--provider", "thoth", "--model", "thoth"]),
  drops: m.laterArgs(["-c", "--session", "abc", "--fork=x", "--provider", "thoth", "faça o login"]),
  boolean: m.laterArgs(["--offline", "faça X", "--no-tools"]),
  continued: m.laterArgs(["-c", "msg", "--thinking", "high"]),
};
facts.sub = [
  m.subcommandFirst(["--provider", "thoth", "--model", "thoth", "mcp", "list"]),
  m.subcommandFirst(["--provider", "thoth", "install", "npm:x"]),
  m.subcommandFirst(["--provider", "thoth", "--model", "thoth", "liste os arquivos"]),
  m.subcommandFirst(["--offline", "--provider", "thoth", "list"]),
  m.subcommandFirst(["mcp", "list"]),
  m.subcommandFirst(["--provider", "thoth", "-p", "list"]),
];
facts.keys = {
  mixed: m.parseKeys("ab\x1b[<0;5;3Mc\x1bn\x1b[A\x1b[<0;5;3m"),
  paste: m.parseKeys("\x1b[200~\x1b[<0;1;1M colado\x1b[201~"),
  escape: m.parseKeys("\x1b"),
};
const pasting = {};
facts.keys.split = [m.parseKeys("\x1b[200~parte 1", pasting), m.parseKeys("\x1b[<0;1;1M parte 2\x1b[201~", pasting), m.parseKeys("\x1b[<64;1;1M", pasting)];
const flow = [];
const a = s("x");
m.onSignal(a, "work", false); flow.push({ ...a });
m.onSignal(a, "idle", false); flow.push({ ...a });
const b = s("y");
m.onSignal(b, "work", true); m.onSignal(b, "idle", true); m.onSignal(b, "bell", true); flow.push({ ...b });
const c = s("z");
m.onSignal(c, "bell", false); flow.push({ ...c });
facts.flow = flow.map(({ working, attention }) => ({ working, attention }));
facts.progress = [m.progressSignal("4;3"), m.progressSignal("4;1"), m.progressSignal("4;0"), m.progressSignal("4"), m.progressSignal("1;x")];
facts.icons = [m.icon(s("a", { working: true }), 1), m.icon(s("a", { attention: true, working: true }), 0), m.icon(s("a"), 0), m.icon(s("a", { exited: true }), 0)];
facts.titles = [m.shortTitle("Pink - login - api", 0), m.shortTitle("pi - x", 1), m.shortTitle("", 2), m.shortTitle("Pink - a\x1b[2Jb\x07\x9bc", 3)];
facts.labels = [m.sessionLabel("pink - login - api", 0), m.sessionLabel("pink - api", 1), m.sessionLabel("", 2), m.sessionLabel("pink - site - V2", 3, "site - V2"), m.sessionLabel("pink - login - site - V2", 4, "site - V2")];
const many = m.sidebar({ sessions: Array.from({ length: 20 }, (_, i) => s(`pink - n${i}`)), active: 0, width: 28, rows: 12 });
facts.many = { last: strip(many.lines[10]).trim(), rows: many.lines.length, plus: m.hitAt(many.hits, 5, 10) };
facts.widthsBy = [50, 100, 140, 300].map(m.sidebarWidth);
const sessions = [s("Pink - Auditar o bot trader atual - api"), s("Pink - 日本語のセッション名 - x", { attention: true }), s("Pink - c", { working: true })];
const view = (out, clicks) => ({ rows: out.lines.length, widths: [...new Set(out.lines.map(width))], text: out.lines.map(strip), clicks: clicks.map(([x, y]) => m.hitAt(out.hits, x, y) ?? null) });
const W = m.sidebarWidth(140);
facts.side = view(m.sidebar({ sessions, active: 0, width: W, rows: 20, frame: 0 }), [[5, 2], [W - 2, 2], [5, 3], [5, 4], [5, 5], [5, 11], [3, 19]]);
facts.ask = view(m.sidebar({ sessions, active: 2, width: W, rows: 12, confirm: "Sair do Pink com 3 sessões abertas?" }), [[4, 11], [13, 11], [5, 2]]);
facts.narrow = view(m.sidebar({ sessions, active: 1, width: m.sidebarWidth(50), rows: 8 }), [[1, 3], [1, 6]]);
facts.fit = [width(m.fit("😀😀😀", 5)), m.fit("abc", 5)];
// seletor da nova sessão: sessões salvas de várias pastas num diretório temporário
const fs = await import("node:fs");
const os = await import("node:os");
const p = await import("node:path");
const root = fs.mkdtempSync(p.join(os.tmpdir(), "pinkmux-"));
try {
  const sdir = p.join(root, "sessions");
  const put = (folder, name, entries, mtime) => {
    const dir = p.join(sdir, folder);
    fs.mkdirSync(dir, { recursive: true });
    const file = p.join(dir, name);
    fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    fs.utimesSync(file, mtime, mtime);
    return file;
  };
  const projA = p.join(root, "proj-a");
  const projB = p.join(root, "proj b - V2");
  fs.mkdirSync(projA);
  fs.mkdirSync(projB);
  const fileA = put("--a--", "1_a.jsonl", [{ type: "session", version: 3, id: "a", cwd: projA }, { type: "message", message: { role: "user", content: [{ type: "text", text: "primeira\nmensagem\x1b[2J" }] } }], 1000);
  put("--b--", "2_b.jsonl", [{ type: "session", version: 3, id: "b", cwd: projB }, { type: "message", message: { role: "user", content: "oi" } }, { type: "session_info", name: "Refatorar auth" }], 2000);
  put("--c--", "3_c.jsonl", [{ type: "session", version: 3, id: "c", cwd: p.join(root, "sumiu") }], 3000);
  put("--a--", "4_sem_cabecalho.jsonl", [{ type: "message" }], 4000);
  fs.writeFileSync(p.join(sdir, "--a--", "notas.txt"), "x");
  const saved = m.listSessions(sdir);
  facts.saved = saved.map((item) => ({ name: item.name, folder: p.basename(item.cwd) }));
  facts.folders = m.recentFolders(saved, projA).map((folder) => p.basename(folder));
  const pv = m.pickerView({ folders: m.recentFolders(saved, projA), saved: saved.map((item, i) => ({ ...item, open: i === 1 })), input: "C:\\x", width: 90, rows: 20, current: projA });
  const at = (x, y) => m.hitAt(pv.hits, x, y) ?? null;
  facts.picker = { widths: [...new Set(pv.lines.map(width))], rows: pv.lines.length, text: pv.lines.map(strip), caret: pv.caret, clicks: [at(85, 0), at(5, 3), at(5, 4), at(20, 5), at(5, 9), at(85, 9), at(5, 10), at(85, 10), at(5, 11)] };
  const long = m.pickerView({ folders: [projA], saved: Array.from({ length: 40 }, (_, i) => ({ file: `f${i}`, cwd: projA, mtime: 0, name: `s${i}` })), width: 90, rows: 20, scroll: 99, current: projA });
  facts.scrolled = { scroll: long.scroll, first: strip(long.lines[8]).trim().split(/\s+/).at(-2), more: strip(long.lines[19]).trim() };
  // lixeira: só .jsonl dentro da pasta de sessões; nada é apagado nos testes
  facts.trash = [await m.trashFile(fileA, p.join(root, "outra")), await m.trashFile(p.join(sdir, "--a--", "notas.txt"), sdir), await m.trashFile(p.join(sdir, "--a--", "nao_existe.jsonl"), sdir), fs.existsSync(fileA)];
  const tiny = m.pickerView({ folders: [projA], saved: [{ file: "f", cwd: projA, mtime: 0, name: "x" }], width: 90, rows: 9, current: projA });
  facts.tiny = { rows: tiny.lines.length, more: strip(tiny.lines[8]).trim(), scroll: tiny.scroll };
  const evil = m.pickerView({ folders: [projA, "/tmp/a\x1b[2Jb"], saved: [], width: 60, rows: 12, current: projA });
  facts.evil = { widths: [...new Set(evil.lines.map(width))], clean: !evil.lines.slice(1).join("").includes("\x1b[2J") };
  const idFile = put("--b--", "2026-11-15T10-00-00-000Z_0193abcd-ef01.jsonl", [{ type: "session", version: 3, id: "0193abcd-ef01", cwd: projB }], 5000);
  const r = (argv) => { const out = m.resolveSessionArg(argv, sdir); return { argv: out.argv, cwd: out.cwd ? p.basename(out.cwd) : null }; };
  facts.resume = {
    byId: r(["--provider", "thoth", "--session", "0193abcd"]),
    file: r(["--session", idFile]).argv[1] === idFile,
    unknown: r(["--session", "ffff9999"]),
    notId: r(["--session", "../x"]),
    withDir: r(["--session", "0193abcd", "--session-dir", "D"]).argv[1],
    inline: r(["--session=0193abcd"]),
    ambiguous: (() => { put("--a--", "2026-11-15T11-00-00-000Z_0193abcd-ef99.jsonl", [{ type: "session", version: 3, id: "0193abcd-ef99", cwd: projA }], 6000); return r(["--session", "0193abcd-ef"]); })(),
    expected: idFile,
  };
  facts.sessionsDir = [m.sessionsDir({}, "H"), m.sessionsDir({ PINK_CODING_AGENT_DIR: "A" }, "H"), m.sessionsDir({ PINK_CODING_AGENT_SESSION_DIR: "S", PINK_CODING_AGENT_DIR: "A" }, "H")];
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify(facts));
"""


@pytest.fixture(scope="module")
def facts() -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    done = subprocess.run([node, "--input-type=module", "-e", DRIVER, MUX.as_uri()], capture_output=True, text=True, encoding="utf-8", timeout=60, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0, done.stderr[-600:]
    return json.loads(done.stdout)


def test_the_sidebar_opens_only_in_an_interactive_terminal_and_can_be_turned_off(facts: dict) -> None:
    assert facts["wants"] == {"plain": True, "noTty": False, "child": False, "optOut": False, "flag": False, "print": False, "mode": False, "help": False, "install": False, "zero": True}


def test_subcommands_work_after_the_launcher_options(facts: dict) -> None:
    # o lançador põe --provider/--model antes: "pink mcp list" virava mensagem para o modelo
    assert facts["sub"] == [["mcp", "list"], ["install", "npm:x"], ["--provider", "thoth", "--model", "thoth", "liste os arquivos"], ["list"], ["mcp", "list"], ["--provider", "thoth", "-p", "list"]]


def test_the_resume_command_finds_the_session_from_any_folder(facts: dict) -> None:
    res = facts["resume"]
    assert res["byId"] == {"argv": ["--provider", "thoth", "--session", res["expected"]], "cwd": "proj b - V2"}
    assert res["file"] is True
    assert res["unknown"] == {"argv": ["--session", "ffff9999"], "cwd": None}
    assert res["notId"] == {"argv": ["--session", "../x"], "cwd": None}
    assert res["withDir"] == "0193abcd"  # com --session-dir a pessoa escolheu onde procurar
    assert res["inline"] == {"argv": [f"--session={res['expected']}"], "cwd": "proj b - V2"}
    assert res["ambiguous"] == {"argv": ["--session", "0193abcd-ef"], "cwd": None}  # duas sessões casam: não escolhe ao acaso


def test_without_the_sidebar_the_flag_does_not_reach_pi(built: dict) -> None:  # noqa: F811 - fixture do pytest importada do test_f50
    """Achado do Argus: --sem-sessoes chegava ao cli.js do Pi, que recusava a opção desconhecida."""
    node = shutil.which("node")
    assert node, "node not found"
    mux = Path(built["package_dir"]) / "dist" / "mux" / "pink.mjs"
    done = subprocess.run([node, str(mux), "--sem-sessoes", "--version"], capture_output=True, text=True, encoding="utf-8", timeout=60, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0 and "Unknown option" not in done.stdout + done.stderr and done.stdout.strip(), done.stdout + done.stderr
    package = json.loads((Path(built["package_dir"]) / "package.json").read_text(encoding="utf-8"))
    # opcionais: se o node-pty não compilar (Linux sem ferramentas), o Pink instala e roda sem lateral
    assert package["optionalDependencies"] == {"node-pty": "1.1.0", "@xterm/headless": "5.5.0"} and "node-pty" not in package["dependencies"]


def test_the_package_shows_no_pi_name_logo_nor_radius_login(built: dict) -> None:  # noqa: F811 - fixture do pytest importada do test_f50
    """Owner 15/11 (card 1dfwh7kffj9): o login do ChatGPT pedia 'Conecte seu Pi', a página de sucesso tinha o logo do Pi e o /login listava Radius."""
    import re

    chunks = Path(built["package_dir"]) / "dist" / "bundle" / "chunks"
    texts = {path.name: path.read_text(encoding="utf-8") for path in chunks.glob("*.js")}
    everything = "\n".join(texts.values())
    assert 'AGENT_NAME_HINT="Pink"' in texts["openai-chatgpt.js"] and 'AGENT_NAME_HINT="Pi"' not in everything
    assert "#F09082" not in everything and everything.count('fill="#FF6EB4"') >= 6  # logo do Pi (quadrado salmão) fora de todas as páginas de login
    main = texts["chunk-MM3LKT73.js"]
    assert "radiusProvider()" not in main.split("qwenTokenPlanIndividualProvider(),", 1)[1][:200]  # fora da lista de provedores: some do /login
    assert '{name:"bug"' not in main and 'text==="/bug"' not in main  # /bug mandava relatório aos desenvolvedores do Pi
    assert not re.search(r"run /bug|/bug sends", main)  # nenhum aviso manda rodar o comando que não existe mais (achado do Argus)
    assert "another pi session" not in texts["openai-chatgpt.js"] and ".pi/mcp.json" not in everything and "pi infers" not in main
    assert 'values:["auto","gist","radius"]' not in main
    # nenhum link nem chamada de rede para o site do Pi; o /share abre o gist no GitHub
    for gone in ("pi.dev/session", "pi.dev/install", "pi.dev/changelog", "radius.pi.dev", 'CATALOG_BASE_URL="https://pi.dev"', "earendil-works/pi/releases", "Pi developers"):
        assert gone not in everything, gone
    assert "handleDementedDelves(){return;" in main and "handleArminSaysHi(){return;" in main
    assert "globalThis.__pinkMcp=" in main  # a lateral lê o estado dos MCPs
    # nenhum texto entre aspas cita o Pi (fora a classe Unicode \p{Pi} de uma biblioteca de markdown e a lista de palavras de uma de realce)
    visible = sorted({hit for name, text in texts.items() if name != "lib-4AVRLBHM.js" for hit in re.findall(r'["\'`][^"\'`\n]{0,120}\bPi\b[^"\'`\n]{0,120}["\'`]', text) if "\\p{Pi}" not in hit and ",Pi:" not in hit})
    assert visible == [], visible
    package = json.loads((Path(built["package_dir"]) / "package.json").read_text(encoding="utf-8"))
    assert not re.search(r"\bPi\b", package["description"])


def test_sessions_opened_later_do_not_continue_the_same_session_nor_repeat_the_first_message(facts: dict) -> None:
    assert facts["later"]["keeps"] == ["--provider", "thoth", "--model", "thoth"]
    assert facts["later"]["drops"] == ["--provider", "thoth"]
    assert facts["later"]["boolean"] == ["--offline", "--no-tools"]  # a mensagem depois de uma opção sem valor também fica de fora
    assert facts["later"]["continued"] == ["--thinking", "high"]


def test_clicks_drive_the_sidebar_and_every_key_goes_to_the_active_session(facts: dict) -> None:
    click = {"button": 0, "x": 5, "y": 3}
    # sem atalhos (owner: "só clicando"): alt+n e as setas vão para a sessão; só o clique sai da entrada
    assert facts["keys"]["mixed"] == [{"forward": "ab"}, {"mouse": {**click, "press": True}}, {"forward": "c\x1bn\x1b[A"}, {"mouse": {**click, "press": False}}]
    assert facts["keys"]["paste"] == [{"forward": "\x1b[200~\x1b[<0;1;1M colado\x1b[201~"}]  # texto colado nunca vira clique
    assert facts["keys"]["escape"] == [{"forward": "\x1b"}]
    # colagem longa chega em pedaços: o clique dentro dela continua texto; depois do fim da colagem volta a ser clique
    assert facts["keys"]["split"] == [[{"forward": "\x1b[200~parte 1"}], [{"forward": "\x1b[<0;1;1M parte 2\x1b[201~"}], [{"mouse": {"button": 64, "x": 1, "y": 1, "press": True}}]]


def test_a_session_that_finishes_out_of_sight_waits_for_the_person_and_the_visible_one_does_not(facts: dict) -> None:
    assert facts["flow"] == [{"working": True, "attention": False}, {"working": False, "attention": True}, {"working": False, "attention": False}, {"working": False, "attention": True}]
    assert facts["progress"] == ["work", "work", "idle", "idle", None]
    assert facts["icons"] == ["◓", "!", "·", "×"]
    assert facts["titles"] == ["login - api", "x", "Sessão 3", "a[2Jbc"]  # código de controle no título não chega ao terminal


def test_the_sidebar_looks_like_the_owners_print_and_every_item_is_clickable(facts: dict) -> None:
    side, ask, narrow = facts["side"], facts["ask"], facts["narrow"]
    assert facts["widthsBy"] == [5, 26, 28, 36]  # cerca de 20% da tela, entre 26 e 36 colunas
    assert facts["labels"][:3] == [{"name": "login", "folder": "api"}, {"name": "Sessão 2", "folder": "api"}, {"name": "Sessão 3", "folder": ""}]
    # pasta com " - " no nome (achado do Argus): a pasta conhecida não é partida
    assert facts["labels"][3:] == [{"name": "Sessão 4", "folder": "site - V2"}, {"name": "login", "folder": "site - V2"}]
    assert facts["many"] == {"last": "+ nova sessão", "rows": 12, "plus": "new"}  # mais sessões que linhas: o "+" continua visível
    assert side["rows"] == 20 and side["widths"] == [28]  # nunca passa da largura, nem com título longo ou japonês
    text = side["text"]
    # cada sessão: nome em negrito com × à direita, linha de estado embaixo, um espaço entre elas
    assert text[0].strip() == "SESSÕES" and text[2].startswith("▌ · Auditar o bot") and text[2].endswith(" × ") and text[3].rstrip() == "▌   api"
    assert text[5].startswith("  ! 日本語") and text[6].strip() == "terminou · espera você" and text[8].startswith("  ◐ Sessão 3") and text[9].strip() == "trabalhando…"
    assert text[11].strip() == "+ nova sessão" and text[-1].strip() == "sair do Pink" and not any("alt+" in line for line in text)
    assert side["clicks"] == ["select:0", "close:0", "select:0", None, "select:1", "new", "quit"]
    assert ask["rows"] == 12 and ask["widths"] == [28] and ask["text"][-1].strip() == "[ sim ]  [ não ]" and "Sair do Pink com 3 sessões abertas?" in " ".join(line.strip() for line in ask["text"])
    assert ask["clicks"] == ["yes", "no", "select:0"]  # sem altura para 2 linhas por sessão: 1 linha cada
    assert narrow["widths"] == [5] and narrow["text"][3].startswith("▌2 !") and narrow["clicks"] == ["select:1", "new"]  # terminal estreito: número e estado
    assert facts["fit"] == [5, "abc  "]


def test_the_new_session_picker_lists_folders_and_saved_sessions_from_every_folder(facts: dict) -> None:
    # da mais recente para a mais antiga; sem cabeçalho fica de fora; nome do /name vence a primeira mensagem; sem códigos de controle
    assert facts["saved"] == [{"name": "", "folder": "sumiu"}, {"name": "Refatorar auth", "folder": "proj b - V2"}, {"name": "primeira mensagem [2J", "folder": "proj-a"}]
    assert facts["folders"] == ["proj-a", "proj b - V2"]  # a atual primeiro; pasta que não existe mais fica de fora
    picker = facts["picker"]
    assert picker["widths"] == [90] and picker["rows"] == 20  # sempre a largura da área da sessão
    text = picker["text"]
    assert text[0].startswith(" Nova sessão") and text[0].rstrip().endswith("[ cancelar ]") and "(atual)" in text[3] and "proj b - V2" in text[4]
    assert text[5].startswith("   Outra pasta: C:\\x") and picker["caret"] == {"y": 5, "x": 20}
    assert "excluir" in text[9] and "Refatorar auth" in text[10] and text[10].rstrip().endswith("aberta") and "(sem mensagens)" in text[9]
    # sessão aberta agora não tem o excluir: clicar ali não faz nada
    assert picker["clicks"] == ["cancel", "folder:0", "folder:1", "input", "resume:0", "delete:0", "resume:1", None, "resume:2"]
    assert facts["scrolled"] == {"scroll": 29, "first": "s29", "more": "30-40 de 40 · role com a roda do mouse"}  # a rolagem para no fim da lista
    assert facts["trash"] == [False, False, False, True]  # fora da pasta de sessões, não .jsonl ou inexistente: recusa e não mexe
    assert facts["tiny"] == {"rows": 9, "more": "", "scroll": 0}  # tela baixa sem espaço para a lista: sem "1-0 de 1"
    assert facts["evil"] == {"widths": [60], "clean": True}  # pasta com código de controle no nome não chega ao terminal
    assert facts["sessionsDir"] == [str(Path("H") / ".pink" / "agent" / "sessions"), str(Path("A") / "sessions"), "S"]


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty)")
def test_in_a_real_terminal_two_sessions_run_side_by_side_with_status_and_a_question_before_leaving(cli: Path, fake_provider: int, tmp_path: Path) -> None:  # noqa: F811 - fixtures do pytest importadas do test_f50
    from f50_tui_probe import run_tui

    write_models(tmp_path, fake_provider)
    (tmp_path / ".pink" / "agent" / "settings.json").write_text(json.dumps({"defaultProvider": "fake", "defaultModel": "ok"}), encoding="utf-8")
    mux = cli.parent.parent / "mux" / "pink.mjs"
    def click(x: int, y: int) -> str:  # botão esquerdo apertado e solto, em SGR, coordenadas da tela (base 1)
        return f"\x1b[<0;{x};{y}M\x1b[<0;{x};{y}m"

    # uma sessão salva de outra pasta, de antes (data no futuro para ficar no topo da lista do seletor)
    old = tmp_path / "antiga"
    old.mkdir()
    (tmp_path / "outra").mkdir()
    saved = tmp_path / ".pink" / "agent" / "sessions" / "--antiga--" / "2026-11-14T10-00-00-000Z_5f0c2d4e-1111-4222-8333-944455556666.jsonl"
    saved.parent.mkdir(parents=True)
    saved.write_text(
        json.dumps({"type": "session", "version": 3, "id": "5f0c2d4e-1111-4222-8333-944455556666", "timestamp": "2026-11-14T10:00:00.000Z", "cwd": str(old)}) + "\n"
        + json.dumps({"type": "message", "id": "a1b2c3d4", "parentId": None, "timestamp": "2026-11-14T10:00:01.000Z", "message": {"role": "user", "content": [{"type": "text", "text": "conversa antiga"}], "timestamp": 1763114401000}}) + "\n",
        encoding="utf-8",
    )
    future = time.time() + 86400
    os.utime(saved, (future, future))

    # lateral de 28 colunas; seletor começa na coluna 30. Com 1 sessão o "+" está na linha 6, com 2 na 9; a 1ª sessão salva na linha 10
    steps = [
        (None, 7.0), ("\r", 5.0), ("oi pink", 1.0),
        ("\r" + click(5, 6), 2.0),  # envia e já abre o seletor enquanto a 1 trabalha
        (str(tmp_path / "outra") + "\r", 12.0),  # digita outra pasta: a sessão 2 abre nela
        ("\r", 4.0),  # aceita a confiança na pasta, se o Pi perguntar
        (click(5, 9), 2.0),  # seletor de novo
        (click(35, 10), 12.0),  # retoma a sessão salva da pasta "antiga"
        ("\r", 4.0),
        (click(5, 3), 3.0), (click(5, 36), 2.0), (click(13, 36), 2.0), ((110, 30), 4.0),
    ]
    first, home, _, picker, two, _, _, _, three, back, asking, after, resized = run_tui(mux, tmp_path, steps, columns=140, rows=36)
    joined = "\n".join
    right = lambda screen: joined(line[29:] for line in screen)  # noqa: E731 - a área da sessão, à direita da lateral
    assert first[0].startswith(" SESSÕES") and all(len(line) <= 140 for line in first) and all(line[28:29] == "│" for line in first if len(line) > 28)
    # sem .pink na pasta não há pergunta de confiança (antes vinha do ~/.agents/skills real, ancestral do tmp; card 1dfwh7kffk2)
    assert "Trust project folder?" not in joined(first) and "██████╗" in joined(home)  # o Pink da primeira sessão roda à direita da lateral
    assert "SESSÕES" not in right(home)  # a coluna de sessões do próprio Pink some: a lateral já lista
    assert "Nova sessão" in right(picker) and "(atual)" in right(picker) and "Sessões anteriores, de todas as pastas" in right(picker) and "conversa antiga" in right(picker)
    assert two[2][2] in "·!" and two[5].startswith("▌ ") and "outra" in two[6]  # a 2 abriu na pasta digitada; a 1 segue na lista
    assert three[8].startswith("▌ ") and "antiga" in three[9] and "conversa antiga" in right(three)  # a sessão salva voltou, na pasta dela
    assert back[2].startswith("▌ ") and "!" not in back[2][:5] and "pong" in joined(back)  # clique na 1 tira o "!" e mostra a resposta
    assert "Sair do Pink com 3 sessões abertas?" in " ".join(line[:28].strip() for line in asking) and "[ sim ]" in joined(asking)
    assert "Sair do Pink com" not in joined(after) and after[8][2] != " "  # clique em [ não ]: as três seguem abertas
    assert all(len(line) <= 110 for line in resized) and resized[0].startswith(" SESSÕES") and "pong" in joined(resized)


# ================================================================================================ sessoes abertas (card 1dfwh7kfyty)
OPEN_LIST_DRIVER = r"""
const m = await import(process.argv[1]);
const p = JSON.parse(process.argv[2]);
const facts = {};
facts.signal = {
  file: m.sessionFileSignal(`pink-session=${p.file1}`),
  relative: m.sessionFileSignal("pink-session=relativo.jsonl"),
  notJsonl: m.sessionFileSignal(`pink-session=${p.txt}`),
  empty: m.sessionFileSignal("pink-session="),
  progress: m.sessionFileSignal("4;1"),
  outside: m.sessionFileSignal(`pink-session=${p.outside}`),
};
const existing = new Set([p.file1, p.file2, p.folder]);
const exists = (x) => existing.has(x);
facts.list = m.readOpenList(p.list, exists);
facts.missingFile = m.readOpenList(p.absent, exists);
facts.badJson = m.readOpenList(p.bad, exists);
facts.busy = m.readOpenList(p.list, exists, () => true);  // dono (outro pid) vivo: nao reabre e nao grava
facts.dead = m.readOpenList(p.list, exists, () => false);  // dono morto: a lista volta
const fs = await import("node:fs");
fs.writeFileSync(p.ownFile, JSON.stringify({ pid: process.pid, sessions: [{ file: p.file1, cwd: p.folder }] }));
facts.own = m.readOpenList(p.ownFile, exists, () => true);  // o proprio pid nao conta como dono vivo: reabre
facts.pidAlive = { self: m.pidAlive(process.pid), gone: m.pidAlive(p.gonePid) };
facts.where = {
  env: m.openListFile({ PINK_CODING_AGENT_SESSION_DIR: p.sessions }, p.home),
  home: m.openListFile({}, p.home),
};
facts.restore = {
  plain: m.laterArgs([]).length === 0,
  provider: m.laterArgs(["--provider", "thoth"]).length === 2,
  continue: m.laterArgs(["-c"]).length === 0,  // -c vira "sem reabrir" (a regra e argv igual a laterArgs)
  message: m.laterArgs(["faça X"]).length === 0,
  session: m.laterArgs(["--session", "x"]).length === 0,
};
console.log(JSON.stringify(facts));
"""


def open_list_facts(tmp_path: Path) -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    folder, sessions = tmp_path / "pasta", tmp_path / "sessoes"
    folder.mkdir()
    sessions.mkdir()
    file1, file2, txt = sessions / "um.jsonl", sessions / "dois.jsonl", sessions / "nota.txt"
    for path in (file1, file2, txt):
        path.write_text("", encoding="utf-8")
    entries = [
        {"file": str(file1), "cwd": str(folder)},
        {"file": str(file2), "cwd": str(folder)},
        {"file": str(file1), "cwd": str(folder)},  # repetida
        {"file": str(sessions / "apagada.jsonl"), "cwd": str(folder)},  # arquivo apagado
        {"file": str(file2), "cwd": str(tmp_path / "pasta-removida")},  # pasta removida
        {"file": str(txt), "cwd": str(folder)},  # não é sessão
        {"file": "relativo.jsonl", "cwd": str(folder)},
        {"cwd": str(folder)},
        "lixo",
        None,
    ]
    outside_dir = tmp_path / "fora"
    outside_dir.mkdir()
    outside = outside_dir / "fora.jsonl"
    outside.write_text("", encoding="utf-8")
    list_file = sessions / "abertas.json"
    list_file.write_text(json.dumps({"pid": 4194301, "sessions": entries}), encoding="utf-8")  # dono que nao existe mais
    (sessions / "ruim.json").write_text("{ isto não é json", encoding="utf-8")
    paths = {"file1": str(file1), "file2": str(file2), "folder": str(folder), "txt": str(txt), "outside": str(outside), "list": str(list_file), "absent": str(sessions / "nao-existe.json"), "bad": str(sessions / "ruim.json"), "ownFile": str(sessions / "meu.json"), "gonePid": 4194301, "sessions": str(sessions), "home": str(tmp_path)}
    env = {**os.environ, "PINK_CODING_AGENT_SESSION_DIR": str(sessions)}  # nunca o ~/.pink real
    done = subprocess.run([node, "--input-type=module", "-e", OPEN_LIST_DRIVER, MUX.as_uri(), json.dumps(paths)], capture_output=True, text=True, encoding="utf-8", timeout=60, check=False, stdin=subprocess.DEVNULL, env=env)
    assert done.returncode == 0, done.stderr[-600:]
    facts = json.loads(done.stdout)
    facts["paths"] = paths
    return facts


def test_the_child_tells_the_mux_its_session_file_only_for_real_session_files(tmp_path: Path) -> None:
    facts = open_list_facts(tmp_path)
    signal, p = facts["signal"], facts["paths"]
    assert signal["file"] == p["file1"]  # arquivo .jsonl absoluto dentro de sessionsDir()
    # undefined nao vai no JSON: ausente = nao e arquivo de sessao (relativo, nao .jsonl, fora da pasta de sessoes, vazio, progresso OSC 9;4)
    assert {key: signal.get(key) for key in ("relative", "notJsonl", "outside", "empty", "progress")} == {"relative": None, "notJsonl": None, "outside": None, "empty": None, "progress": None}


def test_the_open_list_keeps_each_existing_session_once_and_drops_the_rest(tmp_path: Path) -> None:
    facts = open_list_facts(tmp_path)
    p = facts["paths"]
    # so as duas sessoes existentes, uma vez cada, com a pasta delas; repetida, apagada, pasta removida, nao-.jsonl e lixo caem
    assert facts["list"] == {"busy": False, "sessions": [{"file": p["file1"], "cwd": p["folder"]}, {"file": p["file2"], "cwd": p["folder"]}]}
    assert facts["missingFile"] == {"busy": False, "sessions": []}  # arquivo ausente: nada a reabrir, sem erro
    assert facts["badJson"] == {"busy": False, "sessions": []}  # JSON quebrado: idem
    assert facts["busy"] == {"busy": True, "sessions": []}  # dono (outro pid) vivo: este Pink nao reabre nem grava a lista
    assert facts["dead"]["busy"] is False and len(facts["dead"]["sessions"]) == 2  # dono morto: a lista volta
    assert facts["own"]["busy"] is False and len(facts["own"]["sessions"]) == 1  # a propria lista (mesmo pid) nao trava
    assert facts["pidAlive"] == {"self": True, "gone": False}


def test_the_open_list_lives_in_the_sessions_folder_of_the_agent(tmp_path: Path) -> None:
    facts = open_list_facts(tmp_path)
    p = facts["paths"]
    assert facts["where"]["env"] == str(Path(p["sessions"]) / "abertas.json")  # PINK_CODING_AGENT_SESSION_DIR
    assert facts["where"]["home"] == str(Path(p["home"]) / ".pink" / "agent" / "sessions" / "abertas.json")  # padrao: dentro do HOME dado


def test_only_a_plain_start_reopens_the_list(tmp_path: Path) -> None:
    """Criterio (3): pink -c, --session e a mensagem inicial nao restauram nada."""
    restore = open_list_facts(tmp_path)["restore"]
    assert restore == {"plain": True, "provider": True, "continue": True, "message": True, "session": True}  # -c, mensagem e --session: laterArgs zera (nada reabre)


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty)")
def test_closed_sessions_leave_the_list_and_the_next_plain_start_reopens_only_the_rest(cli: Path, tmp_path: Path) -> None:
    """Card 1dfwh7kfyty, criterios 1-2 de ponta a ponta: o filho e falso (PINK_MUX_CLI), a lista fica num diretorio temporario."""
    from f50_tui_probe import run_tui

    mux = cli.parent.parent / "mux" / "pink.mjs"
    fake = ROOT / "tests" / "pink_mux_fake_child.mjs"
    sessions, log = tmp_path / "sessoes", tmp_path / "filho.log"
    sessions.mkdir()
    folders = {name: tmp_path / name for name in ("pasta-a", "pasta-b", "pasta-c")}
    for folder in folders.values():
        folder.mkdir()
    files = {name: sessions / f"{name}.jsonl" for name in ("a", "b", "fechar")}
    for path in files.values():
        path.write_text("", encoding="utf-8")
    entries = [
        {"file": str(files["a"]), "cwd": str(folders["pasta-a"])},
        {"file": str(files["b"]), "cwd": str(folders["pasta-b"])},
        {"file": str(files["fechar"]), "cwd": str(folders["pasta-c"])},  # o filho sai sozinho, como uma sessao fechada no x
        {"file": str(sessions / "apagada.jsonl"), "cwd": str(folders["pasta-c"])},  # apagada: nao reabre
        {"file": str(files["b"]), "cwd": str(tmp_path / "pasta-removida")},  # pasta removida: nao reabre
    ]
    (sessions / "abertas.json").write_text(json.dumps({"pid": 4194301, "sessions": entries}), encoding="utf-8")  # dono que nao existe mais
    extra = {"PINK_CODING_AGENT_SESSION_DIR": str(sessions), "PINK_MUX_CLI": str(fake), "PINK_FAKE_LOG": str(log)}

    def reopened() -> list[str]:  # so as sessoes reabertas (as pastas de teste); a sessao nova da pasta atual nao entra
        rows = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()] if log.exists() else []
        return [Path(row["cwd"]).name for row in rows if Path(row["cwd"]).name.startswith("pasta-")]

    run_tui(mux, tmp_path, [(None, 7.0)], extra_env=extra, columns=120, rows=30)
    assert reopened() == ["pasta-a", "pasta-b", "pasta-c"]  # cada uma na sua pasta
    saved = json.loads((sessions / "abertas.json").read_text(encoding="utf-8"))["sessions"]
    assert [Path(item["file"]).name for item in saved] == ["a.jsonl", "b.jsonl"]  # a que fechou saiu da lista

    log.unlink(missing_ok=True)
    run_tui(mux, tmp_path, [(None, 7.0)], extra_env=extra, columns=120, rows=30)
    assert reopened() == ["pasta-a", "pasta-b"]  # o proximo Pink reabre so as duas


def run_mux_with_list(tmp_path: Path, cli: Path, entries: list[dict], args: list[str]) -> tuple[list[dict], bytes, bytes]:
    """Roda o mux instalado com um abertas.json valido (dono morto), o filho falso e os argumentos dados.
    Devolve (o que o filho recebeu, o abertas.json antes, o abertas.json depois). O projeto e tmp_path/work."""
    from f50_tui_probe import run_tui

    mux = cli.parent.parent / "mux" / "pink.mjs"
    fake = ROOT / "tests" / "pink_mux_fake_child.mjs"
    sessions, log = tmp_path / "sessoes", tmp_path / "filho.log"
    sessions.mkdir(exist_ok=True)
    list_file = sessions / "abertas.json"
    list_file.write_text(json.dumps({"pid": 4194301, "sessions": entries}), encoding="utf-8")
    before = list_file.read_bytes()
    extra = {"PINK_CODING_AGENT_SESSION_DIR": str(sessions), "PINK_MUX_CLI": str(fake), "PINK_FAKE_LOG": str(log)}
    run_tui(mux, tmp_path, [(None, 7.0)], extra_env=extra, columns=120, rows=30, args=args)
    rows = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()] if log.exists() else []
    return rows, before, list_file.read_bytes()


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty)")
def test_continue_and_a_typed_message_do_not_reopen_the_list_nor_rewrite_it(cli: Path, tmp_path: Path) -> None:
    """Card 1dfwh7kfyty, criterio (3) de ponta a ponta: pink -c e pink "mensagem" nao reabrem as da lista e nao regravam o arquivo."""
    for name, args in (("continua", ["-c"]), ("mensagem", ["oi pink"])):
        home = tmp_path / name  # cada caso tem a sua casa, com as suas pastas e o seu abertas.json
        sessions = home / "sessoes"
        sessions.mkdir(parents=True)
        files = {n: sessions / f"{n}.jsonl" for n in ("a", "b")}
        for path in files.values():
            path.write_text("", encoding="utf-8")
        folders = {n: home / f"pasta-{n}" for n in ("a", "b")}
        for folder in folders.values():
            folder.mkdir()
        entries = [{"file": str(files[n]), "cwd": str(folders[n])} for n in ("a", "b")]
        rows, before, after = run_mux_with_list(home, cli, entries, args)
        assert [row["args"] for row in rows] == [args]  # so a sessao pedida; nenhuma das da lista
        assert all("--session" not in row["args"] for row in rows)
        assert after == before  # a lista nao foi regravada


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty)")
def test_a_session_in_the_current_folder_opens_only_when_no_reopened_one_is_there(cli: Path, tmp_path: Path) -> None:
    """Card 1dfwh7kfyty, criterio (iii) de ponta a ponta: o projeto e tmp_path/work (pasta atual do Pink)."""
    # nenhuma reaberta e da pasta atual (home/work): abre tambem uma sessao nova nela, sem --session
    home = tmp_path / "sem-aqui"
    sessions = home / "sessoes"
    sessions.mkdir(parents=True)
    session = sessions / "a.jsonl"
    session.write_text("", encoding="utf-8")
    folder = home / "pasta-a"
    folder.mkdir()
    rows, _, _ = run_mux_with_list(home, cli, [{"file": str(session), "cwd": str(folder)}], [])
    assert [Path(row["cwd"]).name for row in rows] == ["pasta-a", "work"]  # a reaberta, e depois a sessao nova na pasta atual
    assert rows[1]["args"] == []  # a da pasta atual nao recebe --session: e uma sessao nova

    # uma reaberta ja e da pasta atual: fica nela e nao abre outra
    home = tmp_path / "com-aqui"
    sessions = home / "sessoes"
    sessions.mkdir(parents=True)
    here_session = sessions / "aqui.jsonl"
    here_session.write_text("", encoding="utf-8")
    folder = home / "pasta-a"
    folder.mkdir()
    rows, _, _ = run_mux_with_list(home, cli, [{"file": str(here_session), "cwd": str(home / "work")}, {"file": str(sessions / "a.jsonl"), "cwd": str(folder)}], [])
    assert [Path(row["cwd"]).name for row in rows] == ["work"]  # so a reaberta da pasta atual; a pasta-a (sem arquivo) nao abre
    assert rows[0]["args"] == ["--session", str(here_session)]


# ================================================================================================ estado do programa (card 1dfwh7kfyyg)
STATUS_DRIVER = r"""
const m = await import(process.argv[1]);
const b64 = (text) => Buffer.from(text, "utf8").toString("base64");
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const facts = {};
facts.parse = {
  question: m.parseProgramStatus(`state=blocked:app=pink:kind=question:msg=${b64("Publicar agora?")}`),
  permission: m.parseProgramStatus(`state=blocked:app=pink:kind=permission:msg=${b64("Executar rm?")}`),
  working: m.parseProgramStatus("state=working:app=pink"),
  error: m.parseProgramStatus(`state=error:app=pink:msg=${b64("falhou\nao ler")}`),
  unknown: m.parseProgramStatus("state=talvez:app=pink"),
  query: m.parseProgramStatus("?"),
  noState: m.parseProgramStatus("app=pink:kind=question"),
  badMsg: m.parseProgramStatus("state=done:app=pink:msg=%%%"),
  clear: m.parseProgramStatus("state=clear"),
};
const session = (extra) => ({ title: "pink - demo", working: false, attention: false, exited: false, ...extra });
facts.icon = {
  blocked: m.icon(session({ working: true, program: { state: "blocked" } }), 1),  // bloqueada nao gira, mesmo com progresso aberto
  working: m.icon(session({ working: true }), 1),
  attention: m.icon(session({ attention: true }), 0),
  error: m.icon(session({ program: { state: "error" } }), 0),
  exited: m.icon(session({ exited: true, program: { state: "blocked" } }), 0),
  idle: m.icon(session({}), 0),
};
const lines = (extra, active = 0, sessions = [session(extra)]) => m.sidebar({ sessions, active, width: 36, rows: 14 }).lines.map(strip);
const row = (screen, text) => screen.find((line) => line.includes(text)) ?? "";
facts.sidebar = {
  question: row(lines({ program: { state: "blocked", kind: "question" } }), "pergunta"),
  permission: row(lines({ program: { state: "blocked", kind: "permission" } }), "pede permissão"),
  error: row(lines({ program: { state: "error" } }), "parou com erro"),
  done: row(lines({ attention: true }, 1, [session({ attention: true }), session({})]), "terminou"),
  working: row(lines({ working: true }), "trabalhando"),
  blockedMark: row(lines({ program: { state: "blocked", kind: "question" } }), " ? "),
};
facts.priority = {  // blocked e error vencem o "terminou" (attention) no icone e no texto
  blockedOverAttention: m.icon(session({ attention: true, program: { state: "blocked" } }), 0),
  errorOverAttention: m.icon(session({ attention: true, program: { state: "error" } }), 0),
  blockedStatusOverAttention: row(lines({ attention: true, program: { state: "blocked", kind: "question" } }), "pergunta"),
  errorStatusOverAttention: row(lines({ attention: true, program: { state: "error" } }), "parou com erro"),
};
console.log(JSON.stringify(facts));
"""


@pytest.fixture(scope="module")
def status_facts() -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    done = subprocess.run([node, "--input-type=module", "-e", STATUS_DRIVER, MUX.as_uri()], capture_output=True, text=True, encoding="utf-8", timeout=60, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0, done.stderr[-600:]
    return json.loads(done.stdout)


def test_the_program_status_reads_each_state_and_ignores_the_rest(status_facts: dict) -> None:
    parse = status_facts["parse"]
    assert parse["question"] == {"state": "blocked", "kind": "question", "message": "Publicar agora?"}
    assert parse["permission"] == {"state": "blocked", "kind": "permission", "message": "Executar rm?"}
    assert parse["working"] == {"state": "working", "message": ""}  # sem kind (undefined some no JSON)
    assert parse["error"]["state"] == "error" and parse["error"]["message"] == "falhou ao ler"  # a quebra de linha da msg vira espaco
    assert parse.get("unknown") is None and parse.get("query") is None and parse.get("noState") is None  # "?" e estado desconhecido: undefined (some no JSON)
    assert parse["badMsg"] == {"state": "done", "message": ""}  # msg invalida: o estado fica, o texto vazio
    assert parse["clear"] == {"state": "clear"}  # state=clear devolve o estado; o handler zera session.program


def test_the_priorities_blocked_and_error_win_over_attention(status_facts: dict) -> None:
    pr = status_facts["priority"]
    assert pr["blockedOverAttention"] == "?" and pr["errorOverAttention"] == "!"  # o icone: a pergunta vence o "terminou"
    assert "pergunta · espera você" in pr["blockedStatusOverAttention"] and "terminou" not in pr["blockedStatusOverAttention"]
    assert "parou com erro" in pr["errorStatusOverAttention"] and "terminou" not in pr["errorStatusOverAttention"]


def test_a_blocked_session_shows_a_question_mark_and_never_spins(status_facts: dict) -> None:
    icon = status_facts["icon"]
    assert icon["blocked"] == "?"  # criterio (a): nao gira mesmo com o progresso aberto
    assert icon["attention"] == "!" and icon["error"] == "!" and icon["exited"] == "×" and icon["idle"] == "·"
    assert icon["working"] in "◐◓◑◒"  # criterio (b): trabalhando gira


def test_the_sidebar_says_what_each_state_waits_for_without_colors(status_facts: dict) -> None:
    side = status_facts["sidebar"]
    assert "pergunta · espera você" in side["question"]  # criterio (a)
    assert "pede permissão · espera você" in side["permission"]  # criterio (a)
    assert "parou com erro" in side["error"]  # criterio (c)
    assert "terminou · espera você" in side["done"]  # criterio (b): terminou fora da tela
    assert "trabalhando…" in side["working"]  # criterio (b)
    assert " ? " in side["blockedMark"]  # a marca da bloqueada e "?"


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty)")
@pytest.mark.parametrize(
    ("payload", "expected", "mark"),
    [
        ("state=blocked:app=pink:kind=question:msg=UHVibGljYXIgYWdvcmE/", "pergunta · espera você", "? Sessão 1"),
        ("state=blocked:app=pink:kind=permission:msg=RXhlY3V0YXIgcm0/", "pede permissão · espera você", "? Sessão 1"),
        ("state=error:app=pink", "parou com erro", "! Sessão 1"),
    ],
)
def test_the_program_status_reaches_the_sidebar_of_the_installed_mux(cli: Path, tmp_path: Path, payload: str, expected: str, mark: str) -> None:
    """Card 1dfwh7kfyyg, criterios (a) e (c) de ponta a ponta: o filho falso emite OSC 7501 e a lateral do mux mostra o estado."""
    from f50_tui_probe import run_tui

    mux = cli.parent.parent / "mux" / "pink.mjs"
    fake = ROOT / "tests" / "pink_mux_fake_child.mjs"
    extra = {"PINK_CODING_AGENT_SESSION_DIR": str(tmp_path / "sessoes"), "PINK_MUX_CLI": str(fake), "PINK_FAKE_LOG": str(tmp_path / "filho.log"), "PINK_FAKE_OSC": json.dumps([payload])}
    screens = run_tui(mux, tmp_path, [(None, 7.0)], extra_env=extra, columns=160, rows=30)
    side = [line[:32] for line in screens[0]]  # a lateral tem 32 colunas neste terminal
    text = "\n".join(side)
    assert expected in text
    assert any(mark in line for line in side)  # a marca da sessao: ? (bloqueada) ou ! (erro), sem giro


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty)")
def test_a_working_child_shows_the_spinner_and_trabalhando(cli: Path, tmp_path: Path) -> None:
    """Card 1dfwh7kfyyg, criterio (b) de ponta a ponta: OSC 7501 working deve girar e mostrar 'trabalhando…'."""
    from f50_tui_probe import run_tui

    mux = cli.parent.parent / "mux" / "pink.mjs"
    fake = ROOT / "tests" / "pink_mux_fake_child.mjs"
    extra = {"PINK_CODING_AGENT_SESSION_DIR": str(tmp_path / "sessoes"), "PINK_MUX_CLI": str(fake), "PINK_FAKE_LOG": str(tmp_path / "filho.log"), "PINK_FAKE_OSC": json.dumps(["state=working:app=pink"])}
    screens = run_tui(mux, tmp_path, [(None, 7.0)], extra_env=extra, columns=160, rows=30)
    text = "\n".join(line[:32] for line in screens[0])
    assert "trabalhando…" in text
    assert any(ch in text for ch in "◐◓◑◒")
