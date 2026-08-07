import { describe, it, expect, vi, afterEach } from 'vitest';
import { MeteoraDLMMAdapter } from '../src/adapters/meteora-dlmm-adapter.js';

const realPair = {
  address: 'pool123',
  name: 'SOL-USDC',
  tvl: 150000,
  volume_24h: 120000,
  fees_24h: 360,
  apr: 95.0,
  bin_step: 20,
  current_price: 150.0,
  liquidity: 45000,
  timestamp_created: Date.now() / 1000 - 3600 * 24 * 30,
};

describe('MeteoraDLMMAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps real DLMM API pools', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [realPair],
    }));
    const adapter = new MeteoraDLMMAdapter();
    const pools = await adapter.fetchTopYieldPools();
    expect(pools.length).toBe(1);
    expect(pools[0].poolAddress).toBe('pool123');
    expect(pools[0].tvlUsd).toBe(150000);
    expect(pools[0].volume4hUsd).toBeGreaterThan(0);
    expect(pools[0].fee4hUsd).toBeGreaterThan(0);
    expect(pools[0].binStep).toBe(20);
    expect(pools[0].tokenAgeMinutes).toBeGreaterThan(240);
  });

  it('returns [] when API fails (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const adapter = new MeteoraDLMMAdapter();
    expect(await adapter.fetchTopYieldPools()).toEqual([]);
  });

  it('skips pools missing critical fields instead of fabricating them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ address: 'partial' }],
    }));
    const adapter = new MeteoraDLMMAdapter();
    expect(await adapter.fetchTopYieldPools()).toEqual([]);
  });
});
