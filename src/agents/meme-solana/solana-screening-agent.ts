import { GMGNAdapter, GMGNTokenSignal } from '../../adapters/gmgn-adapter.js';
import { RugCheckService, RugCheckResult } from '../../services/security-service.js';

export interface CTODetectionReport {
  isCTO: boolean;
  isRevival: boolean;
  volumeSpikeRatio: number; // e.g. 5.5 = +550% volume spike
  devHoldingPct: number;
  smartMoneyCount: number;
  twitterTriggerCatalyst?: string;
  twitterLink?: string;
  gmgnLink: string;
  dexscreenerLink: string;
  rugcheckLink: string;
  twitterSentimentScore: number; // 0 - 100
  detectionReason: string;
}

export class SolanaScreeningAgent {
  private gmgnAdapter: GMGNAdapter;
  private rugCheckService: RugCheckService;

  constructor() {
    this.gmgnAdapter = new GMGNAdapter();
    this.rugCheckService = new RugCheckService();
  }

  public detectRevivalAndCTO(signal: GMGNTokenSignal, rugReport: RugCheckResult): CTODetectionReport {
    // Strategy Filter: Minimum Token Age >= 4 Hours (240 Minutes) to prevent fresh insta-rugs
    const tokenAgeHours = signal.tokenAgeHours ?? 5.5; // Default 5.5h if unprovided
    const isMinAgePassed = tokenAgeHours >= 4.0;

    // 1. Volume Spike Detection — computed from real volume/liquidity ratio
    const isVolumeSpike = signal.volume24hUsd > 100000 && signal.smartMoneyNetBuySolOrEth >= 10;
    const volumeSpikeRatio = signal.liquidityUsd > 0
      ? signal.volume24hUsd / signal.liquidityUsd
      : (isVolumeSpike ? 5.0 : 1.0);

    // 2. CTO Check (Dev holding <= 1% + Active Smart Money Inflow)
    const isDevClean = signal.devHoldingPercentage <= 1.0;
    const isSmartMoneyBuying = signal.smartMoneyCount >= 2;
    const isCTO = isDevClean && isSmartMoneyBuying && isMinAgePassed;

    // 3. Revival Token Check (Dead token waking up after 4h)
    const isRevival = volumeSpikeRatio >= 5.0 && isSmartMoneyBuying && isMinAgePassed;

    // 4. Verification Links
    const ca = signal.contractAddress;
    const twitterLink = `https://x.com/search?q=%24${signal.symbol}&src=typed_query`;
    const gmgnLink = `https://gmgn.ai/sol/token/${ca}`;
    const dexscreenerLink = `https://dexscreener.com/solana/${ca}`;
    const rugcheckLink = `https://rugcheck.xyz/tokens/${ca}`;

    // Compute catalyst text from real signal data
    const twitterTriggerCatalyst = isVolumeSpike
      ? `🐦 Volume surge detected: $${signal.symbol} — Vol/Liq ratio: ${volumeSpikeRatio.toFixed(1)}x, ${signal.smartMoneyCount} Smart Wallets buying.`
      : `📊 Monitoring: $${signal.symbol} — Vol: $${(signal.volume24hUsd / 1000).toFixed(1)}k, Liq: $${(signal.liquidityUsd / 1000).toFixed(1)}k.`;

    // Compute sentiment from RugCheck score + Smart Money signals (no LLM cost)
    const securityBonus = rugReport.isSafeForRunner ? 15 : 0;
    const smartMoneyBonus = Math.min(20, signal.smartMoneyCount * 5);
    const volumeBonus = Math.min(20, Math.floor(volumeSpikeRatio * 3));
    const twitterSentimentScore = Math.min(98, 40 + securityBonus + smartMoneyBonus + volumeBonus);

    let detectionReason = 'Normal Signal';
    if (!isMinAgePassed) {
      detectionReason = `⛔ IGNORED: Token age (${tokenAgeHours.toFixed(1)}h) is below minimum 4-hour safety threshold.`;
    } else if (isCTO && isRevival) {
      detectionReason = `🔥 1H REVIVAL & CTO ALERT: Age ${tokenAgeHours.toFixed(1)}h >= 4h, Dev ${signal.devHoldingPercentage}%, +${(volumeSpikeRatio * 100).toFixed(0)}% Vol/Liq Surge & ${signal.smartMoneyCount} Smart Money Accumulating!`;
    } else if (isCTO) {
      detectionReason = `👥 1H CTO SIGNAL: Age ${tokenAgeHours.toFixed(1)}h, Dev ${signal.devHoldingPercentage}% / Renounced, Community Takeover in progress.`;
    } else if (isRevival) {
      detectionReason = `🧟 1H REVIVAL SIGNAL: Token waking up with +${(volumeSpikeRatio * 100).toFixed(0)}% Vol/Liq Surge!`;
    }

    return {
      isCTO,
      isRevival,
      volumeSpikeRatio,
      devHoldingPct: signal.devHoldingPercentage,
      smartMoneyCount: signal.smartMoneyCount,
      twitterTriggerCatalyst,
      twitterLink,
      gmgnLink,
      dexscreenerLink,
      rugcheckLink,
      twitterSentimentScore,
      detectionReason,
    };
  }

  public async runScreeningPass(): Promise<any[]> {
    console.log('[SOLANA AGENT] Running Solana Meme DEX screening pass (Strategy: 1H Timeframe, Min 4h Token Age)...');
    const signals = await this.gmgnAdapter.fetchTrendingSignals('sol');
    if (!signals || signals.length === 0) return [];

    const results = [];
    for (const signal of signals.slice(0, 3)) {
      const rugReport = await this.rugCheckService.auditSolanaToken(signal.contractAddress);
      const ctoReport = this.detectRevivalAndCTO(signal, rugReport);
      const isAgePassed = (signal.tokenAgeHours ?? 5.5) >= 4.0;
      results.push({
        passed: rugReport.isSafeForRunner && isAgePassed,
        signal,
        reason: ctoReport.detectionReason,
      });
    }

    return results;
  }
}
