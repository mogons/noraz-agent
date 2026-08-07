import { describe, it, expect, vi, afterEach } from 'vitest';
import { RobinhoodScreeningAgent, RobinhoodSignal } from '../src/agents/meme-robinhood/robinhood-screening-agent.js';
import type { GMGNRawToken } from '../src/adapters/gmgn-adapter.js';

const ETH_PRICE = 1929.03;

const mkToken = (over: Partial<GMGNRawToken> = {}): GMGNRawToken => ({
  chain: 'robinhood', address: 'addr1', symbol: 'TEST', name: 'Test Token',
  priceUsd: 0.001, marketCapUsd: 200000, volume24hUsd: 300000, liquidityUsd: 50000,
  buys: 800, sells: 200, swaps: 1000, holderCount: 500,
  top10HolderRate: 0.1, devTeamHoldRate: 0.0, creatorClose: true, creatorTokenStatus: 'creator_close',
  smartDegenCount: 5, renownedCount: 2, bundlerRate: 0.1, ratTraderAmountRate: 0.02,
  rugRatio: 0.01, isWashTrading: false, ctoFlag: true, renouncedMint: true, renouncedFreeze: true,
  creationTimestamp: Date.now()/1000 - 6*3600, openTimestamp: Date.now()/1000 - 6*3600,
  priceChange1m: 2, priceChange5m: 5, priceChange1h: 120,
  visitingCount: 300, squareMentions: 10,
  twitterRenameCount: 0, twitterDelPostCount: 0, twitterCreateTokenCount: 1,
  buyTax: null, sellTax: null, dexscrBoostFee: 0, dexscrAd: 0, totalFeeNative: 1, source: 'gmgn',
  ...over,
});

describe('RobinhoodScreeningAgent', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GMGN_API_KEY; });

  it('preFilter rejects unknown age (fail-closed)', () => {
    const agent = new RobinhoodScreeningAgent();
    const res = agent.preFilter(mkToken({ creationTimestamp: null }), ETH_PRICE);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('fail-closed');
  });

  it('preFilter rejects young tokens', () => {
    const agent = new RobinhoodScreeningAgent();
    const res = agent.preFilter(mkToken({ creationTimestamp: Date.now()/1000 - 3600 }), ETH_PRICE);
    expect(res.ok).toBe(false);
  });

  it('preFilter rejects wash trading & high bundler', () => {
    const agent = new RobinhoodScreeningAgent();
    expect(agent.preFilter(mkToken({ isWashTrading: true }), ETH_PRICE).ok).toBe(false);
    expect(agent.preFilter(mkToken({ bundlerRate: 0.6 }), ETH_PRICE).ok).toBe(false);
  });

  it('preFilter passes a healthy token', () => {
    const agent = new RobinhoodScreeningAgent();
    // totalFeeNative 1 ETH @ $1929.03 = $1,929 >= $500 gate
    expect(agent.preFilter(mkToken(), ETH_PRICE).ok).toBe(true);
  });

  it('preFilter enforces global total-fee gate (> $500, live ETH price)', () => {
    const agent = new RobinhoodScreeningAgent();
    // 0.2 ETH @ $1929.03 = $385.81 < $500 → reject
    const lowFee = agent.preFilter(mkToken({ totalFeeNative: 0.2 }), ETH_PRICE);
    expect(lowFee.ok).toBe(false);
    expect(lowFee.reason).toContain('total fee');
    // 0.3 ETH @ $1929.03 = $578.71 >= $500 → pass
    expect(agent.preFilter(mkToken({ totalFeeNative: 0.3 }), ETH_PRICE).ok).toBe(true);
  });

  it('preFilter rejects unknown total fee and missing live price (fail-closed)', () => {
    const agent = new RobinhoodScreeningAgent();
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

  it('runScreeningPass returns [] without network', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const agent = new RobinhoodScreeningAgent();
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
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

    const failClosed = strat.evaluate({ ...ctx, gmgn: { ...gmgnCtx, total_fee: null } });
    expect(failClosed.recommendedAction).toBe('SKIP');
  });

  it('dedupe prunes seenTokens entries older than 5 minutes', () => {
    const agent = new RobinhoodScreeningAgent();
    const old = Date.now() - 6 * 60 * 1000;
    (agent as any).seenTokens.set('stale1', old);
    (agent as any).seenTokens.set('fresh1', Date.now());
    agent.dedupe([mkToken({ address: 'fresh1' })]);
    const seen = (agent as any).seenTokens;
    expect(seen.has('stale1')).toBe(false);
    expect(seen.has('fresh1')).toBe(true);
  });
});
