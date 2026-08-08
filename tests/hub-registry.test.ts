import { describe, it, expect, vi } from 'vitest';
import { AthenaHub } from '../src/orchestrator/hub.js';
import { CTAlphaAgent } from '../src/agents/ct-alpha/ct-alpha-agent.js';
import type { AgentReport, ScreeningAgent } from '../src/agents/shared/agent-contract.js';
import type { MeteoraDLMMAdapter, MeteoraPoolSignal } from '../src/adapters/meteora-dlmm-adapter.js';
import type { UniswapLPAdapter, UniswapPoolSignal } from '../src/adapters/uniswap-lp-adapter.js';
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
  recommendedDistribution: 'Spot',
  aiRecommendation: 'Live Meteora DLMM pool (official API): SOL-USDC',
});

const mkUniswapPool = (): UniswapPoolSignal => ({
  poolAddress: 'pool456',
  pairName: 'WETH-USDC',
  network: 'Base',
  feeTierPercentage: 0.05,
  tvlUsd: 200000,
  activeTvlUsd: 180000,
  volume1hUsd: 15000,
  fee1hUsd: 8,
  fees24hEth: 0.05,
  feeAprPercentage: 18.5,
  feesToTvlRatio1h: 0.00004,
  volumeToTvlRatio1h: 0.075,
  volumeToActiveTvlRatio1h: 0.083,
  organicVolumeScore1h: 75,
  recommendedPriceRange: { minPrice: 1, maxPrice: 2 },
  aiRecommendation: 'Live aerodrome pool WETH-USDC on Base',
});

const mkMeteoraStub = (pools: MeteoraPoolSignal[]) => ({
  fetchTopYieldPools: vi.fn(async () => pools),
  filterHighYieldPools: vi.fn((p: MeteoraPoolSignal[]) => p),
} as unknown as MeteoraDLMMAdapter);

const mkUniswapStub = (pools: UniswapPoolSignal[]) => ({
  fetchTopYieldEVMPools: vi.fn(async () => pools),
  filterHighYieldEVMPools: vi.fn((p: UniswapPoolSignal[]) => p),
} as unknown as UniswapLPAdapter);

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

  it('channel name "call-perps-futures" resolves to perps', async () => {
    const stub = mkStubAgent('perps', [mkReport('BTC')]);
    const hub = new AthenaHub({ agentFactories: { perps: () => stub } });
    expect(await hub.triggerAgentPass('call-perps-futures')).toHaveLength(1);
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

  it('lp-robinhood wraps adapter flow into contract-shaped reports with payload', async () => {
    const hub = new AthenaHub({ uniswapAdapter: mkUniswapStub([mkUniswapPool()]) });
    const results = await hub.triggerAgentPass('lp-robinhood');
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.passed).toBe(true);
    expect(r.confidence).toBe(80);
    expect((r.signal as UniswapPoolSignal).network).toBe('Base');
    expect(r.payload?.domain).toBe('LP_ROBINHOOD');
    expect(r.payload?.network).toBe('Base');
    expect(r.payload?.title).toBe('WETH-USDC');
  });

  it('alias "meteora" resolves to lp-solana and "uniswap" to lp-robinhood', async () => {
    const hub = new AthenaHub({
      meteoraAdapter: mkMeteoraStub([mkMeteoraPool()]),
      uniswapAdapter: mkUniswapStub([mkUniswapPool()]),
    });
    expect(await hub.triggerAgentPass('meteora')).toHaveLength(1);
    expect(await hub.triggerAgentPass('uniswap')).toHaveLength(1);
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
