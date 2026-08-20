import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenSeaAdapter } from '../src/adapters/opensea-adapter.js';

// Fixture structure follows REAL OpenSea API v2 (verified live):
// stats → { total: { floor_price }, intervals: [{ interval: 'one_day'|'seven_day', volume, sales }] }
// floor_prices → { floor_prices: [{ time, token_unit }] } (timeframe=one_day, resolution=25)
// collections → { safelist_request_status: 'verified'|'not_requested'|... } (badge verified)
// events → { asset_events: [{ event_type: 'sale', event_timestamp, buyer, payment: { quantity, decimals } }] }

const HOUR = 3600;
const t0 = () => Math.floor(Date.now() / 1000);

const mkStats = (over: any = {}) => ({
  total: { floor_price: 8.0, sales: 1000, num_owners: 5000, volume: 50000, floor_price_symbol: 'ETH' },
  intervals: [
    { interval: 'one_day', volume: 50, sales: 12 },
    { interval: 'seven_day', volume: 200, sales: 60 },
    { interval: 'thirty_day', volume: 900, sales: 250 },
  ],
  ...over,
});

const mkFloorPrices = (now: number, nowEth: number, oneHAgoEth: number) => {
  const points = [];
  for (let i = 24; i >= 0; i--) {
    const t = now - i * HOUR;
    // rising from oneHAgoEth → nowEth over the past 1 hour: only current point (i=0) is nowEth
    const eth = i === 0 ? nowEth : oneHAgoEth;
    points.push({ time: t, token_unit: eth, usd_price: String(eth * 3000), symbol: 'ETH', chain: 'robinhood' });
  }
  return { floor_prices: points };
};

const mkSaleEvent = (over: any = {}) => ({
  event_type: 'sale',
  event_timestamp: t0() - HOUR,
  buyer: '0xwhale1',
  seller: '0xseller',
  chain: 'robinhood',
  payment: { quantity: '4000000000000000000', decimals: 18, symbol: 'ETH', token_address: '0x0000' },
  nft: { identifier: '1', name: 'Pudgy #1' },
  ...over,
});

describe('OpenSeaAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENSEA_API_KEY; delete process.env.OPENSEA_BACKUP_KEYS; });

  it('fetchTrendingCollections: single request for robinhood, parse slug/name/chain', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        collections: [
          { collection: 'pudgypenguins', name: 'Pudgy Penguins', contracts: [{ address: '0x1', chain: 'robinhood' }] },
          { collection: 'rbh-nft', name: 'RBH NFT', contracts: [{ address: '0x2', chain: 'robinhood' }] },
          { collection: 'hood-punks', name: 'Hood Punks', contracts: [{ address: '0x3', chain: 'robinhood' }] },
        ],
      }),
    }));
    const adapter = new OpenSeaAdapter();
    const cols = await adapter.fetchTrendingCollections(['robinhood'], 5);
    expect(cols).toHaveLength(3);
    expect(cols[0].slug).toBe('pudgypenguins');
    expect(cols[0].chain).toBe('robinhood');
    expect(cols[1].chain).toBe('robinhood');
    expect(cols[2].chain).toBe('robinhood');
    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toContain('chains=robinhood');
    expect(url).toContain('limit=5');
  });

  it('fetchTrendingCollections: [] without key / API fails (fail-closed)', async () => {
    const adapter = new OpenSeaAdapter();
    expect(await adapter.fetchTrendingCollections()).toEqual([]);
    process.env.OPENSEA_API_KEY = 'os-test';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await adapter.fetchTrendingCollections()).toEqual([]);
  });

  it('computes surge/velocity/volume-spike from REAL v2 data (stats + floor_prices + events)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    const now = t0();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mkStats() })                                     // stats
      .mockResolvedValueOnce({ ok: true, json: async () => mkFloorPrices(now, 8.0, 6.0) })                 // floor_prices: 8.0 vs 6.0 = +33.3%
      .mockResolvedValueOnce({ ok: true, json: async () => ({ safelist_request_status: 'verified' }) })    // collection detail: verified
      .mockResolvedValueOnce({ ok: true, json: async () => ({ asset_events: [
        mkSaleEvent({ event_timestamp: now - 600 }),    // within 1 hour (volume 1h)
        mkSaleEvent({ event_timestamp: now - 1800 }),   // within 1 hour (volume 1h)
        mkSaleEvent({ event_timestamp: now - 1.5 * HOUR }), // 1.5h ago → baseline 1-2h
      ] }) }));                                                                                             // events sale
    const adapter = new OpenSeaAdapter();
    const signals = await adapter.fetchFloorSnipingSignals('pudgypenguins');
    expect(signals.length).toBe(1);
    const s = signals[0];
    expect(s.floorPriceEth).toBe(8.0);
    expect(s.floorSurge1hPct).toBeGreaterThan(30);   // floor rises 8 vs 6 = +33%
    expect(s.salesVelocity1h).toBe(2);               // 2 sales in past 1 hour
    expect(s.volumeSpike1hRatio).toBe(2);            // 8 ETH (1h) vs 4 ETH (1-2h baseline)
    expect(s.isVerified).toBe(true);                 // safelist_request_status === 'verified'
    expect(s.chain).toBe('robinhood');
  });

  it('whale sweep detected factually: single buyer buys 3+ within 1 hour', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    const now = t0();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mkStats() })
      .mockResolvedValueOnce({ ok: true, json: async () => mkFloorPrices(now, 8.0, 8.0) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ safelist_request_status: 'not_requested' }) }) // unverified
      .mockResolvedValueOnce({ ok: true, json: async () => ({ asset_events: [
        mkSaleEvent({ event_timestamp: now - 600 }),
        mkSaleEvent({ event_timestamp: now - 1200 }),
        mkSaleEvent({ event_timestamp: now - 1800 }),
      ] }) }));
    const adapter = new OpenSeaAdapter();
    const [s] = await adapter.fetchFloorSnipingSignals('pudgypenguins');
    expect(s.isWhaleSweep).toBe(true);
    expect(s.isVerified).toBe(false);
    expect(s.whaleInfo?.address).toBe('0xwhale1');
    expect(s.whaleInfo?.buyCount).toBe(3);
    expect(s.whaleInfo?.spentEth).toBeCloseTo(12, 5); // 3 × 4 ETH
  });

  it('without valid events → velocity & spike fallback honestly to 24h stats', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    const now = t0();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mkStats() })
      .mockResolvedValueOnce({ ok: true, json: async () => mkFloorPrices(now, 8.0, 8.0) })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) }) // collection detail rejected → isVerified false
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })); // events rejected by key
    const adapter = new OpenSeaAdapter();
    const [s] = await adapter.fetchFloorSnipingSignals('pudgypenguins');
    expect(s.isWhaleSweep).toBe(false);
    expect(s.isVerified).toBe(false); // fail-closed: cannot be verified = unverified
    // one_day vol 50 vs baseline 6 days ((200-50)/6=25) → 2.0x; velocity 12/24 = 0.5
    expect(s.volumeSpike1hRatio).toBeCloseTo(2.0, 5);
    expect(s.salesVelocity1h).toBeCloseTo(0.5, 5);
  });

  it('returns [] without an API key (no fake signals)', async () => {
    const adapter = new OpenSeaAdapter();
    expect(await adapter.fetchFloorSnipingSignals('pudgypenguins')).toEqual([]);
  });

  it('returns [] on API failure (fail-closed)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const adapter = new OpenSeaAdapter();
    expect(await adapter.fetchFloorSnipingSignals('pudgypenguins')).toEqual([]);
  });

  it('returns [] when floor price is 0 (fail-closed)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mkStats({ total: { floor_price: 0 } }) }));
    const adapter = new OpenSeaAdapter();
    expect(await adapter.fetchFloorSnipingSignals('pudgypenguins')).toEqual([]);
  });

  it('swap quote fails closed on API error (no fabricated output)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    process.env.DRY_RUN = 'false'; // exercise the live quote path
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API down')));
    const adapter = new OpenSeaAdapter();
    const quote = await adapter.getSwapQuote({ chain: 'robinhood', fromToken: 'ETH', toToken: 'USDC', amount: 1.0 });
    expect(quote.success).toBe(false);
    expect(quote.expectedAmountOut).toBe(0);
    expect(quote.error).toBeTruthy();
    expect(quote.simulated).toBe(false); // never mask a real failure as simulation
  });

  it('swap quote fails closed when API omits expected_out (no amount*0.998 fabrication)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    process.env.DRY_RUN = 'false';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // no expected_out
    }));
    const adapter = new OpenSeaAdapter();
    const quote = await adapter.getSwapQuote({ chain: 'robinhood', fromToken: 'ETH', toToken: 'USDC', amount: 1.0 });
    expect(quote.success).toBe(false);
    expect(quote.expectedAmountOut).toBe(0);
  });

  it('executeSwap aborts when the quote failed (never broadcasts a fake quote)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    process.env.DRY_RUN = 'false';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API down')));
    const adapter = new OpenSeaAdapter();
    const wallet = { hasWallet: () => true, getEvmAddress: () => '0xabc', getEvmWalletClient: () => null, getEvmAccount: () => null } as any;
    const res = await adapter.executeSwap({ chain: 'robinhood', fromToken: 'ETH', toToken: 'USDC', amount: 1.0 }, wallet);
    expect(res.success).toBe(false);
    expect(res.txHash).toBeUndefined();
  });

  it('rotates to the backup key on 401 and succeeds', async () => {
    process.env.OPENSEA_API_KEY = 'pk1';
    process.env.OPENSEA_BACKUP_KEYS = 'pk2';
    const adapter = new OpenSeaAdapter();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ collections: [] }), { status: 200 });
    }));
    await adapter.fetchTrendingCollections();
    expect(calls).toBe(2);
    const secondInit = vi.mocked(fetch).mock.calls[1][1] as RequestInit;
    const secondHeaders = (secondInit?.headers ?? {}) as Record<string, string>;
    expect(secondHeaders['x-api-key']).toBe('pk2');
    vi.unstubAllGlobals();
    delete process.env.OPENSEA_BACKUP_KEYS;
  });
});
