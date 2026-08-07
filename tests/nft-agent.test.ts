import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { NFTScreeningAgent } from '../src/agents/nft/nft-screening-agent.js';
import type { OpenSeaAdapter, OpenSeaNFTSignal } from '../src/adapters/opensea-adapter.js';

const requireEsm = createRequire(import.meta.url);

// ── Fixtures (realistic: Pudgy Penguins class collection) ────────────────

const mkSignal = (over: Partial<OpenSeaNFTSignal> = {}): OpenSeaNFTSignal => ({
  collectionSlug: 'pudgypenguins',
  collectionName: 'Pudgy Penguins',
  tokenId: '1234',
  name: 'Pudgy #1234',
  chain: 'ethereum',
  priceEth: 8.2,
  floorPriceEth: 8.0,
  floorSurge4hPct: 35,
  volumeSpike4hRatio: 3.5,
  salesVelocity1h: 30,
  isWhaleSweep: true,
  whaleInfo: {
    address: '0xabc123def456',
    portfolioValueUsd: 500000,
    realizedPnlEth: 12.5,
    walletAgeDays: 400,
    lastActiveDaysAgo: 2,
    isVerifiedWhale: true,
  },
  openseaUrl: 'https://opensea.io/collection/pudgypenguins',
  aiThesis: 'pudgy floor momentum thesis',
  ...over,
});

const mkFakeAdapter = (signals: OpenSeaNFTSignal[]): OpenSeaAdapter => ({
  trackedCollections: [
    { slug: 'pudgypenguins', name: 'Pudgy Penguins', chain: 'ethereum' },
  ],
  fetchFloorSnipingSignals: vi.fn(async () => signals),
} as unknown as OpenSeaAdapter);

// ── Tests ─────────────────────────────────────────────────────────────────

describe('NFTScreeningAgent', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('contract: domain is nft', () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([]));
    expect(agent.domain).toBe('nft');
  });

  it('runScreeningPass returns [] with no signals — no network, no fake data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const agent = new NFTScreeningAgent(mkFakeAdapter([]));
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
  });

  it('runScreeningPass returns AgentReport[] with payload for a strong momentum combo', async () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([mkSignal()]));
    (agent as any).strategyEngine = { getActiveStrategy: () => null };
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(1);
    const r = reports[0];
    expect(r.passed).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(80);
    expect(r.signal).toBeDefined();
    expect(r.reason).toBe(r.signal.detectionReason);
    expect(r.payload?.domain).toBe('NFT');
    expect(r.payload?.symbol).toBe('PUDGYPENGUINS');
    expect(r.payload?.securityAuditPassed).toBe(true);
  });

  it('runScreeningPass drops sub-80 signals (velocity-only = 70)', async () => {
    const agent = new NFTScreeningAgent(
      mkFakeAdapter([mkSignal({ floorSurge4hPct: 0, volumeSpike4hRatio: 1.0, isWhaleSweep: false, whaleInfo: undefined, salesVelocity1h: 30 })])
    );
    (agent as any).strategyEngine = { getActiveStrategy: () => null };
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(0);
  });

  it('buildPayload maps real fields', () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([]));
    const signal = mkSignal({ priceEth: 8.25, floorPriceEth: 8.0, confidenceScore: 100 });
    const report = agent.evaluateListing(signal)!;
    const p = agent.buildPayload(report, 'Pudgy #1234 pump thesis');
    expect(p.domain).toBe('NFT');
    expect(p.title).toContain('Pudgy Penguins');
    expect(p.symbol).toBe('PUDGYPENGUINS');
    expect(p.contractAddress).toBe('N/A');
    expect(p.network).toBe('ETHEREUM');
    expect(p.priceUsd).toBe('8.25 ETH');
    expect(p.marketCap).toContain('Floor');
    expect(p.confidenceScore).toBe(100);
    expect(p.aiThesis).toBe('Pudgy #1234 pump thesis');
    expect(p.dexScreenerUrl).toBe('https://opensea.io/collection/pudgypenguins');
    expect(p.socialHypeScore).toBe(100);
    expect(p.liquidityUsd).toBe(0);
    expect(p.volume1hUsd).toBe(0);
    expect(p.securityAuditPassed).toBe(true);
  });

  it('buildPayload: title falls back to (floor) when tokenId empty', () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([]));
    const report = agent.evaluateListing(mkSignal({ tokenId: '' }))!;
    const p = agent.buildPayload(report, 'x');
    expect(p.title).toBe('Pudgy Penguins (floor)');
  });

  it('deriveCollectionSafety: pass requires floor > 0.01 ETH, velocity > 0, and (whale sweep OR floor surge)', () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([]));
    expect(agent.deriveCollectionSafety(agent.evaluateListing(mkSignal())!)).toBe(true);
    expect(agent.deriveCollectionSafety(agent.evaluateListing(mkSignal({ floorPriceEth: 0.005, priceEth: 0.006 }))!)).toBe(false);
    expect(agent.deriveCollectionSafety(agent.evaluateListing(mkSignal({ salesVelocity1h: 0 }))!)).toBe(false);
    const volOnly = agent.evaluateListing(
      mkSignal({ floorSurge4hPct: 0, isWhaleSweep: false, whaleInfo: undefined, volumeSpike4hRatio: 4.0 })
    )!;
    expect(volOnly.isVolumeSpike).toBe(true);
    expect(volOnly.isFloorSurge).toBe(false);
    expect(agent.deriveCollectionSafety(volOnly)).toBe(false);
  });

  it('deriveCollectionSafety: whale sweep OR floor surge alone can pass (with floor + velocity)', () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([]));
    const surgeOnly = agent.evaluateListing(mkSignal({ isWhaleSweep: false, whaleInfo: undefined, volumeSpike4hRatio: 1.0 }))!;
    expect(agent.deriveCollectionSafety(surgeOnly)).toBe(true);
    const whaleOnly = agent.evaluateListing(
      mkSignal({ floorSurge4hPct: 0, volumeSpike4hRatio: 1.0, isWhaleSweep: true })
    )!;
    expect(agent.deriveCollectionSafety(whaleOnly)).toBe(true);
  });

  it('deriveCollectionSafety: floor boundary is strict (0.01 fails, just above passes)', () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([]));
    const atBoundary = agent.evaluateListing(
      mkSignal({ floorPriceEth: 0.01, priceEth: 0.011, isWhaleSweep: true })
    )!;
    expect(agent.deriveCollectionSafety(atBoundary)).toBe(false); // fail-closed: requires > 0.01
    const justAbove = agent.evaluateListing(
      mkSignal({ floorPriceEth: 0.0101, priceEth: 0.011, isWhaleSweep: true })
    )!;
    expect(agent.deriveCollectionSafety(justAbove)).toBe(true);
  });

  it('calibration: strong combo (surge + spike + velocity + whale) reaches >= 80 (100)', () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([]));
    const report = agent.evaluateListing(mkSignal());
    expect(report).not.toBeNull();
    expect(report!.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(report!.confidenceScore).toBe(100);
  });

  it('strategy extension: SKIP vetoes the signal', async () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([mkSignal()]));
    (agent as any).strategyEngine = {
      getActiveStrategy: () => ({ evaluate: () => ({ confidence: 0, recommendedAction: 'SKIP', reason: 'veto' }) }),
      runStrategySafely: (s: { [k: string]: any }, kind: 'evaluate' | 'calculate', arg: any) => s[kind]?.(arg),
    };
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(0);
  });

  it('strategy extension: BUY blends 0.7/0.3 and keeps the 80 gate', async () => {
    const agent = new NFTScreeningAgent(mkFakeAdapter([mkSignal()]));
    (agent as any).strategyEngine = {
      getActiveStrategy: () => ({ evaluate: () => ({ confidence: 90, recommendedAction: 'BUY', reason: 'ok' }) }),
      runStrategySafely: (s: { [k: string]: any }, kind: 'evaluate' | 'calculate', arg: any) => s[kind]?.(arg),
    };
    const raw = agent.evaluateListing(mkSignal())!;
    const expected = Math.round(raw.confidenceScore * 0.7 + 0.3 * 90);
    expect(expected).toBeGreaterThanOrEqual(80);
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(1);
    expect(reports[0].confidence).toBe(expected);
  });
});

describe('nft-default strategy', () => {
  const strat = (requireEsm(path.join(process.cwd(), 'strategies', 'nft-default.mjs')) as any).default;

  const healthy = {
    domain: 'NFT',
    symbol: 'PUDGYPENGUINS',
    contractAddress: 'N/A',
    priceUsd: 0,
    liquidityUsd: 0,
    volume24hUsd: 0,
    volume1hUsd: 0,
    smartMoneyCount: 1,
    securityAuditPassed: true,
    socialHypeScore: 90,
    floorPriceEth: 8.0,
    priceEth: 8.2,
    floorSurge4hPct: 35,
    volumeSpike4hRatio: 3.5,
    salesVelocity1h: 30,
    isFloorSurge: true,
    isVolumeSpike: true,
    isWhaleSweep: true,
  };

  it('BUY on healthy ctx (>= 80, not SKIP)', () => {
    const ev = strat.evaluate({ ...healthy });
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
  });

  it('reads snake_case nft ctx block (gmgn-like fallback)', () => {
    const ev = strat.evaluate({
      domain: 'NFT', symbol: 'PUDGYPENGUINS', securityAuditPassed: true,
      nft: {
        floor_price_eth: 8.0, price_eth: 8.2, floor_surge_4h_pct: 35,
        volume_spike_4h_ratio: 3.5, sales_velocity_1h: 30,
        is_floor_surge: true, is_volume_spike: true, is_whale_sweep: true,
      },
    });
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
  });

  it('SKIP when floorPriceEth missing (fail-closed)', () => {
    const ev = strat.evaluate({ ...healthy, floorPriceEth: undefined });
    expect(ev.recommendedAction).toBe('SKIP');
    expect(ev.reason).toContain('fail-closed');
  });

  it('SKIP when floor below minFloorEth gate', () => {
    const ev = strat.evaluate({ ...healthy, floorPriceEth: 0.005, priceEth: 0.006 });
    expect(ev.recommendedAction).toBe('SKIP');
    expect(ev.reason).toContain('0.01');
  });

  it('SKIP when salesVelocity1h missing or below minVelocity1h', () => {
    expect(strat.evaluate({ ...healthy, salesVelocity1h: undefined }).recommendedAction).toBe('SKIP');
    expect(strat.evaluate({ ...healthy, salesVelocity1h: 2 }).recommendedAction).toBe('SKIP');
  });

  it('SKIP when volumeSpike4hRatio missing (fail-closed)', () => {
    const ev = strat.evaluate({ ...healthy, volumeSpike4hRatio: undefined });
    expect(ev.recommendedAction).toBe('SKIP');
  });

  it('SKIP when security audit failed', () => {
    const ev = strat.evaluate({ ...healthy, securityAuditPassed: false });
    expect(ev.recommendedAction).toBe('SKIP');
  });
});
