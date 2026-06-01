## Scratch / temporary file location

- **NEVER write scratch files under `/tmp`.** The user's `/tmp` is tmpfs-backed and causing OOM. This applies to extracted git blobs, analysis dumps, intermediate outputs, build artifacts, downloaded archives — anything you would otherwise drop in `/tmp`.
- Also avoid: `/var/tmp`, `$TMPDIR` (often points at tmpfs on macOS too), `mktemp` without an explicit `-p` to a disk-backed dir, and shell redirections like `>/tmp/foo`.
- **Use the project directory's `.claude/scratch/` instead.** Create it on demand (`mkdir -p .claude/scratch`). If no project directory applies (cross-project work), fall back to `~/.claude/scratch/`.
- Tools and subagents you spawn must follow the same rule — if you delegate work, mention this constraint in the prompt.
