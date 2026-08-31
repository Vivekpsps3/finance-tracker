"""Sessions stay; history renders markdown; reset deletes one."""
import json
import os
import tempfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("SQLITE_PATH", ":memory:")

import agent  # noqa: E402

tmp = Path(tempfile.mkdtemp(prefix="agent-"))
agent.DIR = tmp
agent.CWD = tmp / "vault"
agent.SESSION_DIR = tmp / "sessions"
agent.SESSION_DIR.mkdir()
agent.CWD.mkdir()

wall = agent.SESSION_DIR / "wall.jsonl"
other = agent.SESSION_DIR / "other.jsonl"
wall.write_text(
    "\n".join(
        [
            json.dumps({"type": "session", "id": "wall-id"}),
            json.dumps({"type": "session_info", "name": "wall"}),
            json.dumps(
                {
                    "type": "message",
                    "message": {
                        "role": "user",
                        "content": [{"type": "text", "text": "hi"}],
                    },
                }
            ),
            json.dumps(
                {
                    "type": "message",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {"type": "thinking", "thinking": "nope"},
                            {"type": "toolCall", "name": "bash"},
                            {"type": "text", "text": "hello **world**"},
                        ],
                    },
                }
            ),
        ]
    )
    + "\n",
    encoding="utf-8",
)
other.write_text(
    json.dumps({"type": "session", "id": "ask-id"})
    + "\n"
    + json.dumps({"type": "session_info", "name": "ask"})
    + "\n",
    encoding="utf-8",
)

assert agent.md("**x**") == "<p><strong>x</strong></p>"
assert "<script" not in agent.md("<script>alert(1)</script>**ok**")

lines = agent.history()
assert [l["kind"] for l in lines] == ["user", "tool", "assistant"], lines
assert lines[2]["html"] == agent.md("hello **world**")
assert "<strong>world</strong>" in lines[2]["html"]
assert other.exists()
assert agent.resolve("ask-id") == other
assert agent.resolve(None) == wall
assert {s["id"] for s in agent.sessions()} == {"wall-id", "ask-id"}

agent.reset("ask-id")
assert not other.exists()
assert wall.exists()
agent.reset()
assert agent.history() == []
print("agent sessions/markdown/reset: ok")
