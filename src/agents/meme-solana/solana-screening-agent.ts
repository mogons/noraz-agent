import { GMGNAdapter, GMGNRawToken } from '../../adapters/gmgn-adapter.js';
import { RugCheckService, RugCheckResult } from '../../services/security-service.js';
import { StrategyEngine } from '../../orchestrator/strategy-engine.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';

export interface SolanaSignal {
  token: GMGNRawToken;
  signalType: 'CTO' | 'REVIVAL' | 'MOMENTUM' | 'NONE';
  confidence: number;
  reasons: string[];
}

export interface SolanaScreeningConfig {
  minVolume24hUsd: number;   // 50000
  minLiquidityUsd: number;   // 10000
  minAgeHours: number;       // 4
  maxRugRatio: number;       // 0.3
  maxRatTraderRate: number;  // 0.3
  maxBundlerRate: number;    // 0.5
  maxTop10HolderRate: number;// 0.4
  passThreshold: number;     // 80
  signalTypes: number[];     // [1..13, 17..21]
  rankLimit: number;         // 20
  trenchesLimit: number;     // 20
}

const DEFAULT_CONFIG: SolanaScreeningConfig = {
  minVolume24hUsd: 50000,
  minLiquidityUsd: 10000,
  minAgeHours: 4,
  maxRugRatio: 0.3,
  maxRatTraderRate: 0.3,
  maxBundlerRate: 0.5,
  maxTop10HolderRate: 0.4,
  passThreshold: 80,
  signalTypes: [1,2,3,4,5,6,7,8,9,10,11,12,13,17,18,19,20,21],
  rankLimit: 20,
  trenchesLimit: 20,
};

export class SolanaScreeningAgent implements ScreeningAgent<SolanaSignal> {
  readonly domain = 'meme-solana';
  private gmgn: GMGNAdapter;
  private rugCheck: RugCheckService;
  private strategyEngine: StrategyEngine;
  private config: SolanaScreeningConfig;
  private seenTokens: Map<string, number> = new Map(); // CA -> timestamp (internal dedup, pruned after 5 min)

  constructor(config?: Partial<SolanaScreeningConfig>) {
    this.gmgn = new GMGNAdapter();
    this.rugCheck = new RugCheckService();
    this.strategyEngine = new StrategyEngine();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 1-min cadence: signal feed events (primary trigger) */
  public async collectSignalEvents(): Promise<GMGNRawToken[]> {
    const events = await this.gmgn.fetchTokenSignals('sol', this.config.signalTypes);
    return events.map((e) => e.data).filter((t) => t.address);
  }

  /** 3-min cadence: trenches (alpha: near-completion + completed) */
  public async collectTrenches(): Promise<GMGNRawToken[]> {
    const trenches = await this.gmgn.fetchTrenches('sol', { limit: this.config.trenchesLimit });
    return [...trenches.newCreation, ...trenches.nearCompletion, ...trenches.completed].filter((t) => t.address);
  }

  /** Fail-closed pre-filter (pure math, no external API) */
  public preFilter(t: GMGNRawToken): { ok: boolean; reason: string } {
    if (t.source === 'dexscreener') {
      // DexScreener fallback lacks GMGN social/CTO fields — allow only volume-based Momentum, still age-gated
      if (t.creationTimestamp === null) return { ok: false, reason: `⛔ ${t.symbol}: umur tidak diketahui (fail-closed).` };
      const ageHours = (Date.now() / 1000 - t.creationTimestamp) / 3600;
      if (ageHours < this.config.minAgeHours) return { ok: false, reason: `⛔ ${t.symbol}: umur ${ageHours.toFixed(1)}h < ${this.config.minAgeHours}h.` };
      if (t.volume24hUsd < this.config.minVolume24hUsd) return { ok: false, reason: `⛔ ${t.symbol}: volume $${(t.volume24hUsd/1000).toFixed(1)}k < $${this.config.minVolume24hUsd/1000}k.` };
      if (t.liquidityUsd < this.config.minLiquidityUsd) return { ok: false, reason: `⛔ ${t.symbol}: liq $${(t.liquidityUsd/1000).toFixed(1)}k < $${this.config.minLiquidityUsd/1000}k.` };
      return { ok: true, reason: 'ok' };
    }
    if (t.creationTimestamp === null) return { ok: false, reason: `⛔ ${t.symbol}: umur tidak diketahui (fail-closed).` };
    const ageHours = (Date.now() / 1000 - t.creationTimestamp) / 3600;
    if (ageHours < this.config.minAgeHours) return { ok: false, reason: `⛔ ${t.symbol}: umur ${ageHours.toFixed(1)}h < ${this.config.minAgeHours}h.` };
    if (t.volume24hUsd < this.config.minVolume24hUsd) return { ok: false, reason: `⛔ ${t.symbol}: volume $${(t.volume24hUsd/1000).toFixed(1)}k < $${this.config.minVolume24hUsd/1000}k.` };
    if (t.liquidityUsd < this.config.minLiquidityUsd) return { ok: false, reason: `⛔ ${t.symbol}: liq $${(t.liquidityUsd/1000).toFixed(1)}k < $${this.config.minLiquidityUsd/1000}k.` };
    if (t.isWashTrading) return { ok: false, reason: `⛔ ${t.symbol}: wash trading terdeteksi.` };
    if (t.rugRatio !== null && t.rugRatio >= this.config.maxRugRatio) return { ok: false, reason: `⛔ ${t.symbol}: rug ratio ${(t.rugRatio*100).toFixed(0)}% >= ${this.config.maxRugRatio*100}%.` };
    if (t.ratTraderAmountRate !== null && t.ratTraderAmountRate >= this.config.maxRatTraderRate) return { ok: false, reason: `⛔ ${t.symbol}: insider ${(t.ratTraderAmountRate*100).toFixed(0)}% >= ${this.config.maxRatTraderRate*100}%.` };
    if (t.bundlerRate !== null && t.bundlerRate >= this.config.maxBundlerRate) return { ok: false, reason: `⛔ ${t.symbol}: bundler ${(t.bundlerRate*100).toFixed(0)}% >= ${this.config.maxBundlerRate*100}%.` };
    if (t.top10HolderRate !== null && t.top10HolderRate >= this.config.maxTop10HolderRate) return { ok: false, reason: `⛔ ${t.symbol}: top-10 holder ${(t.top10HolderRate*100).toFixed(0)}% >= ${this.config.maxTop10HolderRate*100}%.` };
    return { ok: true, reason: 'ok' };
  }

  /** Detect signal type + deterministic confidence (0-100) */
  public detectSignal(t: GMGNRawToken): { type: 'CTO'|'REVIVAL'|'MOMENTUM'|'NONE'; confidence: number; reasons: string[] } {
    const reasons: string[] = [];
    const smartDegen = t.smartDegenCount;
    const renowned = t.renownedCount;

    // CTO (GMGN source only)
    if (t.ctoFlag && t.source === 'gmgn') {
      let score = 40;
      reasons.push('👥 CTO flag GMGN = 1 (+40)');
      if (t.creatorClose || (t.devTeamHoldRate !== null && t.devTeamHoldRate <= 5)) { score += 20; reasons.push('👨‍💻 Dev sudah close/burn (+20)'); }
      if (smartDegen >= 2) { score += 15; reasons.push(`🧠 Smart money ${smartDegen} wallet (+15)`); }
      if (renowned >= 1) { score += 10; reasons.push(`⭐ KOL ${renowned} (+10)`); }
      if (t.volume24hUsd >= 100000) { score += 15; reasons.push(`🔥 Volume $${(t.volume24hUsd/1000).toFixed(0)}k (+15)`); }
      return { type: 'CTO', confidence: Math.min(100, score), reasons };
    }

    // Revival
    if (t.priceChange1h !== null && t.priceChange1h > 50) {
      let score = 15;
      reasons.push('🕐 Umur > 4h (+15)');
      score += 30; reasons.push(`📈 Harga +${t.priceChange1h.toFixed(0)}% 1h (+30)`);
      if (t.volume24hUsd >= 100000) { score += 15; reasons.push(`🔥 Volume $${(t.volume24hUsd/1000).toFixed(0)}k (+15)`); }
      if (smartDegen >= 2) { score += 20; reasons.push(`🧠 Smart money ${smartDegen} wallet (+20)`); }
      if (t.creatorClose) { score += 20; reasons.push('👨‍💻 Dev sudah close/burn (+20)'); }
      return { type: 'REVIVAL', confidence: Math.min(100, score), reasons };
    }

    // Momentum
    {
      let score = 0;
      if (t.priceChange5m !== null && t.priceChange5m > 0) { score += 15; reasons.push(`⚡ 5m +${t.priceChange5m.toFixed(1)}% (+15)`); }
      if (t.priceChange1h !== null && t.priceChange1h > 30) { score += 25; reasons.push(`🚀 1h +${t.priceChange1h.toFixed(0)}% (+25)`); }
      const total = t.buys + t.sells;
      if (total > 0 && t.buys / total > 0.6) { score += 20; reasons.push(`⚖️ Buy ${((t.buys/total)*100).toFixed(0)}% / Sell ${((t.sells/total)*100).toFixed(0)}% (+20)`); }
      if (t.volume24hUsd >= 100000) { score += 15; reasons.push(`🔥 Volume $${(t.volume24hUsd/1000).toFixed(0)}k (+15)`); }
      if (smartDegen >= 1) { score += 15; reasons.push(`🧠 Smart money ${smartDegen} (+15)`); }
      if (t.top10HolderRate !== null && t.top10HolderRate < 0.3) { score += 10; reasons.push(`👥 Top-10 ${(t.top10HolderRate*100).toFixed(1)}% (+10)`); }
      const visitingBonus = t.visitingCount >= 200 ? 5 : 0;
      if (visitingBonus > 0) { score += visitingBonus; reasons.push(`👀 ${t.visitingCount} kunjungan GMGN (+${visitingBonus})`); }
      if (score <= 0) return { type: 'NONE', confidence: 0, reasons: ['Tidak ada sinyal momentum.'] };
      return { type: 'MOMENTUM', confidence: Math.min(100, score), reasons };
    }
  }

  /** Build call-card payload from real data (or 'N/A') */
  public buildPayload(t: GMGNRawToken, type: string, confidence: number, reasons: string[], thesis: string): CallCardPayload {
    const ageHours = t.creationTimestamp !== null ? (Date.now()/1000 - t.creationTimestamp)/3600 : null;
    const total = t.buys + t.sells;
    const txRatio = total > 0 ? `Buy ${((t.buys/total)*100).toFixed(0)}% / Sell ${((t.sells/total)*100).toFixed(0)}%` : 'N/A';
    const devStr = t.devTeamHoldRate !== null ? `${(t.devTeamHoldRate*100).toFixed(1)}%${t.creatorClose ? ' (CLOSED)' : ''}` : (t.creatorClose ? 'CLOSED' : 'N/A');
    const rugStr = t.rugRatio !== null ? `${(t.rugRatio*100).toFixed(1)}%` : 'N/A';
    const bundlerStr = t.bundlerRate !== null ? `${(t.bundlerRate*100).toFixed(1)}%` : 'N/A';
    const top10Str = t.top10HolderRate !== null ? `${(t.top10HolderRate*100).toFixed(1)}%` : 'N/A';
    const sniperStr = 'N/A'; // not exposed by rank; keep honest

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
      volume24h: t.volume24hUsd > 0 ? `$${(t.volume24hUsd/1000).toFixed(1)}k` : 'N/A',
      txRatio,
      top10Pct: top10Str,
      devHoldingPct: devStr,
      sniperPct: sniperStr,
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
      volume1hUsd: t.volume24hUsd / 24,
    };
  }

  /** Full pass: collect -> prefilter -> rugcheck -> detect -> report */
  public async runScreeningPass(): Promise<AgentReport<SolanaSignal>[]> {
    console.log('[SOLANA AGENT] Screening pass started (GMGN OpenAPI)...');
    const reports: AgentReport<SolanaSignal>[] = [];

    // 1. Collect candidates: signal events (primary) + trenches (alpha)
    const events = await this.gmgn.fetchTokenSignals('sol', this.config.signalTypes);
    const eventTokens = events.map((e) => e.data).filter((t) => t.address);
    const trenches = await this.gmgn.fetchTrenches('sol', { limit: this.config.trenchesLimit });
    const trenchTokens = [...trenches.newCreation, ...trenches.nearCompletion, ...trenches.completed];
    const candidates = this.dedupe([...eventTokens, ...trenchTokens]);

    // 2. Pre-filter (cheap) then RugCheck (expensive) then detect
    for (const t of candidates) {
      const filter = this.preFilter(t);
      if (!filter.ok) { console.log(`[SOLANA AGENT] ${filter.reason}`); continue; }

      const audit: RugCheckResult = await this.rugCheck.auditSolanaToken(t.address);
      if (!audit.isSafeForRunner) {
        console.log(`[SOLANA AGENT] ⛔ ${t.symbol}: RugCheck tidak lolos (score ${audit.score}).`);
        continue;
      }

      const det = this.detectSignal(t);
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
          const ev = strat.evaluate({
            domain: 'MEME_SOLANA', symbol: t.symbol, contractAddress: t.address,
            priceUsd: t.priceUsd, liquidityUsd: t.liquidityUsd,
            volume24hUsd: t.volume24hUsd, volume1hUsd: t.volume24hUsd/24,
            smartMoneyCount: t.smartDegenCount, securityAuditPassed: true,
            socialHypeScore: confidence, gmgn: this.toStrategyGmgn(t),
          });
          if (ev && typeof ev.confidence === 'number') {
            if (ev.recommendedAction === 'SKIP') { console.log(`[SOLANA AGENT] ⛔ ${t.symbol}: strategi menolak (${ev.reason})`); continue; }
            confidence = Math.round(confidence * 0.7 + Math.max(0, Math.min(100, ev.confidence)) * 0.3);
            strategyReason = ev.reason || '';
          }
        }
      } catch (err: any) { console.warn(`[SOLANA AGENT] Strategi gagal: ${err.message}`); }

      const thesis = this.buildThesis(t, det.type, confidence, det.reasons, strategyReason);
      const payload = this.buildPayload(t, det.type, confidence, det.reasons, thesis);
      const signal: SolanaSignal = { token: t, signalType: det.type, confidence, reasons: det.reasons };
      reports.push({ passed: true, signal, reason: thesis, confidence, payload });
      console.log(`[SOLANA AGENT] 🎯 ${det.type} ${t.symbol} ${confidence}%`);
    }

    console.log(`[SOLANA AGENT] Pass selesai. ${reports.length} sinyal lolos.`);
    return reports;
  }

  /** Dedupe by contract address (case-insensitive), 60s cooldown via internal map */
  public dedupe(tokens: GMGNRawToken[]): GMGNRawToken[] {
    const now = Date.now();
    // Prune stale entries (> 5 min) so the 24/7 daemon never leaks memory
    for (const [ca, ts] of this.seenTokens) {
      if (now - ts > 300_000) this.seenTokens.delete(ca);
    }
    const out: GMGNRawToken[] = [];
    for (const t of tokens) {
      const key = t.address.toLowerCase();
      if (!key) continue;
      const prev = this.seenTokens.get(key);
      if (prev !== undefined && now - prev < 60_000) continue;
      this.seenTokens.set(key, now);
      out.push(t);
    }
    return out;
  }

  /** Map GMGNRawToken -> snake_case GMGN field contract consumed by strategy .mjs modules */
  public toStrategyGmgn(t: GMGNRawToken): Record<string, unknown> {
    return {
      chain: t.chain,
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      source: t.source,
      ageHours: t.creationTimestamp !== null ? (Date.now() / 1000 - t.creationTimestamp) / 3600 : null,
      volume_24h: t.volume24hUsd,
      liquidity: t.liquidityUsd,
      is_wash_trading: t.isWashTrading ? 1 : 0,
      cto_flag: t.ctoFlag ? 1 : 0,
      creator_close: t.creatorClose,
      creator_token_status: t.creatorTokenStatus,
      dev_team_hold_rate: t.devTeamHoldRate,
      rug_ratio: t.rugRatio,
      bundler_rate: t.bundlerRate,
      rat_trader_amount_rate: t.ratTraderAmountRate,
      top_10_holder_rate: t.top10HolderRate,
      smart_degen_count: t.smartDegenCount,
      renowned_count: t.renownedCount,
      buys: t.buys,
      sells: t.sells,
      swaps: t.swaps,
      holder_count: t.holderCount,
      market_cap_usd: t.marketCapUsd,
      price_change_percent5m: t.priceChange5m,
      price_change_percent1h: t.priceChange1h,
      visiting_count: t.visitingCount,
      twitter_rename_count: t.twitterRenameCount,
      twitter_del_post_token_count: t.twitterDelPostCount,
      twitter_create_token_count: t.twitterCreateTokenCount,
    };
  }

  /** Deterministic thesis text (no LLM) */
  public buildThesis(t: GMGNRawToken, type: string, confidence: number, reasons: string[], strategyReason: string): string {
    const parts = [`${type} SIGNAL $${t.symbol} (${t.name})`, `Skor ${confidence}%`, ...reasons];
    if (strategyReason) parts.push(`Strategi: ${strategyReason}`);
    return parts.join(' | ');
  }
}
