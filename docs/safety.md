# Safety & Guardrails — Athena Loop Engineering

## Denylist Paths (agent NEVER touches without human approval)
- `auth/secrets/private keys` — `.env`, `database/*`, any key material
- `live trading enablement` — flipping `DRY_RUN=false`
- `infrastructure/infra config` — VPS-level changes, pm2 system config
- `other agents' in-progress files` — see STATE.md ownership map

## Auto-Merge Policy
- NO auto-merge on master. Every merge: `npm run build` + `npm test` green + review approved.
- Agents commit to their own branch/worktree; kapten merges sequentially.

## MCP / Tool Scope (least privilege)
- Agents get ONLY the tools their role needs:
  - Implementer: read/write own files, run tests, git add/commit own files
  - Reviewer: read-only + git diff
  - Explore (audit): read-only
- NEVER: `git push`, `git add -A`, cross-branch merges, `.env` writes.

## Human Escalation
- Escalate when: (a) task blocked on user decision, (b) >3 failed attempts on same task without progress, (c) denylist path encountered, (d) token budget reached.
- Mechanism: write to STATE.md `WAITING FOR HUMAN` → skip to next non-blocked task.

## Kill Switch
- `loop-budget.md` cap reached → stop gracefully, update STATE.md, exit.
- `DRY_RUN=false` NEVER set by any agent or loop.
