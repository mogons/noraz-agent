import type { AthenaHub } from './hub.js';
import type { AIService } from '../services/ai-service.js';

export interface AthenaToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export class ToolRegistry {
  private orchestrator?: AthenaHub;
  private aiService?: AIService;

  public attachOrchestrator(orchestrator: AthenaHub) {
    this.orchestrator = orchestrator;
  }

  public attachAIService(aiService: AIService) {
    this.aiService = aiService;
  }

  /**
   * Returns list of tools formatted for LLM Function Calling schemas (OpenAI / OpenRouter format)
   */
  public getToolDefinitions(): AthenaToolDefinition[] {
    return [
      {
        name: 'pause_sub_agent',
        description: 'Pause a specific background screening sub-agent (e.g. solana-meme, evm-meme, perps, nft, prediction, ct-alpha, lp-solana, lp-evm).',
        parameters: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'The ID of the sub-agent to pause (e.g. solana-meme, evm-meme, perps, nft, prediction, ct-alpha, lp-solana, lp-evm, or all).',
            },
          },
          required: ['agentId'],
        },
      },
      {
        name: 'resume_sub_agent',
        description: 'Resume a paused background screening sub-agent.',
        parameters: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'The ID of the sub-agent to resume (e.g. solana-meme, evm-meme, perps, nft, prediction, ct-alpha, lp-solana, lp-evm, or all).',
            },
          },
          required: ['agentId'],
        },
      },
      {
        name: 'trigger_screening_pass',
        description: 'Immediately trigger an on-demand market screening pass for a specific sub-agent.',
        parameters: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'The sub-agent to trigger immediately (e.g. solana-meme, evm-meme, perps, nft, prediction, ct-alpha, lp-solana, lp-evm, or all).',
            },
          },
          required: ['agentId'],
        },
      },
      {
        name: 'set_risk_limit',
        description: 'Adjust global portfolio risk parameters such as Max Drawdown percentage or Max Position Size in USD.',
        parameters: {
          type: 'object',
          properties: {
            maxDrawdownPct: {
              type: 'number',
              description: 'Maximum portfolio drawdown limit in percentage (e.g. 40.0 for 40%).',
            },
            maxPositionSizeUsd: {
              type: 'number',
              description: 'Maximum position size in USD (e.g. 500 for $500 max per trade).',
            },
          },
        },
      },
      {
        name: 'get_agent_statuses',
        description: 'Retrieve real-time status, active state (running/paused), last signal timestamp, and confidence scores for all sub-agents.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'switch_ai_model',
        description: 'Switch the active LLM provider or model name at runtime.',
        parameters: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              description: 'LLM provider name (e.g. openrouter, openai, anthropic, opencode, zai, custom).',
            },
            modelName: {
              type: 'string',
              description: 'Specific model identifier (e.g. meta-llama/llama-3.3-70b-instruct:free, gpt-4o, claude-3-5-sonnet-20241022).',
            },
          },
        },
      },
      {
        name: 'schedule_automation',
        description: 'Schedule a recurring automation task in natural language (e.g., "every 4 hours", "every 30 mins", "daily at 09:00").',
        parameters: {
          type: 'object',
          properties: {
            interval: {
              type: 'string',
              description: 'Interval or natural language schedule expression (e.g. "every 4 hours", "every 30 mins").',
            },
            action: {
              type: 'string',
              description: 'Action to trigger: "screening", "portfolio_recap", or "custom_prompt".',
            },
            agentId: {
              type: 'string',
              description: 'Target sub-agent ID (e.g. solana-meme, evm-meme, perps, nft).',
            },
          },
          required: ['interval'],
        },
      },
      {
        name: 'search_memory',
        description: 'Search past token audits, price alerts, and conversation memories using fast zero-LLM-token keyword search.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Keyword search term (contract address, token symbol, or chain name).',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  /**
   * Execute a tool call triggered by the AI Oracle
   */
  public async executeToolCall(toolName: string, args: Record<string, any>): Promise<{ success: boolean; message: string; data?: any }> {
    console.log(`[TOOL REGISTRY] Executing Tool Call: ${toolName} with args:`, args);

    if (!this.orchestrator) {
      return { success: false, message: 'Orchestrator not attached to ToolRegistry.' };
    }

    try {
      switch (toolName) {
        case 'pause_sub_agent': {
          const agentId = String(args.agentId || '').toLowerCase().trim();
          const result = this.orchestrator.pauseAgent(agentId);
          return {
            success: true,
            message: `Sub-agent ${agentId} is now PAUSED.`,
            data: result,
          };
        }

        case 'resume_sub_agent': {
          const agentId = String(args.agentId || '').toLowerCase().trim();
          const result = this.orchestrator.resumeAgent(agentId);
          return {
            success: true,
            message: `Sub-agent ${agentId} is now RESUMED and running 24/7.`,
            data: result,
          };
        }

        case 'trigger_screening_pass': {
          const agentId = String(args.agentId || '').toLowerCase().trim();
          const signals = await this.orchestrator.triggerAgentPass(agentId);
          return {
            success: true,
            message: `Triggered screening pass for ${agentId}. Found ${signals.length} candidate signals.`,
            data: signals,
          };
        }

        case 'set_risk_limit': {
          const maxDrawdownPct = args.maxDrawdownPct !== undefined ? Number(args.maxDrawdownPct) : undefined;
          const maxPositionSizeUsd = args.maxPositionSizeUsd !== undefined ? Number(args.maxPositionSizeUsd) : undefined;

          const updated = this.orchestrator.setRiskParameters(maxDrawdownPct, maxPositionSizeUsd);
          return {
            success: true,
            message: `Risk parameters updated: Drawdown Limit = ${updated.maxDrawdownPct}%, Max Position Size = $${updated.maxPositionSizeUsd}.`,
            data: updated,
          };
        }

        case 'get_agent_statuses': {
          const statuses = this.orchestrator.getAgentStatuses();
          return {
            success: true,
            message: 'Retrieved real-time sub-agent statuses.',
            data: statuses,
          };
        }

        case 'switch_ai_model': {
          if (this.aiService && args.provider && args.modelName) {
            this.aiService.updateProviderConfig(args.provider, args.modelName);
            return {
              success: true,
              message: `AI Model switched to provider: ${args.provider} | Model: ${args.modelName}`,
            };
          }
          return {
            success: false,
            message: 'Failed to switch AI model: Provider or modelName missing.',
          };
        }

        case 'schedule_automation': {
          const { CronSchedulerService } = await import('../services/cron-scheduler.js');
          const scheduler = new CronSchedulerService();
          if (this.orchestrator) {
            scheduler.attachHub(this.orchestrator);
          }

          const interval = String(args.interval || 'every 1 hour');
          const action = (args.action || 'screening') as any;
          const agentId = String(args.agentId || 'solana-meme');

          const task = scheduler.addSchedule(interval, action, agentId);
          return {
            success: true,
            message: `Registered schedule: "${interval}" (${action} -> ${agentId}) [Task ID: ${task.id}].`,
            data: task,
          };
        }

        case 'search_memory': {
          const { SessionMemoryService } = await import('../services/session-memory.js');
          const memory = new SessionMemoryService();
          const query = String(args.query || '');
          const results = memory.searchAudits(query);
          return {
            success: true,
            message: `Found ${results.length} memory records matching query: "${query}".`,
            data: results,
          };
        }

        default:
          return {
            success: false,
            message: `Unknown tool name: ${toolName}`,
          };
      }
    } catch (err: any) {
      console.error(`[TOOL REGISTRY ERROR] Failed executing ${toolName}:`, err.message);
      return {
        success: false,
        message: `Error executing ${toolName}: ${err.message}`,
      };
    }
  }
}
