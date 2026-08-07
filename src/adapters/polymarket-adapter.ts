import { isDryRun as isDryRunMode } from '../config/config.js';

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
    this.isDryRun = isDryRunMode();
  }

  /**
   * Fetch active markets from Polymarket across categories (Crypto, Macro, Politics, Tech, Trending)
   */
  public async fetchTopMarkets(category: 'Crypto' | 'Macro' | 'Politics' | 'Tech' | 'Trending' = 'Crypto'): Promise<PolymarketMarketData[]> {
    try {
      console.log(`[POLYMARKET ADAPTER] Fetching live top markets for category: ${category} via Gamma API...`);
      const response = await fetch(`${this.gammaApiUrl}?limit=20&active=true&closed=false`);
      if (response.ok) {
        const events: any[] = (await response.json()) as any[];
        if (Array.isArray(events) && events.length > 0) {
          const markets: PolymarketMarketData[] = [];
          for (const ev of events) {
            if (!ev.markets || !Array.isArray(ev.markets) || ev.markets.length === 0) continue;
            const m = ev.markets[0];
            let outcomesList: PolymarketOutcome[] = [
              { name: 'Yes', price: 0.5 },
              { name: 'No', price: 0.5 },
            ];
            try {
              if (m.outcomePrices) {
                const prices = JSON.parse(m.outcomePrices);
                outcomesList = [
                  { name: 'Yes', price: parseFloat(prices[0] || '0.5') },
                  { name: 'No', price: parseFloat(prices[1] || '0.5') },
                ];
              }
            } catch {
              // fallback
            }

            markets.push({
              id: String(m.id || ev.id),
              conditionId: String(m.conditionId || `0x${ev.id}`),
              question: ev.title || m.question || 'Polymarket Event',
              category: (ev.category || category) as any,
              slug: ev.slug || 'polymarket-event',
              endDate: m.endDate || ev.endDate || new Date().toISOString(),
              outcomes: outcomesList,
              volume24hUsd: parseFloat(ev.volume24hr || m.volume24hr || '100000'),
              liquidityUsd: parseFloat(ev.liquidity || m.liquidity || '50000'),
              bestBidYes: Math.max(0.01, outcomesList[0].price - 0.01),
              bestAskYes: Math.min(0.99, outcomesList[0].price + 0.01),
              url: `https://polymarket.com/event/${ev.slug || m.slug || ev.id}`,
            });
          }
          if (markets.length > 0) {
            return markets.filter(m => category === 'Trending' || m.category === category || category === 'Crypto');
          }
        }
      }
    } catch (err: any) {
      console.error('[POLYMARKET GAMMA API FETCH ERROR]', err.message);
    }

    const fallbackMarkets: PolymarketMarketData[] = [
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

    return fallbackMarkets.filter(m => category === 'Trending' || m.category === category);
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
