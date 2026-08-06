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
[![Tests](https://img.shields.io/badge/Tests-12%2F12%20PASSED-brightgreen.svg)](https://vitest.dev/)
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
9. **💡 Smart CT & AI Alpha Scraper Agent (`#call-ct-alpha`)**: Monitors X (Twitter) for AI Agent launches, airdrop threads, testnet guides, and Smart Money calls using TwexAPI.
10. **🐦 Twitter / X Social Intelligence (`twitter-service.ts`)**: Integrated with **TwexAPI (`https://twexapi.io`)** and GMGN AI for live X sentiment scoring, contract address search, and influencer mention counts.
11. **📊 Trade Journaling & Analytics Engine (`trade-journal-service.ts`)**: Auto-logs all open/closed positions, calculates Win Rate %, Total Realized PnL ($), best/worst trades, and exports `athena_trade_journal.csv` for Excel & Notion.
12. **💾 Local Database File Persistence (`db-service.ts`)**: Atomic file persistence (`database/athena_state.json`) preserving active alerts and trade history across bot reboots.

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
| **Sub-Agent Toggles** | `/screening` | `start`, `stop` | Toggle 24/7 background sub-agents (`meme-solana`, `meme-evm`, `lp-solana`, `lp-evm`, `perps`, `nft`, `prediction`, `ct-alpha`) |
| **Burner Wallets** | `/wallet` | `setup`, `balance` | Manage burner wallets & view SOL/ETH balances |
| **Token Audit** | `/analyze` | `contract:<CA>` | Force 12-point on-demand audit for Solana/EVM token |
| **Quick Price Check** | `/price` | `token:<symbol/CA>` | Quick token price, 24h change, and market cap lookup |
| **Quick Dex Chart** | `/chart` | `token:<symbol/CA>` | Quick chart & DexScreener visual link generator |
| **Holder Breakdown** | `/holders` | `contract:<CA>` | Top Holders audit & insider ownership breakdown |
| **Smart Money Scan** | `/wallets` | `contract:<CA>` | Top Wallets & Smart Money activity scan |
| **Pump.fun Tracker** | `/pump` | `contract:<CA>` | Pump.fun Bonding Curve progress & Raydium graduation tracker |
| **Value Converter** | `/convert` | `amount:<n> symbol:<s>` | Quick token value & SOL/USD converter |
| **Config & Channels** | `/config`, `/channel` | `risk`, `create`, `rearrange` | Update drawdown limits & auto-arrange Discord channel layout |
| **System Upgrade** | `/update` | Direct Command | Pull latest codebase from Git, re-build TypeScript, & soft-restart bot |
| **Emergency Halt** | `/cancel` | `all` | Emergency Aegis Circuit Breaker to halt orders & screening |
| **Natural Language** | Chat | *"Athena, alert me if BTC hits 70k"* | Natural language price alert parser in `#athena-control-room` |

---

## ⚡ Quickstart & Copy-Pasteable Setup Guide

### Method A: One-Click Automatic Installer (Recommended)

#### 🪟 Windows (PowerShell / CMD)
Copy and paste this single block into your PowerShell or CMD terminal:

```powershell
git clone https://github.com/dizcorvus/Athena.git
cd Athena
.\setup.bat
```

#### 🐧 Linux / macOS / VPS Server
Copy and paste this single block into your bash terminal:

```bash
git clone https://github.com/dizcorvus/Athena.git
cd Athena
bash deploy.sh
```

---

### Method B: Manual Step-by-Step Installation

If you prefer to execute commands step-by-step manually, copy and paste each command block in sequence:

#### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/dizcorvus/Athena.git
cd Athena
npm install
npm link
```

#### Step 2: Configure Environment Credentials (`.env`)
Launch the interactive configuration wizard to generate your `.env` file automatically:
```bash
athena wizard
```
*(Alternatively, copy template manually: `cp .env.example .env` and fill in `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID`)*

#### Step 3: Build & Verify Codebase
Compile TypeScript into production JS and run test verification:
```bash
athena build
athena test
```

#### Step 4: Launch Athena Ecosystem
Choose your preferred launch mode:

```bash
# Option 1: Development Mode (Hot-Reloading in terminal)
athena run

# Option 2: Interactive Parthenon Terminal TUI
athena terminal

# Option 3: Production 24/7 Background Process on VPS (PM2)
athena deploy
```

#### Step 5: Update Codebase in Future
Whenever you pull new updates from Git:
```bash
athena update
```

---

## 🤖 Automatic Platform Provisioning (Discord & Telegram)

Upon executing `athena run` or `athena deploy`, Athena automatically provisions your connected communication platforms:

- **👾 Discord Server Auto-Setup:**
  - **Step 1 (Invite Bot to Server):** Invite your Discord Bot to your server using your `CLIENT_ID`:
    `https://discord.com/api/oauth2/authorize?client_id=YOUR_DISCORD_CLIENT_ID&permissions=8&scope=bot%20applications.commands`
  - **Step 2 (Automatic Channel Creation):** Launch `athena run` or `athena deploy`. Athena connects to your server and **automatically creates Category `🏛️ ATHENA COMMAND CENTER` and 10 Channels** (`#athena-control-room`, `#audit-on-demand`, `#call-meme-solana`, `#call-meme-evm`, `#call-perps-futures`, `#call-nft-sniping`, `#call-lp-solana`, `#call-lp-evm`, `#call-prediction-markets`, `#call-ct-alpha`) + registers all 16 Slash Commands. You **NEVER** need to create any channels manually!

- **📱 Telegram Notification & Control Bridge:**
  - When `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` are set in `.env`, Athena automatically broadcasts the **Interactive Control Dashboard** on startup with inline touch buttons (`[▶️ Start Solana]`, `[▶️ Start CT Alpha]`, `[🔑 Balances]`, `[⏸️ Pause All]`).
  - High-confidence signals (Score >= 80%) are automatically formatted and dual-broadcasted directly to your Telegram chat/group in real time.

---

## 🛡️ Security & Safety Rules

- **Dry-Run Safeguard Default**: `DRY_RUN=true` environment flag ensures no live blockchain transactions are sent without explicit confirmation.
- **Global Aegis Circuit Breaker**: Automatic trading lock if daily portfolio drawdown exceeds 5% ($500 USD).
- **Burner Wallet Cap**: Live trading agents strictly operate on isolated burner wallets with capped funds.

---

*Athena Multi-Agent Ecosystem • Built with Precision, Wisdom, and High Alpha.* 🌿🏛️
