# ruff: noqa: E501
"""Card 1dfwh7kfzff - skills por /nome (extensions/pink-skills.ts), do pacote construido.

A base do Pi ja le SKILL.md (usuario e projeto confiavel) e poe as skills no prompt; a extensao so reescreve /nome para
/skill:nome e lista com /skills. Os helpers puros (skillsOf, rewrite) e o handler de input rodam com um pi falso, em node
com o modulo copiado do pacote construido. Sem modelo, sem rede.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "tests")]

from test_f50 import built, cli, package_dir  # noqa: E402, F401 - fixtures do pacote construido e instalado

DRIVER = r"""
const [moduleUrl] = process.argv.slice(1);
const mod = await import(moduleUrl);
const commands = [
  { name: "skill:revisar", description: "Revisa o código", source: "skill", sourceInfo: { scope: "user", path: "C:/u/revisar/SKILL.md" } },
  { name: "skill:deploy", description: "Publica o app", source: "skill", sourceInfo: { scope: "project", path: "C:/p/.pink/skills/deploy/SKILL.md" } },
  { name: "skill:resumo", description: "Resume", source: "skill", sourceInfo: { scope: "user" } },
  { name: "skill:limpar", description: "skill com nome de comando", source: "skill", sourceInfo: { scope: "user" } },
  { name: "resumo", description: "template de prompt", source: "prompt" },
  { name: "limpar", description: "comando de extensao", source: "extension" },
  { name: "skill:loop", description: "skill de loop", source: "skill", sourceInfo: { scope: "user" } },
  { name: "loop", description: "comando de extensao loop", source: "extension" },
  { name: "skill:review", description: "skill de review", source: "skill", sourceInfo: { scope: "user" } },
  { name: "review", description: "template review", source: "prompt" },
];
const out = {};
out.skills = mod.skillsOf(commands);
const rw = (text) => mod.rewrite(text, commands) ?? null;
out.rewrite = {
  args: rw("/revisar src/a.ts"),
  noArgs: rw("/revisar"),
  newline: rw("/deploy\nagora"),
  tab: rw("/deploy\tx"),
  spaces: rw("/deploy   a  b"),
  trailing: rw("/revisar   "),
  project: rw("/deploy"),
  caseDiff: rw("/Revisar x"),
  caseExtension: rw("/Loop x"),
  caseTemplate: rw("/Review x"),
  template: rw("/resumo x"),
  extension: rw("/limpar"),
  unknown: rw("/desconhecido x"),
  already: rw("/skill:revisar x"),
  plain: rw("texto /revisar"),
  leadingSpace: rw(" /revisar x"),
  bare: rw("/"),
  noSkillName: rw("/nao-existe"),
};

// handler de input: continue ou transform; so chama getCommands quando o texto casa com /nome
const handlers = {};
let calls = 0;
const pi = {
  on: (e, f) => { handlers[e] = f; },
  registerCommand: (n, s) => { pi.cmds = { ...(pi.cmds ?? {}), [n]: s }; },
  getCommands: () => { calls += 1; return commands; },
};
mod.default(pi);
const input = (text, source = "interactive") => handlers.input({ text, source });
out.input = {
  transform: input("/revisar a"),
  rpc: input("/revisar a", "rpc"),
  extension: input("/revisar a", "extension"),
  continue: input("oi"),
  nonString: handlers.input({ text: 5, source: "interactive" }),
  template: input("/resumo x"),
  leadingSpace: input(" /revisar x"),
  caseExtension: input("/Loop x"),
};
const before = calls;
input("texto comum sem barra");
out.plainCalls = calls - before;
const beforeMatch = calls;
input("/revisar a");
out.matchCalls = calls - beforeMatch;

// getCommands que lanca: o handler segue sem derrubar nada
const pi2 = { on: (e, f) => { pi2.h = f; }, registerCommand: () => {}, getCommands: () => { throw new Error("sessão saindo"); } };
mod.default(pi2);
let threw = false, res = null;
try { res = pi2.h({ text: "/revisar a", source: "interactive" }); } catch { threw = true; }
out.throwingCommands = { threw, res };

// /skills: lista com origem, ou mensagem quando nao ha skill
const notes = [];
const ctx = { ui: { notify: (t) => notes.push(t) }, isProjectTrusted: () => true };
await pi.cmds.skills.handler("", ctx);
out.skillsList = notes[0];
const ctxUntrusted = { ui: { notify: (t) => notes.push(t) }, isProjectTrusted: () => false };
const pi3 = { on: () => {}, registerCommand: (n, s) => { pi3.cmds = { ...(pi3.cmds ?? {}), [n]: s }; }, getCommands: () => [] };
mod.default(pi3);
await pi3.cmds.skills.handler("", ctxUntrusted);
out.skillsEmptyUntrusted = notes[1];

// PINK_SUBAGENT: nao registra nada
process.env.PINK_SUBAGENT = "1";
const reg = { on: [], cmds: [] };
mod.default({ on: (e) => reg.on.push(e), registerCommand: (n) => reg.cmds.push(n), getCommands: () => commands });
delete process.env.PINK_SUBAGENT;
out.subagent = reg;

console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def skills_facts(cli: Path, package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    prefix = cli.parents[5]
    ext = prefix / "ext"
    ext.mkdir(exist_ok=True)
    module = ext / "pink-skills.ts"
    shutil.copyfile(package_dir / "extensions" / "pink-skills.ts", module)
    home = tmp_path_factory.mktemp("skills-home")
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA"}
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    env.update({"HOME": str(home), "USERPROFILE": str(home)})
    done = subprocess.run(
        [node, "--input-type=module", "-e", DRIVER, module.as_uri()],
        capture_output=True, text=True, encoding="utf-8", timeout=180, check=False, stdin=subprocess.DEVNULL, cwd=str(home), env=env,
    )
    assert done.returncode == 0, done.stderr[-1200:]
    facts = json.loads(done.stdout.strip().splitlines()[-1])
    facts["builtSource"] = (package_dir / "extensions" / "pink-skills.ts").read_text(encoding="utf-8") == (ROOT / "extensions" / "pink-skills.ts").read_text(encoding="utf-8")
    facts["promptSource"] = (package_dir / "dist" / "core" / "system-prompt.js").read_text(encoding="utf-8")
    return facts


def test_1_skills_helper_lists_only_skill_commands_with_scope(skills_facts: dict) -> None:
    names = {skill["name"]: skill for skill in skills_facts["skills"]}
    assert set(names) == {"revisar", "deploy", "resumo", "limpar", "loop", "review"}  # template e comando de extensao com o mesmo nome nao entram como skill; skill "loop" e "review" existem
    assert names["revisar"] == {"name": "revisar", "description": "Revisa o código", "scope": "user", "path": "C:/u/revisar/SKILL.md"}
    assert names["deploy"]["scope"] == "project"  # projeto: aparece com a origem projeto


def test_2_name_args_is_rewritten_to_skill_form_with_one_space_after_the_name(skills_facts: dict) -> None:
    rw = skills_facts["rewrite"]
    assert rw["args"] == "/skill:revisar src/a.ts"
    assert rw["noArgs"] == "/skill:revisar"  # /nome sozinho tambem
    assert rw["newline"] == "/skill:deploy agora"  # quebra de linha depois do nome vira um espaco: a base separa pelo primeiro espaco
    assert rw["tab"] == "/skill:deploy x"
    assert rw["spaces"] == "/skill:deploy a  b"  # espaco do inicio do resto sai; os internos ficam
    assert rw["trailing"] == "/skill:revisar"  # so espacos depois do nome: sem argumento
    assert rw["project"] == "/skill:deploy"


def test_2b_matching_ignores_case_and_emits_the_real_skill_name(skills_facts: dict) -> None:
    assert skills_facts["rewrite"]["caseDiff"] == "/skill:revisar x"
    assert skills_facts["rewrite"]["caseExtension"] is None  # comando de extensao "loop" vence, sem diferenca de caixa
    assert skills_facts["rewrite"]["caseTemplate"] is None  # template "review" vence /Review


def test_3_no_hijack_templates_extensions_unknown_names_and_plain_text_are_left_alone(skills_facts: dict) -> None:
    rw = skills_facts["rewrite"]
    assert rw["template"] is None  # template com o mesmo nome vence
    assert rw["extension"] is None  # comando de extensao com o mesmo nome vence
    assert rw["unknown"] is None  # /nome sem skill: segue o caminho normal
    assert rw["noSkillName"] is None
    assert rw["already"] is None  # /skill:x nao muda
    assert rw["plain"] is None  # texto comum nao muda
    assert rw["leadingSpace"] is None  # espaco antes da barra: nao e comando
    assert rw["bare"] is None


def test_3b_the_input_handler_follows_the_source_and_never_throws(skills_facts: dict) -> None:
    inp = skills_facts["input"]
    assert inp["transform"] == {"action": "transform", "text": "/skill:revisar a"}  # interface
    assert inp["rpc"] == {"action": "transform", "text": "/skill:revisar a"}  # rpc tambem reescreve
    assert inp["extension"] == {"action": "continue"}  # texto mandado por extensao nao chama skill
    assert inp["continue"] == {"action": "continue"}
    assert inp["nonString"] == {"action": "continue"}
    assert inp["template"] == {"action": "continue"}
    assert inp["leadingSpace"] == {"action": "continue"}
    assert inp["caseExtension"] == {"action": "continue"}
    assert skills_facts["throwingCommands"] == {"threw": False, "res": {"action": "continue"}}  # getCommands que lanca: segue


def test_3c_plain_text_does_not_call_get_commands_and_a_match_calls_it_once(skills_facts: dict) -> None:
    assert skills_facts["plainCalls"] == 0
    assert skills_facts["matchCalls"] == 1


def test_1b_skills_command_lists_name_description_and_origin(skills_facts: dict) -> None:
    text = skills_facts["skillsList"]
    assert "/revisar (usuário) · Revisa o código" in text
    assert "/deploy (projeto) · Publica o app" in text
    assert "/resumo" in text and "/limpar" in text


def test_1c_empty_list_says_project_skills_need_a_trusted_folder(skills_facts: dict) -> None:
    assert skills_facts["skillsEmptyUntrusted"].startswith("Nenhuma skill.")
    assert "só carregam em pasta confiável" in skills_facts["skillsEmptyUntrusted"]


def test_4_base_keeps_advertising_skills_in_the_system_prompt_and_the_build_has_the_extension(skills_facts: dict) -> None:
    assert "formatSkillsForPrompt" in skills_facts["promptSource"]  # a base poe as skills no prompt para o modelo carregar por assunto
    assert skills_facts["builtSource"] is True  # o pacote construido tem a mesma extensao do repositorio


def test_subagent_registers_nothing(skills_facts: dict) -> None:
    assert skills_facts["subagent"] == {"on": [], "cmds": []}
