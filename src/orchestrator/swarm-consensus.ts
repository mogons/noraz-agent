import { StateStore, SignalLedgerEntry } from '../services/state-store.js';

export interface SignalCandidate {
  symbol: string;
  domain: 'MEME_SOLANA' | 'MEME_EVM' | 'PERPS' | 'NFT' | 'LP_METEORA' | 'LP_UNISWAP' | 'PREDICTION';
  contractAddress?: string;
  liquidityUsd: number;
  volume1hUsd: number;
  securityAuditPassed: boolean;
  socialHypeScore: number; // 0 - 100
}

export interface ConsensusResult {
  passed: boolean;
  confidenceScore: number; // 0 - 100
  breakdown: {
    quantScore: number;
    catalystScore: number;
    securityScore: number;
    reputationMultiplier: number;
  };
  reason: string;
}

export interface SwarmConsensus {
  evaluateSignal(signalPayload: any): Promise<{
    passed: boolean;
    totalScore: number;
    breakdown: {
      quantScore: number;
      catalystScore: number;
      securityScore: number;
      aiSentiment: string;
    };
  }>;
}

export interface AgentReputation {
  domain: string;
  winRatePercent: number;
  totalCalls: number;
  reputationWeight: number; // 0.5 - 1.5
}

export class SwarmConsensusEngine {
  private stateStore: StateStore | null = null;
  private recentSignalHashes: Map<string, number> = new Map(); // Hash -> Timestamp (Deduplication)
  private agentReputations: Map<string, AgentReputation> = new Map();

  constructor() {
    this.initializeAgentReputations();
  }

  private initializeAgentReputations() {
    const domains = ['MEME_SOLANA', 'MEME_EVM', 'PERPS', 'NFT', 'LP_METEORA', 'LP_UNISWAP', 'PREDICTION'];
    domains.forEach((domain) => {
      this.agentReputations.set(domain, {
        domain,
        winRatePercent: 65, // default baseline 65%
        totalCalls: 10,
        reputationWeight: 1.0,
      });
    });
  }

  /**
   * Update agent reputation based on historical trading outcomes
   */
  public updateAgentReputation(domain: string, isWin: boolean): void {
    const rep = this.agentReputations.get(domain);
    if (!rep) return;

    const currentWins = (rep.winRatePercent / 100) * rep.totalCalls;
    const newTotalCalls = rep.totalCalls + 1;
    const newWins = currentWins + (isWin ? 1 : 0);
    const newWinRate = (newWins / newTotalCalls) * 100;

    // Reputation weight scales from 0.7 (low accuracy) to 1.3 (high accuracy)
    const newWeight = Math.min(1.3, Math.max(0.7, newWinRate / 65));

    this.agentReputations.set(domain, {
      domain,
      winRatePercent: newWinRate,
      totalCalls: newTotalCalls,
      reputationWeight: newWeight,
    });
  }

  /**
   * Attach StateStore for immutable signal audit trail
   */
  public attachStateStore(store: StateStore): void {
    this.stateStore = store;
  }

  public evaluateSignal(candidate: SignalCandidate): ConsensusResult {
    // Deduplication Check (Prevent duplicate calls within 2-hour window)
    const signalHash = `${candidate.domain}_${candidate.contractAddress || candidate.symbol}`.toUpperCase();
    const lastTime = this.recentSignalHashes.get(signalHash);
    const now = Date.now();

    if (lastTime && now - lastTime < 2 * 60 * 60 * 1000) {
      return {
        passed: false,
        confidenceScore: 0,
        breakdown: { quantScore: 0, catalystScore: 0, securityScore: 0, reputationMultiplier: 1.0 },
        reason: `⚠️ Duplicate signal ignored for ${candidate.symbol} (${candidate.domain}) within 2h window.`,
      };
    }

    // Fetch Agent Reputation Weight
    const rep = this.agentReputations.get(candidate.domain) || { reputationWeight: 1.0 };
    const reputationMultiplier = rep.reputationWeight;

    // Layer 1: Quant & Liquidity Score
    let quantScore = 0;
    if (candidate.liquidityUsd >= 25000) quantScore += 50;
    if (candidate.volume1hUsd >= 10000) quantScore += 50;

    // Layer 2: Catalyst & Sentiment Score
    const catalystScore = candidate.socialHypeScore;

    // Layer 3: Security & Risk Audit Score
    const securityScore = candidate.securityAuditPassed ? 100 : 0;

    // Fast-Lane Execution Check (Quant >= 90% and Security 100% Clean)
    const isFastLane = quantScore >= 90 && candidate.securityAuditPassed;

    // Calculate Weighted Confidence Score with Agent Reputation
    const baseConfidence = quantScore * 0.35 + catalystScore * 0.35 + securityScore * 0.30;
    const confidenceScore = isFastLane
      ? Math.max(88, Math.min(100, Math.round(baseConfidence * reputationMultiplier)))
      : Math.min(100, Math.round(baseConfidence * reputationMultiplier));

    const passed = confidenceScore >= 80 && candidate.securityAuditPassed;

    if (passed) {
      this.recentSignalHashes.set(signalHash, now);
    }

    const result: ConsensusResult = {
      passed,
      confidenceScore,
      breakdown: {
        quantScore,
        catalystScore,
        securityScore,
        reputationMultiplier,
      },
      reason: passed
        ? isFastLane 
          ? `⚡ **FAST-LANE SWARM BYPASS PASSED** (${confidenceScore}% confidence, Sub-second High Conviction, Reputation Wt: ${reputationMultiplier.toFixed(2)}x).`
          : `Signal passed Swarm Consensus with ${confidenceScore}% confidence (Reputation Wt: ${reputationMultiplier.toFixed(2)}x).`
        : `Signal rejected (${confidenceScore}% confidence below 80% threshold or security failed).`,
    };

    // Append to immutable signal audit ledger
    if (this.stateStore) {
      const ledgerEntry: SignalLedgerEntry = {
        id: `SIG_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        timestamp: new Date().toISOString(),
        sourceAgent: candidate.domain,
        domain: candidate.domain,
        symbol: candidate.symbol,
        contractAddress: candidate.contractAddress || '',
        quantScore,
        catalystScore,
        securityScore,
        totalConfidence: confidenceScore,
        passed,
        reason: result.reason,
        rawPayloadJson: JSON.stringify(candidate),
      };
      this.stateStore.appendSignalLedger(ledgerEntry);
    }

    return result;
  }
}
