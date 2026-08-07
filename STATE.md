# STATE.md — Athena Loop Engineering State Spine

> Single source of truth untuk loop engineering. Kapten (controller) update setelah tiap milestone.
> Agent lain WAJIB baca file ini sebelum kerja. Jangan baca ulang file yang sudah diaudit (lihat Audit Log).

## Loop Status
- **Loop:** ACTIVE (dimulai 2026-08-07, target `loop-audit` ≥ 80 / L2)
- **Baseline score:** 25/100 (L0) — diukur 2026-08-07
- **Last run:** 2026-08-07 (lihat loop-run-log.md)
- **Current phase:** FASE 1 (Architecture Unification — parallel)

## WAITING FOR HUMAN
> Keputusan yang butuh user. Kapten: tulis di sini, LONCAT ke task lain, jangan berhenti.
- (kosong)

## WORKTREE / FILE OWNERSHIP MAP (FASE 1)
> Aturan: tiap agent pegang file tertentu, DILARANG sentuh file agent lain.

| Worktree | Branch | Pemegang | Boleh sentuh | DILARANG |
|---|---|---|---|---|
| wt-A | feat/nft-prediction | Agent A | `src/agents/nft/*`, `src/agents/prediction/*`, `strategies/nft-default.mjs`, `prediction-default.mjs`, tests nft/prediction | `src/index.ts`, `src/orchestrator/*` |
| wt-B | feat/ctalpha-perps | Agent B | `src/agents/ct-alpha/*`, `strategies/ct-alpha-default.mjs`, tests ct-alpha; perps-finish (re-check Task 1 output) | `src/index.ts`, `src/orchestrator/*` |
| wt-C | feat/coordination | Agent C (setelah A+B merge) | `src/orchestrator/hub.ts`, `swarm-consensus.ts`, `src/index.ts`, `dispatch.ts`, tests-nya | `src/agents/*` |
| master | master | Kapten | STATE.md, LOOP.md, loop-budget.md, merge berurutan, deploy | — |

**Merge order: A+B selesai → merge → C terakhir (index.ts wiring menunggu agent siap).**

## Task Status (FASE 1 — Architecture Unification)
| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Perps contract + calibration | ✅ DONE + MERGED (7628be5) | Reviewed approved; mega tier OI≥$1B +25 justified (BTC/ETH hit 80 live) |
| 2 | NFT contract | ⏳ wt-A | |
| 3 | Prediction contract | ⏳ wt-A | |
| 4 | CT-Alpha contract | ⏳ wt-B | TWEX key = user blocker (WAITING FOR HUMAN nanti) |
| 5 | Hub registry + swarm dedup | ⏳ wt-C | |
| 6 | index.ts unified ×8 + timeout + auto-execute | ⏳ wt-C | |
| 7 | Final verification | ⏳ kapten | |

## Deploy Log
| Date | Commit | VPS status |
|---|---|---|
| 2026-08-07 | beb9549 (wallet-tracking) | ✅ deployed (user ran athena update) |
| 2026-08-07 | 7628be5 (perps contract) | ⏳ belum deploy |

## Audit Log (FASE 2 nanti — catat di sini, jangan re-read)
| Area | Status | Temuan | Prioritas |
|---|---|---|---|
| meme-solana | ✅ AUDITED (rebuild) | Solid — pattern reference | — |
| meme-robinhood | ✅ AUDITED (rebuild) | Solid — pattern reference | — |
| perps | ✅ AUDITED (Task 1) | Hyperliquid assetMap indices STALE (idx 4=DYDX bukan SOL, 132=NOT bukan HYPE) — fix di FASE 3 | P0 |
| nft/prediction/ct-alpha | ⏳ wt-A/B | | |
| adapters (Meteora/OpenSea/Poly) | ⏳ FASE 2 | Meteora masih DexScreener-only | |
| orchestration | ⏳ wt-C | substring matching hub | |
| execution/risk | ⏳ FASE 2 | | |
| services (backtester/analytics/db) | ⏳ FASE 2 | | |
| security | ⏳ FASE 2 | prompt injection symbol→embed | |
| observability/DX | ⏳ FASE 2 | REST cuma 2 endpoint | |

## FASE 1 COMPLETE (2026-08-08)
- All 8 agents on shared contract (perps/nft/prediction/ct-alpha migrated)
- hub registry-driven, swarm dedup removed, thin dispatch x8, timeout, auto-execute perps+prediction
- Tests: 236/236 green
- loop-audit checkpoint #1: see below

## FASE 2 AUDIT COMPLETE (3 parallel explore agents)

### P0 CRITICAL
1. RiskEngineV2/kill-switch DEAD CODE - not wired to execution (safety theater)
2. LLM tools: write_strategy_file executes arbitrary code in-process (env access); set_api_key can set DRY_RUN=false
3. ZERO auth: Discord/Telegram commands open to all; isControlRoomChannel defaults true when unset
4. Hyperliquid assetMap 24/27 WRONG (live-verified) - perps scores DYDX with SOL candles
5. OpenSea getSwapQuote fails OPEN (success:true with fabricated output)
6. Prompt injection: token symbol/name raw into embeds/URLs/Telegram markdown
7. Wallet keys plaintext in database/athena_state.json; tool args logged

### P1
- Trade journal recordTrade/closeTrade write-dead; analytics always empty
- backtester.ts + db-service.ts DEAD files (imported nowhere)
- CronScheduler: new instance per tool call (duplicate timers); cron syntax silently 1h
- Fabricated constants: SOL=\ (meteora), ETH=\ (uniswap), ETH=\ (evm/opensea), activeTvl=tvl*0.3
- Robinhood chain missing in wallet-service EVM_CHAINS (5318008)
- DbService test 11 wipes production state (uses default path)
- Swarm cross-agent veto dead (registerAgentIntent never called); LP domains hardcode confidence 80 + audit true
- token-audit-service stale (old GMGN shape)

### P2 (deferred)
- whale flag permanently dead (PnL hardcoded 1.0 vs 5.0 threshold); floorSurge 100x inflated
- RSI caps at 99.0099; EMA200 mislabeled under 200 candles
- LLM keys logged in tool args; partial key hints in replies
- dedup key collision for CA-less domains

## FASE 3 IMPROVEMENT PLAN (kapten priority)
| # | Fix | P | Needs user? | Status |
|---|---|---|---|---|
| 1 | Hyperliquid dynamic index resolution (meta.universe) | P0 | No | ⏳ next |
| 2 | OpenSea fail-closed + whale/floor fixes | P0 | No | ⏳ |
| 3 | Sanitize prompt-injection (embeds/URLs/telegram markdown) | P0 | No | ⏳ |
| 4 | Kill dead code (backtester, db-service, recordTrade dead paths) | P1 | No | ⏳ |
| 5 | De-hardcode constants (SOL/ETH prices via price-feed-service) | P1 | No | ⏳ |
| 6 | Robinhood chain in wallet-service EVM_CHAINS | P1 | No | ⏳ |
| 7 | Auth model (Discord allowlist) | P0 | YES - which users? | WAITING |
| 8 | LLM tool hardening (write_strategy sandbox, set_api_key allowlist) | P0 | YES - tradeoff | WAITING |
| 9 | Risk engine wiring to auto-execute | P0 | YES - when live? | WAITING |
| 10 | CronScheduler singleton + cron parsing | P1 | No | ⏳ |

### FASE 3 PROGRESS
| Fix | Status |
|---|---|
| 1 Hyperliquid indices | ✅ DONE a6bcce8 (SOL=5 HYPE=159 live-verified; GOLD/XYZ100/OIL ghosts removed) |
| 2 OpenSea fail-open | ⏳ next |
| 3 Prompt injection sanitize | ⏳ |
| 4 Dead code | ⏳ |
| 5 De-hardcode constants | ⏳ |
| 6 Robinhood in wallet-service | ⏳ |

| 2 OpenSea fail-open | ✅ DONE bc68e85 (fails closed, no fabricated output, whale/floor fixed) |

| 3 Prompt injection sanitize | ✅ DONE 391f8db (sanitizeEmbedField/sanitizeTgField all domains) |

| 4 Dead code | ✅ DONE e1b98b4 (backtester/db-service removed; test 11 no longer wipes state) |
| 5 De-hardcode constants | ✅ DONE 3fe4b6a (live SOL/ETH prices in LP fee gates) |
| 6 Robinhood in wallet-service | ✅ DONE 6b0f710 |

## WAITING FOR HUMAN (blokir P0 keamanan)
- [7] Auth model: Discord/Telegram commands open to all users. Butuh keputusan: allowlist user ID? (opsi: env ALLOWED_USER_IDS, role-based, atau private-channel-only)

## LOOP COMPLETE (2026-08-08)
- loop-audit score: 100/100 (L3) — target >= 80 tercapai
- FASE 0-3 done: infra setup, unification (8 agents contract), deep audit (3 areas), 6 security/correctness fixes
- FASE 4-5 (deploy VPS + laporan akhir): pending user thena update + API key review

## Deploy Log
| Date | Commit | VPS status |
|---|---|---|
| 2026-08-08 | 5e88da1 (loop 100) | ⏳ PENDING user athena update |

### USER DECISIONS (2026-08-08)
- [7] Auth model: DEFERRED — Discord/Telegram servers are private, only user has access (user confirmation). Revisit if server becomes public.
- [8] LLM tool hardening: APPROVED (recommendation 3a) — proceed.
- [9] Risk engine wiring: APPROVED (recommendation 2a) — proceed.
