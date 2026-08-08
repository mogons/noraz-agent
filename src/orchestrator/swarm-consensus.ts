import { StateStore, SignalLedgerEntry } from '../services/state-store.js';

export interface SignalCandidate {
  symbol: string;
  domain: 'MEME_SOLANA' | 'MEME_EVM' | 'PERPS' | 'NFT' | 'LP_METEORA' | 'LP_ROBINHOOD' | 'PREDICTION' | 'CT_ALPHA';
  contractAddress?: string;
  liquidityUsd: number;
  volume1hUsd: number;
  securityAuditPassed: boolean;
  socialHypeScore: number; // 0 - 100
  confidence?: number; // agent-computed confidence (0-100); when present, swarm acts as pure gate
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

export class SwarmConsensusEngine {
  private stateStore: StateStore | null = null;

  // Optional pluggable strategy provider (set by StrategyEngine wiring in index.ts)
  private static strategyProvider: ((domain: string) => { evaluate?: (ctx: any) => any } | null) | null = null;

  public static setStrategyProvider(fn: ((domain: string) => { evaluate?: (ctx: any) => any } | null) | null): void {
    SwarmConsensusEngine.strategyProvider = fn;
  }

  /**
   * Attach StateStore for immutable signal audit trail
   */
  public attachStateStore(store: StateStore): void {
    this.stateStore = store;
  }

  private activeOpposingIntents: Map<string, { domain: string; direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL'; timestamp: number }> = new Map();

  /**
   * Register a direction intent from an agent (e.g. PERPS SHORT on BTC) to enable Cross-Agent Veto
   */
  public registerAgentIntent(symbol: string, domain: string, direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL'): void {
    const key = symbol.toUpperCase();
    this.activeOpposingIntents.set(key, { domain, direction, timestamp: Date.now() });
  }

  public evaluateSignal(candidate: SignalCandidate & { direction?: 'LONG' | 'SHORT' | 'BUY' | 'SELL' }): ConsensusResult {
    const symbolKey = candidate.symbol.toUpperCase();

    // Cross-Agent Conflict Veto Check (e.g., PERPS SHORT vs SPOT BUY)
    const existingIntent = this.activeOpposingIntents.get(symbolKey);
    if (existingIntent && Date.now() - existingIntent.timestamp < 60 * 60 * 1000) {
      const incomingDir = candidate.direction || 'BUY';
      const isConflict = 
        (existingIntent.direction === 'SHORT' || existingIntent.direction === 'SELL') && (incomingDir === 'BUY' || incomingDir === 'LONG') ||
        (existingIntent.direction === 'LONG' || existingIntent.direction === 'BUY') && (incomingDir === 'SELL' || incomingDir === 'SHORT');

      if (isConflict) {
        return {
          passed: false,
          confidenceScore: 0,
          breakdown: { quantScore: 0, catalystScore: 0, securityScore: 0, reputationMultiplier: 1.0 },
          reason: `🛑 **Cross-Agent Veto Block:** Opposing intent detected! ${existingIntent.domain} has an active ${existingIntent.direction} intent on $${symbolKey}, conflicting with incoming ${candidate.domain} ${incomingDir}. Order blocked to prevent hedging self-destruction.`,
        };
      }
    }

    // Agent reputation is always neutral (1.0) until wired to real trade outcomes;
    // evaluateSignal must never fail-open from a stale/nonexistent reputation entry.
    const reputationMultiplier = 1.0;

    // Agent-computed confidence path (new): swarm acts as pure gate
    let quantScore = 0;
    let catalystScore = 0;
    let securityScore = 0;
    let baseConfidence = 0;
    let isFastLane = false;
    if (typeof candidate.confidence === 'number' && candidate.confidence > 0) {
      baseConfidence = candidate.confidence;
    } else {
      // Legacy path: recompute from quant/catalyst/security
      if (candidate.liquidityUsd >= 25000) quantScore += 50;
      if (candidate.volume1hUsd >= 10000) quantScore += 50;
      catalystScore = candidate.socialHypeScore;
      securityScore = candidate.securityAuditPassed ? 100 : 0;
      isFastLane = quantScore >= 90 && candidate.securityAuditPassed;
      baseConfidence = quantScore * 0.35 + catalystScore * 0.35 + securityScore * 0.30;
    }

    let confidenceScore = isFastLane
      ? Math.max(88, Math.min(100, Math.round(baseConfidence * reputationMultiplier)))
      : Math.min(100, Math.round(baseConfidence * reputationMultiplier));

    // Optional active strategy override (StrategyEngine) — blend with its evaluate() confidence.
    // NOT applied on the agent-confidence path: the agent already ran its own strategy extension in
    // runScreeningPass, and a global strategy must never suppress other domains via an empty ctx.
    const isAgentConfidencePath = typeof candidate.confidence === 'number' && candidate.confidence > 0;
    let strategyReason: string | null = null;
    if (!isAgentConfidencePath && SwarmConsensusEngine.strategyProvider) {
      try {
        const strat = SwarmConsensusEngine.strategyProvider(candidate.domain);
        if (strat?.evaluate) {
          // Sanitize env for the call — strategy .mjs files run in-process and must
          // never read private keys / API secrets (prompt-injection hardening).
          const snapshot = { ...process.env };
          const sensitiveKeys = Object.keys(process.env).filter((k) =>
            /KEY|TOKEN|SECRET|PRIVATE|PASSWORD|API/i.test(k) ||
            k.startsWith('SOLANA_') || k.startsWith('EVM_') || k.startsWith('AI_')
          );
          for (const k of sensitiveKeys) delete process.env[k];
          let ev: any = null;
          try {
            ev = strat.evaluate({
              domain: candidate.domain,
              symbol: candidate.symbol,
              contractAddress: candidate.contractAddress,
              priceUsd: 0,
              liquidityUsd: candidate.liquidityUsd,
              volume24hUsd: candidate.volume1hUsd * 24,
              volume1hUsd: candidate.volume1hUsd,
              smartMoneyCount: 0,
              securityAuditPassed: candidate.securityAuditPassed,
              socialHypeScore: candidate.socialHypeScore,
            });
          } finally {
            process.env = snapshot;
          }
          if (ev && typeof ev.confidence === 'number') {
            confidenceScore = Math.round(confidenceScore * 0.5 + Math.max(0, Math.min(100, ev.confidence)) * 0.5);
            if (ev.reason) strategyReason = ev.reason;
          }
        }
      } catch (err: any) {
        console.warn(`[SWARM] Strategy evaluation failed for ${candidate.domain}: ${err.message}`);
      }
    }

    const passed = confidenceScore >= 80 && candidate.securityAuditPassed;

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
        ? strategyReason
          ? `Signal passed Swarm Consensus (${confidenceScore}% confidence) + Strategi: ${strategyReason}`
          : isFastLane 
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
