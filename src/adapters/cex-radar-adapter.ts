/**
 * CEX Radar Adapter — per-token market context from Binance / Bybit / OKX.
 *
 * Complements the Hyperliquid whale card with the direction of large CEX flows:
 * - ccxt: Open Interest (+ 24h change), funding rate, whale prints (large fills)
 * - keyless public REST: TopTrader L/S ratio (Binance), account L/S ratio
 *   (Bybit/OKX), 24h liquidations (Binance)
 *
 * All endpoints are public without an API key. Fail-open per exchange: error,
 * geoblock, or rate limit → entry is skipped + warn, the rest are still used.
 * Not a filter — purely additional information on the call card.
 */

import ccxt from 'ccxt';

export type CexExchangeId = 'binance' | 'bybit' | 'okx';

export interface CexWhalePrints {
  count: number;       // number of fills >= minPrintUsd
  netBuyUsd: number;   // total USD on the buy side
  netSellUsd: number;  // total USD on the sell side
}

export interface CexRadarEntry {
  exchange: CexExchangeId;
  oiUsd: number;
  oiChange24hPct: number | null;
  fundingRatePct: number | null;
  /** Binance: top trader long/short position ratio (from /futures/data). */
  topTraderLongRatio?: number | null;
  /** Binance (global) / Bybit / OKX: account long vs short ratio. */
  accountLongShortRatio?: number | null;
  /** Binance: total likuidasi 24h (USD). */
  liq24hUsd?: number | null;
  prints: CexWhalePrints;
}

export interface CexRadarReport {
  symbol: string;
  fetchedAt: number;
  entries: CexRadarEntry[];
}

export interface CexRadarOptions {
  /** A fill counts as a "whale print" if the value (price × qty) >= this. */
  minPrintUsd?: number;
  timeoutMs?: number;
  /** DI for tests: ccxt instance per exchange (replaces the real instance). */
  exchanges?: Partial<Record<CexExchangeId, unknown>>;
  /** DI for tests: REST fetch impl (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

/** Mapping symbol Athena -> ccxt perp symbol & REST USDT pair. */
const SYMBOL_MAP: Record<string, { ccxt: string; rest: string }> = {
  BTC: { ccxt: 'BTC/USDT:USDT', rest: 'BTCUSDT' },
  ETH: { ccxt: 'ETH/USDT:USDT', rest: 'ETHUSDT' },
  SOL: { ccxt: 'SOL/USDT:USDT', rest: 'SOLUSDT' },
  HYPE: { ccxt: 'HYPE/USDT:USDT', rest: 'HYPEUSDT' },
};

const EXCHANGES: CexExchangeId[] = ['binance', 'bybit', 'okx'];

export class CexRadarAdapter {
  private minPrintUsd: number;
  private timeoutMs: number;
  private exchanges: Partial<Record<CexExchangeId, unknown>>;
  private fetchImpl: typeof fetch;

  constructor(opts: CexRadarOptions = {}) {
    this.minPrintUsd = opts.minPrintUsd ?? 1_000_000;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.exchanges = opts.exchanges ?? {};
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  /** ccxt instance per exchange — use DI if present, otherwise create a real one. */
  private ccxtFor(id: CexExchangeId): any {
    // Injected keys (including null = dead/unavailable) are respected.
    if (id in this.exchanges) return this.exchanges[id] ?? null;
    const Ex = (ccxt as any)?.[id];
    if (!Ex) return null;
    return new Ex({ enableRateLimit: true, timeout: this.timeoutMs });
  }

  private async rest(url: string): Promise<any | null> {
    try {
      const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return null;
      return await res.json();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[CEX RADAR] REST failed ${url} — ${message}`);
      return null;
    }
  }

  private num(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private numOrZero(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Radar per token. Fail-open per exchange: each sub-endpoint failure
   * fills the field with null/skips — never throws an error to the caller.
   */
  public async fetchRadar(symbol: string): Promise<CexRadarReport> {
    const map = SYMBOL_MAP[symbol.toUpperCase()];
    if (!map) return { symbol, fetchedAt: Date.now(), entries: [] };

    const entries: CexRadarEntry[] = [];
    for (const id of EXCHANGES) {
      const entry = await this.fetchExchange(id, map);
      if (entry) entries.push(entry);
    }
    return { symbol, fetchedAt: Date.now(), entries };
  }

  private async fetchExchange(id: CexExchangeId, map: { ccxt: string; rest: string }): Promise<CexRadarEntry | null> {
    try {
      const ex = this.ccxtFor(id);
      if (!ex) return null;

      // ── OI saat ini + change 24h (ccxt) ──
      let oiUsd = 0;
      let oiChange24hPct: number | null = null;
      try {
        const oi = await ex.fetchOpenInterest(map.ccxt);
        oiUsd = this.numOrZero(oi?.openInterestValue ?? oi?.info?.openInterestValue);
        if (!oiUsd && oi?.openInterestAmount) {
          const ticker = await ex.fetchTicker(map.ccxt);
          oiUsd = Number(oi.openInterestAmount) * (this.numOrZero(ticker?.last) || 0);
        }
      } catch (err: unknown) {
        console.warn(`[CEX RADAR] ${id} OI failed: ${err instanceof Error ? err.message : err}`);
      }
      try {
        const hist = await ex.fetchOpenInterestHistory(map.ccxt, '1h', undefined, 25);
        if (Array.isArray(hist) && hist.length >= 2) {
          const now = hist[hist.length - 1];
          const prev = hist[0];
          const nowV = this.numOrZero(now?.openInterestValue ?? now?.openInterestAmount);
          const prevV = this.numOrZero(prev?.openInterestValue ?? prev?.openInterestAmount);
          if (nowV > 0 && prevV > 0) oiChange24hPct = ((nowV - prevV) / prevV) * 100;
        }
      } catch { /* 24h change unavailable → null */ }

      // ── Funding rate (ccxt) ──
      let fundingRatePct: number | null = null;
      try {
        const fr = await ex.fetchFundingRate(map.ccxt);
        const f = Number(fr?.fundingRate);
        if (Number.isFinite(f)) fundingRatePct = f * 100;
      } catch { /* funding unavailable → null */ }

      // ── Whale prints: fills >= minPrintUsd from public trades (ccxt) ──
      const prints: CexWhalePrints = { count: 0, netBuyUsd: 0, netSellUsd: 0 };
      try {
        const trades = await ex.fetchTrades(map.ccxt, undefined, 1000);
        for (const t of Array.isArray(trades) ? trades : []) {
          const cost = this.numOrZero(t?.cost) || (this.numOrZero(t?.price) * this.numOrZero(t?.amount));
          if (cost < this.minPrintUsd) continue;
          prints.count += 1;
          if (String(t?.side).toLowerCase() === 'sell') prints.netSellUsd += cost;
          else prints.netBuyUsd += cost;
        }
      } catch { /* prints unavailable → 0 */ }

      // ── REST: ratios & liquidations ──
      let topTraderLongRatio: number | null = null;
      let accountLongShortRatio: number | null = null;
      let liq24hUsd: number | null = null;

      if (id === 'binance') {
        const [topLong, topAcc, forceOrders] = await Promise.all([
          this.rest(`https://fapi.binance.com/futures/data/topLongPositionRatio?symbol=${map.rest}&period=1h&limit=1`),
          this.rest(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${map.rest}&period=1h&limit=1`),
          this.rest(`https://fapi.binance.com/futures/data/allForceOrders?symbol=${map.rest}&limit=100`),
        ]);
        topTraderLongRatio = this.num(topLong?.[0]?.longShortRatio);
        accountLongShortRatio = this.num(topAcc?.[0]?.longShortRatio);
        if (Array.isArray(forceOrders)) {
          const now = Date.now();
          let sum = 0;
          for (const o of forceOrders) {
            const t = Number(o?.time ?? o?.updateTime ?? 0);
            if (!t || now - t > 24 * 3600 * 1000) continue;
            sum += this.numOrZero(o?.price) * this.numOrZero(o?.executedQty);
          }
          liq24hUsd = sum > 0 ? sum : null;
        }
      } else if (id === 'bybit') {
        const d = await this.rest(`https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${map.rest}&period=60min&limit=1`);
        const row = d?.result?.list?.[0];
        const buy = this.numOrZero(row?.buyRatio);
        const sell = this.numOrZero(row?.sellRatio);
        accountLongShortRatio = sell > 0 ? buy / sell : null;
      } else if (id === 'okx') {
        const ccy = map.rest.replace(/USDT$/, '');
        const d = await this.rest(`https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio-contract-position?ccy=${ccy}&period=5m&limit=1`);
        accountLongShortRatio = this.num(d?.data?.[0]?.longShortRatio);
      }

      const entry: CexRadarEntry = {
        exchange: id,
        oiUsd,
        oiChange24hPct: Number.isFinite(oiChange24hPct) ? oiChange24hPct : null,
        fundingRatePct,
        topTraderLongRatio,
        accountLongShortRatio,
        liq24hUsd,
        prints,
      };
      // "Completely dead" exchange heuristic: with no data at all → drop the entry
      // (an empty row on the card = noise, not information).
      const hasAnyData = entry.oiUsd > 0
        || entry.fundingRatePct !== null
        || entry.topTraderLongRatio !== null
        || entry.accountLongShortRatio !== null
        || entry.liq24hUsd !== null
        || entry.prints.count > 0;
      return hasAnyData ? entry : null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[CEX RADAR] ${id} completely failed (fail-open skip): ${message}`);
      return null;
    }
  }
}
