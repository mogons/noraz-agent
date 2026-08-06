# Twitter / X Social Intelligence Service (`twitter-service.ts`) - Design Spec

**Date:** 2026-08-06  
**Project:** Athena Multi-Agent Crypto Intelligence System  
**Status:** Approved Specification  

---

## 1. Overview

The **Twitter / X Social Intelligence Service** (`src/services/twitter-service.ts`) acts as a unified social sentiment engine for all 8 Athena sub-agents (Solana Meme, EVM Meme, Perps, Trade+LP, EVM NFT, and Polymarket).

It combines **Free Web3 Aggregators** (GMGN AI Social API) with **TwexAPI (`https://twexapi.io`)** (Affordable Twitter API replacement supporting tweet search, influencer tracking, and keyword velocity).

---

## 2. Data Sources & Fallback Hierarchy

1. **Layer 1: GMGN AI & Web3 Free Aggregator**
   - Fetches token/NFT social metrics, CTO verification, dev tweet handles, and influencer count without incurring API costs.
2. **Layer 2: TwexAPI Integration (`https://twexapi.io`)**
   - Configured via `TWEX_API_KEY` in `.env`.
   - Fetches recent tweets, search velocity for Contract Addresses (CA) / tickers, and influencer mention counts with low credit usage.
3. **Layer 3: Deterministic Fallback Mode**
   - If no API key is provided, returns safe deterministic sentiment scores (`0-100`) so agents function smoothly without errors.

---

## 3. Core Interface & Capabilities

```typescript
export interface TwitterHypeResult {
  symbol: string;
  contractAddress?: string;
  sentimentScore: number;       // 0 - 100
  tweetCount1h: number;
  influencerMentions: string[]; // e.g. ["@ansem", "@machibigbrother"]
  topTweets: Array<{
    text: string;
    author: string;
    likes: number;
    retweets: number;
    url: string;
  }>;
  isCtoVerified?: boolean;
}
```

---

## 4. Integration Across Sub-Agents

- **Meme Sub-Agents (`Solana` & `EVM`):** Verifies CTO (Community Takeover) tweet activity & viral ticker hashtags.
- **EVM NFT Sub-Agent:** Verifies collection hype score and influencer sweeps on X.
- **Polymarket Agent:** Checks social sentiment ratio for prediction event resolutions (e.g., Fed rate cut, ETF approvals).
- **Perps Agent:** Monitors macro tweet velocity around BTC/ETH/SOL catalysts.

---

## 5. File Layout

```
src/
├── services/
│   └── twitter-service.ts            # [NEW] Unified Twitter & TwexAPI Intelligence Service
└── index.ts                           # [MODIFY] Export & register TwitterService
```
