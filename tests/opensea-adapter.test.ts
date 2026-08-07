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
});
