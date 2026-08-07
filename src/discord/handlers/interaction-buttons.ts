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
    const chain = interaction.fields.getTextInputValue('wallet_chain').toLowerCase().trim();
    const pk = interaction.fields.getTextInputValue('wallet_pk').trim();

    const chainType = chain.includes('sol') ? 'solana' : 'evm';
    walletService.setKey(chainType, pk);

    let addressStr = '';
    try {
      addressStr = `\nâ€¢ Public Address: \`${walletService.getAddress(chainType)}\``;
    } catch (e: any) {
      addressStr = `\nâš ï¸ Key stored, but address derivation warning: ${e.message}`;
    }

    await interaction.reply({
      content: `âœ… **Burner Wallet Private Key Configured in Athena Runtime Memory!**\nâ€¢ Chain: \`${chainType.toUpperCase()}\`${addressStr}\nâ€¢ Security Note: Key is stored 100% in-memory and will never be written to disk or logs.`,
      ephemeral: true,
    });
  } else if (interaction.customId === 'api_setup_modal') {
    const twexKey = interaction.fields.getTextInputValue('twex_key');
    const openseaKey = interaction.fields.getTextInputValue('opensea_key');

    if (twexKey) process.env.TWEX_API_KEY = twexKey.trim();
    if (openseaKey) process.env.OPENSEA_API_KEY = openseaKey.trim();

    await interaction.reply({
      content:
        `âš™ï¸ **API Keys Successfully Configured!**\n` +
        `â€¢ **TwexAPI (X/Twitter):** ${twexKey ? '`ðŸŸ¢ CONFIGURED`' : '`âšª UNCHANGED`'}\n` +
        `â€¢ **OpenSea API:** ${openseaKey ? '`ðŸŸ¢ CONFIGURED`' : '`âšª UNCHANGED`'}\n` +
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
      .setTitle('âš™ï¸ Athena API Key Setup');

    const twexInput = new TextInputBuilder()
      .setCustomId('twex_key')
      .setLabel('TwexAPI Key (https://twexapi.io)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Paste your TwexAPI Key for X/Twitter Scraping...')
      .setRequired(false);

    const openseaInput = new TextInputBuilder()
      .setCustomId('opensea_key')
      .setLabel('OpenSea API Key (EVM NFT Data)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Paste your OpenSea API Key...')
      .setRequired(false);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(twexInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(openseaInput);
    modal.addComponents(row1, row2);

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
    await interaction.reply({ content: 'ðŸ›‘ **EMERGENCY CIRCUIT BREAKER TRIGGERED!** All sub-agents paused & pending orders halted.', ephemeral: false });
  } else if (customId === 'btn_view_wallets') {
    const sol = await walletService.getSolanaBalance();
    const eth = await walletService.getEvmBalance(1);
    const solStr = sol ? `${sol.balance.toFixed(4)} SOL${sol.simulated ? ' (Simulated)' : ''}` : 'â€” (unavailable)';
    const ethStr = eth ? `${eth.balance.toFixed(4)} ETH${eth.simulated ? ' (Simulated)' : ''}` : 'â€” (unavailable)';
    await interaction.reply({ content: `ðŸ”‘ **Burner Wallets:** Solana: \`${solStr}\` | EVM: \`${ethStr}\`.`, ephemeral: true });
  } else if (customId === 'btn_view_alerts') {
    const alerts = priceAlertService.listAlerts(interaction.user.id);
    const count = alerts.length;
    await interaction.reply({ content: `ðŸ”” **Active Price Alerts:** You have \`${count}\` active price alerts set. Use \`/alert list\` to view.`, ephemeral: true });
  } else if (customId === 'btn_refresh_dashboard') {
    const dash = createDashboardComponents(hub, await buildDashboardOptions());
    await interaction.update(dash);
  } else if (customId.startsWith('execute_buy_')) {
    const parts = customId.split('_');
    const amount = parts[2] === '05' ? '0.5' : '1.0';
    const symbol = parts[3] || 'TOKEN';
    await interaction.reply({ content: `ðŸ›’ **BUY Order Triggered:** Buying \`${amount} SOL/ETH\` worth of $${symbol} via Athena Hub... (DRY_RUN Simulated)`, ephemeral: true });
  } else if (customId.startsWith('execute_lp_add_')) {
    const symbol = customId.replace('execute_lp_add_', '');
    await interaction.reply({ content: `ðŸ’§ **Concentrated LP Deposit Triggered:** Deploying 0.5 SOL/ETH Liquidity for **$${symbol}** Range... (DRY_RUN Simulated)`, ephemeral: true });
  } else if (customId.startsWith('execute_nft_buy_')) {
    const symbol = customId.replace('execute_nft_buy_', '');
    await interaction.reply({ content: `ðŸ–¼ï¸ **NFT Snipe Order Triggered:** Executing Seaport Fulfill Order for **${symbol}**... (DRY_RUN Simulated)`, ephemeral: true });
  } else if (customId.startsWith('execute_prediction_yes_')) {
    const symbol = customId.replace('execute_prediction_yes_', '');
    await interaction.reply({ content: `ðŸŽ¯ **Polymarket Order Triggered:** Placing **50 USDC YES Bet** on event: **${symbol}** (Polygon L2)... (DRY_RUN Simulated)`, ephemeral: true });
  } else if (customId.startsWith('execute_prediction_no_')) {
    const symbol = customId.replace('execute_prediction_no_', '');
    await interaction.reply({ content: `ðŸ›‘ **Polymarket Order Triggered:** Placing **50 USDC NO Bet** on event: **${symbol}** (Polygon L2)... (DRY_RUN Simulated)`, ephemeral: true });
  } else if (customId.startsWith('start_channel_')) {
    const domain = customId.replace('start_channel_', '');
    hub.toggleChannelScreening(interaction.channelId, domain, true);
    await interaction.reply({ content: `âš¡ **Channel Screening Activated** for domain: \`${domain}\` in <#${interaction.channelId}>! Sub-agent active.`, ephemeral: false });
  } else if (customId.startsWith('pause_channel_')) {
    const domain = customId.replace('pause_channel_', '');
    hub.toggleChannelScreening(interaction.channelId, domain, false);
    await interaction.reply({ content: `â¸ï¸ **Channel Screening Paused** for domain: \`${domain}\` in <#${interaction.channelId}>. Sub-agent paused.`, ephemeral: false });
  } else if (customId.startsWith('trigger_pass_')) {
    const domain = customId.replace('trigger_pass_', '');
    await interaction.deferReply({ ephemeral: false });
    const results = await hub.triggerAgentPass(domain);
    await interaction.editReply(`ðŸ”Ž **On-Demand Screening Pass Triggered** for domain \`${domain}\`! Audited ${results.length} candidate signals.`);
  }

}
