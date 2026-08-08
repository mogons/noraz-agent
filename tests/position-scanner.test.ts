import { describe, it, expect, vi, afterEach } from 'vitest';
import { PositionManager } from '../src/position/position-manager.js';
import { PositionScanner } from '../src/services/position-scanner.js';
import { StateStore } from '../src/services/state-store.js';
import { WalletService } from '../src/services/wallet-service.js';

const mkWallet = (solana: string, evm: string) => ({
  getSolanaAddress: vi.fn(() => solana),
  getEvmAddress: vi.fn(() => evm),
} as unknown as WalletService);

describe('PositionScanner', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.SOLANA_PRIVATE_KEY; delete process.env.EVM_PRIVATE_KEY; });

  it('fail-closed: no wallet → no positions, no alerts', async () => {
    const pm = new PositionManager();
    const scanner = new PositionScanner({ positionManager: pm, walletService: undefined });
    const alerts = await scanner.scanAll();
    expect(alerts).toEqual([]);
    expect(pm.getActivePositions()).toEqual([]);
  });

  it('perps: tracks real Hyperliquid positions and removes when closed', async () => {
    const fetchMock = vi.fn();
    // scan 1: perps punya posisi; scan 2: kosong (closed)
    fetchMock
      .mockImplementation((url: string) => {
        if (url.includes('hyperliquid')) {
          return Promise.resolve({ ok: true, json: async () => ({ assetPositions: [{ position: { coin: 'BTC', szi: '0.1', entryPx: '60000', positionValue: '6000', unrealizedPnl: '300', leverage: { value: 5, isCross: true } } }] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ positions: [] }) });
      });
    vi.stubGlobal('fetch', fetchMock);
    const pm = new PositionManager();
    const scanner = new PositionScanner({ positionManager: pm, walletService: mkWallet('sol', '0xevm') });

    const alerts1 = await scanner.scanAll();
    expect(alerts1).toEqual([]);
    expect(pm.getActivePositions()).toHaveLength(1);
    expect(pm.getActivePositions()[0].id).toBe('perps:BTC');

    // scan 2: HL kosong, LP/PRED juga kosong
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('hyperliquid')) return Promise.resolve({ ok: true, json: async () => ({ assetPositions: [] }) });
      return Promise.resolve({ ok: true, json: async () => ({ positions: [] }) });
    });
    const alerts2 = await scanner.scanAll();
    expect(alerts2).toEqual([]);
    expect(pm.getActivePositions()).toHaveLength(0);
  });

  it('perps: -50% drawdown triggers CRITICAL alert', async () => {
    const entryPx = 100;
    const positionValue = 1000;
    const unrealizedPnl = -520; // ~-52% of position value
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assetPositions: [{ position: { coin: 'ETH', szi: '10', entryPx: String(entryPx), positionValue: String(positionValue), unrealizedPnl: String(unrealizedPnl), leverage: { value: 3, isCross: true } } }],
      }),
    }));
    const pm = new PositionManager();
    const scanner = new PositionScanner({ positionManager: pm, walletService: mkWallet('sol', '0xevm') });

    // First scan creates the position at entry (no alert)
    await scanner.scanAll();
    // Second scan with same PnL → updateMemePosition sees -52% → CRITICAL
    const alerts = await scanner.scanAll();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].type).toBe('CRITICAL');
    expect(alerts[0].address).toBe('perps:ETH');
  });

  it('lp-solana: tracks Meteora portfolio positions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ positions: [{ pool: { address: 'poolX', name: 'SOL-USDC' } }] }),
    }));
    const pm = new PositionManager();
    const scanner = new PositionScanner({ positionManager: pm, walletService: mkWallet('solanaPubkey', '0xevm') });
    const alerts = await scanner.scanAll();
    expect(alerts).toEqual([]);
    const lp = pm.getActiveLpPositions();
    expect(lp).toHaveLength(1);
    expect(lp[0].id).toBe('lp:poolX');
    expect(lp[0].network).toBe('Solana');
  });

  it('prediction: tracks Polymarket positions and removes when flat', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('polymarket')) return Promise.resolve({ ok: true, json: async () => [{ conditionId: 'c1', size: 100, avgPrice: 0.5, currentValue: 50, percentPnl: 0, curPrice: 0.5 }] });
      return Promise.resolve({ ok: true, json: async () => ({ positions: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const pm = new PositionManager();
    const scanner = new PositionScanner({ positionManager: pm, walletService: mkWallet('sol', '0xevm') });
    await scanner.scanAll();
    expect(pm.getActivePositions().some((p) => p.id === 'pred:c1')).toBe(true);

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('polymarket')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ positions: [] }) });
    });
    await scanner.scanAll();
    expect(pm.getActivePositions().some((p) => p.id === 'pred:c1')).toBe(false);
  });

  it('fail-closed: API error → no crash, positions untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const pm = new PositionManager();
    const scanner = new PositionScanner({ positionManager: pm, walletService: mkWallet('sol', '0xevm') });
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
      return Promise.resolve({ ok: true, json: async () => ({ assetPositions: [], positions: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pm = new PositionManager();
    const store = new StateStore('nft-scanner-test.json');
    store.setTrackedNftCollection('pudgy');
    const scanner = new PositionScanner({ positionManager: pm, walletService: mkWallet('sol', '0xevm'), stateStore: store });

    const alerts = await scanner.scanAll();
    expect(alerts).toEqual([]);
    const nftPositions = pm.getActiveNftPositions();
    expect(nftPositions).toHaveLength(1);
    expect(nftPositions[0].id).toBe('nft:pudgy');
    expect(nftPositions[0].entryFloorEth).toBeCloseTo(1.2, 5);
  });
});
