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
      const assistantMsg: any = {
        role: 'assistant',
        content: lastText || '',
        tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }],
      };
      // DeepSeek/thinking models require reasoning_content to be passed back on follow-up rounds
      if (resp.reasoningContent) {
        assistantMsg.reasoning_content = resp.reasoningContent;
      }
      messages.push(assistantMsg);

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

  // Max tool rounds reached: give the LLM ONE final non-tool round to compose
  // a real summary from everything gathered (instead of returning the last
  // mid-process text). If even that fails, fall back gracefully.
  try {
    const summary = await options.aiService.generateWithTools(
      [
        ...messages,
        {
          role: 'system',
          content:
            'Kamu sudah memakai semua tool rounds yang tersedia. Sekarang TULIS JAWABAN FINAL untuk user berdasarkan hasil tool di atas. Jangan panggil tool lagi — langsung jawab dalam bahasa Indonesia, ringkas dan informatif, sertakan data yang relevan. Jika ada hasil yang gagal, katakan jujur.',
        },
      ],
      [], // no tools → forces a plain text answer
      1200
    );
    if (summary.content && summary.content.trim()) {
      return { text: summary.content.trim(), toolResults };
    }
  } catch (err: any) {
    console.warn(`[AGENT RUNNER] Summary round gagal: ${err.message}`);
  }

  return {
    text: lastText || 'Tool rounds habis sebelum jawaban selesai — coba persempit pertanyaannya.',
    toolResults,
  };
}
