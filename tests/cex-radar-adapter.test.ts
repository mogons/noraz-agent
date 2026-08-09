import { describe, it, expect, vi, afterEach } from 'vitest';
import { CexRadarAdapter } from '../src/adapters/cex-radar-adapter.js';

const HOUR = 3600 * 1000;

/** ccxt instance palsu per exchange — hanya method yang dipakai adapter. */
const mkFakeExchange = (over: Record<string, unknown> = {}) => ({
  fetchOpenInterest: vi.fn(async () => ({ openInterestValue: 12_400_000_000, openInterestAmount: 1240 })),
  fetchOpenInterestHistory: vi.fn(async () => {
    const arr: Array<{ openInterestValue: number }> = [];
    for (let i = 24; i >= 0; i--) arr.push({ openInterestValue: i === 0 ? 12_400_000_000 : 12_000_000_000 });
    return arr; // first = 24h lalu (12B), last = sekarang (12.4B) → +3.33%
  }),
  fetchFundingRate: vi.fn(async () => ({ fundingRate: 0.00012 })), // 0.012%
  fetchTrades: vi.fn(async () => [
    { cost: 1_500_000, side: 'buy' },
    { cost: 2_000_000, side: 'sell' },
    { cost: 500_000, side: 'buy' }, // < $1M → bukan print
  ]),
  ...over,
});

/** Router fetch untuk endpoint REST publik (fail kalau URL tidak dikenal). */
const mkRestRouter = () => {
  const routes: Record<string, () => Promise<any>> = {
    binanceTopLong: async () => [{ longShortRatio: '1.8' }],
    binanceGlobal: async () => [{ longShortRatio: '1.2' }],
    binanceForce: async () => [
      { price: '60000', executedQty: '200', time: Date.now() },                 // $12M, dalam 24h
      { price: '60000', executedQty: '200', time: Date.now() - 25 * HOUR },     // di luar 24h → diabaikan
    ],
    bybitRatio: async () => ({ result: { list: [{ buyRatio: '0.55', sellRatio: '0.45' }] } }),
    okxRatio: async () => ({ data: [{ longShortRatio: '1.4' }] }),
  };
  return vi.fn(async (url: string) => {
    const u = String(url);
    let body: unknown = null;
    if (u.includes('topLongPositionRatio')) body = await routes.binanceTopLong();
    else if (u.includes('globalLongShortAccountRatio')) body = await routes.binanceGlobal();
    else if (u.includes('allForceOrders')) body = await routes.binanceForce();
    else if (u.includes('bybit.com')) body = await routes.bybitRatio();
    else if (u.includes('okx.com')) body = await routes.okxRatio();
    return { ok: body !== null, json: async () => body };
  });
};

describe('CexRadarAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('membangun report lengkap untuk BTC: OI+24h, funding, ratio, prints, liq dari 3 exchange', async () => {
    const fetchImpl = mkRestRouter();
    const adapter = new CexRadarAdapter({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exchanges: { binance: mkFakeExchange(), bybit: mkFakeExchange(), okx: mkFakeExchange() },
    });
    const report = await adapter.fetchRadar('BTC');
    expect(report.symbol).toBe('BTC');
    expect(report.entries).toHaveLength(3);

    const binance = report.entries.find((e) => e.exchange === 'binance')!;
    expect(binance.oiUsd).toBe(12_400_000_000);
    expect(binance.oiChange24hPct).toBeCloseTo(3.33, 1);
    expect(binance.fundingRatePct).toBeCloseTo(0.012, 3);
    expect(binance.topTraderLongRatio).toBe(1.8);
    expect(binance.accountLongShortRatio).toBe(1.2);
    expect(binance.liq24hUsd).toBe(12_000_000); // hanya force order dalam 24h
    expect(binance.prints).toEqual({ count: 2, netBuyUsd: 1_500_000, netSellUsd: 2_000_000 });

    const bybit = report.entries.find((e) => e.exchange === 'bybit')!;
    expect(bybit.accountLongShortRatio).toBeCloseTo(0.55 / 0.45, 5); // 1.2222
    expect(bybit.topTraderLongRatio).toBeNull();

    const okx = report.entries.find((e) => e.exchange === 'okx')!;
    expect(okx.accountLongShortRatio).toBe(1.4);
  });

  it('fail-open: exchange yang error/geblok total di-skip, sisanya tetap ada', async () => {
    const fetchImpl = mkRestRouter();
    const adapter = new CexRadarAdapter({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exchanges: {
        binance: mkFakeExchange(),
        bybit: null, // instance ccxt tidak tersedia (geblok/tidak ada) → skip
        okx: mkFakeExchange({ fetchTrades: vi.fn(async () => { throw new Error('rate limit'); }) }),
      },
    });
    const report = await adapter.fetchRadar('BTC');
    expect(report.entries.map((e) => e.exchange)).toEqual(['binance', 'okx']);
    const okx = report.entries.find((e) => e.exchange === 'okx')!;
    expect(okx.prints).toEqual({ count: 0, netBuyUsd: 0, netSellUsd: 0 }); // prints fail → 0, bukan error
  });

  it('semua exchange mati → entries kosong (fail-open, tidak throw, tanpa network)', async () => {
    const adapter = new CexRadarAdapter({
      exchanges: { binance: null, bybit: null, okx: null },
    });
    const report = await adapter.fetchRadar('BTC');
    expect(report.entries).toHaveLength(0);
  });

  it('symbol mapping: HYPE → HYPEUSDT di REST; symbol tak dikenal → entries kosong', async () => {
    const fetchImpl = mkRestRouter();
    const adapter = new CexRadarAdapter({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exchanges: { binance: mkFakeExchange(), bybit: mkFakeExchange(), okx: mkFakeExchange() },
    });
    const report = await adapter.fetchRadar('HYPE');
    expect(report.entries).toHaveLength(3);
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('symbol=HYPEUSDT'))).toBe(true);
    expect((await adapter.fetchRadar('UNKNOWN')).entries).toHaveLength(0);
  });

  it('prints dihitung dari cost (price × amount) saat field cost tidak ada', async () => {
    const adapter = new CexRadarAdapter({
      exchanges: {
        binance: mkFakeExchange({
          fetchTrades: vi.fn(async () => [{ price: 60000, amount: 20, side: 'buy' }]), // $1.2M
        }),
        bybit: mkFakeExchange({ fetchTrades: vi.fn(async () => []) }),
        okx: mkFakeExchange({ fetchTrades: vi.fn(async () => []) }),
      },
    });
    const report = await adapter.fetchRadar('BTC');
    const binance = report.entries.find((e) => e.exchange === 'binance')!;
    expect(binance.prints).toEqual({ count: 1, netBuyUsd: 1_200_000, netSellUsd: 0 });
  });
});
