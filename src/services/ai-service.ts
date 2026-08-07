export interface AIProviderConfig {
  provider: 'openrouter' | 'openai' | 'anthropic' | 'opencode' | 'codingplan' | 'zai' | 'deepseek' | 'custom';
  apiKeys: string[]; // Stacked list of primary & backup API keys
  baseUrl?: string;
  modelName: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AIService {
  private config: AIProviderConfig;
  private activeKeyIndex: number = 0;

  constructor(customConfig?: Partial<AIProviderConfig>) {
    this.config = this.resolveConfig(customConfig);
  }

  private resolveConfig(customConfig?: Partial<AIProviderConfig>): AIProviderConfig {
    const provider = (customConfig?.provider || process.env.AI_PROVIDER || 'openrouter') as AIProviderConfig['provider'];
    
    // Support comma-separated API keys for backup stacking: e.g. "key1,key2,key3"
    const rawKeys = customConfig?.apiKeys
      ? customConfig.apiKeys.join(',')
      : process.env.AI_API_KEYS || process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

    const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);

    let baseUrl = customConfig?.baseUrl || process.env.AI_BASE_URL;
    let modelName = customConfig?.modelName || process.env.AI_MODEL_NAME;

    switch (provider) {
      case 'anthropic':
        baseUrl = baseUrl || 'https://api.anthropic.com/v1';
        modelName = modelName || 'claude-3-5-sonnet-20241022';
        break;
      case 'openai':
        baseUrl = baseUrl || 'https://api.openai.com/v1';
        modelName = modelName || 'gpt-4o';
        break;
      case 'opencode':
        baseUrl = baseUrl || 'https://opencode.ai/zen/go/v1';
        modelName = modelName || 'deepseek-v4-pro';
        break;
      case 'codingplan':
      case 'zai':
        baseUrl = baseUrl || 'https://api.z.ai/api/coding/paas/v4';
        modelName = modelName || 'glm-4.7';
        break;
      case 'deepseek':
        baseUrl = baseUrl || 'https://api.deepseek.com/v1';
        modelName = modelName || 'deepseek-chat';
        break;
      case 'openrouter':
        baseUrl = baseUrl || 'https://openrouter.ai/api/v1';
        modelName = modelName || 'openrouter/auto';
        break;
      case 'custom':
      default:
        baseUrl = baseUrl || 'https://openrouter.ai/api/v1';
        modelName = modelName || 'deepseek/deepseek-chat';
        break;
    }

    return { provider, apiKeys, baseUrl, modelName };
  }

  public updateConfig(newConfig: Partial<AIProviderConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.activeKeyIndex = 0;
  }

  public updateProviderConfig(provider: string, modelName: string): void {
    this.config.provider = provider as any;
    this.config.modelName = modelName;
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
    const totalKeys = this.config.apiKeys.length;

    for (let attempts = 0; attempts < totalKeys; attempts++) {
      const currentIndex = (this.activeKeyIndex + attempts) % totalKeys;
      const activeKey = this.config.apiKeys[currentIndex];

      try {
        let result: string;
        if (this.config.provider === 'anthropic') {
          result = await this.callAnthropic(finalMessages, maxTokens, activeKey);
        } else {
          result = await this.callOpenAICompatible(finalMessages, maxTokens, activeKey);
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

  private async callOpenAICompatible(messages: AIMessage[], maxTokens: number, apiKey: string): Promise<string> {
    const endpoint = `${this.config.baseUrl?.replace(/\/$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (this.config.baseUrl?.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://athena-crypto.local';
      headers['X-Title'] = 'Athena Crypto Agent';
    }

    const candidateModels = [
      this.config.modelName,
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'openrouter/auto',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-r1',
    ];

    const modelsToTry = this.config.baseUrl?.includes('openrouter.ai')
      ? Array.from(new Set(candidateModels))
      : [this.config.modelName];

    // Cap max_tokens on OpenRouter to 1500; allow paid providers (OpenCode, CodingPlan, DeepSeek, OpenAI) full token capacity
    const effectiveMaxTokens = this.config.baseUrl?.includes('openrouter.ai')
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

  private async callAnthropic(messages: AIMessage[], maxTokens: number, apiKey: string): Promise<string> {
    const endpoint = `${this.config.baseUrl?.replace(/\/$/, '')}/messages`;

    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.modelName,
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
