export interface RiskLimits {
  maxPortfolioDrawdownPercent: number;
  maxTradeAmountUsd: number;
  stopTradingOnDrawdown: boolean;
}

export class RiskManager {
  private limits: RiskLimits;
  private currentDailyDrawdownPercent: number = 0;
  private tradingPaused: boolean = false;

  constructor(customLimits?: Partial<RiskLimits>) {
    this.limits = {
      maxPortfolioDrawdownPercent: 5.0,
      maxTradeAmountUsd: 500,
      stopTradingOnDrawdown: true,
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

  public getRiskStatus() {
    return {
      paused: this.tradingPaused,
      dailyDrawdown: `${this.currentDailyDrawdownPercent}%`,
      maxDrawdownLimit: `${this.limits.maxPortfolioDrawdownPercent}%`,
      maxTradeSizeUsd: `$${this.limits.maxTradeAmountUsd}`,
    };
  }
}
