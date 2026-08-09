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
[![Node.js](https://img.shields.io/badge/Node.js-v22%2B-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-247%20PASSED-brightgreen.svg)](https://vitest.dev/)
[![Discord](https://img.shields.io/badge/Discord-v14.18-5865F2.svg)](https://discord.js.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Athena is an autonomous, multi-agent crypto intelligence and trading ecosystem inspired by **Athena**, the ancient Greek Goddess of Wisdom, Strategic Warfare, and High Precision. 

Operated through a **Discord Command Center (`#athena-control-room`)**, **Interactive Terminal TUI**, and **Telegram Notification Bridge**, Athena segregates **24/7 Market Screening & 3-Layer Swarm Consensus Signal Generation** from **Trade Execution, Auto-Sell Position Management, and Natural Language AI Diagnostics**.

---

## 🌟 Key Features & Specialized Sub-Agents

1. **🏛️ Athena Core Hub Agent (`#athena-control-room`)**: Handles natural language user chat, portfolio tracking, global risk management, trade execution, custom price alerts (`/alert`), and AI trade audits.
2. **🛡️ 3-Layer Swarm Consensus Engine**: Evaluates candidate signals through Quant & Liquidity, Catalyst & Sentiment, and Security Audits requiring a **>= 80% Confidence Score** before posting to Discord/Telegram.
3. **🐣 Solana Meme Agent (`#call-meme-solana`)**: Screens Solana DEX tokens, Pump.fun bonding curves, Community Takeovers (CTO), and Revival; hard gate volume 1 JAM real >= $50k + smart money/CTO/KOL wajib.
4. **🔷 EVM Meme Agent (`#call-meme-robinhood`)**: Screens EVM DEX tokens across **Base L2**, **Ethereum Mainnet**, and **Robinhood Chain L2** with GoPlus Anti-Honeypot security checks; hard gate volume 1 JAM real >= $50k.
5. **📈 Perpetual Futures Agent (`#call-perps-futures`)**: Screens Hyperliquid & CEX leverage setups via a 5-Role Swarm (Macro, Quant, Risk, Catalyst, H1/H4 Technical EMA/RSI).
6. **💧 Trade + LP Velocity Engine (`#call-lp-solana` & `#call-lp-robinhood`)**: Fast-harvesting Concentrated Liquidity signals for Meteora DLMM & Robinhood Chain CLMM (Aerodrome/Uniswap) (24h Fee/TVL > 4%, Fee 1h >= $50, TVL >= $20k, Velocity volume/active TVL >= 1.0).
7. **🖼️ EVM NFT Momentum Agent (`#call-nft-sniping`)**: Hard-filter momentum calls — floor pump >= +20% 1h, volume spike >= 2.0x, sales velocity >= 5/h (semua wajib); whale sweep & OpenSea verified badge sebagai info di card.
8. **🎯 Polymarket Prediction Agent (`#call-prediction-markets`)**: Screens prediction event markets across Crypto, Macro, Politics, and Tech on Polymarket (Polygon L2) for implied odds arbitrage, whale bet inflows (>= $10k USDC), and high-probability resolution yields.
9. **💡 Smart CT & AI Alpha Scraper Agent (`#call-ct-alpha`)**: Monitors X (Twitter) for AI Agent launches, airdrop threads, testnet guides, and Smart Money calls using TwexAPI.
10. **🌉 Direct Multi-Provider On-Chain Execution & Relay / OpenSea Engine (`wallet-service.ts`, `relay-adapter.ts`, `opensea-adapter.ts`)**: Direct programmatic transaction signing via in-memory `WalletService` for cross-chain bridging (`/bridge`), DEX swaps (`/swap`), and token transfers (`/send`) with **dual-engine fallback routing** across **Relay.link** and **OpenSea API v2 DEX Aggregator** (supporting ERC-8257 AI Agent Tool Discovery) on Ethereum, Base, Arbitrum, Optimism, Solana, Polygon, BSC, and Zora.
11. **🐦 Twitter / X Social Intelligence (`twitter-service.ts`)**: Integrated with **TwexAPI (`https://twexapi.io`)** and GMGN AI for live X sentiment scoring, contract address search, and influencer mention counts.
12. **📊 Trade Journaling & Analytics Engine (`trade-journal-service.ts`)**: Auto-logs all open/closed positions, calculates Win Rate %, Total Realized PnL ($), best/worst trades, and exports `athena_trade_journal.csv` for Excel & Notion.
13. **💾 Local Database File Persistence (`state-store.ts`)**: Atomic file persistence (`database/athena_state.json`) preserving wallet keys, active alerts, trade history, agent states, and signal ledger across bot reboots.
14. **🩺 Diagnostic Doctor (`athena doctor`)**: Runs a full system health check — API keys, sub-agent statuses, risk state, and connectivity.

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
                    |  (risk gate · swarm gate · dedup)  |
                    +-----------------+-----------------+
                                      |
   +------------+------------+--------+--------+------------+------------+
   |            |            |                 |            |            |
+--v---------+ +-v---------+ +-v---------+ +--v---------+ +-v---------+ +-v---------+
| Solana     | | EVM Meme  | | Perps     | | NFT        | | Prediction| | CT Alpha  |
| Meme Agent | | Agent     | | Agent     | | Agent      | | Agent     | | Agent     |
| (GMGN/Ray) | |(GMGN/Base)| |(Hyperliq) | |(OpenSea)   | |(Polymarket)| |(Twitter)  |
+--+---------+ +-+---------+ +-+---------+ +--+---------+ +-+---------+ +-+---------+
   |            |            |                 |            |            |
   +------------+------------+-----------------+------------+------------+
                              |
                  +-----------v-----------+
                  |  SWARM CONSENSUS      |
                  |  ENGINE (>= 80 gate)  |
                  +-----------+-----------+
                              |
              +---------------+---------------+
              |                               |
      +-------v--------+             +--------v-------+
      | LP Solana      |             | LP EVM         |
      | (Meteora DLMM) |             | (Robinhood Chain CLMM (Aerodrome/Uniswap))   |
      +----------------+             +----------------+
                              |
                              v
        Discord Signal Channels (#call-meme-solana, #call-perps-futures, ...)
```

---

## 💬 Complete Interactive Commands & Features Table

| Category | Command | Subcommands / Format | Description |
| :--- | :--- | :--- | :--- |
| **Control Dashboard** | `/menu` / `/dashboard` | Direct Command | Opens the Master Interactive Control Center Embed with Action Buttons & Agent Select Dropdown |
| **Trade Journal** | `/journal` | `summary`, `history`, `export` | View Win-Rate %, PnL summary, recent trades, & download `athena_trade_journal.csv` |
| **Price Alerts** | `/alert` | `set`, `list`, `cancel` | Manage custom real-time price alerts & notifications |
| **Sub-Agent Toggles** | `/screening` | `start`, `stop` | Toggle 24/7 background sub-agents (`meme-solana`, `meme-robinhood`, `lp-solana`, `lp-robinhood`, `perps`, `nft`, `prediction`, `ct-alpha`) |
| **Burner Wallets** | `/wallet` | `setup`, `balance` | Manage burner wallets & view SOL/ETH balances |
| **Token Audit** | `/analyze` | `contract:<CA>` | Force 12-point on-demand audit for Solana/EVM token |
| **Quick Price Check** | `/price` | `token:<symbol/CA>` | Quick token price, 24h change, and market cap lookup |
| **Quick Dex Chart** | `/chart` | `token:<symbol/CA>` | Quick chart & DexScreener visual link generator |
| **Holder Breakdown** | `/holders` | `contract:<CA>` | Top Holders audit & insider ownership breakdown |
| **Smart Money Scan** | `/wallets` | `contract:<CA>` | Top Wallets & Smart Money activity scan |
| **Pump.fun Tracker** | `/pump` | `contract:<CA>` | Pump.fun Bonding Curve progress & Raydium graduation tracker |
| **Value Converter** | `/convert` | `amount:<n> symbol:<s>` | Quick token value & SOL/USD converter |
| **Cross-Chain Bridge** | `/bridge` | `origin:<chain> destination:<chain> amount:<n> token:<symbol>` | Relay.link & OpenSea DEX Aggregator intent-based cross-chain bridge & direct execution (ETH, Base, Arbitrum, Optimism, Solana, Polygon, BSC, Zora) |
| **Token Swap** | `/swap` | `from:<token> to:<token> amount:<n> chain:<chain>` | Multi-provider (Relay.link + OpenSea API v2) token swap with automatic fallback & direct on-chain signing |
| **Token Send** | `/send` | `to:<address> amount:<n> token:<symbol> chain:<chain>` | Direct token transfer to another wallet via Relay.link / OpenSea with fee estimation |
| **Config & Channels** | `/config`, `/channel` | `risk`, `create`, `rearrange` | Update drawdown limits & auto-arrange Discord channel layout |
| **System Upgrade** | `/update` | Direct Command | Pull latest codebase from Git, re-build TypeScript, & soft-restart bot |
| **Emergency Halt** | `/cancel` | `all` | Emergency Aegis Circuit Breaker to halt orders & screening |
| **Natural Language** | Chat | *"swap 0.5 ETH ke USDC"*, *"kirim 1 ETH ke 0x..."* | Natural language bridge, swap, send & price alert parser in `#athena-control-room` |

---

## 💻 Hardware & VPS Specification Recommendations

Athena is engineered with an asynchronous Node.js Event Loop architecture and local deterministic mathematics, rendering it highly resource-efficient without requiring expensive GPUs or heavy server specs.

| Resource | Recommended VPS / Server Spec | Minimum Spec | Key Recommendations |
| :--- | :--- | :--- | :--- |
| 🐧 **Operating System** | **Ubuntu 22.04 / 24.04 LTS 64-bit** | Windows 10/11, macOS, Debian 12 | Ubuntu 22.04 or 24.04 LTS are fully supported for 24/7 VPS daemons |
| ⚡ **CPU / Processor** | **1 vCPU / Core** | 1 vCPU / Core | 1 Core easily handles all 7 screening loops asynchronously |
| 🧠 **Memory (RAM)** | **2 GB RAM** | 1 GB RAM | 2 GB RAM provides 100% headroom with zero OOM crash risk |
| 💾 **Storage (Disk)** | **20 – 40 GB SSD / NVMe** | 15 GB SSD | Stores local database state, trade logs, and `/dist` bundle |
| 🛑 **Control Panel** | **None (Plain OS Only)** | None | **Do NOT install cPanel/Plesk** to save ~1GB RAM for Athena |

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

### CLI Cheatsheet

| Command | Description |
| :--- | :--- |
| `athena run` (or `athena`) | Launch Athena (development / live bot) |
| `athena wizard` (or `setup`) | Interactive configuration wizard for `.env` |
| `athena terminal` (or `tui`) | Parthenon interactive terminal TUI |
| `athena deploy` | Deploy 24/7 background daemon via PM2 |
| `athena test` | Run automated unit test suite |
| `athena build` | Compile TypeScript into `/dist` |
| `athena update` | Pull latest Git updates, install & rebuild |
| `athena doctor` (or `check`) | Run system diagnostics |

---

## 🤖 Automatic Platform Provisioning (Discord & Telegram)

Upon executing `athena run` or `athena deploy`, Athena automatically provisions sub-channels on both Discord & Telegram:

### 👾 Discord Server Setup & Auto-Channel Creation
1. **Create Discord Server:** Click `+` (Add a Server) in Discord to create a server (takes 2 seconds).
2. **Invite Bot:** Open this OAuth2 link in your browser to invite your bot:
   `https://discord.com/api/oauth2/authorize?client_id=YOUR_DISCORD_CLIENT_ID&permissions=8&scope=bot%20applications.commands`
3. **Automatic Channel Creation:** Launch `athena run` or `athena deploy`. Athena automatically creates Category **`🏛️ ATHENA COMMAND CENTER`**, 10 Text Channels (`#athena-control-room`, `#audit-on-demand`, `#call-meme-solana`, `#call-meme-robinhood`, `#call-perps-futures`, `#call-nft-sniping`, `#call-lp-solana`, `#call-lp-robinhood`, `#call-prediction-markets`, `#call-ct-alpha`), and registers all 16 Slash Commands. Zero manual channel setup required!

---

### 📱 Telegram Group Setup & Auto-Forum Topics Creation
1. **Create Telegram Group & Enable Topics:** Create a Telegram Group, open **Group Settings** ➡️ Enable **Topics / Forum Mode**, and add your bot as Admin.
2. **Set Chat ID:** Get your Group Chat ID (e.g. `-100123456789`) via [@userinfobot](https://t.me/userinfobot) and set `TELEGRAM_CHAT_ID` in `.env`.
3. **Automatic Sub-Topic Creation:** Launch `athena run` or `athena deploy`. Athena automatically calls Telegram API to **create 10 Forum Sub-Topics** (`athena-control-room`, `call-meme-solana`, `call-meme-robinhood`, `call-ct-alpha`, etc.) and routes each domain signal to its dedicated sub-topic automatically!
*(Note: If using a Private Chat DM, signals and the interactive touch control dashboard arrive directly in your DM chat)*.

---

## 🛡️ Security & Safety Rules

- **Dry-Run Safeguard Default**: `DRY_RUN=true` environment flag ensures no live blockchain transactions are sent without explicit confirmation.
- **Global Aegis Circuit Breaker**: Automatic trading lock if daily portfolio drawdown exceeds the configured limit.
- **Burner Wallet Cap**: Live trading agents strictly operate on isolated burner wallets with capped funds.
- **Sandboxed Strategies**: User/LLM-authored strategy `.mjs` modules run with a sanitized `process.env` — they can never read private keys or API secrets.
- **Prompt-Injection Hardening**: Token names/symbols/tweets are sanitized before rendering into Discord embeds; `set_api_key` is restricted to an allowlist (mode/private-key/infra keys are blocked).

---

## ⚠️ Financial Disclaimer

> [!WARNING]
> **NOT FINANCIAL ADVICE (NFA)**  
> The software, signals, AI summaries, and quantitative heuristics provided by Athena are strictly for educational, research, and informational purposes. Cryptocurrency, meme tokens, perpetual leverage, NFTs, and prediction markets involve extreme volatility and high risk of capital loss. Never trade with funds you cannot afford to lose. Always perform your own independent research (DYOR).

---

## 📜 License

This project is licensed under the terms of the [MIT License](LICENSE).

---

*Athena Multi-Agent Ecosystem • Built with Precision, Wisdom, and High Alpha.* 🌿🏛️
