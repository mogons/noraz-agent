import { SlashCommandBuilder } from 'discord.js';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('Manage OpenCat burner wallets & view balances')
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Safely setup/import burner wallet Private Key via secure modal popup')
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('View list of registered wallet addresses & active status')
    )
    .addSubcommand(sub =>
      sub.setName('replace')
        .setDescription('Replace an existing registered burner wallet Private Key')
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove/delete a registered burner wallet Private Key from memory')
        .addStringOption(opt =>
          opt.setName('chain')
            .setDescription('Wallet type to remove (evm / robinhood)')
            .setRequired(true)
            .addChoices(
              { name: 'Robinhood Chain (EVM) Wallet', value: 'evm' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('balance')
        .setDescription('View current Robinhood Chain (ETH) and token balances')
    )
    .addSubcommand(sub =>
      sub.setName('withdraw')
        .setDescription('Withdraw native funds (ETH) from Robinhood burner wallet to destination address')
        .addStringOption(opt =>
          opt.setName('to')
            .setDescription('Destination recipient wallet address (0x...)')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt.setName('amount')
            .setDescription('Amount of native token (ETH) to withdraw')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('chain')
            .setDescription('Network chain (default: robinhood)')
            .setRequired(false)
            .addChoices(
              { name: 'Robinhood Chain (ETH)', value: 'robinhood' }
            )
        )
    ),

  new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('Execute on-demand 3-layer audit for a token Contract Address (CA)')
    .addStringOption(opt =>
      opt.setName('contract')
        .setDescription('Robinhood Chain (EVM) token Contract Address (CA)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('screening')
    .setDescription('Control 24/7 background screening agents')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Activate screening agent (auto-detects agent domain from channel if omitted)')
        .addStringOption(opt =>
          opt.setName('agent')
            .setDescription('Domain agent to activate (optional - auto-detected in channel)')
            .setRequired(false)
            .addChoices(
              { name: 'Robinhood Meme Agent', value: 'meme-robinhood' },
              { name: 'EVM LP Agent (Robinhood Chain)', value: 'lp-robinhood' },
              { name: 'NFT Sniping Agent', value: 'nft' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Deactivate screening agent (auto-detects agent domain from channel if omitted)')
        .addStringOption(opt =>
          opt.setName('agent')
            .setDescription('Domain agent to deactivate (optional - auto-detected in channel)')
            .setRequired(false)
            .addChoices(
              { name: 'Robinhood Meme Agent', value: 'meme-robinhood' },
              { name: 'EVM LP Agent (Robinhood Chain)', value: 'lp-robinhood' },
              { name: 'NFT Sniping Agent', value: 'nft' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('View real-time status of all 3 sub-agents (active / paused)')
    )
    .addSubcommand(sub =>
      sub.setName('trigger')
        .setDescription('Run an immediate on-demand screening pass for an agent')
        .addStringOption(opt =>
          opt.setName('agent')
            .setDescription('Domain agent to trigger (e.g. meme-robinhood, lp-robinhood, nft)')
            .setRequired(true)
            .addChoices(
              { name: 'Robinhood Meme Agent', value: 'meme-robinhood' },
              { name: 'EVM LP Agent (Robinhood Chain)', value: 'lp-robinhood' },
              { name: 'NFT Sniping Agent', value: 'nft' }
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
    .setDescription('Inspect runtime configuration, risk limits, or screening thresholds')
    .addSubcommand(sub =>
      sub.setName('risk')
        .setDescription('View live risk limits (drawdown, position size) and risk state')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('View runtime config: mode (dry-run/auto-execute), API keys set, AI model, active agents')
    ),

  new SlashCommandBuilder()
    .setName('health')
    .setDescription('System health check: per-agent heartbeat (HEALTHY / DEGRADED / UNRESPONSIVE)'),

  new SlashCommandBuilder()
    .setName('strategy')
    .setDescription('Manage screening strategy modules (list / view / activate / rollback)')
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List available strategy modules and their active flag')
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View a strategy module source code')
        .addStringOption(opt => opt.setName('name').setDescription('Strategy file name without extension (e.g. nft-default)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('activate')
        .setDescription('Activate a strategy for a screening domain')
        .addStringOption(opt => opt.setName('strategy').setDescription('Strategy id').setRequired(true))
        .addStringOption(opt =>
          opt.setName('domain')
            .setDescription('Screening domain (e.g. meme-robinhood, lp-robinhood, nft)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('rollback')
        .setDescription('Restore the previous backup of a strategy module')
        .addStringOption(opt => opt.setName('name').setDescription('Strategy file name without extension').setRequired(true))
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
        .setDescription('Organize and re-order OpenCat Command Center channels neatly')
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
    .setDescription('Robinhood Chain token momentum, holder & liquidity tracker')
    .addStringOption(opt => opt.setName('contract').setDescription('Robinhood Chain Token Contract Address').setRequired(true)),

  new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Quick token value & USD converter')
    .addNumberOption(opt => opt.setName('amount').setDescription('Token Amount').setRequired(true))
    .addStringOption(opt => opt.setName('symbol').setDescription('Token Symbol (e.g., ETH, USDC)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Manage real-time price alerts & notifications')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set a custom price alert for an asset')
        .addStringOption(opt => opt.setName('symbol').setDescription('Token Symbol (e.g., BTC, ETH, USDC)').setRequired(true))
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
    .setDescription('Open the Interactive OpenCat Control Center Dashboard'),

  new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Open the Interactive OpenCat Control Center Dashboard'),

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
    .setDescription('Pull latest OpenCat codebase from Git, re-build TypeScript, and soft-restart'),



  new SlashCommandBuilder()
    .setName('swap')
    .setDescription('Swap tokens instantly via Relay.link (same-chain or cross-chain)')
    .addStringOption(opt => opt.setName('from').setDescription('Token to swap from (e.g. ETH, USDC, or contract address)').setRequired(true))
    .addStringOption(opt => opt.setName('to').setDescription('Token to swap to (e.g. USDC, ETH, or contract address)').setRequired(true))
    .addNumberOption(opt => opt.setName('amount').setDescription('Amount to swap').setRequired(true))
    .addStringOption(opt => opt.setName('chain').setDescription('Chain to swap on (default: robinhood)')),

  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send/transfer tokens to another wallet via Relay.link')
    .addStringOption(opt => opt.setName('to').setDescription('Recipient wallet address (0x...)').setRequired(true))
    .addNumberOption(opt => opt.setName('amount').setDescription('Amount to send').setRequired(true))
    .addStringOption(opt => opt.setName('token').setDescription('Token symbol (default: ETH)'))
    .addStringOption(opt => opt.setName('chain').setDescription('Chain to send on (default: robinhood)')),
];
