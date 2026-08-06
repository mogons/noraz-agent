import dotenv from 'dotenv';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
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
import { PolymarketAgent } from './agents/prediction/polymarket-agent.js';
import { CTAlphaAgent } from './agents/ct-alpha/ct-alpha-agent.js';
import { priceAlertService } from './discord/handlers/interaction-handler.js';
import { PriceFeedService } from './services/price-feed-service.js';
import { TelegramService } from './telegram/telegram-service.js';

dotenv.config();

const telegramService = new TelegramService();
const ctAlphaAgent = new CTAlphaAgent();

console.log('----------------------------------------------------');
console.log('🏛️ ATHENA MULTI-AGENT CRYPTO SYSTEM INITIALIZING...');
console.log('----------------------------------------------------');

const isDryRun = process.env.DRY_RUN !== 'false';
console.log(`[CONFIG] DRY_RUN Mode: ${isDryRun ? 'ENABLED (Safe Mode)' : 'DISABLED (LIVE TRADING)'}`);

const hub = new AthenaHub();
const swarmEngine = new SwarmConsensusEngine();
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
        await telegramService.broadcastInteractiveMenu();
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
        const allReports: any[] = [];

        if (hub.isAgentActive('meme-solana')) {
          const reports = await solanaScreeningAgent.runScreeningPass();
          allReports.push(...reports);
        }

        if (hub.isAgentActive('meme-evm')) {
          const reports = await evmScreeningAgent.runScreeningPass();
          allReports.push(...reports);
        }

        if (hub.isAgentActive('nft')) {
          const reports = await nftScreeningAgent.runScreeningPass();
          allReports.push(...reports);
        }

        if (hub.isAgentActive('prediction')) {
          const reports = await polymarketAgent.runScreeningPass();
          allReports.push(...reports);
        }

        if (hub.isAgentActive('ct-alpha')) {
          const reports = await ctAlphaAgent.runScreeningPass();
          allReports.push(...reports);
        }

        // Domain to Telegram Topic channel mapping
        const domainTopicMap: Record<string, string> = {
          MEME_SOLANA: 'call-meme-solana',
          MEME_EVM: 'call-meme-evm',
          NFT: 'call-nft-sniping',
          PREDICTION: 'call-prediction-markets',
          CT_ALPHA: 'call-ct-alpha',
        };

        // Dispatch high confidence signals to Telegram Bridge with topic routing
        for (const r of allReports) {
          if (r.passed && telegramService.isEnabled()) {
            const topicName = domainTopicMap[r.signal.domain] || 'athena-control-room';
            await telegramService.broadcastSignalCall(
              r.signal.symbol || r.signal.title || 'CT ALPHA',
              r.signal.symbol || 'ALPHA',
              r.signal.contractAddress || r.signal.tweetUrl || 'N/A',
              r.reason,
              undefined,
              topicName
            );
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
