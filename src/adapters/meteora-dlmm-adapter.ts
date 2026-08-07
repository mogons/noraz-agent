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

export class MeteoraDLMMAdapter {
  private apiEndpoint = 'https://dlmm-api.meteora.ag';

  public async fetchTopYieldPools(minTvlUsd: number = 5000): Promise<MeteoraPoolSignal[]> {
    try {
      const res = await fetch(`${this.apiEndpoint}/pair/all`);
      if (!res.ok) throw new Error(`Meteora DLMM HTTP ${res.status}`);
      const data = (await res.json()) as RawMeteoraPool[];
      if (!Array.isArray(data)) return [];

      const pools: MeteoraPoolSignal[] = [];
      for (const p of data) {
        const address = p.address;
        const tvlUsd = Number(p.tvl);
        const volume24hUsd = Number(p.volume_24h);
        const fees24hUsd = Number(p.fees_24h);
        const binStep = Number(p.bin_step);
        const tokenAgeSec = Number(p.timestamp_created) > 0
          ? Date.now() / 1000 - Number(p.timestamp_created)
          : 0;
        if (!address || !(tvlUsd > 0) || !(volume24hUsd > 0) || !(fees24hUsd > 0) || !(binStep > 0)) {
          continue;
        }
        const volume4hUsd = volume24hUsd / 6;
        const fee4hUsd = fees24hUsd / 6;
        const activeTvlUsd = Math.min(tvlUsd, Number(p.liquidity) || 0);
        const feesToTvlRatio4h = fee4hUsd / tvlUsd;
        const volumeToTvlRatio4h = volume4hUsd / tvlUsd;
        const volumeToActiveTvlRatio4h = activeTvlUsd > 0 ? volume4hUsd / activeTvlUsd : 0;
        pools.push({
          poolAddress: address,
          pairName: p.name || address,
          binStep,
          baseFeePercentage: Number(p.apr) ? Math.min(100, Number(p.apr) / 365) : 0.3,
          tvlUsd,
          activeTvlUsd,
          volume4hUsd,
          fee4hUsd,
          fees24hSol: fees24hUsd / 200,
          feeAprPercentage: Number(p.apr) || 0,
          feesToTvlRatio4h,
          volumeToTvlRatio4h,
          volumeToActiveTvlRatio4h,
          organicVolumeScore4h: 50,
          tokenAgeMinutes: tokenAgeSec > 0 ? Math.floor(tokenAgeSec / 60) : undefined,
          recommendedDistribution: 'Spot' as const,
          aiRecommendation: `Live Meteora DLMM pool: ${p.name} with $${(tvlUsd / 1000).toFixed(1)}k TVL & $${(volume4hUsd / 1000).toFixed(1)}k 4h volume.`,
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
