export interface SignalCandidate {
  symbol: string;
  domain: 'MEME_SOLANA' | 'MEME_EVM' | 'PERPS' | 'NFT' | 'LP_METEORA' | 'LP_UNISWAP';
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

export class SwarmConsensusEngine {
  public evaluateSignal(candidate: SignalCandidate): ConsensusResult {
    // Layer 1: Quant & Liquidity Score
    let quantScore = 0;
    if (candidate.liquidityUsd >= 25000) quantScore += 50;
    if (candidate.volume1hUsd >= 10000) quantScore += 50;

    // Layer 2: Catalyst & Sentiment Score
    const catalystScore = candidate.socialHypeScore;

    // Layer 3: Security & Risk Audit Score
    const securityScore = candidate.securityAuditPassed ? 100 : 0;

    // Calculate Weighted Confidence Score
    const confidenceScore = Math.round(quantScore * 0.35 + catalystScore * 0.35 + securityScore * 0.30);

    const passed = confidenceScore >= 80 && candidate.securityAuditPassed;

    return {
      passed,
      confidenceScore,
      breakdown: {
        quantScore,
        catalystScore,
        securityScore,
      },
      reason: passed
        ? `Signal passed Swarm Consensus with ${confidenceScore}% confidence.`
        : `Signal rejected (${confidenceScore}% confidence below 80% threshold or security failed).`,
    };
  }
}
