import { describe, it, expect, vi, afterEach } from 'vitest';
import { SwarmConsensusEngine } from '../src/orchestrator/swarm-consensus.js';

describe('Swarm Consensus gate-only path (agent-computed confidence)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    SwarmConsensusEngine.setStrategyProvider(null);
  });

  it('passes a candidate with agent confidence 85 + securityAuditPassed true', () => {
    const swarm = new SwarmConsensusEngine();
    const res = swarm.evaluateSignal({
      symbol: 'GATE_85',
      domain: 'MEME_SOLANA',
      contractAddress: 'gate85',
      liquidityUsd: 0,
      volume1hUsd: 0,
      securityAuditPassed: true,
      socialHypeScore: 0,
      confidence: 85,
    });
    expect(res.passed).toBe(true);
    expect(res.confidenceScore).toBeGreaterThanOrEqual(80);
  });

  it('rejects a candidate with agent confidence 50', () => {
    const swarm = new SwarmConsensusEngine();
    const res = swarm.evaluateSignal({
      symbol: 'GATE_50',
      domain: 'MEME_SOLANA',
      contractAddress: 'gate50',
      liquidityUsd: 0,
      volume1hUsd: 0,
      securityAuditPassed: true,
      socialHypeScore: 0,
      confidence: 50,
    });
    expect(res.passed).toBe(false);
    expect(res.confidenceScore).toBeLessThan(80);
  });

  it('gate-only path ignores a fail-closed global strategy provider (no blend suppression)', () => {
    SwarmConsensusEngine.setStrategyProvider(() => ({
      evaluate: () => ({ confidence: 0, recommendedAction: 'SKIP', reason: 'fail-closed' }),
    }));
    const swarm = new SwarmConsensusEngine();
    const res = swarm.evaluateSignal({
      symbol: 'GATE_STRAT',
      domain: 'MEME_SOLANA',
      contractAddress: 'gate-strat',
      liquidityUsd: 0,
      volume1hUsd: 0,
      securityAuditPassed: true,
      socialHypeScore: 0,
      confidence: 85,
    });
    expect(res.passed).toBe(true);
    expect(res.confidenceScore).toBeGreaterThanOrEqual(80);
  });
});
