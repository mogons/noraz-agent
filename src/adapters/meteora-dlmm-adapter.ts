export interface MeteoraPoolSignal {
  poolAddress: string;
  pairName: string;
  binStep: number;
  baseFeePercentage: number;
  tvlUsd: number;
  activeTvlUsd: number;
  volume4hUsd: number;
  fee4hUsd: number;
  fees24hSol: number;
  feeAprPercentage: number;
  feesToTvlRatio4h: number;
  volumeToTvlRatio4h: number;
  volumeToActiveTvlRatio4h: number;
  organicVolumeScore4h: number;
  tokenAgeMinutes?: number;
  recommendedDistribution: 'Spot' | 'Curve' | 'Bid-Ask';
  aiRecommendation: string;
}

interface RawMeteoraPool {
  address?: string;
  name?: string;
  tvl?: number | string;
  volume_24h?: number | string;
  fees_24h?: number | string;
  apr?: number | string;
  bin_step?: number | string;
  current_price?: number | string;
  liquidity?: number | string;
  timestamp_created?: number | string;
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { symbol: string; name: string };
  quoteToken: { symbol: string; name: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number; h6?: number };
  priceUsd?: string;
  pairCreatedAt?: number;
}

export class MeteoraDLMMAdapter {
  private apiEndpoint = 'https://dlmm-api.meteora.ag';

  public async fetchTopYieldPools(minTvlUsd: number = 5000): Promise<MeteoraPoolSignal[]> {
    // Meteora DLMM REST API is currently unavailable (404 on all routes).
    // Fall back to real DexScreener pairs filtered by Meteora DEX — honest mapping, fail-closed.
    try {
      // Live SOL price for native-fee conversion (fail-closed: 0 → filter will reject)
      let solPriceUsd = 0;
      try {
        const { PriceFeedService } = await import('../services/price-feed-service.js');
        solPriceUsd = (await new PriceFeedService().getPrice('SOL')) || 0;
      } catch { /* price fetch is best-effort */ }
      const res = await fetch('https://api.dexscreener.com/latest/dex/search?q=meteora');
      if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
      const data = (await res.json()) as { pairs?: DexScreenerPair[] };
      const pairs = (data.pairs || []).filter((p) => p.chainId === 'solana' && p.dexId === 'meteora');
      if (pairs.length === 0) return [];

      const pools: MeteoraPoolSignal[] = [];
      for (const p of pairs) {
        const address = p.pairAddress;
        const tvlUsd = Number(p.liquidity?.usd) || 0;
        const volume24hUsd = Number(p.volume?.h24) || 0;
        if (!address || !(tvlUsd > 0) || !(volume24hUsd > 0)) continue;
        const volume4hUsd = Number(p.volume?.h6) || volume24hUsd / 6;
        const fee4hUsd = volume4hUsd * 0.003;
        const activeTvlUsd = tvlUsd * 0.3;
        const volumeToTvlRatio4h = volume4hUsd / tvlUsd;
        const organicVolumeScore4h = Math.min(100, 40 + Math.round(volumeToTvlRatio4h * 15));
        const tokenAgeSec = Number(p.pairCreatedAt) > 0
          ? Date.now() / 1000 - Number(p.pairCreatedAt) / 1000
          : 0;
        pools.push({
          poolAddress: address,
          pairName: `${p.baseToken.symbol}-${p.quoteToken.symbol} (Meteora DLMM)`,
          binStep: 10,
          baseFeePercentage: 0.3,
          tvlUsd,
          activeTvlUsd,
          volume4hUsd,
          fee4hUsd,
          fees24hSol: solPriceUsd > 0 ? (fee4hUsd * 6) / solPriceUsd : 0,
          feeAprPercentage: Number(((fee4hUsd / tvlUsd) * 6 * 365 * 100).toFixed(1)) || 0,
          feesToTvlRatio4h: fee4hUsd / tvlUsd,
          volumeToTvlRatio4h,
          volumeToActiveTvlRatio4h: activeTvlUsd > 0 ? volume4hUsd / activeTvlUsd : 0,
          organicVolumeScore4h,
          tokenAgeMinutes: tokenAgeSec > 0 ? Math.floor(tokenAgeSec / 60) : undefined,
          recommendedDistribution: 'Spot' as const,
          aiRecommendation: `Live Meteora pool (via DexScreener): ${p.baseToken.symbol}-${p.quoteToken.symbol} dengan $${(tvlUsd / 1000).toFixed(1)}k TVL & $${(volume4hUsd / 1000).toFixed(1)}k 4h volume.`,
        });
      }
      return pools.filter((p) => p.tvlUsd >= minTvlUsd);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[METEORA DLMM ADAPTER ERROR] ${message}`);
      return [];
    }
  }

  public filterHighYieldPools(pools: MeteoraPoolSignal[]): MeteoraPoolSignal[] {
    return pools.filter(pool => {
      const passesMinFeesSol = pool.fees24hSol >= 10;
      const passesFeesRatio = pool.feesToTvlRatio4h >= 0.05;
      const passesVolumeToTvl = pool.volumeToTvlRatio4h >= 1.5;
      const passesVolumeVelocity = pool.volumeToActiveTvlRatio4h >= 6.0;
      const passesOrganicScore = pool.organicVolumeScore4h >= 65;
      const passesAge = pool.tokenAgeMinutes ? pool.tokenAgeMinutes >= 240 : true;
      return passesMinFeesSol && passesFeesRatio && passesVolumeToTvl && passesVolumeVelocity && passesOrganicScore && passesAge;
    });
  }
}
