/**
 * CEX Radar Adapter — konteks market per token dari Binance / Bybit / OKX.
 *
 * Melengkapi card whale Hyperliquid dengan arah aliran besar di CEX:
 * - ccxt: Open Interest (+ change 24h), funding rate, whale prints (fill besar)
 * - REST publik keyless: TopTrader L/S ratio (Binance), akun L/S ratio
 *   (Bybit/OKX), likuidasi 24h (Binance)
 *
 * Semua endpoint publik tanpa API key. Fail-open per exchange: error,
 * geoblock, atau rate limit → entry di-skip + warn, sisanya tetap dipakai.
 * Bukan filter — murni informasi tambahan di call card.
 */

import ccxt from 'ccxt';

export type CexExchangeId = 'binance' | 'bybit' | 'okx';

export interface CexWhalePrints {
  count: number;       // jumlah fill >= minPrintUsd
  netBuyUsd: number;   // total USD sisi buy
  netSellUsd: number;  // total USD sisi sell
}

export interface CexRadarEntry {
  exchange: CexExchangeId;
  oiUsd: number;
  oiChange24hPct: number | null;
  fundingRatePct: number | null;
  /** Binance: rasio posisi long/short top trader (dari /futures/data). */
  topTraderLongRatio?: number | null;
  /** Binance (global) / Bybit / OKX: rasio akun long vs short. */
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
  /** Fill dianggap "whale print" kalau nilai (price × qty) >= ini. */
  minPrintUsd?: number;
  timeoutMs?: number;
  /** DI untuk test: instance ccxt per exchange (menggantikan instance asli). */
  exchanges?: Partial<Record<CexExchangeId, unknown>>;
  /** DI untuk test: impl fetch REST (default global fetch). */
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

  /** ccxt instance per exchange — pakai DI kalau ada, kalau tidak buat asli. */
  private ccxtFor(id: CexExchangeId): any {
    // Key yang ter-inject (termasuk null = mati/tidak tersedia) dihormati.
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
      console.warn(`[CEX RADAR] REST gagal ${url} — ${message}`);
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
   * Radar per token. Fail-open per exchange: setiap kegagalan sub-endpoint
   * mengisi field null/skip — tidak pernah melempar error ke pemanggil.
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
        console.warn(`[CEX RADAR] ${id} OI gagal: ${err instanceof Error ? err.message : err}`);
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
      } catch { /* change 24h tidak tersedia → null */ }

      // ── Funding rate (ccxt) ──
      let fundingRatePct: number | null = null;
      try {
        const fr = await ex.fetchFundingRate(map.ccxt);
        const f = Number(fr?.fundingRate);
        if (Number.isFinite(f)) fundingRatePct = f * 100;
      } catch { /* funding tidak tersedia → null */ }

      // ── Whale prints: fill >= minPrintUsd dari public trades (ccxt) ──
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
      } catch { /* prints tidak tersedia → 0 */ }

      // ── REST: ratio & likuidasi ──
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
      // Heuristik exchange "mati total": tanpa data apa pun → buang entry
      // (baris kosong di card = noise, bukan informasi).
      const hasAnyData = entry.oiUsd > 0
        || entry.fundingRatePct !== null
        || entry.topTraderLongRatio !== null
        || entry.accountLongShortRatio !== null
        || entry.liq24hUsd !== null
        || entry.prints.count > 0;
      return hasAnyData ? entry : null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[CEX RADAR] ${id} gagal total (fail-open skip): ${message}`);
      return null;
    }
  }
}
