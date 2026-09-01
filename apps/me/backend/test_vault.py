"""YAML dates in frontmatter must serialize."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vault import parse_note  # noqa: E402

note = parse_note("---\nstart: 2021-08-01\nend: 2025-05-01\n---\n# Purdue\n", "Calendar/Miscellaneous/Purdue.md")
assert note["title"] == "Purdue", note
assert "2021-08-01" in note["dates"], note
assert "2025-05-01" in note["dates"], note
import json
json.loads(note["frontmatter"])
print("me-backend vault: all assertions passed")
