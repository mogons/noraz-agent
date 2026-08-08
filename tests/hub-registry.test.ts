import { describe, it, expect, vi } from 'vitest';
import { AthenaHub } from '../src/orchestrator/hub.js';
import { CTAlphaAgent } from '../src/agents/ct-alpha/ct-alpha-agent.js';
import type { AgentReport, ScreeningAgent } from '../src/agents/shared/agent-contract.js';
import type { MeteoraDLMMAdapter, MeteoraPoolSignal } from '../src/adapters/meteora-dlmm-adapter.js';
import type { KrystalCloudAdapter, KrystalPoolSignal } from '../src/adapters/krystal-cloud-adapter.js';
import type { GMGNAdapter } from '../src/adapters/gmgn-adapter.js';
import type { TwitterService, TweetItem } from '../src/services/twitter-service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

const mkReport = (symbol: string): AgentReport => ({
  passed: true,
  signal: { symbol },
  reason: 'test reason',
  confidence: 85,
});

const mkStubAgent = (domain: string, reports: AgentReport[] = []) => ({
  domain,
  runScreeningPass: vi.fn(async () => reports),
} as unknown as ScreeningAgent);

const mkMeteoraPool = (): MeteoraPoolSignal => ({
  poolAddress: 'pool123',
  pairName: 'SOL-USDC',
  binStep: 1,
  baseFeePercentage: 0.01,
  tvlUsd: 150000,
  activeTvlUsd: 120000,
  volume1hUsd: 10000,
  fee1hUsd: 30,
  fees24hSol: 0.5,
  feeAprPercentage: 35.2,
  feesToTvlRatio1h: 0.0002,
  volumeToTvlRatio1h: 0.067,
  volumeToActiveTvlRatio1h: 0.083,
  organicVolumeScore1h: 80,
  aiRecommendation: 'Live Meteora DLMM pool (official API): SOL-USDC',
});

const mkMeteoraStub = (pools: MeteoraPoolSignal[]) => ({
  fetchTopYieldPools: vi.fn(async () => pools),
  filterHighYieldPools: vi.fn((p: MeteoraPoolSignal[]) => p),
} as unknown as MeteoraDLMMAdapter);

const mkKrystalPool = (over: Partial<KrystalPoolSignal> = {}): KrystalPoolSignal => ({
  poolAddress: '0xpool1',
  pairName: 'WETH-USDC',
  feeTier: 3000,
  tvlUsd: 150000,
  activeTvlUsd: 3000,
  volume1hUsd: 5000,
  fee1hUsd: 20,
  volume24hUsd: 120000,
  fee24hUsd: 360,
  feesToTvlRatio24h: 0.0024,
  volumeToTvlRatio1h: 0.033,
  volumeToActiveTvlRatio1h: 1.67,
  feeAprPercentage: 87.6,
  apr24h: 28.4,
  farmApr24h: 0,
  token0Symbol: 'WETH',
  token1Symbol: 'USDC',
  token0Address: '0xweth',
  token1Address: '0xusdc',
  aiRecommendation: 'Live Uniswap V3 pool WETH-USDC (Robinhood Chain)',
  ...over,
});

const mkKrystalStub = (pools: KrystalPoolSignal[]) => ({
  fetchTopRobinhoodPools: vi.fn(async () => pools),
  filterHighYieldPools: vi.fn((p: KrystalPoolSignal[]) => p),
} as unknown as KrystalCloudAdapter);

const mkGmgnStub = (infos: Record<string, any>) => ({
  fetchTokenInfo: vi.fn(async (_chain: string, address: string) => infos[address] ?? null),
} as unknown as GMGNAdapter);

/** GMGN token info default (aman — semua field security null/clean). */
const mkGmgnToken = (over: Record<string, any> = {}): any => ({
  priceUsd: 0.0001,
  marketCapUsd: 500000,
  volume24hUsd: 250000,
  volume1hUsd: 12000,
  liquidityUsd: 60000,
  buys: 100,
  sells: 50,
  swaps: 150,
  holderCount: 800,
  top10HolderRate: null,
  devTeamHoldRate: null,
  creatorClose: false,
  creatorTokenStatus: null,
  smartDegenCount: 3,
  renownedCount: 1,
  bundlerRate: null,
  ratTraderAmountRate: null,
  rugRatio: null,
  isWashTrading: false,
  isHoneypot: null,
  ctoFlag: false,
  renouncedMint: false,
  renouncedFreeze: false,
  creationTimestamp: Date.now() / 1000 - 7200,
  openTimestamp: null,
  priceChange1m: null,
  priceChange5m: null,
  priceChange1h: null,
  visitingCount: 0,
  squareMentions: 0,
  twitterRenameCount: 0,
  twitterDelPostCount: 0,
  twitterCreateTokenCount: 0,
  buyTax: null,
  sellTax: null,
  dexscrBoostFee: 0,
  dexscrAd: 0,
  totalFeeNative: null,
  exchange: 'raydium',
  launchpadPlatform: 'pump',
  launchpadStatus: '1',
  progress: null,
  source: 'gmgn',
  chain: 'sol',
  address: 'tokX123',
  symbol: 'CHIIKAWA',
  name: 'Chiikawa',
  ...over,
});

// NOTE: the healthy text intentionally avoids 'ai'/'agent'/'yield'/'airdrop'/'farm'
// so category resolution lands on SMART_CT_CALL (deterministic, mirrors ct-alpha tests).
const mkTweet = (over: Partial<TweetItem> = {}): TweetItem => ({
  id: 't1',
  text: 'Major rotation brewing — smart money positioning $ROT8, do not sleep on this one',
  authorUsername: 'ct_whale',
  authorName: 'CT Whale',
  likes: 800,
  retweets: 150,
  replies: 30,
  createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
  url: 'https://x.com/ct_whale/status/t1',
  ...over,
});

const mkFakeTwitter = (tweets: TweetItem[]) => ({
  searchTweets: vi.fn(async () => tweets),
} as unknown as TwitterService);

// ── Tests ─────────────────────────────────────────────────────────────────

describe('AthenaHub registry-driven triggerAgentPass', () => {
  it('unknown domain returns [] without throwing (fail-closed)', async () => {
    const hub = new AthenaHub();
    const results = await hub.triggerAgentPass('does-not-exist');
    expect(results).toEqual([]);
  });

  it('alias "solana" resolves to meme-solana factory and returns its reports', async () => {
    const stub = mkStubAgent('meme-solana', [mkReport('SOL')]);
    const hub = new AthenaHub({ agentFactories: { 'meme-solana': () => stub } });
    const results = await hub.triggerAgentPass('solana');
    expect(stub.runScreeningPass).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect((results[0] as any).signal.symbol).toBe('SOL');
  });

  it('aliases "evm" and "base" resolve to meme-robinhood', async () => {
    const stub = mkStubAgent('meme-robinhood', [mkReport('PEPE')]);
    const hub = new AthenaHub({ agentFactories: { 'meme-robinhood': () => stub } });
    expect(await hub.triggerAgentPass('evm')).toHaveLength(1);
    expect(await hub.triggerAgentPass('base')).toHaveLength(1);
    expect(stub.runScreeningPass).toHaveBeenCalledTimes(2);
  });

  it('all 8 registered domain ids are triggerable via factories', async () => {
    const ids = ['meme-solana', 'meme-robinhood', 'perps', 'nft', 'prediction', 'ct-alpha', 'lp-solana', 'lp-robinhood'] as const;
    for (const id of ids) {
      const stub = mkStubAgent(id, [mkReport(id.toUpperCase())]);
      const hub = new AthenaHub({ agentFactories: { [id]: () => stub } });
      const results = await hub.triggerAgentPass(id);
      expect(results, `domain ${id}`).toHaveLength(1);
    }
  });

  it('channel name "call-whale-tracking" resolves to perps', async () => {
    const stub = mkStubAgent('perps', [mkReport('BTC')]);
    const hub = new AthenaHub({ agentFactories: { perps: () => stub } });
    expect(await hub.triggerAgentPass('call-whale-tracking')).toHaveLength(1);
  });

  it('ct-alpha runs the real agent with injected fake TwitterService (DI, zero network)', async () => {
    const hub = new AthenaHub({
      agentFactories: { 'ct-alpha': () => new CTAlphaAgent(mkFakeTwitter([mkTweet()])) },
    });
    const results = await hub.triggerAgentPass('ct-alpha');
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.passed).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(80);
    expect(r.payload?.domain).toBe('CT_ALPHA');
    expect(r.payload?.network).toBe('X (Twitter)');
    expect(r.payload?.securityAuditPassed).toBe(true);
  });

  it('lp-solana wraps adapter flow into contract-shaped reports with payload', async () => {
    const hub = new AthenaHub({ meteoraAdapter: mkMeteoraStub([mkMeteoraPool()]) });
    const results = await hub.triggerAgentPass('lp-solana');
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.passed).toBe(true);
    expect(r.confidence).toBe(80);
    expect(r.reason).toContain('Meteora');
    expect((r.signal as MeteoraPoolSignal).poolAddress).toBe('pool123');
    expect(r.payload?.domain).toBe('LP_METEORA');
    expect(r.payload?.network).toBe('Solana');
    expect(r.payload?.title).toBe('SOL-USDC');
  });

  it('lp-robinhood wraps Krystal pool data into LP_ROBINHOOD payload', async () => {
    // Krystal adapter flow: fetch → filterHighYieldPools → payload LP
    const hub = new AthenaHub({ krystalAdapter: mkKrystalStub([mkKrystalPool()]) });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.passed).toBe(true);
    expect(r.confidence).toBe(80);
    expect(r.payload?.domain).toBe('LP_ROBINHOOD');
    expect(r.payload?.contractAddress).toBe('0xpool1');
    expect(r.payload?.network).toBe('Robinhood Chain (Uniswap v3)');
    expect(r.payload?.poolUrl).toBe('https://app.uniswap.org/explore/pools/robinhood/0xpool1');
    expect(r.payload?.krystalUrl).toContain('defi.krystal.app');
    expect(r.payload?.feeApr).toContain('%');
  });

  it('lp-robinhood orders meme token first (WETH-PEPE pool -> token0=PEPE, title PEPE-WETH)', async () => {
    // Uniswap v3 mengembalikan token0=WETH (base) — payload harus menaruh meme (PEPE) duluan,
    // konsisten dengan LP solana (Chiikawa-SOL): title & detail ikut token meme.
    const hub = new AthenaHub({ krystalAdapter: mkKrystalStub([mkKrystalPool({
      pairName: 'WETH-PEPE',
      token0Symbol: 'WETH',
      token1Symbol: 'PEPE',
      token0Address: '0xweth',
      token1Address: '0xpepe',
    })]) });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(1);
    const p = results[0].payload!;
    expect(p.title).toBe('PEPE-WETH');
    expect(p.symbol).toBe('PEPE');
    expect(p.token0Symbol).toBe('PEPE');
    expect(p.token1Symbol).toBe('WETH');
    expect(p.token0Address).toBe('0xpepe');
    expect(p.token1Address).toBe('0xweth');
    expect(p.token0ChartUrl).toContain('0xpepe');
    expect(p.gmgnUrl).toContain('0xpepe');
  });

  it('alias "meteora" resolves to lp-solana', async () => {
    const hub = new AthenaHub({ meteoraAdapter: mkMeteoraStub([mkMeteoraPool()]) });
    expect(await hub.triggerAgentPass('meteora')).toHaveLength(1);
  });

  // ── LP security gate (GMGN) ─────────────────────────────────────────────

  const mkSolPoolWithToken = (): MeteoraPoolSignal => ({
    ...mkMeteoraPool(),
    tokenXAddress: 'tokX123',
    tokenXSymbol: 'CHIIKAWA',
    tokenYAddress: 'tokYsol',
    tokenYSymbol: 'SOL',
  });

  it('lp-solana: token rug (GMGN) menolak pool', async () => {
    const hub = new AthenaHub({
      meteoraAdapter: mkMeteoraStub([mkSolPoolWithToken()]),
      gmgnAdapter: mkGmgnStub({ tokX123: mkGmgnToken({ rugRatio: 0.8 }) }),
    });
    const results = await hub.triggerAgentPass('lp-solana');
    expect(results).toHaveLength(0);
  });

  it('lp-solana: token honeypot (GMGN) menolak pool', async () => {
    const hub = new AthenaHub({
      meteoraAdapter: mkMeteoraStub([mkSolPoolWithToken()]),
      gmgnAdapter: mkGmgnStub({ tokX123: mkGmgnToken({ isHoneypot: true }) }),
    });
    const results = await hub.triggerAgentPass('lp-solana');
    expect(results).toHaveLength(0);
  });

  it('lp-solana: token dengan tax > 10% menolak pool', async () => {
    const hub = new AthenaHub({
      meteoraAdapter: mkMeteoraStub([mkSolPoolWithToken()]),
      gmgnAdapter: mkGmgnStub({ tokX123: mkGmgnToken({ sellTax: '15' }) }),
    });
    const results = await hub.triggerAgentPass('lp-solana');
    expect(results).toHaveLength(0);
  });

  it('lp-solana: token null di GMGN → tetap post, ditandai tidak diaudit', async () => {
    const hub = new AthenaHub({
      meteoraAdapter: mkMeteoraStub([mkSolPoolWithToken()]),
      gmgnAdapter: mkGmgnStub({}), // token tidak ditemukan
    });
    const results = await hub.triggerAgentPass('lp-solana');
    expect(results).toHaveLength(1);
    expect(results[0].payload?.securityScore).toContain('Tidak diaudit');
  });

  it('lp-solana: token aman → post + label keamanan terisi', async () => {
    const hub = new AthenaHub({
      meteoraAdapter: mkMeteoraStub([mkSolPoolWithToken()]),
      gmgnAdapter: mkGmgnStub({
        tokX123: mkGmgnToken({ top10HolderRate: 0.15, bundlerRate: 0.02, ratTraderAmountRate: 0.05, devTeamHoldRate: 0.01 }),
      }),
    });
    const results = await hub.triggerAgentPass('lp-solana');
    expect(results).toHaveLength(1);
    const label = results[0].payload?.securityScore ?? '';
    expect(label).toContain('Top10 15.0%');
    expect(label).toContain('Bundler 2.0%');
    expect(label).toContain('Insider 5.0%');
  });

  it('lp-robinhood: token meme honeypot menolak pool', async () => {
    const hub = new AthenaHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool({
        pairName: 'WETH-PEPE',
        token0Symbol: 'WETH',
        token1Symbol: 'PEPE',
        token0Address: '0xweth',
        token1Address: '0xpepe',
      })]),
      gmgnAdapter: mkGmgnStub({ '0xpepe': mkGmgnToken({ isHoneypot: true }) }),
    });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(0);
  });

  it('lp-robinhood: token null di GMGN → tetap post, ditandai tidak diaudit', async () => {
    const hub = new AthenaHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool({
        pairName: 'WETH-PEPE',
        token0Symbol: 'WETH',
        token1Symbol: 'PEPE',
        token0Address: '0xweth',
        token1Address: '0xpepe',
      })]),
      gmgnAdapter: mkGmgnStub({}),
    });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(1);
    expect(results[0].payload?.securityScore).toContain('Tidak diaudit');
  });

  it('factory exception is caught and returns [] (fail-closed)', async () => {
    const hub = new AthenaHub({
      agentFactories: {
        'meme-solana': () => {
          throw new Error('boom');
        },
      },
    });
    expect(await hub.triggerAgentPass('solana')).toEqual([]);
  });
});
