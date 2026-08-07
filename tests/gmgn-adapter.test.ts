import { describe, it, expect, vi, afterEach } from 'vitest';
import { GMGNAdapter } from '../src/adapters/gmgn-adapter.js';

const itemWithoutSmartData = {
  symbol: 'TEST', name: 'Test', address: 'addr123',
  price: '0.001', market_cap: 1000, volume_24h: 5000, liquidity: 2000,
};

describe('GMGNAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GMGN_API_KEY; });

  it('does not fabricate smart money metrics when API omits them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [itemWithoutSmartData],
    }));
    process.env.GMGN_API_KEY = 'test-key';
    const adapter = new GMGNAdapter();
    const [sig] = await adapter.fetchTrendingSignals('sol');
    expect(sig.smartMoneyCount).toBe(0);
    expect(sig.smartMoneyNetBuySolOrEth).toBe(0);
    expect(sig.sniperRatioPercentage).toBe(0);
  });

  it('uses real values when the API provides them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ ...itemWithoutSmartData, smart_money_count: 7, smart_money_net_buy: 42.5, sniper_ratio: 12.3 }],
    }));
    process.env.GMGN_API_KEY = 'test-key';
    const adapter = new GMGNAdapter();
    const [sig] = await adapter.fetchTrendingSignals('sol');
    expect(sig.smartMoneyCount).toBe(7);
    expect(sig.smartMoneyNetBuySolOrEth).toBe(42.5);
    expect(sig.sniperRatioPercentage).toBe(12.3);
  });
});
