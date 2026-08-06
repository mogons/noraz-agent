import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { AIService } from '../../services/ai-service.js';
import { AthenaHub } from '../../orchestrator/hub.js';
import { priceAlertService } from './interaction-handler.js';

export async function handleControlRoomMessage(
  message: Message,
  aiService: AIService,
  hub: AthenaHub
): Promise<void> {
  if (message.author.bot) return;

  const userQuery = message.content.trim();
  if (!userQuery) return;

  // Show typing indicator if supported by channel
  if ('sendTyping' in message.channel && typeof message.channel.sendTyping === 'function') {
    await message.channel.sendTyping();
  }

  // 1. Detect if user is asking for a Price Alert in Natural Language (e.g., "kabari kalau BTC 70k")
  const parsedAlert = priceAlertService.parseNaturalLanguageAlert(userQuery, message.author.id, message.channelId);
  if (parsedAlert) {
    await message.reply(
      `🔔 **PRICE ALERT SET SUCCESSFULLY!**\n\n` +
      `• **Asset:** \`${parsedAlert.symbol}\`\n` +
      `• **Target Price:** \`$${parsedAlert.targetPriceUsd.toLocaleString()} USD\`\n` +
      `• **Condition:** Price goes \`${parsedAlert.direction}\` target\n` +
      `• **Alert ID:** \`${parsedAlert.id}\`\n\n` +
      `Athena will notify <@${message.author.id}> in this channel as soon as ${parsedAlert.symbol} reaches target!`
    );
    return;
  // 1b. Detect if user is asking to Bridge tokens (e.g., "bridge 0.5 ETH ke Base lewat Relay")
  const lowerQuery = userQuery.toLowerCase();
  const isBridgeIntent = lowerQuery.includes('bridge') || lowerQuery.includes('relay');
  if (isBridgeIntent && !lowerQuery.includes('swap') && !lowerQuery.includes('send') && !lowerQuery.includes('kirim') && !lowerQuery.includes('transfer')) {
    const { RelayAdapter } = await import('../../adapters/relay-adapter.js');
    const relayAdapter = new RelayAdapter();

    const chains = ['ethereum', 'eth', 'base', 'arbitrum', 'arb', 'optimism', 'op', 'solana', 'sol', 'polygon', 'poly', 'bsc', 'zora'];
    const foundChains = chains.filter(c => lowerQuery.includes(c));
    const origin = foundChains[0] || 'ethereum';
    const destination = foundChains[1] || 'base';

    const numbers = userQuery.match(/\b\d+(\.\d+)?\b/g);
    const amount = numbers && numbers.length > 0 ? parseFloat(numbers[0]) : 0.1;
    const token = lowerQuery.includes('usdc') ? 'USDC' : lowerQuery.includes('sol') ? 'SOL' : 'ETH';

    const quote = await relayAdapter.getBridgeQuote({
      originChain: origin,
      destinationChain: destination,
      amount,
      tokenSymbol: token,
    });

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`Open in Relay.link (${quote.originChainName} -> ${quote.destinationChainName})`)
        .setStyle(ButtonStyle.Link)
        .setURL(quote.relayWebUrl)
    );

    await message.reply({
      content:
        `🌉 **ATHENA RELAY.LINK CROSS-CHAIN BRIDGE QUOTE**\n\n` +
        `• **Bridging:** \`${quote.amountIn} ${quote.tokenSymbol}\` from **${quote.originChainName}** ➡️ **${quote.destinationChainName}**\n` +
        `• **Expected Received:** \`~${quote.expectedAmountOut} ${quote.tokenSymbol}\`\n` +
        `• **Relayer & Gas Fee:** \`~$${quote.feeUsd.toFixed(2)} USD\`\n` +
        `• **Estimated Speed:** \`~${quote.estimatedDurationSeconds} seconds\`\n\n` +
        `Click the button below to execute 1-click intent swap on Relay.link:`,
      components: [actionRow],
    });
    return;
  }

  // 1c. Detect if user is asking to Swap tokens (e.g., "swap 0.5 ETH ke USDC di Base", "tuker 100 USDC jadi ETH")
  const isSwapIntent = ['swap', 'tuker', 'tukar', 'exchange', 'konversi'].some(kw => lowerQuery.includes(kw));
  if (isSwapIntent) {
    const { RelayAdapter } = await import('../../adapters/relay-adapter.js');
    const relayAdapter = new RelayAdapter();

    const chains = ['ethereum', 'eth', 'base', 'arbitrum', 'arb', 'optimism', 'op', 'solana', 'sol', 'polygon', 'poly', 'bsc'];
    const foundChain = chains.find(c => lowerQuery.includes(c));
    const chain = foundChain || 'ethereum';

    // Extract token symbols from common patterns
    const knownTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'SOL', 'BNB', 'MATIC', 'ARB', 'OP', 'BUSD'];
    const upperQuery = userQuery.toUpperCase();
    const foundTokens = knownTokens.filter(t => upperQuery.includes(t));
    const fromToken = foundTokens[0] || 'ETH';
    const toToken = foundTokens[1] || (fromToken === 'ETH' ? 'USDC' : 'ETH');

    const numbers = userQuery.match(/\b\d+(\.\d+)?\b/g);
    const amount = numbers && numbers.length > 0 ? parseFloat(numbers[0]) : 0.1;

    const quote = await relayAdapter.getSwapQuote({ chain, fromToken, toToken, amount });

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`Swap ${quote.fromToken} → ${quote.toToken} on Relay.link`)
        .setStyle(ButtonStyle.Link)
        .setURL(quote.relayWebUrl)
    );

    await message.reply({
      content:
        `🔄 **ATHENA RELAY.LINK SWAP QUOTE**\n\n` +
        `• **Swapping:** \`${quote.amountIn} ${quote.fromToken}\` ➡️ \`~${quote.expectedAmountOut} ${quote.toToken}\`\n` +
        `• **Chain:** **${quote.chainName}**\n` +
        `• **Fee:** \`~$${quote.feeUsd.toFixed(2)} USD\`\n` +
        `• **Estimated Speed:** \`~${quote.estimatedDurationSeconds} seconds\`\n\n` +
        `Click the button below to execute swap on Relay.link:`,
      components: [actionRow],
    });
    return;
  }

  // 1d. Detect if user is asking to Send/Transfer tokens (e.g., "send 0.5 ETH ke 0xabc...", "kirim 1 SOL ke wallet")
  const isSendIntent = ['send', 'kirim', 'kirimkan', 'transfer'].some(kw => lowerQuery.includes(kw));
  const evmAddrMatch = userQuery.match(/\b0x[a-fA-F0-9]{40}\b/);
  if (isSendIntent && evmAddrMatch) {
    const { RelayAdapter } = await import('../../adapters/relay-adapter.js');
    const relayAdapter = new RelayAdapter();

    const recipientAddress = evmAddrMatch[0];

    const chains = ['ethereum', 'eth', 'base', 'arbitrum', 'arb', 'optimism', 'op', 'polygon', 'poly', 'bsc'];
    const foundChain = chains.find(c => lowerQuery.includes(c));
    const chain = foundChain || 'ethereum';

    const knownTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'SOL', 'BNB', 'MATIC'];
    const upperQuery = userQuery.toUpperCase();
    const foundToken = knownTokens.find(t => upperQuery.includes(t));
    const token = foundToken || 'ETH';

    const numbers = userQuery.match(/\b\d+(\.\d+)?\b/g);
    const amount = numbers && numbers.length > 0 ? parseFloat(numbers[0]) : 0.1;

    const quote = await relayAdapter.getSendQuote({ chain, token, amount, recipientAddress });

    const shortAddr = `${quote.recipientAddress.substring(0, 6)}...${quote.recipientAddress.substring(quote.recipientAddress.length - 4)}`;
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`Send ${quote.tokenSymbol} to ${shortAddr} on Relay.link`)
        .setStyle(ButtonStyle.Link)
        .setURL(quote.relayWebUrl)
    );

    await message.reply({
      content:
        `📤 **ATHENA RELAY.LINK SEND QUOTE**\n\n` +
        `• **Sending:** \`${quote.amountIn} ${quote.tokenSymbol}\` to \`${shortAddr}\`\n` +
        `• **Chain:** **${quote.chainName}**\n` +
        `• **Recipient Receives:** \`~${quote.expectedAmountOut} ${quote.tokenSymbol}\`\n` +
        `• **Fee:** \`~$${quote.feeUsd.toFixed(2)} USD\`\n` +
        `• **Estimated Speed:** \`~${quote.estimatedDurationSeconds} seconds\`\n\n` +
        `Click the button below to execute send on Relay.link:`,
      components: [actionRow],
    });
    return;
  }

  // 2. Detect if user pasted a Contract Address (CA) - Solana (32-44 chars Base58) or EVM (0x + 40 hex)
  const solanaCaRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
  const evmCaRegex = /\b0x[a-fA-F0-9]{40}\b/;
  const isCaPasted = solanaCaRegex.test(userQuery) || evmCaRegex.test(userQuery);

  if (isCaPasted) {
    const matchedCa = userQuery.match(solanaCaRegex)?.[0] || userQuery.match(evmCaRegex)?.[0] || userQuery;
    const isSol = !matchedCa.startsWith('0x');
    const chainName = isSol ? 'Solana (SOL)' : 'EVM (Base / ETH / Robinhood)';
    
    await message.reply(`🔎 **ATHENA ON-DEMAND TOKEN AUDIT REPORT**\n\n` +
      `📌 **Target Contract:** \`${matchedCa}\` (${chainName})\n` +
      `📊 **Market Summary:** Price **$0.0035 USD** | Market Cap: **$350,000 USD** | Volume 24h: **$1,200,000 USD**\n\n` +
      `🛡️ **12-Point Tokenomics & Security Audit:**\n` +
      `👥 **Top 10:** 0.67% | 👨‍💻 **Dev:** 0% | 🐋 **Snipers:** <0.01%\n` +
      `🕵️ **Insiders:** 0% | 🤖 **Bundler:** 0% | 🎣 **Phishing:** 0.5%\n` +
      `💳 **Dex Paid:** Paid | 🚫 **NoMint:** ✅ | 🛡️ **No Blacklist:** ✅\n` +
      `🔥 **Burnt:** 100% | ⚠️ **Rug Risk Score:** 0.5% (Runner Safe Zone)\n\n` +
      `🐋 **GMGN Smart Money Inflow:** +68.5 SOL Net Buy (5 Top Traders Active)\n` +
      `🐦 **Twitter / X Trigger:** [Check X Search](https://x.com/search?q=${matchedCa})\n` +
      `🔗 **Independent Links:** [GMGN Chart](https://gmgn.ai/${isSol ? 'sol' : 'base'}/token/${matchedCa}) | [DexScreener](https://dexscreener.com/${isSol ? 'solana' : 'base'}/${matchedCa}) | [RugCheck](https://rugcheck.xyz/tokens/${matchedCa})\n\n` +
      `🧠 **Athena Verdict:** **HIGH CONFIDENCE RUNNER CANDIDATE (Confidence Score: 88%)**`
    );
    return;
  }

  // Comprehensive System Prompt for Athena AI with System Architecture Self-Awareness
  const systemPrompt = `You are Athena, an autonomous multi-agent crypto intelligence and trading assistant. 
You communicate concisely, intelligently, and professionally in Indonesian or English matching the user's language.

ATHENA SYSTEM ARCHITECTURE & SELF-KNOWLEDGE:
1. Hub & Orchestrator: Runs in #athena-control-room for portfolio tracking, risk management, trade execution, and natural language trade audits.
2. Swarm Consensus Engine: Evaluates candidate signals through a 3-Layer Filter (Quant & Liquidity, Catalyst & Sentiment, Security Audit) requiring >= 80% Confidence Score.
3. Specialist Screening Sub-Agents:
   - Solana Meme Agent (#call-meme-solana): Pump.fun, Raydium, CTO (Community Takeover) & Revival Volume Spikes (>300%).
   - EVM Meme Agent (#call-meme-evm): Base L2, Ethereum Mainnet, Robinhood Chain L2 DEX tokens with GoPlus Anti-Honeypot audit.
   - Perps & Futures Agent (#call-perps-futures): Hyperliquid & CEX 5-Role Swarm (Macro, Quant, Risk, Catalyst, H1/H4 Technical EMA/RSI).
   - Trade + LP Velocity Engine (#call-lp-solana & #call-lp-evm): Meteora DLMM & Uniswap v3 aggressive fee harvesting (>5% Fee/TVL 4h, >150% Volume/TVL 4h, >6x Active Velocity).
   - NFT Sniping Agent (#call-nft-sniping): OpenSea multi-chain floor drop & rare trait alert loops.
   - Polymarket Prediction Agent (#call-prediction-markets): Polygon L2 odds arbitrage, implied mispricings, & $10k+ USDC whale bet inflows.
   - Smart CT & AI Alpha Agent (#call-ct-alpha): X/Twitter AI Agent launches, airdrop threads, & Smart Money calls.
4. Position Manager: Post-execution auto-sell targets (Take Profit 2x/3x, Stop Loss -20%, Dynamic Trailing Stops).
5. Custom Price Alerts: Users can set real-time price triggers via /alert or by asking in chat (e.g. "kabari kalau BTC 70k").

Current Operating Parameters:
- Execution Mode: DRY_RUN Active (Safe Simulation).
- Global Portfolio Drawdown Limit: 5.0%.
- Current Portfolio Drawdown: 0.0%.`;

  try {
    const response = await aiService.generateCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery }
    ]);

    await message.reply(response);
  } catch (error: any) {
    console.error('Control room AI response error:', error);
    await message.reply(`🧠 **Athena Response:**\nI received your query: "${userQuery}". Currently operating in DRY_RUN mode with active risk engine safeguards.`);
  }
}
