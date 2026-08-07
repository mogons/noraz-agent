---
name: loop-verifier
description: Review a diff or task output against project rules and tests. APPROVE or REJECT only. Never modify code. Run after any implementer finishes work — the maker/checker split.
---

# loop-verifier

The implementer NEVER grades its own work. This skill is the independent checker.

## When to use
After an implementer agent reports DONE, before any merge.

## Process
1. Read the task brief/requirements (STATE.md task entry).
2. Read the diff or changed files.
3. Verify against project rules (AGENTS.md, docs/safety.md, STATE.md constraints):
   - Fail-closed: no fabricated data, no hardcoded `securityAuditPassed: true`
   - No secrets committed; only allowed files touched
   - Contract compliance: `runScreeningPass(): Promise<AgentReport[]>` with agent-built payload
4. Run the covering tests: `npx vitest run <test-file>` + `npm run build`.
5. Output ONLY one verdict:
   - **APPROVE** — spec compliant, tests green, no Critical/Important findings
   - **REJECT** — list Critical/Important findings with file:line and required fix

## Output format
```
### Verdict: APPROVE | REJECT
### Spec Compliance: ✅ | ❌ (with file:line)
### Issues: Critical / Important / Minor (file:line each)
### Test evidence: <command> → <result>
```

## Rules
- Read-only. Never modify the working tree.
- Do not fix findings yourself — report them for the implementer.
- A stated rationale from the implementer never downgrades a finding's severity.
