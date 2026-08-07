import { describe, it, expect, vi, afterEach } from 'vitest';
import { MEVExecutionGuard } from '../src/adapters/mev-execution-guard.js';

describe('MEVExecutionGuard', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('does not return mock success when RPC is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rpc down')));
    const guard = new MEVExecutionGuard();
    const res = await guard.simulateTransaction('evm', { from: '0xabc', to: '0xdef', data: '0x1234' });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBeTruthy();
  });

  it('rejects incomplete EVM payloads without calling RPC', async () => {
    const guard = new MEVExecutionGuard();
    const res = await guard.simulateTransaction('evm', {});
    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain('Missing');
  });
});
