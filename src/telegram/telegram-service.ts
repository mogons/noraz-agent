import { AthenaHub } from '../orchestrator/hub.js';
import { isDryRun as isDryRunMode } from '../config/config.js';
import { WalletService, globalWalletService } from '../services/wallet-service.js';
import { AIService } from '../services/ai-service.js';

/**
 * Sanitize attacker-controlled fields before rendering into Telegram Markdown.
 * Token names/symbols come from chain data; crafted values could inject
 * Telegram formatting or broken links. Strips markdown-significant characters.
 */
function sanitizeTgField(value: string | undefined | null, maxLen = 200): string {
  if (!value) return '';
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' [LINK] ')
    .replace(/[\[\](){}<>*_`|~\\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export class TelegramService {
  private botToken?: string;
  private chatId?: string;
  private topics: Map<string, number> = new Map();

  constructor(config?: TelegramConfig) {
    this.botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = config?.chatId || process.env.TELEGRAM_CHAT_ID;
  }

  public isEnabled(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  /**
   * Automatically provisions Telegram Forum Topics (sub-channels) if chat is a Forum Supergroup
   */
  public async createForumTopic(name: string): Promise<number | null> {
    if (!this.isEnabled()) return null;

    const url = `https://api.telegram.org/bot${this.botToken}/createForumTopic`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          name,
        }),
      });

      if (!response.ok) {
        // Chat might be a regular group or private chat, or topic already exists
        return null;
      }

      const data: any = await response.json();
      if (data.ok && data.result?.message_thread_id) {
        const threadId = data.result.message_thread_id;
        this.topics.set(name.toLowerCase(), threadId);
        console.log(`[TELEGRAM BOOTSTRAP] Auto-created Topic: "${name}" (Thread ID: ${threadId})`);
        return threadId;
      }
      return null;
    } catch (err: any) {
      return null;
    }
  }

  /**
   * Auto-bootstrap all OpenCat Sub-Channels / Forum Topics in Telegram Group
   */
  public async bootstrapTelegramTopics(): Promise<Record<string, number | null>> {
    if (!this.isEnabled()) return {};

    console.log('[TELEGRAM BOOTSTRAP] Auto-provisioning OpenCat Sub-Channels (Forum Topics) in Telegram Group...');
    const topicNames = [
      'opencat-control-room',
      'audit-on-demand',
      'call-meme-robinhood',
      'call-lp-robinhood',
      'call-nft-robinhood',
      'call-alpha-robinhood',
    ];

    const results: Record<string, number | null> = {};
    for (const name of topicNames) {
      results[name] = await this.createForumTopic(name);
    }
    return results;
  }

  public async sendMessage(
    text: string,
    parseMode: 'Markdown' | 'HTML' = 'Markdown',
    replyMarkup?: any,
    threadId?: number
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const payload: any = {
        chat_id: this.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      };

      if (threadId) {
        payload.message_thread_id = threadId;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TELEGRAM ERROR] Failed to send message (${response.status}): ${errorText}`);
        return false;
      }

      console.log('[TELEGRAM SERVICE] Message broadcasted successfully.');
      return true;
    } catch (err: any) {
      console.error('[TELEGRAM ERROR] Exception sending message:', err.message);
      return false;
    }
  }

  public async broadcastSignalCall(
    title: string,
    symbol: string,
    ca: string,
    aiThesis: string,
    dexUrl?: string,
    topicName?: string
  ): Promise<boolean> {
    const safeTitle = sanitizeTgField(title, 150);
    const safeSymbol = sanitizeTgField(symbol, 32);
    const safeThesis = sanitizeTgField(aiThesis, 500);
    const message = `🚨 *🐾 OPENCAT CALL: ${safeTitle} ($${safeSymbol})*

📋 *Contract Address (CA):*
\`${ca}\`

🧠 *AI Thesis & Reasoning:*
${safeThesis}

${dexUrl ? `📊 [View Chart on DexScreener](${dexUrl})` : ''}

🤖 _Sent via OpenCat Swarm Consensus_`;

    const threadId = topicName ? (this.topics.get(topicName.toLowerCase()) || this.topics.get('opencat-control-room') || this.topics.get('athena-control-room')) : undefined;
    return this.sendMessage(message, 'Markdown', undefined, threadId);
  }

  public async broadcastInteractiveMenu(hub?: AthenaHub, walletService?: WalletService): Promise<boolean> {
    const activeDomains = hub ? hub.getActiveDomains() : [];
    const autoExecuteEnabled = process.env.AUTO_EXECUTE_ENABLED === 'true';
    const risk = hub ? hub.getRiskManager().getRiskState() : null;

    const getStatus = (domain: string) => activeDomains.includes(domain) ? '🟢 ACTIVE' : '🔴 PAUSED';

    const text = `🐾 *OPENCAT CONTROL CENTER DASHBOARD (TELEGRAM)*

⚙️ *Mode:* ${autoExecuteEnabled ? 'AUTO_EXECUTE' : 'MANUAL EXECUTION — screener/caller, execution via link'}
🛡️ *Max Drawdown:* ${risk ? `${risk.maxDrawdownLimitPct}%` : 'n/a'}
🛡️ *Max Position Size:* ${risk ? `$${risk.maxPositionSizeUsd}` : 'n/a'}

🤖 *Active Sub-Agents Status:*
• 🌸 Robinhood Meme (\`meme-robinhood\`): ${getStatus('meme-robinhood')}
• 🌊 Robinhood LP (\`lp-robinhood\`): ${getStatus('lp-robinhood')}
• 🔮 NFT Sniping (\`nft\`): ${getStatus('nft')}

Use buttons below to toggle agents, view wallet status, or execute withdrawals:`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '▶️ Toggle Robinhood Meme', callback_data: 'toggle_meme-robinhood' },
          { text: '▶️ Toggle Robinhood LP', callback_data: 'toggle_lp-robinhood' },
        ],
        [
          { text: '▶️ Toggle NFT', callback_data: 'toggle_nft' },
        ],
        [
          { text: '⚡ Start All', callback_data: 'start_all' },
          { text: '⏸️ Pause All', callback_data: 'pause_all' },
        ],
        [
          { text: '🔑 Wallet Balances', callback_data: 'balances' },
          { text: '💸 Withdraw Funds', callback_data: 'withdraw_info' },
        ],
      ],
    };

    const threadId = this.topics.get('opencat-control-room') || this.topics.get('athena-control-room');
    return this.sendMessage(text, 'Markdown', replyMarkup, threadId);
  }

  /**
   * Start long-polling listener for Telegram incoming commands & callback buttons
   */
  public startPolling(hub: AthenaHub, walletService: WalletService, aiService?: AIService): void {
    if (!this.isEnabled()) return;

    let offset = 0;
    console.log('[TELEGRAM POLLING] Starting background update listener...');

    const poll = async () => {
      try {
        const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${offset}&timeout=20`;
        const res = await fetch(url);
        if (res.ok) {
          const data: any = await res.json();
          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              offset = update.update_id + 1;
              await this.handleTelegramUpdate(update, hub, walletService, aiService);
            }
          }
        }
      } catch (err: any) {
        // Silent catch for network hiccups
      } finally {
        setTimeout(poll, 3000);
      }
    };

    poll();
  }

  private async handleTelegramUpdate(update: any, hub: AthenaHub, walletService: WalletService, aiService?: AIService): Promise<void> {
    if (update.callback_query) {
      const query = update.callback_query;
      const data = query.data;
      const threadId = query.message?.message_thread_id;

      if (data.startsWith('toggle_')) {
        const domain = data.replace('toggle_', '');
        const active = hub.getActiveDomains().includes(domain);
        hub.toggleChannelScreening('telegram-forum', domain, !active);
        await this.sendMessage(`⚡ Sub-agent domain \`${domain}\` is now **${!active ? 'ACTIVE' : 'PAUSED'}** on Telegram!`, 'Markdown', undefined, threadId);
      } else if (data === 'start_all') {
        ['meme-robinhood', 'lp-robinhood', 'nft'].forEach(d => hub.toggleChannelScreening('telegram-forum', d, true));
        await this.sendMessage('⚡ **GLOBAL MASTER SCREENING ACTIVATED!** All 3 Sub-Agents are active on Telegram.', 'Markdown', undefined, threadId);
      } else if (data === 'pause_all') {
        ['meme-robinhood', 'lp-robinhood', 'nft'].forEach(d => hub.toggleChannelScreening('telegram-forum', d, false));
        await this.sendMessage('⏸️ **GLOBAL MASTER SCREENING PAUSED!** All 3 Sub-Agents are paused on Telegram.', 'Markdown', undefined, threadId);
      } else if (data === 'balances') {
        const isDryRun = isDryRunMode();
        const hasEvm = walletService.hasWallet('evm');
        let evmAddr = hasEvm ? `\`${walletService.getEvmAddress()}\`` : 'Not Configured';
        await this.sendMessage(
          `💼 *OPENCAT WALLET BALANCES (${isDryRun ? 'SIMULATED' : 'LIVE'}):*\n\n` +
          `• *Robinhood Chain (ETH) Wallet:* ${evmAddr}\n\n` +
          `Use \`/withdraw <to> <amount>\` to transfer funds.`,
          'Markdown', undefined, threadId
        );
      } else if (data === 'withdraw_info') {
        await this.sendMessage(
          `💸 *INSTANT FUND WITHDRAWAL INSTRUCTION*\n\n` +
          `To withdraw funds to your master wallet address, send message:\n` +
          `\`/withdraw <recipient_address> <amount>\`\n\n` +
          `*Example:* \`/withdraw 0x1234...abcd 0.5\``,
          'Markdown', undefined, threadId
        );
      }
    } else if (update.message?.text) {
      const msg = update.message;
      const text = msg.text.trim();
      const threadId = msg.message_thread_id;

      if (text.startsWith('/withdraw')) {
        const parts = text.split(/\s+/);
        if (parts.length < 3) {
          await this.sendMessage('⚠️ Format invalid. Use: `/withdraw <recipient_address> <amount>`', 'Markdown', undefined, threadId);
          return;
        }
        const recipient = parts[1];
        const amount = parseFloat(parts[2]);
        if (isNaN(amount) || amount <= 0) {
          await this.sendMessage('⚠️ Invalid amount specified.', 'Markdown', undefined, threadId);
          return;
        }
        const isDryRun = isDryRunMode();
        try {
          const { explorerUrl } = await walletService.sendEvm(4663, recipient, amount);
          await this.sendMessage(`💸 *WITHDRAWAL ${isDryRun ? '(DRY_RUN SIMULATION)' : 'SUCCESSFUL'}!*\n• Amount: \`${amount} ETH (Robinhood)\`\n• Recipient: \`${recipient}\`\n🔗 [View Tx](${explorerUrl})`, 'Markdown', undefined, threadId);
        } catch (err: any) {
          await this.sendMessage(`❌ Withdrawal failed: ${err.message}`, 'Markdown', undefined, threadId);
        }
      } else if (!text.startsWith('/') && aiService) {
        try {
          const { OPENCAT_SYSTEM_PROMPT_BASE } = await import('../services/opencat-system-prompt.js');
          const { ToolRegistry } = await import('../orchestrator/tool-registry.js');
          const { runAgent } = await import('../orchestrator/agent-runner.js');
          const { SessionMemoryService } = await import('../services/session-memory.js');
          const toolRegistry = new ToolRegistry();
          toolRegistry.attachOrchestrator(hub);
          toolRegistry.attachAIService(aiService);
          toolRegistry.attachWalletService(globalWalletService);

          const activeDomains = hub.getActiveDomains();
          const activeAgentsLine = activeDomains.length > 0
            ? `Active Sub-Agents right now: ${activeDomains.join(', ')}`
            : 'Active Sub-Agents right now: NONE (all paused)';
          const memoryContext = new SessionMemoryService().buildMemoryContextLine();
          const systemPrompt = OPENCAT_SYSTEM_PROMPT_BASE + `\n\nCurrent Operating Parameters:\n${activeAgentsLine}${memoryContext}`;

          const agentResult = await runAgent(
            { aiService, toolRegistry, systemPrompt },
            text
          );
          const aiRes = agentResult.text || (agentResult.toolResults.length > 0
            ? agentResult.toolResults.map((t) => `• ${t.name}: ${t.success ? '✅' : '❌'} ${t.message}`).join('\n')
            : '[No response from AI.]');
          await this.sendMessage(aiRes, 'Markdown', undefined, threadId);
        } catch (err: any) {
          // Failover catch
        }
      }
    }
  }
}
