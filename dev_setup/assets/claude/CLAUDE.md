<response_language>
- Reply to the user in Korean.
- Write all code comments in English.
- When reply, not on code, For technical terms, keep the English term and gloss it in Korean if useful — e.g. "변수(Variable)".
</response_language>

<comment_style>
4. **One line only.** No multi-line `/* ... */` blocks, no docstrings, no multi-paragraph rationales. If a thought needs more than a line, rename a function or restructure the code instead.
5. **Audience = an engineer already reading the surrounding code.** Skip what the code already shows: no behavior summaries, no data-structure recaps, no generic "why we do this" framing.
6. **Comment only the non-obvious.** Hidden invariants, external calling conventions, deliberate workarounds for a specific bug, or constraints not visible at the call site.
7. **Compress.** Use noun-phrase + key verb. Drop "we", "this function", "in order to", and similar filler. Prefer abbreviations and identifiers already present in the code.
</comment_style>
