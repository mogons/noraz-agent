import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIService } from '../src/services/ai-service.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('AIService per-key config', () => {
  it('maps slot 1 from legacy vars and slot 2 from AI_KEY_2_*', () => {
    vi.stubEnv('AI_PROVIDER', 'zai');
    vi.stubEnv('AI_API_KEYS', 'key1,key2');
    vi.stubEnv('AI_KEY_2_PROVIDER', 'opencode');
    vi.stubEnv('AI_KEY_2_BASE_URL', 'https://opencode.ai/zen/go/v1');
    vi.stubEnv('AI_KEY_2_MODEL_NAME', 'deepseek-v4-flash');
    const cfg = new AIService().getConfig();
    expect(cfg.keyConfigs.length).toBe(2);
    expect(cfg.keyConfigs[0]).toMatchObject({ provider: 'zai', baseUrl: 'https://api.z.ai/api/paas/v4', modelName: 'glm-4.7' });
    expect(cfg.keyConfigs[1]).toMatchObject({ provider: 'opencode', baseUrl: 'https://opencode.ai/zen/go/v1', modelName: 'deepseek-v4-flash' });
  });

  it('falls back to primary config when AI_KEY_N_* missing', () => {
    vi.stubEnv('AI_PROVIDER', 'zai');
    vi.stubEnv('AI_API_KEYS', 'key1,key2');
    const cfg = new AIService().getConfig();
    expect(cfg.keyConfigs[1]).toMatchObject({ provider: 'zai', modelName: 'glm-4.7' });
  });

  it('failover uses each key own baseUrl and model', async () => {
    vi.stubEnv('AI_PROVIDER', 'zai');
    vi.stubEnv('AI_API_KEYS', 'key1,key2');
    vi.stubEnv('AI_KEY_2_PROVIDER', 'opencode');
    vi.stubEnv('AI_KEY_2_BASE_URL', 'https://opencode.ai/zen/go/v1');
    vi.stubEnv('AI_KEY_2_MODEL_NAME', 'deepseek-v4-flash');
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const svc = new AIService();
    const result = await svc.generateCompletion([{ role: 'user', content: 'hi' }], 100);
    expect(result).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstBody] = fetchMock.mock.calls[0];
    expect(String(firstUrl)).toContain('api.z.ai');
    expect(JSON.parse(firstBody.body).model).toBe('glm-4.7');
    const [secondUrl, secondBody] = fetchMock.mock.calls[1];
    expect(String(secondUrl)).toContain('opencode.ai');
    expect(JSON.parse(secondBody.body).model).toBe('deepseek-v4-flash');
  });

  it('updateProviderConfig changes only the primary slot', () => {
    vi.stubEnv('AI_PROVIDER', 'zai');
    vi.stubEnv('AI_API_KEYS', 'key1,key2');
    vi.stubEnv('AI_KEY_2_PROVIDER', 'opencode');
    vi.stubEnv('AI_KEY_2_MODEL_NAME', 'deepseek-v4-flash');
    const svc = new AIService();
    svc.updateProviderConfig('opencode', 'deepseek-v4-flash');
    const cfg = svc.getConfig();
    expect(cfg.provider).toBe('opencode');
    expect(cfg.keyConfigs[0]).toMatchObject({ provider: 'opencode', modelName: 'deepseek-v4-flash' });
    expect(cfg.keyConfigs[1]).toMatchObject({ provider: 'opencode', modelName: 'deepseek-v4-flash' });
  });

  it('minimax and gemini providers resolve their defaults', () => {
    vi.stubEnv('AI_API_KEY', 'x');
    vi.stubEnv('AI_PROVIDER', 'minimax');
    delete process.env.AI_BASE_URL; delete process.env.AI_MODEL_NAME;
    let svc = new AIService();
    expect(svc.getConfig().baseUrl).toBe('https://api.minimax.chat/v1');
    expect(svc.getConfig().modelName).toBe('MiniMax-M3');
    vi.stubEnv('AI_PROVIDER', 'gemini');
    svc = new AIService();
    expect(svc.getConfig().baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(svc.getConfig().modelName).toBe('gemini-2.5-pro');
  });
});
