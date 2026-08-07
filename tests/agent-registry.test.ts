import { describe, it, expect } from 'vitest';
import { getAgentDomain, normalizeDomainKey, AGENT_DOMAINS } from '../src/orchestrator/agent-registry.js';

describe('agent registry', () => {
  it('contains all 8 agent domains with channels', () => {
    expect(AGENT_DOMAINS.map((d) => d.id).sort()).toEqual(
      ['ct-alpha', 'lp-evm', 'lp-solana', 'meme-evm', 'meme-solana', 'nft', 'perps', 'prediction'].sort()
    );
  });

  it('getAgentDomain resolves canonical id, aliases, and channel names', () => {
    expect(getAgentDomain('meme-solana')?.channel).toBe('call-meme-solana');
    expect(getAgentDomain('solana-meme')?.id).toBe('meme-solana');
    expect(getAgentDomain('call-perps-futures')?.id).toBe('perps');
    expect(getAgentDomain('unknown-agent')).toBeUndefined();
  });

  it('normalizeDomainKey strips prefixes consistently', () => {
    expect(normalizeDomainKey('MEME_SOLANA')).toBe('meme-solana');
    expect(normalizeDomainKey('call-meme-evm')).toBe('meme-evm');
    expect(normalizeDomainKey('solana-meme')).toBe('meme-solana');
  });
});
