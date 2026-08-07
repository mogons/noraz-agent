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
| 1 | Perps contract + calibration | ✅ DONE (deac83e) | Belum di-review/merge — review tertunda saat user interupsi |
| 2 | NFT contract | ⏳ wt-A | |
| 3 | Prediction contract | ⏳ wt-A | |
| 4 | CT-Alpha contract | ⏳ wt-B | TWEX key = user blocker (WAITING FOR HUMAN nanti) |
| 5 | Hub registry + swarm dedup | ⏳ wt-C | |
| 6 | index.ts unified ×8 + timeout + auto-execute | ⏳ wt-C | |
| 7 | Final verification | ⏳ kapten | |

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

## Deploy Log
| Date | Commit | VPS status |
|---|---|---|
| 2026-08-07 | beb9549 (wallet-tracking) | ✅ deployed (user ran athena update) |
