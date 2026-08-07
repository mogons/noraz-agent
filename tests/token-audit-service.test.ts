import { describe, it, expect, vi, afterEach } from 'vitest';
import { runTokenAudit } from '../src/services/token-audit-service.js';

describe('runTokenAudit', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GMGN_API_KEY; });

  it('returns unavailable message when no data sources respond (fail-closed, no canned numbers)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await runTokenAudit('So11111111111111111111111111111111111111112');
    expect(res.success).toBe(false);
    expect(res.content).toContain('tidak tersedia');
    expect(res.content).not.toContain('$0.0035');
  });
});
