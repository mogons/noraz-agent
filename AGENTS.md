# AGENTS.md - Athena Project Guidelines & Agent Instructions

Welcome to the **Athena** codebase! This document outlines project conventions, tech stack, directory layout, and architectural rules for AI agents and developers working on this repository.

---

## 1. Project Overview

**Athena** is an autonomous, multi-agent crypto intelligence and trading ecosystem operated through a **Discord Command Center**, **Terminal TUI**, and **Telegram Notification Bridge**.

- **Core Hub Agent (`#athena-control-room`):** Handles user chat, configuration, portfolio tracking, global risk management, custom price alerts (`/alert`), trade execution, and natural language trade audits.
- **Swarm Consensus Engine:** Evaluates candidate signals through a 3-Layer Filter (Quant & Liquidity, Catalyst & Sentiment, Security Audit) requiring a **>= 80% Confidence Score** before posting to Discord.
- **Specialist Screening Sub-Agents:** Run 24/7 background screening (on-demand) and post call signals to dedicated Discord channels:
  - `#call-meme-solana` (Solana DEX tokens / Pump.fun / Raydium / Meteora DLMM)
  - `#call-meme-robinhood` (EVM L1/L2 tokens / Base / Ethereum / Robinhood L2 / Uniswap)
  - `#call-perps-futures` (Leverage trading setups / Hyperliquid / CEXs)
  - `#call-nft-sniping` (EVM NFT floor & rarity alerts / OpenSea)
  - `#call-prediction-markets` (Polymarket prediction market arbitrage & whale bets)
  - `#call-lp-solana` & `#call-lp-robinhood` (Trade + LP Velocity Concentrated Liquidity Signals)
- **Position Manager:** Handles post-execution auto-sell targets (Take Profit, Stop Loss, Trailing Stops, and Out-of-Range LP Warnings).

---

## 2. Technology Stack & Environment

- **Runtime:** Node.js (>=22.12) / TypeScript
- **Discord Bot SDK:** `discord.js` (v14+)
- **Blockchain & Crypto Web3 SDKs:**
  - `@solana/web3.js` & `@jup-ag/api` (Solana)
  - `viem` / `ethers.js` (EVM)
  - `ccxt` (Perpetuals & CEX)
  - Polymarket Gamma API & CLOB SDK (Polygon L2)
  - OpenSea Stream & REST API v2 (EVM NFTs)
- **Security Audit APIs:** RugCheck API (Solana), GoPlus Security API (EVM)
- **AI Engine:** OpenRouter / OpenAI / Anthropic Node SDK
- **Database & State:** SQLite / Prisma ORM / Redis
- **Protocol:** Model Context Protocol (MCP)

---

## 3. Directory Layout

```
Athena/
├── .agents/
│   ├── AGENTS.md                  # Project rules & coding guidelines
│   └── skills/                    # Athena-specific skills (swarm trading, gmgn)
├── src/
│   ├── index.ts                   # Bot initialization & client launcher
│   ├── orchestrator/              # Athena Core Hub & Global Risk Engine
│   │   ├── hub.ts                 # AthenaHub: agent states, risk gate, on-demand passes
│   │   ├── risk-manager.ts        # Drawdown / position-size / correlation guards
│   │   ├── risk-engine-v2.ts      # Kill-switch circuit breaker (singleton)
│   │   ├── swarm-consensus.ts     # 3-Layer Signal Quality Filter Engine
│   │   ├── swarm-learning.ts      # Outcome-driven agent weight recalibration
│   │   ├── strategy-engine.ts     # Sandboxed .mjs strategy loader (sanitized env)
│   │   ├── agent-registry.ts      # Single source of truth for all 8 agent domains
│   │   ├── agent-runner.ts        # LLM tool-call loop for chat/TUI/Telegram
│   │   ├── dispatch.ts            # Per-domain dispatch + LP payload builder
│   │   └── tool-registry.ts       # LLM function-calling tools (chat commands)
│   ├── agents/                    # Specialized screening agents (shared contract)
│   │   ├── shared/
│   │   │   ├── agent-contract.ts  # ScreeningAgent contract + CallCardPayload
│   │   │   └── gmgn-meme-helpers.ts # Shared GMGN prefilter/dedupe/signal helpers
│   │   ├── meme-solana/           # Solana DEX screening (GMGN + RugCheck)
│   │   ├── meme-robinhood/        # EVM DEX screening (GMGN + GoPlus)
│   │   ├── perps/                 # Technical setup screening (Hyperliquid)
│   │   ├── nft/                   # EVM NFT floor & rarity screening (OpenSea)
│   │   ├── prediction/            # Polymarket prediction market screening
│   │   └── ct-alpha/              # X/Twitter smart-CT screening
│   ├── adapters/                  # Web3 & Exchange execution adapters
│   │   ├── solana-adapter.ts      # Jupiter swaps + MEV guard (DRY_RUN)
│   │   ├── evm-adapter.ts         # EVM swaps/sends
│   │   ├── relay-adapter.ts       # Relay.link quote/swap/send + token maps
│   │   ├── gmgn-adapter.ts        # GMGN OpenAPI (rank/trenches/signals/audit)
│   │   ├── hyperliquid-adapter.ts # Perps market data + order execution
│   │   ├── meteora-dlmm-adapter.ts # Solana LP pools (DexScreener fallback)
│   │   ├── uniswap-lp-adapter.ts  # EVM LP pools (DexScreener fallback)
│   │   ├── opensea-adapter.ts     # NFT floor signals + swap aggregator
│   │   ├── polymarket-adapter.ts  # Gamma/CLOB market data + bets
│   │   └── mev-execution-guard.ts # Transaction simulation + priority fees
│   ├── position/                  # Auto TP/SL & Trailing Stop Position Manager
│   │   └── position-manager.ts
│   ├── discord/                   # Discord handlers, slash commands & embed views
│   │   ├── commands/              # Slash command definitions
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
│   │   ├── wallet-service.ts      # Wallet keys + balances (singleton)
│   │   ├── wallet-tracker.ts      # Holdings lifecycle -> PositionManager
│   │   ├── trade-journal-service.ts # Open/close audit trail
│   │   ├── security-service.ts    # RugCheck (Solana)
│   │   ├── goplus-security-service.ts # GoPlus (EVM)
│   │   ├── token-audit-service.ts # On-demand audit pipeline
│   │   ├── ai-service.ts          # Multi-provider LLM failover
│   │   ├── twitter-service.ts     # TwexAPI X/Twitter feeds
│   │   ├── session-memory.ts      # Audit memory for chat context
│   │   ├── cron-scheduler.ts      # Process-wide cron singleton
│   │   └── ...                    # market-regime, health-watcher, skill-loader, api-key-guard, rpc-failover
│   ├── cli/                       # Terminal TUI + diagnostic doctor
│   ├── telegram/                  # Telegram notification bridge + bot polling
│   └── api/                       # Minimal REST server (health + analytics)
├── strategies/                    # User/LLM-authored strategy .mjs modules
├── indicators/                    # Custom technical indicator .mjs modules
├── bin/athena.js                  # `athena` CLI (run/wizard/terminal/deploy/test/build/update/doctor)
├── scripts/                       # wizard.js (env setup), update-core.mjs (git pull+rebuild)
├── tests/                         # Vitest suite (247 tests)
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
   - Provide interactive Action Buttons (`BUY 0.5 SOL`, `PAUSE SCREENING`, `VIEW ON DEXSCREENER`, `BET YES 50 USDC`).

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

## 6. Safety & Security Rules

- **NEVER** commit private keys, mnemonic phrases, API keys, or Discord bot tokens into Git.
- Use `.env` files and keep `.env.example` updated with mock placeholders.
- Operating live trading agents should always use dedicated burner wallets with capped funds.
- **Token & API Cost Optimization**: Reserve LLM API calls strictly for high-value reasoning tasks (e.g. interpreting social sentiment in tweets, drafting final AI Thesis summaries, and handling user chat queries in the command room). Use local deterministic code and mathematical rules for filtering, security checks, and screening to minimize token consumption and keep running costs near zero.
