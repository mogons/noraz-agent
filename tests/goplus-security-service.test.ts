import { describe, it, expect, vi, afterEach } from 'vitest';
import { GoPlusSecurityService } from '../src/services/goplus-security-service.js';

describe('GoPlusSecurityService', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('parses a real GoPlus response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          '0xabc123': { is_honeypot: '0', buy_tax: '1.5', sell_tax: '2', is_blacklisted: '0', is_open_source: '1', holder_count: '1000' },
        },
      }),
    }));
    const svc = new GoPlusSecurityService();
    const audit = await svc.auditToken('base', '0xabc123');
    expect(audit).not.toBeNull();
    expect(audit!.isHoneypot).toBe(false);
    expect(audit!.buyTaxPct).toBe(1.5);
    expect(audit!.sellTaxPct).toBe(2);
    expect(audit!.isBlacklisted).toBe(false);
  });

  it('returns null on honeypot detection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { '0xabc': { is_honeypot: '1', buy_tax: '0', sell_tax: '0' } } }),
    }));
    const svc = new GoPlusSecurityService();
    expect(await svc.auditToken('eth', '0xabc')).toBeNull();
  });

  it('returns null on API failure (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const svc = new GoPlusSecurityService();
    expect(await svc.auditToken('base', '0xabc')).toBeNull();
  });

  it('rotates to the backup key on 401 and succeeds', async () => {
    process.env.GOPLUS_API_KEY = 'gk1';
    process.env.GOPLUS_BACKUP_KEYS = 'gk2';
    const svc = new GoPlusSecurityService();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ code: 1, result: {} }), { status: 200 });
    }));
    await svc.auditTokenFull('robinhood', '0xabc');
    expect(calls).toBe(2);
    vi.unstubAllGlobals();
    delete process.env.GOPLUS_API_KEY;
    delete process.env.GOPLUS_BACKUP_KEYS;
  });
});
