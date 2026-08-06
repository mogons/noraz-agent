export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export class TelegramService {
  private botToken?: string;
  private chatId?: string;

  constructor(config?: TelegramConfig) {
    this.botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = config?.chatId || process.env.TELEGRAM_CHAT_ID;
  }

  public isEnabled(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  public async sendMessage(text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown', replyMarkup?: any): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: true,
          reply_markup: replyMarkup,
        }),
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

  public async broadcastSignalCall(title: string, symbol: string, ca: string, aiThesis: string, dexUrl?: string): Promise<boolean> {
    const message = `🚨 *ATHENA CALL: ${title} ($${symbol})*

📋 *Contract Address (CA):*
\`${ca}\`

🧠 *AI Thesis & Reasoning:*
${aiThesis}

${dexUrl ? `📊 [View Chart on DexScreener](${dexUrl})` : ''}

🤖 _Sent via Athena Swarm Consensus_`;

    return this.sendMessage(message, 'Markdown');
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

    return this.sendMessage(text, 'Markdown', replyMarkup);
  }
}
