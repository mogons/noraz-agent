import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidAdapter } from '../src/adapters/hyperliquid-adapter.js';
import { WhaleScreeningAgent } from '../src/agents/whale-eth/whale-screening-agent.js';
import defaultStrategy from '../strategies/whale-eth-default.mjs';
import standardStrategy from '../strategies/whale-eth-standard.mjs';

describe('HyperliquidAdapter & WhaleScreeningAgent Test Suite', () => {
  let mockAdapter: HyperliquidAdapter;

  beforeEach(() => {
    mockAdapter = new HyperliquidAdapter();
  });

  it('HyperliquidAdapter handles fetch failure gracefully (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));

    const traders = await mockAdapter.fetchLeaderboardTraders('ETH', 10);
    expect(traders).toEqual([]);

    const state = await mockAdapter.fetchClearinghouseState('0x123');
    expect(state).toEqual([]);

    const fills = await mockAdapter.fetchUserFills('0x123', Date.now() - 300000);
    expect(fills).toEqual([]);

    vi.unstubAllGlobals();
  });

  it('WhaleScreeningAgent handles empty/offline network without crashing', async () => {
    vi.spyOn(mockAdapter, 'fetchLeaderboardTraders').mockResolvedValue([]);

    const agent = new WhaleScreeningAgent(mockAdapter);
    const reports = await agent.runScreeningPass();

    expect(reports).toEqual([]);
  });

  it('WhaleScreeningAgent aggregates ETH whale long/short positions and spot flow', async () => {
    vi.spyOn(mockAdapter, 'fetchLeaderboardTraders').mockResolvedValue([
      { address: '0xWhale1', returnPct: 150.5, pnlUsd: 1_200_000 },
      { address: '0xWhale2', returnPct: -20.0, pnlUsd: -100_000 },
    ]);

    vi.spyOn(mockAdapter, 'fetchClearinghouseState').mockImplementation(async (user: string) => {
      if (user === '0xWhale1') {
        return [
          { coin: 'ETH', side: 'LONG', sizeUsd: 5_000_000, entryPx: 2800, leverage: 10, funding: 0.0001 },
        ];
      }
      if (user === '0xWhale2') {
        return [
          { coin: 'ETH', side: 'SHORT', sizeUsd: 2_000_000, entryPx: 2850, leverage: 5, funding: -0.0001 },
        ];
      }
      return [];
    });

    vi.spyOn(mockAdapter, 'fetchUserFills').mockImplementation(async () => {
      return [
        {
          coin: 'ETH/USDC',
          isSpot: true,
          px: 2800,
          sz: 50,
          usd: 140_000,
          side: 'BUY',
          user: '0xWhale1',
          timestamp: Date.now(),
        },
      ];
    });

    const agent = new WhaleScreeningAgent(mockAdapter);
    const reports = await agent.runScreeningPass();

    expect(reports.length).toBe(1);
    const report = reports[0];
    expect(report.passed).toBe(true);
    expect(report.signal.coin).toBe('ETH');
    expect(report.signal.totalLongUsd).toBe(5_000_000);
    expect(report.signal.totalShortUsd).toBe(2_000_000);
    expect(report.signal.netUsd).toBe(3_000_000);
    expect(report.payload?.domain).toBe('WHALE_ETH');
    expect(report.payload?.whaleReport?.longTraders.length).toBe(1);
    expect(report.payload?.whaleReport?.shortTraders.length).toBe(1);
    expect(report.payload?.whaleReport?.spotFlow.length).toBe(1);
  });

  it('Default and Standard strategies evaluate whale context accurately', () => {
    const bullishCtx = {
      whale: {
        totalLongUsd: 10_000_000,
        totalShortUsd: 2_000_000,
        longCount: 3,
        shortCount: 1,
      },
    };

    const defEval = defaultStrategy.evaluate(bullishCtx);
    expect(defEval.confidence).toBeGreaterThanOrEqual(80);
    expect(defEval.recommendedAction).toBe('BUY');

    const stdEval = standardStrategy.evaluate(bullishCtx);
    expect(stdEval.confidence).toBeGreaterThanOrEqual(80);
    expect(stdEval.recommendedAction).toBe('BUY');

    const smallCtx = {
      whale: {
        totalLongUsd: 100_000,
        totalShortUsd: 50_000,
        longCount: 0,
        shortCount: 0,
      },
    };

    const stdSmallEval = standardStrategy.evaluate(smallCtx);
    expect(stdSmallEval.confidence).toBe(0);
    expect(stdSmallEval.recommendedAction).toBe('SKIP');
  });
});
