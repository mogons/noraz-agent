import { getEnvString } from '../config/config.js';

interface RpcStatus {
  url: string;
  latencyMs: number;
  healthy: boolean;
}

export class RPCFailoverManager {
  private endpoints: Record<string, string[]> = {
    evm: [],
  };
  private status: Record<string, RpcStatus[]> = {};

  constructor() {
    const configured = (() => {
      const raw = getEnvString('RPC_FAILOVER_URLS');
      if (!raw) return {} as Record<string, string[]>;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
        const out: Record<string, string[]> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (Array.isArray(value)) {
            out[key] = value.filter((u): u is string => typeof u === 'string');
          }
        }
        return out;
      } catch {
        return {};
      }
    })();
    const evmUrls = [
      ...(configured.evm || []),
      getEnvString('EVM_ROBINHOOD_RPC_URL'),
    ].filter((u): u is string => Boolean(u));

    this.endpoints.evm = evmUrls;
    this.status.evm = this.endpoints.evm.map((url) => ({ url, latencyMs: Infinity, healthy: false }));
  }

  public getRpcUrls(chain: 'evm'): string[] {
    return this.endpoints[chain];
  }

  public async probeLatencies(): Promise<void> {
    await Promise.all(this.status.evm.map(async (s) => {
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

  public getActiveRPC(chain: 'evm'): string {
    const healthy = this.status[chain]
      .filter((s) => s.healthy)
      .sort((a, b) => a.latencyMs - b.latencyMs);
    return healthy[0]?.url ?? this.endpoints[chain][0] ?? '';
  }

  public reportRPCFailure(chain: 'evm', url: string): void {
    const entry = this.status[chain].find((s) => s.url === url);
    if (entry) entry.healthy = false;
  }
}

export const globalRPCFailoverManager = new RPCFailoverManager();
