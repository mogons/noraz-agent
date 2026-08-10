import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XApiAdapter } from '../src/adapters/x-api-adapter.js';
import { AlphaRobinhoodScreeningAgent } from '../src/agents/alpha-robinhood/alpha-screening-agent.js';

describe('XApiAdapter & AlphaRobinhoodScreeningAgent Test Suite', () => {
  beforeEach(() => {
    delete process.env.X_API_BEARER_TOKEN;
    delete process.env.ENABLE_X_ALPHA_SCRAPER;
  });

  it('XApiAdapter isConfigured returns false when no bearer token is present', () => {
    const adapter = new XApiAdapter();
    expect(adapter.isConfigured()).toBe(false);
  });

  it('XApiAdapter searchRobinhoodAlpha returns clear message when not configured', async () => {
    const adapter = new XApiAdapter();
    const result = await adapter.searchRobinhoodAlpha('robinhood chain');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Official X_API_BEARER_TOKEN is not configured');
  });

  it('AlphaRobinhoodScreeningAgent initializes with domain alpha-robinhood', () => {
    const agent = new AlphaRobinhoodScreeningAgent();
    expect(agent.domain).toBe('alpha-robinhood');
    expect(agent.name).toBe('Robinhood Chain Alpha Scraper Agent');
    expect(agent.isHealthy()).toBe(true);
  });

  it('AlphaRobinhoodScreeningAgent handles offline/empty network gracefully', async () => {
    const agent = new AlphaRobinhoodScreeningAgent();
    const signals = await agent.runScreeningPass();
    expect(Array.isArray(signals)).toBe(true);
  });
});
