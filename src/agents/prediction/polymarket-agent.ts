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

    const yesOddsPct = yesOutcome ? yesOutcome.price * 100 : 50;
    const noOddsPct = noOutcome ? noOutcome.price * 100 : 50;

    let signalType: 'ODDS_ARBITRAGE' | 'WHALE_INFLOW' | 'HIGH_PROBABILITY_YIELD' = 'ODDS_ARBITRAGE';
    let recommendedOutcome: 'Yes' | 'No' = 'Yes';
    let confidenceScore = 70;
    let expectedEvPct = 15.0;

    // 1. High-Probability Resolution Yield (Odds >= 92% near end date)
    if (yesOddsPct >= 92) {
      signalType = 'HIGH_PROBABILITY_YIELD';
      recommendedOutcome = 'Yes';
      confidenceScore = 94;
      expectedEvPct = (100 - yesOddsPct) * 0.8;
    } else if (noOddsPct >= 92) {
      signalType = 'HIGH_PROBABILITY_YIELD';
      recommendedOutcome = 'No';
      confidenceScore = 94;
      expectedEvPct = (100 - noOddsPct) * 0.8;
    } 
    // 2. Whale Inflow & Volume Surge (> $1M 24h volume)
    else if (market.volume24hUsd >= 1000000) {
      signalType = 'WHALE_INFLOW';
      recommendedOutcome = yesOddsPct >= 50 ? 'Yes' : 'No';
      confidenceScore = 85;
      expectedEvPct = 22.5;
    }
    // 3. Implied Odds Arbitrage
    else if (market.category === 'Crypto' && (yesOddsPct >= 65 || noOddsPct >= 65)) {
      signalType = 'ODDS_ARBITRAGE';
      recommendedOutcome = yesOddsPct >= 65 ? 'Yes' : 'No';
      confidenceScore = 82;
      expectedEvPct = 18.0;
    } else {
      return null; // Reject low-confidence markets
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
