import { isDryRun as isDryRunMode } from '../config/config.js';

export interface RelayQuoteRequest {
  originChain: string | number;
  destinationChain: string | number;
  amount: number;
  tokenSymbol?: string;
  userAddress?: string;
}

export interface RelayQuoteResult {
  success: boolean;
  originChainName: string;
  originChainId: number;
  destinationChainName: string;
  destinationChainId: number;
  amountIn: number;
  expectedAmountOut: number;
  tokenSymbol: string;
  feeUsd: number;
  estimatedDurationSeconds: number;
  relayWebUrl: string;
  simulated: boolean;
  error?: string;
}

export interface RelaySwapRequest {
  chain: string | number;
  fromToken: string;
  toToken: string;
  amount: number;
  userAddress?: string;
}

export interface RelaySwapResult {
  success: boolean;
  chainName: string;
  chainId: number;
  fromToken: string;
  toToken: string;
  amountIn: number;
  expectedAmountOut: number;
  feeUsd: number;
  estimatedDurationSeconds: number;
  relayWebUrl: string;
  simulated: boolean;
  error?: string;
}

export interface RelaySendRequest {
  chain: string | number;
  token: string;
  amount: number;
  recipientAddress: string;
  userAddress?: string;
}

export interface RelaySendResult {
  success: boolean;
  chainName: string;
  chainId: number;
  tokenSymbol: string;
  amountIn: number;
  expectedAmountOut: number;
  recipientAddress: string;
  feeUsd: number;
  estimatedDurationSeconds: number;
  relayWebUrl: string;
  simulated: boolean;
  error?: string;
}

/** Well-known token addresses per chain for user-friendly symbol lookup */
const WELL_KNOWN_TOKENS: Record<number, Record<string, string>> = {
  // Ethereum Mainnet (bridge origin only — cross-chain bridge to Robinhood L2)
  1: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
  // Robinhood Chain L2 (canonical contracts — docs.robinhood.com/chain/contracts)
  4663: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    USDG: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
  },
};

export class RelayAdapter {
  private isDryRun: boolean;

  private chainMap: Record<string, { id: number; name: string }> = {
    '1': { id: 1, name: 'Ethereum Mainnet' },
    eth: { id: 1, name: 'Ethereum Mainnet' },
    ethereum: { id: 1, name: 'Ethereum Mainnet' },

    '4663': { id: 4663, name: 'Robinhood Chain' },
    robinhood: { id: 4663, name: 'Robinhood Chain' },
    hood: { id: 4663, name: 'Robinhood Chain' },
  };

  constructor() {
    this.isDryRun = isDryRunMode();
  }

  public parseChain(input: string | number): { id: number; name: string } {
    const strKey = String(input).toLowerCase().trim();
    if (this.chainMap[strKey]) {
      return this.chainMap[strKey];
    }
    return { id: Number(input) || 4663, name: `Chain #${input}` };
  }

  /** Resolve a token symbol to its on-chain address for a given chainId */
  public resolveTokenAddress(symbol: string, chainId: number): string {
    const upper = symbol.toUpperCase().trim();
    // If it already looks like a contract address, return as-is
    if (upper.startsWith('0X') && upper.length >= 40) return symbol;
    const chainTokens = WELL_KNOWN_TOKENS[chainId];
    if (chainTokens && chainTokens[upper]) return chainTokens[upper];
    // Default to native gas token address
    return '0x0000000000000000000000000000000000000000';
  }

  public constructRelayUrl(originChainId: number, destinationChainId: number, amount: number, tokenSymbol: string): string {
    return `https://relay.link/bridge?fromChain=${originChainId}&toChain=${destinationChainId}&amount=${amount}&currency=${encodeURIComponent(tokenSymbol)}`;
  }

  public constructSwapUrl(chainId: number, fromCurrency: string, toCurrency: string, amount: number): string {
    return `https://relay.link/swap?fromChain=${chainId}&toChain=${chainId}&fromCurrency=${encodeURIComponent(fromCurrency)}&toCurrency=${encodeURIComponent(toCurrency)}&amount=${amount}`;
  }

  private async callRelayQuote(payload: Record<string, unknown>): Promise<{ ok: boolean; data?: any; err?: string }> {
    try {
      const res = await fetch('https://api.relay.link/quote/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, err: `Relay API returned HTTP ${res.status}` };
      return { ok: true, data: await res.json() };
    } catch (err: unknown) {
      return { ok: false, err: err instanceof Error ? err.message : String(err) };
    }
  }

  public async getBridgeQuote(request: RelayQuoteRequest): Promise<RelayQuoteResult> {
    const origin = this.parseChain(request.originChain);
    const destination = this.parseChain(request.destinationChain);
    const tokenSymbol = (request.tokenSymbol || 'ETH').toUpperCase();
    const amount = request.amount;

    console.log(`[RELAY ADAPTER] Requesting Relay Intent Quote: ${amount} ${tokenSymbol} from ${origin.name} (${origin.id}) -> ${destination.name} (${destination.id})`);

    const relayWebUrl = this.constructRelayUrl(origin.id, destination.id, amount, tokenSymbol);

    if (this.isDryRun) {
      console.log(`[RELAY ADAPTER] DRY_RUN=true -> Generating Relay Intent Quote Simulation...`);
      return {
        success: true,
        originChainName: origin.name,
        originChainId: origin.id,
        destinationChainName: destination.name,
        destinationChainId: destination.id,
        amountIn: amount,
        expectedAmountOut: Number((amount * 0.9985).toFixed(6)), // 0.15% fee
        tokenSymbol,
        feeUsd: 1.25,
        estimatedDurationSeconds: 12,
        relayWebUrl,
        simulated: true,
      };
    }

    const res = await this.callRelayQuote({
      user: request.userAddress || '0x0000000000000000000000000000000000000000',
      originChainId: origin.id,
      destinationChainId: destination.id,
      currency: tokenSymbol,
      amount: (amount * 1e18).toString(),
    });

    if (!res.ok) {
      return {
        success: false,
        originChainName: origin.name,
        originChainId: origin.id,
        destinationChainName: destination.name,
        destinationChainId: destination.id,
        amountIn: amount,
        expectedAmountOut: 0,
        tokenSymbol,
        feeUsd: 0,
        estimatedDurationSeconds: 0,
        relayWebUrl,
        simulated: false,
        error: res.err || 'Relay quote unavailable.',
      };
    }

    const data = res.data as Record<string, unknown>;
    const details = data.details as Record<string, unknown> | undefined;
    const fees = data.fees as Record<string, unknown> | undefined;
    const currencyOut = details?.currencyOut as Record<string, unknown> | undefined;
    const relayer = fees?.relayer as Record<string, unknown> | undefined;
    const expectedOut = currencyOut?.amount ? Number(currencyOut.amount) / 1e18 : 0;
    const feeUsd = relayer?.amountUsd ? Number(relayer.amountUsd) : 0;
    const timeSec = details?.timeEstimate ? Number(details.timeEstimate) : 0;

    return {
      success: true,
      originChainName: origin.name,
      originChainId: origin.id,
      destinationChainName: destination.name,
      destinationChainId: destination.id,
      amountIn: amount,
      expectedAmountOut: expectedOut,
      tokenSymbol,
      feeUsd,
      estimatedDurationSeconds: timeSec,
      relayWebUrl,
      simulated: false,
    };
  }

  /**
   * Get a swap quote via Relay.link unified quote API.
   * Swaps use different originCurrency and destinationCurrency on the same or cross-chain.
   */
  public async getSwapQuote(request: RelaySwapRequest): Promise<RelaySwapResult> {
    const chain = this.parseChain(request.chain);
    const fromSymbol = request.fromToken.toUpperCase();
    const toSymbol = request.toToken.toUpperCase();
    const fromAddress = this.resolveTokenAddress(request.fromToken, chain.id);
    const toAddress = this.resolveTokenAddress(request.toToken, chain.id);
    const amount = request.amount;

    console.log(`[RELAY ADAPTER] Requesting Relay Swap Quote: ${amount} ${fromSymbol} -> ${toSymbol} on ${chain.name} (${chain.id})`);

    const relayWebUrl = this.constructSwapUrl(chain.id, fromAddress, toAddress, amount);

    if (this.isDryRun) {
      console.log(`[RELAY ADAPTER] DRY_RUN=true -> Generating Relay Swap Quote Simulation...`);

      // Simulate realistic swap output based on common pairs
      let simulatedOutput = amount;
      const isStableTo = ['USDC', 'USDT', 'DAI', 'BUSD', 'USDBC'].includes(toSymbol);
      const isStableFrom = ['USDC', 'USDT', 'DAI', 'BUSD', 'USDBC'].includes(fromSymbol);
      if (isStableFrom && !isStableTo) {
        // e.g. 3000 USDC -> ~1 ETH
        simulatedOutput = Number((amount / 3200).toFixed(6));
      } else if (!isStableFrom && isStableTo) {
        // e.g. 1 ETH -> ~3200 USDC
        simulatedOutput = Number((amount * 3200 * 0.997).toFixed(2));
      } else {
        // token-to-token or stable-to-stable
        simulatedOutput = Number((amount * 0.997).toFixed(6));
      }

      return {
        success: true,
        chainName: chain.name,
        chainId: chain.id,
        fromToken: fromSymbol,
        toToken: toSymbol,
        amountIn: amount,
        expectedAmountOut: simulatedOutput,
        feeUsd: 0.85,
        estimatedDurationSeconds: 5,
        relayWebUrl,
        simulated: true,
      };
    }

    const res = await this.callRelayQuote({
      user: request.userAddress || '0x0000000000000000000000000000000000000000',
      originChainId: chain.id,
      destinationChainId: chain.id,
      originCurrency: fromAddress,
      destinationCurrency: toAddress,
      amount: (amount * 1e18).toString(),
      tradeType: 'EXACT_INPUT',
    });

    if (!res.ok) {
      return {
        success: false,
        chainName: chain.name,
        chainId: chain.id,
        fromToken: fromSymbol,
        toToken: toSymbol,
        amountIn: amount,
        expectedAmountOut: 0,
        feeUsd: 0,
        estimatedDurationSeconds: 0,
        relayWebUrl,
        simulated: false,
        error: res.err || 'Relay swap quote unavailable.',
      };
    }

    const data = res.data as Record<string, unknown>;
    const details = data.details as Record<string, unknown> | undefined;
    const fees = data.fees as Record<string, unknown> | undefined;
    const currencyOut = details?.currencyOut as Record<string, unknown> | undefined;
    const relayer = fees?.relayer as Record<string, unknown> | undefined;
    const expectedOut = currencyOut?.amount ? Number(currencyOut.amount) / 1e18 : 0;
    const feeUsd = relayer?.amountUsd ? Number(relayer.amountUsd) : 0;
    const timeSec = details?.timeEstimate ? Number(details.timeEstimate) : 0;

    return {
      success: true,
      chainName: chain.name,
      chainId: chain.id,
      fromToken: fromSymbol,
      toToken: toSymbol,
      amountIn: amount,
      expectedAmountOut: expectedOut,
      feeUsd,
      estimatedDurationSeconds: timeSec,
      relayWebUrl,
      simulated: false,
    };
  }

  /**
   * Get a send/transfer quote via Relay.link unified quote API.
   * Send uses a `recipient` field different from `user` to trigger transfer mode.
   */
  public async getSendQuote(request: RelaySendRequest): Promise<RelaySendResult> {
    const chain = this.parseChain(request.chain);
    const tokenSymbol = (request.token || 'ETH').toUpperCase();
    const amount = request.amount;
    const recipient = request.recipientAddress;

    console.log(`[RELAY ADAPTER] Requesting Relay Send Quote: ${amount} ${tokenSymbol} -> ${recipient} on ${chain.name} (${chain.id})`);

    const relayWebUrl = `https://relay.link/bridge?fromChain=${chain.id}&toChain=${chain.id}&amount=${amount}&currency=${encodeURIComponent(tokenSymbol)}&recipient=${encodeURIComponent(recipient)}`;

    if (this.isDryRun) {
      console.log(`[RELAY ADAPTER] DRY_RUN=true -> Generating Relay Send Quote Simulation...`);
      return {
        success: true,
        chainName: chain.name,
        chainId: chain.id,
        tokenSymbol,
        amountIn: amount,
        expectedAmountOut: Number((amount * 0.999).toFixed(6)), // minimal fee for same-chain send
        recipientAddress: recipient,
        feeUsd: 0.35,
        estimatedDurationSeconds: 3,
        relayWebUrl,
        simulated: true,
      };
    }

    const tokenAddress = this.resolveTokenAddress(tokenSymbol, chain.id);
    const res = await this.callRelayQuote({
      user: request.userAddress || '0x0000000000000000000000000000000000000000',
      recipient,
      originChainId: chain.id,
      destinationChainId: chain.id,
      originCurrency: tokenAddress,
      destinationCurrency: tokenAddress,
      amount: (amount * 1e18).toString(),
      tradeType: 'EXACT_INPUT',
    });

    if (!res.ok) {
      return {
        success: false,
        chainName: chain.name,
        chainId: chain.id,
        tokenSymbol,
        amountIn: amount,
        expectedAmountOut: 0,
        recipientAddress: recipient,
        feeUsd: 0,
        estimatedDurationSeconds: 0,
        relayWebUrl,
        simulated: false,
        error: res.err || 'Relay send quote unavailable.',
      };
    }

    const data = res.data as Record<string, unknown>;
    const details = data.details as Record<string, unknown> | undefined;
    const fees = data.fees as Record<string, unknown> | undefined;
    const currencyOut = details?.currencyOut as Record<string, unknown> | undefined;
    const relayer = fees?.relayer as Record<string, unknown> | undefined;
    const expectedOut = currencyOut?.amount ? Number(currencyOut.amount) / 1e18 : 0;
    const feeUsd = relayer?.amountUsd ? Number(relayer.amountUsd) : 0;
    const timeSec = details?.timeEstimate ? Number(details.timeEstimate) : 0;

    return {
      success: true,
      chainName: chain.name,
      chainId: chain.id,
      tokenSymbol,
      amountIn: amount,
      expectedAmountOut: expectedOut,
      recipientAddress: recipient,
      feeUsd,
      estimatedDurationSeconds: timeSec,
      relayWebUrl,
      simulated: false,
    };
  }

  /**
   * Direct execution of Bridge request using WalletService + EVM adapters.
   */
  public async executeBridge(request: RelayQuoteRequest, walletService?: any): Promise<RelayQuoteResult & { txHash?: string; explorerUrl?: string }> {
    const quote = await this.getBridgeQuote(request);
    
    if (this.isDryRun) {
      const simHash = `sim_bridge_${quote.originChainId}_${quote.destinationChainId}_${Date.now()}`;
      const explorerUrl = walletService ? walletService.getExplorerUrl(quote.originChainId, simHash) : `https://robinhoodchain.blockscout.com/tx/${simHash}`;
      return {
        ...quote,
        txHash: simHash,
        explorerUrl,
      };
    }

    // Honest stub: live bridge execution is not enabled. Never fabricate a fill.
    return {
      ...quote,
      success: false,
      error: 'Live bridge execution not enabled for Robinhood Chain. Configure DRY_RUN=false and execution wallet first.',
    };
  }

  /**
   * Direct execution of Swap request using WalletService + EVM adapters.
   */
  public async executeSwap(request: RelaySwapRequest, walletService?: any): Promise<RelaySwapResult & { txHash?: string; explorerUrl?: string }> {
    const quote = await this.getSwapQuote(request);
    
    if (this.isDryRun) {
      const simHash = `sim_swap_${quote.chainId}_${Date.now()}`;
      const explorerUrl = walletService ? walletService.getExplorerUrl(quote.chainId, simHash) : `https://robinhoodchain.blockscout.com/tx/${simHash}`;
      return {
        ...quote,
        txHash: simHash,
        explorerUrl,
      };
    }

    if (!walletService) {
      return quote;
    }

    try {
      const { EVMTradeAdapter } = await import('./evm-adapter.js');
      const evmAdapter = new EVMTradeAdapter();
      const res = await evmAdapter.swapToken({ chain: quote.chainId, fromToken: request.fromToken, toToken: request.toToken, amountEth: request.amount }, walletService);
      return { ...quote, txHash: res.txHash, explorerUrl: res.explorerUrl, simulated: false };
    } catch (err: any) {
      console.warn(`[RELAY ADAPTER] Relay Swap failed (${err.message}). Attempting OpenSea DEX Aggregator fallback...`);
      try {
        const { OpenSeaAdapter } = await import('./opensea-adapter.js');
        const osAdapter = new OpenSeaAdapter();
        const osRes = await osAdapter.executeSwap({ chain: quote.chainId, fromToken: request.fromToken, toToken: request.toToken, amount: request.amount }, walletService);
        return {
          ...quote,
          expectedAmountOut: osRes.expectedAmountOut,
          txHash: osRes.txHash,
          explorerUrl: osRes.explorerUrl,
          simulated: osRes.simulated,
        };
      } catch (osErr: any) {
        return { ...quote, error: `Relay & OpenSea Swaps failed: ${osErr.message}` };
      }
    }
  }

  /**
   * Direct execution of Send request using WalletService + EVM adapter.
   */
  public async executeSend(request: RelaySendRequest, walletService?: any): Promise<RelaySendResult & { txHash?: string; explorerUrl?: string }> {
    const quote = await this.getSendQuote(request);

    if (this.isDryRun) {
      const simHash = `sim_send_${quote.chainId}_${Date.now()}`;
      const explorerUrl = walletService ? walletService.getExplorerUrl(quote.chainId, simHash) : `https://robinhoodchain.blockscout.com/tx/${simHash}`;
      return {
        ...quote,
        txHash: simHash,
        explorerUrl,
      };
    }

    if (!walletService) {
      return quote;
    }

    try {
      const { EVMTradeAdapter } = await import('./evm-adapter.js');
      const evmAdapter = new EVMTradeAdapter();
      const res = await evmAdapter.sendToken({ chain: quote.chainId, recipientAddress: request.recipientAddress, amountEth: request.amount }, walletService);
      return { ...quote, txHash: res.txHash, explorerUrl: res.explorerUrl, simulated: false };
    } catch (err: any) {
      return { ...quote, error: err.message };
    }
  }
}

