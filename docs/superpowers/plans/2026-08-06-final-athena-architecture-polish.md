# Final Athena Architecture Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the 3 final architecture polish recommendations:
1. Local Database File Persistence (`src/services/db-service.ts`) for alerts and trade journal.
2. Background Discord Signal Broadcast Loop in `src/index.ts` sending rich call cards to all 5 signal channels (`#call-meme-solana`, `#call-meme-evm`, `#call-perps-futures`, `#call-nft-sniping`, `#call-prediction-markets`).
3. Dual Telegram Broadcast Bridge in `src/telegram/telegram-service.ts`.

**Architecture:**
- `DbService` manages persistent storage in `database/athena_state.json` (auto-loaded by `PriceAlertService` & `TradeJournalService`).
- `src/index.ts` establishes periodic screening loops for all sub-agents, delivering signals to Discord channels with action buttons (`[BUY]`, `[BET YES]`) and broadcasting to Telegram.

**Tech Stack:** TypeScript, Node.js, `discord.js`, `TelegramService`, `vitest`.

## Global Constraints
- Strictly TypeScript with no implicit any.
- Keep `DRY_RUN=true` default.

---

### Task 1: Create Local Database File Persistence Service (`src/services/db-service.ts`)

**Files:**
- Create: `src/services/db-service.ts`
- Modify: `src/services/price-alert-service.ts`
- Modify: `src/services/trade-journal-service.ts`

- [ ] **Step 1: Create `DbService` for atomic file storage in `database/athena_state.json`**

- [ ] **Step 2: Connect `PriceAlertService` & `TradeJournalService` to `DbService`**

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 2: Implement Discord & Telegram Dual Signal Broadcast Loop

**Files:**
- Modify: `src/index.ts`
- Modify: `src/telegram/telegram-service.ts`

- [ ] **Step 1: Enhance `TelegramService` with `broadcastSignalEmbed`**

- [ ] **Step 2: Create background screening loop runner `runAllScreeningPasses()` in `src/index.ts`**

Automatically polls sub-agents and posts rich call cards with interactive action buttons to Discord channels and Telegram bridge.

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 3: Verify with End-to-End Test Suite

**Files:**
- Modify: `tests/athena-ecosystem.test.ts`

- [ ] **Step 1: Add `DbService` persistence test to `tests/athena-ecosystem.test.ts`**

- [ ] **Step 2: Run full build and test suite**

Run: `npm test`  
Expected: All tests pass cleanly (11/11 tests PASSED).
