import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { WalletService } from '../src/services/wallet-service.js';

describe('WalletService', () => {
  beforeEach(() => {
    process.env.DRY_RUN = 'false';
    process.env.EVM_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DRY_RUN;
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SIMULATION_BALANCE_ETH;
    delete process.env.EVM_ROBINHOOD_RPC_URL;
  });

  it('derives the robinhood EVM address from the configured key', () => {
    const svc = new WalletService();
    expect(svc.hasWallet('evm')).toBe(true);
    expect(svc.getEvmAddress()).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('returns simulated labeled balance in DRY_RUN mode', async () => {
    process.env.DRY_RUN = 'true';
    process.env.SIMULATION_BALANCE_ETH = '2.5';
    const svc = new WalletService();
    const bal = await svc.getEvmBalance(4663);
    expect(bal).not.toBeNull();
    expect(bal!.balance).toBe(2.5);
    expect(bal!.symbol).toBe('ETH');
    expect(bal!.chain).toBe('Robinhood Chain');
    expect(bal!.simulated).toBe(true);
  });

  it('returns null (fail-closed) for unsupported chain ids in live mode', async () => {
    const svc = new WalletService();
    expect(await svc.getEvmBalance(8453)).toBeNull();
  });

  it('returns a simulated tx hash and blockscout explorer URL in DRY_RUN mode', async () => {
    process.env.DRY_RUN = 'true';
    const svc = new WalletService();
    const res = await svc.sendEvm(4663, '0x1111111111111111111111111111111111111111', 0.01);
    expect(res.txHash).toMatch(/^0xsim_evm_send_4663_/);
    expect(res.explorerUrl).toContain('robinhoodchain.blockscout.com');
  });
});
