import { describe, it, expect, vi, afterEach } from 'vitest';
import { SolanaScreeningAgent, SolanaSignal } from '../src/agents/meme-solana/solana-screening-agent.js';
import type { GMGNRawToken } from '../src/adapters/gmgn-adapter.js';

const mkToken = (over: Partial<GMGNRawToken> = {}): GMGNRawToken => ({
  chain: 'sol', address: 'addr1', symbol: 'TEST', name: 'Test Token',
  priceUsd: 0.001, marketCapUsd: 200000, volume24hUsd: 300000, liquidityUsd: 50000,
  buys: 800, sells: 200, swaps: 1000, holderCount: 500,
  top10HolderRate: 0.1, devTeamHoldRate: 0.0, creatorClose: true, creatorTokenStatus: 'creator_close',
  smartDegenCount: 5, renownedCount: 2, bundlerRate: 0.1, ratTraderAmountRate: 0.02,
  rugRatio: 0.01, isWashTrading: false, ctoFlag: true, renouncedMint: true, renouncedFreeze: true,
  creationTimestamp: Date.now()/1000 - 6*3600, openTimestamp: Date.now()/1000 - 6*3600,
  priceChange1m: 2, priceChange5m: 5, priceChange1h: 120,
  visitingCount: 300, squareMentions: 10,
  twitterRenameCount: 0, twitterDelPostCount: 0, twitterCreateTokenCount: 1,
  buyTax: null, sellTax: null, dexscrBoostFee: 0, dexscrAd: 0, source: 'gmgn',
  ...over,
});

describe('SolanaScreeningAgent', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GMGN_API_KEY; });

  it('preFilter rejects unknown age (fail-closed)', () => {
    const agent = new SolanaScreeningAgent();
    const res = agent.preFilter(mkToken({ creationTimestamp: null }));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('fail-closed');
  });

  it('preFilter rejects young tokens', () => {
    const agent = new SolanaScreeningAgent();
    const res = agent.preFilter(mkToken({ creationTimestamp: Date.now()/1000 - 3600 }));
    expect(res.ok).toBe(false);
  });

  it('preFilter rejects wash trading & high bundler', () => {
    const agent = new SolanaScreeningAgent();
    expect(agent.preFilter(mkToken({ isWashTrading: true })).ok).toBe(false);
    expect(agent.preFilter(mkToken({ bundlerRate: 0.6 })).ok).toBe(false);
  });

  it('preFilter passes a healthy token', () => {
    const agent = new SolanaScreeningAgent();
    expect(agent.preFilter(mkToken()).ok).toBe(true);
  });

  it('detectSignal returns CTO for cto_flag token', () => {
    const agent = new SolanaScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: true }));
    expect(det.type).toBe('CTO');
    expect(det.confidence).toBeGreaterThanOrEqual(80);
  });

  it('detectSignal returns MOMENTUM for strong pump without CTO', () => {
    const agent = new SolanaScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: false, priceChange1h: 40, priceChange5m: 3 }));
    expect(det.type).toBe('MOMENTUM');
  });

  it('detectSignal disables CTO on dexscreener source', () => {
    const agent = new SolanaScreeningAgent();
    const det = agent.detectSignal(mkToken({ ctoFlag: true, source: 'dexscreener' }));
    expect(det.type).not.toBe('CTO');
  });

  it('runScreeningPass returns [] without network', async () => {
    process.env.GMGN_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const agent = new SolanaScreeningAgent();
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
  });
});
