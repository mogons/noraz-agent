import { describe, it, expect, vi, afterEach } from 'vitest';
import { PositionManager } from '../src/position/position-manager.js';
import { PositionScanner } from '../src/services/position-scanner.js';
import { StateStore } from '../src/services/state-store.js';
import { WalletService } from '../src/services/wallet-service.js';

const mkWallet = (evm: string) => ({
  getEvmAddress: vi.fn(() => evm),
} as unknown as WalletService);

describe('PositionScanner', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENSEA_API_KEY; delete process.env.EVM_PRIVATE_KEY; });

  it('fail-closed: no wallet → no positions, no alerts', async () => {
    const pm = new PositionManager();
    const scanner = new PositionScanner({ positionManager: pm, walletService: undefined });
    const alerts = await scanner.scanAll();
    expect(alerts).toEqual([]);
    expect(pm.getActivePositions()).toEqual([]);
  });

  it('fail-closed: API error → no crash, positions untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const pm = new PositionManager();
    const scanner = new PositionScanner({ positionManager: pm, walletService: mkWallet('0xevm') });
    const alerts = await scanner.scanAll();
    expect(alerts).toEqual([]);
    expect(pm.getActivePositions()).toEqual([]);
  });

  it('nft: tracks owned NFTs that match tracked collections, skips untracked', async () => {
    process.env.OPENSEA_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/nfts')) {
        return Promise.resolve({ ok: true, json: async () => ({
          nfts: [
            { identifier: '1', collection: 'pudgy' },
            { identifier: '2', collection: 'untracked-collection' },
          ],
        }) });
      }
      if (url.includes('/collections/pudgy')) {
        return Promise.resolve({ ok: true, json: async () => ({ stats: { floor_price: 1.2 } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ nfts: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pm = new PositionManager();
    const store = new StateStore('nft-scanner-test.json');
    store.setTrackedNftCollection('pudgy');
    const scanner = new PositionScanner({ positionManager: pm, walletService: mkWallet('0xevm'), stateStore: store });

    const alerts = await scanner.scanAll();
    expect(alerts).toEqual([]);
    const nftPositions = pm.getActiveNftPositions();
    expect(nftPositions).toHaveLength(1);
    expect(nftPositions[0].id).toBe('nft:pudgy');
    expect(nftPositions[0].entryFloorEth).toBeCloseTo(1.2, 5);
  });
});
