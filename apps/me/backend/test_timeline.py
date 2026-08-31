"""Life calendar years come from birthday, not vault eras."""
import os
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ["SQLITE_PATH"] = ":memory:"

from db import open_db  # noqa: E402
import timeline  # noqa: E402

open_db()
tl = timeline.project_life(datetime(2026, 8, 31, tzinfo=timezone.utc))
assert tl["birthday"] == "2003-05-02", tl
assert tl["years"][0] == 2003, tl
assert tl["years"][-1] == 2093, tl
assert tl["currentWeek"] == "2026-W36", tl
assert "eras" not in tl, tl
print("me-backend timeline: all assertions passed")
