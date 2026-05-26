<!-- OMC:START -->
<!-- OMC:VERSION:4.13.4 -->

# oh-my-claudecode - Intelligent Multi-Agent Orchestration

You are running with oh-my-claudecode (OMC), a multi-agent orchestration layer for Claude Code.
Coordinate specialized agents, tools, and skills so work is completed accurately and efficiently.

<operating_principles>
- Delegate specialized work to the most appropriate agent.
- Prefer evidence over assumptions: verify outcomes before final claims.
- Choose the lightest-weight path that preserves quality.
- Consult official docs before implementing with SDKs/frameworks/APIs.
</operating_principles>

<delegation_rules>
Delegate for: multi-file changes, refactors, debugging, reviews, planning, research, verification.
Work directly for: trivial ops, small clarifications, single commands.
Route code to `executor` (use `model=opus` for complex work). Uncertain SDK usage → `document-specialist` (repo docs first; Context Hub / `chub` when available, graceful web fallback otherwise).
</delegation_rules>

<model_routing>
`haiku` (quick lookups), `sonnet` (standard), `opus` (architecture, deep analysis).
Direct writes OK for: `~/.claude/**`, `.omc/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`.
</model_routing>

<skills>
Invoke via `/oh-my-claudecode:<name>`. Trigger patterns auto-detect keywords.
Tier-0 workflows include `autopilot`, `ultrawork`, `ralph`, `team`, and `ralplan`.
Keyword triggers: `"autopilot"→autopilot`, `"ralph"→ralph`, `"ulw"→ultrawork`, `"ccg"→ccg`, `"ralplan"→ralplan`, `"deep interview"→deep-interview`, `"deslop"`/`"anti-slop"`→ai-slop-cleaner, `"deep-analyze"`→analysis mode, `"tdd"`→TDD mode, `"deepsearch"`→codebase search, `"ultrathink"`→deep reasoning, `"cancelomc"`→cancel.
Team orchestration is explicit via `/team`.
Detailed agent catalog, tools, team pipeline, commit protocol, and full skills registry live in the native `omc-reference` skill when skills are available, including reference for `explore`, `planner`, `architect`, `executor`, `designer`, and `writer`; this file remains sufficient without skill support.
</skills>

<verification>
Verify before claiming completion. Size appropriately: small→haiku, standard→sonnet, large/security→opus.
If verification fails, keep iterating.
</verification>

<execution_protocols>
Broad requests: explore first, then plan. 2+ independent tasks in parallel. `run_in_background` for builds/tests.
Keep authoring and review as separate passes: writer pass creates or revises content, reviewer/verifier pass evaluates it later in a separate lane.
Never self-approve in the same active context; use `code-reviewer` or `verifier` for the approval pass.
Before concluding: zero pending tasks, tests passing, verifier evidence collected.
</execution_protocols>

<hooks_and_context>
Hooks inject `<system-reminder>` tags. Key patterns: `hook success: Success` (proceed), `[MAGIC KEYWORD: ...]` (invoke skill), `The boulder never stops` (ralph/ultrawork active).
Persistence: `<remember>` (7 days), `<remember priority>` (permanent).
Kill switches: `DISABLE_OMC`, `OMC_SKIP_HOOKS` (comma-separated).
</hooks_and_context>

<cancellation>
`/oh-my-claudecode:cancel` ends execution modes. Cancel when done+verified or blocked. Don't cancel if work incomplete.
</cancellation>

<worktree_paths>
State: `.omc/state/`, `.omc/state/sessions/{sessionId}/`, `.omc/notepad.md`, `.omc/project-memory.json`, `.omc/plans/`, `.omc/research/`, `.omc/logs/`
</worktree_paths>

## Setup

Say "setup omc" or run `/oh-my-claudecode:omc-setup`.

<!-- OMC:END -->

## Project response rules

<response_language>
- Reply to the user in Korean.
- Write all code comments in English.
- When reply, not on code, For technical terms, keep the English term and gloss it in Korean if useful — e.g. "변수(Variable)".
</response_language>

# Project rules

Numbered rules are stable IDs — refer to them as "Rule 8" etc. Order is significant only inside a section.

<comment_style>
4. **One line only.** No multi-line `/* ... */` blocks, no docstrings, no multi-paragraph rationales. If a thought needs more than a line, rename a function or restructure the code instead.
5. **Audience = an engineer already reading the surrounding code.** Skip what the code already shows: no behavior summaries, no data-structure recaps, no generic "why we do this" framing.
6. **Comment only the non-obvious.** Hidden invariants, external calling conventions, deliberate workarounds for a specific bug, or constraints not visible at the call site.
7. **Compress.** Use noun-phrase + key verb. Drop "we", "this function", "in order to", and similar filler. Prefer abbreviations and identifiers already present in the code.
</comment_style>

<workflow_skills>
8. **Build (release / debug)** → `cubrid-build` skill. `nohup`/`&` 금지, Bash 의 `run_in_background: true` 만.
9. **CTP regression (sql / medium)** → `cubrid-ctp` skill. core watching (`/data/core` cleanup, force-kill) + 결과 3분기(ALL_PASS / NOK / CORE_DUMP) 포함.
13. **CUBRID 신규 작업 시작 / 단계 진행** → 사용자가 `/cubrid-flow` 를 **명시적으로 호출**해야 진입 (`disable-model-invocation: true` 라 자동 트리거 안 됨). OMC `autopilot` / `ralph` 로 갈음 금지. 13단계 프로세스(SSOT → JIRA → 브랜치 → 구현 → PR → CTP → CI → 리뷰)는 `cubrid-flow` 가 `.omc/state/cubrid-flow/<KEY>.json` 상태와 함께 `procedures/<jira|branch|pr-prep|pr|tc-sync|ci>.md` 절차서를 `Read` 로 호출해 라우팅한다 (build/ctp/server 는 별도 top-level skill). "CBRD-NNNNN 작업 시작" / "다음 단계" / "프로세스 어디까지" 라는 사용자 발화는 → 사용자에게 `/cubrid-flow` 호출을 안내. 내가 자동으로 진입하지 않는다.
</workflow_skills>

<commands>
10. Restart server: `cubrid server restart demodb`
11. Run a query file: `csql -u dba demodb -i ${INPUT_QUERY_FILE}`
</commands>

<automation>
12. **codestyle.sh runs automatically before commit.** `.claude/hooks/codestyle-precommit.sh` is wired as `PreToolUse(Bash, "Bash(git commit*)")` and applies + re-stages C/C++/Java files. Do not invoke `codestyle.sh` manually.
</automation>

