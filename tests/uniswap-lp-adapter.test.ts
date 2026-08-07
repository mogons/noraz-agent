import { describe, it, expect, vi, afterEach } from 'vitest';
import { UniswapLPAdapter } from '../src/adapters/uniswap-lp-adapter.js';

const realPair = {
  chainId: 'base',
  dexId: 'uniswap',
  pairAddress: '0xRealPoolAddress',
  baseToken: { symbol: 'ETH', name: 'Ether' },
  quoteToken: { symbol: 'USDC', name: 'USD Coin' },
  priceUsd: '3000',
  liquidity: { usd: 850000 },
  volume: { h24: 880000 },
  feeTier: 3000,
};

describe('UniswapLPAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps real DexScreener Uniswap v3 pairs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs: [realPair] }),
    }));
    const adapter = new UniswapLPAdapter();
    const pools = await adapter.fetchTopYieldEVMPools();
    expect(pools.length).toBe(1);
    expect(pools[0].poolAddress).toBe('0xRealPoolAddress');
    expect(pools[0].network).toBe('Base');
    expect(pools[0].tvlUsd).toBe(850000);
    expect(pools[0].volume4hUsd).toBeGreaterThan(0);
    expect(pools[0].feeTierPercentage).toBe(0.3);
  });

  it('returns [] when API fails (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const adapter = new UniswapLPAdapter();
    expect(await adapter.fetchTopYieldEVMPools()).toEqual([]);
  });

  it('does not contain the fake sample pool address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pairs: [] }) }));
    const adapter = new UniswapLPAdapter();
    const pools = await adapter.fetchTopYieldEVMPools();
    const addrs = pools.map((p) => p.poolAddress).join(' ');
    expect(addrs).not.toContain('ShitCoIn');
    expect(addrs).not.toContain('FakE');
  });
});
