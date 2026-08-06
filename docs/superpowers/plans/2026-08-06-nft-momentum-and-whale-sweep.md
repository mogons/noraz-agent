# EVM NFT Momentum & Whale Sweep Sub-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `NFTScreeningAgent` and `OpenSeaAdapter` to focus on NFT Momentum Trading (Floor surge >= +30% 4h, Volume spike >= 3.0x 4h, Sales velocity >= 25/h) and Bear-Market Whale Wallet Sweep Tracking (Portfolio >= $10k, PnL >= 5 ETH, active tx in last 14 days, age >= 14 days, sweeping >= 3 NFTs in 15m).

**Architecture:**
- `OpenSeaAdapter` provides collection floor 4h history, sales volume 4h, and whale wallet activity checks.
- `NFTScreeningAgent` evaluates listings and collection metrics against momentum & whale sweep triggers, outputting signals to `#call-nft-sniping`.

**Tech Stack:** TypeScript, Node.js, `discord.js`, OpenSea API v2 & Stream WebSockets, `vitest`.

## Global Constraints
- Strictly TypeScript with no implicit any.
- Default `DRY_RUN=true`.

---

### Task 1: Update OpenSea Adapter with Momentum & Whale Verification (`src/adapters/opensea-adapter.ts`)

**Files:**
- Modify: `src/adapters/opensea-adapter.ts`

- [ ] **Step 1: Update `OpenSeaNFTSignal` interface with 4h floor surge, 4h volume spike ratio, and whale wallet metadata**

- [ ] **Step 2: Add `verifyWhaleWallet` helper method**

Validate Portfolio >= $10k USD, PnL >= 5.0 ETH, Wallet Age >= 14 days, and active tx within last 14 days.

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 2: Upgrade `NFTScreeningAgent` (`src/agents/nft/nft-screening-agent.ts`)

**Files:**
- Modify: `src/agents/nft/nft-screening-agent.ts`

- [ ] **Step 1: Rewrite `evaluateListing` in `NFTScreeningAgent` with NFT Momentum & Whale Sweep strategy**

Implement `floorSurge4hPct >= 30%`, `volumeSpike4hRatio >= 3.0x`, and `isWhaleSweep` (>= 3 items in 15 mins by verified whale).

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.
