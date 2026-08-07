import { OpenPosition } from '../position/position-manager.js';

export interface RiskLimits {
  maxPortfolioDrawdownPercent: number;
  maxTradeAmountUsd: number;
  stopTradingOnDrawdown: boolean;
  maxSectorExposurePercent: number;      // Max % portfolio in any single asset
  maxCorrelatedPositions: number;         // Max open positions on same underlying
  maxLpExposurePerTokenPercent: number;   // Max % portfolio in LP for one token
}

export interface CorrelationCheckResult {
  allowed: boolean;
  reason?: string;
  existingCount: number;
  existingExposureUsd: number;
}

export class RiskManager {
  private limits: RiskLimits;
  private currentDailyDrawdownPercent: number = 0;
  private tradingPaused: boolean = false;

  constructor(customLimits?: Partial<RiskLimits>) {
    this.limits = {
      maxPortfolioDrawdownPercent: 50.0,
      maxTradeAmountUsd: 500,
      stopTradingOnDrawdown: true,
      maxSectorExposurePercent: 30.0,      // Max 30% portfolio in one asset
      maxCorrelatedPositions: 3,            // Max 3 strategies on same asset
      maxLpExposurePerTokenPercent: 50.0,   // Max 50% portfolio in LP for one token
      ...customLimits,
    };
  }

  public isTradeAllowed(amountUsd: number): { allowed: boolean; reason?: string } {
    if (this.tradingPaused) {
      return { allowed: false, reason: 'Trading is globally paused due to risk control limit trigger.' };
    }

    if (amountUsd > this.limits.maxTradeAmountUsd) {
      return {
        allowed: false,
        reason: `Trade amount $${amountUsd} exceeds max allowed trade size of $${this.limits.maxTradeAmountUsd}.`,
      };
    }

    if (this.currentDailyDrawdownPercent >= this.limits.maxPortfolioDrawdownPercent) {
      this.tradingPaused = true;
      return {
        allowed: false,
        reason: `Daily portfolio drawdown (${this.currentDailyDrawdownPercent}%) reached max limit (${this.limits.maxPortfolioDrawdownPercent}%). Automatically locking trading.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Cross-Strategy Correlation Risk Guard (Phase 3)
   * Prevents portfolio blow-up from multiple strategies accumulating the same asset.
   * Checks:
   * 1. How many existing open positions share the same underlying symbol/contract
   * 2. Total exposure in USD to that symbol across all strategies
   */
  public checkCorrelationRisk(
    symbol: string,
    newPositionSizeUsd: number,
    activePositions: OpenPosition[],
    totalPortfolioUsd: number
  ): CorrelationCheckResult {
    const symbolUpper = symbol.toUpperCase();

    // Count existing positions on same symbol across all strategies
    const correlatedPositions = activePositions.filter(
      p => p.symbol.toUpperCase() === symbolUpper
    );
    const existingCount = correlatedPositions.length;
    const existingExposureUsd = correlatedPositions.reduce(
      (sum, p) => sum + (p.currentPriceUsd * p.amount),
      0
    );

    // Check 1: Max correlated positions (e.g., 3 strategies all long SOL)
    if (existingCount >= this.limits.maxCorrelatedPositions) {
      return {
        allowed: false,
        reason: `🚫 **Correlation Risk Block:** Already ${existingCount} open positions on $${symbolUpper} across different strategies (max: ${this.limits.maxCorrelatedPositions}). Adding more increases concentrated blow-up risk.`,
        existingCount,
        existingExposureUsd,
      };
    }

    // Check 2: Sector exposure cap (total exposure to one asset vs portfolio)
    if (totalPortfolioUsd > 0) {
      const totalExposureAfter = existingExposureUsd + newPositionSizeUsd;
      const exposurePercent = (totalExposureAfter / totalPortfolioUsd) * 100;

      if (exposurePercent > this.limits.maxSectorExposurePercent) {
        return {
          allowed: false,
          reason: `🚫 **Sector Exposure Cap Hit:** Total $${symbolUpper} exposure would reach ${exposurePercent.toFixed(1)}% of portfolio ($${totalExposureAfter.toFixed(0)} / $${totalPortfolioUsd.toFixed(0)}). Max allowed: ${this.limits.maxSectorExposurePercent}%.`,
          existingCount,
          existingExposureUsd,
        };
      }
    }

    return {
      allowed: true,
      existingCount,
      existingExposureUsd,
    };
  }

  public updateDrawdown(drawdownPercent: number): void {
    this.currentDailyDrawdownPercent = drawdownPercent;
    if (drawdownPercent >= this.limits.maxPortfolioDrawdownPercent && this.limits.stopTradingOnDrawdown) {
      this.tradingPaused = true;
      console.log(`[RISK MANAGER] 🛑 Circuit breaker triggered! Drawdown ${drawdownPercent.toFixed(1)}% >= ${this.limits.maxPortfolioDrawdownPercent}%. Trading PAUSED.`);
    }
  }

  public resetDailyDrawdown(): void {
    this.currentDailyDrawdownPercent = 0;
    this.tradingPaused = false;
  }

  public setDrawdownLimit(percent: number): void {
    this.limits.maxPortfolioDrawdownPercent = percent > 1 ? percent : percent * 100;
    console.log(`[RISK MANAGER] Updated Max Drawdown Limit to ${this.limits.maxPortfolioDrawdownPercent}%`);
  }

  public setMaxPositionSizeUsd(amountUsd: number): void {
    this.limits.maxTradeAmountUsd = amountUsd;
    console.log(`[RISK MANAGER] Updated Max Position Size to $${amountUsd}`);
  }

  public getRiskState() {
    return {
      paused: this.tradingPaused,
      currentDrawdownPct: this.currentDailyDrawdownPercent,
      maxDrawdownLimitPct: this.limits.maxPortfolioDrawdownPercent,
      maxPositionSizeUsd: this.limits.maxTradeAmountUsd,
      maxSectorExposurePercent: this.limits.maxSectorExposurePercent,
      maxCorrelatedPositions: this.limits.maxCorrelatedPositions,
    };
  }

  public getRiskStatus() {
    return {
      paused: this.tradingPaused,
      dailyDrawdown: `${this.currentDailyDrawdownPercent}%`,
      maxDrawdownLimit: `${this.limits.maxPortfolioDrawdownPercent}%`,
      maxTradeSizeUsd: `$${this.limits.maxTradeAmountUsd}`,
      maxSectorExposure: `${this.limits.maxSectorExposurePercent}%`,
      maxCorrelatedPositions: this.limits.maxCorrelatedPositions,
    };
  }
}
