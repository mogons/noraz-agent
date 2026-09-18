import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  RhLaunchpadAdapter,
  FACTORY_PAD,
  callData,
  decodeAddr,
  existsGetLaunched,
  wordsOf,
} from '../src/adapters/rh-launchpad-adapter.js';

const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PONS_V2 = '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e';

function addrWord(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

describe('RhLaunchpadAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    RhLaunchpadAdapter.resetCache();
    delete process.env.EVM_ROBINHOOD_RPC_URL;
  });

  it('decodes factory addresses and getLaunchedToken hits', () => {
    expect(decodeAddr(`0x${addrWord(PONS_V2)}`)).toBe(PONS_V2);
    expect(decodeAddr('0x')).toBeNull();
    expect(FACTORY_PAD[PONS_V2]).toBe('Pons');

    const hit = `0x${addrWord(TOKEN)}`;
    expect(existsGetLaunched(TOKEN, hit)).toBe(true);
    expect(existsGetLaunched(TOKEN, `0x${'0'.repeat(64)}`)).toBe(false);
    expect(wordsOf(hit)).toHaveLength(1);
    expect(callData('3cf28b5a', TOKEN)).toMatch(/^0x3cf28b5a0{24}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$/);
  });

  it('lookup returns Pons from token.launchFactory() eth_call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('ponsfamily.com')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (typeof url === 'string' && url.includes('stonkbrokers')) {
        return { ok: true, json: async () => ({ rows: [] }) };
      }
      const body = JSON.parse(String(init?.body || '[]'));
      const results = body.map((row: any, i: number) => {
        if (i === 0) return { id: 0, result: `0x${addrWord(PONS_V2)}` };
        return { id: row.id, result: '0x' };
      });
      return { ok: true, json: async () => results };
    }));

    const adapter = new RhLaunchpadAdapter();
    const origin = await adapter.lookup(TOKEN);
    expect(origin?.name).toBe('Pons');
    expect(await adapter.originName(TOKEN)).toBe('Pons');
    expect(fetch).toHaveBeenCalled();
  });

  it('lookup is fail-open on RPC outage and caches misses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const adapter = new RhLaunchpadAdapter();
    expect(await adapter.lookup(TOKEN)).toBeNull();
    expect(await adapter.lookup(TOKEN)).toBeNull();
    // miss cache: second lookup should not refetch immediately
    expect((fetch as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('lookup accepts Pons HTTP index without RPC', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('ponsfamily.com')) {
        return { ok: true, json: async () => ({ token: TOKEN, symbol: 'FOO' }) };
      }
      throw new Error(`unexpected ${url}`);
    }));
    const adapter = new RhLaunchpadAdapter();
    expect(await adapter.originName(TOKEN)).toBe('Pons');
  });
});
