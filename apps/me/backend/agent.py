import asyncio
import json
import os
import re
import shutil
from pathlib import Path

import markdown

DIR = Path(os.environ.get("PI_CODING_AGENT_DIR", "/data/pi"))
CWD = Path("/data/vault")
SESSION_DIR = DIR / "sessions"

SYSTEM = """You live in this container. Your working directory is the Obsidian vault at /data/vault.
Read and mutate that folder freely — notes, folders, .obsidian, inbox, anything in the vault.
Do not modify /app (the website image).
Use read, write, edit, and bash. Keep wall answers short.
"""


def bootstrap() -> None:
    DIR.mkdir(parents=True, exist_ok=True)
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    CWD.mkdir(parents=True, exist_ok=True)
    (DIR / "models.json").write_text(
        json.dumps(
            {
                "providers": {
                    "llama-swap": {
                        "baseUrl": os.environ.get("OPENAI_BASE_URL", "http://127.0.0.1:8999/v1"),
                        "api": "openai-completions",
                        "apiKey": os.environ.get("OPENAI_API_KEY", "local"),
                        "compat": {
                            "supportsDeveloperRole": False,
                            "supportsReasoningEffort": False,
                            "thinkingFormat": "chat-template",
                            "chatTemplateKwargs": {"reasoning_strength": "xhigh"},
                        },
                        "models": [
                            {
                                "id": os.environ.get("OPENAI_MODEL", "muse-glimmer-30b-thinking"),
                                "name": "wall",
                                "reasoning": True,
                                "contextWindow": int(os.environ.get("OPENAI_CONTEXT_LENGTH", "131072")),
                                "maxTokens": 8192,
                            }
                        ],
                    }
                }
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (DIR / "settings.json").write_text(
        json.dumps({"defaultProjectTrust": "always"}),
        encoding="utf-8",
    )
    agents = DIR / "AGENTS.md"
    if not agents.exists():
        agents.write_text(SYSTEM, encoding="utf-8")


def _pi() -> str:
    return shutil.which("pi") or ""


def available() -> bool:
    return bool(_pi())


def _sessions() -> list[Path]:
    if not SESSION_DIR.is_dir():
        return []
    return sorted(SESSION_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime)


def _meta(path: Path) -> dict:
    sid = path.stem
    name = path.stem
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if ev.get("type") == "session" and ev.get("id"):
                sid = str(ev["id"])
            elif ev.get("type") == "session_info" and ev.get("name"):
                name = str(ev["name"])
    except OSError:
        pass
    return {"id": sid, "name": name, "file": path.name, "mtime": path.stat().st_mtime}


def sessions() -> list[dict]:
    bootstrap()
    return [_meta(p) for p in reversed(_sessions())]


def wall() -> Path | None:
    named = [p for p in _sessions() if _meta(p)["name"] == "wall"]
    if named:
        return named[-1]
    all_s = _sessions()
    return all_s[-1] if all_s else None


def resolve(sid: str | None) -> Path | None:
    all_s = _sessions()
    if not all_s:
        return None
    if sid:
        for p in all_s:
            m = _meta(p)
            if sid in {m["id"], m["name"], p.stem, p.name}:
                return p
    return wall()


def reset(sid: str | None = None) -> None:
    bootstrap()
    path = resolve(sid)
    if path:
        path.unlink(missing_ok=True)


def md(text: str) -> str:
    clean = re.sub(r"<script\b[\s\S]*?</script>", "", text, flags=re.I)
    clean = (
        clean.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return markdown.markdown(clean, extensions=["extra"])


def history(sid: str | None = None) -> list[dict]:
    bootstrap()
    path = resolve(sid)
    if not path:
        return []
    out: list[dict] = []
    try:
        rows = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    for raw in rows:
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if ev.get("type") != "message":
            continue
        msg = ev.get("message") or {}
        role = msg.get("role")
        content = msg.get("content") or []
        if role == "user":
            text = "".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
            if text:
                out.append({"kind": "user", "text": text})
        elif role == "assistant":
            for c in content:
                if isinstance(c, dict) and c.get("type") == "toolCall":
                    out.append({"kind": "tool", "name": c.get("name") or "tool", "text": ""})
            text = "".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
            if text:
                out.append({"kind": "assistant", "text": text, "html": md(text)})
    return out


async def run(
    message: str,
    *,
    name: str = "wall",
    session_dir: Path | None = None,
    session_id: str | None = None,
    fresh: bool = False,
):
    if not available():
        yield {"type": "error", "message": "pi is not installed in this container."}
        return
    bootstrap()
    sdir = session_dir or SESSION_DIR
    model = os.environ.get("OPENAI_MODEL", "muse-glimmer-30b-thinking")
    key = os.environ.get("OPENAI_API_KEY", "local")
    cmd = [
        _pi(),
        "--mode",
        "json",
        "--provider",
        "llama-swap",
        "--model",
        model,
        "--api-key",
        key,
        "--session-dir",
        str(sdir),
        "--name",
        name,
        "--approve",
        "--no-extensions",
        "--thinking",
        "high",
        message,
    ]
    path = None if fresh or session_dir is not None else resolve(session_id)
    if path:
        cmd[cmd.index(message):cmd.index(message)] = ["--session", str(path)]
    env = os.environ.copy()
    env["PI_CODING_AGENT_DIR"] = str(DIR)
    env["PI_SKIP_VERSION_CHECK"] = "1"
    env["PI_TELEMETRY"] = "0"
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(CWD),
        env=env,
    )
    assert proc.stdout
    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            raw = line.decode("utf-8", "replace").strip()
            if not raw:
                continue
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                yield {"type": "log", "message": raw[:400]}
                continue
            out = _map(ev)
            if out:
                yield out
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
    yield {"type": "done"}


def _map(ev: dict) -> dict | None:
    kind = ev.get("type")
    if kind == "message_update":
        delta = ev.get("assistantMessageEvent") or {}
        if delta.get("type") == "text_delta" and delta.get("delta"):
            return {"type": "text", "delta": delta["delta"]}
        if delta.get("type") == "toolcall_start":
            return {"type": "tool", "phase": "start", "name": delta.get("toolName", "tool")}
        return None
    if kind == "tool_execution_start":
        return {"type": "tool", "phase": "start", "name": ev.get("toolName", "tool"), "args": ev.get("args")}
    if kind == "tool_execution_end":
        result = ev.get("result") or {}
        text = ""
        content = result.get("content") if isinstance(result, dict) else None
        if isinstance(content, list) and content:
            text = str(content[0].get("text", ""))[:400]
        return {
            "type": "tool",
            "phase": "end",
            "name": ev.get("toolName", "tool"),
            "error": bool(ev.get("isError")),
            "text": text,
        }
    if kind in {"agent_settled", "agent_end"}:
        return None
    if kind == "extension_error":
        return {"type": "error", "message": ev.get("error") or "pi error"}
    return None
