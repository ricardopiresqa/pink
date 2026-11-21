# ruff: noqa: E501
"""Card 1dfwh7kfzfc - memoria automatica por projeto (extensions/pink-memory.ts), do pacote construido.

O modulo construido e copiado para fora do node_modules (o Node so remove tipos fora dele) para resolver o typebox do prefixo
instalado. Tudo roda com PINK_CODING_AGENT_DIR numa pasta temporaria; nunca toca ~/.pink. Nenhum modelo e chamado.
Os textos "com cara de segredo" sao montados em tempo de execucao (valores falsos), para o fonte nao carregar padrao de chave.
"""

from __future__ import annotations

import json
import os
import re
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
const [moduleUrl, work, agent, untrustedDir, otherDir] = process.argv.slice(1);
process.env.PINK_CODING_AGENT_DIR = agent;
const mod = await import(moduleUrl);
const tools = {}, cmds = {}, handlers = {}, notes = [];
mod.default({ registerTool: (d) => { tools[d.name] = d; }, registerCommand: (n, s) => { cmds[n] = s; }, on: (e, f) => { handlers[e] = f; } });
const ctxFor = (cwd, trusted = true) => ({ cwd, isProjectTrusted: () => trusted, ui: { notify: (t) => notes.push(t) } });
const ctx = ctxFor(work);
const run = (params, c = ctx) => tools.memory.execute("id", params, undefined, undefined, c);
const txt = (r) => r.content[0].text;
const dir = mod.memoryDir(work);
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const list = () => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const promptFor = async (c = ctx) => { const sections = {}; await handlers.before_agent_start({ systemPromptOptions: { sections } }, c); return sections.pink_memory ?? ""; };
const out = { dir, slug: mod.projectSlug(work) };

// instantaneo por sessao: o prompt de hoje ainda nao tem memoria; gravar agora nao muda o prompt ate a proxima sessao
handlers.session_start({}, ctx);
out.promptBefore = await promptFor();

// 1. salvar: um .md por fato com frontmatter; o indice MEMORY.md sai dos arquivos, em ordem
const r1 = await run({ action: "save", name: "prefere-portugues", description: "Responder sempre em português", type: "user", content: "A pessoa escreve e quer respostas em português.\nWhy: pedido explícito" });
out.save1 = { text: txt(r1), isError: r1.isError, file: read("prefere-portugues.md") };
await run({ action: "save", name: "deploy-pelo-gitea", description: "Push vai para o gitea", type: "reference", content: "Remoto gitea SSH porta 2222." });
out.index2 = read("MEMORY.md");
out.promptSameSession = (await promptFor()) === out.promptBefore;

// 3. atualiza (mesmo name), le, lista, apaga
const r3 = await run({ action: "save", name: "prefere-portugues", description: "Português sempre, código em inglês", type: "user", content: "Versão nova." });
out.update = { text: txt(r3), index: read("MEMORY.md") };
out.read = txt(await run({ action: "read", name: "prefere-portugues" }));
out.list = txt(await run({ action: "list" }));
out.deleted = { text: txt(await run({ action: "delete", name: "deploy-pelo-gitea" })), exists: fs.existsSync(path.join(dir, "deploy-pelo-gitea.md")), index: read("MEMORY.md") };
// a sessao nova pega o indice atual no prompt
handlers.session_start({}, ctx);
out.promptNextSession = await promptFor();

// 3b. name fora do padrao (inclui reservados do Windows): recusado, nada escapa da pasta
const before = list();
const parentBefore = fs.readdirSync(path.dirname(dir)).sort();
const bad = {};
for (const name of ["../x", "x/y", "Abc", "", "a".repeat(65), "..\\x"]) bad[name] = (await run({ action: "save", name, description: "d", type: "project", content: "c" })).isError;
out.badNames = bad;
const reserved = {};
for (const name of ["memory", "con", "nul", "aux", "prn", "com1", "lpt9"]) {
  const r = await run({ action: "save", name, description: "d", type: "project", content: "c" });
  reserved[name] = { isError: r.isError, reservado: txt(r).includes("reservado") };
}
out.reserved = reserved;
out.escaped = { inside: list().join(",") === before.join(","), parent: fs.readdirSync(path.dirname(dir)).sort().join(",") === parentBefore.join(",") };

// type obrigatorio e valido; description ate 200 caracteres
const noType = await run({ action: "save", name: "sem-tipo", description: "d", content: "c" });
const badType = await run({ action: "save", name: "tipo-ruim", description: "d", type: "bogus", content: "c" });
const longDesc = await run({ action: "save", name: "desc-longa", description: "d".repeat(201), type: "project", content: "c" });
const okDesc = await run({ action: "save", name: "desc-limite", description: "d".repeat(200), type: "project", content: "c" });
out.typeAndDesc = { noType: noType.isError && txt(noType).includes("type deve ser"), badType: badType.isError, longDesc: longDesc.isError, okDesc: okDesc.isError === false, wrote: list().filter((f) => ["sem-tipo.md", "tipo-ruim.md", "desc-longa.md"].includes(f)) };

// 4. texto com cara de segredo (valores falsos montados aqui): recusado e nada gravado
const secrets = {
  apiKey: ["sk", "abcdefghijklmnop1234"].join("-"),
  password: ['"password"', '"hunter2hunter2"'].join(": "),
  senhaEq: ["senha", "hunter2hunter2"].join("="),
  dbPassword: ["DB_PASSWORD", "abcdefgh1234"].join("="),
  openaiKey: ["OPENAI_API_KEY", "x1y2z3w4v5"].join("="),
  bearer: ["Bearer", "abcdefghijklmnopqrstu123"].join(" "),
  urlUserPass: ["postgres://", "user:pass1234@", "host/db"].join(""),
  jwt: ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "abcdefghij"].join("."),
};
const beforeSecret = list();
const refused = {};
for (const [key, value] of Object.entries(secrets)) {
  const r = await run({ action: "save", name: `seg-${key.toLowerCase()}`, description: "d", type: "project", content: `usar ${value} aqui` });
  refused[key] = r.isError && txt(r).includes("segredo");
}
out.secret = { refused, wrote: list().filter((f) => !beforeSecret.includes(f)), indexHasSeg: read("MEMORY.md").includes("seg-") };
const benign = await run({ action: "save", name: "cofre", description: "onde fica a senha", type: "reference", content: "A senha do banco fica no cofre, nunca o valor." });
out.benignOk = benign.isError === false;

// 5. AGENTS.md da pessoa nao e tocado
fs.writeFileSync(path.join(work, "AGENTS.md"), "# regras da pessoa\n");
await run({ action: "save", name: "mais-uma", description: "d", type: "project", content: "c" });
out.agents = fs.readFileSync(path.join(work, "AGENTS.md"), "utf8");

// 2. indice no prompt, com limite (20 KB): 100 memorias de 200 caracteres de descricao
for (let i = 0; i < 100; i++) await run({ action: "save", name: `fato-${String(i).padStart(3, "0")}`, description: "x".repeat(200), type: "project", content: "c" });
handlers.session_start({}, ctx);
const prompt = await promptFor();
const index = mod.readIndex(work);
const cut = index.split("\n[índice cortado")[0];
out.cap = { diskBytes: Buffer.byteLength(read("MEMORY.md")), promptHasIndex: prompt.includes("<memory-index>") && prompt.includes("</memory-index>"), promptHasCutNote: prompt.includes("índice cortado em 20480 caracteres"), readIndexLen: index.length, lastLineWhole: /^- \[fato-\d{3}\]\(fato-\d{3}\.md\) — x{200}$/m.test(cut.split("\n").at(-1)) };
for (let i = 0; i < 100; i++) await run({ action: "delete", name: `fato-${String(i).padStart(3, "0")}` });
handlers.session_start({}, ctx);
out.afterCapDeletes = { promptHasCutNote: (await promptFor()).includes("índice cortado") };

// 5b. edicao e remocao manuais de um .md aparecem no proximo rebuild (o proximo save ou a proxima sessao)
const f = path.join(dir, "prefere-portugues.md");
fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Português sempre, código em inglês", "Editada à mão"));
fs.unlinkSync(path.join(dir, "mais-uma.md"));
await run({ action: "save", name: "outra", description: "gatilho", type: "project", content: "c" });
out.manual = read("MEMORY.md");

// 5c. /memoria mostra a pasta e o indice; em pasta nao confiavel avisa
await cmds.memoria.handler("", ctx);
await cmds.memoria.handler("", ctxFor(untrustedDir, false));
out.memoria = notes[0];
out.memoriaUntrusted = notes[1];

// 7. pasta nao confiavel: grava e apaga nao; le e lista funcionam; nada entra no prompt; nada e criado
const uctx = ctxFor(untrustedDir, false);
out.untrusted = {
  save: txt(await run({ action: "save", name: "nao-grava", description: "d", type: "project", content: "c" }, uctx)),
  saveIsError: (await run({ action: "save", name: "nao-grava", description: "d", type: "project", content: "c" }, uctx)).isError,
  delete: txt(await run({ action: "delete", name: "nao-grava" }, uctx)),
  list: txt(await run({ action: "list" }, uctx)),
  promptEmpty: (await (async () => { handlers.session_start({}, uctx); return promptFor(uctx); })()) === "",
  dirCreated: fs.existsSync(mod.memoryDir(untrustedDir)),
};

// 8. execute usa ctx.cwd: a memoria cai na pasta do ctx da chamada, nao na da sessao
await run({ action: "save", name: "outro-projeto", description: "d", type: "project", content: "c" }, ctxFor(otherDir));
out.ctxCwd = fs.existsSync(path.join(mod.memoryDir(otherDir), "outro-projeto.md")) && !fs.existsSync(path.join(dir, "outro-projeto.md"));

// 9. slug de Windows: caixa nao muda a pasta; espaco, hifen e barra geram pastas diferentes
const s = (p) => mod.projectSlug(p, "win32");
out.slugs = {
  example: s("C:\\Projetos\\X"),
  caseSame: s("C:\\Projetos\\X") === s("c:\\projetos\\x"),
  shape: /^c--projetos-x-[0-9a-f]{8}$/.test(s("C:\\Projetos\\X")),
  spaceDash: s(path.join(work, "a b")) !== s(path.join(work, "a-b")),
  backslash: s(path.join(work, "a", "b")) !== s(path.join(work, "a-b")),
};

// 10. indice ausente: rebuildIndex nao quebra
out.missingDir = mod.rebuildIndex(path.join(agent, "nao-existe"));

// 11. prefixo de segredo so no comeco de uma palavra; sk- isolado continua recusado
const riskOk = await run({ action: "save", name: "risco", description: "framework de risco", type: "project", content: "risk-assessment-framework-config" });
out.riskOk = riskOk.isError === false;
const skIsolated = await run({ action: "save", name: "sk-solto", description: "d", type: "project", content: ["sk", "abcdefghijklmnop1234"].join("-") });
out.skIsolatedRefused = skIsolated.isError === true;

// 12. < e > saem do indice: uma descricao com </memory-index> nao fecha o bloco do prompt
await run({ action: "save", name: "marca", description: "x </memory-index> y", type: "project", content: "c" });
const marcaLine = read("MEMORY.md").split("\n").find((line) => line.includes("(marca.md)")) ?? "";
out.angle = { line: marcaLine, closingTags: (handlers.session_start({}, ctx), (await promptFor()).split("</memory-index>").length - 1) };

// 13. rebuildIndex so regrava MEMORY.md quando o texto muda
const indexFile = path.join(dir, "MEMORY.md");
const past = new Date("2001-01-01T00:00:00Z");
fs.utimesSync(indexFile, past, past);
mod.rebuildIndex(dir);
out.noRewrite = fs.statSync(indexFile).mtimeMs === past.getTime();
await run({ action: "save", name: "mudanca", description: "algo novo", type: "project", content: "c" });
out.rewriteOnChange = fs.statSync(indexFile).mtimeMs !== past.getTime();

// 14. sem ctx.isProjectTrusted a pasta conta como nao confiavel
const noFn = { cwd: work, ui: { notify: () => {} } };
out.noTrustFn = {
  save: (await run({ action: "save", name: "sem-funcao", description: "d", type: "project", content: "c" }, noFn)).isError === true,
  delete: (await run({ action: "delete", name: "marca" }, noFn)).isError === true,
  wrote: fs.existsSync(path.join(dir, "sem-funcao.md")),
};
// 6. subagente nao registra nada
process.env.PINK_SUBAGENT = "1";
const p2 = { tools: {}, cmds: {}, handlers: {} };
mod.default({ registerTool: (d) => { p2.tools[d.name] = d; }, registerCommand: (n) => { p2.cmds[n] = 1; }, on: (e) => { p2.handlers[e] = 1; } });
delete process.env.PINK_SUBAGENT;
out.subagent = { tools: Object.keys(p2.tools), cmds: Object.keys(p2.cmds), handlers: Object.keys(p2.handlers) };

console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def memory_facts(cli: Path, package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    prefix = cli.parents[5]  # <prefixo>/node_modules/@thoth/pink/dist/bundle/cli.js
    ext = prefix / "ext"
    ext.mkdir(exist_ok=True)
    module = ext / "pink-memory.ts"
    shutil.copyfile(package_dir / "extensions" / "pink-memory.ts", module)
    shutil.copyfile(package_dir / "extensions" / "pink-i18n.ts", module.parent / "pink-i18n.ts")  # as extensoes importam o t() (card 1dfwh7kg5cg)
    work = tmp_path_factory.mktemp("memory-projeto")  # pasta do projeto, fora do repositorio
    untrusted = tmp_path_factory.mktemp("memory-nao-confiavel")
    other = tmp_path_factory.mktemp("memory-outro")
    agent = tmp_path_factory.mktemp("memory-agente")  # PINK_CODING_AGENT_DIR: nunca ~/.pink
    home = tmp_path_factory.mktemp("memory-home")
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA"}
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    env.update({"HOME": str(home), "USERPROFILE": str(home)})
    done = subprocess.run(
        [node, "--input-type=module", "-e", DRIVER, module.as_uri(), str(work), str(agent), str(untrusted), str(other)],
        capture_output=True, text=True, encoding="utf-8", timeout=300, check=False, stdin=subprocess.DEVNULL, cwd=str(work), env=env,
    )
    assert done.returncode == 0, done.stderr[-1200:]
    facts = json.loads(done.stdout.strip().splitlines()[-1])
    facts["agent"] = str(agent)
    facts["work"] = str(work)
    return facts


def test_1_one_md_per_fact_with_frontmatter_outside_the_repo(memory_facts: dict) -> None:
    assert memory_facts["save1"]["isError"] is False
    assert memory_facts["save1"]["file"].startswith("---\nname: prefere-portugues\ndescription: Responder sempre em português\ntype: user\n---\n")
    assert memory_facts["dir"].startswith(memory_facts["agent"]) and f"projects{os.sep}{memory_facts['slug']}{os.sep}memory" in memory_facts["dir"]
    assert not memory_facts["dir"].startswith(memory_facts["work"])  # nada dentro da pasta do projeto
    assert memory_facts["index2"] == "- [deploy-pelo-gitea](deploy-pelo-gitea.md) — Push vai para o gitea\n- [prefere-portugues](prefere-portugues.md) — Responder sempre em português\n"


def test_2_index_is_in_the_prompt_of_the_next_session_only_and_is_capped(memory_facts: dict) -> None:
    assert "Ainda não há memórias" in memory_facts["promptBefore"]  # prompt da sessao atual nao muda com a gravacao
    assert memory_facts["promptSameSession"] is True
    nxt = memory_facts["promptNextSession"]
    assert "<memory-index>" in nxt and "</memory-index>" in nxt and "prefere-portugues" in nxt
    cap = memory_facts["cap"]
    assert cap["diskBytes"] > 20 * 1024  # o arquivo em disco nao e cortado
    assert cap["promptHasIndex"] is True and cap["promptHasCutNote"] is True
    assert cap["readIndexLen"] <= 20 * 1024 + 120
    assert cap["lastLineWhole"] is True  # o corte cai na ultima linha inteira
    assert memory_facts["afterCapDeletes"]["promptHasCutNote"] is False


def test_3_save_update_read_list_and_delete(memory_facts: dict) -> None:
    assert "gravada" in memory_facts["save1"]["text"] and "atualizada" in memory_facts["update"]["text"]
    assert memory_facts["update"]["index"].count("- [prefere-portugues](") == 1  # mesmo name atualiza, nao duplica
    assert "Português sempre, código em inglês" in memory_facts["update"]["index"]
    assert memory_facts["read"].startswith("---\nname: prefere-portugues") and "Versão nova." in memory_facts["read"]
    assert "prefere-portugues" in memory_facts["list"]
    assert memory_facts["deleted"]["exists"] is False and "deploy-pelo-gitea" not in memory_facts["deleted"]["index"]
    assert "Português sempre, código em inglês" in memory_facts["promptNextSession"]


def test_3b_bad_and_reserved_names_are_refused_and_nothing_escapes(memory_facts: dict) -> None:
    assert all(memory_facts["badNames"].values()), memory_facts["badNames"]
    for name, info in memory_facts["reserved"].items():
        assert info["isError"] is True, name
        if name != "memory":  # "memory" cai na regra de nome (e por ser o indice)
            assert info["reservado"] is True, name
    assert memory_facts["escaped"] == {"inside": True, "parent": True}


def test_3c_type_is_required_and_valid_and_description_is_capped(memory_facts: dict) -> None:
    facts = memory_facts["typeAndDesc"]
    assert facts["noType"] is True and facts["badType"] is True
    assert facts["longDesc"] is True and facts["okDesc"] is True
    assert facts["wrote"] == []


def test_4_secret_like_text_is_refused_and_nothing_is_written(memory_facts: dict) -> None:
    secret = memory_facts["secret"]
    assert all(secret["refused"].values()), secret["refused"]
    assert secret["wrote"] == []
    assert secret["indexHasSeg"] is False
    assert memory_facts["benignOk"] is True  # texto sem valor (so a palavra senha) continua aceito


def test_5_agents_md_is_untouched(memory_facts: dict) -> None:
    assert memory_facts["agents"] == "# regras da pessoa\n"


def test_5b_manual_edit_and_delete_show_on_the_next_rebuild(memory_facts: dict) -> None:
    manual = memory_facts["manual"]
    assert "Editada à mão" in manual and "Português sempre" not in manual
    assert "mais-uma" not in manual
    assert "outra" in manual


def test_5c_memoria_shows_the_folder_and_the_index_and_warns_when_untrusted(memory_facts: dict) -> None:
    text = memory_facts["memoria"]
    assert text.startswith("Pasta: " + memory_facts["dir"])
    assert "- [prefere-portugues](prefere-portugues.md)" in text
    assert "Pasta não confiável" in memory_facts["memoriaUntrusted"]


def test_7_untrusted_folder_reads_but_never_writes_and_never_enters_the_prompt(memory_facts: dict) -> None:
    facts = memory_facts["untrusted"]
    assert "Pasta não confiável" in facts["save"] and facts["saveIsError"] is True
    assert "Pasta não confiável" in facts["delete"]
    assert facts["list"] == "Nenhuma memória neste projeto."  # list funciona (vazio)
    assert facts["promptEmpty"] is True
    assert facts["dirCreated"] is False


def test_8_execute_uses_the_context_folder(memory_facts: dict) -> None:
    assert memory_facts["ctxCwd"] is True


def test_9_windows_slug_ignores_case_and_separates_space_dash_and_slash(memory_facts: dict) -> None:
    slugs = memory_facts["slugs"]
    assert slugs["caseSame"] is True and slugs["shape"] is True
    assert re.fullmatch(r"c--projetos-x-[0-9a-f]{8}", slugs["example"])
    assert slugs["spaceDash"] is True and slugs["backslash"] is True


def test_10_rebuild_tolerates_a_missing_folder(memory_facts: dict) -> None:
    assert memory_facts["missingDir"] == []


def test_6_subagent_registers_nothing(memory_facts: dict) -> None:
    assert memory_facts["subagent"] == {"tools": [], "cmds": [], "handlers": []}

def test_11_secret_prefix_must_start_a_word_and_a_lone_sk_key_is_still_refused(memory_facts: dict) -> None:
    assert memory_facts["riskOk"] is True  # "risk-assessment-framework-config" nao e chave sk-
    assert memory_facts["skIsolatedRefused"] is True


def test_12_angle_brackets_stay_out_of_the_index_and_the_prompt_block(memory_facts: dict) -> None:
    angle = memory_facts["angle"]
    assert "<" not in angle["line"] and ">" not in angle["line"]
    assert "x /memory-index y" in angle["line"]
    assert angle["closingTags"] == 1  # so o fechamento verdadeiro do bloco


def test_13_rebuild_rewrites_the_index_only_when_the_text_changes(memory_facts: dict) -> None:
    assert memory_facts["noRewrite"] is True
    assert memory_facts["rewriteOnChange"] is True


def test_14_without_the_trust_function_the_folder_counts_as_untrusted(memory_facts: dict) -> None:
    trust = memory_facts["noTrustFn"]
    assert trust == {"save": True, "delete": True, "wrote": False}