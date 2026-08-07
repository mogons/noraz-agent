# loop-constraints.md — Structured Constraints

## Denylist Paths (never touch without human approval)
- `.env`, `.env.*`, `database/*`, any file containing secrets/keys
- `DRY_RUN=false` transitions (live trading)
- Infrastructure: pm2 config, VPS system files, CI credentials

## Push / Merge Rules
- Only kapten pushes to master.
- Agents push ONLY their own branch in their own worktree.
- Merge requires: build clean + tests green + reviewer APPROVE.

## Human Gates
- New API keys or paid services → WAITING FOR HUMAN
- Feature direction / tradeoff decisions → WAITING FOR HUMAN
- Anything touching auth model, risk engine live behavior, or live funds → WAITING FOR HUMAN

## Token Budget
- Max 3 SDD sessions per agent per work night (see loop-budget.md).
- Audits use explore agents (small context).
- STATE.md read first — never re-scan audited areas.
