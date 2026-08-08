import type { CallCardPayload } from '../agents/shared/agent-contract.js';
import type { MeteoraPoolSignal } from '../adapters/meteora-dlmm-adapter.js';
import type { UniswapPoolSignal } from '../adapters/uniswap-lp-adapter.js';

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
 * LP pool signals (Meteora Solana / Uniswap EVM) share a common yield-shape;
 * this single helper builds the call-card payload for both domains so hub.ts
 * and index.ts never duplicate the mapping.
 */
export type LPPoolSignal = MeteoraPoolSignal | UniswapPoolSignal;

export function buildLPPayload(pool: LPPoolSignal, domain: 'lp-solana' | 'lp-evm'): CallCardPayload {
  const isSolana = domain === 'lp-solana';
  return {
    domain: isSolana ? 'LP_METEORA' : 'LP_UNISWAP',
    title: pool.pairName,
    symbol: pool.pairName.split(' ')[0],
    contractAddress: pool.poolAddress,
    network: isSolana ? 'Solana' : (pool as UniswapPoolSignal).network,
    liquidity: `$${(pool.tvlUsd / 1000).toFixed(1)}k`,
    devHoldingPct: `${pool.feeAprPercentage}% APR`,
    sniperPct: `${(pool.feesToTvlRatio1h * 100).toFixed(2)}% 1h`,
    bundlerPct: `${pool.volumeToTvlRatio1h.toFixed(1)}x vol/TVL`,
    dexPaidStatus: isSolana ? 'Meteora DLMM' : 'Uniswap v3',
    confidenceScore: 80,
    aiThesis: pool.aiRecommendation,
    liquidityUsd: pool.tvlUsd || 0,
    volume1hUsd: pool.volume1hUsd || 0,
    securityAuditPassed: true,
    socialHypeScore: pool.organicVolumeScore1h || 0,
  };
}
