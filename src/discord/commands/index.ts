import { SlashCommandBuilder } from 'discord.js';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('Manage Athena burner wallets & view balances')
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Safely setup/import burner wallet Private Key via secure modal popup')
    )
    .addSubcommand(sub =>
      sub.setName('balance')
        .setDescription('View current native SOL, ETH, and token balances')
    ),

  new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('Execute on-demand 3-layer audit for a token Contract Address (CA)')
    .addStringOption(opt =>
      opt.setName('contract')
        .setDescription('Solana or EVM token Contract Address (CA)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('screening')
    .setDescription('Control 24/7 background screening agents')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Activate screening agent')
        .addStringOption(opt =>
          opt.setName('agent')
            .setDescription('Domain agent to activate')
            .setRequired(true)
            .addChoices(
              { name: 'Solana Meme Agent', value: 'meme-solana' },
              { name: 'EVM Meme Agent', value: 'meme-evm' },
              { name: 'Solana LP Agent', value: 'lp-solana' },
              { name: 'EVM LP Agent (Robinhood)', value: 'lp-evm' },
              { name: 'Perpetuals Agent', value: 'perps' },
              { name: 'NFT Sniping Agent', value: 'nft' },
              { name: 'Polymarket Prediction Agent', value: 'prediction' },
              { name: 'Smart CT & AI Alpha Agent', value: 'ct-alpha' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Deactivate screening agent')
        .addStringOption(opt =>
          opt.setName('agent')
            .setDescription('Domain agent to deactivate')
            .setRequired(true)
            .addChoices(
              { name: 'Solana Meme Agent', value: 'meme-solana' },
              { name: 'EVM Meme Agent', value: 'meme-evm' },
              { name: 'Solana LP Agent', value: 'lp-solana' },
              { name: 'EVM LP Agent (Robinhood)', value: 'lp-evm' },
              { name: 'Perpetuals Agent', value: 'perps' },
              { name: 'NFT Sniping Agent', value: 'nft' },
              { name: 'Polymarket Prediction Agent', value: 'prediction' },
              { name: 'Smart CT & AI Alpha Agent', value: 'ct-alpha' }
            )
        )
    ),

  new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Emergency cancel pending orders or halt active screening')
    .addSubcommand(sub =>
      sub.setName('all')
        .setDescription('Emergency stop all active screening and pending orders')
    ),

  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Update dynamic risk limits, AI providers, or screening thresholds')
    .addSubcommand(sub =>
      sub.setName('risk')
        .setDescription('View & update drawdown limits and position sizes')
    ),

  new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Create or rearrange Discord channels')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a custom channel (e.g. for personal notes, watchlist, journal)')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Name of the new channel')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('rearrange')
        .setDescription('Organize and re-order Athena Command Center channels neatly')
    ),

  // Quick Utility Slash Commands
  new SlashCommandBuilder()
    .setName('price')
    .setDescription('Quick token price, 24h change & market cap lookup')
    .addStringOption(opt => opt.setName('token').setDescription('Symbol or Contract Address').setRequired(true)),

  new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Quick chart & DexScreener visual link')
    .addStringOption(opt => opt.setName('token').setDescription('Symbol or Contract Address').setRequired(true)),

  new SlashCommandBuilder()
    .setName('holders')
    .setDescription('Top Holders audit & insider ownership breakdown')
    .addStringOption(opt => opt.setName('contract').setDescription('Token Contract Address').setRequired(true)),

  new SlashCommandBuilder()
    .setName('wallets')
    .setDescription('Top Wallets & Smart Money activity scan')
    .addStringOption(opt => opt.setName('contract').setDescription('Token Contract Address').setRequired(true)),

  new SlashCommandBuilder()
    .setName('pump')
    .setDescription('Pump.fun Bonding Curve progress & Raydium graduation tracker')
    .addStringOption(opt => opt.setName('contract').setDescription('Pump.fun Token Contract Address').setRequired(true)),

  new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Quick token value & SOL/USD converter')
    .addNumberOption(opt => opt.setName('amount').setDescription('Token Amount').setRequired(true))
    .addStringOption(opt => opt.setName('symbol').setDescription('Token Symbol (e.g., SOL, ETH, BONK)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Manage real-time price alerts & notifications')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set a custom price alert for an asset')
        .addStringOption(opt => opt.setName('symbol').setDescription('Token Symbol (e.g., BTC, ETH, SOL)').setRequired(true))
        .addNumberOption(opt => opt.setName('price').setDescription('Target USD Price').setRequired(true))
        .addStringOption(opt =>
          opt.setName('direction')
            .setDescription('Trigger when price goes ABOVE or BELOW target')
            .setRequired(true)
            .addChoices(
              { name: 'ABOVE', value: 'ABOVE' },
              { name: 'BELOW', value: 'BELOW' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all your active price alerts')
    )
    .addSubcommand(sub =>
      sub.setName('cancel')
        .setDescription('Cancel an active price alert by ID')
        .addStringOption(opt => opt.setName('id').setDescription('Alert ID to cancel').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Open the Interactive Athena Control Center Dashboard'),

  new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Open the Interactive Athena Control Center Dashboard'),

  new SlashCommandBuilder()
    .setName('journal')
    .setDescription('View trade journaling analytics & PnL history')
    .addSubcommand(sub =>
      sub.setName('summary')
        .setDescription('View PnL summary, win-rate %, best/worst trades, & performance stats')
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('List recent 10 trades with entry/exit details')
    )
    .addSubcommand(sub =>
      sub.setName('export')
        .setDescription('Export trade journal history as CSV file for Excel / Notion')
    ),

  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Pull latest Athena codebase from Git, re-build TypeScript, and soft-restart'),
];
