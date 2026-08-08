/**
 * Discord interaction entry point — dispatches to focused handler modules.
 * Service instances live in command-handlers.ts; re-exported here for
 * backward compatibility with existing consumers (index.ts, message-handler.ts).
 */
import { Interaction } from 'discord.js';
import { AthenaHub } from '../../orchestrator/hub.js';
import { AIService } from '../../services/ai-service.js';
import {
  priceAlertService,
  tradeJournalService,
  walletService,
  priceFeedService,
  handleChatInput,
} from './command-handlers.js';
import {
  handleModalSubmit,
  handleSelectMenu,
  handleButtonPress,
} from './interaction-buttons.js';

export { priceAlertService, tradeJournalService, walletService, priceFeedService };
export type { PriceAlertService } from '../../services/price-alert-service.js';
export type { TradeJournalService } from '../../services/trade-journal-service.js';
export type { WalletService } from '../../services/wallet-service.js';

export async function handleInteraction(
  interaction: Interaction,
  hub: AthenaHub,
  aiService: AIService
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction, hub);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isButton()) {
      await handleButtonPress(interaction, hub);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, hub);
    }
  } catch (error: any) {
    console.error('Interaction handling error:', error);
    if (!interaction.isRepliable()) return;
    const message = `❌ Error processing interaction: ${error.message}`;
    try {
      if (interaction.deferred) {
        // Already deferred (e.g. /analyze, /screening) — must edit, not reply
        await interaction.editReply(message);
      } else if (!interaction.replied) {
        await interaction.reply({ content: message, flags: 1 << 6 }); // EPHEMERAL
      }
    } catch (replyErr: any) {
      console.error('Error replying to interaction:', replyErr.message);
    }
  }
}
