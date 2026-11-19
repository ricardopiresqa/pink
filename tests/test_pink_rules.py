# ruff: noqa: E501
"""Card 1dfwh7kfzxv - regras por tipo de arquivo (extensions/pink-rules.ts), do pacote construido.

Driver node (ESM, só módulos embutidos). Globs (inclusive os inválidos), leitura do frontmatter, resultado do
read/write/edit, arquivos fora do projeto, pastas de regras reais em diretórios temporários (PINK_CODING_AGENT_DIR
apontando para uma pasta temporária, nunca ~/.pink), confiança da pasta, link simbólico e o /regras. Sem modelo, sem rede.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "tests")]

from test_f50 import built, cli, package_dir  # noqa: E402, F401 - fixtures do pacote construido e instalado

KEEP = ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432")

DRIVER = r"""
const [rulesUrl, cwd, trustedArg] = process.argv.slice(1);
const R = await import(rulesUrl);
const path = await import("node:path");
const trusted = trustedArg === "1";
const out = {};
const rule = (over = {}) => ({ id: "x", file: "/a/r.md", origin: "pessoa", globs: ["*.ts"], description: "", body: "Regra TS", tooBig: false, ...over });
const fake = (rules) => () => ({ rules, invalid: [] });
const ev = (toolName, input, extra = {}) => ({ toolName, input, content: [{ type: "text", text: "ok" }], ...extra });
const notes = [];
const ctxObj = { cwd, isProjectTrusted: () => trusted, ui: { notify: (t) => notes.push(t) } };

// ---- glob
const m = (globs, rel) => R.matches(globs, rel);
out.glob = {
  deepTs: m(["**/*.ts"], "src/a/b.ts"),
  rootTs: m(["**/*.ts"], "a.ts"),
  basenameMd: m(["*.md"], "docs/x.md"),
  basenameMdNo: m(["*.md"], "docs/x.txt"),
  srcStar: m(["src/*.ts"], "src/a.ts"),
  srcStarDeep: m(["src/*.ts"], "src/x/a.ts"),
  question: m(["?.ts"], "a.ts"),
  questionNo: m(["?.ts"], "ab.ts"),
  braces: [m(["{a,b}.md"], "a.md"), m(["{a,b}.md"], "b.md"), m(["{a,b}.md"], "c.md")],
  braceExt: m(["*.{ts,tsx}"], "x.tsx"),
  caseInsensitive: m(["*.TS"], "a.ts"),
  backslash: m(["src/*.ts"], "src\\a.ts"),
  dotSlash: m(["./src/*.ts"], "src/a.ts"),
  leadingSlash: m(["/src/*.ts"], "src/a.ts"),
  anyDepthBasename: m(["*.md"], "a/b/c/readme.md"),
  repeatedDoubleStar: m(["**/**/*.ts"], "a/b.ts"),
  eightStars: R.validGlobs(["*a*a*a*a*a*a*a*a"]),
  nineStars: R.validGlobs(["*a*a*a*a*a*a*a*a*a"]),
  unclosedBrace: R.validGlobs(["{a"]),
  longGlob: R.validGlobs(["a".repeat(201)]),
  validPlain: R.validGlobs(["src/**/*.ts", "{a,b}.md"]),
  badGlobMatchesNothing: m(["{a"], "a"),
};

// ---- parseRule
const P = (t) => R.parseRule(t);
out.parse = {
  commaList: P("---\nglobs: *.ts, src/**\n---\nbody").globs,
  bracketList: P("---\nglobs: [*.ts, *.tsx]\n---\nb").globs,
  dashLines: P("---\npaths:\n  - src/**\n  - *.md\n---\nb").globs,
  bom: P("﻿---\nglobs: *.ts\n---\nbody").globs,
  crlf: P("---\r\nglobs: *.ts\r\ndescription: Oi\r\n---\r\nbody\r\n"),
  bracesKept: P("---\nglobs: *.{ts,tsx}\n---\nb").globs,
  quoted: P("---\nglobs: \"*.ts\"\n---\nb").globs,
  noGlobs: P("---\ndescription: x\n---\nb") ?? null,
  noFrontmatter: P("so texto") ?? null,
  emptyBody: P("---\nglobs: *.ts\n---\n")?.body ?? null,
};

// ---- onResult com carregador falso
const fresh = (rules) => R.createRules({ load: fake(rules) });
{
  const cr = fresh([rule()]);
  const r = cr.onResult(ev("read", { path: "src/a.ts" }, { structuredContent: { a: 1 } }), ctxObj);
  out.on = {
    first: r ? r.content.at(-1).text : null,
    firstCount: r ? r.content.length : null,
    structured: r ? r.structuredContent : null,
    again: cr.onResult(ev("read", { path: "src/a.ts" }), ctxObj) ?? null,
  };
  cr.reset();
  out.on.afterReset = !!cr.onResult(ev("write", { path: "src/a.ts" }), ctxObj);
}
{
  const cr = fresh([rule()]);
  out.on.isError = cr.onResult(ev("read", { path: "src/a.ts" }, { isError: true }), ctxObj) ?? null;
  out.on.bash = cr.onResult(ev("bash", { command: "cat src/a.ts" }), ctxObj) ?? null;
  out.on.grep = cr.onResult(ev("grep", { path: "src/a.ts" }), ctxObj) ?? null;
  out.on.editFilePath = !!cr.onResult(ev("edit", { file_path: "src/a.ts" }), ctxObj);
  out.on.noMatch = cr.onResult(ev("read", { path: "a.md" }), ctxObj) ?? null;
}
{
  out.on.tooBig = fresh([rule({ tooBig: true, body: "" })]).onResult(ev("read", { path: "src/a.ts" }), ctxObj) ?? null;
  out.on.noBody = fresh([rule({ body: "" })]).onResult(ev("read", { path: "src/a.ts" }), ctxObj) ?? null;
}
{
  // glob torto não derruba o resultado da ferramenta
  let threw = false;
  let got = null;
  try { got = fresh([rule({ globs: ["{a"] }), rule({ id: "y", globs: ["*.ts"], body: "outra" })]).onResult(ev("read", { path: "src/a.ts" }), ctxObj); } catch { threw = true; }
  out.on.braceThrows = threw;
  out.on.braceOtherRuleStillShown = got ? got.content.at(-1).text : null;
}
{
  // fora do projeto: nada entra, nem caminho relativo com .. nem absoluto
  const cr = fresh([rule({ globs: ["*.md"], body: "md" })]);
  out.on.outsideRel = cr.onResult(ev("read", { path: "../x.md" }), ctxObj) ?? null;
  out.on.outsideAbs = cr.onResult(ev("read", { path: path.resolve(cwd, "..", "x.md") }), ctxObj) ?? null;
  out.on.dotDotNameInside = !!cr.onResult(ev("read", { path: "..foo.md" }), ctxObj);
}

// ---- pastas reais (PINK_CODING_AGENT_DIR e <cwd>/.pink/rules)
const sumRule = (r) => ({ origin: r.origin, globs: r.globs, tooBig: r.tooBig, body: r.body, description: r.description, base: r.file.split(/[\\/]/).pop() });
const loaded = R.loadRules(cwd, trusted);
out.loaded = { rules: loaded.rules.map(sumRule).sort((a, b) => a.base.localeCompare(b.base)), invalid: loaded.invalid.map((f) => f.split(/[\\/]/).pop()).sort() };

// /regras e sessão, com as pastas reais
const cr = R.createRules();
out.listBefore = cr.list(ctxObj);
const seen = cr.onResult(ev("read", { path: "src/a.ts" }), ctxObj);
out.seenFirst = seen ? seen.content.at(-1).text : null;
out.seenAgain = cr.onResult(ev("read", { path: "src/a.ts" }), ctxObj) ?? null;
out.listAfter = cr.list(ctxObj);

// ---- registro e reentrada em session_start / session_compact / session_tree
{
  const handlers = {};
  const cmds = {};
  const pi = { on: (e, h) => { handlers[e] = h; }, registerCommand: (n, o) => { cmds[n] = o; } };
  R.default(pi);
  out.registered = { events: Object.keys(handlers).sort(), commands: Object.keys(cmds) };
  const readSrc = () => handlers.tool_result(ev("read", { path: "src/a.ts" }), ctxObj);
  const firstRes = await readSrc();
  const againRes = await readSrc();
  out.exp = { first: !!firstRes, again: againRes ?? null, resets: {} };
  for (const name of ["session_start", "session_compact", "session_tree"]) {
    await handlers[name]({}, ctxObj);
    out.exp.resets[name] = !!(await readSrc());
  }
  await cmds.regras.handler("", ctxObj);
  out.regrasNotify = notes.at(-1) ?? null;
}
console.log(JSON.stringify(out));
"""


def _env(home: Path) -> dict:
    env = {k: v for k, v in os.environ.items() if k.upper() in KEEP}
    env.update(HOME=str(home), USERPROFILE=str(home), PINK_CODING_AGENT_DIR=str(home / "agent"))
    return env


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")


@pytest.fixture(scope="module")
def tree(tmp_path_factory: pytest.TempPathFactory) -> Path:
    home = tmp_path_factory.mktemp("rules-home")
    agent = home / "agent"
    project = home / "projeto"
    _write(agent / "rules" / "pessoa-ts.md", "---\nglobs: **/*.ts\ndescription: TS pessoal\n---\nUse tipos estritos.\n")
    _write(agent / "rules" / "sem-globs.md", "---\ndescription: sem globs\n---\ncorpo\n")
    _write(agent / "rules" / "chave-aberta.md", "---\nglobs: {a\n---\ncorpo\n")
    _write(agent / "rules" / "muitos-asteriscos.md", "---\nglobs: *a*a*a*a*a*a*a*a*a\n---\ncorpo\n")
    _write(agent / "rules" / "grande.md", "---\nglobs: *.big\n---\n" + "x" * 17000)
    _write(agent / "rules" / "ignorada.txt", "---\nglobs: *.ts\n---\nnao e md\n")
    _write(project / ".pink" / "rules" / "projeto-md.md", "---\nglobs: /*.md\n---\nRegra do projeto.\n")
    _write(project / ".pink" / "rules" / "sem-frontmatter.md", "texto solto, sem frontmatter\n")
    _write(home / "fora.md", "---\nglobs: *.md\n---\nRegra de fora do projeto.\n")
    try:
        os.symlink(home / "fora.md", project / ".pink" / "rules" / "link-fora.md")
        symlink = True
    except OSError:
        symlink = False  # Windows sem permissão de link simbólico
    (home / "symlink.flag").write_text("1" if symlink else "0", encoding="utf-8")
    return home


def _run(home: Path, trusted: bool, package: Path) -> dict:
    rules_url = (package / "extensions" / "pink-rules.ts").as_uri()
    cwd = str(home / "projeto")
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", DRIVER, rules_url, cwd, "1" if trusted else "0"],
        capture_output=True, text=True, encoding="utf-8", env=_env(home), timeout=180,
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    return json.loads(proc.stdout.strip().splitlines()[-1])


@pytest.fixture(scope="module")
def trusted_out(tree: Path, package_dir: Path) -> dict:
    return _run(tree, True, package_dir)


@pytest.fixture(scope="module")
def untrusted_out(tree: Path, package_dir: Path) -> dict:
    return _run(tree, False, package_dir)


# ================================================================================================ globs
def test_double_star_matches_any_depth_including_the_root(trusted_out: dict) -> None:
    g = trusted_out["glob"]
    assert g["deepTs"] is True and g["rootTs"] is True and g["repeatedDoubleStar"] is True


def test_a_pattern_without_slash_matches_the_basename_in_any_folder(trusted_out: dict) -> None:
    g = trusted_out["glob"]
    assert g["basenameMd"] is True and g["basenameMdNo"] is False and g["anyDepthBasename"] is True


def test_single_star_does_not_cross_a_slash(trusted_out: dict) -> None:
    g = trusted_out["glob"]
    assert g["srcStar"] is True and g["srcStarDeep"] is False


def test_question_mark_matches_one_character(trusted_out: dict) -> None:
    g = trusted_out["glob"]
    assert g["question"] is True and g["questionNo"] is False


def test_braces_and_comma_alternatives(trusted_out: dict) -> None:
    g = trusted_out["glob"]
    assert g["braces"] == [True, True, False] and g["braceExt"] is True


def test_matching_is_case_insensitive_and_takes_windows_backslashes(trusted_out: dict) -> None:
    g = trusted_out["glob"]
    assert g["caseInsensitive"] is True and g["backslash"] is True and g["dotSlash"] is True


def test_a_leading_slash_or_dot_slash_is_stripped_from_the_glob(trusted_out: dict) -> None:
    assert trusted_out["glob"]["leadingSlash"] is True


def test_invalid_globs_are_detected_and_never_match(trusted_out: dict) -> None:
    g = trusted_out["glob"]
    assert g["eightStars"] is True and g["nineStars"] is False  # limite de 8 asteriscos
    assert g["unclosedBrace"] is False and g["longGlob"] is False  # chave aberta; mais de 200 caracteres
    assert g["validPlain"] is True and g["badGlobMatchesNothing"] is False


# ================================================================================================ frontmatter
def test_globs_as_a_comma_list_a_bracket_list_or_dash_lines(trusted_out: dict) -> None:
    p = trusted_out["parse"]
    assert p["commaList"] == ["*.ts", "src/**"]
    assert p["bracketList"] == ["*.ts", "*.tsx"]
    assert p["dashLines"] == ["src/**", "*.md"]
    assert p["quoted"] == ["*.ts"]


def test_a_brace_with_a_comma_is_one_glob(trusted_out: dict) -> None:
    assert trusted_out["parse"]["bracesKept"] == ["*.{ts,tsx}"]


def test_bom_and_crlf_are_accepted(trusted_out: dict) -> None:
    p = trusted_out["parse"]
    assert p["bom"] == ["*.ts"]
    assert p["crlf"] == {"globs": ["*.ts"], "description": "Oi", "body": "body"}


def test_a_rule_without_globs_or_frontmatter_is_not_a_rule(trusted_out: dict) -> None:
    p = trusted_out["parse"]
    assert p["noGlobs"] is None and p["noFrontmatter"] is None
    assert p["emptyBody"] == ""


# ================================================================================================ onResult
def test_a_matching_read_adds_the_rule_once_and_keeps_structured_content(trusted_out: dict) -> None:
    o = trusted_out["on"]
    assert o["first"].startswith("Regra (pessoa, ") and o["first"].endswith(") para *.ts; vale para os arquivos que casam com isso:\nRegra TS")
    assert o["firstCount"] == 2 and o["structured"] == {"a": 1}  # o conteúdo original fica; a regra é um item a mais
    assert o["again"] is None  # uma vez por sessão


def test_reset_shows_the_rule_again_and_write_or_edit_count_as_well(trusted_out: dict) -> None:
    o = trusted_out["on"]
    assert o["afterReset"] is True and o["editFilePath"] is True


def test_errors_other_tools_and_non_matching_files_add_nothing(trusted_out: dict) -> None:
    o = trusted_out["on"]
    assert o["isError"] is None and o["bash"] is None and o["grep"] is None and o["noMatch"] is None


def test_a_rule_too_big_or_without_body_adds_nothing(trusted_out: dict) -> None:
    o = trusted_out["on"]
    assert o["tooBig"] is None and o["noBody"] is None


def test_a_malformed_glob_does_not_break_the_tool_result_or_the_other_rules(trusted_out: dict) -> None:
    o = trusted_out["on"]
    assert o["braceThrows"] is False
    assert o["braceOtherRuleStillShown"] and o["braceOtherRuleStillShown"].endswith("\noutra")  # a outra regra do mesmo arquivo continua


def test_files_outside_the_project_get_no_rule(trusted_out: dict) -> None:
    o = trusted_out["on"]
    assert o["outsideRel"] is None and o["outsideAbs"] is None  # ../x.md e caminho absoluto de fora
    assert o["dotDotNameInside"] is True  # "..foo.md" está dentro do projeto e entra


# ================================================================================================ pastas reais
def test_user_rules_load_in_any_folder_and_the_big_one_is_flagged(trusted_out: dict, untrusted_out: dict) -> None:
    for run in (trusted_out, untrusted_out):
        pessoa = {r["base"]: r for r in run["loaded"]["rules"] if r["origin"] == "pessoa"}
        assert set(pessoa) == {"pessoa-ts.md", "grande.md"}
        assert pessoa["pessoa-ts.md"]["globs"] == ["**/*.ts"] and pessoa["pessoa-ts.md"]["description"] == "TS pessoal"
        assert pessoa["grande.md"]["tooBig"] is True and pessoa["grande.md"]["body"] == ""


def test_project_rules_load_only_in_a_trusted_folder(trusted_out: dict, untrusted_out: dict) -> None:
    assert [r["base"] for r in trusted_out["loaded"]["rules"] if r["origin"] == "projeto"] == ["projeto-md.md"]
    assert not [r for r in untrusted_out["loaded"]["rules"] if r["origin"] == "projeto"]


def test_invalid_files_are_reported_and_non_md_is_ignored(trusted_out: dict) -> None:
    inv = trusted_out["loaded"]["invalid"]
    assert {"sem-globs.md", "chave-aberta.md", "muitos-asteriscos.md", "sem-frontmatter.md"} <= set(inv)
    assert "ignorada.txt" not in inv and "ignorada.txt" not in [r["base"] for r in trusted_out["loaded"]["rules"]]


def test_a_project_rule_that_is_a_symlink_out_of_the_project_is_invalid(trusted_out: dict, tree: Path) -> None:
    if (tree / "symlink.flag").read_text(encoding="utf-8") != "1":
        pytest.skip("sem permissão para criar link simbólico neste Windows")
    assert "link-fora.md" in trusted_out["loaded"]["invalid"]
    assert "link-fora.md" not in [r["base"] for r in trusted_out["loaded"]["rules"]]


# ================================================================================================ /regras e sessão
def test_regras_lists_globs_origin_and_state(trusted_out: dict) -> None:
    before = trusted_out["listBefore"]
    assert "**/*.ts · pessoa · espera um arquivo que case · TS pessoal" in before
    assert "grande demais" in before and "sem globs/paths, glob inválido ou fora do projeto" in before
    after = trusted_out["listAfter"]
    assert "**/*.ts · pessoa · já no contexto · TS pessoal" in after
    assert "/*.md · projeto · espera um arquivo que case" in after


def test_untrusted_folder_is_warned_and_project_rules_are_left_out(untrusted_out: dict) -> None:
    text = untrusted_out["listAfter"]
    assert "Pasta não confiável: as regras do projeto (.pink/rules) ficam de fora." in text
    assert "projeto-md.md" not in text and "· projeto ·" not in text


def test_trusted_folder_has_no_warning(trusted_out: dict) -> None:
    assert "Pasta não confiável" not in trusted_out["listAfter"]


def test_the_default_export_registers_the_three_session_events_and_regras(trusted_out: dict) -> None:
    r = trusted_out["registered"]
    assert r["events"] == ["session_compact", "session_start", "session_tree", "tool_result"]
    assert r["commands"] == ["regras"]


def test_session_start_compact_and_tree_show_the_rule_again(trusted_out: dict) -> None:
    e = trusted_out["exp"]
    assert e["first"] is True and e["again"] is None
    assert e["resets"] == {"session_start": True, "session_compact": True, "session_tree": True}


def test_regras_command_notifies_the_listing(trusted_out: dict) -> None:
    assert trusted_out["regrasNotify"] and trusted_out["regrasNotify"].startswith("Regras por tipo de arquivo:")
