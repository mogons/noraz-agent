/**
 * Meteora DLMM adapter — data via the OFFICIAL DLMM Data API
 * (https://dlmm.datapi.meteora.ag). Every metric is real indexed data
 * (TVL, per-window volume/fees, fee-to-TVL ratio, APR/APY, token metrics),
 * not DexScreener estimates. Fail-closed on any error.
 *
 * NOTE on units: volume/fees are USD per time window (30m..24h);
 * fee_tvl_ratio is a decimal fraction (0.0005 = 0.05% per window);
 * apr/apy are decimal fractions too (0.05 = 5%); created_at is Unix ms.
 */

export interface MeteoraPoolSignal {
  poolAddress: string;
  pairName: string;
  binStep: number;
  baseFeePercentage: number;
  tvlUsd: number;
  activeTvlUsd: number;
  volume1hUsd: number;
  fee1hUsd: number;
  fees24hSol: number;
  feeAprPercentage: number;
  feesToTvlRatio1h: number;
  feesToActiveTvlRatio1h: number;
  feesToTvlRatio24h: number;
  volumeToTvlRatio1h: number;
  volumeToActiveTvlRatio1h: number;
  organicVolumeScore1h: number;
  tokenAgeMinutes?: number;
  aiRecommendation: string;
  /** Extra real fields surfaced for the call card / filters. */
  volume24hUsd: number;
  fee24hUsd: number;
  tokenXSymbol: string;
  tokenYSymbol: string;
  tokenXAddress: string;
  tokenYAddress: string;
  tokenXVerified: boolean;
  tokenXHolders: number;
  tokenXMarketCapUsd: number;
  tokenXPriceUsd: number;
  tokenXAgeHours: number;
  aprDecimal: number;
  apyDecimal: number;
}

interface DlmmTimeWindow {
  '30m': number;
  '1h': number;
  '2h': number;
  '4h': number;
  '12h': number;
  '24h': number;
}

interface DlmmTokenMetrics {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  is_verified: boolean;
  holders: number;
  freeze_authority_disabled: boolean;
  total_supply: number;
  price: number;
  market_cap: number;
}

interface DlmmPool {
  address: string;
  name: string;
  token_x: DlmmTokenMetrics;
  token_y: DlmmTokenMetrics;
  created_at: number;
  pool_config: { bin_step: number; base_fee_pct: number; max_fee_pct: number; protocol_fee_pct: number; collect_fee_mode: number };
  dynamic_fee_pct: number;
  tvl: number;
  current_price: number;
  apr: number;
  apy: number;
  has_farm: boolean;
  farm_apr: number;
  farm_apy: number;
  volume: DlmmTimeWindow;
  fees: DlmmTimeWindow;
  protocol_fees: DlmmTimeWindow;
  fee_tvl_ratio: DlmmTimeWindow;
  cumulative_metrics: { volume: number; fees: number };
  is_blacklisted: boolean;
  launchpad: string | null;
  tags: string[];
}

interface DlmmPoolListResponse {
  total: number;
  pages: number;
  current_page: number;
  page_size: number;
  data: DlmmPool[];
}

export class MeteoraDLMMAdapter {
  private baseUrl = 'https://dlmm.datapi.meteora.ag';

  /**
   * Fetch top pools by fee-to-TVL ratio (real yield), skipping blacklisted ones.
   * Server-side: page_size up to 1000, sort_by + filter_by supported.
   */
  public async fetchTopYieldPools(minTvlUsd: number = 20000, limit = 200): Promise<MeteoraPoolSignal[]> {
    try {
      const qs = new URLSearchParams({
        page: '1',
        page_size: String(Math.min(limit, 1000)),
        sort_by: 'fee_tvl_ratio_1h:desc',
        filter_by: `is_blacklisted=false && tvl>=${minTvlUsd}`,
      });
      const res = await fetch(`${this.baseUrl}/pools?${qs.toString()}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Meteora DLMM API HTTP ${res.status}`);
      const json = (await res.json()) as DlmmPoolListResponse;
      if (!Array.isArray(json?.data)) return [];

      const pools: MeteoraPoolSignal[] = [];
      for (const p of json.data) {
        const tvlUsd = Number(p.tvl) || 0;
        const volume1hUsd = Number(p.volume?.['1h']) || 0;
        const fee1hUsd = Number(p.fees?.['1h']) || 0;
        // API fee_tvl_ratio is a PERCENTAGE (docs: "in percentage"), e.g. 1.7 = 1.7%/1h.
        const feeTvlRatioPct1h = Number(p.fee_tvl_ratio?.['1h']) || 0;
        if (!p.address || !(tvlUsd >= minTvlUsd)) continue;

        const feesToTvlRatio1h = feeTvlRatioPct1h / 100; // decimal 0-1
        const feeTvlRatioPct24h = Number(p.fee_tvl_ratio?.['24h']) || 0;
        const feesToTvlRatio24h = feeTvlRatioPct24h / 100; // decimal 0-1 (24h)
        const volumeToTvlRatio1h = tvlUsd > 0 ? volume1hUsd / tvlUsd : 0;
        // Active-TVL proxy: TVL yang efektif menghasilkan fee (fee_rate × tvl).
        const feeRate = volume1hUsd > 0 ? fee1hUsd / volume1hUsd : 0;
        const activeTvlUsd = feeRate > 0 ? feeRate * tvlUsd : tvlUsd * 0.3;
        const volumeToActiveTvlRatio1h = activeTvlUsd > 0 ? volume1hUsd / activeTvlUsd : 0;
        const feesToActiveTvlRatio1h = activeTvlUsd > 0 ? fee1hUsd / activeTvlUsd : 0;
        const organicVolumeScore1h = Math.min(100, Math.round(40 + volumeToTvlRatio1h * 600));
        const tokenAgeSec = Number(p.created_at) > 0 ? Date.now() / 1000 - Number(p.created_at) / 1000 : 0;
        const fees24hUsd = Number(p.fees?.['24h']) || 0;
        const solPriceUsd = 0; // filled lazily by fee conversion below if needed

        pools.push({
          poolAddress: p.address,
          pairName: p.name || `${p.token_x?.symbol || 'X'}-${p.token_y?.symbol || 'Y'}`,
          binStep: p.pool_config?.bin_step ?? 0,
          baseFeePercentage: Number((p.pool_config?.base_fee_pct ?? 0) * 100) || 0,
          tvlUsd,
          activeTvlUsd,
          volume1hUsd,
          fee1hUsd,
          fees24hSol: solPriceUsd > 0 ? fees24hUsd / solPriceUsd : 0,
          feeAprPercentage: Number((feeTvlRatioPct1h * 24 * 365).toFixed(1)) || 0,
          feesToTvlRatio1h,
          feesToActiveTvlRatio1h,
          feesToTvlRatio24h,
          volumeToTvlRatio1h,
          volumeToActiveTvlRatio1h,
          organicVolumeScore1h,
          tokenAgeMinutes: tokenAgeSec > 0 ? Math.floor(tokenAgeSec / 60) : undefined,
          aiRecommendation: `Live Meteora DLMM pool: ${p.name} — $${(tvlUsd / 1000).toFixed(1)}k TVL, $${(volume1hUsd / 1000).toFixed(1)}k 1h volume, $${(fee1hUsd / 1000).toFixed(2)}k 1h fees (${feeTvlRatioPct1h.toFixed(2)}%/1h).`,
          volume24hUsd: Number(p.volume?.['24h']) || 0,
          fee24hUsd: fees24hUsd,
          tokenXSymbol: p.token_x?.symbol || 'X',
          tokenYSymbol: p.token_y?.symbol || 'Y',
          tokenXAddress: p.token_x?.address || '',
          tokenYAddress: p.token_y?.address || '',
          tokenXVerified: Boolean(p.token_x?.is_verified),
          tokenXHolders: Number(p.token_x?.holders) || 0,
          tokenXMarketCapUsd: Number(p.token_x?.market_cap) || 0,
          tokenXPriceUsd: Number(p.token_x?.price) || 0,
          tokenXAgeHours: tokenAgeSec > 0 ? Math.floor(tokenAgeSec / 3600 * 10) / 10 : 0,
          aprDecimal: Number(p.apr) || 0,
          apyDecimal: Number(p.apy) || 0,
        });
      }
      return pools;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[METEORA DLMM ADAPTER ERROR] ${message}`);
      return [];
    }
  }

  /**
   * High-yield filter on REAL metrics. Thresholds:
   * - fees >= $50 in 1h (real fee income — kalibrasi 2026-08-09: $7 terlalu kecil)
   * - 24h Fee/TVL > 2% (yield fee NYATA 24 jam terakhir — lebih cocok untuk
   *   trader harian daripada APR annualized yang mengasumsikan kondisi 24 jam
   *   berulang setahun penuh)
   * - volume/ACTIVE TVL >= 100% per 1h (velocity: capital aktif berputar penuh)
   * Token verified TIDAK difilter (DLMM = likuiditas komunitas; verified-only
   * terlalu mengecilkan pool) — hanya di-surface sebagai info di call card.
   * Umur pool TIDAK digate (2026-08-09: pool baru bisa langsung likuid & aktif).
   * Dedupe per pair: satu pool terbaik per pasangan token (anti-spam call).
   */
  public filterHighYieldPools(pools: MeteoraPoolSignal[]): MeteoraPoolSignal[] {
    const bestByPair = new Map<string, MeteoraPoolSignal>();
    for (const pool of pools) {
      const passesTvl = pool.tvlUsd >= 20000;
      const passesVol24h = pool.volume24hUsd >= 200000;
      // Market cap tokenX wajib > $200k (fail-closed: 0/tidak diketahui = tolak).
      const passesMc = pool.tokenXMarketCapUsd >= 200000;
      const passesFees = pool.fee1hUsd >= 50;
      const passesFeeYield24h = pool.feesToTvlRatio24h > 0.02;
      const passesVelocity = pool.volumeToActiveTvlRatio1h >= 1.0;
      if (!(passesTvl && passesVol24h && passesMc && passesFees && passesFeeYield24h && passesVelocity)) continue;

      const pairKey = `${pool.tokenXSymbol}-${pool.tokenYSymbol}`.toUpperCase();
      const existing = bestByPair.get(pairKey);
      if (!existing || pool.feesToTvlRatio1h > existing.feesToTvlRatio1h) {
        bestByPair.set(pairKey, pool);
      }
    }
    return [...bestByPair.values()];
  }
}
