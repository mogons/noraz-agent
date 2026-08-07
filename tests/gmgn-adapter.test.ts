import { describe, it, expect, vi, afterEach } from 'vitest';
import { GMGNAdapter } from '../src/adapters/gmgn-adapter.js';

describe('GMGNAdapter (OpenAPI)', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GMGN_API_KEY; });

  it('returns [] without an API key (fail-closed)', async () => {
    const adapter = new GMGNAdapter();
    expect(await adapter.fetchRank('sol')).toEqual([]);
  });

  it('parses /v1/market/rank response with real GMGN fields', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: { data: { rank: [{
        chain: 'sol', address: 'abc', symbol: 'TEST', name: 'Test',
        price: '0.001', market_cap: 100000, volume: 200000, liquidity: 30000,
        buys: 800, sells: 200, cto_flag: 1, smart_degen_count: 5,
        dev_team_hold_rate: 0.02, bundler_rate: 0.1, rug_ratio: 0.01,
        is_wash_trading: false, creation_timestamp: 1786000000,
        price_change_percent1h: 55, visiting_count: 300,
        twitter_rename_count: 0, twitter_del_post_token_count: 0, twitter_create_token_count: 1,
      }] } } }),
    }));
    const adapter = new GMGNAdapter();
    const [t] = await adapter.fetchRank('sol');
    expect(t.symbol).toBe('TEST');
    expect(t.ctoFlag).toBe(true);
    expect(t.smartDegenCount).toBe(5);
    expect(t.rugRatio).toBe(0.01);
    expect(t.source).toBe('gmgn');
  });

  it('normalizes missing optional fields to null/0 (never fabricates)', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: { data: { rank: [{ symbol: 'MIN', address: 'x' }] } } }),
    }));
    const adapter = new GMGNAdapter();
    const [t] = await adapter.fetchRank('sol');
    expect(t.rugRatio).toBeNull();
    expect(t.smartDegenCount).toBe(0);
    expect(t.creationTimestamp).toBeNull();
  });

  it('parses token_signal events', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: [{ token_address: 'tok1', signal_type: 7, trigger_at: 1786095170, trigger_mc: 100000, data: { symbol: 'SIG', address: 'tok1' } }] }),
    }));
    const adapter = new GMGNAdapter();
    const evts = await adapter.fetchTokenSignals('sol', [6, 7, 8]);
    expect(evts.length).toBe(1);
    expect(evts[0].signal_type).toBe(7);
    expect(evts[0].data.symbol).toBe('SIG');
  });

  it('handles 429 with reset wait and does not spam', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => String(Math.floor(Date.now()/1000) + 1) } })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ code: 0, data: { data: { rank: [] } } }) });
    vi.stubGlobal('fetch', fn);
    const adapter = new GMGNAdapter();
    const res = await adapter.fetchRank('sol');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(res).toEqual([]);
  }, 15000);
});
