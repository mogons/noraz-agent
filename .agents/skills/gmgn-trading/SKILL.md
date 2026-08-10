---
name: gmgn-trading
description: GMGN AI OpenAPI integration for Robinhood Chain smart money tracking, sniper ratio audit, and meme coin entry screening.
---

# GMGN AI Screening & Smart Money Trading Skill

This skill defines the screening criteria and smart money tracking standards powered by **GMGN AI (https://gmgn.ai)** for the **Robinhood Chain** (EVM, chain ID 4663). The GMGN OpenAPI adapter (`src/adapters/gmgn-adapter.ts`) is the single source of truth for all GMGN requests.

---

## 1. GMGN Smart Money & Sniper Audit Criteria

Before generating any high-confidence meme call or executing an entry:

### A. Smart Money & Whale Tracking
- **Smart Money Inflow:** Verify at least 2+ verified GMGN Smart Trader wallets have bought the same token (agent default: `minTrackWallets=2`, total buy `minTrackBuyUsd=$10k`, fresh within `trackFreshMinutes=30`).
- **Accumulation Cluster:** 3+ smart-money/KOL wallets buying the same token in the fresh window adds a confidence boost (+20) to qualifying signals.

### B. Insider & Sniper Risk Control (fail-open per field — null = not reported, skipped)
- **Insider (rat trader) Ratio:** Total supply held by insider wallets MUST be **< 30%** (agent default `maxRatTraderRate=0.3`).
- **Dev Holding Ratio:** Dev wallet holding MUST be **<= 10%** (or burned/renounced) — `dev_team_hold_rate` / `creator_close`.
- **Top-10 Holders:** MUST be **< 40%** (agent default `maxTop10HolderRate=0.4`).
- **Rug Ratio:** MUST be **< 30%** (agent default `maxRugRatio=0.3`).
- **Wash Trading Check:** Reject tokens flagged `is_wash_trading`.
- **Bundler:** NOT gated (alpha tokens often have high bundler — bundler filter removed 2026-08-09).

---

## 2. Robinhood Chain Screening Support (GMGN API)

- **Chain parameter:** `chain=robinhood` on every endpoint.
- **Separate key:** `GMGN_API_KEY_ROBINHOOD` for the robinhood agent (per-key rate limits); falls back to `GMGN_API_KEY`. Backups auto-rotate via `GMGN_BACKUP_KEYS` on 401/403/429.
- **Dedicated screening agent:** `src/agents/meme-robinhood/robinhood-screening-agent.ts` — 3 candidate sources (all graduated DEX tokens, 1H timeframe):
  1. `/v1/market/rank` (interval 1h, filters: not_honeypot, verified, renounced, is_out_market)
  2. `/v1/trenches` (completed only, max_rug_ratio/max_insider_ratio filters)
  3. `/v1/market/hot_searches` (migrated, not_honeypot, verified, renounced)

---

## 3. GMGN OpenAPI Reference (as implemented in `gmgn-adapter.ts`)

- **Base URL:** `https://openapi.gmgn.ai`
- **Auth:** `X-APIKEY` header (pool of stackable keys + `GMGN_BACKUP_KEYS` rotation on 401/403/429).
- **Signing:** every request appends `timestamp` (unix seconds) and `client_id` (UUID) query params.
- **429 Retry Policy:** read `X-RateLimit-Reset` (or error body `reset_at`), wait until reset + 1s buffer, retry AT MOST once; long bans (>30s) or `RATE_LIMIT_BANNED` are skipped — the next pass (~5m later) retries. Global pacing queue (`GMGN_REQUEST_SPACING_MS`, default 300ms) protects the leaky bucket (rate=20/capacity=20 per key).
- **Endpoints:**
  - `/v1/market/rank` — trending tokens per interval (GET).
  - `/v1/trenches` — newly launched tokens per category (POST, version v2).
  - `/v1/market/hot_searches` — most-searched tokens (POST).
  - `/v1/market/token_signal` — signal events (price spikes, smart money buys, CTO, KOL buys) — used as a confidence booster overlay, NOT a candidate source (GMGN never fills volume/swaps for robinhood events).
  - `/v1/token/info` — per-token detail (GET).
  - `/v1/token/security` — per-token security audit (honeypot, blacklist, renounced, sell-lock, tax, burn, lock) — **fail-closed**: unavailable audit = reject (10-min module cache).
  - `/v1/user/smartmoney` — real-time smart-money wallet trade feed (60s cache).
  - `/v1/user/kol` — real-time KOL wallet trade feed (60s cache).

---

## 4. Signal Card Embed Format & Quick Links

- Provide direct GMGN chart links in call cards:
  `https://gmgn.ai/robinhood/token/{contract_address}`
- Include GMGN Smart Money net buy volume, sniper/insider ratios, and security audit status in the card fields.
