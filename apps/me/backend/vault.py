import json
import os
import re
from pathlib import Path

import markdown
import yaml

from db import meta_get, open_db

SKIP_DIRS = {".obsidian", ".trash", ".git"}
MAX_BYTES = 5 * 1024 * 1024
WIKI = re.compile(r"(!)?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]")
WEEK_ID = re.compile(r"^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$")
ISO_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
ATX = re.compile(r"^#\s+(.+)$", re.M)


VAULT = "/data/vault"


def vault_root() -> Path:
    root = Path(VAULT).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def assert_inside(root: Path, candidate: Path) -> Path:
    full_root = root.resolve()
    full = candidate.resolve()
    if full != full_root and not str(full).startswith(str(full_root) + os.sep):
        raise ValueError(f"path escapes vault root: {candidate}")
    return full


def walk_md(root: Path) -> list[dict]:
    notes = []
    for path in root.rglob("*.md"):
        if path.is_symlink() or not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        try:
            assert_inside(root, path)
        except ValueError:
            continue
        st = path.stat()
        if st.st_size > MAX_BYTES:
            continue
        notes.append({"relPath": str(rel).replace("\\", "/"), "raw": path.read_text(encoding="utf-8"), "mtimeMs": int(st.st_mtime * 1000)})
    return notes


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    if not raw.startswith("---"):
        return {}, raw
    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw
    try:
        data = yaml.safe_load(parts[1]) or {}
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    return data, parts[2]


def parse_note(raw: str, rel_path: str) -> dict:
    data, body = parse_frontmatter(raw)
    title = data["title"] if isinstance(data.get("title"), str) and data["title"] else None
    if not title:
        m = ATX.search(body)
        title = m.group(1).strip() if m else Path(rel_path).stem
    dates = []
    for value in data.values():
        dates.extend(ISO_DAY.findall(value if isinstance(value, str) else str(value)))
    dates.extend(ISO_DAY.findall(body))
    links = [
        {"target": m.group(2), "alias": m.group(4), "heading": m.group(3), "embed": bool(m.group(1))}
        for m in WIKI.finditer(body)
    ]
    return {
        "path": rel_path,
        "title": title,
        "type": data["type"] if isinstance(data.get("type"), str) else None,
        "frontmatter": json.dumps(data, default=str),
        "body": body,
        "dates": json.dumps(dates),
        "links": links,
    }


def _esc(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_body(body: str, missing: set[str]) -> str:
    clean = re.sub(r"<script\b[\s\S]*?</script>", "", body, flags=re.I)
    clean = re.sub(r"<[^>]*>", "", clean)

    def repl(m: re.Match) -> str:
        target = m.group(2)
        label = m.group(4) or target
        miss = target in missing
        color = "text-mute" if miss else "text-ink"
        attr = " data-wiki-missing" if miss else ""
        return (
            f'<button type="button" data-wiki="{_esc(target)}"{attr} data-hit '
            f'class="chip {color}">{_esc(label)}</button>'
        )

    clean = WIKI.sub(repl, clean)
    return markdown.markdown(clean, extensions=["extra"])


def rebuild() -> dict:
    root = vault_root()
    notes = [{**parse_note(f["raw"], f["relPath"]), "mtimeMs": f["mtimeMs"]} for f in walk_md(root)]
    db = open_db()
    from datetime import datetime, timezone

    rebuilt_at = datetime.now(timezone.utc).isoformat()
    db.execute("DELETE FROM links")
    db.execute("DELETE FROM notes")
    for note in notes:
        db.execute(
            "INSERT INTO notes (path, title, type, frontmatter, body, dates, mtime_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (note["path"], note["title"], note["type"], note["frontmatter"], note["body"], note["dates"], note["mtimeMs"]),
        )
        for link in note["links"]:
            db.execute(
                "INSERT INTO links (src_path, target, alias, heading, embed) VALUES (?, ?, ?, ?, ?)",
                (note["path"], link["target"], link["alias"], link["heading"], 1 if link["embed"] else 0),
            )
    db.execute("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')")
    db.execute(
        "INSERT INTO index_meta (key, value) VALUES ('rebuiltAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (rebuilt_at,),
    )
    db.commit()
    return {"noteCount": len(notes), "rebuiltAt": rebuilt_at}


def status() -> dict:
    db = open_db()
    n = db.execute("SELECT COUNT(*) AS n FROM notes").fetchone()["n"]
    return {"noteCount": n, "rebuiltAt": meta_get("rebuiltAt")}


def _parse_fm(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _stem(path: str) -> str:
    return Path(path).name.replace(".md", "").replace(".MD", "")


def _has_alias(frontmatter: str, n: str) -> bool:
    aliases = _parse_fm(frontmatter).get("aliases")
    if isinstance(aliases, str):
        return aliases == n
    if isinstance(aliases, list):
        return n in aliases
    return False


def _pick(rows: list) -> dict | None:
    return rows[0] if len(rows) == 1 else None


def find_note(notes: list, n: str) -> dict | None:
    hit = _pick([r for r in notes if r["path"] == n or r["path"] == f"{n}.md"])
    if hit:
        return hit
    hit = _pick([r for r in notes if r["path"] == f"{n}.md" or r["path"].endswith(f"/{n}.md")])
    if hit:
        return hit
    hit = _pick([r for r in notes if r["title"] == n])
    if hit:
        return hit
    return _pick([r for r in notes if _has_alias(r["frontmatter"], n)])


def _backlinks(n: str, hit: dict | None) -> list:
    keys = {n, n.replace(".md", ""), _stem(n)}
    if hit:
        keys.add(hit["path"].replace(".md", ""))
        keys.add(_stem(hit["path"]))
    q = ",".join("?" * len(keys))
    rows = open_db().execute(
        f"""SELECT DISTINCT notes.path AS src, notes.title, notes.type
            FROM links JOIN notes ON notes.path = links.src_path
            WHERE links.target IN ({q})""",
        tuple(keys),
    ).fetchall()
    return [{"src": r["src"], "title": r["title"], "type": r["type"]} for r in rows]


def resolve_target(n: str) -> dict:
    notes = [dict(r) for r in open_db().execute("SELECT path, title, type, frontmatter, body FROM notes").fetchall()]
    hit = find_note(notes, n)
    if not hit:
        return {
            "missing": True,
            "target": n,
            "path": None,
            "title": n,
            "type": None,
            "fields": [],
            "bodyHtml": "",
            "backlinks": _backlinks(n, None),
        }
    missing = set()
    for m in WIKI.finditer(hit["body"]):
        t = m.group(2)
        if WEEK_ID.match(t):
            continue
        if not find_note(notes, t):
            missing.add(t)
    fields = []
    for key, value in _parse_fm(hit["frontmatter"]).items():
        if key in {"title", "type"}:
            continue
        fields.append({"key": key, "text": value if isinstance(value, str) else json.dumps(value)})
    return {
        "missing": False,
        "target": n,
        "path": hit["path"],
        "title": hit["title"],
        "type": hit["type"],
        "fields": fields,
        "bodyHtml": render_body(hit["body"], missing),
        "backlinks": _backlinks(n, hit),
    }
