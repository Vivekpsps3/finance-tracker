# Calendar format

Source of truth: `/home/vivek/Deployments/Vault` (container: `/data/vault`).
Memory indexes markdown only. Rebuild after you edit.

```
Calendar/
  Yearly/YYYY.md
  Monthly/YYYY-MM.md
  Weekly/YYYY-Www.md
  Daily/YYYY-MM-DD.md
  Miscellaneous/*.md
```

A period exists when its file exists. Membership is the bullet list in that file — not frontmatter, not the target note's path.

## Period ids

| Folder | Filename | Means |
|---|---|---|
| Yearly | `2026.md` | calendar year |
| Monthly | `2026-09.md` | calendar month |
| Weekly | `2026-W36.md` | ISO week (`YYYY-Www`) |
| Daily | `2026-09-01.md` | calendar day |
| Miscellaneous | any name | eras, ranges, undated buckets |

## Body

Filename is the period. Body is bullets of `[[wiki]]` links. Clicking a chip in Memory opens that vault note.

```md
# 2026-W36

- [[Some project]]
- [[A person]]
```

- **Yearly** — months, then anything that spans the year. `- [[2026-09]]`
- **Monthly** — weeks or days. `- [[2026-W36]]` / `- [[2026-09-01]]`
- **Weekly** — days and notes from that week. `- [[2026-09-01]]`
- **Daily** — people, places, events that day. `- [[Isha Tripathy]]`
- **Miscellaneous** — same bullets. Optional frontmatter:

```md
---
start: 2021-08-01
end: 2025-05-01
---
# Purdue

- [[Purdue]]
```

Link by note title/stem (`[[Isha Tripathy]]`, `[[2026-09-14]]`), not the folder path.

The Memory UI auto-creates missing Yearly / Monthly / Weekly / Daily files when you open a day, and links the new period up the chain. New notes from a day land in `Inbox/` and are appended as `[[wikilinks]]` on that daily note.
