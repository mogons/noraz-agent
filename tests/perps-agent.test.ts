import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PerpsScreeningAgent } from '../src/agents/perps/perps-screening-agent.js';
import type { HyperliquidAdapter, HyperliquidMarketData, HyperliquidPerpsSignal } from '../src/adapters/hyperliquid-adapter.js';
import type { Candle } from '../src/services/technical-indicators.js';

const requireEsm = createRequire(import.meta.url);

// ── Fixtures ──────────────────────────────────────────────────────────────

const mkMarket = (over: Partial<HyperliquidMarketData> = {}): HyperliquidMarketData => ({
  coin: 'BTC',
  assetIndex: 0,
  markPriceUsd: 60000,
  midPriceUsd: 60000,
  openInterestUsd: 150_000_000,
  oiChange1hPercent: 20,
  oiChange4hPercent: 25,
  volume1hUsd: 50_000_000,
  volume4hUsd: 200_000_000,
  volume24hUsd: 1_200_000_000,
  fundingRate8h: -0.0001,
  fundingRateAnnualized: -10.95,
  bestBidUsd: 59994,
  bestAskUsd: 60006,
  spreadPercent: 0.02,
  ...over,
});

/** Gently rising candles → EMA9 > EMA21 > EMA50 > EMA200 with small pullbacks */
const mkBullishCandles = (count = 250): Candle[] => {
  const candles: Candle[] = [];
  let price = 60000;
  const start = Date.now() - count * 3600000;
  for (let i = 0; i < count; i++) {
    const pullback = i % 5 === 4;
    const change = pullback ? 0.9975 : 1.003;
    const open = price;
    const close = price * change;
    candles.push({
      openTime: start + i * 3600000,
      open,
      high: Math.max(open, close) * 1.0015,
      low: Math.min(open, close) * 0.9985,
      close,
      volume: 1000 + i,
    });
    price = close;
  }
  return candles;
};

const mkSignal = (market: HyperliquidMarketData, over: Partial<HyperliquidPerpsSignal> = {}): HyperliquidPerpsSignal => ({
  coin: market.coin,
  assetIndex: market.assetIndex,
  direction: 'LONG',
  confidence: 85,
  entryPriceUsd: market.midPriceUsd,
  suggestedLeverage: 10,
  stopLossPercent: 5,
  takeProfitPercent: 10,
  marketData: market,
  signalReasons: [],
  aiThesis: `${market.coin} thesis`,
  ...over,
});

const mkFakeAdapter = (markets: Record<string, HyperliquidMarketData>) => ({
  primaryWatchlist: Object.keys(markets),
  secondaryPool: [],
  fetchMarketData: vi.fn(async (coin: string) => markets[coin] ?? null),
} as unknown as HyperliquidAdapter);

/** Stub global fetch so fetchCandles() returns bullish candles (no network). */
const stubCandles = () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: any) => {
    const body = JSON.parse(init.body);
    if (body.type === 'candleSnapshot') {
      const candles = mkBullishCandles();
      return {
        ok: true,
        json: async () => candles.map((c) => ({ t: c.openTime, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume })),
      };
    }
    return { ok: true, json: async () => [] };
  }));
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('PerpsScreeningAgent', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('contract: domain is perps', () => {
    const agent = new PerpsScreeningAgent(mkFakeAdapter({}));
    expect(agent.domain).toBe('perps');
  });

  it('runScreeningPass returns [] with empty watchlist — no network, no fake data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const agent = new PerpsScreeningAgent(mkFakeAdapter({}));
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
  });

  it('runScreeningPass returns AgentReport[] with payload for a deep+trending setup', async () => {
    stubCandles();
    const agent = new PerpsScreeningAgent(mkFakeAdapter({ BTC: mkMarket() }));
    (agent as any).strategyEngine = { getActiveStrategy: () => null };
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(1);
    const r = reports[0];
    expect(r.passed).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(80);
    expect(r.reason).toBe(r.signal.aiThesis);
    expect(r.payload?.domain).toBe('PERPS');
    expect(r.payload?.contractAddress).toBe('BTC');
    expect(r.payload?.securityAuditPassed).toBe(true);
  });

  it('buildPayload maps real market fields', () => {
    const agent = new PerpsScreeningAgent(mkFakeAdapter({}));
    const market = mkMarket({ midPriceUsd: 61234.5 });
    const signal = mkSignal(market, { confidence: 87, entryPriceUsd: 61234.5, aiThesis: 'BTC-USDT LONG setup' });
    const p = agent.buildPayload(signal, 'BTC-USDT LONG setup');
    expect(p.domain).toBe('PERPS');
    expect(p.title).toBe('LONG BTC (10x)');
    expect(p.symbol).toBe('BTC');
    expect(p.contractAddress).toBe('BTC');
    expect(p.network).toBe('Hyperliquid Perps');
    expect(p.priceUsd).toBe('$61234.5');
    expect(p.marketCap).toContain('SL');
    expect(p.marketCap).toContain('TP');
    expect(p.liquidityUsd).toBe(150_000_000);
    expect(p.volume1hUsd).toBe(50_000_000);
    expect(p.confidenceScore).toBe(87);
    expect(p.aiThesis).toBe('BTC-USDT LONG setup');
    expect(p.socialHypeScore).toBe(87);
    expect(p.dexScreenerUrl).toBe('https://app.hyperliquid.xyz/trade/BTC');
    expect(p.securityAuditPassed).toBe(true);
  });

  it('buildPayload: securityAuditPassed false when OI shallow', () => {
    const agent = new PerpsScreeningAgent(mkFakeAdapter({}));
    const signal = mkSignal(mkMarket({ openInterestUsd: 5_000_000 }));
    expect(agent.buildPayload(signal, 'x').securityAuditPassed).toBe(false);
  });

  it('deriveSecurityPassed: deep+tight+sane funding passes; each violation fails', () => {
    const agent = new PerpsScreeningAgent(mkFakeAdapter({}));
    expect(agent.deriveSecurityPassed(mkMarket())).toBe(true);
    expect(agent.deriveSecurityPassed(mkMarket({ openInterestUsd: 9_999_999 }))).toBe(false);
    expect(agent.deriveSecurityPassed(mkMarket({ spreadPercent: 0.11 }))).toBe(false);
    expect(agent.deriveSecurityPassed(mkMarket({ fundingRate8h: 0.003 }))).toBe(false);
    expect(agent.deriveSecurityPassed(mkMarket({ fundingRate8h: -0.0021 }))).toBe(false);
    // Boundary values (OI $10M, spread 0.1%, |funding| 0.002) pass exactly
    expect(agent.deriveSecurityPassed(mkMarket({ openInterestUsd: 10_000_000, spreadPercent: 0.1, fundingRate8h: -0.002 }))).toBe(true);
  });

  it('depth bonus: strong deep setup (OI $150M, vol $50M, tight spread, bullish EMA) reaches >= 80', async () => {
    stubCandles();
    const agent = new PerpsScreeningAgent(mkFakeAdapter({}));
    const signal = await (agent as any).evaluateSetup(mkMarket());
    expect(signal).not.toBeNull();
    expect(signal.confidence).toBeGreaterThanOrEqual(80);
    expect(signal.aiThesis).toContain('Depth: $150M OI (+15)');
  });

  it('depth bonus tiers appear in thesis: 1B→+25, 150M→+15, 30M→+10, 12M→+5, 9M→+0', async () => {
    stubCandles();
    const agent = new PerpsScreeningAgent(mkFakeAdapter({}));
    for (const [oi, bonus] of [[1_000_000_000, '+25'], [150_000_000, '+15'], [30_000_000, '+10'], [12_000_000, '+5'], [9_000_000, '+0']]) {
      const signal = await (agent as any).evaluateSetup(mkMarket({ openInterestUsd: oi }));
      expect(signal.aiThesis).toContain(`Depth: $${(oi / 1e6).toFixed(0)}M OI (${bonus})`);
    }
  });

  it('strategy extension: SKIP vetoes the signal', async () => {
    stubCandles();
    const agent = new PerpsScreeningAgent(mkFakeAdapter({ BTC: mkMarket() }));
    (agent as any).strategyEngine = {
      getActiveStrategy: () => ({ evaluate: () => ({ confidence: 0, recommendedAction: 'SKIP', reason: 'veto' }) }),
    };
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(0);
  });

  it('strategy extension: BUY blends 0.7/0.3 and keeps the 80 gate', async () => {
    stubCandles();
    const agent = new PerpsScreeningAgent(mkFakeAdapter({ BTC: mkMarket() }));
    (agent as any).strategyEngine = {
      getActiveStrategy: () => ({ evaluate: () => ({ confidence: 90, recommendedAction: 'BUY', reason: 'ok' }) }),
    };
    const raw = await (agent as any).evaluateSetup(mkMarket());
    const expected = Math.round(raw.confidence * 0.7 + 0.3 * 90);
    expect(expected).toBeGreaterThanOrEqual(80);
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(1);
    expect(reports[0].confidence).toBe(expected);
  });
});

describe('perps-default strategy', () => {
  const strat = (requireEsm(path.join(process.cwd(), 'strategies', 'perps-default.mjs')) as any).default;

  it('BUY on healthy LONG ctx (>= 80, not SKIP)', () => {
    const ev = strat.evaluate({
      domain: 'PERPS', symbol: 'BTC', contractAddress: 'BTC',
      priceUsd: 60000, liquidityUsd: 150_000_000, volume1hUsd: 50_000_000,
      socialHypeScore: 90, securityAuditPassed: true, direction: 'LONG',
      openInterestUsd: 150_000_000, fundingRate8h: -0.0001, spreadPercent: 0.01,
      oiChange1hPercent: 20, oiChange4hPercent: 25, volume4hUsd: 200_000_000,
    });
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
  });

  it('BUY on healthy SHORT ctx (funding pays shorts)', () => {
    const ev = strat.evaluate({
      domain: 'PERPS', symbol: 'BTC', contractAddress: 'BTC',
      priceUsd: 60000, liquidityUsd: 150_000_000, volume1hUsd: 50_000_000,
      socialHypeScore: 90, securityAuditPassed: true, direction: 'SHORT',
      openInterestUsd: 150_000_000, fundingRate8h: 0.0001, spreadPercent: 0.01,
      oiChange1hPercent: 20, oiChange4hPercent: 25, volume4hUsd: 200_000_000,
    });
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
  });

  it('reads snake_case hyperliquid ctx contract (gmgn-like fallback)', () => {
    const ev = strat.evaluate({
      domain: 'PERPS', symbol: 'BTC', securityAuditPassed: true, direction: 'LONG',
      hyperliquid: {
        open_interest_usd: 150_000_000, funding_rate_8h: -0.0001, spread_percent: 0.01,
        oi_change_1h_percent: 20, oi_change_4h_percent: 25,
        volume_1h_usd: 50_000_000, volume_4h_usd: 200_000_000,
      },
    });
    expect(ev.recommendedAction).not.toBe('SKIP');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
  });

  it('SKIP when OI missing (fail-closed)', () => {
    const ev = strat.evaluate({
      domain: 'PERPS', symbol: 'BTC', priceUsd: 60000,
      volume1hUsd: 50_000_000, socialHypeScore: 90, securityAuditPassed: true, direction: 'LONG',
    });
    expect(ev.recommendedAction).toBe('SKIP');
    expect(ev.reason).toContain('fail-closed');
  });

  it('mega-depth tier (OI >= $1B) scores highest', () => {
    const base = {
      domain: 'PERPS', symbol: 'BTC', priceUsd: 60000, securityAuditPassed: true, direction: 'LONG',
      volume1hUsd: 50_000_000, spreadPercent: 0.01, fundingRate8h: -0.0001,
      oiChange1hPercent: 20, oiChange4hPercent: 25,
    };
    // volume4h scaled with OI so the volume/OI ratio stays identical (0.5x → +4 both)
    const mega = strat.evaluate({ ...base, openInterestUsd: 2_300_000_000, liquidityUsd: 2_300_000_000, volume4hUsd: 1_150_000_000 });
    const mid = strat.evaluate({ ...base, openInterestUsd: 150_000_000, liquidityUsd: 150_000_000, volume4hUsd: 75_000_000 });
    expect(mega.recommendedAction).toBe('BUY');
    expect(mega.confidence).toBeGreaterThan(mid.confidence);
    expect(mega.reason).toContain('+30');
  });

  it('SKIP when direction missing (fail-closed)', () => {
    const ev = strat.evaluate({
      domain: 'PERPS', symbol: 'BTC', priceUsd: 60000, liquidityUsd: 150_000_000,
      openInterestUsd: 150_000_000, volume1hUsd: 50_000_000, socialHypeScore: 90, securityAuditPassed: true,
    });
    expect(ev.recommendedAction).toBe('SKIP');
  });

  it('SKIP when spread or funding exceeds gates', () => {
    const base = {
      domain: 'PERPS', symbol: 'BTC', priceUsd: 60000, liquidityUsd: 150_000_000,
      openInterestUsd: 150_000_000, volume1hUsd: 50_000_000,
      socialHypeScore: 90, securityAuditPassed: true, direction: 'LONG',
    };
    expect(strat.evaluate({ ...base, spreadPercent: 0.2 }).recommendedAction).toBe('SKIP');
    expect(strat.evaluate({ ...base, fundingRate8h: 0.003 }).recommendedAction).toBe('SKIP');
  });
});
