"""Converte uma sessão do Claude Code (~/.claude/projects/<pasta>/<id>.jsonl) numa sessão do Pink (formato v3).

Uso: python tools/importar_claude.py <sessao.jsonl> [--destino <pasta de sessões do Pink>]

- Segue só a conversa principal: do último recado para trás pelo parentUuid (rebobinadas e subagentes ficam fora).
- Cada resumo de compactação do Claude vira uma entrada "compaction" do Pink: o contexto do modelo começa no último
  resumo, e o histórico anterior continua no arquivo.
- O raciocínio do Claude fica fora (a assinatura só vale na Anthropic). As ferramentas mantêm o nome original.
"""
import argparse, json, re, secrets, sys, uuid
from datetime import datetime
from pathlib import Path

MAX_RESULT = 20_000  # shortcut: saída de ferramenta cortada em 20 mil caracteres; aumentar se o modelo sentir falta do resto
REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
ZERO = {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 0,
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0}}


def ms(stamp):
    return int(datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp() * 1000)


def text_of(content):
    if isinstance(content, str):
        return content
    parts = []
    for block in content or []:
        if block.get("type") == "text":
            parts.append(block.get("text", ""))
        elif block.get("type") == "image":
            parts.append("[imagem omitida na importação]")
    return "\n".join(parts)


def main_chain(entries):
    """A conversa principal, do começo ao fim, andando para trás a partir da última fala."""
    by_id = {e["uuid"]: e for e in entries if e.get("uuid")}
    pos = {e["uuid"]: i for i, e in enumerate(entries) if e.get("uuid")}
    last = next((e for e in reversed(entries) if e.get("type") in ("user", "assistant") and not e.get("isSidechain")), None)
    chain, seen, cur = [], set(), last
    while cur and cur["uuid"] not in seen:
        seen.add(cur["uuid"])
        chain.append(cur)
        link = cur.get("parentUuid") or cur.get("logicalParentUuid")
        nxt = by_id.get(link or "")
        if nxt is None and link:  # compactação cujo pai não ficou no arquivo: segue pela linha anterior da conversa principal
            nxt = next((e for e in reversed(entries[:pos[cur["uuid"]]]) if e.get("uuid") and not e.get("isSidechain")), None)
        cur = nxt
    return [e for e in reversed(chain) if e.get("type") in ("user", "assistant") and not e.get("isMeta")]


def convert(entries):
    """Devolve (cwd, primeiro timestamp, entradas do Pink sem o cabeçalho)."""
    chain = main_chain(entries)
    if not chain:
        raise SystemExit("sessão sem conversa principal")
    out, tool_names, pending_compaction = [], {}, None
    parent = None

    def add(entry):
        nonlocal parent, pending_compaction
        entry.update(id=secrets.token_hex(4), parentId=parent)
        out.append(entry)
        parent = entry["id"]
        if pending_compaction is not None and entry["type"] == "message":
            pending_compaction["firstKeptEntryId"] = entry["id"]
            pending_compaction = None

    for e in chain:
        msg, stamp = e.get("message") or {}, e["timestamp"]
        if e.get("isCompactSummary"):
            pending_compaction = {"type": "compaction", "timestamp": stamp, "summary": text_of(msg.get("content")),
                                  "firstKeptEntryId": "", "tokensBefore": 0}
            add(pending_compaction)
            continue
        content = msg.get("content")
        if e["type"] == "assistant":
            blocks = []
            for b in content or []:
                if b.get("type") == "text" and b.get("text", "").strip():
                    blocks.append({"type": "text", "text": b["text"]})
                elif b.get("type") == "tool_use":
                    tool_names[b["id"]] = b.get("name", "")
                    blocks.append({"type": "toolCall", "id": b["id"], "name": b.get("name", ""), "arguments": b.get("input") or {}})
            if not blocks:
                continue
            prev = out[-1]["message"] if out and out[-1]["type"] == "message" else None
            if prev and prev["role"] == "assistant" and prev.get("responseId") == msg.get("id"):
                prev["content"].extend(blocks)  # o Claude grava um bloco por linha; o Pink, a resposta inteira
                prev["stopReason"] = "toolUse" if any(b["type"] == "toolCall" for b in prev["content"]) else "stop"
                continue
            add({"type": "message", "timestamp": stamp, "message": {
                "role": "assistant", "content": blocks, "api": "anthropic-messages", "provider": "anthropic",
                "model": msg.get("model", "claude"), "responseId": msg.get("id"), "usage": ZERO,
                "stopReason": "toolUse" if any(b["type"] == "toolCall" for b in blocks) else "stop", "timestamp": ms(stamp)}})
            continue
        results = [b for b in content if b.get("type") == "tool_result"] if isinstance(content, list) else []
        for b in results:
            body = text_of(b.get("content"))
            if len(body) > MAX_RESULT:
                body = body[:MAX_RESULT] + f"\n[... cortado na importação: {len(body) - MAX_RESULT} caracteres]"
            add({"type": "message", "timestamp": stamp, "message": {
                "role": "toolResult", "toolCallId": b["tool_use_id"], "toolName": tool_names.get(b["tool_use_id"], ""),
                "content": [{"type": "text", "text": body}], "isError": bool(b.get("is_error")), "timestamp": ms(stamp)}})
        if results:
            continue
        text = REMINDER.sub("", text_of(content)).strip()
        if text:
            add({"type": "message", "timestamp": stamp, "message": {"role": "user", "content": [{"type": "text", "text": text}], "timestamp": ms(stamp)}})
    if out and out[-1] is pending_compaction:
        out.pop()  # resumo sem nada depois não serve de ponto de corte
    return chain[0].get("cwd") or str(Path.cwd()), chain[0]["timestamp"], out


def session_dir(base, cwd):
    return base / ("--" + re.sub(r"[:\\/]", "-", cwd.strip("\\/")) + "--")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Converte uma sessão do Claude Code numa sessão do Pink")
    ap.add_argument("sessao", type=Path)
    ap.add_argument("--destino", type=Path, default=Path.home() / ".pink" / "agent" / "sessions")
    args = ap.parse_args(argv)
    entries = []
    for line in args.sessao.open(encoding="utf-8"):
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue  # linha cortada no fim do arquivo (sessão ainda aberta)
    cwd, first, body = convert(entries)
    sid = str(getattr(uuid, "uuid7", uuid.uuid4)())
    header = {"type": "session", "version": 3, "id": sid, "timestamp": first, "cwd": cwd}
    folder = session_dir(args.destino, cwd)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{first.replace(':', '-').replace('.', '-')}_{sid}.jsonl"
    with target.open("w", encoding="utf-8", newline="\n") as fh:
        for entry in [header, *body]:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    kinds = {}
    for e in body:
        key = e["message"]["role"] if e["type"] == "message" else e["type"]
        kinds[key] = kinds.get(key, 0) + 1
    print(json.dumps({"arquivo": str(target), "pasta_do_projeto": cwd, "entradas": kinds}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
