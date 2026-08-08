import { describe, it, expect, vi, afterEach } from 'vitest';
import { MeteoraDLMMAdapter } from '../src/adapters/meteora-dlmm-adapter.js';

const mkPool = (over: Record<string, unknown> = {}) => ({
  address: 'pool123',
  name: 'SOL-USDC',
  token_x: { address: 'x', symbol: 'SOL', is_verified: true, holders: 5000, market_cap: 1000000, name: 'Solana', decimals: 9, freeze_authority_disabled: true, total_supply: 1e9, price: 150 },
  token_y: { address: 'y', symbol: 'USDC', is_verified: true, holders: 100, market_cap: 0, name: 'USD', decimals: 6, freeze_authority_disabled: true, total_supply: 1e9, price: 1 },
  created_at: Date.now() - 3600 * 24 * 30 * 1000,
  pool_config: { bin_step: 10, base_fee_pct: 0.003, max_fee_pct: 0.05, protocol_fee_pct: 0, collect_fee_mode: 0 },
  dynamic_fee_pct: 0.005,
  tvl: 150000,
  current_price: 1,
  apr: 0.5,
  apy: 2.5,
  has_farm: false,
  farm_apr: 0,
  farm_apy: 0,
  volume: { '30m': 1000, '1h': 5000, '2h': 10000, '4h': 40000, '12h': 80000, '24h': 120000 },
  fees: { '30m': 5, '1h': 20, '2h': 40, '4h': 150, '12h': 300, '24h': 500 },
  protocol_fees: { '30m': 1, '1h': 4, '2h': 8, '4h': 30, '12h': 60, '24h': 100 },
  fee_tvl_ratio: { '30m': 0.003, '1h': 0.013, '2h': 0.026, '4h': 0.1, '12h': 0.2, '24h': 0.33 },
  cumulative_metrics: { volume: 1e6, fees: 4000 },
  is_blacklisted: false,
  launchpad: null,
  tags: [],
  ...over,
});

const stubFetch = (data: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  }));

describe('MeteoraDLMMAdapter (official DLMM Data API)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps real DLMM pools from the official API', async () => {
    stubFetch({ total: 1, pages: 1, current_page: 1, page_size: 1, data: [mkPool()] });
    const adapter = new MeteoraDLMMAdapter();
    const pools = await adapter.fetchTopYieldPools();
    expect(pools.length).toBe(1);
    const p = pools[0];
    expect(p.poolAddress).toBe('pool123');
    expect(p.tvlUsd).toBe(150000);
    expect(p.volume1hUsd).toBe(5000);
    expect(p.fee1hUsd).toBe(20);
    expect(p.feeAprPercentage).toBeCloseTo(0.013 * 24 * 365, 0); // fee_tvl_ratio in percent, rounded 1dp
    expect(p.feesToTvlRatio1h).toBeCloseTo(0.00013, 5); // 0.013% / 100
    expect(p.tokenXVerified).toBe(true);
    expect(p.tokenXHolders).toBe(5000);
    expect(p.tokenAgeMinutes).toBeGreaterThan(240);
  });

  it('passes server-side filters (tvl min + blacklist) to the API', async () => {
    stubFetch({ data: [] });
    const adapter = new MeteoraDLMMAdapter();
    await adapter.fetchTopYieldPools(10000, 200);
    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toContain('page_size=200');
    expect(url).toContain('fee_tvl_ratio_1h%3Adesc'); // fee_tvl_ratio_1h:desc (URL-encoded)
    expect(url).toContain('tvl%3E%3D10000'); // tvl>=10000
    expect(url).toContain('is_blacklisted%3Dfalse'); // is_blacklisted=false (URL-encoded)
  });

  it('returns [] when API fails (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const adapter = new MeteoraDLMMAdapter();
    expect(await adapter.fetchTopYieldPools()).toEqual([]);
  });

  it('skips pools missing critical fields instead of fabricating them', async () => {
    stubFetch({ data: [{ address: 'partial' }] });
    const adapter = new MeteoraDLMMAdapter();
    expect(await adapter.fetchTopYieldPools()).toEqual([]);
  });

  const mkSignal = (over: Record<string, unknown> = {}) => ({
    poolAddress: 'pool123',
    pairName: 'SOL-USDC',
    binStep: 10,
    baseFeePercentage: 0.3,
    tvlUsd: 150000,
    activeTvlUsd: 3000,
    volume1hUsd: 5000,
    fee1hUsd: 20,
    fees24hSol: 0,
    feeAprPercentage: 500, // > 100% annualized
    feesToTvlRatio1h: 0.00013, // 0.013% / 100
    feesToActiveTvlRatio1h: 0.0067, // 0.67%/jam > 0.1%
    feesToTvlRatio24h: 0.012, // 1.2% 24h > 1%
    volumeToTvlRatio1h: 0.033,
    volumeToActiveTvlRatio1h: 1.67, // >= 1.0 (100%+ active TVL per jam)
    organicVolumeScore1h: 60,
    tokenAgeMinutes: 240, // >= 2h
    aiRecommendation: 'test',
    volume24hUsd: 250000,
    fee24hUsd: 500,
    tokenXSymbol: 'SOL',
    tokenYSymbol: 'USDC',
    tokenXVerified: true,
    tokenXHolders: 5000,
    tokenXMarketCapUsd: 1000000,
    aprDecimal: 0.5,
    apyDecimal: 2.5,
    ...over,
  });

  it('filterHighYieldPools keeps real-yield pools and dedupes per pair', () => {
    const adapter = new MeteoraDLMMAdapter();
    const good = mkSignal();
    const secondSamePair = mkSignal({ poolAddress: 'pool456', tvlUsd: 300000, feesToTvlRatio1h: 0.0002 });
    const lowFees = mkSignal({ poolAddress: 'pool789', fee1hUsd: 5 });
    const lowVelocity = mkSignal({ poolAddress: 'pool800', volumeToActiveTvlRatio1h: 0.5 });
    const lowFeeYield24h = mkSignal({ poolAddress: 'pool801', feesToTvlRatio24h: 0.005 });
    const young = mkSignal({ poolAddress: 'pool1000', tokenAgeMinutes: 60 });
    // verified tidak difilter (DLMM = likuiditas komunitas) — unverified tetap lolos,
    // pair beda (CATE-SOL) supaya tidak kena dedupe SOL-USDC
    const unverified = mkSignal({ poolAddress: 'pool999', tokenXVerified: false, pairName: 'CATE-SOL', tokenXSymbol: 'CATE' });

    const passed = adapter.filterHighYieldPools([good, secondSamePair, lowFees, lowVelocity, lowFeeYield24h, young, unverified]);
    expect(passed.length).toBe(2); // best SOL-USDC + unverified CATE-SOL (verified bukan filter)
    expect(passed[0].poolAddress).toBe('pool456');
  });

  it('filterHighYieldPools keeps distinct pairs', () => {
    const adapter = new MeteoraDLMMAdapter();
    const a = mkSignal();
    const b = mkSignal({ poolAddress: 'poolB', pairName: 'CATE-SOL', tokenXSymbol: 'CATE' });
    const passed = adapter.filterHighYieldPools([a, b]);
    expect(passed.length).toBe(2);
  });
});
