# Smart CT & AI Alpha Scraper Sub-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the **Smart CT & AI Alpha Scraper Agent** (`src/agents/ct-alpha/ct-alpha-agent.ts`) to monitor X/Twitter for AI narratives, crypto alpha threads, tips & tricks, and smart money calls, auto-posting to `#call-ct-alpha` and Telegram.

**Architecture:**
- `CTAlphaAgent` utilizes `TwitterService` (TwexAPI + GMGN free fallback) to search for viral CT tweets, AI Agent launches, and airdrop threads.
- Bootstrap `#call-ct-alpha` channel in `channel-bootstrap.ts`.
- Register `ct-alpha` choice in `/screening` slash command and `/menu` dashboard dropdown.
- Instantiate `CTAlphaAgent` in `src/index.ts` background screening loop.

**Tech Stack:** TypeScript, `discord.js`, `TwitterService`, `AIService`, `vitest`.

## Global Constraints
- Strictly TypeScript with no implicit any.
- High-quality signal filtering (skips spam/noise).

---

### Task 1: Create Smart CT Alpha Sub-Agent (`src/agents/ct-alpha/ct-alpha-agent.ts`)

**Files:**
- Create: `src/agents/ct-alpha/ct-alpha-agent.ts`

- [ ] **Step 1: Create `CTAlphaAgent` with 5 narrative filters & alpha signal generator**

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 2: Integrate `#call-ct-alpha` Channel & Commands

**Files:**
- Modify: `src/discord/setup/channel-bootstrap.ts`
- Modify: `src/discord/commands/index.ts`
- Modify: `src/discord/embeds/dashboard-embed.ts`
- Modify: `src/discord/embeds/call-embed.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add `#call-ct-alpha` channel ID & auto-bootstrap in `channel-bootstrap.ts`**

- [ ] **Step 2: Add `ct-alpha` to `/screening` choices and `/menu` dropdown**

- [ ] **Step 3: Add `CT_ALPHA` domain handling in `call-embed.ts`**

- [ ] **Step 4: Instantiate `CTAlphaAgent` in `src/index.ts` background loop**

- [ ] **Step 5: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 3: Verify with Unit Test Suite

**Files:**
- Modify: `tests/athena-ecosystem.test.ts`

- [ ] **Step 1: Add `CTAlphaAgent` unit test to `tests/athena-ecosystem.test.ts`**

- [ ] **Step 2: Run full build and test suite**

Run: `npm test`  
Expected: All tests pass cleanly (12/12 tests PASSED).
