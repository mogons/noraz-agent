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
    this.isDryRun = process.env.DRY_RUN !== 'false';
  }

  public parseChain(input: string | number): { id: number; name: string } {
    const strKey = String(input).toLowerCase().trim();
    if (this.chainMap[strKey]) {
      return this.chainMap[strKey];
    }
    return { id: Number(input) || 1, name: `Chain #${input}` };
  }

  public constructRelayUrl(originChainId: number, destinationChainId: number, amount: number, tokenSymbol: string): string {
    return `https://relay.link/bridge?fromChain=${originChainId}&toChain=${destinationChainId}&amount=${amount}&currency=${encodeURIComponent(tokenSymbol)}`;
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

      const data: any = await response.json();
      const expectedOut = data.details?.currencyOut?.amount ? Number(data.details.currencyOut.amount) / 1e18 : amount * 0.9985;
      const feeUsd = data.fees?.relayer?.amountUsd ? Number(data.fees.relayer.amountUsd) : 1.25;
      const timeSec = data.details?.timeEstimate ? Number(data.details.timeEstimate) : 15;

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
    } catch (err: any) {
      console.warn(`[RELAY ADAPTER] Relay API live call fallback (${err.message}). Using Relay Web Link.`);
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
}
