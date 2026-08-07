import type { AIService, LLMToolDefinition } from '../services/ai-service.js';
import type { ToolRegistry } from './tool-registry.js';

export interface AgentRunnerOptions {
  aiService: AIService;
  toolRegistry: ToolRegistry;
  systemPrompt: string;
  maxRounds?: number;
}

export interface AgentRunnerResult {
  text: string;
  toolResults: Array<{ name: string; success: boolean; message: string }>;
}

export async function runAgent(
  options: AgentRunnerOptions,
  userMessage: string
): Promise<AgentRunnerResult> {
  const maxRounds = options.maxRounds ?? 6;
  const toolResults: Array<{ name: string; success: boolean; message: string }> = [];

  const messages: any[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const tools: LLMToolDefinition[] = options.toolRegistry.getToolDefinitions();

  let lastText = '';

  for (let round = 0; round < maxRounds; round++) {
    const resp = await options.aiService.generateWithTools(messages, tools, 1500);

    if (resp.toolCalls.length === 0) {
      lastText = resp.content;
      return { text: lastText || 'Tidak ada respons.', toolResults };
    }

    lastText = resp.content;

    for (const tc of resp.toolCalls) {
      messages.push({
        role: 'assistant',
        content: lastText || '',
        tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }],
      });

      let result: { success: boolean; message: string; data?: any };
      try {
        result = await options.toolRegistry.executeToolCall(tc.name, tc.arguments);
      } catch (err: any) {
        result = { success: false, message: `Tool execution error: ${err.message}` };
      }

      toolResults.push({ name: tc.name, success: result.success, message: result.message });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify({ success: result.success, message: result.message, data: result.data ?? null }),
      });
    }
  }

  return {
    text: lastText || 'Terlalu banyak tool rounds — selesaikan dengan ringkasan singkat.',
    toolResults,
  };
}
