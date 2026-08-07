import { describe, it, expect, vi } from 'vitest';
import { runAgent } from '../src/orchestrator/agent-runner.js';

const makeToolRegistry = () => {
  let calls = 0;
  return {
    getToolDefinitions: () => [{ name: 'ping', description: 'ping', parameters: { type: 'object', properties: {} } }],
    executeToolCall: vi.fn().mockImplementation(async () => {
      calls++;
      return { success: true, message: `pong ${calls}` };
    }),
    _calls: () => calls,
  } as any;
};

describe('AgentRunner', () => {
  it('executes a tool call then returns the final answer', async () => {
    const registry = makeToolRegistry();
    const aiService = {
      generateWithTools: vi.fn()
        .mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'c1', name: 'ping', arguments: {} }] })
        .mockResolvedValueOnce({ content: 'Pong diterima.', toolCalls: [] }),
    } as any;

    const result = await runAgent(
      { aiService, toolRegistry: registry, systemPrompt: 'sys', maxRounds: 5 },
      'ping'
    );

    expect(registry.executeToolCall).toHaveBeenCalledTimes(1);
    expect(aiService.generateWithTools).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('Pong diterima.');
    expect(result.toolResults.length).toBe(1);
    expect(result.toolResults[0].name).toBe('ping');
  });

  it('caps at maxRounds to prevent infinite loops', async () => {
    const registry = makeToolRegistry();
    const aiService = {
      generateWithTools: vi.fn().mockResolvedValue({
        content: '',
        toolCalls: [{ id: 'c', name: 'ping', arguments: {} }],
      }),
    } as any;

    const result = await runAgent(
      { aiService, toolRegistry: registry, systemPrompt: 'sys', maxRounds: 3 },
      'loop'
    );

    expect(aiService.generateWithTools).toHaveBeenCalledTimes(3);
    expect(result.toolResults.length).toBe(3);
    expect(typeof result.text).toBe('string');
  });
});
