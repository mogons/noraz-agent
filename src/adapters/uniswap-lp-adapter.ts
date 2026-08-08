export interface RobinhoodLPPoolSignal {
  poolAddress: string;
  pairName: string;
  network: 'Robinhood';
  feeTierPercentage: number;
  tvlUsd: number;
  activeTvlUsd: number;
  volume1hUsd: number;
  fee1hUsd: number;
  fees24hEth: number;
  feeAprPercentage: number;
  feesToTvlRatio1h: number;
  feesToActiveTvlRatio1h: number;
  feesToTvlRatio24h: number;
  volumeToTvlRatio1h: number;
  volumeToActiveTvlRatio1h: number;
  organicVolumeScore1h: number;
  tokenAgeMinutes?: number;
  recommendedPriceRange: { minPrice: number; maxPrice: number };
  aiRecommendation: string;
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { symbol: string; name: string };
  quoteToken: { symbol: string; name: string };
  priceUsd: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  feeTier?: number;
  pairCreatedAt?: number;
}

// Robinhood Chain is Base-compatible; Aerodrome is the dominant
// concentrated-liquidity DEX there (Uniswap v3 scarce on Robinhood).
const EVM_LP_QUERIES: Array<{ q: string; dexIds: string[] }> = [
  { q: 'aerodrome', dexIds: ['aerodrome', 'aerodrome_finance', 'aerodrome-v1'] },
  { q: 'uniswap v3', dexIds: ['uniswap'] },
];

export class UniswapLPAdapter {
  public async fetchTopYieldEVMPools(minTvlUsd: number = 5000): Promise<RobinhoodLPPoolSignal[]> {
    try {
      // Live ETH price for native-fee conversion (fail-closed: 0 → filter will reject)
      let ethPriceUsd = 0;
      try {
        const { globalPriceFeedService } = await import('../services/price-feed-service.js');
        ethPriceUsd = (await globalPriceFeedService.getPrice('ETH')) || 0;
      } catch { /* price fetch is best-effort */ }
      const pools: RobinhoodLPPoolSignal[] = [];
      for (const query of EVM_LP_QUERIES) {
        const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query.q)}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = (await res.json()) as { pairs?: DexScreenerPair[] };
        const pairs = (data.pairs || [])
          .filter((p) => query.dexIds.includes(p.dexId) && p.chainId === 'robinhood')
          .slice(0, 20);
        for (const p of pairs) {
          const tvlUsd = Number(p.liquidity?.usd) || 0;
          const volume24hUsd = Number(p.volume?.h24) || 0;
          if (!p.pairAddress || !(tvlUsd > 0) || !(volume24hUsd > 0)) continue;
          const feeTierPct = p.feeTier ? p.feeTier / 10000 : 0.3;
          const volume1hUsd = volume24hUsd / 24;
          const fee1hUsd = volume1hUsd * (feeTierPct / 100);
          const activeTvlUsd = tvlUsd * 0.3;
          pools.push({
            poolAddress: p.pairAddress,
            pairName: `${p.baseToken.symbol}-${p.quoteToken.symbol} (${p.dexId} Robinhood)`,
            network: 'Robinhood',
            feeTierPercentage: feeTierPct,
            tvlUsd,
            activeTvlUsd,
            volume1hUsd,
            fee1hUsd,
            fees24hEth: ethPriceUsd > 0 ? (fee1hUsd * 24) / ethPriceUsd : 0,
            feeAprPercentage: Number(((fee1hUsd / tvlUsd) * 24 * 365 * 100).toFixed(1)) || 0,
            feesToTvlRatio1h: fee1hUsd / tvlUsd,
            feesToActiveTvlRatio1h: activeTvlUsd > 0 ? fee1hUsd / activeTvlUsd : 0,
            feesToTvlRatio24h: tvlUsd > 0 ? (volume24hUsd * (feeTierPct / 100)) / tvlUsd : 0,
            volumeToTvlRatio1h: volume1hUsd / tvlUsd,
            volumeToActiveTvlRatio1h: activeTvlUsd > 0 ? volume1hUsd / activeTvlUsd : 0,
            organicVolumeScore1h: Math.min(100, 40 + Math.round((volume1hUsd / tvlUsd) * 600)),
            tokenAgeMinutes: p.pairCreatedAt
              ? Math.floor((Date.now() / 1000 - Number(p.pairCreatedAt) / 1000) / 60)
              : undefined,
            recommendedPriceRange: {
              minPrice: Number(p.priceUsd) * 0.95 || 0,
              maxPrice: Number(p.priceUsd) * 1.05 || 0,
            },
            aiRecommendation: `Live ${p.dexId} pool ${p.baseToken.symbol}-${p.quoteToken.symbol} on Robinhood Chain: $${(tvlUsd / 1000).toFixed(1)}k TVL, $${(volume1hUsd / 1000).toFixed(1)}k 1h volume.`,
          });
        }
      }
      return pools.filter((p) => p.tvlUsd >= minTvlUsd);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ROBINHOOD LP ADAPTER ERROR] ${message}`);
      return [];
    }
  }

  /**
   * High-yield filter (mirror of Meteora):
   * - fees >= $7 in 1h (real fee income)
   * - 24h Fee/TVL > 1% (yield fee nyata 24 jam — untuk trader harian)
   * - volume/ACTIVE TVL >= 100% per 1h (velocity)
   * - age >= 2h (pool mapan)
   * Dedupe per pair: satu pool terbaik per pasangan token (anti-spam call).
   */
  public filterHighYieldEVMPools(pools: RobinhoodLPPoolSignal[]): RobinhoodLPPoolSignal[] {
    const bestByPair = new Map<string, RobinhoodLPPoolSignal>();
    for (const pool of pools) {
      const passesFees = pool.fee1hUsd >= 7;
      const passesFeeYield24h = pool.feesToTvlRatio24h > 0.01;
      const passesVelocity = pool.volumeToActiveTvlRatio1h >= 1.0;
      const passesAge = pool.tokenAgeMinutes ? pool.tokenAgeMinutes >= 120 : true;
      if (!(passesFees && passesFeeYield24h && passesVelocity && passesAge)) continue;

      const pairKey = `${pool.pairName.split(' ')[0]}`.toUpperCase();
      const existing = bestByPair.get(pairKey);
      if (!existing || pool.feesToTvlRatio1h > existing.feesToTvlRatio1h) {
        bestByPair.set(pairKey, pool);
      }
    }
    return [...bestByPair.values()];
  }
}
