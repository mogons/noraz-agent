/**
 * Perpetual Futures Screening Agent (Hyperliquid)
 * 
 * Inspired by Vibe-Trading (HKUDS) multi-agent swarm debate approach:
 * - Macro Analyst (0-20):     Overall market regime via OI + volume
 * - Quant Analyst (0-20):     OI surges, spread health
 * - Risk Analyst (0-20):      Funding rate extremes, market depth
 * - Catalyst Analyst (0-15):  Volume/OI ratio, acceleration
 * - Technical Analyst (0-25): EMA (9/21/50/200) + RSI (14) on H1 & H4
 * - Depth Bonus (0-25):       OI depth tier (>= $1B → +25, >= $100M → +15, >= $25M → +10, >= $10M → +5)
 * 
 * Total = 0-100 (capped). Only setups with >= 80% are posted to #call-perps-futures.
 * All calculations run locally in TypeScript — zero LLM API cost.
 */

import { HyperliquidAdapter, HyperliquidMarketData, HyperliquidPerpsSignal } from '../../adapters/hyperliquid-adapter.js';
import { TechnicalIndicatorsService, Candle, TechnicalSnapshot } from '../../services/technical-indicators.js';
import { StrategyEngine } from '../../orchestrator/strategy-engine.js';
import type { StrategyContext } from '../../orchestrator/strategy-types.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';

export interface PerpsScreeningConfig {
  minOiSurge1hPercent: number;
  minVolume1hUsd: number;
  maxSpreadPercent: number;
  extremeFundingThreshold: number;
  maxLeverage: number;
  defaultStopLossPercent: number;
  defaultTakeProfitPercent: number;
  passThreshold: number;
}

const DEFAULT_CONFIG: PerpsScreeningConfig = {
  minOiSurge1hPercent: 5,
  minVolume1hUsd: 5000000,
  maxSpreadPercent: 0.05,
  extremeFundingThreshold: 0.0005,
  maxLeverage: 10,               // Default 10x leverage
  defaultStopLossPercent: 5,     // -5% price move = -50% PnL at 10x
  defaultTakeProfitPercent: 10,  // +10% price move = +100% PnL at 10x (2x return)
  passThreshold: 80,             // Swarm consensus gate (>= 80% posted to #call-perps-futures)
};

export class PerpsScreeningAgent implements ScreeningAgent<HyperliquidPerpsSignal> {
  readonly domain = 'perps';
  private adapter: HyperliquidAdapter;
  private technicals: TechnicalIndicatorsService;
  private strategyEngine: StrategyEngine;
  private config: PerpsScreeningConfig;

  constructor(adapter: HyperliquidAdapter, config?: Partial<PerpsScreeningConfig>) {
    this.adapter = adapter;
    this.technicals = new TechnicalIndicatorsService();
    this.strategyEngine = new StrategyEngine();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run a single screening pass:
   * 1. ALWAYS analyze primary watchlist (BTC, ETH, SOL, HYPE, GOLD, XYZ100, OIL)
   * 2. Only analyze secondary pool if volume/OI shows exceptional opportunity
   */
  public async screenAllAssets(): Promise<HyperliquidPerpsSignal[]> {
    console.log('[PERPS AGENT] Starting screening pass...');
    const signals: HyperliquidPerpsSignal[] = [];

    // ── Step 1: Always screen primary watchlist ──
    console.log(`[PERPS AGENT] Screening PRIMARY watchlist: ${this.adapter.primaryWatchlist.join(', ')}`);
    for (const coin of this.adapter.primaryWatchlist) {
      const market = await this.adapter.fetchMarketData(coin);
      if (!market) continue;
      const signal = await this.screenCoin(market);
      if (signal) {
        signals.push(signal);
        console.log(`[PERPS AGENT] 🎯 PRIMARY SIGNAL: ${signal.direction} ${signal.coin} (${signal.confidence}%)`);
      }
    }

    // ── Step 2: Quick-scan secondary pool for exceptional opportunities only ──
    console.log(`[PERPS AGENT] Quick-scanning SECONDARY pool for exceptional setups...`);
    for (const coin of this.adapter.secondaryPool) {
      const market = await this.adapter.fetchMarketData(coin);
      if (!market) continue;

      // Hard gate: secondary tickers must show exceptional volume AND OI surge
      const hasExceptionalVolume = market.volume1hUsd >= this.config.minVolume1hUsd * 3;
      const hasExceptionalOI = market.oiChange1hPercent >= this.config.minOiSurge1hPercent * 2;
      if (!hasExceptionalVolume || !hasExceptionalOI) continue;

      console.log(`[PERPS AGENT] ⚡ ${coin} shows exceptional activity — running full analysis`);
      const signal = await this.screenCoin(market);
      if (signal) {
        signals.push(signal);
        console.log(`[PERPS AGENT] 🎯 SECONDARY SIGNAL: ${signal.direction} ${signal.coin} (${signal.confidence}%)`);
      }
    }

    console.log(`[PERPS AGENT] Screening complete. ${signals.length} high-confidence setups found.`);
    return signals;
  }

  /**
   * Evaluate one market end-to-end: swarm consensus → 80 gate → strategy extension
   * (0.7/0.3 confidence blend, SKIP vetoes). Returns null when the setup fails.
   */
  private async screenCoin(market: HyperliquidMarketData): Promise<HyperliquidPerpsSignal | null> {
    const signal = await this.evaluateSetup(market);
    if (!signal || signal.confidence < this.config.passThreshold) {
      console.log(`[PERPS AGENT] ⚪ ${market.coin}: consensus ${signal?.confidence ?? 'N/A'}% < ${this.config.passThreshold}%.`);
      return null;
    }

    // Strategy extension layer (optional): adjust confidence
    try {
      const strat = this.strategyEngine.getActiveStrategy('perps');
      if (strat?.evaluate) {
        const ev = this.strategyEngine.runStrategySafely(strat, 'evaluate', this.buildStrategyCtx(signal));
        if (ev?.recommendedAction === 'SKIP') {
          console.log(`[PERPS AGENT] ⛔ ${signal.coin}: strategi menolak (${ev.reason})`);
          return null;
        }
        if (ev && typeof ev.confidence === 'number') {
          signal.confidence = Math.round(signal.confidence * 0.7 + Math.max(0, Math.min(100, ev.confidence)) * 0.3);
          if (ev.reason) signal.aiThesis = `${signal.aiThesis} Strategi: ${ev.reason}`;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[PERPS AGENT] Strategi gagal: ${message}`);
    }

    // Fail-closed: the 80 gate must hold on the FINAL blended confidence
    if (signal.confidence < this.config.passThreshold) {
      console.log(`[PERPS AGENT] ⚪ ${signal.coin}: ${signal.confidence}% < ${this.config.passThreshold}% setelah strategi.`);
      return null;
    }

    return signal;
  }

  /**
   * Fetch H1 and H4 candle data from Hyperliquid for technical analysis
   */
  private async fetchCandles(coin: string, interval: '1h' | '4h', count: number = 250): Promise<Candle[]> {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: { coin, interval, startTime: Date.now() - (count * (interval === '1h' ? 3600000 : 14400000)), endTime: Date.now() },
        }),
      });

      if (!response.ok) {
        return [];
      }

      const rawCandles: any = await response.json();
      if (!Array.isArray(rawCandles)) {
        return [];
      }

      return rawCandles.map((c: any) => ({ openTime: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PERPS AGENT] Failed to fetch ${interval} candles for ${coin}:`, message);
      return [];
    }
  }

  /**
   * 5-Role Swarm Evaluation (Vibe-Trading inspired + EMA/RSI)
   * 
   * Macro (0-20) + Quant (0-20) + Risk (0-20) + Catalyst (0-15) + Technical (0-25) = 0-100
   */
  private async evaluateSetup(market: HyperliquidMarketData): Promise<HyperliquidPerpsSignal | null> {
    const reasons: string[] = [];
    let direction: 'LONG' | 'SHORT' = 'LONG';

    // Minimum volume gate (hard reject if below threshold)
    if (market.volume1hUsd < this.config.minVolume1hUsd) {
      return null;
    }

    // ============================================
    // ROLE 1: MACRO ANALYST (0-20 points)
    // ============================================
    let macroScore = 0;

    if (market.oiChange4hPercent >= 15) {
      macroScore += 12;
      reasons.push(`📈 Strong 4h OI surge: +${market.oiChange4hPercent.toFixed(1)}% (Macro Bullish)`);
    } else if (market.oiChange4hPercent >= 8) {
      macroScore += 8;
      reasons.push(`📈 Moderate 4h OI growth: +${market.oiChange4hPercent.toFixed(1)}%`);
    } else if (market.oiChange4hPercent <= -15) {
      macroScore += 10;
      direction = 'SHORT';
      reasons.push(`📉 Sharp 4h OI decline: ${market.oiChange4hPercent.toFixed(1)}% (Macro Bearish)`);
    }

    if (market.volume1hUsd >= this.config.minVolume1hUsd * 3) {
      macroScore += 8;
      reasons.push(`🔥 Exceptional 1h volume: $${(market.volume1hUsd / 1e6).toFixed(1)}M`);
    } else if (market.volume1hUsd >= this.config.minVolume1hUsd) {
      macroScore += 4;
    }

    // ============================================
    // ROLE 2: QUANT ANALYST (0-20 points)
    // ============================================
    let quantScore = 0;

    if (market.oiChange1hPercent >= this.config.minOiSurge1hPercent * 3) {
      quantScore += 12;
      reasons.push(`🚀 Explosive 1h OI surge: +${market.oiChange1hPercent.toFixed(1)}%`);
    } else if (market.oiChange1hPercent >= this.config.minOiSurge1hPercent) {
      quantScore += 6;
      reasons.push(`📊 Notable 1h OI surge: +${market.oiChange1hPercent.toFixed(1)}%`);
    }

    if (market.spreadPercent <= this.config.maxSpreadPercent * 0.5) {
      quantScore += 8;
      reasons.push(`💎 Ultra-tight spread: ${(market.spreadPercent * 100).toFixed(3)}%`);
    } else if (market.spreadPercent <= this.config.maxSpreadPercent) {
      quantScore += 4;
    } else {
      quantScore -= 5;
      reasons.push(`🚫 Wide spread: ${(market.spreadPercent * 100).toFixed(3)}%`);
    }

    // ============================================
    // ROLE 3: RISK ANALYST (0-20 points)
    // ============================================
    let riskScore = 0;
    const absFunding = Math.abs(market.fundingRate8h);

    if (absFunding >= this.config.extremeFundingThreshold * 3) {
      riskScore += 12;
      if (market.fundingRate8h > 0) {
        direction = 'SHORT';
        reasons.push(`🔥 EXTREME positive funding: ${(market.fundingRate8h * 100).toFixed(4)}% — Contrarian SHORT`);
      } else {
        direction = 'LONG';
        reasons.push(`🔥 EXTREME negative funding: ${(market.fundingRate8h * 100).toFixed(4)}% — Contrarian LONG`);
      }
    } else if (absFunding <= this.config.extremeFundingThreshold) {
      riskScore += 8;
    } else {
      riskScore += 4;
    }

    if (market.openInterestUsd >= 50000000) {
      riskScore += 8;
      reasons.push(`🏦 Deep market: $${(market.openInterestUsd / 1e6).toFixed(0)}M OI`);
    } else if (market.openInterestUsd >= 10000000) {
      riskScore += 4;
    }

    // ============================================
    // ROLE 4: CATALYST ANALYST (0-15 points)
    // ============================================
    let catalystScore = 0;

    const volumeToOiRatio = market.volume4hUsd / (market.openInterestUsd || 1);
    if (volumeToOiRatio >= 0.8) {
      catalystScore += 10;
      reasons.push(`🌊 High Volume/OI ratio: ${volumeToOiRatio.toFixed(2)}x (New money inflow)`);
    } else if (volumeToOiRatio >= 0.3) {
      catalystScore += 5;
    }

    const volumeAcceleration = (market.volume1hUsd * 4) / (market.volume4hUsd || 1);
    if (volumeAcceleration >= 1.5) {
      catalystScore += 5;
      reasons.push(`⚡ Volume accelerating: ${(volumeAcceleration * 100).toFixed(0)}% of 4h pace`);
    }

    // ============================================
    // ROLE 5: TECHNICAL ANALYST (0-25 points)
    // EMA (9/21/50/200) + RSI (14) on H1 & H4
    // ============================================
    const [h1Candles, h4Candles] = await Promise.all([
      this.fetchCandles(market.coin, '1h', 250),
      this.fetchCandles(market.coin, '4h', 250),
    ]);

    let technicalScore = 0;
    let h1Snapshot: TechnicalSnapshot | null = null;
    let h4Snapshot: TechnicalSnapshot | null = null;

    if (h1Candles.length >= 50 && h4Candles.length >= 50) {
      h1Snapshot = this.technicals.generateSnapshot(market.coin, h1Candles, 'H1');
      h4Snapshot = this.technicals.generateSnapshot(market.coin, h4Candles, 'H4');

      const techResult = this.technicals.scoreTechnicals(h1Snapshot, h4Snapshot, direction);
      technicalScore = techResult.score;
      reasons.push(...techResult.reasons);
    } else {
      reasons.push('⚠️ Insufficient candle data for EMA/RSI analysis');
    }

    // ============================================
    // DEPTH BONUS (Liquidity & Depth, 0-25)
    // Calibration decision (see task-1-brief): the 5-role swarm caps Technical at
    // 25, making >= 80 unreachable for real majors without this component.
    // OI >= $1B → +25, >= $100M → +15, >= $25M → +10, >= $10M → +5 (live-calibrated
    // 2026-08-07: BTC/ETH at 70% with +15 → mega tier added so the gate is reachable).
    // ============================================
    const depthBonus = this.computeDepthBonus(market.openInterestUsd);

    // ============================================
    // FINAL CONSENSUS SCORE (0-100)
    // Macro(20) + Quant(20) + Risk(20) + Catalyst(15) + Technical(25) + Depth(25) = 125 max, capped at 100
    // ============================================
    const totalScore = Math.max(0, Math.min(100, macroScore + quantScore + riskScore + catalystScore + technicalScore + depthBonus));

    const suggestedLeverage = this.config.maxLeverage;

    // Build thesis with EMA/RSI data included
    const aiThesis = this.buildDeterministicThesis(
      market, direction, totalScore,
      macroScore, quantScore, riskScore, catalystScore, technicalScore, depthBonus,
      h1Snapshot, h4Snapshot,
    );

    return {
      coin: market.coin,
      assetIndex: market.assetIndex,
      direction,
      confidence: totalScore,
      entryPriceUsd: market.midPriceUsd,
      suggestedLeverage,
      stopLossPercent: this.config.defaultStopLossPercent,
      takeProfitPercent: this.config.defaultTakeProfitPercent,
      marketData: market,
      signalReasons: reasons,
      aiThesis,
    };
  }

  /**
   * Build a professional thesis without calling LLM API
   */
  private buildDeterministicThesis(
    market: HyperliquidMarketData,
    direction: 'LONG' | 'SHORT',
    totalScore: number,
    macroScore: number,
    quantScore: number,
    riskScore: number,
    catalystScore: number,
    technicalScore: number,
    depthBonus: number,
    h1: TechnicalSnapshot | null,
    h4: TechnicalSnapshot | null,
  ): string {
    const dirLabel = direction === 'LONG' ? 'bullish' : 'bearish';
    const volumeLabel = market.volume1hUsd >= 50000000 ? 'exceptionally high' : market.volume1hUsd >= 10000000 ? 'strong' : 'moderate';
    const fundingLabel = Math.abs(market.fundingRate8h) >= 0.001 ? 'extreme' : Math.abs(market.fundingRate8h) >= 0.0005 ? 'elevated' : 'neutral';

    let thesis = `${market.coin}-USDT shows a ${dirLabel} setup on Hyperliquid with ${totalScore}% swarm consensus. ` +
      `OI surged +${market.oiChange4hPercent.toFixed(1)}% (4h) with ${volumeLabel} volume ($${(market.volume1hUsd / 1e6).toFixed(1)}M/1h). ` +
      `Funding is ${fundingLabel} at ${(market.fundingRate8h * 100).toFixed(4)}%/8h. ` +
      `Depth: $${(market.openInterestUsd / 1e6).toFixed(0)}M OI (+${depthBonus}). `;

    if (h4 && h1) {
      thesis += `H4 trend: ${h4.trendBias} (EMA9=${h4.ema9.toFixed(2)}, EMA21=${h4.ema21.toFixed(2)}, RSI=${h4.rsi14.toFixed(1)}). ` +
        `H1 entry: EMA9${h1.ema9AboveEma21 ? '>' : '<'}EMA21, RSI=${h1.rsi14.toFixed(1)} (${h1.rsiZone}). `;
    }

    thesis += `Swarm: Macro ${macroScore}/20 | Quant ${quantScore}/20 | Risk ${riskScore}/20 | Catalyst ${catalystScore}/15 | Technical ${technicalScore}/25 | Depth +${depthBonus}.`;

    return thesis;
  }

  /**
   * Contract wrapper: screen all assets, enrich each passing signal with a call-card
   * payload, and return contract reports (keeps screenAllAssets public for hub/tests).
   */
  public async runScreeningPass(): Promise<AgentReport<HyperliquidPerpsSignal>[]> {
    const signals = await this.screenAllAssets();
    return signals.map((signal) => {
      const payload = this.buildPayload(signal, signal.aiThesis);
      return { passed: true, signal, reason: signal.aiThesis, confidence: signal.confidence, payload };
    });
  }

  /**
   * Perps have no on-chain token audit (no RugCheck/GoPlus equivalent for a perp market),
   * so "safe enough" is derived from market microstructure: deep OI (>= $10M, cannot be
   * squeezed), tight spread (<= 0.1%, clean fills) and sane funding (|8h rate| <= 0.2%,
   * no deranged premium). All three must hold to pass.
   */
  public deriveSecurityPassed(market: HyperliquidMarketData): boolean {
    return (
      market.openInterestUsd >= 10_000_000 &&
      market.spreadPercent <= 0.1 &&
      Math.abs(market.fundingRate8h) <= 0.002
    );
  }

  /**
   * Liquidity & Depth bonus: OI >= $1B → +25, >= $100M → +15, >= $25M → +10, >= $10M → +5, else +0.
   * Calibration (live Hyperliquid, 2026-08-07): BTC/ETH measured 70% with +15 during a quiet
   * regime — not reachable. The $1B+ mega tier (only BTC/ETH-class markets qualify) lifts
   * real mega-cap setups to >= 80 while mid-caps still need OI-surge momentum on top.
   */
  public computeDepthBonus(openInterestUsd: number): number {
    if (openInterestUsd >= 1_000_000_000) return 25;
    if (openInterestUsd >= 100_000_000) return 15;
    if (openInterestUsd >= 25_000_000) return 10;
    if (openInterestUsd >= 10_000_000) return 5;
    return 0;
  }

  /** Build call-card payload from real market data */
  public buildPayload(signal: HyperliquidPerpsSignal, thesis: string): CallCardPayload {
    const m = signal.marketData;
    return {
      domain: 'PERPS',
      title: `${signal.direction} ${signal.coin} (${signal.suggestedLeverage}x)`,
      symbol: signal.coin,
      contractAddress: signal.coin,
      network: 'Hyperliquid Perps',
      priceUsd: `$${signal.entryPriceUsd}`,
      marketCap: `SL ${signal.stopLossPercent}% / TP ${signal.takeProfitPercent}%`,
      confidenceScore: signal.confidence,
      aiThesis: thesis,
      liquidityUsd: m.openInterestUsd,
      volume1hUsd: m.volume1hUsd,
      securityAuditPassed: this.deriveSecurityPassed(m),
      socialHypeScore: signal.confidence,
      dexScreenerUrl: `https://app.hyperliquid.xyz/trade/${signal.coin}`,
    };
  }

  /** Map signal + market -> strategy ctx (flat + snake_case hyperliquid block) */
  private buildStrategyCtx(signal: HyperliquidPerpsSignal): StrategyContext {
    const m = signal.marketData;
    return {
      domain: 'PERPS',
      symbol: signal.coin,
      contractAddress: signal.coin,
      priceUsd: signal.entryPriceUsd,
      liquidityUsd: m.openInterestUsd,
      volume24hUsd: m.volume24hUsd,
      volume1hUsd: m.volume1hUsd,
      smartMoneyCount: 0, // perps have no wallet-count signal; kept for StrategyContext parity
      securityAuditPassed: this.deriveSecurityPassed(m),
      socialHypeScore: signal.confidence,
      direction: signal.direction,
      openInterestUsd: m.openInterestUsd,
      fundingRate8h: m.fundingRate8h,
      spreadPercent: m.spreadPercent,
      oiChange1hPercent: m.oiChange1hPercent,
      oiChange4hPercent: m.oiChange4hPercent,
      volume4hUsd: m.volume4hUsd,
      hyperliquid: {
        symbol: m.coin,
        entry_price_usd: signal.entryPriceUsd,
        open_interest_usd: m.openInterestUsd,
        oi_change_1h_percent: m.oiChange1hPercent,
        oi_change_4h_percent: m.oiChange4hPercent,
        volume_1h_usd: m.volume1hUsd,
        volume_4h_usd: m.volume4hUsd,
        funding_rate_8h: m.fundingRate8h,
        spread_percent: m.spreadPercent,
      },
    };
  }
}
