# LOOP.md — Athena Loop Engineering Config

## Purpose
Iterative improvement of the Athena crypto-trading system: audit → critique → prioritize → implement (maker/checker split) → verify → deploy → record state → repeat.

## Stop Condition
**Loop-audit score ≥ 80 (L2 Ready)** with proven loop activity (STATE.md updates, run-log entries, commits). Measured via `npx @cobusgreyling/loop-audit .`

## Cadence
- Continuous sessions (user runs `athena update` on VPS after each milestone push)
- Checkpoint audits: after FASE 0 (baseline), after FASE 1 (target ≥40), after FASE 2 (target ≥55-60), then as needed until ≥80

## Roles
- **Kapten (controller):** file map, dispatch, merge review, deploy, STATE.md
- **Implementer agents:** one feature per session, isolated worktree
- **Reviewer agents:** separate from implementer (maker/checker split — implementer never grades own work)

## Gates & Rules
- ❌ NEVER flip DRY_RUN=false (live trading) without explicit human approval
- ❌ NEVER commit `.env`, `database/*`, secrets
- ❌ NEVER touch files owned by another agent (see STATE.md ownership map)
- ✅ Merge order: agents A+B → C (coordination last)
- ✅ Each merge: `npm run build` + `npm test` green
- ✅ Deploy to VPS per milestone via `athena update`

## WAITING FOR HUMAN Protocol
Decisions needing user (new API keys, feature direction, risk tradeoffs) → write to STATE.md `WAITING FOR HUMAN` section → SKIP to next non-blocked task → continue. Only stop entirely when ALL tasks blocked OR token budget reached.

## Token Budget
See loop-budget.md. Cap: 3 sessions per agent per work night (~9 total), recorded in run log.

## Denylist Paths
- auth/secrets/private keys
- live trading enablement (DRY_RUN=false)
- infrastructure/infra config changes
- Other agents' in-progress files
