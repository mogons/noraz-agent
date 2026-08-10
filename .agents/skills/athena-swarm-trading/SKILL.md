---
name: athena-swarm-trading
description: Autonomous multi-agent crypto trading skill for Robinhood Chain EVM DEX tokens and NFTs using 3-layer Swarm Consensus, Discord Command Center, and Position Management.
---

# Athena Swarm Trading & Intelligence Skill

This skill defines the operational standards, decision pipelines, and multi-agent coordination rules for the **Athena AI (Robinhood Chain Edition)** ecosystem.

---

## 1. Robinhood Chain Meme Signal Categories

Screening agents scan across 3 high-potential token opportunities:

1. 🐣 **Established Launches & CTO Tokens:** Robinhood DEX tokens with minimum **4 Hours Age**, active DEX liquidity, and a Community Takeover (CTO) or dev-closed profile.
2. 🧟 **Revival & CTO Tokens (Dead Tokens Waking Up):** Established tokens (> 4h age) experiencing a sudden **+500% 1H volume surge**, **2+ GMGN Smart Wallet** accumulation, and dev 0% / CTO (Community Takeover).
3. 🚀 **Volume Surge & Trend Breakouts:** Tokens breaking key resistance levels confirmed by 1H GMGN Smart Money Net Inflows.

### Layer 1: Quant & Liquidity Audit

- **Timeframe Standard:** 1H (1-Hour rolling volume surge, fee velocity, and trend evaluation).
- **Minimum Token Age:** **4.0 Hours (240 Minutes)** minimum age standard. NOTE: the agent config default is `minAgeHours=0` for degen early access (new tokens pass immediately — smart money/CTO/KOL decide); the age gate is only enforced when `minAgeHours > 0` is configured (e.g. via `set_screening_config` in the control room).
- **Minimum Liquidity:** $25,000 USD (DEX pools). NOTE: agent default is `minLiquidityUsd=10000` — configurable.
- **Volume Surge:** 1-Hour volume spike check (> 300% volume surge). NOTE: agent default gates real 1H volume at `minVolume1hUsd=50000` — configurable.
- **Transaction Ratio:** Buy vs Sell transaction ratio evaluation (momentum requires buy dominance).

### Layer 2: Catalyst & Social Hype Audit

- **GMGN Social Data:** Uses GMGN social fields (smart-money wallet counts, KOL counts, square mentions, visiting count, X/twitter activity flags — rename/delete/post counts) to score hype deterministically with local rules.
- **LLM Sentiment:** LLM reasoning is reserved for high-value tasks only — interpreting social sentiment for the final AI Thesis and answering user chat queries in the command room (token & API cost optimization). Screening passes themselves are deterministic.
- **Narrative Match:** Viral meme topic & community engagement scoring.

### Layer 3: Security & Runner Token Audit Checklist (GMGN `/token/security`)

Flexible thresholds designed to capture **high-potential RUNNER tokens** while avoiding scams. These map to GMGN security fields available for the robinhood chain; where a field is unavailable, the audit is **fail-closed** (unverified = rejected):

1. 👥 **Top 10 Holders Control:** MUST be <= 25% (allows healthy community & cabal backing).
2. 👨‍💻 **Dev Holding %:** MUST be <= 10% (allows marketing/airdrop reserve).
3. 🐋 **Snipers %:** MUST be <= 20% (realistic sniper threshold for runner tokens).
4. 🕵️ **Insiders %:** MUST be <= 20% (realistic team/insider allocation).
5. 🤖 **Bundler %:** MUST be <= 25% (allows early bundler momentum for runner launches).
6. 🎣 **Phishing Risk %:** MUST be <= 3%.
7. 💳 **Dex Paid Status:** MUST be DexScreener Paid (Paid status is mandatory to filter out low-effort rugs).
8. 🚫 **NoMint:** Mint Authority MUST be disabled.
9. 🛡️ **No Blacklist:** Blacklist Authority MUST be disabled.
10. 🔥 **Burnt LP %:** 100% LP Burned / Permanent Lock.
11. ⚠️ **Rug Risk Score %:** Overall calculated Rug Risk MUST be <= 5% (Runner Safe Zone).
12. 📊 **Holder Count Growth:** Unique holders count verification.

- **Fail-Closed Note:** every Layer 3 audit gate runs through GMGN `/v1/token/security` (per-token audit endpoint) + GMGN rank security fields. A missing/unavailable audit field or failed audit = REJECT — tokens are never passed on missing data.
- **Global Risk Limit:** Verify daily portfolio drawdown < 5%.

---

## 2. Discord Call & Execution Standards

- **Informational Calls:** Deliver to dedicated robinhood-only channels (`#call-meme-robinhood`, `#call-lp-robinhood`, `#call-nft-sniping`).
- **Interactive Action Buttons:** Provide `[BUY 0.5 ETH]`, `[BUY 1.0 ETH]`, and `[PAUSE CHANNEL]`. NOTE: buttons are currently link-based (quick links to GMGN/DexScreener/GoPlus) until live execution is wired up.
- **Command Execution:** User buys are executed securely via Athena Core Hub in `#athena-control-room`.

---

## 3. Position Management (Auto TP / SL)

Upon trade execution:

- **Take Profit (TP):** Scale out 50% at +100% (2x), 25% at +200% (3x).
- **Stop Loss (SL):** Hard stop loss execution if token drops by configured limit (default -20%).
- **Trailing Stop:** Adjust stop loss upwards dynamically as high-water mark increases.

---

## 4. Trade Audit & Diagnostic Logging

- Log every signal, thesis, entry price, execution time, and exit PnL in the database.
- Support natural language trade diagnostics when queried in Discord.
