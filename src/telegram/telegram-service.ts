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

  public async broadcastInteractiveMenu(): Promise<boolean> {
    const text = `🏛️ *ATHENA CONTROL CENTER DASHBOARD (TELEGRAM)*

⚙️ *Mode:* DRY_RUN Active (Safe Mode)
🛡️ *Max Drawdown:* 5.0%

🤖 *Active Sub-Agents Status:*
• 🐣 Solana Meme: PAUSED
• 🔷 EVM Meme: PAUSED
• 📈 Perps Futures: PAUSED
• 💧 Trade+LP Velocity: PAUSED
• 🖼️ NFT Sniping: PAUSED
• 🎯 Polymarket: PAUSED
• 💡 Smart CT Alpha: PAUSED

Use touch buttons below to toggle agents or view balances:`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '▶️ Start Solana', callback_data: 'start_solana' },
          { text: '▶️ Start EVM', callback_data: 'start_evm' },
        ],
        [
          { text: '▶️ Start Perps', callback_data: 'start_perps' },
          { text: '▶️ Start LP', callback_data: 'start_lp' },
        ],
        [
          { text: '▶️ Start NFT', callback_data: 'start_nft' },
          { text: '▶️ Start Polymarket', callback_data: 'start_poly' },
        ],
        [
          { text: '▶️ Start CT Alpha', callback_data: 'start_ct_alpha' },
          { text: '⏸️ Pause All', callback_data: 'pause_all' },
        ],
        [
          { text: '🔑 Wallet Balances', callback_data: 'balances' },
          { text: '🔔 Active Alerts', callback_data: 'alerts' },
        ],
      ],
    };

    const threadId = this.topics.get('athena-control-room');
    return this.sendMessage(text, 'Markdown', replyMarkup, threadId);
  }
}
