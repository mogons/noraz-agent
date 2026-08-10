import { describe, it, expect } from 'vitest';
import { getAgentDomain, normalizeDomainKey, AGENT_DOMAINS } from '../src/orchestrator/agent-registry.js';

describe('agent registry', () => {
  it('contains all Robinhood Chain agent domains with channels', () => {
    expect(AGENT_DOMAINS.map((d) => d.id).sort()).toEqual(
      ['alpha-robinhood', 'lp-robinhood', 'meme-robinhood', 'nft'].sort()
    );
  });

  it('getAgentDomain resolves canonical id, aliases, and channel names', () => {
    expect(getAgentDomain('meme-robinhood')?.channel).toBe('call-meme-robinhood');
    expect(getAgentDomain('evm-meme')?.id).toBe('meme-robinhood');
    expect(getAgentDomain('call-nft-robinhood')?.id).toBe('nft');
    expect(getAgentDomain('unknown-agent')).toBeUndefined();
  });

  it('normalizeDomainKey strips prefixes consistently', () => {
    expect(normalizeDomainKey('MEME_ROBINHOOD')).toBe('meme-robinhood');
    expect(normalizeDomainKey('call-meme-robinhood')).toBe('meme-robinhood');
    expect(normalizeDomainKey('meme-evm')).toBe('meme-robinhood');
  });
});
