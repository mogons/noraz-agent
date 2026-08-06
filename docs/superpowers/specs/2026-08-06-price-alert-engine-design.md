# Custom Price Alert Engine & System Self-Awareness (`price-alert-service.ts`) - Design Spec

**Date:** 2026-08-06  
**Project:** Athena Multi-Agent Crypto Intelligence System  
**Status:** Approved Specification  

---

## 1. Overview

This specification covers two key capabilities:
1. **Custom Price Alert Engine** (`src/services/price-alert-service.ts`): Enables users to set real-time price triggers via Discord Slash Command (`/alert`) or Natural Language chat in `#athena-control-room` (e.g. *"Athena, kabari kalau BTC nyentuh 70k"*).
2. **System Architecture Self-Awareness** (`src/discord/handlers/message-handler.ts`): Embeds complete self-knowledge of Athena's multi-agent architecture, Swarm Consensus 3-layer filters, active screening sub-agents, and risk parameters into Athena's Control Room system prompt so Athena can answer any architectural or operational query from the user.

---

## 2. Core Components & Data Structures

### A. Price Alert Interface
```typescript
export interface PriceAlert {
  id: string;
  userId: string;
  symbol: string;         // e.g. "BTC", "ETH", "SOL", "HYPE"
  targetPriceUsd: number;
  direction: 'ABOVE' | 'BELOW';
  channelId?: string;
  createdTime: number;
  triggered: boolean;
}
```

### B. Price Alert Service (`src/services/price-alert-service.ts`)
- **`addAlert(alert)`**: Stores active price alert target in memory / persistent state.
- **`listAlerts(userId?)`**: Returns active non-triggered alerts.
- **`removeAlert(id)`**: Cancels pending price alert.
- **`checkAlerts(priceFeedService)`**: Polls current asset prices from `PriceFeedService` against active alert targets. Returns array of triggered alerts.
- **`parseNaturalLanguageAlert(text, userId, channelId)`**: Extracts asset symbol, target price, and direction (`ABOVE` / `BELOW`) from natural language queries (e.g. *"kabari kalau BTC 70k"*).

---

## 3. System Architecture Self-Awareness Context

In `handleControlRoomMessage` (`src/discord/handlers/message-handler.ts`), Athena's system prompt will include structured knowledge of:
- **Core Hub Agent (`#athena-control-room`)**: Portfolio tracking, global risk engine, order execution, natural language trade audits.
- **Swarm Consensus Engine**: 3-Layer Filter (Quant & Liquidity, Catalyst & Hype, Security Audit) requiring `>= 80% Confidence Score`.
- **Active Specialist Sub-Agents**:
  - `Solana Meme Agent`: Pump.fun, Raydium, CTO/Revival volume spikes.
  - `EVM Meme Agent`: Base, Ethereum Mainnet, Robinhood L2 DEX tokens.
  - `Perpetuals Futures Agent`: Hyperliquid & CEX technical setups (EMA, RSI, MACD, 5-Role Swarm).
  - `Trade + LP Velocity Engine`: Meteora DLMM & Uniswap v3 aggressive fee harvesting (>5% Fee/TVL 4h, >150% Vol/TVL 4h, >6x Active Velocity).
  - `NFT Sniping Agent`: OpenSea floor price & rarity alerts.
- **Risk Engine Parameters**: Default 10x leverage, max 5% daily portfolio drawdown circuit breaker.

---

## 4. Discord Command & Chat Interface

1. **Slash Command (`/alert`)**:
   - `/alert set <symbol> <price> <direction>`
   - `/alert list`
   - `/alert cancel <id>`

2. **Natural Language Parser in `#athena-control-room` (`handleControlRoomMessage`)**:
   - Automatically detects alert requests like *"kabari kalau BTC nyentuh 70k"*, *"alert me if ETH drops to 1500"*, or *"notify if SOL reaches 100"*.
   - Immediately replies with confirmation embed and registers the alert.

3. **Background Notification Loop (`src/index.ts`)**:
   - Polling interval (every 60s) checking prices.
   - When target is hit, broadcasts:
     > 🔔 **ATHENA PRICE ALERT TRIGGERED!**  
     > 📈 **Asset:** `BTC/USDT`  
     > 💵 **Target Price Hit:** `$70,000 USD` (Current Price: `$70,085 USD`)  
     > 👤 **User:** <@userId>

---

## 5. File Layout

```
src/
├── services/
│   └── price-alert-service.ts         # [NEW] Price Alert Management & NL Parser
├── discord/
│   ├── commands/index.ts              # [MODIFY] Add /alert Slash Command
│   └── handlers/
│       ├── interaction-handler.ts     # [MODIFY] Handle /alert subcommands
│       └── message-handler.ts         # [MODIFY] Hook NL alert parser & self-awareness prompt
└── index.ts                           # [MODIFY] Initialize PriceAlertService loop
```
