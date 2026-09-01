import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import markdown
import yaml

from db import meta_get, open_db

SKIP_DIRS = {".obsidian", ".trash", ".git", ".smart-env"}
MAX_BYTES = 5 * 1024 * 1024
WIKI = re.compile(r"(!)?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]")
WEEK_ID = re.compile(r"^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$")
YEAR_ID = re.compile(r"^\d{4}$")
MONTH_ID = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
DAY_ID = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ISO_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
ATX = re.compile(r"^#\s+(.+)$", re.M)
SAFE_TITLE = re.compile(r"^[^/\\:\0]{1,120}$")


def vault_root() -> Path:
    root = Path(os.environ.get("VAULT_PATH", "/data/vault")).resolve()
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


def period_rel(ident: str) -> str | None:
    if YEAR_ID.match(ident):
        return f"Calendar/Yearly/{ident}.md"
    if MONTH_ID.match(ident):
        return f"Calendar/Monthly/{ident}.md"
    if WEEK_ID.match(ident):
        return f"Calendar/Weekly/{ident}.md"
    if DAY_ID.match(ident):
        return f"Calendar/Daily/{ident}.md"
    return None


def safe_rel(rel: str, *, md_only: bool = True) -> Path:
    rel = (rel or "").replace("\\", "/").lstrip("/")
    if not rel or len(rel) > 400 or "\0" in rel:
        raise ValueError("bad path")
    parts = Path(rel).parts
    if ".." in parts or any(p in SKIP_DIRS for p in parts):
        raise ValueError("bad path")
    if md_only and not rel.lower().endswith(".md"):
        raise ValueError("md only")
    return assert_inside(vault_root(), vault_root() / rel)


def list_tree() -> list[dict]:
    root = vault_root()
    out = []
    for path in sorted(root.rglob("*.md")):
        if path.is_symlink() or not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        try:
            assert_inside(root, path)
        except ValueError:
            continue
        s = str(rel).replace("\\", "/")
        folder = str(Path(s).parent).replace("\\", "/")
        out.append({"path": s, "name": path.stem, "folder": "" if folder == "." else folder})
    return out


def read_file(rel: str) -> dict:
    full = safe_rel(rel)
    if not full.is_file():
        raise FileNotFoundError(rel)
    return {"path": rel.replace("\\", "/").lstrip("/"), "raw": full.read_text(encoding="utf-8")}


def write_file(rel: str, raw: str) -> dict:
    if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_BYTES:
        raise ValueError("raw")
    full = safe_rel(rel)
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(raw, encoding="utf-8")
    rebuild()
    return {"path": rel.replace("\\", "/").lstrip("/"), "raw": raw}


def _write_stub(rel: str, title: str) -> None:
    full = safe_rel(rel)
    if full.exists():
        return
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(f"# {title}\n\n", encoding="utf-8")


def _append_wiki(rel: str, target: str) -> None:
    full = safe_rel(rel)
    if not full.is_file():
        return
    text = full.read_text(encoding="utf-8")
    if f"[[{target}]]" in text:
        return
    if text and not text.endswith("\n"):
        text += "\n"
    full.write_text(text + f"- [[{target}]]\n", encoding="utf-8")


def _week_month_year(ident: str) -> tuple[str, str]:
    y, w = int(ident[:4]), int(ident[6:])
    jan4 = datetime(y, 1, 4, tzinfo=timezone.utc)
    monday = jan4 - timedelta(days=jan4.isoweekday() - 1) + timedelta(weeks=w - 1)
    thu = monday + timedelta(days=3)
    return thu.strftime("%Y-%m"), str(thu.year)


def _ensure_period_files(ident: str) -> str:
    rel = period_rel(ident)
    if not rel:
        raise ValueError("not a period")
    _write_stub(rel, ident)
    if DAY_ID.match(ident):
        dt = datetime.strptime(ident, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        iso = dt.isocalendar()
        week = f"{iso[0]}-W{iso[1]:02d}"
        month, year = ident[:7], ident[:4]
        _write_stub(period_rel(week), week)
        _write_stub(period_rel(month), month)
        _write_stub(period_rel(year), year)
        _append_wiki(period_rel(week), ident)
        _append_wiki(period_rel(month), week)
        _append_wiki(period_rel(year), month)
    elif WEEK_ID.match(ident):
        month, year = _week_month_year(ident)
        _write_stub(period_rel(month), month)
        _write_stub(period_rel(year), year)
        _append_wiki(period_rel(month), ident)
        _append_wiki(period_rel(year), month)
    elif MONTH_ID.match(ident):
        year = ident[:4]
        _write_stub(period_rel(year), year)
        _append_wiki(period_rel(year), ident)
    return rel


def ensure_period(ident: str) -> dict:
    ident = (ident or "").strip()
    if not ident or len(ident) > 32:
        raise ValueError("id")
    rel = period_rel(ident)
    if not rel:
        raise ValueError("not a period")
    if (vault_root() / rel).is_file():
        return resolve_target(ident)
    _ensure_period_files(ident)
    rebuild()
    return resolve_target(ident)


def create_note(title: str, folder: str = "Inbox", link: str | None = None) -> dict:
    title = (title or "").strip()
    if not SAFE_TITLE.match(title):
        raise ValueError("title")
    folder = (folder or "Inbox").replace("\\", "/").strip("/")
    if folder and (".." in folder.split("/") or any(p in SKIP_DIRS for p in folder.split("/"))):
        raise ValueError("folder")
    rel = f"{folder}/{title}.md" if folder else f"{title}.md"
    _write_stub(rel, title)
    if link:
        link = link.strip()
        if period_rel(link):
            _ensure_period_files(link)
            _append_wiki(period_rel(link), title)
    rebuild()
    return resolve_target(title)
