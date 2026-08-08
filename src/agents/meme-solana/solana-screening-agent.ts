import { GMGNAdapter, GMGNRawToken } from '../../adapters/gmgn-adapter.js';
import { RugCheckService, RugCheckResult } from '../../services/security-service.js';
import { globalPriceFeedService } from '../../services/price-feed-service.js';
import { StrategyEngine } from '../../orchestrator/strategy-engine.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';
import { createDedupe, preFilterToken, detectMemeSignal, volume24hOf, buildSignalBoostMap, applySignalBoost, toStrategyGmgn, buildMemeThesis, isGraduatedToken, validateMemeConfigUpdate } from '../shared/gmgn-meme-helpers.js';
import type { SignalBoostMap } from '../shared/gmgn-meme-helpers.js';

export interface SolanaSignal {
  token: GMGNRawToken;
  signalType: 'CTO' | 'REVIVAL' | 'MOMENTUM' | 'NONE';
  confidence: number;
  reasons: string[];
}

export interface SolanaScreeningConfig {
  minVolume24hUsd: number;   // 100000
  minLiquidityUsd: number;   // 10000
  minAgeHours: number;       // 2 — < 2h masih rawan rug
  maxRugRatio: number;       // 0.3
  maxRatTraderRate: number;  // 0.3
  maxBundlerRate: number;    // 0.5
  maxTop10HolderRate: number;// 0.4
  minTotalFeeUsd: number;    // 500 — global total fees (SOL native) converted to USD
  passThreshold: number;     // 80
  signalTypes: number[];     // smart-money/KOL/CTO/price events (graduated focus)
  rankLimit: number;         // 100 (trending, 1h)
  trenchesLimit: number;     // 80 (completed only)
  hotSearchesLimit: number;  // 100 (hot searches, migrated)
  signalLimit: number;       // 50 per group
}

const DEFAULT_CONFIG: SolanaScreeningConfig = {
  minVolume24hUsd: 100000,
  minLiquidityUsd: 10000,
  minAgeHours: 2,
  maxRugRatio: 0.3,
  maxRatTraderRate: 0.3,
  maxBundlerRate: 0.5,
  maxTop10HolderRate: 0.4,
  minTotalFeeUsd: 500,
  passThreshold: 80,
  // 6 PriceUp, 7 PriceATH, 8 McpKeyLevel, 11 Cto, 12 SmartDegenBuy, 13/19 PlatformCall, 20 KOLBuy
  signalTypes: [6, 7, 8, 11, 12, 13, 19, 20],
  rankLimit: 100,
  trenchesLimit: 80,
  hotSearchesLimit: 100,
  signalLimit: 50,
};

export class SolanaScreeningAgent implements ScreeningAgent<SolanaSignal> {
  readonly domain = 'meme-solana';
  private gmgn: GMGNAdapter;
  private rugCheck: RugCheckService;
  private priceFeed = globalPriceFeedService;
  private strategyEngine: StrategyEngine;
  private config: SolanaScreeningConfig;
  private dedupeTokens = createDedupe();

  constructor(config?: Partial<SolanaScreeningConfig>) {
    this.gmgn = new GMGNAdapter();
    this.rugCheck = new RugCheckService();
    this.strategyEngine = new StrategyEngine();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Runtime config update (chat tool `set_screening_config`). Whitelisted keys
   * only; invalid values are rejected, never silently clamped.
   */
  public updateConfig(partial: Record<string, unknown>): { applied: Record<string, unknown>; rejected: string[] } {
    const { applied, rejected } = validateMemeConfigUpdate(partial);
    this.config = { ...this.config, ...applied };
    if (Object.keys(applied).length > 0) {
      console.log(`[SOLANA AGENT] Config updated: ${JSON.stringify(applied)}`);
    }
    return { applied, rejected };
  }

  public getConfig(): SolanaScreeningConfig {
    return { ...this.config };
  }

  /**
   * 3 data sources, all focused on GRADUATED tokens (sudah di DEX, bukan
   * bonding curve) dengan timeframe 1H:
   * 1. Trending rank (interval 1h, filter is_out_market) — yang lagi naik
   * 2. Trenches completed — baru selesai bonding curve -> DEX
   * 3. Hot searches (migrated) — yang paling dicari orang
   * NOTE: token_signal di-drop sebagai sumber kandidat: GMGN tidak pernah
   * mengisi volume/swap di event (semua chain) — token signal selalu mati di
   * gate volume. Event smart-money/KOL/CTO dipakai sebagai overlay analisa
   * (collectSignalBoostMap -> applySignalBoost). Investigasi 2026-08-08.
   */
  public async collectCandidates(): Promise<GMGNRawToken[]> {
    const [rank, trenches, hotSearches] = await Promise.all([
      this.gmgn.fetchRank('sol', {
        interval: '1h',
        limit: this.config.rankLimit,
        filters: ['renounced', 'frozen', 'is_out_market'],
      }),
      this.gmgn.fetchTrenches('sol', {
        types: ['completed'],
        limit: this.config.trenchesLimit,
        filters: { max_rug_ratio: 0.3, max_bundler_rate: 0.3, max_insider_ratio: 0.3 },
      }),
      this.gmgn.fetchHotSearches({ chain: 'sol', interval: '1h', limit: this.config.hotSearchesLimit, filters: ['migrated', 'renounced', 'frozen'] }),
    ]);

    const candidates = [
      ...rank,
      ...trenches.completed,
      ...hotSearches,
    ];
    return this.dedupeTokens.dedupe(candidates);
  }

  /** Signal feed events (1-min cadence; legacy alias used by tests/TUI) */
  public async collectSignalEvents(): Promise<GMGNRawToken[]> {
    const events = await this.gmgn.fetchTokenSignals('sol', this.config.signalTypes);
    return events.map((e) => e.data).filter((t) => t.address);
  }

  /**
   * Signal booster map (analytical overlay, NOT a candidate source): GMGN
   * token_signal never fills volume/swaps (any chain), so its events are used
   * to boost confidence on tokens that already pass rank/trenches/hot gates.
   * Fail-open: any error -> empty map, screening proceeds unchanged.
   */
  public async collectSignalBoostMap(): Promise<SignalBoostMap> {
    try {
      const events = await this.gmgn.fetchTokenSignals('sol', this.config.signalTypes);
      return buildSignalBoostMap(events);
    } catch (err: any) {
      console.warn(`[SOLANA AGENT] Signal booster gagal (dilewati): ${err.message}`);
      return new Map();
    }
  }

  /** Trenches (3-min cadence; legacy alias used by tests/TUI) */
  public async collectTrenches(): Promise<GMGNRawToken[]> {
    const trenches = await this.gmgn.fetchTrenches('sol', { types: ['completed'], limit: this.config.trenchesLimit });
    return [...trenches.newCreation, ...trenches.nearCompletion, ...trenches.completed].filter((t) => t.address);
  }

  /** Fail-closed pre-filter (pure math; native price fetched once per pass) */
  public preFilter(t: GMGNRawToken, nativePriceUsd: number | null = null): { ok: boolean; reason: string } {
    return preFilterToken(t, this.config, nativePriceUsd, 'SOLANA');
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
      domain: 'MEME_SOLANA',
      title: `${t.name} (${t.symbol})`,
      symbol: t.symbol,
      contractAddress: t.address,
      network: 'Solana',
      tokenAge: ageHours !== null ? `${ageHours.toFixed(1)}h` : 'N/A',
      priceUsd: t.priceUsd > 0 ? `$${t.priceUsd}` : 'N/A',
      marketCap: t.marketCapUsd > 0 ? `$${(t.marketCapUsd/1000).toFixed(1)}k` : 'N/A',
      liquidity: t.liquidityUsd > 0 ? `$${(t.liquidityUsd/1000).toFixed(1)}k` : 'N/A',
      // Honest card: we have no real 5m/1h volume breakdown — price-change data lives in reasons/thesis
      volume5m: 'N/A',
      volume1h: 'N/A',
      volume24h: (() => { const v = volume24hOf(t); return v > 0 ? `$${(v/1000).toFixed(1)}k` : 'N/A'; })(),
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
      gmgnUrl: `https://gmgn.ai/sol/token/${t.address}`,
      dexScreenerUrl: `https://dexscreener.com/solana/${t.address}`,
      rugcheckUrl: `https://rugcheck.xyz/tokens/${t.address}`,
      securityAuditPassed: true, // set after RugCheck passes (see runScreeningPass)
      socialHypeScore: confidence,
      liquidityUsd: t.liquidityUsd,
      volume1hUsd: t.volume1hUsd > 0 ? t.volume1hUsd : volume24hOf(t) / 24,
    };
  }

  /** Full pass: collect -> prefilter -> rugcheck -> detect -> report */
  public async runScreeningPass(): Promise<AgentReport<SolanaSignal>[]> {
    console.log('[SOLANA AGENT] Screening pass started (GMGN OpenAPI)...');
    const reports: AgentReport<SolanaSignal>[] = [];

    // 0. Live native price (SOL) — needed once per pass to convert total fees to USD (cached 60s)
    let nativePriceUsd: number | null = null;
    try {
      nativePriceUsd = await this.priceFeed.getPrice('SOL');
      console.log(`[SOLANA AGENT] SOL price: ${nativePriceUsd !== null ? '$' + nativePriceUsd.toFixed(2) : 'UNAVAILABLE (fee gate will reject all)'}`);
    } catch (err: any) {
      console.warn(`[SOLANA AGENT] Gagal ambil harga SOL: ${err.message}`);
    }

    // 1. Collect candidates from 3 sources + signal booster overlay (all graduated-focused)
    const [candidates, signalBoostMap] = await Promise.all([
      this.collectCandidates(),
      this.collectSignalBoostMap(),
    ]);
    if (signalBoostMap.size > 0) {
      console.log(`[SOLANA AGENT] Signal overlay: ${signalBoostMap.size} token punya event smart-money/KOL/CTO.`);
    }

    // 2. Pre-filter (cheap) then RugCheck (expensive) then detect
    for (const t of candidates) {
      // Graduated-only: reject tokens still on the bonding curve (exchange='pump')
      if (!isGraduatedToken(t)) {
        console.log(`[SOLANA AGENT] ⛔ ${t.symbol}: belum graduated (bonding curve).`);
        continue;
      }

      const filter = this.preFilter(t, nativePriceUsd);
      if (!filter.ok) { console.log(`[SOLANA AGENT] ${filter.reason}`); continue; }

      const audit: RugCheckResult = await this.rugCheck.auditSolanaToken(t.address);
      if (!audit.isSafeForRunner) {
        console.log(`[SOLANA AGENT] ⛔ ${t.symbol}: RugCheck tidak lolos (score ${audit.score}).`);
        continue;
      }

      const det = applySignalBoost(this.detectSignal(t), signalBoostMap, t.address);
      if (det.type === 'NONE' || det.confidence < this.config.passThreshold) {
        console.log(`[SOLANA AGENT] ⚪ ${t.symbol}: ${det.type} ${det.confidence}% < ${this.config.passThreshold}% (${det.reasons.join(' | ')})`);
        continue;
      }

      // Strategy extension layer (optional): adjust confidence
      let confidence = det.confidence;
      let strategyReason = '';
      try {
        const strat = this.strategyEngine.getActiveStrategy('meme-solana');
        if (strat?.evaluate) {
          const ev = this.strategyEngine.runStrategySafely(strat, 'evaluate', {
            domain: 'MEME_SOLANA', symbol: t.symbol, contractAddress: t.address,
            priceUsd: t.priceUsd, liquidityUsd: t.liquidityUsd,
            volume24hUsd: volume24hOf(t), volume1hUsd: t.volume1hUsd > 0 ? t.volume1hUsd : volume24hOf(t)/24,
            smartMoneyCount: t.smartDegenCount, securityAuditPassed: true,
            socialHypeScore: confidence,
            gmgn: { ...toStrategyGmgn(t), native_price_usd: nativePriceUsd },
          });
          if (ev?.recommendedAction === 'SKIP') {
            console.log(`[SOLANA AGENT] ⛔ ${t.symbol}: strategi menolak (${ev.reason})`);
            continue;
          }
          if (ev && typeof ev.confidence === 'number') {
            confidence = Math.round(confidence * 0.7 + Math.max(0, Math.min(100, ev.confidence)) * 0.3);
            strategyReason = ev.reason || '';
          }
        }
      } catch (err: any) { console.warn(`[SOLANA AGENT] Strategi gagal: ${err.message}`); }

      // Fail-closed: the 80 gate must hold on the FINAL blended confidence
      if (confidence < this.config.passThreshold) {
        console.log(`[SOLANA AGENT] ⚪ ${t.symbol}: ${det.type} ${confidence}% < ${this.config.passThreshold}% (pasca-strategi)`);
        continue;
      }

      const thesis = buildMemeThesis(t, det.type, confidence, det.reasons, strategyReason);
      const payload = this.buildPayload(t, confidence, thesis);
      const signal: SolanaSignal = { token: t, signalType: det.type, confidence, reasons: det.reasons };
      reports.push({ passed: true, signal, reason: thesis, confidence, payload });
      console.log(`[SOLANA AGENT] 🎯 ${det.type} ${t.symbol} ${confidence}%`);
    }

    console.log(`[SOLANA AGENT] Pass selesai. ${reports.length} sinyal lolos.`);
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
