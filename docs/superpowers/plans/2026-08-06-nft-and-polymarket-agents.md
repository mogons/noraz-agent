# NFT Sniping Sub-Agent, Polymarket Sub-Agent & README Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the EVM NFT Sniping Sub-Agent (`nft-screening-agent.ts`), the Polymarket Prediction Market Adapter & Sub-Agent (`polymarket-adapter.ts` & `polymarket-agent.ts`), auto-create `#call-prediction-markets` in Discord, and update `README.md`, `AGENTS.md`, and system prompts.

**Architecture:**
- `NFTScreeningAgent` checks OpenSea EVM floor drops >= 10%, rare mispricings, and 1h sweep events, sending calls to `#call-nft-sniping`.
- `PolymarketAdapter` connects to Polymarket Gamma API & CLOB API on Polygon L2.
- `PolymarketAgent` screens prediction markets across Crypto, Macro, Politics, and Tech, sending calls to `#call-prediction-markets`.
- `channel-bootstrap.ts` auto-creates `#call-prediction-markets`.
- `README.md`, `AGENTS.md`, `slashCommands`, and `handleControlRoomMessage` updated with full system knowledge.

**Tech Stack:** TypeScript, Node.js, `discord.js`, OpenSea API, Polymarket Gamma API, `viem`, `ethers`, `vitest`.

## Global Constraints
- Strictly TypeScript with no implicit any.
- All adapters respect `DRY_RUN=true` default.

---

### Task 1: Implement EVM NFT Sniping Sub-Agent

**Files:**
- Modify: `src/adapters/opensea-adapter.ts`
- Create: `src/agents/nft/nft-screening-agent.ts`

- [ ] **Step 1: Enhance `OpenSeaAdapter` with multi-chain EVM listing & floor fetching**

Add `fetchCollectionFloorAndListings` to `src/adapters/opensea-adapter.ts`.

- [ ] **Step 2: Create `NFTScreeningAgent` class in `src/agents/nft/nft-screening-agent.ts`**

Implement Floor Mispricing (>=10% below floor), Rare Trait Mispricing (Top 10% rarity at <=1.05x floor), and Volume Sweep checks.

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 2: Implement Polymarket Adapter & Prediction Market Sub-Agent

**Files:**
- Create: `src/adapters/polymarket-adapter.ts`
- Create: `src/agents/prediction/polymarket-agent.ts`

- [ ] **Step 1: Create `PolymarketAdapter` class in `src/adapters/polymarket-adapter.ts`**

Connect to Polymarket Gamma API (`https://gamma-api.polymarket.com/markets`), fetch active event markets across Crypto, Macro, Politics, and Tech, and implement `placeBet` with `DRY_RUN=true` support.

- [ ] **Step 2: Create `PolymarketAgent` class in `src/agents/prediction/polymarket-agent.ts`**

Implement odds arbitrage, whale bet inflow detection (>= $10,000 USDC), and high probability resolution yield checks.

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 3: Bootstrap Discord `#call-prediction-markets` & Slash Commands

**Files:**
- Modify: `src/discord/setup/channel-bootstrap.ts`
- Modify: `src/discord/commands/index.ts`

- [ ] **Step 1: Add `#call-prediction-markets` to `bootstrapDiscordChannels` in `channel-bootstrap.ts`**

- [ ] **Step 2: Add `prediction` choice to `/screening` command in `src/discord/commands/index.ts`**

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 4: Register Agents in Core Loop & Update Documentation (`README.md` & `AGENTS.md`)

**Files:**
- Modify: `src/index.ts`
- Modify: `src/discord/handlers/message-handler.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Initialize `NFTScreeningAgent` and `PolymarketAgent` in `src/index.ts`**

- [ ] **Step 2: Update AI system self-awareness prompt in `src/discord/handlers/message-handler.ts`**

- [ ] **Step 3: Update `README.md` & `AGENTS.md` with complete multi-agent system architecture diagrams, channels, and rules**

- [ ] **Step 4: Run full build and test**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.
