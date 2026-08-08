import { describe, it, expect, vi, afterEach } from 'vitest';
import { KrystalCloudAdapter } from '../src/adapters/krystal-cloud-adapter.js';

const mkPool = (over: Record<string, unknown> = {}) => ({
  chain: { name: 'Robinhood', id: 4663 },
  poolAddress: '0xpool1',
  poolPrice: '1',
  protocol: { name: 'Uniswap V3', factoryAddress: '0x1f7d7550b1b028f7571e69a784071f0205fd2efa' },
  feeTier: 3000,
  tickSpacing: 60,
  currentSqrtPriceX96: '1',
  token0: { token: { address: '0xweth', symbol: 'WETH', name: 'Wrapped ETH', decimals: 18, logo: '' }, balance: '1' },
  token1: { token: { address: '0xusdc', symbol: 'USDC', name: 'USD Coin', decimals: 6, logo: '' }, balance: '1' },
  tvl: '150000',
  stats1h: { volume: '5000', fee: '20', apr: 28.4 },
  stats24h: { volume: '120000', fee: '360', apr: 26.3 },
  stats7d: { volume: '800000', fee: '2400', apr: 30 },
  stats30d: { volume: '3000000', fee: '9000', apr: 25 },
  incentives: [],
  ...over,
});

const stubFetch = (data: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  }));

describe('KrystalCloudAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.KRYSTAL_CLOUD_API_KEY; });

  it('isConfigured false tanpa key (fail-closed)', () => {
    expect(new KrystalCloudAdapter().isConfigured()).toBe(false);
    process.env.KRYSTAL_CLOUD_API_KEY = 'test';
    expect(new KrystalCloudAdapter().isConfigured()).toBe(true);
  });

  it('maps real Krystal pools (robinhood 4663)', async () => {
    process.env.KRYSTAL_CLOUD_API_KEY = 'test';
    stubFetch([mkPool()]);
    const adapter = new KrystalCloudAdapter();
    const pools = await adapter.fetchTopRobinhoodPools();
    expect(pools.length).toBe(1);
    const p = pools[0];
    expect(p.poolAddress).toBe('0xpool1');
    expect(p.pairName).toBe('WETH-USDC');
    expect(p.tvlUsd).toBe(150000);
    expect(p.fee1hUsd).toBe(20);
    expect(p.volume24hUsd).toBe(120000);
    expect(p.feesToTvlRatio24h).toBeCloseTo(0.0024, 5);
    expect(p.network).toBe('Robinhood');
    // activeTvl proxy = fee_rate × tvl = (20/5000) × 150000 = 600
    expect(p.activeTvlUsd).toBeCloseTo(600, 5);
    expect(p.volumeToActiveTvlRatio1h).toBeCloseTo(8.33, 2);
  });

  it('mengirim chainId robinhood + filter server-side', async () => {
    process.env.KRYSTAL_CLOUD_API_KEY = 'test';
    stubFetch([]);
    const adapter = new KrystalCloudAdapter();
    await adapter.fetchTopRobinhoodPools(20000, 15000, 100);
    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toContain('chainId=4663');
    expect(url).toContain('protocol=uniswapv3');
    expect(url).toContain('sortBy=0');
    expect(url).toContain('tvlFrom=20000');
    expect(url).toContain('volume24hFrom=15000');
    expect(url).toContain('withIncentives=true');
  });

  it('returns [] when API fails (fail-closed)', async () => {
    process.env.KRYSTAL_CLOUD_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const adapter = new KrystalCloudAdapter();
    expect(await adapter.fetchTopRobinhoodPools()).toEqual([]);
  });

  it('filterHighYieldPools — mirror LP solana gates + dedupe per pair', () => {
    process.env.KRYSTAL_CLOUD_API_KEY = 'test';
    const adapter = new KrystalCloudAdapter();
    const good = adapter.fetchTopRobinhoodPools && undefined; // helper di bawah
    void good;
    // Pool lolos semua gate: tvl 150k, fee1h 20, feeTvl24 0.0024 > 0.01? tidak — 0.24% < 1%
    // gunakan pool dengan fee tinggi
    const highFee = mkPool({
      poolAddress: '0xa', tvl: '150000',
      stats1h: { volume: '50000', fee: '150', apr: 100 },
      stats24h: { volume: '500000', fee: '5000', apr: 90 }, // feeTvl24 = 5000/150000 = 3.3% > 1% ✓
    });
    const lowFee = mkPool({
      poolAddress: '0xb', tvl: '150000',
      stats1h: { volume: '50000', fee: '150', apr: 100 },
      stats24h: { volume: '500000', fee: '500', apr: 90 }, // feeTvl24 = 0.33% < 1% ✗
    });
    const dupPair = mkPool({
      poolAddress: '0xc', tvl: '300000',
      stats1h: { volume: '50000', fee: '150', apr: 100 },
      stats24h: { volume: '800000', fee: '8000', apr: 95 }, // feeTvl24 = 2.7% > 1% ✓, pair sama WETH-USDC
    });
    // 1. parse ke signal via fetch (pakai adapter method parse di fetch)
    // simulasikan dengan stub fetch lalu filter
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [highFee, lowFee, dupPair] }));
    // filter bekerja pada KrystalPoolSignal — buat via fetchTopRobinhoodPools
    const filtered = adapter.filterHighYieldPools([
      {
        poolAddress: '0xa', pairName: 'WETH-USDC', network: 'Robinhood', feeTier: 3000,
        tvlUsd: 150000, activeTvlUsd: 450, volume1hUsd: 50000, fee1hUsd: 150,
        volume24hUsd: 500000, fee24hUsd: 5000, feesToTvlRatio24h: 0.0333,
        volumeToTvlRatio1h: 0.33, volumeToActiveTvlRatio1h: 111, feeAprPercentage: 100,
        apr24h: 90, farmApr24h: 0, token0Symbol: 'WETH', token1Symbol: 'USDC',
        token0Address: '0xweth', aiRecommendation: 'x',
      },
      {
        poolAddress: '0xb', pairName: 'WETH-USDC', network: 'Robinhood', feeTier: 3000,
        tvlUsd: 150000, activeTvlUsd: 450, volume1hUsd: 50000, fee1hUsd: 150,
        volume24hUsd: 500000, fee24hUsd: 500, feesToTvlRatio24h: 0.0033,
        volumeToTvlRatio1h: 0.33, volumeToActiveTvlRatio1h: 111, feeAprPercentage: 100,
        apr24h: 90, farmApr24h: 0, token0Symbol: 'WETH', token1Symbol: 'USDC',
        token0Address: '0xweth', aiRecommendation: 'x',
      },
      {
        poolAddress: '0xc', pairName: 'WETH-USDC', network: 'Robinhood', feeTier: 3000,
        tvlUsd: 300000, activeTvlUsd: 900, volume1hUsd: 50000, fee1hUsd: 150,
        volume24hUsd: 800000, fee24hUsd: 8000, feesToTvlRatio24h: 0.0267,
        volumeToTvlRatio1h: 0.17, volumeToActiveTvlRatio1h: 55, feeAprPercentage: 100,
        apr24h: 95, farmApr24h: 0, token0Symbol: 'WETH', token1Symbol: 'USDC',
        token0Address: '0xweth', aiRecommendation: 'x',
      },
    ]);
    // lowFee (0x b) ditolak (feeTvl 0.33% < 1%); 0xa (3.33%) vs 0xc (2.67%) dedupe → 0xa menang (feeTvl tertinggi)
    expect(filtered.length).toBe(1);
    expect(filtered[0].poolAddress).toBe('0xa');
  });
});
