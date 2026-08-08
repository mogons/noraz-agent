import { describe, it, expect, vi } from 'vitest';
import { PerpsScreeningAgent } from '../src/agents/perps/perps-screening-agent.js';
import type { HyperliquidTrader, HyperliquidPosition, HyperliquidTradeFill } from '../src/adapters/hyperliquid-adapter.js';

// ── Mock adapter ──────────────────────────────────────────────────────────

interface MockAdapterOverrides {
  trackedAssets?: string[];
  traders?: Record<string, HyperliquidTrader[]>;
  positions?: Record<string, HyperliquidPosition[]>;
  fills?: HyperliquidTradeFill[];
}

function makeAdapter(over: MockAdapterOverrides = {}) {
  const state = {
    traders: over.traders ?? {},
    positions: over.positions ?? {},
    fills: over.fills ?? [],
  };
  const adapter = {
    trackedAssets: over.trackedAssets ?? ['BTC'],
    fetchLeaderboardTraders: vi.fn(async (coin: string): Promise<HyperliquidTrader[]> => state.traders[coin] ?? []),
    fetchClearinghouseState: vi.fn(async (user: string): Promise<HyperliquidPosition[]> => state.positions[user] ?? []),
    fetchLeaderboardTrades: vi.fn(async (): Promise<{ fills: HyperliquidTradeFill[]; fetchedAt: number }> => ({ fills: state.fills, fetchedAt: Date.now() })),
  };
  return { adapter, state };
}

const traderA: HyperliquidTrader = { address: '0x1111111111111111111111111111111111111111', returnPct: 12.5, pnlUsd: 800_000 };
const traderB: HyperliquidTrader = { address: '0x2222222222222222222222222222222222222222', returnPct: -4.2, pnlUsd: -50_000 };

const longA: HyperliquidPosition = { coin: 'BTC', side: 'LONG', sizeUsd: 2_000_000, entryPx: 60000, leverage: 10, funding: 0.0001 };
const shortB: HyperliquidPosition = { coin: 'BTC', side: 'SHORT', sizeUsd: 1_500_000, entryPx: 61000, leverage: 5, funding: -0.0001 };
const smallLong: HyperliquidPosition = { coin: 'BTC', side: 'LONG', sizeUsd: 400_000, entryPx: 59000, leverage: 3, funding: 0 };
const ethLong: HyperliquidPosition = { coin: 'ETH', side: 'LONG', sizeUsd: 9_000_000, entryPx: 3000, leverage: 10, funding: 0 };

// ── buildSignal ───────────────────────────────────────────────────────────

describe('buildSignal — agregasi posisi per aset', () => {
  it('menjumlahkan long/short, memfilter detail per trader >= $1M, mengabaikan coin lain', () => {
    const agent = new PerpsScreeningAgent(makeAdapter().adapter as never);
    const sig = agent.buildSignal(
      'BTC',
      [
        { address: traderA.address, pos: longA },
        { address: traderB.address, pos: shortB },
        { address: traderA.address, pos: smallLong }, // < $1M: masuk total, tidak masuk detail
        { address: traderA.address, pos: ethLong },   // bukan BTC: diabaikan
      ],
      new Map([[traderA.address, 12.5]]),
      new Map(),
    );

    expect(sig.totalLongUsd).toBe(2_400_000);
    expect(sig.totalShortUsd).toBe(1_500_000);
    expect(sig.netUsd).toBe(900_000);
    expect(sig.longCount).toBe(1); // 1 trader long (2 posisi milik traderA)
    expect(sig.shortCount).toBe(1);
    expect(sig.longTraders).toHaveLength(1);
    expect(sig.longTraders[0].address).toBe(traderA.address);
    expect(sig.longTraders[0].sizeUsd).toBe(2_400_000); // 2M + 400k agregat per trader
    expect(sig.longTraders[0].returnPct).toBe(12.5);
    expect(sig.shortTraders).toHaveLength(1);
    expect(sig.shortTraders[0].sizeUsd).toBe(1_500_000);
  });

  it('menggabungkan beberapa posisi trader yang sama', () => {
    const agent = new PerpsScreeningAgent(makeAdapter().adapter as never);
    const sig = agent.buildSignal(
      'BTC',
      [
        { address: traderA.address, pos: longA },
        { address: traderA.address, pos: { ...smallLong, sizeUsd: 800_000 } }, // total 2.8M
      ],
      new Map(),
      new Map(),
    );
    expect(sig.totalLongUsd).toBe(2_800_000);
    expect(sig.longTraders).toHaveLength(1);
    expect(sig.longTraders[0].sizeUsd).toBe(2_800_000);
  });
});

// ── aggregateSpotFlow ─────────────────────────────────────────────────────

describe('aggregateSpotFlow — aliran spot', () => {
  it('menolak fill < $100k dan mengagregat buy/sell per market', () => {
    const agent = new PerpsScreeningAgent(makeAdapter().adapter as never);
    const fills: HyperliquidTradeFill[] = [
      { coin: 'BTC/USDC', isSpot: true, px: 60000, sz: 2.5, usd: 150_000, side: 'BUY', user: '0xa', timestamp: 1 },
      { coin: 'BTC/USDC', isSpot: true, px: 60000, sz: 0.8, usd: 48_000, side: 'BUY', user: '0xb', timestamp: 2 }, // < 100k → ditolak
      { coin: 'BTC/USDC', isSpot: true, px: 61000, sz: 2.0, usd: 122_000, side: 'SELL', user: '0xc', timestamp: 3 },
      { coin: 'ETH/USDC', isSpot: true, px: 3000, sz: 40, usd: 120_000, side: 'BUY', user: '0xd', timestamp: 4 },
    ];
    const map = agent.aggregateSpotFlow(fills);
    expect(map.get('BTC/USDC')).toEqual({ market: 'BTC/USDC', buyUsd: 150_000, sellUsd: 122_000, fillCount: 2 });
    expect(map.get('ETH/USDC')).toEqual({ market: 'ETH/USDC', buyUsd: 120_000, sellUsd: 0, fillCount: 1 });
  });
});

// ── isMaterialChange / runScreeningPass ───────────────────────────────────

describe('isMaterialChange & runScreeningPass — event detection', () => {
  it('pass pertama selalu post (baseline)', async () => {
    const { adapter, state } = makeAdapter({
      traders: { BTC: [traderA] },
      positions: { [traderA.address]: [longA] },
    });
    void state;
    const agent = new PerpsScreeningAgent(adapter as never, { postCooldownMs: 0 });
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(1);
    expect(reports[0].payload?.domain).toBe('WHALE');
    expect(reports[0].payload?.whaleReport?.totalLongUsd).toBe(2_000_000);
  });

  it('tidak post ulang saat tidak ada perubahan material', async () => {
    const { adapter } = makeAdapter({
      traders: { BTC: [traderA] },
      positions: { [traderA.address]: [longA] },
    });
    const agent = new PerpsScreeningAgent(adapter as never, { postCooldownMs: 0 });
    await agent.runScreeningPass();
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(0);
  });

  it('post saat posisi baru >= $1M muncul', async () => {
    const { adapter, state } = makeAdapter({
      traders: { BTC: [traderA, traderB] },
      positions: { [traderA.address]: [longA], [traderB.address]: [] },
    });
    const agent = new PerpsScreeningAgent(adapter as never, { postCooldownMs: 0 });
    await agent.runScreeningPass();
    state.positions[traderB.address] = [shortB];
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(1);
    expect(reports[0].signal.shortTraders).toHaveLength(1);
  });

  it('post saat posisi >= $1M ditutup', async () => {
    const { adapter, state } = makeAdapter({
      traders: { BTC: [traderA, traderB] },
      positions: { [traderA.address]: [longA], [traderB.address]: [shortB] },
    });
    const agent = new PerpsScreeningAgent(adapter as never, { postCooldownMs: 0 });
    await agent.runScreeningPass();
    state.positions[traderB.address] = [];
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(1);
    expect(reports[0].signal.shortTraders).toHaveLength(0);
  });

  it('post saat total long/short berubah >= 30%', async () => {
    const { adapter, state } = makeAdapter({
      traders: { BTC: [traderA] },
      positions: { [traderA.address]: [longA] },
    });
    const agent = new PerpsScreeningAgent(adapter as never, { postCooldownMs: 0 });
    await agent.runScreeningPass();
    state.positions[traderA.address] = [{ ...longA, sizeUsd: 2_800_000 }]; // +40%
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(1);
  });

  it('tidak post saat perubahan di bawah 30% dan tidak ada posisi baru', async () => {
    const { adapter, state } = makeAdapter({
      traders: { BTC: [traderA] },
      positions: { [traderA.address]: [longA] },
    });
    const agent = new PerpsScreeningAgent(adapter as never, { postCooldownMs: 0 });
    await agent.runScreeningPass();
    state.positions[traderA.address] = [{ ...longA, sizeUsd: 2_100_000 }]; // +5%
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(0);
  });

  it('post saat fill spot baru >= $100k muncul', async () => {
    const { adapter, state } = makeAdapter({
      traders: { BTC: [traderA] },
      positions: { [traderA.address]: [longA] },
      fills: [],
    });
    const agent = new PerpsScreeningAgent(adapter as never, { postCooldownMs: 0 });
    await agent.runScreeningPass();
    state.fills = [
      { coin: 'BTC/USDC', isSpot: true, px: 60000, sz: 2.0, usd: 120_000, side: 'BUY', user: '0x1', timestamp: 1 },
    ];
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(1);
    expect(reports[0].signal.spotFlow).toHaveLength(1);
    expect(reports[0].signal.spotFlow[0].buyUsd).toBe(120_000);
  });

  it('cooldown 10 menit mencegah double-post walau data berubah', async () => {
    const { adapter, state } = makeAdapter({
      traders: { BTC: [traderA] },
      positions: { [traderA.address]: [longA] },
    });
    const agent = new PerpsScreeningAgent(adapter as never); // default cooldown 10m
    await agent.runScreeningPass();
    state.positions[traderA.address] = [{ ...longA, sizeUsd: 2_800_000 }];
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(0);
  });

  it('leaderboard kosong → skip aset tanpa error', async () => {
    const { adapter } = makeAdapter({ traders: { BTC: [] } });
    const agent = new PerpsScreeningAgent(adapter as never, { postCooldownMs: 0 });
    const reports = await agent.runScreeningPass();
    expect(reports).toHaveLength(0);
  });
});

// ── buildPayload ──────────────────────────────────────────────────────────

describe('buildPayload — call card whale', () => {
  it('mengisi whaleReport + domain WHALE', () => {
    const agent = new PerpsScreeningAgent(makeAdapter().adapter as never);
    const sig = agent.buildSignal(
      'BTC',
      [{ address: traderA.address, pos: longA }],
      new Map([[traderA.address, 12.5]]),
      new Map([['BTC/USDC', { market: 'BTC/USDC', buyUsd: 150_000, sellUsd: 0, fillCount: 1 }]]),
    );
    const payload = agent.buildPayload(sig);
    expect(payload.domain).toBe('WHALE');
    expect(payload.title).toBe('WHALE WATCH: BTC');
    expect(payload.whaleReport?.netUsd).toBe(2_000_000);
    expect(payload.whaleReport?.longTraders[0].address).toBe(traderA.address);
    expect(payload.whaleReport?.spotFlow[0].buyUsd).toBe(150_000);
  });
});
