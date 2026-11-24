# ruff: noqa: E501
"""Card 1dfwh7kfzxx - propor skill (extensions/pink-skill-propose.ts), do pacote construido.

Como test_pink_memory: o modulo e copiado para <prefixo>/ext (o typebox resolve pelo prefixo instalado). Tudo roda com
PINK_CODING_AGENT_DIR e a pasta do projeto em pastas temporarias; nunca toca ~/.pink. Nenhum modelo e chamado. A base
carrega as skills com loadSkillsFromDir/loadSkills do build instalado, e o /nome e conferido com a regra do pink-skills.ts.
Os textos "com cara de segredo" sao montados em tempo de execucao, para o fonte nao carregar padrao de chave.
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
import fs from "node:fs";
import path from "node:path";
const cfg = JSON.parse(process.argv[1]);
const { proposeUrl, rulesUrl, baseUrl, work, agent, untrusted } = cfg;
process.env.PINK_CODING_AGENT_DIR = agent;
const mod = await import(proposeUrl);
const rules = await import(rulesUrl);
const base = await import(baseUrl);
const out = {};
const events = [];
const mkCtx = (cwd, o = {}) => {
  const ui = { notify: (t) => events.push(["notify", t]) };
  if (o.confirm !== false) ui.confirm = async (t, m) => { events.push(["confirm", t, m]); return o.answer ?? true; };
  return { cwd, hasUI: o.hasUI ?? true, isProjectTrusted: () => o.trusted ?? true, ui };
};
const tools = {}, cmds = {}, sent = [];
const pi = {
  registerTool: (d) => { tools[d.name] = d; },
  registerCommand: (n, s) => { cmds[n] = s; },
  on: () => {},
  sendUserMessage: (m, opts) => { sent.push({ m, opts }); },
};
mod.default(pi);
const propose = (params, ctx) => tools.skill_propose.execute("id", params, undefined, undefined, ctx);
const txt = (r) => r.content[0].text;
const userFile = (name) => path.join(agent, "skills", name, "SKILL.md");
const projFile = (name) => path.join(work, ".pink", "skills", name, "SKILL.md");
const readOr = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
const body = "## Quando usar\nDeploy.\n\n## Passos\n1. rodar X\n";
const skill = (name, description = "Faz X quando Y", content = body) => ({ name, description, content });
const tricky = 'Usa "aspas", dois-pontos: e # cerquilha';

out.main = { tools: Object.keys(tools), cmds: Object.keys(cmds) };

// 1. criterio 1: a tela mostra o SKILL.md inteiro (notify) antes da pergunta (confirm), e so grava com sim
{
  const r = await propose(skill("deploy-x"), mkCtx(work, { answer: true }));
  const file = userFile("deploy-x");
  out.happy = {
    isError: r.isError, text: txt(r), kinds: events.map((e) => e[0]), confirmTitle: events[1]?.[1] ?? null,
    notifyHasFull: (events[0]?.[1] ?? "").includes(mod.renderSkill("deploy-x", "Faz X quando Y", body)),
    exact: readOr(file) === mod.renderSkill("deploy-x", "Faz X quando Y", body),
    file: readOr(file), underAgent: file.startsWith(agent), underWork: file.startsWith(work),
  };
  events.length = 0;
}
// 2. criterio 2: sem o sim nada e gravado; sem tela (hasUI false ou sem confirm) nada e gravado e nem mostra
{
  const r = await propose(skill("nao-grava"), mkCtx(work, { answer: false }));
  out.no = { isError: r.isError, text: txt(r), wrote: readOr(userFile("nao-grava")) !== null, kinds: events.map((e) => e[0]) };
  events.length = 0;
  const a = await propose(skill("sem-tela"), mkCtx(work, { hasUI: false }));
  const b = await propose(skill("sem-confirm"), mkCtx(work, { confirm: false }));
  out.noUi = { a: { isError: a.isError, wrote: readOr(userFile("sem-tela")) !== null }, b: { isError: b.isError, wrote: readOr(userFile("sem-confirm")) !== null }, notified: events.length };
  events.length = 0;
}
// 3. criterio 3: pasta do projeto so em pasta confiavel; pasta do agente vale sempre
{
  const r = await propose({ ...skill("so-projeto"), scope: "project" }, mkCtx(work));
  out.projTrusted = { isError: r.isError, wrote: readOr(projFile("so-projeto")), text: txt(r) };
  events.length = 0;
  const u = await propose({ ...skill("proj-nao-conf"), scope: "project" }, mkCtx(untrusted, { trusted: false }));
  out.projUntrusted = { isError: u.isError, text: txt(u), wrote: readOr(path.join(untrusted, ".pink", "skills", "proj-nao-conf", "SKILL.md")) !== null, notified: events.length };
  events.length = 0;
}
// 3b. nome: regra da base (a-z0-9-, ate 64, sem hifen na ponta nem --)
{
  const names = ["", "-a", "a-", "a--b", "A", "a_b", "a".repeat(65), "a".repeat(64), "ok-1"];
  out.names = names.map((n) => [n.slice(0, 70), mod.plan({ name: n, description: "d", content: "c" }, mkCtx(work)).error ?? "ok"]);
}
// 3c. descricao: uma linha, ate 1024; corpo: ate 32 KB
{
  const descs = ["", "linha\numa", "x".repeat(1025), "x".repeat(1024), "  "];
  out.descs = descs.map((d) => [d.length, mod.plan({ name: "ok-desc", description: d, content: "c" }, mkCtx(work)).error ?? "ok"]);
  out.bodySize = mod.plan({ name: "ok-corpo", description: "d", content: "x".repeat(32 * 1024 + 1) }, mkCtx(work)).error ?? "ok";
}
// 3d. nunca sobrescreve: arquivo existente e pasta existente (mesmo vazia) sao erro, nada muda
{
  const before = readOr(userFile("deploy-x"));
  const r = await propose(skill("deploy-x", "outra descricao"), mkCtx(work));
  out.overwrite = { isError: r.isError, text: txt(r), same: readOr(userFile("deploy-x")) === before, notified: events.length };
  events.length = 0;
  fs.mkdirSync(path.join(agent, "skills", "pasta-vazia"), { recursive: true });
  const e = mod.plan({ name: "pasta-vazia", description: "d", content: "c" }, mkCtx(work));
  out.emptyDir = e.error ?? "ok";
  out.emptyDirWrite = readOr(path.join(agent, "skills", "pasta-vazia", "SKILL.md"));
}
// 3e. segredo: nao grava (chave e senha montadas em tempo de execucao)
{
  const fakeKey = ["sk", "Q".repeat(24)].join("-");
  const fakePass = ["senha", "hunter2hunter2"].join(": ");
  const a = await propose(skill("com-chave", "Usa a chave", `Use ${fakeKey} no header\n`), mkCtx(work));
  const b = await propose(skill("com-senha", "Login", `${fakePass}\n`), mkCtx(work));
  out.secret = { a: { isError: a.isError, text: txt(a), wrote: readOr(userFile("com-chave")) !== null }, b: { isError: b.isError, wrote: readOr(userFile("com-senha")) !== null }, notified: events.length };
  events.length = 0;
}
// 4. renderSkill: descricao em aspas JSON (YAML valido), com ":" e aspas
out.render = mod.renderSkill("yaml-ok", tricky, "corpo").split("\n").slice(0, 4);
{
  const r = await propose(skill("yaml-ok", tricky), mkCtx(work));
  out.yamlWrite = { isError: r.isError, file: readOr(userFile("yaml-ok")) };
  events.length = 0;
}
// 5. o build carrega as skills (loadSkillsFromDir da base e loadSkills) e o /nome vira /skill:nome
{
  const u = base.loadSkillsFromDir({ dir: path.join(agent, "skills"), source: "user" });
  out.baseDir = { names: u.skills.map((s) => s.name).sort(), yaml: u.skills.find((s) => s.name === "yaml-ok")?.description ?? null, diagnostics: u.diagnostics.map((d) => d.message) };
  const all = base.loadSkills({ cwd: work, agentDir: agent, includeDefaults: true, skillPaths: [] });
  const commands = all.skills.map((s) => ({ name: `skill:${s.name}`, description: s.description, source: "skill", sourceInfo: { scope: "user" } }));
  out.rewrite = { deploy: rules.rewrite("/deploy-x args", commands), yaml: rules.rewrite("/yaml-ok", commands), proposeNotOnlyNames: all.skills.map((s) => s.name).sort() };
}
// 6. prompt com e sem assunto
out.prompt = {
  withTopic: mod.PROPOSE_PROMPT("deploy").split("\n")[0],
  without: mod.PROPOSE_PROMPT("").split("\n")[0],
  tool: mod.PROPOSE_PROMPT("").includes("skill_propose"),
};
// 7. /skill-nova: sendUserMessage; followUp quando o agente esta ocupado
{
  const h = cmds["skill-nova"].handler;
  pi.sendUserMessage = (m, opts) => { sent.push({ m, opts }); };
  await h("deploy de app", { isIdle: () => true });
  await h("", { isIdle: () => false });
  out.cmd = { count: sent.length, firstIsPrompt: sent[0].m === mod.PROPOSE_PROMPT("deploy de app"), firstOpts: sent[0].opts ?? null, secondOpts: sent[1].opts ?? null, secondIsPrompt: sent[1].m === mod.PROPOSE_PROMPT("") };
}
// 8. PINK_SUBAGENT: nada registrado
{
  process.env.PINK_SUBAGENT = "1";
  const p2 = { tools: {}, cmds: {}, handlers: {} };
  mod.default({ registerTool: (d) => { p2.tools[d.name] = d; }, registerCommand: (n) => { p2.cmds[n] = 1; }, on: (e) => { p2.handlers[e] = 1; }, sendUserMessage() {} });
  delete process.env.PINK_SUBAGENT;
  out.subagent = { tools: Object.keys(p2.tools), cmds: Object.keys(p2.cmds), handlers: Object.keys(p2.handlers) };
}
// 9. caracteres escondidos (controles, bidi, largura zero, BOM, separadores de linha): recusados em description e content
{
  const bad = ["\u001b[31mvermelho", "a‮b", "a​b", "a﻿b", "a b", "a\u0085b", "a\u0007b"];
  out.hiddenDesc = bad.map((s) => [JSON.stringify(s), mod.plan({ name: "oculto", description: s, content: "c" }, mkCtx(work)).error ? "rejeitado" : "aceito"]);
  out.hiddenContent = bad.map((s) => [JSON.stringify(s), mod.plan({ name: "oculto", description: "d", content: `passo ${s}` }, mkCtx(work)).error ? "rejeitado" : "aceito"]);
  out.visible = mod.plan({ name: "com-tab", description: "tab\tok", content: "linha 1\r\nlinha 2\tx\n" }, mkCtx(work)).error ?? "ok";
}
// 10. link (junction) de .pink ou .pink/skills para fora do projeto: recusado; link para dentro do projeto: aceito
{
  const p = { name: "via-link", scope: "project", description: "d", content: "c" };
  const r1 = mod.plan(p, mkCtx(cfg.j1));
  const r2 = mod.plan(p, mkCtx(cfg.j2));
  const r3 = mod.plan(p, mkCtx(cfg.j3));
  out.junction = { outside: r1.error ?? "ok", skillsOutside: r2.error ?? "ok", inside: r3.error ?? "ok", wroteOutside: fs.existsSync(path.join(cfg.out, "skills", "via-link")) };
}
// 11. a confirmacao traz o lugar, a nota de que a descricao entra no prompt, e o SKILL.md cortado em 3000 caracteres
{
  events.length = 0;
  await propose({ name: "com-local", description: "Usa X", content: body, scope: "project" }, mkCtx(work, { answer: false }));
  const conf = events.filter((e) => e[0] === "confirm").at(-1);
  out.confirmInfo = { title: conf[1], hasFile: conf[2].includes(path.join(work, ".pink", "skills", "com-local", "SKILL.md")), note: conf[2].includes("entra no prompt de toda sessão"), projectNote: conf[2].includes("deste projeto") };
  events.length = 0;
  const longBody = Array.from({ length: 400 }, (_, i) => `passo ${i} faz algo`).join("\n");
  const text = mod.renderSkill("longa", "Descricao longa", longBody);
  await propose(skill("longa", "Descricao longa", longBody), mkCtx(work, { answer: false }));
  const c = events.filter((e) => e[0] === "confirm").at(-1);
  const n = events.filter((e) => e[0] === "notify").at(-1);
  out.preview = { textLen: text.length, msgHasFirst: c[2].includes(text.slice(0, 3000)), msgCut: c[2].includes(`… mais ${text.length - 3000} caracteres`), msgWhole: c[2].includes(text), notifyFull: n[1].includes(text) };
  events.length = 0;
}
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def skills_facts(cli: Path, package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    prefix = cli.parents[5]  # <prefixo>/node_modules/@thothdev/pink/dist/bundle/cli.js
    ext = prefix / "ext"
    ext.mkdir(exist_ok=True)
    propose = ext / "pink-skill-propose.ts"
    rules = ext / "pink-skills.ts"
    shutil.copyfile(package_dir / "extensions" / "pink-skill-propose.ts", propose)
    shutil.copyfile(package_dir / "extensions" / "pink-i18n.ts", propose.parent / "pink-i18n.ts")  # as extensoes importam o t() (card 1dfwh7kg5cg)
    shutil.copyfile(package_dir / "extensions" / "pink-skills.ts", rules)
    base_skills = cli.parents[1] / "core" / "skills.js"  # dist/core/skills.js do pacote instalado
    assert base_skills.is_file()
    work = tmp_path_factory.mktemp("skill-projeto")  # pasta do projeto, fora do repositorio
    untrusted = tmp_path_factory.mktemp("skill-nao-confiavel")
    agent = tmp_path_factory.mktemp("skill-agente")  # PINK_CODING_AGENT_DIR: nunca ~/.pink
    home = tmp_path_factory.mktemp("skill-home")
    links = tmp_path_factory.mktemp("skill-links")  # juncoes (mklink /J, sem admin): .pink ou .pink/skills para fora ou para dentro
    outside = links / "fora"
    outside.mkdir()
    j1 = links / "pink-aponta-para-fora"
    j1.mkdir()
    j2 = links / "skills-aponta-para-fora"
    (j2 / ".pink").mkdir(parents=True)
    j3 = links / "pink-aponta-para-dentro"
    (j3 / "dentro").mkdir(parents=True)
    for link, target in ((j1 / ".pink", outside), (j2 / ".pink" / "skills", outside), (j3 / ".pink", j3 / "dentro")):
        made = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], capture_output=True, text=True, check=False)
        if made.returncode != 0:
            pytest.skip(f"mklink /J indisponivel: {made.stdout}{made.stderr}")
    cfg = {"proposeUrl": propose.as_uri(), "rulesUrl": rules.as_uri(), "baseUrl": base_skills.as_uri(), "work": str(work), "agent": str(agent), "untrusted": str(untrusted), "j1": str(j1), "j2": str(j2), "j3": str(j3), "out": str(outside)}
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA"}
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    env.update({"HOME": str(home), "USERPROFILE": str(home)})
    done = subprocess.run(
        [node, "--input-type=module", "-e", DRIVER, json.dumps(cfg, ensure_ascii=False)],
        capture_output=True, text=True, encoding="utf-8", timeout=300, check=False, stdin=subprocess.DEVNULL, cwd=str(work), env=env,
    )
    assert done.returncode == 0, done.stderr[-1200:]
    lines = done.stdout.strip().split("\n")  # nao splitlines(): U+2028 e U+0085 aparecem crus no JSON dos caracteres escondidos
    assert lines and lines[-1].startswith("{"), (done.stdout[-800:], done.stderr[-800:])
    facts = json.loads(lines[-1])
    facts["agent"], facts["work"], facts["untrusted"] = str(agent), str(work), str(untrusted)
    return facts


def test_1_the_full_skill_is_shown_before_the_question(skills_facts: dict) -> None:
    h = skills_facts["happy"]
    assert h["kinds"] == ["notify", "confirm"] and h["confirmTitle"] == "Gravar a skill deploy-x?"  # mostrar antes de perguntar
    assert h["notifyHasFull"] is True and h["isError"] is False


def test_2_written_only_with_an_explicit_yes(skills_facts: dict) -> None:
    assert skills_facts["happy"]["exact"] is True  # o arquivo é exatamente o renderizado, nada a mais
    no = skills_facts["no"]
    assert no["wrote"] is False and no["isError"] is False and "não aprovou" in no["text"] and no["kinds"] == ["notify", "confirm"]
    assert skills_facts["noUi"] == {"a": {"isError": True, "wrote": False}, "b": {"isError": True, "wrote": False}, "notified": 0}


def test_3_user_folder_always_and_project_folder_only_when_trusted(skills_facts: dict) -> None:
    h = skills_facts["happy"]
    assert h["underAgent"] is True and h["underWork"] is False  # ~/.pink/agent/skills, fora do projeto
    pt = skills_facts["projTrusted"]
    assert pt["isError"] is False and pt["wrote"] and pt["wrote"].startswith("---\nname: so-projeto\n")
    pu = skills_facts["projUntrusted"]
    assert pu["isError"] is True and pu["wrote"] is False and "não confiável" in pu["text"] and pu["notified"] == 0


def test_3b_name_follows_the_base_rules(skills_facts: dict) -> None:
    got = dict(skills_facts["names"])
    assert got[""] != "ok" and got["-a"] != "ok" and got["a-"] != "ok" and got["a--b"] != "ok"
    assert got["A"] != "ok" and got["a_b"] != "ok" and got["a" * 65] != "ok"
    assert got["a" * 64] == "ok" and got["ok-1"] == "ok"


def test_3c_description_is_one_line_up_to_1024_and_body_up_to_32k(skills_facts: dict) -> None:
    d = skills_facts["descs"]
    assert [x[1] == "ok" for x in d] == [False, False, False, True, False]  # vazia, quebra de linha, 1025, 1024, so espacos
    assert skills_facts["bodySize"] != "ok"


def test_3d_never_overwrites_and_an_empty_folder_counts_as_taken(skills_facts: dict) -> None:
    o = skills_facts["overwrite"]
    assert o["isError"] is True and "já existe" in o["text"] and o["same"] is True and o["notified"] == 0
    assert skills_facts["emptyDir"].startswith("já existe") and skills_facts["emptyDirWrite"] is None


def test_3e_secret_like_text_is_refused_and_nothing_is_written(skills_facts: dict) -> None:
    s = skills_facts["secret"]
    assert s["a"]["isError"] is True and "segredo" in s["a"]["text"] and s["a"]["wrote"] is False
    assert s["b"]["isError"] is True and s["b"]["wrote"] is False and s["notified"] == 0


def test_4_the_build_loads_the_skill_and_slash_name_runs_it(skills_facts: dict) -> None:
    b = skills_facts["baseDir"]
    assert "deploy-x" in b["names"] and "yaml-ok" in b["names"] and "com-chave" not in b["names"]
    assert not any("deploy-x" in m or "yaml-ok" in m for m in b["diagnostics"])
    assert b["yaml"] == 'Usa "aspas", dois-pontos: e # cerquilha'  # o YAML volta igual
    r = skills_facts["rewrite"]
    assert r["deploy"] == "/skill:deploy-x args" and r["yaml"] == "/skill:yaml-ok"


def test_5_render_puts_the_description_in_json_quotes(skills_facts: dict) -> None:
    head = skills_facts["render"]
    assert head[0] == "---" and head[1] == "name: yaml-ok"
    assert head[2] == "description: " + json.dumps('Usa "aspas", dois-pontos: e # cerquilha', ensure_ascii=False)
    assert skills_facts["yamlWrite"]["isError"] is False and skills_facts["yamlWrite"]["file"].startswith("---\nname: yaml-ok\n")


def test_6_prompt_with_and_without_a_topic(skills_facts: dict) -> None:
    p = skills_facts["prompt"]
    assert "sobre: deploy" in p["withTopic"] and "sobre:" not in p["without"]
    assert p["tool"] is True


def test_7_slash_skill_nova_sends_the_prompt_and_follows_up_when_busy(skills_facts: dict) -> None:
    c = skills_facts["cmd"]
    assert c["count"] == 2 and c["firstIsPrompt"] is True and c["firstOpts"] is None
    assert c["secondOpts"] == {"deliverAs": "followUp"} and c["secondIsPrompt"] is True


def test_8_the_subagent_registers_nothing_and_the_main_agent_registers_both(skills_facts: dict) -> None:
    assert skills_facts["subagent"] == {"tools": [], "cmds": [], "handlers": []}
    assert skills_facts["main"] == {"tools": ["skill_propose"], "cmds": ["skill-nova"]}


def test_9_hidden_characters_are_refused_in_description_and_content(skills_facts: dict) -> None:
    desc = {k: v for k, v in skills_facts["hiddenDesc"]}
    cont = {k: v for k, v in skills_facts["hiddenContent"]}
    assert len(desc) == 7 and set(desc.values()) == {"rejeitado"}, desc
    assert set(cont.values()) == {"rejeitado"}, cont
    assert skills_facts["visible"] == "ok"  # tab, CRLF e LF continuam aceitos


def test_10_a_link_out_of_the_project_is_refused_and_nothing_lands_outside(skills_facts: dict) -> None:
    j = skills_facts["junction"]
    assert "aponta para fora do projeto" in j["outside"]
    assert "aponta para fora do projeto" in j["skillsOutside"]
    assert j["inside"] == "ok"  # link para dentro do projeto nao e recusado
    assert j["wroteOutside"] is False


def test_11_confirm_shows_the_place_the_prompt_note_and_the_text_cut_at_3000(skills_facts: dict) -> None:
    c = skills_facts["confirmInfo"]
    assert c["title"] == "Gravar a skill com-local?" and c["hasFile"] is True
    assert c["note"] is True and c["projectNote"] is True
    p = skills_facts["preview"]
    assert p["textLen"] > 3000 and p["msgHasFirst"] is True and p["msgCut"] is True
    assert p["msgWhole"] is False  # a pergunta nao traz o arquivo inteiro: o aviso e que traz
    assert p["notifyFull"] is True
