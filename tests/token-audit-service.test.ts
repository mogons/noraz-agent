import { describe, it, expect, vi, afterEach } from 'vitest';
import { runTokenAudit } from '../src/services/token-audit-service.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const EVM_CA = '0xabc123def456abc123def456abc123def4567890';

const mkGmgnInfo = (address: string, chain: string) => ({
  code: 0,
  data: {
    address,
    symbol: 'TEST',
    name: 'Test Token',
    circulating_supply: 10000000,
    holder_count: 1234,
    creation_timestamp: 1752000000,
    price: {
      price: '0.0034',
      price_1h: '0.0029',
      volume_24h: 89100,
      buys_24h: 123,
      sells_24h: 45,
      swaps_24h: 168,
    },
    stat: {
      dev_team_hold_rate: '0.032',
      top_bundler_trader_percentage: '0.011',
      top_rat_trader_percentage: '0.004',
    },
    dev: { cto_flag: 0 },
    chain,
  },
});

const mkRugCheckReport = () => ({
  mint: SOL_MINT,
  score: 850,
  tokenType: 'spl-token',
  mintAuthority: null,
  freezeAuthority: null,
  topHolders: [{ pct: 8.2 }, { pct: 4.1 }],
  markets: [{ lp: { lpLockedPct: 85 } }],
  risks: [
    { name: 'Low Liquidity', value: '', description: '', score: 400 },
    { name: 'No Freeze', value: '', description: '', score: 0 },
  ],
});

const mkGoPlusRobinhood = () => ({
  code: 1,
  result: {
    [EVM_CA]: {
      is_honeypot: '0',
      buy_tax: '0',
      sell_tax: '0',
      is_blacklisted: '0',
      is_open_source: '1',
      holder_count: '5678',
      owner_address: '0xowner',
      is_owner_renounced: '1',
      can_take_back_ownership: '0',
      is_mintable: '0',
      is_proxy: '0',
      is_transfer_pausable: '0',
      is_paused: '0',
      is_airdrop_scam: '0',
      lp_holder_count: '89',
      liquidity: '45000',
    },
  },
});

describe('runTokenAudit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GMGN_API_KEY;
    delete process.env.GOPLUS_API_KEY;
  });

  it('returns unavailable message when no data sources respond (fail-closed, no canned numbers)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await runTokenAudit(SOL_MINT);
    expect(res.success).toBe(false);
    expect(res.content).toContain('tidak tersedia');
    expect(res.content).not.toContain('$0.0035');
  });

  it('Solana: audit lengkap — market, RugCheck risks, authority & sinyal creator', async () => {
    process.env.GMGN_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mkRugCheckReport() })               // RugCheck
      .mockResolvedValueOnce({ ok: true, json: async () => mkGmgnInfo(SOL_MINT, 'sol') }));     // GMGN token info
    const res = await runTokenAudit(SOL_MINT);
    expect(res.success).toBe(true);
    expect(res.content).toContain('(Solana)');
    expect(res.content).toContain('**Price:** $0.0034');
    expect(res.content).toContain('**MC:** $34.0k');
    expect(res.content).toContain('**Buys/Sells:** 123/45');
    expect(res.content).toContain('**Holder:** 1.2k');
    expect(res.content).toContain('**Umur:**');
    expect(res.content).toContain('RugCheck Score');
    expect(res.content).toContain('850');
    expect(res.content).toContain('Top 10 Holders');
    expect(res.content).toContain('12.3%');
    expect(res.content).toContain('LP Locked');
    expect(res.content).toContain('85%');
    expect(res.content).toContain('Mint Auth');
    expect(res.content).toContain('Freeze Auth');
    expect(res.content).toContain('Low Liquidity (400)');
    expect(res.content).toContain('Dev hold 3.2%');
    expect(res.content).toContain('Bundler 1.1%');
    expect(res.content).toContain('Rat trader 0.4%');
    expect(res.content).toContain('dexscreener.com/solana/');
    expect(res.content).toContain('rugcheck.xyz/tokens/');
  });

  it('Solana: RugCheck API error tetap menampilkan data GMGN (tidak fail total)', async () => {
    process.env.GMGN_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mkRugCheckReport() })
      .mockResolvedValueOnce({ ok: true, json: async () => mkGmgnInfo(SOL_MINT, 'sol') }));
    const res = await runTokenAudit(SOL_MINT);
    expect(res.success).toBe(true);
  });

  it('EVM: di-scan sebagai Robinhood chain — GoPlus lengkap + GMGN + link yang benar', async () => {
    process.env.GMGN_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mkGoPlusRobinhood() })              // GoPlus robinhood
      .mockResolvedValueOnce({ ok: true, json: async () => mkGmgnInfo(EVM_CA, 'robinhood') })); // GMGN robinhood
    const res = await runTokenAudit(EVM_CA);
    expect(res.success).toBe(true);
    expect(res.content).toContain('(EVM/Robinhood)');
    expect(res.content).toContain('**Price:** $0.0034');
    expect(res.content).toContain('Honeypot: Tidak');
    expect(res.content).toContain('BuyTax 0%');
    expect(res.content).toContain('SellTax 0%');
    expect(res.content).toContain('Open Source: YA');
    expect(res.content).toContain('Owner');
    expect(res.content).toContain('Renounced');
    expect(res.content).toContain('Mintable: Tidak');
    expect(res.content).toContain('Proxy: Tidak');
    expect(res.content).toContain('LP Holders 89');
    expect(res.content).toContain('Dev hold 3.2%');
    expect(res.content).toContain('dexscreener.com/robinhood/');
    expect(res.content).toContain('gopluslabs.io/token-security/4663/');
  });

  it('EVM: honeypot TETAP ditampilkan (audit on-demand tidak menyamarkan jadi null)', async () => {
    process.env.GMGN_API_KEY = 'test';
    const goPlusHoneypot = mkGoPlusRobinhood();
    goPlusHoneypot.result[EVM_CA].is_honeypot = '1';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => goPlusHoneypot })
      .mockResolvedValueOnce({ ok: true, json: async () => mkGmgnInfo(EVM_CA, 'robinhood') }));
    const res = await runTokenAudit(EVM_CA);
    expect(res.success).toBe(true);
    expect(res.content).toContain('Honeypot: ⚠️ YA');
  });

  it('EVM: keduanya gagal → pesan tidak tersedia (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await runTokenAudit(EVM_CA);
    expect(res.success).toBe(false);
    expect(res.content).toContain('tidak tersedia');
  });
});
