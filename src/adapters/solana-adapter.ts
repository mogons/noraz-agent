import { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { WalletService } from '../services/wallet-service.js';
import { isDryRun as isDryRunMode } from '../config/config.js';

export interface SolanaTradeRequest {
  outputMint: string;
  amountSol: number;
  slippageBps?: number; // e.g. 100 = 1%
}

export interface SolanaTradeResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  inputSol: number;
  outputTokens: number;
  priceImpactPercentage: number;
  simulated: boolean;
  error?: string;
}

export interface SolanaSendRequest {
  recipientAddress: string;
  amountSol: number;
}

export interface SolanaSwapRequest {
  inputMint: string;    // Token CA to swap from (SOL native = So11111111111111111111111111111111111111112)
  outputMint: string;   // Token CA to swap to
  amountSol: number;    // Amount in SOL (or input token's base units)
  slippageBps?: number; // Default 150 (1.5%)
}

const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112';

export class SolanaTradeAdapter {
  private connection: Connection;
  private fallbackRpcUrls: string[];
  private currentRpcIndex: number = 0;
  private isDryRun: boolean;

  constructor() {
    const primaryRpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.fallbackRpcUrls = [
      primaryRpc,
      'https://solana-mainnet.rpc.extrnode.com',
      'https://rpc.ankr.com/solana',
      'https://api.mainnet-beta.solana.com',
    ].filter(Boolean);

    this.connection = new Connection(this.fallbackRpcUrls[0], 'confirmed');
    this.isDryRun = isDryRunMode();
  }

  /** Get active connection with automatic failover fallback on connection errors */
  public getActiveConnection(): Connection {
    return this.connection;
  }

  /** Failover to next RPC node in fallback array if primary experiences latency/downtime */
  public rotateRpcConnection(): Connection {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.fallbackRpcUrls.length;
    const nextUrl = this.fallbackRpcUrls[this.currentRpcIndex];
    console.warn(`[SOLANA ADAPTER FAILOVER] Rotating RPC connection to fallback #${this.currentRpcIndex + 1}: ${nextUrl}`);
    this.connection = new Connection(nextUrl, 'confirmed');
    return this.connection;
  }

  public async executeBuyToken(request: SolanaTradeRequest): Promise<SolanaTradeResult> {
    console.log(`[SOLANA ADAPTER] Initiating Buy Order for token: ${request.outputMint} (Amount: ${request.amountSol} SOL)`);

    if (this.isDryRun) {
      console.log(`[SOLANA ADAPTER] DRY_RUN=true -> Executing Jupiter Aggregator route simulation...`);
      return {
        success: true,
        txHash: `sim_sol_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        inputSol: request.amountSol,
        outputTokens: request.amountSol * 1500, // Simulated output token balance
        priceImpactPercentage: 0.12,
        simulated: true,
      };
    }

    // Live Execution via Jupiter Aggregator API (@jup-ag/api)
    try {
      // 1. Fetch best quote from Jupiter API endpoint: https://quote-api.jup.ag/v6/quote
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${request.outputMint}&amount=${request.amountSol * 1e9}&slippageBps=${request.slippageBps || 150}`;
      const quoteRes = await fetch(quoteUrl);
      
      if (!quoteRes.ok) {
        throw new Error(`Jupiter Quote Failed: ${await quoteRes.text()}`);
      }

      const quoteData = await quoteRes.json() as Record<string, unknown>;
      const routePlan = quoteData.routePlan as Array<Record<string, unknown>> | undefined;
      const swapInfo = routePlan?.[0]?.swapInfo as Record<string, unknown> | undefined;
      console.log(`[JUPITER SWAP] Best route found via ${swapInfo?.label || 'DEX Pool'}`);

      // Real quote data is reported, but live broadcast is NOT enabled yet — no fabricated hash.
      return {
        success: false,
        inputSol: request.amountSol,
        outputTokens: Number(quoteData.outAmount || 0) / 1e6,
        priceImpactPercentage: Number(quoteData.priceImpactPct || 0),
        simulated: false,
        error: 'Live Solana buy execution not yet connected. Configure wallet and DRY_RUN=false to enable broadcast.',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[SOLANA ADAPTER ERROR]', errMsg);
      return {
        success: false,
        inputSol: request.amountSol,
        outputTokens: 0,
        priceImpactPercentage: 0,
        simulated: false,
        error: errMsg,
      };
    }
  }

  /**
   * Send native SOL to a recipient address.
   * Uses WalletService for key management if provided, otherwise uses env key directly.
   */
  public async sendToken(request: SolanaSendRequest, walletService?: WalletService): Promise<SolanaTradeResult> {
    const { recipientAddress, amountSol } = request;

    console.log(`[SOLANA ADAPTER] Sending ${amountSol} SOL to ${recipientAddress}`);

    if (this.isDryRun) {
      console.log(`[SOLANA ADAPTER] DRY_RUN=true -> Simulating SOL transfer...`);
      const simHash = `sim_sol_send_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return {
        success: true,
        txHash: simHash,
        explorerUrl: `https://solscan.io/tx/${simHash}`,
        inputSol: amountSol,
        outputTokens: amountSol, // 1:1 for native transfer
        priceImpactPercentage: 0,
        simulated: true,
      };
    }

    try {
      if (walletService && walletService.hasWallet('solana')) {
        const result = await walletService.sendSol(recipientAddress, amountSol);
        return {
          success: true,
          txHash: result.txHash,
          explorerUrl: result.explorerUrl,
          inputSol: amountSol,
          outputTokens: amountSol,
          priceImpactPercentage: 0,
          simulated: false,
        };
      }

      throw new Error('Solana wallet not configured. Use /wallet setup or set SOLANA_PRIVATE_KEY in .env');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[SOLANA ADAPTER SEND ERROR]', errMsg);
      return {
        success: false,
        inputSol: amountSol,
        outputTokens: 0,
        priceImpactPercentage: 0,
        simulated: false,
        error: errMsg,
      };
    }
  }

  /**
   * Swap tokens on Solana via Jupiter Aggregator.
   * Fetches quote, builds swap transaction, signs and broadcasts.
   */
  public async swapToken(request: SolanaSwapRequest, walletService?: WalletService): Promise<SolanaTradeResult> {
    const { inputMint, outputMint, amountSol, slippageBps } = request;
    const inputMintAddr = inputMint || SOL_NATIVE_MINT;

    console.log(`[SOLANA ADAPTER] Swapping ${amountSol} (${inputMintAddr}) -> ${outputMint}`);

    if (this.isDryRun) {
      console.log(`[SOLANA ADAPTER] DRY_RUN=true -> Simulating Jupiter swap...`);
      const simHash = `sim_sol_swap_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return {
        success: true,
        txHash: simHash,
        explorerUrl: `https://solscan.io/tx/${simHash}`,
        inputSol: amountSol,
        outputTokens: amountSol * 1500, // Simulated
        priceImpactPercentage: 0.15,
        simulated: true,
      };
    }

    try {
      // 1. Get Jupiter quote
      const lamports = Math.round(amountSol * 1e9);
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMintAddr}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps || 150}`;
      const quoteRes = await fetch(quoteUrl);

      if (!quoteRes.ok) {
        throw new Error(`Jupiter Quote Failed: ${await quoteRes.text()}`);
      }

      const quoteData = await quoteRes.json() as Record<string, unknown>;

      if (!walletService || !walletService.hasWallet('solana')) {
        throw new Error('Solana wallet not configured. Use /wallet setup or set SOLANA_PRIVATE_KEY in .env');
      }

      const userPublicKey = walletService.getSolanaAddress();

      // 2. Get Jupiter swap transaction
      const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey,
          wrapAndUnwrapSol: true,
        }),
      });

      if (!swapRes.ok) {
        throw new Error(`Jupiter Swap Failed: ${await swapRes.text()}`);
      }

      const swapData = await swapRes.json() as Record<string, unknown>;
      const swapTransaction = swapData.swapTransaction as string;

      // 3. Deserialize, sign, and send
      const keypair = walletService.getSolanaKeypair();
      const txBuf = Buffer.from(swapTransaction, 'base64');
      const tx = Transaction.from(txBuf);
      tx.partialSign(keypair);

      const rawTx = tx.serialize();
      const txHash = await this.connection.sendRawTransaction(rawTx, { skipPreflight: false });
      await this.connection.confirmTransaction(txHash, 'confirmed');

      return {
        success: true,
        txHash,
        explorerUrl: `https://solscan.io/tx/${txHash}`,
        inputSol: amountSol,
        outputTokens: Number(quoteData.outAmount || 0) / 1e6,
        priceImpactPercentage: Number(quoteData.priceImpactPct || 0),
        simulated: false,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[SOLANA ADAPTER SWAP ERROR]', errMsg);
      return {
        success: false,
        inputSol: amountSol,
        outputTokens: 0,
        priceImpactPercentage: 0,
        simulated: false,
        error: errMsg,
      };
    }
  }
}
