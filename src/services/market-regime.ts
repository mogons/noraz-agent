/**
 * Opencatz AI - Market Regime Classifier & Strategy Filter (MarketRegimeFilter)
 * Evaluates current market condition on Robinhood Chain using volatility & price metrics.
 * Categorizes macro market state (TRENDING_BULL, TRENDING_BEAR, SIDEWAYS_CHOP, EXTREME_VOLATILITY)
 * to adjust sub-agent strategy behaviors automatically.
 */

export type MarketRegimeType = 'TRENDING_BULL' | 'TRENDING_BEAR' | 'SIDEWAYS_CHOP' | 'EXTREME_VOLATILITY';

export interface MarketRegimeStatus {
  regime: MarketRegimeType;
  btc24hChangePercent: number;
  eth24hChangePercent: number;
  volatilityIndex: number; // 0 - 100
  recommendedAction: string;
}

export class MarketRegimeFilter {
  private currentRegime: MarketRegimeStatus = {
    regime: 'SIDEWAYS_CHOP',
    btc24hChangePercent: 0,
    eth24hChangePercent: 0,
    volatilityIndex: 0,
    recommendedAction: 'Awaiting live market data.',
  };

  /**
   * Update regime using price change and volatility input
   */
  public updateMarketRegime(btc24h: number, eth24h: number, volatilityIdx: number): MarketRegimeStatus {
    let regime: MarketRegimeType = 'SIDEWAYS_CHOP';
    let recommendedAction = 'Standard risk parameters active.';

    if (volatilityIdx >= 80) {
      regime = 'EXTREME_VOLATILITY';
      recommendedAction = '⚠️ Extreme volatility: Reduce position sizing by 50% and widen LP tick ranges.';
    } else if (btc24h > 3.0 && eth24h > 3.0) {
      regime = 'TRENDING_BULL';
      recommendedAction = '🟢 Strong bullish momentum: Spot meme plays and trend-following entries active.';
    } else if (btc24h < -3.0 && eth24h < -3.0) {
      regime = 'TRENDING_BEAR';
      recommendedAction = '🔴 Bearish trend: Tighten stop-losses and prioritize defensive exits.';
    } else {
      regime = 'SIDEWAYS_CHOP';
      recommendedAction = '🟡 Sideways chop: Pause aggressive entries; favor LP range strategies.';
    }

    this.currentRegime = {
      regime,
      btc24hChangePercent: btc24h,
      eth24hChangePercent: eth24h,
      volatilityIndex: volatilityIdx,
      recommendedAction,
    };

    return this.currentRegime;
  }

  public getRegime(): MarketRegimeStatus {
    return this.currentRegime;
  }

  /**
   * Returns whether a strategy domain should be paused under current market regime
   */
  public isDomainAllowedInCurrentRegime(domain: string): boolean {
    if (this.currentRegime.regime === 'EXTREME_VOLATILITY') {
      // Pause high-risk domains during extreme panic/spike
      if (domain === 'MEME_ROBINHOOD') return false;
    }
    if (this.currentRegime.regime === 'SIDEWAYS_CHOP') {
      // Discourage aggressive trend-following in chop
      if (domain === 'MEME_ROBINHOOD') return false;
    }
    return true;
  }
}

export const globalMarketRegimeFilter = new MarketRegimeFilter();
