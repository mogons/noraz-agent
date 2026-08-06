# EVM NFT Momentum & Whale Sweep Sub-Agent (`nft-screening-agent.ts`) - Design Spec

**Date:** 2026-08-06  
**Project:** Athena Multi-Agent Crypto Intelligence System  
**Status:** Approved Specification  

---

## 1. Overview

The **EVM NFT Momentum & Whale Sweep Sub-Agent** (`src/agents/nft/nft-screening-agent.ts`) is a 24/7 background screening sub-agent dedicated to detecting high-momentum NFT volume breakouts, floor price pumps, and whale wallet sweeps across EVM chains (**Ethereum Mainnet**, **Base L2**, and **Robinhood Chain L2**).

It focuses on "Ride the Wave" momentum trading for both newly minted collections and older revivals, delivering high-confidence signals to Discord channel **`#call-nft-sniping`**.

---

## 2. Supported Networks & Data Sources

- **Supported EVM Chains:** `ethereum`, `base`, `robinhood`, `polygon`.
- **Primary Data Sources:** OpenSea REST API v2 & OpenSea WebSockets Stream API (`OpenSeaAdapter`).

---

## 3. High-Momentum Screening & Whale Indicators

### A. Collection Momentum Indicators
1. 📈 **Floor Price Pump Surge (`floorSurge4hPct`):**
   - Triggers when collection floor price surges **`>= +30%` in the last 4 hours**.
2. 🌊 **Volume Explosion Spike (`volumeSpike4hRatio`):**
   - Triggers when 4-hour sales volume is **`>= 3.0x` (300%)** higher than baseline average hourly volume.
3. ⚡ **Sales Velocity Spike:**
   - Triggers when 1-hour collection sales velocity reaches **`>= 25 sales / hour`**.

### B. Bear-Market Adjusted Whale Wallet Criteria (`isWhaleWallet`)
A wallet is classified as a verified **Whale / Smart Money Wallet** if it satisfies ALL of the following:
1. 💰 **Portfolio Value:** Total wallet assets / NFT holdings **`>= $10,000 USD`** (calibrated for bear market conditions).
2. 📊 **Realized PnL:** Cumulative historical trading PnL **`>= 5.0 ETH`**.
3. 🛡️ **Active Wallet Security Verification:**
   - Wallet Age: **`>= 14 days`** (rejects brand-new burner wallets created for wash-trading).
   - Recent Activity: Active transactions within the **last 14 days**.
   - Non-Bot Check: Verified non-wash trading address.

### C. Whale Sweep Event (`isWhaleSweep`)
- Triggers when a verified Whale Wallet buys **`>= 3 NFTs` from the same collection within 15 minutes** (or executes a batch sweep transaction).

---

## 4. Signal Output & Discord Call Cards

- Posts to Discord channel: **`#call-nft-sniping`**.
- **Embed Information:**
  - Collection Name & Token IDs.
  - 4h Floor Price Surge % (e.g. `+37.5% in 4h`).
  - 4h Volume Surge Ratio (e.g. `3.8x Volume`).
  - Whale Wallet Address & Verified Stats (`Holdings: $15.4k | PnL: +8.2 ETH`).
- **Interactive Action Buttons:**
  - `[BUY / VIEW ON OPENSEA]`
  - `[⏸️ PAUSE CHANNEL]`

---

## 5. File Layout

```
src/
├── agents/
│   └── nft/
│       └── nft-screening-agent.ts     # [MODIFY] Update with Momentum & Whale Sweep strategy
├── adapters/
│   └── opensea-adapter.ts             # [MODIFY] Enhance OpenSea adapter with whale tracking
└── index.ts                           # [MODIFY] Register updated NFTScreeningAgent
```

---

## 6. Verification & Dry-Run Rules

- Operating in `DRY_RUN=true` simulation mode by default.
- Build clean verification via `npm run build`.
