import { GMGNAdapter, GMGNRawToken } from '../../adapters/gmgn-adapter.js';
import { GoPlusSecurityService, GoPlusTokenSecurity } from '../../services/goplus-security-service.js';
import { PriceFeedService } from '../../services/price-feed-service.js';
import { StrategyEngine } from '../../orchestrator/strategy-engine.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';
import { createDedupe, preFilterToken, detectMemeSignal, toStrategyGmgn, buildMemeThesis } from '../shared/gmgn-meme-helpers.js';

export interface RobinhoodSignal {
  token: GMGNRawToken;
  signalType: 'CTO' | 'REVIVAL' | 'MOMENTUM' | 'NONE';
  confidence: number;
  reasons: string[];
}

export interface RobinhoodScreeningConfig {
  minVolume24hUsd: number;   // 50000
  minLiquidityUsd: number;   // 10000
  minAgeHours: number;       // 4
  maxRugRatio: number;       // 0.3
  maxRatTraderRate: number;  // 0.3
  maxBundlerRate: number;    // 0.5
  maxTop10HolderRate: number;// 0.4
  minTotalFeeUsd: number;    // 500 — global total fees (ETH native) converted to USD
  passThreshold: number;     // 80
  signalTypes: number[];     // [1..13, 17..21]
  rankLimit: number;         // 20
  trenchesLimit: number;     // 20
}

const DEFAULT_CONFIG: RobinhoodScreeningConfig = {
  minVolume24hUsd: 50000,
  minLiquidityUsd: 10000,
  minAgeHours: 4,
  maxRugRatio: 0.3,
  maxRatTraderRate: 0.3,
  maxBundlerRate: 0.5,
  maxTop10HolderRate: 0.4,
  minTotalFeeUsd: 500,
  passThreshold: 80,
  signalTypes: [1,2,3,4,5,6,7,8,9,10,11,12,13,17,18,19,20,21],
  rankLimit: 20,
  trenchesLimit: 20,
};

export class RobinhoodScreeningAgent implements ScreeningAgent<RobinhoodSignal> {
  readonly domain = 'meme-robinhood';
  private gmgn: GMGNAdapter;
  private goplus: GoPlusSecurityService;
  private priceFeed: PriceFeedService;
  private strategyEngine: StrategyEngine;
  private config: RobinhoodScreeningConfig;
  private dedupeTokens = createDedupe();

  constructor(config?: Partial<RobinhoodScreeningConfig>) {
    this.gmgn = new GMGNAdapter();
    this.goplus = new GoPlusSecurityService();
    this.priceFeed = new PriceFeedService();
    this.strategyEngine = new StrategyEngine();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 1-min cadence: signal feed events (primary trigger) */
  public async collectSignalEvents(): Promise<GMGNRawToken[]> {
    const events = await this.gmgn.fetchTokenSignals('robinhood', this.config.signalTypes);
    return events.map((e) => e.data).filter((t) => t.address);
  }

  /** 3-min cadence: trenches (alpha: near-completion + completed) */
  public async collectTrenches(): Promise<GMGNRawToken[]> {
    const trenches = await this.gmgn.fetchTrenches('robinhood', { limit: this.config.trenchesLimit });
    return [...trenches.newCreation, ...trenches.nearCompletion, ...trenches.completed].filter((t) => t.address);
  }

  /** Fail-closed pre-filter (pure math; native price fetched once per pass) */
  public preFilter(t: GMGNRawToken, nativePriceUsd: number | null = null): { ok: boolean; reason: string } {
    return preFilterToken(t, this.config, nativePriceUsd, 'ROBINHOOD');
  }

  /** Detect signal type + deterministic confidence (0-100) */
  public detectSignal(t: GMGNRawToken): { type: 'CTO'|'REVIVAL'|'MOMENTUM'|'NONE'; confidence: number; reasons: string[] } {
    return detectMemeSignal(t);
  }

  /** Build call-card payload from real data (or 'N/A') */
  public buildPayload(t: GMGNRawToken, confidence: number, thesis: string): CallCardPayload {
    const ageHours = t.creationTimestamp !== null ? (Date.now()/1000 - t.creationTimestamp)/3600 : null;
    const total = t.buys + t.sells;
    const txRatio = total > 0 ? `Buy ${((t.buys/total)*100).toFixed(0)}% / Sell ${((t.sells/total)*100).toFixed(0)}%` : 'N/A';
    const devStr = t.devTeamHoldRate !== null ? `${(t.devTeamHoldRate*100).toFixed(1)}%${t.creatorClose ? ' (CLOSED)' : ''}` : (t.creatorClose ? 'CLOSED' : 'N/A');
    const rugStr = t.rugRatio !== null ? `${(t.rugRatio*100).toFixed(1)}%` : 'N/A';
    const bundlerStr = t.bundlerRate !== null ? `${(t.bundlerRate*100).toFixed(1)}%` : 'N/A';
    const top10Str = t.top10HolderRate !== null ? `${(t.top10HolderRate*100).toFixed(1)}%` : 'N/A';

    return {
      domain: 'MEME_EVM',
      title: `${t.name} (${t.symbol})`,
      symbol: t.symbol,
      contractAddress: t.address,
      network: 'Robinhood',
      tokenAge: ageHours !== null ? `${ageHours.toFixed(1)}h` : 'N/A',
      priceUsd: t.priceUsd > 0 ? `$${t.priceUsd}` : 'N/A',
      marketCap: t.marketCapUsd > 0 ? `$${(t.marketCapUsd/1000).toFixed(1)}k` : 'N/A',
      liquidity: t.liquidityUsd > 0 ? `$${(t.liquidityUsd/1000).toFixed(1)}k` : 'N/A',
      // Honest card: we have no real 5m/1h volume breakdown — price-change data lives in reasons/thesis
      volume5m: 'N/A',
      volume1h: 'N/A',
      volume24h: t.volume24hUsd > 0 ? `$${(t.volume24hUsd/1000).toFixed(1)}k` : 'N/A',
      txRatio,
      top10Pct: top10Str,
      devHoldingPct: devStr,
      sniperPct: 'N/A', // not exposed by rank; keep honest
      bundlerPct: bundlerStr,
      dexPaidStatus: t.dexscrBoostFee > 0 ? `✅ $${t.dexscrBoostFee} boost` : (t.dexscrAd ? '✅ DexScreener ad' : 'None'),
      smartMoneyInfo: `🧠 **Smart Traders:** ${t.smartDegenCount} wallets (+${t.creatorClose ? 'dev closed' : 'monitoring'})`,
      confidenceScore: confidence,
      securityScore: rugStr,
      aiThesis: thesis,
      gmgnUrl: `https://gmgn.ai/robinhood/token/${t.address}`,
      dexScreenerUrl: `https://dexscreener.com/robinhood/${t.address}`,
      rugcheckUrl: `https://gopluslabs.io/token-security/5318008/${t.address}`,
      securityAuditPassed: true, // set after GoPlus passes (see runScreeningPass)
      socialHypeScore: confidence,
      liquidityUsd: t.liquidityUsd,
      volume1hUsd: t.volume24hUsd / 24,
    };
  }

  /** Full pass: collect -> prefilter -> goplus audit + tax gate -> detect -> report */
  public async runScreeningPass(): Promise<AgentReport<RobinhoodSignal>[]> {
    console.log('[ROBINHOOD AGENT] Screening pass started (GMGN OpenAPI)...');
    const reports: AgentReport<RobinhoodSignal>[] = [];

    // 0. Live native price (ETH) — needed once per pass to convert total fees to USD (cached 60s)
    let nativePriceUsd: number | null = null;
    try {
      nativePriceUsd = await this.priceFeed.getPrice('ETH');
      console.log(`[ROBINHOOD AGENT] ETH price: ${nativePriceUsd !== null ? '$' + nativePriceUsd.toFixed(2) : 'UNAVAILABLE (fee gate will reject all)'}`);
    } catch (err: any) {
      console.warn(`[ROBINHOOD AGENT] Gagal ambil harga ETH: ${err.message}`);
    }

    // 1. Collect candidates: signal events (primary) + trenches (alpha)
    const events = await this.gmgn.fetchTokenSignals('robinhood', this.config.signalTypes);
    const eventTokens = events.map((e) => e.data).filter((t) => t.address);
    const trenches = await this.gmgn.fetchTrenches('robinhood', { limit: this.config.trenchesLimit });
    const trenchTokens = [...trenches.newCreation, ...trenches.nearCompletion, ...trenches.completed];
    const candidates = this.dedupeTokens.dedupe([...eventTokens, ...trenchTokens]);

    // 2. Pre-filter (cheap) then GoPlus audit (expensive) then detect
    for (const t of candidates) {
      const filter = this.preFilter(t, nativePriceUsd);
      if (!filter.ok) { console.log(`[ROBINHOOD AGENT] ${filter.reason}`); continue; }

      const audit: GoPlusTokenSecurity | null = await this.goplus.auditToken('robinhood', t.address);
      if (!audit) {
        console.log(`[ROBINHOOD AGENT] ⛔ ${t.symbol}: GoPlus audit gagal/null (fail-closed).`);
        continue;
      }
      if (audit.buyTaxPct > 10 || audit.sellTaxPct > 10) {
        console.log(`[ROBINHOOD AGENT] ⛔ ${t.symbol}: pajak tinggi (buy ${audit.buyTaxPct}% / sell ${audit.sellTaxPct}% > 10%).`);
        continue;
      }

      const det = this.detectSignal(t);
      if (det.type === 'NONE' || det.confidence < this.config.passThreshold) {
        console.log(`[ROBINHOOD AGENT] ⚪ ${t.symbol}: ${det.type} ${det.confidence}% < ${this.config.passThreshold}% (${det.reasons.join(' | ')})`);
        continue;
      }

      // Strategy extension layer (optional): adjust confidence
      let confidence = det.confidence;
      let strategyReason = '';
      try {
        const strat = this.strategyEngine.getActiveStrategy('meme-robinhood');
        if (strat?.evaluate) {
          const ev = this.strategyEngine.runStrategySafely(strat, 'evaluate', {
            domain: 'MEME_EVM', symbol: t.symbol, contractAddress: t.address,
            priceUsd: t.priceUsd, liquidityUsd: t.liquidityUsd,
            volume24hUsd: t.volume24hUsd, volume1hUsd: t.volume24hUsd/24,
            smartMoneyCount: t.smartDegenCount, securityAuditPassed: true,
            socialHypeScore: confidence,
            gmgn: { ...toStrategyGmgn(t), native_price_usd: nativePriceUsd },
          });
          if (ev?.recommendedAction === 'SKIP') {
            console.log(`[ROBINHOOD AGENT] ⛔ ${t.symbol}: strategi menolak (${ev.reason})`);
            continue;
          }
          if (ev && typeof ev.confidence === 'number') {
            confidence = Math.round(confidence * 0.7 + Math.max(0, Math.min(100, ev.confidence)) * 0.3);
            strategyReason = ev.reason || '';
          }
        }
      } catch (err: any) { console.warn(`[ROBINHOOD AGENT] Strategi gagal: ${err.message}`); }

      // Fail-closed: the 80 gate must hold on the FINAL blended confidence
      if (confidence < this.config.passThreshold) {
        console.log(`[ROBINHOOD AGENT] ⚪ ${t.symbol}: ${det.type} ${confidence}% < ${this.config.passThreshold}% (pasca-strategi)`);
        continue;
      }

      const thesis = buildMemeThesis(t, det.type, confidence, det.reasons, strategyReason);
      const payload = this.buildPayload(t, confidence, thesis);
      const signal: RobinhoodSignal = { token: t, signalType: det.type, confidence, reasons: det.reasons };
      reports.push({ passed: true, signal, reason: thesis, confidence, payload });
      console.log(`[ROBINHOOD AGENT] 🎯 ${det.type} ${t.symbol} ${confidence}%`);
    }

    console.log(`[ROBINHOOD AGENT] Pass selesai. ${reports.length} sinyal lolos.`);
    return reports;
  }

  /** Dedupe by contract address (case-insensitive), 60s cooldown via internal map */
  public dedupe(tokens: GMGNRawToken[]): GMGNRawToken[] {
    return this.dedupeTokens.dedupe(tokens);
  }

  /** Map GMGNRawToken -> snake_case GMGN field contract consumed by strategy .mjs modules */
  public toStrategyGmgn(t: GMGNRawToken): Record<string, unknown> {
    return toStrategyGmgn(t);
  }

  /** Deterministic thesis text (no LLM) */
  public buildThesis(t: GMGNRawToken, type: string, confidence: number, reasons: string[], strategyReason: string): string {
    return buildMemeThesis(t, type, confidence, reasons, strategyReason);
  }
}
