# 🏛️ ATHENA AI — Robinhood Chain Edition

```
                          /\
                         /  \
                        / /\ \
                       / /  \ \
                      / /____\ \
                     /__________\
                    |   |  ||  |   |
                    |   |  ||  |   |
        ________________________________
       |                                |
       |   🦉 PARTHENON OF ATHENA 🦉   |
       |_____________________________ ___|
                    |  |    |  |
                    |  |    |  |
        Autonomous Multi-Agent Crypto Intelligence
              & Trading Ecosystem
       built exclusively for Robinhood Chain (EVM)
```

**Autonomous Multi-Agent Crypto Intelligence & Trading Ecosystem** — built exclusively for **Robinhood Chain (EVM L2, chain ID 4663, native ETH)**, operated through a **Discord Command Center**, an **Interactive Terminal TUI**, and a **Telegram Notification Bridge**.

Athena separates **24/7 market screening + 3-Layer Swarm Consensus signal generation** from **execution** — signal cards are delivered to Discord with audit data and one-click links, while execution stays under your control via `DRY_RUN` and manual confirmation.

[![Chain](https://img.shields.io/badge/Robinhood%20Chain-4663%20%7C%20ETH-7b5cff.svg)](https://robinhoodchain.blockscout.com)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D22.12-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-Vitest%20Suite-brightgreen.svg)](https://vitest.dev/)
[![Discord](https://img.shields.io/badge/Discord-v14.18-5865F2.svg)](https://discord.js.org/)

---

## 🦉🏛️⚡ The Three Pillars

| Pillar | Role | What it does |
| :--- | :--- | :--- |
| 🦉 **Athena** — The Intelligence | Screening & Reasoning | **3-Layer Swarm Consensus Engine** (Quant & Liquidity, Catalyst & Sentiment, Security Audit) demanding a **≥ 80% Confidence Score** before a signal is posted. Four specialist screening agents run 24/7: **meme-robinhood** (GMGN smart-money data + GMGN/GoPlus security audits, real **24h volume ≥ $50k** hard gate), **lp-robinhood** (Concentrated Liquidity velocity via **Krystal Cloud**, **24h Fee/TVL > 4%** and **TVL ≥ $20k**), **nft** (OpenSea floor & rarity sniping, floor surge ≥ +20%/1h, volume spike ≥ 2.0x), and **alpha-robinhood** (1-hour Robinhood Chain alpha scraper + optional official **X (Twitter) API v2** social sentiment search). A **Position Manager** tracks open positions with Take Profit milestones (**+100% / +200%**), **Stop Loss (-20%)**, **dynamic trailing stops**, LP out-of-range warnings, and NFT floor-drop alerts. |
| 🏛️ **Parthenon** — The Command Center | Control & Chat | **Discord**: `#athena-control-room` natural-language chat, portfolio & risk views, **22 slash commands**, interactive dashboard, and 4 dedicated call channels (`#call-meme-robinhood`, `#call-lp-robinhood`, `#call-nft-sniping`, `#call-alpha-robinhood`). **Terminal TUI** (`athena terminal`): full control without Discord. Natural-language trade audits and custom price alerts (`/alert`) everywhere. |
| ⚡ **Olympian** — The Operations | Deploy & Maintain | **PM2 24/7 daemon** (`athena deploy`), self-update engine (`athena update` → git pull → install → build → detached PM2 restart) with **Telegram + Discord webhook deployment notifications**, `athena doctor` full diagnostics, and interactive **`athena onboard`** wizard. |

---

## 🗺️ System Architecture

```
                        USER INTERFACE PLATFORMS
           (Discord Command Center · Terminal TUI · Telegram Bridge)
                                   │
                                   ▼
                ┌───────────────────────────────────┐
                │        PART HENON HUB             │
                │   #athena-control-room · chat      │
                │   risk gate · global risk engine   │
                │   wallet service · trade journal   │
                └──────────────────┬────────────────┘
                                   │ candidate signals
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│  MEME AGENT  │         │   LP VELOCITY    │         │  NFT AGENT   │
│ meme-robinhood│        │  lp-robinhood     │        │    nft       │
│ GMGN + GoPlus│         │  Krystal Cloud   │         │   OpenSea    │
│ vol 24h ≥ $50k│         │ Fee/TVL > 4%     │         │ floor +20%/1h│
│              │         │ TVL ≥ $20k       │         │ vol ≥ 2.0x   │
│              │         │                  │         │ sales ≥ 5/h  │
└──────┬───────┘         └────────┬─────────┘         └──────┬───────┘
       └──────────────────────────┼──────────────────────────┘
                                  ▼
                ┌────────────────────────────────────┐
                │   SWARM CONSENSUS ENGINE (≥ 80%)   │
                │  Quant · Catalyst · Security Audit │
                └────────────────┬───────────────────┘
                                 │ only ≥ 80% confidence
                                 ▼
     Discord Call Channels: #call-meme-robinhood · #call-lp-robinhood · #call-nft-sniping
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
| 2 | 🔷 **Robinhood Meme Agent** (`#call-meme-robinhood`) | GMGN smart-money/rank/trenches screening + GMGN & GoPlus security audits; hard gate **real 24h volume ≥ $50k**, fail-closed. |
| 3 | 💧 **Robinhood LP Velocity Engine** (`#call-lp-robinhood`) | Concentrated-liquidity (Uniswap V3) high-yield pools via **Krystal Cloud** (`ethereum@4663`); **24h Fee/TVL > 4%**, **TVL ≥ $20k**, volume velocity, GMGN security re-check. |
| 4 | 🖼️ **NFT Sniper** (`#call-nft-sniping`) | OpenSea REST v2 floor & rarity sniping; hard filters floor surge **≥ +20%/1h**, volume **≥ 2.0x**, sales **≥ 5/h**; whale sweep & verified badge as card info. |
| 5 | 💬 **Natural-Language Command Room** | Chat with Athena in `#athena-control-room` — swap/send/bridge intents, audits, alerts, and strategy questions via the agent tool loop. |
| 6 | ⚙️ **22 Slash Commands** | Full command surface: wallets, screening control, audits, price/alert tools, journal, update, emergency cancel, and more (see table below). |
| 7 | 📈 **Position Manager** | Auto-sell targets: TP **+100% (2x)** / **+200% (3x)**, **SL -20%**, dynamic trailing stops, LP out-of-range warnings, NFT floor-drop alerts. |
| 8 | 📊 **Trade Journal & Analytics** | Open/close audit trail with win-rate, PnL, and CSV export for Excel/Notion. |
| 9 | 🔒 **Security-First Design** | `DRY_RUN=true` default, global circuit breaker, sandboxed strategy modules (sanitized `process.env`), prompt-injection hardening, backup API key rotation. |
| 10 | ⚡ **Olympian Ops** | PM2 24/7 deploy, `athena update` self-updater with Telegram + Discord webhook notifications, `athena doctor`, Linux/Windows setup scripts. |

---

## 🧠 Screening Strategies (Fully Customizable)

Screening strictness is fully user-configurable at onboarding (wizard **STEP 5.5**) — you pick how aggressive Athena should be when hunting signals.

- **Loosened Default (2x):** ~2x more signals than Standard — more frequent call cards, still gated by the **>= 80% quality floor**. Recommended for most users.
- **Standard (strict):** Conservative hard gates (e.g. meme 24h volume ≥ $50k, LP TVL ≥ $20k, Fee/TVL > 4%) — fewer, higher-conviction calls.
- **Custom Prompt:** Write screening rules in plain English (e.g. *"only CTO tokens with 2+ smart wallets, min $10k liq"*). Athena compiles your prompt into a **validated strategy `.mjs`** automatically on first boot after deploy, with a safe default fallback if compilation fails. Re-runnable anytime via chat: *"re-apply my strategy prompt"*.
- **Advanced numeric editor:** Fine-tune every hard gate per agent directly (via wizard / control room).

**Loosened defaults per agent:**

| Agent | Hard gates (loosened default) |
| :--- | :--- |
| 🐸 **meme-robinhood** | 24h volume ≥ $25k · liquidity ≥ $5k · total fees ≥ $250 · security audit pass |
| 💧 **lp-robinhood** | TVL ≥ $10k · 24h volume ≥ $100k · 24h Fee/TVL ≥ 2% · market cap ≥ $100k · security audit pass |
| 🖼️ **nft** | Floor surge ≥ +10%/1h · volume spike ≥ 1.5x · sales velocity ≥ 3/h · security audit pass |

> **Quality floor is never lowered:** the swarm **>= 80% confidence** gate and all security gates remain mandatory and **fail-closed** — missing data or failed audits always reject, regardless of preset.

---

## 🚀 Quickstart

### Fresh install

```bash
# Linux / macOS / VPS
git clone https://github.com/dizcorvus/athena-ai-robinhood-chain.git
cd Athena
bash setup.sh              # one-click: install deps, build, wizard, launch guide

# Windows (PowerShell)
git clone https://github.com/dizcorvus/athena-ai-robinhood-chain.git
cd Athena
.\setup.bat
```

Or manually:

```bash
git clone https://github.com/dizcorvus/athena-ai-robinhood-chain.git
cd Athena
npm install
npm run build              # or: athena build
athena onboard            # interactive .env setup (tokens, RPC, X API v2, API keys)
athena run                 # development / live bot
```

> **Invite the bot:** use the Discord OAuth2 URL with `applications.commands` + bot scopes. On first launch Athena **auto-creates** the command-center category, 6 channels, and registers all 22 slash commands — zero manual channel setup.

### Update

```bash
athena update              # git stash → pull → npm install → build → detached PM2 restart
```

Deployment results are reported to **Telegram** (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) and an optional **Discord webhook** (`DISCORD_DEPLOY_WEBHOOK_URL`).

---

## ⌨️ CLI Commands (`athena`)

| Command | Aliases | Description |
| :--- | :--- | :--- |
| `athena run` | `dev`, `start` | Launch the Athena engine (development / live bot, hot reload) |
| `athena onboard` | `wizard`, `setup`, `config` | Interactive `.env` onboarding wizard (modes, TP/SL, X API v2, API keys) |
| `athena terminal` | `tui` | Parthenon interactive Terminal TUI |
| `athena deploy` | `pm2` | Deploy 24/7 background daemon via PM2 |
| `athena test` | — | Run the Vitest unit test suite |
| `athena build` | — | Compile TypeScript into `/dist` |
| `athena update` | — | Pull latest code, reinstall, rebuild, restart (notifies Telegram/Discord webhook) |
| `athena uninstall` | `purge`, `clean-all` | Clean uninstaller: stop PM2 daemons, wipe database state, purge `.env` & dist |
| `athena doctor` | `check` | Full diagnostics: API keys, agent states, risk state, connectivity |
| `athena help` | `-h`, `--help` | Show the CLI cheatsheet |

---

## 🤖 Discord Slash Commands (22)

> 🏛️ **Channel Restriction:** All slash commands and interactive UI controls are restricted to channels inside the **`🏛️ ATHENA COMMAND CENTER`** category (e.g. `#athena-control-room`) to prevent cluttering external server channels.

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
| `/menu` | Interactive Athena Control Center dashboard |
| `/dashboard` | Interactive Athena Control Center dashboard |
| `/journal` | Trade journal: `summary`, `history`, `export` (CSV) |
| `/update` | Pull latest code, rebuild, soft-restart |
| `/swap` | Swap tokens via Uniswap V3 Router on Robinhood Chain L2 (#4663) |
| `/send` | Direct native token send/transfer to another EVM address |

---

## 📢 Auto-Created Channels (6)

On launch, Athena creates the **`🏛️ ATHENA COMMAND CENTER`** category and 6 text channels:

| Channel | Purpose |
| :--- | :--- |
| `#athena-control-room` | Core command hub — chat, wallet management, risk configuration |
| `#audit-on-demand` | Paste any Robinhood Chain / EVM Contract Address for an instant audit |
| `#call-meme-robinhood` | High-confidence Robinhood Chain meme signal calls (GMGN + security audit) |
| `#call-lp-robinhood` | High-yield Robinhood Chain concentrated-liquidity calls (Krystal / Uniswap V3) |
| `#call-nft-sniping` | NFT floor price & rarity sniping alerts (OpenSea) |
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
| `DISCORD_CHANNEL_CONTROL_ROOM` | ID of `#athena-control-room` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Telegram notification bridge + bot polling |
| `DISCORD_DEPLOY_WEBHOOK_URL` | Optional Discord webhook for Olympian deploy notifications |
| `EVM_ROBINHOOD_RPC_URL` | Canonical Robinhood Chain RPC (`https://rpc.mainnet.chain.robinhood.com`) |
| `EVM_RPC_URL` | Generic EVM fallback RPC |
| `RPC_FAILOVER_URLS` | JSON pool of backup RPCs (auto-failover) |
| `AI_PROVIDER` / `AI_BASE_URL` / `AI_API_KEYS` / `AI_API_KEY` / `AI_MODEL_NAME` | Multi-provider LLM with per-key failover (`anthropic`, `openai`, `openrouter`, etc.) |
| `GMGN_API_KEY` / `GMGN_API_KEY_ROBINHOOD` | GMGN OpenAPI (smart-money, rank, trenches, token security) |
| `OPENSEA_API_KEY` | NFT floor/rarity + swap aggregator (nft agent) |
| `GOPLUS_API_KEY` | EVM token security audit (GoPlus) |
| `UNISWAP_API_KEY` | Uniswap Trade API — Robinhood/EVM swap entry |
| `KRYSTAL_CLOUD_API_KEY` | Krystal Cloud DeFi data — Robinhood LP pools (`ethereum@4663`), required for the LP agent |
| `GMGN_BACKUP_KEYS`, `KRYSTAL_CLOUD_BACKUP_KEYS`, `OPENSEA_BACKUP_KEYS`, `GOPLUS_BACKUP_KEYS`, `UNISWAP_BACKUP_KEYS` | Backup keys, auto-rotated on rate-limit/401/403 |
| `EVM_PRIVATE_KEY` | Trading wallet private key (keep `DRY_RUN=true` while testing) |
| `EVM_PRIORITY_FEE_GWEI` / `SIMULATION_BALANCE_ETH` | Execution tuning / simulated balance |
| `API_PORT` | Athena REST API (health + analytics), default 3000 |

---

## 📁 Project Structure

```
Athena/
├── bin/athena.js                  # `athena` CLI (run/wizard/terminal/deploy/test/build/update/doctor)
├── scripts/
│   ├── wizard.js                  # interactive .env setup
│   ├── update-core.mjs            # self-update engine (stash → pull → install → build → restart)
│   └── notify-update.mjs          # Olympian deploy notifications (Telegram + Discord webhook)
├── setup.sh / setup.bat / deploy.sh  # one-click installers / deploy helper
├── src/
│   ├── index.ts                   # bot initialization & client launcher
│   ├── orchestrator/
│   │   ├── hub.ts                 # AthenaHub: agent states, risk gate, LP pass, on-demand screening
│   │   ├── swarm-consensus.ts     # 3-Layer Signal Quality Filter (≥ 80% gate)
│   │   ├── swarm-learning.ts      # outcome-driven agent weight recalibration
│   │   ├── risk-manager.ts        # drawdown / position-size / correlation guards
│   │   ├── risk-engine-v2.ts      # circuit breaker
│   │   ├── strategy-engine.ts     # sandboxed strategy loader (sanitized env)
│   │   ├── agent-registry.ts      # single source of truth for the 3 agent domains
│   │   ├── agent-runner.ts        # LLM tool-call loop (chat/TUI/Telegram)
│   │   ├── dispatch.ts            # per-domain dispatch + payload builder
│   │   └── tool-registry.ts       # LLM function-calling tools
│   ├── agents/
│   │   ├── shared/                # agent contract + GMGN prefilter/dedupe helpers
│   │   ├── meme-robinhood/        # Robinhood Chain EVM DEX screening (GMGN + GoPlus)
│   │   └── nft/                   # EVM NFT floor & rarity screening (OpenSea)
│   ├── adapters/
│   │   ├── evm-adapter.ts         # EVM swaps/sends (viem)
│   │   ├── relay-adapter.ts       # Relay.link quote/swap/send
│   │   ├── gmgn-adapter.ts        # GMGN OpenAPI
│   │   ├── krystal-cloud-adapter.ts # Krystal Cloud DeFi data (Robinhood LP pools)
│   │   └── opensea-adapter.ts     # NFT floor signals + swap aggregator
│   ├── position/position-manager.ts  # auto TP/SL & trailing stop management
│   ├── discord/
│   │   ├── commands/              # 22 slash command definitions
│   │   ├── handlers/              # interactions, buttons, message NLU
│   │   ├── embeds/                # call cards, dashboard embeds
│   │   └── setup/channel-bootstrap.ts  # auto-creates the 5 channels
│   ├── services/                  # state store, price feed, wallet, trade journal,
│   │                              # GoPlus, AI failover, session memory, cron, health, RPC failover
│   ├── telegram/telegram-service.ts  # notification bridge + bot polling
│   ├── cli/                       # terminal TUI + diagnostic doctor
│   └── api/server.ts              # minimal REST server (health + analytics)
├── strategies/                    # strategy .mjs modules (per-domain, swappable)
├── indicators/                    # custom technical indicator .mjs modules
├── tests/                         # Vitest suite (unit + swarm e2e)
├── database/                      # persistent JSON state (gitignored)
├── .env.example                   # environment template
├── package.json
└── tsconfig.json
```

---

## ❓ FAQ

**1. What is Robinhood Chain?**
Robinhood Chain is an EVM Layer-2 network — **chain ID 4663, native token ETH** — with the canonical RPC `https://rpc.mainnet.chain.robinhood.com` (Blockscout explorer: `https://robinhoodchain.blockscout.com`). It is the sole target chain of this edition of Athena.

**2. Is `DRY_RUN` safe?**
Yes. `DRY_RUN=true` (the default) guarantees **no live blockchain transactions** — swaps, sends and withdrawals are simulated, and call cards only provide execution *links*. Only when you explicitly set `DRY_RUN=false` (and optionally `AUTO_EXECUTE_ENABLED`) can real transactions be signed. Always test with `DRY_RUN=true` first.

**3. How do backup keys work?**
Each provider key has a `_BACKUP_KEYS` companion (e.g. `GMGN_BACKUP_KEYS`). The API key pool loads the primary plus comma-separated backups and **auto-rotates to the next key on 401/403/429** responses, keeping screening alive through rate limits. AI keys support the same pattern via `AI_API_KEYS`.

**4. How do I make the repo public?**
Before publishing, verify `.gitignore` excludes `.env` (all variants), `database/*.json` (wallet keys, state, trade history), `dist/`, `node_modules/`, and runtime logs. Run `git status` to confirm no secrets are tracked, then remove any secret history if the repo was ever private with secrets committed. Never commit private keys, mnemonics, or API tokens.

**5. Where are keys stored?**
Credentials live in the local `.env` file (loaded via `dotenv`); runtime-set keys are persisted back to `.env` by the API key guard. Wallet private keys are held **in memory** by the WalletService and mirrored in the gitignored `database/athena_state.json`. Nothing is uploaded or stored remotely.

---

## ⚠️ Risk Disclaimer

> [!WARNING]
> **NOT FINANCIAL ADVICE (NFA).** Athena AI is an experimental research and education tool. Cryptocurrency, meme tokens, concentrated-liquidity positions, and NFTs are extremely volatile and you can lose your entire capital. Athena runs in **`DRY_RUN` mode by default** and never sends live transactions unless you explicitly disable it — but even then, past signal accuracy is no guarantee of future performance. Always trade with funds you can afford to lose, use capped burner wallets, and do your own research (DYOR) before any decision.

---

## 📜 License

MIT — see [LICENSE](LICENSE).

---

*Built with precision, wisdom, and high alpha — under the watch of Athena.* 🦉🏛️⚡
