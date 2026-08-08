import { describe, it, expect, vi, afterEach } from 'vitest';
import { RobinhoodScreeningAgent, RobinhoodSignal } from '../src/agents/meme-robinhood/robinhood-screening-agent.js';
import { createDedupe, volume24hOf, buildSignalBoostMap, applySignalBoost } from '../src/agents/shared/gmgn-meme-helpers.js';
import type { GMGNRawToken } from '../src/adapters/gmgn-adapter.js';

const ETH_PRICE = 1929.03;

const mkToken = (over: Partial<GMGNRawToken> = {}): GMGNRawToken => ({
  chain: 'robinhood', address: 'addr1', symbol: 'TEST', name: 'Test Token',
  priceUsd: 0.001, marketCapUsd: 200000, volume24hUsd: 300000, volume1hUsd: 30000, liquidityUsd: 50000,
  buys: 800, sells: 200, swaps: 1000, holderCount: 500,
  top10HolderRate: 0.1, devTeamHoldRate: 0.0, creatorClose: true, creatorTokenStatus: 'creator_close',
  smartDegenCount: 5, renownedCount: 2, bundlerRate: 0.1, ratTraderAmountRate: 0.02,
  rugRatio: 0.01, isWashTrading: false, ctoFlag: true, renouncedMint: true, renouncedFreeze: true,
  creationTimestamp: Date.now()/1000 - 6*3600, openTimestamp: Date.now()/1000 - 6*3600,
  priceChange1m: 2, priceChange5m: 5, priceChange1h: 120,
  visitingCount: 300, squareMentions: 10,
  twitterRenameCount: 0, twitterDelPostCount: 0, twitterCreateTokenCount: 1,
  buyTax: null, sellTax: null, dexscrBoostFee: 0, dexscrAd: 0, totalFeeNative: 1, source: 'gmgn',
  exchange: 'pump_amm', launchpadPlatform: 'Pump.fun', launchpadStatus: '1', progress: 1,
  ...over,
});

describe('RobinhoodScreeningAgent', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GMGN_API_KEY; });

  it('preFilter passes young & unknown-age tokens (age gate off — degen early)', () => {
    const agent = new RobinhoodScreeningAgent();
    // age gate default 0: umur tidak jadi kriteria, token baru 1 jam lolos
    expect(agent.preFilter(mkToken({ creationTimestamp: Date.now()/1000 - 3600 }), ETH_PRICE).ok).toBe(true);
    // creationTimestamp null juga lolos (umur bukan kriteria)
    expect(agent.preFilter(mkToken({ creationTimestamp: null }), ETH_PRICE).ok).toBe(true);
  });

  it('preFilter rejects wash trading (bundler tidak digate)', () => {
    const agent = new RobinhoodScreeningAgent();
    expect(agent.preFilter(mkToken({ isWashTrading: true }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken({ bundlerRate: 0.6 }), ETH_PRICE).ok).toBe(true);
  });

  it('preFilter enforces market cap gate (wajib > $100k, fail-closed)', () => {
    const agent = new RobinhoodScreeningAgent();
    expect(agent.preFilter(mkToken({ marketCapUsd: 50000 }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken({ marketCapUsd: 0 }), ETH_PRICE).ok).toBe(false);
    const r = agent.preFilter(mkToken({ marketCapUsd: 50000 }), ETH_PRICE);
    expect(r.reason).toContain('market cap');
    expect(agent.preFilter(mkToken(), ETH_PRICE).ok).toBe(true); // 200k ≥ 100k
  });

  it('volume24hOf uses real 24h when present, else estimates 1h×24, else 0', () => {
    expect(volume24hOf(mkToken({ volume24hUsd: 50000, volume1hUsd: 0 }))).toBe(50000);
    expect(volume24hOf(mkToken({ volume24hUsd: 0, volume1hUsd: 30000 }))).toBe(720000);
    expect(volume24hOf(mkToken({ volume24hUsd: 0, volume1hUsd: 0 }))).toBe(0);
  });

  it('preFilter passes a rank-1h-style token (only 1h volume, est 24h >= 200k)', () => {
    const agent = new RobinhoodScreeningAgent();
    const res = agent.preFilter(mkToken({ volume24hUsd: 0, volume1hUsd: 15000 }), ETH_PRICE);
    expect(res.ok).toBe(true); // 15k × 24 = 360k ≥ 200k
  });

  it('preFilter rejects 1h-only token whose est 24h is below the gate', () => {
    const agent = new RobinhoodScreeningAgent();
    const res = agent.preFilter(mkToken({ volume24hUsd: 0, volume1hUsd: 500 }), ETH_PRICE);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('volume 24h');
  });

  it('preFilter passes a healthy token', () => {
    const agent = new RobinhoodScreeningAgent();
    expect(agent.preFilter(mkToken(), ETH_PRICE).ok).toBe(true);
  });

  it('preFilter enforces total-fee gate (> $500, live ETH price)', () => {
    const agent = new RobinhoodScreeningAgent();
    // 0.2 ETH @ $1929.03 = $385.81 < $500 → reject
    expect(agent.preFilter(mkToken({ totalFeeNative: 0.2 }), ETH_PRICE).ok).toBe(false);
    // fee null → fail-closed (aktivitas organik tak tercatat)
    expect(agent.preFilter(mkToken({ totalFeeNative: null }), ETH_PRICE).ok).toBe(false);
    // 1 ETH @ $1929.03 = $1,929 ≥ $500 → pass
    expect(agent.preFilter(mkToken(), ETH_PRICE).ok).toBe(true);
  });

  it('preFilter re-enables age & fee gates when thresholds > 0', () => {
    const agent = new RobinhoodScreeningAgent();
    agent.updateConfig({ minAgeHours: 2, minTotalFeeUsd: 500 });
    expect(agent.preFilter(mkToken({ creationTimestamp: Date.now()/1000 - 3600 }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken({ totalFeeNative: 0.2 }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken({ totalFeeNative: null }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken(), null).ok).toBe(false);
  });

  it('detectSignal returns CTO for cto_flag token', () => {
    const agent = new RobinhoodScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: true }));
    expect(det.type).toBe('CTO');
    expect(det.confidence).toBeGreaterThanOrEqual(80);
  });

  it('detectSignal returns REVIVAL for dead token waking up without CTO', () => {
    const agent = new RobinhoodScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: false, priceChange1h: 60 }));
    expect(det.type).toBe('REVIVAL');
  });

  it('detectSignal returns MOMENTUM for strong pump without CTO', () => {
    const agent = new RobinhoodScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: false, priceChange1h: 40, priceChange5m: 3 }));
    expect(det.type).toBe('MOMENTUM');
  });

  it('detectSignal disables CTO on dexscreener source', () => {
    const agent = new RobinhoodScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: true, source: 'dexscreener' }));
    expect(det.type).not.toBe('CTO');
  });

  it('detectSignal rejects "kosongan" tokens — butuh minimal 1 dari 3 (smart wallet/CTO/KOL)', () => {
    const agent = new RobinhoodScreeningAgent();
    // 0/3 sinyal: cuma volume pump, tanpa smart wallet/CTO/KOL → NONE
    const empty = agent.detectSignal(mkToken({ smartDegenCount: 0, renownedCount: 0, ctoFlag: false, priceChange1h: 40, priceChange5m: 3, volume24hUsd: 300000 }));
    expect(empty.type).toBe('NONE');
    expect(empty.reasons.some((r) => r.includes('Kosongan'))).toBe(true);
    // 1/3 sinyal: cuma smart wallet → MOMENTUM (lolos gate)
    const one = agent.detectSignal(mkToken({ smartDegenCount: 1, renownedCount: 0, ctoFlag: false, priceChange1h: 40, priceChange5m: 3 }));
    expect(one.type).toBe('MOMENTUM');
    // 2/3 sinyal: smart wallet + KOL → MOMENTUM
    const two = agent.detectSignal(mkToken({ smartDegenCount: 1, renownedCount: 1, ctoFlag: false, priceChange1h: 40, priceChange5m: 3 }));
    expect(two.type).toBe('MOMENTUM');
  });

  it('runScreeningPass returns [] without network', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const agent = new RobinhoodScreeningAgent();
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
  });

  it('runScreeningPass passes a healthy token using GMGN-based audit (no GoPlus needed)', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const mkWire = (t: GMGNRawToken) => ({
      address: t.address, symbol: t.symbol, name: t.name,
      price: t.priceUsd, market_cap: t.marketCapUsd, volume: t.volume24hUsd, liquidity: t.liquidityUsd,
      buys: t.buys, sells: t.sells, swaps: t.swaps, holder_count: t.holderCount,
      top_10_holder_rate: t.top10HolderRate, dev_team_hold_rate: t.devTeamHoldRate,
      creator_token_status: t.creatorTokenStatus, smart_degen_count: t.smartDegenCount,
      renowned_count: t.renownedCount, bundler_rate: t.bundlerRate,
      rat_trader_amount_rate: t.ratTraderAmountRate, rug_ratio: t.rugRatio,
      is_wash_trading: t.isWashTrading ? 1 : 0, cto_flag: t.ctoFlag ? 1 : 0,
      is_honeypot: t.isHoneypot ? 1 : 0, buy_tax: t.buyTax, sell_tax: t.sellTax,
      renounced_mint: t.renouncedMint ? 1 : 0, renounced_freeze_account: t.renouncedFreeze ? 1 : 0,
      creation_timestamp: t.creationTimestamp, open_timestamp: t.openTimestamp,
      price_change_percent1m: t.priceChange1m, price_change_percent5m: t.priceChange5m,
      price_change_percent1h: t.priceChange1h, visiting_count: t.visitingCount,
      square_mentions: t.squareMentions, twitter_rename_count: t.twitterRenameCount,
      twitter_del_post_token_count: t.twitterDelPostCount,
      twitter_create_token_count: t.twitterCreateTokenCount,
      total_fee: t.totalFeeNative, dexscr_boost_fee: t.dexscrBoostFee, dexscr_ad: t.dexscrAd,
      exchange: t.exchange, launchpad_platform: t.launchpadPlatform, launchpad_status: t.launchpadStatus, progress: t.progress,
    });
    const healthy = mkToken(); // passes preFilter: $300k vol, $50k liq, CTO + smart money
    const rankResponse = {
      code: 0,
      data: { data: { rank: [mkWire(healthy)] } },
    };
    const emptyTrenches = { code: 0, data: { new_creation: [], pump: [], near_completion: [], completed: [] } };
    const priceResponse = { ethereum: { usd: ETH_PRICE, usd_24h_change: 1.5 } };

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('openapi.gmgn.ai/v1/market/rank')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => rankResponse };
      if (url.includes('openapi.gmgn.ai/v1/market/hot_searches')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ code: 0, data: [{ tokens: [] }] }) };
      if (url.includes('openapi.gmgn.ai/v1/trenches')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => emptyTrenches };
      if (url.includes('coingecko')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => priceResponse };
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const agent = new RobinhoodScreeningAgent();
    expect(agent.preFilter(healthy, ETH_PRICE).ok).toBe(true); // sanity: GMGN audit gates pass
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(1);
    expect(reports[0].payload?.domain).toBe('MEME_EVM');
  });

  it('preFilter rejects honeypot & high-tax tokens from GMGN audit data', () => {
    const agent = new RobinhoodScreeningAgent();
    expect(agent.preFilter(mkToken({ isHoneypot: true }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken({ buyTax: '15' }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken({ sellTax: '20' }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken({ isHoneypot: false, buyTax: '0', sellTax: '0' }), ETH_PRICE).ok).toBe(true);
  });

  it('toStrategyGmgn contract maps GMGN fields for the default strategy (native_price_usd = ETH)', async () => {
    const agent = new RobinhoodScreeningAgent();
    const token = mkToken(); // healthy CTO token (totalFeeNative 1 ETH)
    const gmgnCtx = { ...agent.toStrategyGmgn(token), native_price_usd: ETH_PRICE };
    expect(gmgnCtx.ageHours).toBeGreaterThan(0);
    expect(gmgnCtx.cto_flag).toBe(1);
    expect(gmgnCtx.volume_24h).toBe(token.volume24hUsd);
    expect(gmgnCtx.total_fee).toBe(1);
    expect(gmgnCtx.native_price_usd).toBe(ETH_PRICE);
    expect(gmgnCtx.chain).toBe('robinhood');
  });

  it('end-to-end: default .mjs strategy evaluates healthy CTO token (BUY >= 80, fail-closed on null fee)', async () => {
    const agent = new RobinhoodScreeningAgent();
    const token = mkToken(); // healthy CTO token (totalFeeNative 1 ETH)
    const gmgnCtx = { ...agent.toStrategyGmgn(token), native_price_usd: ETH_PRICE };

    const { createRequire } = await import('module');
    const path = (await import('path')).default;
    const requireEsm = createRequire(import.meta.url);
    const stratPath = path.resolve(process.cwd(), 'strategies', 'meme-robinhood-default.mjs');
    const strat = requireEsm(stratPath).default;

    const ctx = {
      domain: 'MEME_EVM',
      symbol: token.symbol,
      contractAddress: token.address,
      priceUsd: token.priceUsd,
      liquidityUsd: token.liquidityUsd,
      volume24hUsd: token.volume24hUsd,
      volume1hUsd: token.volume24hUsd / 24,
      smartMoneyCount: token.smartDegenCount,
      securityAuditPassed: true,
      socialHypeScore: 88,
      gmgn: gmgnCtx,
    };

    const ev = strat.evaluate(ctx);
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);

    // Fee gate aktif (default 500): null fee → fail-closed (aktivitas tak tercatat)
    const feeOn = strat.evaluate({ ...ctx, gmgn: { ...gmgnCtx, total_fee: null } });
    expect(feeOn.recommendedAction).toBe('SKIP');

    // Kalau fee gate dimatikan (params 0), null fee tidak lagi mematikan
    const stratNoFee = { ...strat, params: { ...strat.params, minTotalFeeUsd: 0 } };
    const feeOff = stratNoFee.evaluate({ ...ctx, gmgn: { ...gmgnCtx, total_fee: null } });
    expect(feeOff.recommendedAction).not.toBe('SKIP');
  });

  it('dedupe prunes seenTokens entries older than 5 minutes', () => {
    const { dedupe } = createDedupe();
    const first = dedupe([mkToken({ address: 'repeat1' }), mkToken({ address: 'fresh1' })]);
    expect(first.length).toBe(2);
    const second = dedupe([mkToken({ address: 'repeat1' }), mkToken({ address: 'fresh2' })]);
    expect(second.map((t) => t.address)).toEqual(['fresh2']);
  });

  it('buildSignalBoostMap merges events per address (types + latest trigger)', () => {
    const now = Math.floor(Date.now() / 1000);
    const map = buildSignalBoostMap([
      { token_address: '0xABC', signal_type: 12, trigger_at: now - 120 },
      { token_address: '0xabc', signal_type: 20, trigger_at: now - 60 },
      { token_address: '0xDEF', signal_type: 6, trigger_at: now - 9999 },
    ]);
    expect(map.size).toBe(2);
    expect(map.get('0xabc')!.types).toEqual([12, 20]); // case-insensitive merge
    expect(map.get('0xabc')!.lastTriggerAt).toBe(now - 60);
  });

  it('applySignalBoost adds confidence for fresh signal events, never for NONE', () => {
    const now = Math.floor(Date.now() / 1000);
    const map = buildSignalBoostMap([{ token_address: '0xabc', signal_type: 11, trigger_at: now - 10 }]);
    const det = { type: 'MOMENTUM' as const, confidence: 70, reasons: ['base'] };
    const boosted = applySignalBoost(det, map, '0xABC');
    expect(boosted.confidence).toBe(85); // +15 fresh (<=30m)
    expect(boosted.reasons.some((r) => r.includes('📡 Signal GMGN'))).toBe(true);
    // NONE stays NONE even with fresh signal
    const none = applySignalBoost({ type: 'NONE', confidence: 0, reasons: [] }, map, '0xABC');
    expect(none.type).toBe('NONE');
    // stale events (>4h) add nothing
    const stale = buildSignalBoostMap([{ token_address: '0xabc', signal_type: 11, trigger_at: now - 6 * 3600 }]);
    expect(applySignalBoost(det, stale, '0xabc').confidence).toBe(70);
  });

  it('collectSignalBoostMap is fail-open (empty map on network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const agent = new RobinhoodScreeningAgent();
    const map = await agent.collectSignalBoostMap();
    expect(map.size).toBe(0);
  });
});
