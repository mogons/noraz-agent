import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PositionManager, OpenPosition } from '../src/position/position-manager.js';
import { StateStore } from '../src/services/state-store.js';
import { WalletTracker } from '../src/services/wallet-tracker.js';
import { GMGNAdapter, GMGNRawToken } from '../src/adapters/gmgn-adapter.js';
import { WalletService } from '../src/services/wallet-service.js';
import { Connection } from '@solana/web3.js';

const dbPaths: string[] = [];
const stores: StateStore[] = [];

function newStore(): StateStore {
  const p = path.join(process.cwd(), 'database', `test_wallet_tracker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`);
  dbPaths.push(p);
  const s = new StateStore(p);
  stores.push(s);
  return s;
}

afterAll(() => {
  for (const s of stores) {
    try { s.flushToDisk(); } catch { /* ignore */ }
  }
  for (const p of dbPaths) {
    for (const f of [p, `${p}.tmp`]) {
      try { fs.unlinkSync(f); } catch { /* already gone */ }
    }
  }
});

const SOL_OWNER = '11111111111111111111111111111111';
const EVM_OWNER = '0x1111111111111111111111111111111111111111';
const EVM_ADDR = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function makeWalletService(overrides: Partial<WalletService> = {}): WalletService {
  return {
    hasWallet: vi.fn(() => true),
    getSolanaAddress: vi.fn(() => SOL_OWNER),
    getEvmAddress: vi.fn(() => EVM_OWNER),
    ...overrides,
  } as unknown as WalletService;
}

function makeGmgn(token: GMGNRawToken | null = null): GMGNAdapter {
  return { fetchTokenInfo: vi.fn(async () => token) } as unknown as GMGNAdapter;
}

const mkTrackTrade = (over: Partial<import('../src/adapters/gmgn-adapter.js').GMGNTrackTrade> = {}) => ({
  tokenAddress: 'mintx',
  tokenSymbol: 'TOKX',
  side: 'buy' as const,
  amountUsd: 5000,
  isFullClose: false,
  maker: '0xwallet1',
  makerTags: ['smart_degen'],
  timestamp: Math.floor(Date.now() / 1000) - 300,
  kind: 'smartmoney' as const,
  ...over,
});

function makeExitGmgn(trades: import('../src/adapters/gmgn-adapter.js').GMGNTrackTrade[] = []): GMGNAdapter {
  return {
    fetchTokenInfo: vi.fn(async () => sampleToken),
    fetchTrackTrades: vi.fn(async (_chain: string) => trades),
  } as unknown as GMGNAdapter;
}

function makeConnection(accounts: unknown[] = [], fail: boolean = false): Connection {
  return {
    getTokenAccountsByOwner: vi.fn(
      fail
        ? () => Promise.reject(new Error('RPC down'))
        : () => Promise.resolve({ value: accounts })
    ),
  } as unknown as Connection;
}

function makeTracker(opts: {
  positionManager: PositionManager;
  gmgn?: GMGNAdapter;
  walletService?: WalletService;
  solanaConnection?: Connection;
  stateStore?: StateStore;
  evmBalanceReader?: (chain: string, token: string, owner: string) => Promise<bigint | null>;
}): WalletTracker {
  return new WalletTracker(opts);
}

const sampleToken: GMGNRawToken = {
  chain: 'sol',
  address: 'MINTX',
  symbol: 'TOKX',
  name: 'Token X',
  priceUsd: 0.5,
  marketCapUsd: 100000,
  volume24hUsd: 60000,
  liquidityUsd: 30000,
  buys: 100,
  sells: 50,
  swaps: 150,
  holderCount: 1000,
  top10HolderRate: null,
  devTeamHoldRate: null,
  creatorClose: false,
  creatorTokenStatus: null,
  smartDegenCount: 7,
  renownedCount: 0,
  bundlerRate: null,
  ratTraderAmountRate: null,
  rugRatio: null,
  isWashTrading: false,
  ctoFlag: false,
  renouncedMint: false,
  renouncedFreeze: false,
  creationTimestamp: null,
  openTimestamp: null,
  priceChange1m: null,
  priceChange5m: null,
  priceChange1h: null,
  visitingCount: 0,
  squareMentions: 0,
  twitterRenameCount: 0,
  twitterDelPostCount: 0,
  twitterCreateTokenCount: 0,
  buyTax: null,
  sellTax: null,
  dexscrBoostFee: 0,
  dexscrAd: 0,
  totalFeeNative: null,
  source: 'gmgn',
};

describe('WalletTracker.scanSolanaHoldings', () => {
  it('returns holdings with mint + raw amount for tokens with balance > 0', async () => {
    const tracker = makeTracker({
      positionManager: new PositionManager(),
      walletService: makeWalletService(),
      solanaConnection: makeConnection([
        { account: { data: { parsed: { info: { mint: 'MINT1', tokenAmount: { uiAmount: 1000, amount: '1000' } } } } } },
        { account: { data: { parsed: { info: { mint: 'MINT2', tokenAmount: { uiAmount: 0, amount: '0' } } } } } },
        { account: { data: { parsed: { info: { mint: 'MINT3', tokenAmount: { uiAmount: 2.5, amount: '2500000000' } } } } } },
      ]),
    });
    const holdings = await tracker.scanSolanaHoldings();
    expect(holdings).toEqual([
      { mint: 'MINT1', amount: 1000 },
      { mint: 'MINT3', amount: 2500000000 },
    ]);
  });

  it('fails closed to [] when the RPC call throws', async () => {
    const tracker = makeTracker({
      positionManager: new PositionManager(),
      walletService: makeWalletService(),
      solanaConnection: makeConnection([], true),
    });
    expect(await tracker.scanSolanaHoldings()).toEqual([]);
  });

  it('fails closed to [] when no solana wallet is configured', async () => {
    const tracker = makeTracker({
      positionManager: new PositionManager(),
      walletService: makeWalletService({ hasWallet: vi.fn(() => false) }),
      solanaConnection: makeConnection([
        { account: { data: { parsed: { info: { mint: 'MINT1', tokenAmount: { uiAmount: 1000, amount: '1000' } } } } } },
      ]),
    });
    expect(await tracker.scanSolanaHoldings()).toEqual([]);
  });
});

describe('WalletTracker.scanEvmHoldings', () => {
  it('returns tracked robinhood tokens with balance > 0, excludes zero-balance and non-evm chains', async () => {
    const store = newStore();
    store.setTrackedToken({ chain: 'robinhood', address: 'TOK1', symbol: 'ONE', addedAt: 1 });
    store.setTrackedToken({ chain: 'robinhood', address: 'TOK2', symbol: 'TWO', addedAt: 2 });
    store.setTrackedToken({ chain: 'sol', address: 'SOLTOK', symbol: 'SOL', addedAt: 3 });
    const tracker = makeTracker({
      positionManager: new PositionManager(),
      stateStore: store,
      walletService: makeWalletService(),
      evmBalanceReader: async (_chain, token) => (token === 'TOK1' ? 1000n : 0n),
    });
    expect(await tracker.scanEvmHoldings()).toEqual([{ address: 'TOK1' }]);
  });

  it('fails closed to [] when the balance reader reports a failed read (null)', async () => {
    const store = newStore();
    store.setTrackedToken({ chain: 'robinhood', address: 'TOK1', symbol: 'ONE', addedAt: 1 });
    const tracker = makeTracker({
      positionManager: new PositionManager(),
      stateStore: store,
      walletService: makeWalletService(),
      evmBalanceReader: async () => null,
    });
    expect(await tracker.scanEvmHoldings()).toEqual([]);
  });
});

describe('WalletTracker.syncPositions', () => {
  it('adds a new position when a held token is not yet tracked', async () => {
    const pm = new PositionManager();
    const store = newStore();
    const gmgn = makeGmgn({ ...sampleToken, address: 'MINTX', symbol: 'TOKX', priceUsd: 0.5, volume24hUsd: 60000, smartDegenCount: 7 });
    const tracker = makeTracker({
      positionManager: pm,
      stateStore: store,
      gmgn,
      walletService: makeWalletService(),
      solanaConnection: makeConnection([
        { account: { data: { parsed: { info: { mint: 'MINTX', tokenAmount: { uiAmount: 1000, amount: '1000' } } } } } },
      ]),
    });
    const alerts = await tracker.syncPositions();
    expect(alerts).toEqual([]);
    const positions = pm.getActivePositions();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      id: 'MINTX',
      symbol: 'TOKX',
      contractAddress: 'MINTX',
      entryPriceUsd: 0.5,
      currentPriceUsd: 0.5,
      amount: 1000,
      highWaterMarkUsd: 0.5,
      initialVolume4hUsd: 10000,
      initialSmartMoneyCount: 7,
    });
  });

  it('skips adding when token info fetch fails (fail-closed)', async () => {
    const pm = new PositionManager();
    const gmgn = makeGmgn(null);
    const tracker = makeTracker({
      positionManager: pm,
      gmgn,
      walletService: makeWalletService(),
      solanaConnection: makeConnection([
        { account: { data: { parsed: { info: { mint: 'MINTX', tokenAmount: { uiAmount: 1000, amount: '1000' } } } } } },
      ]),
    });
    await tracker.syncPositions();
    expect(pm.getActivePositions()).toHaveLength(0);
  });

  it('updates an existing position and returns a WARNING alert on volume dry-up', async () => {
    const pm = new PositionManager();
    pm.addPosition({
      id: 'MINTX',
      symbol: 'TOKX',
      contractAddress: 'MINTX',
      entryPriceUsd: 1.0,
      currentPriceUsd: 1.0,
      amount: 1000,
      highWaterMarkUsd: 1.0,
      initialVolume4hUsd: 10000,
      initialSmartMoneyCount: 10,
    });
    const gmgn = makeGmgn({ ...sampleToken, address: 'MINTX', symbol: 'TOKX', priceUsd: 1.0, volume24hUsd: 10000, smartDegenCount: 10 });
    const tracker = makeTracker({
      positionManager: pm,
      gmgn,
      walletService: makeWalletService(),
      solanaConnection: makeConnection([
        { account: { data: { parsed: { info: { mint: 'MINTX', tokenAmount: { uiAmount: 1000, amount: '1000' } } } } } },
      ]),
    });
    const alerts = await tracker.syncPositions();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('WARNING');
    expect(alerts[0].reason).toContain('Volume Dry-up');
    expect(pm.getActivePositions()).toHaveLength(1);
  });

  it('auto-closes active positions that are no longer held', async () => {
    const pm = new PositionManager();
    pm.addPosition({
      id: 'GONETOK',
      symbol: 'GONE',
      contractAddress: 'GONETOK',
      entryPriceUsd: 1.0,
      currentPriceUsd: 1.0,
      amount: 100,
      highWaterMarkUsd: 1.0,
    });
    const tracker = makeTracker({
      positionManager: pm,
      gmgn: makeGmgn(null),
      walletService: makeWalletService(),
      solanaConnection: makeConnection([]),
    });
    const alerts = await tracker.syncPositions();
    expect(alerts).toEqual([]);
    expect(pm.getActivePositions()).toHaveLength(0);
  });

  it('does NOT auto-close when the solana scan could not run (no wallet)', async () => {
    const pm = new PositionManager();
    pm.addPosition({
      id: 'SAFE',
      symbol: 'SAFE',
      contractAddress: 'SAFE',
      entryPriceUsd: 1.0,
      currentPriceUsd: 1.0,
      amount: 100,
      highWaterMarkUsd: 1.0,
    });
    const tracker = makeTracker({
      positionManager: pm,
      gmgn: makeGmgn(null),
      walletService: makeWalletService({ hasWallet: vi.fn(() => false) }),
      solanaConnection: makeConnection([]),
    });
    await tracker.syncPositions();
    expect(pm.getActivePositions()).toHaveLength(1);
  });

  it('does NOT auto-close an EVM position when its balance read fails (null)', async () => {
    const pm = new PositionManager();
    const store = newStore();
    store.setTrackedToken({ chain: 'robinhood', address: EVM_ADDR, symbol: 'EVMTK', addedAt: 1 });
    pm.addPosition({
      id: EVM_ADDR,
      symbol: 'EVMTK',
      contractAddress: EVM_ADDR,
      entryPriceUsd: 1.0,
      currentPriceUsd: 1.0,
      amount: 100,
      highWaterMarkUsd: 1.0,
    });
    const tracker = makeTracker({
      positionManager: pm,
      stateStore: store,
      gmgn: makeGmgn(null),
      walletService: makeWalletService(),
      solanaConnection: makeConnection([]),
      evmBalanceReader: async () => null,
    });
    await tracker.syncPositions();
    expect(pm.getActivePositions()).toHaveLength(1);
  });

  it('auto-closes an EVM position only when a successful scan shows zero balance', async () => {
    const pm = new PositionManager();
    const store = newStore();
    store.setTrackedToken({ chain: 'robinhood', address: EVM_ADDR, symbol: 'EVMTK', addedAt: 1 });
    pm.addPosition({
      id: EVM_ADDR,
      symbol: 'EVMTK',
      contractAddress: EVM_ADDR,
      entryPriceUsd: 1.0,
      currentPriceUsd: 1.0,
      amount: 100,
      highWaterMarkUsd: 1.0,
    });
    const tracker = makeTracker({
      positionManager: pm,
      stateStore: store,
      gmgn: makeGmgn(null),
      walletService: makeWalletService(),
      solanaConnection: makeConnection([]),
      evmBalanceReader: async () => 0n,
    });
    await tracker.syncPositions();
    expect(pm.getActivePositions()).toHaveLength(0);
  });

  it('dedupes holdings by address across chains', async () => {
    const pm = new PositionManager();
    const tracker = makeTracker({
      positionManager: pm,
      gmgn: makeGmgn({ ...sampleToken, address: 'DUP', symbol: 'DUP' }),
      walletService: makeWalletService(),
      solanaConnection: makeConnection([
        { account: { data: { parsed: { info: { mint: 'DUP', tokenAmount: { uiAmount: 1000, amount: '1000' } } } } } },
      ]),
    });
    const alerts = await tracker.syncPositions();
    expect(alerts).toEqual([]);
    expect(pm.getActivePositions()).toHaveLength(1);
    expect(pm.getActivePositions()[0].id).toBe('DUP');
  });
});

describe('WalletTracker.checkSmartMoneyExit — alert posisi', () => {
  it('ada posisi + >= 2 smart wallet full-close >= $20k dalam 2 jam → alert', async () => {
    const pm = new PositionManager();
    pm.addPosition({
      id: 'MINTX', symbol: 'TOKX', contractAddress: 'MINTX',
      entryPriceUsd: 0.5, currentPriceUsd: 0.4, amount: 1000, highWaterMarkUsd: 0.9,
    });
    const now = Math.floor(Date.now() / 1000);
    const gmgn = makeExitGmgn([
      mkTrackTrade({ side: 'sell', amountUsd: 12_000, isFullClose: true, maker: '0xw1', timestamp: now - 600 }),
      mkTrackTrade({ side: 'sell', amountUsd: 11_000, isFullClose: true, maker: '0xw2', timestamp: now - 1200 }),
      mkTrackTrade({ side: 'buy', amountUsd: 30_000, isFullClose: false, maker: '0xw3', timestamp: now - 3000 }),
    ]);
    const tracker = makeTracker({
      positionManager: pm,
      gmgn,
      walletService: makeWalletService(),
      solanaConnection: makeConnection([]),
      stateStore: newStore(),
    });
    const alerts = await tracker.checkSmartMoneyExit(pm.getActivePositions());
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('sm-exit');
    expect(alerts[0].address).toBe('mintx'); // lowercase — konsisten dengan dedupe alert
    expect(alerts[0].reason).toContain('2 smart wallet full-close');
    expect(alerts[0].reason).toContain('$23.0k');
  });

  it('tanpa posisi → TIDAK ada alert (sinyal exit tidak pernah jadi call)', async () => {
    const pm = new PositionManager();
    const now = Math.floor(Date.now() / 1000);
    const gmgn = makeExitGmgn([
      mkTrackTrade({ side: 'sell', amountUsd: 50_000, isFullClose: true, maker: '0xw1', timestamp: now - 600 }),
      mkTrackTrade({ side: 'sell', amountUsd: 50_000, isFullClose: true, maker: '0xw2', timestamp: now - 1200 }),
    ]);
    const tracker = makeTracker({
      positionManager: pm,
      gmgn,
      walletService: makeWalletService(),
      solanaConnection: makeConnection([]),
      stateStore: newStore(),
    });
    const alerts = await tracker.checkSmartMoneyExit(pm.getActivePositions());
    expect(alerts).toHaveLength(0);
  });

  it('posisi ada tapi ambang di bawah (1 wallet / < $20k / > 2 jam) → TIDAK ada alert', async () => {
    const pm = new PositionManager();
    pm.addPosition({
      id: 'MINTX', symbol: 'TOKX', contractAddress: 'MINTX',
      entryPriceUsd: 0.5, currentPriceUsd: 0.4, amount: 1000, highWaterMarkUsd: 0.9,
    });
    const now = Math.floor(Date.now() / 1000);
    const cases: Array<import('../src/adapters/gmgn-adapter.js').GMGNTrackTrade[]> = [
      [mkTrackTrade({ side: 'sell', amountUsd: 25_000, isFullClose: true, maker: '0xw1', timestamp: now - 600 })], // 1 wallet saja
      [
        mkTrackTrade({ side: 'sell', amountUsd: 9_000, isFullClose: true, maker: '0xw1', timestamp: now - 600 }),
        mkTrackTrade({ side: 'sell', amountUsd: 9_000, isFullClose: true, maker: '0xw2', timestamp: now - 1200 }),
      ], // total $18k < $20k
      [
        mkTrackTrade({ side: 'sell', amountUsd: 25_000, isFullClose: true, maker: '0xw1', timestamp: now - 3 * 3600 }),
        mkTrackTrade({ side: 'sell', amountUsd: 25_000, isFullClose: true, maker: '0xw2', timestamp: now - 3 * 3600 }),
      ], // > 2 jam lalu
    ];
    for (const trades of cases) {
      const tracker = makeTracker({
        positionManager: pm,
        gmgn: makeExitGmgn(trades),
        walletService: makeWalletService(),
        solanaConnection: makeConnection([]),
        stateStore: newStore(),
      });
      const alerts = await tracker.checkSmartMoneyExit(pm.getActivePositions());
      expect(alerts, JSON.stringify(trades.map((t) => [t.amountUsd, t.isFullClose, t.timestamp]))).toHaveLength(0);
    }
  });

  it('track feed gagal/error → fail-open tanpa alert', async () => {
    const pm = new PositionManager();
    pm.addPosition({
      id: 'MINTX', symbol: 'TOKX', contractAddress: 'MINTX',
      entryPriceUsd: 0.5, currentPriceUsd: 0.4, amount: 1000, highWaterMarkUsd: 0.9,
    });
    const gmgn = { fetchTrackTrades: vi.fn(async () => { throw new Error('rate limited'); }) } as unknown as GMGNAdapter;
    const tracker = makeTracker({
      positionManager: pm,
      gmgn,
      walletService: makeWalletService(),
      solanaConnection: makeConnection([]),
      stateStore: newStore(),
    });
    const alerts = await tracker.checkSmartMoneyExit(pm.getActivePositions());
    expect(alerts).toHaveLength(0);
  });
});

describe('WalletTracker.registerTrackedToken', () => {
  it('persists tracked tokens via the StateStore', () => {
    const store = newStore();
    const tracker = makeTracker({ positionManager: new PositionManager(), stateStore: store });
    tracker.registerTrackedToken('sol', 'AAA111', 'SOLTOK');
    const tokens = store.getTrackedTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ chain: 'sol', address: 'AAA111', symbol: 'SOLTOK' });
    expect(typeof tokens[0].addedAt).toBe('number');
  });
});
