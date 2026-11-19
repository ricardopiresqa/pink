# ruff: noqa: E501
"""Card 1dfwh7kfzxw - /review (extensions/pink-review.ts) e o subagente "revisor" do pacote construido.

Repositórios git reais em diretórios temporários (HOME, TEMP e TMP isolados: nunca ~/.pink nem a pasta temporária do
usuário), um git falso para o corte do diff e da lista, e um driver node (ESM) que chama collect, reviewPrompt, sweepStale
e o comando. Sem modelo, sem rede. O /review de ponta a ponta com o `pink -p` não roda aqui (gastaria um modelo).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "tests")]

from test_f50 import built, cli, package_dir  # noqa: E402, F401 - fixtures do pacote construido e instalado

KEEP = ("PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432")

DRIVER = r"""
const [reviewUrl, cfgJson] = process.argv.slice(1);
const cfg = JSON.parse(cfgJson);
const R = await import(reviewUrl);
const fs = await import("node:fs");
const path = await import("node:path");
const { spawnSync } = await import("node:child_process");
const out = {};
const notes = [];
const sent = [];
const take = () => sent.splice(0);
const takeNotes = () => notes.splice(0);
const ctxFor = (cwd, extra = {}) => ({ cwd, ui: { notify: (t, l) => notes.push({ t, l }) }, isProjectTrusted: () => true, isIdle: () => true, ...extra });
const base = (b) => (b === null || b === undefined ? undefined : b);

// ---- git falso: a primeira chamada é sempre rev-parse --show-toplevel
const fakeRun = (args) => {
  if (args[0] === "rev-parse" && args.includes("--show-toplevel")) return { ok: true, out: cfg.cwd, err: "" };
  if (args[0] === "rev-parse") return { ok: true, out: "", err: "" };
  if (args[0] === "diff" && args.includes("--name-only")) return { ok: true, out: "a.ts\n", err: "" };
  if (args[0] === "diff") return { ok: true, out: "x".repeat(R.MAX_DIFF + 100), err: "" };
  return { ok: true, out: "", err: "" };
};
const manyRun = (args) => {
  if (args[0] === "rev-parse" && args.includes("--show-toplevel")) return { ok: true, out: cfg.cwd, err: "" };
  if (args[0] === "rev-parse") return { ok: true, out: "", err: "" };
  if (args[0] === "diff") return { ok: true, out: args.includes("--name-only") ? "" : "diff --git a/x b/x\n", err: "" };
  if (args[0] === "ls-files") return { ok: true, out: Array.from({ length: 205 }, (_, i) => `n${i}.ts`).join("\n") + "\n", err: "" };
  return { ok: true, out: "", err: "" };
};

// ---- collect com git real
out.collect = {};
for (const [name, c] of Object.entries(cfg.cases)) {
  const r = R.collect(c.cwd, base(c.base));
  out.collect[name] = { error: r.error ?? null, label: r.label ?? null, files: r.files ?? null, diff: r.diff ?? null, extra: r.extra ?? null };
}

// ---- validRef e cleanName
out.validRef = {
  plain: R.validRef("main"), head1: R.validRef("HEAD~1"), dash: R.validRef("-x"), dotdot: R.validRef("main..HEAD"),
  slash: R.validRef("feature/x"), space: R.validRef("a b"), empty: R.validRef(""), unicode: R.validRef("feature/ção"), control: R.validRef("a\u0001b"),
};
out.clean = { nl: R.cleanName("a\nb"), longLen: R.cleanName("x".repeat(250)).length, longEnds: R.cleanName("x".repeat(250)).endsWith("…") };

// ---- corte do diff, git que falha, lista de untracked acima de 200
{
  const r = R.collect(cfg.cwd, undefined, fakeRun);
  out.cut = { length: r.diff.length, startsWithX: r.diff.startsWith("xxx"), tail: r.diff.slice(-90), files: r.files };
}
out.noGitFake = R.collect(cfg.cwd, undefined, () => ({ ok: false, out: "", err: "" })).error;
out.fakeEmptyNothing = R.collect(cfg.cwd, undefined, () => ({ ok: true, out: "", err: "" })).error;
{
  const m = R.collect(cfg.cwd, undefined, manyRun);
  out.many = { files: m.files.length, extra: m.extra, last: m.files.at(-1), mention: (R.reviewPrompt("p", m, "").match(/e mais (\d+)/) ?? [])[1] ?? null };
}

// ---- git do projeto: textconv e fsmonitor só rodam sem a proteção (controle) e não rodam com collect
{
  const T = cfg.trap;
  const marks = ["ran.marker", "fsm.marker"];
  spawnSync("git", ["diff", "--no-color"], { cwd: T, encoding: "utf8" });
  spawnSync("git", ["status", "--porcelain"], { cwd: T, encoding: "utf8" });
  out.trapControl = { textconvRan: fs.existsSync(path.join(T, "ran.marker")), fsmRan: fs.existsSync(path.join(T, "fsm.marker")) };
  for (const m of marks) fs.rmSync(path.join(T, m), { force: true });
  const tr = R.collect(T, undefined);
  out.trap = { error: tr.error ?? null, textconvRan: fs.existsSync(path.join(T, "ran.marker")), fsmRan: fs.existsSync(path.join(T, "fsm.marker")), hasV2: (tr.diff ?? "").includes("v2") };
  for (const m of marks) fs.rmSync(path.join(T, m), { force: true });
}

// ---- reviewPrompt (found = {files, extra, label, root})
{
  const files60 = Array.from({ length: 60 }, (_, i) => `f${i}.ts`);
  const p60 = R.reviewPrompt("/tmp/x/diff.patch", { files: files60, extra: 0, label: "mudanças não commitadas", root: "/repo/raiz" }, "segurança");
  out.prompt = {
    agent: p60.includes('agent "revisor"'),
    diffPath: p60.includes("/tmp/x/diff.patch"),
    root: p60.includes("em /repo/raiz"),
    cut: p60.includes("… e mais 10 arquivo(s) não listados"),
    listed: (p60.match(/^- f\d+\.ts$/gm) ?? []).length,
    focus: p60.includes("Foco pedido: segurança"),
    noFocus: !R.reviewPrompt("p", { files: ["a"], label: "l", root: "r" }).includes("Foco pedido"),
    readOnlyOpinion: p60.includes("sem acrescentar sua opinião"),
  };
}

// ---- comando, eventos e pasta temporária (pi falso)
const reg = {};
const handlers = {};
const pi = {
  registerCommand: (n, o) => { reg[n] = o; },
  on: (e, h) => { handlers[e] = h; },
  sendUserMessage: (m, opts) => { sent.push({ m, opts }); },
};
R.default(pi);
out.registered = { commands: Object.keys(reg), events: Object.keys(handlers).sort() };
const handle = reg.review.handler;
const fileFrom = (text) => (/(\S+diff\.patch)/.exec(text ?? "") ?? [])[1] ?? null;
const dirs = [];

await handle("", ctxFor(cfg.dirty, { isProjectTrusted: () => false }));
out.hUntrusted = { notes: takeNotes(), sent: take().length };

await handle("", ctxFor(cfg.clean));
out.hClean = { notes: takeNotes(), sent: take().length };

await handle("", ctxFor(cfg.plain));
out.hPlain = { notes: takeNotes(), sent: take().length };

await handle("", ctxFor(cfg.dirty));
{
  const entry = take()[0] ?? null;
  const file = fileFrom(entry?.m);
  if (file) dirs.push(path.dirname(file));
  out.hDirty = {
    notes: takeNotes(),
    prompt: entry !== null,
    diffPath: file,
    inTemp: file ? file.toLowerCase().startsWith(cfg.tmp.toLowerCase()) : null,
    diffText: file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null,
    folderExists: file ? fs.existsSync(path.dirname(file)) : null,
    deliverAs: entry?.opts?.deliverAs ?? null,
  };
}

await handle("", ctxFor(cfg.dirty, { isIdle: () => false }));
{
  const entry = take()[0] ?? null;
  const file = fileFrom(entry?.m);
  if (file) dirs.push(path.dirname(file));
  out.hBusy = { deliverAs: entry?.opts?.deliverAs ?? null, sent: entry ? 1 : 0, notes: takeNotes() };
}

await handle("-x", ctxFor(cfg.dirty));
out.hBadRef = { notes: takeNotes(), sent: take().length };

await handle("main segurança", ctxFor(cfg.branch));
{
  const entry = take()[0] ?? null;
  const prompt = entry?.m ?? "";
  const file = fileFrom(prompt);
  if (file) dirs.push(path.dirname(file));
  out.hBranch = { notes: takeNotes(), sent: entry ? 1 : 0, focus: prompt.includes("Foco pedido: segurança"), label: prompt.includes("mudanças desde main") };
}

await handlers.session_shutdown({}, ctxFor(cfg.dirty));
out.shutdown = { dirs: dirs.length, removed: dirs.every((d) => !fs.existsSync(d)) };

// pasta temporária que não existe: o handler deve avisar, não quebrar
process.env.TEMP = cfg.missing;
process.env.TMP = cfg.missing;
{
  let threw = false;
  try { await handle("", ctxFor(cfg.dirty)); } catch { threw = true; }
  out.hErr = { threw, notes: takeNotes(), sent: take().length };
}
process.env.TEMP = cfg.tmp;
process.env.TMP = cfg.tmp;

// varredura de pastas velhas
R.sweepStale(cfg.sweep);
out.sweep = {
  oldRemoved: !fs.existsSync(path.join(cfg.sweep, "pink-review-velho")),
  newKept: fs.existsSync(path.join(cfg.sweep, "pink-review-novo")),
  otherKept: fs.existsSync(path.join(cfg.sweep, "outra-velho")),
};

// PINK_SUBAGENT: nao registra nada
{
  const r2 = {};
  const h2 = {};
  process.env.PINK_SUBAGENT = "1";
  R.default({ registerCommand: (n) => { r2[n] = 1; }, on: (e) => { h2[e] = 1; }, sendUserMessage() {} });
  delete process.env.PINK_SUBAGENT;
  out.subagent = { commands: Object.keys(r2), events: Object.keys(h2) };
}
console.log(JSON.stringify(out));
"""


def _env(home: Path, tmp: Path) -> dict:
    env = {k: v for k, v in os.environ.items() if k.upper() in KEEP}
    env.update(
        HOME=str(home),
        USERPROFILE=str(home),
        PINK_CODING_AGENT_DIR=str(home / "agent"),
        TEMP=str(tmp),
        TMP=str(tmp),
        GIT_CONFIG_NOSYSTEM="1",
        GIT_CONFIG_GLOBAL=str(home / "gitconfig"),
    )
    return env


def _git(cwd: Path, *args: str) -> None:
    # autocrlf=false: o git do usuário pode normalizar fim de linha e o /review roda com a config isolada
    subprocess.run(
        ["git", "-c", "user.email=t@example.invalid", "-c", "user.name=teste", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", *args],
        cwd=cwd, check=True, capture_output=True, text=True,
    )


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode("utf-8"))  # bytes: sem CRLF no Windows, para o conteúdo commitado bater com o que o /review lê


def _repo(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(path)], check=True, capture_output=True)
    return path


@pytest.fixture(scope="module")
def repos(tmp_path_factory: pytest.TempPathFactory) -> dict:
    home = tmp_path_factory.mktemp("review-home")
    tmp = home / "tmp"
    tmp.mkdir()
    (home / "gitconfig").write_text("", encoding="utf-8")
    base = home / "repos"

    clean = _repo(base / "clean")
    _write(clean / "a.ts", "const a = 1;\n")
    _git(clean, "add", "-A")
    _git(clean, "commit", "-q", "-m", "inicial")

    dirty = _repo(base / "dirty")
    _write(dirty / "a.ts", "const a = 1;\n")
    _git(dirty, "add", "-A")
    _git(dirty, "commit", "-q", "-m", "inicial")
    _write(dirty / "a.ts", "const a = 2;\n")
    _write(dirty / "new.ts", "export const n = 3;\n")

    nocommit = _repo(base / "nocommit")
    _write(nocommit / "solto.txt", "sem commit\n")
    _write(nocommit / "staged.txt", "no index\n")
    _git(nocommit, "add", "staged.txt")

    branch = _repo(base / "branch")
    _write(branch / "a.ts", "v1\n")
    _git(branch, "add", "-A")
    _git(branch, "commit", "-q", "-m", "v1")
    _git(branch, "checkout", "-q", "-b", "feat")
    _write(branch / "a.ts", "v2\n")
    _git(branch, "commit", "-q", "-am", "v2")
    _write(branch / "b.ts", "novo sem commit\n")

    # textconv e fsmonitor configurados no repositório: o /review não pode rodá-los
    trap = _repo(base / "trap")
    _write(trap / "secret.txt", "v1\n")
    _write(trap / ".gitattributes", "secret.txt diff=leak\n")
    _git(trap, "add", "-A")
    _git(trap, "commit", "-q", "-m", "inicial")
    _git(trap, "config", "diff.leak.textconv", "sh -c 'printf ran > ran.marker; cat \"$0\"'")
    _git(trap, "config", "core.fsmonitor", "sh -c 'printf ran > fsm.marker'")
    _write(trap / "secret.txt", "v2\n")

    plain = base / "plain"
    _write(plain / "x.txt", "fora do git\n")

    sweep = base / "sweep"
    sweep.mkdir(parents=True)
    old = time.time() - 2 * 24 * 3600
    for name in ("pink-review-velho", "outra-velho"):
        (sweep / name).mkdir()
        os.utime(sweep / name, (old, old))
    (sweep / "pink-review-novo").mkdir()

    return {"home": home, "tmp": tmp, "clean": clean, "dirty": dirty, "nocommit": nocommit, "branch": branch, "trap": trap, "plain": plain, "sweep": sweep}


@pytest.fixture(scope="module")
def review_out(repos: dict, package_dir: Path) -> dict:
    url = (package_dir / "extensions" / "pink-review.ts").as_uri()
    cfg = {
        "cwd": str(repos["dirty"]),
        "tmp": str(repos["tmp"]),
        "missing": str(repos["home"] / "nao-existe"),
        "clean": str(repos["clean"]),
        "plain": str(repos["plain"]),
        "dirty": str(repos["dirty"]),
        "branch": str(repos["branch"]),
        "trap": str(repos["trap"]),
        "sweep": str(repos["sweep"]),
        "cases": {
            "nocommit": {"cwd": str(repos["nocommit"]), "base": None},
            "clean": {"cwd": str(repos["clean"]), "base": None},
            "dirty": {"cwd": str(repos["dirty"]), "base": None},
            "branch": {"cwd": str(repos["branch"]), "base": "main"},
            "outside": {"cwd": str(repos["plain"]), "base": None},
            "dashRef": {"cwd": str(repos["branch"]), "base": "-x"},
            "dotdotRef": {"cwd": str(repos["branch"]), "base": "main..HEAD"},
            "unknownRef": {"cwd": str(repos["branch"]), "base": "nao-existe"},
        },
    }
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", DRIVER, url, json.dumps(cfg)],
        capture_output=True, text=True, encoding="utf-8", env=_env(repos["home"], repos["tmp"]), timeout=180,
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    return json.loads(proc.stdout.strip().splitlines()[-1])


# ================================================================================================ collect com git real
def test_no_commit_yet_reviews_the_untracked_and_staged_files(review_out: dict) -> None:
    c = review_out["collect"]["nocommit"]
    assert c["error"] is None and c["label"] == "mudanças não commitadas"
    assert "solto.txt [novo, fora do git]" in c["files"]
    assert "staged.txt" in c["files"] and "staged.txt" in c["diff"]


def test_a_clean_repository_has_nothing_to_review(review_out: dict) -> None:
    assert review_out["collect"]["clean"]["error"] == "Nada para revisar (mudanças não commitadas)."


def test_a_dirty_repository_reviews_the_change_and_the_new_file(review_out: dict) -> None:
    c = review_out["collect"]["dirty"]
    assert c["error"] is None and "const a = 2;" in c["diff"]
    assert "a.ts" in c["files"] and "new.ts [novo, fora do git]" in c["files"]


def test_a_branch_reviews_everything_since_the_merge_base(review_out: dict) -> None:
    c = review_out["collect"]["branch"]
    assert c["error"] is None and c["label"] == "mudanças desde main"
    assert "v2" in c["diff"] and "a.ts" in c["files"]  # o commit do branch
    assert "b.ts [novo, fora do git]" in c["files"]  # e o que não foi commitado


def test_a_ref_that_starts_with_a_dash_is_refused(review_out: dict) -> None:
    assert review_out["collect"]["dashRef"]["error"] == "Referência inválida: -x"


def test_a_ref_with_a_range_is_refused(review_out: dict) -> None:
    assert review_out["collect"]["dotdotRef"]["error"] == "Referência inválida: main..HEAD"


def test_an_unknown_ref_gets_a_clear_message(review_out: dict) -> None:
    assert review_out["collect"]["unknownRef"]["error"].startswith("Não achei a base com nao-existe")


def test_outside_git_gets_a_clear_message(review_out: dict) -> None:
    assert review_out["collect"]["outside"]["error"] == "Esta pasta não é um repositório git."


def test_ref_validation_table(review_out: dict) -> None:
    v = review_out["validRef"]
    assert v == {"plain": True, "head1": True, "dash": False, "dotdot": False, "slash": True, "space": False, "empty": False, "unicode": True, "control": False}


def test_file_names_are_cleaned_of_control_characters_and_cut(review_out: dict) -> None:
    c = review_out["clean"]
    assert c["nl"] == "a?b" and c["longLen"] == 201 and c["longEnds"] is True


def test_a_huge_diff_is_cut_with_a_note(review_out: dict) -> None:
    c = review_out["cut"]
    assert c["startsWithX"] is True and "[diff cortado em 2 MB" in c["tail"]
    assert c["length"] < 2 * 1024 * 1024 + 300 and c["files"] == ["a.ts"]


def test_a_git_that_is_not_there_says_not_a_repository(review_out: dict) -> None:
    assert review_out["noGitFake"] == "Esta pasta não é um repositório git."


def test_no_diff_and_no_untracked_is_nothing_to_review(review_out: dict) -> None:
    assert review_out["fakeEmptyNothing"] == "Nada para revisar (mudanças não commitadas)."


def test_more_than_200_untracked_files_are_counted_not_listed(review_out: dict) -> None:
    m = review_out["many"]
    assert m["files"] == 200 and m["extra"] == 5 and m["last"] == "n199.ts [novo, fora do git]"
    assert m["mention"] == "155"  # 200 - 50 listados + 5 que ficaram de fora


def test_the_project_git_config_cannot_run_programs_during_collect(review_out: dict) -> None:
    control = review_out["trapControl"]
    # controle: sem a proteção, o textconv do .gitattributes roda; sem isso o teste abaixo não prova nada
    assert control["textconvRan"] is True, "o controle não rodou o textconv: a armadilha não funciona neste Windows"
    t = review_out["trap"]
    assert t["error"] is None and t["hasV2"] is True
    assert t["textconvRan"] is False and t["fsmRan"] is False


# ================================================================================================ prompt
def test_the_prompt_names_the_revisor_the_diff_file_and_the_root(review_out: dict) -> None:
    p = review_out["prompt"]
    assert p["agent"] is True and p["diffPath"] is True and p["root"] is True and p["readOnlyOpinion"] is True


def test_the_prompt_lists_at_most_fifty_files_then_the_rest_and_the_focus(review_out: dict) -> None:
    p = review_out["prompt"]
    assert p["listed"] == 50 and p["cut"] is True
    assert p["focus"] is True and p["noFocus"] is True


# ================================================================================================ comando
def test_the_command_and_the_session_events_are_registered(review_out: dict) -> None:
    r = review_out["registered"]
    assert r["commands"] == ["review"] and r["events"] == ["session_shutdown", "session_start"]


def test_an_untrusted_folder_is_refused_and_sends_nothing(review_out: dict) -> None:
    h = review_out["hUntrusted"]
    assert h["sent"] == 0 and len(h["notes"]) == 1 and h["notes"][0]["l"] == "error"
    assert "Pasta não confiável" in h["notes"][0]["t"]


def test_a_clean_repository_notifies_and_sends_nothing(review_out: dict) -> None:
    h = review_out["hClean"]
    assert h["sent"] == 0 and h["notes"] == [{"t": "Nada para revisar (mudanças não commitadas).", "l": "info"}]


def test_outside_git_notifies_an_error_and_sends_nothing(review_out: dict) -> None:
    h = review_out["hPlain"]
    assert h["sent"] == 0 and h["notes"] == [{"t": "Esta pasta não é um repositório git.", "l": "error"}]


def test_a_dirty_repository_writes_the_diff_to_a_temp_folder_and_sends_the_review(review_out: dict) -> None:
    h = review_out["hDirty"]
    assert h["prompt"] is True and h["inTemp"] is True and h["folderExists"] is True
    assert "const a = 2;" in h["diffText"] and h["deliverAs"] is None
    assert h["notes"][0] == {"t": "Revisando mudanças não commitadas: 2 arquivo(s).", "l": "info"}


def test_a_busy_agent_gets_the_review_as_a_follow_up(review_out: dict) -> None:
    h = review_out["hBusy"]
    assert h["sent"] == 1 and h["deliverAs"] == "followUp"


def test_an_invalid_ref_notifies_an_error_and_sends_nothing(review_out: dict) -> None:
    h = review_out["hBadRef"]
    assert h["sent"] == 0 and h["notes"] == [{"t": "Referência inválida: -x", "l": "error"}]


def test_a_branch_and_a_focus_reach_the_prompt(review_out: dict) -> None:
    h = review_out["hBranch"]
    assert h["sent"] == 1 and h["focus"] is True and h["label"] is True and h["notes"][0]["t"].startswith("Revisando mudanças desde main")


def test_session_shutdown_removes_the_review_folders(review_out: dict) -> None:
    assert review_out["shutdown"]["dirs"] >= 2 and review_out["shutdown"]["removed"] is True


def test_a_failure_to_make_the_temp_folder_is_notified_and_sends_nothing(review_out: dict) -> None:
    h = review_out["hErr"]
    # BUG candidate: o handler não tem try/catch em volta do mkdtempSync/writeFileSync (pink-review.ts, handler)
    assert h["threw"] is False and h["sent"] == 0 and h["notes"] and h["notes"][-1]["l"] == "error"


def test_session_start_sweeps_only_old_review_folders(review_out: dict) -> None:
    s = review_out["sweep"]
    assert s["oldRemoved"] is True and s["newKept"] is True and s["otherKept"] is True


def test_the_subagent_registers_nothing(review_out: dict) -> None:
    assert review_out["subagent"] == {"commands": [], "events": []}


# ================================================================================================ build: o revisor e o --no-mcp
def test_the_built_revisor_is_set_once_last_with_exactly_four_read_only_tools(package_dir: Path) -> None:
    text = (package_dir / "examples" / "extensions" / "subagent" / "agents.ts").read_text(encoding="utf-8")
    assert text.count('agentMap.set("revisor"') == 1
    pos = text.index('agentMap.set("revisor"')
    others = [m.start() for m in re.finditer(r"agentMap\.set\(", text) if m.start() != pos]
    assert all(o < pos for o in others), "outro agentMap.set depois do revisor: um arquivo poderia trocá-lo"
    ret = text.index("return { agents: Array.from(agentMap.values())")
    assert pos < ret
    m = re.search(r'agentMap\.set\("revisor",.*?tools:\s*\[([^\]]*)\]', text, re.S)
    assert m is not None and re.findall(r'"([^"]+)"', m.group(1)) == ["read", "grep", "find", "ls"]


def test_a_tool_list_without_mcp_gets_no_mcp_in_the_built_subagent(package_dir: Path) -> None:
    index = (package_dir / "examples" / "extensions" / "subagent" / "index.ts").read_text(encoding="utf-8")
    assert 'args.push("--no-mcp")' in index and 'agent.tools.some((tool) => tool.startsWith("mcp__"))' in index
    assert index.index('args.push("--no-mcp")') > index.index('args.push("--tools", agent.tools.join(","))')
