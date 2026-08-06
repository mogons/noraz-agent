# Athena Interactive Master Control Dashboard (`/menu`) - Design Spec

**Date:** 2026-08-06  
**Project:** Athena Multi-Agent Crypto Intelligence System  
**Status:** Approved Specification  

---

## 1. Overview

The **Athena Interactive Master Control Dashboard** (`/menu` or `/dashboard`) provides an all-in-one Discord UI hub allowing users to monitor and control all sub-agents, risk parameters, price alerts, and burner wallets using **Interactive Buttons**, **Select Dropdown Menus**, and **Live Status Embeds**.

---

## 2. Interactive UI Components

### A. Rich Control Center Embed (`/menu`)
- **Header:** `🏛️ ATHENA MULTI-AGENT CONTROL CENTER`
- **Section 1: Operating Mode & Risk Parameters**
  - `Execution Mode:` `DRY_RUN (Safe Mode)` / `LIVE TRADING`
  - `Max Daily Drawdown Limit:` `5.0%`
  - `Current Portfolio Drawdown:` `0.0%`
- **Section 2: Sub-Agent Status Grid**
  - 🐣 **Solana Meme Agent:** `🟢 ACTIVE` / `🔴 PAUSED`
  - 🔷 **EVM Meme Agent:** `🟢 ACTIVE` / `🔴 PAUSED`
  - 📈 **Perpetual Futures Agent:** `🟢 ACTIVE` / `🔴 PAUSED`
  - 💧 **Trade+LP Velocity Engine:** `🟢 ACTIVE` / `🔴 PAUSED`
  - 🖼️ **NFT Sniping Agent:** `🟢 ACTIVE` / `🔴 PAUSED`
  - 🎯 **Polymarket Agent:** `🟢 ACTIVE` / `🔴 PAUSED`
- **Section 3: Active Wallet & Price Alerts Summary**
  - Active Price Alerts Count: `X`
  - Wallet Balances: SOL & ETH summary

### B. Interactive Action Buttons (`ActionRowBuilder<ButtonBuilder>`)
- **Row 1 (Master Toggles):**
  - `[▶️ START ALL AGENTS]` (Success / Green)
  - `[⏸️ PAUSE ALL AGENTS]` (Secondary / Grey)
  - `[🛑 EMERGENCY STOP]` (Danger / Red)
- **Row 2 (Quick Actions):**
  - `[🔑 WALLET BALANCES]` (Secondary)
  - `[🔔 ACTIVE PRICE ALERTS]` (Secondary)
  - `[🔄 REFRESH DASHBOARD]` (Primary / Blue)

### C. Dropdown Select Menu (`StringSelectMenuBuilder`)
- Custom ID: `select_toggle_agent`
- Options:
  - 🐣 `Solana Meme Agent`
  - 🔷 `EVM Meme Agent`
  - 📈 `Perpetual Futures Agent`
  - 💧 `Trade+LP Velocity Engine`
  - 🖼️ `NFT Sniping Agent`
  - 🎯 `Polymarket Prediction Agent`
- **Action:** Selecting an agent toggles its `START` / `STOP` screening loop instantly and updates the menu embed live.

---

## 3. Command Integration

- Slash Command: `/menu` & `/dashboard`
- Automatic welcome menu posted to `#athena-control-room` upon bot startup / channel bootstrap.

---

## 4. File Layout

```
src/
├── discord/
│   ├── commands/index.ts              # [MODIFY] Register /menu and /dashboard slash commands
│   ├── embeds/
│   │   └── dashboard-embed.ts         # [NEW] Builder for Rich Dashboard Embed & Action Rows
│   └── handlers/
│       └── interaction-handler.ts     # [MODIFY] Handle /menu, button clicks, and select dropdowns
└── index.ts                           # [MODIFY] Post welcome dashboard on bot ready
```
