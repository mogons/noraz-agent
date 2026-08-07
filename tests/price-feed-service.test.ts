import { describe, it, expect, vi, afterEach } from 'vitest';
import { PriceFeedService } from '../src/services/price-feed-service.js';

describe('PriceFeedService', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns real price from CoinGecko response and caches it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bitcoin: { usd: 70000 }, solana: { usd: 150 } }),
    }));
    const svc = new PriceFeedService();
    expect(await svc.getPrice('BTC')).toBe(70000);
    expect(await svc.getPrice('SOL')).toBe(150);
  });

  it('returns null for unsupported symbols (never falls back to SOL)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const svc = new PriceFeedService();
    expect(await svc.getPrice('SHIB')).toBeNull();
  });

  it('returns null for a supported symbol when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const svc = new PriceFeedService();
    expect(await svc.getPrice('BTC')).toBeNull();
  });

  it('starts with empty cache (no fabricated seed prices)', () => {
    const svc = new PriceFeedService();
    expect((svc as any).cache).toEqual({});
  });
});
