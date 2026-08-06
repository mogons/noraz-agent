# 🏛️ ATHENA: Goddess of Wisdom & Autonomous Multi-Agent Crypto Ecosystem

```
                   /\
                  /  \
                 / /\ \
                / /  \ \
               / /____\ \
              /__________\
             |  |  ||  |  |
             |  |  ||  |  |
      🏛️  PARTHENON OF ATHENA  🏛️
  Autonomous Multi-Agent Crypto Intelligence & Trading Ecosystem
```

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-11%2F11%20PASSED-brightgreen.svg)](https://vitest.dev/)
[![Discord](https://img.shields.io/badge/Discord-v14.18-5865F2.svg)](https://discord.js.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Athena is an autonomous, multi-agent crypto intelligence and trading ecosystem inspired by **Athena**, the ancient Greek Goddess of Wisdom, Strategic Warfare, and High Precision. 

Operated through a **Discord Command Center (`#athena-control-room`)**, **Interactive Terminal TUI**, and **Telegram Notification Bridge**, Athena segregates **24/7 Market Screening & 3-Layer Swarm Consensus Signal Generation** from **Trade Execution, Auto-Sell Position Management, and Natural Language AI Diagnostics**.

---

## 🌟 Key Features & Specialized Sub-Agents

1. **🏛️ Athena Core Hub Agent (`#athena-control-room`)**: Handles natural language user chat, portfolio tracking, global risk management, trade execution, custom price alerts (`/alert`), and AI trade audits.
2. **🛡️ 3-Layer Swarm Consensus Engine**: Evaluates candidate signals through Quant & Liquidity, Catalyst & Sentiment, and Security Audits requiring a **>= 80% Confidence Score** before posting to Discord/Telegram.
3. **🐣 Solana Meme Agent (`#call-meme-solana`)**: Screens Solana DEX tokens, Pump.fun bonding curves, Community Takeovers (CTO), and 5m/1h volume surges (>300%).
4. **🔷 EVM Meme Agent (`#call-meme-evm`)**: Screens EVM DEX tokens across **Base L2**, **Ethereum Mainnet**, and **Robinhood Chain L2** with GoPlus Anti-Honeypot security checks.
5. **📈 Perpetual Futures Agent (`#call-perps-futures`)**: Screens Hyperliquid & CEX leverage setups via a 5-Role Swarm (Macro, Quant, Risk, Catalyst, H1/H4 Technical EMA/RSI).
6. **💧 Trade + LP Velocity Engine (`#call-lp-solana` & `#call-lp-evm`)**: Fast-harvesting Concentrated Liquidity signals for Meteora DLMM & Uniswap v3 (>5% Fee/TVL 4h, >150% Volume/TVL 4h, >6x Active Velocity).
7. **🖼️ EVM NFT Momentum Agent (`#call-nft-sniping`)**: Tracks collection floor pumps (>= +30% 4h), volume spikes (>= 3.0x 4h), sales velocity (>= 25 sales/h), and verified bear-market whale sweeps (>= $10k portfolio, >= 5 ETH PnL, active in last 14 days).
8. **🎯 Polymarket Prediction Agent (`#call-prediction-markets`)**: Screens prediction event markets across Crypto, Macro, Politics, and Tech on Polymarket (Polygon L2) for implied odds arbitrage, whale bet inflows (>= $10k USDC), and high-probability resolution yields.
9. **🐦 Twitter / X Social Intelligence (`twitter-service.ts`)**: Integrated with **TwexAPI (`https://twexapi.io`)** and GMGN AI for live X sentiment scoring, contract address search, and influencer mention counts.
10. **📊 Trade Journaling & Analytics Engine (`trade-journal-service.ts`)**: Auto-logs all open/closed positions, calculates Win Rate %, Total Realized PnL ($), best/worst trades, and exports `athena_trade_journal.csv` for Excel & Notion.
11. **💾 Local Database File Persistence (`db-service.ts`)**: Atomic file persistence (`database/athena_state.json`) preserving active alerts and trade history across bot reboots.

---

## 📐 System Architecture Diagram

```
                         +-----------------------------------+
                         |    USER INTERFACE PLATFORMS       |
                         | (Discord / Telegram / Terminal TUI)|
                         +-----------------+-----------------+
                                           |
                         +-----------------v-----------------+
                         |      ATHENA CORE ORCHESTRATOR     |
                         | (#athena-control-room & Hub Exec)  |
                         +-----------------+-----------------+
                                           |
       +--------------------+---------------+--------------------+--------------------+
       |                    |                                    |                    |
+------v-------------+ +----v---------------+              +-----v--------------+ +---v----------------+
|  Solana Meme Agent | |   EVM Meme Agent   |              |   Perps Agent      | | OpenSea NFT Agent  |
| (Pump.fun/Raydium) | |(Base/ETH/Robinhood)|              |  (Hyperliquid/CEX) | |(Base/ETH/Robinhood)|
+---------+----------+ +-------+------------+              +----+---------------+ +---+----------------+
          |                    |                                |                    |
          +--------------------+--------------------------------+                    |
                               |                                                     |
                               v                                                     v
               +-------------------------------+                    +----------------+---------------+
               |    SWARM CONSENSUS ENGINE     |                    |   POLYMARKET PREDICTION AGENT  |
               |  - Quant & Liquidity Layer    |                    | (Odds Arbitrage & Whale Bets)  |
               |  - Catalyst & Sentiment Layer |                    +----------------+---------------+
               |  - Security & Risk Audit      |                                     |
               +---------------+---------------+                                     |
                               | (Score >= 80%)                                      |
                               v                                                     v
             Discord Signal Channels (#call-meme-solana, #call-meme-evm, #call-prediction-markets, etc.)
```

---

## 💬 Complete Interactive Commands & Features Table

| Category | Command | Subcommands / Format | Description |
| :--- | :--- | :--- | :--- |
| **Control Dashboard** | `/menu` / `/dashboard` | Direct Command | Opens the Master Interactive Control Center Embed with Action Buttons & Agent Select Dropdown |
| **Trade Journal** | `/journal` | `summary`, `history`, `export` | View Win-Rate %, PnL summary, recent trades, & download `athena_trade_journal.csv` |
| **Price Alerts** | `/alert` | `set`, `list`, `cancel` | Manage custom real-time price alerts & notifications |
| **Sub-Agent Toggles** | `/screening` | `start`, `stop` | Toggle 24/7 background sub-agents (`meme-solana`, `meme-evm`, `lp-solana`, `lp-evm`, `perps`, `nft`, `prediction`) |
| **Burner Wallets** | `/wallet` | `setup`, `balance` | Manage burner wallets & view SOL/ETH balances |
| **Token Audit** | `/analyze` | `contract:<CA>` | Force 12-point on-demand audit for Solana/EVM token |
| **Quick Price Check** | `/p` | `token:<symbol/CA>` | Quick token price, 24h change, and market cap lookup |
| **Quick Dex Chart** | `/c` | `token:<symbol/CA>` | Quick chart & DexScreener visual link generator |
| **Holder Breakdown** | `/th` | `contract:<CA>` | Top Holders audit & insider ownership breakdown |
| **Smart Money Scan** | `/tw` | `contract:<CA>` | Top Wallets & Smart Money activity scan |
| **Pump.fun Tracker** | `/pf` | `contract:<CA>` | Pump.fun Bonding Curve progress & Raydium graduation tracker |
| **Value Converter** | `/v` | `amount:<n> symbol:<s>` | Quick token value & SOL/USD converter |
| **Config & Channels** | `/config`, `/channel` | `risk`, `create`, `rearrange` | Update drawdown limits & auto-arrange Discord channel layout |
| **System Upgrade** | `/update` | Direct Command | Pull latest codebase from Git, re-build TypeScript, & soft-restart bot |
| **Emergency Halt** | `/cancel` | `all` | Emergency Aegis Circuit Breaker to halt orders & screening |
| **Natural Language** | Chat | *"Athena, kabari kalau BTC 70k"* | Natural language price alert parser in `#athena-control-room` |

---

## 🛠️ Step-by-Step First Time Deployment & Setup Guide

Follow this clean 5-step workflow to deploy Athena for the first time:

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/dizcorvus/Athena.git
cd Athena
npm install
```

### Step 2: Configure Environment File (`.env`)
Copy the template and fill in your Discord Bot credentials, AI provider keys, and optional Telegram tokens:
```bash
cp .env.example .env
```
Key variables to fill in `.env`:
- `DISCORD_BOT_TOKEN`: Your Discord Bot Token (from Discord Developer Portal).
- `DISCORD_CLIENT_ID`: Your Discord Application Client ID.
- `TWEX_API_KEY`: TwexAPI Key from [twexapi.io](https://twexapi.io) (Optional - includes 20k free credits).
- `OPENROUTER_API_KEY` / `OPENAI_API_KEY`: LLM API Key for chat and deep diagnostic reasoning.

### Step 3: Build TypeScript Codebase
```bash
npm run build
```

### Step 4: Run Automated Verification Tests
Verify all 11 core modules pass cleanly:
```bash
npm test
```

### Step 5: Launch Athena Ecosystem
Choose your preferred launch mode:

- **Mode A: Development Hot-Reload**
  ```bash
  npm run dev
  ```
- **Mode B: Production PM2 Process Manager (Background 24/7 Daemon)**
  ```bash
  npm run deploy
  ```
- **Mode C: Terminal Parthenon Interactive UI (TUI)**
  ```bash
  npm run tui
  ```

---

## 🛡️ Security & Safety Rules

- **Dry-Run Safeguard Default**: `DRY_RUN=true` environment flag ensures no live blockchain transactions are sent without explicit confirmation.
- **Global Aegis Circuit Breaker**: Automatic trading lock if daily portfolio drawdown exceeds 5% ($500 USD).
- **Burner Wallet Cap**: Live trading agents strictly operate on isolated burner wallets with capped funds.

---

*Athena Multi-Agent Ecosystem • Built with Precision, Wisdom, and High Alpha.* 🌿🏛️
