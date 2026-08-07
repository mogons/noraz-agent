import { describe, it, expect, vi, afterEach } from 'vitest';
import { PolymarketAdapter } from '../src/adapters/polymarket-adapter.js';

const gammaEvent = {
  id: 1,
  title: 'Will BTC reach 100k in 2026?',
  category: 'Crypto',
  slug: 'btc-100k-2026',
  volume24hr: '2500000',
  liquidity: '800000',
  markets: [
    {
      id: 100,
      conditionId: '0xcond',
      clobTokenIds: ['0xclob1', '0xclob2'],
      outcomePrices: '["0.72","0.28"]',
      endDate: '2026-12-31T23:59:59Z',
      slug: 'btc-100k-2026',
    },
  ],
};

describe('PolymarketAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps real Gamma markets and real CLOB bid/ask', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [gammaEvent] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          bids: [{ price: 0.71, size: 1000 }],
          asks: [{ price: 0.73, size: 1000 }],
        }),
      }));
    const adapter = new PolymarketAdapter();
    const markets = await adapter.fetchTopMarkets('Crypto');
    expect(markets.length).toBe(1);
    expect(markets[0].bestBidYes).toBe(0.71);
    expect(markets[0].bestAskYes).toBe(0.73);
    expect(markets[0].volume24hUsd).toBe(2500000);
  });

  it('returns [] on API failure — no fabricated fallback markets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const adapter = new PolymarketAdapter();
    expect(await adapter.fetchTopMarkets('Crypto')).toEqual([]);
  });
});
