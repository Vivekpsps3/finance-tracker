"""One wall session. History parses messages; extras are pruned; reset wipes."""
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
agent.SESSION_DIR = tmp / "sessions"
agent.SESSION_DIR.mkdir()

wall = agent.SESSION_DIR / "wall.jsonl"
other = agent.SESSION_DIR / "other.jsonl"
wall.write_text(
    "\n".join(
        [
            json.dumps({"type": "session", "id": "w"}),
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
                            {"type": "text", "text": "hello"},
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
    json.dumps({"type": "session_info", "name": "ask"}) + "\n",
    encoding="utf-8",
)

lines = agent.history()
assert [l["kind"] for l in lines] == ["user", "tool", "assistant"], lines
assert lines[0]["text"] == "hi"
assert lines[1]["name"] == "bash"
assert lines[2]["text"] == "hello"
assert not other.exists()
assert wall.exists()
assert agent.wall() == wall

agent.reset()
assert agent.history() == []
assert agent.wall() is None
print("agent history/prune/reset: ok")
