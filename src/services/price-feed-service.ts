export class PriceFeedService {
  private cache: Record<string, number> = {
    BTC: 63867.0,
    ETH: 1871.0,
    SOL: 74.12,
    HYPE: 55.3,
  };
  private lastFetchTime = 0;
  private cacheDurationMs = 5 * 60 * 1000; // 5-minute cache

  private symbolToGeckoId: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    HYPE: 'hyperliquid',
  };

  public async getPrice(symbol: string): Promise<number> {
    const cleanSymbol = symbol.toUpperCase().trim();

    // Trigger update if cache expired
    if (Date.now() - this.lastFetchTime > this.cacheDurationMs) {
      await this.refreshPrices();
    }

    return this.cache[cleanSymbol] || this.cache['SOL']; // Return SOL price as fallback if symbol unknown
  }

  private async refreshPrices(): Promise<void> {
    try {
      console.log('[PRICE SERVICE] Fetching real-time crypto prices from CoinGecko...');
      const ids = Object.values(this.symbolToGeckoId).join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`CoinGecko HTTP error: ${response.status}`);
      }

      const data = (await response.json()) as any;

      // Update cache
      for (const [symbol, geckoId] of Object.entries(this.symbolToGeckoId)) {
        if (data[geckoId] && typeof data[geckoId].usd === 'number') {
          this.cache[symbol] = data[geckoId].usd;
        }
      }

      this.lastFetchTime = Date.now();
      console.log('[PRICE SERVICE] Real-time prices synchronized successfully:', JSON.stringify(this.cache));
    } catch (err: any) {
      console.warn('[PRICE SERVICE ERROR] Failed to fetch real-time prices. Using local fallback cache:', err.message);
      // We don't crash, we just keep using the fallback cache values
    }
  }
}
