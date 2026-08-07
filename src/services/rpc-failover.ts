import { getEnvString } from '../config/config.js';

export interface RPCEndpoint {
  url: string;
  chain: 'solana' | 'evm' | 'polygon';
  latencyMs: number;
  errorCount: number;
  lastCheckedAt: number;
  isHealthy: boolean;
}

interface RpcStatus {
  url: string;
  latencyMs: number;
  healthy: boolean;
}

export class RPCFailoverManager {
  private endpoints: Record<string, string[]> = {
    solana: [],
    evm: [],
  };
  private status: Record<string, RpcStatus[]> = {};

  constructor() {
    const configured = (() => {
      const raw = getEnvString('RPC_FAILOVER_URLS');
      if (!raw) return {};
      try { return JSON.parse(raw); } catch { return {}; }
    })();
    const solanaUrls = [
      ...((configured as any).solana as string[] | undefined || []),
      getEnvString('SOLANA_RPC_URL'),
    ].filter((u): u is string => Boolean(u));
    const evmUrls = [
      ...((configured as any).evm as string[] | undefined || []),
      getEnvString('EVM_RPC_URL'),
      getEnvString('BASE_RPC_URL'),
    ].filter((u): u is string => Boolean(u));

    this.endpoints.solana = solanaUrls;
    this.endpoints.evm = evmUrls;
    for (const chain of ['solana', 'evm'] as const) {
      this.status[chain] = this.endpoints[chain].map((url) => ({ url, latencyMs: Infinity, healthy: false }));
    }
  }

  public getRpcUrls(chain: 'solana' | 'evm'): string[] {
    return this.endpoints[chain];
  }

  public async probeLatencies(): Promise<void> {
    for (const chain of ['solana', 'evm'] as const) {
      await Promise.all(this.status[chain].map(async (s) => {
        const start = Date.now();
        try {
          const res = await fetch(s.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          s.latencyMs = Date.now() - start;
          s.healthy = res.ok;
        } catch {
          s.latencyMs = Infinity;
          s.healthy = false;
        }
      }));
    }
  }

  public getActiveRPC(chain: 'solana' | 'evm'): string {
    const healthy = this.status[chain]
      .filter((s) => s.healthy)
      .sort((a, b) => a.latencyMs - b.latencyMs);
    return healthy[0]?.url ?? this.endpoints[chain][0] ?? '';
  }

  public reportRPCFailure(chain: 'solana' | 'evm', url: string): void {
    const entry = this.status[chain].find((s) => s.url === url);
    if (entry) entry.healthy = false;
  }

  public isPriceFresh(timestampMs: number, maxAgeSeconds = 30): boolean {
    const ageSeconds = (Date.now() - timestampMs) / 1000;
    return ageSeconds <= maxAgeSeconds;
  }

  public getRpcPool(chain: 'solana' | 'evm'): RPCEndpoint[] {
    return this.endpoints[chain].map((url) => {
      const s = this.status[chain].find((x) => x.url === url);
      return {
        url,
        chain,
        latencyMs: s?.latencyMs ?? 0,
        errorCount: s && !s.healthy ? 1 : 0,
        lastCheckedAt: Date.now(),
        isHealthy: s?.healthy ?? false,
      };
    });
  }
}

export const globalRPCFailoverManager = new RPCFailoverManager();
