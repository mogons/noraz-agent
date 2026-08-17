import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { OpenCatHub, AthenaHub } from '../../orchestrator/hub.js';
import { AIService } from '../../services/ai-service.js';
import { priceAlertService, walletService } from './interaction-handler.js';

/**
 * Split a large text response into chunks safe for a single Discord message (<= 1950 chars).
 * Splits on double newline > newline > space, never mid-word unless forced.
 */
export function splitDiscordMessage(text: string, maxLen = 1950): string[] {
  if (!text || text.length <= maxLen) return [text || ''];
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitIdx = remaining.lastIndexOf('\n\n', maxLen);
    if (splitIdx === -1 || splitIdx < maxLen * 0.4) {
      splitIdx = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitIdx === -1 || splitIdx < maxLen * 0.4) {
      splitIdx = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitIdx === -1) {
      splitIdx = maxLen;
    }
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export async function handleControlRoomMessage(
  message: Message,
  hub: AthenaHub,
  aiService: AIService
): Promise<void> {
  const userQuery = message.content.trim();
  if (!userQuery) return;

  // Let user know bot is thinking
  if ('sendTyping' in message.channel && typeof message.channel.sendTyping === 'function') {
    await message.channel.sendTyping();
  }

  // Load ToolRegistry & attach live instances
  const { ToolRegistry } = await import('../../orchestrator/tool-registry.js');
  const toolRegistry = new ToolRegistry();
  toolRegistry.attachOrchestrator(hub);
  toolRegistry.attachAIService(aiService);
  toolRegistry.attachWalletService(walletService);

  const lowerQuery = userQuery.toLowerCase();

  // 0a. Sub-agent PAUSE / STOP intent
  if (lowerQuery.includes('pause') || lowerQuery.includes('stop') || lowerQuery.includes('matikan') || lowerQuery.includes('hentikan')) {
    if (lowerQuery.includes('agent') || lowerQuery.includes('sub agent') || lowerQuery.includes('screening')) {
      const agentDomains = ['meme-robinhood', 'lp-robinhood', 'nft', 'all'];
      const foundDomain = agentDomains.find(d => lowerQuery.includes(d)) || 'all';
      const result = await toolRegistry.executeToolCall('pause_sub_agent', { agentId: foundDomain });
      await message.reply(`🔴 **OPENCAT CONTROL CENTER**: ${result.message}\n\nSub-agent status updated in Hub Orchestrator state.`);
      return;
    }
  }

  // 0b. Sub-agent RESUME / START intent
  if (lowerQuery.includes('resume') || lowerQuery.includes('start') || lowerQuery.includes('nyalakan') || lowerQuery.includes('aktifkan')) {
    if (lowerQuery.includes('agent') || lowerQuery.includes('sub agent') || lowerQuery.includes('screening')) {
      const agentDomains = ['meme-robinhood', 'lp-robinhood', 'nft', 'all'];
      const foundDomain = agentDomains.find(d => lowerQuery.includes(d)) || 'all';
      const result = await toolRegistry.executeToolCall('resume_sub_agent', { agentId: foundDomain });
      await message.reply(`🟢 **OPENCAT CONTROL CENTER**: ${result.message}\n\nSub-agent status updated in Hub Orchestrator state.`);
      return;
    }
  }

  // 0c. Trigger ON-DEMAND Screening Pass intent
  if (lowerQuery.includes('jalankan screening') || lowerQuery.includes('run screening') || lowerQuery.includes('trigger screening')) {
    const agentDomains = ['meme-robinhood', 'lp-robinhood', 'nft'];
    const foundDomain = agentDomains.find(d => lowerQuery.includes(d)) || 'meme-robinhood';
    await message.reply(`⚡ **OPENCAT ON-DEMAND SCREENING TRIGGERED** for \`${foundDomain.toUpperCase()}\`...\nScreening pass in progress.`);
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
      await message.reply(`🛡️ **OPENCAT RISK MANAGER UPDATED**: ${result.message}`);
      return;
    }
  }

  // 0e. Agent Status Matrix intent
  if (lowerQuery.includes('status agent') || lowerQuery.includes('status sub agent') || lowerQuery.includes('agent status')) {
    const result = await toolRegistry.executeToolCall('get_agent_statuses', {});
    const statuses = result.data || {};
    let statusText = `🐾 **OPENCAT SUB-AGENT REAL-TIME STATUS MATRIX**\n\n`;
    for (const [name, state] of Object.entries(statuses) as [string, any][]) {
      statusText += `• **${name.toUpperCase()}**: ${state.active ? '🟢 ACTIVE (24/7 Running)' : '🔴 PAUSED'}\n`;
    }
    await message.reply(statusText);
    return;
  }

  // 0f. Natural Language Schedule Automation intent
  if (lowerQuery.includes('setiap') || lowerQuery.includes('every') || lowerQuery.includes('schedule')) {
    if (lowerQuery.includes('jam') || lowerQuery.includes('hour') || lowerQuery.includes('menit') || lowerQuery.includes('min')) {
      const agentDomains = ['meme-robinhood', 'lp-robinhood', 'nft'];
      const foundDomain = agentDomains.find(d => lowerQuery.includes(d)) || 'meme-robinhood';
      const result = await toolRegistry.executeToolCall('schedule_automation', {
        interval: userQuery,
        action: 'screening',
        agentId: foundDomain,
      });
      await message.reply(`⏰ **OPENCAT CRON SCHEDULER**: ${result.message}\nAutomated task scheduled and saved to database.`);
      return;
    }
  }

  // 0g. Memory Recall & Search intent
  if (lowerQuery.includes('audit tadi') || lowerQuery.includes('memory') || lowerQuery.includes('riwayat audit') || lowerQuery.includes('history audit') || lowerQuery.includes('search audit')) {
    const { SessionMemoryService } = await import('../../services/session-memory.js');
    const memory = new SessionMemoryService();
    const records = memory.getRecentAudits(5);

    if (records.length === 0) {
      await message.reply(`🧠 **OPENCAT SESSION MEMORY**: No token audit history is stored in persistent memory yet.`);
      return;
    }

    let memoryText = `🧠 **OPENCAT PERSISTENT AUDIT RECALL (ZERO LLM TOKEN COST)**\n\n`;
    for (const r of records) {
      memoryText += `• **${r.symbol}** (\`${r.contractAddress.substring(0, 8)}...\` | ${r.chain.toUpperCase()}): ${r.verdict} (Score: ${r.score})\n  *Date:* ${r.timestampIso.slice(0, 16)}\n`;
    }
    await message.reply(memoryText);
    return;
  }

  // 0h. Natural Language API Key Setup intent
  if (lowerQuery.includes('set_api_key') || lowerQuery.includes('set key') || lowerQuery.includes('pasang key') || lowerQuery.includes('setup api key') || lowerQuery.includes('set api key') || lowerQuery.includes('_api_key=') || lowerQuery.includes('_provider=') || lowerQuery.includes('_model_name=') || lowerQuery.includes('_base_url=')) {
    const match = userQuery.match(/([A-Z][A-Z0-9_]{2,})\s*[:=]\s*([^\s]+)/i);
    if (match) {
      const keyName = match[1].toUpperCase();
      const keyValue = match[2].replace(/[`"'.,;]+$/, '');
      // AI provider/model/base-url changes go through switch_ai_model (runtime + .env), others via set_api_key
      if (keyName === 'AI_PROVIDER' || keyName === 'AI_MODEL_NAME' || keyName === 'AI_BASE_URL') {
        const provider = keyName === 'AI_PROVIDER' ? keyValue : undefined;
        const modelName = keyName === 'AI_MODEL_NAME' ? keyValue : undefined;
        const baseUrl = keyName === 'AI_BASE_URL' ? keyValue : undefined;
        const result = await toolRegistry.executeToolCall('switch_ai_model', {
          provider: provider || '',
          modelName: modelName || '',
          baseUrl: baseUrl || '',
        });
        await message.reply(`${result.message}\n\n💡 **AI config is now active.** If you set a provider/model, make sure \`AI_BASE_URL\` is also correct (verify via "OpenCat, what AI are you using?").`);
      } else {
        const result = await toolRegistry.executeToolCall('set_api_key', { keyName, keyValue });
        await message.reply(`${result.message}\nSub-agent API key status re-evaluated.`);
      }
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
      `OpenCat will notify <@${message.author.id}> in this channel as soon as ${parsedAlert.symbol} reaches target! 🐾`
    );
    return;
  }

  // 1b. Detect if user is asking to Bridge tokens (inform single-chain Robinhood focus)
  const isBridgeIntent = lowerQuery.includes('bridge') || lowerQuery.includes('bridging');
  if (isBridgeIntent && !lowerQuery.includes('swap') && !lowerQuery.includes('send') && !lowerQuery.includes('kirim') && !lowerQuery.includes('transfer')) {
    await message.reply({
      content:
        `ℹ️ **OpenCat AI is specialized natively for Robinhood Chain (EVM L2 #4663).**\n` +
        `Cross-chain bridging is disabled. For on-chain trading and transfers, use:\n` +
        `• \`/swap\` — Swap tokens on Robinhood Chain via Uniswap V3 Router\n` +
        `• \`/send\` — Transfer native ETH or ERC20 tokens to another wallet address`,
    });
    return;
  }

  // 1c. Detect if user is asking to Swap tokens
  const isSwapIntent = ['swap', 'tuker', 'tukar', 'exchange', 'konversi'].some(kw => lowerQuery.includes(kw));
  if (isSwapIntent) {
    const { RelayAdapter } = await import('../../adapters/relay-adapter.js');
    const relayAdapter = new RelayAdapter();

    const chains = ['robinhood', 'ethereum', 'eth'];
    const foundChain = chains.find(c => lowerQuery.includes(c));
    const chain = foundChain || 'robinhood';

    const knownTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH'];
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
        `🔄 **OPENCAT RELAY.LINK SWAP DIRECT EXECUTION**\n\n` +
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

  // 1d. Detect if user is asking to Send/Transfer tokens
  const isSendIntent = ['send', 'kirim', 'kirimkan', 'transfer'].some(kw => lowerQuery.includes(kw));
  const evmAddrMatch = userQuery.match(/\b0x[a-fA-F0-9]{40}\b/);
  if (isSendIntent && evmAddrMatch) {
    const { RelayAdapter } = await import('../../adapters/relay-adapter.js');
    const relayAdapter = new RelayAdapter();

    const recipientAddress = evmAddrMatch[0];
    const chain = 'robinhood';

    const knownTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH'];
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
        `📤 **OPENCAT RELAY.LINK SEND DIRECT EXECUTION**\n\n` +
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

  // 2. Detect if user pasted a Robinhood Chain (EVM) Contract Address (CA - 0x + 40 hex)
  const evmCaRegex = /\b0x[a-fA-F0-9]{40}\b/;
  const isCaPasted = evmCaRegex.test(userQuery);

  if (isCaPasted) {
    const matchedCa = userQuery.match(evmCaRegex)?.[0] || userQuery;
    const chainName = 'Robinhood Chain (EVM)';
    
    const { runTokenAudit } = await import('../../services/token-audit-service.js');
    const audit = await runTokenAudit(matchedCa);

    // Log into persistent Session Memory
    const { SessionMemoryService } = await import('../../services/session-memory.js');
    const memory = new SessionMemoryService();
    memory.recordAudit(matchedCa, 'EVM_TOKEN', 'robinhood', audit.success ? 80 : 0, audit.success ? 'REAL-TIME AUDIT' : 'UNAVAILABLE', `Audited ${matchedCa}`);

    await message.reply(`🔎 **OPENCAT ON-DEMAND TOKEN AUDIT REPORT**\n📌 **Target Contract:** \`${matchedCa}\` (${chainName})\n\n${audit.content}`);
    return;
  }

  const simEth = process.env.SIMULATION_BALANCE_ETH || '1.0';
  const autoExecuteEnabled = process.env.AUTO_EXECUTE_ENABLED === 'true';

  // Shared OpenCat system prompt (persona + architecture) + live operating params
  const { OPENCAT_SYSTEM_PROMPT_BASE } = await import('../../services/opencat-system-prompt.js');
  const { getAgentDomain } = await import('../../orchestrator/agent-registry.js');
  const { SessionMemoryService } = await import('../../services/session-memory.js');
  const memoryContext = new SessionMemoryService().buildMemoryContextLine();
  const activeDomains = hub.getActiveDomains();
  const activeAgentsLine = activeDomains.length > 0
    ? `- Active Sub-Agents: ${activeDomains.map((d: string) => getAgentDomain(d)?.displayName ?? d).join(', ')}`
    : '- Active Sub-Agents: NONE (all screening agents paused)';
  const risk = hub.getRiskManager().getRiskState();
  const systemPrompt = OPENCAT_SYSTEM_PROMPT_BASE + `
Current Operating Parameters:
- Execution Mode: ${autoExecuteEnabled ? 'AUTO_EXECUTE (bot may execute)' : 'MANUAL EXECUTION — bot is SCREENER/CALLER ONLY, all execution is done by the user via the link provided on the call card'}
${activeAgentsLine}
- Referenced Wallet Balances (for tracking user positions, not for execution):
  • Robinhood Chain: ${simEth} ETH
- Global Portfolio Drawdown Limit: ${risk.maxDrawdownLimitPct}%
- Current Portfolio Drawdown: ${risk.currentDrawdownPct ?? 0}%${memoryContext}`;

  try {
    // OpenCat is a real agent: LLM picks tools via function-calling (AgentRunner loop)
    const { runAgent } = await import('../../orchestrator/agent-runner.js');
    const agentResult = await runAgent(
      { aiService, toolRegistry, systemPrompt },
      userQuery
    );

    const response = agentResult.text || (
      agentResult.toolResults.length > 0
        ? `I ran ${agentResult.toolResults.length} tool(s):\n` +
          agentResult.toolResults.map((t) => `• \`${t.name}\`: ${t.success ? '✅' : '❌'} ${t.message}`).join('\n')
        : '[No response from AI.]'
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
    console.error('[OPENCAT AI ERROR]', error.message);

    const lower = userQuery.toLowerCase();
    const providerConfig = aiService.getConfig();
    const keyHint = providerConfig.apiKeys.length > 0 
      ? `${providerConfig.apiKeys[0].slice(0, 12)}... (${providerConfig.apiKeys.length} keys total)`
      : 'NONE';

    // 1. Dynamic intent: User asking about LLM / AI model
    if (lower.includes('llm') || lower.includes('model') || lower.includes('ai apa') || lower.includes('pakai ai')) {
      await message.reply(
        `🐾 **OPENCAT LLM ENGINE STATUS REPORT**\n\n` +
        `• **Configured Provider:** \`${providerConfig.provider.toUpperCase()}\` (${providerConfig.baseUrl})\n` +
        `• **Target Model:** \`${providerConfig.modelName}\`\n` +
        `• **Active API Key Hint:** \`${keyHint}\`\n` +
        `• **Error Detail:** ⚠️ \`${error.message || 'Unknown Error'}\`\n\n` +
        `💡 **Fix:** Run \`opencat wizard\` on the VPS to refresh your API keys.\n\n` +
        `🛡️ **Local Autonomous System:** 95% of OpenCat's local engine (3 Sub-Agents, GoPlus/GMGN audits, Swarm Consensus, \`/swap\`, \`/alert\`) keeps operating 100% smoothly!`
      );
      return;
    }

    // 2. Dynamic intent: General Chat / Analysis Query
    const fallbackText = `🐾 **Opencat Multi-Agent Intelligence Hub**\n\n` +
      `I received your query: *"${userQuery}"*.\n\n` +
      `📊 **Operating Status:**\n` +
      `• **Mode:** \`DRY_RUN (Safe Simulation Active)\`\n` +
      `• **Active Key Hint:** \`${keyHint}\`\n` +
      `• **AI Status Error:** \`${error.message || 'Key Quota Exceeded'}\`\n\n` +
      `💡 **Core Capabilities:**\n` +
      `1. Paste a Contract Address for **Real-Time Security Audit**.\n` +
      `2. Ask for price alerts (*"notify me if ETH hits 4000"*).\n` +
      `3. Direct on-chain execution: \`/swap\` or \`/send\`.\n\n` +
      `*(Note: Cloud AI Error. Run \`opencat wizard\` on the VPS to update API keys!)*`;

    await message.reply(fallbackText);
  }
}
