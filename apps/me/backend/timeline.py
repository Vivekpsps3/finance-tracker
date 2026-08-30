import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from db import open_db

WEEK_ID = re.compile(r"^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$")
WEEK_STEM = re.compile(r"^(\d{4})-(?:\[W\]|W?)(0[1-9]|[1-4]\d|5[0-3])$")
DAY_STEM = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def week_id(year: int, week: int) -> str:
    return f"{year}-W{week:02d}"


def weeks_in_year(year: int) -> int:
    dow = datetime(year, 1, 1, tzinfo=timezone.utc).weekday()  # Mon=0
    # JS getUTCDay: Sun=0. Convert: (weekday+1)%7
    js_dow = (dow + 1) % 7
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    return 53 if js_dow == 4 or (js_dow == 3 and leap) else 52


def iso_week(iso_day: str) -> tuple[int, int]:
    y, m, d = (int(p) for p in iso_day.split("-"))
    date = datetime(y, m, d, tzinfo=timezone.utc)
    return date.isocalendar()[0], date.isocalendar()[1]


def week_range(wid: str) -> tuple[str, str]:
    if not WEEK_ID.match(wid):
        return "", ""
    year, week = int(wid[:4]), int(wid[6:])
    monday = datetime.fromisocalendar(year, week, 1).replace(tzinfo=timezone.utc)
    sunday = monday + timedelta(days=6)
    return monday.strftime("%Y-%m-%d"), sunday.strftime("%Y-%m-%d")


def _iso_day(value) -> str | None:
    if isinstance(value, str) and DAY_STEM.match(value[:10]):
        return value[:10]
    return None


def _weeks_between(start: str, end: str) -> list[str]:
    ids, seen = [], set()
    d = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    last = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
    if d > last:
        return ids
    while d <= last:
        y, w = d.isocalendar()[0], d.isocalendar()[1]
        i = week_id(y, w)
        if i not in seen:
            seen.add(i)
            ids.append(i)
        d += timedelta(days=1)
    return ids


def attach_weeks(note: dict) -> list[str]:
    if note.get("type") in {"era", "me"}:
        return []
    base = Path(note["path"]).name
    if base.lower() == "me.md":
        return []
    stem = Path(base).stem
    if WEEK_ID.match(stem):
        return [stem]
    m = WEEK_STEM.match(stem)
    if m:
        return [week_id(int(m.group(1)), int(m.group(2)))]
    if DAY_STEM.match(stem):
        y, w = iso_week(stem)
        return [week_id(y, w)]
    try:
        fm = json.loads(note["frontmatter"])
    except Exception:
        fm = {}
    if isinstance(fm.get("week"), str) and WEEK_ID.match(fm["week"]):
        return [fm["week"]]
    date = _iso_day(fm.get("date"))
    if date:
        y, w = iso_week(date)
        return [week_id(y, w)]
    start = _iso_day(fm.get("start"))
    if start:
        return _weeks_between(start, _iso_day(fm.get("end")) or start)
    return []


def list_notes() -> list[dict]:
    return [dict(r) for r in open_db().execute("SELECT path, title, type, frontmatter FROM notes").fetchall()]


def notes_for_week(wid: str) -> list[dict]:
    return [{"path": n["path"], "title": n["title"], "type": n["type"]} for n in list_notes() if wid in attach_weeks(n)]


def project_life(today: datetime | None = None) -> dict:
    today = today or datetime.now(timezone.utc)
    today_day = today.strftime("%Y-%m-%d")
    eras = []
    counts: dict[str, dict] = {}
    for note in list_notes():
        try:
            fm = json.loads(note["frontmatter"])
        except Exception:
            fm = {}
        typ = fm["type"] if isinstance(fm.get("type"), str) else note["type"]
        stem = Path(note["path"]).stem
        if typ == "me" or stem.lower() == "me":
            continue
        if typ == "era" and isinstance(fm.get("start"), str) and isinstance(fm.get("end"), str):
            if not (DAY_STEM.match(fm["start"]) and DAY_STEM.match(fm["end"]) and fm["end"] >= fm["start"]):
                continue
            y0, y1 = int(fm["start"][:4]), int(fm["end"][:4])
            eras.append({
                "id": stem,
                "slug": stem,
                "title": fm["title"] if isinstance(fm.get("title"), str) else note["title"],
                "start": fm["start"],
                "end": fm["end"],
                "years": list(range(y0, y1 + 1)),
            })
            continue
        if typ in {"era", "me"}:
            continue
        for i in attach_weeks(note):
            prev = counts.get(i) or {"n": 0, "plan": False}
            prev["n"] += 1
            if typ == "plan":
                prev["plan"] = True
            counts[i] = prev
    cells = {}
    for i, rec in counts.items():
        future = week_range(i)[0] > today_day
        cells[i] = {"kind": "plan" if rec["plan"] or future else "memory", "n": rec["n"]}
    y, w = iso_week(today_day)
    return {"currentWeek": week_id(y, w), "eras": eras, "cells": cells}


def week_payload(wid: str) -> dict:
    notes = notes_for_week(wid)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    future = week_range(wid)[0] > today
    plan = any(n["type"] == "plan" for n in notes) or future
    kind = "empty" if not notes else ("plan" if plan else "memory")
    outgoing = []
    if notes:
        q = ",".join("?" * len(notes))
        rows = open_db().execute(
            f"SELECT DISTINCT target FROM links WHERE src_path IN ({q})",
            [n["path"] for n in notes],
        ).fetchall()
        from vault import resolve_target

        for row in rows:
            dto = resolve_target(row["target"])
            outgoing.append({"target": row["target"], "title": dto["title"], "type": dto["type"], "missing": dto["missing"]})
    return {"id": wid, "kind": kind, "notes": notes, "outgoing": outgoing}
