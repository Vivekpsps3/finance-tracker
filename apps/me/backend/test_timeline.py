"""Calendar cells come from Calendar/ folder notes."""
import os
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ["SQLITE_PATH"] = ":memory:"

from db import open_db  # noqa: E402
import timeline  # noqa: E402

assert timeline.classify("Calendar/Yearly/2026.md") == ("yearly", "2026")
assert timeline.classify("Calendar/Monthly/2026-09.md") == ("monthly", "2026-09")
assert timeline.classify("Calendar/Weekly/2026-W36.md") == ("weekly", "2026-W36")
assert timeline.classify("Calendar/Daily/2026-09-01.md") == ("daily", "2026-09-01")
assert timeline.classify("Calendar/Miscellaneous/Purdue.md") == ("misc", "Purdue")
assert timeline.classify("Calendar/Daily/Personal Todo List.md") is None
assert timeline.classify("Personal/Me.md") is None

db = open_db()
db.execute(
    "INSERT INTO notes (path, title, type, frontmatter, body, dates, mtime_ms) VALUES (?,?,?,?,?,?,?)",
    ("Calendar/Weekly/2026-W36.md", "2026-W36", None, "{}", "- [[Ada]]\n", "[]", 0),
)
db.execute("INSERT INTO links (src_path, target, alias, heading, embed) VALUES (?,?,?,?,?)",
           ("Calendar/Weekly/2026-W36.md", "Ada", None, None, 0))
db.execute(
    "INSERT INTO notes (path, title, type, frontmatter, body, dates, mtime_ms) VALUES (?,?,?,?,?,?,?)",
    ("Personal/Ada.md", "Ada", None, "{}", "- [[2026-W36]]\n- [[2026-09-01]]\n", "[]", 0),
)
db.execute("INSERT INTO links (src_path, target, alias, heading, embed) VALUES (?,?,?,?,?)",
           ("Personal/Ada.md", "2026-W36", None, None, 0))
db.execute("INSERT INTO links (src_path, target, alias, heading, embed) VALUES (?,?,?,?,?)",
           ("Personal/Ada.md", "2026-09-01", None, None, 0))
db.execute(
    "INSERT INTO notes (path, title, type, frontmatter, body, dates, mtime_ms) VALUES (?,?,?,?,?,?,?)",
    ("Calendar/Miscellaneous/Purdue.md", "Purdue", None, '{"start": "2021-08-01", "end": "2025-05-01"}', "- [[Purdue]]\n", "[]", 0),
)
db.commit()

tl = timeline.project_life(datetime(2026, 8, 31, tzinfo=timezone.utc))
assert tl["birthday"] == "2003-05-02", tl
assert tl["years"][0] == 2003, tl
assert tl["years"][-1] == 2093, tl
assert tl["currentWeek"] == "2026-W36", tl
assert tl["currentYear"] == 2026, tl
assert tl["currentMonth"] == "2026-08", tl
assert tl["weekly"]["2026-W36"]["n"] == 2, tl
assert "Ada" in tl["weekly"]["2026-W36"]["refs"], tl
assert tl["daily"]["2026-09-01"]["n"] == 1, tl
assert tl["misc"][0]["id"] == "Purdue", tl
assert tl["misc"][0]["start"] == "2021-08-01", tl
assert tl["misc"][0]["end"] == "2025-05-01", tl
assert "cells" not in tl, tl
print("me-backend timeline: all assertions passed")
