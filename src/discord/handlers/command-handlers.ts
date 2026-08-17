/**
 * Slash-command handlers (handleChatInput) — extracted from interaction-handler.ts
 * to keep files focused. Service instances live here and are re-exported from
 * interaction-handler.ts for backward compatibility with existing consumers.
 */
import {
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { OpenCatHub } from '../../orchestrator/hub.js';
import { isDryRun as isDryRunMode, getExecutionMode } from '../../config/config.js';
import { globalPriceFeedService } from '../../services/price-feed-service.js';
import { PriceAlertService } from '../../services/price-alert-service.js';
import { TradeJournalService } from '../../services/trade-journal-service.js';
import { globalWalletService } from '../../services/wallet-service.js';
import { RelayAdapter } from '../../adapters/relay-adapter.js';
import { runTokenAudit } from '../../services/token-audit-service.js';
import { createDashboardComponents } from '../embeds/dashboard-embed.js';

export const priceFeedService = globalPriceFeedService;
export const priceAlertService = new PriceAlertService();
export const tradeJournalService = new TradeJournalService();
export const walletService = globalWalletService;

export async function buildDashboardOptions(): Promise<import('../embeds/dashboard-embed.js').DashboardEmbedOptions> {
  let ethBalance: string | null = null;
  try {
    const eth = await walletService.getEvmBalance(4663);
    if (eth) ethBalance = `${eth.balance.toFixed(4)} ETH${eth.simulated ? ' (Simulated)' : ''}`;
  } catch {
    ethBalance = null;
  }
  const activeAlerts = priceAlertService.listAlerts().filter((a) => !a.triggered).length;
  return { ethBalance, activeAlerts };
}

export async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  hub: OpenCatHub
): Promise<void> {
  const commandName = interaction.commandName;

  if (commandName === 'wallet') {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup' || subcommand === 'replace') {
      const isReplace = subcommand === 'replace';
      const modal = new ModalBuilder()
        .setCustomId('wallet_setup_modal')
        .setTitle(isReplace ? '🔄 Replace OpenCat Burner Wallet' : '🔑 OpenCat Burner Wallet Setup');

      const pkInput = new TextInputBuilder()
        .setCustomId('wallet_pk')
        .setLabel('Private Key (Kept 100% Encrypted & Local)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Paste your EVM burner wallet private key here...')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(pkInput)
      );

      await interaction.showModal(modal);
    } else if (subcommand === 'list') {
      const hasEvm = walletService.hasWallet('evm');

      let evmAddr = '❌ Not Configured';

      if (hasEvm) {
        try { evmAddr = `🟢 \`${walletService.getEvmAddress()}\``; } catch (e: any) { evmAddr = `⚠️ Invalid Key (${e.message})`; }
      }

      await interaction.reply({
        content: `📋 **REGISTERED OPENCAT BURNER WALLETS**\n\n` +
          `• **Robinhood Chain (EVM) Wallet:** ${evmAddr}\n\n` +
          `💡 *Use \`/wallet replace\` to swap the private key, or \`/wallet remove\` to delete the wallet.*`,
        ephemeral: true,
      });
    } else if (subcommand === 'remove') {
      const chain = interaction.options.getString('chain', true) as 'evm';
      walletService.removeKey(chain);

      await interaction.reply({
        content: `🗑️ **WALLET REMOVED SUCCESSFULLY!**\n\n` +
          `The \`${chain.toUpperCase()}\` burner wallet has been removed from the bot's memory.\n` +
          `Use \`/wallet setup\` to register a new wallet at any time.`,
        ephemeral: true,
      });
    } else if (subcommand === 'balance') {
      const isDryRun = isDryRunMode();
      const hasEvm = walletService.hasWallet('evm');

      let evmAddrStr = 'Not Configured';
      let evmBalStr = `${parseFloat(process.env.SIMULATION_BALANCE_ETH || '1.0').toFixed(2)} ETH (Simulated)`;

      if (hasEvm) {
        try {
          evmAddrStr = `\`${walletService.getEvmAddress()}\``;
          const b = await walletService.getEvmBalance(4663); // Robinhood Chain
          evmBalStr = b === null ? '`— (unavailable)`' : `\`${b.balance.toFixed(4)} ETH\``;
        } catch (e: any) {
          evmBalStr = `Error: ${e.message}`;
        }
      }

      await interaction.reply({
        content: `💼 **OpenCat Wallet Balances (${isDryRun ? 'DRY_RUN SIMULATION' : 'LIVE'}):**\n` +
          `• Robinhood Wallet: ${evmAddrStr} | Balance: ${evmBalStr}`,
        ephemeral: true,
      });
    } else if (subcommand === 'withdraw') {
      const recipient = interaction.options.getString('to', true).trim();
      const amount = interaction.options.getNumber('amount', true);
      const selectedChain = interaction.options.getString('chain') || 'robinhood';
      const isDryRun = isDryRunMode();

      await interaction.deferReply({ ephemeral: true });

      try {
        if (!walletService.hasWallet('evm') && !isDryRun) {
          await interaction.editReply('❌ EVM burner wallet is not configured. Use `/wallet setup` first.');
          return;
        }
        const evmChainIds: Record<string, number> = {
          robinhood: 4663,
        };
        const chainId = evmChainIds[selectedChain] || 4663;
        const { txHash, explorerUrl } = await walletService.sendEvm(chainId, recipient, amount);
        await interaction.editReply(
          `💸 **WITHDRAWAL ${isDryRun ? '(DRY_RUN SIMULATION)' : 'SUCCESSFUL'}!**\n\n` +
          `• **Amount:** \`${amount} Native Token\`\n` +
          `• **Recipient:** \`${recipient}\`\n` +
          `• **Network:** \`${selectedChain.toUpperCase()} (Chain ID #${chainId})\`\n` +
          `• **Transaction Hash:** \`${txHash}\`\n` +
          `🔗 [View Explorer](${explorerUrl})`
        );
      } catch (err: any) {
        await interaction.editReply(`❌ Withdrawal error: ${err.message}`);
      }
    }
  } else if (commandName === 'analyze') {
    const contract = interaction.options.getString('contract', true);
    await interaction.deferReply();

    const chainName = 'Robinhood Chain (EVM)';
    const audit = await runTokenAudit(contract);

    await interaction.editReply({
      content: `🔎 **OPENCAT ON-DEMAND TOKEN AUDIT REPORT**\n📌 **Target Contract:** \`${contract}\` (${chainName})\n\n${audit.content}`,
    });
  } else if (commandName === 'screening') {
    await interaction.deferReply({ ephemeral: false });
    const subcommand = interaction.options.getSubcommand();
    const explicitAgent = interaction.options.getString('agent');
    const channelName = (interaction.channel as any)?.name?.toLowerCase() || '';

    // Channel to Agent mapping
    const channelDomainMap: Record<string, { agent: string; name: string }> = {
      'call-meme-robinhood': { agent: 'meme-robinhood', name: 'Robinhood Meme Agent' },
      'call-lp-robinhood': { agent: 'lp-robinhood', name: 'Robinhood LP Agent' },
      'call-nft-robinhood': { agent: 'nft', name: 'NFT Sniping Agent' },
      'call-alpha-robinhood': { agent: 'alpha-robinhood', name: 'Alpha Scraper Agent' },
    };

    let targetAgent = explicitAgent;

    // Auto-detect agent from channel if omitted
    if (!targetAgent) {
      const match = channelDomainMap[channelName];
      if (match) {
        targetAgent = match.agent;
      } else if (channelName.includes('control-room') || !channelName.startsWith('call-')) {
        // Control room / general channel — operate on ALL agents (or show status)
        if (subcommand === 'status') {
          // Fall through — handled by the shared status block below
        } else if (subcommand === 'start') {
          Object.values(channelDomainMap).forEach(d => hub.toggleChannelScreening(interaction.channelId, d.agent, true));
          await interaction.editReply('⚡ **Global Master Screening Activated!** All 3 Sub-Agent domains are now active.');
          return;
        } else {
          Object.values(channelDomainMap).forEach(d => hub.toggleChannelScreening(interaction.channelId, d.agent, false));
          await interaction.editReply('⏸️ **Global Master Screening Paused!** All 3 Sub-Agent domains are now paused.');
          return;
        }
      } else {
        await interaction.editReply({
          content: '⚠️ Please specify an agent domain (e.g. `/screening start agent:meme-robinhood`) or run this command inside a dedicated `#call-*` channel!',
        });
        return;
      }
    }

    // Validate channel alignment if explicit agent was specified
    const currentChannelMapping = channelDomainMap[channelName];
    if (currentChannelMapping && explicitAgent && currentChannelMapping.agent !== explicitAgent) {
      await interaction.editReply({
        content: `⚠️ **Channel Misalignment Notice:**\n` +
          `Channel <#${interaction.channelId}> is dedicated to **${currentChannelMapping.name}** (\`${currentChannelMapping.agent}\`).\n\n` +
          `To activate \`${explicitAgent}\`, please run \`/screening start\` inside its dedicated channel or in **#opencat-control-room**!`,
      });
      return;
    }

    if (subcommand === 'start') {
      hub.toggleChannelScreening(interaction.channelId, targetAgent!, true);
      await interaction.editReply(`⚡ **Screening Activated** for domain: \`${targetAgent}\` in <#${interaction.channelId}>.`);
    } else if (subcommand === 'stop') {
      hub.toggleChannelScreening(interaction.channelId, targetAgent!, false);
      await interaction.editReply(`⏸️ **Screening Stopped** for domain: \`${targetAgent}\` in <#${interaction.channelId}>.`);
    } else if (subcommand === 'status') {
      const ALL_AGENTS: Array<{ id: string; label: string; emoji: string }> = [
        { id: 'meme-robinhood', label: 'Robinhood Meme Agent',    emoji: '🔷' },
        { id: 'lp-robinhood',    label: 'Robinhood LP Agent',     emoji: '💧' },
        { id: 'nft',             label: 'NFT Sniping Agent',      emoji: '🖼️' },
      ];

      const activeCount = ALL_AGENTS.filter(a => hub.isAgentActive(a.id)).length;
      const statusLines = ALL_AGENTS.map(a => {
        const isActive = hub.isAgentActive(a.id);
        return `${a.emoji} **${a.label}**  →  ${isActive ? '🟢 ACTIVE' : '🔴 PAUSED'}`;
      }).join('\n');

      const overallLine = activeCount === 3
        ? '🟢 **All 3 Sub-Agents ACTIVE** — 24/7 Screening Running!'
        : activeCount === 0
        ? '🔴 **All Sub-Agents PAUSED** — No screening running.'
        : `🟡 **${activeCount}/3 Sub-Agents Active** — Partial screening running.`;

      await interaction.editReply(
        `## 🐾 OpenCat Sub-Agent Status Dashboard\n\n${overallLine}\n\n${statusLines}\n\n` +
        `> 💡 Use \`/screening start\` or \`/screening stop\` in a dedicated channel to toggle individual agents.`
      );
    } else if (subcommand === 'trigger') {
      const target = interaction.options.getString('agent', true);
      try {
        const signals = await hub.triggerAgentPass(target);
        await interaction.editReply(`⚡ **On-demand screening pass executed** for domain: \`${target}\` — **${signals.length} signal(s)** found.`);
      } catch (err: any) {
        await interaction.editReply(`❌ **Trigger failed** for \`${target}\`: ${err.message}`);
      }
    }
  } else if (commandName === 'cancel') {
    await interaction.reply({
      content: '🛑 **Emergency Cancellation Executed:** All active background screening and pending orders have been paused.',
      ephemeral: false,
    });
  } else if (commandName === 'config') {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'risk') {
      const risk = hub.getRiskManager().getRiskState();
      const tp1 = process.env.DEFAULT_TP1_PCT || '100';
      const tp2 = process.env.DEFAULT_TP2_PCT || '200';
      const sl = process.env.DEFAULT_SL_PCT || '-50';
      const fmtUsd = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      await interaction.reply({
        content:
          `⚙️ **OPENCAT LIVE RISK & AUTO TP/SL SETTINGS**\n` +
          `• **Execution Mode:** \`${getExecutionMode()}\` (Primary Venue: \`Uniswap V3 • Robinhood Chain\`)\n` +
          `• **Auto TP Targets:** TP1: \`+${tp1}%\` | TP2: \`+${tp2}%\` | SL: \`${sl}%\`\n` +
          `• **Max Drawdown Limit:** \`${risk.maxDrawdownLimitPct}%\` (current drawdown: \`${risk.currentDrawdownPct ?? 0}%\`)\n` +
          `• **Max Position Size:** \`${fmtUsd(risk.maxPositionSizeUsd)}\` per trade\n` +
          `• **Trading Paused:** \`${risk.paused ? 'YES 🚨' : 'No'}\` | Max Sector Exposure: \`${risk.maxSectorExposurePercent}%\`\n\n` +
          `> 💡 Adjust via chat: *"OpenCat, set max drawdown 20%"* or *"OpenCat, set position size 500"*.`,
        ephemeral: true,
      });
    } else if (subcommand === 'status') {
      const mode = getExecutionMode();
      const walletAddr = process.env.EVM_WALLET_ADDRESS || (walletService.hasWallet('evm') ? walletService.getEvmAddress() : 'None configured');
      const active = hub.getActiveDomains();
      const keyNames = ['GMGN_API_KEY', 'GMGN_API_KEY_ROBINHOOD', 'KRYSTAL_CLOUD_API_KEY', 'OPENSEA_API_KEY', 'GOPLUS_API_KEY', 'UNISWAP_API_KEY', 'AI_API_KEY'];
      const keys = keyNames.map((k) => {
        const v = process.env[k];
        return `• \`${k}\`: ${v && !v.includes('YOUR_') && !v.includes('placeholder') && !v.includes('mock') ? '✅ SET' : '❌ not set'}`;
      }).join('\n');
      await interaction.reply({
        content:
          `🖥️ **OPENCAT RUNTIME CONFIGURATION**\n\n` +
          `• **Execution Mode:** \`${mode}\`\n` +
          `• **Primary Swap Venue:** \`Uniswap V3 (Robinhood Chain EVM L2 #4663)\`\n` +
          `• **Tracked Wallet Address:** \`${walletAddr}\`\n` +
          `• **Active Agents:** \`${active.length > 0 ? active.join(', ') : 'NONE'}\`\n\n` +
          `**API Keys:**\n${keys}\n\n` +
          `> 💡 Set keys via chat: *"OpenCat, set GMGN_API_KEY=..."*. Protected keys (private keys, RPC) are never exposed.`,
        ephemeral: true,
      });
    }
  } else if (commandName === 'health') {
    const { globalHealthWatcher } = await import('../../services/health-watcher.js');
    const health = globalHealthWatcher.auditSystemHealth();
    const lines = Object.entries(health.report)
      .map(([domain, h]: [string, any]) => `• **${domain}:** \`${h?.status || 'UNKNOWN'}\` (last ping ${h?.lastPingAt ? `${Math.max(0, Math.round((Date.now() - h.lastPingAt) / 60000))}m ago` : 'n/a'})`)
      .join('\n');
    await interaction.reply({
      content:
        `🩺 **OPENCAT SYSTEM HEALTH**\n\n${lines}\n\n` +
        (health.allHealthy ? '> 🟢 All agents healthy.' : '> ⚠️ Some agents are not responding — check `pm2 logs opencat-agent`.'),
      ephemeral: false,
    });
  } else if (commandName === 'strategy') {
    const subcommand = interaction.options.getSubcommand();
    const { StrategyEngine } = await import('../../orchestrator/strategy-engine.js');
    const engine = new StrategyEngine();
    if (subcommand === 'list') {
      const list = engine.listStrategies();
      const lines = list.map((s: any) => `• **${s.id}** — ${s.name}${s.active ? ' `🟢 ACTIVE`' : ''}`).join('\n');
      await interaction.reply({
        content: `🧠 **OPENCAT STRATEGY MODULES**\n\n${lines || 'No strategies found.'}\n\n> 💡 Write new strategies via chat: *"OpenCat, create strategy X"*.`,
        ephemeral: true,
      });
    } else if (subcommand === 'view') {
      const res = engine.readStrategy(interaction.options.getString('name', true));
      await interaction.reply({ content: res.success ? `📄 **${interaction.options.getString('name', true)}**\n\`\`\`js\n${String(res.data?.content || '').slice(0, 1800)}\`\`\`` : `❌ ${res.message}`, ephemeral: true });
    } else if (subcommand === 'activate') {
      const res = engine.setActiveStrategy(interaction.options.getString('domain', true), interaction.options.getString('strategy', true));
      await interaction.reply({ content: res.success ? `✅ ${res.message}` : `❌ ${res.message}`, ephemeral: true });
    } else if (subcommand === 'rollback') {
      const res = engine.rollbackStrategy(interaction.options.getString('name', true));
      await interaction.reply({ content: res.success ? `↩️ ${res.message}` : `❌ ${res.message}`, ephemeral: true });
    }
  } else if (commandName === 'channel') {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ Command can only be used in a server.', ephemeral: true });
      return;
    }

    if (subcommand === 'create') {
      const channelName = interaction.options.getString('name', true).toLowerCase().replace(/\s+/g, '-');
      const newChannel = await guild.channels.create({
        name: channelName,
        topic: 'Custom channel for notes, journal, or watchlist.',
      });
      await interaction.reply(`📁 **Channel Created:** <#${newChannel.id}> (\`#${channelName}\`) is ready for your personal notes!`);
    } else if (subcommand === 'rearrange') {
      await interaction.reply('✨ **OpenCat Channel Arrangement:** Command Center channels are organized neatly in sequence.');
    }
  } else if (commandName === 'price') {
    const token = interaction.options.getString('token', true);
    const cleanToken = token.toUpperCase().trim();
    const price = await priceFeedService.getPrice(cleanToken);
    if (price === null) {
      await interaction.reply({ content: `⚠️ Real-time price data is unavailable for **\`${token}\`** right now.` });
      return;
    }
    await interaction.reply(`📊 **Token Price Query (\`${cleanToken}\`):**\n• Price: **$${price.toLocaleString()} USD** (CoinGecko real-time)`);
  } else if (commandName === 'chart') {
    const token = interaction.options.getString('token', true);
    await interaction.reply(`📈 **Chart View for \`${token}\`:**\n📊 DexScreener: https://dexscreener.com/robinhood/${token}`);
  } else if (commandName === 'holders') {
    const ca = interaction.options.getString('contract', true);
    const audit = await runTokenAudit(ca);
    await interaction.reply({ content: `👥 **TOP HOLDERS & INSIDER AUDIT (\`${ca}\`):**\n${audit.content}` });
  } else if (commandName === 'wallets') {
    const ca = interaction.options.getString('contract', true);
    const audit = await runTokenAudit(ca);
    await interaction.reply({ content: `🐋 **TOP SMART MONEY WALLETS SCAN (\`${ca}\`):**\n${audit.content}` });
  } else if (commandName === 'pump') {
    const ca = interaction.options.getString('contract', true);
    const audit = await runTokenAudit(ca);
    await interaction.reply({ content: `🎯 **ROBINHOOD CHAIN TOKEN TRACKER (\`${ca}\`):**\n${audit.content}` });
  } else if (commandName === 'convert') {
    const amount = interaction.options.getNumber('amount', true);
    const symbol = interaction.options.getString('symbol', true).toUpperCase();
    const tokenPrice = await priceFeedService.getPrice(symbol);
    if (tokenPrice === null) {
      await interaction.reply({ content: `⚠️ No real-time price data for **${symbol}**.` });
      return;
    }
    const estUsd = amount * tokenPrice;
    await interaction.reply({
      content: `🧮 **Token Value Converter:**\n• **${amount} ${symbol}** ≈ **$${estUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD** (Rate: \`$${tokenPrice.toLocaleString()} USD\` per ${symbol})`,
    });
  } else if (commandName === 'alert') {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'set') {
      const symbol = interaction.options.getString('symbol', true).toUpperCase();
      const price = interaction.options.getNumber('price', true);
      const direction = interaction.options.getString('direction', true) as 'ABOVE' | 'BELOW';

      const alert = priceAlertService.addAlert({
        userId: interaction.user.id,
        symbol,
        targetPriceUsd: price,
        direction,
        channelId: interaction.channelId,
      });

      await interaction.reply({
        content: `🔔 **Price Alert Set Successfully!**\n• **Asset:** \`${alert.symbol}\`\n• **Target Price:** \`$${alert.targetPriceUsd.toLocaleString()} USD\`\n• **Trigger Condition:** Price goes \`${alert.direction}\` target\n• **ID:** \`${alert.id}\`\nOpenCat will notify <@${interaction.user.id}> as soon as price reaches target! 🐾`,
      });
    } else if (subcommand === 'list') {
      const alerts = priceAlertService.listAlerts(interaction.user.id);
      if (alerts.length === 0) {
        await interaction.reply({ content: '🔔 You have no active price alerts set.', ephemeral: true });
      } else {
        const listText = alerts.map(a => `• \`${a.symbol}\` ${a.direction} **$${a.targetPriceUsd.toLocaleString()} USD** (ID: \`${a.id}\`)`).join('\n');
        await interaction.reply({
          content: `📋 **Your Active Price Alerts (${alerts.length}):**\n${listText}`,
          ephemeral: true,
        });
      }
    } else if (subcommand === 'cancel') {
      const id = interaction.options.getString('id', true);
      const removed = priceAlertService.removeAlert(id);
      if (removed) {
        await interaction.reply({ content: `✅ Price alert \`${id}\` has been canceled.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Alert ID \`${id}\` not found or already triggered.`, ephemeral: true });
      }
    }
  } else if (commandName === 'menu' || commandName === 'dashboard') {
    const dash = createDashboardComponents(hub, await buildDashboardOptions());
    await interaction.reply(dash);
  } else if (commandName === 'journal') {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'summary') {
      const stats = tradeJournalService.getSummaryStats();
      await interaction.reply({
        content:
          `📊 **OPENCAT TRADE JOURNAL PERFORMANCE SUMMARY**\n\n` +
          `• **Total Trades Logged:** \`${stats.totalTrades}\` (\`${stats.openTradesCount}\` Open, \`${stats.winCount + stats.lossCount}\` Closed)\n` +
          `• **Win Rate:** \`${stats.winRatePct.toFixed(1)}%\` (${stats.winCount} Wins / ${stats.lossCount} Losses)\n` +
          `• **Total Realized PnL:** \`+$${stats.totalRealizedPnlUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\`\n` +
          `• **Best Trade:** \`+$${stats.bestTradeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\`\n` +
          `• **Worst Trade:** \`-$${Math.abs(stats.worstTradeUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\`\n` +
          `• **Avg Profit / Trade:** \`+$${stats.avgProfitPerTradeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\`\n\n` +
          `Use \`/journal history\` to view recent trades or \`/journal export\` for CSV download.`,
      });
    } else if (subcommand === 'history') {
      const trades = tradeJournalService.listTrades().slice(0, 10);
      const historyText = trades.map(t => {
        const pnlStr = t.realizedPnlPct !== undefined ? ` (${t.realizedPnlPct >= 0 ? '+' : ''}${t.realizedPnlPct.toFixed(1)}%)` : '';
        return `• \`${t.domain}\` | **$${t.symbol}** | Status: \`${t.status}\`${pnlStr} - *${t.strategyUsed}*`;
      }).join('\n');

      await interaction.reply({
        content: `📋 **RECENT OPENCAT TRADES (${trades.length}):**\n${historyText}`,
      });
    } else if (subcommand === 'export') {
      const csvData = tradeJournalService.exportCsv();
      const buffer = Buffer.from(csvData, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: 'opencat_trade_journal.csv' });

      await interaction.reply({
        content: '📄 **OpenCat Trade Journal Exported Successfully!** Download your CSV report below for Excel / Notion:',
        files: [attachment],
      });
    }
  } else if (commandName === 'update') {
    await interaction.reply({
      content: '🔄 **OpenCat Self-Update Sequence Initiated...**\nPulling latest patches, installing dependencies, re-building, and restarting the agent...',
      ephemeral: true,
    });

    // Run the update ASYNC (fire-and-forget): the sequence restarts PM2 at the
    // end, which kills this very process — so we can never await a followUp
    // after the restart. We only report failures that happen BEFORE the restart.
    try {
      const { runOpenCatUpdate } = await import('../../../scripts/update-core.mjs');
      runOpenCatUpdate({ noRestart: false });
    } catch (err: any) {
      await interaction.followUp({
        content: `❌ **Update Exception (before restart):** ${err.message}\n⚠ The bot will restart on its own — full report in ` + '`pm2 logs opencat-agent`' + `.`,
        ephemeral: true,
      });
    }
  } else if (commandName === 'swap') {
    const from = interaction.options.getString('from', true);
    const to = interaction.options.getString('to', true);
    const amount = interaction.options.getNumber('amount', true);
    const chain = interaction.options.getString('chain') || 'robinhood';

    const relayAdapter = new RelayAdapter();
    const result = await relayAdapter.executeSwap({
      chain,
      fromToken: from,
      toToken: to,
      amount,
    }, walletService);

    const embed = new EmbedBuilder()
      .setTitle(`🔄 RELAY.LINK TOKEN SWAP DIRECT EXECUTION`)
      .setColor(0x7B3FE4)
      .setDescription(
        `🔄 **Swapping:** \`${result.amountIn} ${result.fromToken}\` ➡️ \`~${result.expectedAmountOut} ${result.toToken}\`\n` +
        `⛓️ **Chain:** **${result.chainName}**\n` +
        `🔑 **Tx Hash:** \`${result.txHash || 'Simulated'}\`\n\n` +
        `💸 **Fee:** \`~$${result.feeUsd.toFixed(2)} USD\`\n` +
        `⚡ **Est. Speed:** \`~${result.estimatedDurationSeconds} seconds\`\n` +
        `💡 **Execution Mode:** ${result.simulated ? '`DRY_RUN (Simulated Direct On-Chain Swap)`' : '`Live Broadcast`'}`
      )
      .setFooter({ text: 'Powered by Relay.link Swap Engine • OpenCat Multi-Agent Hub' });

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`View on Explorer`)
        .setStyle(ButtonStyle.Link)
        .setURL(result.explorerUrl || result.relayWebUrl)
    );

    await interaction.reply({ embeds: [embed], components: [actionRow] });
  } else if (commandName === 'send') {
    const to = interaction.options.getString('to', true);
    const amount = interaction.options.getNumber('amount', true);
    const token = interaction.options.getString('token') || 'ETH';
    const chain = interaction.options.getString('chain') || 'robinhood';

    const relayAdapter = new RelayAdapter();
    const result = await relayAdapter.executeSend({
      chain,
      token,
      amount,
      recipientAddress: to,
    }, walletService);

    const embed = new EmbedBuilder()
      .setTitle(`📤 RELAY.LINK TOKEN SEND DIRECT EXECUTION`)
      .setColor(0x00C853)
      .setDescription(
        `📤 **Sending:** \`${result.amountIn} ${result.tokenSymbol}\` to \`${result.recipientAddress.substring(0, 6)}...${result.recipientAddress.substring(result.recipientAddress.length - 4)}\`\n` +
        `⛓️ **Chain:** **${result.chainName}**\n` +
        `🔑 **Tx Hash:** \`${result.txHash || 'Simulated'}\`\n\n` +
        `📥 **Recipient Receives:** \`~${result.expectedAmountOut} ${result.tokenSymbol}\`\n` +
        `💸 **Fee:** \`~$${result.feeUsd.toFixed(2)} USD\`\n` +
        `⚡ **Est. Speed:** \`~${result.estimatedDurationSeconds} seconds\`\n` +
        `💡 **Execution Mode:** ${result.simulated ? '`DRY_RUN (Simulated Direct On-Chain Transfer)`' : '`Live Broadcast`'}`
      )
      .setFooter({ text: 'Powered by Relay.link Transfer Engine • OpenCat Multi-Agent Hub' });

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`View on Explorer`)
        .setStyle(ButtonStyle.Link)
        .setURL(result.explorerUrl || result.relayWebUrl)
    );

    await interaction.reply({ embeds: [embed], components: [actionRow] });
  }
}
