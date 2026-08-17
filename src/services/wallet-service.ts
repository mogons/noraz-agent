import { createWalletClient, createPublicClient, http, parseEther, formatEther, type WalletClient, type PublicClient, type Chain, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { robinhood } from 'viem/chains';

import { StateStore } from './state-store.js';
import { isDryRun as isDryRunMode } from '../config/config.js';
import { globalRPCFailoverManager } from './rpc-failover.js';

export interface BalanceResult {
  balance: number;
  symbol: string;
  chain: string;
  usdValue?: number;
  simulated?: boolean;
}

/** Robinhood Chain configuration */
const EVM_CHAINS: Record<number, { chain: Chain; rpcEnvKey: string; explorerBase: string }> = {
  4663: { chain: robinhood, rpcEnvKey: 'EVM_ROBINHOOD_RPC_URL', explorerBase: 'https://robinhoodchain.blockscout.com/tx/' },
};

/**
 * WalletService manages the EVM private key for OpenCat's direct on-chain execution on Robinhood Chain.
 * If DRY_RUN is true (default), keys are used to simulate execution without signing broadcasted transactions.
 * Keys are persisted safely to local StateStore (database/opencat_state.json) so they survive bot updates & process reboots.
 */
export class WalletService {
  private evmPrivateKey: string | null = null;
  private stateStore: StateStore | null = null;

  constructor() {
    // Load from environment at startup
    const evmKey = process.env.EVM_PRIVATE_KEY;

    if (evmKey && evmKey.length > 0) {
      this.evmPrivateKey = evmKey;
      console.log('[WALLET SERVICE] EVM private key loaded from environment.');
    }
  }

  /** Attach persistent StateStore to retain wallet keys across bot reboots & updates */
  public attachStateStore(store: StateStore): void {
    this.stateStore = store;
    const persistedKeys = store.getWalletKeys();

    if (!this.evmPrivateKey && persistedKeys.evmPrivateKey) {
      this.evmPrivateKey = persistedKeys.evmPrivateKey;
      console.log('[WALLET SERVICE] Restored EVM private key from persistent StateStore.');
    }
  }

  /** Store a private key at runtime (from /wallet setup modal or TUI) and persist to StateStore */
  public setKey(chain: 'evm', privateKey: string): void {
    const trimmed = privateKey.trim();
    this.evmPrivateKey = trimmed;
    console.log('[WALLET SERVICE] EVM private key set at runtime.');

    if (this.stateStore) {
      this.stateStore.setWalletKey(chain, trimmed);
    }
  }

  /** Remove a stored private key from memory and persistent disk */
  public removeKey(chain: 'evm'): void {
    this.evmPrivateKey = null;
    console.log('[WALLET SERVICE] EVM private key removed.');

    if (this.stateStore) {
      this.stateStore.removeWalletKey(chain);
    }
  }

  /** Check if the EVM wallet is configured */
  public hasWallet(chain: 'evm'): boolean {
    return this.evmPrivateKey !== null;
  }

  // ─── EVM ─────────────────────────────────────────────────────────────

  /** Get viem Account from stored private key */
  public getEvmAccount(): Account {
    if (!this.evmPrivateKey) {
      throw new Error('EVM private key not configured. Use /wallet setup or set EVM_PRIVATE_KEY in .env');
    }
    const key = this.evmPrivateKey.startsWith('0x') ? this.evmPrivateKey : `0x${this.evmPrivateKey}`;
    return privateKeyToAccount(key as `0x${string}`);
  }

  /** Get EVM wallet address */
  public getEvmAddress(): string {
    return this.getEvmAccount().address;
  }

  /** Get viem WalletClient for Robinhood Chain */
  public getEvmWalletClient(chainId: number): WalletClient {
    const chainConfig = EVM_CHAINS[chainId];
    if (!chainConfig) throw new Error(`Unsupported EVM chain ID: ${chainId}`);

    const rpcUrl = globalRPCFailoverManager.getActiveRPC('evm') || process.env[chainConfig.rpcEnvKey] || 'https://rpc.mainnet.chain.robinhood.com';
    const account = this.getEvmAccount();

    return createWalletClient({
      account,
      chain: chainConfig.chain,
      transport: http(rpcUrl),
    });
  }

  /** Get viem PublicClient for reading chain state */
  public getEvmPublicClient(chainId: number): PublicClient {
    const chainConfig = EVM_CHAINS[chainId];
    if (!chainConfig) throw new Error(`Unsupported EVM chain ID: ${chainId}`);

    const rpcUrl = globalRPCFailoverManager.getActiveRPC('evm') || process.env[chainConfig.rpcEnvKey] || 'https://rpc.mainnet.chain.robinhood.com';

    return createPublicClient({
      chain: chainConfig.chain,
      transport: http(rpcUrl),
    });
  }

  /** Get Robinhood Chain native ETH balance; fail-closed on live RPC failure */
  public async getEvmBalance(chainId: number): Promise<BalanceResult | null> {
    const chainConfig = EVM_CHAINS[chainId];
    const symbol = 'ETH';
    const chainName = chainConfig?.chain.name || `Chain #${chainId}`;

    const isDryRun = isDryRunMode();
    const simEth = parseFloat(process.env.SIMULATION_BALANCE_ETH || '1.0');
    if (isDryRun) {
      return { balance: simEth, symbol, chain: chainName, simulated: true };
    }

    try {
      const publicClient = this.getEvmPublicClient(chainId);
      const account = this.getEvmAccount();
      const balance = await publicClient.getBalance({ address: account.address });

      return {
        balance: Number(formatEther(balance)),
        symbol,
        chain: chainName,
        simulated: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET] EVM balance query failed on chain ${chainId}: ${message}`);
      return null;
    }
  }

  /** Send native ETH to a recipient on Robinhood Chain */
  public async sendEvm(chainId: number, recipientAddress: string, amount: number): Promise<{ txHash: string; explorerUrl: string }> {
    const isDryRun = isDryRunMode();
    const chainConfig = EVM_CHAINS[chainId];
    if (!chainConfig) throw new Error(`Unsupported EVM chain ID: ${chainId}`);

    console.log(`[WALLET SERVICE] Sending ${amount} native token to ${recipientAddress} on chain ${chainId} (DRY_RUN=${isDryRun})`);

    if (isDryRun) {
      const simHash = `0xsim_evm_send_${chainId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return { txHash: simHash, explorerUrl: `${chainConfig.explorerBase}${simHash}` };
    }

    const walletClient = this.getEvmWalletClient(chainId);
    const account = this.getEvmAccount();

    const txHash = await walletClient.sendTransaction({
      account,
      to: recipientAddress as `0x${string}`,
      value: parseEther(amount.toString()),
      chain: chainConfig.chain,
    });

    return { txHash, explorerUrl: `${chainConfig.explorerBase}${txHash}` };
  }

  /** Get the explorer URL for a given chain */
  public getExplorerUrl(chainId: number, txHash: string): string {
    const chainConfig = EVM_CHAINS[chainId];
    if (chainConfig) return `${chainConfig.explorerBase}${txHash}`;
    return `https://robinhoodchain.blockscout.com/tx/${txHash}`;
  }

  /** Get wallet address for a given chain type */
  public getAddress(chain: 'evm'): string {
    return this.getEvmAddress();
  }
}

/** Process-wide singleton: WalletService is stateful (runtime-set keys) — share ONE instance. */
export const globalWalletService = new WalletService();
