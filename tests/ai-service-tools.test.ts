import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIService } from '../src/services/ai-service.js';

function makeService(): AIService {
  return new AIService({
    provider: 'openrouter',
    apiKeys: ['test-key'],
    baseUrl: 'https://fake.openrouter.ai/api/v1',
    modelName: 'test-model',
  });
}

describe('AIService.generateWithTools', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('parses OpenAI-compatible tool_calls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ message: {
          content: 'Saya akan cek status.',
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_agent_statuses', arguments: '{}' } }],
        } }],
      }),
    }));
    const svc = makeService();
    const resp = await svc.generateWithTools(
      [{ role: 'user', content: 'status agent?' }],
      [{ name: 'get_agent_statuses', description: 'd', parameters: { type: 'object', properties: {} } }],
      1000
    );
    expect(resp.toolCalls.length).toBe(1);
    expect(resp.toolCalls[0].name).toBe('get_agent_statuses');
    expect(resp.content).toContain('status');
  });

  it('returns empty toolCalls when the model replies plain text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'Halo!', tool_calls: null } }] }),
    }));
    const svc = makeService();
    const resp = await svc.generateWithTools([{ role: 'user', content: 'halo' }], [], 1000);
    expect(resp.toolCalls.length).toBe(0);
    expect(resp.content).toBe('Halo!');
  });

  it('degrades to empty result when all models fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const svc = makeService();
    const resp = await svc.generateWithTools([{ role: 'user', content: 'x' }], [], 1000);
    expect(resp.toolCalls).toEqual([]);
    expect(resp.content).toBe('');
  });
});
