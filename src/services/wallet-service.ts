import { Keypair, Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createWalletClient, createPublicClient, http, parseEther, formatEther, type WalletClient, type PublicClient, type Chain, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, base, arbitrum, optimism, polygon, bsc } from 'viem/chains';

export interface WalletConfig {
  solanaPrivateKey?: string;
  evmPrivateKey?: string;
}

export interface BalanceResult {
  balance: number;
  symbol: string;
  chain: string;
  usdValue?: number;
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
 * Keys are loaded from .env at startup or set at runtime via /wallet setup.
 * Keys are stored ONLY in memory — never persisted to disk.
 */
export class WalletService {
  private solanaPrivateKey: string | null = null;
  private evmPrivateKey: string | null = null;
  private solanaConnection: Connection;

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

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.solanaConnection = new Connection(rpcUrl, 'confirmed');
  }

  /** Store a private key at runtime (from /wallet setup modal) */
  public setKey(chain: 'solana' | 'evm', privateKey: string): void {
    if (chain === 'solana') {
      this.solanaPrivateKey = privateKey.trim();
      console.log('[WALLET SERVICE] Solana private key set at runtime.');
    } else {
      this.evmPrivateKey = privateKey.trim();
      console.log('[WALLET SERVICE] EVM private key set at runtime.');
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

  /** Get Solana SOL balance */
  public async getSolanaBalance(): Promise<BalanceResult> {
    const keypair = this.getSolanaKeypair();
    const balance = await this.solanaConnection.getBalance(keypair.publicKey);
    return {
      balance: balance / LAMPORTS_PER_SOL,
      symbol: 'SOL',
      chain: 'Solana',
    };
  }

  /** Send native SOL to a recipient */
  public async sendSol(recipientAddress: string, amountSol: number): Promise<{ txHash: string; explorerUrl: string }> {
    const isDryRun = process.env.DRY_RUN !== 'false';
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

  /** Get EVM native balance (ETH/BNB/MATIC) */
  public async getEvmBalance(chainId: number): Promise<BalanceResult> {
    const publicClient = this.getEvmPublicClient(chainId);
    const account = this.getEvmAccount();
    const balance = await publicClient.getBalance({ address: account.address });
    const chainConfig = EVM_CHAINS[chainId];

    const nativeSymbols: Record<number, string> = {
      1: 'ETH', 8453: 'ETH', 42161: 'ETH', 10: 'ETH', 137: 'MATIC', 56: 'BNB',
    };

    return {
      balance: Number(formatEther(balance)),
      symbol: nativeSymbols[chainId] || 'ETH',
      chain: chainConfig?.chain.name || `Chain #${chainId}`,
    };
  }

  /** Send native ETH/BNB/MATIC to a recipient */
  public async sendEvm(chainId: number, recipientAddress: string, amount: number): Promise<{ txHash: string; explorerUrl: string }> {
    const isDryRun = process.env.DRY_RUN !== 'false';
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
