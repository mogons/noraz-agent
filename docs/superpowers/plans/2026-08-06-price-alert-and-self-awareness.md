# Price Alert Engine & System Self-Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `PriceAlertService` to manage custom asset price alerts (via `/alert` slash command or natural language chat in `#athena-control-room`), and equip Athena AI in `#athena-control-room` with full self-awareness of its own multi-agent architecture and risk settings.

**Architecture:**
- `PriceAlertService` stores price targets, parses natural language alert triggers (e.g. *"kabari kalau BTC 70k"*), and polls `PriceFeedService` every 60s to emit Discord alert embeds.
- `slashCommands` adds `/alert` (set, list, cancel).
- `handleControlRoomMessage` parses natural language alerts and incorporates structured system self-knowledge prompt for Athena AI queries.

**Tech Stack:** TypeScript, Node.js, `discord.js`, CoinGecko / PriceFeedService, `vitest`.

## Global Constraints
- Strictly TypeScript with no implicit any.
- Real-time price alerts must ping the user in Discord.

---

### Task 1: Create Price Alert Service (`src/services/price-alert-service.ts`)

**Files:**
- Create: `src/services/price-alert-service.ts`

- [ ] **Step 1: Write `PriceAlertService` class**

Implement `addAlert`, `removeAlert`, `listAlerts`, `checkAlerts`, and `parseNaturalLanguageAlert`.

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 2: Add `/alert` Slash Command & Interaction Handlers

**Files:**
- Modify: `src/discord/commands/index.ts`
- Modify: `src/discord/handlers/interaction-handler.ts`

- [ ] **Step 1: Add `/alert` command to `slashCommands` array in `src/discord/commands/index.ts`**

Subcommands: `set` (symbol, price, direction), `list`, `cancel` (id).

- [ ] **Step 2: Handle `/alert` command in `src/discord/handlers/interaction-handler.ts`**

Execute alert registration and response embed.

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 3: Enhance Control Room Message Handler with NL Alert Parsing & Self-Awareness Prompt

**Files:**
- Modify: `src/discord/handlers/message-handler.ts`

- [ ] **Step 1: Integrate `parseNaturalLanguageAlert` and System Self-Awareness Prompt in `src/discord/handlers/message-handler.ts`**

Detect natural language price alert requests and provide comprehensive system architecture knowledge to Athena AI responses.

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.

---

### Task 4: Hook Price Alert Loop in Entrypoint (`src/index.ts`)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Initialize `PriceAlertService` and start 60s checking interval loop in `src/index.ts`**

- [ ] **Step 2: Run full build and test**

Run: `npm run build`  
Expected: Build succeeds with 0 errors.
