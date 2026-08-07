import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenSeaAdapter } from '../src/adapters/opensea-adapter.js';

describe('OpenSeaAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENSEA_API_KEY; });

  it('computes surge/velocity from real stats instead of hardcoding them', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: { floor_price: 12.5, volume: 850, one_day_change: 0.35 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: Array.from({ length: 30 }, () => ({
            event_type: 'successful',
            transaction: { from_account: { address: '0xwhale1' } },
          })),
        }),
      }));
    const adapter = new OpenSeaAdapter();
    const signals = await adapter.fetchFloorSnipingSignals('pudgypenguins');
    expect(signals.length).toBe(1);
    expect(signals[0].floorSurge4hPct).toBeGreaterThanOrEqual(0);
    expect(signals[0].salesVelocity1h).toBeGreaterThan(0);
    expect(signals[0].isWhaleSweep).toBeTypeOf('boolean');
    expect(signals[0].whaleInfo?.address ?? '').not.toContain('0x7a2B49');
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

  it('swap quote fails closed on API error (no fabricated output)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    process.env.DRY_RUN = 'false'; // exercise the live quote path
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API down')));
    const adapter = new OpenSeaAdapter();
    const quote = await adapter.getSwapQuote({ chain: 'ethereum', fromToken: 'ETH', toToken: 'USDC', amount: 1.0 });
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
    const quote = await adapter.getSwapQuote({ chain: 'ethereum', fromToken: 'ETH', toToken: 'USDC', amount: 1.0 });
    expect(quote.success).toBe(false);
    expect(quote.expectedAmountOut).toBe(0);
  });

  it('executeSwap aborts when the quote failed (never broadcasts a fake quote)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    process.env.DRY_RUN = 'false';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API down')));
    const adapter = new OpenSeaAdapter();
    const wallet = { hasWallet: () => true, getEvmAddress: () => '0xabc', getEvmWalletClient: () => null, getEvmAccount: () => null } as any;
    const res = await adapter.executeSwap({ chain: 'ethereum', fromToken: 'ETH', toToken: 'USDC', amount: 1.0 }, wallet);
    expect(res.success).toBe(false);
    expect(res.txHash).toBeUndefined();
  });

  it('floor surge uses one_day_change as percentage (no 100x inflation)', async () => {
    process.env.OPENSEA_API_KEY = 'os-test';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: { floor_price: 10, volume: 500, one_day_change: 0.35 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: [] }) }));
    const adapter = new OpenSeaAdapter();
    const [sig] = await adapter.fetchFloorSnipingSignals('pudgypenguins');
    expect(sig.floorSurge4hPct).toBe(0.35); // not 35
  });
});
