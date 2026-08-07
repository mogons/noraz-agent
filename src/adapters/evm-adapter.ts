import type { WalletService } from '../services/wallet-service.js';
import { isDryRun as isDryRunMode } from '../config/config.js';

export interface EVMTradeRequest {
  chain: 'base' | 'ethereum' | 'bsc' | 'robinhood' | string;
  tokenAddress: string;
  amountEth: number;
  slippagePercentage?: number; // e.g. 1.5%
}

export interface EVMTradeResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  chain: string;
  inputEth: number;
  outputTokens: number;
  dexUsed: string;
  simulated: boolean;
  error?: string;
}

export interface EVMSendRequest {
  chain: string | number;
  recipientAddress: string;
  amountEth: number;
}

export interface EVMSwapRequest {
  chain: string | number;
  fromToken: string;
  toToken: string;
  amountEth: number;
}

const CHAIN_ID_MAP: Record<string, number> = {
  ethereum: 1, eth: 1, '1': 1,
  base: 8453, '8453': 8453,
  arbitrum: 42161, arb: 42161, '42161': 42161,
  optimism: 10, op: 10, '10': 10,
  polygon: 137, poly: 137, '137': 137,
  bsc: 56, binance: 56, '56': 56,
};

export class EVMTradeAdapter {
  private isDryRun: boolean;

  constructor() {
    this.isDryRun = isDryRunMode();
  }

  public parseChainId(chainInput: string | number): number {
    const key = String(chainInput).toLowerCase().trim();
    return CHAIN_ID_MAP[key] || 1;
  }

  public async executeBuyToken(request: EVMTradeRequest): Promise<EVMTradeResult> {
    const dexName = request.chain === 'robinhood' 
      ? 'Uniswap / Robinhood L2 Swap Router' 
      : request.chain === 'base' 
      ? 'Aerodrome / Uniswap v3 Base' 
      : request.chain === 'bsc' 
      ? 'PancakeSwap v3' 
      : 'Uniswap v3 Ethereum';

    console.log(`[EVM ADAPTER] Initiating Buy Order on ${String(request.chain).toUpperCase()} via ${dexName} (Amount: ${request.amountEth} ETH/BNB)`);

    if (this.isDryRun) {
      console.log(`[EVM ADAPTER] DRY_RUN=true -> Executing EVM Router trade simulation...`);
      return {
        success: true,
        txHash: `sim_evm_${request.chain}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: request.amountEth * 125000,
        dexUsed: dexName,
        simulated: true,
      };
    }

    try {
      // Live broadcast is NOT enabled yet — return an honest "not enabled" result (no fabricated hash).
      return {
        success: false,
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: 0,
        dexUsed: dexName,
        simulated: false,
        error: 'Live EVM buy execution not yet connected. Configure EVM_PRIVATE_KEY and DRY_RUN=false to enable.',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[EVM ADAPTER ERROR]', errMsg);
      return {
        success: false,
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: 0,
        dexUsed: dexName,
        simulated: false,
        error: errMsg,
      };
    }
  }

  /**
   * Send native ETH/BNB/MATIC directly via WalletService (viem)
   */
  public async sendToken(request: EVMSendRequest, walletService?: WalletService): Promise<EVMTradeResult> {
    const chainId = this.parseChainId(request.chain);
    console.log(`[EVM ADAPTER] Direct Send: ${request.amountEth} native token to ${request.recipientAddress} on Chain #${chainId}`);

    if (this.isDryRun) {
      const simHash = `0xsim_evm_send_${chainId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return {
        success: true,
        txHash: simHash,
        explorerUrl: walletService ? walletService.getExplorerUrl(chainId, simHash) : `https://etherscan.io/tx/${simHash}`,
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: request.amountEth,
        dexUsed: 'Direct Native Transfer',
        simulated: true,
      };
    }

    try {
      if (!walletService || !walletService.hasWallet('evm')) {
        throw new Error('EVM wallet not configured. Use /wallet setup or set EVM_PRIVATE_KEY in .env');
      }

      const result = await walletService.sendEvm(chainId, request.recipientAddress, request.amountEth);
      return {
        success: true,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: request.amountEth,
        dexUsed: 'Direct Native Transfer',
        simulated: false,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[EVM ADAPTER SEND ERROR]', errMsg);
      return {
        success: false,
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: 0,
        dexUsed: 'Direct Native Transfer',
        simulated: false,
        error: errMsg,
      };
    }
  }

  /**
   * Swap tokens on EVM via Relay API / DEX router
   */
  public async swapToken(request: EVMSwapRequest, walletService?: WalletService): Promise<EVMTradeResult> {
    const chainId = this.parseChainId(request.chain);
    console.log(`[EVM ADAPTER] Direct Swap: ${request.amountEth} ${request.fromToken} -> ${request.toToken} on Chain #${chainId}`);

    if (this.isDryRun) {
      const simHash = `0xsim_evm_swap_${chainId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return {
        success: true,
        txHash: simHash,
        explorerUrl: walletService ? walletService.getExplorerUrl(chainId, simHash) : `https://etherscan.io/tx/${simHash}`,
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: request.amountEth * 3200, // Simulated output e.g. ETH -> USDC
        dexUsed: 'Relay / Uniswap v3 Router',
        simulated: true,
      };
    }

    try {
      if (!walletService || !walletService.hasWallet('evm')) {
        throw new Error('EVM wallet not configured. Use /wallet setup or set EVM_PRIVATE_KEY in .env');
      }

      // Live Relay step execution: Request quote with calldata step, sign via viem, broadcast
      const userAddr = walletService.getEvmAddress();
      const response = await fetch('https://api.relay.link/quote/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: userAddr,
          originChainId: chainId,
          destinationChainId: chainId,
          originCurrency: request.fromToken,
          destinationCurrency: request.toToken,
          amount: (request.amountEth * 1e18).toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Relay API quote error: ${await response.text()}`);
      }

      const quoteData = await response.json() as Record<string, unknown>;
      const steps = quoteData.steps as Array<Record<string, unknown>> | undefined;
      const firstStep = steps?.[0];
      const items = firstStep?.items as Array<Record<string, unknown>> | undefined;
      const txData = items?.[0]?.data as Record<string, unknown> | undefined;

      if (!txData) {
        throw new Error('No transaction step data returned from Relay API');
      }

      const walletClient = walletService.getEvmWalletClient(chainId);
      const account = walletService.getEvmAccount();

      const txHash = await walletClient.sendTransaction({
        account,
        chain: walletClient.chain || null,
        to: String(txData.to) as `0x${string}`,
        data: String(txData.data) as `0x${string}`,
        value: BigInt(String(txData.value || 0)),
      });

      return {
        success: true,
        txHash,
        explorerUrl: walletService.getExplorerUrl(chainId, txHash),
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: Number((quoteData.details as any)?.currencyOut?.amount || 0) / 1e18,
        dexUsed: 'Relay Router',
        simulated: false,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[EVM ADAPTER SWAP ERROR]', errMsg);
      return {
        success: false,
        chain: String(request.chain),
        inputEth: request.amountEth,
        outputTokens: 0,
        dexUsed: 'Relay Router',
        simulated: false,
        error: errMsg,
      };
    }
  }
}
