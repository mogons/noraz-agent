import { Keypair, Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createWalletClient, createPublicClient, http, parseEther, formatEther, type WalletClient, type PublicClient, type Chain, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, base, arbitrum, optimism, polygon, bsc } from 'viem/chains';

import { StateStore } from './state-store.js';
import { isDryRun as isDryRunMode } from '../config/config.js';
import { globalRPCFailoverManager } from './rpc-failover.js';

export interface WalletConfig {
  solanaPrivateKey?: string;
  evmPrivateKey?: string;
}

export interface BalanceResult {
  balance: number;
  symbol: string;
  chain: string;
  usdValue?: number;
  simulated?: boolean;
}

/** Supported EVM chain configurations */
const EVM_CHAINS: Record<number, { chain: Chain; rpcEnvKey: string; explorerBase: string }> = {
  1: { chain: mainnet, rpcEnvKey: 'EVM_ETH_RPC_URL', explorerBase: 'https://etherscan.io/tx/' },
  8453: { chain: base, rpcEnvKey: 'EVM_BASE_RPC_URL', explorerBase: 'https://basescan.org/tx/' },
  42161: { chain: arbitrum, rpcEnvKey: 'EVM_ARB_RPC_URL', explorerBase: 'https://arbiscan.io/tx/' },
  10: { chain: optimism, rpcEnvKey: 'EVM_OP_RPC_URL', explorerBase: 'https://optimistic.etherscan.io/tx/' },
  137: { chain: polygon, rpcEnvKey: 'EVM_POLYGON_RPC_URL', explorerBase: 'https://polygonscan.com/tx/' },
  56: { chain: bsc, rpcEnvKey: 'EVM_BSC_RPC_URL', explorerBase: 'https://bscscan.com/tx/' },
};

/**
 * WalletService manages private keys for Athena's direct on-chain execution.
 * Keys are loaded from .env at startup or set at runtime via /wallet setup or TUI.
 * Keys are persisted safely to local StateStore (database/athena_state.json) so they survive bot updates & process reboots.
 */
export class WalletService {
  private solanaPrivateKey: string | null = null;
  private evmPrivateKey: string | null = null;
  private solanaConnection: Connection;
  private stateStore: StateStore | null = null;

  constructor() {
    // Load from environment at startup
    const solKey = process.env.SOLANA_PRIVATE_KEY;
    const evmKey = process.env.EVM_PRIVATE_KEY;

    if (solKey && solKey.length > 0) {
      this.solanaPrivateKey = solKey;
      console.log('[WALLET SERVICE] Solana private key loaded from environment.');
    }
    if (evmKey && evmKey.length > 0) {
      this.evmPrivateKey = evmKey;
      console.log('[WALLET SERVICE] EVM private key loaded from environment.');
    }

    const rpcUrl = globalRPCFailoverManager.getActiveRPC('solana') || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.solanaConnection = new Connection(rpcUrl, 'confirmed');
  }

  /** Attach persistent StateStore to retain wallet keys across bot reboots & updates */
  public attachStateStore(store: StateStore): void {
    this.stateStore = store;
    const persistedKeys = store.getWalletKeys();

    if (!this.solanaPrivateKey && persistedKeys.solanaPrivateKey) {
      this.solanaPrivateKey = persistedKeys.solanaPrivateKey;
      console.log('[WALLET SERVICE] Restored Solana private key from persistent StateStore.');
    }
    if (!this.evmPrivateKey && persistedKeys.evmPrivateKey) {
      this.evmPrivateKey = persistedKeys.evmPrivateKey;
      console.log('[WALLET SERVICE] Restored EVM private key from persistent StateStore.');
    }
  }

  /** Store a private key at runtime (from /wallet setup modal or TUI) and persist to StateStore */
  public setKey(chain: 'solana' | 'evm', privateKey: string): void {
    const trimmed = privateKey.trim();
    if (chain === 'solana') {
      this.solanaPrivateKey = trimmed;
      console.log('[WALLET SERVICE] Solana private key set at runtime.');
    } else {
      this.evmPrivateKey = trimmed;
      console.log('[WALLET SERVICE] EVM private key set at runtime.');
    }

    if (this.stateStore) {
      this.stateStore.setWalletKey(chain, trimmed);
    }
  }

  /** Remove a stored private key from memory and persistent disk */
  public removeKey(chain: 'solana' | 'evm'): void {
    if (chain === 'solana') {
      this.solanaPrivateKey = null;
      console.log('[WALLET SERVICE] Solana private key removed.');
    } else {
      this.evmPrivateKey = null;
      console.log('[WALLET SERVICE] EVM private key removed.');
    }

    if (this.stateStore) {
      this.stateStore.removeWalletKey(chain);
    }
  }

  /** Check if a wallet is configured for the given chain type */
  public hasWallet(chain: 'solana' | 'evm'): boolean {
    if (chain === 'solana') return this.solanaPrivateKey !== null;
    return this.evmPrivateKey !== null;
  }

  // ─── Solana ──────────────────────────────────────────────────────────

  /** Get Solana Keypair from stored private key */
  public getSolanaKeypair(): Keypair {
    if (!this.solanaPrivateKey) {
      throw new Error('Solana private key not configured. Use /wallet setup or set SOLANA_PRIVATE_KEY in .env');
    }

    // Support both base58 and JSON array formats
    try {
      const decoded = JSON.parse(this.solanaPrivateKey);
      if (Array.isArray(decoded)) {
        return Keypair.fromSecretKey(new Uint8Array(decoded));
      }
    } catch {
      // Not JSON — try as base58
    }

    // Base58 encoded secret key
    const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const isBase58 = this.solanaPrivateKey.split('').every(c => bs58Chars.includes(c));
    if (isBase58) {
      // Decode base58 manually (simplified for common key lengths)
      const bytes = this.base58Decode(this.solanaPrivateKey);
      return Keypair.fromSecretKey(new Uint8Array(bytes));
    }

    throw new Error('Invalid Solana private key format. Use base58 or JSON array.');
  }

  /** Get Solana wallet public address */
  public getSolanaAddress(): string {
    return this.getSolanaKeypair().publicKey.toBase58();
  }

  /** Get Solana SOL balance (fail-closed: null on live RPC failure) */
  public async getSolanaBalance(): Promise<BalanceResult | null> {
    const isDryRun = isDryRunMode();
    const simSol = parseFloat(process.env.SIMULATION_BALANCE_SOL || '10.0');
    if (isDryRun) {
      return { balance: simSol, symbol: 'SOL', chain: 'Solana', simulated: true };
    }
    try {
      const keypair = this.getSolanaKeypair();
      const balance = await this.solanaConnection.getBalance(keypair.publicKey);
      return {
        balance: balance / LAMPORTS_PER_SOL,
        symbol: 'SOL',
        chain: 'Solana',
        simulated: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      globalRPCFailoverManager.reportRPCFailure('solana', this.solanaConnection.rpcEndpoint);
      console.warn(`[WALLET] Solana balance query failed: ${message}`);
      return null;
    }
  }

  /** Send native SOL to a recipient */
  public async sendSol(recipientAddress: string, amountSol: number): Promise<{ txHash: string; explorerUrl: string }> {
    const isDryRun = isDryRunMode();
    const keypair = this.getSolanaKeypair();
    const recipient = new PublicKey(recipientAddress);
    const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

    console.log(`[WALLET SERVICE] Sending ${amountSol} SOL to ${recipientAddress} (DRY_RUN=${isDryRun})`);

    if (isDryRun) {
      const simHash = `sim_sol_send_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return { txHash: simHash, explorerUrl: `https://solscan.io/tx/${simHash}` };
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );

    const txHash = await sendAndConfirmTransaction(this.solanaConnection, transaction, [keypair]);
    return { txHash, explorerUrl: `https://solscan.io/tx/${txHash}` };
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

  /** Get viem WalletClient for a specific chain */
  public getEvmWalletClient(chainId: number): WalletClient {
    const chainConfig = EVM_CHAINS[chainId];
    if (!chainConfig) throw new Error(`Unsupported EVM chain ID: ${chainId}`);

    const rpcUrl = process.env[chainConfig.rpcEnvKey] || undefined;
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

    const rpcUrl = process.env[chainConfig.rpcEnvKey] || undefined;

    return createPublicClient({
      chain: chainConfig.chain,
      transport: http(rpcUrl),
    });
  }

  /** Get Polymarket USDC balance (real on Polygon; simulated only when DRY_RUN) */
  public async getPolymarketBalance(): Promise<BalanceResult | null> {
    const isDryRun = isDryRunMode();
    const simPoly = parseFloat(process.env.SIMULATION_BALANCE_POLYMARKET || '500.0');
    if (isDryRun) {
      return { balance: simPoly, symbol: 'USDC', chain: 'Polygon (Polymarket)', simulated: true };
    }
    let address: string;
    try {
      address = this.getEvmAddress();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET] Polymarket balance unavailable (no EVM wallet): ${message}`);
      return null;
    }
    try {
      const rpc = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{
            to: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            data: `0x70a08231000000000000000000000000${address.replace(/^0x/, '').toLowerCase()}`,
          }, 'latest'],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { result?: string };
      const raw = data?.result;
      if (!raw || raw === '0x') return null;
      const balance = parseInt(raw, 16) / 1e6;
      return { balance, symbol: 'USDC', chain: 'Polygon (Polymarket)', simulated: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET] Polymarket balance query failed: ${message}`);
      return null;
    }
  }

  /** Get Hyperliquid Perps USDC balance (real via info API; simulated only when DRY_RUN) */
  public async getHyperliquidBalance(): Promise<BalanceResult | null> {
    const isDryRun = isDryRunMode();
    const simHl = parseFloat(process.env.SIMULATION_BALANCE_HYPERLIQUID || '1000.0');
    if (isDryRun) {
      return { balance: simHl, symbol: 'USDC', chain: 'Hyperliquid Perps', simulated: true };
    }
    let address: string;
    try {
      address = this.getEvmAddress();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET] Hyperliquid balance unavailable (no EVM wallet): ${message}`);
      return null;
    }
    try {
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearinghouseState', user: address }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { marginSummary?: { accountValue?: string } };
      const value = Number(data.marginSummary?.accountValue);
      if (!(value > 0)) return null;
      return { balance: value, symbol: 'USDC', chain: 'Hyperliquid Perps', simulated: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET] Hyperliquid balance query failed: ${message}`);
      return null;
    }
  }

  /** Get EVM native balance (ETH/BNB/MATIC); fail-closed on live RPC failure */
  public async getEvmBalance(chainId: number): Promise<BalanceResult | null> {
    const chainConfig = EVM_CHAINS[chainId];
    const nativeSymbols: Record<number, string> = {
      1: 'ETH', 8453: 'ETH', 42161: 'ETH', 10: 'ETH', 137: 'MATIC', 56: 'BNB',
    };
    const symbol = nativeSymbols[chainId] || 'ETH';
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

  /** Send native ETH/BNB/MATIC to a recipient */
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
    if (chainId === 792703809) return `https://solscan.io/tx/${txHash}`;
    return `https://etherscan.io/tx/${txHash}`;
  }

  /** Get wallet address for a given chain type */
  public getAddress(chain: 'solana' | 'evm'): string {
    if (chain === 'solana') return this.getSolanaAddress();
    return this.getEvmAddress();
  }

  // ─── Utilities ───────────────────────────────────────────────────────

  /** Simple base58 decoder for Solana private keys */
  private base58Decode(str: string): number[] {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bytes: number[] = [0];
    for (const char of str) {
      const idx = ALPHABET.indexOf(char);
      if (idx === -1) throw new Error(`Invalid base58 character: ${char}`);
      let carry = idx;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    // Handle leading zeros
    for (const char of str) {
      if (char !== '1') break;
      bytes.push(0);
    }
    return bytes.reverse();
  }
}
