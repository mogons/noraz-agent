# EVM Meme Screening Agent & Aggressive Trade+LP Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the EVM Meme Sub-Agent (`evm-screening-agent.ts`) for Base, Ethereum, and Robinhood L2 DEX tokens, upgrade Uniswap & Meteora LP adapters to the aggressive "Trade + LP Velocity" strategy (>5% 4h fee/TVL, >150% 4h volume/TVL, >6x active velocity), and update PositionManager active LP position alerts.

**Architecture:** 
- `EVMScreeningAgent` scans EVM DEX tokens, runs GoPlus Security API, GMGN Smart Money check, 300% volume surge check, and emits calls to `#call-meme-evm`.
- `UniswapLPAdapter` and `MeteoraDLMMAdapter` filter high-velocity pools using the 5% 4h Fee/TVL, 150% 4h Vol/TVL, and 6x Active Velocity ratios.
- `PositionManager` evaluates open active LP positions against these velocity thresholds and emits warnings when yield or volume dries up.

**Tech Stack:** TypeScript, Node.js, `discord.js`, `viem`, `ethers`, `@solana/web3.js`, `@meteora-ag/dlmm`, `@uniswap/v3-sdk`, `vitest`.

## Global Constraints
- Strictly TypeScript with no implicit any.
- All trading adapters MUST respect `DRY_RUN=true` default.
- Require confidence score >= 80% before emitting calls.

---

### Task 1: Update LP Adapters with Aggressive Trade+LP Ratios

**Files:**
- Modify: `src/adapters/uniswap-lp-adapter.ts`
- Modify: `src/adapters/meteora-dlmm-adapter.ts`

- [ ] **Step 1: Update `UniswapLPAdapter` filter threshold constants**

Set `feesToTvlRatio4h >= 0.05` (5%), `volumeToTvlRatio4h >= 1.5` (150%), `volumeToActiveTvlRatio4h >= 6.0` (6.0x), and `fees24hEth >= 0.5`.

- [ ] **Step 2: Update `MeteoraDLMMAdapter` filter threshold constants**

Set `feesToTvlRatio4h >= 0.05` (5%), `volumeToTvlRatio4h >= 1.5` (150%), `volumeToActiveTvlRatio4h >= 6.0` (6.0x), and `fees24hSol >= 10`.

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 2: Update `PositionManager` Active LP Position Alerts

**Files:**
- Modify: `src/position/position-manager.ts`

- [ ] **Step 1: Update `checkLpPositionAlert` in `PositionManager`**

Adjust `currentFeesToTvlRatio4h < 0.05` (5% 4h fee alert), `currentVolumeToActiveTvl4h < 6.0` (6.0x active velocity alert), and add `currentVolumeToTvl4h < 1.5` (150% volume alert).

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 3: Implement EVM Meme Screening Sub-Agent

**Files:**
- Create: `src/agents/meme-evm/evm-screening-agent.ts`

- [ ] **Step 1: Write `EVMScreeningAgent` class**

Implement 3-layer Swarm Audit for EVM tokens (Base, Ethereum, Robinhood L2):
- Layer 1: Quant ($25k min liquidity, 300% 5m/1h volume surge, DEX paid check).
- Layer 2: Catalyst (GMGN EVM Smart Money >= 2 wallets, Twitter link check, AI sentiment score >= 75).
- Layer 3: GoPlus Security Audit (is_honeypot = 0, tax <= 5%, dev <= 10%, top 10 <= 25%, no blacklist).

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 4: Register EVMScreeningAgent in Core System Loop (`src/index.ts`)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Import and initialize `EVMScreeningAgent` in `src/index.ts`**

Log EVM agent status alongside `SolanaScreeningAgent` and `PerpsScreeningAgent`.

- [ ] **Step 2: Run full build and tests**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.
