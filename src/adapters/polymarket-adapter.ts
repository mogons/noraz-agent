import { isDryRun as isDryRunMode } from '../config/config.js';

export interface PolymarketOutcome {
  name: string;
  price: number;
}

export interface PolymarketMarketData {
  id: string;
  conditionId: string;
  clobTokenId?: string;
  question: string;
  category: 'Crypto' | 'Macro' | 'Politics' | 'Tech' | 'Trending';
  slug: string;
  endDate: string;
  outcomes: PolymarketOutcome[];
  volume24hUsd: number;
  liquidityUsd: number;
  bestBidYes: number | null;
  bestAskYes: number | null;
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

  public async fetchTopMarkets(category: 'Crypto' | 'Macro' | 'Politics' | 'Tech' | 'Trending' = 'Crypto'): Promise<PolymarketMarketData[]> {
    try {
      const response = await fetch(`${this.gammaApiUrl}?limit=20&active=true&closed=false`);
      if (!response.ok) return [];
      const events: any[] = (await response.json()) as any[];
      if (!Array.isArray(events) || events.length === 0) return [];

      const markets: PolymarketMarketData[] = [];
      for (const ev of events) {
        if (!ev.markets || !Array.isArray(ev.markets) || ev.markets.length === 0) continue;
        const m = ev.markets[0];
        let outcomesList: PolymarketOutcome[] = [];
        try {
          if (m.outcomePrices) {
            const prices = JSON.parse(m.outcomePrices);
            outcomesList = [
              { name: 'Yes', price: parseFloat(prices[0] || '0') },
              { name: 'No', price: parseFloat(prices[1] || '0') },
            ];
          }
        } catch {
          outcomesList = [];
        }
        if (outcomesList.length < 2 || !(outcomesList[0].price > 0)) continue;

        let bestBidYes: number | null = null;
        let bestAskYes: number | null = null;
        const clobTokenId = Array.isArray(m.clobTokenIds) ? String(m.clobTokenIds[0] || '') : '';
        if (clobTokenId) {
          try {
            const bookRes = await fetch(`${this.clobApiUrl}/books?token_id=${clobTokenId}`);
            if (bookRes.ok) {
              const book = (await bookRes.json()) as { bids?: Array<{ price: string | number }>; asks?: Array<{ price: string | number }> };
              const bidPrices = (book.bids || []).map((b) => Number(b.price)).filter((n) => n > 0);
              const askPrices = (book.asks || []).map((a) => Number(a.price)).filter((n) => n > 0);
              if (bidPrices.length) bestBidYes = Math.max(...bidPrices);
              if (askPrices.length) bestAskYes = Math.min(...askPrices);
            }
          } catch {
            // leave bid/ask null — do not fabricate
          }
        }

        const volume24hUsd = parseFloat(String(ev.volume24hr ?? m.volume24hr ?? '0')) || 0;
        const liquidityUsd = parseFloat(String(ev.liquidity ?? m.liquidity ?? '0')) || 0;

        markets.push({
          id: String(m.id || ev.id),
          conditionId: String(m.conditionId || ''),
          clobTokenId,
          question: ev.title || m.question || '',
          category: (ev.category || category) as any,
          slug: ev.slug || 'polymarket-event',
          endDate: m.endDate || ev.endDate || new Date().toISOString(),
          outcomes: outcomesList,
          volume24hUsd,
          liquidityUsd,
          bestBidYes,
          bestAskYes,
          url: `https://polymarket.com/event/${ev.slug || m.slug || ev.id}`,
        });
      }
      return markets.filter((m) => category === 'Trending' || m.category === category || category === 'Crypto');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[POLYMARKET GAMMA API FETCH ERROR] ${message}`);
      return [];
    }
  }

  public async placeBet(
    marketId: string,
    outcomeName: 'Yes' | 'No',
    amountUsdc: number
  ): Promise<PolymarketOrderResult> {
    if (this.isDryRun) {
      return {
        success: true,
        orderId: `DRY_RUN_POLY_${Date.now()}_${outcomeName}`,
        filledPrice: 0.5,
        filledAmountUsdc: amountUsdc,
        outcome: outcomeName,
        error: 'DRY_RUN — live Polymarket execution not enabled.',
      };
    }
    return {
      success: false,
      error: 'Live Polymarket execution not yet connected. Configure POLYMARKET_PRIVATE_KEY and DRY_RUN=false.',
    };
  }
}
