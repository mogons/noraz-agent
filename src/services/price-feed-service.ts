export class PriceFeedService {
  private cache: Record<string, number> = {};
  private lastFetchTime = 0;
  private cacheDurationMs = 60 * 1000;

  private symbolToGeckoId: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    HYPE: 'hyperliquid',
    BONK: 'bonk',
    PEPE: 'pepe',
    WIF: 'dogwifcoin',
    DOGE: 'dogecoin',
    AVAX: 'avalanche-2',
    SUI: 'sui',
    LINK: 'chainlink',
  };

  public async getPrice(symbol: string): Promise<number | null> {
    const cleanSymbol = symbol.toUpperCase().trim();
    const geckoId = this.symbolToGeckoId[cleanSymbol];
    if (!geckoId) {
      console.warn(`[PRICE SERVICE] Unsupported symbol "${symbol}" — returning null.`);
      return null;
    }
    if (Date.now() - this.lastFetchTime > this.cacheDurationMs) {
      await this.refreshPrices();
    }
    return this.cache[cleanSymbol] ?? null;
  }

  private async refreshPrices(): Promise<void> {
    try {
      const ids = Object.values(this.symbolToGeckoId).join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`CoinGecko HTTP error: ${response.status}`);
      }
      const data = (await response.json()) as Record<string, { usd?: number }>;
      for (const [symbol, geckoId] of Object.entries(this.symbolToGeckoId)) {
        const price = data[geckoId]?.usd;
        if (typeof price === 'number' && price > 0) {
          this.cache[symbol] = price;
        }
      }
      this.lastFetchTime = Date.now();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[PRICE SERVICE ERROR] Failed to fetch prices: ${message}`);
    }
  }
}
