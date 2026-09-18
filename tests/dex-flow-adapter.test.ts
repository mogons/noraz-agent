import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DexFlowAdapter,
  bestPair,
  evaluateDexFlow,
  isDexDump,
  pairToFlow,
  pairUrl,
} from '../src/adapters/dex-flow-adapter.js';

const ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PAIR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function mkPair(over: Record<string, unknown> = {}): Record<string, any> {
  return {
    chainId: 'robinhood',
    pairAddress: PAIR,
    dexId: 'uniswap',
    baseToken: { address: ADDR, symbol: 'FOO', name: 'Foo' },
    quoteToken: { address: '0xeth', symbol: 'WETH' },
    priceUsd: '0.01',
    marketCap: 200000,
    liquidity: { usd: 80000 },
    volume: { h1: 20000, h24: 150000 },
    txns: { h1: { buys: 40, sells: 12 } },
    priceChange: { h1: 18, h24: 40 },
    pairCreatedAt: Date.now() - 3 * 3600_000,
    ...over,
  };
}

describe('DexFlowAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    DexFlowAdapter.resetCache();
  });

  it('pairToFlow maps DexScreener pair tape and flags dumps', () => {
    const flow = pairToFlow(mkPair())!;
    expect(flow.address).toBe(ADDR);
    expect(flow.buys1h).toBe(40);
    expect(flow.sells1h).toBe(12);
    expect(flow.vol1hUsd).toBe(20000);
    expect(flow.liqUsd).toBe(80000);
    expect(flow.volLiq).toBeCloseTo(0.25);
    expect(flow.dump).toBe(false);
    expect(flow.pairUrl).toBe(`https://dexscreener.com/robinhood/${PAIR}`);

    const dump = pairToFlow(mkPair({ txns: { h1: { buys: 3, sells: 20 } } }))!;
    expect(dump.dump).toBe(true);
    expect(isDexDump(3, 20)).toBe(true);
    expect(isDexDump(10, 8)).toBe(false);
  });

  it('bestPair prefers highest liquidity + 24h volume', () => {
    const weak = mkPair({ pairAddress: '0xweak', liquidity: { usd: 1000 }, volume: { h24: 100 } });
    const strong = mkPair({ pairAddress: '0xstrong', liquidity: { usd: 90000 }, volume: { h24: 400000 } });
    expect(bestPair([weak, strong])?.pairAddress).toBe('0xstrong');
    expect(bestPair([])).toBeNull();
  });

  it('evaluateDexFlow boosts rising vol/liq and hard-rejects dumps', () => {
    const rising = evaluateDexFlow(pairToFlow(mkPair())!);
    expect(rising.dump).toBe(false);
    expect(rising.volLiqRising).toBe(true);
    expect(rising.confidenceDelta).toBe(8);

    const dump = evaluateDexFlow(pairToFlow(mkPair({ txns: { h1: { buys: 2, sells: 30 } } }))!);
    expect(dump.dump).toBe(true);
    expect(dump.confidenceDelta).toBe(0);

    expect(evaluateDexFlow(null).dump).toBe(false);
    expect(evaluateDexFlow(null).confidenceDelta).toBe(0);
  });

  it('fetchFlowBatch groups pairs and is fail-open on network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [mkPair(), mkPair({
        baseToken: { address: '0xcccccccccccccccccccccccccccccccccccccccc', symbol: 'BAR' },
        pairAddress: '0xother',
        liquidity: { usd: 1000 },
        volume: { h1: 10, h24: 20 },
      })],
    }));
    const adapter = new DexFlowAdapter();
    const map = await adapter.fetchFlowBatch([ADDR, '0xcccccccccccccccccccccccccccccccccccccccc']);
    expect(map.get(ADDR.toLowerCase())?.symbol).toBe('FOO');
    expect(map.get('0xcccccccccccccccccccccccccccccccccccccccc')?.pairAddress).toBe('0xother');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    DexFlowAdapter.resetCache();
    const empty = await adapter.fetchFlowBatch([ADDR]);
    expect(empty.size).toBe(0);
  });

  it('pairUrl prefers pair address', () => {
    expect(pairUrl(PAIR, ADDR)).toContain(PAIR);
    expect(pairUrl(null, ADDR)).toContain(ADDR);
  });
});
