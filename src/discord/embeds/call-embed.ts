import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export interface CallSignalPayload {
  domain: 'MEME_SOLANA' | 'MEME_EVM' | 'PERPS' | 'NFT' | 'LP_METEORA' | 'LP_UNISWAP' | 'PREDICTION' | 'CT_ALPHA';
  title: string;
  symbol: string;
  contractAddress?: string;
  network: string;
  tokenAge?: string;
  priceUsd?: string;
  marketCap?: string;
  liquidity?: string;
  volume5m?: string;
  volume1h?: string;
  txRatio?: string;
  feeApr?: string;
  lpStrategy?: string;
  top10Pct?: string;
  devHoldingPct?: string;
  sniperPct?: string;
  bundlerPct?: string;
  dexPaidStatus?: string;
  smartMoneyInfo?: string;
  confidenceScore?: number;
  securityScore?: string;
  aiThesis: string;
  dexScreenerUrl?: string;
  gmgnUrl?: string;
  rugcheckUrl?: string;
}

export function buildCallEmbed(payload: CallSignalPayload) {
  const colorMap: Record<CallSignalPayload['domain'], number> = {
    MEME_SOLANA: 0x14f195, // Solana Teal
    MEME_EVM: 0x3c3c3d,    // EVM Dark Grey
    PERPS: 0xf39c12,       // Gold / Amber
    NFT: 0x9b59b6,         // Purple
    LP_METEORA: 0x2ecc71,  // Bright Emerald Green
    LP_UNISWAP: 0x3498db,  // Royal Blue
    PREDICTION: 0x00ffaa,  // Cyan / Prediction
    CT_ALPHA: 0x1da1f2,    // Twitter / X Blue
  };

  const confidenceStr = payload.confidenceScore ? `${payload.confidenceScore}% CONFIDENCE` : 'HIGH CONFIDENCE';

  const embed = new EmbedBuilder()
    .setColor(colorMap[payload.domain] || 0x0099ff)
    .setTimestamp()
    .setFooter({ text: 'Athena Intelligence System • DRY_RUN MODE ACTIVE' });

  const buttonsRow = new ActionRowBuilder<ButtonBuilder>();

  // ==========================================
  // DOMAIN 1: CT ALPHA (X / TWITTER)
  // ==========================================
  if (payload.domain === 'CT_ALPHA') {
    embed.setTitle(`🔥 SMART CT ALPHA: ${payload.title}`);
    
    if (payload.contractAddress && payload.contractAddress !== 'N/A') {
      embed.addFields({ name: '📍 Contract Mentioned', value: `\`${payload.contractAddress}\``, inline: false });
    }

    embed.addFields(
      { name: '🐦 Source & Network', value: payload.network || 'X (Twitter)', inline: true },
      { name: '🧠 AI Sentiment Score', value: `${confidenceStr}`, inline: true },
      { name: '💡 Actionable Takeaway', value: payload.aiThesis, inline: false }
    );

    const tweetUrl = payload.dexScreenerUrl || 'https://x.com';
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setLabel('🐦 View Tweet on X')
        .setURL(tweetUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setCustomId('start_channel_ct-alpha')
        .setLabel('⚡ Start CT Alpha')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('pause_channel_ct-alpha')
        .setLabel('⏸️ Pause CT Alpha')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [buttonsRow] };
  }

  // ==========================================
  // DOMAIN 2: PERPETUAL FUTURES (HYPERLIQUID)
  // ==========================================
  if (payload.domain === 'PERPS') {
    embed.setTitle(`📈 ATHENA PERPETUAL SETUP: ${payload.title} • [${confidenceStr}]`);
    
    embed.addFields(
      { name: '📍 Asset & Exchange', value: `**$${payload.symbol}** (${payload.network})`, inline: true },
      { name: '💵 Entry Price', value: payload.priceUsd || 'N/A', inline: true },
      { name: '🎯 Risk / Reward Targets', value: payload.marketCap || 'N/A', inline: true },
      { name: '💡 Technical AI Thesis', value: payload.aiThesis, inline: false }
    );

    const hyperliquidUrl = payload.dexScreenerUrl || `https://app.hyperliquid.xyz/trade/${payload.symbol}`;
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setLabel('🚀 Trade on Hyperliquid')
        .setURL(hyperliquidUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setCustomId('pause_channel_perps')
        .setLabel('⏸️ Pause Perps Screening')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [buttonsRow] };
  }

  // ==========================================
  // DOMAIN 3 & 4: CONCENTRATED LIQUIDITY (LP)
  // ==========================================
  if (payload.domain === 'LP_METEORA' || payload.domain === 'LP_UNISWAP') {
    const isMeteora = payload.domain === 'LP_METEORA';
    embed.setTitle(`💧 ATHENA LP OPPORTUNITY: ${payload.title}`);

    if (payload.contractAddress) {
      embed.addFields({ name: '📍 Pool Address', value: `\`${payload.contractAddress}\``, inline: false });
    }

    embed.addFields(
      { name: 'Network', value: payload.network, inline: true },
      { name: 'Pool TVL', value: payload.marketCap || payload.liquidity || 'N/A', inline: true },
      { name: 'Est. 24h Fee APR', value: payload.feeApr || 'N/A', inline: true }
    );

    if (payload.lpStrategy) {
      embed.addFields({ name: '🎯 Recommended LP Range & Strategy', value: payload.lpStrategy, inline: false });
    }

    embed.addFields({ name: '💡 LP Yield AI Thesis', value: payload.aiThesis, inline: false });

    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`execute_lp_add_${payload.symbol}`)
        .setLabel(`💧 Add Liquidity (${isMeteora ? 'Meteora' : 'Uniswap'})`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`pause_channel_${isMeteora ? 'lp-solana' : 'lp-evm'}`)
        .setLabel('⏸️ Pause LP Screening')
        .setStyle(ButtonStyle.Secondary)
    );

    if (payload.dexScreenerUrl) {
      buttonsRow.addComponents(
        new ButtonBuilder()
          .setLabel('📊 View Pool Analytics')
          .setURL(payload.dexScreenerUrl)
          .setStyle(ButtonStyle.Link)
      );
    }

    return { embeds: [embed], components: [buttonsRow] };
  }

  // ==========================================
  // DOMAIN 5: PREDICTION MARKETS (POLYMARKET)
  // ==========================================
  if (payload.domain === 'PREDICTION') {
    embed.setTitle(`🎯 ATHENA POLYMARKET ARBITRAGE: ${payload.title}`);
    
    embed.addFields(
      { name: '🌐 Platform', value: payload.network || 'Polygon (Polymarket)', inline: true },
      { name: '🎯 Recommended Outcome', value: `**${payload.symbol}**`, inline: true },
      { name: '🟢 Swarm Confidence', value: confidenceStr, inline: true },
      { name: '💡 Polymarket AI Thesis', value: payload.aiThesis, inline: false }
    );

    const polyUrl = payload.dexScreenerUrl || 'https://polymarket.com';
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`execute_prediction_yes_${payload.symbol}`)
        .setLabel('🎯 Bet YES (50 USDC)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`execute_prediction_no_${payload.symbol}`)
        .setLabel('🛑 Bet NO (50 USDC)')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('pause_channel_prediction')
        .setLabel('⏸️ Pause Polymarket Screening')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel('📊 View Market on Polymarket')
        .setURL(polyUrl)
        .setStyle(ButtonStyle.Link)
    );

    return { embeds: [embed], components: [buttonsRow] };
  }

  // ==========================================
  // DOMAIN 6: NFT SNIPING (OPENSEA)
  // ==========================================
  if (payload.domain === 'NFT') {
    embed.setTitle(`🖼️ ATHENA NFT SNIPE ALERT: ${payload.title} • [${confidenceStr}]`);

    embed.addFields(
      { name: 'Collection', value: payload.symbol, inline: true },
      { name: 'Price & Floor', value: payload.priceUsd || 'N/A', inline: true },
      { name: 'Market Info', value: payload.marketCap || 'N/A', inline: true },
      { name: '💡 NFT Rarity & Floor AI Thesis', value: payload.aiThesis, inline: false }
    );

    const openseaUrl = payload.dexScreenerUrl || 'https://opensea.io';
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`execute_nft_buy_${payload.symbol}`)
        .setLabel('🖼️ Snipe NFT (Seaport Fulfill)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('pause_channel_nft')
        .setLabel('⏸️ Pause NFT Screening')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel('📊 View Collection on OpenSea')
        .setURL(openseaUrl)
        .setStyle(ButtonStyle.Link)
    );

    return { embeds: [embed], components: [buttonsRow] };
  }

  // ==========================================
  // DOMAIN 7 & 8: MEME DEX TOKENS (SOLANA & EVM)
  // ==========================================
  const isSolana = payload.domain === 'MEME_SOLANA';
  embed.setTitle(
    isSolana
      ? `🚀 ATHENA SOLANA MEME CALL: ${payload.title} ($${payload.symbol}) • [${confidenceStr}]`
      : `🔷 ATHENA EVM MEME CALL: ${payload.title} ($${payload.symbol}) • [${confidenceStr}]`
  );

  if (payload.contractAddress) {
    const ageStr = payload.tokenAge ? ` • ⏱️ **Age:** ${payload.tokenAge}` : '';
    embed.addFields({
      name: '📍 Contract Address (CA)',
      value: `\`${payload.contractAddress}\`${ageStr}`,
      inline: false,
    });
  }

  const priceStr = payload.priceUsd ? ` | 💵 **Price:** ${payload.priceUsd}` : '';
  const volStr = (payload.volume5m || payload.volume1h)
    ? `\n📈 **Vol (5m / 1h):** ${payload.volume5m || 'N/A'} / ${payload.volume1h || 'N/A'}`
    : '';
  const txStr = payload.txRatio ? ` | ⚖️ **Tx:** ${payload.txRatio}` : '';

  embed.addFields({
    name: '📊 Market Metrics',
    value: `💰 **MC:** ${payload.marketCap || 'N/A'}${priceStr}\n💧 **Liquidity:** ${payload.liquidity || 'N/A'}${volStr}${txStr}`,
    inline: false,
  });

  const securityParts: string[] = [];
  if (payload.top10Pct) securityParts.push(`👥 **Top 10:** ${payload.top10Pct}`);
  if (payload.devHoldingPct) securityParts.push(`👨‍💻 **Dev:** ${payload.devHoldingPct}`);
  if (payload.sniperPct) securityParts.push(`🐋 **Snipers:** ${payload.sniperPct}`);
  if (payload.bundlerPct) securityParts.push(`🤖 **Bundler:** ${payload.bundlerPct}`);
  if (payload.dexPaidStatus) securityParts.push(`💳 **DEX Paid:** ${payload.dexPaidStatus}`);

  if (securityParts.length > 0) {
    embed.addFields({
      name: '🛡️ Security & Holder Audit',
      value: securityParts.join(' | '),
      inline: false,
    });
  }

  if (payload.smartMoneyInfo) {
    embed.addFields({
      name: '🧠 Smart Money Tracking & AI Consensus',
      value: `${payload.smartMoneyInfo}\n🟢 **Swarm Consensus Score:** **${confidenceStr} (PASSED)**`,
      inline: false,
    });
  }

  if (payload.contractAddress) {
    const ca = payload.contractAddress;
    const gmgnLink = payload.gmgnUrl || `https://gmgn.ai/${isSolana ? 'sol' : 'base'}/token/${ca}`;
    const dexscreenerLink = payload.dexScreenerUrl || `https://dexscreener.com/${isSolana ? 'solana' : 'base'}/${ca}`;
    const rugcheckLink = payload.rugcheckUrl || `https://rugcheck.xyz/tokens/${ca}`;

    embed.addFields({
      name: '🔗 Independent Verification Links',
      value: `📊 [DexScreener](${dexscreenerLink}) | 📈 [GMGN Chart](${gmgnLink}) | 🛡️ [RugCheck](${rugcheckLink}) | 🐦 [X (Twitter) Search](https://x.com/search?q=%24${payload.symbol}&src=typed_query)`,
      inline: false,
    });
  }

  embed.addFields({ name: '💡 AI Thesis & Signal Reasoning', value: payload.aiThesis, inline: false });

  // Custom Buttons for Solana vs EVM
  if (isSolana) {
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`execute_buy_05_${payload.symbol}`)
        .setLabel('🛒 Buy (0.5 SOL)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`execute_buy_10_${payload.symbol}`)
        .setLabel('🛒 Buy (1.0 SOL)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('pause_channel_meme-solana')
        .setLabel('⏸️ Pause Solana Screening')
        .setStyle(ButtonStyle.Secondary)
    );
  } else {
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`execute_buy_01_${payload.symbol}`)
        .setLabel('🛒 Buy (0.1 ETH)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`execute_buy_05_${payload.symbol}`)
        .setLabel('🛒 Buy (0.5 ETH)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('pause_channel_meme-evm')
        .setLabel('⏸️ Pause EVM Screening')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  if (payload.dexScreenerUrl || payload.contractAddress) {
    const url = payload.dexScreenerUrl || `https://dexscreener.com/${isSolana ? 'solana' : 'base'}/${payload.contractAddress}`;
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setLabel('📊 Chart on DexScreener')
        .setURL(url)
        .setStyle(ButtonStyle.Link)
    );
  }

  return { embeds: [embed], components: [buttonsRow] };
}
