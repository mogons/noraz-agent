import { describe, it, expect, vi } from 'vitest';
import { OpenCatHub } from '../src/orchestrator/hub.js';
import type { AgentReport, ScreeningAgent } from '../src/agents/shared/agent-contract.js';
import type { KrystalCloudAdapter, KrystalPoolSignal } from '../src/adapters/krystal-cloud-adapter.js';
import type { GMGNAdapter, GMGNSecurityAudit } from '../src/adapters/gmgn-adapter.js';

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

/** Audit keamanan GMGN default (aman — fail-closed gate lolos). */
const mkSafeAudit = (over: Partial<GMGNSecurityAudit> = {}): GMGNSecurityAudit => ({
  chain: 'sol',
  address: 'tokX123',
  isHoneypot: false,
  isBlacklist: false,
  isRenounced: true,
  renouncedMint: false,
  renouncedFreeze: false,
  canNotSell: false,
  buyTaxPct: 0,
  sellTaxPct: 0,
  averageTaxPct: 0,
  highTaxPct: 0,
  isOpenSource: true,
  burnRatioPct: 0,
  isLocked: false,
  isShowAlert: false,
  flags: [],
  ...over,
});

const mkGmgnStub = (infos: Record<string, any>, security: Record<string, GMGNSecurityAudit | null> = {}) => ({
  fetchTokenInfo: vi.fn(async (_chain: string, address: string) => infos[address] ?? null),
  fetchTokenSecurity: vi.fn(async (_chain: string, address: string) =>
    address in security ? security[address] : mkSafeAudit()
  ),
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

// ── Tests ─────────────────────────────────────────────────────────────────

describe('OpenCatHub registry-driven triggerAgentPass', () => {
  it('unknown domain returns [] without throwing (fail-closed)', async () => {
    const hub = new OpenCatHub();
    const results = await hub.triggerAgentPass('does-not-exist');
    expect(results).toEqual([]);
  });

  it('alias "evm" resolves to meme-robinhood', async () => {
    const stub = mkStubAgent('meme-robinhood', [mkReport('PEPE')]);
    const hub = new OpenCatHub({ agentFactories: { 'meme-robinhood': () => stub } });
    expect(await hub.triggerAgentPass('evm')).toHaveLength(1);
    expect(stub.runScreeningPass).toHaveBeenCalledTimes(1);
  });

  it('all 3 registered domain ids are triggerable via factories', async () => {
    const ids = ['meme-robinhood', 'nft', 'lp-robinhood'] as const;
    for (const id of ids) {
      const stub = mkStubAgent(id, [mkReport(id.toUpperCase())]);
      const hub = new OpenCatHub({ agentFactories: { [id]: () => stub } });
      const results = await hub.triggerAgentPass(id);
      expect(results, `domain ${id}`).toHaveLength(1);
    }
  });

  it('lp-robinhood wraps Krystal pool data into LP_ROBINHOOD payload', async () => {
    const hub = new OpenCatHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool()]),
      gmgnAdapter: mkGmgnStub({ '0xweth': mkGmgnToken() }),
    });
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
    const hub = new OpenCatHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool({
        pairName: 'WETH-PEPE',
        token0Symbol: 'WETH',
        token1Symbol: 'PEPE',
        token0Address: '0xweth',
        token1Address: '0xpepe',
      })]),
      gmgnAdapter: mkGmgnStub({ '0xpepe': mkGmgnToken() }),
    });
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

  // ── LP security gate (GMGN) ─────────────────────────────────────────────

  it('lp-robinhood: audit tidak tersedia (null) → pool DITOLAK (fail-closed)', async () => {
    const hub = new OpenCatHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool()]),
      gmgnAdapter: mkGmgnStub({ '0xweth': mkGmgnToken() }, { '0xweth': null }),
    });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(0);
  });

  it('lp-robinhood: token meme honeypot menolak pool', async () => {
    const hub = new OpenCatHub({
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

  it('lp-robinhood: audit keamanan honeypot (GMGN /token/security) menolak pool', async () => {
    const hub = new OpenCatHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool({
        pairName: 'WETH-PEPE',
        token0Symbol: 'WETH',
        token1Symbol: 'PEPE',
        token0Address: '0xweth',
        token1Address: '0xpepe',
      })]),
      gmgnAdapter: mkGmgnStub({ '0xpepe': mkGmgnToken({ marketCapUsd: 500000 }) }, { '0xpepe': mkSafeAudit({ isHoneypot: true }) }),
    });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(0);
  });

  it('lp-robinhood: token tidak bisa dijual (canNotSell) → pool DITOLAK', async () => {
    const hub = new OpenCatHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool({
        pairName: 'WETH-PEPE',
        token0Symbol: 'WETH',
        token1Symbol: 'PEPE',
        token0Address: '0xweth',
        token1Address: '0xpepe',
      })]),
      gmgnAdapter: mkGmgnStub({ '0xpepe': mkGmgnToken({ marketCapUsd: 500000 }) }, { '0xpepe': mkSafeAudit({ canNotSell: true }) }),
    });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(0);
  });

  it('lp-robinhood: token null di GMGN → pool DITOLAK (MC tidak bisa diverifikasi)', async () => {
    const hub = new OpenCatHub({
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
    expect(results).toHaveLength(0);
  });

  it('lp-robinhood: market cap token meme < $200k → pool DITOLAK', async () => {
    const hub = new OpenCatHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool({
        pairName: 'WETH-PEPE',
        token0Symbol: 'WETH',
        token1Symbol: 'PEPE',
        token0Address: '0xweth',
        token1Address: '0xpepe',
      })]),
      gmgnAdapter: mkGmgnStub({ '0xpepe': mkGmgnToken({ marketCapUsd: 150000 }) }),
    });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(0);
  });

  it('lp-robinhood: token aman MC besar → post + label keamanan terisi', async () => {
    const hub = new OpenCatHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool({
        pairName: 'WETH-PEPE',
        token0Symbol: 'WETH',
        token1Symbol: 'PEPE',
        token0Address: '0xweth',
        token1Address: '0xpepe',
      })]),
      gmgnAdapter: mkGmgnStub({ '0xpepe': mkGmgnToken({ marketCapUsd: 500000 }) }),
    });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(1);
    expect(results[0].payload?.securityScore).toContain('GMGN audit');
  });

  it('factory exception is caught and returns [] (fail-closed)', async () => {
    const hub = new OpenCatHub({
      agentFactories: {
        nft: () => {
          throw new Error('boom');
        },
      },
    });
    expect(await hub.triggerAgentPass('nft')).toEqual([]);
  });

  it('lp-robinhood uses active strategy params (loosened default passes $15k TVL / 3% fee pool)', async () => {
    const { StrategyEngine } = await import('../src/orchestrator/strategy-engine.js');
    // Loosened default (lp-robinhood-default): TVL >= $10k, vol >= $100k,
    // Fee/TVL >= 2%, MC >= $100k — this pool would fail the strict fallback
    // (MC $150k < $200k) but passes once the strategy provider is wired.
    const hub = new OpenCatHub({
      krystalAdapter: mkKrystalStub([mkKrystalPool({
        pairName: 'WETH-PEPE',
        token0Symbol: 'WETH',
        token1Symbol: 'PEPE',
        token0Address: '0xweth',
        token1Address: '0xpepe',
        tvlUsd: 15000,
        volume24hUsd: 150000,
        feesToTvlRatio24h: 0.03,
      })]),
      gmgnAdapter: mkGmgnStub({ '0xpepe': mkGmgnToken({ marketCapUsd: 150000 }) }),
    });
    hub.setStrategyProvider((domain: string) => new StrategyEngine().getActiveStrategy(domain));
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.passed).toBe(true);
    expect(r.confidence).toBe(80);
    expect(r.payload?.symbol).toBe('PEPE');
    expect(r.payload?.title).toBe('PEPE-WETH');
  });
});
