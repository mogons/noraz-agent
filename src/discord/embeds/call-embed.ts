import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { CallCardPayload as CallSignalPayload } from '../../agents/shared/agent-contract.js';

/**
 * Sanitize attacker-controlled token/tweet fields before rendering into Discord
 * embeds. Token names/symbols come from chain data (GMGN/DexScreener) and can
 * contain markdown link syntax, code blocks, or newlines — a crafted symbol
 * could otherwise inject a clickable phishing link or break the embed layout.
 * Removes markdown-significant characters; keeps alphanumerics and common punctuation.
 */
export function sanitizeEmbedField(value: string | undefined | null, maxLen = 200): string {
  if (!value) return '';
  const cleaned = String(value)
    .replace(/[\r\n\t]+/g, ' ')            // collapse newlines/tabs first
    .replace(/https?:\/\/\S+/gi, ' [LINK] ') // strip raw URLs (prevent link injection)
    .replace(/[\[\](){}<>*_`|~\\]/g, '')   // then remove markdown link/code/bold/italic syntax
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned;
}

/** Encode a symbol safely into a URL query component. */
export function encodeSymbolForUrl(symbol: string | undefined | null): string {
  const clean = sanitizeEmbedField(symbol, 32);
  return encodeURIComponent(clean);
}

export function buildCallEmbed(payload: CallSignalPayload) {
  // OpenCats Master Color Palette
  const colorMap: Record<CallSignalPayload['domain'], number> = {
    MEME_ROBINHOOD: 0xffb7b2,  // Pastel Pink
    NFT: 0xd6c7ff,             // Lavender Purple
    LP_ROBINHOOD: 0x80deea,    // Retro Cyan
    ALPHA_ROBINHOOD: 0xfff59d, // Pastel Yellow
    WHALE_ETH: 0x4fc3f7,       // Whale Sky Blue
  };

  const confidenceStr = payload.confidenceScore ? `${payload.confidenceScore}% CONFIDENCE` : 'HIGH CONFIDENCE';

  const embed = new EmbedBuilder()
    .setColor(colorMap[payload.domain] || 0xccff00)
    .setTimestamp()
    .setFooter({ text: '🐾 OpenCat Intelligence System • Robinhood Chain #4663' });

  const buttonsRow = new ActionRowBuilder<ButtonBuilder>();

  // ==========================================
  // DOMAIN: WHALE TRACKING (HYPERLIQUID ETH)
  // ==========================================
  if (payload.domain === 'WHALE_ETH') {
    embed.setTitle(`🐋 OPENCAT WHALE WATCH: ${sanitizeEmbedField(payload.symbol, 20)}`);

    const report = payload.whaleReport;
    const fmtM = (v: number) => (v >= 1_000_000 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1000).toFixed(0)}k`);
    const netStr = report ? `${report.netUsd >= 0 ? '🟢 +' : '🔴 '}${fmtM(Math.abs(report.netUsd))}` : 'N/A';

    if (report) {
      embed.addFields(
        { name: '⚖️ Net Positioning', value: `${netStr} (${report.longCount} long vs ${report.shortCount} short trader)`, inline: true },
        { name: '📊 Long / Short', value: `Long **${fmtM(report.totalLongUsd)}**\nShort **${fmtM(report.totalShortUsd)}**`, inline: true },
        { name: '🔗 Source', value: 'Hyperliquid PvP Leaderboard (30d)', inline: true }
      );

      const traderLines = (entries: Array<{ address: string; sizeUsd: number; returnPct: number }>, dir: string) =>
        entries.map((t) => {
          const short = `${t.address.slice(0, 6)}…${t.address.slice(-4)}`;
          const pct = t.returnPct ? ` (PvP ${t.returnPct.toFixed(1)}%)` : '';
          return `${dir} **${fmtM(t.sizeUsd)}** — [${short}](https://app.hyperliquid.xyz/explorer/address/${t.address})${pct}`;
        });

      const longLines = traderLines(report.longTraders, '🟢');
      const shortLines = traderLines(report.shortTraders, '🔴');

      if (longLines.length > 0) {
        embed.addFields({ name: `🧭 Long Positions (≥ $1M)`, value: longLines.join('\n'), inline: false });
      }
      if (shortLines.length > 0) {
        embed.addFields({ name: `🧭 Short Positions (≥ $1M)`, value: shortLines.join('\n'), inline: false });
      }
      if (report.spotFlow.length > 0) {
        embed.addFields({
          name: '📈 Spot Flow (5m, ≥ $100k)',
          value: report.spotFlow
            .map((f) => `**${sanitizeEmbedField(f.market, 24)}**: Buy ${fmtM(f.buyUsd)} | Sell ${fmtM(f.sellUsd)} (${f.fillCount} fill)`)
            .join('\n'),
          inline: false,
        });
      }
    }

    embed.addFields({ name: '💡 AI Thesis & Summary', value: sanitizeEmbedField(payload.aiThesis, 500), inline: false });

    const hyperliquidUrl = payload.dexScreenerUrl || `https://app.hyperliquid.xyz/trade/${payload.symbol}`;
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setLabel('🚀 Trade on Hyperliquid')
        .setURL(hyperliquidUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setCustomId('pause_channel_whale-eth')
        .setLabel('⏸️ Pause Whale Tracking')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [buttonsRow] };
  }

  // ==========================================
  // DOMAIN: CONCENTRATED LIQUIDITY (LP_ROBINHOOD)
  // ==========================================
  if (payload.domain === 'LP_ROBINHOOD') {
    embed.setTitle(`💧 OPENCAT ROBINHOOD LP OPPORTUNITY: ${payload.title}`);

    if (payload.contractAddress) {
      embed.addFields({ name: '📍 Pool Address', value: `\`${payload.contractAddress}\``, inline: false });
    }

    embed.addFields(
      { name: 'Network', value: payload.network, inline: true },
      { name: 'Pool TVL', value: payload.marketCap || payload.liquidity || 'N/A', inline: true },
      { name: 'Est. 24h Fee APR', value: payload.feeApr || 'N/A', inline: true }
    );

    const token0Line = payload.token0Address
      ? `\`${payload.token0Address}\`\n🔗 [Chart DexScreener](${payload.token0ChartUrl ?? '#'})${payload.gmgnUrl ? ` • [GMGN](${payload.gmgnUrl})` : ''}`
      : 'N/A';
    const token1Line = payload.token1Address
      ? `\`${payload.token1Address}\`\n🔗 [Chart DexScreener](${payload.token1ChartUrl ?? '#'})`
      : 'N/A';
    embed.addFields(
      { name: `🪙 ${payload.token0Symbol || 'Token X'} (CA)`, value: token0Line, inline: false },
      { name: `🪙 ${payload.token1Symbol || 'Token Y'} (CA)`, value: token1Line, inline: false }
    );

    const token0Detail: string[] = [];
    if (payload.token0PriceUsd !== undefined) token0Detail.push(`💰 Price **$${payload.token0PriceUsd.toFixed(8)}**`);
    if (payload.token0MarketCapUsd !== undefined) token0Detail.push(`📈 MC **$${(payload.token0MarketCapUsd / 1000).toFixed(1)}k**`);
    if (payload.token0Volume24hUsd !== undefined) token0Detail.push(`💦 24h Vol **$${(payload.token0Volume24hUsd / 1000).toFixed(1)}k**`);
    if (payload.token0Holders !== undefined) token0Detail.push(`👥 Holders **${payload.token0Holders.toLocaleString()}**`);
    if (payload.token0AgeHours !== undefined) token0Detail.push(`🎂 Age **${payload.token0AgeHours.toFixed(1)}h**`);
    if (payload.token0SmartDegenCount !== undefined && payload.token0SmartDegenCount > 0) token0Detail.push(`🧠 Smart+KOL **${payload.token0SmartDegenCount}**`);
    if (token0Detail.length > 0) {
      embed.addFields({ name: `📊 Detail ${payload.token0Symbol || 'Token X'}`, value: token0Detail.join(' • '), inline: false });
    }

    if (payload.securityScore) {
      embed.addFields({ name: '🛡️ Token Security (GMGN)', value: sanitizeEmbedField(payload.securityScore, 250), inline: false });
    }

    if (payload.lpStrategy) {
      embed.addFields({ name: '🎯 Recommended LP Range & Strategy', value: payload.lpStrategy, inline: false });
    }

    embed.addFields({ name: '💡 LP Yield AI Thesis', value: payload.aiThesis, inline: false });

    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId('pause_channel_lp-robinhood')
        .setLabel('⏸️ Pause LP Screening')
        .setStyle(ButtonStyle.Secondary)
    );

    if (payload.poolUrl) {
      buttonsRow.addComponents(
        new ButtonBuilder()
          .setLabel('🌐 View on Uniswap')
          .setURL(payload.poolUrl)
          .setStyle(ButtonStyle.Link)
      );
    }

    if (payload.krystalUrl) {
      buttonsRow.addComponents(
        new ButtonBuilder()
          .setLabel('🔍 View on Krystal')
          .setURL(payload.krystalUrl)
          .setStyle(ButtonStyle.Link)
      );
    }

    if (payload.token0ChartUrl) {
      buttonsRow.addComponents(
        new ButtonBuilder()
          .setLabel(`📊 Chart ${payload.token0Symbol || 'Token X'}`)
          .setURL(payload.token0ChartUrl)
          .setStyle(ButtonStyle.Link)
      );
    }

    return { embeds: [embed], components: [buttonsRow] };
  }

  // ==========================================
  // DOMAIN: NFT SNIPING (OPENSEA)
  // ==========================================
  if (payload.domain === 'NFT') {
    embed.setTitle(`🖼️ OPENCAT NFT SNIPE ALERT: ${sanitizeEmbedField(payload.title, 150)} • [${confidenceStr}]`);

    const safeNftSymbol = sanitizeEmbedField(payload.symbol, 40);
    const safeNetwork = sanitizeEmbedField(payload.network, 20) || 'N/A';
    embed.addFields(
      { name: 'Collection', value: safeNftSymbol || 'N/A', inline: true },
      { name: '⛓️ Chain', value: safeNetwork, inline: true },
      { name: 'Price & Floor', value: sanitizeEmbedField(payload.priceUsd, 40) || 'N/A', inline: true },
      { name: 'Market Info', value: sanitizeEmbedField(payload.marketCap, 80) || 'N/A', inline: true },
      { name: '💡 NFT Rarity & Floor AI Thesis', value: sanitizeEmbedField(payload.aiThesis, 500), inline: false }
    );

    if (payload.tokenVerified !== undefined) {
      embed.addFields({
        name: '✅ Verification Status',
        value: payload.tokenVerified ? '✅ **Verified** (OpenSea blue check)' : '⚠️ **Unverified** — DYOR, risiko lebih tinggi',
        inline: true,
      });
    }

    const openseaUrl = payload.dexScreenerUrl || 'https://opensea.io';
    buttonsRow.addComponents(
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
  // DOMAIN: MEME DEX TOKENS (ROBINHOOD / EVM)
  // ==========================================
  const safeTitle = sanitizeEmbedField(payload.title);
  const safeSymbol = sanitizeEmbedField(payload.symbol, 32);
  embed.setTitle(`🐾 OPENCAT ROBINHOOD MEME CALL: ${safeTitle} ($${safeSymbol}) • [${confidenceStr}]`);

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
    const gmgnLink = payload.gmgnUrl || `https://gmgn.ai/robinhood/token/${ca}`;
    const dexscreenerLink = payload.dexScreenerUrl || `https://dexscreener.com/robinhood/${ca}`;

    embed.addFields({
      name: '🔗 Independent Verification Links',
      value: `📊 [DexScreener](${dexscreenerLink}) | 📈 [GMGN Chart](${gmgnLink}) | 🐦 [X (Twitter) Search](https://x.com/search?q=%24${encodeSymbolForUrl(payload.symbol)}&src=typed_query)`,
      inline: false,
    });
  }

  embed.addFields({ name: '💡 AI Thesis & Signal Reasoning', value: sanitizeEmbedField(payload.aiThesis, 500), inline: false });

  const uniswapUrl = payload.contractAddress
    ? `https://app.uniswap.org/explore/pools/robinhood/${payload.contractAddress}`
    : 'https://app.uniswap.org/explore/pools/robinhood';
  buttonsRow.addComponents(
    new ButtonBuilder()
      .setLabel('🌐 Trade on Uniswap')
      .setURL(uniswapUrl)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setCustomId('pause_channel_meme-robinhood')
      .setLabel('⏸️ Pause Robinhood Screening')
      .setStyle(ButtonStyle.Secondary)
  );

  if (payload.dexScreenerUrl || payload.contractAddress) {
    const url = payload.dexScreenerUrl || `https://dexscreener.com/robinhood/${payload.contractAddress}`;
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setLabel('📊 Chart on DexScreener')
        .setURL(url)
        .setStyle(ButtonStyle.Link)
    );
  }

  return { embeds: [embed], components: [buttonsRow] };
}
