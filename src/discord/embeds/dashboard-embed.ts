import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { AthenaHub } from '../../orchestrator/hub.js';

export function createDashboardComponents(hub: AthenaHub) {
  const isTwexSet = Boolean(process.env.TWEX_API_KEY);
  const isOpenSeaSet = Boolean(process.env.OPENSEA_API_KEY);
  const isLlmSet = Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);

  const getStatusBadge = (domain: string) => (hub.isAgentActive(domain) ? '`🟢 RUNNING`' : '`🔴 PAUSED`');

  const embed = new EmbedBuilder()
    .setTitle('🏛️ ATHENA MULTI-AGENT CONTROL CENTER')
    .setColor(0x00ffaa)
    .setDescription(
      'Welcome to the **Athena Autonomous Multi-Agent Command Center**.\n' +
      'Control screening agents, risk limits, price alerts, API keys, and burner wallets interactively below.'
    )
    .addFields(
      {
        name: '⚙️ Operating Mode & Risk Safeguards',
        value:
          '• **Execution Mode:** `DRY_RUN (Safe Simulation)`\n' +
          '• **Max Daily Drawdown:** `50.0% ($5,000 USD)`\n' +
          '• **Current Drawdown:** `0.0%`',
        inline: false,
      },
      {
        name: '🤖 24/7 Specialist Sub-Agents Status (PAUSED by Default)',
        value:
          `• 🐣 **Solana Meme Agent:** ${getStatusBadge('meme-solana')}\n` +
          `• 🔷 **EVM Meme Agent:** ${getStatusBadge('meme-evm')}\n` +
          `• 📈 **Perpetual Futures Agent:** ${getStatusBadge('perps')}\n` +
          `• 💧 **Trade+LP Velocity Engine:** ${getStatusBadge('lp-solana')}\n` +
          `• 🖼️ **NFT Sniping Agent:** ${getStatusBadge('nft')}\n` +
          `• 🎯 **Polymarket Prediction Agent:** ${getStatusBadge('prediction')}\n` +
          `• 💡 **Smart CT & AI Alpha Agent:** ${getStatusBadge('ct-alpha')}`,
        inline: false,
      },
      {
        name: '🌐 Connected API Keys & Social Intelligence Status',
        value:
          `• 🐦 **TwexAPI (X/Twitter Scraping):** ${isTwexSet ? '`🟢 CONFIGURED`' : '`⚪ FREE FALLBACK`'}\n` +
          `• 🖼️ **OpenSea API (NFT Data):** ${isOpenSeaSet ? '`🟢 CONFIGURED`' : '`⚪ MOCK SIMULATION`'}\n` +
          `• 🧠 **LLM AI Reasoning API:** ${isLlmSet ? '`🟢 CONFIGURED`' : '`⚪ LOCAL HEURISTIC MODE`'}`,
        inline: false,
      },
      {
        name: '🔑 Wallet Balances & Active Alerts',
        value:
          '• **Solana Balance:** `10.00 SOL` ($2,100 USD)\n' +
          '• **EVM Balance:** `1.50 ETH` ($4,200 USD)\n' +
          '• **Active Price Alerts:** `0 Active Alerts` (Use `/alert` or ask in chat)',
        inline: false,
      }
    )
    .setFooter({ text: 'Athena Multi-Agent Intelligence System • Operates in Safe Mode by default' })
    .setTimestamp();

  // Dropdown Select Menu to Toggle Agents
  const agentSelect = new StringSelectMenuBuilder()
    .setCustomId('select_toggle_agent')
    .setPlaceholder('👇 Select a Sub-Agent to Toggle (START / PAUSE)')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Solana Meme Agent')
        .setValue('meme-solana')
        .setDescription('Pump.fun, Raydium, CTO & Revival Volume Spikes')
        .setEmoji('🐣'),
      new StringSelectMenuOptionBuilder()
        .setLabel('EVM Meme Agent')
        .setValue('meme-evm')
        .setDescription('Base L2, ETH Mainnet, Robinhood L2 DEX tokens')
        .setEmoji('🔷'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Perpetuals Agent')
        .setValue('perps')
        .setDescription('Hyperliquid & CEX 5-Role Swarm Setups')
        .setEmoji('📈'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Trade+LP Velocity Engine')
        .setValue('lp-solana')
        .setDescription('High-volume LP harvesting (>5% 4h Fee/TVL)')
        .setEmoji('💧'),
      new StringSelectMenuOptionBuilder()
        .setLabel('NFT Sniping Agent')
        .setValue('nft')
        .setDescription('OpenSea EVM floor drops >= 10% & rare mispricings')
        .setEmoji('🖼️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Polymarket Agent')
        .setValue('prediction')
        .setDescription('Polygon L2 odds arbitrage & whale bet tracking')
        .setEmoji('🎯'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Smart CT & AI Alpha Agent')
        .setValue('ct-alpha')
        .setDescription('X/Twitter AI Agent launches, airdrop threads, & CT calls')
        .setEmoji('💡')
    );

  // Row 1: Master Toggles
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_start_all_agents')
      .setLabel('Start All Agents')
      .setStyle(ButtonStyle.Success)
      .setEmoji('▶️'),
    new ButtonBuilder()
      .setCustomId('btn_pause_all_agents')
      .setLabel('Pause All Agents')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏸️'),
    new ButtonBuilder()
      .setCustomId('btn_emergency_stop')
      .setLabel('Emergency Stop')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🛑')
  );

  // Row 2: Quick Action Buttons
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_setup_api_keys')
      .setLabel('Setup API Keys')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚙️'),
    new ButtonBuilder()
      .setCustomId('btn_view_wallets')
      .setLabel('Wallet Balances')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔑'),
    new ButtonBuilder()
      .setCustomId('btn_view_alerts')
      .setLabel('Active Alerts')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔔'),
    new ButtonBuilder()
      .setCustomId('btn_refresh_dashboard')
      .setLabel('Refresh Menu')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔄')
  );

  const rowDropdown = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(agentSelect);

  return {
    embeds: [embed],
    components: [rowDropdown, row1, row2],
  };
}
