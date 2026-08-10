import type { WalletService } from '../services/wallet-service.js';
import { isDryRun as isDryRunMode } from '../config/config.js';
import { loadApiKeyPool, type ApiKeyPool } from '../services/api-key-pool.js';

export interface EVMTradeRequest {
  chain: string;
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
  robinhood: 4663, '4663': 4663,
};

export class EVMTradeAdapter {
  private isDryRun: boolean;
  private uniswapKeyPool: ApiKeyPool = loadApiKeyPool('UNISWAP_API_KEY');

  constructor() {
    this.isDryRun = isDryRunMode();
  }

  public parseChainId(chainInput: string | number): number {
    const key = String(chainInput).toLowerCase().trim();
    return CHAIN_ID_MAP[key] || 4663;
  }

  public async executeBuyToken(request: EVMTradeRequest, walletService?: WalletService): Promise<EVMTradeResult> {
    const dexName = 'Uniswap API (Robinhood L2)';

    console.log(`[EVM ADAPTER] Initiating Buy Order on ${String(request.chain).toUpperCase()} via ${dexName} (Amount: ${request.amountEth} ETH)`);

    if (this.isDryRun) {
      // Realistic dry run: fetch REAL quote from the Uniswap API, report real numbers, do NOT broadcast.
      console.log(`[EVM ADAPTER] DRY_RUN=true -> Fetching REAL Uniswap API quote (no broadcast)...`);

      // Fail closed: entry is not usable without a quote API key.
      const key = this.uniswapKeyPool.get() || '';
      if (!key) {
        console.warn('UNISWAP_API_KEY missing — cannot fetch real quote. Set UNISWAP_API_KEY in .env (dry-run stays simulated).');
        return {
          success: false,
          chain: String(request.chain),
          inputEth: request.amountEth,
          outputTokens: 0,
          dexUsed: dexName,
          simulated: true,
          error: 'UNISWAP_API_KEY missing — cannot fetch real quote. Set UNISWAP_API_KEY in .env (dry-run stays simulated).',
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const quoteBody = {
          tokenIn: '0x0000000000000000000000000000000000000000', // native ETH
          tokenOut: request.tokenAddress,
          amount: BigInt(Math.round(request.amountEth * 1e18)).toString(),
          type: 'EXACT_INPUT',
          chainId: this.parseChainId(request.chain),
          configs: [{ protocols: ['V2','V3','V4'], routingType: 'CLASSIC', enableUniversalRouter: true }],
        };
        let quoteRes = await fetch('https://trade-api.gateway.uniswap.org/v1/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'accept': 'application/json' },
          body: JSON.stringify(quoteBody),
          signal: controller.signal,
        });
        if ((quoteRes.status === 401 || quoteRes.status === 403) && this.uniswapKeyPool.size > 1) {
          const next = this.uniswapKeyPool.markFailed(`HTTP ${quoteRes.status}`);
          if (next) {
            quoteRes = await fetch('https://trade-api.gateway.uniswap.org/v1/quote', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-api-key': next, 'accept': 'application/json' },
              body: JSON.stringify(quoteBody),
              signal: controller.signal,
            });
          }
        }
        clearTimeout(timer);
        if (!quoteRes.ok) {
          return { success: false, chain: String(request.chain), inputEth: request.amountEth, outputTokens: 0, dexUsed: dexName, simulated: true, error: `Uniswap API Quote Failed: ${await quoteRes.text()}` };
        }
        const quote = await quoteRes.json() as Record<string, unknown>;
        return {
          success: true,
          txHash: `sim_evm_${request.chain}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          chain: String(request.chain),
          inputEth: request.amountEth,
          outputTokens: Number(quote.amountOut || 0) / 1e18,
          dexUsed: 'Uniswap API (Robinhood L2)',
          simulated: true,
        };
      } catch (err: unknown) {
        clearTimeout(timer);
        const errMsg = err instanceof Error ? err.message : String(err);
        return { success: false, chain: String(request.chain), inputEth: request.amountEth, outputTokens: 0, dexUsed: dexName, simulated: true, error: errMsg };
      }
    }

    try {
      if (!walletService || !walletService.hasWallet('evm')) {
        return {
          success: false,
          chain: String(request.chain),
          inputEth: request.amountEth,
          outputTokens: 0,
          dexUsed: dexName,
          simulated: false,
          error: 'EVM wallet not configured for AUTO_EXECUTE mode. Set EVM_PRIVATE_KEY in .env or run /wallet setup.',
        };
      }

      const chainId = this.parseChainId(request.chain);
      const userAddr = walletService.getEvmAddress();

      const response = await fetch('https://api.relay.link/quote/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: userAddr,
          originChainId: chainId,
          destinationChainId: chainId,
          originCurrency: '0x0000000000000000000000000000000000000000',
          destinationCurrency: request.tokenAddress,
          amount: BigInt(Math.round(request.amountEth * 1e18)).toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Relay Swap quote error: ${await response.text()}`);
      }

      const quoteData = await response.json() as Record<string, unknown>;
      const steps = quoteData.steps as Array<Record<string, unknown>> | undefined;
      const firstStep = steps?.[0];
      const items = firstStep?.items as Array<Record<string, unknown>> | undefined;
      const txData = items?.[0]?.data as Record<string, unknown> | undefined;

      if (!txData) {
        throw new Error('No transaction step payload returned for Robinhood Chain swap execution.');
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
        dexUsed: 'Uniswap V3 Router (Robinhood L2)',
        simulated: false,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[EVM ADAPTER LIVE BUY ERROR]', errMsg);
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
   * Send native ETH directly via WalletService (viem)
   */
  public async sendToken(request: EVMSendRequest, walletService?: WalletService): Promise<EVMTradeResult> {
    const chainId = this.parseChainId(request.chain);
    console.log(`[EVM ADAPTER] Direct Send: ${request.amountEth} native token to ${request.recipientAddress} on Chain #${chainId}`);

    if (this.isDryRun) {
      const simHash = `0xsim_evm_send_${chainId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return {
        success: true,
        txHash: simHash,
        explorerUrl: walletService ? walletService.getExplorerUrl(chainId, simHash) : `https://robinhoodchain.blockscout.com/tx/${simHash}`,
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
        explorerUrl: walletService ? walletService.getExplorerUrl(chainId, simHash) : `https://robinhoodchain.blockscout.com/tx/${simHash}`,
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
