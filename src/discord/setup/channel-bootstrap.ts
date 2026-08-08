import { Guild, ChannelType, PermissionFlagsBits } from 'discord.js';

export interface ChannelSetupResult {
  controlRoomId: string;
  auditOnDemandId: string;
  memeSolanaId: string;
  memeEvmId: string;
  perpsId: string;
  nftId: string;
  lpSolanaId: string;
  lpEvmId: string;
  predictionId: string;
  ctAlphaId: string;
}

export async function bootstrapDiscordChannels(guild: Guild): Promise<ChannelSetupResult> {
  console.log(`[DISCORD BOOTSTRAP] Checking & auto-creating Athena channels in guild: "${guild.name}"...`);

  // 1. Check or Create Category "🏛️ ATHENA COMMAND CENTER"
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('athena command center')
  );

  if (!category) {
    category = await guild.channels.create({
      name: '🏛️ ATHENA COMMAND CENTER',
      type: ChannelType.GuildCategory,
    });
    console.log('[DISCORD BOOTSTRAP] Created Category: "🏛️ ATHENA COMMAND CENTER"');
  }

  // Helper to get or create channel under category
  const getOrCreateChannel = async (name: string, topic: string) => {
    let channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name === name
    );

    if (!channel) {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic,
      });
      console.log(`[DISCORD BOOTSTRAP] Auto-created Channel: #${name}`);
    }
    return channel.id;
  };

  const controlRoomId = await getOrCreateChannel(
    'athena-control-room',
    '⚙️ Athena Core Command Hub - Chat with AI, wallet management, & risk configuration.'
  );

  const auditOnDemandId = await getOrCreateChannel(
    'audit-on-demand',
    '🔎 On-Demand Token Audit Channel - Paste any Solana or EVM Contract Address (CA) here for instant 12-point audit!'
  );

  const memeSolanaId = await getOrCreateChannel(
    'call-meme-solana',
    '🚀 High-Confidence Solana DEX Signal Calls (Pump.fun, Raydium, Meteora)'
  );

  const memeEvmId = await getOrCreateChannel(
    'call-meme-robinhood',
    '🔷 High-Confidence Robinhood Chain Meme Signal Calls (Robinhood Chain L2 DEX)'
  );

  const perpsId = await getOrCreateChannel(
    'call-whale-tracking',
    '🐋 Smart Trader & Whale Positioning Tracking (Hyperliquid: BTC, GOLD, XYZ100)'
  );

  const nftId = await getOrCreateChannel(
    'call-nft-sniping',
    '🖼️ NFT Floor Price & Rarity Sniping Alerts (MagicEden, OpenSea)'
  );

  const lpSolanaId = await getOrCreateChannel(
    'call-lp-solana',
    '💧 High-Yield Solana Concentrated Liquidity Calls (Meteora DLMM, Orca)'
  );

  const lpEvmId = await getOrCreateChannel(
    'call-lp-robinhood',
    '🔷 High-Yield EVM Concentrated Liquidity Calls (Robinhood Chain Concentrated Pools)'
  );

  const predictionId = await getOrCreateChannel(
    'call-prediction-markets',
    '🎯 Polymarket Prediction Market Arbitrage, Odds Mispricing, & Whale Bet Signals'
  );

  const ctAlphaId = await getOrCreateChannel(
    'call-ct-alpha',
    '💡 Smart Crypto Twitter (CT) & AI Alpha - Airdrop threads, AI Agent launches, & Smart Money Calls'
  );

  console.log('[DISCORD BOOTSTRAP] All Athena channels are ready!');

  return {
    controlRoomId,
    auditOnDemandId,
    memeSolanaId,
    memeEvmId,
    perpsId,
    nftId,
    lpSolanaId,
    lpEvmId,
    predictionId,
    ctAlphaId,
  };
}
