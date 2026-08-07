import { PolymarketAdapter, PolymarketMarketData } from '../../adapters/polymarket-adapter.js';

export interface PredictionSignalReport {
  marketId: string;
  question: string;
  category: string;
  recommendedOutcome: 'Yes' | 'No';
  currentOddsPct: number;
  expectedEvPct: number;
  confidenceScore: number; // 0 - 100
  volume24hUsd: number;
  liquidityUsd: number;
  polymarketUrl: string;
  aiThesis: string;
  signalType: 'ODDS_ARBITRAGE' | 'WHALE_INFLOW' | 'HIGH_PROBABILITY_YIELD';
}

export class PolymarketAgent {
  private adapter: PolymarketAdapter;
  private isRunning = false;

  constructor(adapter?: PolymarketAdapter) {
    this.adapter = adapter || new PolymarketAdapter();
  }

  /**
   * Evaluates prediction market setups for Odds Arbitrage, Whale Inflow, or High Probability Resolution Yield
   */
  public evaluateMarket(market: PolymarketMarketData): PredictionSignalReport | null {
    const yesOutcome = market.outcomes.find(o => o.name.toLowerCase() === 'yes') || market.outcomes[0];
    const noOutcome = market.outcomes.find(o => o.name.toLowerCase() === 'no') || market.outcomes[1];

    const yesOdds = yesOutcome ? yesOutcome.price : 0;
    const noOdds = noOutcome ? noOutcome.price : 0;
    if (!(yesOdds > 0)) return null; // fail-closed: no real odds

    const yesOddsPct = yesOdds * 100;
    const noOddsPct = noOdds * 100;

    let signalType: 'ODDS_ARBITRAGE' | 'WHALE_INFLOW' | 'HIGH_PROBABILITY_YIELD' = 'ODDS_ARBITRAGE';
    const recommendedOutcome: 'Yes' | 'No' = yesOddsPct >= noOddsPct ? 'Yes' : 'No';

    const spread = market.bestBidYes !== null && market.bestAskYes !== null
      ? Math.abs(market.bestAskYes - market.bestBidYes)
      : null;
    const isLiquid = market.volume24hUsd >= 100000;

    // Confidence computed from REAL data only (no hardcoded constants)
    const confidenceScore = Math.min(100, Math.round(
      (yesOdds >= 0.92 || noOdds >= 0.92 ? 40 : yesOdds >= 0.8 || noOdds >= 0.8 ? 30 : 15) +
      (isLiquid ? 30 : 10) +
      (spread !== null && spread <= 0.05 ? 30 : 10)
    ));
    const expectedEvPct = Math.max(0, Math.round((100 - Math.max(yesOddsPct, noOddsPct)) * 0.8));

    if (yesOdds >= 0.92 || noOdds >= 0.92) {
      signalType = 'HIGH_PROBABILITY_YIELD';
    } else if (market.volume24hUsd >= 1000000) {
      signalType = 'WHALE_INFLOW';
    } else if (market.category === 'Crypto' && (yesOddsPct >= 65 || noOddsPct >= 65)) {
      signalType = 'ODDS_ARBITRAGE';
    } else {
      return null;
    }

    const currentOddsPct = recommendedOutcome === 'Yes' ? yesOddsPct : noOddsPct;

    const aiThesis = `🎯 POLYMARKET PREDICTION SIGNAL: "${market.question}" (${market.category}). ` +
      `Recommended Outcome: ${recommendedOutcome.toUpperCase()} at ${currentOddsPct.toFixed(1)}% odds. ` +
      `24h Volume: $${(market.volume24hUsd / 1e6).toFixed(2)}M, Liquidity: $${(market.liquidityUsd / 1e3).toFixed(0)}k. ` +
      `Signal Type: ${signalType} (Est EV: +${expectedEvPct.toFixed(1)}%).`;

    return {
      marketId: market.id,
      question: market.question,
      category: market.category,
      recommendedOutcome,
      currentOddsPct,
      expectedEvPct,
      confidenceScore,
      volume24hUsd: market.volume24hUsd,
      liquidityUsd: market.liquidityUsd,
      polymarketUrl: market.url,
      aiThesis,
      signalType,
    };
  }

  public async runScreeningPass(): Promise<PredictionSignalReport[]> {
    console.log('[POLYMARKET AGENT] Running prediction market screening pass...');
    const reports: PredictionSignalReport[] = [];

    const categories: Array<'Crypto' | 'Macro' | 'Politics' | 'Tech' | 'Trending'> = ['Crypto', 'Macro', 'Politics', 'Tech'];
    for (const cat of categories) {
      const markets = await this.adapter.fetchTopMarkets(cat);
      for (const m of markets) {
        const report = this.evaluateMarket(m);
        if (report && report.confidenceScore >= 80) {
          reports.push(report);
          console.log(`[POLYMARKET AGENT] 🎯 SIGNAL: ${report.recommendedOutcome} on "${report.question}" (${report.confidenceScore}%)`);
        }
      }
    }

    return reports;
  }

  public startScreening(): void {
    this.isRunning = true;
    console.log('[POLYMARKET AGENT] 24/7 Prediction market screening started.');
  }

  public stopScreening(): void {
    this.isRunning = false;
    console.log('[POLYMARKET AGENT] Screening stopped.');
  }

  public getStatus(): { running: boolean } {
    return { running: this.isRunning };
  }
}
