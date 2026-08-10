# AGENTS.md - Athena AI (Robinhood Chain Edition) Guidelines & Agent Instructions

Welcome to **Athena AI (Robinhood Chain Edition)**! This document outlines project conventions, tech stack, directory layout, and architectural rules for AI agents and developers working on this repository.

---

## 1. Project Overview

**Athena AI (Robinhood Chain Edition)** is an autonomous, multi-agent crypto intelligence and trading ecosystem specialized for **Robinhood Chain (EVM)** and operated through a **Discord Command Center**, **Terminal TUI**, and **Telegram Notification Bridge**.

- **Core Hub Agent (`#athena-control-room`):** Handles user chat, configuration, portfolio tracking, global risk management, custom price alerts (`/alert`), trade execution, and natural language trade audits.
- **Swarm Consensus Engine:** Evaluates candidate signals through a 3-Layer Filter (Quant & Liquidity, Catalyst & Sentiment, Security Audit) requiring a **>= 80% Confidence Score** before posting to Discord.
- **Specialist Screening Sub-Agents:** Run 24/7 background screening (on-demand) and post call signals to dedicated Discord channels (exactly 3 domains):
  - `#call-meme-robinhood` (Robinhood Chain EVM DEX tokens / GMGN OpenAPI + GoPlus security)
  - `#call-lp-robinhood` (Robinhood Chain Concentrated Liquidity Velocity Signals / Krystal Cloud)
  - `#call-nft-sniping` (EVM NFT floor & rarity alerts / OpenSea REST v2)
- **Position Manager:** Handles post-execution auto-sell targets (Take Profit, Stop Loss, Trailing Stops, and Out-of-Range LP Warnings).

---

## 2. Technology Stack & Environment

- **Runtime:** Node.js (>=22.12) / TypeScript
- **Config:** `dotenv` (.env files, never committed)
- **Discord Bot SDK:** `discord.js` (v14+)
- **Target Chain:** Robinhood Chain (EVM L2) — chain ID **4663**, native token **ETH**, canonical RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com`
- **Blockchain & Crypto Web3 SDKs:**
  - `viem` (EVM reads/signs)
  - GMGN OpenAPI (smart-money / rank / trenches / token security audit)
  - Krystal Cloud DeFi Data API (Robinhood LP pools, `ethereum@4663`)
  - OpenSea REST API v2 (EVM NFTs + swap aggregator)
  - Relay.link (swap / send / bridge quotes & execution)
- **Security Audit APIs:** GoPlus Security API (EVM) + GMGN `/v1/token/security`
- **AI Engine:** OpenRouter / OpenAI / Anthropic Node SDK
- **Database & State:** Local JSON file persistence (`database/athena_state.json`)
- **Protocol:** Model Context Protocol (MCP)

---

## 3. Directory Layout (verified against `git ls-files` — real paths only)

```
Athena/
├── .agents/
│   ├── AGENTS.md                  # Project rules & coding guidelines
│   └── skills/                    # Athena-specific skills (swarm trading, gmgn)
├── src/
│   ├── index.ts                   # Bot initialization & client launcher
│   ├── config/config.ts           # Env/config validation
│   ├── orchestrator/              # Athena Core Hub & Global Risk Engine
│   │   ├── hub.ts                 # AthenaHub: agent states, risk gate, on-demand passes
│   │   ├── risk-manager.ts        # Drawdown / position-size / correlation guards
│   │   ├── risk-engine-v2.ts      # Kill-switch circuit breaker (singleton)
│   │   ├── swarm-consensus.ts     # 3-Layer Signal Quality Filter Engine
│   │   ├── swarm-learning.ts      # Outcome-driven agent weight recalibration
│   │   ├── strategy-engine.ts     # Sandboxed .mjs strategy loader (sanitized env)
│   │   ├── strategy-types.ts      # Strategy context types (snake_case GMGN contract)
│   │   ├── agent-registry.ts      # Single source of truth for all 3 agent domains
│   │   ├── agent-runner.ts        # LLM tool-call loop for chat/TUI/Telegram
│   │   ├── dispatch.ts            # Per-domain dispatch + LP payload builder
│   │   └── tool-registry.ts       # LLM function-calling tools (chat commands)
│   ├── agents/                    # Specialized screening agents (shared contract)
│   │   ├── shared/
│   │   │   ├── agent-contract.ts  # ScreeningAgent contract + CallCardPayload
│   │   │   └── gmgn-meme-helpers.ts # Shared GMGN prefilter/dedupe/signal helpers
│   │   ├── meme-robinhood/        # Robinhood Chain EVM DEX screening (GMGN + GoPlus)
│   │   └── nft/                   # EVM NFT floor & rarity screening (OpenSea)
│   ├── adapters/                  # Web3 & Exchange execution adapters
│   │   ├── evm-adapter.ts         # EVM swaps/sends
│   │   ├── relay-adapter.ts       # Relay.link quote/swap/send + token maps
│   │   ├── gmgn-adapter.ts        # GMGN OpenAPI (rank/trenches/signals/audit)
│   │   ├── krystal-cloud-adapter.ts # Krystal Cloud DeFi data (Robinhood LP pools)
│   │   └── opensea-adapter.ts     # NFT floor signals + swap aggregator
│   ├── position/                  # Auto TP/SL & Trailing Stop Position Manager
│   │   └── position-manager.ts
│   ├── discord/                   # Discord handlers, slash commands & embed views
│   │   ├── commands/index.ts      # Slash command definitions
│   │   ├── handlers/
│   │   │   ├── interaction-handler.ts # Thin dispatcher (entry)
│   │   │   ├── command-handlers.ts    # Slash-command logic + service singletons
│   │   │   ├── interaction-buttons.ts # Buttons/modals/select menus
│   │   │   └── message-handler.ts     # Control-room NLU chat
│   │   ├── embeds/                # Call cards, dashboard, audit embeds
│   │   └── setup/                 # Channel bootstrap
│   ├── services/                  # Shared security, price feeds, alerts & LLM
│   │   ├── state-store.ts         # Persistent JSON state (database/)
│   │   ├── price-feed-service.ts  # CoinGecko singleton
│   │   ├── price-alert-service.ts # Custom price alerts (/alert)
│   │   ├── wallet-service.ts      # Wallet keys + balances (singleton)
│   │   ├── wallet-tracker.ts      # Holdings lifecycle -> PositionManager
│   │   ├── position-scanner.ts    # Open-position monitoring
│   │   ├── trade-journal-service.ts # Open/close audit trail
│   │   ├── goplus-security-service.ts # GoPlus (EVM)
│   │   ├── token-audit-service.ts # On-demand audit pipeline
│   │   ├── ai-service.ts          # Multi-provider LLM failover
│   │   ├── api-key-pool.ts         # Stackable API keys + backup rotation
│   │   ├── api-key-guard.ts       # Key leak prevention guard
│   │   ├── session-memory.ts      # Audit memory for chat context
│   │   ├── cron-scheduler.ts      # Process-wide cron singleton
│   │   ├── market-regime.ts       # Market regime classifier
│   │   ├── health-watcher.ts      # Process health + restart watcher
│   │   ├── skill-loader.ts        # .agents/skills loader
│   │   ├── rpc-failover.ts        # RPC failover pool
│   │   └── technical-indicators.ts # Custom indicator library
│   ├── cli/                       # Terminal TUI + diagnostic doctor
│   ├── telegram/                  # Telegram notification bridge + bot polling
│   └── api/                       # Minimal REST server (health + analytics)
├── strategies/                    # User/LLM-authored strategy .mjs modules
├── indicators/                    # Custom technical indicator .mjs modules
├── bin/athena.js                  # `athena` CLI (run/wizard/terminal/deploy/test/build/update/doctor)
├── scripts/                       # wizard.js (env setup), update-core.mjs (git pull+rebuild), notify-update.mjs
├── tests/                         # Full Vitest suite
├── deploy.sh / setup.sh / setup.bat # PM2 deploy + platform bootstrap
├── .env.example                   # Environment variable template
├── package.json
└── tsconfig.json
```

---

## 4. Coding Conventions & Best Practices

1. **Modular Multi-Agent Isolation:**
   - Keep screening logic decoupled from execution logic. Screening agents MUST pass candidate signals to the `Swarm Consensus Engine` before emitting to Discord call channels or `Athena Core Hub`.
2. **Safety & Dry-Run First:**
   - Every trading adapter MUST support a `DRY_RUN` environment check. Never send live transactions unless `DRY_RUN=false` is explicitly set and confirmed.
3. **Swarm Consensus Validation:**
   - Require >= 80% confidence score across Quant, Catalyst, and Security audits before delivering signal cards.
4. **Strict TypeScript Typing:**
   - Avoid using `any`. Define clear interfaces for Token Signals, Audit Results, Swarm Scores, Discord Command Contexts, and Position States.
5. **Discord UX Standards:**
   - Use Discord Rich Embeds with clear color coding (🟢 Green for High Confidence Call, 🔴 Red for Warning/Risk, 🔵 Blue for Status Info).
   - Provide interactive Action Buttons (`BUY 0.5 ETH`, `PAUSE SCREENING`, `VIEW ON DEXSCREENER`).

---

## 5. Development & Testing Commands

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Build production bundle
npm run build

# Run unit tests
npm test
```

---

## 6. Onboarding & Update Flow

- **Onboarding (`athena wizard` / `npm run wizard`):** `scripts/wizard.js` walks through `.env` creation, AI provider selection, Discord/Telegram credentials, and API keys — never skip it on a fresh clone.
- **Update (`athena update` / `npm run update`):** `scripts/update-core.mjs` performs git pull + install + rebuild + service restart, and notifies via Telegram/Discord webhook (`DISCORD_DEPLOY_WEBHOOK_URL`).
- **Deploy (`athena deploy`):** PM2 daemon via `deploy.sh` / `npm run deploy` (Mount Olympus — 24/7 background process).

---

## 7. Safety & Security Rules

- **NEVER** commit private keys, mnemonic phrases, API keys, or Discord bot tokens into Git.
- Use `.env` files and keep `.env.example` updated with mock placeholders.
- **Backup-key convention:** every paid API key supports a comma-separated `*_BACKUP_KEYS` variable (e.g. `GMGN_BACKUP_KEYS`, `KRYSTAL_CLOUD_BACKUP_KEYS`, `OPENSEA_BACKUP_KEYS`, `GOPLUS_BACKUP_KEYS`, `UNISWAP_BACKUP_KEYS`) — sub-agents auto-rotate to backups on 401/403/429 and mark failed keys.
- Operating live trading agents should always use dedicated burner wallets with capped funds.
- **Token & API Cost Optimization**: Reserve LLM API calls strictly for high-value reasoning tasks (e.g. interpreting social sentiment in tweets, drafting final AI Thesis summaries, and handling user chat queries in the command room). Use local deterministic code and mathematical rules for filtering, security checks, and screening to minimize token consumption and keep running costs near zero.
