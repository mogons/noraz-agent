---
name: athena-swarm-trading
description: Autonomous multi-agent crypto trading skill for Solana, EVM DEXs, Perps, and NFTs using 3-layer Swarm Consensus, Discord Command Center, and Position Management.
---

# Athena Swarm Trading & Intelligence Skill

This skill defines the operational standards, decision pipelines, and multi-agent coordination rules for the **Athena Crypto Ecosystem**.

---

## 1. Solana Meme Potential Signal Categories

Screening agents scan across 3 high-potential token opportunities:
1. 🐣 **Established Launches & CTO Tokens:** Tokens with minimum **4 Hours Age** and active bonding curve/DEX liquidity.
2. 🧟 **Revival & CTO Tokens (Dead Tokens Waking Up):** Established tokens (> 4h age) experiencing a sudden **+500% 1H volume surge**, **2+ GMGN Smart Wallet accumulation**, and dev 0% / CTO (Community Takeover).
3. 🚀 **Volume Surge & Trend Breakouts:** Tokens breaking key resistance levels confirmed by 1H GMGN Smart Money Net Inflows.

### Layer 1: Quant & Liquidity Audit
- **Timeframe Standard:** 1H (1-Hour rolling volume surge, fee velocity, and trend evaluation).
- **Minimum Token Age:** **4.0 Hours (240 Minutes)** minimum age required across all Meme & LP strategies.
- **Minimum Liquidity:** $25,000 USD (DEX pools).
- **Volume Surge:** 1-Hour volume spike check (> 300% volume surge).
- **Transaction Ratio:** Buy vs Sell transaction ratio evaluation.

### Layer 2: Catalyst & Social Hype Audit (Twitter/X Sentiment)
- **Twitter/X Hype Verification:** Uses GMGN Social API & OpenRouter AI sentiment check to audit:
  - Active X account link presence (MANDATORY).
  - Recycled / Scammer X account flag check (reject if recycled or suspended).
  - Tweet volume & engagement momentum score.
- **Narrative Match:** Viral meme topic & community engagement scoring.

### Layer 3: Security & Runner Token Audit Checklist
Flexible thresholds designed to capture **high-potential RUNNER tokens** while avoiding scams:
1. 👥 **Top 10 Holders Control:** MUST be <= 25% (allows healthy community & cabal backing).
2. 👨‍💻 **Dev Holding %:** MUST be <= 10% (allows marketing/airdrop reserve).
3. 🐋 **Snipers %:** MUST be <= 20% (realistic sniper threshold for runner tokens).
4. 🕵️ **Insiders %:** MUST be <= 20% (realistic team/insider allocation).
5. 🤖 **Bundler %:** MUST be <= 25% (allows early bundler momentum for runner launches).
6. 🎣 **Phishing Risk %:** MUST be <= 3%.
7. 💳 **Dex Paid Status:** MUST be DEXScreener Paid (Paid status is mandatory to filter out low-effort rugs).
8. 🚫 **NoMint:** Mint Authority MUST be disabled.
9. 🛡️ **No Blacklist:** Blacklist Authority MUST be disabled.
10. 🔥 **Burnt LP %:** 100% LP Burned / Permanent Lock.
11. ⚠️ **Rug Risk Score %:** Overall calculated Rug Risk MUST be <= 5% (Runner Safe Zone).
12. 📊 **Holder Count Growth:** Unique holders count verification.

- **Global Risk Limit:** Verify daily portfolio drawdown < 5%.

---

## 2. Discord Call & Execution Standards

- **Informational Calls:** Deliver to dedicated channels (`#call-meme-solana`, `#call-meme-evm`, `#call-perps-futures`, `#call-nft-sniping`).
- **Interactive Action Buttons:** Provide `[BUY 0.5 SOL/ETH]`, `[BUY 1.0 SOL/ETH]`, and `[PAUSE CHANNEL]`.
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
