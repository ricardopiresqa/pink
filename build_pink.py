# ruff: noqa: E501
"""Pink (F50): constroi o fork do Pi a partir do tarball FIXADO do npm, aplicando ``rebrand.json`` com contagens exatas.

1. baixa ``@earendil-works/pi-coding-agent@<versao fixada>`` (``npm pack``) e confere o ``integrity`` sha512 de ``upstream.json``;
2. extrai, aplica ``rebrand.json`` (package.json, arquivos adicionados, renomeacao de variaveis de ambiente, substituicoes de texto) e FALHA se qualquer
   substituicao nao aplicar exatamente o numero de vezes esperado (o codigo do Pi mudou: o patch precisa ser revisto);
3. empacota ``thothdev-pink-<versao>.tgz`` (``npm pack``).

O codigo do Pi nunca e copiado para o repositorio: o fork e ESTE patch, reproduzivel e verificavel. Uso:
    python -X utf8 pink/build_pink.py [--out pink/out] [--cache pink/.cache] [--no-pack]
"""

from __future__ import annotations

import base64
import glob
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent


class PatchError(Exception):
    """A patch did not apply as specified (wrong count, missing file, bad integrity). The message says which one."""


def integrity_of(path: Path) -> str:
    digest = hashlib.sha512()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return "sha512-" + base64.b64encode(digest.digest()).decode("ascii")


def npm() -> str:
    found = shutil.which("npm")
    if not found:
        raise PatchError("npm not found on PATH")
    return found


def fetch_upstream(upstream: dict[str, Any], cache: Path) -> Path:
    """Download (or reuse) the pinned tarball and verify its integrity against the pin."""
    cache.mkdir(parents=True, exist_ok=True)
    spec = f"{upstream['package']}@{upstream['version']}"
    expected_name = f"{upstream['package'].lstrip('@').replace('/', '-')}-{upstream['version']}.tgz"  # npm pack names a scoped package scope-name-version.tgz
    target = cache / expected_name
    if not target.is_file():
        done = subprocess.run([npm(), "pack", spec, "--pack-destination", str(cache), "--silent"], capture_output=True, text=True, timeout=300, check=False)
        if done.returncode != 0 or not target.is_file():
            raise PatchError(f"npm pack {spec} failed: {(done.stderr or done.stdout)[-300:]}")
    actual = integrity_of(target)
    if actual != upstream["integrity"]:
        target.unlink(missing_ok=True)
        raise PatchError(f"integrity mismatch for {spec}: pinned {upstream['integrity'][:24]}..., got {actual[:24]}...")
    return target


def extract(tarball: Path, destination: Path) -> Path:
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    with tarfile.open(tarball, "r:gz") as archive:
        for member in archive.getmembers():
            name = Path(member.name)
            if name.is_absolute() or ".." in name.parts or not member.name.startswith("package/"):
                raise PatchError(f"unsafe tar member: {member.name}")
        archive.extractall(destination)  # noqa: S202 - members validated above
    return destination / "package"


def _files(root: Path, patterns: list[str], exclude: list[str] | None = None) -> list[Path]:
    found: set[Path] = set()
    for pattern in patterns:
        found.update(Path(item) for item in glob.glob(str(root / pattern), recursive=True) if Path(item).is_file())
    skip = {(root / item).resolve() for item in exclude or () if "*" not in item}
    for pattern in (item for item in exclude or () if "*" in item):
        skip.update(Path(item).resolve() for item in glob.glob(str(root / pattern), recursive=True))
    return sorted(path for path in found if path.resolve() not in skip)


def apply_replacements(root: Path, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    report = []
    for item in items:
        path = root / item["file"]
        if not path.is_file():
            raise PatchError(f"{item['id']}: file not found: {item['file']}")
        text = path.read_text(encoding="utf-8")
        if item.get("regex"):
            new, count = re.subn(item["find"], item["replace"], text)
        else:
            count = text.count(item["find"])
            new = text.replace(item["find"], item["replace"])
        if count != item["count"]:
            raise PatchError(f"{item['id']}: expected {item['count']} replacement(s) in {item['file']}, applied {count}")
        path.write_text(new, encoding="utf-8", newline="")
        report.append({"id": item["id"], "file": item["file"], "count": count})
    return report


# shortcut: linha que começa com * conta como comentário (também *gerador() ou markdown dentro de string); hoje só
# regras de texto usam comments_only. Se uma regra for tocar algo assim, trocar por um tokenizador de JS.
COMMENT_LINE = re.compile(r"(?m)^[ \t]*(?://|/?\*).*$")


def apply_env_rename(root: Path, rule: dict[str, Any]) -> dict[str, Any]:
    total, touched = 0, []
    pattern = re.compile(rule["regex"])
    for path in _files(root, rule["files"], rule.get("exclude")):
        text = path.read_text(encoding="utf-8")
        if rule.get("comments_only"):
            # só linhas inteiras de comentário (//, /*, *): o `pi` minúsculo no código é o objeto da API das extensões
            hits = [0]

            def in_comment(line: re.Match[str], hits: list[int] = hits) -> str:
                changed, n = pattern.subn(rule["replace"], line.group(0))
                hits[0] += n
                return changed

            new = COMMENT_LINE.sub(in_comment, text)
            count = hits[0]
        else:
            new, count = pattern.subn(rule["replace"], text)
        if count:
            path.write_text(new, encoding="utf-8", newline="")
            total += count
            touched.append(str(path.relative_to(root)).replace("\\", "/"))
    name = rule.get("id", "env_rename")
    if total < rule["min_count"]:
        raise PatchError(f"{name}: expected at least {rule['min_count']} renames, applied {total}")
    return {"id": name, "count": total, "files": touched}


def apply_package_json(root: Path, rule: dict[str, Any]) -> dict[str, Any]:
    path = root / "package.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for key, value in rule["set"].items():
        data[key] = value
    # versão corrigida de dependência com alerta de segurança, sem esperar o upstream
    data["dependencies"] = {**data.get("dependencies", {}), **rule.get("dependencies", {})}
    # opcionais: se não instalarem (node-pty compila no Linux), o Pink instala e roda sem a lateral de sessões
    if rule.get("optionalDependencies"):
        data["optionalDependencies"] = {**data.get("optionalDependencies", {}), **rule["optionalDependencies"]}
    files = list(data.get("files", []))
    for extra in rule.get("files_add", ()):
        if extra not in files:
            files.append(extra)
    data["files"] = files
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"id": "package_json", "name": data["name"], "version": data["version"], "bin": data["bin"]}


def apply_shrinkwrap(root: Path, rule: dict[str, Any], package: dict[str, Any]) -> dict[str, Any]:
    path = root / rule["file"]
    data = json.loads(path.read_text(encoding="utf-8"))
    data["name"], data["version"] = package["name"], package["version"]
    if "" in data.get("packages", {}):
        data["packages"][""].update({"name": package["name"], "version": package["version"], "bin": package["bin"]})
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"id": "shrinkwrap", "file": rule["file"]}


def add_files(root: Path, items: list[dict[str, Any]], source: Path) -> list[dict[str, Any]]:
    report = []
    for item in items:
        origin, target = source / item["from"], root / item["to"]
        if not origin.is_file():
            raise PatchError(f"add_files: missing source {item['from']}")
        if target.exists() and not item.get("overwrite"):
            raise PatchError(f"add_files: {item['to']} already exists in the upstream package")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origin, target)
        report.append({"id": "add_file", "to": item["to"]})
    return report


def apply_spec(root: Path, spec: dict[str, Any], source: Path = HERE) -> list[dict[str, Any]]:
    """Apply the whole rebrand to an extracted package directory. Order matters only for the text replacements, which run before the environment rename."""
    report = [apply_package_json(root, spec["package_json"])]
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    report += add_files(root, spec["add_files"], source)
    report += apply_replacements(root, spec["replacements"])
    report.append(apply_env_rename(root, spec["env_rename"]))
    # a documentação que o modelo lê (docs/, README): o nome do produto e os caminhos, em vários arquivos de uma vez
    report += [apply_env_rename(root, rule) for rule in spec.get("doc_renames", ())]
    # arquivos com o nome do Pi (os links já foram trocados pelas regras acima) e os que não servem ao Pink
    for item in spec.get("move_files", ()):
        origin, target = root / item["from"], root / item["to"]
        if not origin.is_file() or target.exists():
            raise PatchError(f"move_files: cannot move {item['from']} to {item['to']}")
        origin.rename(target)
        report.append({"id": "move_file", "from": item["from"], "to": item["to"]})
    for name in spec.get("remove_files", ()):
        if not (root / name).is_file():
            raise PatchError(f"remove_files: {name} not found")
        (root / name).unlink()
        report.append({"id": "remove_file", "file": name})
    if spec.get("shrinkwrap"):
        report.append(apply_shrinkwrap(root, spec["shrinkwrap"], package))
    return report


def build(out: Path, cache: Path, *, pack: bool = True) -> dict[str, Any]:
    out, cache = out.resolve(), cache.resolve()  # npm pack runs inside the package directory: a relative destination would point there
    spec = json.loads((HERE / "rebrand.json").read_text(encoding="utf-8"))
    upstream = json.loads((HERE / spec["upstream"]).read_text(encoding="utf-8"))
    tarball = fetch_upstream(upstream, cache)
    work = out / "work"
    package_dir = extract(tarball, work)
    report = apply_spec(package_dir, spec)
    result: dict[str, Any] = {"upstream": f"{upstream['package']}@{upstream['version']}", "upstream_integrity": upstream["integrity"], "patches": report, "package_dir": str(package_dir)}
    if pack:
        done = subprocess.run([npm(), "pack", "--pack-destination", str(out), "--silent"], cwd=package_dir, capture_output=True, text=True, timeout=300, check=False)
        name = (done.stdout or "").strip().splitlines()[-1] if done.returncode == 0 and (done.stdout or "").strip() else ""
        if not name or not (out / name).is_file():
            raise PatchError(f"npm pack failed: {(done.stderr or done.stdout)[-300:]}")
        result["tarball"] = str(out / name)
        result["tarball_integrity"] = integrity_of(out / name)
    return result


def main(argv: list[str]) -> int:
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else HERE / "out"
    cache = Path(argv[argv.index("--cache") + 1]) if "--cache" in argv else HERE / ".cache"
    try:
        result = build(out, cache, pack="--no-pack" not in argv)
    except PatchError as exc:
        print(json.dumps({"status": "FAILED", "error": str(exc)}), file=sys.stderr)
        return 2
    print(json.dumps({"status": "BUILT", **{key: value for key, value in result.items() if key != "patches"}, "patches": len(result["patches"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
