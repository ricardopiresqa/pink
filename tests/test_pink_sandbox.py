# ruff: noqa: E501
"""Card 1dfwh7kfzxu - sandbox dos comandos do agente no Windows (extensions/pink-sandbox.ts + .cs), do pacote construido.

Roda de verdade: o helper e compilado com o csc.exe do Windows, a permissao do SID do Pink e dada (e tirada) em pastas
TEMPORARIAS criadas pelo teste, e os comandos rodam pelo powershell. Decisao do owner (2026-11-19): com o sandbox ligado o
bash do Git nao roda (o MSYS nao abre com o token restrito); o teste confere que ele devolve 126 + BASH_OFF sem iniciar
nada. Como test_pink_memory, o modulo e copiado para <prefixo>/ext (o typebox e o pi-coding-agent resolvem pelo prefixo
instalado). PINK_CODING_AGENT_DIR e HOME ficam em pastas temporarias; a permissao nunca e dada numa pasta real (nem o
repositorio do Pink, nem o thoth-dev).
Unica escrita fora das temporarias: uma tentativa na pasta pessoal do usuario, que deve falhar; se passar, o teste apaga o arquivo.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "tests")]

from test_f50 import built, cli, package_dir  # noqa: E402, F401 - fixtures do pacote construido e instalado

BASH = Path(r"C:\Program Files\Git\bin\bash.exe")

DRIVER = r"""
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
const cfg = JSON.parse(process.argv[1]);
process.env.PINK_CODING_AGENT_DIR = cfg.agent;
const sbx = await import(cfg.sandboxUrl);
const bgMod = await import(cfg.shellBgUrl);
const out = {};
const notes = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fwd = (p) => p.replace(/\\/g, "/");
const exists = (f) => fs.existsSync(f);
const count = (name) => spawnSync("tasklist", ["/FI", `IMAGENAME eq ${name}`, "/NH"], { encoding: "utf8" }).stdout.split(/\r?\n/).filter((l) => l.toLowerCase().includes(name.toLowerCase())).length;
const fakePi = () => {
  const tools = {}, cmds = {};
  const pi = { registerTool: (d) => { tools[d.name] = d; }, registerCommand: (n, s) => { cmds[n] = s; }, on: () => {}, sendUserMessage: () => {} };
  return { tools, cmds, pi };
};
async function run(ops, command, cwd, opts = {}) {
  let text = "";
  try {
    const r = await ops.exec(command, cwd, { onData: (d) => { text += d.toString("utf8"); }, signal: opts.signal, timeout: opts.timeout });
    return { exit: r.exitCode, out: text };
  } catch (e) {
    return { error: String(e?.message ?? e), out: text };
  }
}
const dirS = path.join(cfg.agent, "sandbox");
const helperExe = () => sbx.ensureHelper(dirS).exe;
const sidOf = () => sbx.ensureSid(dirS);
const has = (dir) => spawnSync(helperExe(), ["--has", sidOf(), dir], { encoding: "utf8" }).status;

// 1. desligado por padrao; fora do Windows so diz que ainda nao existe
const fresh = sbx.createSandbox({ env: { PINK_CODING_AGENT_DIR: cfg.agent }, platform: "win32" });
out.defaultOff = { active: fresh.active(), status: fresh.status(), bashOps: fresh.operations("bash") === undefined };
const linux = sbx.createSandbox({ env: { PINK_CODING_AGENT_DIR: cfg.agent }, platform: "linux" });
out.linux = { on: await linux.on(cfg.work, () => {}), status: linux.status(), active: linux.active() };

// 1b. raiz larga demais e ambiente falso: rootProblem so le, nada e concedido
const envNoSb = process.env; // copia com spread perde SystemRoot: o Python exporta as chaves em maiusculas
out.roots = {
  disk: sbx.rootProblem("C:\\", envNoSb) ?? "ok",
  home: sbx.rootProblem(os.homedir(), envNoSb) ?? "ok",
  containsAgent: sbx.rootProblem(path.dirname(cfg.agent), envNoSb) ?? "ok",
  system: sbx.rootProblem(process.env.SystemRoot || "C:\\Windows", envNoSb) ?? "ok",
  project: sbx.rootProblem(cfg.work, envNoSb) ?? "ok",
};
out.onRefused = await sbx.createSandbox({ env: { PINK_CODING_AGENT_DIR: cfg.agent }, platform: "win32" }).on("C:\\", () => {});
fs.mkdirSync(path.join(cfg.work, ".git", "hooks"), { recursive: true });
fs.mkdirSync(path.join(cfg.work, ".vscode"), { recursive: true });
fs.mkdirSync(path.join(cfg.work, "sub"), { recursive: true });

// 2. ligar: permissao so na pasta do projeto e no temporario do sandbox
const sb = sbx.createSandbox({ platform: "win32" });
out.on = await sb.on(cfg.work, (t) => notes.push(t));
out.status = sb.status();
out.envSet = { sid: Boolean(process.env.PINK_SANDBOX_SID), helper: Boolean(process.env.PINK_SANDBOX_HELPER), tmp: Boolean(process.env.PINK_SANDBOX_TMP), root: process.env.PINK_SANDBOX_ROOT === cfg.work };
out.ace = { work: has(cfg.work), outside: has(cfg.outside), tmp: has(process.env.PINK_SANDBOX_TMP) };
const aclOf = (dir) => spawnSync("icacls", [dir], { encoding: "utf8" }).stdout || "";
const sidNow = sidOf();
out.protectedAcl = { git: aclOf(path.join(cfg.work, ".git")).includes(sidNow) && aclOf(path.join(cfg.work, ".git")).includes("(DENY)"), vscode: aclOf(path.join(cfg.work, ".vscode")).includes("(DENY)") };
out.homeNotGranted = has(os.homedir());
// fake env: so vale o helper dentro da pasta do Pink, com o nome certo, e o temporario em <agente>/sandbox/tmp
const helperName = "pink-sandbox-0123456789ab.exe";
fs.writeFileSync(path.join(dirS, helperName), "x");
fs.writeFileSync(path.join(cfg.outside, helperName), "x");
const fakeBase = { PINK_CODING_AGENT_DIR: cfg.agent, PINK_SANDBOX_SID: sidNow, PINK_SANDBOX_TMP: path.join(dirS, "tmp"), PINK_SANDBOX_ROOT: cfg.work };
const actFake = (extra) => sbx.createSandbox({ env: { ...fakeBase, ...extra }, platform: "win32" }).active();
out.fakeEnv = {
  wrongDir: actFake({ PINK_SANDBOX_HELPER: path.join(cfg.outside, helperName) }),
  wrongName: actFake({ PINK_SANDBOX_HELPER: path.join(dirS, "evil.exe") }),
  wrongTmp: actFake({ PINK_SANDBOX_HELPER: path.join(dirS, helperName), PINK_SANDBOX_TMP: cfg.outside }),
  badSid: actFake({ PINK_SANDBOX_SID: "x", PINK_SANDBOX_HELPER: path.join(dirS, helperName) }),
  valid: actFake({ PINK_SANDBOX_HELPER: path.join(dirS, helperName) }),
};
const bash = sb.operations("bash");
const ps = sb.operations("powershell");
// pasta criada depois do ligar (npm install cria .husky): negada antes do proximo comando
fs.mkdirSync(path.join(cfg.work, ".husky"), { recursive: true });
out.husky = await run(ps, "Set-Content -Path .husky/novo -Value x -ErrorAction Stop; Write-Output feito", cfg.work);
out.huskyFile = exists(path.join(cfg.work, ".husky", "novo"));
out.huskyAcl = aclOf(path.join(cfg.work, ".husky")).includes("(DENY)");
// limite documentado: pasta com ACL privada (so SYSTEM e Administradores) nao entra no sandbox
const priv = path.join(cfg.work, "privado");
fs.mkdirSync(priv, { recursive: true });
fs.writeFileSync(path.join(priv, "segredo.txt"), "x");
spawnSync("icacls", [priv, "/inheritance:r", "/T", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", "/C", "/Q"], { encoding: "utf8" });
out.privateRead = await run(ps, "Get-Content -Path privado\\segredo.txt", cfg.work);

// 3. bash do Git com o sandbox ligado: nao roda, nao inicia processo, nao grava nada
const bashRan = path.join(cfg.work, "bash-ran.txt");
let t = Date.now();
out.bashOff = await run(bash, "echo ran > bash-ran.txt && echo bash-rodou", cfg.work);
out.bashOffMs = Date.now() - t;
out.bashOffFile = exists(bashRan);

// 4. escrita dentro: projeto e temporario do sandbox (powershell)
out.psInside = await run(ps, "Set-Content -Path ps-dentro.txt -Value ok; Get-Content -Path ps-dentro.txt", cfg.work);
out.psInsideFile = exists(path.join(cfg.work, "ps-dentro.txt"));
out.psTemp = await run(ps, 'Set-Content -Path "$env:TEMP\\t-sbx.txt" -Value t; Write-Output ok-temp', cfg.work);
out.psTempFile = exists(path.join(process.env.PINK_SANDBOX_TMP, "t-sbx.txt"));
out.psHooks = await run(ps, "Set-Content -Path .git/hooks/novo-hook -Value x", cfg.work);
out.psHooksFile = exists(path.join(cfg.work, ".git", "hooks", "novo-hook"));
out.psSub = await run(ps, "Set-Content -Path sub/y.txt -Value y; Write-Output sub-ok", cfg.work);
out.psSubFile = exists(path.join(cfg.work, "sub", "y.txt"));
out.psVscode = await run(ps, "Set-Content -Path .vscode/x.json -Value 1", cfg.work);
out.psVscodeFile = exists(path.join(cfg.work, ".vscode", "x.json"));

// 5. escrita fora: pasta de fora e pasta pessoal do usuario
out.psOutside = await run(ps, `Set-Content -Path '${cfg.outside}\\ps-o.txt' -Value x`, cfg.work);
out.psOutsideFile = exists(path.join(cfg.outside, "ps-o.txt"));
const probe = path.join(os.homedir(), "pink-sbx-probe.txt");
out.psProfile = await run(ps, 'Set-Content -Path "$env:USERPROFILE\\pink-sbx-probe.txt" -Value x', cfg.work);
out.psProfileFile = exists(probe);
fs.rmSync(probe, { force: true });

// registro e tarefa agendada: bloqueados pelo token; a limpeza e feita sem sandbox, caso um dia passem
out.reg = await run(ps, "New-Item -Path 'HKCU:\\Software\\PinkSbxTest' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\PinkSbxTest' -Name x -Value 1", cfg.work);
out.regKeyLeft = spawnSync("powershell", ["-NoProfile", "-Command", "Test-Path 'HKCU:\\Software\\PinkSbxTest'"], { encoding: "utf8" }).stdout.trim() === "True";
spawnSync("powershell", ["-NoProfile", "-Command", "Remove-Item -Path 'HKCU:\\Software\\PinkSbxTest' -Recurse -Force -ErrorAction SilentlyContinue"], { encoding: "utf8" });
out.task = await run(ps, "schtasks /create /tn PinkSbxTest /tr 'cmd /c exit 0' /sc once /st 23:59 /f", cfg.work);
out.taskLeft = spawnSync("schtasks", ["/query", "/tn", "PinkSbxTest"], { encoding: "utf8" }).status === 0;
spawnSync("schtasks", ["/delete", "/tn", "PinkSbxTest", "/f"], { encoding: "utf8" });

// 6. leitura, codigo de saida e rede (localhost, sem proxy)
fs.writeFileSync(path.join(cfg.outside, "leitura.txt"), "conteudo-lido\n");
out.psRead = await run(ps, `Get-Content -Path '${cfg.outside}\\leitura.txt'`, cfg.work);
out.psExit3 = await run(ps, "Write-Output antes; exit 3", cfg.work);
const server = http.createServer((req, res) => { res.setHeader("Content-Type", "text/plain"); res.end("pong"); }); // sem tipo, o Invoke-WebRequest devolve bytes
await new Promise((r) => server.listen(0, "127.0.0.1", r));
out.psNet = await run(ps, `(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:${server.address().port}/').Content`, cfg.work);
out.psPwd = await run(ps, "Write-Output $PWD.Path", cfg.work); // diagnostico: a pasta em que o powershell comeca
server.close();

// 7. timeout e Esc matam a arvore inteira (ping filho do powershell, sem sobrar)
const base = count("PING.EXE");
const t0 = Date.now();
out.timeout = await run(ps, "ping -n 61 127.0.0.1 | Out-Null", cfg.work, { timeout: 3 });
out.timeoutMs = Date.now() - t0;
await sleep(1500);
out.timeoutLeft = count("PING.EXE") - base;
const ac = new AbortController();
setTimeout(() => ac.abort(), 2000);
const t1 = Date.now();
out.abort = await run(ps, "ping -n 62 127.0.0.1 | Out-Null", cfg.work, { signal: ac.signal });
out.abortMs = Date.now() - t1;
await sleep(1500);
out.abortLeft = count("PING.EXE") - base;

// 7b. lockNew: a negacao antes do comando; se nao consegue negar, o comando nao roda (grant falso, nada real muda)
const lockRoot = path.join(cfg.agent, "lockroot");
fs.mkdirSync(path.join(lockRoot, ".husky"), { recursive: true });
const stubState = () => ({ sid: sidNow, helper: helperExe(), root: lockRoot, tmp: path.join(dirS, "tmp") });
const okState = stubState();
await sbx.lockNew(okState, async () => ({ code: 0, err: "" }));
out.lockOk = [...(okState.locked ?? [])];
const badState = stubState();
out.lockBad = await sbx.lockNew(badState, async () => ({ code: 1, err: "negado" })).then(() => "ok", (e) => String(e.message));
out.gitHint = {
  git: String(sbx.hintFor("bash: .git/index.lock: Permission denied") ?? "").includes("A pasta .git é só leitura"),
  other: String(sbx.hintFor("bash: x: Permission denied") ?? "").includes("A pasta .git"),
};
out.scopeGit = (out.on ?? "").includes("Git que grava em .git");

// 8. dicas e programa absoluto (sem a pasta do projeto no PATH)
out.hints = {
  msys: sbx.hintFor("CreateFileMapping(0x0) failed: Win32 error 5") !== undefined,
  bashDenied: sbx.hintFor("bash: C:/x/o.txt: Permission denied") !== undefined,
  // a saida real do PowerShell traz a linha UnauthorizedAccessException (o teste 5 pega isso de verdade)
  psDenied: sbx.hintFor("Set-Content : Access to the path 'C:\\x\\y.txt' is denied.\n + CategoryInfo : PermissionDenied: (C:\\x\\y.txt:String) [Set-Content], UnauthorizedAccessException") !== undefined,
  psDeniedPt: sbx.hintFor("Set-Content : Acesso ao caminho 'C:\\Users\\rixar\\Documents\\projetos\\muito\\longo\\arquivo.txt' foi negado.\n + CategoryInfo : PermissionDenied: (C:\\Users:String) [Set-Content], UnauthorizedAccessException") !== undefined,
  other: sbx.hintFor("erro de sintaxe") === undefined,
};
fs.writeFileSync(path.join(process.cwd(), "zz-prog.exe"), "x");
out.abs = {
  dotPathIgnored: sbx.absoluteProgram("zz-prog", { PATH: ".", PATHEXT: ".EXE" }) === undefined,
  absolute: sbx.absoluteProgram(cfg.bash) === cfg.bash,
  missing: sbx.absoluteProgram("C:\\nao\\existe.exe") === undefined,
  onPath: sbx.absoluteProgram("bash", { PATH: path.dirname(cfg.bash), PATHEXT: ".exe" }) === cfg.bash,
};
fs.rmSync(path.join(process.cwd(), "zz-prog.exe"), { force: true });

// 9. helper e SID: compilado uma vez, mesmo nome por fonte; sem o compilador ou a fonte, erro claro
const unit = path.join(cfg.agent, "unit");
const sid1 = sbx.ensureSid(unit), sid2 = sbx.ensureSid(unit);
out.sid = { ok: /^S-1-5-21(-\d+){4}$/.test(sid1), same: sid1 === sid2 };
const h1 = sbx.ensureHelper(unit), h2 = sbx.ensureHelper(unit);
out.helper = { name: h1.exe ? path.basename(h1.exe) : h1.error, again: h1.exe === h2.exe, exists: Boolean(h1.exe && exists(h1.exe)) };
out.noCompiler = sbx.ensureHelper(path.join(cfg.agent, "unit2"), undefined, "C:\\nao\\csc.exe").error ?? "ok";
out.noSource = sbx.ensureHelper(path.join(cfg.agent, "unit3"), path.join(cfg.agent, "nao.cs")).error ?? "ok";

// 10. subagente herda o sandbox ligado pelo ambiente: registra bash e powershell isolados
process.env.PINK_SUBAGENT = "1";
const sub = fakePi();
sbx.default(sub.pi);
delete process.env.PINK_SUBAGENT;
out.subagent = Object.keys(sub.tools).sort();

// 11. /sandbox pelo comando, e o pink-shell-bg usa as operacoes quando ligado
await sb.off();
const main = fakePi();
sbx.default(main.pi);
const sessionManager = { getSessionId: () => "sessao-sbx", getSessionFile: () => undefined }; // o pink-shell-bg le a sessao no execute
const ctx = { cwd: cfg.work, isProjectTrusted: () => true, hasUI: false, sessionManager, ui: { notify: (t) => notes.push(t), setStatus() {} } };
await main.cmds.sandbox.handler("ligar", ctx);
out.cmdOn = notes.at(-1);
const bgt = {};
bgMod.default({ registerTool: (d) => { bgt[d.name] = d; }, registerCommand: () => {}, on: () => {}, sendUserMessage: () => {} });
out.bgTools = Object.keys(bgt).sort();
const sig = new AbortController().signal;
const tryRun = async (fn) => {
  try { const r = await fn(); return { text: (r.content ?? []).map((c) => c.text).join("") }; } catch (e) { return { error: String(e?.message ?? e) }; }
};
out.bgIn = await tryRun(() => bgt.powershell.execute("i1", { command: "Set-Content -Path sb-bg.txt -Value via-shellbg; Write-Output done" }, sig, undefined, { ...ctx }));
out.bgInFile = exists(path.join(cfg.work, "sb-bg.txt"));
out.bgBash = await tryRun(() => bgt.bash.execute("i2", { command: "echo ran > bg-bash-ran.txt" }, sig, undefined, { ...ctx }));
out.bgBashFile = exists(path.join(cfg.work, "bg-bash-ran.txt"));
out.psBgOut = await tryRun(() => bgt.powershell.execute("i3", { command: `Set-Content -Path '${cfg.outside}\\bg-ps.txt' -Value x` }, sig, undefined, { ...ctx }));
out.psBgOutFile = exists(path.join(cfg.outside, "bg-ps.txt"));

// 12. desligar e remover: a permissao do Pink sai da pasta do projeto
await main.cmds.sandbox.handler("desligar", ctx);
out.cmdOff = notes.at(-1);
out.statusOff = main.cmds.sandbox ? sb.status() : null;
await main.cmds.sandbox.handler("remover", ctx);
out.cmdRemove = notes.at(-1);
out.aceAfterRemove = has(cfg.work);
out.envAfterOff = Boolean(process.env.PINK_SANDBOX_SID);
out.protectedAclAfter = aclOf(path.join(cfg.work, ".git")).includes(sidNow) || aclOf(path.join(cfg.work, ".husky")).includes(sidNow) || aclOf(path.join(cfg.work, ".vscode")).includes(sidNow);
fs.writeFileSync(path.join(cfg.agent, "facts.json"), JSON.stringify(out, null, 2)); // diagnostico: saidas completas dos comandos
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def sandbox_base() -> Iterator[Path]:
    # pasta com o modo padrao (herda a ACL do usuario, como um projeto real): tmp_path e mkdtemp no Python 3.14
    # saem com ACL privada (so SYSTEM e Administradores) e o powershell do sandbox nem consegue abrir a pasta
    base = Path(tempfile.gettempdir()) / f"sbx-{uuid.uuid4().hex[:8]}"
    os.makedirs(base)
    yield base
    subprocess.run(["icacls", str(base), "/reset", "/T", "/C", "/Q"], capture_output=True, check=False)  # tira as negacoes do sandbox
    shutil.rmtree(base, ignore_errors=True)


@pytest.fixture(scope="module")
def sandbox_facts(cli: Path, package_dir: Path, sandbox_base: Path) -> dict:
    if sys.platform != "win32":
        pytest.skip("sandbox do Windows")
    node = shutil.which("node")
    assert node, "node not found"
    assert BASH.is_file(), f"bash do Git nao encontrado em {BASH}"
    assert (package_dir / "extensions" / "pink-sandbox.cs").is_file()
    prefix = cli.parents[5]  # <prefixo>/node_modules/@thoth/pink/dist/bundle/cli.js
    # o pi-coding-agent e o proprio pacote instalado: um atalho de resolucao, como em test_pink_shell_bg.py
    shim = prefix / "node_modules" / "@earendil-works" / "pi-coding-agent"
    shim.mkdir(parents=True, exist_ok=True)
    (shim / "package.json").write_text(json.dumps({"name": "@earendil-works/pi-coding-agent", "type": "module", "exports": {".": "./index.js"}}), encoding="utf-8")
    (shim / "index.js").write_text('export * from "../../@thoth/pink/dist/index.js";\n', encoding="utf-8")
    ext = prefix / "ext"
    ext.mkdir(exist_ok=True)
    sandbox = ext / "pink-sandbox.ts"
    shutil.copyfile(package_dir / "extensions" / "pink-sandbox.ts", sandbox)
    shutil.copyfile(package_dir / "extensions" / "pink-i18n.ts", sandbox.parent / "pink-i18n.ts")  # as extensoes importam o t() (card 1dfwh7kg5cg)
    shutil.copyfile(package_dir / "extensions" / "pink-sandbox.cs", ext / "pink-sandbox.cs")  # o helper compila a partir da pasta do modulo
    shellbg = ext / "pink-shell-bg.ts"
    shutil.copyfile(package_dir / "extensions" / "pink-shell-bg.ts", shellbg)
    work = sandbox_base / "projeto"  # a unica pasta com permissao do Pink
    outside = sandbox_base / "fora"  # sem permissao
    agent = sandbox_base / "agente"  # PINK_CODING_AGENT_DIR: nunca ~/.pink
    home = sandbox_base / "home"
    for d in (work, outside, agent, home):
        os.makedirs(d)
    cfg = {"sandboxUrl": sandbox.as_uri(), "shellBgUrl": shellbg.as_uri(), "work": str(work), "outside": str(outside), "agent": str(agent), "bash": str(BASH)}
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMDATA", "USERNAME", "USERDOMAIN"}
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    # USERPROFILE real so para a tentativa de escrita na pasta pessoal (deve falhar; o teste apaga o que passar)
    env.update({"HOME": str(home), "USERPROFILE": os.environ.get("USERPROFILE", str(home))})
    env["TEMP"] = env["TMP"] = str(agent / "tmp-proc")  # temporario do processo do teste; o do sandbox fica em <agente>/sandbox/tmp
    (agent / "tmp-proc").mkdir()
    done = subprocess.run(
        [node, "--input-type=module", "-e", DRIVER, json.dumps(cfg, ensure_ascii=False)],
        capture_output=True, text=True, encoding="utf-8", timeout=900, check=False, stdin=subprocess.DEVNULL, cwd=str(work), env=env,
    )
    (agent / "driver-stderr.txt").write_text(done.stderr, encoding="utf-8")  # diagnostico: o erro completo do driver
    assert done.returncode == 0, f"driver saiu com {done.returncode}; erro completo em {agent / 'driver-stderr.txt'}"
    lines = done.stdout.strip().split("\n")  # nao splitlines(): caracteres de linha no texto do sandbox
    assert lines and lines[-1].startswith("{"), (done.stdout[-800:], done.stderr[-800:])
    facts = json.loads(lines[-1])
    facts.update(agent=str(agent), work=str(work), outside=str(outside))
    return facts


def test_1_off_by_default_and_outside_windows_it_says_so(sandbox_facts: dict) -> None:
    d = sandbox_facts["defaultOff"]
    assert d["active"] is False and d["bashOps"] is True and "desligado" in d["status"]
    assert sandbox_facts["linux"]["on"].startswith("O sandbox por enquanto só existe no Windows")
    assert "só existe no Windows" in sandbox_facts["linux"]["status"] and sandbox_facts["linux"]["active"] is False


def test_2_on_grants_the_project_and_the_temp_only(sandbox_facts: dict) -> None:
    assert sandbox_facts["on"].startswith("Sandbox ligado") and "/sandbox desligar" in sandbox_facts["on"]
    assert sandbox_facts["status"].startswith("Sandbox ligado")
    assert all(sandbox_facts["envSet"].values())  # exportado para os subagentes
    a = sandbox_facts["ace"]
    assert a["work"] == 0 and a["tmp"] == 0 and a["outside"] == 1  # 0 = tem a permissao, 1 = nao tem


def test_3_powershell_writes_in_the_project_and_the_sandbox_temp(sandbox_facts: dict) -> None:
    f = sandbox_facts
    assert f["psPwd"]["out"].strip() == f["work"], f["psPwd"]  # o powershell comeca na pasta do projeto
    assert f["psInside"].get("exit") == 0 and "ok" in f["psInside"]["out"] and f["psInsideFile"] is True
    assert f["psTemp"].get("exit") == 0 and "ok-temp" in f["psTemp"]["out"] and f["psTempFile"] is True


def test_4_powershell_writes_outside_fail_and_leave_nothing(sandbox_facts: dict) -> None:
    f = sandbox_facts
    assert f["psInside"].get("exit") == 0, f["psInside"]  # precondicao: o powershell roda dentro, so entao a negacao de fora prova algo
    assert f["psOutside"].get("exit", 0) != 0 and f["psOutsideFile"] is False
    assert f["psProfile"].get("exit", 0) != 0 and f["psProfileFile"] is False


def test_5_a_sandbox_failure_comes_with_a_hint(sandbox_facts: dict) -> None:
    assert "[sandbox]" in sandbox_facts["psOutside"]["out"], sandbox_facts["psOutside"]
    assert "[sandbox]" in sandbox_facts["psProfile"]["out"], sandbox_facts["psProfile"]


def test_6_reads_network_and_exit_codes_come_back_as_before(sandbox_facts: dict) -> None:
    f = sandbox_facts
    assert f["psRead"].get("exit") == 0 and "conteudo-lido" in f["psRead"]["out"]
    assert f["psNet"].get("exit") == 0 and "pong" in f["psNet"]["out"]
    assert f["psExit3"].get("exit") == 3 and "antes" in f["psExit3"]["out"]


def test_7_timeout_and_abort_kill_the_whole_tree(sandbox_facts: dict) -> None:
    f = sandbox_facts
    assert f["timeout"].get("error") == "timeout:3" and f["timeoutMs"] < 15000
    assert f["timeoutLeft"] <= 0
    assert f["abort"].get("error") == "aborted" and f["abortMs"] < 10000
    assert f["abortLeft"] <= 0


def test_8_bash_with_the_sandbox_on_does_not_run_and_writes_nothing(sandbox_facts: dict) -> None:
    f = sandbox_facts
    b = f["bashOff"]
    assert b.get("exit") == 126, b
    assert "o bash do Git não roda" in b["out"] and "powershell" in b["out"], b  # BASH_OFF, diz o que usar
    assert "bash-rodou" not in b["out"]  # o comando nao chegou a rodar
    assert f["bashOffFile"] is False and f["bashOffMs"] < 2000  # nenhum processo iniciado
    assert "powershell" in (f["bgBash"].get("text", "") + f["bgBash"].get("error", "")) and f["bgBashFile"] is False


def test_9_hint_table_and_absolute_program(sandbox_facts: dict) -> None:
    h = sandbox_facts["hints"]
    assert h["msys"] is True and h["bashDenied"] is True and h["other"] is True
    assert h["psDenied"] is True, "pink-sandbox.ts:82 nao casa 'Access to the path ... is denied'"
    assert h["psDeniedPt"] is True, "pink-sandbox.ts:82 limite de caracteres em 'Acesso ... negado'"
    a = sandbox_facts["abs"]
    assert a["dotPathIgnored"] is True and a["absolute"] is True and a["missing"] is True and a["onPath"] is True


def test_10_helper_and_sid(sandbox_facts: dict) -> None:
    assert sandbox_facts["sid"] == {"ok": True, "same": True}
    assert sandbox_facts["helper"]["exists"] is True and sandbox_facts["helper"]["again"] is True
    assert sandbox_facts["helper"]["name"].startswith("pink-sandbox-") and sandbox_facts["helper"]["name"].endswith(".exe")
    assert "compilador do Windows não encontrado" in sandbox_facts["noCompiler"]
    assert "fonte do sandbox não encontrada" in sandbox_facts["noSource"]


def test_11_subagent_inherits_the_sandbox(sandbox_facts: dict) -> None:
    assert sandbox_facts["subagent"] == ["bash", "powershell"]


def test_12_shell_bg_runs_the_commands_through_the_sandbox(sandbox_facts: dict) -> None:
    f = sandbox_facts
    assert f["bgTools"] == ["background_output", "background_stop", "background_watch", "bash", "powershell"]
    assert f["cmdOn"].startswith("Sandbox ligado")
    assert "done" in f["bgIn"].get("text", "") and f["bgInFile"] is True
    # o bash de segundo plano devolve a negacao como texto com codigo de saida 1, sem lancar erro
    assert f["psBgOutFile"] is False and ("error" in f["psBgOut"] or "code 1" in f["psBgOut"].get("text", "")), f["psBgOut"]


def test_13_desligar_and_remover_take_the_ace_out(sandbox_facts: dict) -> None:
    assert sandbox_facts["cmdOff"].startswith("Sandbox desligado") and sandbox_facts["envAfterOff"] is False
    assert sandbox_facts["cmdRemove"].startswith("Sandbox desligado e permissão do Pink removida")
    assert sandbox_facts["aceAfterRemove"] == 1


def test_14_protected_folders_are_read_only_and_one_created_later_gets_locked(sandbox_facts: dict) -> None:
    f = sandbox_facts
    assert f["protectedAcl"] == {"git": True, "vscode": True}
    assert "menos .git, .vscode (só leitura)" in f["on"]
    assert f["psHooks"].get("exit", 0) != 0 and f["psHooksFile"] is False
    assert "A pasta .git é só leitura" in f["psHooks"]["out"]  # dica especifica do .git
    assert f["psSub"].get("exit") == 0 and f["psSubFile"] is True  # subpasta comum continua gravavel
    assert f["psVscode"].get("exit", 0) != 0 and f["psVscodeFile"] is False
    assert f["husky"].get("exit", 0) != 0 and f["huskyFile"] is False and f["huskyAcl"] is True  # criada depois do ligar


def test_15_bad_roots_and_fake_env_are_refused_and_nothing_is_granted(sandbox_facts: dict) -> None:
    f = sandbox_facts
    r = f["roots"]
    assert "raiz de um disco" in r["disk"]
    assert "pasta pessoal inteira" in r["home"]
    assert "contém a pasta do Pink" in r["containsAgent"]
    assert "pasta do sistema" in r["system"]
    assert r["project"] == "ok"
    assert f["onRefused"].startswith("Não liguei o sandbox")
    assert f["homeNotGranted"] == 1  # a pasta pessoal nao ganhou permissao
    assert f["fakeEnv"] == {"wrongDir": False, "wrongName": False, "wrongTmp": False, "badSid": False, "valid": True}


def test_16_registry_and_scheduled_task_are_blocked(sandbox_facts: dict) -> None:
    f = sandbox_facts
    assert f["reg"].get("exit", 0) != 0 and f["regKeyLeft"] is False
    assert f["task"].get("exit", 0) != 0 and f["taskLeft"] is False


def test_17_remover_takes_the_deny_out_too(sandbox_facts: dict) -> None:
    assert sandbox_facts["protectedAclAfter"] is False


def test_19_a_private_folder_is_not_readable_inside_the_sandbox(sandbox_facts: dict) -> None:
    # limite documentado, nao defeito: a pasta com ACL privada fica para a pessoa; o agente nao le dentro do sandbox
    p = sandbox_facts["privateRead"]
    assert p.get("exit", 0) != 0 and "conteudo" not in p.get("out", ""), p


def test_18_git_hint_lockNew_and_scope_text(sandbox_facts: dict) -> None:
    f = sandbox_facts
    assert f["gitHint"] == {"git": True, "other": False}
    assert f["lockOk"] == [".husky"]
    assert "não consegui proteger" in f["lockBad"] and "o comando não rodou" in f["lockBad"]
    assert f["scopeGit"] is True
