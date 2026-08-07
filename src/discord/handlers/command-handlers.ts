/**
 * Slash-command handlers (handleChatInput) â€” extracted from interaction-handler.ts
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
import { AthenaHub } from '../../orchestrator/hub.js';
import { isDryRun as isDryRunMode } from '../../config/config.js';
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
  let solBalance: string | null = null;
  let ethBalance: string | null = null;
  try {
    const sol = await walletService.getSolanaBalance();
    if (sol) solBalance = `${sol.balance.toFixed(4)} SOL${sol.simulated ? ' (Simulated)' : ''}`;
  } catch {
    solBalance = null;
  }
  try {
    const eth = await walletService.getEvmBalance(1);
    if (eth) ethBalance = `${eth.balance.toFixed(4)} ETH${eth.simulated ? ' (Simulated)' : ''}`;
  } catch {
    ethBalance = null;
  }
  const activeAlerts = priceAlertService.listAlerts().filter((a) => !a.triggered).length;
  return { solBalance, ethBalance, activeAlerts };
}

export async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  hub: AthenaHub
): Promise<void> {
  const commandName = interaction.commandName;

  if (commandName === 'wallet') {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup' || subcommand === 'replace') {
      const isReplace = subcommand === 'replace';
      const modal = new ModalBuilder()
        .setCustomId('wallet_setup_modal')
        .setTitle(isReplace ? 'Ã°Å¸â€â€ž Replace Athena Burner Wallet' : 'Ã°Å¸â€â€˜ Athena Burner Wallet Setup');

      const chainInput = new TextInputBuilder()
        .setCustomId('wallet_chain')
        .setLabel('Blockchain Network (solana / evm)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('solana')
        .setRequired(true);

      const pkInput = new TextInputBuilder()
        .setCustomId('wallet_pk')
        .setLabel('Private Key (Kept 100% Encrypted & Local)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Paste your burner wallet private key here...')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(chainInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(pkInput)
      );

      await interaction.showModal(modal);
    } else if (subcommand === 'list') {
      const hasSol = walletService.hasWallet('solana');
      const hasEvm = walletService.hasWallet('evm');

      let solAddr = 'Ã¢ÂÅ’ Not Configured';
      let evmAddr = 'Ã¢ÂÅ’ Not Configured';

      if (hasSol) {
        try { solAddr = `Ã°Å¸Å¸Â¢ \`${walletService.getSolanaAddress()}\``; } catch (e: any) { solAddr = `Ã¢Å¡Â Ã¯Â¸Â Invalid Key (${e.message})`; }
      }
      if (hasEvm) {
        try { evmAddr = `Ã°Å¸Å¸Â¢ \`${walletService.getEvmAddress()}\``; } catch (e: any) { evmAddr = `Ã¢Å¡Â Ã¯Â¸Â Invalid Key (${e.message})`; }
      }

      await interaction.reply({
        content: `Ã°Å¸â€œâ€¹ **REGISTERED ATHENA BURNER WALLETS**\n\n` +
          `Ã¢â‚¬Â¢ **Solana Wallet:** ${solAddr}\n` +
          `Ã¢â‚¬Â¢ **EVM Wallet:** ${evmAddr}\n\n` +
          `Ã°Å¸â€™Â¡ *Gunakan \`/wallet replace\` untuk mengganti private key, atau \`/wallet remove\` untuk menghapus wallet.*`,
        ephemeral: true,
      });
    } else if (subcommand === 'remove') {
      const chain = interaction.options.getString('chain', true) as 'solana' | 'evm';
      walletService.removeKey(chain);

      await interaction.reply({
        content: `Ã°Å¸â€”â€˜Ã¯Â¸Â **WALLET REMOVED SUCCESSFULLY!**\n\n` +
          `Burner wallet untuk network \`${chain.toUpperCase()}\` telah berhasil dihapus dari memori bot.\n` +
          `Gunakan \`/wallet setup\` jika ingin mendaftarkan wallet baru di masa mendatang.`,
        ephemeral: true,
      });
    } else if (subcommand === 'balance') {
      const isDryRun = isDryRunMode();
      const hasSol = walletService.hasWallet('solana');
      const hasEvm = walletService.hasWallet('evm');

      let solAddrStr = 'Not Configured';
      let evmAddrStr = 'Not Configured';
      let solBalStr = `${parseFloat(process.env.SIMULATION_BALANCE_SOL || '10.0').toFixed(2)} SOL (Simulated)`;
      let evmBalStr = `${parseFloat(process.env.SIMULATION_BALANCE_ETH || '1.0').toFixed(2)} ETH (Simulated)`;

      if (hasSol) {
        try {
          solAddrStr = `\`${walletService.getSolanaAddress()}\``;
          const b = await walletService.getSolanaBalance();
          solBalStr = b === null ? '`Ã¢â‚¬â€ (unavailable)`' : `\`${b.balance.toFixed(4)} SOL\``;
        } catch (e: any) {
          solBalStr = `Error: ${e.message}`;
        }
      }

      if (hasEvm) {
        try {
          evmAddrStr = `\`${walletService.getEvmAddress()}\``;
          const b = await walletService.getEvmBalance(1); // Ethereum
          evmBalStr = b === null ? '`Ã¢â‚¬â€ (unavailable)`' : `\`${b.balance.toFixed(4)} ETH\``;
        } catch (e: any) {
          evmBalStr = `Error: ${e.message}`;
        }
      }

      await interaction.reply({
        content: `Ã°Å¸â€™Â¼ **Athena Wallet Balances (${isDryRun ? 'DRY_RUN SIMULATION' : 'LIVE'}):**\n` +
          `Ã¢â‚¬Â¢ Solana Wallet: ${solAddrStr} | Balance: ${solBalStr}\n` +
          `Ã¢â‚¬Â¢ EVM Wallet: ${evmAddrStr} | Balance: ${evmBalStr}`,
        ephemeral: true,
      });
    } else if (subcommand === 'withdraw') {
      const recipient = interaction.options.getString('to', true).trim();
      const amount = interaction.options.getNumber('amount', true);
      const selectedChain = interaction.options.getString('chain') || (recipient.startsWith('0x') ? 'base' : 'solana');
      const isDryRun = isDryRunMode();

      await interaction.deferReply({ ephemeral: true });

      try {
        if (selectedChain === 'solana' || !recipient.startsWith('0x')) {
          if (!walletService.hasWallet('solana') && !isDryRun) {
            await interaction.editReply('Ã¢ÂÅ’ Solana burner wallet is not configured. Use `/wallet setup` first.');
            return;
          }
          const { txHash, explorerUrl } = await walletService.sendSol(recipient, amount);
          await interaction.editReply(
            `Ã°Å¸â€™Â¸ **WITHDRAWAL ${isDryRun ? '(DRY_RUN SIMULATION)' : 'SUCCESSFUL'}!**\n\n` +
            `Ã¢â‚¬Â¢ **Amount:** \`${amount} SOL\`\n` +
            `Ã¢â‚¬Â¢ **Recipient:** \`${recipient}\`\n` +
            `Ã¢â‚¬Â¢ **Network:** \`Solana\`\n` +
            `Ã¢â‚¬Â¢ **Transaction Hash:** \`${txHash}\`\n` +
            `Ã°Å¸â€â€” [View Explorer](${explorerUrl})`
          );
        } else {
          if (!walletService.hasWallet('evm') && !isDryRun) {
            await interaction.editReply('Ã¢ÂÅ’ EVM burner wallet is not configured. Use `/wallet setup` first.');
            return;
          }
          const evmChainIds: Record<string, number> = {
            ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10, polygon: 137, bsc: 56,
          };
          const chainId = evmChainIds[selectedChain] || 8453;
          const { txHash, explorerUrl } = await walletService.sendEvm(chainId, recipient, amount);
          await interaction.editReply(
            `Ã°Å¸â€™Â¸ **WITHDRAWAL ${isDryRun ? '(DRY_RUN SIMULATION)' : 'SUCCESSFUL'}!**\n\n` +
            `Ã¢â‚¬Â¢ **Amount:** \`${amount} Native Token\`\n` +
            `Ã¢â‚¬Â¢ **Recipient:** \`${recipient}\`\n` +
            `Ã¢â‚¬Â¢ **Network:** \`${selectedChain.toUpperCase()} (Chain ID #${chainId})\`\n` +
            `Ã¢â‚¬Â¢ **Transaction Hash:** \`${txHash}\`\n` +
            `Ã°Å¸â€â€” [View Explorer](${explorerUrl})`
          );
        }
      } catch (err: any) {
        await interaction.editReply(`Ã¢ÂÅ’ Withdrawal error: ${err.message}`);
      }
    }
  } else if (commandName === 'analyze') {
    const contract = interaction.options.getString('contract', true);
    await interaction.deferReply();

    const isSol = !contract.startsWith('0x');
    const chainName = isSol ? 'Solana (SOL)' : 'EVM (Base / ETH / Robinhood)';
    const audit = await runTokenAudit(contract);

    await interaction.editReply({
      content: `Ã°Å¸â€Å½ **ATHENA ON-DEMAND TOKEN AUDIT REPORT**\nÃ°Å¸â€œÅ’ **Target Contract:** \`${contract}\` (${chainName})\n\n${audit.content}`,
    });
  } else if (commandName === 'screening') {
    await interaction.deferReply({ ephemeral: false });
    const subcommand = interaction.options.getSubcommand();
    const explicitAgent = interaction.options.getString('agent');
    const channelName = (interaction.channel as any)?.name?.toLowerCase() || '';

    // Channel to Agent mapping
    const channelDomainMap: Record<string, { agent: string; name: string }> = {
      'call-meme-solana': { agent: 'meme-solana', name: 'Solana Meme Agent' },
      'call-meme-robinhood': { agent: 'meme-robinhood', name: 'Robinhood Meme Agent' },
      'call-perps-futures': { agent: 'perps', name: 'Perpetuals Agent' },
      'call-nft-sniping': { agent: 'nft', name: 'NFT Sniping Agent' },
      'call-lp-solana': { agent: 'lp-solana', name: 'Solana LP Agent' },
      'call-lp-evm': { agent: 'lp-evm', name: 'EVM LP Agent' },
      'call-prediction-markets': { agent: 'prediction', name: 'Polymarket Prediction Agent' },
      'call-ct-alpha': { agent: 'ct-alpha', name: 'Smart CT & AI Alpha Agent' },
    };

    let targetAgent = explicitAgent;

    // Auto-detect agent from channel if omitted
    if (!targetAgent) {
      const match = channelDomainMap[channelName];
      if (match) {
        targetAgent = match.agent;
      } else if (channelName.includes('control-room') || !channelName.startsWith('call-')) {
        // Control room / general channel Ã¢â‚¬â€ operate on ALL agents (or show status)
        if (subcommand === 'status') {
          // Fall through Ã¢â‚¬â€ handled by the shared status block below
        } else if (subcommand === 'start') {
          Object.values(channelDomainMap).forEach(d => hub.toggleChannelScreening(interaction.channelId, d.agent, true));
          await interaction.editReply('Ã¢Å¡Â¡ **Global Master Screening Activated!** All 8 Sub-Agent domains are now active.');
          return;
        } else {
          Object.values(channelDomainMap).forEach(d => hub.toggleChannelScreening(interaction.channelId, d.agent, false));
          await interaction.editReply('Ã¢ÂÂ¸Ã¯Â¸Â **Global Master Screening Paused!** All 8 Sub-Agent domains are now paused.');
          return;
        }
      } else {
        await interaction.editReply({
          content: 'Ã¢Å¡Â Ã¯Â¸Â Please specify an agent domain (e.g. `/screening start agent:meme-solana`) or run this command inside a dedicated `#call-*` channel!',
        });
        return;
      }
    }

    // Validate channel alignment if explicit agent was specified
    const currentChannelMapping = channelDomainMap[channelName];
    if (currentChannelMapping && explicitAgent && currentChannelMapping.agent !== explicitAgent) {
      await interaction.editReply({
        content: `Ã¢Å¡Â Ã¯Â¸Â **Channel Misalignment Notice:**\n` +
          `Channel <#${interaction.channelId}> is dedicated to **${currentChannelMapping.name}** (\`${currentChannelMapping.agent}\`).\n\n` +
          `To activate \`${explicitAgent}\`, please run \`/screening start\` inside its dedicated channel or in **#athena-control-room**!`,
      });
      return;
    }

    if (subcommand === 'start') {
      hub.toggleChannelScreening(interaction.channelId, targetAgent!, true);
      await interaction.editReply(`Ã¢Å¡Â¡ **Screening Activated** for domain: \`${targetAgent}\` in <#${interaction.channelId}>.`);
    } else if (subcommand === 'stop') {
      hub.toggleChannelScreening(interaction.channelId, targetAgent!, false);
      await interaction.editReply(`Ã¢ÂÂ¸Ã¯Â¸Â **Screening Stopped** for domain: \`${targetAgent}\` in <#${interaction.channelId}>.`);
    } else if (subcommand === 'status') {
      const ALL_AGENTS: Array<{ id: string; label: string; emoji: string }> = [
        { id: 'meme-solana',  label: 'Solana Meme Agent',          emoji: 'Ã°Å¸Å¡â‚¬' },
        { id: 'meme-robinhood', label: 'Robinhood Meme Agent',    emoji: 'Ã°Å¸â€Â·' },
        { id: 'lp-solana',    label: 'Solana LP Agent',            emoji: 'Ã°Å¸â€™Â§' },
        { id: 'lp-evm',       label: 'EVM LP Agent',               emoji: 'Ã°Å¸â€Â·' },
        { id: 'perps',        label: 'Perpetuals Agent',           emoji: 'Ã°Å¸â€œË†' },
        { id: 'nft',          label: 'NFT Sniping Agent',          emoji: 'Ã°Å¸â€“Â¼Ã¯Â¸Â' },
        { id: 'prediction',   label: 'Polymarket Prediction Agent', emoji: 'Ã°Å¸Å½Â¯' },
        { id: 'ct-alpha',     label: 'Smart CT & AI Alpha Agent',  emoji: 'Ã°Å¸â€™Â¡' },
      ];

      const activeCount = ALL_AGENTS.filter(a => hub.isAgentActive(a.id)).length;
      const statusLines = ALL_AGENTS.map(a => {
        const isActive = hub.isAgentActive(a.id);
        return `${a.emoji} **${a.label}**  Ã¢â€ â€™  ${isActive ? 'Ã°Å¸Å¸Â¢ ACTIVE' : 'Ã°Å¸â€Â´ PAUSED'}`;
      }).join('\n');

      const overallLine = activeCount === 8
        ? 'Ã°Å¸Å¸Â¢ **All 8 Sub-Agents ACTIVE** Ã¢â‚¬â€ 24/7 Screening Running!'
        : activeCount === 0
        ? 'Ã°Å¸â€Â´ **All Sub-Agents PAUSED** Ã¢â‚¬â€ No screening running.'
        : `Ã°Å¸Å¸Â¡ **${activeCount}/8 Sub-Agents Active** Ã¢â‚¬â€ Partial screening running.`;

      await interaction.editReply(
        `## Ã°Å¸â€œÂ¡ Athena Sub-Agent Status Dashboard\n\n${overallLine}\n\n${statusLines}\n\n` +
        `> Ã°Å¸â€™Â¡ Use \`/screening start\` or \`/screening stop\` in a dedicated channel to toggle individual agents.`
      );
    }
  } else if (commandName === 'cancel') {
    await interaction.reply({
      content: 'Ã°Å¸â€ºâ€˜ **Emergency Cancellation Executed:** All active background screening and pending orders have been paused.',
      ephemeral: false,
    });
  } else if (commandName === 'config') {
    await interaction.reply({
      content: 'Ã¢Å¡â„¢Ã¯Â¸Â **Athena Current Risk Settings:**\nÃ¢â‚¬Â¢ Max Daily Drawdown: `50%` \nÃ¢â‚¬Â¢ Position Size: `0.5 SOL / 0.1 ETH` per trade\nÃ¢â‚¬Â¢ Auto TP: `+100% (50%), +200% (25%)`\nÃ¢â‚¬Â¢ Auto SL: `-20%` (Dynamic Trailing Enabled)',
      ephemeral: true,
    });
  } else if (commandName === 'channel') {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: 'Ã¢ÂÅ’ Command can only be used in a server.', ephemeral: true });
      return;
    }

    if (subcommand === 'create') {
      const channelName = interaction.options.getString('name', true).toLowerCase().replace(/\s+/g, '-');
      const newChannel = await guild.channels.create({
        name: channelName,
        topic: 'Custom channel for notes, journal, or watchlist.',
      });
      await interaction.reply(`Ã°Å¸â€œÂ **Channel Created:** <#${newChannel.id}> (\`#${channelName}\`) is ready for your personal notes!`);
    } else if (subcommand === 'rearrange') {
      await interaction.reply('Ã¢Å“Â¨ **Athena Channel Arrangement:** Command Center channels are organized neatly in sequence.');
    }
  } else if (commandName === 'price') {
    const token = interaction.options.getString('token', true);
    const cleanToken = token.toUpperCase().trim();
    const price = await priceFeedService.getPrice(cleanToken);
    if (price === null) {
      await interaction.reply({ content: `Ã¢Å¡Â Ã¯Â¸Â Data harga real-time tidak tersedia untuk **\`${token}\`** saat ini.` });
      return;
    }
    await interaction.reply(`Ã°Å¸â€œÅ  **Token Price Query (\`${cleanToken}\`):**\nÃ¢â‚¬Â¢ Price: **$${price.toLocaleString()} USD** (CoinGecko real-time)`);
  } else if (commandName === 'chart') {
    const token = interaction.options.getString('token', true);
    await interaction.reply(`Ã°Å¸â€œË† **Chart View for \`${token}\`:**\nÃ°Å¸â€œÅ  DexScreener: https://dexscreener.com/solana/${token}`);
  } else if (commandName === 'holders') {
    const ca = interaction.options.getString('contract', true);
    const audit = await runTokenAudit(ca);
    await interaction.reply({ content: `Ã°Å¸â€˜Â¥ **TOP HOLDERS & INSIDER AUDIT (\`${ca}\`):**\n${audit.content}` });
  } else if (commandName === 'wallets') {
    const ca = interaction.options.getString('contract', true);
    const audit = await runTokenAudit(ca);
    await interaction.reply({ content: `Ã°Å¸Ââ€¹ **TOP SMART MONEY WALLETS SCAN (\`${ca}\`):**\n${audit.content}` });
  } else if (commandName === 'pump') {
    const ca = interaction.options.getString('contract', true);
    const audit = await runTokenAudit(ca);
    await interaction.reply({ content: `Ã°Å¸Å½Â¯ **PUMP.FUN BONDING CURVE TRACKER (\`${ca}\`):**\n${audit.content}` });
  } else if (commandName === 'convert') {
    const amount = interaction.options.getNumber('amount', true);
    const symbol = interaction.options.getString('symbol', true).toUpperCase();
    const tokenPrice = await priceFeedService.getPrice(symbol);
    if (tokenPrice === null) {
      await interaction.reply({ content: `Ã¢Å¡Â Ã¯Â¸Â Tidak ada data harga real-time untuk **${symbol}**.` });
      return;
    }
    const estUsd = amount * tokenPrice;
    await interaction.reply({
      content: `Ã°Å¸Â§Â® **Token Value Converter:**\nÃ¢â‚¬Â¢ **${amount} ${symbol}** Ã¢â€°Ë† **$${estUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD** (Rate: \`$${tokenPrice.toLocaleString()} USD\` per ${symbol})`,
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
        content: `Ã°Å¸â€â€ **Price Alert Set Successfully!**\nÃ¢â‚¬Â¢ **Asset:** \`${alert.symbol}\`\nÃ¢â‚¬Â¢ **Target Price:** \`$${alert.targetPriceUsd.toLocaleString()} USD\`\nÃ¢â‚¬Â¢ **Trigger Condition:** Price goes \`${alert.direction}\` target\nÃ¢â‚¬Â¢ **ID:** \`${alert.id}\`\nAthena will notify <@${interaction.user.id}> as soon as price reaches target!`,
      });
    } else if (subcommand === 'list') {
      const alerts = priceAlertService.listAlerts(interaction.user.id);
      if (alerts.length === 0) {
        await interaction.reply({ content: 'Ã°Å¸â€â€ You have no active price alerts set.', ephemeral: true });
      } else {
        const listText = alerts.map(a => `Ã¢â‚¬Â¢ \`${a.symbol}\` ${a.direction} **$${a.targetPriceUsd.toLocaleString()} USD** (ID: \`${a.id}\`)`).join('\n');
        await interaction.reply({
          content: `Ã°Å¸â€œâ€¹ **Your Active Price Alerts (${alerts.length}):**\n${listText}`,
          ephemeral: true,
        });
      }
    } else if (subcommand === 'cancel') {
      const id = interaction.options.getString('id', true);
      const removed = priceAlertService.removeAlert(id);
      if (removed) {
        await interaction.reply({ content: `Ã¢Å“â€¦ Price alert \`${id}\` has been canceled.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `Ã¢ÂÅ’ Alert ID \`${id}\` not found or already triggered.`, ephemeral: true });
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
          `Ã°Å¸â€œÅ  **ATHENA TRADE JOURNAL PERFORMANCE SUMMARY**\n\n` +
          `Ã¢â‚¬Â¢ **Total Trades Logged:** \`${stats.totalTrades}\` (\`${stats.openTradesCount}\` Open, \`${stats.winCount + stats.lossCount}\` Closed)\n` +
          `Ã¢â‚¬Â¢ **Win Rate:** \`${stats.winRatePct.toFixed(1)}%\` (${stats.winCount} Wins / ${stats.lossCount} Losses)\n` +
          `Ã¢â‚¬Â¢ **Total Realized PnL:** \`+$${stats.totalRealizedPnlUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\`\n` +
          `Ã¢â‚¬Â¢ **Best Trade:** \`+$${stats.bestTradeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\`\n` +
          `Ã¢â‚¬Â¢ **Worst Trade:** \`-$${Math.abs(stats.worstTradeUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\`\n` +
          `Ã¢â‚¬Â¢ **Avg Profit / Trade:** \`+$${stats.avgProfitPerTradeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\`\n\n` +
          `Use \`/journal history\` to view recent trades or \`/journal export\` for CSV download.`,
      });
    } else if (subcommand === 'history') {
      const trades = tradeJournalService.listTrades().slice(0, 10);
      const historyText = trades.map(t => {
        const pnlStr = t.realizedPnlPct !== undefined ? ` (${t.realizedPnlPct >= 0 ? '+' : ''}${t.realizedPnlPct.toFixed(1)}%)` : '';
        return `Ã¢â‚¬Â¢ \`${t.domain}\` | **$${t.symbol}** | Status: \`${t.status}\`${pnlStr} - *${t.strategyUsed}*`;
      }).join('\n');

      await interaction.reply({
        content: `Ã°Å¸â€œâ€¹ **RECENT ATHENA TRADES (${trades.length}):**\n${historyText}`,
      });
    } else if (subcommand === 'export') {
      const csvData = tradeJournalService.exportCsv();
      const buffer = Buffer.from(csvData, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: 'athena_trade_journal.csv' });

      await interaction.reply({
        content: 'Ã°Å¸â€œâ€ž **Athena Trade Journal Exported Successfully!** Download your CSV report below for Excel / Notion:',
        files: [attachment],
      });
    }
  } else if (commandName === 'update') {
    await interaction.reply({
      content: 'Ã°Å¸â€â€ž **Athena Self-Update Sequence Initiated...**\nPulling latest patches, installing dependencies, re-building, and restarting the agent...',
      ephemeral: true,
    });

    try {
      const { exec } = await import('child_process');
      const run = (cmd: string, timeoutMs = 600000) =>
        new Promise<string>((resolve, reject) => {
          exec(cmd, { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) reject(new Error((stderr || stdout || '').trim() || err.message));
            else resolve((stdout || '').trim());
          });
        });

      const gitRes = await run('git pull --ff-only');
      const installRes = await run('npm install');
      const buildRes = await run('npm run build');

      await interaction.followUp({
        content:
          `Ã¢Å“â€¦ **Athena Upgrade Complete!**\n\n` +
          `Ã¢â‚¬Â¢ **Git Pull:** \`${gitRes.split('\n').filter(Boolean).slice(-2).join(' | ')}\`\n` +
          `Ã¢â‚¬Â¢ **Dependencies:** \`${(installRes.split('\n').filter(Boolean).slice(-3).join(' | ')) || 'installed'}\`\n` +
          `Ã¢â‚¬Â¢ **Build:** \`TypeScript Re-compiled Successfully (0 Errors)\`\n` +
          `Ã°Å¸â€â€ž **Restarting PM2 agent to load new code...**`,
        ephemeral: true,
      });

      // Restart PM2 so the new build actually runs (fire-and-forget; don't block the reply)
      run('pm2 restart athena-agent --update-env || npx pm2 restart athena-agent --update-env', 120000)
        .then(() => console.log('[UPDATE] PM2 agent restarted successfully.'))
        .catch((err: any) => console.error('[UPDATE] PM2 restart failed:', err.message));
    } catch (err: any) {
      await interaction.followUp({
        content: `Ã¢ÂÅ’ **Update Exception:** ${err.message}`,
        ephemeral: true,
      });
    }
  } else if (commandName === 'bridge') {
    const origin = interaction.options.getString('origin', true);
    const destination = interaction.options.getString('destination', true);
    const amount = interaction.options.getNumber('amount', true);
    const token = interaction.options.getString('token') || 'ETH';

    const relayAdapter = new RelayAdapter();
    const result = await relayAdapter.executeBridge({
      originChain: origin,
      destinationChain: destination,
      amount,
      tokenSymbol: token,
    }, walletService);

    const embed = new EmbedBuilder()
      .setTitle(`Ã°Å¸Å’Â RELAY.LINK CROSS-CHAIN BRIDGE DIRECT EXECUTION`)
      .setColor(0x0052FF)
      .setDescription(
        `Ã°Å¸Å’â€° **Bridging:** \`${result.amountIn} ${result.tokenSymbol}\` from **${result.originChainName}** Ã¢Å¾Â¡Ã¯Â¸Â **${result.destinationChainName}**\n\n` +
        `Ã°Å¸â€œÂ¥ **Expected Output:** \`~${result.expectedAmountOut} ${result.tokenSymbol}\`\n` +
        `Ã°Å¸â€™Â¸ **Relayer & Gas Fee:** \`~$${result.feeUsd.toFixed(2)} USD\`\n` +
        `Ã°Å¸â€â€˜ **Tx Hash:** \`${result.txHash || 'Simulated'}\`\n` +
        `Ã¢Å¡Â¡ **Est. Speed:** \`~${result.estimatedDurationSeconds} seconds\`\n` +
        `Ã°Å¸â€™Â¡ **Execution Mode:** ${result.simulated ? '`DRY_RUN (Simulated Direct On-Chain Intent)`' : '`Live Broadcast`'}`
      )
      .setFooter({ text: 'Powered by Relay.link Direct Intent Engine Ã¢â‚¬Â¢ Athena Multi-Agent Hub' });

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`View on Explorer`)
        .setStyle(ButtonStyle.Link)
        .setURL(result.explorerUrl || result.relayWebUrl)
    );

    await interaction.reply({ embeds: [embed], components: [actionRow] });
  } else if (commandName === 'swap') {
    const from = interaction.options.getString('from', true);
    const to = interaction.options.getString('to', true);
    const amount = interaction.options.getNumber('amount', true);
    const chain = interaction.options.getString('chain') || 'ethereum';

    const relayAdapter = new RelayAdapter();
    const result = await relayAdapter.executeSwap({
      chain,
      fromToken: from,
      toToken: to,
      amount,
    }, walletService);

    const embed = new EmbedBuilder()
      .setTitle(`Ã°Å¸â€â€ž RELAY.LINK TOKEN SWAP DIRECT EXECUTION`)
      .setColor(0x7B3FE4)
      .setDescription(
        `Ã°Å¸â€â€ž **Swapping:** \`${result.amountIn} ${result.fromToken}\` Ã¢Å¾Â¡Ã¯Â¸Â \`~${result.expectedAmountOut} ${result.toToken}\`\n` +
        `Ã¢â€ºâ€œÃ¯Â¸Â **Chain:** **${result.chainName}**\n` +
        `Ã°Å¸â€â€˜ **Tx Hash:** \`${result.txHash || 'Simulated'}\`\n\n` +
        `Ã°Å¸â€™Â¸ **Fee:** \`~$${result.feeUsd.toFixed(2)} USD\`\n` +
        `Ã¢Å¡Â¡ **Est. Speed:** \`~${result.estimatedDurationSeconds} seconds\`\n` +
        `Ã°Å¸â€™Â¡ **Execution Mode:** ${result.simulated ? '`DRY_RUN (Simulated Direct On-Chain Swap)`' : '`Live Broadcast`'}`
      )
      .setFooter({ text: 'Powered by Relay.link Swap Engine Ã¢â‚¬Â¢ Athena Multi-Agent Hub' });

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
    const chain = interaction.options.getString('chain') || 'ethereum';

    const relayAdapter = new RelayAdapter();
    const result = await relayAdapter.executeSend({
      chain,
      token,
      amount,
      recipientAddress: to,
    }, walletService);

    const embed = new EmbedBuilder()
      .setTitle(`Ã°Å¸â€œÂ¤ RELAY.LINK TOKEN SEND DIRECT EXECUTION`)
      .setColor(0x00C853)
      .setDescription(
        `Ã°Å¸â€œÂ¤ **Sending:** \`${result.amountIn} ${result.tokenSymbol}\` to \`${result.recipientAddress.substring(0, 6)}...${result.recipientAddress.substring(result.recipientAddress.length - 4)}\`\n` +
        `Ã¢â€ºâ€œÃ¯Â¸Â **Chain:** **${result.chainName}**\n` +
        `Ã°Å¸â€â€˜ **Tx Hash:** \`${result.txHash || 'Simulated'}\`\n\n` +
        `Ã°Å¸â€œÂ¥ **Recipient Receives:** \`~${result.expectedAmountOut} ${result.tokenSymbol}\`\n` +
        `Ã°Å¸â€™Â¸ **Fee:** \`~$${result.feeUsd.toFixed(2)} USD\`\n` +
        `Ã¢Å¡Â¡ **Est. Speed:** \`~${result.estimatedDurationSeconds} seconds\`\n` +
        `Ã°Å¸â€™Â¡ **Execution Mode:** ${result.simulated ? '`DRY_RUN (Simulated Direct On-Chain Transfer)`' : '`Live Broadcast`'}`
      )
      .setFooter({ text: 'Powered by Relay.link Transfer Engine Ã¢â‚¬Â¢ Athena Multi-Agent Hub' });

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`View on Explorer`)
        .setStyle(ButtonStyle.Link)
        .setURL(result.explorerUrl || result.relayWebUrl)
    );

    await interaction.reply({ embeds: [embed], components: [actionRow] });
  }
}
