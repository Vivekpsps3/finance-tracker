import re
from datetime import datetime, timezone
from pathlib import Path

from db import open_db
from facts import BIRTHDAY, LIFE_YEARS

WEEK_ID = re.compile(r"^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$")
YEAR_ID = re.compile(r"^\d{4}$")
MONTH_ID = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
DAY_ID = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_KINDS = (
    ("yearly", "Calendar/Yearly/", YEAR_ID),
    ("monthly", "Calendar/Monthly/", MONTH_ID),
    ("weekly", "Calendar/Weekly/", WEEK_ID),
    ("daily", "Calendar/Daily/", DAY_ID),
)


def week_id(year: int, week: int) -> str:
    return f"{year}-W{week:02d}"


def iso_week(iso_day: str) -> tuple[int, int]:
    y, m, d = (int(p) for p in iso_day.split("-"))
    cal = datetime(y, m, d, tzinfo=timezone.utc).isocalendar()
    return cal[0], cal[1]


def classify(path: str) -> tuple[str, str] | None:
    p = path.replace("\\", "/")
    for kind, prefix, rx in _KINDS:
        if p.startswith(prefix):
            stem = Path(p).stem
            return (kind, stem) if rx.match(stem) else None
    if p.startswith("Calendar/Miscellaneous/") and p.lower().endswith(".md"):
        return "misc", Path(p).stem
    return None


def _links() -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    outs: dict[str, list[str]] = {}
    ins: dict[str, list[str]] = {}
    rows = open_db().execute(
        """SELECT links.src_path, links.target, notes.title
           FROM links LEFT JOIN notes ON notes.path = links.src_path"""
    ).fetchall()
    for r in rows:
        outs.setdefault(r["src_path"], []).append(r["target"])
        key = r["target"].removesuffix(".md")
        label = r["title"] or Path(r["src_path"]).stem
        ins.setdefault(key, []).append(label)
    return outs, ins


def _take(xs: list[str], ident: str) -> list[str]:
    out, seen = [], set()
    for x in xs:
        if not x or x == ident or x in seen:
            continue
        seen.add(x)
        out.append(x)
        if len(out) == 4:
            break
    return out


def _bucket(ident: str) -> tuple[str, str] | None:
    if YEAR_ID.match(ident):
        return "yearly", ident
    if MONTH_ID.match(ident):
        return "monthly", ident
    if WEEK_ID.match(ident):
        return "weekly", ident
    if DAY_ID.match(ident):
        return "daily", ident
    return None


def project_life(today: datetime | None = None) -> dict:
    today = today or datetime.now(timezone.utc)
    day = today.strftime("%Y-%m-%d")
    iso_y, w = iso_week(day)
    outs, ins = _links()
    yearly, monthly, weekly, daily, misc = {}, {}, {}, {}, []
    buckets = {"yearly": yearly, "monthly": monthly, "weekly": weekly, "daily": daily}
    seen: set[str] = set()
    for row in open_db().execute("SELECT path, title FROM notes").fetchall():
        hit = classify(row["path"])
        if not hit:
            continue
        kind, ident = hit
        refs = _take(outs.get(row["path"], []) + ins.get(ident, []), ident)
        rec = {"n": len(outs.get(row["path"], [])) + len(ins.get(ident, [])), "refs": refs}
        if kind == "misc":
            misc.append({"id": ident, "title": row["title"], **rec})
        else:
            buckets[kind][ident] = rec
        seen.add(ident)
    for ident, names in ins.items():
        if ident in seen or not names:
            continue
        hit = _bucket(ident)
        if hit:
            buckets[hit[0]][ident] = {"n": len(names), "refs": _take(names, ident)}
    born = int(BIRTHDAY[:4])
    return {
        "currentYear": today.year,
        "currentMonth": day[:7],
        "currentWeek": week_id(iso_y, w),
        "currentDay": day,
        "birthday": BIRTHDAY,
        "years": list(range(born, born + LIFE_YEARS + 1)),
        "yearly": yearly,
        "monthly": monthly,
        "weekly": weekly,
        "daily": daily,
        "misc": misc,
    }
