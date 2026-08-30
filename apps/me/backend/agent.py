import asyncio
import json
import os
import shutil
from pathlib import Path

DIR = Path(os.environ.get("PI_CODING_AGENT_DIR", "/data/pi"))
CWD = Path(os.environ.get("AGENT_CWD") or os.environ.get("VAULT_PATH", "/data/vault"))
SESSION_DIR = DIR / "sessions"
AGENTS = DIR / "AGENTS.md"

SYSTEM = """You live in this container. Your working directory is the Obsidian vault at /data/vault.
Read and mutate that folder freely — notes, folders, .obsidian, inbox, anything in the vault.
Do not modify /app (the website image). No SpaceX or company content.
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
    if not AGENTS.exists():
        AGENTS.write_text(SYSTEM, encoding="utf-8")


def _pi() -> str:
    return shutil.which("pi") or ""


def available() -> bool:
    return bool(_pi())


async def run(message: str):
    if not available():
        yield {"type": "error", "message": "pi is not installed in this container."}
        return
    bootstrap()
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
        str(SESSION_DIR),
        "--name",
        "wall",
        "--approve",
        "--no-extensions",
        "--thinking",
        "high",
        message,
    ]
    if any(SESSION_DIR.rglob("*.jsonl")):
        cmd.insert(-1, "-c")
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
