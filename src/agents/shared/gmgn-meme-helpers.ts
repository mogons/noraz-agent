/**
 * Shared GMGN meme-agent helpers (Robinhood Chain meme agents).
 *
 * The meme agents are near-identical; everything that is chain-agnostic
 * lives here so thresholds, dedup and the strategy context contract stay in
 * ONE place. No scoring logic changes — this is pure de-duplication.
 */
import type { GMGNRawToken, GMGNSecurityAudit, GMGNTrackTrade } from '../../adapters/gmgn-adapter.js';

export interface MemePreFilterConfig {
  /** Real 1-HOUR volume (GMGN rank/hot interval=1h, trenches volume_1h, DexScreener h1) — required. */
  minVolume1hUsd: number;
  minLiquidityUsd: number;
  minMarketCapUsd: number;
  minAgeHours: number;
  maxRugRatio: number;
  maxRatTraderRate: number;
  maxTop10HolderRate: number;
  minTotalFeeUsd: number;
}

/**
 * Honest 24-hour volume: use the real volume_24h when available; otherwise
 * (rank/hot sources only provide interval-1h volume) estimate ×24. 0 when
 * completely unknown (fail-closed).
 */
export function volume24hOf(t: GMGNRawToken): number {
  if (t.volume24hUsd > 0) return t.volume24hUsd;
  if (t.volume1hUsd > 0) return t.volume1hUsd * 24;
  return 0;
}

export interface MemeSignalResult {
  type: 'CTO' | 'REVIVAL' | 'MOMENTUM' | 'NONE';
  confidence: number;
  reasons: string[];
}

/**
 * Graduated = token has left the bonding curve into the open DEX market.
 * - Robinhood (EVM): `exchange` holds a contract/pool address (0x...) — its
 *   presence means the venue is already formed (not a bonding curve).
 * - DexScreener pairs are by definition already on DEX. Unknown/null = fail-closed reject.
 */
export function isGraduatedToken(t: GMGNRawToken): boolean {
  if (t.source === 'dexscreener') return true;
  const ex = t.exchange?.toLowerCase();
  if (!ex) return false;
  if (ex.startsWith('0x')) return true;
  return ex !== 'pump';
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

/**
 * Signal event map for the analysis booster: address (lowercase) -> the
 * signal types observed + most recent trigger time. Built once per pass from
 * /v1/market/token_signal, which GMGN never populates with volume/swaps for
 * any chain — so it is used as an analytical overlay, not a candidate source.
 */
export type SignalBoostMap = Map<string, { types: number[]; lastTriggerAt: number }>;

export function buildSignalBoostMap(events: Array<{ token_address: string; signal_type: number; trigger_at: number }>): SignalBoostMap {
  const map: SignalBoostMap = new Map();
  for (const e of events) {
    if (!e?.token_address) continue;
    const addr = e.token_address.toLowerCase();
    const cur = map.get(addr);
    if (!cur) {
      map.set(addr, { types: [e.signal_type], lastTriggerAt: e.trigger_at });
    } else {
      if (!cur.types.includes(e.signal_type)) cur.types.push(e.signal_type);
      if (e.trigger_at > cur.lastTriggerAt) cur.lastTriggerAt = e.trigger_at;
    }
  }
  return map;
}

/**
 * Apply the signal booster to a detected signal: if the token has fresh GMGN
 * signal events (smart money / KOL / CTO), add confidence + a reason line.
 * Never lowers confidence; NONE stays NONE (booster can't fabricate a signal).
 */
export function applySignalBoost(
  det: MemeSignalResult,
  boostMap: SignalBoostMap | null,
  address: string
): MemeSignalResult {
  if (!boostMap || !address || det.type === 'NONE') return det;
  const entry = boostMap.get(address.toLowerCase());
  if (!entry) return det;
  const minsAgo = (Date.now() / 1000 - entry.lastTriggerAt) / 60;
  if (minsAgo > 240) return det; // stale events add nothing
  const bonus = minsAgo <= 30 ? 15 : minsAgo <= 120 ? 10 : 5;
  const typesLabel = entry.types.length > 0 ? `(${entry.types.join(',')})` : '';
  const reason = `📡 GMGN signal ${minsAgo.toFixed(0)}m ago ${typesLabel} (+${bonus})`;
  return { ...det, confidence: Math.min(100, det.confidence + bonus), reasons: [...det.reasons, reason] };
}

/** Fail-closed pre-filter (pure math; native price fetched once per pass) */
export function preFilterToken(
  t: GMGNRawToken,
  config: MemePreFilterConfig,
  nativePriceUsd: number | null = null
): { ok: boolean; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason: `⛔ ${t.symbol}: ${reason}` });
  if (t.source === 'dexscreener') {
    // DexScreener fallback lacks GMGN social/CTO fields — allow only volume-based Momentum
    if (t.volume1hUsd < config.minVolume1hUsd) return fail(`volume 1h $${(t.volume1hUsd/1000).toFixed(1)}k < $${config.minVolume1hUsd/1000}k.`);
    if (t.liquidityUsd < config.minLiquidityUsd) return fail(`liq $${(t.liquidityUsd/1000).toFixed(1)}k < $${config.minLiquidityUsd/1000}k.`);
    return { ok: true, reason: 'ok' };
  }
  // Age gate OPTIONAL: only checked when minAgeHours > 0 (degen early = 0 → new tokens pass).
  // creation_timestamp null only fail-closes IF the age gate is active; when 0, age
  // is not a criterion (alpha early), other gates (volume/liq/rug/insider) still run.
  if (config.minAgeHours > 0) {
    if (t.creationTimestamp === null) return fail('age unknown (fail-closed).');
    const ageHours = (Date.now() / 1000 - t.creationTimestamp) / 3600;
    if (ageHours < config.minAgeHours) return fail(`age ${ageHours.toFixed(1)}h < ${config.minAgeHours}h.`);
  }
  // Real 1-HOUR volume (not 24h) — the token must be active RIGHT NOW, not yesterday.
  if (t.volume1hUsd < config.minVolume1hUsd) return fail(`volume 1h $${(t.volume1hUsd/1000).toFixed(1)}k < $${config.minVolume1hUsd/1000}k.`);
  if (t.liquidityUsd < config.minLiquidityUsd) return fail(`liq $${(t.liquidityUsd/1000).toFixed(1)}k < $${config.minLiquidityUsd/1000}k.`);
  // Market cap gate (fail-closed: 0/unknown = reject) — must be above the threshold.
  if (t.marketCapUsd < config.minMarketCapUsd) return fail(`market cap $${(t.marketCapUsd/1000).toFixed(1)}k < $${config.minMarketCapUsd/1000}k.`);
  // GMGN security gate (honeypot, tax, rug, insider, top-10, wash) — shared
  // with the LP agent so security thresholds stay in one source.
  const sec = securityGateToken(t);
  if (!sec.ok) return fail(sec.reasons.join(' '));
  // Total fees gate OPTIONAL: only checked when minTotalFeeUsd > 0. 0 = off (alpha early;
  // new tokens have small fees but the volume gate already filters out dead tokens).
  if (config.minTotalFeeUsd > 0) {
    if (t.totalFeeNative === null) return fail('total fee unknown (fail-closed).');
    if (nativePriceUsd === null || nativePriceUsd <= 0) return fail('live price unavailable — fee conversion failed (fail-closed).');
    const totalFeeUsd = t.totalFeeNative * nativePriceUsd;
    if (totalFeeUsd < config.minTotalFeeUsd) return fail(`total fee $${totalFeeUsd.toFixed(0)} < $${config.minTotalFeeUsd} (${t.totalFeeNative.toFixed(2)} native @ $${nativePriceUsd.toFixed(2)}).`);
  }
  return { ok: true, reason: 'ok' };
}

/**
 * Security audit gate from GMGN `/v1/token/security` (per-token audit endpoint
 * — GMGN UI "Token Audit" panel). FAIL-CLOSED: null/unavailable audit = REJECT
 * (cannot be verified, never pass). Honeypot/blacklist/sell-lock = REJECT;
 * tax gated per option (meme: > 10% reject; LP: disabled).
 */
export interface SecurityAuditGateOptions {
  maxTaxPct?: number;
  /** Gate buy/sell/average tax (default true). LP agent disables this. */
  enableTaxGate?: boolean;
}

const SECURITY_AUDIT_GATE_DEFAULTS: Required<SecurityAuditGateOptions> = {
  maxTaxPct: 10,
  enableTaxGate: true,
};

export function securityAuditGate(
  audit: GMGNSecurityAudit | null,
  opts: SecurityAuditGateOptions = {}
): { ok: boolean; reasons: string[] } {
  const o = { ...SECURITY_AUDIT_GATE_DEFAULTS, ...opts };
  if (!audit) {
    return { ok: false, reasons: ['GMGN audit unavailable (fail-closed).'] };
  }
  const reasons: string[] = [];
  if (audit.isHoneypot) reasons.push('honeypot detected.');
  if (audit.isBlacklist) reasons.push('blacklist.');
  if (audit.canNotSell) reasons.push('cannot be sold (sell-locked).');
  if (o.enableTaxGate) {
    if (audit.buyTaxPct > o.maxTaxPct) reasons.push(`buy tax ${audit.buyTaxPct}% > ${o.maxTaxPct}%.`);
    if (audit.sellTaxPct > o.maxTaxPct) reasons.push(`sell tax ${audit.sellTaxPct}% > ${o.maxTaxPct}%.`);
    if (audit.highTaxPct > o.maxTaxPct) reasons.push(`high tax ${audit.highTaxPct}% > ${o.maxTaxPct}%.`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** Concise GMGN audit label for the card (available fields only). */
export function tokenSecurityAuditLabel(audit: GMGNSecurityAudit | null): string {
  if (!audit) return '⚠️ Not audited (GMGN)';
  const parts: string[] = [];
  if (audit.isRenounced) parts.push('Renounced');
  if (audit.isBlacklist) parts.push('No Blacklist');
  parts.push(`Tax ${audit.averageTaxPct.toFixed(1)}%${audit.highTaxPct > 0 ? `/H ${audit.highTaxPct.toFixed(1)}%` : ''}`);
  if (audit.burnRatioPct > 0) parts.push(`Burn ${audit.burnRatioPct.toFixed(1)}%`);
  if (audit.isLocked) parts.push('Locked');
  return parts.length > 0 ? `✅ GMGN audit — ${parts.join(' • ')}` : '✅ GMGN audit';
}

/**
 * Smart-money/KOL trade feed accumulation per token: how many wallets
 * buy/sell, total USD, full-close. Basis for the candidate source (bullish
 * accumulation) and the exit alert (bearish full-close).
 */
export interface TrackAccumulation {
  address: string;
  symbol: string;
  buyWalletCount: number;
  buyWallets: Set<string>;
  totalBuyUsd: number;
  sellWalletCount: number;
  totalSellUsd: number;
  fullCloseCount: number;
  /** Wallets that performed a full-close (sold entire position) — basis for exit detection. */
  fullCloseWallets: Set<string>;
  fullCloseTotalUsd: number;
  lastFullCloseAt: number;
  lastBuyAt: number;
  lastSellAt: number;
  kinds: Set<'smartmoney' | 'kol'>;
}

export function buildTrackAccumulation(trades: GMGNTrackTrade[]): Map<string, TrackAccumulation> {
  const map = new Map<string, TrackAccumulation>();
  for (const t of trades) {
    let acc = map.get(t.tokenAddress);
    if (!acc) {
      acc = {
        address: t.tokenAddress,
        symbol: t.tokenSymbol,
        buyWalletCount: 0,
        buyWallets: new Set(),
        totalBuyUsd: 0,
        sellWalletCount: 0,
        totalSellUsd: 0,
        fullCloseCount: 0,
        fullCloseWallets: new Set(),
        fullCloseTotalUsd: 0,
        lastFullCloseAt: 0,
        lastBuyAt: 0,
        lastSellAt: 0,
        kinds: new Set(),
      };
      map.set(t.tokenAddress, acc);
    }
    acc.kinds.add(t.kind);
    if (t.side === 'buy') {
      if (!acc.buyWallets.has(t.maker)) {
        acc.buyWallets.add(t.maker);
        acc.buyWalletCount += 1;
      }
      acc.totalBuyUsd += t.amountUsd;
      acc.lastBuyAt = Math.max(acc.lastBuyAt, t.timestamp);
    } else {
      if (t.maker && !acc.buyWallets.has(t.maker)) acc.sellWalletCount += 1;
      acc.totalSellUsd += t.amountUsd;
      acc.lastSellAt = Math.max(acc.lastSellAt, t.timestamp);
      if (t.isFullClose) {
        acc.fullCloseCount += 1;
        if (t.maker) acc.fullCloseWallets.add(t.maker);
        acc.fullCloseTotalUsd += t.amountUsd;
        acc.lastFullCloseAt = Math.max(acc.lastFullCloseAt, t.timestamp);
      }
    }
  }
  return map;
}

/** Accumulation summary for the card: "🧠 3 smart wallets bought $45k in 20m". */
export function trackAccumulationLabel(acc: TrackAccumulation, now = Date.now()): string {
  const mins = acc.lastBuyAt > 0 ? Math.max(0, Math.round((now / 1000 - acc.lastBuyAt) / 60)) : 0;
  return `${acc.buyWalletCount} wallets bought $${(acc.totalBuyUsd / 1000).toFixed(1)}k ${mins <= 0 ? 'just now' : `${mins}m ago`}`;
}

/**
 * Security gate from GMGN data (fail-open per field: null = not reported,
 * skipped) — used by BOTH the meme agent and the LP agent (meme tokens in pools).
 * Default thresholds match the meme config: rug < 0.3, insider < 0.3,
 * top-10 < 0.4, tax <= 10%, honeypot & wash = reject. Bundler is NOT gated
 * (alpha tokens often have high bundler — bundler filter removed 2026-08-09).
 */
export interface SecurityGateOptions {
  maxRugRatio?: number;
  maxRatTraderRate?: number;
  maxTop10HolderRate?: number;
  maxTaxPct?: number;
  /** Gate buy/sell tax (default true). LP agent disables this: LP tokens often have small tax. */
  enableTaxGate?: boolean;
}

const SECURITY_GATE_DEFAULTS: Required<SecurityGateOptions> = {
  maxRugRatio: 0.3,
  maxRatTraderRate: 0.3,
  maxTop10HolderRate: 0.4,
  maxTaxPct: 10,
  enableTaxGate: true,
};

export function securityGateToken(
  t: GMGNRawToken,
  opts: SecurityGateOptions = {}
): { ok: boolean; reasons: string[] } {
  const o = { ...SECURITY_GATE_DEFAULTS, ...opts };
  const reasons: string[] = [];
  if (t.isWashTrading) reasons.push('wash trading detected.');
  if (t.isHoneypot === true) reasons.push('honeypot (cannot be sold).');
  if (o.enableTaxGate) {
    const buyTax = t.buyTax !== null ? Number(t.buyTax) : null;
    const sellTax = t.sellTax !== null ? Number(t.sellTax) : null;
    if (buyTax !== null && buyTax > o.maxTaxPct) reasons.push(`buy tax ${buyTax}% > ${o.maxTaxPct}%.`);
    if (sellTax !== null && sellTax > o.maxTaxPct) reasons.push(`sell tax ${sellTax}% > ${o.maxTaxPct}%.`);
  }
  if (t.rugRatio !== null && t.rugRatio >= o.maxRugRatio) reasons.push(`rug ratio ${(t.rugRatio * 100).toFixed(0)}% >= ${o.maxRugRatio * 100}%.`);
  if (t.ratTraderAmountRate !== null && t.ratTraderAmountRate >= o.maxRatTraderRate) reasons.push(`insider ${(t.ratTraderAmountRate * 100).toFixed(0)}% >= ${o.maxRatTraderRate * 100}%.`);
  if (t.top10HolderRate !== null && t.top10HolderRate >= o.maxTop10HolderRate) reasons.push(`top-10 holder ${(t.top10HolderRate * 100).toFixed(0)}% >= ${o.maxTop10HolderRate * 100}%.`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * Concise token security label for the LP call card (rendered in the embed):
 * only fields reported by GMGN are shown.
 */
export function tokenSecurityLabel(t: GMGNRawToken): string {
  const parts: string[] = [];
  if (t.top10HolderRate !== null) parts.push(`Top10 ${(t.top10HolderRate * 100).toFixed(1)}%`);
  if (t.devTeamHoldRate !== null) parts.push(`Dev ${(t.devTeamHoldRate * 100).toFixed(1)}%`);
  if (t.ratTraderAmountRate !== null) parts.push(`Insider ${(t.ratTraderAmountRate * 100).toFixed(1)}%`);
  if (t.bundlerRate !== null) parts.push(`Bundler ${(t.bundlerRate * 100).toFixed(1)}%`);
  return parts.length > 0 ? `✅ GMGN audited — ${parts.join(' • ')}` : '✅ GMGN audited';
}

/** Detect signal type + deterministic confidence (0-100) */
export function detectMemeSignal(t: GMGNRawToken): MemeSignalResult {
  const reasons: string[] = [];
  const smartDegen = t.smartDegenCount;
  const renowned = t.renownedCount;
  const vol24 = volume24hOf(t);
  const ageHours = t.creationTimestamp !== null ? (Date.now() / 1000 - t.creationTimestamp) / 3600 : null;

  // Quality gate: at least 1 of 3 signals {smart wallet, CTO, KOL} is required.
  // "Empty" tokens (only volume/pump with no smart money/CTO/KOL at all)
  // = noise, not alpha — straight to NONE, never becomes a call.
  const signalStrength = (smartDegen >= 1 ? 1 : 0) + (t.ctoFlag ? 1 : 0) + (renowned >= 1 ? 1 : 0);
  if (signalStrength < 1) {
    return { type: 'NONE', confidence: 0, reasons: ['⚠️ Empty: no smart wallet, CTO, or KOL — skip.'] };
  }

  // CTO (GMGN source only)
  if (t.ctoFlag && t.source === 'gmgn') {
    let score = 40;
    reasons.push('👥 CTO flag GMGN = 1 (+40)');
    if (t.creatorClose || (t.devTeamHoldRate !== null && t.devTeamHoldRate <= 5)) { score += 20; reasons.push('👨‍💻 Dev already closed/burn (+20)'); }
    if (smartDegen >= 2) { score += 15; reasons.push(`🧠 Smart money ${smartDegen} wallets (+15)`); }
    if (renowned >= 1) { score += 10; reasons.push(`⭐ KOL ${renowned} (+10)`); }
    if (vol24 >= 100000) { score += 15; reasons.push(`🔥 Volume $${(vol24/1000).toFixed(0)}k (+15)`); }
    if (ageHours !== null && ageHours < 2) { score += 10; reasons.push('🆕 Recent launch + CTO (+10)'); }
    return { type: 'CTO', confidence: Math.min(100, score), reasons };
  }

  // Revival — ONLY old tokens (age >= 4h): a young token pumping is initial
  // MOMENTUM (degen early), not a revival from the dead.
  if (ageHours !== null && ageHours >= 4 && t.priceChange1h !== null && t.priceChange1h > 50) {
    let score = 15;
    reasons.push('🕐 Age > 4h (+15)');
    score += 30; reasons.push(`📈 Price +${t.priceChange1h.toFixed(0)}% 1h (+30)`);
    if (vol24 >= 100000) { score += 15; reasons.push(`🔥 Volume $${(vol24/1000).toFixed(0)}k (+15)`); }
    if (smartDegen >= 2) { score += 20; reasons.push(`🧠 Smart money ${smartDegen} wallets (+20)`); }
    if (t.creatorClose) { score += 20; reasons.push('👨‍💻 Dev already closed/burn (+20)'); }
    return { type: 'REVIVAL', confidence: Math.min(100, score), reasons };
  }

  // Momentum (including degen early — new tokens that are immediately active)
  {
    let score = 0;
    if (t.priceChange5m !== null && t.priceChange5m > 0) { score += 15; reasons.push(`⚡ 5m +${t.priceChange5m.toFixed(1)}% (+15)`); }
    if (t.priceChange1h !== null && t.priceChange1h > 30) { score += 25; reasons.push(`🚀 1h +${t.priceChange1h.toFixed(0)}% (+25)`); }
    const total = t.buys + t.sells;
    if (total > 0 && t.buys / total > 0.6) { score += 20; reasons.push(`⚖️ Buy ${((t.buys/total)*100).toFixed(0)}% / Sell ${((t.sells/total)*100).toFixed(0)}% (+20)`); }
    if (vol24 >= 100000) { score += 15; reasons.push(`🔥 Volume $${(vol24/1000).toFixed(0)}k (+15)`); }
    if (smartDegen >= 1) { score += 15; reasons.push(`🧠 Smart money ${smartDegen} (+15)`); }
    // Alpha early: new token (< 2h) + smart money entering alongside = strong indication
    if (ageHours !== null && ageHours < 2 && smartDegen >= 1) { score += 10; reasons.push(`🆕 Launch ${ageHours.toFixed(1)}h + smart money entered alongside (+10)`); }
    if (t.top10HolderRate !== null && t.top10HolderRate < 0.3) { score += 10; reasons.push(`👥 Top-10 ${(t.top10HolderRate*100).toFixed(1)}% (+10)`); }
    const visitingBonus = t.visitingCount >= 200 ? 5 : 0;
    if (visitingBonus > 0) { score += visitingBonus; reasons.push(`👀 ${t.visitingCount} GMGN visits (+${visitingBonus})`); }
    if (score <= 0) return { type: 'NONE', confidence: 0, reasons: ['No momentum signal.'] };
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
    volume_24h: volume24hOf(t), // honest: real 24h or est 1h×24 (1h rank only provides 1h volume)
    volume_1h: t.volume1hUsd,
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
  const parts = [`${type} SIGNAL $${t.symbol} (${t.name})`, `Score ${confidence}%`, ...reasons];
  if (strategyReason) parts.push(`Strategy: ${strategyReason}`);
  return parts.join(' | ');
}

/**
 * Validated config update for meme agents (chat tool `set_screening_config`).
 * Whitelist + clamps: unknown keys are rejected, out-of-range values are
 * rejected (never silently clamped) so a bad LLM call can't corrupt screening.
 * Returns { applied, rejected } with human-readable messages.
 */
const MEME_CONFIG_SPEC: Record<string, { min: number; max: number }> = {
  minVolume1hUsd: { min: 1000, max: 100_000_000 },
  minLiquidityUsd: { min: 1000, max: 100_000_000 },
  minMarketCapUsd: { min: 1000, max: 1_000_000_000 },
  minAgeHours: { min: 0, max: 168 },
  maxRugRatio: { min: 0.01, max: 1 },
  maxRatTraderRate: { min: 0.01, max: 1 },
  maxTop10HolderRate: { min: 0.01, max: 1 },
  minTotalFeeUsd: { min: 0, max: 1_000_000 },
  passThreshold: { min: 50, max: 99 },
  rankLimit: { min: 10, max: 100 },
  trenchesLimit: { min: 10, max: 80 },
  hotSearchesLimit: { min: 10, max: 500 },
  minTrackWallets: { min: 1, max: 50 },
  minTrackBuyUsd: { min: 1000, max: 100_000_000 },
  trackFreshMinutes: { min: 1, max: 1440 },
};

/** Boolean keys that may be set via chat (track feed toggle). */
const MEME_BOOL_KEYS = new Set(['trackFeedEnabled']);

export interface MemeConfigUpdateResult {
  applied: Record<string, unknown>;
  rejected: string[];
}

export function validateMemeConfigUpdate(partial: Record<string, unknown>): MemeConfigUpdateResult {
  const applied: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(partial)) {
    if (key === 'signalTypes') {
      if (Array.isArray(value) && value.length > 0 && value.every((v) => Number.isInteger(v) && v >= 1 && v <= 21)) {
        applied.signalTypes = value;
      } else {
        rejected.push(`signalTypes: must be an integer array 1-21 (e.g. [6,7,11,12])`);
      }
      continue;
    }
    if (MEME_BOOL_KEYS.has(key)) {
      if (typeof value === 'boolean') {
        applied[key] = value;
      } else {
        rejected.push(`${key}: must be boolean true/false`);
      }
      continue;
    }
    const spec = MEME_CONFIG_SPEC[key];
    if (!spec) {
      rejected.push(`${key}: unknown key`);
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
      rejected.push(`${key}: must be a number ${spec.min}-${spec.max}`);
      continue;
    }
    applied[key] = n;
  }
  return { applied, rejected };
}
