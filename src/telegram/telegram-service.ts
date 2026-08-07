import { AthenaHub } from '../orchestrator/hub.js';
import { isDryRun as isDryRunMode } from '../config/config.js';
import { WalletService } from '../services/wallet-service.js';
import { AIService } from '../services/ai-service.js';

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export interface TelegramTopic {
  name: string;
  threadId: number;
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
   * Auto-bootstrap all 10 Athena Sub-Channels / Forum Topics in Telegram Group
   */
  public async bootstrapTelegramTopics(): Promise<Record<string, number | null>> {
    if (!this.isEnabled()) return {};

    console.log('[TELEGRAM BOOTSTRAP] Auto-provisioning Athena Sub-Channels (Forum Topics) in Telegram Group...');
    const topicNames = [
      'athena-control-room',
      'audit-on-demand',
      'call-meme-solana',
      'call-meme-evm',
      'call-perps-futures',
      'call-lp-solana',
      'call-lp-evm',
      'call-nft-sniping',
      'call-prediction-markets',
      'call-ct-alpha',
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
    const message = `🚨 *ATHENA CALL: ${title} ($${symbol})*

📋 *Contract Address (CA):*
\`${ca}\`

🧠 *AI Thesis & Reasoning:*
${aiThesis}

${dexUrl ? `📊 [View Chart on DexScreener](${dexUrl})` : ''}

🤖 _Sent via Athena Swarm Consensus_`;

    const threadId = topicName ? this.topics.get(topicName.toLowerCase()) : undefined;
    return this.sendMessage(message, 'Markdown', undefined, threadId);
  }

  public async broadcastInteractiveMenu(hub?: AthenaHub, walletService?: WalletService): Promise<boolean> {
    const activeDomains = hub ? hub.getActiveDomains() : [];
    const isDryRun = isDryRunMode();

    const getStatus = (domain: string) => activeDomains.includes(domain) ? '🟢 ACTIVE' : '🔴 PAUSED';

    const text = `🏛️ *ATHENA CONTROL CENTER DASHBOARD (TELEGRAM)*

⚙️ *Mode:* ${isDryRun ? 'DRY_RUN Active (Safe Simulation)' : '⚡ LIVE Execution Active'}
🛡️ *Max Drawdown:* 50.0%

🤖 *Active Sub-Agents Status:*
• 🐣 Solana Meme (\`meme-solana\`): ${getStatus('meme-solana')}
• 🔷 EVM Meme (\`meme-evm\`): ${getStatus('meme-evm')}
• ⚡ Solana LP (\`lp-solana\`): ${getStatus('lp-solana')}
• 💧 EVM LP (\`lp-evm\`): ${getStatus('lp-evm')}
• 📈 Perps Futures (\`perps\`): ${getStatus('perps')}
• 🖼️ NFT Sniping (\`nft\`): ${getStatus('nft')}
• 🎯 Polymarket (\`prediction\`): ${getStatus('prediction')}
• 💡 Smart CT Alpha (\`ct-alpha\`): ${getStatus('ct-alpha')}

Use buttons below to toggle agents, view wallet status, or execute withdrawals:`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '▶️ Toggle SOL Meme', callback_data: 'toggle_meme-solana' },
          { text: '▶️ Toggle EVM Meme', callback_data: 'toggle_meme-evm' },
        ],
        [
          { text: '▶️ Toggle SOL LP', callback_data: 'toggle_lp-solana' },
          { text: '▶️ Toggle EVM LP', callback_data: 'toggle_lp-evm' },
        ],
        [
          { text: '▶️ Toggle Perps', callback_data: 'toggle_perps' },
          { text: '▶️ Toggle NFT', callback_data: 'toggle_nft' },
        ],
        [
          { text: '▶️ Toggle Polymarket', callback_data: 'toggle_prediction' },
          { text: '▶️ Toggle CT Alpha', callback_data: 'toggle_ct-alpha' },
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

    const threadId = this.topics.get('athena-control-room');
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
      const chatId = query.message?.chat?.id;
      const threadId = query.message?.message_thread_id;

      if (data.startsWith('toggle_')) {
        const domain = data.replace('toggle_', '');
        const active = hub.getActiveDomains().includes(domain);
        hub.toggleChannelScreening('telegram-forum', domain, !active);
        await this.sendMessage(`⚡ Sub-agent domain \`${domain}\` is now **${!active ? 'ACTIVE' : 'PAUSED'}** on Telegram!`, 'Markdown', undefined, threadId);
      } else if (data === 'start_all') {
        ['meme-solana', 'meme-evm', 'lp-solana', 'lp-evm', 'perps', 'nft', 'prediction', 'ct-alpha'].forEach(d => hub.toggleChannelScreening('telegram-forum', d, true));
        await this.sendMessage('⚡ **GLOBAL MASTER SCREENING ACTIVATED!** All 8 Sub-Agents are active on Telegram.', 'Markdown', undefined, threadId);
      } else if (data === 'pause_all') {
        ['meme-solana', 'meme-evm', 'lp-solana', 'lp-evm', 'perps', 'nft', 'prediction', 'ct-alpha'].forEach(d => hub.toggleChannelScreening('telegram-forum', d, false));
        await this.sendMessage('⏸️ **GLOBAL MASTER SCREENING PAUSED!** All 8 Sub-Agents are paused on Telegram.', 'Markdown', undefined, threadId);
      } else if (data === 'balances') {
        const isDryRun = isDryRunMode();
        const hasSol = walletService.hasWallet('solana');
        const hasEvm = walletService.hasWallet('evm');
        let solAddr = hasSol ? `\`${walletService.getSolanaAddress()}\`` : 'Not Configured';
        let evmAddr = hasEvm ? `\`${walletService.getEvmAddress()}\`` : 'Not Configured';
        await this.sendMessage(
          `💼 *ATHENA WALLET BALANCES (${isDryRun ? 'SIMULATED' : 'LIVE'}):*\n\n` +
          `• *Solana Wallet:* ${solAddr}\n` +
          `• *EVM Wallet:* ${evmAddr}\n\n` +
          `Use \`/withdraw <to> <amount>\` to transfer funds.`,
          'Markdown', undefined, threadId
        );
      } else if (data === 'withdraw_info') {
        await this.sendMessage(
          `💸 *INSTANT FUND WITHDRAWAL INSTRUCTION*\n\n` +
          `To withdraw funds to your master wallet address, send message:\n` +
          `\`/withdraw <recipient_address> <amount>\`\n\n` +
          `*Example:* \`/withdraw 7XwW4PzZg... 0.5\``,
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
          if (!recipient.startsWith('0x')) {
            const { txHash, explorerUrl } = await walletService.sendSol(recipient, amount);
            await this.sendMessage(`💸 *WITHDRAWAL ${isDryRun ? '(DRY_RUN SIMULATION)' : 'SUCCESSFUL'}!*\n• Amount: \`${amount} SOL\`\n• Recipient: \`${recipient}\`\n🔗 [View Tx](${explorerUrl})`, 'Markdown', undefined, threadId);
          } else {
            const { txHash, explorerUrl } = await walletService.sendEvm(8453, recipient, amount);
            await this.sendMessage(`💸 *WITHDRAWAL ${isDryRun ? '(DRY_RUN SIMULATION)' : 'SUCCESSFUL'}!*\n• Amount: \`${amount} ETH (Base)\`\n• Recipient: \`${recipient}\`\n🔗 [View Tx](${explorerUrl})`, 'Markdown', undefined, threadId);
          }
        } catch (err: any) {
          await this.sendMessage(`❌ Withdrawal failed: ${err.message}`, 'Markdown', undefined, threadId);
        }
      } else if (!text.startsWith('/') && aiService) {
        try {
          const { ATHENA_SYSTEM_PROMPT_BASE } = await import('../services/athena-system-prompt.js');
          const systemPrompt = ATHENA_SYSTEM_PROMPT_BASE;

          const aiRes = await aiService.generateCompletion([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ]);
          await this.sendMessage(aiRes, 'Markdown', undefined, threadId);
        } catch (err: any) {
          // Failover catch
        }
      }
    }
  }
}
