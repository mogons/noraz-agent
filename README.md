# 🐾 OPENCAT AI — Robinhood Chain Edition

```
       /\_____/\
      /  ■   ■  \       🐾 OPENCAT AI (ROBINHOOD CHAIN) 🐾
     ( ==  ^  == )      Autonomous Multi-Agent Crypto Intelligence
      )    ~    (       & On-Chain Trading Ecosystem
     (   _____   )      exclusively for Robinhood Chain EVM L2 (#4663)
    ( (  )   (  ) )
   (__(__)___(__)__)
```

**Autonomous Multi-Agent Crypto Intelligence & Trading Ecosystem** — built exclusively for **Robinhood Chain (EVM L2, chain ID 4663, native ETH)**, operated through a **Discord Command Center**, an **Interactive Terminal TUI**, and a **Telegram Notification Bridge**.

Opencat AI separates **24/7 market screening + 3-Layer Swarm Consensus signal generation** from **execution** — signal cards are delivered to Discord with audit data and one-click links, while execution stays under your control via `DRY_RUN` and manual confirmation.

[![Chain](https://img.shields.io/badge/Robinhood%20Chain-4663%20%7C%20ETH-7b5cff.svg)](https://robinhoodchain.blockscout.com)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D22.12-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-Vitest%20Suite-brightgreen.svg)](https://vitest.dev/)
[![Discord](https://img.shields.io/badge/Discord-v14.18-5865F2.svg)](https://discord.js.org/)

---

## 🐾 The OpenCat System Architecture

| Component | Role | What it does |
| :--- | :--- | :--- |
| 🐾 **OpenCat Core** — Intelligence | Screening & Reasoning | **3-Layer Swarm Consensus Engine** (Quant & Liquidity, Catalyst & Sentiment, Security Audit) demanding a **≥ 80% Confidence Score** before a signal is posted. Five specialist screening agents run 24/7: **meme-robinhood** (GMGN smart-money data + GMGN/GoPlus security audits, **24h volume ≥ $25k**, **liquidity ≥ $5k**), **lp-robinhood** (Concentrated Liquidity velocity via **Krystal Cloud**, **TVL ≥ $10k**, **24h volume ≥ $100k**, **24h Fee/TVL ≥ 2%**), **nft** (OpenSea floor & rarity sniping, **floor surge ≥ +10%/1h**, **volume spike ≥ 1.5x**, **sales ≥ 3/h**), **alpha-robinhood** (1-hour Robinhood Chain alpha scraper + optional official **X (Twitter) API v2** social sentiment search), and **whale-eth** (Hyperliquid ETH smart money & institutional perps/spot order flow tracking, **perps ≥ $500k**, **spot ≥ $50k**). A **Position Manager** tracks open positions with Take Profit milestones (**+100% / +200%**), **Stop Loss (-20%)**, **dynamic trailing stops**, LP out-of-range warnings, and NFT floor-drop alerts. |
| 🎮 **Command Center** — Multi-Platform | Discord · Terminal · Telegram | **1. Discord**: `#opencat-control-room` natural-language chat, `#opencat-audit` token auditor, portfolio & risk views, **22 slash commands**, interactive dashboard, and 5 dedicated call channels (`#call-meme-robinhood`, `#call-lp-robinhood`, `#call-nft-robinhood`, `#call-alpha-robinhood`, `#call-whale-eth`).<br>**2. Terminal TUI** (`opencat terminal`): Full interactive standalone console with live token audits, screening triggers, strategy switcher, treasury & portfolio management without Discord.<br>**3. Telegram Bridge**: Real-time signal alert broadcast cards with quick inline action buttons and interactive callback dashboard. |
| ⚡ **Cat Den Ops** — Deploy & Maintain | Daemon & Health | **PM2 24/7 daemon** (`opencat deploy`), self-update engine (`opencat update` → git pull → install → build → detached PM2 restart) with **Telegram + Discord webhook deployment notifications**, `opencat doctor` full diagnostics, and interactive **`opencat onboard`** wizard. |

---

## 🗺️ System Flowchart

```
                          USER INTERFACE PLATFORMS
             (Discord Command Center · Terminal TUI · Telegram Bridge)
                                     │
                                     ▼
                  ┌───────────────────────────────────┐
                  │        OPENCAT CORE HUB           │
                  │   #opencat-control-room · chat    │
                  │   risk gate · 9-lives risk engine │
                  │   wallet service · trade journal  │
                  └──────────────────┬────────────────┘
                                     │ candidate signals
    ┌────────────────┬───────────────┼───────────────┬────────────────┐
    ▼                ▼               ▼               ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  MEME AGENT  │ │ LP VELOCITY  │ │  NFT AGENT   │ │ ALPHA SCRAPER│ │ ETH WHALES   │
│meme-robinhood│ │ lp-robinhood │ │    nft       │ │alpha-robinhood│ │ whale-eth    │
│ GMGN + GoPlus│ │ Krystal Cloud│ │   OpenSea    │ │X API v2 / Web│ │ Hyperliquid  │
│vol 24h ≥ $25k│ │Fee/TVL ≥ 2%  │ │floor +10%/1h │ │1h rh alpha   │ │perps ≥ $500k │
│liq ≥ $5k     │ │TVL ≥ $10k    │ │sales ≥ 3/h   │ │sentiment high│ │spot ≥ $50k   │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       └────────────────┴───────────────┼────────────────┴────────────────┘
                                        ▼
                  ┌────────────────────────────────────┐
                  │   SWARM CONSENSUS ENGINE (≥ 80%)   │
                  │  Quant · Catalyst · Security Audit │
                  └────────────────┬───────────────────┘
                                   │ only ≥ 80% confidence
                                   ▼
         MULTI-PLATFORM DISPATCH (Discord · Terminal TUI · Telegram)
  • Discord:  #call-meme-robinhood · #call-lp-robinhood · #call-nft-robinhood · #call-alpha-robinhood · #call-whale-eth
  • Terminal: Interactive TUI Live Feed, Audits & Chat (opencat terminal)
  • Telegram: Real-Time Signal Alert Cards & Interactive Inline Menu
                                   │
                                   ▼
                       WALLET TRACKER (holdings lifecycle)
                                   │
                                   ▼
                POSITION MANAGER (TP 2x/3x · SL -20% · trailing)
```

---

## ✨ Feature Grid

| # | Feature | Description |
| :-: | :--- | :--- |
| 1 | 🛡️ **3-Layer Swarm Consensus** | Quant & Liquidity, Catalyst & Sentiment, Security Audit — **≥ 80% confidence** required before any call card is posted. |
| 2 | 🌸 **Robinhood Meme Agent** (`#call-meme-robinhood`) | GMGN smart-money/rank/trenches screening + GMGN & GoPlus security audits; hard gate **real 24h volume ≥ $25k**, **liquidity ≥ $5k**, **total fees ≥ $250**, fail-closed. |
| 3 | 🌊 **Robinhood LP Velocity Engine** (`#call-lp-robinhood`) | Concentrated-liquidity (Uniswap V3) high-yield pools via **Krystal Cloud** (`ethereum@4663`); **TVL ≥ $10k**, **24h volume ≥ $100k**, **24h Fee/TVL ≥ 2%**, **market cap ≥ $100k**, volume velocity, GMGN security re-check. |
| 4 | 🔮 **NFT Sniper** (`#call-nft-robinhood`) | OpenSea REST v2 floor & rarity sniping; hard filters **floor surge ≥ +10%/1h**, **volume ≥ 1.5x**, **sales ≥ 3/h**; whale sweep & verified badge as card info. |
| 5 | 🐋 **ETH Whale Tracker** (`#call-whale-eth`) | Hyperliquid L1 institutional positioning & smart money tracker; monitors open perps positions (**≥ $500k**), direction flips, and large spot order flow (**≥ $50k**). |
| 6 | 💬 **Natural-Language Command Room** | Chat with OpenCat in `#opencat-control-room` — swap/send intents, audits, alerts, and strategy questions via the agent tool loop. |
| 7 | ⚙️ **22 Slash Commands** | Full command surface: wallets, screening control, audits, price/alert tools, journal, update, emergency cancel, and more. |
| 8 | 📈 **Position Manager** | Auto-sell targets: TP **+100% (2x)** / **+200% (3x)**, **SL -20%**, dynamic trailing stops, LP out-of-range warnings, NFT floor-drop alerts. |
| 9 | 📊 **Trade Journal & Analytics** | Open/close audit trail with win-rate, PnL, and CSV export for Excel/Notion. |
| 10 | 🔒 **Security-First Design** | `DRY_RUN=true` default, 9-Lives circuit breaker, sandboxed strategy modules (sanitized `process.env`), prompt-injection hardening, backup API key rotation. |
| 11 | ⚡ **Cat Den Ops** | PM2 24/7 deploy, `opencat update` self-updater with Telegram + Discord webhook notifications, `opencat doctor`, Linux/Windows setup scripts. |

---

## 🧠 Screening Strategies (Fully Customizable)

Screening strictness is fully user-configurable at onboarding (wizard **STEP 5.5**) — you pick how aggressive OpenCat should be when hunting signals.

- **Loosened Default (2x):** ~2x more signals than Standard — more frequent call cards, still gated by the **>= 80% quality floor**. Recommended for most users.
- **Standard (strict):** Conservative hard gates (e.g. meme 24h volume ≥ $50k, LP TVL ≥ $20k, Fee/TVL > 4%, Whale perps ≥ $1M) — fewer, higher-conviction calls.
- **Custom Prompt:** Write screening rules in plain English (e.g. *"only CTO tokens with 2+ smart wallets, min $10k liq"*). OpenCat compiles your prompt into a **validated strategy `.mjs`** automatically on first boot after deploy, with a safe default fallback if compilation fails. Re-runnable anytime via chat: *"re-apply my strategy prompt"*.
- **Advanced numeric editor:** Fine-tune every hard gate per agent directly (via wizard / control room).

**Loosened defaults per agent:**

| Agent | Hard gates (loosened default) |
| :--- | :--- |
| 🌸 **meme-robinhood** | 24h volume ≥ $25k · liquidity ≥ $5k · total fees ≥ $250 · security audit pass |
| 🌊 **lp-robinhood** | TVL ≥ $10k · 24h volume ≥ $100k · 24h Fee/TVL ≥ 2% · market cap ≥ $100k · security audit pass |
| 🔮 **nft** | Floor surge ≥ +10%/1h · volume spike ≥ 1.5x · sales velocity ≥ 3/h · security audit pass |
| 🐋 **whale-eth** | Min perps position ≥ $500k · min spot fill ≥ $50k · min whale count 1 |

> **Quality floor is never lowered:** the swarm **>= 80% confidence** gate and all security gates remain mandatory and **fail-closed** — missing data or failed audits always reject, regardless of preset.

---

## 🚀 Quickstart

### Fresh install

```bash
# Linux / macOS / VPS
git clone https://github.com/dizcorvus/opencat-ai-robinhood-chain.git
cd "Opencat AI (Robinhood Chain)"
bash setup.sh              # one-click: install deps, build, wizard, launch guide

# Windows (PowerShell)
git clone https://github.com/dizcorvus/opencat-ai-robinhood-chain.git
cd "Opencat AI (Robinhood Chain)"
.\setup.bat
```

Or manually:

```bash
npm install
npm run build              # or: opencat build
opencat onboard            # interactive .env setup (tokens, RPC, X API v2, API keys)
opencat run                # development / live bot
```

> **Invite the bot:** use the Discord OAuth2 URL with `applications.commands` + bot scopes. On first launch OpenCat **auto-creates** the `🐾 OPENCAT COMMAND CENTER` category, 6 channels, and registers all 22 slash commands — zero manual channel setup.

### Update

```bash
opencat update             # git stash → pull → npm install → build → detached PM2 restart
```

Deployment results are reported to **Telegram** (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) and an optional **Discord webhook** (`DISCORD_DEPLOY_WEBHOOK_URL`).

---

## ⌨️ CLI Commands (`opencat`)

| Command | Aliases | Description |
| :--- | :--- | :--- |
| `opencat run` | `dev`, `start` | Launch the OpenCat engine (development / live bot, hot reload) |
| `opencat onboard` | `wizard`, `setup`, `config` | Interactive `.env` onboarding wizard (modes, TP/SL, X API v2, API keys) |
| `opencat terminal` | `tui` | OpenCat interactive Terminal TUI |
| `opencat deploy` | `pm2` | Deploy 24/7 background daemon via PM2 |
| `opencat test` | — | Run the Vitest unit test suite |
| `opencat build` | — | Compile TypeScript into `/dist` |
| `opencat update` | — | Pull latest code, reinstall, rebuild, restart (notifies Telegram/Discord webhook) |
| `opencat uninstall` | `purge`, `clean-all` | Clean uninstaller: stop PM2 daemons, wipe database state, purge `.env` & dist |
| `opencat doctor` | `check` | Full diagnostics: API keys, agent states, risk state, connectivity |
| `opencat help` | `-h`, `--help` | Show the CLI cheatsheet |

> 💡 **CLI Invocation & Non-Root Fallbacks:**
> If you prefer not to use `npm link` (or if your VPS environment restricts global npm links without sudo), all commands can be invoked identically via `npm run` or directly via Node:
> * **Via `npm run`:** `npm run dev`, `npm run terminal`, `npm run wizard`, `npm run deploy`, `npm run update`, `npm run test`
> * **Via Direct Node:** `node bin/opencat.js <command>` (e.g. `node bin/opencat.js terminal`)


## 🤖 Discord Slash Commands (22)

> 🐾 **Channel Restriction:** All slash commands and interactive UI controls are restricted to channels inside the **`🐾 OPENCAT COMMAND CENTER`** category (e.g. `#opencat-control-room`) to prevent cluttering external server channels.

| Command | Description |
| :--- | :--- |
| `/wallet` | Manage burner wallets: `setup`, `list`, `replace`, `remove`, `balance`, `withdraw` |
| `/analyze` | On-demand 3-layer audit for a token Contract Address |
| `/screening` | Control 24/7 agents: `start`, `stop`, `status`, `trigger` |
| `/cancel` | Emergency halt: `all` |
| `/config` | Runtime config: `risk`, `status` |
| `/health` | Per-agent heartbeat check (HEALTHY / DEGRADED / UNRESPONSIVE) |
| `/strategy` | Manage strategy modules: `list`, `view`, `activate`, `rollback` |
| `/channel` | Create / rearrange channels: `create`, `rearrange` |
| `/price` | Quick price, 24h change & market cap lookup |
| `/chart` | Quick chart & DexScreener link |
| `/holders` | Top Holders audit & insider ownership breakdown |
| `/wallets` | Top Wallets & Smart Money activity scan |
| `/pump` | Robinhood Chain token momentum, holder & liquidity tracker |
| `/convert` | Token value & USD converter |
| `/alert` | Price alerts: `set`, `list`, `cancel` |
| `/menu` | Interactive OpenCat Control Center dashboard |
| `/dashboard` | Interactive OpenCat Control Center dashboard |
| `/journal` | Trade journal: `summary`, `history`, `export` (CSV) |
| `/update` | Pull latest code, rebuild, soft-restart |
| `/swap` | Swap tokens via Uniswap V3 Router on Robinhood Chain L2 (#4663) |
| `/send` | Direct native token send/transfer to another EVM address |

---

## 📢 Auto-Created Channels (6)

On launch, OpenCat creates the **`🐾 OPENCAT COMMAND CENTER`** category and 6 text channels:

| Channel | Purpose |
| :--- | :--- |
| `#opencat-control-room` | Core command hub — chat, wallet management, risk configuration |
| `#audit-on-demand` | Paste any Robinhood Chain / EVM Contract Address for an instant audit |
| `#call-meme-robinhood` | High-confidence Robinhood Chain meme signal calls (GMGN + security audit) |
| `#call-lp-robinhood` | High-yield Robinhood Chain concentrated-liquidity calls (Krystal / Uniswap V3) |
| `#call-nft-robinhood` | NFT floor price & rarity sniping alerts (OpenSea) |
| `#call-alpha-robinhood` | 1-Hour Robinhood Chain Alpha Scraper & X (Twitter) social sentiment calls |

**Call cards** are Discord embeds with market metrics, security/holder audit fields, an AI thesis, and action **links** — `🌐 Trade on Uniswap`, `📊 Chart on DexScreener`, `🔍 View on Krystal`, `📊 View Collection on OpenSea` — plus `⏸️ Pause` buttons. Cards never contain BUY buttons: execution is manual via those links (or `DRY_RUN` simulations), unless you explicitly enable auto-execution.

---

## 🔐 Environment Variables

Primary keys are set in `.env` (see `.env.example`). Every provider key accepts a `_BACKUP_KEYS` comma-separated companion — sub-agents auto-rotate to backups on 401/403/429.

| Variable | Description |
| :--- | :--- |
| `DRY_RUN` | `true` = safe simulation (default); `false` = live transactions possible |
| `AUTO_EXECUTE_ENABLED` | Default `false` — bot is a screener/caller; execution stays manual |
| `DISCORD_BOT_TOKEN` / `DISCORD_CLIENT_ID` | Discord bot credentials |
| `DISCORD_CHANNEL_CONTROL_ROOM` | ID of `#opencat-control-room` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Telegram notification bridge + bot polling |
| `DISCORD_DEPLOY_WEBHOOK_URL` | Optional Discord webhook for deploy notifications |
| `EVM_ROBINHOOD_RPC_URL` | Canonical Robinhood Chain RPC (`https://rpc.mainnet.chain.robinhood.com`) |
| `EVM_RPC_URL` | Generic EVM fallback RPC |
| `RPC_FAILOVER_URLS` | JSON pool of backup RPCs (auto-failover) |
| `AI_PROVIDER` / `AI_BASE_URL` / `AI_API_KEYS` / `AI_API_KEY` / `AI_MODEL_NAME` | Multi-provider LLM with per-key failover (`anthropic`, `openai`, `openrouter`, etc.) |
| `GMGN_API_KEY` / `GMGN_API_KEY_ROBINHOOD` | GMGN OpenAPI (smart-money, rank, trenches, token security) |
| `OPENSEA_API_KEY` | NFT floor/rarity + swap aggregator (nft agent) |
| `X_API_BEARER_TOKEN` | Official X (Twitter) API v2 Bearer Token — required for `#call-alpha-robinhood` sub-agent social sentiment search |
| `GOPLUS_API_KEY` | EVM token security audit (GoPlus) |
| `UNISWAP_API_KEY` | Uniswap Trade API — Robinhood/EVM swap entry |
| `KRYSTAL_CLOUD_API_KEY` | Krystal Cloud DeFi data — Robinhood LP pools (`ethereum@4663`), required for the LP agent |
| `GMGN_BACKUP_KEYS`, `KRYSTAL_CLOUD_BACKUP_KEYS`, `OPENSEA_BACKUP_KEYS`, `GOPLUS_BACKUP_KEYS`, `UNISWAP_BACKUP_KEYS`, `X_API_BACKUP_KEYS` | Backup keys, auto-rotated on rate-limit/401/403 |
| `EVM_PRIVATE_KEY` | Trading wallet private key (keep `DRY_RUN=true` while testing) |
| `EVM_PRIORITY_FEE_GWEI` / `SIMULATION_BALANCE_ETH` | Execution tuning / simulated balance |
| `API_PORT` | OpenCat Web Dashboard REST API port (default `3000`) |
| `OPENCAT_API_KEY` | Optional security key for REST API guard (`X-OpenCat-Api-Key` or `Bearer <key>`) |

---

## 📡 Web Dashboard REST API

Opencat AI ships with a native, zero-dependency REST API server (`src/api/server.ts`) designed for web dashboard and frontend integration (e.g. Next.js, React, Vue, or Mobile Apps). Includes **CORS headers (`Access-Control-Allow-Origin: *`)** and optional API Key protection (`OPENCAT_API_KEY`).

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| **`/api/status`** (or `/health`) | `GET` | Execution mode, active sub-agents, market regime, kill-switch status, and connected API keys |
| **`/api/calls`** | `GET` | Historical signal calls evaluated by Swarm Consensus across all 4 sub-agents (`?domain=alpha-robinhood&limit=50`) |
| **`/api/positions`** | `GET` | Active token positions, LP positions, and NFT positions with PnL and TP/SL milestones |
| **`/api/executions`** | `GET` | Trade journal ledger entries, win-rate, total PnL, and transaction stats |
| **`/api/alerts`** | `GET` | Active custom price alerts set by users |
| **`/api/agents/toggle`** | `POST` | Enable or pause a specific sub-agent domain (`{ "domain": "alpha-robinhood", "active": true }`) |
| **`/api/command`** | `POST` | Execute ToolRegistry actions directly from web UI inputs (`{ "command": "pause_sub_agent", "args": { "agentId": "nft" } }`) |

---

## ❓ FAQ

**1. What is Robinhood Chain?**
Robinhood Chain is an EVM Layer-2 network — **chain ID 4663, native token ETH** — with the canonical RPC `https://rpc.mainnet.chain.robinhood.com` (Blockscout explorer: `https://robinhoodchain.blockscout.com`). It is the sole target chain of Opencat AI.

**2. What is Opencat AI?**
Opencat AI is an autonomous, multi-agent crypto intelligence and trading ecosystem specialized for Robinhood Chain (EVM L2), featuring 3-Layer Swarm Consensus, a resilient risk engine (9-Lives Shield), and unified multi-platform interfaces (Discord, Terminal TUI, and Telegram).

**3. Is `DRY_RUN` safe?**
Yes. `DRY_RUN=true` (the default) guarantees **no live blockchain transactions** — swaps, sends and withdrawals are simulated, and call cards only provide execution *links*. Only when you explicitly set `DRY_RUN=false` (and optionally `AUTO_EXECUTE_ENABLED`) can real transactions be signed. Always test with `DRY_RUN=true` first.

**4. How do backup keys work?**
Each provider key has a `_BACKUP_KEYS` companion (e.g. `GMGN_BACKUP_KEYS`). The API key pool loads the primary plus comma-separated backups and **auto-rotates to the next key on 401/403/429** responses, keeping screening alive through rate limits. AI keys support the same pattern via `AI_API_KEYS`.

**5. Where are keys stored?**
Credentials live in the local `.env` file (loaded via `dotenv`); runtime-set keys are persisted back to `.env` by the API key guard. Wallet private keys are held **in memory** by the WalletService and mirrored in the gitignored `database/opencat_state.json`. Nothing is uploaded or stored remotely.

---

## ⚠️ Risk Disclaimer

> [!WARNING]
> **NOT FINANCIAL ADVICE (NFA).** Opencat AI is an experimental research and education tool. Cryptocurrency, meme tokens, concentrated-liquidity positions, and NFTs are extremely volatile and you can lose your entire capital. Opencat AI runs in **`DRY_RUN` mode by default** and never sends live transactions unless you explicitly disable it — but even then, past signal accuracy is no guarantee of future performance. Always trade with funds you can afford to lose, use capped burner wallets, and do your own research (DYOR) before any decision.

---

## 📜 License

MIT — see [LICENSE](LICENSE).

---

*Built with precision, chill vibes, and razor-sharp on-chain instincts — powered by Opencat AI.* 🐾⚡🌸
