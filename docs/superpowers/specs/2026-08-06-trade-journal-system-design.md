# Trade Journaling & Analytics Engine (`trade-journal-service.ts`) - Design Spec

**Date:** 2026-08-06  
**Project:** Athena Multi-Agent Crypto Intelligence System  
**Status:** Approved Specification  

---

## 1. Overview

The **Athena Trade Journaling & Analytics Engine** (`src/services/trade-journal-service.ts`) automatically logs every trade execution, signal call, take-profit/stop-loss exit, and manual order across all 8 sub-agent domains (Solana, EVM, Perps, LP, NFT, and Polymarket).

It powers real-time PnL performance tracking, win-rate analytics, CSV/Markdown report exports, and natural language trade diagnostics in `#athena-control-room`.

---

## 2. Core Trade Journal Data Model

```typescript
export interface TradeJournalEntry {
  id: string;
  domain: 'MEME_SOLANA' | 'MEME_EVM' | 'PERPS' | 'LP_VELOCITY' | 'NFT_SNIPING' | 'PREDICTION';
  symbol: string;
  contractAddressOrId: string;
  chain: string;
  entryTimestamp: string;
  exitTimestamp?: string;
  entryPriceUsdOrEth: number;
  exitPriceUsdOrEth?: number;
  positionSizeUsd: number;
  realizedPnlUsd?: number;
  realizedPnlPct?: number;
  swarmScore: number;
  strategyUsed: string;
  aiThesisSummary: string;
  status: 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_MANUAL' | 'OUT_OF_RANGE';
  exitReason?: string;
}

export interface JournalSummaryStats {
  totalTrades: number;
  openTradesCount: number;
  winCount: number;
  lossCount: number;
  winRatePct: number;
  totalRealizedPnlUsd: number;
  bestTradeUsd: number;
  worstTradeUsd: number;
  avgProfitPerTradeUsd: number;
}
```

---

## 3. Key Journaling Features

1. 📥 **Automated Silent Logging:**
   - Every simulated or live order placed by `PositionManager` or triggered by action buttons auto-creates an `OPEN` journal entry.
   - When TP, SL, or manual exit is hit, the entry auto-calculates `realizedPnlUsd` & `realizedPnlPct` and marks status `CLOSED`.

2. 📊 **Discord `/journal` Commands:**
   - `/journal summary`: Displays Win-Rate %, Total PnL, Win/Loss Streak, and Domain Performance breakdown.
   - `/journal history`: Lists recent 10 trades with status badges (`🟢 +120% TP1`, `🔴 -20% SL`).
   - `/journal export`: Generates a downloadable `athena_trade_journal.csv` file for Excel or Notion.

3. 💬 **Natural Language AI Trade Audit in Chat:**
   - User can ask in `#athena-control-room`: *"Athena, berapa win rate minggu ini?"* or *"Trade mana yang paling untung kemarin?"*.
   - Athena AI queries `TradeJournalService` and generates an executive summary!

---

## 4. File Layout

```
src/
├── services/
│   └── trade-journal-service.ts       # [NEW] Trade Journaling & Analytics Engine
├── discord/
│   ├── commands/index.ts              # [MODIFY] Register /journal slash command
│   └── handlers/interaction-handler.ts# [MODIFY] Handle /journal subcommands
└── index.ts                           # [MODIFY] Register TradeJournalService
```
