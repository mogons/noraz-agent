/**
 * Opencatz AI - Advanced 9-Lives Risk Engine & Circuit Breaker (RiskEngineV2)
 * Handles per-asset/chain exposure caps, correlation checks, volatility sizing, and real-time kill-switch.
 */

export interface PositionRiskCheck {
  assetSymbol: string;
  chain: string;
  usdValue: number;
  tags?: string[]; // e.g. ['meme', 'ai', 'robinhood']
  volatilityAtr?: number;
}

export interface RiskEngineConfig {
  maxPortfolioDrawdownPercent: number; // default 5%
  maxSingleAssetExposurePercent: number; // default 10%
  maxSingleChainExposurePercent: number; // default 40%
  maxCorrelatedPositionsCount: number; // default 3
  maxConsecutiveLossesBeforeKill: number; // default 3
  killSwitchCooldownMinutes: number; // default 60
}

export interface RiskEvaluationResult {
  allowed: boolean;
  reason?: string;
  recommendedPositionSizeUsd?: number;
}

export class RiskEngineV2 {
  private config: RiskEngineConfig;
  private isKillSwitchActive = false;
  private killSwitchActivatedAt: number | null = null;
  private consecutiveLossesCount = 0;

  constructor(config?: Partial<RiskEngineConfig>) {
    this.config = {
      maxPortfolioDrawdownPercent: 50, // Updated to 50% max daily drawdown
      maxSingleAssetExposurePercent: 10,
      maxSingleChainExposurePercent: 40,
      maxCorrelatedPositionsCount: 3,
      maxConsecutiveLossesBeforeKill: 5,
      killSwitchCooldownMinutes: 60,
      ...config,
    };
  }

  /**
   * Evaluate a proposed new position entry against multi-layer risk policies
   */
  public evaluateTradeRisk(
    proposed: PositionRiskCheck,
    portfolioTotalUsd: number,
    existingPositions: PositionRiskCheck[],
    currentDrawdownPercent: number
  ): RiskEvaluationResult {
    // 1. Check Circuit Breaker Kill-Switch Status
    if (this.checkKillSwitchStatus()) {
      return {
        allowed: false,
        reason: '⛔ Emergency Kill-Switch active due to repeated loss or severe drawdown.',
      };
    }

    // 2. Global Portfolio Drawdown Check
    if (currentDrawdownPercent >= this.config.maxPortfolioDrawdownPercent) {
      this.activateKillSwitch(`Global portfolio drawdown limit exceeded (${currentDrawdownPercent.toFixed(1)}% >= ${this.config.maxPortfolioDrawdownPercent}%)`);
      return {
        allowed: false,
        reason: `⛔ Portfolio drawdown threshold breached (${currentDrawdownPercent.toFixed(1)}%). Trading locked.`,
      };
    }

    // 3. Single Asset Exposure Cap Check
    const existingAssetUsd = existingPositions
      .filter((p) => p.assetSymbol.toUpperCase() === proposed.assetSymbol.toUpperCase())
      .reduce((sum, p) => sum + p.usdValue, 0);

    const totalAssetExposurePercent = ((existingAssetUsd + proposed.usdValue) / Math.max(portfolioTotalUsd, 1)) * 100;
    if (totalAssetExposurePercent > this.config.maxSingleAssetExposurePercent) {
      const maxAllowedUsd = (portfolioTotalUsd * this.config.maxSingleAssetExposurePercent) / 100 - existingAssetUsd;
      return {
        allowed: false,
        reason: `⚠️ Exposure cap for ${proposed.assetSymbol} exceeded (${totalAssetExposurePercent.toFixed(1)}% > ${this.config.maxSingleAssetExposurePercent}% max).`,
        recommendedPositionSizeUsd: Math.max(0, maxAllowedUsd),
      };
    }

    // 4. Single Chain Exposure Cap Check
    const existingChainUsd = existingPositions
      .filter((p) => p.chain.toLowerCase() === proposed.chain.toLowerCase())
      .reduce((sum, p) => sum + p.usdValue, 0);

    const totalChainExposurePercent = ((existingChainUsd + proposed.usdValue) / Math.max(portfolioTotalUsd, 1)) * 100;
    if (totalChainExposurePercent > this.config.maxSingleChainExposurePercent) {
      return {
        allowed: false,
        reason: `⚠️ Chain exposure cap for ${proposed.chain} exceeded (${totalChainExposurePercent.toFixed(1)}% > ${this.config.maxSingleChainExposurePercent}% max).`,
      };
    }

    // 5. Narrative / Correlation Risk Check
    if (proposed.tags && proposed.tags.length > 0) {
      const correlatedCount = existingPositions.filter((pos) => {
        if (!pos.tags) return false;
        return pos.tags.some((tag) => proposed.tags?.includes(tag));
      }).length;

      if (correlatedCount >= this.config.maxCorrelatedPositionsCount) {
        return {
          allowed: false,
          reason: `⚠️ Correlation risk cap hit (${correlatedCount} correlated positions open in tags: [${proposed.tags.join(', ')}]).`,
        };
      }
    }

    // 6. Volatility-Adjusted Sizing Calculation (Kelly / ATR sizing)
    let recommendedUsd = proposed.usdValue;
    if (proposed.volatilityAtr && proposed.volatilityAtr > 0) {
      // Scale size inversely to ATR volatility
      const baseAtr = 0.05; // 5% baseline ATR
      const volMultiplier = Math.min(2.0, Math.max(0.25, baseAtr / proposed.volatilityAtr));
      recommendedUsd = Math.round(proposed.usdValue * volMultiplier);
    }

    return {
      allowed: true,
      recommendedPositionSizeUsd: recommendedUsd,
    };
  }

  /**
   * Record trade completion result to update consecutive loss counter
   */
  public recordTradeOutcome(isProfit: boolean): void {
    if (isProfit) {
      this.consecutiveLossesCount = 0;
    } else {
      this.consecutiveLossesCount++;
      if (this.consecutiveLossesCount >= this.config.maxConsecutiveLossesBeforeKill) {
        this.activateKillSwitch(`${this.consecutiveLossesCount} consecutive trade losses recorded.`);
      }
    }
  }

  /**
   * Manually or automatically activate the Kill Switch
   */
  public activateKillSwitch(reason: string): void {
    this.isKillSwitchActive = true;
    this.killSwitchActivatedAt = Date.now();
    console.error(`🚨 OPENCATZ 9-LIVES RISK ENGINE: Emergency Kill Switch Activated! Reason: ${reason}`);
  }

  /**
   * Reset Kill Switch status
   */
  public resetKillSwitch(): void {
    this.isKillSwitchActive = false;
    this.killSwitchActivatedAt = null;
    this.consecutiveLossesCount = 0;
    console.log(`✅ OPENCATZ 9-LIVES RISK ENGINE: Kill Switch manually reset.`);
  }

  /**
   * Check if Kill Switch is active, handling auto-cooldown expiration
   */
  public checkKillSwitchStatus(): boolean {
    if (!this.isKillSwitchActive) return false;

    if (this.killSwitchActivatedAt) {
      const elapsedMinutes = (Date.now() - this.killSwitchActivatedAt) / (1000 * 60);
      if (elapsedMinutes >= this.config.killSwitchCooldownMinutes) {
        this.resetKillSwitch();
        return false;
      }
    }
    return true;
  }
}

export const globalRiskEngineV2 = new RiskEngineV2();
