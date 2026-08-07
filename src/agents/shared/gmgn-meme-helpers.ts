/**
 * Shared GMGN meme-agent helpers (Solana + EVM meme agents).
 *
 * The two meme agents are near-identical; everything that is chain-agnostic
 * lives here so thresholds, dedup and the strategy context contract stay in
 * ONE place. No scoring logic changes — this is pure de-duplication.
 */
import type { GMGNRawToken } from '../../adapters/gmgn-adapter.js';

export interface MemePreFilterConfig {
  minVolume24hUsd: number;
  minLiquidityUsd: number;
  minAgeHours: number;
  maxRugRatio: number;
  maxRatTraderRate: number;
  maxBundlerRate: number;
  maxTop10HolderRate: number;
  minTotalFeeUsd: number;
}

export interface MemeSignalResult {
  type: 'CTO' | 'REVIVAL' | 'MOMENTUM' | 'NONE';
  confidence: number;
  reasons: string[];
}

/** Dedupe by contract address (case-insensitive), 60s cooldown, pruned after 5 min */
export function createDedupe(): { dedupe(tokens: GMGNRawToken[]): GMGNRawToken[] } {
  const seenTokens: Map<string, number> = new Map();
  return {
    dedupe(tokens: GMGNRawToken[]): GMGNRawToken[] {
      const now = Date.now();
      for (const [ca, ts] of seenTokens) {
        if (now - ts > 300_000) seenTokens.delete(ca);
      }
      const out: GMGNRawToken[] = [];
      for (const t of tokens) {
        const key = t.address.toLowerCase();
        if (!key) continue;
        const prev = seenTokens.get(key);
        if (prev !== undefined && now - prev < 60_000) continue;
        seenTokens.set(key, now);
        out.push(t);
      }
      return out;
    },
  };
}

/** Fail-closed pre-filter (pure math; native price fetched once per pass) */
export function preFilterToken(
  t: GMGNRawToken,
  config: MemePreFilterConfig,
  nativePriceUsd: number | null = null,
  tag: string
): { ok: boolean; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason: `⛔ ${t.symbol}: ${reason}` });
  if (t.source === 'dexscreener') {
    // DexScreener fallback lacks GMGN social/CTO fields — allow only volume-based Momentum, still age-gated
    if (t.creationTimestamp === null) return fail('umur tidak diketahui (fail-closed).');
    const ageHours = (Date.now() / 1000 - t.creationTimestamp) / 3600;
    if (ageHours < config.minAgeHours) return fail(`umur ${ageHours.toFixed(1)}h < ${config.minAgeHours}h.`);
    if (t.volume24hUsd < config.minVolume24hUsd) return fail(`volume $${(t.volume24hUsd/1000).toFixed(1)}k < $${config.minVolume24hUsd/1000}k.`);
    if (t.liquidityUsd < config.minLiquidityUsd) return fail(`liq $${(t.liquidityUsd/1000).toFixed(1)}k < $${config.minLiquidityUsd/1000}k.`);
    return { ok: true, reason: 'ok' };
  }
  if (t.creationTimestamp === null) return fail('umur tidak diketahui (fail-closed).');
  const ageHours = (Date.now() / 1000 - t.creationTimestamp) / 3600;
  if (ageHours < config.minAgeHours) return fail(`umur ${ageHours.toFixed(1)}h < ${config.minAgeHours}h.`);
  if (t.volume24hUsd < config.minVolume24hUsd) return fail(`volume $${(t.volume24hUsd/1000).toFixed(1)}k < $${config.minVolume24hUsd/1000}k.`);
  if (t.liquidityUsd < config.minLiquidityUsd) return fail(`liq $${(t.liquidityUsd/1000).toFixed(1)}k < $${config.minLiquidityUsd/1000}k.`);
  if (t.isWashTrading) return fail('wash trading terdeteksi.');
  if (t.rugRatio !== null && t.rugRatio >= config.maxRugRatio) return fail(`rug ratio ${(t.rugRatio*100).toFixed(0)}% >= ${config.maxRugRatio*100}%.`);
  if (t.ratTraderAmountRate !== null && t.ratTraderAmountRate >= config.maxRatTraderRate) return fail(`insider ${(t.ratTraderAmountRate*100).toFixed(0)}% >= ${config.maxRatTraderRate*100}%.`);
  if (t.bundlerRate !== null && t.bundlerRate >= config.maxBundlerRate) return fail(`bundler ${(t.bundlerRate*100).toFixed(0)}% >= ${config.maxBundlerRate*100}%.`);
  if (t.top10HolderRate !== null && t.top10HolderRate >= config.maxTop10HolderRate) return fail(`top-10 holder ${(t.top10HolderRate*100).toFixed(0)}% >= ${config.maxTop10HolderRate*100}%.`);
  // Global total fees gate: total_fee (native SOL/ETH) × live native price must exceed minTotalFeeUsd
  if (t.totalFeeNative === null) return fail('total fee tidak diketahui (fail-closed).');
  if (nativePriceUsd === null || nativePriceUsd <= 0) return fail('harga live tidak tersedia — gagal konversi fee (fail-closed).');
  const totalFeeUsd = t.totalFeeNative * nativePriceUsd;
  if (totalFeeUsd < config.minTotalFeeUsd) return fail(`total fee $${totalFeeUsd.toFixed(0)} < $${config.minTotalFeeUsd} (${t.totalFeeNative.toFixed(2)} native @ $${nativePriceUsd.toFixed(2)}).`);
  return { ok: true, reason: 'ok' };
}

/** Detect signal type + deterministic confidence (0-100) */
export function detectMemeSignal(t: GMGNRawToken): MemeSignalResult {
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

/** Map GMGNRawToken -> snake_case GMGN field contract consumed by strategy .mjs modules */
export function toStrategyGmgn(t: GMGNRawToken): Record<string, unknown> {
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
    total_fee: t.totalFeeNative,
    native_price_usd: null, // filled by the agent per pass (live SOL/ETH price) — see runScreeningPass
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
export function buildMemeThesis(t: GMGNRawToken, type: string, confidence: number, reasons: string[], strategyReason: string): string {
  const parts = [`${type} SIGNAL $${t.symbol} (${t.name})`, `Skor ${confidence}%`, ...reasons];
  if (strategyReason) parts.push(`Strategi: ${strategyReason}`);
  return parts.join(' | ');
}
