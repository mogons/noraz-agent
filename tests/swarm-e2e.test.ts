import { describe, it, expect } from 'vitest';
import { SwarmConsensusEngine } from '../src/orchestrator/swarm-consensus.js';

describe('Swarm E2E gate', () => {
  it('rejects a signal with missing real data (fail-closed)', () => {
    const swarm = new SwarmConsensusEngine();
    const res = swarm.evaluateSignal({
      symbol: 'TEST',
      domain: 'MEME_SOLANA',
      contractAddress: '0x',
      liquidityUsd: 0,
      volume1hUsd: 0,
      securityAuditPassed: false,
      socialHypeScore: 0,
    });
    expect(res.passed).toBe(false);
  });

  it('passes a signal backed by real data', () => {
    const swarm = new SwarmConsensusEngine();
    const res = swarm.evaluateSignal({
      symbol: 'REAL',
      domain: 'MEME_SOLANA',
      contractAddress: '0xreal',
      liquidityUsd: 50000,
      volume1hUsd: 100000,
      securityAuditPassed: true,
      socialHypeScore: 85,
    });
    expect(res.passed).toBe(true);
    expect(res.confidenceScore).toBeGreaterThanOrEqual(80);
  });
});
