import { GMGNAdapter, GMGNTokenSignal } from '../../adapters/gmgn-adapter.js';
import { GoPlusSecurityService, EvmChain } from '../../services/goplus-security-service.js';

export interface EVMCTODetectionReport {
  chain: 'base' | 'eth' | 'robinhood' | 'bsc';
  symbol: string;
  contractAddress: string;
  isCTO: boolean;
  isRevival: boolean;
  volumeSpikeRatio: number;
  devHoldingPct: number;
  smartMoneyCount: number;
  isHoneypot: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  isBlacklisted: boolean;
  twitterLink: string;
  gmgnLink: string;
  dexscreenerLink: string;
  goPlusLink: string;
  aiSentimentScore: number;
  detectionReason: string;
  confidenceScore: number;
  auditAvailable: boolean;
}

export class EVMScreeningAgent {
  private gmgnAdapter: GMGNAdapter;
  private goplus: GoPlusSecurityService;

  constructor() {
    this.gmgnAdapter = new GMGNAdapter();
    this.goplus = new GoPlusSecurityService();
  }

  public async evaluateEVMToken(
    signal: GMGNTokenSignal,
    chain: 'base' | 'eth' | 'robinhood' | 'bsc' = 'base'
  ): Promise<EVMCTODetectionReport | null> {
    const tokenAgeHours = signal.tokenAgeHours ?? 0;
    const isMinAgePassed = tokenAgeHours >= 4.0;

    const volumeSpikeRatio = signal.volume24hUsd > 0 ? signal.volume24hUsd / 50000 : 0;
    const hasVolumeSurge = signal.volume24hUsd >= 50000 && signal.smartMoneyNetBuySolOrEth >= 0.5;

    const isDevClean = signal.devHoldingPercentage <= 10.0;
    const isSmartMoneyBuying = signal.smartMoneyCount >= 2;
    const isCTO = signal.devHoldingPercentage === 0 && isSmartMoneyBuying && isMinAgePassed;
    const isRevival = volumeSpikeRatio >= 3.0 && isSmartMoneyBuying && isMinAgePassed;

    // Layer 3: real GoPlus security audit (fail-closed — no audit, no signal)
    const security = await this.goplus.auditToken(chain as EvmChain, signal.contractAddress);
    if (!security) {
      console.warn(`[EVM AGENT] GoPlus audit unavailable for ${signal.symbol} — skipping.`);
      return null;
    }

    const ca = signal.contractAddress;
    const twitterLink = `https://x.com/search?q=%24${signal.symbol}&src=typed_query`;
    const gmgnLink = this.gmgnAdapter.getGMGNWebUrl(chain, ca);
    const dexscreenerLink = `https://dexscreener.com/${chain}/${ca}`;
    const goPlusLink = `https://gopluslabs.io/token-security/${chain === 'base' ? '8453' : chain === 'eth' ? '1' : '8453'}/${ca}`;

    const aiSentimentScore = Math.min(100, Math.round(50 + signal.smartMoneyCount * 8));

    const quantScore = signal.liquidityUsd >= 25000 && hasVolumeSurge && isMinAgePassed ? 35 : 15;
    const catalystScore = isSmartMoneyBuying ? 35 : 15;
    const securityScore = !security.isHoneypot && security.buyTaxPct <= 5.0 && security.sellTaxPct <= 5.0 && isDevClean ? 30 : 0;
    const confidenceScore = Math.min(100, quantScore + catalystScore + securityScore);

    let detectionReason = 'EVM Token Candidate Audited';
    if (!isMinAgePassed) {
      detectionReason = `⛔ IGNORED: Token age (${tokenAgeHours.toFixed(1)}h) is below minimum 4-hour safety threshold.`;
    } else if (isCTO && isRevival) {
      detectionReason = `🔥 1H EVM REVIVAL & CTO ALERT: Age ${tokenAgeHours.toFixed(1)}h, Dev 0%, ${volumeSpikeRatio.toFixed(1)}x 1H Volume & ${signal.smartMoneyCount} Smart Money on ${chain.toUpperCase()}!`;
    } else if (isCTO) {
      detectionReason = `👥 1H EVM CTO SIGNAL: Age ${tokenAgeHours.toFixed(1)}h, Dev 0% on ${chain.toUpperCase()}, Community Takeover with Smart Money inflow.`;
    } else if (isRevival) {
      detectionReason = `🧟 1H EVM REVIVAL SIGNAL: Token waking up on ${chain.toUpperCase()} with ${volumeSpikeRatio.toFixed(1)}x 1H Volume Surge!`;
    }

    return {
      chain, symbol: signal.symbol, contractAddress: ca,
      isCTO, isRevival, volumeSpikeRatio,
      devHoldingPct: signal.devHoldingPercentage,
      smartMoneyCount: signal.smartMoneyCount,
      isHoneypot: false, buyTaxPct: security.buyTaxPct, sellTaxPct: security.sellTaxPct,
      isBlacklisted: security.isBlacklisted,
      twitterLink, gmgnLink, dexscreenerLink, goPlusLink,
      aiSentimentScore, detectionReason, confidenceScore,
      auditAvailable: true,
    };
  }

  public async runScreeningPass(): Promise<Array<{ passed: boolean; signal: GMGNTokenSignal; reason: string }>> {
    console.log('[EVM AGENT] Running EVM Meme DEX screening pass...');
    const signals = await this.gmgnAdapter.fetchTrendingSignals('base');
    if (!signals || signals.length === 0) return [];

    const results: Array<{ passed: boolean; signal: GMGNTokenSignal; reason: string }> = [];
    for (const signal of signals.slice(0, 5)) {
      const report = await this.evaluateEVMToken(signal, 'base');
      if (!report) continue;
      results.push({ passed: report.confidenceScore >= 80, signal, reason: report.detectionReason });
    }
    return results;
  }
}
