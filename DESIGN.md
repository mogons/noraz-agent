# 🐾 DESIGN.md — Opencatz AI Design System

> **Official Visual & Identity Design System for Opencatz AI**
> *Unified Design System for Discord Embeds, Terminal TUI, and Multi-Platform Clients*

---

## 1. 🎨 Executive Brand Overview

**Opencatz AI** is an autonomous, multi-agent crypto intelligence and trading ecosystem specialized for **Robinhood Chain (EVM L2)**:

- **Art Direction:** Retro 8-bit aesthetic, crisp outlines, casual pixel personality traits, and witty feline charm.
- **Hero Palette:** High-energy **Robinhood Green (`#CCFF00`)** anchored against deep **Solid Obsidian Black (`#0B0E14`)** and harmonized pastel & neon counter-tones.
- **Mascot Persona:** **OpenCatz** — The chillest, most laid-back yet mathematically razor-sharp DeFi cat oracle in the crypto space.

### 🐾 The 3 Feline Pillars & Philosophy:
1. **The Prowl (Intelligence & Night Vision):** DEX pools are dark, noisy, and hazardous. OpenCatz's 3-Layer Swarm Consensus acts as feline night vision — stalking candidates 24/7 with patient stealth and only pouncing when Swarm Confidence purrs at $\ge 80\%$.
2. **The Cat Den (Command Center & Scratching Post):** Multi-channel central hub (`#opencatz-control-room`, `#opencatz-audit`, Terminal TUI, Telegram bridge) for natural language chat, instant 12-point token audits, and wallet controls.
3. **The Nine Lives Engine (Resilience & Risk):** Capital preservation is sacred. OpenCatz protects traders with a 9-Lives safety net: automated Stop-Loss (-20%), Take-Profit milestone scaling (2x/3x), dynamic trailing stops, and an instant 9-Lives Circuit Breaker kill-switch.

---

## 2. 🌈 Master Color Token Architecture

Opencatz AI UI components utilize a standardized retro palette across Discord embeds, Web API, and CLI terminal:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OPENCATZ AI COLOR PALETTE MATRIX                       │
├───────────────────────┬──────────────┬──────────────────┬───────────────────┤
│ Role / Name           │ Hex Code     │ RGB              │ Discord Embed Int │
├───────────────────────┼──────────────┼──────────────────┼───────────────────┤
│ 👑 Robinhood Green    │ #CCFF00      │ rgb(204, 255, 0) │ 0xCCFF00 (Hero)   │
│ ⬛ Obsidian Black     │ #0B0E14      │ rgb(11, 14, 20)  │ 0x0B0E14 (Frame)  │
│ 🌸 Pastel Pink        │ #FFB7B2      │ rgb(255, 183, 178│ 0xFFB7B2 (Meme)   │
│ 🔮 Lavender Purple    │ #D6C7FF      │ rgb(214, 199, 255│ 0xD6C7FF (NFT)    │
│ 🌊 Retro Cyan         │ #80DEEA      │ rgb(128, 222, 234│ 0x80DEEA (LP)     │
│ ☀️ Pastel Yellow      │ #FFF59D      │ rgb(255, 245, 157│ 0xFFF59D (Alpha)  │
│ 🏆 Golden Fortune 24K │ #FFD700      │ rgb(255, 215, 0) │ 0xFFD700 (PnL/VIP)│
│ 🍀 Jade Spirit Green  │ #00E676      │ rgb(0, 230, 118) │ 0x00E676 (Swap)   │
│ 🚨 Maneki-Neko Red    │ #E53935      │ rgb(229, 57, 53) │ 0xE53935 (Alert)  │
│ 🧢 Denim Blue         │ #0277BD      │ rgb(2, 119, 189) │ 0x0277BD (Action) │
│ 🟣 Royal Violet       │ #7B1FA2      │ rgb(123, 31, 162)│ 0x7B1FA2 (Strat)  │
└───────────────────────┴──────────────┴──────────────────┴───────────────────┘
```

### Functional Color Semantics:
1. **High Confidence Signals & TP Wins ($\ge 80\%$ Swarm):** `Robinhood Green (#CCFF00)` & `Jade Spirit (#00E676)`
2. **Meme Calls (`#call-meme-robinhood`):** `Pastel Pink (#FFB7B2)` with Obsidian borders
3. **Concentrated LP Velocity (`#call-lp-robinhood`):** `Retro Cyan (#80DEEA)`
4. **NFT Floor & Rarity Alerts (`#call-nft-robinhood`):** `Lavender Purple (#D6C7FF)`
5. **Alpha Scraper & Twitter/X Sentiments (`#call-alpha-robinhood`):** `Pastel Yellow (#FFF59D)`
6. **Whale Tracker & Perps Flows (`#call-whale-eth`):** `Denim Blue (#0277BD)` / `Robinhood Green (#CCFF00)`
7. **Risk Circuit Breaker, Honeypot Warnings, Stop Losses:** `Maneki-Neko Lucky Red (#E53935)`
8. **Realized Gains & Treasury Highlights:** `Golden Fortune (#FFD700)`

---

## 3. 🐱 Pixel Mascot & Terminal ASCII Art

### Standard OpenCatz ASCII (Terminal TUI & Wizard Banner)

```text
       /\_____/\
      /  o   o  \      🐾 OPENCATZ AI (ROBINHOOD CHAIN) 🐾
     ( ==  ^  == )     Autonomous Multi-Agent Trading Swarm
      )         (      Robinhood Chain EVM L2 • Chain ID: 4663
     (           )     "Chill trades, 9 lives, sharp alpha."
    ( (  )   (  ) )
   (__(__)___(__)__)
```

### Swag Sunglasses OpenCatz (Command Center & Oracle)

```text
       /\_____/\
      /  ■   ■  \      🕶️ OPENCATZ AI · COMMAND CENTER 🕶️
     ( ==  ^  == )     Swarm Consensus & Precision On-Chain Execution
      )    ~    (      Primary Swap: Uniswap V3 • L2 EVM #4663
     (   _____   )     Cat Den 24/7 Agent Daemon Active
    ( (  )   (  ) )
   (__(__)___(__)__)
```

---

## 4. 💻 Terminal ANSI Color System

For CLI tools (`bin/opencatz.js`, `src/cli/tui.ts`, `scripts/wizard.js`):

```typescript
export const OPENCATZ_COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  lime: '\x1b[38;2;204;255;0m',      // #CCFF00 Robinhood Green
  pink: '\x1b[38;2;255;183;178m',    // #FFB7B2 Pastel Pink
  lavender: '\x1b[38;2;214;199;255m',// #D6C7FF Lavender Purple
  cyan: '\x1b[38;2;128;222;234m',    // #80DEEA Retro Cyan
  yellow: '\x1b[38;2;255;245;157m',  // #FFF59D Pastel Yellow
  gold: '\x1b[38;2;255;215;0m',      // #FFD700 Golden Fortune
  red: '\x1b[38;2;229;57;53m',       // #E53935 Maneki-Neko Red
  green: '\x1b[38;2;0;230;118m',     // #00E676 Jade Spirit
  obsidian: '\x1b[38;2;11;14;20m',   // #0B0E14 Obsidian
};
```

---

## 5. 🤖 Discord Command Center Channel Layout

- **Category:** `🐾 OPENCATZ COMMAND CENTER`
- **Core Channels:**
  - `#opencatz-control-room` — Main natural language chat, wallet balance, risk settings, and execution intents.
  - `#opencatz-audit` / `#audit-on-demand` — Instant 12-point token audit upon pasting contract address (CA).
  - `#call-meme-robinhood` — High-velocity meme token entries vetted by GMGN + GoPlus.
  - `#call-lp-robinhood` — Concentrated liquidity pool velocity alerts via Krystal Cloud.
  - `#call-nft-robinhood` — OpenSea floor drops and rare trait snipes for OpenCats & EVM collections.
  - `#call-alpha-robinhood` — 1-hour Robinhood Chain Alpha & Twitter/X sentiment signals.
  - `#call-whale-eth` — Hyperliquid ETH whale positioning and institutional spot flows.

---

## 6. 🗣️ Tone of Voice & Personality Guidelines

- **Identity:** OpenCatz is a cool, laid-back pixel cat who has mastered on-chain DeFi.
- **Tone:** Relaxed, friendly, and witty ("*meow*", "*sharpening claws*", "*9 lives risk engine*"), but with zero fluff when it comes to risk, numbers, and execution speed.
- **Efficiency:** Ultra cost-efficient LLM token consumption — direct answers, clean bullet points, deterministic math-first operations.
