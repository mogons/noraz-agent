import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PolymarketAgent } from '../src/agents/prediction/polymarket-agent.js';
import type { PolymarketAdapter, PolymarketMarketData } from '../src/adapters/polymarket-adapter.js';

const requireEsm = createRequire(import.meta.url);

// ── Fixtures (realistic: deep liquid Crypto market) ──────────────────────

const mkMarket = (over: Partial<PolymarketMarketData> = {}): PolymarketMarketData => ({
  id: 'm-123',
  conditionId: 'c-123',
  clobTokenId: 't-123',
  question: 'Will ETH hit $10k before 2027?',
  category: 'Crypto',
  slug: 'eth-10k',
  endDate: '2026-12-31T00:00:00Z',
  outcomes: [
    { name: 'Yes', price: 0.93 },
    { name: 'No', price: 0.07 },
  ],
  volume24hUsd: 500000,
  liquidityUsd: 300000,
  bestBidYes: 0.92,
  bestAskYes: 0.94,
  url: 'https://polymarket.com/event/eth-10k',
  ...over,
});

const mkFakeAdapter = (markets: PolymarketMarketData[]): PolymarketAdapter => ({
  fetchTopMarkets: vi.fn(async (cat: 'Crypto' | 'Macro' | 'Politics' | 'Tech' | 'Trending') => cat === 'Crypto' ? markets : []),
} as unknown as PolymarketAdapter);

// ── Tests ─────────────────────────────────────────────────────────────────

describe('PolymarketAgent', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('contract: domain is prediction', () => {
    const agent = new PolymarketAgent(mkFakeAdapter([]));
    expect(agent.domain).toBe('prediction');
  });

  it('runScreeningPass no-op: screening dinonaktifkan — selalu [] tanpa request API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const agent = new PolymarketAgent(mkFakeAdapter([mkMarket()]));
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
    vi.unstubAllGlobals();
  });

  it('evaluateMarket fail-closed: no real odds returns null', () => {
    const agent = new PolymarketAgent(mkFakeAdapter([]));
    const market = mkMarket({ outcomes: [{ name: 'Yes', price: 0 }, { name: 'No', price: 0 }] });
    expect(agent.evaluateMarket(market)).toBeNull();
  });

  it('buildPayload maps real fields', () => {
    const agent = new PolymarketAgent(mkFakeAdapter([]));
    const report = agent.evaluateMarket(mkMarket({ volume24hUsd: 600000, liquidityUsd: 350000 }))!;
    const p = agent.buildPayload(report, 'bet yes thesis');
    expect(p.domain).toBe('PREDICTION');
    expect(p.title).toBe('Will ETH hit $10k before 2027?');
    expect(p.symbol).toBe('Yes');
    expect(p.network).toBe('Polygon (Polymarket)');
    expect(p.confidenceScore).toBe(report.confidenceScore);
    expect(p.aiThesis).toBe('bet yes thesis');
    expect(p.dexScreenerUrl).toBe('https://polymarket.com/event/eth-10k');
    expect(p.liquidityUsd).toBe(350000);
    expect(p.volume1hUsd).toBe(25000); // 600000 / 24
    expect(p.socialHypeScore).toBe(report.confidenceScore);
    expect(p.securityAuditPassed).toBe(true);
  });

  it('deriveMarketSafety: liquidity >= $50k, volume24h >= $25k, spread <= 0.05 when available', () => {
    const agent = new PolymarketAgent(mkFakeAdapter([]));
    const report = (m: PolymarketMarketData) => agent.evaluateMarket(m)!;
    expect(agent.deriveMarketSafety(report(mkMarket()))).toBe(true);
    expect(agent.deriveMarketSafety(report(mkMarket({ liquidityUsd: 49999 })))).toBe(false);
    expect(agent.deriveMarketSafety(report(mkMarket({ volume24hUsd: 24999 })))).toBe(false);
    expect(agent.deriveMarketSafety(report(mkMarket({ bestBidYes: 0.90, bestAskYes: 0.99 })))).toBe(false);
    // Boundaries pass exactly
    expect(agent.deriveMarketSafety(report(mkMarket({ liquidityUsd: 50000, volume24hUsd: 25000, bestBidYes: 0.90, bestAskYes: 0.95 })))).toBe(true);
  });

  it('deriveMarketSafety: null spread passes on liquidity+volume alone (documented)', () => {
    const agent = new PolymarketAgent(mkFakeAdapter([]));
    const report = agent.evaluateMarket(mkMarket({ bestBidYes: null, bestAskYes: null }))!;
    expect(report.spread).toBeNull();
    expect(agent.deriveMarketSafety(report)).toBe(true);
  });

  it('calibration: strong market (92%+ odds, vol >= $100k, tight spread) reaches >= 80 (100)', () => {
    const agent = new PolymarketAgent(mkFakeAdapter([]));
    const report = agent.evaluateMarket(mkMarket());
    expect(report).not.toBeNull();
    expect(report!.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(report!.confidenceScore).toBe(100);
  });

  it('strategy extension: tidak berjalan saat no-op (screening off)', async () => {
    const agent = new PolymarketAgent(mkFakeAdapter([mkMarket()]));
    (agent as any).strategyEngine = {
      getActiveStrategy: () => ({ evaluate: () => ({ confidence: 0, recommendedAction: 'SKIP', reason: 'veto' }) }),
      runStrategySafely: (s: { [k: string]: any }, kind: 'evaluate' | 'calculate', arg: any) => s[kind]?.(arg),
    };
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(0);
  });

  it('strategy extension: evaluasi arsitektur tetap hidup via evaluateMarket (no-op pass)', async () => {
    const agent = new PolymarketAgent(mkFakeAdapter([]));
    const raw = agent.evaluateMarket(mkMarket())!;
    expect(raw.confidenceScore).toBeGreaterThanOrEqual(80);
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(0); // pass tetap no-op
  });
});

describe('prediction-default strategy', () => {
  const strat = (requireEsm(path.join(process.cwd(), 'strategies', 'prediction-default.mjs')) as any).default;

  const healthy = {
    domain: 'PREDICTION',
    symbol: 'm-123',
    contractAddress: 'N/A',
    priceUsd: 93,
    liquidityUsd: 300000,
    volume24hUsd: 500000,
    volume1hUsd: 500000 / 24,
    smartMoneyCount: 0,
    securityAuditPassed: true,
    socialHypeScore: 95,
    outcome: 'Yes',
    spread: 0.02,
  };

  it('BUY on healthy ctx (>= 80, not SKIP, reason mentions outcome)', () => {
    const ev = strat.evaluate({ ...healthy });
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
    expect(ev.reason).toContain('Yes');
  });

  it('reads snake_case prediction ctx block (gmgn-like fallback)', () => {
    const ev = strat.evaluate({
      domain: 'PREDICTION', symbol: 'm-123', securityAuditPassed: true,
      prediction: {
        market_id: 'm-123', question: 'Will ETH hit $10k before 2027?', outcome: 'Yes',
        current_odds_pct: 93, expected_ev_pct: 5, volume_24h_usd: 500000,
        liquidity_usd: 300000, spread: 0.02,
      },
    });
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
    expect(ev.reason).toContain('Yes');
  });

  it('SKIP when liquidity missing (fail-closed)', () => {
    const ev = strat.evaluate({ ...healthy, liquidityUsd: undefined });
    expect(ev.recommendedAction).toBe('SKIP');
    expect(ev.reason).toContain('fail-closed');
  });

  it('SKIP when liquidity below $50k gate', () => {
    const ev = strat.evaluate({ ...healthy, liquidityUsd: 40000 });
    expect(ev.recommendedAction).toBe('SKIP');
  });

  it('SKIP when volume24h missing or below $25k gate', () => {
    expect(strat.evaluate({ ...healthy, volume24hUsd: undefined }).recommendedAction).toBe('SKIP');
    expect(strat.evaluate({ ...healthy, volume24hUsd: 10000 }).recommendedAction).toBe('SKIP');
  });

  it('SKIP when spread available and above maxSpread gate', () => {
    const ev = strat.evaluate({ ...healthy, spread: 0.08 });
    expect(ev.recommendedAction).toBe('SKIP');
  });

  it('spread null passes the spread gate (documented: audit decides on liq+vol)', () => {
    const ev = strat.evaluate({ ...healthy, spread: null });
    expect(ev.recommendedAction).not.toBe('SKIP');
  });

  it('SKIP when security audit failed', () => {
    const ev = strat.evaluate({ ...healthy, securityAuditPassed: false });
    expect(ev.recommendedAction).toBe('SKIP');
  });
});
