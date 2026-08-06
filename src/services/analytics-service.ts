/**
 * Athena 2.0 - Post-Trade Analytics & Attribution Service (AnalyticsService)
 * Aggregates trade PnL, win-rates, gas fees vs gross profits, and agent attribution metrics.
 */

export interface TradePerformanceRecord {
  id: string;
  domain: string;
  chain: string;
  symbol: string;
  buyUsd: number;
  sellUsd: number;
  realizedPnlUsd: number;
  gasFeeUsd: number;
  confidenceScore: number;
  timestamp: string;
}

export interface PerformanceSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  totalGrossProfitUsd: number;
  totalGasFeesUsd: number;
  netProfitUsd: number;
  profitFactor: number;
  attributionByDomain: Record<string, { trades: number; netPnlUsd: number; winRate: number }>;
}

export class AnalyticsService {
  private records: TradePerformanceRecord[] = [];

  public recordTrade(record: TradePerformanceRecord): void {
    this.records.push(record);
  }

  public getSummary(): PerformanceSummary {
    const totalTrades = this.records.length;
    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRatePercent: 0,
        totalGrossProfitUsd: 0,
        totalGasFeesUsd: 0,
        netProfitUsd: 0,
        profitFactor: 0,
        attributionByDomain: {},
      };
    }

    let winningTrades = 0;
    let losingTrades = 0;
    let totalGrossProfitUsd = 0;
    let totalGrossLossUsd = 0;
    let totalGasFeesUsd = 0;
    const domainMap: Record<string, { trades: number; wins: number; netPnlUsd: number }> = {};

    this.records.forEach((r) => {
      totalGasFeesUsd += r.gasFeeUsd;
      const netPnl = r.realizedPnlUsd - r.gasFeeUsd;

      if (!domainMap[r.domain]) {
        domainMap[r.domain] = { trades: 0, wins: 0, netPnlUsd: 0 };
      }
      domainMap[r.domain].trades++;
      domainMap[r.domain].netPnlUsd += netPnl;

      if (r.realizedPnlUsd > 0) {
        winningTrades++;
        totalGrossProfitUsd += r.realizedPnlUsd;
        domainMap[r.domain].wins++;
      } else {
        losingTrades++;
        totalGrossLossUsd += Math.abs(r.realizedPnlUsd);
      }
    });

    const winRatePercent = (winningTrades / totalTrades) * 100;
    const netProfitUsd = totalGrossProfitUsd - totalGrossLossUsd - totalGasFeesUsd;
    const profitFactor = totalGrossLossUsd > 0 ? totalGrossProfitUsd / totalGrossLossUsd : totalGrossProfitUsd;

    const attributionByDomain: Record<string, { trades: number; netPnlUsd: number; winRate: number }> = {};
    Object.keys(domainMap).forEach((d) => {
      attributionByDomain[d] = {
        trades: domainMap[d].trades,
        netPnlUsd: Math.round(domainMap[d].netPnlUsd * 100) / 100,
        winRate: Math.round((domainMap[d].wins / domainMap[d].trades) * 100),
      };
    });

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRatePercent: Math.round(winRatePercent * 10) / 10,
      totalGrossProfitUsd: Math.round(totalGrossProfitUsd * 100) / 100,
      totalGasFeesUsd: Math.round(totalGasFeesUsd * 100) / 100,
      netProfitUsd: Math.round(netProfitUsd * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      attributionByDomain,
    };
  }
}

export const globalAnalyticsService = new AnalyticsService();
