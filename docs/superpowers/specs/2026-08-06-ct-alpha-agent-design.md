# Smart Crypto Twitter (CT) & AI Alpha Scraper Agent (`ct-alpha-agent.ts`) - Design Spec

**Date:** 2026-08-06  
**Project:** Athena Multi-Agent Crypto Intelligence System  
**Status:** Approved Specification  

---

## 1. Overview

The **Smart CT & AI Alpha Scraper Sub-Agent** (`src/agents/ct-alpha/ct-alpha-agent.ts`) runs 24/7 background social surveillance on X (Twitter). 

It specifically monitors high-signal **Crypto Twitter (CT) accounts, AI Agent launches, Web3 tips & tricks, airdrop strategies, and viral $TICKER mentions** to deliver actionable profit and yield opportunities to `#call-ct-alpha` and Telegram.

---

## 2. 5 Targeted Alpha Narratives

1. 🧠 **AI & AI Agents / DePIN Ecosystem:**
   - Detects tweets regarding AI Agent frameworks, token launches, GPU compute rewards, and Bittensor subnets.
2. 🚀 **Airdrop & Yield Farming Tips & Tricks:**
   - Detects step-by-step thread guides for testnet tasks, high-APR yield farming, and token distribution snapshots.
3. 💡 **Smart CT Influencer Signal Scans:**
   - Monitors top-tier KOLs and Smart Money accounts for high-velocity tweet engagement (>500 likes/h, >100 retweets/h).
4. 📈 **Viral Hashtag & Ticker Surge:**
   - Detects ticker symbols (`$SYMBOL`) being discussed simultaneously across 5+ independent CT accounts within 30 minutes.
5. 🎯 **Stealth Launch & Community Takeover (CTO) Calls:**
   - Scans for early contract address posts, presale links, and CTO announcements.

---

## 3. Data Flow & Processing Pipeline

```
[TwexAPI / Web3 Aggregator] ──► [Filter by Alpha Keywords & CT Accounts]
                                           │
                                           v
                        [AIService / Local NLP Sentiment Scoring]
                                           │
                                           v (Score >= 80%)
       [Discord Channel #call-ct-alpha & Telegram Dual Broadcast]
```

---

## 4. Rich Discord Alpha Card Layout

```
💡 ATHENA CT ALPHA CALL: AI Agent Ecosystem Surge ($VIRTUAL) • [90% CONFIDENCE]

👤 Author: @crypto_alpha_pro (125k Followers)
⏱️ Posted: 15 minutes ago | ❤️ 1,240 Likes | 🔁 380 Retweets

📌 Alpha Summary & Takeaway:
• New AI Agent Launch Protocol deployed on Base L2.
• Yield Farm APR offering 140% vAPY for early liquidity providers.
• Smart Money inflow: 4 top wallets accumulated $45,000 USD in 1h.

🔗 Direct Tweet Link: https://x.com/crypto_alpha_pro/status/123456789

[🔗 VIEW TWEET ON X]  [🔍 RUN ATHENA AUDIT]  [🤖 ASK AI DEEP SUMMARY]
```

---

## 5. File Layout

```
src/
├── agents/
│   └── ct-alpha/
│       └── ct-alpha-agent.ts          # [NEW] Smart CT & AI Alpha Sub-Agent
├── discord/
│   ├── commands/index.ts              # [MODIFY] Add ct-alpha to /screening choices
│   ├── embeds/dashboard-embed.ts      # [MODIFY] Add ct-alpha to /menu dropdown
│   └── setup/channel-bootstrap.ts     # [MODIFY] Auto-bootstrap #call-ct-alpha
└── index.ts                           # [MODIFY] Register CTAlphaAgent in background loop
```
