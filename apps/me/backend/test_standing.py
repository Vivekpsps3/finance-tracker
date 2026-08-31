"""Standing question persists until skip/approve. Run from apps/me/backend with SQLITE_PATH=:memory:."""
import asyncio
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ["SQLITE_PATH"] = ":memory:"

from db import open_db  # noqa: E402
import standing  # noqa: E402

open_db()
qs = iter(["First question?", "Second question?"])


async def fake_invent() -> str:
    return next(qs)


standing._invent = fake_invent


async def main() -> None:
    a = await standing.ensure()
    b = standing.current()
    assert a["question"] == b["question"] == "First question?", (a, b)
    c = await standing.ensure()
    assert c["question"] == "First question?", c
    d = await standing.skip()
    assert d["question"] == "Second question?", d
    refused = standing.answer("I work at SpaceX")
    assert refused["status"] == "refuse", refused
    ok = standing.answer("walked the dog")
    assert ok["status"] == "pending" and "walked the dog" in ok["pending"]["body"], ok
    same = await standing.skip()
    assert same["status"] == "pending", same


asyncio.run(main())
print("standing persist/skip/refuse: ok")
