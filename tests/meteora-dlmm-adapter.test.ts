import { describe, it, expect, vi, afterEach } from 'vitest';
import { MeteoraDLMMAdapter } from '../src/adapters/meteora-dlmm-adapter.js';

const realPair = {
  chainId: 'solana',
  dexId: 'meteora',
  pairAddress: 'pool123',
  baseToken: { symbol: 'SOL', name: 'Solana' },
  quoteToken: { symbol: 'USDC', name: 'USD Coin' },
  priceUsd: '150',
  liquidity: { usd: 150000 },
  volume: { h24: 120000, h6: 40000 },
  pairCreatedAt: Date.now() - 3600 * 24 * 30 * 1000,
};

describe('MeteoraDLMMAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps real Meteora pairs from DexScreener', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs: [realPair] }),
    }));
    const adapter = new MeteoraDLMMAdapter();
    const pools = await adapter.fetchTopYieldPools();
    expect(pools.length).toBe(1);
    expect(pools[0].poolAddress).toBe('pool123');
    expect(pools[0].tvlUsd).toBe(150000);
    expect(pools[0].volume4hUsd).toBeGreaterThan(0);
    expect(pools[0].tokenAgeMinutes).toBeGreaterThan(240);
  });

  it('returns [] when API fails (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const adapter = new MeteoraDLMMAdapter();
    expect(await adapter.fetchTopYieldPools()).toEqual([]);
  });

  it('skips pairs missing critical fields instead of fabricating them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs: [{ pairAddress: 'partial' }] }),
    }));
    const adapter = new MeteoraDLMMAdapter();
    expect(await adapter.fetchTopYieldPools()).toEqual([]);
  });
});
