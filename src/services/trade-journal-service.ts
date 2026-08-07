import { StateStore } from './state-store.js';

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

export class TradeJournalService {
  private entries: Map<string, TradeJournalEntry> = new Map();
  private stateStore: StateStore | null = null;

  constructor() {
    // Journal starts empty — only real trades are recorded.
  }

  /**
   * Attach persistent StateStore. Loads existing journal entries from disk.
   */
  public attachStateStore(store: StateStore): void {
    this.stateStore = store;

    const persisted = store.getAllJournalEntries();
    if (persisted.length > 0) {
      this.entries.clear();
      for (const entry of persisted) {
        this.entries.set(entry.id, entry);
      }
      console.log(`[TRADE JOURNAL] Restored ${persisted.length} journal entries from persistent state.`);
    }
  }

  public recordTradeEntry(entry: TradeJournalEntry): TradeJournalEntry {
    this.entries.set(entry.id, entry);
    this.stateStore?.setJournalEntry(entry);
    console.log(`[TRADE JOURNAL] Logged new trade entry: ${entry.symbol} (${entry.domain}) - Status: ${entry.status}`);
    return entry;
  }

  public closeTrade(
    id: string,
    exitPriceUsdOrEth: number,
    status: 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_MANUAL' | 'OUT_OF_RANGE',
    exitReason?: string
  ): TradeJournalEntry | null {
    const trade = this.entries.get(id);
    if (!trade) return null;

    trade.exitPriceUsdOrEth = exitPriceUsdOrEth;
    trade.exitTimestamp = new Date().toISOString();
    trade.status = status;
    trade.exitReason = exitReason || `Closed with status: ${status}`;

    const priceChangePct = ((exitPriceUsdOrEth - trade.entryPriceUsdOrEth) / trade.entryPriceUsdOrEth) * 100;
    trade.realizedPnlPct = priceChangePct;
    trade.realizedPnlUsd = (trade.positionSizeUsd * priceChangePct) / 100;

    this.entries.set(id, trade);
    this.stateStore?.setJournalEntry(trade);
    console.log(`[TRADE JOURNAL] Closed trade ${trade.symbol} | PnL: ${trade.realizedPnlPct.toFixed(1)}% ($${trade.realizedPnlUsd.toFixed(2)} USD)`);
    return trade;
  }

  public listTrades(domain?: string): TradeJournalEntry[] {
    const all = Array.from(this.entries.values());
    if (domain) {
      return all.filter(t => t.domain.toLowerCase() === domain.toLowerCase());
    }
    return all.sort((a, b) => new Date(b.entryTimestamp).getTime() - new Date(a.entryTimestamp).getTime());
  }

  /**
   * Close every OPEN journal entry matching a contract address / id (e.g. when the
   * wallet-tracker auto-closes a position that is no longer held). Returns the
   * number of entries closed.
   */
  public closeByContractAddressOrId(
    contractAddressOrId: string,
    exitPriceUsdOrEth: number,
    status: 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_MANUAL' | 'OUT_OF_RANGE',
    exitReason?: string
  ): number {
    let closed = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === 'OPEN' && entry.contractAddressOrId.toLowerCase() === contractAddressOrId.toLowerCase()) {
        this.closeTrade(entry.id, exitPriceUsdOrEth, status, exitReason);
        closed++;
      }
    }
    return closed;
  }

  public getSummaryStats(): JournalSummaryStats {
    const trades = Array.from(this.entries.values());
    const closed = trades.filter(t => t.status !== 'OPEN' && t.realizedPnlUsd !== undefined);

    let winCount = 0;
    let lossCount = 0;
    let totalRealizedPnlUsd = 0;
    let bestTradeUsd = 0;
    let worstTradeUsd = 0;

    for (const t of closed) {
      const pnl = t.realizedPnlUsd || 0;
      totalRealizedPnlUsd += pnl;
      if (pnl > 0) winCount++;
      if (pnl < 0) lossCount++;
      if (pnl > bestTradeUsd) bestTradeUsd = pnl;
      if (pnl < worstTradeUsd) worstTradeUsd = pnl;
    }

    const totalClosed = closed.length;
    const winRatePct = totalClosed > 0 ? (winCount / totalClosed) * 100 : 0;
    const avgProfitPerTradeUsd = totalClosed > 0 ? totalRealizedPnlUsd / totalClosed : 0;

    return {
      totalTrades: trades.length,
      openTradesCount: trades.length - totalClosed,
      winCount,
      lossCount,
      winRatePct,
      totalRealizedPnlUsd,
      bestTradeUsd,
      worstTradeUsd,
      avgProfitPerTradeUsd,
    };
  }

  public exportCsv(): string {
    const trades = this.listTrades();
    const headers = [
      'ID',
      'Domain',
      'Symbol',
      'Chain',
      'Status',
      'Entry Time',
      'Exit Time',
      'Entry Price',
      'Exit Price',
      'Position Size USD',
      'Realized PnL USD',
      'Realized PnL %',
      'Swarm Score',
      'Strategy',
      'Exit Reason',
    ];

    const rows = trades.map(t => [
      t.id,
      t.domain,
      t.symbol,
      t.chain,
      t.status,
      t.entryTimestamp,
      t.exitTimestamp || '',
      t.entryPriceUsdOrEth,
      t.exitPriceUsdOrEth || '',
      t.positionSizeUsd,
      t.realizedPnlUsd !== undefined ? t.realizedPnlUsd.toFixed(2) : '',
      t.realizedPnlPct !== undefined ? t.realizedPnlPct.toFixed(2) : '',
      t.swarmScore,
      `"${t.strategyUsed.replace(/"/g, '""')}"`,
      `"${(t.exitReason || '').replace(/"/g, '""')}"`,
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}
