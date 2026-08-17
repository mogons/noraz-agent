export interface AIProviderConfig {
  provider: 'openrouter' | 'openai' | 'anthropic' | 'opencode' | 'codingplan' | 'zai' | 'deepseek' | 'minimax' | 'gemini' | 'custom';
  apiKeys: string[]; // Stacked list of primary & backup API keys
  baseUrl?: string;
  modelName: string;
  keyConfigs: AIKeyConfig[]; // Per-key provider/baseUrl/model (slot 1 = primary, slot N = AI_KEY_N_*)
}

export interface AIKeyConfig {
  apiKey: string;
  provider: AIProviderConfig['provider'];
  baseUrl: string;
  modelName: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LLMResponse {
  content: string;
  toolCalls: LLMToolCall[];
  reasoningContent?: string;
}

export class AIService {
  private config: AIProviderConfig;
  private activeKeyIndex: number = 0;

  constructor(customConfig?: Partial<AIProviderConfig>) {
    this.config = this.resolveConfig(customConfig);
  }

  private static PROVIDER_DEFAULTS: Record<string, { baseUrl: string; modelName: string }> = {
    anthropic: { baseUrl: 'https://api.anthropic.com/v1', modelName: 'claude-sonnet-5' },
    openai: { baseUrl: 'https://api.openai.com/v1', modelName: 'gpt-5.2-chat' },
    opencode: { baseUrl: 'https://opencode.ai/zen/go/v1', modelName: 'deepseek-v4-pro' },
    codingplan: { baseUrl: 'https://api.z.ai/api/coding/paas/v4', modelName: 'glm-5.2' },
    zai: { baseUrl: 'https://api.z.ai/api/paas/v4', modelName: 'glm-4.7' },
    deepseek: { baseUrl: 'https://api.deepseek.com', modelName: 'deepseek-v4-flash' },
    minimax: { baseUrl: 'https://api.minimax.chat/v1', modelName: 'MiniMax-M3' },
    gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelName: 'gemini-2.5-pro' },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', modelName: 'openrouter/auto' },
    custom: { baseUrl: 'https://openrouter.ai/api/v1', modelName: 'deepseek/deepseek-chat' },
  };

  private applyDefaults(provider: AIProviderConfig['provider'], baseUrl?: string, modelName?: string): { provider: AIProviderConfig['provider']; baseUrl: string; modelName: string } {
    const d = AIService.PROVIDER_DEFAULTS[provider] || AIService.PROVIDER_DEFAULTS.custom;
    return { provider, baseUrl: baseUrl || d.baseUrl, modelName: modelName || d.modelName };
  }

  private buildKeyConfigs(apiKeys: string[], primary: { provider: AIProviderConfig['provider']; baseUrl: string; modelName: string }): AIKeyConfig[] {
    return apiKeys.map((apiKey, idx) => {
      if (idx === 0) return { apiKey, ...primary };
      const slot = idx + 1;
      const slotProvider = (process.env[`AI_KEY_${slot}_PROVIDER`] || primary.provider) as AIProviderConfig['provider'];
      const slotBaseUrl = process.env[`AI_KEY_${slot}_BASE_URL`] || primary.baseUrl;
      const slotModel = process.env[`AI_KEY_${slot}_MODEL_NAME`] || primary.modelName;
      return { apiKey, ...this.applyDefaults(slotProvider, slotBaseUrl, slotModel) };
    });
  }

  private resolveConfig(customConfig?: Partial<AIProviderConfig>): AIProviderConfig {
    const provider = (customConfig?.provider || process.env.AI_PROVIDER || 'openrouter') as AIProviderConfig['provider'];

    // Support comma-separated API keys for backup stacking: e.g. "key1,key2,key3"
    const rawKeys = customConfig?.apiKeys
      ? customConfig.apiKeys.join(',')
      : process.env.AI_API_KEYS || process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

    const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);

    const primary = this.applyDefaults(
      provider,
      customConfig?.baseUrl || process.env.AI_BASE_URL,
      customConfig?.modelName || process.env.AI_MODEL_NAME,
    );

    return { ...primary, apiKeys, keyConfigs: this.buildKeyConfigs(apiKeys, primary) };
  }

  public updateConfig(newConfig: Partial<AIProviderConfig>): void {
    this.config = { ...this.config, ...newConfig };
    const primary = this.applyDefaults(
      newConfig.provider || this.config.provider,
      newConfig.baseUrl || this.config.baseUrl,
      newConfig.modelName || this.config.modelName,
    );
    this.config.apiKeys = newConfig.apiKeys || this.config.apiKeys;
    this.config.provider = primary.provider;
    this.config.baseUrl = primary.baseUrl;
    this.config.modelName = primary.modelName;
    this.config.keyConfigs = this.buildKeyConfigs(this.config.apiKeys, primary);
    this.activeKeyIndex = 0;
  }

  public updateProviderConfig(provider: string, modelName: string): void {
    const primary = this.applyDefaults(provider as AIProviderConfig['provider'], this.config.keyConfigs[0]?.baseUrl, modelName);
    this.config.provider = primary.provider;
    this.config.baseUrl = primary.baseUrl;
    this.config.modelName = primary.modelName;
    if (this.config.keyConfigs[0]) {
      this.config.keyConfigs[0] = { apiKey: this.config.keyConfigs[0].apiKey, ...primary };
    }
    console.log(`[AI SERVICE] Updated active provider to: ${provider} | Model: ${modelName}`);
  }

  public getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  public async generateCompletion(messages: AIMessage[], maxTokens: number = 1000, skillInstructions?: string): Promise<string> {
    if (this.config.apiKeys.length === 0) {
      return '[AI Analysis Skipped: No AI_API_KEY configured. Please set API key in .env or via /config]';
    }

    const finalMessages = [...messages];
    if (skillInstructions) {
      const sysIndex = finalMessages.findIndex(m => m.role === 'system');
      if (sysIndex >= 0) {
        finalMessages[sysIndex] = {
          role: 'system',
          content: `${finalMessages[sysIndex].content}\n${skillInstructions}`,
        };
      }
    }

    // Try active key, and loop round-robin through backups if rate-limited/failed
    let lastError: Error | null = null;
    const totalKeys = this.config.keyConfigs.length;

    for (let attempts = 0; attempts < totalKeys; attempts++) {
      const currentIndex = (this.activeKeyIndex + attempts) % totalKeys;
      const key = this.config.keyConfigs[currentIndex];

      try {
        let result: string;
        if (key.provider === 'anthropic') {
          result = await this.callAnthropic(finalMessages, maxTokens, key);
        } else {
          result = await this.callOpenAICompatible(finalMessages, maxTokens, key);
        }

        // Successfully generated using currentIndex - update active key index for future calls!
        if (this.activeKeyIndex !== currentIndex) {
          console.log(`[AI SERVICE] Permanently switched active key pointer to Key #${currentIndex + 1}.`);
          this.activeKeyIndex = currentIndex;
        }

        return result;
      } catch (err: any) {
        lastError = err;
        console.warn(`[AI FAILOVER WARNING] API Key #${currentIndex + 1}/${totalKeys} failed: ${err.message}.`);
        console.log(`🔄 Round-Robin Looping: Advancing to next Key pointer #${((currentIndex + 1) % totalKeys) + 1}...`);
      }
    }

    throw new Error(`All ${totalKeys} stacked AI API Keys exhausted. Last Error: ${lastError?.message}`);
  }

  /**
   * Real LLM function-calling. Returns the model's text plus any tool calls it wants to make.
   * Degrades gracefully to `{ content: '', toolCalls: [] }` on total failure.
   */
  public async generateWithTools(
    messages: any[],
    tools: LLMToolDefinition[],
    maxTokens: number = 1000
  ): Promise<LLMResponse> {
    if (this.config.apiKeys.length === 0) {
      return { content: '[AI Analysis Skipped: No AI_API_KEY configured. Please set API key in .env or via /config]', toolCalls: [] };
    }

    let lastError: Error | null = null;
    const totalKeys = this.config.keyConfigs.length;

    for (let attempts = 0; attempts < totalKeys; attempts++) {
      const currentIndex = (this.activeKeyIndex + attempts) % totalKeys;
      const key = this.config.keyConfigs[currentIndex];

      try {
        if (key.provider === 'anthropic') {
          return await this.callAnthropicWithTools(messages, tools, maxTokens, key);
        }
        return await this.callOpenAIWithTools(messages, tools, maxTokens, key);
      } catch (err: any) {
        lastError = err;
        console.warn(`[AI FAILOVER WARNING] generateWithTools key #${currentIndex + 1}/${totalKeys} failed: ${err.message}.`);
      }
    }

    console.warn(`[AI SERVICE] generateWithTools failed: ${lastError?.message}`);
    return { content: '', toolCalls: [] };
  }

  private async callOpenAIWithTools(messages: any[], tools: LLMToolDefinition[], maxTokens: number, key: AIKeyConfig): Promise<LLMResponse> {
    const endpoint = `${key.baseUrl?.replace(/\/$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.apiKey}`,
    };

    if (key.baseUrl?.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://opencat-crypto.local';
      headers['X-Title'] = 'Opencat AI (Robinhood Chain)';
    }

    const candidateModels = [
      key.modelName,
      'openrouter/auto',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-chat',
    ];

    const modelsToTry = key.baseUrl?.includes('openrouter.ai')
      ? Array.from(new Set(candidateModels))
      : [key.modelName];

    const effectiveMaxTokens = key.baseUrl?.includes('openrouter.ai')
      ? Math.min(maxTokens || 1500, 2000)
      : (maxTokens || 2000);

    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: effectiveMaxTokens,
            temperature: 0.5,
            tools: tools.map((t) => ({ type: 'function', function: t })),
          }),
        });

        const rawText = await response.text();
        if (response.ok) {
          try {
            const data: any = JSON.parse(rawText);
            const message = data.choices?.[0]?.message;
            if (message) {
              const content = String(message.content || '').trim();
              const reasoningContent = message.reasoning_content ? String(message.reasoning_content) : undefined;
              const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
              const toolCalls: LLMToolCall[] = rawCalls
                .map((c: any) => {
                  let args: Record<string, any> = {};
                  try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = {}; }
                  return {
                    id: String(c.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
                    name: String(c.function?.name || ''),
                    arguments: args,
                  };
                })
                .filter((c: LLMToolCall) => c.name);
              return { content, toolCalls, reasoningContent };
            }
          } catch {
            // fall through to error handling
          }
        }

        lastError = new Error(`Model ${model} Status ${response.status}: ${rawText}`);
        console.warn(`[AI SERVICE WARNING] Tools model ${model} failed: ${lastError.message}. Trying next model...`);
      } catch (err: any) {
        lastError = err;
        console.warn(`[AI SERVICE WARNING] Tools network error for ${model}: ${err.message}`);
      }
    }

    throw lastError || new Error('All AI models failed for tool-calling.');
  }

  private async callAnthropicWithTools(messages: any[], tools: LLMToolDefinition[], maxTokens: number, key: AIKeyConfig): Promise<LLMResponse> {
    const endpoint = `${key.baseUrl?.replace(/\/$/, '')}/messages`;

    const systemMessage = messages.find((m: any) => m.role === 'system')?.content;
    const bodyMessages: any[] = [];

    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        // Pragmatic tool-result passthrough (avoids strict tool_result block protocol)
        bodyMessages.push({
          role: 'user',
          content: `[Tool result]: ${String(m.content || '')}`,
        });
      } else if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
        bodyMessages.push({
          role: 'assistant',
          content: [{ type: 'text', text: String(m.content || '') }],
        });
      } else {
        bodyMessages.push({ role: m.role, content: String(m.content || '') });
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: key.modelName,
        system: systemMessage,
        messages: bodyMessages,
        max_tokens: maxTokens,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: { type: 'object', properties: t.parameters.properties, required: t.parameters.required || [] },
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic Status ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();
    let content = '';
    const toolCalls: LLMToolCall[] = [];
    const blocks = Array.isArray(data.content) ? data.content : [];
    for (const block of blocks) {
      if (block.type === 'text') {
        content += block.text || '';
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: String(block.id || `toolu_${Date.now()}`),
          name: String(block.name || ''),
          arguments: block.input || {},
        });
      }
    }
    return { content: content.trim(), toolCalls };
  }

  private async callOpenAICompatible(messages: AIMessage[], maxTokens: number, key: AIKeyConfig): Promise<string> {
    const endpoint = `${key.baseUrl?.replace(/\/$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.apiKey}`,
    };

    if (key.baseUrl?.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://opencat-crypto.local';
      headers['X-Title'] = 'Opencat AI (Robinhood Chain)';
    }

    const candidateModels = [
      key.modelName,
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'openrouter/auto',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-r1',
    ];

    const modelsToTry = key.baseUrl?.includes('openrouter.ai')
      ? Array.from(new Set(candidateModels))
      : [key.modelName];

    // Cap max_tokens on OpenRouter to 1500; allow paid providers (OpenCode, CodingPlan, DeepSeek, OpenAI) full token capacity
    const effectiveMaxTokens = key.baseUrl?.includes('openrouter.ai')
      ? Math.min(maxTokens || 1500, 2000)
      : (maxTokens || 2000);

    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: effectiveMaxTokens,
            temperature: 0.7,
          }),
        });

        const rawText = await response.text();
        if (response.ok) {
          try {
            const data: any = JSON.parse(rawText);
            const content = data.choices?.[0]?.message?.content?.trim();
            if (content) return content;
          } catch {
            // Fallthrough to error handling if JSON parsing fails
          }
        }

        lastError = new Error(`Model ${model} Status ${response.status}: ${rawText}`);
        console.warn(`[AI SERVICE WARNING] Model ${model} failed: ${lastError.message}. Trying next model...`);
      } catch (err: any) {
        lastError = err;
        console.warn(`[AI SERVICE WARNING] Network error for ${model}: ${err.message}`);
      }
    }

    throw lastError || new Error('All AI models failed to return a response.');
  }

  private async callAnthropic(messages: AIMessage[], maxTokens: number, key: AIKeyConfig): Promise<string> {
    const endpoint = `${key.baseUrl?.replace(/\/$/, '')}/messages`;

    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: key.modelName,
        system: systemMessage,
        messages: userMessages,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic Status ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();
    return data.content?.[0]?.text?.trim() || 'No response generated from Anthropic.';
  }
}
