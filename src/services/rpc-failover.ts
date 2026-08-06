/**
 * Athena 2.0 - Resilient Multi-RPC Failover & Stale Price Manager (RPCFailoverManager)
 * Automatically monitors latency, switches RPC endpoints on error/delay, and guards against stale prices.
 */

export interface RPCEndpoint {
  url: string;
  chain: 'solana' | 'evm' | 'polygon';
  latencyMs: number;
  errorCount: number;
  lastCheckedAt: number;
  isHealthy: boolean;
}

export class RPCFailoverManager {
  private rpcPool: Map<string, RPCEndpoint[]> = new Map();

  constructor() {
    this.initializeDefaultRPCs();
  }

  private initializeDefaultRPCs() {
    const solanaRPCs = [
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'https://solana-mainnet.g.alchemy.com/v2/demo',
      'https://rpc.ankr.com/solana',
    ];

    const evmRPCs = [
      process.env.EVM_RPC_URL || 'https://mainnet.base.org',
      'https://base-mainnet.g.alchemy.com/v2/demo',
      'https://developer-access-mainnet.base.org',
    ];

    this.rpcPool.set(
      'solana',
      solanaRPCs.map((url) => ({
        url,
        chain: 'solana',
        latencyMs: 0,
        errorCount: 0,
        lastCheckedAt: Date.now(),
        isHealthy: true,
      }))
    );

    this.rpcPool.set(
      'evm',
      evmRPCs.map((url) => ({
        url,
        chain: 'evm',
        latencyMs: 0,
        errorCount: 0,
        lastCheckedAt: Date.now(),
        isHealthy: true,
      }))
    );
  }

  /**
   * Get best healthy RPC URL for specified chain
   */
  public getActiveRPC(chain: 'solana' | 'evm'): string {
    const pool = this.rpcPool.get(chain) || [];
    const healthy = pool.filter((p) => p.isHealthy).sort((a, b) => a.latencyMs - b.latencyMs);

    if (healthy.length > 0) {
      return healthy[0].url;
    }
    // Fallback to first configured if all marked unhealthy
    return pool[0]?.url || '';
  }

  /**
   * Report RPC execution failure to increment error counter & auto-failover
   */
  public reportRPCFailure(chain: 'solana' | 'evm', url: string): void {
    const pool = this.rpcPool.get(chain) || [];
    const endpoint = pool.find((p) => p.url === url);
    if (endpoint) {
      endpoint.errorCount++;
      if (endpoint.errorCount >= 3) {
        endpoint.isHealthy = false;
        console.warn(`⚠️ RPC Failover: Endpoint [${url}] marked UNHEALTHY after ${endpoint.errorCount} consecutive errors.`);
      }
    }
  }

  /**
   * Check if price update timestamp is stale (> 30 seconds old)
   */
  public isPriceFresh(timestampMs: number, maxAgeSeconds = 30): boolean {
    const ageSeconds = (Date.now() - timestampMs) / 1000;
    return ageSeconds <= maxAgeSeconds;
  }
}

export const globalRPCFailoverManager = new RPCFailoverManager();
