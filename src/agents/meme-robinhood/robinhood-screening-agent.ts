import { GMGNAdapter, GMGNRawToken } from '../../adapters/gmgn-adapter.js';
import { globalPriceFeedService } from '../../services/price-feed-service.js';
import { StrategyEngine } from '../../orchestrator/strategy-engine.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';
import { createDedupe, preFilterToken, detectMemeSignal, volume24hOf, buildSignalBoostMap, applySignalBoost, toStrategyGmgn, buildMemeThesis, isGraduatedToken, validateMemeConfigUpdate, securityAuditGate, buildTrackAccumulation, trackAccumulationLabel } from '../shared/gmgn-meme-helpers.js';
import type { SignalBoostMap, TrackAccumulation, MemePreFilterConfig } from '../shared/gmgn-meme-helpers.js';

export interface RobinhoodSignal {
  token: GMGNRawToken;
  signalType: 'CTO' | 'REVIVAL' | 'MOMENTUM' | 'NONE';
  confidence: number;
  reasons: string[];
}

export interface RobinhoodScreeningConfig {
  minVolume1hUsd: number;    // 50000 — real 1-HOUR volume (token must be active RIGHT NOW)
  minLiquidityUsd: number;   // 10000
  minMarketCapUsd: number;   // 100000 — required to be above $100k (MC 0/unknown = reject)
  minAgeHours: number;       // 0 — degen early: new tokens pass immediately (smart money/CTO/KOL decide)
  maxRugRatio: number;       // 0.3
  maxRatTraderRate: number;  // 0.3
  maxTop10HolderRate: number;// 0.4
  minTotalFeeUsd: number;    // 500 — active fee gate: tokens without organic activity (unrecorded fee) rejected
  passThreshold: number;     // 80
  signalTypes: number[];     // smart-money/KOL/CTO/price events (overlay boost)
  rankLimit: number;         // 100 (trending, 1h)
  trenchesLimit: number;     // 80 (completed only)
  hotSearchesLimit: number;  // 100 (hot searches, migrated)
  trackFeedEnabled: boolean; // true — smart-money trade feed = additional candidates (booster, not replacement)
  minTrackWallets: number;   // 2 — minimum smart-money wallets buying the same token
  minTrackBuyUsd: number;    // 10000 — minimum total buy USD
  trackFreshMinutes: number; // 30 — fresh accumulation window
}

const DEFAULT_CONFIG: RobinhoodScreeningConfig = {
  minVolume1hUsd: 50000,
  minLiquidityUsd: 10000,
  minMarketCapUsd: 100000,
  minAgeHours: 0,
  maxRugRatio: 0.3,
  maxRatTraderRate: 0.3,
  maxTop10HolderRate: 0.4,
  minTotalFeeUsd: 500,
  passThreshold: 80,
  // 6 PriceUp, 7 PriceATH, 8 McpKeyLevel, 11 Cto, 12 SmartDegenBuy, 13/19 PlatformCall, 20 KOLBuy
  signalTypes: [6, 7, 8, 11, 12, 13, 19, 20],
  rankLimit: 100,
  trenchesLimit: 80,
  hotSearchesLimit: 100,
  trackFeedEnabled: true,
  minTrackWallets: 2,
  minTrackBuyUsd: 10000,
  trackFreshMinutes: 30,
};

export class RobinhoodScreeningAgent implements ScreeningAgent<RobinhoodSignal> {
  readonly domain = 'meme-robinhood';
  private gmgn: GMGNAdapter;
  private priceFeed = globalPriceFeedService;
  private strategyEngine: StrategyEngine;
  private config: RobinhoodScreeningConfig;
  private strategyParams?: () => Record<string, unknown>;
  private dedupeTokens = createDedupe();

  constructor(config?: Partial<RobinhoodScreeningConfig>, strategyParams?: () => Record<string, unknown>) {
    // Separate GMGN key for robinhood (per-key rate limit): fallback to
    // GMGN_API_KEY when GMGN_API_KEY_ROBINHOOD is not yet set.
    this.gmgn = new GMGNAdapter(process.env.GMGN_API_KEY_ROBINHOOD || process.env.GMGN_API_KEY);
    this.strategyEngine = new StrategyEngine();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.strategyParams = strategyParams;
  }

  /**
   * Runtime config update (chat tool `set_screening_config`). Whitelisted keys
   * only; invalid values are rejected, never silently clamped.
   */
  public updateConfig(partial: Record<string, unknown>): { applied: Record<string, unknown>; rejected: string[] } {
    const { applied, rejected } = validateMemeConfigUpdate(partial);
    this.config = { ...this.config, ...applied };
    if (Object.keys(applied).length > 0) {
      console.log(`[ROBINHOOD AGENT] Config updated: ${JSON.stringify(applied)}`);
    }
    return { applied, rejected };
  }

  public getConfig(): RobinhoodScreeningConfig {
    return { ...this.config };
  }

  /**
   * 3 data sources, all focused on GRADUATED tokens (already on DEX, not
   * bonding curve) with a 1H timeframe:
   * 1. Trending rank (interval 1h, is_out_market filter) — tokens currently rising
   * 2. Trenches completed — just finished bonding curve -> DEX
   * 3. Hot searches (migrated) — most-searched tokens
   * NOTE: token_signal (smart-money/KOL/CTO events) dropped: GMGN never fills
   * volume/swaps in robinhood events & all its fees are < $100 — that source
   * always dies at the volume/fee gate (investigated 2026-08-08).
   */
  public async collectCandidates(): Promise<GMGNRawToken[]> {
    const [rank, trenches, hotSearches] = await Promise.all([
      this.gmgn.fetchRank('robinhood', {
        interval: '1h',
        limit: this.config.rankLimit,
        filters: ['not_honeypot', 'verified', 'renounced', 'is_out_market'],
      }),
      this.gmgn.fetchTrenches('robinhood', {
        types: ['completed'],
        limit: this.config.trenchesLimit,
        filters: { max_rug_ratio: 0.3, max_insider_ratio: 0.3 },
      }),
      this.gmgn.fetchHotSearches({ chain: 'robinhood', interval: '1h', limit: this.config.hotSearchesLimit, filters: ['migrated', 'not_honeypot', 'verified', 'renounced'] }),
    ]);

    const candidates = [
      ...rank,
      ...trenches.completed,
      ...hotSearches,
    ];
    return this.dedupeTokens.dedupe(candidates);
  }

  /**
   * Signal booster map (analytical overlay, NOT a candidate source): GMGN
   * token_signal never fills volume/swaps (any chain), so its events are used
   * to boost confidence on tokens that already pass rank/trenches/hot gates.
   * Fail-open: any error -> empty map, screening proceeds unchanged.
   */
  public async collectSignalBoostMap(): Promise<SignalBoostMap> {
    try {
      const events = await this.gmgn.fetchTokenSignals('robinhood', this.config.signalTypes);
      return buildSignalBoostMap(events);
    } catch (err: any) {
      console.warn(`[ROBINHOOD AGENT] Signal booster failed (skipped): ${err.message}`);
      return new Map();
    }
  }

   /**
    * Smart-money/KOL trade feed per token (accumulation) — analytical overlay:
    * additional candidates (strong accumulation) + cluster boost + card label.
    * Fail-open: error → empty map, screening proceeds as usual.
    */
  public async collectTrackAccumulation(): Promise<Map<string, TrackAccumulation>> {
    if (!this.config.trackFeedEnabled) return new Map();
    try {
      const [sm, kol] = await Promise.all([
        this.gmgn.fetchTrackTrades('robinhood', 'smartmoney'),
        this.gmgn.fetchTrackTrades('robinhood', 'kol'),
      ]);
      const acc = buildTrackAccumulation([...sm, ...kol]);
      if (acc.size > 0) console.log(`[ROBINHOOD AGENT] Track feed: ${acc.size} tokens with smart-money/KOL activity.`);
      return acc;
    } catch (err: any) {
      console.warn(`[ROBINHOOD AGENT] Track feed failed (skipped): ${err.message}`);
      return new Map();
    }
  }

   /**
    * Additional candidates from the track feed (BOOSTER, not a replacement):
    * tokens newly accumulated by smart money (>= minTrackWallets buying
    * wallets, total >= minTrackBuyUsd, fresh <= trackFreshMinutes) but not yet
    * appearing in rank/trenches/hot. Full data fetched via fetchTokenInfo —
    * still goes through ALL pipeline gates (graduated, preFilter, audit,
    * detect, strategy, 80).
    */
  public async collectTrackCandidates(acc: Map<string, TrackAccumulation>): Promise<GMGNRawToken[]> {
    if (!this.config.trackFeedEnabled || acc.size === 0) return [];
    const nowSec = Date.now() / 1000;
    const out: GMGNRawToken[] = [];
    for (const a of acc.values()) {
      if (a.buyWalletCount < this.config.minTrackWallets) continue;
      if (a.totalBuyUsd < this.config.minTrackBuyUsd) continue;
      if (nowSec - a.lastBuyAt > this.config.trackFreshMinutes * 60) continue;
      try {
        const info = await this.gmgn.fetchTokenInfo('robinhood', a.address);
        if (info) out.push(info);
      } catch { /* this token is skipped — it does not affect the others */ }
    }
    if (out.length > 0) {
      console.log(`[ROBINHOOD AGENT] New track candidates: ${out.length} tokens (smart-money accumulation, passed threshold).`);
    }
    return out;
  }

  /**
   * Fail-closed pre-filter (pure math; native price fetched once per pass).
   * Thresholds are seeded from the ACTIVE strategy's prefilter* params when
   * available (loosened presets take effect at runtime); fallback = config.
   */
  public preFilter(t: GMGNRawToken, nativePriceUsd: number | null = null): { ok: boolean; reason: string } {
    const sp = this.strategyParams ? this.strategyParams() : {};
    const num = (v: unknown, fallback: number): number =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
    const overrides: Partial<MemePreFilterConfig> = {
      minVolume1hUsd: num(sp.prefilterVolume1hUsd, this.config.minVolume1hUsd),
      minLiquidityUsd: num(sp.prefilterLiquidityUsd, this.config.minLiquidityUsd),
      minTotalFeeUsd: num(sp.prefilterTotalFeeUsd, this.config.minTotalFeeUsd),
      maxRugRatio: num(sp.prefilterRugRatio, this.config.maxRugRatio),
      maxRatTraderRate: num(sp.prefilterRatTraderRate, this.config.maxRatTraderRate),
      maxTop10HolderRate: num(sp.prefilterTop10HolderRate, this.config.maxTop10HolderRate),
    };
    return preFilterToken(t, { ...this.config, ...overrides }, nativePriceUsd, {
      securityGate: {
        maxRugRatio: overrides.maxRugRatio,
        maxRatTraderRate: overrides.maxRatTraderRate,
        maxTop10HolderRate: overrides.maxTop10HolderRate,
      },
    });
  }

  /** Detect signal type + deterministic confidence (0-100) */
  public detectSignal(t: GMGNRawToken): { type: 'CTO'|'REVIVAL'|'MOMENTUM'|'NONE'; confidence: number; reasons: string[] } {
    return detectMemeSignal(t);
  }

  /** Build call-card payload from real data (or 'N/A') */
  public buildPayload(t: GMGNRawToken, confidence: number, thesis: string, trackLabel?: string): CallCardPayload {
    const ageHours = t.creationTimestamp !== null ? (Date.now()/1000 - t.creationTimestamp)/3600 : null;
    const total = t.buys + t.sells;
    const txRatio = total > 0 ? `Buy ${((t.buys/total)*100).toFixed(0)}% / Sell ${((t.sells/total)*100).toFixed(0)}%` : 'N/A';
    const devStr = t.devTeamHoldRate !== null ? `${(t.devTeamHoldRate*100).toFixed(1)}%${t.creatorClose ? ' (CLOSED)' : ''}` : (t.creatorClose ? 'CLOSED' : 'N/A');
    const rugStr = t.rugRatio !== null ? `${(t.rugRatio*100).toFixed(1)}%` : 'N/A';
    const bundlerStr = t.bundlerRate !== null ? `${(t.bundlerRate*100).toFixed(1)}%` : 'N/A';
    const top10Str = t.top10HolderRate !== null ? `${(t.top10HolderRate*100).toFixed(1)}%` : 'N/A';
    const smStr = trackLabel
      ? `🧠 **Smart Money:** ${trackLabel}`
      : `🧠 **Smart Traders:** ${t.smartDegenCount} wallets (+${t.creatorClose ? 'dev closed' : 'monitoring'})`;

    return {
      domain: 'MEME_ROBINHOOD',
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
      volume24h: (() => { const v = volume24hOf(t); return v > 0 ? `$${(v/1000).toFixed(1)}k` : 'N/A'; })(),
      txRatio,
      top10Pct: top10Str,
      devHoldingPct: devStr,
      sniperPct: 'N/A', // not exposed by rank; keep honest
      bundlerPct: bundlerStr,
      dexPaidStatus: t.dexscrBoostFee > 0 ? `✅ $${t.dexscrBoostFee} boost` : (t.dexscrAd ? '✅ DexScreener ad' : 'None'),
      smartMoneyInfo: smStr,
      confidenceScore: confidence,
      securityScore: rugStr,
      aiThesis: thesis,
      gmgnUrl: `https://gmgn.ai/robinhood/token/${t.address}`,
      dexScreenerUrl: `https://dexscreener.com/robinhood/${t.address}`,
      goplusUrl: `https://gopluslabs.io/token-security/4663/${t.address}`,
      securityAuditPassed: true, // security audit via GMGN in preFilter (rug/honeypot/tax/insider/bundler/top10)
      socialHypeScore: confidence,
      liquidityUsd: t.liquidityUsd,
      volume1hUsd: t.volume1hUsd > 0 ? t.volume1hUsd : volume24hOf(t) / 24,
    };
  }

  /** Full pass: collect -> prefilter (audit GMGN) -> detect -> report */
  public async runScreeningPass(): Promise<AgentReport<RobinhoodSignal>[]> {
    console.log('[ROBINHOOD AGENT] Screening pass started (GMGN OpenAPI)...');
    const reports: AgentReport<RobinhoodSignal>[] = [];

    // 0. Live native price (ETH) — needed once per pass to convert total fees to USD (cached 60s)
    let nativePriceUsd: number | null = null;
    try {
      nativePriceUsd = await this.priceFeed.getPrice('ETH');
      console.log(`[ROBINHOOD AGENT] ETH price: ${nativePriceUsd !== null ? '$' + nativePriceUsd.toFixed(2) : 'UNAVAILABLE (fee gate will reject all)'}`);
    } catch (err: any) {
      console.warn(`[ROBINHOOD AGENT] Failed to fetch ETH price: ${err.message}`);
    }

    // 1. Collect candidates from 3 sources + signal booster overlay + track feed
    const [candidates, signalBoostMap, trackAcc] = await Promise.all([
      this.collectCandidates(),
      this.collectSignalBoostMap(),
      this.collectTrackAccumulation(),
    ]);
    const trackCandidates = await this.collectTrackCandidates(trackAcc);
    // Merge by address (candidates already deduped in collectCandidates; this
    // merge must not hit the 60s dedupe cooldown — plain by-address dedupe only).
    const merged = new Map<string, GMGNRawToken>();
    for (const t of [...candidates, ...trackCandidates]) merged.set(t.address.toLowerCase(), t);
    const allCandidates = [...merged.values()];
    if (signalBoostMap.size > 0) {
      console.log(`[ROBINHOOD AGENT] Signal overlay: ${signalBoostMap.size} tokens with smart-money/KOL/CTO events.`);
    }

    // 2. Pre-filter (cheap, termasuk audit GMGN) then detect
    for (const t of allCandidates) {
      // Graduated-only: reject tokens still on the bonding curve (exchange='pump')
      if (!isGraduatedToken(t)) {
        console.log(`[ROBINHOOD AGENT] ⛔ ${t.symbol}: not yet graduated (bonding curve).`);
        continue;
      }

      const filter = this.preFilter(t, nativePriceUsd);
      if (!filter.ok) { console.log(`[ROBINHOOD AGENT] ${filter.reason}`); continue; }
      // GMGN /v1/token/security audit (fail-closed): honeypot, blacklist,
      // sell-lock, tax. Per-token audit endpoint — rank data (is_honeypot) is
      // blind on the robinhood chain, so this dedicated audit is mandatory.
      const audit = await this.gmgn.fetchTokenSecurity('robinhood', t.address);
      const sec = securityAuditGate(audit);
      if (!sec.ok) {
        console.log(`[ROBINHOOD AGENT] ⛔ ${t.symbol}: AUDIT FAIL — ${sec.reasons.join(' ')}`);
        continue;
      }

      let det = applySignalBoost(this.detectSignal(t), signalBoostMap, t.address);
      // Smart-money cluster (>= 3 wallets buying the same token, fresh) = boost +20
      const trackEntry = trackAcc.get(t.address.toLowerCase());
      const trackLabel = trackEntry ? trackAccumulationLabel(trackEntry) : undefined;
      if (trackEntry && trackEntry.buyWalletCount >= 3 && det.type !== 'NONE') {
        det = {
          ...det,
          confidence: Math.min(100, det.confidence + 20),
          reasons: [...det.reasons, `⚡ Cluster of ${trackEntry.buyWalletCount} smart-money wallets bought $${(trackEntry.totalBuyUsd / 1000).toFixed(0)}k (+20)`],
        };
      }
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
            domain: 'MEME_ROBINHOOD', symbol: t.symbol, contractAddress: t.address,
            priceUsd: t.priceUsd, liquidityUsd: t.liquidityUsd,
            volume24hUsd: volume24hOf(t), volume1hUsd: t.volume1hUsd > 0 ? t.volume1hUsd : volume24hOf(t)/24,
            smartMoneyCount: t.smartDegenCount, securityAuditPassed: true,
            socialHypeScore: confidence,
            gmgn: { ...toStrategyGmgn(t), native_price_usd: nativePriceUsd },
          });
          if (ev?.recommendedAction === 'SKIP') {
            console.log(`[ROBINHOOD AGENT] ⛔ ${t.symbol}: strategy rejected (${ev.reason})`);
            continue;
          }
          if (ev && typeof ev.confidence === 'number') {
            confidence = Math.round(confidence * 0.7 + Math.max(0, Math.min(100, ev.confidence)) * 0.3);
            strategyReason = ev.reason || '';
          }
        }
      } catch (err: any) { console.warn(`[ROBINHOOD AGENT] Strategy failed: ${err.message}`); }

      // Fail-closed: the 80 gate must hold on the FINAL blended confidence
      if (confidence < this.config.passThreshold) {
        console.log(`[ROBINHOOD AGENT] ⚪ ${t.symbol}: ${det.type} ${confidence}% < ${this.config.passThreshold}% (post-strategy)`);
        continue;
      }

      const thesis = buildMemeThesis(t, det.type, confidence, det.reasons, strategyReason);
      const payload = this.buildPayload(t, confidence, thesis, trackLabel);
      const signal: RobinhoodSignal = { token: t, signalType: det.type, confidence, reasons: det.reasons };
      reports.push({ passed: true, signal, reason: thesis, confidence, payload });
      console.log(`[ROBINHOOD AGENT] 🎯 ${det.type} ${t.symbol} ${confidence}%`);
    }

    console.log(`[ROBINHOOD AGENT] Pass complete. ${reports.length} signals passed.`);
    return reports;
  }

  /** Map GMGNRawToken -> snake_case GMGN field contract consumed by strategy .mjs modules */
  public toStrategyGmgn(t: GMGNRawToken): Record<string, unknown> {
    return toStrategyGmgn(t);
  }
}
