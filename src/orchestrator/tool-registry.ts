import type { AthenaHub } from './hub.js';
import type { AIService } from '../services/ai-service.js';
import { StrategyEngine } from './strategy-engine.js';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd());
const BLOCKED_PATH_PARTS = ['.env', '.pem', '.key', 'node_modules', path.join('dist'), '.git', 'private'];
const MAX_READ_FILE_BYTES = 30 * 1024; // 30 KB

/**
 * Keys that an LLM/chat user must NEVER be able to set via set_api_key —
 * they control live-trading mode, wallet funds, or infra. Prompt-injection
 * from token metadata/tweets could otherwise flip DRY_RUN=false or swap keys.
 */
const PROTECTED_ENV_KEYS = [
  'DRY_RUN',
  'SOLANA_PRIVATE_KEY', 'EVM_PRIVATE_KEY', 'HYPERLIQUID_PRIVATE_KEY', 'POLYMARKET_PRIVATE_KEY',
  'SOLANA_RPC_URL', 'SOLANA_WSS_URL', 'EVM_RPC_URL', 'EVM_BASE_RPC_URL', 'EVM_ETH_RPC_URL',
  'EVM_ROBINHOOD_RPC_URL', 'EVM_ARB_RPC_URL', 'EVM_OP_RPC_URL', 'EVM_POLYGON_RPC_URL', 'EVM_BSC_RPC_URL',
  'AI_BASE_URL', 'AI_PROVIDER',
];

/** Keys settable via set_api_key (API credentials only — never mode/private/infra). */
const SETTABLE_ENV_KEYS = [
  'AI_API_KEY', 'AI_API_KEYS', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'GMGN_API_KEY', 'OPENSEA_API_KEY', 'TWEX_API_KEY', 'TWITTER_BEARER_TOKEN', 'GOPLUS_API_KEY',
  'UNISWAP_API_KEY', 'JUPITER_API_KEY', 'RUGCHECK_API_URL',
];

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
  private strategyEngine = new StrategyEngine();
  private walletService?: import('../services/wallet-service.js').WalletService;

  public attachOrchestrator(orchestrator: AthenaHub) {
    this.orchestrator = orchestrator;
  }

  public attachAIService(aiService: AIService) {
    this.aiService = aiService;
  }

  /** Stateful WalletService carries runtime-set keys — must be the SAME instance consumers use. */
  public attachWalletService(walletService: import('../services/wallet-service.js').WalletService) {
    this.walletService = walletService;
  }

  /**
   * Returns list of tools formatted for LLM Function Calling schemas (OpenAI / OpenRouter format)
   */
  public getToolDefinitions(): AthenaToolDefinition[] {
    return [
      {
        name: 'pause_sub_agent',
        description: 'Pause a specific background screening sub-agent (e.g. solana-meme, evm-meme, perps, nft, prediction, ct-alpha, lp-solana, lp-robinhood).',
        parameters: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'The ID of the sub-agent to pause (e.g. solana-meme, evm-meme, perps, nft, prediction, ct-alpha, lp-solana, lp-robinhood, or all).',
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
              description: 'The ID of the sub-agent to resume (e.g. solana-meme, evm-meme, perps, nft, prediction, ct-alpha, lp-solana, lp-robinhood, or all).',
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
              description: 'The sub-agent to trigger immediately (e.g. solana-meme, evm-meme, perps, nft, prediction, ct-alpha, lp-solana, lp-robinhood, or all).',
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
      {
        name: 'set_api_key',
        description: 'Set and persist an API key or environment variable at runtime (e.g. GMGN_API_KEY, OPENSEA_API_KEY, TWEX_API_KEY).',
        parameters: {
          type: 'object',
          properties: {
            keyName: {
              type: 'string',
              description: 'API key environment variable name (e.g. GMGN_API_KEY, OPENSEA_API_KEY, TWEX_API_KEY, POLYMARKET_API_KEY).',
            },
            keyValue: {
              type: 'string',
              description: 'API key secret token value.',
            },
          },
          required: ['keyName', 'keyValue'],
        },
      },
      {
        name: 'start_all_agents',
        description: 'Activate ALL background screening sub-agents at once.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'stop_all_agents',
        description: 'Pause ALL background screening sub-agents at once.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'read_file',
        description: 'Read a text file from the project (read-only). Path must be relative to project root. Secrets (.env, .pem, private keys) are blocked.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative file path e.g. src/index.ts or README.md' },
          },
          required: ['path'],
        },
      },
      {
        name: 'list_directory',
        description: 'List directory entries (read-only). Path must be relative to project root.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative directory path e.g. src/agents or .' },
          },
          required: ['path'],
        },
      },
      {
        name: 'get_runtime_config',
        description: 'Show runtime configuration: dry-run mode, active agents, configured API key names (set/unset only), AI provider/model, risk limits.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'get_system_health',
        description: 'Show system health: per-agent heartbeat status (HEALTHY/DEGRADED/UNRESPONSIVE).',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'get_market_regime',
        description: 'Show the current market regime (TRENDING_BULL/BEAR, SIDEWAYS_CHOP, EXTREME_VOLATILITY) with BTC/ETH 24h change and volatility index.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'get_portfolio',
        description: 'Show portfolio state: SOL/ETH wallet balances, open position count, current drawdown.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'list_strategies',
        description: 'List available strategy modules in strategies/ with their active flag.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'read_strategy',
        description: 'Read a strategy module file content (read-only).',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Strategy file name without extension (e.g. momentum-v2).' } },
          required: ['name'],
        },
      },
      {
        name: 'activate_strategy',
        description: 'Set a strategy as active for a screening domain.',
        parameters: {
          type: 'object',
          properties: {
            strategyId: { type: 'string', description: 'Strategy id.' },
            domain: { type: 'string', description: 'Screening domain (e.g. meme-solana, perps).' },
          },
          required: ['strategyId', 'domain'],
        },
      },
      {
        name: 'rollback_strategy',
        description: 'Restore the previous backup of a strategy module (rollback last write).',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Strategy file name without extension.' } },
          required: ['name'],
        },
      },
      {
        name: 'write_strategy_file',
        description: 'Write or update a strategy module in the strategies/ sandbox (ESM .mjs). Code is validated (subprocess import + shape check) before activation; previous version is auto-backed up.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Strategy file name without extension (alphanumeric, dash, underscore only).' },
            code: { type: 'string', description: 'Full ESM (.mjs) source exporting an AthenaStrategy: { id, name, version, description, params, evaluate(ctx) }.' },
          },
          required: ['name', 'code'],
        },
      },
      {
        name: 'write_indicator_file',
        description: 'Write or update an indicator module in the indicators/ sandbox (ESM .mjs). Validated before activation; previous version auto-backed up.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Indicator file name without extension.' },
            code: { type: 'string', description: 'Full ESM (.mjs) source exporting an AthenaIndicator: { id, name, version, calculate(candles) }.' },
          },
          required: ['name', 'code'],
        },
      },
      {
        name: 'set_screening_config',
        description: 'Update runtime screening thresholds for a sub-agent (meme-solana, meme-robinhood). Whitelisted keys only; out-of-range values are rejected, never silently changed. Valid keys (meme agents): minVolume1hUsd (1000-100000000; volume 1 JAM real, default 50000), minLiquidityUsd (1000-100000000), minMarketCapUsd (1000-1000000000), minAgeHours (0-168; 0 = degen early, token baru lolos), maxRugRatio (0.01-1), maxRatTraderRate (0.01-1), maxTop10HolderRate (0.01-1), minTotalFeeUsd (0-1000000; 500 = default, 0 = gate fee mati), passThreshold (50-99), rankLimit (10-100), trenchesLimit (10-80), hotSearchesLimit (10-500), signalTypes (array of ints 1-21, e.g. [6,7,11,12]), trackFeedEnabled (boolean; trade feed smart-money sebagai kandidat booster), minTrackWallets (1-50; default 2), minTrackBuyUsd (1000-100000000; default 10000), trackFreshMinutes (1-1440; default 30). Persisted across restarts.',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Sub-agent domain: meme-solana or meme-robinhood.' },
            config: { type: 'object', description: 'Key-value map of thresholds to update (whitelisted keys only).' },
          },
          required: ['agentId', 'config'],
        },
      },
    ];
  }

  /**
   * Execute a tool call triggered by the AI Oracle
   */
  public async executeToolCall(toolName: string, args: Record<string, any>): Promise<{ success: boolean; message: string; data?: any }> {
    console.log(`[TOOL REGISTRY] Executing Tool Call: ${toolName} with args:`, args);

    try {
      switch (toolName) {
        case 'pause_sub_agent': {
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
          const agentId = String(args.agentId || '').toLowerCase().trim();
          const result = this.orchestrator.pauseAgent(agentId);
          return {
            success: true,
            message: `Sub-agent ${agentId} is now PAUSED.`,
            data: result,
          };
        }

        case 'resume_sub_agent': {
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
          const agentId = String(args.agentId || '').toLowerCase().trim();
          const result = this.orchestrator.resumeAgent(agentId);
          return {
            success: true,
            message: `Sub-agent ${agentId} is now RESUMED and running 24/7.`,
            data: result,
          };
        }

        case 'trigger_screening_pass': {
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
          const agentId = String(args.agentId || '').toLowerCase().trim();
          const signals = await this.orchestrator.triggerAgentPass(agentId);
          return {
            success: true,
            message: `Triggered screening pass for ${agentId}. Found ${signals.length} candidate signals.`,
            data: signals,
          };
        }

        case 'set_risk_limit': {
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
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
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
          const statuses = this.orchestrator.getAgentStatuses();
          return {
            success: true,
            message: 'Retrieved real-time sub-agent statuses.',
            data: statuses,
          };
        }

        case 'switch_ai_model': {
          if (this.aiService && (args.provider || args.modelName || args.baseUrl)) {
            if (args.provider || args.modelName) {
              this.aiService.updateProviderConfig(args.provider || '', args.modelName || '');
            }
            if (args.baseUrl) {
              this.aiService.updateConfig({ baseUrl: args.baseUrl });
            }
            // Persist to .env so the change survives restarts
            const { ApiKeyGuardService } = await import('../services/api-key-guard.js');
            const guard = new ApiKeyGuardService();
            const providerSaved = args.provider ? guard.setApiKeyRuntimeAndEnv('AI_PROVIDER', args.provider) : true;
            const modelSaved = args.modelName ? guard.setApiKeyRuntimeAndEnv('AI_MODEL_NAME', args.modelName) : true;
            const baseUrlSaved = args.baseUrl ? guard.setApiKeyRuntimeAndEnv('AI_BASE_URL', args.baseUrl) : true;
            const persisted = providerSaved && modelSaved && baseUrlSaved;
            return {
              success: true,
              message: `AI config updated: ${args.provider ? `provider=${args.provider} ` : ''}${args.modelName ? `model=${args.modelName} ` : ''}${args.baseUrl ? `baseUrl=${args.baseUrl}` : ''} (${persisted ? 'persisted to .env' : 'FAILED to persist — check .env permissions'}).`,
            };
          }
          return {
            success: false,
            message: 'Failed to switch AI model: Provider, modelName, or baseUrl missing.',
          };
        }

        case 'schedule_automation': {
          // Use the process-wide singleton — a fresh instance per call would
          // duplicate timers for the same task (same schedule firing N times).
          const { globalCronScheduler } = await import('../services/cron-scheduler.js');
          if (this.orchestrator) {
            globalCronScheduler.attachHub(this.orchestrator);
          }

          const interval = String(args.interval || 'every 1 hour');
          const action = (args.action || 'screening') as any;
          const agentId = String(args.agentId || 'solana-meme');

          const task = globalCronScheduler.addSchedule(interval, action, agentId);
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

        case 'set_api_key': {
          const { ApiKeyGuardService } = await import('../services/api-key-guard.js');
          const guard = new ApiKeyGuardService();
          const keyName = String(args.keyName || '').toUpperCase().trim();
          const keyValue = String(args.keyValue || '').trim();

          // Allowlist enforcement: never allow LLM/chat to set live-mode, wallet, RPC,
          // or AI provider keys (prompt-injection could flip DRY_RUN or exfiltrate via AI_BASE_URL).
          if (PROTECTED_ENV_KEYS.includes(keyName)) {
            return {
              success: false,
              message: `⛔ ${keyName} tidak bisa diubah via chat (protected key). Edit .env langsung di VPS.`,
            };
          }
          if (!SETTABLE_ENV_KEYS.includes(keyName)) {
            return {
              success: false,
              message: `⛔ ${keyName} tidak ada di allowlist key yang bisa di-set via chat.`,
            };
          }

          const success = guard.setApiKeyRuntimeAndEnv(keyName, keyValue);
          return {
            success,
            message: success
              ? `🔑 Successfully set & saved ${keyName} to .env and active runtime!`
              : `❌ Failed setting API key ${keyName}.`,
          };
        }

        case 'start_all_agents': {
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
          this.orchestrator.setAllAgentsActive(true);
          return { success: true, message: '⚡ ALL sub-agents are now ACTIVE and running 24/7.' };
        }

        case 'stop_all_agents': {
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
          this.orchestrator.setAllAgentsActive(false);
          return { success: true, message: '⏸️ ALL sub-agents are now PAUSED.' };
        }

        case 'read_file': {
          const rel = this.resolveSafePath(String(args.path || ''));
          if (!rel) return { success: false, message: 'Invalid or blocked path.' };
          try {
            const stat = fs.statSync(rel);
            if (!stat.isFile()) return { success: false, message: 'Path is not a file.' };
            if (stat.size > MAX_READ_FILE_BYTES) return { success: false, message: `File too large to read (${stat.size} bytes > 30KB).` };
            const content = fs.readFileSync(rel, 'utf-8');
            return { success: true, message: `Read ${rel}`, data: { path: rel, content } };
          } catch (err: any) {
            return { success: false, message: `Failed to read ${rel}: ${err.message}` };
          }
        }

        case 'list_directory': {
          const rel = this.resolveSafePath(String(args.path || '.'));
          if (!rel) return { success: false, message: 'Invalid or blocked path.' };
          try {
            const entries = fs.readdirSync(rel, { withFileTypes: true }).map((e) => ({
              name: e.name,
              type: e.isDirectory() ? 'dir' : 'file',
            }));
            return { success: true, message: `Listed ${rel} (${entries.length} entries)`, data: { path: rel, entries } };
          } catch (err: any) {
            return { success: false, message: `Failed to list ${rel}: ${err.message}` };
          }
        }

        case 'get_runtime_config': {
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
          const dryRun = process.env.DRY_RUN !== 'false';
          const autoExecuteEnabled = process.env.AUTO_EXECUTE_ENABLED === 'true';
          const active = this.orchestrator.getActiveDomains();
          const keyNames = ['GMGN_API_KEY', 'OPENSEA_API_KEY', 'TWEX_API_KEY', 'GOPLUS_API_KEY', 'AI_API_KEY', 'POLYGON_RPC_URL', 'SOLANA_RPC_URL', 'BASE_RPC_URL'];
          const keys = keyNames.map((k) => {
            const v = process.env[k];
            const set = Boolean(v && !v.includes('YOUR_') && !v.includes('placeholder') && !v.includes('mock'));
            return { name: k, set };
          });
          const ai = this.aiService?.getConfig?.();
          return {
            success: true,
            message: 'Runtime configuration.',
            data: {
              mode: autoExecuteEnabled ? 'AUTO_EXECUTE' : 'MANUAL_EXECUTION',
              autoExecuteEnabled,
              dryRun, // safety flag only — execution is manual
              activeAgents: active,
              apiKeys: keys,
              aiProvider: ai?.provider || null,
              aiModel: ai?.modelName || null,
              risk: this.orchestrator.getRiskManager().getRiskState(),
            },
          };
        }

        case 'get_system_health': {
          const { globalHealthWatcher } = await import('../services/health-watcher.js');
          const health = globalHealthWatcher.auditSystemHealth();
          return {
            success: true,
            message: health.allHealthy ? 'Semua agent HEALTHY.' : 'Ada agent yang tidak merespons.',
            data: health.report,
          };
        }

        case 'get_market_regime': {
          const { globalMarketRegimeFilter } = await import('../services/market-regime.js');
          return { success: true, message: 'Market regime.', data: globalMarketRegimeFilter.getRegime() };
        }

        case 'get_portfolio': {
          const ws = this.walletService ?? (await import('../services/wallet-service.js')).globalWalletService;
          const sol = await ws.getSolanaBalance();
          const eth = await ws.getEvmBalance(1);
          const drawdown = this.orchestrator?.getRiskManager().getRiskState().currentDrawdownPct ?? null;
          return {
            success: true,
            message: 'Portfolio state.',
            data: {
              solana: sol ? { balance: sol.balance, symbol: sol.symbol, simulated: sol.simulated } : null,
              evm: eth ? { balance: eth.balance, symbol: eth.symbol, simulated: eth.simulated } : null,
              currentDrawdownPct: drawdown,
            },
          };
        }

        case 'list_strategies': {
          const list = this.strategyEngine.listStrategies();
          return { success: true, message: `Ditemukan ${list.length} strategi.`, data: list };
        }

        case 'read_strategy': {
          const res = this.strategyEngine.readStrategy(String(args.name || ''));
          return res;
        }

        case 'activate_strategy': {
          return this.strategyEngine.setActiveStrategy(String(args.domain || ''), String(args.strategyId || ''));
        }

        case 'rollback_strategy': {
          return this.strategyEngine.rollbackStrategy(String(args.name || ''));
        }

        case 'write_strategy_file': {
          return this.strategyEngine.writeStrategy(String(args.name || ''), String(args.code || ''));
        }

        case 'write_indicator_file': {
          const { StrategyEngine } = await import('./strategy-engine.js');
          const engine = new StrategyEngine();
          return engine.writeIndicator(String(args.name || ''), String(args.code || ''));
        }

        case 'set_screening_config': {
          if (!this.orchestrator) return { success: false, message: 'Orchestrator not attached.' };
          const agentId = String(args.agentId || '').toLowerCase().trim();
          const config = (args.config && typeof args.config === 'object' ? args.config : {}) as Record<string, unknown>;
          if (Object.keys(config).length === 0) {
            return { success: false, message: `Tidak ada config untuk diubah untuk ${agentId}.` };
          }
          const agent = await this.orchestrator.getScreeningAgent(agentId);
          if (!agent || typeof (agent as any).updateConfig !== 'function') {
            return { success: false, message: `Agent ${agentId} tidak mendukung set_screening_config (domain LP tidak punya config).` };
          }
          const { applied, rejected } = (agent as any).updateConfig(config);
          // Persist overrides so they survive restarts (validated already by the agent).
          const { StateStore } = await import('../services/state-store.js');
          const store = new StateStore();
          if (Object.keys(applied).length > 0) store.setScreeningConfig(agentId, applied);
          const appliedStr = Object.keys(applied).length > 0 ? `✅ Diterapkan: ${JSON.stringify(applied)}` : '';
          const rejectedStr = rejected.length > 0 ? `\n❌ Ditolak: ${rejected.join('; ')}` : '';
          return {
            success: rejected.length === 0,
            message: `Config ${agentId} diperbarui.${appliedStr}${rejectedStr}`,
            data: { applied, rejected },
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

  /**
   * Resolve a user-supplied relative path to a safe absolute path under PROJECT_ROOT.
   * Rejects absolute paths, traversal (..), and blocked parts (.env, .pem, node_modules, dist, .git, private).
   */
  private resolveSafePath(relPath: string): string | null {
    const cleaned = relPath.trim().replace(/\\/g, '/');
    if (!cleaned || cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) return null;
    const resolved = path.resolve(PROJECT_ROOT, cleaned);
    if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) return null;
    const lowered = resolved.toLowerCase();
    for (const part of BLOCKED_PATH_PARTS) {
      if (lowered.includes(part.toLowerCase())) return null;
    }
    return resolved;
  }
}
