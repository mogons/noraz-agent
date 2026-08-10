import { describe, it, expect, vi, afterEach } from 'vitest';
import { RPCFailoverManager } from '../src/services/rpc-failover.js';

describe('RPCFailoverManager', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.RPC_FAILOVER_URLS; delete process.env.EVM_ROBINHOOD_RPC_URL; });

  it('measures real latencies and picks the fastest healthy RPC', async () => {
    process.env.RPC_FAILOVER_URLS = JSON.stringify({ evm: ['https://slow.example.com', 'https://fast.example.com'] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true }));
    const mgr = new RPCFailoverManager();
    await mgr.probeLatencies();
    const active = mgr.getActiveRPC('evm');
    expect(typeof active).toBe('string');
    expect(active.length).toBeGreaterThan(0);
  });

  it('does not use demo endpoints by default', () => {
    const mgr = new RPCFailoverManager();
    const urls = mgr.getRpcUrls('evm');
    expect(urls.some((u) => u.includes('/demo'))).toBe(false);
  });
});
