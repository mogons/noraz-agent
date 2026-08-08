import { PolymarketAdapter, PolymarketMarketData } from '../../adapters/polymarket-adapter.js';
import { StrategyEngine } from '../../orchestrator/strategy-engine.js';
import type { StrategyContext } from '../../orchestrator/strategy-types.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';

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
  spread: number | null; // null = no order-book data (never fabricated)
  polymarketUrl: string;
  aiThesis: string;
  signalType: 'ODDS_ARBITRAGE' | 'WHALE_INFLOW' | 'HIGH_PROBABILITY_YIELD';
}

export interface PolymarketScreeningConfig {
  minLiquidityUsd: number;   // audit gate: >= $50k
  minVolume24hUsd: number;   // audit gate: >= $25k
  maxSpread: number;         // audit gate: <= 0.05 when book data available
  passThreshold: number;     // Swarm consensus gate (>= 80)
}

const DEFAULT_CONFIG: PolymarketScreeningConfig = {
  minLiquidityUsd: 50000,
  minVolume24hUsd: 25000,
  maxSpread: 0.05,
  passThreshold: 80,
};

/**
 * Polymarket Prediction Market Agent
 *
 * Confidence scoring from REAL data only (no hardcoded constants):
 *   odds tier (0-40): >= 92% → 40, >= 80% → 30, else 15
 *   + volume tier (0-30): 24h vol >= $100k → 30, else 10
 *   + spread tier (0-30): spread <= 0.05 → 30, else 10
 *
 * Calibration (2026-08-07, verified with realistic fixtures): >= 80 is REACHABLE via
 * 92%+ odds + $100k+ volume (80 even with a wide spread), or 80%+ odds + tight spread
 * (90), and a full combo (92%+ odds, deep volume, tight spread) caps at 100. The gate
 * remains meaningful: low-odds thin markets can never pass.
 *
 * Pipeline: fetch real markets (fail-closed) → evaluateMarket (fail-closed) →
 * strategy extension layer (0.7/0.3 blend, SKIP vetoes) → AgentReport[] with
 * real-data CallCardPayload. All math runs locally — zero LLM cost.
 */
export class PolymarketAgent implements ScreeningAgent<PredictionSignalReport> {
  readonly domain = 'prediction';
  private adapter: PolymarketAdapter;
  private strategyEngine: StrategyEngine;
  private config: PolymarketScreeningConfig;

  constructor(adapter?: PolymarketAdapter, config?: Partial<PolymarketScreeningConfig>) {
    this.adapter = adapter || new PolymarketAdapter();
    this.strategyEngine = new StrategyEngine();
    this.config = { ...DEFAULT_CONFIG, ...config };
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
      spread,
      polymarketUrl: market.url,
      aiThesis,
      signalType,
    };
  }

  /**
   * Contract wrapper: fetch top markets per category, evaluate, run the strategy
   * extension layer (0.7/0.3 blend, SKIP vetoes) and emit AgentReport[] with
   * real-data payloads. The >= 80 gate must hold on the FINAL blended confidence
   * (fail-closed). Never fabricates data.
   *
   * NOTE (2026-08-09): screening sengaja di-NO-OP — prediction market tidak
   * diprioritaskan (arsitektur & evaluasi tetap ada untuk diaktifkan lagi).
   * Tidak ada request API sama sekali; channel & agent tetap terdaftar.
   */
  public async runScreeningPass(): Promise<AgentReport<PredictionSignalReport>[]> {
    console.log('[POLYMARKET AGENT] Screening dinonaktifkan sementara (no-op) — tidak ada request API.');
    return [];
  }

  /**
   * Market-level security audit — NEVER hardcoded. A prediction market has no on-chain
   * token contract, so "safe enough" is derived from market microstructure:
   *   1. Liquidity >= $50k   → a meaningful bet can actually be filled
   *   2. 24h volume >= $25k  → real betting activity, not a ghost market
   *   3. Spread <= 0.05 when book data is available; null spread (no book) → the audit
   *      falls back to liquidity + volume alone — documented decision (design spec Task 3):
   *      evaluation still proceeds on liq/vol, but the spread condition is never bypassed
   *      when it IS observable.
   * All available gates must hold to pass.
   */
  public deriveMarketSafety(report: PredictionSignalReport): boolean {
    const liquidityOk = report.liquidityUsd >= this.config.minLiquidityUsd;
    const volumeOk = report.volume24hUsd >= this.config.minVolume24hUsd;
    const spreadOk = report.spread === null || report.spread <= this.config.maxSpread;
    return liquidityOk && volumeOk && spreadOk;
  }

  /** Build call-card payload from real market data */
  public buildPayload(report: PredictionSignalReport, thesis: string): CallCardPayload {
    return {
      domain: 'PREDICTION',
      title: report.question,
      symbol: report.recommendedOutcome,
      network: 'Polygon (Polymarket)',
      confidenceScore: report.confidenceScore,
      aiThesis: thesis,
      dexScreenerUrl: report.polymarketUrl,
      liquidityUsd: report.liquidityUsd,
      volume1hUsd: Math.round(report.volume24hUsd / 24), // honest derivation: avg hourly volume from 24h
      securityAuditPassed: this.deriveMarketSafety(report),
      socialHypeScore: report.confidenceScore,
    };
  }

  /** Map report -> strategy ctx (flat + snake_case prediction block) */
  private buildStrategyCtx(report: PredictionSignalReport): StrategyContext {
    return {
      domain: 'PREDICTION',
      symbol: report.marketId,
      contractAddress: 'N/A',
      priceUsd: report.currentOddsPct,
      liquidityUsd: report.liquidityUsd,
      volume24hUsd: report.volume24hUsd,
      volume1hUsd: Math.round(report.volume24hUsd / 24),
      smartMoneyCount: 0, // no wallet-count signal on Polymarket; kept for StrategyContext parity
      securityAuditPassed: this.deriveMarketSafety(report),
      socialHypeScore: report.confidenceScore,
      outcome: report.recommendedOutcome,
      spread: report.spread,
      prediction: {
        market_id: report.marketId,
        question: report.question,
        outcome: report.recommendedOutcome,
        current_odds_pct: report.currentOddsPct,
        expected_ev_pct: report.expectedEvPct,
        volume_24h_usd: report.volume24hUsd,
        liquidity_usd: report.liquidityUsd,
        spread: report.spread,
      },
    };
  }
}
