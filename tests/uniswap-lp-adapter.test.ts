import { describe, it, expect, vi, afterEach } from 'vitest';
import { UniswapLPAdapter } from '../src/adapters/uniswap-lp-adapter.js';

const realPair = {
  chainId: 'robinhood',
  dexId: 'aerodrome',
  pairAddress: '0xRealPoolAddress',
  baseToken: { symbol: 'ETH', name: 'Ether' },
  quoteToken: { symbol: 'USDC', name: 'USD Coin' },
  priceUsd: '3000',
  liquidity: { usd: 850000 },
  volume: { h24: 880000 },
  feeTier: 3000,
  pairCreatedAt: Date.now() - 3600 * 24 * 30 * 1000,
};

describe('UniswapLPAdapter (Robinhood Chain)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps real DexScreener Robinhood Chain pairs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs: [realPair] }),
    }));
    const adapter = new UniswapLPAdapter();
    const pools = await adapter.fetchTopYieldEVMPools();
    expect(pools.length).toBe(1);
    expect(pools[0].poolAddress).toBe('0xRealPoolAddress');
    expect(pools[0].network).toBe('Robinhood');
    expect(pools[0].tvlUsd).toBe(850000);
    expect(pools[0].volume1hUsd).toBeGreaterThan(0);
    expect(pools[0].feeTierPercentage).toBe(0.3);
  });

  it('only accepts robinhood chain pairs (base/ethereum rejected)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pairs: [
          realPair,
          { ...realPair, chainId: 'base', pairAddress: '0xBasePool' },
          { ...realPair, chainId: 'ethereum', pairAddress: '0xEthPool' },
        ],
      }),
    }));
    const adapter = new UniswapLPAdapter();
    const pools = await adapter.fetchTopYieldEVMPools();
    expect(pools.length).toBe(1);
    expect(pools[0].poolAddress).toBe('0xRealPoolAddress');
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
