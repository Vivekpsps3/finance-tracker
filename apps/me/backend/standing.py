import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from db import meta_del, meta_get, meta_set
from vault import assert_inside, copy_root, rebuild

FALLBACK = ["What should I remember?"]
INBOX = re.compile(r"^inbox/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{8}\.md$")
REFUSE_RE = re.compile(r"\bspacex\b|\bspace[\s-]?x\b|\bcompany\b", re.I)
REFUSE = "Company and SpaceX stay off this wall."
LOAD_ERROR = "Can't load the question. Rebuild the index."


def refused(text: str) -> bool:
    return bool(REFUSE_RE.search(text))


def load_bank() -> list[str]:
    root = copy_root()
    path = assert_inside(root, root / "questions.md")
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return FALLBACK
    questions = []
    for line in raw.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        questions.append(re.sub(r"^[-*]\s+", "", trimmed))
    return questions or FALLBACK


def get_used() -> list[str]:
    raw = meta_get("standing.used")
    return json.loads(raw) if raw else []


def current() -> dict:
    try:
        pending_raw = meta_get("standing.pending")
        if pending_raw:
            pending = json.loads(pending_raw)
            return {
                "status": "pending",
                "question": pending["qid"],
                "qid": pending["qid"],
                "pending": {"id": pending["id"], "path": pending["path"], "body": pending["body"]},
            }
        bank = load_bank()
        used = get_used()
        qid = next((q for q in bank if q not in used), None)
        if not qid:
            meta_del("standing.used")
            qid = bank[0]
        return {"status": "idle", "question": qid, "qid": qid, "pending": None}
    except Exception:
        return {"status": "error", "question": "", "qid": "", "pending": None, "message": LOAD_ERROR}


def skip() -> dict:
    now = current()
    if now["qid"]:
        used = get_used()
        used.append(now["qid"])
        meta_set("standing.used", json.dumps(used))
    return current()


def answer(text: str) -> dict:
    now = current()
    if refused(text) or refused(now["question"]):
        return {"status": "refuse", "question": now["question"], "qid": now["qid"], "pending": None, "message": REFUSE}
    uid = str(uuid.uuid4())
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    hex8 = uid.replace("-", "")[:8]
    rel = f"inbox/{day}-{hex8}.md"
    body = f"# {now['question']}\n\n{text}"
    meta_set("standing.pending", json.dumps({"id": uid, "qid": now["qid"], "path": rel, "body": body}))
    return current()


def apply(rel: str, body: str) -> None:
    if not INBOX.match(rel):
        raise ValueError(f"not an inbox note: {rel}")
    root = copy_root()
    full = assert_inside(root, root / rel)
    if full.is_symlink() or Path(str(full) + ".tmp").is_symlink():
        raise ValueError(f"symlink refused: {full}")
    full.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(full) + ".tmp")
    tmp.write_text(body, encoding="utf-8")
    tmp.replace(full)
    rebuild()


def decide(uid: str, decision: str) -> dict:
    raw = meta_get("standing.pending")
    pending = json.loads(raw) if raw else None
    if not pending or pending["id"] != uid:
        raise ValueError("standing pending mismatch")
    if decision == "approve":
        apply(pending["path"], pending["body"])
        used = get_used()
        used.append(pending["qid"])
        meta_set("standing.used", json.dumps(used))
        meta_del("standing.pending")
        return current()
    meta_del("standing.pending")
    return current()
