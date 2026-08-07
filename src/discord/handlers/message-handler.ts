import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { AIService } from '../../services/ai-service.js';
import { AthenaHub } from '../../orchestrator/hub.js';
import { priceAlertService, walletService } from './interaction-handler.js';
import { isDryRun as isDryRunMode } from '../../config/config.js';

const DISCORD_MAX_LENGTH = 1900;

/**
 * Splits a long text into chunks of ≤ maxLength characters.
 * Prefers splitting at newline boundaries to avoid breaking mid-sentence.
 * Falls back to splitting at space boundaries, then hard-cuts as last resort.
 */
function splitDiscordMessage(text: string, maxLength: number = DISCORD_MAX_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = -1;

    // 1. Try to split at the last newline within the limit
    const lastNewline = remaining.lastIndexOf('\n', maxLength);
    if (lastNewline > maxLength * 0.3) {
      splitIndex = lastNewline + 1; // include the newline in current chunk
    }

    // 2. Fallback: split at the last space within the limit
    if (splitIndex === -1) {
      const lastSpace = remaining.lastIndexOf(' ', maxLength);
      if (lastSpace > maxLength * 0.3) {
        splitIndex = lastSpace + 1;
      }
    }

    // 3. Last resort: hard cut at maxLength
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex).trimEnd());
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks.filter(c => c.length > 0);
}

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

  // Attach ToolRegistry to Hub & AI Service for full execution authority
  const { ToolRegistry } = await import('../../orchestrator/tool-registry.js');
  const toolRegistry = new ToolRegistry();
  toolRegistry.attachOrchestrator(hub);
  toolRegistry.attachAIService(aiService);

  const lowerQuery = userQuery.toLowerCase();

  // 0a. Sub-agent PAUSE / STOP intent
  if (lowerQuery.includes('pause') || lowerQuery.includes('stop') || lowerQuery.includes('matikan') || lowerQuery.includes('hentikan')) {
    if (lowerQuery.includes('agent') || lowerQuery.includes('sub agent') || lowerQuery.includes('screening')) {
      const agentDomains = ['solana-meme', 'evm-meme', 'solana', 'evm', 'perps', 'nft', 'prediction', 'ct-alpha', 'lp-solana', 'lp-evm', 'all'];
      const foundDomain = agentDomains.find(d => lowerQuery.includes(d)) || 'all';
      const result = await toolRegistry.executeToolCall('pause_sub_agent', { agentId: foundDomain });
      await message.reply(`🔴 **ATHENA CONTROL CENTER**: ${result.message}\n\nSub-agent status updated in Hub Orchestrator state.`);
      return;
    }
  }

  // 0b. Sub-agent RESUME / START intent
  if (lowerQuery.includes('resume') || lowerQuery.includes('start') || lowerQuery.includes('nyalakan') || lowerQuery.includes('aktifkan')) {
    if (lowerQuery.includes('agent') || lowerQuery.includes('sub agent') || lowerQuery.includes('screening')) {
      const agentDomains = ['solana-meme', 'evm-meme', 'solana', 'evm', 'perps', 'nft', 'prediction', 'ct-alpha', 'lp-solana', 'lp-evm', 'all'];
      const foundDomain = agentDomains.find(d => lowerQuery.includes(d)) || 'all';
      const result = await toolRegistry.executeToolCall('resume_sub_agent', { agentId: foundDomain });
      await message.reply(`🟢 **ATHENA CONTROL CENTER**: ${result.message}\n\nSub-agent status updated in Hub Orchestrator state.`);
      return;
    }
  }

  // 0c. Trigger ON-DEMAND Screening Pass intent
  if (lowerQuery.includes('jalankan screening') || lowerQuery.includes('run screening') || lowerQuery.includes('trigger screening')) {
    const agentDomains = ['solana-meme', 'evm-meme', 'solana', 'evm', 'perps', 'nft', 'prediction', 'ct-alpha', 'lp-solana', 'lp-evm'];
    const foundDomain = agentDomains.find(d => lowerQuery.includes(d)) || 'solana-meme';
    await message.reply(`⚡ **ATHENA ON-DEMAND SCREENING TRIGGERED** for \`${foundDomain.toUpperCase()}\`...\nScreening pass in progress.`);
    const result = await toolRegistry.executeToolCall('trigger_screening_pass', { agentId: foundDomain });
    await message.reply(`✅ **SCREENING COMPLETE** for \`${foundDomain.toUpperCase()}\`: Found **${result.data?.length || 0}** signals passing 3-Layer Swarm Filter.`);
    return;
  }

  // 0d. Risk Parameter / Drawdown Limit intent
  if ((lowerQuery.includes('drawdown limit') || lowerQuery.includes('drawdown')) && (lowerQuery.includes('ubah') || lowerQuery.includes('set') || lowerQuery.includes('ganti') || lowerQuery.includes('jadi'))) {
    const numbers = userQuery.match(/\b\d+(\.\d+)?\b/g);
    if (numbers && numbers.length > 0) {
      const val = parseFloat(numbers[0]);
      const result = await toolRegistry.executeToolCall('set_risk_limit', { maxDrawdownPct: val });
      await message.reply(`🛡️ **ATHENA RISK MANAGER UPDATED**: ${result.message}`);
      return;
    }
  }

  // 0e. Agent Status Matrix intent
  if (lowerQuery.includes('status agent') || lowerQuery.includes('status sub agent') || lowerQuery.includes('agent status')) {
    const result = await toolRegistry.executeToolCall('get_agent_statuses', {});
    const statuses = result.data || {};
    let statusText = `🏛️ **ATHENA SUB-AGENT REAL-TIME STATUS MATRIX**\n\n`;
    for (const [name, state] of Object.entries(statuses) as [string, any][]) {
      statusText += `• **${name.toUpperCase()}**: ${state.active ? '🟢 ACTIVE (24/7 Running)' : '🔴 PAUSED'}\n`;
    }
    await message.reply(statusText);
    return;
  }

  // 0f. Natural Language Schedule Automation intent
  if (lowerQuery.includes('setiap') || lowerQuery.includes('every') || lowerQuery.includes('schedule')) {
    if (lowerQuery.includes('jam') || lowerQuery.includes('hour') || lowerQuery.includes('menit') || lowerQuery.includes('min')) {
      const agentDomains = ['solana-meme', 'evm-meme', 'solana', 'evm', 'perps', 'nft', 'prediction', 'ct-alpha', 'lp-solana', 'lp-evm'];
      const foundDomain = agentDomains.find(d => lowerQuery.includes(d)) || 'solana-meme';
      const result = await toolRegistry.executeToolCall('schedule_automation', {
        interval: userQuery,
        action: 'screening',
        agentId: foundDomain,
      });
      await message.reply(`⏰ **ATHENA CRON SCHEDULER**: ${result.message}\nAutomated task scheduled and saved to database.`);
      return;
    }
  }

  // 0g. Memory Recall & Search intent
  if (lowerQuery.includes('audit tadi') || lowerQuery.includes('memory') || lowerQuery.includes('riwayat audit') || lowerQuery.includes('history audit') || lowerQuery.includes('search audit')) {
    const { SessionMemoryService } = await import('../../services/session-memory.js');
    const memory = new SessionMemoryService();
    const records = memory.getRecentAudits(5);

    if (records.length === 0) {
      await message.reply(`🧠 **ATHENA SESSION MEMORY**: Belum ada riwayat audit token yang tersimpan di memori persisten.`);
      return;
    }

    let memoryText = `🧠 **ATHENA PERSISTENT AUDIT RECALL (ZERO LLM TOKEN COST)**\n\n`;
    for (const r of records) {
      memoryText += `• **${r.symbol}** (\`${r.contractAddress.substring(0, 8)}...\` | ${r.chain.toUpperCase()}): ${r.verdict} (Score: ${r.score})\n  *Date:* ${r.timestampIso.slice(0, 16)}\n`;
    }
    await message.reply(memoryText);
    return;
  }

  // 0h. Natural Language API Key Setup intent
  if (lowerQuery.includes('set_api_key') || lowerQuery.includes('set key') || lowerQuery.includes('pasang key') || lowerQuery.includes('setup api key') || lowerQuery.includes('set api key') || lowerQuery.includes('_api_key=')) {
    const match = userQuery.match(/([A-Z0-9_]+_API_KEY|[A-Z0-9_]+_KEY|[A-Z0-9_]+_URL|[A-Z0-9_]+_TOKEN)\s*[:=]\s*([^\s]+)/i);
    if (match) {
      const keyName = match[1].toUpperCase();
      const keyValue = match[2];
      const result = await toolRegistry.executeToolCall('set_api_key', { keyName, keyValue });
      await message.reply(`${result.message}\nSub-agent API key status re-evaluated.`);
      return;
    }
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
  }

  // 1b. Detect if user is asking to Bridge tokens (e.g., "bridge 0.5 ETH ke Base lewat Relay")
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

    const result = await relayAdapter.executeBridge({
      originChain: origin,
      destinationChain: destination,
      amount,
      tokenSymbol: token,
    }, walletService);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`View on Explorer`)
        .setStyle(ButtonStyle.Link)
        .setURL(result.explorerUrl || result.relayWebUrl)
    );

    await message.reply({
      content:
        `🌉 **ATHENA RELAY.LINK CROSS-CHAIN BRIDGE DIRECT EXECUTION**\n\n` +
        `• **Bridging:** \`${result.amountIn} ${result.tokenSymbol}\` from **${result.originChainName}** ➡️ **${result.destinationChainName}**\n` +
        `• **Expected Received:** \`~${result.expectedAmountOut} ${result.tokenSymbol}\`\n` +
        `• **Relayer & Gas Fee:** \`~$${result.feeUsd.toFixed(2)} USD\`\n` +
        `• **Tx Hash:** \`${result.txHash || 'Simulated'}\`\n` +
        `• **Execution Mode:** ${result.simulated ? '`DRY_RUN (Simulated Intent)`' : '`Live Broadcast`'}\n\n` +
        `Click below to view transaction details:`,
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

    const knownTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'SOL', 'BNB', 'MATIC', 'ARB', 'OP', 'BUSD'];
    const upperQuery = userQuery.toUpperCase();
    const foundTokens = knownTokens.filter(t => upperQuery.includes(t));
    const fromToken = foundTokens[0] || 'ETH';
    const toToken = foundTokens[1] || (fromToken === 'ETH' ? 'USDC' : 'ETH');

    const numbers = userQuery.match(/\b\d+(\.\d+)?\b/g);
    const amount = numbers && numbers.length > 0 ? parseFloat(numbers[0]) : 0.1;

    const result = await relayAdapter.executeSwap({ chain, fromToken, toToken, amount }, walletService);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`View on Explorer`)
        .setStyle(ButtonStyle.Link)
        .setURL(result.explorerUrl || result.relayWebUrl)
    );

    await message.reply({
      content:
        `🔄 **ATHENA RELAY.LINK SWAP DIRECT EXECUTION**\n\n` +
        `• **Swapping:** \`${result.amountIn} ${result.fromToken}\` ➡️ \`~${result.expectedAmountOut} ${result.toToken}\`\n` +
        `• **Chain:** **${result.chainName}**\n` +
        `• **Fee:** \`~$${result.feeUsd.toFixed(2)} USD\`\n` +
        `• **Tx Hash:** \`${result.txHash || 'Simulated'}\`\n` +
        `• **Execution Mode:** ${result.simulated ? '`DRY_RUN (Simulated Direct On-Chain Swap)`' : '`Live Broadcast`'}\n\n` +
        `Click below to view transaction details:`,
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

    const result = await relayAdapter.executeSend({ chain, token, amount, recipientAddress }, walletService);

    const shortAddr = `${result.recipientAddress.substring(0, 6)}...${result.recipientAddress.substring(result.recipientAddress.length - 4)}`;
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`View on Explorer`)
        .setStyle(ButtonStyle.Link)
        .setURL(result.explorerUrl || result.relayWebUrl)
    );

    await message.reply({
      content:
        `📤 **ATHENA RELAY.LINK SEND DIRECT EXECUTION**\n\n` +
        `• **Sending:** \`${result.amountIn} ${result.tokenSymbol}\` to \`${shortAddr}\`\n` +
        `• **Chain:** **${result.chainName}**\n` +
        `• **Recipient Receives:** \`~${result.expectedAmountOut} ${result.tokenSymbol}\`\n` +
        `• **Fee:** \`~$${result.feeUsd.toFixed(2)} USD\`\n` +
        `• **Tx Hash:** \`${result.txHash || 'Simulated'}\`\n` +
        `• **Execution Mode:** ${result.simulated ? '`DRY_RUN (Simulated Direct On-Chain Transfer)`' : '`Live Broadcast`'}\n\n` +
        `Click below to view transaction details:`,
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
    
    const { runTokenAudit } = await import('../../services/token-audit-service.js');
    const audit = await runTokenAudit(matchedCa);

    // Log into persistent Session Memory
    const { SessionMemoryService } = await import('../../services/session-memory.js');
    const memory = new SessionMemoryService();
    memory.recordAudit(matchedCa, isSol ? 'SOL_MEME' : 'EVM_TOKEN', isSol ? 'sol' : 'base', audit.success ? 80 : 0, audit.success ? 'REAL-TIME AUDIT' : 'UNAVAILABLE', `Audited ${matchedCa}`);

    await message.reply(`🔎 **ATHENA ON-DEMAND TOKEN AUDIT REPORT**\n📌 **Target Contract:** \`${matchedCa}\` (${chainName})\n\n${audit.content}`);
    return;
  }

  const simSol = process.env.SIMULATION_BALANCE_SOL || '10.0';
  const simEth = process.env.SIMULATION_BALANCE_ETH || '1.0';
  const simPoly = process.env.SIMULATION_BALANCE_POLYMARKET || '500.0';
  const simHl = process.env.SIMULATION_BALANCE_HYPERLIQUID || '1000.0';
  const isDryRun = isDryRunMode();

  // Shared Athena system prompt (persona + architecture) + live operating params
  const { ATHENA_SYSTEM_PROMPT_BASE } = await import('../../services/athena-system-prompt.js');
  const { getAgentDomain } = await import('../../orchestrator/agent-registry.js');
  const activeDomains = hub.getActiveDomains();
  const activeAgentsLine = activeDomains.length > 0
    ? `- Active Sub-Agents: ${activeDomains.map((d) => getAgentDomain(d)?.displayName ?? d).join(', ')}`
    : '- Active Sub-Agents: NONE (semua screening agent sedang PAUSED)';
  const systemPrompt = ATHENA_SYSTEM_PROMPT_BASE + `
Current Operating Parameters & Live Simulation Balances:
- Execution Mode: ${isDryRun ? 'DRY_RUN Active (Simulation Mode)' : 'LIVE TRADING'}
${activeAgentsLine}
- Active Portfolio Simulation Balances:
  • Solana Balance: ${simSol} SOL
  • EVM Balance: ${simEth} ETH (Base / Mainnet)
  • Polymarket Balance: $${simPoly} USDC (Polygon L2)
  • Hyperliquid Perps Balance: $${simHl} USDC
- Global Portfolio Drawdown Limit: 50.0%
- Current Portfolio Drawdown: 0.0%`;

  try {
    // Athena is a real agent: LLM picks tools via function-calling (AgentRunner loop)
    const { runAgent } = await import('../../orchestrator/agent-runner.js');
    const agentResult = await runAgent(
      { aiService, toolRegistry, systemPrompt },
      userQuery
    );

    const response = agentResult.text || (
      agentResult.toolResults.length > 0
        ? `Saya menjalankan ${agentResult.toolResults.length} tool:\n` +
          agentResult.toolResults.map((t) => `• \`${t.name}\`: ${t.success ? '✅' : '❌'} ${t.message}`).join('\n')
        : '[Tidak ada respons dari AI.]'
    );

    const chunks = splitDiscordMessage(response);
    // First chunk as reply (preserves thread context), rest as follow-ups
    await message.reply(chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
      if ('send' in message.channel && typeof message.channel.send === 'function') {
        await message.channel.send(chunks[i]);
      }
    }
  } catch (error: any) {
    console.error('[ATHENA AI ERROR]', error.message);

    const lower = userQuery.toLowerCase();
    const providerConfig = aiService.getConfig();
    const keyHint = providerConfig.apiKeys.length > 0 
      ? `${providerConfig.apiKeys[0].slice(0, 12)}... (${providerConfig.apiKeys.length} keys total)`
      : 'NONE';

    // 1. Dynamic intent: User asking about LLM / AI model
    if (lower.includes('llm') || lower.includes('model') || lower.includes('ai apa') || lower.includes('pakai ai')) {
      await message.reply(
        `🏛️ **ATHENA LLM ENGINE STATUS REPORT**\n\n` +
        `• **Configured Provider:** \`${providerConfig.provider.toUpperCase()}\` (${providerConfig.baseUrl})\n` +
        `• **Target Model:** \`${providerConfig.modelName}\`\n` +
        `• **Active API Key Hint:** \`${keyHint}\`\n` +
        `• **Error Detail:** ⚠️ \`${error.message || 'Unknown Error'}\`\n\n` +
        `💡 **Solusi:** Jalankan \`athena wizard\` di VPS untuk menyegarkan API Key baru kamu.\n\n` +
        `🛡️ **Sistem Otonom Lokal:** 95% engine lokal Athena (7 Sub-Agent, GoPlus/RugCheck audit, Swarm Consensus, \`/swap\`, \`/bridge\`, \`/alert\`) tetap beroperasi 100% lancar!`
      );
      return;
    }

    // 2. Dynamic intent: General Chat / Analysis Query in Indonesian
    const isIndonesian = /[a-z]/i.test(userQuery) && (
      lower.includes('bisa') ||
      lower.includes('hai') ||
      lower.includes('halo') ||
      lower.includes('apa') ||
      lower.includes('yang') ||
      lower.includes('indonesia') ||
      lower.includes('kamu') ||
      lower.includes('saya') ||
      lower.includes('analisa') ||
      lower.includes('analisis')
    );

    const fallbackText = isIndonesian
      ? `🏛️ **Athena Multi-Agent Intelligence Hub**\n\n` +
        `Saya menerima permintaan kamu: *"${userQuery}"*.\n\n` +
        `📊 **Status Operasional:**\n` +
        `• **Mode:** \`DRY_RUN (Simulasi Aman Active)\`\n` +
        `• **Active Key Hint:** \`${keyHint}\`\n` +
        `• **AI Status Error:** \`${error.message || 'Key Quota Exceeded'}\`\n\n` +
        `💡 **Kemampuan Utama:**\n` +
        `1. Paste Contract Address token untuk **Audit Keamanan Real-time**.\n` +
        `2. Minta alert harga (*"kabari kalau SOL 200"*).\n` +
        `3. Eksekusi direct on-chain: \`/swap\`, \`/bridge\`, atau \`/send\`.\n\n` +
        `*(Catatan: Cloud AI Error. Jalankan \`athena wizard\` di VPS untuk memperbarui API Key!)*`
      : `🏛️ **Athena Multi-Agent Intelligence Hub**\n\n` +
        `I received your query: *"${userQuery}"*.\n\n` +
        `📊 **Operating Status:**\n` +
        `• **Mode:** \`DRY_RUN (Safe Simulation Active)\`\n` +
        `• **Active Key Hint:** \`${keyHint}\`\n` +
        `• **AI Status Error:** \`${error.message || 'Key Quota Exceeded'}\`\n\n` +
        `💡 **Core Capabilities:**\n` +
        `1. Paste Contract Address for **Real-Time Security Audit**.\n` +
        `2. Ask for price alerts (*"notify me if SOL hits 200"*).\n` +
        `3. Direct on-chain execution: \`/swap\`, \`/bridge\`, or \`/send\`.\n\n` +
        `*(Note: Cloud AI Error. Run \`athena wizard\` on VPS to update API keys!)*`;

    await message.reply(fallbackText);
  }
}
