export interface OpenPosition {
  id: string;
  symbol: string;
  contractAddress: string;
  entryPriceUsd: number;
  currentPriceUsd: number;
  amount: number;
  highWaterMarkUsd: number;
  initialVolume4hUsd?: number;
  initialSmartMoneyCount?: number;
  tp100Triggered?: boolean;
  tp200Triggered?: boolean;
}

export interface ActiveLPPosition {
  id: string; // poolAddress
  poolAddress: string;
  pairName: string;
  network: 'Solana' | 'Robinhood';
  isOutOfRange: boolean;
  currentVolumeToActiveTvl4h: number;
  currentVolumeToTvl4h?: number;
  currentFeesToTvlRatio4h: number;
  currentOrganicVolumeScore4h: number;
}

export interface ActiveNFTPosition {
  id: string; // collectionSlug_tokenId
  collectionSlug: string;
  collectionName: string;
  tokenId: string;
  entryFloorEth: number;
  currentFloorEth: number;
  highestFloorEth: number;
  salesVelocity1h: number;
  tp30Triggered?: boolean;
  tp50Triggered?: boolean;
}

export class PositionManager {
  private activePositions: Map<string, OpenPosition> = new Map();
  private activeLpPositions: Map<string, ActiveLPPosition> = new Map();
  private activeNftPositions: Map<string, ActiveNFTPosition> = new Map();

  // ==========================================
  // MEME & SPOT POSITION TRACKING
  // ==========================================

  public addPosition(position: OpenPosition) {
    this.activePositions.set(position.id, position);
  }

  public getActivePositions(): OpenPosition[] {
    return Array.from(this.activePositions.values());
  }

  public updateMemePosition(
    positionId: string,
    currentPriceUsd: number,
    currentVolume4hUsd?: number,
    currentSmartMoneyCount?: number
  ): { triggerAlert: boolean; type: 'MILESTONE' | 'WARNING' | 'CRITICAL' | 'NONE'; reason?: string } {
    const pos = this.activePositions.get(positionId);
    if (!pos) return { triggerAlert: false, type: 'NONE' };

    pos.currentPriceUsd = currentPriceUsd;
    if (currentPriceUsd > pos.highWaterMarkUsd) {
      pos.highWaterMarkUsd = currentPriceUsd;
    }

    const priceChangePercent = ((currentPriceUsd - pos.entryPriceUsd) / pos.entryPriceUsd) * 100;

    // 1. Take Profit Milestones (+100% and +200%)
    if (priceChangePercent >= 200 && !pos.tp200Triggered) {
      pos.tp200Triggered = true;
      return {
        triggerAlert: true,
        type: 'MILESTONE',
        reason: `🟢 **TP2 Milestone Reached:** $${pos.symbol} has surged **+200% (3x)** from entry! Current Price: $${currentPriceUsd.toFixed(6)}. High-profit taking recommended!`,
      };
    }

    if (priceChangePercent >= 100 && !pos.tp100Triggered) {
      pos.tp100Triggered = true;
      return {
        triggerAlert: true,
        type: 'MILESTONE',
        reason: `🟢 **TP1 Milestone Reached:** $${pos.symbol} has surged **+100% (2x)** from entry! Current Price: $${currentPriceUsd.toFixed(6)}. Secure 50% of capital!`,
      };
    }

    // 2. Critical Drop (-50%)
    if (priceChangePercent <= -50) {
      return {
        triggerAlert: true,
        type: 'CRITICAL',
        reason: `🚨 **Critical Drop:** $${pos.symbol} has dropped **-50%** below your entry price! Current Price: $${currentPriceUsd.toFixed(6)}. Immediate exit recommended!`,
      };
    }

    // 3. Significant Volume Drop (> 70% decrease relative to entry)
    if (pos.initialVolume4hUsd && currentVolume4hUsd) {
      const volumeDropPercent = ((pos.initialVolume4hUsd - currentVolume4hUsd) / pos.initialVolume4hUsd) * 100;
      if (volumeDropPercent >= 70) {
        return {
          triggerAlert: true,
          type: 'WARNING',
          reason: `⚠️ **Volume Dry-up Warning:** $${pos.symbol} volume has dropped by **${volumeDropPercent.toFixed(1)}%** (from $${pos.initialVolume4hUsd.toLocaleString()} to $${currentVolume4hUsd.toLocaleString()}). Liquidity is fading!`,
        };
      }
    }

    // 4. Smart Money Exiting (Count drops below 1, or drops by >= 50%)
    if (pos.initialSmartMoneyCount !== undefined && currentSmartMoneyCount !== undefined) {
      if (currentSmartMoneyCount === 0 || (pos.initialSmartMoneyCount >= 2 && currentSmartMoneyCount <= pos.initialSmartMoneyCount * 0.5)) {
        return {
          triggerAlert: true,
          type: 'CRITICAL',
          reason: `🚨 **Smart Money Exited:** Smart Money wallets holding $${pos.symbol} dropped from **${pos.initialSmartMoneyCount}** to **${currentSmartMoneyCount}**! Insiders are dumping!`,
        };
      }
    }

    return { triggerAlert: false, type: 'NONE' };
  }

  // ==========================================
  // CONCENTRATED LP POSITION TRACKING
  // ==========================================

  public addLpPosition(position: ActiveLPPosition) {
    this.activeLpPositions.set(position.id, position);
  }

  public getActiveLpPositions(): ActiveLPPosition[] {
    return Array.from(this.activeLpPositions.values());
  }

  public checkLpPositionAlert(positionId: string): { triggerAlert: boolean; reason?: string } {
    const pos = this.activeLpPositions.get(positionId);
    if (!pos) return { triggerAlert: false };

    if (pos.isOutOfRange) {
      return {
        triggerAlert: true,
        reason: `🚨 **Out of Range Alert:** Price has moved outside of your active LP bins for ${pos.pairName}. Fees are no longer accumulating! Time to re-range or exit.`,
      };
    }

    if (pos.currentOrganicVolumeScore4h < 65) {
      return {
        triggerAlert: true,
        reason: `🎣 **Organic Volume Warning:** Organic activity score on ${pos.pairName} dropped to **${pos.currentOrganicVolumeScore4h}/100**. Suspicious wash-trading or liquidity pull detected.`,
      };
    }

    if (pos.currentFeesToTvlRatio4h < 0.05) {
      return {
        triggerAlert: true,
        reason: `💸 **Yield Velocity Warning:** LP fee yield on ${pos.pairName} dropped to **${(pos.currentFeesToTvlRatio4h * 100).toFixed(2)}%** per 4h (below the 5.0% Trade+LP target). Consider withdrawing LP!`,
      };
    }

    if (pos.currentVolumeToTvl4h !== undefined && pos.currentVolumeToTvl4h < 1.5) {
      return {
        triggerAlert: true,
        reason: `📉 **Volume Turnover Alert:** Total pool volume turnover on ${pos.pairName} fell to **${(pos.currentVolumeToTvl4h * 100).toFixed(0)}%** (below 150% 4h target). Trading momentum is fading!`,
      };
    }

    if (pos.currentVolumeToActiveTvl4h < 6.0) {
      return {
        triggerAlert: true,
        reason: `⚡ **Active Velocity Alert:** Capital turnover in active LP range for ${pos.pairName} fell to **${pos.currentVolumeToActiveTvl4h.toFixed(1)}x** (below 6.0x target). Active bin volume slowing down.`,
      };
    }

    return { triggerAlert: false };
  }

  // ==========================================
  // ACTIVE NFT POSITION TRACKING & ALERTS
  // ==========================================

  public addNftPosition(position: ActiveNFTPosition) {
    this.activeNftPositions.set(position.id, position);
  }

  public getActiveNftPositions(): ActiveNFTPosition[] {
    return Array.from(this.activeNftPositions.values());
  }

  /**
   * Updates & checks active NFT position for TP milestones (+30%, +50%), floor drops (-20%), or volume momentum dry-up
   */
  public updateNftPosition(
    positionId: string,
    currentFloorEth: number,
    salesVelocity1h: number
  ): { triggerAlert: boolean; type: 'MILESTONE' | 'WARNING' | 'CRITICAL' | 'NONE'; reason?: string } {
    const pos = this.activeNftPositions.get(positionId);
    if (!pos) return { triggerAlert: false, type: 'NONE' };

    pos.currentFloorEth = currentFloorEth;
    pos.salesVelocity1h = salesVelocity1h;
    if (currentFloorEth > pos.highestFloorEth) {
      pos.highestFloorEth = currentFloorEth;
    }

    const floorChangePct = ((currentFloorEth - pos.entryFloorEth) / pos.entryFloorEth) * 100;

    // 1. Take Profit Milestones (+50% and +30%)
    if (floorChangePct >= 50 && !pos.tp50Triggered) {
      pos.tp50Triggered = true;
      return {
        triggerAlert: true,
        type: 'MILESTONE',
        reason: `🟢 **NFT TP2 MILESTONE (+50%):** Floor price for **${pos.collectionName} #${pos.tokenId}** surged +50%! (Entry: \`${pos.entryFloorEth} ETH\` ➡️ Current Floor: \`${currentFloorEth} ETH\`). High-profit taking recommended!`,
      };
    }

    if (floorChangePct >= 30 && !pos.tp30Triggered) {
      pos.tp30Triggered = true;
      return {
        triggerAlert: true,
        type: 'MILESTONE',
        reason: `🟢 **NFT TP1 MILESTONE (+30%):** Floor price for **${pos.collectionName} #${pos.tokenId}** surged +30%! (Entry: \`${pos.entryFloorEth} ETH\` ➡️ Current Floor: \`${currentFloorEth} ETH\`). Consider listing at floor to secure profits!`,
      };
    }

    // 2. Critical Floor Drop (-20%)
    if (floorChangePct <= -20) {
      return {
        triggerAlert: true,
        type: 'CRITICAL',
        reason: `🚨 **NFT FLOOR DROP WARNING (-20%):** Floor price for **${pos.collectionName} #${pos.tokenId}** dropped -20% below your entry! (Entry: \`${pos.entryFloorEth} ETH\` ➡️ Current Floor: \`${currentFloorEth} ETH\`). Cut-loss recommended!`,
      };
    }

    // 3. Sales Velocity Dry-up Alert (Sales velocity < 5 sales/hour)
    if (salesVelocity1h < 5) {
      return {
        triggerAlert: true,
        type: 'WARNING',
        reason: `⚠️ **NFT MOMENTUM FADING:** Sales velocity for **${pos.collectionName}** dropped to \`${salesVelocity1h} sales/hour\` (below 5 sales/h threshold). Trading volume momentum is fading!`,
      };
    }

    return { triggerAlert: false, type: 'NONE' };
  }
}
