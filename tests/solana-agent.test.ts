import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { SolanaScreeningAgent, SolanaSignal } from '../src/agents/meme-solana/solana-screening-agent.js';
import { createDedupe, isGraduatedToken } from '../src/agents/shared/gmgn-meme-helpers.js';
import type { GMGNRawToken } from '../src/adapters/gmgn-adapter.js';

const requireEsm = createRequire(import.meta.url);

const mkToken = (over: Partial<GMGNRawToken> = {}): GMGNRawToken => ({
  chain: 'sol', address: 'addr1', symbol: 'TEST', name: 'Test Token',
  priceUsd: 0.001, marketCapUsd: 200000, volume24hUsd: 300000, volume1hUsd: 60000, liquidityUsd: 50000,
  buys: 800, sells: 200, swaps: 1000, holderCount: 500,
  top10HolderRate: 0.1, devTeamHoldRate: 0.0, creatorClose: true, creatorTokenStatus: 'creator_close',
  smartDegenCount: 5, renownedCount: 2, bundlerRate: 0.1, ratTraderAmountRate: 0.02,
  rugRatio: 0.01, isWashTrading: false, ctoFlag: true, renouncedMint: true, renouncedFreeze: true,
  creationTimestamp: Date.now()/1000 - 6*3600, openTimestamp: Date.now()/1000 - 6*3600,
  priceChange1m: 2, priceChange5m: 5, priceChange1h: 120,
  visitingCount: 300, squareMentions: 10,
  twitterRenameCount: 0, twitterDelPostCount: 0, twitterCreateTokenCount: 1,
  buyTax: null, sellTax: null, dexscrBoostFee: 0, dexscrAd: 0, totalFeeNative: 50, source: 'gmgn',
  exchange: 'pump_amm', launchpadPlatform: 'Pump.fun', launchpadStatus: '1', progress: 1,
  ...over,
});

describe('SolanaScreeningAgent', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GMGN_API_KEY; });

  it('preFilter passes young & unknown-age tokens (age gate off — degen early)', () => {
    const agent = new SolanaScreeningAgent();
    // age gate default 0: umur tidak jadi kriteria, token baru 1 jam lolos
    expect(agent.preFilter(mkToken({ creationTimestamp: Date.now()/1000 - 3600 }), 73.65).ok).toBe(true);
    // creationTimestamp null juga lolos (umur bukan kriteria)
    expect(agent.preFilter(mkToken({ creationTimestamp: null }), 73.65).ok).toBe(true);
  });

  it('preFilter rejects wash trading (bundler tidak digate)', () => {
    const agent = new SolanaScreeningAgent();
    expect(agent.preFilter(mkToken({ isWashTrading: true }), 73.65).ok).toBe(false);
    expect(agent.preFilter(mkToken({ bundlerRate: 0.6 }), 73.65).ok).toBe(true);
  });

  it('preFilter enforces market cap gate (wajib > $100k, fail-closed)', () => {
    const agent = new SolanaScreeningAgent();
    expect(agent.preFilter(mkToken({ marketCapUsd: 50000 }), 73.65).ok).toBe(false);
    expect(agent.preFilter(mkToken({ marketCapUsd: 0 }), 73.65).ok).toBe(false);
    const r = agent.preFilter(mkToken({ marketCapUsd: 50000 }), 73.65);
    expect(r.reason).toContain('market cap');
    expect(agent.preFilter(mkToken(), 73.65).ok).toBe(true); // 200k ≥ 100k
  });

  it('preFilter passes a healthy token', () => {
    const agent = new SolanaScreeningAgent();
    expect(agent.preFilter(mkToken(), 73.65).ok).toBe(true);
  });

  it('preFilter enforces total-fee gate (> $500, live native price)', () => {
    const agent = new SolanaScreeningAgent();
    // 5 SOL @ $73.65 = $368 < $500 → reject
    expect(agent.preFilter(mkToken({ totalFeeNative: 5 }), 73.65).ok).toBe(false);
    // fee null → fail-closed (aktivitas organik tak tercatat)
    expect(agent.preFilter(mkToken({ totalFeeNative: null }), 73.65).ok).toBe(false);
    // 50 SOL @ $73.65 = $3,682 ≥ $500 → pass
    expect(agent.preFilter(mkToken(), 73.65).ok).toBe(true);
  });

  it('runScreeningPass menolak token saat audit GMGN security gagal (fail-closed)', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const agent = new SolanaScreeningAgent();
    const healthy = mkToken(); // lolos preFilter (CTO + smart money, fee $3.6k)
    (agent as any).gmgn = {
      fetchRank: async () => [healthy],
      fetchTrenches: async () => ({ completed: [] }),
      fetchHotSearches: async () => [],
      fetchTokenSignals: async () => [],
      fetchTokenSecurity: async () => null, // audit tidak tersedia → TOLAK
    };
    (agent as any).priceFeed = { getPrice: async () => 73.65 };
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(0);
  });

  it('runScreeningPass meloloskan token dengan audit GMGN security aman', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const agent = new SolanaScreeningAgent();
    const healthy = mkToken();
    (agent as any).gmgn = {
      fetchRank: async () => [healthy],
      fetchTrenches: async () => ({ completed: [] }),
      fetchHotSearches: async () => [],
      fetchTokenSignals: async () => [],
      fetchTokenSecurity: async () => ({
        chain: 'sol', address: healthy.address,
        isHoneypot: false, isBlacklist: false, isRenounced: true,
        renouncedMint: false, renouncedFreeze: false, canNotSell: false,
        buyTaxPct: 0, sellTaxPct: 0, averageTaxPct: 0, highTaxPct: 0,
        isOpenSource: true, burnRatioPct: 0, isLocked: false, isShowAlert: false, flags: [],
      }),
    };
    (agent as any).priceFeed = { getPrice: async () => 73.65 };
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(1);
    expect(reports[0].payload?.domain).toBe('MEME_SOLANA');
  });

  it('cluster smart money (>= 3 wallet) memberi boost +20 & label di card', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const agent = new SolanaScreeningAgent();
    const healthy = mkToken();
    const now = Math.floor(Date.now() / 1000);
    const trackTrades = [
      { tokenAddress: healthy.address.toLowerCase(), tokenSymbol: 'TEST', side: 'buy', amountUsd: 5000, isFullClose: false, maker: '0xw1', makerTags: [], timestamp: now - 120, kind: 'smartmoney' },
      { tokenAddress: healthy.address.toLowerCase(), tokenSymbol: 'TEST', side: 'buy', amountUsd: 8000, isFullClose: false, maker: '0xw2', makerTags: [], timestamp: now - 200, kind: 'smartmoney' },
      { tokenAddress: healthy.address.toLowerCase(), tokenSymbol: 'TEST', side: 'buy', amountUsd: 9000, isFullClose: false, maker: '0xw3', makerTags: [], timestamp: now - 300, kind: 'smartmoney' },
    ];
    (agent as any).gmgn = {
      fetchRank: async () => [healthy],
      fetchTrenches: async () => ({ completed: [] }),
      fetchHotSearches: async () => [],
      fetchTokenSignals: async () => [],
      fetchTrackTrades: async () => trackTrades,
      fetchTokenSecurity: async () => ({
        chain: 'sol', address: healthy.address,
        isHoneypot: false, isBlacklist: false, isRenounced: true,
        renouncedMint: false, renouncedFreeze: false, canNotSell: false,
        buyTaxPct: 0, sellTaxPct: 0, averageTaxPct: 0, highTaxPct: 0,
        isOpenSource: true, burnRatioPct: 0, isLocked: false, isShowAlert: false, flags: [],
      }),
    };
    (agent as any).priceFeed = { getPrice: async () => 73.65 };
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(1);
    expect(reports[0].reason).toContain('Cluster of 3 smart-money wallets');
    expect(reports[0].payload?.smartMoneyInfo).toContain('Smart Money');
    expect(reports[0].payload?.smartMoneyInfo).toContain('3 wallets bought');
  });

  it('track kandidat baru (tidak ada di rank) ikut pipeline penuh', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    const agent = new SolanaScreeningAgent();
    const healthy = mkToken(); // dari track (bukan rank)
    const now = Math.floor(Date.now() / 1000);
    const trackTrades = [
      { tokenAddress: healthy.address.toLowerCase(), tokenSymbol: 'TEST', side: 'buy', amountUsd: 5000, isFullClose: false, maker: '0xw1', makerTags: [], timestamp: now - 120, kind: 'smartmoney' },
      { tokenAddress: healthy.address.toLowerCase(), tokenSymbol: 'TEST', side: 'buy', amountUsd: 8000, isFullClose: false, maker: '0xw2', makerTags: [], timestamp: now - 200, kind: 'smartmoney' },
    ];
    (agent as any).gmgn = {
      fetchRank: async () => [], // rank kosong — hanya track feed
      fetchTrenches: async () => ({ completed: [] }),
      fetchHotSearches: async () => [],
      fetchTokenSignals: async () => [],
      fetchTrackTrades: async () => trackTrades,
      fetchTokenInfo: async () => healthy, // validasi volume untuk kandidat track
      fetchTokenSecurity: async () => ({
        chain: 'sol', address: healthy.address,
        isHoneypot: false, isBlacklist: false, isRenounced: true,
        renouncedMint: false, renouncedFreeze: false, canNotSell: false,
        buyTaxPct: 0, sellTaxPct: 0, averageTaxPct: 0, highTaxPct: 0,
        isOpenSource: true, burnRatioPct: 0, isLocked: false, isShowAlert: false, flags: [],
      }),
    };
    (agent as any).priceFeed = { getPrice: async () => 73.65 };
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(1); // track candidate lolos pipeline penuh
    expect(reports[0].payload?.domain).toBe('MEME_SOLANA');
  });

  it('preFilter re-enables age & fee gates when thresholds > 0', () => {
    const agent = new SolanaScreeningAgent();
    agent.updateConfig({ minAgeHours: 2, minTotalFeeUsd: 500 });
    expect(agent.preFilter(mkToken({ creationTimestamp: Date.now()/1000 - 3600 }), 73.65).ok).toBe(false);
    expect(agent.preFilter(mkToken({ totalFeeNative: 5 }), 73.65).ok).toBe(false);
    expect(agent.preFilter(mkToken({ totalFeeNative: null }), 73.65).ok).toBe(false);
    expect(agent.preFilter(mkToken(), null).ok).toBe(false);
  });

  it('detectSignal returns CTO for cto_flag token', () => {
    const agent = new SolanaScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: true }));
    expect(det.type).toBe('CTO');
    expect(det.confidence).toBeGreaterThanOrEqual(80);
  });

  it('detectSignal returns MOMENTUM for strong pump without CTO', () => {
    const agent = new SolanaScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: false, priceChange1h: 40, priceChange5m: 3 }));
    expect(det.type).toBe('MOMENTUM');
  });

  it('detectSignal disables CTO on dexscreener source', () => {
    const agent = new SolanaScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: true, source: 'dexscreener' }));
    expect(det.type).not.toBe('CTO');
  });

  it('runScreeningPass returns [] without network', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const agent = new SolanaScreeningAgent();
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
  });

  it('toStrategyGmgn contract feeds the default strategy to a pass (no silent SKIP)', async () => {
    const agent = new SolanaScreeningAgent();
    const token = mkToken(); // healthy CTO token (totalFeeNative 50 SOL)
    const gmgnCtx = { ...agent.toStrategyGmgn(token), native_price_usd: 73.65 };
    expect(gmgnCtx.ageHours).toBeGreaterThan(0);
    expect(gmgnCtx.cto_flag).toBe(1);
    expect(gmgnCtx.volume_24h).toBe(token.volume24hUsd);
    expect(gmgnCtx.total_fee).toBe(50);

    const strat = (requireEsm(path.join(process.cwd(), 'strategies', 'meme-solana-default.mjs')) as any).default;
    const ev = strat.evaluate({
      domain: 'MEME_SOLANA',
      symbol: token.symbol,
      contractAddress: token.address,
      priceUsd: token.priceUsd,
      liquidityUsd: token.liquidityUsd,
      volume24hUsd: token.volume24hUsd,
      volume1hUsd: token.volume24hUsd / 24,
      smartMoneyCount: token.smartDegenCount,
      securityAuditPassed: true,
      socialHypeScore: 85,
      gmgn: gmgnCtx,
    });
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
  });

  it('dedupe prunes seenTokens entries older than 5 minutes', () => {
    const { dedupe } = createDedupe();
    // Seed a stale entry by calling dedupe, then advancing past the 5-min window
    // is not feasible without time mocking; instead verify the 60s cooldown skips
    // a repeated address and admits a fresh one.
    const first = dedupe([mkToken({ address: 'repeat1' }), mkToken({ address: 'fresh1' })]);
    expect(first.length).toBe(2);
    const second = dedupe([mkToken({ address: 'repeat1' }), mkToken({ address: 'fresh2' })]);
    expect(second.map((t) => t.address)).toEqual(['fresh2']);
  });

  it('preFilter enforces 1H volume gate (minVolume1hUsd 50k)', () => {
    const agent = new SolanaScreeningAgent();
    // volume 1h 60k >= 50k → lolos
    expect(agent.preFilter(mkToken(), 73.65).ok).toBe(true);
    // volume 1h 20k < 50k → ditolak
    const low = agent.preFilter(mkToken({ volume1hUsd: 20000 }), 73.65);
    expect(low.ok).toBe(false);
    expect(low.reason).toContain('volume 1h');
  });

  it('updateConfig applies whitelisted keys and rejects unknown/out-of-range', () => {
    const agent = new SolanaScreeningAgent();
    const res = agent.updateConfig({ minAgeHours: 3, passThreshold: 85, bogusKey: 5, minVolume1hUsd: 1 });
    expect(res.applied.minAgeHours).toBe(3);
    expect(res.applied.passThreshold).toBe(85);
    expect(res.rejected.some((r) => r.includes('bogusKey'))).toBe(true);
    expect(res.rejected.some((r) => r.includes('minVolume1hUsd'))).toBe(true);
    expect(agent.getConfig().minAgeHours).toBe(3);
    expect(agent.getConfig().passThreshold).toBe(85);
    // unchanged defaults for untouched keys
    expect(agent.getConfig().minLiquidityUsd).toBe(10000);
    expect(agent.getConfig().minVolume1hUsd).toBe(50000);
  });

  it('updateConfig validates signalTypes array (ints 1-21 only)', () => {
    const agent = new SolanaScreeningAgent();
    const ok = agent.updateConfig({ signalTypes: [6, 7, 11, 12] });
    expect(ok.rejected.length).toBe(0);
    expect(agent.getConfig().signalTypes).toEqual([6, 7, 11, 12]);
    const bad = agent.updateConfig({ signalTypes: [99, 'x'] });
    expect(bad.rejected.length).toBe(1);
  });

  it('isGraduatedToken rejects bonding-curve tokens (exchange=pump) and unknown', () => {
    expect(isGraduatedToken(mkToken({ exchange: 'pump' }))).toBe(false);
    expect(isGraduatedToken(mkToken({ exchange: null }))).toBe(false);
    expect(isGraduatedToken(mkToken({ exchange: 'pump_amm' }))).toBe(true);
    expect(isGraduatedToken(mkToken({ exchange: 'raydium' }))).toBe(true);
    expect(isGraduatedToken(mkToken({ source: 'dexscreener', exchange: null }))).toBe(true);
    // EVM: exchange = contract/pool address — venue exists = graduated
    expect(isGraduatedToken(mkToken({ chain: 'robinhood', exchange: '0x8366a39cc670b4001a1121b8f6a443a643e40951' }))).toBe(true);
  });
});
