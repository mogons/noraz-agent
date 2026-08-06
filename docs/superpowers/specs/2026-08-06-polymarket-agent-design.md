# Polymarket Prediction Market Sub-Agent & Adapter (`polymarket-agent.ts`) - Design Spec

**Date:** 2026-08-06  
**Project:** Athena Multi-Agent Crypto Intelligence System  
**Status:** Approved Specification  

---

## 1. Overview

The **Polymarket Prediction Market Sub-Agent** (`src/agents/prediction/polymarket-agent.ts`) and **Polymarket Adapter** (`src/adapters/polymarket-adapter.ts`) enable Athena to scan, analyze, and execute bets across all Polymarket prediction event markets (**Crypto**, **Macro/Economy**, **Politics**, **Tech**, and **Trending Events**).

High-confidence market setups (Odds Arbitrage, Whale Bet Inflows, High Probability Yields) are broadcast to the dedicated Discord channel **`#call-prediction-markets`**.

---

## 2. Polymarket API & Execution Drivers (`polymarket-adapter.ts`)

- **Market Data Source:** Polymarket Gamma API (`https://gamma-api.polymarket.com/markets` & `/events`) + Polymarket CLOB API (`https://clob.polymarket.com`).
- **Chain & Protocol:** Polygon L2 (USDC / Conditional Token Framework CTF).
- **Execution Capabilities:**
  - `fetchMarketData(conditionId / slug)`: Fetches live YES/NO prices, volume 24h, liquidity depth, and resolution dates.
  - `fetchTopMarkets(category)`: Fetches top markets across Crypto, Macro, Politics, and Tech.
  - `placeBet(marketId, outcome, amountUsdc)`: Order execution with full `DRY_RUN=true` simulation support.

---

## 3. Signal Generation & Screening Strategy

1. ⚖️ **Implied Odds Arbitrage:** Detects when Polymarket outcome probability (e.g. YES at 0.35) deviates significantly from live spot market probability / implied volatility.
2. 🐋 **Whale Order Inflow:** Detects single large bets (`>= $10,000 USDC`) entering low-liquidity prediction outcomes.
3. 🎯 **High-Probability Resolution Yield:** Detects near-resolution markets with odds `>= 92%` offering clean short-term yield.
4. **General Market Accessibility:** Extensible framework allowing user-defined custom strategies across any Polymarket market category.

---

## 4. Discord Integration & Command Center

- **Channel:** **`#call-prediction-markets`** (automatically bootstrapped).
- **Embed Information:**
  - Market Title & Question (e.g. *Will Bitcoin reach $70,000 in August?*).
  - Current YES / NO Prices & Probability.
  - 24h Volume ($) & Liquidity Depth.
  - AI Thesis & Reasoning.
- **Interactive Action Buttons:**
  - `[BET YES 50 USDC]`
  - `[BET NO 50 USDC]`
  - `[VIEW ON POLYMARKET]`

---

## 5. File Layout

```
src/
├── adapters/
│   └── polymarket-adapter.ts          # [NEW] Polymarket Gamma & CLOB API Adapter
├── agents/
│   └── prediction/
│       └── polymarket-agent.ts        # [NEW] Polymarket Screening Sub-Agent
├── discord/
│   └── setup/
│       └── channel-bootstrap.ts       # [MODIFY] Auto-create #call-prediction-markets
└── index.ts                           # [MODIFY] Register PolymarketAgent into system loop
```

---

## 6. Verification & Dry-Run Rules

- Uses `DRY_RUN=true` simulation mode by default.
- Build clean verification via `npm run build`.
