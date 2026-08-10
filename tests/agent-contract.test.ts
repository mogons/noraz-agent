import { describe, it, expect } from 'vitest';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../src/agents/shared/agent-contract.js';

describe('Agent contract types', () => {
  it('AgentReport shape is complete', () => {
    const report: AgentReport = {
      passed: true,
      signal: { symbol: 'X' },
      reason: 'ok',
      confidence: 85,
      payload: {
        domain: 'MEME_ROBINHOOD', title: 'X', symbol: 'X', network: 'Robinhood',
        aiThesis: 't', securityAuditPassed: true, socialHypeScore: 70,
        liquidityUsd: 1000, volume1hUsd: 500,
      },
    };
    expect(report.passed).toBe(true);
    expect(report.confidence).toBe(85);
  });

  it('ScreeningAgent interface is implementable', () => {
    const agent: ScreeningAgent = {
      domain: 'meme-robinhood',
      runScreeningPass: async () => [],
    };
    expect(agent.domain).toBe('meme-robinhood');
  });
});
