/**
 * Athena 2.0 - Historical Strategy Backtester Engine (BacktesterEngine)
 * Simulates signal candidates against historical price candles & liquidity logs to calibrate TP/SL and win rates.
 */

import { SignalCandidate } from '../orchestrator/swarm-consensus.js';
import { globalRiskEngineV2 } from '../orchestrator/risk-engine-v2.js';

export interface HistoricalCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestResult {
  symbol: string;
  domain: string;
  entryPrice: number;
  exitPrice: number;
  pnlPercent: number;
  isWin: boolean;
  hitTarget: 'TP' | 'SL' | 'EXPIRED';
  durationMinutes: number;
}

export class BacktesterEngine {
  /**
   * Run backtest simulation on historical candles for a proposed signal
   */
  public runBacktest(
    signal: SignalCandidate,
    entryPrice: number,
    candles: HistoricalCandle[],
    targetTpPercent = 50,
    targetSlPercent = 20
  ): BacktestResult {
    const tpPrice = entryPrice * (1 + targetTpPercent / 100);
    const slPrice = entryPrice * (1 - targetSlPercent / 100);

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];

      // Check Take Profit hit
      if (candle.high >= tpPrice) {
        return {
          symbol: signal.symbol,
          domain: signal.domain,
          entryPrice,
          exitPrice: tpPrice,
          pnlPercent: targetTpPercent,
          isWin: true,
          hitTarget: 'TP',
          durationMinutes: i + 1,
        };
      }

      // Check Stop Loss hit
      if (candle.low <= slPrice) {
        return {
          symbol: signal.symbol,
          domain: signal.domain,
          entryPrice,
          exitPrice: slPrice,
          pnlPercent: -targetSlPercent,
          isWin: false,
          hitTarget: 'SL',
          durationMinutes: i + 1,
        };
      }
    }

    // Default exit at last available candle
    const lastPrice = candles[candles.length - 1]?.close || entryPrice;
    const pnlPercent = ((lastPrice - entryPrice) / entryPrice) * 100;

    return {
      symbol: signal.symbol,
      domain: signal.domain,
      entryPrice,
      exitPrice: lastPrice,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      isWin: pnlPercent > 0,
      hitTarget: 'EXPIRED',
      durationMinutes: candles.length,
    };
  }
}

export const globalBacktesterEngine = new BacktesterEngine();
