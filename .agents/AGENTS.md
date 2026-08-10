# AGENTS.md - Athena AI (Robinhood Chain Edition) Guidelines & Agent Instructions

Welcome to **Athena AI (Robinhood Chain Edition)**! This document outlines project conventions, tech stack, directory layout, and architectural rules for AI agents and developers working on this repository.

---

## 1. Project Overview

**Athena AI (Robinhood Chain Edition)** is an autonomous, multi-agent crypto intelligence and trading ecosystem specialized for **Robinhood Chain (EVM)** and operated through a **Discord Command Center**, **Terminal TUI**, and **Telegram Notification Bridge**.

- **Core Hub Agent (`#athena-control-room`):** Handles user chat, configuration, portfolio tracking, global risk management, custom price alerts (`/alert`), trade execution, and natural language trade audits.
- **Swarm Consensus Engine:** Evaluates candidate signals through a 3-Layer Filter (Quant & Liquidity, Catalyst & Sentiment, Security Audit) requiring a **>= 80% Confidence Score** before posting to Discord.
- **Specialist Screening Sub-Agents:** Run 24/7 background screening (on-demand) and post call signals to dedicated Discord channels (exactly 4 domains):
  - `#call-meme-robinhood` (Robinhood Chain EVM DEX tokens / GMGN OpenAPI + GoPlus security)
  - `#call-lp-robinhood` (Robinhood Chain Concentrated Liquidity Velocity Signals / Krystal Cloud)
  - `#call-nft-sniping` (EVM NFT floor & rarity alerts / OpenSea REST v2)
  - `#call-alpha-robinhood` (1-hour Robinhood Chain Alpha Scraper / optional official X API v2)
- **Position Manager:** Handles post-execution auto-sell targets (Take Profit, Stop Loss, Trailing Stops).

---

## 2. Technology Stack & Environment

- **Runtime:** Node.js (>=22.12) / TypeScript
- **Config:** `dotenv` (.env files, never committed)
- **Discord Bot SDK:** `discord.js` (v14+)
- **Target Chain:** Robinhood Chain (EVM L2) — chain ID **4663**, native token **ETH**, canonical RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com`
- **Primary DEX Venue:** Uniswap V3 Router (Robinhood Chain EVM L2 #4663) — primary venue for meme tokens, swaps, and LP positions. Single-chain focus (cross-chain bridge removed).
- **Execution Modes (`EXECUTION_MODE`):**
  - `AUTO_EXECUTE`: Real on-chain trading via Uniswap V3 / Viem client when Swarm Consensus $\ge 80\%$ and Risk Manager checks pass. Requires `EVM_PRIVATE_KEY`.
  - `DRY_RUN`: Realistic market simulation using real-time quotes, fees, and price data from Uniswap V3 API / DexScreener. Requires public `EVM_WALLET_ADDRESS` (Private Key optional). Fills logged to `athena_state.json`.
  - `SIGNAL_ONLY`: Intelligence Hub mode posting screening call cards to Discord and auto-tracking wallet position holdings via `EVM_WALLET_ADDRESS`.
- **Blockchain & Crypto Web3 SDKs:**
  - `viem` (EVM reads/signs)
  - Uniswap V3 Gateway API (`https://trade-api.gateway.uniswap.org/v1`)
  - GMGN OpenAPI (smart-money / rank / trenches / token security audit)
  - Krystal Cloud DeFi Data API (Robinhood LP pools, `ethereum@4663`)
  - OpenSea REST API v2 (EVM NFTs + swap aggregator)
  - Relay.link (token send & secondary swap fallback)
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
│   ├── config/config.ts           # Env/config validation & execution mode helpers
│   ├── orchestrator/              # Athena Core Hub & Global Risk Engine
│   │   ├── hub.ts / risk-manager.ts / risk-engine-v2.ts
│   │   ├── swarm-consensus.ts     # 3-Layer Signal Quality Filter Engine
│   │   ├── swarm-learning.ts / strategy-engine.ts / strategy-types.ts
│   │   ├── strategy-bootstrap.ts  # Preset/custom strategy selection + first-boot compile
│   │   ├── agent-registry.ts / agent-runner.ts / dispatch.ts / tool-registry.ts
│   ├── agents/                    # Specialized screening agents (shared contract)
│   │   ├── shared/                # agent-contract.ts + gmgn-meme-helpers.ts
│   │   ├── meme-robinhood/        # Robinhood Chain EVM DEX screening (GMGN + GoPlus)
│   │   └── nft/                   # EVM NFT floor & rarity screening (OpenSea)
│   ├── adapters/                  # Web3 & Exchange execution adapters
│   │   ├── evm-adapter.ts / relay-adapter.ts / gmgn-adapter.ts
│   │   ├── krystal-cloud-adapter.ts / opensea-adapter.ts
│   ├── position/                  # Auto TP/SL & Trailing Stop Position Manager
│   │   └── position-manager.ts
│   ├── discord/                   # Discord handlers, slash commands & embed views
│   │   ├── commands/ handlers/ embeds/ setup/
│   ├── services/                  # Shared security, price feeds, alerts & LLM
│   │   ├── state-store / price-feed-service / price-alert-service
│   │   ├── wallet-service / wallet-tracker / position-scanner
│   │   ├── trade-journal-service / goplus-security-service / token-audit-service
│   │   ├── ai-service / api-key-pool / api-key-guard / session-memory
│   │   ├── cron-scheduler / market-regime / health-watcher
│   │   ├── skill-loader / rpc-failover / technical-indicators
│   ├── cli/                       # Terminal TUI + diagnostic doctor
│   ├── telegram/                  # Telegram notification bridge + bot polling
│   └── api/                       # Minimal REST server (health + analytics)
├── strategies/                    # User/LLM-authored strategy .mjs modules
├── indicators/                    # Custom technical indicator .mjs modules
├── bin/athena.js                  # `athena` CLI (run/wizard/terminal/deploy/test/build/update/uninstall/doctor)
├── scripts/                       # wizard.js (env setup), update-core.mjs, uninstall.mjs
├── tests/                         # Full Vitest suite
├── .env.example                   # Environment variable template
├── package.json
└── tsconfig.json
```

---

## 4. Coding Conventions & Best Practices

1. **Modular Multi-Agent Isolation:**
   - Keep screening logic decoupled from execution logic. Screening agents MUST pass candidate signals to the `Swarm Consensus Engine` before emitting to Discord call channels or `Athena Core Hub`.
2. **Safety & Execution Modes First:**
   - Every trading adapter MUST check `getExecutionMode()`. Live trades occur only in `AUTO_EXECUTE` mode with verified private keys. `DRY_RUN` uses real Uniswap API market pricing without broadcasting. `SIGNAL_ONLY` tracks holdings without executing.
3. **Swarm Consensus Validation:**
   - Require >= 80% confidence score across Quant, Catalyst, and Security audits before delivering signal cards.
4. **Strict TypeScript Typing:**
   - Avoid using `any`. Define clear interfaces for Token Signals, Audit Results, Swarm Scores, Discord Command Contexts, and Position States.
5. **Discord UX Standards:**
   - Use Discord Rich Embeds with clear color coding (🟢 Green for High Confidence Call, 🔴 Red for Warning/Risk, 🔵 Blue for Status Info).
   - Provide interactive Action Buttons (`BUY 0.5 ETH`, `PAUSE SCREENING`, `VIEW ON DEXSCREENER`).
6. **Customizable Screening Strategies:**
   - Screening strategies are fully customizable (wizard STEP 5.5: loosened default / standard / custom prompt / numeric editor); custom prompts compile to validated strategy `.mjs` at first boot with default fallback; swarm >= 80% floor never lowered.

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

# Clean uninstall
athena uninstall   # or: npm run uninstall
```

---

## 6. Onboarding & Update Flow

- **Onboarding (`athena wizard` / `npm run wizard`):** `scripts/wizard.js` walks through `.env` creation, AI provider selection, Execution Mode selection (`DRY_RUN`, `SIGNAL_ONLY`, `AUTO_EXECUTE`), Auto TP/SL targets, Discord/Telegram credentials, and API keys (`UNISWAP_API_KEY`, etc.) — never skip it on a fresh clone.
- **Update (`athena update` / `npm run update`):** `scripts/update-core.mjs` performs git pull + install + rebuild + service restart, and notifies via Telegram/Discord webhook (`DISCORD_DEPLOY_WEBHOOK_URL`).
- **Deploy (`athena deploy`):** PM2 daemon via `deploy.sh` / `npm run deploy` (Mount Olympus — 24/7 background process).
- **Uninstall (`athena uninstall` / `npm run uninstall`):** `scripts/uninstall.mjs` safely stops PM2 background processes, resets state, and purges `.env` credentials & build artifacts.

---

## 7. Safety & Security Rules

- **NEVER** commit private keys, mnemonic phrases, API keys, or Discord bot tokens into Git.
- Use `.env` files and keep `.env.example` updated with mock placeholders.
- **Backup-key convention:** every paid API key supports a comma-separated `*_BACKUP_KEYS` variable (e.g. `GMGN_BACKUP_KEYS`, `KRYSTAL_CLOUD_BACKUP_KEYS`, `OPENSEA_BACKUP_KEYS`, `GOPLUS_BACKUP_KEYS`, `UNISWAP_BACKUP_KEYS`) — sub-agents auto-rotate to backups on 401/403/429 and mark failed keys.
- Operating live trading agents should always use dedicated burner wallets with capped funds.
- **Token & API Cost Optimization**: Reserve LLM API calls strictly for high-value reasoning tasks (e.g. interpreting social sentiment in tweets, drafting final AI Thesis summaries, and handling user chat queries in the command room). Use local deterministic code and mathematical rules for filtering, security checks, and screening to minimize token consumption and keep running costs near zero.
