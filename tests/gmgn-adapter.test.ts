import { describe, it, expect, vi, afterEach } from 'vitest';
import { GMGNAdapter } from '../src/adapters/gmgn-adapter.js';

describe('GMGNAdapter (OpenAPI)', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GMGN_API_KEY; delete process.env.GMGN_REQUEST_SPACING_MS; });

  it('returns [] without an API key (fail-closed)', async () => {
    const adapter = new GMGNAdapter();
    expect(await adapter.fetchRank('sol')).toEqual([]);
  });

  it('paces requests — burst calls are spaced apart (shared queue across instances)', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    process.env.GMGN_REQUEST_SPACING_MS = '120'; // minimal spacing for fast tests
    const okRes = { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ code: 0, data: { data: { rank: [] } } }) };
    const callTimes: number[] = [];
    const fn = vi.fn().mockImplementation(async () => { callTimes.push(Date.now()); return okRes; });
    vi.stubGlobal('fetch', fn);
    const a = new GMGNAdapter();
    const b = new GMGNAdapter(); // different instance — queue is static/shared
    await Promise.all([
      a.fetchRank('sol'), a.fetchRank('sol'), b.fetchRank('sol'), b.fetchRank('sol'), a.fetchRank('sol'),
    ]);
    expect(fn).toHaveBeenCalledTimes(5);
    callTimes.sort((x, y) => x - y);
    // With 120ms spacing, 5 requests span at least 4 × 120ms apart overall.
    const totalMs = callTimes[callTimes.length - 1] - callTimes[0];
    expect(totalMs).toBeGreaterThanOrEqual(400);
  }, 15000);

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

  it('rank interval=1h maps bare volume to volume1hUsd, not volume24hUsd', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: { data: { rank: [{
        chain: 'robinhood', address: 'abc', symbol: 'PURR', name: 'Purr',
        price: '0.001', market_cap: 100000, volume: 28000, liquidity: 30000,
        creation_timestamp: 1786000000, price_change_percent1h: 55,
      }] } } }),
    }));
    const adapter = new GMGNAdapter();
    const [t] = await adapter.fetchRank('robinhood', { interval: '1h' });
    expect(t.volume1hUsd).toBe(28000);
    expect(t.volume24hUsd).toBe(0); // unknown — never fabricate 24h from a 1h window
  });

  it('rank interval=24h maps bare volume to volume24hUsd', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: { data: { rank: [{
        chain: 'robinhood', address: 'abc', symbol: 'PURR', name: 'Purr',
        price: '0.001', market_cap: 100000, volume: 12310400, liquidity: 30000,
        creation_timestamp: 1786000000, price_change_percent1h: 55,
      }] } } }),
    }));
    const adapter = new GMGNAdapter();
    const [t] = await adapter.fetchRank('robinhood', { interval: '24h' });
    expect(t.volume24hUsd).toBe(12310400);
    expect(t.volume1hUsd).toBe(0);
  });

  it('trenches keeps explicit volume_1h and volume_24h real values', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: {
        new_creation: [], pump: [], completed: [{
          chain: 'robinhood', address: 'abc', symbol: 'FRESH', name: 'Fresh',
          price: '0.001', market_cap: 100000, volume_1h: 3000, volume_24h: 50000, liquidity: 30000,
          creation_timestamp: 1786000000, price_change_percent1h: 10,
        }],
      } }),
    }));
    const adapter = new GMGNAdapter();
    const { completed } = await adapter.fetchTrenches('robinhood', { types: ['completed'] });
    expect(completed[0].volume1hUsd).toBe(3000);
    expect(completed[0].volume24hUsd).toBe(50000);
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

  it('parses /v1/token/info response (token under data, price/stat nested)', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: {
        address: 'tok123', symbol: 'WATCH', name: 'Watch Token',
        liquidity: '40000', holder_count: 5233, visiting_count: 300,
        circulating_supply: '100000000', creation_timestamp: 1786000000,
        price: { price: '0.0012', price_1h: '0.001', volume_24h: '250000', buys_24h: 800, sells_24h: 200, swaps_24h: 1000 },
        dev: { creator_token_status: 'creator_close', cto_flag: 1, dexscr_boost_fee: 0, dexscr_ad: 0, twitter_del_post_token_count: 0, twitter_create_token_count: 1 },
        stat: { top_10_holder_rate: '0.1', dev_team_hold_rate: '0.02', top_bundler_trader_percentage: '0.05', top_rat_trader_percentage: '0.01' },
        wallet_tags_stat: { smart_wallets: 7, renowned_wallets: 2 },
      } }),
    }));
    const adapter = new GMGNAdapter();
    const t = await adapter.fetchTokenInfo('sol', 'tok123');
    expect(t).not.toBeNull();
    expect(t!.address).toBe('tok123');
    expect(t!.symbol).toBe('WATCH');
    expect(t!.priceUsd).toBeCloseTo(0.0012, 8);
    expect(t!.volume24hUsd).toBeCloseTo(250000, 3);
    expect(t!.smartDegenCount).toBe(7);
    expect(t!.renownedCount).toBe(2);
    expect(t!.marketCapUsd).toBeCloseTo(120000, 3);
    expect(t!.ctoFlag).toBe(true);
    expect(t!.creatorTokenStatus).toBe('creator_close');
    expect(t!.priceChange1h).toBeCloseTo(20, 5);
    expect(t!.source).toBe('gmgn');
  });

  it('fetchTokenInfo returns null on non-ok or empty data (fail-closed)', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ code: 0, data: null }) });
    vi.stubGlobal('fetch', fn);
    const adapter = new GMGNAdapter();
    expect(await adapter.fetchTokenInfo('sol', 'tok123')).toBeNull();
    expect(await adapter.fetchTokenInfo('sol', 'tok123')).toBeNull();
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

  it('skips long bans (>30s) without retrying (never extends the ban)', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const fn = vi.fn().mockResolvedValue({
      ok: false, status: 429,
      headers: { get: () => null },
      json: async () => ({ code: 429, error: 'RATE_LIMIT_BANNED', message: 'banned', reset_at: Math.floor(Date.now()/1000) + 300 }),
    });
    vi.stubGlobal('fetch', fn);
    const adapter = new GMGNAdapter();
    const res = await adapter.fetchRank('sol');
    expect(fn).toHaveBeenCalledTimes(1); // no retry during a 5-minute ban
    expect(res).toEqual([]);
  });

  it('retries once when the reset is near (<30s) then gives up', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => String(Math.floor(Date.now()/1000) + 2) } })
      .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => String(Math.floor(Date.now()/1000) + 2) } });
    vi.stubGlobal('fetch', fn);
    const adapter = new GMGNAdapter();
    const res = await adapter.fetchRank('sol');
    expect(fn).toHaveBeenCalledTimes(2); // one wait + one retry, then stop
    expect(res).toEqual([]);
  }, 15000);

  it('fetchTrenches sends the v2 request shape and parses completed', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const fn = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: {
        completed: [{ address: 'c1', symbol: 'COMP', exchange: 'raydium', launchpad_platform: 'Pump.fun', launchpad_status: '1', progress: 1 }],
        new_creation: [], pump: [],
      } }),
    });
    vi.stubGlobal('fetch', fn);
    const adapter = new GMGNAdapter();
    const res = await adapter.fetchTrenches('sol', {
      types: ['completed'],
      limit: 80,
      filters: { max_rug_ratio: 0.3, max_bundler_rate: 0.3 },
    });
    expect(res.completed.length).toBe(1);
    expect(res.completed[0].exchange).toBe('raydium');
    expect(res.completed[0].progress).toBe(1);
    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.version).toBe('v2');
    expect(body.completed).toBeDefined();
    expect(body.completed.limit).toBe(80);
    expect(body.completed.max_rug_ratio).toBe(0.3);
    expect(body.completed.launchpad_platform_v2).toBe(true);
  });

  it('fetchHotSearches parses the top tokens block', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: [{ interval: '1h', chain: 'sol', tokens: [{ address: 'h1', symbol: 'HOT', exchange: 'pump_amm', launchpad_status: '1' }] }] }),
    }));
    const adapter = new GMGNAdapter();
    const tokens = await adapter.fetchHotSearches({ chain: 'sol', interval: '1h', filters: ['migrated', 'renounced', 'frozen'] });
    expect(tokens.length).toBe(1);
    expect(tokens[0].symbol).toBe('HOT');
    expect(tokens[0].exchange).toBe('pump_amm');
  });

  it('normalizes exchange/launchpad/progress fields for graduated detection', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: { data: { rank: [
        { symbol: 'DEX', address: 'd1', exchange: 'raydium', launchpad_platform: 'Pump.fun', launchpad_status: '1' },
        { symbol: 'BOND', address: 'b1', exchange: 'pump', progress: 0.4 },
      ] } } }),
    }));
    const adapter = new GMGNAdapter();
    const tokens = await adapter.fetchRank('sol');
    expect(tokens[0].exchange).toBe('raydium');
    expect(tokens[0].launchpadStatus).toBe('1');
    expect(tokens[1].exchange).toBe('pump');
    expect(tokens[1].progress).toBe(0.4);
  });

  it('fetchTokenSecurity parses audit fields dari /v1/token/security', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({
        code: 0,
        data: {
          address: 'tok1',
          is_honeypot: false, is_blacklist: true, is_renounced: true,
          renounced_mint: false, renounced_freeze_account: false, can_not_sell: '1',
          buy_tax: '0', sell_tax: '2.5', average_tax: '1.2', high_tax: '8',
          is_open_source: true, burn_ratio: '3.5', lock_summary: { is_locked: true },
          is_show_alert: false, flags: ['fake_volume'],
        },
      }),
    }));
    const adapter = new GMGNAdapter();
    const a = await adapter.fetchTokenSecurity('sol', 'tok1');
    expect(a).not.toBeNull();
    expect(a!.isBlacklist).toBe(true);
    expect(a!.isRenounced).toBe(true);
    expect(a!.canNotSell).toBe(true);
    expect(a!.sellTaxPct).toBe(2.5);
    expect(a!.highTaxPct).toBe(8);
    expect(a!.burnRatioPct).toBe(3.5);
    expect(a!.isLocked).toBe(true);
    expect(a!.flags).toEqual(['fake_volume']);
  });

  it('fetchTokenSecurity fail-closed: error/API code != 0 → null', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 401, message: 'rate limited' }),
    }));
    const adapter = new GMGNAdapter();
    expect(await adapter.fetchTokenSecurity('sol', 'tok_fail_closed')).toBeNull();
  });

  it('fetchTokenSecurity cache module-level: call kedua tidak fetch ulang (TTL 10m)', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const fn = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ code: 0, data: { is_honeypot: false } }),
    });
    vi.stubGlobal('fetch', fn);
    const a = new GMGNAdapter();
    const b = new GMGNAdapter(); // instansi berbeda — cache tetap dibagi
    await a.fetchTokenSecurity('robinhood', '0xABC');
    await b.fetchTokenSecurity('robinhood', '0xabc'); // lowercase → key sama
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
