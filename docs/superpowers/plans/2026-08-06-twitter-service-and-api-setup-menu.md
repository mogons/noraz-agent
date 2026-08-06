# Twitter / X Intelligence Service & API Key Setup Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `TwitterService` (`src/services/twitter-service.ts`) combining GMGN AI free social data with TwexAPI (`https://twexapi.io`), and add an interactive **API Keys Status & Setup Modal** in the `/menu` dashboard.

**Architecture:**
- `TwitterService` fetches token & NFT X/Twitter sentiment, influencer mentions, and tweet counts via TwexAPI or free Web3 aggregators.
- `dashboard-embed.ts` updated with API Keys status section and `[⚙️ SETUP API KEYS]` button.
- `interaction-handler.ts` handles API Key setup modal submission (`api_setup_modal`) to dynamically configure TwexAPI, OpenSea, and LLM keys.
- `.env.example` updated with `TWEX_API_KEY`.

**Tech Stack:** TypeScript, Node.js, `discord.js`, `fetch`, TwexAPI.

## Global Constraints
- Strictly TypeScript with no implicit any.
- Fallback gracefully to free/deterministic mode if `TWEX_API_KEY` is not set.

---

### Task 1: Create Twitter / X Social Intelligence Service (`src/services/twitter-service.ts`)

**Files:**
- Create: `src/services/twitter-service.ts`

- [ ] **Step 1: Create `TwitterService` class with TwexAPI & GMGN fallback integration**

Implement `getHypeScore(symbol, contractAddress)` and `searchTweets(query)`.

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 2: Add API Key Status & Modal Setup to Discord Dashboard

**Files:**
- Modify: `src/discord/embeds/dashboard-embed.ts`
- Modify: `src/discord/handlers/interaction-handler.ts`

- [ ] **Step 1: Add API Key status section & `[⚙️ SETUP API KEYS]` button to `dashboard-embed.ts`**

- [ ] **Step 2: Add modal handler `api_setup_modal` in `interaction-handler.ts`**

Allow users to paste `TWEX_API_KEY`, `OPENSEA_API_KEY`, or `OPENAI_API_KEY` via modal input.

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 3: Update `.env.example` & Test Suite

**Files:**
- Modify: `.env.example`
- Modify: `tests/athena-ecosystem.test.ts`

- [ ] **Step 1: Add `TWEX_API_KEY` to `.env.example`**

- [ ] **Step 2: Add `TwitterService` unit test to `tests/athena-ecosystem.test.ts`**

- [ ] **Step 3: Run full build & test suite**

Run: `npm test`  
Expected: All tests pass cleanly.
