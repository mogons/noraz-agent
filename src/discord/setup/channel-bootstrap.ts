import { Guild, ChannelType } from 'discord.js';

export interface ChannelSetupResult {
  controlRoomId: string;
  auditOnDemandId: string;
  memeEvmId: string;
  lpEvmId: string;
  nftId: string;
  alphaEvmId: string;
}

export async function bootstrapDiscordChannels(guild: Guild): Promise<ChannelSetupResult> {
  console.log(`[DISCORD BOOTSTRAP] Checking & auto-creating OpenCat channels in guild: "${guild.name}"...`);

  // 1. Check or Create Category "🐾 OPENCAT COMMAND CENTER"
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('opencat command center') || c.name.toLowerCase().includes('athena command center'))
  );

  if (!category) {
    category = await guild.channels.create({
      name: '🐾 OPENCAT COMMAND CENTER',
      type: ChannelType.GuildCategory,
    });
    console.log('[DISCORD BOOTSTRAP] Created Category: "🐾 OPENCAT COMMAND CENTER"');
  }

  // Helper to get or create channel under category
  const getOrCreateChannel = async (name: string, topic: string, altNames: string[] = []) => {
    let channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && (c.name === name || altNames.includes(c.name))
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
    'opencat-control-room',
    '🐾 OpenCat Core Command Hub - Chat with AI, wallet management, & risk configuration.',
    ['athena-control-room']
  );

  const auditOnDemandId = await getOrCreateChannel(
    'audit-on-demand',
    '🔎 On-Demand Token Audit Channel - Paste any Robinhood Chain / EVM Contract Address (CA) here for instant 12-point audit!'
  );

  const memeEvmId = await getOrCreateChannel(
    'call-meme-robinhood',
    '🌸 High-Confidence Robinhood Chain Meme Signal Calls (Robinhood Chain L2 DEX)'
  );

  const lpEvmId = await getOrCreateChannel(
    'call-lp-robinhood',
    '🌊 High-Yield Robinhood Chain Concentrated Liquidity Calls (Uniswap V3 / Aerodrome)'
  );

  const nftId = await getOrCreateChannel(
    'call-nft-robinhood',
    '🔮 NFT Floor Price & Rarity Sniping Alerts (OpenCats 24x24 & OpenSea EVM)'
  );

  const alphaEvmId = await getOrCreateChannel(
    'call-alpha-robinhood',
    '☀️ 1-Hour Robinhood Chain Alpha Scraper & X (Twitter) Social Sentiment Calls'
  );

  console.log('[DISCORD BOOTSTRAP] All Robinhood Chain OpenCat channels are ready!');

  return {
    controlRoomId,
    auditOnDemandId,
    memeEvmId,
    lpEvmId,
    nftId,
    alphaEvmId,
  };
}
