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

  // In-memory OI snapshots for computing OI change % over time
  private oiSnapshots: Map<string, Array<{ ts: number; oi: number }>> = new Map();

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

      console.log(`[HYPERLIQUID] Fetching live market data for ${upperCoin} (Asset #${assetIndex})...`);

      // Call Hyperliquid Info API for real-time market data
      const response = await fetch(this.infoApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });

      if (!response.ok) {
        console.error(`[HYPERLIQUID] API HTTP error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: any = await response.json();
      if (!Array.isArray(data) || data.length < 2) {
        console.error('[HYPERLIQUID] Unexpected API response format');
        return null;
      }

      const [meta, assetCtxs] = data;
      if (!Array.isArray(assetCtxs) || assetIndex >= assetCtxs.length) {
        console.error(`[HYPERLIQUID] Asset index ${assetIndex} out of bounds (total: ${assetCtxs?.length || 0})`);
        return null;
      }

      const ctx = assetCtxs[assetIndex];
      const markPx = parseFloat(ctx.markPx || '0');
      const midPx = parseFloat(ctx.midPx || '0');
      const openInterest = parseFloat(ctx.openInterest || '0');
      const funding = parseFloat(ctx.funding || '0');
      const dayNtlVlm = parseFloat(ctx.dayNtlVlm || '0');

      // Compute OI change from cached snapshots (in-memory tracking)
      const now = Date.now();
      const oiKey = upperCoin;
      if (!this.oiSnapshots.has(oiKey)) {
        this.oiSnapshots.set(oiKey, []);
      }
      const snapshots = this.oiSnapshots.get(oiKey)!;
      snapshots.push({ ts: now, oi: openInterest * markPx });
      // Keep only last 5 hours of snapshots
      const fiveHoursAgo = now - 5 * 3600000;
      while (snapshots.length > 0 && snapshots[0].ts < fiveHoursAgo) {
        snapshots.shift();
      }

      const currentOiUsd = openInterest * markPx;
      const oneHourAgo = now - 3600000;
      const fourHoursAgo = now - 4 * 3600000;
      const oi1hRef = snapshots.find(s => s.ts <= oneHourAgo)?.oi || currentOiUsd;
      const oi4hRef = snapshots.find(s => s.ts <= fourHoursAgo)?.oi || currentOiUsd;
      const oiChange1hPercent = oi1hRef > 0 ? ((currentOiUsd - oi1hRef) / oi1hRef) * 100 : 0;
      const oiChange4hPercent = oi4hRef > 0 ? ((currentOiUsd - oi4hRef) / oi4hRef) * 100 : 0;

      // Fetch L2 order book for bid/ask spread
      let bestBid = midPx * 0.999;
      let bestAsk = midPx * 1.001;
      try {
        const l2Res = await fetch(this.infoApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'l2Book', coin: upperCoin }),
        });
        if (l2Res.ok) {
          const l2: any = await l2Res.json();
          if (l2.levels && Array.isArray(l2.levels) && l2.levels.length >= 2) {
            const bids = l2.levels[0];
            const asks = l2.levels[1];
            if (bids.length > 0) bestBid = parseFloat(bids[0].px);
            if (asks.length > 0) bestAsk = parseFloat(asks[0].px);
          }
        }
      } catch { /* L2 fetch is best-effort */ }

      const spreadPct = midPx > 0 ? ((bestAsk - bestBid) / midPx) * 100 : 0;

      return {
        coin: upperCoin,
        assetIndex,
        markPriceUsd: markPx,
        midPriceUsd: midPx,
        openInterestUsd: currentOiUsd,
        oiChange1hPercent,
        oiChange4hPercent,
        volume1hUsd: dayNtlVlm / 24,     // Approximate 1h from 24h volume
        volume4hUsd: (dayNtlVlm / 24) * 4,
        volume24hUsd: dayNtlVlm,
        fundingRate8h: funding,
        fundingRateAnnualized: funding * 3 * 365 * 100,
        bestBidUsd: bestBid,
        bestAskUsd: bestAsk,
        spreadPercent: spreadPct,
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
