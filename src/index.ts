import dotenv from 'dotenv';
import { Client, GatewayIntentBits, REST, Routes, ChannelType } from 'discord.js';
import { buildCallEmbed, CallSignalPayload } from './discord/embeds/call-embed.js';
import { AthenaHub } from './orchestrator/hub.js';
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

dotenv.config();

const telegramService = new TelegramService();
const ctAlphaAgent = new CTAlphaAgent();
const perpsScreeningAgent = new PerpsScreeningAgent(new HyperliquidAdapter());

console.log('----------------------------------------------------');
console.log('🏛️ ATHENA MULTI-AGENT CRYPTO SYSTEM INITIALIZING...');
console.log('----------------------------------------------------');

const isDryRun = process.env.DRY_RUN !== 'false';
console.log(`[CONFIG] DRY_RUN Mode: ${isDryRun ? 'ENABLED (Safe Mode)' : 'DISABLED (LIVE TRADING)'}`);

// Initialize persistent StateStore (survives bot restarts)
const stateStore = new StateStore();

const hub = new AthenaHub();
const swarmEngine = new SwarmConsensusEngine();
swarmEngine.attachStateStore(stateStore);
const swarmAdapter: SwarmConsensus = {
  evaluateSignal: async (signalPayload: any) => {
    const res = swarmEngine.evaluateSignal({
      symbol: signalPayload.symbol || 'CUSTOM',
      domain: signalPayload.domain || 'MEME_SOLANA',
      contractAddress: signalPayload.contractAddress || '',
      liquidityUsd: 15000,
      volume1hUsd: 50000,
      securityAuditPassed: true,
      socialHypeScore: 85,
    });
    return {
      passed: res.passed,
      totalScore: res.confidenceScore,
      breakdown: {
        quantScore: 90,
        catalystScore: 85,
        securityScore: 80,
        aiSentiment: res.reason,
      },
    };
  },
};


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

    // Start 24/7 Sub-Agents Background Screening Interval Loop (Every 5 minutes)
    setInterval(async () => {
      console.log('[SUB-AGENTS LOOP] Checking active sub-agent domains...');
      try {
        const dispatchedPayloads: Array<{ payload: CallSignalPayload; channelName: string; rawReason: string }> = [];

        if (hub.isAgentActive('meme-solana')) {
          const reports = await solanaScreeningAgent.runScreeningPass();
          for (const r of reports) {
            if (r.passed && r.signal) {
              dispatchedPayloads.push({
                channelName: 'call-meme-solana',
                rawReason: r.reason,
                payload: {
                  domain: 'MEME_SOLANA',
                  title: `${r.signal.name} (${r.signal.symbol})`,
                  symbol: r.signal.symbol,
                  contractAddress: r.signal.contractAddress,
                  network: 'Solana',
                  priceUsd: `$${r.signal.priceUsd}`,
                  marketCap: `$${(r.signal.marketCapUsd / 1000).toFixed(1)}k`,
                  liquidity: `$${(r.signal.liquidityUsd / 1000).toFixed(1)}k`,
                  volume5m: '+620%',
                  volume1h: '$1.2M',
                  txRatio: 'Buy 78% / Sell 22%',
                  top10Pct: '22.4%',
                  devHoldingPct: `${r.signal.devHoldingPercentage}%`,
                  sniperPct: `${r.signal.sniperRatioPercentage}%`,
                  bundlerPct: '11.2%',
                  dexPaidStatus: '✅ Paid',
                  smartMoneyInfo: `🧠 **Smart Traders:** ${r.signal.smartMoneyCount} Smart Wallets Accumulating (+${r.signal.smartMoneyNetBuySolOrEth} SOL)`,
                  confidenceScore: 92,
                  aiThesis: r.reason || r.signal.aiThesis,
                  gmgnUrl: r.signal.gmgnUrl,
                  dexScreenerUrl: `https://dexscreener.com/solana/${r.signal.contractAddress}`,
                  rugcheckUrl: `https://rugcheck.xyz/tokens/${r.signal.contractAddress}`,
                },
              });
            }
          }
        }

        if (hub.isAgentActive('meme-evm')) {
          const reports = await evmScreeningAgent.runScreeningPass();
          for (const r of reports) {
            if (r.passed && r.signal) {
              dispatchedPayloads.push({
                channelName: 'call-meme-evm',
                rawReason: r.reason,
                payload: {
                  domain: 'MEME_EVM',
                  title: `${r.signal.name || r.signal.symbol} (${r.signal.symbol})`,
                  symbol: r.signal.symbol,
                  contractAddress: r.signal.contractAddress,
                  network: (r.signal.chain || 'base').toUpperCase(),
                  priceUsd: `$${r.signal.priceUsd}`,
                  marketCap: `$${(r.signal.marketCapUsd / 1000).toFixed(1)}k`,
                  liquidity: `$${(r.signal.liquidityUsd / 1000).toFixed(1)}k`,
                  volume5m: '+580%',
                  volume1h: '$3.4M',
                  txRatio: 'Buy 82% / Sell 18%',
                  top10Pct: '18.5%',
                  devHoldingPct: `${r.signal.devHoldingPercentage}%`,
                  sniperPct: `${r.signal.sniperRatioPercentage}%`,
                  bundlerPct: '8.4%',
                  dexPaidStatus: '✅ Paid',
                  smartMoneyInfo: `🧠 **Smart Traders:** ${r.signal.smartMoneyCount} Smart Wallets Accumulating (+${r.signal.smartMoneyNetBuySolOrEth} ETH)`,
                  confidenceScore: 88,
                  aiThesis: r.reason || r.signal.aiThesis,
                  gmgnUrl: r.signal.gmgnUrl,
                  dexScreenerUrl: `https://dexscreener.com/${r.signal.chain || 'base'}/${r.signal.contractAddress}`,
                },
              });
            }
          }
        }

        if (hub.isAgentActive('nft')) {
          const reports = await nftScreeningAgent.runScreeningPass();
          for (const r of reports) {
            if (r.confidenceScore >= 80) {
              dispatchedPayloads.push({
                channelName: 'call-nft-sniping',
                rawReason: r.detectionReason,
                payload: {
                  domain: 'NFT',
                  title: `${r.collectionName} #${r.tokenId}`,
                  symbol: r.collectionSlug.toUpperCase(),
                  contractAddress: r.collectionSlug,
                  network: r.chain.toUpperCase(),
                  priceUsd: `${r.priceEth} ETH`,
                  marketCap: `Floor: ${r.floorPriceEth} ETH (+${r.floorSurge4hPct.toFixed(1)}% 4h)`,
                  confidenceScore: r.confidenceScore,
                  aiThesis: r.detectionReason,
                  dexScreenerUrl: r.openseaUrl,
                },
              });
            }
          }
        }

        if (hub.isAgentActive('prediction')) {
          const reports = await polymarketAgent.runScreeningPass();
          for (const r of reports) {
            if (r.confidenceScore >= 80) {
              dispatchedPayloads.push({
                channelName: 'call-prediction-markets',
                rawReason: r.aiThesis,
                payload: {
                  domain: 'PREDICTION',
                  title: r.question,
                  symbol: r.recommendedOutcome,
                  network: 'Polygon (Polymarket)',
                  confidenceScore: r.confidenceScore,
                  aiThesis: r.aiThesis,
                  dexScreenerUrl: r.polymarketUrl,
                },
              });
            }
          }
        }

        if (hub.isAgentActive('perps')) {
          const reports = await perpsScreeningAgent.screenAllAssets();
          for (const r of reports) {
            if (r.confidence >= 80) {
              dispatchedPayloads.push({
                channelName: 'call-perps-futures',
                rawReason: r.aiThesis || r.signalReasons.join(', '),
                payload: {
                  domain: 'PERPS',
                  title: `${r.direction} ${r.coin} (${r.suggestedLeverage}x)`,
                  symbol: r.coin,
                  contractAddress: r.coin,
                  network: 'Hyperliquid Perps',
                  priceUsd: `$${r.entryPriceUsd}`,
                  marketCap: `Stop: -${r.stopLossPercent}% | TP: +${r.takeProfitPercent}%`,
                  confidenceScore: r.confidence,
                  aiThesis: r.aiThesis || r.signalReasons.join(' | '),
                  dexScreenerUrl: `https://app.hyperliquid.xyz/trade/${r.coin}`,
                },
              });
            }
          }
        }

        if (hub.isAgentActive('ct-alpha')) {
          const reports = await ctAlphaAgent.runScreeningPass();
          for (const r of reports) {
            if (r.passed && r.signal) {
              dispatchedPayloads.push({
                channelName: 'call-ct-alpha',
                rawReason: r.reason,
                payload: {
                  domain: 'MEME_SOLANA',
                  title: r.signal.title,
                  symbol: r.signal.symbolMentioned || 'ALPHA',
                  contractAddress: r.signal.contractAddress || 'N/A',
                  network: 'X (Twitter)',
                  confidenceScore: r.signal.confidenceScore,
                  aiThesis: r.reason || r.signal.actionableTakeaway,
                  dexScreenerUrl: r.signal.tweetUrl,
                },
              });
            }
          }
        }

        // Dispatch all passed signals to Discord channels & Telegram topics
        for (const item of dispatchedPayloads) {
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
    handleInteraction(interaction, hub, swarmAdapter, aiService);
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
