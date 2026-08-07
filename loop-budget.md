# loop-budget.md — Token Budget & Kill Switch

## Caps
- **Per agent session:** 3 SDD sessions max per work night
- **Per work night (total):** ~9 sessions (3 agents × 3) — FASE 1 parallel
- **Serial phases (0, 4, 5):** 1-2 sessions
- **Kill switch:** if total sessions this night > 12 → stop gracefully, update STATE.md, exit

## Efficiency Rules
1. Read STATE.md FIRST — never re-scan audited areas
2. Explore agents (small context) for audits, not full-context reads
3. One area per session — no context overload
4. Review small diffs per task, not giant reviews
5. loop-audit once per fase, not per task
6. Bot-side LLM: only high-value reasoning (AGENTS.md rule) — zero LLM in screening/scoring

## Cost Tracking
See loop-run-log.md (append after each session: phase, session count, outcome)
