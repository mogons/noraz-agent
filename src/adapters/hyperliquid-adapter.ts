/**
 * Hyperliquid Perpetual Futures Adapter
 * 
 * Connects to Hyperliquid L1 DEX for reading market data (Open Interest, Funding Rates,
 * Order Book depth) and executing perpetual futures trades.
 * 
 * Uses @nktkas/hyperliquid SDK pattern (InfoClient for reads, ExchangeClient for writes).
 * API Docs: https://hyperliquid.gitbook.io/hyperliquid-docs
 */

export interface HyperliquidMarketData {
  coin: string;           // e.g. "BTC", "ETH", "SOL", "HYPE"
  assetIndex: number;     // Hyperliquid numeric asset index
  markPriceUsd: number;
  midPriceUsd: number;
  openInterestUsd: number;
  oiChange1hPercent: number;   // Open Interest % change in last 1 hour
  oiChange4hPercent: number;   // Open Interest % change in last 4 hours
  volume1hUsd: number;
  volume4hUsd: number;
  volume24hUsd: number;
  fundingRate8h: number;       // Current 8-hour funding rate (e.g. 0.0005 = 0.05%)
  fundingRateAnnualized: number;
  bestBidUsd: number;
  bestAskUsd: number;
  spreadPercent: number;       // Bid-Ask spread as percentage
}

export interface HyperliquidPerpsSignal {
  coin: string;
  assetIndex: number;
  direction: 'LONG' | 'SHORT';
  confidence: number;          // 0-100 consensus score
  entryPriceUsd: number;
  suggestedLeverage: number;   // e.g. 3, 5, 10
  stopLossPercent: number;     // e.g. 5 = -5% from entry
  takeProfitPercent: number;   // e.g. 15 = +15% from entry
  marketData: HyperliquidMarketData;
  signalReasons: string[];     // Human-readable reasoning array
  aiThesis: string;            // AI-generated thesis summary
}

export interface HyperliquidOrderResult {
  success: boolean;
  orderId?: string;
  filledPrice?: number;
  filledSize?: number;
  error?: string;
}

export class HyperliquidAdapter {
  private infoApiUrl = 'https://api.hyperliquid.xyz/info';
  private exchangeApiUrl = 'https://api.hyperliquid.xyz/exchange';
  private isDryRun: boolean;

  // Asset index mapping for all tracked coins on Hyperliquid
  // NOTE: Indices must be verified against live Hyperliquid meta() response
  private assetMap: Record<string, number> = {
    // Primary Watchlist (always analyzed every screening pass)
    BTC: 0, ETH: 1, SOL: 4, HYPE: 132,
    GOLD: 200, XYZ100: 201, OIL: 202,
    // Secondary Pool (only analyzed when volume/OI triggers are exceptional)
    ARB: 11, DOGE: 3, WIF: 98, PEPE: 51,
    BONK: 80, ONDO: 115, SUI: 42, AVAX: 7,
    LINK: 6, OP: 19, TIA: 72, JUP: 99,
    W: 116, RENDER: 65, INJ: 43, SEI: 62,
    TRX: 15, BNB: 2, PENGU: 180, ADA: 5,
  };

  // Primary tickers: always screened every pass
  public readonly primaryWatchlist: string[] = ['BTC', 'ETH', 'SOL', 'HYPE', 'GOLD', 'XYZ100', 'OIL'];

  // Secondary tickers: only screened when exceptional opportunity is detected
  public readonly secondaryPool: string[] = [
    'ARB', 'DOGE', 'WIF', 'PEPE', 'BONK', 'ONDO', 'SUI', 'AVAX',
    'LINK', 'OP', 'TIA', 'JUP', 'W', 'RENDER', 'INJ', 'SEI',
    'TRX', 'BNB', 'PENGU', 'ADA',
  ];

  constructor() {
    this.isDryRun = process.env.DRY_RUN !== 'false';
  }

  /**
   * Fetch real-time market data for a specific coin from Hyperliquid Info API
   */
  public async fetchMarketData(coin: string): Promise<HyperliquidMarketData | null> {
    try {
      const upperCoin = coin.toUpperCase();
      const assetIndex = this.assetMap[upperCoin];
      if (assetIndex === undefined) {
        console.warn(`[HYPERLIQUID] Unknown coin: ${upperCoin}. Not in asset map.`);
        return null;
      }

      console.log(`[HYPERLIQUID] Fetching market data for ${upperCoin} (Asset #${assetIndex})...`);

      /*
      // PRODUCTION: Call Hyperliquid Info API
      const response = await fetch(this.infoApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });
      const [meta, assetCtxs] = await response.json();
      const ctx = assetCtxs[assetIndex];
      */

      // Simulated market data (replaced by live API calls in production)
      return {
        coin: upperCoin,
        assetIndex,
        markPriceUsd: upperCoin === 'BTC' ? 63867 : upperCoin === 'ETH' ? 1871 : upperCoin === 'SOL' ? 74.12 : 55.3,
        midPriceUsd: upperCoin === 'BTC' ? 63865 : upperCoin === 'ETH' ? 1870.5 : upperCoin === 'SOL' ? 74.1 : 55.28,
        openInterestUsd: upperCoin === 'BTC' ? 485000000 : upperCoin === 'ETH' ? 210000000 : 45000000,
        oiChange1hPercent: 8.5,   // +8.5% OI surge in 1h (simulated bullish)
        oiChange4hPercent: 22.4,  // +22.4% OI surge in 4h
        volume1hUsd: upperCoin === 'BTC' ? 120000000 : upperCoin === 'ETH' ? 68000000 : 12000000,
        volume4hUsd: upperCoin === 'BTC' ? 380000000 : upperCoin === 'ETH' ? 195000000 : 38000000,
        volume24hUsd: upperCoin === 'BTC' ? 1200000000 : upperCoin === 'ETH' ? 580000000 : 95000000,
        fundingRate8h: 0.00035,    // 0.035% per 8h (mildly bullish)
        fundingRateAnnualized: 0.00035 * 3 * 365 * 100, // Annualized %
        bestBidUsd: upperCoin === 'BTC' ? 63860 : upperCoin === 'ETH' ? 1870 : upperCoin === 'SOL' ? 74.08 : 55.25,
        bestAskUsd: upperCoin === 'BTC' ? 63870 : upperCoin === 'ETH' ? 1872 : upperCoin === 'SOL' ? 74.14 : 55.32,
        spreadPercent: 0.015,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[HYPERLIQUID ERROR] Failed to fetch market data for ${coin}:`, message);
      return null;
    }
  }

  /**
   * Fetch market data for all tracked coins
   */
  public async fetchAllMarketData(): Promise<HyperliquidMarketData[]> {
    const results: HyperliquidMarketData[] = [];
    for (const coin of Object.keys(this.assetMap)) {
      const data = await this.fetchMarketData(coin);
      if (data) results.push(data);
    }
    return results;
  }

  /**
   * Execute a perpetual futures order on Hyperliquid (supports DRY_RUN simulation)
   */
  public async placeOrder(
    coin: string,
    isBuy: boolean,
    sizeUsd: number,
    leverage: number,
    limitPrice?: number,
  ): Promise<HyperliquidOrderResult> {
    const upperCoin = coin.toUpperCase();
    const assetIndex = this.assetMap[upperCoin];
    if (assetIndex === undefined) {
      return { success: false, error: `Unknown coin: ${upperCoin}` };
    }

    const side = isBuy ? 'LONG' : 'SHORT';
    console.log(`[HYPERLIQUID] ${this.isDryRun ? '[DRY_RUN]' : '[LIVE]'} Placing ${side} order: ${upperCoin} | Size: $${sizeUsd} | Leverage: ${leverage}x`);

    if (this.isDryRun) {
      // Simulate successful fill at mid-market price
      const marketData = await this.fetchMarketData(upperCoin);
      const fillPrice = marketData?.midPriceUsd || 0;
      const fillSize = sizeUsd / fillPrice;

      console.log(`[HYPERLIQUID] [DRY_RUN] Simulated fill: ${fillSize.toFixed(6)} ${upperCoin} @ $${fillPrice.toFixed(2)}`);

      return {
        success: true,
        orderId: `DRY_RUN_${Date.now()}_${upperCoin}_${side}`,
        filledPrice: fillPrice,
        filledSize: fillSize,
      };
    }

    // PRODUCTION: Use ExchangeClient from @nktkas/hyperliquid
    /*
    const wallet = privateKeyToAccount(process.env.HYPERLIQUID_PRIVATE_KEY as `0x${string}`);
    const transport = new HttpTransport();
    const exchange = new ExchangeClient({ transport, wallet });

    // Set leverage first
    await exchange.updateLeverage({ asset: assetIndex, isCross: true, leverage });

    // Place market order
    const result = await exchange.order({
      orders: [{
        a: assetIndex,
        b: isBuy,
        p: limitPrice?.toString() || '0', // 0 = market order
        s: (sizeUsd / midPrice).toFixed(6),
        r: false,
        t: { limit: { tif: 'Ioc' } }, // Immediate-or-Cancel for market-like fills
      }],
      grouping: 'na',
    });
    */

    return { success: false, error: 'Live trading not yet connected. Set DRY_RUN=false and configure HYPERLIQUID_PRIVATE_KEY.' };
  }

  /**
   * Close an existing position (reduce-only order)
   */
  public async closePosition(coin: string, positionSizeUsd: number, isBuy: boolean): Promise<HyperliquidOrderResult> {
    console.log(`[HYPERLIQUID] ${this.isDryRun ? '[DRY_RUN]' : '[LIVE]'} Closing ${isBuy ? 'LONG' : 'SHORT'} position: ${coin} | Size: $${positionSizeUsd}`);

    if (this.isDryRun) {
      const marketData = await this.fetchMarketData(coin);
      return {
        success: true,
        orderId: `DRY_RUN_CLOSE_${Date.now()}_${coin}`,
        filledPrice: marketData?.midPriceUsd || 0,
        filledSize: positionSizeUsd / (marketData?.midPriceUsd || 1),
      };
    }

    return { success: false, error: 'Live close not yet connected.' };
  }

  /**
   * Get current user positions (read from Hyperliquid Info API)
   */
  public async getUserPositions(walletAddress: string): Promise<Array<{ coin: string; sizeUsd: number; entryPx: number; unrealizedPnl: number; leverage: number; side: 'LONG' | 'SHORT' }>> {
    console.log(`[HYPERLIQUID] Fetching open positions for wallet: ${walletAddress.slice(0, 10)}...`);

    /*
    // PRODUCTION: Call Info API
    const response = await fetch(this.infoApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: walletAddress }),
    });
    const data = await response.json();
    return data.assetPositions.map(...);
    */

    // Return empty array for simulation (positions tracked in PositionManager)
    return [];
  }
}
