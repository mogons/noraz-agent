export interface UniswapPoolSignal {
  poolAddress: string;
  pairName: string;
  network: 'Robinhood' | 'Base' | 'Ethereum';
  feeTierPercentage: number;
  tvlUsd: number;
  activeTvlUsd: number;
  volume4hUsd: number;
  fee4hUsd: number;
  fees24hEth: number;
  feeAprPercentage: number;
  feesToTvlRatio4h: number;
  volumeToTvlRatio4h: number;
  volumeToActiveTvlRatio4h: number;
  organicVolumeScore4h: number;
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
}

const CHAIN_MAP: Record<string, 'Base' | 'Ethereum' | 'Robinhood'> = {
  base: 'Base',
  ethereum: 'Ethereum',
  robinhood: 'Robinhood',
};

// Uniswap v3 is scarce on Base; Aerodrome is the dominant concentrated-liquidity DEX there.
const EVM_LP_QUERIES: Array<{ q: string; dexIds: string[] }> = [
  { q: 'uniswap v3', dexIds: ['uniswap'] },
  { q: 'aerodrome', dexIds: ['aerodrome', 'aerodrome_finance', 'aerodrome-v1'] },
];

export class UniswapLPAdapter {
  public async fetchTopYieldEVMPools(minTvlUsd: number = 5000): Promise<UniswapPoolSignal[]> {
    try {
      // Live ETH price for native-fee conversion (fail-closed: 0 → filter will reject)
      let ethPriceUsd = 0;
      try {
        const { globalPriceFeedService } = await import('../services/price-feed-service.js');
        ethPriceUsd = (await globalPriceFeedService.getPrice('ETH')) || 0;
      } catch { /* price fetch is best-effort */ }
      const pools: UniswapPoolSignal[] = [];
      for (const chainId of ['base', 'ethereum']) {
        for (const query of EVM_LP_QUERIES) {
          const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query.q)}`;
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = (await res.json()) as { pairs?: DexScreenerPair[] };
          const pairs = (data.pairs || [])
            .filter((p) => query.dexIds.includes(p.dexId) && p.chainId === chainId)
            .slice(0, 10);
          for (const p of pairs) {
          const tvlUsd = Number(p.liquidity?.usd) || 0;
          const volume24hUsd = Number(p.volume?.h24) || 0;
          if (!p.pairAddress || !(tvlUsd > 0) || !(volume24hUsd > 0)) continue;
          const network = CHAIN_MAP[chainId];
          if (!network) continue;
          const feeTierPct = p.feeTier ? p.feeTier / 10000 : 0.3;
          const volume4hUsd = volume24hUsd / 6;
          const fee4hUsd = volume4hUsd * feeTierPct;
          const activeTvlUsd = tvlUsd * 0.3;
          pools.push({
            poolAddress: p.pairAddress,
            pairName: `${p.baseToken.symbol}-${p.quoteToken.symbol} (${p.dexId} ${network})`,
            network,
            feeTierPercentage: feeTierPct,
            tvlUsd,
            activeTvlUsd,
            volume4hUsd,
            fee4hUsd,
            fees24hEth: ethPriceUsd > 0 ? (fee4hUsd * 6) / ethPriceUsd : 0,
            feeAprPercentage: Number(((fee4hUsd / tvlUsd) * 6 * 365 * 100).toFixed(1)) || 0,
            feesToTvlRatio4h: fee4hUsd / tvlUsd,
            volumeToTvlRatio4h: volume4hUsd / tvlUsd,
            volumeToActiveTvlRatio4h: activeTvlUsd > 0 ? volume4hUsd / activeTvlUsd : 0,
            organicVolumeScore4h: Math.min(100, 40 + Math.round((volume4hUsd / tvlUsd) * 15)),
            tokenAgeMinutes: undefined,
            recommendedPriceRange: {
              minPrice: Number(p.priceUsd) * 0.95 || 0,
              maxPrice: Number(p.priceUsd) * 1.05 || 0,
            },
            aiRecommendation: `Live ${p.dexId} pool ${p.baseToken.symbol}-${p.quoteToken.symbol} on ${network}: $${(tvlUsd / 1000).toFixed(1)}k TVL, $${(volume4hUsd / 1000).toFixed(1)}k 4h volume.`,
          });
        }
        }
      }
      return pools.filter((p) => p.tvlUsd >= minTvlUsd);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[UNISWAP LP ADAPTER ERROR] ${message}`);
      return [];
    }
  }

  public filterHighYieldEVMPools(pools: UniswapPoolSignal[]): UniswapPoolSignal[] {
    return pools.filter(pool => {
      const passesMinFeesEth = pool.fees24hEth >= 0.5;
      const passesFeesRatio = pool.feesToTvlRatio4h >= 0.05;
      const passesVolumeToTvl = pool.volumeToTvlRatio4h >= 1.5;
      const passesVolumeVelocity = pool.volumeToActiveTvlRatio4h >= 6.0;
      const passesOrganicScore = pool.organicVolumeScore4h >= 65;
      const passesAge = pool.tokenAgeMinutes ? pool.tokenAgeMinutes >= 240 : true;
      return passesMinFeesEth && passesFeesRatio && passesVolumeToTvl && passesVolumeVelocity && passesOrganicScore && passesAge;
    });
  }
}
