import { OpenSeaAdapter, OpenSeaNFTSignal, OpenSeaWhaleInfo } from '../../adapters/opensea-adapter.js';

export interface NFTSnipingReport {
  collectionSlug: string;
  collectionName: string;
  tokenId: string;
  name: string;
  chain: 'ethereum' | 'polygon' | 'base' | 'arbitrum' | 'robinhood';
  priceEth: number;
  floorPriceEth: number;
  floorSurge4hPct: number;
  volumeSpike4hRatio: number;
  salesVelocity1h: number;
  isFloorSurge: boolean;
  isVolumeSpike: boolean;
  isWhaleSweep: boolean;
  whaleInfo?: OpenSeaWhaleInfo;
  openseaUrl: string;
  confidenceScore: number; // 0 - 100
  detectionReason: string;
}

export class NFTScreeningAgent {
  private adapter: OpenSeaAdapter;
  private isRunning = false;

  constructor(adapter?: OpenSeaAdapter) {
    this.adapter = adapter || new OpenSeaAdapter();
  }

  /**
   * Evaluates candidate NFT listings against Momentum (Floor Surge >= +30%, Vol Spike >= 3.0x, Sales Velocity >= 25/h) & Whale Sweep triggers
   */
  public evaluateListing(signal: OpenSeaNFTSignal): NFTSnipingReport | null {
    // 1. Floor Price Pump Surge Check (>= +30% in 4h)
    const isFloorSurge = signal.floorSurge4hPct >= 30.0;

    // 2. Volume Explosion Spike Check (>= 3.0x 4h volume surge)
    const isVolumeSpike = signal.volumeSpike4hRatio >= 3.0;

    // 3. Sales Velocity Check (>= 25 sales/hour)
    const isHighVelocity = signal.salesVelocity1h >= 25;

    // 4. Verified Whale Sweep Check
    const isWhaleSweep = signal.isWhaleSweep && Boolean(signal.whaleInfo?.isVerifiedWhale);

    // Hard gate: must trigger at least one momentum or whale sweep criteria
    if (!isFloorSurge && !isVolumeSpike && !isHighVelocity && !isWhaleSweep) {
      return null;
    }

    let confidenceScore = 60;
    if (isFloorSurge) confidenceScore += 20;
    if (isVolumeSpike) confidenceScore += 20;
    if (isWhaleSweep) confidenceScore += 20;
    if (isHighVelocity) confidenceScore += 10;
    confidenceScore = Math.min(100, confidenceScore);

    let detectionReason = 'NFT Momentum Signal Detected';
    if (isFloorSurge && isWhaleSweep) {
      detectionReason = `🚀 NFT PUMP & WHALE SWEEP: ${signal.collectionName} Floor surged +${signal.floorSurge4hPct.toFixed(1)}% in 4h with Verified Whale Sweep (${signal.whaleInfo?.address.slice(0, 8)}...)!`;
    } else if (isFloorSurge) {
      detectionReason = `📈 FLOOR PUMP SURGE: ${signal.collectionName} Floor price surged +${signal.floorSurge4hPct.toFixed(1)}% in 4 hours!`;
    } else if (isVolumeSpike) {
      detectionReason = `🌊 VOLUME EXPLOSION SPIKE: ${signal.collectionName} 4h trading volume surged ${signal.volumeSpike4hRatio.toFixed(1)}x above baseline!`;
    } else if (isWhaleSweep) {
      detectionReason = `🐋 VERIFIED WHALE SWEEP: Smart Money (${signal.whaleInfo?.address.slice(0, 8)}..., Holdings $${((signal.whaleInfo?.portfolioValueUsd || 0) / 1000).toFixed(1)}k, PnL +${signal.whaleInfo?.realizedPnlEth} ETH) swept multiple NFTs!`;
    }

    return {
      collectionSlug: signal.collectionSlug,
      collectionName: signal.collectionName,
      tokenId: signal.tokenId,
      name: signal.name,
      chain: signal.chain,
      priceEth: signal.priceEth,
      floorPriceEth: signal.floorPriceEth,
      floorSurge4hPct: signal.floorSurge4hPct,
      volumeSpike4hRatio: signal.volumeSpike4hRatio,
      salesVelocity1h: signal.salesVelocity1h,
      isFloorSurge,
      isVolumeSpike,
      isWhaleSweep,
      whaleInfo: signal.whaleInfo,
      openseaUrl: signal.openseaUrl,
      confidenceScore,
      detectionReason,
    };
  }

  public async runScreeningPass(): Promise<NFTSnipingReport[]> {
    console.log('[NFT AGENT] Running EVM NFT Momentum & Whale Sweep screening pass...');
    const reports: NFTSnipingReport[] = [];

    for (const item of this.adapter.trackedCollections) {
      const signals = await this.adapter.fetchFloorSnipingSignals(item.slug);
      for (const sig of signals) {
        const report = this.evaluateListing(sig);
        if (report && report.confidenceScore >= 80) {
          reports.push(report);
          console.log(`[NFT AGENT] 🎯 HIGH CONFIDENCE NFT MOMENTUM: ${report.name} (${report.confidenceScore}%) - ${report.detectionReason}`);
        }
      }
    }

    return reports;
  }

  public startScreening(): void {
    this.isRunning = true;
    console.log('[NFT AGENT] 24/7 EVM NFT Momentum screening started.');
  }

  public stopScreening(): void {
    this.isRunning = false;
    console.log('[NFT AGENT] Screening stopped.');
  }

  public getStatus(): { running: boolean } {
    return { running: this.isRunning };
  }
}
