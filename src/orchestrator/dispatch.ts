import type { CallCardPayload } from '../agents/shared/agent-contract.js';
import type { MeteoraPoolSignal } from '../adapters/meteora-dlmm-adapter.js';

export interface DispatchedSignal {
  channelName: string;
  payload: any;
  rawReason: string;
}

export interface NormalizedReport {
  passed: boolean;
  signal: any;
  reason: string;
  confidence?: number;
  payload?: CallCardPayload;
}

export interface DispatchDomainOptions {
  domain: string;
  channelName: string;
  isActive: () => boolean;
  runPass: () => Promise<NormalizedReport[]>;
  keyReady: () => { ready: boolean; statusMessage: string };
  buildPayload?: (entry: { signal: any; reason: string }) => any;
  onHalt?: (domain: string, statusMessage: string) => void;
}

export async function dispatchDomain(opts: DispatchDomainOptions): Promise<DispatchedSignal[]> {
  if (!opts.isActive()) return [];
  const keyCheck = opts.keyReady();
  if (!keyCheck.ready) {
    console.warn(keyCheck.statusMessage);
    if (opts.onHalt) {
      try { opts.onHalt(opts.domain, keyCheck.statusMessage); } catch (e: any) {
        console.warn(`[DISPATCH] onHalt notification failed for ${opts.domain}: ${e.message}`);
      }
    }
    return [];
  }
  const reports = await opts.runPass();
  const out: DispatchedSignal[] = [];
  for (const r of reports) {
    if (r.passed && r.signal) {
      out.push({
        channelName: opts.channelName,
        rawReason: r.reason || '',
        payload: opts.buildPayload
          ? opts.buildPayload({ signal: r.signal, reason: r.reason || '' })
          : r.payload || {},
      });
    }
  }
  return out;
}

/**
 * LP pool signal (Meteora Solana) — shared yield-shape; this single helper
 * builds the call-card payload so hub.ts never duplicates the mapping.
 */
export type LPPoolSignal = MeteoraPoolSignal;

export function buildLPPayload(pool: LPPoolSignal, domain: 'lp-solana'): CallCardPayload {
  return {
    domain: 'LP_METEORA',
    title: pool.pairName,
    symbol: pool.pairName.split(' ')[0],
    contractAddress: pool.poolAddress,
    network: 'Solana',
    liquidity: `$${(pool.tvlUsd / 1000).toFixed(1)}k`,
    devHoldingPct: `${pool.feeAprPercentage}% APR`,
    sniperPct: `${(pool.feesToTvlRatio1h * 100).toFixed(2)}% 1h`,
    bundlerPct: `${pool.volumeToTvlRatio1h.toFixed(1)}x vol/TVL`,
    feeApr: `${(pool.feesToTvlRatio24h * 100).toFixed(2)}% (24h Fee/TVL)`,
    dexPaidStatus: 'Meteora DLMM',
    tokenVerified: pool.tokenXVerified,
    confidenceScore: 80,
    aiThesis: pool.aiRecommendation,
    poolUrl: `https://www.meteora.ag/dlmm/${pool.poolAddress}?referrer=home`,
    token0Address: pool.tokenXAddress,
    token1Address: pool.tokenYAddress,
    token0Symbol: pool.tokenXSymbol,
    token1Symbol: pool.tokenYSymbol,
    token0ChartUrl: pool.tokenXAddress ? `https://dexscreener.com/solana/${pool.tokenXAddress}` : undefined,
    token1ChartUrl: pool.tokenYAddress ? `https://dexscreener.com/solana/${pool.tokenYAddress}` : undefined,
    gmgnUrl: pool.tokenXAddress ? `https://gmgn.ai/sol/token/${pool.tokenXAddress}` : undefined,
    token0PriceUsd: pool.tokenXPriceUsd,
    token0MarketCapUsd: pool.tokenXMarketCapUsd,
    token0Volume24hUsd: pool.volume24hUsd,
    token0Holders: pool.tokenXHolders,
    token0AgeHours: pool.tokenXAgeHours,
    token0SmartDegenCount: undefined, // not exposed by Meteora DLMM API
    token0Verified: pool.tokenXVerified,
    liquidityUsd: pool.tvlUsd || 0,
    volume1hUsd: pool.volume1hUsd || 0,
    securityAuditPassed: true,
    socialHypeScore: pool.organicVolumeScore1h || 0,
  };
}
