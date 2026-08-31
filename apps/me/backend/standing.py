import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import agent
from db import meta_del, meta_get, meta_set
from vault import assert_inside, rebuild, vault_root

FALLBACK = "What should I remember?"
CURRENT = "standing.current"
PENDING = "standing.pending"
BUSY = "standing.busy"
INBOX = re.compile(r"^inbox/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{8}\.md$")
REFUSE_RE = re.compile(r"\bspacex\b|\bspace[\s-]?x\b|\bcompany\b", re.I)
REFUSE = "Company and SpaceX stay off this wall."
LOAD_ERROR = "Can't load the question. Rebuild the index."
PROMPT = (
    "Look through the vault at /home/vivek/Deployments/Vault. "
    "Invent one short, specific personal question for Vivek that would make a useful inbox note. "
    "Not about work, company, or SpaceX. Reply with ONLY the question."
)

_lock = asyncio.Lock()


def refused(text: str) -> bool:
    return bool(REFUSE_RE.search(text))


def busy() -> bool:
    return bool(meta_get(BUSY))


def current() -> dict:
    try:
        pending_raw = meta_get(PENDING)
        if pending_raw:
            pending = json.loads(pending_raw)
            return {
                "status": "pending",
                "question": pending["qid"],
                "qid": pending["qid"],
                "pending": {"id": pending["id"], "path": pending["path"], "body": pending["body"]},
            }
        qid = meta_get(CURRENT) or ""
        if qid:
            return {"status": "idle", "question": qid, "qid": qid, "pending": None}
        msg = "Thinking of a question…" if busy() else "No question yet."
        return {"status": "empty", "question": "", "qid": "", "pending": None, "message": msg}
    except Exception:
        return {"status": "error", "question": "", "qid": "", "pending": None, "message": LOAD_ERROR}


def clear() -> None:
    meta_del(CURRENT)


async def _invent() -> str:
    try:
        text = await agent.ask(PROMPT)
    except Exception:
        text = ""
    line = next((ln.strip().strip("\"'") for ln in text.splitlines() if ln.strip() and not ln.startswith("#")), "")
    if not line or refused(line):
        return FALLBACK
    return line[:240]


async def ensure(*, force: bool = False) -> dict:
    async with _lock:
        if meta_get(PENDING):
            return current()
        if not force and meta_get(CURRENT):
            return current()
        meta_set(BUSY, "1")
        try:
            meta_set(CURRENT, await _invent())
        finally:
            meta_del(BUSY)
        return current()


async def skip() -> dict:
    if meta_get(PENDING):
        return current()
    clear()
    return await ensure(force=True)


def answer(text: str) -> dict:
    now = current()
    if refused(text) or refused(now["question"]):
        return {"status": "refuse", "question": now["question"], "qid": now["qid"], "pending": None, "message": REFUSE}
    uid = str(uuid.uuid4())
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    hex8 = uid.replace("-", "")[:8]
    rel = f"inbox/{day}-{hex8}.md"
    body = f"# {now['question']}\n\n{text}"
    meta_set(PENDING, json.dumps({"id": uid, "qid": now["qid"], "path": rel, "body": body}))
    return current()


def apply(rel: str, body: str) -> None:
    if not INBOX.match(rel):
        raise ValueError(f"not an inbox note: {rel}")
    root = vault_root()
    full = assert_inside(root, root / rel)
    if full.is_symlink() or Path(str(full) + ".tmp").is_symlink():
        raise ValueError(f"symlink refused: {full}")
    full.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(full) + ".tmp")
    tmp.write_text(body, encoding="utf-8")
    tmp.replace(full)
    rebuild()


def decide(uid: str, decision: str) -> dict:
    raw = meta_get(PENDING)
    pending = json.loads(raw) if raw else None
    if not pending or pending["id"] != uid:
        raise ValueError("standing pending mismatch")
    if decision == "approve":
        apply(pending["path"], pending["body"])
        meta_del(PENDING)
        clear()
        return current()
    meta_del(PENDING)
    return current()
