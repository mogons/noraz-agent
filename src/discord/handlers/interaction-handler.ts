/**
 * Discord interaction entry point — dispatches to focused handler modules.
 * Service instances live in command-handlers.ts; re-exported here for
 * backward compatibility with existing consumers (index.ts, message-handler.ts).
 */
import { Interaction } from 'discord.js';
import { OpenCatHub } from '../../orchestrator/hub.js';
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

export function isOpenCatChannel(interaction: Interaction): boolean {
  if (!interaction.guild) return true; // Direct Messages allowed

  const channel = interaction.channel;
  if (!channel || !('name' in channel)) return false;

  const channelName = (channel.name || '').toLowerCase();
  const parentName = ('parent' in channel && channel.parent?.name) ? channel.parent.name.toLowerCase() : '';

  // 1. Belongs to Category "🐾 OPENCAT COMMAND CENTER"
  if (parentName.includes('opencat command center')) return true;

  // 2. Standard OpenCat channel names
  const KNOWN_CHANNELS = [
    'opencat-control-room',
    'opencat-audit',
    'audit-on-demand',
    'call-meme-robinhood',
    'call-lp-robinhood',
    'call-nft-robinhood',
    'call-alpha-robinhood',
    'call-whale-eth',
    'opencat-logs',
    'opencat-journal',
  ];

  if (KNOWN_CHANNELS.includes(channelName)) return true;

  // 3. Custom created channel prefixes
  if (channelName.startsWith('opencat-') || channelName.startsWith('call-') || channelName.startsWith('audit-')) return true;

  return false;
}

export async function handleInteraction(
  interaction: Interaction,
  hub: OpenCatHub,
  aiService: AIService
): Promise<void> {
  try {
    // Channel Restriction Guard: Block interaction outside OpenCat channels
    if (interaction.isChatInputCommand() || interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
      if (!isOpenCatChannel(interaction)) {
        if (interaction.isRepliable()) {
          const controlRoomChannel = interaction.guild?.channels.cache.find(c => c.name === 'opencat-control-room');
          const controlRoomRef = controlRoomChannel ? `<#${controlRoomChannel.id}>` : '**#opencat-control-room**';
          await interaction.reply({
            content: `🐾 **OpenCat Channel Restriction Notice:**\n` +
              `OpenCat slash commands and interactive controls can only be used inside **OpenCat Command Center** channels (e.g. ${controlRoomRef}).\n\n` +
              `Please run your command inside ${controlRoomRef} or dedicated OpenCat call channels!`,
            flags: 1 << 6, // EPHEMERAL
          });
        }
        return;
      }
    }

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
    } catch {
      // Ignored if already handled
    }
  }
}
