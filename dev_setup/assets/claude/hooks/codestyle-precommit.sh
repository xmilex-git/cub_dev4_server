#!/bin/bash
# Run codestyle.sh on staged C/C++/Java files right before `git commit` and
# re-stage the formatted files. Hooked from .claude/settings.local.json as a
# PreToolUse(Bash) hook with `if: "Bash(git commit*)"`.
#
# Best-effort: never blocks the commit on style failures (exit 0 always).

set -u

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$repo_root" ] && exit 0
cd "$repo_root" || exit 0

style_script=".github/workflows/codestyle.sh"
[ -f "$style_script" ] || exit 0

files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
[ -z "$files" ] && exit 0

changed=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.c|*.h|*.i|*.cpp|*.hpp|*.ipp|*.java)
      [ -f "$f" ] || continue
      bash "$style_script" "$f" >/dev/null 2>&1
      git add "$f" 2>/dev/null
      changed=1
      ;;
  esac
done <<< "$files"

if [ "$changed" -eq 1 ]; then
  echo "[codestyle-precommit] formatted and re-staged C/C++/Java files."
fi
exit 0
