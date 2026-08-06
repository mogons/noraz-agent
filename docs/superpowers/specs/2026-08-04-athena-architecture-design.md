# Athena Multi-Agent Crypto Intelligence & Trading System - Design Spec

**Date:** 2026-08-04 (Updated with Swarm Consensus & Trade Audit Journal)  
**Project:** Athena Crypto Agent System  
**Status:** Approved Specification  

---

## 1. Overview

**Athena** is an autonomous multi-agent crypto intelligence and trading ecosystem operated via a **Discord Command Center**. The system segregates **24/7 Market Screening & High-Confidence Call Generation** from **Trade Execution, Auto-Sell Position Management, and Trade Diagnostics**.

---

## 2. Core Architecture & Swarm Intelligence

Athena adopts a **Modular Multi-Agent Architecture with Swarm Consensus**, inspired by modern quantitative agent frameworks.

```
                         +-----------------------------------+
                         |      USER (Discord Server)        |
                         +-----------------+-----------------+
                                           |
                         +-----------------v-----------------+
                         |      ATHENA CORE ORCHESTRATOR     |
                         | (#athena-control-room & Trade Exec)|
                         +-----------------+-----------------+
                                           |
      +--------------------+---------------+--------------------+--------------------+
      |                    |                                    |                    |
+-----v--------------+ +---v----------------+              +----v---------------+ +---v----------------+
|  Solana Meme Agent | |   EVM Meme Agent   |              |   Perps Agent      | |    NFT Agent       |
|  (Pump.fun/Raydium)| | (Base/ETH Uniswap) |              |  (Hyperliquid/CEX) | |(Blur/MagicEden)  |
+---------+----------+ +-------+------------+              +----+---------------+ +---+----------------+
          |                    |                                |                    |
          +--------------------+--------------------------------+                    |
                               |
                               v
               +-------------------------------+
               |    SWARM CONSENSUS ENGINE     |
               |  - Quant & Liquidity Layer    |
               |  - Catalyst & Sentiment Layer |
               |  - Security & Risk Audit      |
               +---------------+---------------+
                               | (Score >= 80%)
                               v
            Discord Signal Channels (#call-meme-solana, etc.)
```

---

## 3. Advanced Sub-Systems & Features

### 3.1 Swarm Consensus Engine (Signal Quality Gate)
Before any token or perps setup is posted as a Call Signal to Discord, it must pass 3 validation layers:
1. **Quant Layer:** Validates minimum liquidity depth, 5m/1h volume surges, buy/sell transaction ratios.
2. **Catalyst & Hype Layer:** Evaluates social momentum (Twitter/X mentions, Pump.fun bonding curve speed, narrative keyword matches).
3. **Security & Risk Layer:** Runs RugCheck API (Solana) / GoPlus API (EVM) for honeypot and mint/freeze authority checks + Global Risk Engine drawdown checks.
* **Result:** Only signals with **Confidence Score >= 80%** are posted, eliminating low-quality noise.

### 3.2 Position Manager (Auto TP / SL & Trailing Stop)
When a trade is executed via Athena Hub (or via Discord Buy buttons):
* **Auto Take Profit (TP):** Pre-configured multi-tier exit (e.g. Sell 50% at +100%/2x, 25% at +200%/3x).
* **Auto Stop Loss (SL):** Hard stop loss execution if token drops below threshold (e.g. -20%).
* **Dynamic Trailing Stop:** Adjusts stop-loss upwards as price climbs to lock in gains.

### 3.3 Trade Journal & Audit Engine
* Stores full execution history, entry reasoning, AI thesis, timestamped price action, and final realized PnL in SQLite/Prisma.
* Enables natural language queries in `#athena-control-room` (e.g. *"Athena, what is our win-rate on Solana memes this week?"* or *"Explain why token $XYZ was sold"*).

### 3.4 Model Context Protocol (MCP) Interface
* Exposes Athena's screening and trade metrics via an **MCP Server**, allowing external tools (Cursor IDE, Claude Desktop, custom scripts) to interface with Athena.

### 3.5 Liquidity Provisioning (LP) Signal Engine (Meteora DLMM & Uniswap v3/v4)
Athena supports high-yield, safer **Liquidity Provisioning (LP) Opportunity Signals** alongside token buy calls:
* **Solana Meteora DLMM Pools (`#call-meme-solana`):** Analyzes high fee-yield Meteora Dynamic Concentrated Liquidity pools (inspired by Meridian strategies), evaluating Bin Step, 24h Fee/TVL ratios, dynamic fee APRs, and recommended price range distributions (Spot, Curve, Bid-Ask).
* **EVM Uniswap Concentrated Pools (`#call-meme-evm`):** Scans Base and Ethereum Uniswap v3/v4 pools for high trading fee efficiency, low impermanent loss risk, and recommended range tick bounds.

---

## 4. Discord Command Center Layout & Interactive UI

### 4.1 Channels Layout
* **⚙️ `#athena-control-room`**: Core interaction, manual buy/sell commands, risk settings, trade audit queries, and balance overview.
* **🚀 `#call-meme-solana`**: High-confidence Solana DEX token calls (Pump.fun, Raydium, Meteora).
* **🔷 `#call-meme-evm`**: High-confidence EVM token calls (Base Aerodrome, Ethereum Uniswap).
* **📈 `#call-perps-futures`**: Leverage trading setup calls (Hyperliquid, Binance, Bybit).
* **🖼️ `#call-nft-sniping`**: Underpriced NFT floor alerts (MagicEden, Blur).

### 4.2 Interactive Discord Commands & UI Specification

1. **🔑 Private Key & Wallet Management (`/wallet`):**
   * `/wallet setup` ➡️ Triggers a secure **Discord Ephemeral Modal Dialog** (Pop-up window hidden from chat logs) allowing users to safely import burner wallet Private Keys.
   * `/wallet balance` ➡️ Displays current native gas (SOL/ETH) & token balances.
   * `/wallet withdraw <address>` ➡️ Transfers accumulated trading profits to a cold wallet.

2. **🔍 On-Demand 24/7 Deep Audit (`/analyze`):**
   * `/analyze <contract_address>` ➡️ Forces screening sub-agents & Swarm Consensus Engine to execute an instant 3-layer audit (Liquidity, Security, AI Sentiment) on any specified token contract without waiting for automated signals.

3. **⚡ Screening Controls (`/screening`):**
   * `/screening start <domain>` ➡️ Activates 24/7 background screening for specific sub-agents (`meme-solana`, `meme-evm`, `perps`, `nft`).
   * `/screening stop <domain>` ➡️ Deactivates screening for a specific sub-agent domain.

4. **🛑 Emergency Cancellation & Pausing (`/cancel` & Action Buttons):**
   * `/cancel order <order_id>` ➡️ Cancels pending limit/buy/sell orders.
   * `/cancel all` ➡️ Emergency circuit breaker command to halt all active orders & pause screening across all channels.
   * **`[⏸️ Pause Channel]` Button:** Embedded in every signal card to instantly pause screening in that channel with a single click.

5. **⚙️ Dynamic Strategy Configuration (`/config`):**
   * `/config risk` ➡️ Interactively updates Max Daily Drawdown, per-trade position size, Auto TP/SL targets, and dynamic trailing stop percentages.
   * `/config filter` ➡️ Adjusts minimum liquidity depth (e.g. $5k vs $10k USD) and Swarm Consensus confidence threshold (e.g. 80% vs 90%).

---

## 5. Technology Stack

* **Runtime:** Node.js (v20+) / TypeScript
* **Discord Framework:** `discord.js` v14
* **Web3 & Trading SDKs:** `@solana/web3.js`, `@jup-ag/api`, `viem`, `ethers`, `ccxt`
* **AI Provider:** OpenRouter / OpenAI API / Anthropic SDK
* **Database & Persistence:** SQLite / Prisma ORM / Redis
* **Protocols:** MCP (Model Context Protocol) SDK

---

## 6. Safety & Verification Rules

* **Dry-Run Default:** `DRY_RUN=true` environment flag ensures no real transactions are sent during testing.
* **Burner Wallet Cap:** Dedicated wallet instances with capped funds for live operation.
* **Global Circuit Breaker:** Automatic trading lock if daily portfolio drawdown exceeds 5%.
