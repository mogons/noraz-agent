import { describe, it, expect } from 'vitest';
import { securityGateToken, tokenSecurityLabel, securityAuditGate, tokenSecurityAuditLabel, buildTrackAccumulation, trackAccumulationLabel } from '../src/agents/shared/gmgn-meme-helpers.js';
import type { GMGNRawToken, GMGNSecurityAudit, GMGNTrackTrade } from '../src/adapters/gmgn-adapter.js';

const mkAudit = (over: Partial<GMGNSecurityAudit> = {}): GMGNSecurityAudit => ({
  chain: 'sol', address: 'tok1',
  isHoneypot: false, isBlacklist: false, isRenounced: true,
  renouncedMint: false, renouncedFreeze: false, canNotSell: false,
  buyTaxPct: 0, sellTaxPct: 0, averageTaxPct: 0, highTaxPct: 0,
  isOpenSource: true, burnRatioPct: 0, isLocked: false, isShowAlert: false, flags: [],
  ...over,
});

const mkToken = (over: Partial<GMGNRawToken> = {}): GMGNRawToken => ({
  chain: 'sol', address: 'addr1', symbol: 'TEST', name: 'Test Token',
  priceUsd: 0.001, marketCapUsd: 200000, volume24hUsd: 300000, volume1hUsd: 30000, liquidityUsd: 50000,
  buys: 800, sells: 200, swaps: 1000, holderCount: 500,
  top10HolderRate: null, devTeamHoldRate: null, creatorClose: true, creatorTokenStatus: 'creator_close',
  smartDegenCount: 5, renownedCount: 2, bundlerRate: null, ratTraderAmountRate: null,
  rugRatio: null, isWashTrading: false, ctoFlag: true, renouncedMint: true, renouncedFreeze: true,
  creationTimestamp: Date.now() / 1000 - 6 * 3600, openTimestamp: Date.now() / 1000 - 6 * 3600,
  priceChange1m: 2, priceChange5m: 5, priceChange1h: 120,
  visitingCount: 300, squareMentions: 10,
  twitterRenameCount: 0, twitterDelPostCount: 0, twitterCreateTokenCount: 1,
  buyTax: null, sellTax: null, dexscrBoostFee: 0, dexscrAd: 0, totalFeeNative: 50, source: 'gmgn',
  exchange: 'pump_amm', launchpadPlatform: 'Pump.fun', launchpadStatus: '1', progress: 1,
  isHoneypot: null,
  ...over,
});

describe('securityGateToken — gate keamanan GMGN (meme & LP shared)', () => {
  it('token bersih dengan semua field null → lolos', () => {
    expect(securityGateToken(mkToken()).ok).toBe(true);
  });

  it('honeypot → tolak', () => {
    const r = securityGateToken(mkToken({ isHoneypot: true }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('honeypot');
  });

  it('wash trading → tolak', () => {
    expect(securityGateToken(mkToken({ isWashTrading: true })).ok).toBe(false);
  });

  it('buy tax > 10% → tolak', () => {
    const r = securityGateToken(mkToken({ buyTax: '12' }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('buy tax 12%');
  });

  it('sell tax > 10% → tolak', () => {
    expect(securityGateToken(mkToken({ sellTax: '15' })).ok).toBe(false);
  });

  it('tax <= 10% → lolos', () => {
    expect(securityGateToken(mkToken({ buyTax: '10', sellTax: '5' })).ok).toBe(true);
  });

  it('enableTaxGate: false → tax besar lolos (mode LP)', () => {
    const r = securityGateToken(mkToken({ buyTax: '30', sellTax: '25' }), { enableTaxGate: false });
    expect(r.ok).toBe(true);
  });

  it('enableTaxGate: false tetap menolak field berbahaya lain (rug)', () => {
    const r = securityGateToken(mkToken({ sellTax: '25', rugRatio: 0.5 }), { enableTaxGate: false });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('rug');
    expect(r.reasons.join(' ')).not.toContain('tax');
  });

  it('rug ratio >= 0.3 → tolak (0.29 lolos)', () => {
    expect(securityGateToken(mkToken({ rugRatio: 0.3 })).ok).toBe(false);
    expect(securityGateToken(mkToken({ rugRatio: 0.29 })).ok).toBe(true);
  });

  it('insider >= 0.3 → tolak', () => {
    expect(securityGateToken(mkToken({ ratTraderAmountRate: 0.3 })).ok).toBe(false);
  });

  it('bundler tinggi → LOLOS (filter bundler dihapus — token alpha sering bundler tinggi)', () => {
    expect(securityGateToken(mkToken({ bundlerRate: 0.9 })).ok).toBe(true);
  });

  it('top-10 holder >= 0.4 → tolak', () => {
    expect(securityGateToken(mkToken({ top10HolderRate: 0.4 })).ok).toBe(false);
  });

  it('semua field berbahaya sekaligus → semua alasan tercantum', () => {
    const r = securityGateToken(mkToken({ rugRatio: 0.5, bundlerRate: 0.6, ratTraderAmountRate: 0.4, top10HolderRate: 0.5 }));
    expect(r.ok).toBe(false);
    expect(r.reasons.length).toBe(3); // bundler tidak lagi digate
  });

  it('opsi ambang kustom dapat diperketat', () => {
    expect(securityGateToken(mkToken({ rugRatio: 0.2 }), { maxRugRatio: 0.15 }).ok).toBe(false);
  });
});

describe('securityAuditGate — audit GMGN /v1/token/security (FAIL-CLOSED)', () => {
  it('audit null/tidak tersedia → TOLAK (tidak bisa diverifikasi)', () => {
    const r = securityAuditGate(null);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('fail-closed');
  });

  it('token aman → lolos', () => {
    expect(securityAuditGate(mkAudit()).ok).toBe(true);
  });

  it('honeypot → tolak', () => {
    const r = securityAuditGate(mkAudit({ isHoneypot: true }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('honeypot');
  });

  it('blacklist → tolak', () => {
    expect(securityAuditGate(mkAudit({ isBlacklist: true })).ok).toBe(false);
  });

  it('tidak bisa dijual (canNotSell/sell-locked) → tolak', () => {
    const r = securityAuditGate(mkAudit({ canNotSell: true }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('dijual');
  });

  it('tax tinggi (> 10%) → tolak saat enableTaxGate', () => {
    expect(securityAuditGate(mkAudit({ sellTaxPct: 15 })).ok).toBe(false);
    expect(securityAuditGate(mkAudit({ highTaxPct: 12 })).ok).toBe(false);
    expect(securityAuditGate(mkAudit({ averageTaxPct: 5, sellTaxPct: 3 })).ok).toBe(true);
  });

  it('enableTaxGate: false → tax besar lolos (mode LP), honeypot tetap tolak', () => {
    const taxOk = securityAuditGate(mkAudit({ sellTaxPct: 25 }), { enableTaxGate: false });
    expect(taxOk.ok).toBe(true);
    const hp = securityAuditGate(mkAudit({ isHoneypot: true, sellTaxPct: 25 }), { enableTaxGate: false });
    expect(hp.ok).toBe(false);
  });

  it('tokenSecurityAuditLabel: hanya field yang tersedia yang ditampilkan', () => {
    expect(tokenSecurityAuditLabel(mkAudit({ isRenounced: true, averageTaxPct: 1.2, isLocked: true }))).toContain('Renounced');
    expect(tokenSecurityAuditLabel(mkAudit({ isRenounced: true, averageTaxPct: 1.2, isLocked: true }))).toContain('Locked');
    expect(tokenSecurityAuditLabel(null)).toContain('Tidak teraudit');
  });
});

describe('buildTrackAccumulation — akumulasi trade feed smart money', () => {
  const now = Math.floor(Date.now() / 1000);
  const mkTrade = (over: Partial<GMGNTrackTrade> = {}): GMGNTrackTrade => ({
    tokenAddress: 'tok1', tokenSymbol: 'TOK1', side: 'buy', amountUsd: 5000,
    isFullClose: false, maker: '0xw1', makerTags: ['smart_degen'],
    timestamp: now - 300, kind: 'smartmoney', ...over,
  });

  it('agregat buy per wallet (dedupe maker) + total USD + fresh timestamp', () => {
    const acc = buildTrackAccumulation([
      mkTrade({ maker: '0xw1', amountUsd: 5000 }),
      mkTrade({ maker: '0xw1', amountUsd: 3000 }), // maker sama → 1 wallet
      mkTrade({ maker: '0xw2', amountUsd: 9000 }),
      mkTrade({ side: 'sell', maker: '0xw3', amountUsd: 2000 }),
    ]);
    const a = acc.get('tok1')!;
    expect(a.buyWalletCount).toBe(2);
    expect(a.totalBuyUsd).toBe(17000);
    expect(a.sellWalletCount).toBe(1);
    expect(a.totalSellUsd).toBe(2000);
  });

  it('full-close terdeteksi: wallet unik + total USD + timestamp terbaru', () => {
    const acc = buildTrackAccumulation([
      mkTrade({ side: 'sell', isFullClose: true, maker: '0xw1', amountUsd: 12_000, timestamp: now - 600 }),
      mkTrade({ side: 'sell', isFullClose: true, maker: '0xw2', amountUsd: 11_000, timestamp: now - 1200 }),
      mkTrade({ side: 'sell', isFullClose: true, maker: '0xw1', amountUsd: 5000, timestamp: now - 300 }), // wallet sama
      mkTrade({ side: 'sell', isFullClose: false, maker: '0xw3', amountUsd: 9000, timestamp: now - 100 }), // bukan full-close
    ]);
    const a = acc.get('tok1')!;
    expect(a.fullCloseWallets.size).toBe(2);
    expect(a.fullCloseCount).toBe(3);
    expect(a.fullCloseTotalUsd).toBe(28_000);
    expect(a.lastFullCloseAt).toBe(now - 300);
  });

  it('trackAccumulationLabel: ringkas untuk card', () => {
    const acc = buildTrackAccumulation([
      mkTrade({ maker: '0xw1', amountUsd: 12_000, timestamp: now - 1200 }),
      mkTrade({ maker: '0xw2', amountUsd: 18_000, timestamp: now - 1200 }),
    ]);
    const label = trackAccumulationLabel(acc.get('tok1')!, now * 1000);
    expect(label).toContain('2 wallet beli');
    expect(label).toContain('$30.0k');
  });
});

describe('tokenSecurityLabel — label keamanan untuk card LP', () => {
  it('hanya field yang dilaporkan yang ditampilkan', () => {
    const label = tokenSecurityLabel(mkToken({ top10HolderRate: 0.15, bundlerRate: 0.02 }));
    expect(label).toBe('✅ GMGN audited — Top10 15.0% • Bundler 2.0%');
  });

  it('tanpa data → label polos audited', () => {
    expect(tokenSecurityLabel(mkToken())).toBe('✅ GMGN audited');
  });

  it('menampilkan dev & insider', () => {
    const label = tokenSecurityLabel(mkToken({ devTeamHoldRate: 0.01, ratTraderAmountRate: 0.05 }));
    expect(label).toContain('Dev 1.0%');
    expect(label).toContain('Insider 5.0%');
  });
});
