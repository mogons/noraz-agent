import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { AthenaHub } from '../../orchestrator/hub.js';
import { AGENT_DOMAINS } from '../../orchestrator/agent-registry.js';
import { isDryRun as isDryRunMode } from '../../config/config.js';

export interface DashboardEmbedOptions {
  solBalance?: string | null;
  ethBalance?: string | null;
  activeAlerts?: number;
}

export function createDashboardComponents(hub: AthenaHub, opts: DashboardEmbedOptions = {}) {
  const isTwexSet = Boolean(process.env.TWEX_API_KEY);
  const isOpenSeaSet = Boolean(process.env.OPENSEA_API_KEY);
  const isLlmSet = Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);

  const getStatusBadge = (domain: string) => (hub.isAgentActive(domain) ? '`🟢 RUNNING`' : '`🔴 PAUSED`');

  const risk = hub.getRiskManager().getRiskState();
  const executionMode = isDryRunMode() ? 'DRY_RUN (Safe Simulation)' : 'LIVE';
  const drawdownStr = `Current Drawdown: \`${risk.currentDrawdownPct.toFixed(1)}%\` (Max: \`${risk.maxDrawdownLimitPct.toFixed(1)}%\`)`;
  const solBalanceStr = opts.solBalance ?? '`— (unavailable)`';
  const ethBalanceStr = opts.ethBalance ?? '`— (unavailable)`';
  const activeAlertsStr = `${opts.activeAlerts ?? 0} Active Alerts`;

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
          `• **Execution Mode:** \`${executionMode}\`\n` +
          `• ${drawdownStr}`,
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
          `• 🐦 **TwexAPI (X/Twitter Scraping):** ${isTwexSet ? '`🟢 CONFIGURED`' : '`⚪ NOT CONFIGURED (fail-closed)`'}\n` +
          `• 🖼️ **OpenSea API (NFT Data):** ${isOpenSeaSet ? '`🟢 CONFIGURED`' : '`⚪ NOT CONFIGURED (fail-closed)`'}\n` +
          `• 🧠 **LLM AI Reasoning API:** ${isLlmSet ? '`🟢 CONFIGURED`' : '`⚪ NOT CONFIGURED`'}`,
        inline: false,
      },
      {
        name: '🔑 Wallet Balances & Active Alerts',
        value:
          `• **Solana Balance:** ${solBalanceStr}\n` +
          `• **EVM Balance:** ${ethBalanceStr}\n` +
          `• **Active Price Alerts:** \`${activeAlertsStr}\` (Use \`/alert\` or ask in chat)`,
        inline: false,
      }
    )
    .setFooter({ text: 'Athena Multi-Agent Intelligence System • Operates in Safe Mode by default' })
    .setTimestamp();

  // Dropdown Select Menu to Toggle Agents
  const CATEGORY_EMOJI: Record<string, string> = {
    MEME: '🐣', LP: '💧', PERPS: '📈', NFT: '🖼️', PREDICTION: '🎯', CT_ALPHA: '💡',
  };
  const agentSelect = new StringSelectMenuBuilder()
    .setCustomId('select_toggle_agent')
    .setPlaceholder('👇 Select a Sub-Agent to Toggle (START / PAUSE)')
    .addOptions(
      ...AGENT_DOMAINS.map((d) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(d.displayName.replace(/-/g, ' '))
          .setValue(d.id)
          .setDescription(d.name)
          .setEmoji(CATEGORY_EMOJI[d.category] || '🤖')
      )
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
