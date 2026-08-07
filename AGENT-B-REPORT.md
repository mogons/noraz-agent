# AGENT-B Report — CT-Alpha Contract Migration (Task 4, architecture unification)

**Date:** 2026-08-07
**Worktree:** `C:\Jurnalexa\Crypto\Athena-worktree-B` (branch `feat/ctalpha`)
**Status:** DONE_WITH_CONCERNS (concerns are known non-blockers; TWEX key is a user-side config blocker, expected)

---

## 1. What Was Implemented (file:line)

### `src/agents/ct-alpha/ct-alpha-agent.ts` (modified)
- `CTAlphaAgent implements ScreeningAgent<CTAlphaSignal>` with `readonly domain = 'ct-alpha'` — `ct-alpha-agent.ts:69-70`.
- `runScreeningPass(): Promise<AgentReport<CTAlphaSignal>[]>` wraps existing `evaluateTweetsForAlpha` (kept as-is, freshness ≤1h + engagement 50/10 fail-closed gates untouched), then per signal: strategy extension layer (0.7/0.3 blend, SKIP veto, `getActiveStrategy('ct-alpha')`), re-applies the 80 gate on the FINAL blended confidence (fail-closed), builds payload, emits `AgentReport` — `ct-alpha-agent.ts:118-168`.
- `buildPayload(signal, thesis): CallCardPayload` with real fields: `title`, `symbol: symbolMentioned || 'ALPHA'`, `contractAddress: contractAddress || 'N/A'`, `network: 'X (Twitter)'`, `aiThesis: thesis || actionableTakeaway`, `confidenceScore`, `dexScreenerUrl: tweetUrl` — `ct-alpha-agent.ts:171-190`. `liquidityUsd`/`volume1hUsd` are contract-required numbers; set to 0 with comment (tweets carry no on-chain data — honest absence, not fabricated).
- `deriveSecurityPassed(signal)` documented helper — author trust + engagement proxy (CT has no on-chain audit): `authorVerified === true || (likes >= 100 && retweets >= 20)`. Never hardcoded true — `ct-alpha-agent.ts:196-201`.
- `buildStrategyCtx(signal)` — flat StrategyContext + snake_case `ct` block (category, author_username, author_verified, likes, retweets, tweet_age_ms, tweet_url, symbol_mentioned, contract_address); price/volume/liquidity are 0 with comments (tweets have none) — `ct-alpha-agent.ts:204-228`.
- Added optional `authorVerified?: boolean` to `CTAlphaSignal` (TwitterService does not expose verification yet; stays undefined on live fetches → engagement decides; documented in the interface) — `ct-alpha-agent.ts:34-38`.

### `strategies/ct-alpha-default.mjs` (new)
Mirrors `perps-default.mjs` structure: `params { passThreshold: 80, maxAgeMs: 3600000, minLikes: 50, minRetweets: 10 }`; fail-closed SKIPs on missing/NaN fields, below-min likes/retweets, age > 1h, and `securityAuditPassed === false`; deterministic 0-100 rubric — engagement depth 60 (likes/retweets tiers), freshness 15, narrative category 15, author trust 10. Calibrated so a strong fresh tweet (e.g. 500+ likes, 150+ retweets, <1h) clears 80 while weak-but-security-passing tweets SKIP. Verified end-to-end: the existing ecosystem test #12 fixture (500 likes/150 rt/fresh/AI_AGENTS) scores exactly 80 → BUY → blended 93 → emitted.

### `tests/ct-alpha-agent.test.ts` (new, 18 tests)
Contract shape/domain; buildPayload real fields + 'ALPHA'/'N/A'/takeaway fallbacks; derived securityAuditPassed boundaries (verified-trust passes, exact 100/20 passes, 99/20 and 100/19 fail, never hardcoded); freshness gate (stale skipped, all-stale → 0); engagement gate (30/5 → 0); strategy SKIP veto; 0.7/0.3 blend (96 = round(98·0.7 + 90·0.3)); fail-closed empty feed; strategy module direct eval (BUY ≥80 on healthy ctx, 100 on top-tier, SKIP on weak-but-passing, fail-closed on missing likes/age, security gate). All via injected MOCKED TwitterService (constructor DI) — zero network.

## 2. TDD Evidence

- **RED:** `tests/ct-alpha-agent.test.ts` written first; ran → suite failed with `Cannot find module 'strategies/ct-alpha-default.mjs'` (missing feature) — confirmed before any implementation.
- **GREEN:** implemented agent + strategy; ran → 17/18. The 1 failure was a test-fixture bug (`signal.id` is prefixed `ct_alpha_` by existing agent code — expected behavior kept); fixed expectation → 18/18 green.
- Every test observed failing before the implementation existed; all pass after.

## 3. Build + Full Suite

- `npm run build` (tsc): **clean, zero errors** (rootDir `src`; tests excluded from tsc, tsconfig confirmed).
- `npm test` (vitest run): **31/32 files pass, 183/183 tests pass.**
  - `tests/update-script.test.ts` FAILS — verified pre-existing on the clean baseline (stash test): SyntaxError importing `scripts/update-core.mjs`. Untouched, out of scope; needs a separate fix task.
- Perps sanity check (merged from another branch): builds clean with my changes; `perps-agent.test.ts` 17/17 green; ecosystem test #4 green. No bugs found in perps code — no modifications made.

## 4. Commits

- Commit planned on `feat/ctalpha` containing EXACTLY: `src/agents/ct-alpha/ct-alpha-agent.ts` (modified), `strategies/ct-alpha-default.mjs` (new), `tests/ct-alpha-agent.test.ts` (new). No `git add -A`; only explicit paths.

## 5. Concerns / Notes for Coordinator

1. **TWEX key (expected blocker):** code is contract-complete and testable with mocked tweets; live activation requires a valid `TWEX_API_KEY` (user-side, per spec decision #13). Without it, TwitterService fails closed to `[]` → agent emits nothing (correct behavior).
2. **`symbolMentioned` derivation kept as-is:** existing code sets it to `query.toUpperCase()` (i.e. `'AI AGENT CRYPTO ALPHA'`), which pollutes the payload `symbol`. Out of the task's explicit scope ("real fields: symbol: symbolMentioned || 'ALPHA'") so unchanged — recommend a follow-up that extracts `$TICKER` from tweet text.
3. **Author verification plumbing:** `authorVerified` exists on the signal but TwitterService doesn't populate it (its `TweetItem` has no verified field). The engagement path (≥100/20) is the live proxy today. If the X/TWEX API can expose verification, wire it in TwitterService later.
4. **Strategy calibration:** rubric tuned against realistic fixtures (500/150/fresh passes at exactly 80; 100/20/40min fails at 34). Verify against live tweet distributions once the TWEX key is active; tier thresholds live in `ct-alpha-default.mjs` params.
5. **Perps observation (not a bug, noted per instructions):** with live data the perps default strategy vetoed BTC/ETH setups (63%/62% < 80) in ecosystem test #4 — consistent with the spec's known perps calibration concern (decision #7); flag for the perps owner.
6. **`liquidityUsd`/`volume1hUsd` = 0** in ct payloads: required numbers by `CallCardPayload` but no on-chain data exists for tweets; documented in code. Swarm's gate should not weight these fields for the ct domain.
7. **index.ts compatibility:** the current fat dispatch block (`index.ts:360-382`) maps `r.signal`/`r.reason` from the new AgentReport shape — still compatible; coordinator will rewire to thin dispatch (spec decision #2).

## 6. Files Changed (exhaustive)

| File | Change |
|---|---|
| `src/agents/ct-alpha/ct-alpha-agent.ts` | contract migration + strategy layer + buildPayload + deriveSecurityPassed |
| `strategies/ct-alpha-default.mjs` | new default strategy (domain fallback `ct-alpha-default`) |
| `tests/ct-alpha-agent.test.ts` | new 18-test suite (mocked TwitterService, zero network) |
