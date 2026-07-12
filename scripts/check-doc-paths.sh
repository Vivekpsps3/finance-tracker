#!/usr/bin/env bash
# OPS-002: fail when markdown relative links point at missing files.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

python3 - <<'PY'
from pathlib import Path
import re

root = Path(".").resolve()
fail = 0
link_re = re.compile(r"\]\(([^)]+)\)")

scan_roots = [root / "docs", root / "AGENTS.md", root / "README.md"]
files: list[Path] = []
for p in scan_roots:
    if p.is_file():
        files.append(p)
    elif p.is_dir():
        files.extend(p.rglob("*.md"))

for path in files:
    text = path.read_text(encoding="utf-8", errors="replace")
    for match in link_re.finditer(text):
        target = match.group(1).strip()
        if not target or target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = target.split("#", 1)[0].split("?", 1)[0]
        if not target:
            continue
        # absolute-from-repo style
        candidates = [
            (path.parent / target).resolve(),
            (root / target.lstrip("/")).resolve(),
        ]
        if not any(c.exists() for c in candidates):
            print(f"MISSING link in {path.relative_to(root)}: {target}")
            fail = 1

if fail:
    print("check-doc-paths: FAILED")
    raise SystemExit(1)
print("check-doc-paths: OK")
PY
