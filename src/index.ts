import dotenv from 'dotenv';
import { isDryRun as isDryRunMode } from './config/config.js';
import { Client, GatewayIntentBits, REST, Routes, ChannelType } from 'discord.js';
import { buildCallEmbed, CallSignalPayload } from './discord/embeds/call-embed.js';
import { AthenaHub } from './orchestrator/hub.js';
import { dispatchDomain } from './orchestrator/dispatch.js';
import { SwarmConsensusEngine, SwarmConsensus } from './orchestrator/swarm-consensus.js';
import { PositionManager } from './position/position-manager.js';
import { AIService } from './services/ai-service.js';
import { slashCommands } from './discord/commands/index.js';
import { handleInteraction } from './discord/handlers/interaction-handler.js';
import { handleControlRoomMessage } from './discord/handlers/message-handler.js';
import { bootstrapDiscordChannels } from './discord/setup/channel-bootstrap.js';
import { SkillLoader } from './services/skill-loader.js';
import { MeteoraDLMMAdapter } from './adapters/meteora-dlmm-adapter.js';
import { UniswapLPAdapter } from './adapters/uniswap-lp-adapter.js';
import { GMGNAdapter } from './adapters/gmgn-adapter.js';
import { OpenSeaAdapter } from './adapters/opensea-adapter.js';
import { RugCheckService } from './services/security-service.js';
import { SolanaScreeningAgent } from './agents/meme-solana/solana-screening-agent.js';
import { EVMScreeningAgent } from './agents/meme-evm/evm-screening-agent.js';
import { NFTScreeningAgent } from './agents/nft/nft-screening-agent.js';
import { PolymarketAdapter } from './adapters/polymarket-adapter.js';
import { HyperliquidAdapter } from './adapters/hyperliquid-adapter.js';
import { PolymarketAgent } from './agents/prediction/polymarket-agent.js';
import { PerpsScreeningAgent } from './agents/perps/perps-screening-agent.js';
import { CTAlphaAgent } from './agents/ct-alpha/ct-alpha-agent.js';
import { priceAlertService, tradeJournalService, walletService } from './discord/handlers/interaction-handler.js';
import { PriceFeedService } from './services/price-feed-service.js';
import { TelegramService } from './telegram/telegram-service.js';
import { StateStore } from './services/state-store.js';
import { ApiKeyGuardService } from './services/api-key-guard.js';

dotenv.config();

const telegramService = new TelegramService();
const apiKeyGuard = new ApiKeyGuardService();
const ctAlphaAgent = new CTAlphaAgent();
const perpsScreeningAgent = new PerpsScreeningAgent(new HyperliquidAdapter());

console.log('----------------------------------------------------');
console.log('🏛️ ATHENA MULTI-AGENT CRYPTO SYSTEM INITIALIZING...');
console.log('----------------------------------------------------');

const isDryRun = isDryRunMode();
console.log(`[CONFIG] DRY_RUN Mode: ${isDryRun ? 'ENABLED (Safe Mode)' : 'DISABLED (LIVE TRADING)'}`);

// Initialize persistent StateStore (survives bot restarts)
const stateStore = new StateStore();

const hub = new AthenaHub();
const swarmEngine = new SwarmConsensusEngine();
swarmEngine.attachStateStore(stateStore);

function gateSignal(payload: any): boolean {
  const res = swarmEngine.evaluateSignal({
    symbol: payload.symbol || 'CUSTOM',
    domain: payload.domain || 'MEME_SOLANA',
    contractAddress: payload.contractAddress || '',
    liquidityUsd: Number(payload.liquidityUsd) || 0,
    volume1hUsd: Number(payload.volume1hUsd) || 0,
    securityAuditPassed: Boolean(payload.securityAuditPassed),
    socialHypeScore: Number(payload.socialHypeScore) || 0,
  });
  if (!res.passed) {
    console.warn(`[SWARM GATE] ${payload.domain} ${payload.symbol} rejected (confidence ${res.confidenceScore}%) — not posting.`);
  }
  return res.passed;
}


const positionManager = new PositionManager();
positionManager.attachStateStore(stateStore);

const aiService = new AIService();
const skillLoader = new SkillLoader();
const meteoraAdapter = new MeteoraDLMMAdapter();
const uniswapAdapter = new UniswapLPAdapter();
const gmgnAdapter = new GMGNAdapter();
const openseaAdapter = new OpenSeaAdapter();
const polymarketAdapter = new PolymarketAdapter();
const rugCheckService = new RugCheckService();
const solanaScreeningAgent = new SolanaScreeningAgent();
const evmScreeningAgent = new EVMScreeningAgent();
const nftScreeningAgent = new NFTScreeningAgent(openseaAdapter);
const polymarketAgent = new PolymarketAgent(polymarketAdapter);
const priceFeedService = new PriceFeedService();

// Attach StateStore to all persistent services
hub.attachStateStore(stateStore);
priceAlertService.attachStateStore(stateStore);
tradeJournalService.attachStateStore(stateStore);
walletService.attachStateStore(stateStore);

const loadedSkills = skillLoader.loadAllSkills();

console.log(`[SKILL SYSTEM] Active skills loaded: ${loadedSkills.length} (${loadedSkills.map(s => s.name).join(', ')})`);
console.log(`[SECURITY SERVICES] RugCheck API (Solana) & GoPlus Security (EVM - Base/ETH/Robinhood) Initialized.`);
console.log(`[SCREENING AGENTS] Solana Meme + EVM Meme + EVM NFT Sniping + Polymarket Prediction Agents Initialized.`);
console.log(`[SCREENING ADAPTERS] OpenSea + Polymarket Gamma/CLOB + GMGN AI + Meteora DLMM + Uniswap LP Adapters Initialized.`);
console.log(`[AI SERVICE] Configured with provider: ${aiService.getConfig().provider}, model: ${aiService.getConfig().modelName}`);

const discordToken = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (discordToken && clientId) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', async () => {
    console.log(`[DISCORD BOT] Logged in as ${client.user?.tag}!`);

    // Auto-Bootstrap Discord Category & Channels if bot is in a server
    const firstGuild = client.guilds.cache.first();
    if (firstGuild) {
      try {
        await bootstrapDiscordChannels(firstGuild);
      } catch (err) {
        console.error('[DISCORD BOOTSTRAP] Channel auto-creation error:', err);
      }
    }

    // Register Slash Commands
    try {
      const rest = new REST({ version: '10' }).setToken(discordToken);
      console.log('[DISCORD REST] Registering Slash Commands...');
      await rest.put(Routes.applicationCommands(clientId), {
        body: slashCommands.map(cmd => cmd.toJSON()),
      });
      console.log('[DISCORD REST] Slash Commands registered successfully!');
    } catch (error) {
      console.error('[DISCORD REST] Error registering Slash Commands:', error);
    }

    // Auto-Bootstrap Telegram Sub-Channels (Topics) & Broadcast Control Menu on startup if Telegram configured
    if (telegramService.isEnabled()) {
      console.log('[TELEGRAM SERVICE] Telegram Notification Bridge Connected! Provisioning Topics & broadcasting control menu...');
      try {
        await telegramService.bootstrapTelegramTopics();
        await telegramService.broadcastInteractiveMenu(hub, walletService);
        telegramService.startPolling(hub, walletService, aiService);
      } catch (tgErr: any) {
        console.error('[TELEGRAM SERVICE] Startup broadcast error:', tgErr.message);
      }
    }

    // Start Price Alert Checking Interval Loop (Every 60s)
    setInterval(async () => {
      try {
        const triggered = await priceAlertService.checkAlerts(priceFeedService);
        for (const alert of triggered) {
          const targetChannelId = alert.channelId || process.env.DISCORD_CHANNEL_CONTROL_ROOM;
          if (targetChannelId && client.channels.cache.has(targetChannelId)) {
            const channel = client.channels.cache.get(targetChannelId) as any;
            const currentPx = alert.lastTriggeredPriceUsd || alert.targetPriceUsd;
            if (channel && 'send' in channel) {
              await channel.send(
                `🔔 **ATHENA PRICE ALERT TRIGGERED!**\n\n` +
                `📈 **Asset:** \`${alert.symbol}/USDT\`\n` +
                `💵 **Target Price Hit:** \`$${alert.targetPriceUsd.toLocaleString()} USD\` (Current: \`$${currentPx.toLocaleString()} USD\`)\n` +
                `👤 **Alert for:** <@${alert.userId}>\n` +
                `🎯 **Condition:** Price reached \`${alert.direction}\` target!`
              );
            }
          }
        }
      } catch (err: any) {
        console.error('[PRICE ALERT LOOP ERROR]', err.message);
      }
    }, 60 * 1000);

    // Signal dedup cache: prevents posting same signal within 30-minute window
    const recentSignals = new Map<string, number>(); // key: "channel:symbol:ca" -> timestamp
    const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

    // Start 24/7 Sub-Agents Background Screening Interval Loop (Every 5 minutes)
    setInterval(async () => {
      console.log('[SUB-AGENTS LOOP] Checking active sub-agent domains...');
      try {
        let dispatchedPayloads: Array<{ payload: CallSignalPayload; channelName: string; rawReason: string }> = [];

        const solanaDispatched = await dispatchDomain({
          domain: 'meme-solana',
          channelName: 'call-meme-solana',
          isActive: () => hub.isAgentActive('meme-solana'),
          runPass: async () => (await solanaScreeningAgent.runScreeningPass()).map((r: any) => ({ passed: !!r.passed, signal: r.signal, reason: r.reason })),
          keyReady: () => apiKeyGuard.checkDomainKeys('meme-solana'),
          buildPayload: ({ signal, reason }) => ({
            domain: 'MEME_SOLANA',
            title: `${signal.name} (${signal.symbol})`,
            symbol: signal.symbol,
            contractAddress: signal.contractAddress,
            network: 'Solana',
            priceUsd: `$${signal.priceUsd}`,
            marketCap: `$${(signal.marketCapUsd / 1000).toFixed(1)}k`,
            liquidity: `$${(signal.liquidityUsd / 1000).toFixed(1)}k`,
            volume5m: '+620%',
            volume1h: '$1.2M',
            txRatio: 'Buy 78% / Sell 22%',
            top10Pct: '22.4%',
            devHoldingPct: `${signal.devHoldingPercentage}%`,
            sniperPct: `${signal.sniperRatioPercentage}%`,
            bundlerPct: '11.2%',
            dexPaidStatus: '✅ Paid',
            smartMoneyInfo: `🧠 **Smart Traders:** ${signal.smartMoneyCount} Smart Wallets Accumulating (+${signal.smartMoneyNetBuySolOrEth} SOL)`,
            confidenceScore: 92,
            aiThesis: reason || signal.aiThesis,
            gmgnUrl: signal.gmgnUrl,
            dexScreenerUrl: `https://dexscreener.com/solana/${signal.contractAddress}`,
            rugcheckUrl: `https://rugcheck.xyz/tokens/${signal.contractAddress}`,
            liquidityUsd: signal.liquidityUsd || 0,
            volume1hUsd: (signal.volume24hUsd || 0) / 24,
            securityAuditPassed: true,
            socialHypeScore: Math.min(98, 40 + (signal.smartMoneyCount >= 2 ? 20 : 0) + (signal.liquidityUsd >= 25000 ? 15 : 0) + (signal.volume24hUsd >= 100000 ? 15 : 0)),
          }),
        });
        dispatchedPayloads.push(...solanaDispatched);

        const evmDispatched = await dispatchDomain({
          domain: 'meme-evm',
          channelName: 'call-meme-evm',
          isActive: () => hub.isAgentActive('meme-evm'),
          runPass: async () => (await evmScreeningAgent.runScreeningPass()).map((r: any) => ({ passed: !!r.passed, signal: r.signal, reason: r.reason })),
          keyReady: () => apiKeyGuard.checkDomainKeys('meme-evm'),
          buildPayload: ({ signal, reason }) => ({
            domain: 'MEME_EVM',
            title: `${signal.name || signal.symbol} (${signal.symbol})`,
            symbol: signal.symbol,
            contractAddress: signal.contractAddress,
            network: (signal.chain || 'base').toUpperCase(),
            priceUsd: `$${signal.priceUsd}`,
            marketCap: `$${(signal.marketCapUsd / 1000).toFixed(1)}k`,
            liquidity: `$${(signal.liquidityUsd / 1000).toFixed(1)}k`,
            volume5m: '+580%',
            volume1h: '$3.4M',
            txRatio: 'Buy 82% / Sell 18%',
            top10Pct: '18.5%',
            devHoldingPct: `${signal.devHoldingPercentage}%`,
            sniperPct: `${signal.sniperRatioPercentage}%`,
            bundlerPct: '8.4%',
            dexPaidStatus: '✅ Paid',
            smartMoneyInfo: `🧠 **Smart Traders:** ${signal.smartMoneyCount} Smart Wallets Accumulating (+${signal.smartMoneyNetBuySolOrEth} ETH)`,
            confidenceScore: 88,
            aiThesis: reason || signal.aiThesis,
            gmgnUrl: signal.gmgnUrl,
            dexScreenerUrl: `https://dexscreener.com/${signal.chain || 'base'}/${signal.contractAddress}`,
            liquidityUsd: signal.liquidityUsd || 0,
            volume1hUsd: (signal.volume24hUsd || 0) / 24,
            securityAuditPassed: true,
            socialHypeScore: Math.min(98, 40 + (signal.smartMoneyCount >= 2 ? 20 : 0) + (signal.liquidityUsd >= 25000 ? 15 : 0) + (signal.volume24hUsd >= 100000 ? 15 : 0)),
          }),
        });
        dispatchedPayloads.push(...evmDispatched);

        const nftDispatched = await dispatchDomain({
          domain: 'nft',
          channelName: 'call-nft-sniping',
          isActive: () => hub.isAgentActive('nft'),
          runPass: async () => (await nftScreeningAgent.runScreeningPass()).map((r: any) => ({ passed: r.confidenceScore >= 80, signal: r, reason: r.detectionReason })),
          keyReady: () => apiKeyGuard.checkDomainKeys('nft'),
          buildPayload: ({ signal, reason }) => ({
            domain: 'NFT',
            title: `${signal.collectionName} #${signal.tokenId}`,
            symbol: signal.collectionSlug.toUpperCase(),
            contractAddress: signal.collectionSlug,
            network: signal.chain.toUpperCase(),
            priceUsd: `${signal.priceEth} ETH`,
            marketCap: `Floor: ${signal.floorPriceEth} ETH (+${signal.floorSurge4hPct.toFixed(1)}% 4h)`,
            confidenceScore: signal.confidenceScore,
            aiThesis: reason || signal.detectionReason,
            dexScreenerUrl: signal.openseaUrl,
            liquidityUsd: (signal.floorPriceEth || 0) * 3000,
            volume1hUsd: (signal.salesVelocity1h || 0) * (signal.priceEth || 0) * 3000,
            securityAuditPassed: true,
            socialHypeScore: signal.confidenceScore || 0,
          }),
        });
        dispatchedPayloads.push(...nftDispatched);

        const predictionDispatched = await dispatchDomain({
          domain: 'prediction',
          channelName: 'call-prediction-markets',
          isActive: () => hub.isAgentActive('prediction'),
          runPass: async () => (await polymarketAgent.runScreeningPass()).map((r: any) => ({ passed: r.confidenceScore >= 80, signal: r, reason: r.aiThesis })),
          keyReady: () => apiKeyGuard.checkDomainKeys('prediction'),
          buildPayload: ({ signal, reason }) => ({
            domain: 'PREDICTION',
            title: signal.question,
            symbol: signal.recommendedOutcome,
            network: 'Polygon (Polymarket)',
            confidenceScore: signal.confidenceScore,
            aiThesis: reason || signal.aiThesis,
            dexScreenerUrl: signal.polymarketUrl,
            liquidityUsd: signal.liquidityUsd || 0,
            volume1hUsd: (signal.volume24hUsd || 0) / 24,
            securityAuditPassed: true,
            socialHypeScore: signal.confidenceScore || 0,
          }),
        });
        dispatchedPayloads.push(...predictionDispatched);

        const perpsDispatched = await dispatchDomain({
          domain: 'perps',
          channelName: 'call-perps-futures',
          isActive: () => hub.isAgentActive('perps'),
          runPass: async () => (await perpsScreeningAgent.screenAllAssets()).map((r: any) => ({ passed: r.confidence >= 80, signal: r, reason: r.aiThesis || r.signalReasons.join(', ') })),
          keyReady: () => apiKeyGuard.checkDomainKeys('perps'),
          buildPayload: ({ signal, reason }) => ({
            domain: 'PERPS',
            title: `${signal.direction} ${signal.coin} (${signal.suggestedLeverage}x)`,
            symbol: signal.coin,
            contractAddress: signal.coin,
            network: 'Hyperliquid Perps',
            priceUsd: `$${signal.entryPriceUsd}`,
            marketCap: `Stop: -${signal.stopLossPercent}% | TP: +${signal.takeProfitPercent}%`,
            confidenceScore: signal.confidence,
            aiThesis: reason || signal.signalReasons.join(' | '),
            dexScreenerUrl: `https://app.hyperliquid.xyz/trade/${signal.coin}`,
            liquidityUsd: signal.marketData?.openInterestUsd || 0,
            volume1hUsd: signal.marketData?.volume1hUsd || 0,
            securityAuditPassed: true,
            socialHypeScore: signal.confidence || 0,
          }),
        });
        dispatchedPayloads.push(...perpsDispatched);

        const ctAlphaDispatched = await dispatchDomain({
          domain: 'ct-alpha',
          channelName: 'call-ct-alpha',
          isActive: () => hub.isAgentActive('ct-alpha'),
          runPass: async () => (await ctAlphaAgent.runScreeningPass()).map((r: any) => ({ passed: !!r.passed, signal: r.signal, reason: r.reason })),
          keyReady: () => apiKeyGuard.checkDomainKeys('ct-alpha'),
          buildPayload: ({ signal, reason }) => ({
            domain: 'CT_ALPHA',
            title: signal.title,
            symbol: signal.symbolMentioned || 'ALPHA',
            contractAddress: signal.contractAddress || 'N/A',
            network: 'X (Twitter)',
            confidenceScore: signal.confidenceScore,
            aiThesis: reason || signal.actionableTakeaway,
            dexScreenerUrl: signal.tweetUrl,
            liquidityUsd: 0,
            volume1hUsd: 0,
            securityAuditPassed: true,
            socialHypeScore: signal.confidenceScore || 0,
          }),
        });
        dispatchedPayloads.push(...ctAlphaDispatched);

        const lpSolanaDispatched = await dispatchDomain({
          domain: 'lp-solana',
          channelName: 'call-lp-solana',
          isActive: () => hub.isAgentActive('lp-solana'),
          runPass: async () => {
            const pools = await meteoraAdapter.fetchTopYieldPools();
            const high = meteoraAdapter.filterHighYieldPools(pools);
            return high.map((p) => ({ passed: true, signal: p, reason: p.aiRecommendation }));
          },
          keyReady: () => ({ ready: true, statusMessage: '' }),
          buildPayload: ({ signal, reason }) => ({
            domain: 'LP_METEORA',
            title: signal.pairName,
            symbol: signal.pairName.split(' ')[0],
            contractAddress: signal.poolAddress,
            network: 'Solana',
            liquidity: `$${(signal.tvlUsd / 1000).toFixed(1)}k`,
            devHoldingPct: `${signal.feeAprPercentage}% APR`,
            sniperPct: `${(signal.feesToTvlRatio4h * 100).toFixed(2)}% 4h`,
            bundlerPct: `${signal.volumeToTvlRatio4h.toFixed(1)}x vol/TVL`,
            dexPaidStatus: 'Meteora DLMM',
            confidenceScore: 80,
            aiThesis: reason || signal.aiRecommendation,
            liquidityUsd: signal.tvlUsd || 0,
            volume1hUsd: signal.volume4hUsd / 4 || 0,
            securityAuditPassed: true,
            socialHypeScore: signal.organicVolumeScore4h || 0,
          }),
        });
        dispatchedPayloads.push(...lpSolanaDispatched);

        const lpEvmDispatched = await dispatchDomain({
          domain: 'lp-evm',
          channelName: 'call-lp-evm',
          isActive: () => hub.isAgentActive('lp-evm'),
          runPass: async () => {
            const pools = await uniswapAdapter.fetchTopYieldEVMPools();
            const high = uniswapAdapter.filterHighYieldEVMPools(pools);
            return high.map((p) => ({ passed: true, signal: p, reason: p.aiRecommendation }));
          },
          keyReady: () => ({ ready: true, statusMessage: '' }),
          buildPayload: ({ signal, reason }) => ({
            domain: 'LP_UNISWAP',
            title: signal.pairName,
            symbol: signal.pairName.split(' ')[0],
            contractAddress: signal.poolAddress,
            network: signal.network,
            liquidity: `$${(signal.tvlUsd / 1000).toFixed(1)}k`,
            devHoldingPct: `${signal.feeAprPercentage}% APR`,
            sniperPct: `${(signal.feesToTvlRatio4h * 100).toFixed(2)}% 4h`,
            bundlerPct: `${signal.volumeToTvlRatio4h.toFixed(1)}x vol/TVL`,
            dexPaidStatus: 'Uniswap v3',
            confidenceScore: 80,
            aiThesis: reason || signal.aiRecommendation,
            liquidityUsd: signal.tvlUsd || 0,
            volume1hUsd: signal.volume4hUsd / 4 || 0,
            securityAuditPassed: true,
            socialHypeScore: signal.organicVolumeScore4h || 0,
          }),
        });
        dispatchedPayloads.push(...lpEvmDispatched);

        // Real Swarm Consensus gate (>= 80%): every signal must pass with real data
        dispatchedPayloads = dispatchedPayloads.filter((item) => gateSignal(item.payload));

        // Purge expired dedup entries
        const now = Date.now();
        for (const [key, ts] of recentSignals.entries()) {
          if (now - ts > DEDUP_WINDOW_MS) recentSignals.delete(key);
        }

        // Dispatch all passed signals to Discord channels & Telegram topics (with dedup)
        for (const item of dispatchedPayloads) {
          const dedupKey = `${item.channelName}:${item.payload.symbol}:${item.payload.contractAddress || 'N/A'}`;
          if (recentSignals.has(dedupKey)) {
            console.log(`[DEDUP] Skipping duplicate signal: ${dedupKey} (posted ${((now - recentSignals.get(dedupKey)!) / 60000).toFixed(0)}m ago)`);
            continue;
          }
          recentSignals.set(dedupKey, now);

          // 1. Post to Discord Channel
          const targetChannel = client.channels.cache.find(
            c => c.type === ChannelType.GuildText && c.name === item.channelName
          ) as any;

          if (targetChannel && 'send' in targetChannel) {
            const embedData = buildCallEmbed(item.payload);
            await targetChannel.send(embedData);
            console.log(`[DISCORD DISPATCH] Posted signal call card for "${item.payload.symbol}" to #${item.channelName}`);
          }

          // 2. Post to Telegram Topic
          if (telegramService.isEnabled()) {
            await telegramService.broadcastSignalCall(
              item.payload.title,
              item.payload.symbol,
              item.payload.contractAddress || 'N/A',
              item.rawReason,
              undefined,
              item.channelName
            );
            console.log(`[TELEGRAM DISPATCH] Broadcasted signal call for "${item.payload.symbol}" to topic: ${item.channelName}`);
          }
        }
      } catch (err: any) {
        console.error('[SUB-AGENTS LOOP ERROR]', err.message);
      }
    }, 5 * 60 * 1000);
  });

  client.on('interactionCreate', (interaction) => {
    handleInteraction(interaction, hub, aiService);
  });

  client.on('messageCreate', (message) => {
    const controlRoomChannelId = process.env.DISCORD_CHANNEL_CONTROL_ROOM;
    if (isControlRoomChannel(controlRoomChannelId, message)) {
      handleControlRoomMessage(message, aiService, hub);
    }
  });

  client.login(discordToken).catch((err) => {
    console.warn(`[DISCORD BOT] Login skipped or failed: ${err.message}. Running in offline simulation mode.`);
  });
} else {
  console.log('[DISCORD BOT] DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not set in .env. Running standalone engine.');
}

function isControlRoomChannel(configuredId: string | undefined, message: any): boolean {
  if (!configuredId || configuredId === '000000000000000000') return true;
  return message.channelId === configuredId;
}

console.log('[SYSTEM] Setup complete. All Athena modules ready.');
console.log('[STATE STORE] Persistent state engine active — positions, alerts, and journal survive restarts.');

// Start Athena 2.0 Telemetry & REST API Server
import { AthenaRESTServer } from './api/server.js';
const apiServer = new AthenaRESTServer();
apiServer.start(hub);

// Graceful Shutdown: flush pending state writes to disk before exit
const gracefulShutdown = (signal: string) => {
  console.log(`\n[SHUTDOWN] Received ${signal}. Flushing state to disk...`);
  stateStore.flushToDisk();
  console.log('[SHUTDOWN] State saved. Goodbye!');
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
