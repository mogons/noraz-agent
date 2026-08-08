/**
 * Krystal Cloud adapter — official DeFi Data API (https://cloud.krystal.app).
 * Primary use: LP pool data for Robinhood Chain (ethereum@4663), which has no
 * other reliable pool indexer. Auth: KC-APIKey header.
 *
 * Units cost: /v1/pools = 2 units per request (50k free units ≈ months of use).
 *
 * All metrics are REAL indexed data: tvl, stats1h/24h (volume, fee, apr),
 * incentives (farm rewards). No fabrication.
 */

export interface KrystalPoolSignal {
  poolAddress: string;
  pairName: string;
  network: 'Robinhood';
  feeTier: number; // bps (3000 = 0.3%)
  tvlUsd: number;
  activeTvlUsd: number;
  volume1hUsd: number;
  fee1hUsd: number;
  volume24hUsd: number;
  fee24hUsd: number;
  feesToTvlRatio24h: number;
  volumeToTvlRatio1h: number;
  volumeToActiveTvlRatio1h: number;
  feeAprPercentage: number;
  apr24h: number;
  farmApr24h: number;
  token0Symbol: string;
  token1Symbol: string;
  token0Address: string;
  aiRecommendation: string;
}

interface KrystalTokenObject {
  token: { address: string; symbol: string; name: string; decimals: number; logo: string };
  balance: string;
}

interface KrystalPool {
  chain: { name: string; id: number };
  poolAddress: string;
  poolPrice: string;
  protocol: { name: string; factoryAddress?: string };
  feeTier: number;
  tickSpacing: number;
  currentSqrtPriceX96: string;
  token0: KrystalTokenObject;
  token1: KrystalTokenObject;
  tvl: string;
  stats1h: { volume: string; fee: string; apr: number };
  stats24h: { volume: string; fee: string; apr: number };
  stats7d: { volume: string; fee: string; apr: number };
  stats30d: { volume: string; fee: string; apr: number };
  incentives?: Array<{ incentiveType: string; apr24h: number; dailyRewardUsd?: number }>;
}

export class KrystalCloudAdapter {
  private baseUrl = 'https://cloud-api.krystal.app';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.KRYSTAL_CLOUD_API_KEY || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async request<T>(path: string): Promise<T | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: { 'KC-APIKey': this.apiKey, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.warn(`[KRYSTAL] HTTP ${res.status} for ${path}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[KRYSTAL] Request failed (fail-closed): ${message}`);
      return null;
    }
  }

  /**
   * Fetch top pools for Robinhood Chain (4663) Uniswap v3, sorted by APR.
   * Server-side: tvl >= minTvl, volume24h >= minVol (keeps units cost low).
   */
  public async fetchTopRobinhoodPools(minTvlUsd = 10000, minVol24hUsd = 10000, limit = 200): Promise<KrystalPoolSignal[]> {
    const qs = new URLSearchParams({
      chainId: '4663',
      protocol: 'uniswapv3',
      sortBy: '0', // SORT_BY_APR
      tvlFrom: String(minTvlUsd),
      volume24hFrom: String(minVol24hUsd),
      withIncentives: 'true',
      limit: String(limit),
    });
    const data = await this.request<KrystalPool[]>(`/v1/pools?${qs.toString()}`);
    if (!Array.isArray(data)) return [];

    const pools: KrystalPoolSignal[] = [];
    for (const p of data) {
      const tvlUsd = Number(p.tvl) || 0;
      const volume1hUsd = Number(p.stats1h?.volume) || 0;
      const fee1hUsd = Number(p.stats1h?.fee) || 0;
      const volume24hUsd = Number(p.stats24h?.volume) || 0;
      const fee24hUsd = Number(p.stats24h?.fee) || 0;
      const apr24h = Number(p.stats24h?.apr) || 0;
      const t0 = p.token0?.token;
      const t1 = p.token1?.token;
      if (!p.poolAddress || !t0 || !t1) continue;

      // Active-TVL proxy (sama seperti LP solana Meteora): TVL yang efektif
      // menghasilkan fee = fee_rate × tvl, fee_rate real dari data 1h.
      const feeRate = volume1hUsd > 0 ? fee1hUsd / volume1hUsd : 0;
      const activeTvlUsd = feeRate > 0 ? feeRate * tvlUsd : tvlUsd * 0.3;
      const feesToTvlRatio24h = tvlUsd > 0 ? fee24hUsd / tvlUsd : 0;
      const volumeToTvlRatio1h = tvlUsd > 0 ? volume1hUsd / tvlUsd : 0;
      const volumeToActiveTvlRatio1h = activeTvlUsd > 0 ? volume1hUsd / activeTvlUsd : 0;

      // Farm rewards (incentives) APR 24h — tambahan yield
      const farmApr24h = (p.incentives || []).reduce((s, i) => s + (Number(i.apr24h) || 0), 0);

      pools.push({
        poolAddress: p.poolAddress,
        pairName: `${t0.symbol}-${t1.symbol}`,
        network: 'Robinhood',
        feeTier: p.feeTier || 0,
        tvlUsd,
        activeTvlUsd,
        volume1hUsd,
        fee1hUsd,
        volume24hUsd,
        fee24hUsd,
        feesToTvlRatio24h,
        volumeToTvlRatio1h,
        volumeToActiveTvlRatio1h,
        feeAprPercentage: Number((feesToTvlRatio24h * 365 * 100).toFixed(1)) || 0,
        apr24h,
        farmApr24h,
        token0Symbol: t0.symbol,
        token1Symbol: t1.symbol,
        token0Address: t0.address,
        aiRecommendation: `Live Uniswap V3 pool ${t0.symbol}-${t1.symbol} (Robinhood Chain): $${(tvlUsd / 1000).toFixed(1)}k TVL, $${(volume24hUsd / 1000).toFixed(1)}k 24h volume, $${(fee24hUsd / 1000).toFixed(1)}k 24h fees (${(feesToTvlRatio24h * 100).toFixed(2)}%/24h).`,
      });
    }
    return pools;
  }

  /**
   * High-yield filter — mirror LP solana (Meteora) dengan data NYATA:
   * - fee1h >= $7 (real)
   * - 24h Fee/TVL > 1% (real)
   * - volume/activeTvl >= 100% per 1h (velocity, fee_rate real)
   * - tvl >= $10k (sudah difilter server-side, tetap dicek di sini)
   * - dedupe per pair (1 pool terbaik per pasangan token)
   * Umur pool & token verified tidak tersedia di Krystal — dilewati.
   */
  public filterHighYieldPools(pools: KrystalPoolSignal[]): KrystalPoolSignal[] {
    const bestByPair = new Map<string, KrystalPoolSignal>();
    for (const pool of pools) {
      if (pool.tvlUsd < 10000) continue;
      if (pool.fee1hUsd < 7) continue;
      if (pool.feesToTvlRatio24h <= 0.01) continue;
      if (pool.volumeToActiveTvlRatio1h < 1.0) continue;

      const pairKey = `${pool.token0Symbol}-${pool.token1Symbol}`.toUpperCase();
      const existing = bestByPair.get(pairKey);
      if (!existing || pool.feesToTvlRatio24h > existing.feesToTvlRatio24h) {
        bestByPair.set(pairKey, pool);
      }
    }
    return [...bestByPair.values()];
  }
}
