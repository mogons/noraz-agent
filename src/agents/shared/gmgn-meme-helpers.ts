/**
 * Shared GMGN meme-agent helpers (Solana + EVM meme agents).
 *
 * The two meme agents are near-identical; everything that is chain-agnostic
 * lives here so thresholds, dedup and the strategy context contract stay in
 * ONE place. No scoring logic changes — this is pure de-duplication.
 */
import type { GMGNRawToken, GMGNSecurityAudit } from '../../adapters/gmgn-adapter.js';

export interface MemePreFilterConfig {
  /** Volume 1 JAM real (GMGN rank/hot interval=1h, trenches volume_1h, DexScreener h1) — wajib. */
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
 * Volume 24 jam yang jujur: pakai volume_24h real bila tersedia; kalau tidak
 * (sumber rank/hot cuma kasih volume interval-1h), estimasi ×24. 0 bila tidak
 * diketahui sama sekali (fail-closed).
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
 * Graduated = token sudah keluar dari bonding curve ke DEX open market.
 * - SOL: GMGN menandai venue lewat `exchange` — 'pump' = masih internal
 *   pump.fun market; 'pump_amm'/'raydium'/'meteora'/dll = sudah di DEX.
 * - EVM: `exchange` berisi contract/pool address (0x...) — kehadirannya
 *   menandakan venue sudah terbentuk (bukan bonding curve).
 * - DexScreener pairs by definition sudah di DEX. Unknown/null = fail-closed reject.
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
  const reason = `📡 Signal GMGN ${minsAgo.toFixed(0)}m lalu ${typesLabel} (+${bonus})`;
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
  // Age gate OPSIONAL: minAgeHours > 0 baru dicek (degen early = 0 → token baru lolos).
  // creation_timestamp null hanya fail-closed KALAU age gate aktif; kalau 0, umur
  // tidak jadi kriteria (alpha early), gate lain (volume/liq/rug/insider) tetap jalan.
  if (config.minAgeHours > 0) {
    if (t.creationTimestamp === null) return fail('umur tidak diketahui (fail-closed).');
    const ageHours = (Date.now() / 1000 - t.creationTimestamp) / 3600;
    if (ageHours < config.minAgeHours) return fail(`umur ${ageHours.toFixed(1)}h < ${config.minAgeHours}h.`);
  }
  // Volume 1 JAM real (bukan 24h) — token harus ramai SEKARANG, bukan kemarin.
  if (t.volume1hUsd < config.minVolume1hUsd) return fail(`volume 1h $${(t.volume1hUsd/1000).toFixed(1)}k < $${config.minVolume1hUsd/1000}k.`);
  if (t.liquidityUsd < config.minLiquidityUsd) return fail(`liq $${(t.liquidityUsd/1000).toFixed(1)}k < $${config.minLiquidityUsd/1000}k.`);
  // Market cap gate (fail-closed: 0/tidak diketahui = tolak) — wajib di atas ambang.
  if (t.marketCapUsd < config.minMarketCapUsd) return fail(`market cap $${(t.marketCapUsd/1000).toFixed(1)}k < $${config.minMarketCapUsd/1000}k.`);
  // Security gate GMGN (honeypot, tax, rug, insider, top-10, wash) — shared
  // dengan LP agent supaya ambang keamanan tetap satu sumber.
  const sec = securityGateToken(t);
  if (!sec.ok) return fail(sec.reasons.join(' '));
  // Total fees gate OPSIONAL: minTotalFeeUsd > 0 baru dicek. 0 = off (alpha early;
  // token baru fee-nya kecil tapi volume gate sudah menyaring token mati).
  if (config.minTotalFeeUsd > 0) {
    if (t.totalFeeNative === null) return fail('total fee tidak diketahui (fail-closed).');
    if (nativePriceUsd === null || nativePriceUsd <= 0) return fail('harga live tidak tersedia — gagal konversi fee (fail-closed).');
    const totalFeeUsd = t.totalFeeNative * nativePriceUsd;
    if (totalFeeUsd < config.minTotalFeeUsd) return fail(`total fee $${totalFeeUsd.toFixed(0)} < $${config.minTotalFeeUsd} (${t.totalFeeNative.toFixed(2)} native @ $${nativePriceUsd.toFixed(2)}).`);
  }
  return { ok: true, reason: 'ok' };
}

/**
 * Gate audit keamanan dari GMGN `/v1/token/security` (endpoint audit per-token
 * — panel "Token Audit" UI GMGN). FAIL-CLOSED: audit null/tidak tersedia = TOLAK
 * (tidak bisa diverifikasi, jangan pernah lolos). Honeypot/blacklist/sell-lock
 * = TOLAK; tax digate sesuai opsi (meme: > 10% tolak; LP: dimatikan).
 */
export interface SecurityAuditGateOptions {
  maxTaxPct?: number;
  /** Gate buy/sell/average tax (default true). LP agent mematikan ini. */
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
    return { ok: false, reasons: ['audit GMGN tidak tersedia (fail-closed).'] };
  }
  const reasons: string[] = [];
  if (audit.isHoneypot) reasons.push('honeypot terdeteksi.');
  if (audit.isBlacklist) reasons.push('blacklist.');
  if (audit.canNotSell) reasons.push('tidak bisa dijual (sell-locked).');
  if (o.enableTaxGate) {
    if (audit.buyTaxPct > o.maxTaxPct) reasons.push(`buy tax ${audit.buyTaxPct}% > ${o.maxTaxPct}%.`);
    if (audit.sellTaxPct > o.maxTaxPct) reasons.push(`sell tax ${audit.sellTaxPct}% > ${o.maxTaxPct}%.`);
    if (audit.highTaxPct > o.maxTaxPct) reasons.push(`high tax ${audit.highTaxPct}% > ${o.maxTaxPct}%.`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** Label ringkas audit GMGN untuk card (field yang tersedia saja). */
export function tokenSecurityAuditLabel(audit: GMGNSecurityAudit | null): string {
  if (!audit) return '⚠️ Tidak teraudit (GMGN)';
  const parts: string[] = [];
  if (audit.isRenounced) parts.push('Renounced');
  if (audit.isBlacklist) parts.push('No Blacklist');
  parts.push(`Tax ${audit.averageTaxPct.toFixed(1)}%${audit.highTaxPct > 0 ? `/H ${audit.highTaxPct.toFixed(1)}%` : ''}`);
  if (audit.burnRatioPct > 0) parts.push(`Burn ${audit.burnRatioPct.toFixed(1)}%`);
  if (audit.isLocked) parts.push('Locked');
  return parts.length > 0 ? `✅ GMGN audit — ${parts.join(' • ')}` : '✅ GMGN audit';
}

/**
 * Security gate dari data GMGN (fail-open per field: null = tidak dilaporkan,
 * dilewati) — dipakai meme agent DAN LP agent (token meme di pool).
 * Ambang default identik dengan meme config: rug < 0.3, insider < 0.3,
 * top-10 < 0.4, tax <= 10%, honeypot & wash = tolak. Bundler TIDAK digate
 * (token alpha sering bundler tinggi — filter bundler dihapus 2026-08-09).
 */
export interface SecurityGateOptions {
  maxRugRatio?: number;
  maxRatTraderRate?: number;
  maxTop10HolderRate?: number;
  maxTaxPct?: number;
  /** Gate buy/sell tax (default true). LP agent mematikan ini: token LP sering punya tax kecil. */
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
  if (t.isWashTrading) reasons.push('wash trading terdeteksi.');
  if (t.isHoneypot === true) reasons.push('honeypot (tidak bisa dijual).');
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
 * Label ringkas keamanan token untuk call card LP (render di embed): hanya
 * field yang dilaporkan GMGN yang ditampilkan.
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

  // Quality gate: minimal 1 dari 3 sinyal {smart wallet, CTO, KOL} wajib ada.
  // Token "kosongan" (cuma volume/pump tanpa smart money/CTO/KOL sama sekali)
  // = noise, bukan alpha — langsung NONE, tidak pernah jadi call.
  const signalStrength = (smartDegen >= 1 ? 1 : 0) + (t.ctoFlag ? 1 : 0) + (renowned >= 1 ? 1 : 0);
  if (signalStrength < 1) {
    return { type: 'NONE', confidence: 0, reasons: ['⚠️ Kosongan: tanpa smart wallet, CTO, maupun KOL — skip.'] };
  }

  // CTO (GMGN source only)
  if (t.ctoFlag && t.source === 'gmgn') {
    let score = 40;
    reasons.push('👥 CTO flag GMGN = 1 (+40)');
    if (t.creatorClose || (t.devTeamHoldRate !== null && t.devTeamHoldRate <= 5)) { score += 20; reasons.push('👨‍💻 Dev sudah close/burn (+20)'); }
    if (smartDegen >= 2) { score += 15; reasons.push(`🧠 Smart money ${smartDegen} wallet (+15)`); }
    if (renowned >= 1) { score += 10; reasons.push(`⭐ KOL ${renowned} (+10)`); }
    if (vol24 >= 100000) { score += 15; reasons.push(`🔥 Volume $${(vol24/1000).toFixed(0)}k (+15)`); }
    if (ageHours !== null && ageHours < 2) { score += 10; reasons.push('🆕 Launch baru + CTO (+10)'); }
    return { type: 'CTO', confidence: Math.min(100, score), reasons };
  }

  // Revival — HANYA token lama (umur >= 4h): token muda yang pump itu MOMENTUM
  // awal (degen early), bukan revival dari kematian.
  if (ageHours !== null && ageHours >= 4 && t.priceChange1h !== null && t.priceChange1h > 50) {
    let score = 15;
    reasons.push('🕐 Umur > 4h (+15)');
    score += 30; reasons.push(`📈 Harga +${t.priceChange1h.toFixed(0)}% 1h (+30)`);
    if (vol24 >= 100000) { score += 15; reasons.push(`🔥 Volume $${(vol24/1000).toFixed(0)}k (+15)`); }
    if (smartDegen >= 2) { score += 20; reasons.push(`🧠 Smart money ${smartDegen} wallet (+20)`); }
    if (t.creatorClose) { score += 20; reasons.push('👨‍💻 Dev sudah close/burn (+20)'); }
    return { type: 'REVIVAL', confidence: Math.min(100, score), reasons };
  }

  // Momentum (termasuk degen early — token baru yang langsung ramai)
  {
    let score = 0;
    if (t.priceChange5m !== null && t.priceChange5m > 0) { score += 15; reasons.push(`⚡ 5m +${t.priceChange5m.toFixed(1)}% (+15)`); }
    if (t.priceChange1h !== null && t.priceChange1h > 30) { score += 25; reasons.push(`🚀 1h +${t.priceChange1h.toFixed(0)}% (+25)`); }
    const total = t.buys + t.sells;
    if (total > 0 && t.buys / total > 0.6) { score += 20; reasons.push(`⚖️ Buy ${((t.buys/total)*100).toFixed(0)}% / Sell ${((t.sells/total)*100).toFixed(0)}% (+20)`); }
    if (vol24 >= 100000) { score += 15; reasons.push(`🔥 Volume $${(vol24/1000).toFixed(0)}k (+15)`); }
    if (smartDegen >= 1) { score += 15; reasons.push(`🧠 Smart money ${smartDegen} (+15)`); }
    // Alpha early: token baru (< 2h) + smart money masuk bareng = indikasi kuat
    if (ageHours !== null && ageHours < 2 && smartDegen >= 1) { score += 10; reasons.push(`🆕 Launch ${ageHours.toFixed(1)}h + smart money masuk bareng (+10)`); }
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
    volume_24h: volume24hOf(t), // jujur: real 24h atau est 1h×24 (rank 1h cuma kasih volume 1h)
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
  const parts = [`${type} SIGNAL $${t.symbol} (${t.name})`, `Skor ${confidence}%`, ...reasons];
  if (strategyReason) parts.push(`Strategi: ${strategyReason}`);
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
};

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
        rejected.push(`signalTypes: harus array integer 1-21 (mis. [6,7,11,12])`);
      }
      continue;
    }
    const spec = MEME_CONFIG_SPEC[key];
    if (!spec) {
      rejected.push(`${key}: kunci tidak dikenal`);
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
      rejected.push(`${key}: harus angka ${spec.min}-${spec.max}`);
      continue;
    }
    applied[key] = n;
  }
  return { applied, rejected };
}
