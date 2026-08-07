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
  // Ethereum Mainnet
  1: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
  // Base L2
  8453: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  },
  // Arbitrum One
  42161: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  // OP Mainnet
  10: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    OP: '0x4200000000000000000000000000000000000042',
  },
  // Polygon
  137: {
    MATIC: '0x0000000000000000000000000000000000000000',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  // BNB Smart Chain
  56: {
    BNB: '0x0000000000000000000000000000000000000000',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  },
};

export class RelayAdapter {
  private isDryRun: boolean;

  private chainMap: Record<string, { id: number; name: string }> = {
    '1': { id: 1, name: 'Ethereum Mainnet' },
    eth: { id: 1, name: 'Ethereum Mainnet' },
    ethereum: { id: 1, name: 'Ethereum Mainnet' },

    '8453': { id: 8453, name: 'Base L2' },
    base: { id: 8453, name: 'Base L2' },

    '42161': { id: 42161, name: 'Arbitrum One' },
    arb: { id: 42161, name: 'Arbitrum One' },
    arbitrum: { id: 42161, name: 'Arbitrum One' },

    '10': { id: 10, name: 'OP Mainnet' },
    op: { id: 10, name: 'OP Mainnet' },
    optimism: { id: 10, name: 'OP Mainnet' },

    '137': { id: 137, name: 'Polygon L2' },
    poly: { id: 137, name: 'Polygon L2' },
    polygon: { id: 137, name: 'Polygon L2' },

    '56': { id: 56, name: 'BNB Smart Chain' },
    bsc: { id: 56, name: 'BNB Smart Chain' },
    binance: { id: 56, name: 'BNB Smart Chain' },

    '792703809': { id: 792703809, name: 'Solana' },
    sol: { id: 792703809, name: 'Solana' },
    solana: { id: 792703809, name: 'Solana' },

    '7777777': { id: 7777777, name: 'Zora Network' },
    zora: { id: 7777777, name: 'Zora Network' },
  };

  constructor() {
    this.isDryRun = isDryRunMode();
  }

  public parseChain(input: string | number): { id: number; name: string } {
    const strKey = String(input).toLowerCase().trim();
    if (this.chainMap[strKey]) {
      return this.chainMap[strKey];
    }
    return { id: Number(input) || 1, name: `Chain #${input}` };
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

    try {
      const apiUrl = 'https://api.relay.link/quote/v2';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: request.userAddress || '0x0000000000000000000000000000000000000000',
          originChainId: origin.id,
          destinationChainId: destination.id,
          currency: tokenSymbol,
          amount: (amount * 1e18).toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Relay API returned HTTP ${response.status}`);
      }

      const data: Record<string, unknown> = await response.json() as Record<string, unknown>;
      const details = data.details as Record<string, unknown> | undefined;
      const fees = data.fees as Record<string, unknown> | undefined;
      const currencyOut = details?.currencyOut as Record<string, unknown> | undefined;
      const relayer = fees?.relayer as Record<string, unknown> | undefined;
      const expectedOut = currencyOut?.amount ? Number(currencyOut.amount) / 1e18 : amount * 0.9985;
      const feeUsd = relayer?.amountUsd ? Number(relayer.amountUsd) : 1.25;
      const timeSec = details?.timeEstimate ? Number(details.timeEstimate) : 15;

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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[RELAY ADAPTER] Relay API live call fallback (${errMsg}). Using Relay Web Link.`);
      return {
        success: true,
        originChainName: origin.name,
        originChainId: origin.id,
        destinationChainName: destination.name,
        destinationChainId: destination.id,
        amountIn: amount,
        expectedAmountOut: Number((amount * 0.9985).toFixed(6)),
        tokenSymbol,
        feeUsd: 1.25,
        estimatedDurationSeconds: 15,
        relayWebUrl,
        simulated: true,
      };
    }
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

    try {
      const apiUrl = 'https://api.relay.link/quote/v2';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: request.userAddress || '0x0000000000000000000000000000000000000000',
          originChainId: chain.id,
          destinationChainId: chain.id,
          originCurrency: fromAddress,
          destinationCurrency: toAddress,
          amount: (amount * 1e18).toString(),
          tradeType: 'EXACT_INPUT',
        }),
      });

      if (!response.ok) {
        throw new Error(`Relay Swap API returned HTTP ${response.status}`);
      }

      const data: Record<string, unknown> = await response.json() as Record<string, unknown>;
      const details = data.details as Record<string, unknown> | undefined;
      const fees = data.fees as Record<string, unknown> | undefined;
      const currencyOut = details?.currencyOut as Record<string, unknown> | undefined;
      const relayer = fees?.relayer as Record<string, unknown> | undefined;
      const expectedOut = currencyOut?.amount ? Number(currencyOut.amount) / 1e18 : amount * 0.997;
      const feeUsd = relayer?.amountUsd ? Number(relayer.amountUsd) : 0.85;
      const timeSec = details?.timeEstimate ? Number(details.timeEstimate) : 5;

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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[RELAY ADAPTER] Relay Swap API fallback (${errMsg}). Using Relay Web Link.`);
      return {
        success: true,
        chainName: chain.name,
        chainId: chain.id,
        fromToken: fromSymbol,
        toToken: toSymbol,
        amountIn: amount,
        expectedAmountOut: Number((amount * 0.997).toFixed(6)),
        feeUsd: 0.85,
        estimatedDurationSeconds: 5,
        relayWebUrl,
        simulated: true,
      };
    }
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

    try {
      const tokenAddress = this.resolveTokenAddress(tokenSymbol, chain.id);
      const apiUrl = 'https://api.relay.link/quote/v2';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: request.userAddress || '0x0000000000000000000000000000000000000000',
          recipient,
          originChainId: chain.id,
          destinationChainId: chain.id,
          originCurrency: tokenAddress,
          destinationCurrency: tokenAddress,
          amount: (amount * 1e18).toString(),
          tradeType: 'EXACT_INPUT',
        }),
      });

      if (!response.ok) {
        throw new Error(`Relay Send API returned HTTP ${response.status}`);
      }

      const data: Record<string, unknown> = await response.json() as Record<string, unknown>;
      const details = data.details as Record<string, unknown> | undefined;
      const fees = data.fees as Record<string, unknown> | undefined;
      const currencyOut = details?.currencyOut as Record<string, unknown> | undefined;
      const relayer = fees?.relayer as Record<string, unknown> | undefined;
      const expectedOut = currencyOut?.amount ? Number(currencyOut.amount) / 1e18 : amount * 0.999;
      const feeUsd = relayer?.amountUsd ? Number(relayer.amountUsd) : 0.35;
      const timeSec = details?.timeEstimate ? Number(details.timeEstimate) : 3;

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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[RELAY ADAPTER] Relay Send API fallback (${errMsg}). Using Relay Web Link.`);
      return {
        success: true,
        chainName: chain.name,
        chainId: chain.id,
        tokenSymbol,
        amountIn: amount,
        expectedAmountOut: Number((amount * 0.999).toFixed(6)),
        recipientAddress: recipient,
        feeUsd: 0.35,
        estimatedDurationSeconds: 3,
        relayWebUrl,
        simulated: true,
      };
    }
  }

  /**
   * Direct execution of Bridge request using WalletService + EVM/Solana adapters.
   */
  public async executeBridge(request: RelayQuoteRequest, walletService?: any): Promise<RelayQuoteResult & { txHash?: string; explorerUrl?: string }> {
    const quote = await this.getBridgeQuote(request);
    
    if (this.isDryRun) {
      const simHash = `sim_bridge_${quote.originChainId}_${quote.destinationChainId}_${Date.now()}`;
      const explorerUrl = walletService ? walletService.getExplorerUrl(quote.originChainId, simHash) : `https://etherscan.io/tx/${simHash}`;
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
      if (quote.originChainId === 792703809) {
        const { SolanaTradeAdapter } = await import('./solana-adapter.js');
        const solanaAdapter = new SolanaTradeAdapter();
        const res = await solanaAdapter.sendToken({ recipientAddress: quote.relayWebUrl, amountSol: request.amount }, walletService);
        return { ...quote, txHash: res.txHash, explorerUrl: res.explorerUrl, simulated: false };
      } else {
        const { EVMTradeAdapter } = await import('./evm-adapter.js');
        const evmAdapter = new EVMTradeAdapter();
        const res = await evmAdapter.swapToken({ chain: quote.originChainId, fromToken: request.tokenSymbol || 'ETH', toToken: request.tokenSymbol || 'ETH', amountEth: request.amount }, walletService);
        return { ...quote, txHash: res.txHash, explorerUrl: res.explorerUrl, simulated: false };
      }
    } catch (err: any) {
      return { ...quote, error: err.message };
    }
  }

  /**
   * Direct execution of Swap request using WalletService + EVM/Solana adapters.
   */
  public async executeSwap(request: RelaySwapRequest, walletService?: any): Promise<RelaySwapResult & { txHash?: string; explorerUrl?: string }> {
    const quote = await this.getSwapQuote(request);
    
    if (this.isDryRun) {
      const simHash = `sim_swap_${quote.chainId}_${Date.now()}`;
      const explorerUrl = walletService ? walletService.getExplorerUrl(quote.chainId, simHash) : `https://etherscan.io/tx/${simHash}`;
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
      if (quote.chainId === 792703809) {
        const { SolanaTradeAdapter } = await import('./solana-adapter.js');
        const solanaAdapter = new SolanaTradeAdapter();
        const res = await solanaAdapter.swapToken({ inputMint: request.fromToken, outputMint: request.toToken, amountSol: request.amount }, walletService);
        return { ...quote, txHash: res.txHash, explorerUrl: res.explorerUrl, simulated: false };
      } else {
        const { EVMTradeAdapter } = await import('./evm-adapter.js');
        const evmAdapter = new EVMTradeAdapter();
        const res = await evmAdapter.swapToken({ chain: quote.chainId, fromToken: request.fromToken, toToken: request.toToken, amountEth: request.amount }, walletService);
        return { ...quote, txHash: res.txHash, explorerUrl: res.explorerUrl, simulated: false };
      }
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
   * Direct execution of Send request using WalletService + EVM/Solana adapters.
   */
  public async executeSend(request: RelaySendRequest, walletService?: any): Promise<RelaySendResult & { txHash?: string; explorerUrl?: string }> {
    const quote = await this.getSendQuote(request);

    if (this.isDryRun) {
      const simHash = `sim_send_${quote.chainId}_${Date.now()}`;
      const explorerUrl = walletService ? walletService.getExplorerUrl(quote.chainId, simHash) : `https://etherscan.io/tx/${simHash}`;
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
      if (quote.chainId === 792703809) {
        const { SolanaTradeAdapter } = await import('./solana-adapter.js');
        const solanaAdapter = new SolanaTradeAdapter();
        const res = await solanaAdapter.sendToken({ recipientAddress: request.recipientAddress, amountSol: request.amount }, walletService);
        return { ...quote, txHash: res.txHash, explorerUrl: res.explorerUrl, simulated: false };
      } else {
        const { EVMTradeAdapter } = await import('./evm-adapter.js');
        const evmAdapter = new EVMTradeAdapter();
        const res = await evmAdapter.sendToken({ chain: quote.chainId, recipientAddress: request.recipientAddress, amountEth: request.amount }, walletService);
        return { ...quote, txHash: res.txHash, explorerUrl: res.explorerUrl, simulated: false };
      }
    } catch (err: any) {
      return { ...quote, error: err.message };
    }
  }
}

