---
name: loop-budget
description: Check token/session budget before and after each loop run. Enforce caps from loop-budget.md. Stop gracefully when exhausted.
---

# loop-budget

Runtime budget guard for loop runs.

## Process
1. BEFORE a run: read loop-budget.md caps + loop-run-log.md session count.
2. If sessions this night ≥ cap → STOP: update STATE.md, log final state, exit cleanly.
3. AFTER a run: append to loop-run-log.md (phase, session, outcome).
4. If kill-switch criteria met (see docs/safety.md) → stop, no further work.

## Rules
- Never exceed the per-night session cap.
- Prefer explore agents (small context) for audits over full-context reads.
- Never re-read audited files — read STATE.md audit log first.
