"""YAML dates serialize; calendar ensure writes FORMAT notes and rejects escapes."""
import json
import os
import tempfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

os.environ["SQLITE_PATH"] = ":memory:"
os.environ["VAULT_PATH"] = tempfile.mkdtemp()

from vault import create_note, ensure_period, list_tree, parse_note, period_rel, safe_rel, write_file  # noqa: E402

note = parse_note("---\nstart: 2021-08-01\nend: 2025-05-01\n---\n# Purdue\n", "Calendar/Miscellaneous/Purdue.md")
assert note["title"] == "Purdue", note
assert "2021-08-01" in note["dates"], note
assert "2025-05-01" in note["dates"], note
json.loads(note["frontmatter"])

assert period_rel("2026-09-01") == "Calendar/Daily/2026-09-01.md"
assert period_rel("2026-W36") == "Calendar/Weekly/2026-W36.md"
assert period_rel("nope") is None

try:
    safe_rel("../secret.md")
    raise AssertionError("escape")
except ValueError:
    pass

hit = ensure_period("2026-09-01")
root = Path(os.environ["VAULT_PATH"])
assert (root / "Calendar/Daily/2026-09-01.md").is_file()
assert (root / "Calendar/Weekly/2026-W36.md").is_file()
assert (root / "Calendar/Monthly/2026-09.md").is_file()
assert (root / "Calendar/Yearly/2026.md").is_file()
assert "[[2026-09-01]]" in (root / "Calendar/Weekly/2026-W36.md").read_text()
assert "[[2026-W36]]" in (root / "Calendar/Monthly/2026-09.md").read_text()
assert hit["missing"] is False
assert hit["path"] == "Calendar/Daily/2026-09-01.md"

ensure_period("2026-09-01")
assert (root / "Calendar/Weekly/2026-W36.md").read_text().count("[[2026-09-01]]") == 1

made = create_note("Ada", "Inbox", "2026-09-01")
assert (root / "Inbox/Ada.md").is_file()
assert "[[Ada]]" in (root / "Calendar/Daily/2026-09-01.md").read_text()
assert made["title"] == "Ada"

write_file("Inbox/Ada.md", "# Ada\n\nhello\n")
assert "hello" in (root / "Inbox/Ada.md").read_text()

paths = {f["path"] for f in list_tree()}
assert "Inbox/Ada.md" in paths
assert "Calendar/Daily/2026-09-01.md" in paths

print("me-backend vault: all assertions passed")
