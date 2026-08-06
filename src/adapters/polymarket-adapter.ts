export interface PolymarketOutcome {
  name: string; // e.g. "Yes", "No"
  price: number; // Probability / Price in USD (0.00 - 1.00)
}

export interface PolymarketMarketData {
  id: string;
  conditionId: string;
  question: string;
  category: 'Crypto' | 'Macro' | 'Politics' | 'Tech' | 'Trending';
  slug: string;
  endDate: string;
  outcomes: PolymarketOutcome[];
  volume24hUsd: number;
  liquidityUsd: number;
  bestBidYes: number;
  bestAskYes: number;
  url: string;
}

export interface PolymarketOrderResult {
  success: boolean;
  orderId?: string;
  filledPrice?: number;
  filledAmountUsdc?: number;
  outcome?: string;
  error?: string;
}

export class PolymarketAdapter {
  private gammaApiUrl = 'https://gamma-api.polymarket.com/events';
  private clobApiUrl = 'https://clob.polymarket.com';
  private isDryRun: boolean;

  constructor() {
    this.isDryRun = process.env.DRY_RUN !== 'false';
  }

  /**
   * Fetch active markets from Polymarket across categories (Crypto, Macro, Politics, Tech, Trending)
   */
  public async fetchTopMarkets(category: 'Crypto' | 'Macro' | 'Politics' | 'Tech' | 'Trending' = 'Crypto'): Promise<PolymarketMarketData[]> {
    try {
      console.log(`[POLYMARKET ADAPTER] Fetching top markets for category: ${category}...`);

      /*
      // PRODUCTION: Fetch from Polymarket Gamma API
      const response = await fetch(`${this.gammaApiUrl}?limit=20&active=true&closed=false`);
      const data = await response.json();
      // map data to PolymarketMarketData
      */

      // Sample active Polymarket prediction markets for development/simulation
      const sampleMarkets: PolymarketMarketData[] = [
        {
          id: 'poly_btc_70k_aug',
          conditionId: '0x1234567890abcdef1234567890abcdef12345678',
          question: 'Will Bitcoin reach $70,000 in August 2026?',
          category: 'Crypto',
          slug: 'will-bitcoin-reach-70k-in-august-2026',
          endDate: '2026-08-31T23:59:59Z',
          outcomes: [
            { name: 'Yes', price: 0.68 },
            { name: 'No', price: 0.32 },
          ],
          volume24hUsd: 1850000,
          liquidityUsd: 420000,
          bestBidYes: 0.67,
          bestAskYes: 0.69,
          url: 'https://polymarket.com/event/will-bitcoin-reach-70k-in-august-2026',
        },
        {
          id: 'poly_sol_etf_2026',
          conditionId: '0xabcdef1234567890abcdef1234567890abcdef12',
          question: 'Will a Solana Spot ETF be approved by end of Q3 2026?',
          category: 'Crypto',
          slug: 'solana-spot-etf-approved-q3-2026',
          endDate: '2026-09-30T23:59:59Z',
          outcomes: [
            { name: 'Yes', price: 0.42 },
            { name: 'No', price: 0.58 },
          ],
          volume24hUsd: 950000,
          liquidityUsd: 210000,
          bestBidYes: 0.41,
          bestAskYes: 0.43,
          url: 'https://polymarket.com/event/solana-spot-etf-approved-q3-2026',
        },
        {
          id: 'poly_fed_rate_cut_sep',
          conditionId: '0x7890abcdef1234567890abcdef1234567890abcd',
          question: 'Will the US Fed cut interest rates by 25+ bps in September?',
          category: 'Macro',
          slug: 'fed-cut-rates-september-2026',
          endDate: '2026-09-18T23:59:59Z',
          outcomes: [
            { name: 'Yes', price: 0.94 },
            { name: 'No', price: 0.06 },
          ],
          volume24hUsd: 3200000,
          liquidityUsd: 1100000,
          bestBidYes: 0.93,
          bestAskYes: 0.95,
          url: 'https://polymarket.com/event/fed-cut-rates-september-2026',
        },
      ];

      return sampleMarkets.filter(m => category === 'Trending' || m.category === category);
    } catch (err: any) {
      console.error('[POLYMARKET ADAPTER ERROR]', err.message);
      return [];
    }
  }

  /**
   * Execute a bet on Polymarket (supports DRY_RUN simulation)
   */
  public async placeBet(
    marketId: string,
    outcomeName: 'Yes' | 'No',
    amountUsdc: number
  ): Promise<PolymarketOrderResult> {
    console.log(`[POLYMARKET] ${this.isDryRun ? '[DRY_RUN]' : '[LIVE]'} Placing ${outcomeName} bet on market: ${marketId} | Amount: $${amountUsdc} USDC`);

    if (this.isDryRun) {
      return {
        success: true,
        orderId: `DRY_RUN_POLY_${Date.now()}_${outcomeName}`,
        filledPrice: outcomeName === 'Yes' ? 0.68 : 0.32,
        filledAmountUsdc: amountUsdc,
        outcome: outcomeName,
      };
    }

    return {
      success: false,
      error: 'Live Polymarket execution not yet connected. Set DRY_RUN=false and configure POLYMARKET_PRIVATE_KEY.',
    };
  }
}
