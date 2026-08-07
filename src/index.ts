import dotenv from 'dotenv';
import { isDryRun as isDryRunMode } from './config/config.js';
import { Client, GatewayIntentBits, REST, Routes, ChannelType } from 'discord.js';
import { buildCallEmbed } from './discord/embeds/call-embed.js';
import type { CallCardPayload as CallSignalPayload } from './agents/shared/agent-contract.js';
import { AthenaHub } from './orchestrator/hub.js';
import { dispatchDomain, buildLPPayload } from './orchestrator/dispatch.js';
import { SwarmConsensusEngine } from './orchestrator/swarm-consensus.js';
import { StrategyEngine } from './orchestrator/strategy-engine.js';
import { PositionManager } from './position/position-manager.js';
import { AIService } from './services/ai-service.js';
import { slashCommands } from './discord/commands/index.js';
import { handleInteraction } from './discord/handlers/interaction-handler.js';
import { handleControlRoomMessage } from './discord/handlers/message-handler.js';
import { globalHealthWatcher } from './services/health-watcher.js';
import { globalMarketRegimeFilter } from './services/market-regime.js';
import { bootstrapDiscordChannels } from './discord/setup/channel-bootstrap.js';
import { SkillLoader } from './services/skill-loader.js';
import { MeteoraDLMMAdapter } from './adapters/meteora-dlmm-adapter.js';
import { UniswapLPAdapter } from './adapters/uniswap-lp-adapter.js';
import { OpenSeaAdapter } from './adapters/opensea-adapter.js';
import { SolanaTradeAdapter } from './adapters/solana-adapter.js';
import { EVMTradeAdapter } from './adapters/evm-adapter.js';
import { GMGNAdapter } from './adapters/gmgn-adapter.js';
import { SolanaScreeningAgent } from './agents/meme-solana/solana-screening-agent.js';
import { RobinhoodScreeningAgent } from './agents/meme-robinhood/robinhood-screening-agent.js';
import { NFTScreeningAgent } from './agents/nft/nft-screening-agent.js';
import { PolymarketAdapter } from './adapters/polymarket-adapter.js';
import { HyperliquidAdapter } from './adapters/hyperliquid-adapter.js';
import { PolymarketAgent } from './agents/prediction/polymarket-agent.js';
import { PerpsScreeningAgent } from './agents/perps/perps-screening-agent.js';
import { CTAlphaAgent } from './agents/ct-alpha/ct-alpha-agent.js';
import { priceAlertService, tradeJournalService, walletService, priceFeedService } from './discord/handlers/interaction-handler.js';
import { TelegramService } from './telegram/telegram-service.js';
import { StateStore } from './services/state-store.js';
import { ApiKeyGuardService } from './services/api-key-guard.js';
import { globalRiskEngineV2 } from './orchestrator/risk-engine-v2.js';
import { WalletTracker } from './services/wallet-tracker.js';

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

// Wire sandboxed StrategyEngine into Swarm Consensus (active strategy can adjust confidence)
const strategyEngine = new StrategyEngine();
SwarmConsensusEngine.setStrategyProvider((domain: string) => strategyEngine.getActiveStrategy(domain));

function gateSignal(payload: any): boolean {
  const res = swarmEngine.evaluateSignal({
    symbol: payload.symbol || 'CUSTOM',
    domain: payload.domain || 'MEME_SOLANA',
    contractAddress: payload.contractAddress || '',
    liquidityUsd: Number(payload.liquidityUsd) || 0,
    volume1hUsd: Number(payload.volume1hUsd) || 0,
    securityAuditPassed: Boolean(payload.securityAuditPassed),
    socialHypeScore: Number(payload.socialHypeScore) || 0,
    confidence: Number(payload.confidenceScore) || undefined,
  });
  if (!res.passed) {
    console.warn(`[SWARM GATE] ${payload.domain} ${payload.symbol} rejected (confidence ${res.confidenceScore}%) — not posting.`);
  }
  return res.passed;
}

// Rate-limited Discord notification to #athena-control-room (never spam)
const controlRoomNotifyCooldown = new Map<string, number>();
const CONTROL_ROOM_NOTIFY_MS = 10 * 60 * 1000; // max 1 notif per key per 10 minutes

// Per-agent screening timeout: a stuck pass logs and resolves to [] (fail-closed),
// so one hung agent can never stall the whole sub-agent loop.
const SCREENING_TIMEOUT_MS = Math.max(1000, Number(process.env.SCREENING_TIMEOUT_MS) || 60000);
function withScreeningTimeout<T>(promise: Promise<T>, domain: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[SCREENING TIMEOUT] ${domain.toUpperCase()} pass exceeded ${SCREENING_TIMEOUT_MS}ms — discarded, no signals emitted (fail-closed).`);
      resolve([] as unknown as T);
    }, SCREENING_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

// Perps call-card titles are formatted `${direction} ${coin} (${leverage}x)`; extract
// direction/leverage for the auto-execute simulation log (fallbacks if title deviates).
function parsePerpsSimulation(title: string | undefined): { direction: string; leverage: string } {
  const m = String(title || '').match(/^(LONG|SHORT)\s+\S+\s+\(([\d.]+)x\)/);
  return { direction: m ? m[1] : 'LONG', leverage: m ? m[2] : '10' };
}

async function notifyControlRoom(client: any, key: string, content: string): Promise<void> {
  const now = Date.now();
  const last = controlRoomNotifyCooldown.get(key);
  if (last && now - last < CONTROL_ROOM_NOTIFY_MS) return;
  controlRoomNotifyCooldown.set(key, now);
  try {
    const channel = client.channels.cache.find(
      (c: any) => c.type === ChannelType.GuildText && c.name === 'athena-control-room'
    );
    if (channel && 'send' in channel) {
      await channel.send(content);
    }
  } catch (err: any) {
    console.warn(`[NOTIFY] Control room notification failed (${key}): ${err.message}`);
  }
}


const positionManager = new PositionManager();
positionManager.attachStateStore(stateStore);

// Wallet auto-tracker: mirrors user's on-chain holdings into PositionManager lifecycle + exit alerts
const walletTracker = new WalletTracker({ positionManager, stateStore, gmgn: new GMGNAdapter(), walletService, tradeJournal: tradeJournalService });

const aiService = new AIService();
const skillLoader = new SkillLoader();
const meteoraAdapter = new MeteoraDLMMAdapter();
const uniswapAdapter = new UniswapLPAdapter();
const openseaAdapter = new OpenSeaAdapter();
const polymarketAdapter = new PolymarketAdapter();
const solanaTradeAdapter = new SolanaTradeAdapter();
const evmTradeAdapter = new EVMTradeAdapter();
const solanaScreeningAgent = new SolanaScreeningAgent();
const robinhoodScreeningAgent = new RobinhoodScreeningAgent();
const nftScreeningAgent = new NFTScreeningAgent(openseaAdapter);
const polymarketAgent = new PolymarketAgent(polymarketAdapter);

// Wire shared adapters + singleton agent instances into the Hub so on-demand
// passes (Discord/TUI) use the SAME instances as the 5-min loop.
hub.attachAdapters({ meteoraAdapter, uniswapAdapter });
hub.attachAgentFactories({
  'meme-solana': () => solanaScreeningAgent,
  'meme-robinhood': () => robinhoodScreeningAgent,
  nft: () => nftScreeningAgent,
  prediction: () => polymarketAgent,
  perps: () => perpsScreeningAgent,
  'ct-alpha': () => ctAlphaAgent,
});

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

    // Signal dedup cache: prevents posting same signal within 2-hour window (persisted across restarts)
    const recentSignals = new Map<string, number>(); // key: "channel:symbol:ca" -> timestamp
    for (const [k, v] of Object.entries(stateStore.getAllDedupEntries())) {
      recentSignals.set(k, v);
    }
    const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours (GMGN trending returns the same top tokens)

    // Real portfolio equity tracker (feeds RiskManager drawdown)
    let prevPortfolioEquityUsd: number | null = null;

    // Start 24/7 Sub-Agents Background Screening Interval Loop (Every 5 minutes)
    setInterval(async () => {
      console.log('[SUB-AGENTS LOOP] Checking active sub-agent domains...');
      try {
        // Register heartbeats AT THE START of each pass so agents are marked alive while the
        // loop is running (loop interval 5m > watcher timeout, so end-of-pass heartbeats alone
        // would always trip the UNRESPONSIVE threshold between passes).
        for (const domain of hub.getActiveDomains()) {
          globalHealthWatcher.recordHeartbeat(domain);
        }
        // Real portfolio equity -> drawdown (fail-soft: skip if data unavailable)
        try {
          let currentEquityUsd = 0;
          const solBal = await walletService.getSolanaBalance();
          const solPrice = await priceFeedService.getPrice('SOL');
          if (solBal && solPrice !== null) currentEquityUsd += solBal.balance * solPrice;
          const ethBal = await walletService.getEvmBalance(1);
          const ethPrice = await priceFeedService.getPrice('ETH');
          if (ethBal && ethPrice !== null) currentEquityUsd += ethBal.balance * ethPrice;
          const openPositions = stateStore.getAllPositions();
          for (const p of openPositions) {
            currentEquityUsd += (p.currentPriceUsd ?? 0) * (p.amount ?? 0);
          }
          if (prevPortfolioEquityUsd !== null) {
            hub.getRiskManager().updateDrawdown(currentEquityUsd, prevPortfolioEquityUsd);
          }
          prevPortfolioEquityUsd = currentEquityUsd;
        } catch (equityErr: any) {
          console.warn(`[RISK] Portfolio equity unavailable this pass: ${equityErr.message}`);
        }

        // Real market regime from live BTC/ETH 24h changes (fail-soft when unavailable)
        try {
          const btcChange = await priceFeedService.get24hChange('BTC');
          const ethChange = await priceFeedService.get24hChange('ETH');
          if (btcChange !== null && ethChange !== null) {
            const volIdx = Math.min(100, Math.round(Math.max(Math.abs(btcChange), Math.abs(ethChange)) * 15));
            globalMarketRegimeFilter.updateMarketRegime(btcChange, ethChange, volIdx);
          }
        } catch (regimeErr: any) {
          console.warn(`[MARKET REGIME] Update failed: ${regimeErr.message}`);
        }

        let dispatchedPayloads: Array<{ payload: CallSignalPayload; channelName: string; rawReason: string }> = [];

        const solanaDispatched = await dispatchDomain({
          domain: 'meme-solana',
          channelName: 'call-meme-solana',
          isActive: () => hub.isAgentActive('meme-solana'),
          runPass: () => withScreeningTimeout(solanaScreeningAgent.runScreeningPass(), 'meme-solana'),
          keyReady: () => apiKeyGuard.checkDomainKeys('meme-solana'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...solanaDispatched);

        const robinhoodDispatched = await dispatchDomain({
          domain: 'meme-robinhood',
          channelName: 'call-meme-robinhood',
          isActive: () => hub.isAgentActive('meme-robinhood'),
          runPass: () => withScreeningTimeout(robinhoodScreeningAgent.runScreeningPass(), 'meme-robinhood'),
          keyReady: () => apiKeyGuard.checkDomainKeys('meme-robinhood'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...robinhoodDispatched);

        const nftDispatched = await dispatchDomain({
          domain: 'nft',
          channelName: 'call-nft-sniping',
          isActive: () => hub.isAgentActive('nft'),
          runPass: () => withScreeningTimeout(nftScreeningAgent.runScreeningPass(), 'nft'),
          keyReady: () => apiKeyGuard.checkDomainKeys('nft'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...nftDispatched);

        const predictionDispatched = await dispatchDomain({
          domain: 'prediction',
          channelName: 'call-prediction-markets',
          isActive: () => hub.isAgentActive('prediction'),
          runPass: () => withScreeningTimeout(polymarketAgent.runScreeningPass(), 'prediction'),
          keyReady: () => apiKeyGuard.checkDomainKeys('prediction'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...predictionDispatched);

        const perpsDispatched = await dispatchDomain({
          domain: 'perps',
          channelName: 'call-perps-futures',
          isActive: () => hub.isAgentActive('perps'),
          runPass: () => withScreeningTimeout(perpsScreeningAgent.runScreeningPass(), 'perps'),
          keyReady: () => apiKeyGuard.checkDomainKeys('perps'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...perpsDispatched);

        const ctAlphaDispatched = await dispatchDomain({
          domain: 'ct-alpha',
          channelName: 'call-ct-alpha',
          isActive: () => hub.isAgentActive('ct-alpha'),
          runPass: () => withScreeningTimeout(ctAlphaAgent.runScreeningPass(), 'ct-alpha'),
          keyReady: () => apiKeyGuard.checkDomainKeys('ct-alpha'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...ctAlphaDispatched);

        const lpSolanaDispatched = await dispatchDomain({
          domain: 'lp-solana',
          channelName: 'call-lp-solana',
          isActive: () => hub.isAgentActive('lp-solana'),
          runPass: () => withScreeningTimeout(hub.runLPPass('lp-solana'), 'lp-solana'),
          keyReady: () => ({ ready: true, statusMessage: '' }),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...lpSolanaDispatched);

        const lpEvmDispatched = await dispatchDomain({
          domain: 'lp-evm',
          channelName: 'call-lp-evm',
          isActive: () => hub.isAgentActive('lp-evm'),
          runPass: () => withScreeningTimeout(hub.runLPPass('lp-evm'), 'lp-evm'),
          keyReady: () => ({ ready: true, statusMessage: '' }),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...lpEvmDispatched);

        // Real Swarm Consensus gate (>= 80%): every signal must pass with real data
        dispatchedPayloads = dispatchedPayloads.filter((item) => gateSignal(item.payload));

        // Register real heartbeats for every active agent that ran this pass
        for (const domain of hub.getActiveDomains()) {
          globalHealthWatcher.recordHeartbeat(domain);
        }

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
          stateStore.setDedupEntry(dedupKey, now);

          // AUTO-EXECUTE (simulated while DRY_RUN=true)
          const autoExecDomain: string | undefined =
            item.channelName === 'call-meme-solana' ? 'meme-solana' :
            item.channelName === 'call-meme-robinhood' ? 'meme-robinhood' :
            item.channelName === 'call-perps-futures' ? 'perps' :
            item.channelName === 'call-prediction-markets' ? 'prediction' :
            undefined;
          if (autoExecDomain) {
            const autoExec = hub.isAutoExecuteEnabled(autoExecDomain);
            if (autoExec.enabled) {
              try {
                // ── RISK GATE (RiskEngineV2 / RiskManager) ──
                // Never execute (even simulated) when risk limits are hit: global
                // drawdown cap, per-trade size cap, or kill-switch active. This wires
                // the previously-dead risk engine into the actual execution path.
                const riskCheck = hub.getRiskManager().isTradeAllowed(autoExec.maxTradeAmount || 0.1);
                if (!riskCheck.allowed) {
                  console.warn(`[AUTO-EXECUTE] ${autoExecDomain} ${item.payload.symbol}: BLOCKED by risk gate — ${riskCheck.reason}`);
                  await notifyControlRoom(client, `risk:${autoExecDomain}`, `🚫 **RISK GATE BLOCKED** auto-execute ${autoExecDomain} ${item.payload.symbol}: ${riskCheck.reason}`);
                  break;
                }
                if (globalRiskEngineV2.checkKillSwitchStatus()) {
                  console.warn(`[AUTO-EXECUTE] ${autoExecDomain} ${item.payload.symbol}: BLOCKED — emergency kill-switch active.`);
                  await notifyControlRoom(client, 'risk:killswitch', `🚨 **KILL-SWITCH ACTIVE** — auto-execute ${autoExecDomain} ${item.payload.symbol} blocked.`);
                  break;
                }
                if (autoExecDomain === 'meme-solana' && item.payload.contractAddress) {
                  const execRes = await solanaTradeAdapter.executeBuyToken({ outputMint: item.payload.contractAddress, amountSol: autoExec.maxTradeAmount || 0.1, slippageBps: 150 });
                  console.log(`[AUTO-EXECUTE] meme-solana ${item.payload.symbol}: ${execRes.success ? (execRes.simulated ? 'SIMULATED ' : '') + 'ok' : 'FAILED'} ${execRes.error || ''} (out=${execRes.outputTokens}, impact=${execRes.priceImpactPercentage}%)`);
                } else if (autoExecDomain === 'meme-robinhood' && item.payload.contractAddress) {
                  const execRes = await evmTradeAdapter.executeBuyToken({ chain: 'robinhood', tokenAddress: item.payload.contractAddress, amountEth: autoExec.maxTradeAmount || 0.1, slippagePercentage: 1.5 });
                  console.log(`[AUTO-EXECUTE] meme-robinhood ${item.payload.symbol}: ${execRes.success ? (execRes.simulated ? 'SIMULATED ' : '') + 'ok' : 'FAILED'} ${execRes.error || ''} (out=${execRes.outputTokens})`);
                } else if (autoExecDomain === 'perps' && isDryRun) {
                  // Simulation-only: HyperliquidAdapter.placeOrder exists (DRY_RUN-capable) but
                  // dispatch keeps a log-only simulation until live perps execution is enabled.
                  const sim = parsePerpsSimulation(item.payload.title);
                  console.log(`[AUTO-EXECUTE] perps ${item.payload.symbol}: SIMULATED ${sim.direction} ${autoExec.maxTradeAmount || 0.1} @ ${sim.leverage}x`);
                } else if (autoExecDomain === 'prediction' && isDryRun) {
                  // Simulation-only: PolymarketAdapter.placeBet exists (DRY_RUN-capable) but
                  // dispatch keeps a log-only simulation of the standard 50 USDC bet.
                  console.log(`[AUTO-EXECUTE] prediction ${item.payload.symbol}: SIMULATED ${item.payload.symbol} 50 USDC`);
                }

                // Record every auto-executed signal into the trade journal (real data).
                // Simulated while DRY_RUN=true — journal keeps an OPEN entry for audit/tracking.
                try {
                  const entryPrice = parseFloat(String(item.payload.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
                  const journalDomain = (item.payload.domain || 'MEME_SOLANA') as any;
                  tradeJournalService.recordTradeEntry({
                    id: `TRADE_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    domain: journalDomain,
                    symbol: item.payload.symbol || 'TOKEN',
                    contractAddressOrId: item.payload.contractAddress || item.payload.symbol || 'N/A',
                    chain: autoExecDomain === 'meme-solana' ? 'solana' : autoExecDomain === 'meme-robinhood' ? 'robinhood' : autoExecDomain === 'perps' ? 'hyperliquid' : 'polymarket',
                    entryTimestamp: new Date().toISOString(),
                    entryPriceUsdOrEth: entryPrice,
                    positionSizeUsd: (autoExec.maxTradeAmount || 0.1) * (entryPrice || 1),
                    swarmScore: Number(item.payload.confidenceScore) || 0,
                    strategyUsed: 'auto-execute',
                    aiThesisSummary: (item.rawReason || item.payload.aiThesis || '').slice(0, 200),
                    status: 'OPEN',
                  });
                  console.log(`[TRADE JOURNAL] Auto-execute recorded: ${item.payload.symbol} (${autoExecDomain}) OPEN entry.`);
                } catch (journalErr: any) {
                  console.warn(`[TRADE JOURNAL] Failed to record ${item.payload.symbol}: ${journalErr.message}`);
                }
              } catch (err: any) { console.error(`[AUTO-EXECUTE] ${item.payload.symbol} error: ${err.message}`); }
            }
          }

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

          // 3. Register called tokens for wallet auto-tracking (own-position detection + exit alerts)
          if (item.channelName === 'call-meme-solana' && item.payload.contractAddress) {
            walletTracker.registerTrackedToken('sol', item.payload.contractAddress, item.payload.symbol);
          } else if (item.channelName === 'call-meme-robinhood' && item.payload.contractAddress) {
            walletTracker.registerTrackedToken('robinhood', item.payload.contractAddress, item.payload.symbol);
          }

          // 4. Feed the Swarm Learning Engine — every posted call is recorded at its
          //    entry price so outcome tracking (TP/SL via wallet-tracker) can
          //    recalibrate agent weights over time. (wired 2026-08-08)
          try {
            const { globalSwarmLearning } = await import('./orchestrator/swarm-learning.js');
            const entryPrice = parseFloat(String(item.payload.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
            globalSwarmLearning.recordSignalCall(
              item.channelName.replace('call-', ''),
              item.payload.symbol || 'TOKEN',
              item.payload.contractAddress || item.payload.symbol || 'N/A',
              entryPrice,
              Number(item.payload.confidenceScore) || 0
            );
          } catch (learnErr: any) {
            console.warn(`[SWARM LEARNING] record failed: ${learnErr.message}`);
          }
        }

        // Wallet Auto-Tracking: detect user's own positions + exit alerts
        try {
          const alerts = await walletTracker.syncPositions();
          if (alerts.length > 0) {
            for (const a of alerts) {
              await notifyControlRoom(client, `position:${a.type}:${a.address}`, `🚨 **POSITION ALERT**\n${a.reason}`);
            }
          }
          console.log(`[WALLET TRACKER] ${positionManager.getActivePositions().length} positions tracked, ${alerts.length} alert(s) fired this cycle.`);
        } catch (wtErr: any) {
          console.warn(`[WALLET TRACKER] sync failed this cycle: ${wtErr.message}`);
        }
      } catch (err: any) {
        console.error('[SUB-AGENTS LOOP ERROR]', err.message);
        notifyControlRoom(client, 'loop-error', `⚠️ **SCREENING LOOP ERROR**\n\`${err.message}\``);
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
