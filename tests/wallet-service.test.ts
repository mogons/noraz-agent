import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { WalletService } from '../src/services/wallet-service.js';

describe('WalletService', () => {
  beforeEach(() => {
    process.env.DRY_RUN = 'false';
    process.env.SOLANA_PRIVATE_KEY = '[]';
    process.env.EVM_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DRY_RUN;
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.EVM_PRIVATE_KEY;
  });

  it('does not fabricate Hyperliquid balance in live mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ marginSummary: { accountValue: '2500.5' } }),
    }));
    const svc = new WalletService();
    const hl = await svc.getHyperliquidBalance();
    expect(hl).not.toBeNull();
    expect(hl!.balance).toBe(2500.5);
    expect(hl!.simulated).toBeFalsy();
  });

  it('returns simulated labeled balance in DRY_RUN mode', async () => {
    process.env.DRY_RUN = 'true';
    process.env.SIMULATION_BALANCE_HYPERLIQUID = '1000.0';
    const svc = new WalletService();
    const hl = await svc.getHyperliquidBalance();
    expect(hl).not.toBeNull();
    expect(hl!.balance).toBe(1000.0);
    expect(hl!.simulated).toBe(true);
  });
});
