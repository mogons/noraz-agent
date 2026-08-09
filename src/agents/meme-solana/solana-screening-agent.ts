import { GMGNAdapter, GMGNRawToken } from '../../adapters/gmgn-adapter.js';
import { globalPriceFeedService } from '../../services/price-feed-service.js';
import { StrategyEngine } from '../../orchestrator/strategy-engine.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';
import { createDedupe, preFilterToken, detectMemeSignal, volume24hOf, buildSignalBoostMap, applySignalBoost, toStrategyGmgn, buildMemeThesis, isGraduatedToken, validateMemeConfigUpdate, securityAuditGate, buildTrackAccumulation, trackAccumulationLabel } from '../shared/gmgn-meme-helpers.js';
import type { SignalBoostMap, TrackAccumulation } from '../shared/gmgn-meme-helpers.js';

export interface SolanaSignal {
  token: GMGNRawToken;
  signalType: 'CTO' | 'REVIVAL' | 'MOMENTUM' | 'NONE';
  confidence: number;
  reasons: string[];
}

export interface SolanaScreeningConfig {
  minVolume1hUsd: number;    // 50000 — volume 1 JAM real (token harus ramai SEKARANG)
  minLiquidityUsd: number;   // 10000
  minMarketCapUsd: number;   // 100000 — wajib di atas $100k (MC 0/tidak diketahui = tolak)
  minAgeHours: number;       // 0 — degen early: token baru langsung lolos (smart money/CTO/KOL jadi penentu)
  maxRugRatio: number;       // 0.3
  maxRatTraderRate: number;  // 0.3
  maxTop10HolderRate: number;// 0.4
  minTotalFeeUsd: number;    // 500 — gate fee aktif: token tanpa aktivitas organik (fee tak tercatat) ditolak
  passThreshold: number;     // 80
  signalTypes: number[];     // smart-money/KOL/CTO/price events (overlay boost)
  rankLimit: number;         // 100 (trending, 1h)
  trenchesLimit: number;     // 80 (completed only)
  hotSearchesLimit: number;  // 100 (hot searches, migrated)
  trackFeedEnabled: boolean; // true — trade feed smart money = kandidat tambahan (booster, bukan pengganti)
  minTrackWallets: number;   // 2 — minimal wallet smart-money beli token sama
  minTrackBuyUsd: number;    // 10000 — minimal total beli USD
  trackFreshMinutes: number; // 30 — window fresh akumulasi
}

const DEFAULT_CONFIG: SolanaScreeningConfig = {
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

export class SolanaScreeningAgent implements ScreeningAgent<SolanaSignal> {
  readonly domain = 'meme-solana';
  private gmgn: GMGNAdapter;
  private priceFeed = globalPriceFeedService;
  private strategyEngine: StrategyEngine;
  private config: SolanaScreeningConfig;
  private dedupeTokens = createDedupe();

  constructor(config?: Partial<SolanaScreeningConfig>) {
    this.gmgn = new GMGNAdapter();
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
        filters: { max_rug_ratio: 0.3, max_insider_ratio: 0.3 },
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

  /**
   * Trade feed smart-money/KOL per token (akumulasi) — overlay analitis:
   * kandidat tambahan (akumulasi kuat) + cluster boost + label card.
   * Fail-open: error → map kosong, screening berjalan seperti biasa.
   */
  public async collectTrackAccumulation(): Promise<Map<string, TrackAccumulation>> {
    if (!this.config.trackFeedEnabled) return new Map();
    try {
      const [sm, kol] = await Promise.all([
        this.gmgn.fetchTrackTrades('sol', 'smartmoney'),
        this.gmgn.fetchTrackTrades('sol', 'kol'),
      ]);
      const acc = buildTrackAccumulation([...sm, ...kol]);
      if (acc.size > 0) console.log(`[SOLANA AGENT] Track feed: ${acc.size} token dengan aktivitas smart-money/KOL.`);
      return acc;
    } catch (err: any) {
      console.warn(`[SOLANA AGENT] Track feed gagal (dilewati): ${err.message}`);
      return new Map();
    }
  }

  /**
   * Kandidat tambahan dari track feed (BOOSTER, bukan pengganti): token yang
   * baru diakumulasi smart money (>= minTrackWallets wallet beli, total >=
   * minTrackBuyUsd, fresh <= trackFreshMinutes) tapi belum muncul di
   * rank/trenches/hot. Data lengkap via fetchTokenInfo — tetap lewat SEMUA
   * gate pipeline (graduated, preFilter, audit, detect, strategi, 80).
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
        const info = await this.gmgn.fetchTokenInfo('sol', a.address);
        if (info) out.push(info);
      } catch { /* token ini di-skip — tidak mengganggu yang lain */ }
    }
    if (out.length > 0) {
      console.log(`[SOLANA AGENT] Track kandidat baru: ${out.length} token (akumulasi smart money, lolos ambang).`);
    }
    return out;
  }

  /** Fail-closed pre-filter (pure math; native price fetched once per pass) */
  public preFilter(t: GMGNRawToken, nativePriceUsd: number | null = null): { ok: boolean; reason: string } {
    return preFilterToken(t, this.config, nativePriceUsd);
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
      smartMoneyInfo: smStr,
      confidenceScore: confidence,
      securityScore: rugStr,
      aiThesis: thesis,
      gmgnUrl: `https://gmgn.ai/sol/token/${t.address}`,
      dexScreenerUrl: `https://dexscreener.com/solana/${t.address}`,
      rugcheckUrl: `https://rugcheck.xyz/tokens/${t.address}`,
      securityAuditPassed: true, // audit keamanan via GMGN di preFilter (rug/honeypot/tax/insider/bundler/top10)
      socialHypeScore: confidence,
      liquidityUsd: t.liquidityUsd,
      volume1hUsd: t.volume1hUsd > 0 ? t.volume1hUsd : volume24hOf(t) / 24,
    };
  }

  /** Full pass: collect -> prefilter (audit GMGN) -> detect -> report */
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

    // 1. Collect candidates from 3 sources + signal booster overlay + track feed
    const [candidates, signalBoostMap, trackAcc] = await Promise.all([
      this.collectCandidates(),
      this.collectSignalBoostMap(),
      this.collectTrackAccumulation(),
    ]);
    const trackCandidates = await this.collectTrackCandidates(trackAcc);
    // Merge by address (candidates sudah di-dedupe di collectCandidates; merge
    // ini tidak boleh kena cooldown 60s dedupe — cukup dedupe by-address).
    const merged = new Map<string, GMGNRawToken>();
    for (const t of [...candidates, ...trackCandidates]) merged.set(t.address.toLowerCase(), t);
    const allCandidates = [...merged.values()];
    if (signalBoostMap.size > 0) {
      console.log(`[SOLANA AGENT] Signal overlay: ${signalBoostMap.size} token punya event smart-money/KOL/CTO.`);
    }

    // 2. Pre-filter (cheap) then detect
    for (const t of allCandidates) {
      // Graduated-only: reject tokens still on the bonding curve (exchange='pump')
      if (!isGraduatedToken(t)) {
        console.log(`[SOLANA AGENT] ⛔ ${t.symbol}: belum graduated (bonding curve).`);
        continue;
      }

      const filter = this.preFilter(t, nativePriceUsd);
      if (!filter.ok) { console.log(`[SOLANA AGENT] ${filter.reason}`); continue; }
      // Audit keamanan GMGN /v1/token/security (fail-closed): honeypot, blacklist,
      // sell-lock, tax — lapisan kedua di atas data rank (konsisten dgn robinhood).
      const audit = await this.gmgn.fetchTokenSecurity('sol', t.address);
      const sec = securityAuditGate(audit);
      if (!sec.ok) {
        console.log(`[SOLANA AGENT] ⛔ ${t.symbol}: AUDIT FAIL — ${sec.reasons.join(' ')}`);
        continue;
      }

      let det = applySignalBoost(this.detectSignal(t), signalBoostMap, t.address);
      // Cluster smart money (>= 3 wallet beli token sama, fresh) = boost +20
      const trackEntry = trackAcc.get(t.address.toLowerCase());
      const trackLabel = trackEntry ? trackAccumulationLabel(trackEntry) : undefined;
      if (trackEntry && trackEntry.buyWalletCount >= 3 && det.type !== 'NONE') {
        det = {
          ...det,
          confidence: Math.min(100, det.confidence + 20),
          reasons: [...det.reasons, `⚡ Cluster ${trackEntry.buyWalletCount} wallet smart-money beli $${(trackEntry.totalBuyUsd / 1000).toFixed(0)}k (+20)`],
        };
      }
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
      const payload = this.buildPayload(t, confidence, thesis, trackLabel);
      const signal: SolanaSignal = { token: t, signalType: det.type, confidence, reasons: det.reasons };
      reports.push({ passed: true, signal, reason: thesis, confidence, payload });
      console.log(`[SOLANA AGENT] 🎯 ${det.type} ${t.symbol} ${confidence}%`);
    }

    console.log(`[SOLANA AGENT] Pass selesai. ${reports.length} sinyal lolos.`);
    return reports;
  }

  /** Map GMGNRawToken -> snake_case GMGN field contract consumed by strategy .mjs modules */
  public toStrategyGmgn(t: GMGNRawToken): Record<string, unknown> {
    return toStrategyGmgn(t);
  }
}
