/**
 * Modal/Button/SelectMenu interaction handlers — extracted from interaction-handler.ts.
 */
import {
  ModalSubmitInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { AthenaHub } from '../../orchestrator/hub.js';
import { createDashboardComponents } from '../embeds/dashboard-embed.js';
import { priceAlertService, walletService, buildDashboardOptions } from './command-handlers.js';

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId === 'wallet_setup_modal') {
    const pk = interaction.fields.getTextInputValue('wallet_pk').trim();

    const chainType = 'evm';
    walletService.setKey(chainType, pk);

    let addressStr = '';
    try {
      addressStr = `\n• Public Address: \`${walletService.getAddress(chainType)}\``;
    } catch (e: any) {
      addressStr = `\n⚠️ Key stored, but address derivation warning: ${e.message}`;
    }

    await interaction.reply({
      content: `✅ **Burner Wallet Private Key Configured in Athena Runtime Memory!**\n• Chain: \`${chainType.toUpperCase()}\`${addressStr}\n• Security Note: Key is stored 100% in-memory and will never be written to disk or logs.`,
      ephemeral: true,
    });
  } else if (interaction.customId === 'api_setup_modal') {
    const openseaKey = interaction.fields.getTextInputValue('opensea_key');

    if (openseaKey) process.env.OPENSEA_API_KEY = openseaKey.trim();

    await interaction.reply({
      content:
        `⚙️ **API Keys Successfully Configured!**\n` +
        `• **OpenSea API:** ${openseaKey ? '`🟢 CONFIGURED`' : '`⚪ UNCHANGED`'}\n` +
        `API configuration updated in runtime memory!`,
      ephemeral: true,
    });
  }
}

export async function handleSelectMenu(interaction: StringSelectMenuInteraction, hub: AthenaHub): Promise<void> {
  if (interaction.customId === 'select_toggle_agent') {
    const selectedAgent = interaction.values[0];
    const currentState = hub.isAgentActive(selectedAgent);
    const newState = !currentState;
    hub.setAgentActive(selectedAgent, newState);

    const dash = createDashboardComponents(hub, await buildDashboardOptions());
    await interaction.update(dash);
  }
}

export async function handleButtonPress(interaction: ButtonInteraction, hub: AthenaHub): Promise<void> {
  const customId = interaction.customId;

  if (customId === 'btn_setup_api_keys') {
    const modal = new ModalBuilder()
      .setCustomId('api_setup_modal')
      .setTitle('⚙️ Athena API Key Setup');

    const openseaInput = new TextInputBuilder()
      .setCustomId('opensea_key')
      .setLabel('OpenSea API Key (EVM NFT Data)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Paste your OpenSea API Key...')
      .setRequired(false);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(openseaInput);
    modal.addComponents(row1);

    await interaction.showModal(modal);
    return;
  }

  if (customId === 'btn_start_all_agents') {
    hub.setAllAgentsActive(true);
    const dash = createDashboardComponents(hub, await buildDashboardOptions());
    await interaction.update(dash);
  } else if (customId === 'btn_pause_all_agents') {
    hub.setAllAgentsActive(false);
    const dash = createDashboardComponents(hub, await buildDashboardOptions());
    await interaction.update(dash);
  } else if (customId === 'btn_emergency_stop') {
    hub.setAllAgentsActive(false);
    await interaction.reply({ content: '🛑 **EMERGENCY CIRCUIT BREAKER TRIGGERED!** All sub-agents paused & pending orders halted.', ephemeral: false });
  } else if (customId === 'btn_view_wallets') {
    const eth = await walletService.getEvmBalance(4663);
    const ethStr = eth ? `${eth.balance.toFixed(4)} ETH${eth.simulated ? ' (Simulated)' : ''}` : '— (unavailable)';
    await interaction.reply({ content: `🔑 **Burner Wallets:** Robinhood (ETH): \`${ethStr}\`.`, ephemeral: true });
  } else if (customId === 'btn_view_alerts') {
    const alerts = priceAlertService.listAlerts(interaction.user.id);
    const count = alerts.length;
    await interaction.reply({ content: `🔔 **Active Price Alerts:** You have \`${count}\` active price alerts set. Use \`/alert list\` to view.`, ephemeral: true });
  } else if (customId === 'btn_refresh_dashboard') {
    const dash = createDashboardComponents(hub, await buildDashboardOptions());
    await interaction.update(dash);
  } else if (customId.startsWith('start_channel_')) {
    const domain = customId.replace('start_channel_', '');
    hub.toggleChannelScreening(interaction.channelId, domain, true);
    await interaction.reply({ content: `⚡ **Channel Screening Activated** for domain: \`${domain}\` in <#${interaction.channelId}>! Sub-agent active.`, ephemeral: false });
  } else if (customId.startsWith('pause_channel_')) {
    const domain = customId.replace('pause_channel_', '');
    hub.toggleChannelScreening(interaction.channelId, domain, false);
    await interaction.reply({ content: `⏸️ **Channel Screening Paused** for domain: \`${domain}\` in <#${interaction.channelId}>. Sub-agent paused.`, ephemeral: false });
  } else if (customId.startsWith('trigger_pass_')) {
    const domain = customId.replace('trigger_pass_', '');
    await interaction.deferReply({ ephemeral: false });
    const results = await hub.triggerAgentPass(domain);
    await interaction.editReply(`🔎 **On-Demand Screening Pass Triggered** for domain \`${domain}\`! Audited ${results.length} candidate signals.`);
  }

}
