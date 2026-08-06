# EVM Meme Screening Agent & Aggressive Trade+LP Engine - Design Spec

**Date:** 2026-08-06  
**Project:** Athena Multi-Agent Crypto Intelligence System  
**Status:** Approved Specification  

---

## 1. Overview

This document specifies the technical design for:
1. **EVM Meme Screening Agent** (`src/agents/meme-evm/evm-screening-agent.ts`): 24/7 background DEX screening across **Base**, **Ethereum Mainnet**, and **Robinhood Chain L2**.
2. **Aggressive Trade + LP Velocity Engine** (`UniswapLPAdapter` & `MeteoraDLMMAdapter`): High-volume LP sniping strategy focused on capturing massive short-term trading fees (*fee deres*) from hyper-active volume runners.
3. **Position Manager Active LP Alerts** (`src/position/position-manager.ts`): Live position monitoring alerts adjusted to trigger immediate exit / re-allocation notices when 4-hour LP velocity or fee generation falls below aggressive thresholds.

---

## 2. EVM Meme Sub-Agent Specification (`evm-screening-agent.ts`)

### Supported Networks & DEX Routers
- **Base L2 (`base`)**: Aerodrome, Uniswap v3 Base, Virtuals Protocol.
- **Robinhood Chain L2 (`robinhood`)**: Uniswap v3 / Robinhood L2 Swap Router.
- **Ethereum Mainnet (`ethereum`)**: Uniswap v2 / v3.

### Swarm Consensus 3-Layer Filter
- **Layer 1: Quant & Liquidity Audit**
  - Minimum DEX Liquidity: `$25,000 USD`.
  - 5m Volume Surge: `>= 300%` (5x spike over previous 5m baseline).
  - 1h Volume Surge: `>= 300%` (over 24h hourly average).
  - DEX Paid Status: DEXScreener / GMGN Paid flag mandatory.
- **Layer 2: Catalyst & Social Hype Audit**
  - GMGN EVM Smart Money Net Inflow (minimum 2+ Smart Wallets accumulating ETH/USDC).
  - Active Twitter/X link presence (MANDATORY, non-recycled/non-suspended account).
  - AI Sentiment Score `>= 75/100`.
- **Layer 3: GoPlus Security Audit (Anti-Honeypot & Tax)**
  - Honeypot Check: `is_honeypot = 0`, `cannot_buy = 0`, `cannot_sell = 0`.
  - Buy / Sell Tax: `<= 5%` maximum (HARD REJECT if tax > 5%).
  - Ownership Control: Renounced or Creator/Dev balance `<= 10%`.
  - Top 10 Holders Share: `<= 25%`.
  - Blacklist Authority: Disabled (`is_blacklisted = 0`).
  - Overall Calculated Rug Risk Score: `<= 5%`.

---

## 3. Aggressive "Trade + LP" Velocity Strategy Specification

Unlike traditional long-term passive yield LPing, Athena's LP Engine focuses on **High-Volume Capital Velocity Sniping**. It targets tokens experiencing extreme volume bursts to extract maximum 4-hour trading fees before exiting.

### Core 4-Hour Screening Ratios
1. **Fee to TVL 4H Ratio (`feesToTvlRatio4h`):**
   - Threshold: **`> 5.0%` (0.05)** per 4 hours.
   - Purpose: Isolates hyper-profitable pools generating >= 5% TVL in fees every 4 hours (~30% daily yield / 10,000%+ APR).
2. **Volume to Total TVL 4H Ratio (`volumeToTvlRatio4h`):**
   - Threshold: **`> 150%` (1.5x)** in the last 4 hours.
   - Purpose: Guarantees entire pool liquidity turns over 1.5x+ times in 4 hours (verifies extreme market activity).
3. **Volume to Active TVL Velocity Ratio (`volumeToActiveTvlRatio4h`):**
   - Threshold: **`> 6.0x` (6.0x)** in the last 4 hours.
   - Purpose: Ensures trading volume repeatedly slams directly into the concentrated active tick/bin range where Athena's LP liquidity is deployed.
4. **Minimum 24h Pool Fees Threshold:**
   - EVM Pools (Base, Ethereum, Robinhood): **`>= 0.5 ETH`** in accumulated 24h fees.
   - Solana Pools (Meteora DLMM): **`>= 10 SOL`** in accumulated 24h fees.
5. **Organic Activity & Safety:**
   - Organic Trading Score: `>= 65%` (filters wash-trading bots).
   - Minimum Pool Age: `>= 6 hours` (360 minutes).

---

## 4. Position Manager Active LP Position Alerts (`position-manager.ts`)

Active open LP positions are continuously monitored against the aggressive strategy thresholds to alert users when it is time to withdraw LP capital or re-range:

1. **🚨 Out of Range Alert:** Triggered immediately when price leaves active bin/tick range (*fees stop generating*).
2. **📉 Fee Yield Drop Alert:** Triggered when 4-hour fee yield falls below `5.0%` (`feesToTvlRatio4h < 0.05`).
3. **📉 Volume Dry-Up Alert:** Triggered when 4-hour volume turnover drops below `150%` (`volumeToTvlRatio4h < 1.5`).
4. **⚡ Active Velocity Drop Alert:** Triggered when active bin turnover drops below `6.0x` (`volumeToActiveTvlRatio4h < 6.0`).
5. **⚠️ Wash-Trading / Organic Warning:** Triggered when organic score drops below `65%`.

---

## 5. Signal Delivery & Discord Controls

- **Meme Signals (`#call-meme-evm`)**:
  - Broadcasts signals with total Swarm Score `>= 80%`.
  - Buttons: `[BUY 0.1 ETH]`, `[BUY 0.5 ETH]`, `[BUY 1.0 ETH]`, `[⏸️ PAUSE CHANNEL]`.
- **LP Signals (`#call-meme-evm` & `#call-meme-solana`)**:
  - Broadcasts LP pools matching the Aggressive Trade + LP strategy.
  - Buttons: `[DEPOSIT LP 0.5 ETH]` / `[Spot LP 1.0 SOL]`.

---

## 6. File Layout

```
src/
├── agents/
│   └── meme-evm/
│       └── evm-screening-agent.ts     # [NEW] EVM Meme Sub-Agent Implementation
├── adapters/
│   ├── uniswap-lp-adapter.ts          # [MODIFY] Apply Aggressive Trade+LP 5% Fee & 150% Vol Ratios
│   └── meteora-dlmm-adapter.ts        # [MODIFY] Apply Aggressive Trade+LP 5% Fee & 150% Vol Ratios
├── position/
│   └── position-manager.ts            # [MODIFY] Update Active LP position alert thresholds
└── index.ts                           # [MODIFY] Register EVMScreeningAgent into Athena system loop
```

---

## 7. Verification & Dry-Run Rules

- System operates with `DRY_RUN=true` by default.
- Build verification via `npm run build` and `vitest run`.
