import dotenv from 'dotenv';
import path from 'path';
import { isDryRun as isDryRunMode, getExecutionMode, isAutoExecute, isSignalOnly } from './config/config.js';
import { Client, GatewayIntentBits, REST, Routes, ChannelType } from 'discord.js';
import { buildCallEmbed } from './discord/embeds/call-embed.js';
import type { CallCardPayload as CallSignalPayload } from './agents/shared/agent-contract.js';
import { OpenCatHub, AthenaHub } from './orchestrator/hub.js';
import { dispatchDomain } from './orchestrator/dispatch.js';
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
import { OpenSeaAdapter } from './adapters/opensea-adapter.js';
import { EVMTradeAdapter } from './adapters/evm-adapter.js';
import { GMGNAdapter } from './adapters/gmgn-adapter.js';
import { RobinhoodScreeningAgent } from './agents/meme-robinhood/robinhood-screening-agent.js';
import { NFTScreeningAgent } from './agents/nft/nft-screening-agent.js';
import { AlphaRobinhoodScreeningAgent } from './agents/alpha-robinhood/alpha-screening-agent.js';
import { priceAlertService, tradeJournalService, walletService, priceFeedService } from './discord/handlers/interaction-handler.js';
import { TelegramService } from './telegram/telegram-service.js';
import { StateStore } from './services/state-store.js';
import { ApiKeyGuardService } from './services/api-key-guard.js';
import { globalRiskEngineV2 } from './orchestrator/risk-engine-v2.js';
import { WalletTracker } from './services/wallet-tracker.js';

dotenv.config();

const telegramService = new TelegramService();
const apiKeyGuard = new ApiKeyGuardService();

console.log('----------------------------------------------------');
console.log('🐾 OPENCAT MULTI-AGENT CRYPTO SYSTEM INITIALIZING...');
console.log('----------------------------------------------------');

const execMode = getExecutionMode();
console.log(`[CONFIG] OpenCat Execution Mode: ${execMode} (Primary Swap Venue: Uniswap V3 on Robinhood Chain #4663)`);

// Initialize persistent StateStore (survives bot restarts)
const stateStore = new StateStore();

const hub = new OpenCatHub();
const swarmEngine = new SwarmConsensusEngine();
swarmEngine.attachStateStore(stateStore);

// Wire sandboxed StrategyEngine into Swarm Consensus (active strategy can adjust confidence)
const strategyEngine = new StrategyEngine();
SwarmConsensusEngine.setStrategyProvider((domain: string) => strategyEngine.getActiveStrategy(domain));
hub.setStrategyProvider((domain: string) => strategyEngine.getActiveStrategy(domain));

function gateSignal(payload: any): boolean {
  const res = swarmEngine.evaluateSignal({
    symbol: payload.symbol || 'CUSTOM',
    domain: payload.domain || 'MEME_ROBINHOOD',
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
const { PositionScanner } = await import('./services/position-scanner.js');
const positionScanner = new PositionScanner({ positionManager, walletService, stateStore });

// Wallet auto-tracker: mirrors user's on-chain holdings into PositionManager lifecycle + exit alerts
const walletTracker = new WalletTracker({ positionManager, stateStore, gmgn: new GMGNAdapter(), walletService, tradeJournal: tradeJournalService });

const aiService = new AIService();

// Startup strategy bootstrap: if strategies/custom-strategy-prompt.txt exists, generate
// per-domain custom strategies via LLM (validated + activated). try/catch guarantees a
// bootstrap failure never crashes boot — defaults stay active.
try {
  const { bootstrapCustomStrategies } = await import('./orchestrator/strategy-bootstrap.js');
  await bootstrapCustomStrategies({ aiService });
} catch (err: any) {
  console.warn(`[STRATEGY BOOTSTRAP] Failed to bootstrap custom strategies: ${err.message}`);
}

const skillLoader = new SkillLoader();
const openseaAdapter = new OpenSeaAdapter();
const evmTradeAdapter = new EVMTradeAdapter();

// Apply persisted per-domain screening overrides (set via chat `set_screening_config`).
// Agent-level prefilter/hard-gate thresholds are seeded from the ACTIVE strategy's
// prefilter* params (loosened presets take effect at runtime); fallback = config.
const savedScreeningConfigs = stateStore.getScreeningConfigs();
const robinhoodScreeningAgent = new RobinhoodScreeningAgent(
  savedScreeningConfigs['meme-robinhood'] as any,
  () => strategyEngine.getActiveStrategy('meme-robinhood')?.params ?? {},
);
const nftScreeningAgent = new NFTScreeningAgent(
  openseaAdapter,
  undefined,
  () => strategyEngine.getActiveStrategy('nft')?.params ?? {},
);
const alphaRobinhoodScreeningAgent = new AlphaRobinhoodScreeningAgent();

// Wire shared adapters + singleton agent instances into the Hub
hub.attachAgentFactories({
  'meme-robinhood': () => robinhoodScreeningAgent,
  nft: () => nftScreeningAgent,
  'alpha-robinhood': () => alphaRobinhoodScreeningAgent,
});

// Attach StateStore to all persistent services
hub.attachStateStore(stateStore);
priceAlertService.attachStateStore(stateStore);
tradeJournalService.attachStateStore(stateStore);
walletService.attachStateStore(stateStore);

const loadedSkills = skillLoader.loadAllSkills();

console.log(`[SKILL SYSTEM] Active skills loaded: ${loadedSkills.length} (${loadedSkills.map(s => s.name).join(', ')})`);
console.log(`[SECURITY SERVICES] GMGN + GoPlus Security (Robinhood Chain) Initialized.`);
console.log(`[SCREENING AGENTS] Robinhood Meme + LP Robinhood + NFT Sniping Agents Initialized.`);
console.log(`[SCREENING ADAPTERS] GMGN AI + Krystal + OpenSea + Relay + EVM Adapters Initialized.`);
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
    rest: {
      // Naikkan timeout REST Discord (default 10s) — VPS pernah timeout saat
      // restart + bootstrap + reply bersamaan, bikin "Athena is thinking..."
      timeout: 30000,
    },
  });

  client.once('ready', async () => {
    console.log(`[DISCORD BOT] Logged in as ${client.user?.tag}!`);

    // Post-update report: if a self-update just ran (fire-and-forget killed the
    // old process before it could reply), forward the saved report to the
    // control room so the user sees the update result after restart.
    try {
      const fs = await import('fs');
      const reportPath = path.join(process.cwd(), 'database', 'last_update_report.json');
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        fs.unlinkSync(reportPath); // one-shot: hapus setelah dibaca
        const stepLines = (report.steps || []).map((s: { label: string; ok: boolean }) => `• **${s.label}:** ${s.ok ? '✅' : '❌'}`).join('\n');
        const restartLine = report.restartOk
          ? '🔄 **PM2 agent restarted — new code is live.**'
          : '⚠ **PM2 restart failed** — run `athena deploy` manually.';
        const controlRoomId = process.env.DISCORD_CHANNEL_CONTROL_ROOM;
        const channel = controlRoomId
          ? client.channels.cache.get(controlRoomId)
          : client.channels.cache.find((c: any) => c.name === 'athena-control-room');
        if (channel && 'send' in channel) {
          await channel.send(
            `${report.ok ? '✅' : '❌'} **Athena Self-Update ${report.ok ? 'Complete' : 'GAGAL'}**\n\n` +
            `${stepLines}\n${restartLine}`
          );
          console.log('[UPDATE REPORT] Laporan update dikirim ke control room.');
        }
      }
    } catch (reportErr: any) {
      console.warn(`[UPDATE REPORT] Gagal kirim laporan: ${reportErr.message}`);
    }

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
          const ethBal = await walletService.getEvmBalance(4663);
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
          channelName: 'call-nft-robinhood',
          isActive: () => hub.isAgentActive('nft'),
          runPass: () => withScreeningTimeout(nftScreeningAgent.runScreeningPass(), 'nft'),
          keyReady: () => apiKeyGuard.checkDomainKeys('nft'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...nftDispatched);

        const lpEvmDispatched = await dispatchDomain({
          domain: 'lp-robinhood',
          channelName: 'call-lp-robinhood',
          isActive: () => hub.isAgentActive('lp-robinhood'),
          runPass: () => withScreeningTimeout(hub.runLPPass('lp-robinhood'), 'lp-robinhood'),
          keyReady: () => apiKeyGuard.checkDomainKeys('lp-robinhood'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...lpEvmDispatched);

        const alphaDispatched = await dispatchDomain({
          domain: 'alpha-robinhood',
          channelName: 'call-alpha-robinhood',
          isActive: () => hub.isAgentActive('alpha-robinhood'),
          runPass: () => withScreeningTimeout(alphaRobinhoodScreeningAgent.runScreeningPass(), 'alpha-robinhood'),
          keyReady: () => apiKeyGuard.checkDomainKeys('alpha-robinhood'),
          onHalt: (domain, msg) => notifyControlRoom(client, `halt:${domain}`, `⚠️ **${domain.toUpperCase()} TIDAK BISA JALAN**\n${msg}`),
        });
        dispatchedPayloads.push(...alphaDispatched);

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

          // Execution Mode check: AUTO_EXECUTE executes live trades, DRY_RUN simulates with real market quotes, SIGNAL_ONLY skips trade execution.
          const AUTO_EXECUTE_ENABLED = isAutoExecute() || process.env.AUTO_EXECUTE_ENABLED === 'true';
          const autoExecDomain: string | undefined =
            item.channelName === 'call-meme-robinhood' ? 'meme-robinhood' :
            item.channelName === 'call-nft-robinhood' ? 'nft' :
            undefined;
          if (autoExecDomain && AUTO_EXECUTE_ENABLED && !isSignalOnly()) {
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
                if (autoExecDomain === 'meme-robinhood' && item.payload.contractAddress) {
                  const execRes = await evmTradeAdapter.executeBuyToken({ chain: 'robinhood', tokenAddress: item.payload.contractAddress, amountEth: autoExec.maxTradeAmount || 0.1, slippagePercentage: 1.5 }, walletService);
                  console.log(`[AUTO-EXECUTE] meme-robinhood ${item.payload.symbol}: ${execRes.success ? (execRes.simulated ? 'SIMULATED ' : '') + 'ok' : 'FAILED'} ${execRes.error || ''} (out=${execRes.outputTokens})`);
                }

                // Record every auto-executed signal into the trade journal (real data).
                // Simulated while DRY_RUN=true — journal keeps an OPEN entry for audit/tracking.
                try {
                  const entryPrice = parseFloat(String(item.payload.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
                  const journalDomain = (item.payload.domain || 'MEME_ROBINHOOD') as any;
                  tradeJournalService.recordTradeEntry({
                    id: `TRADE_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    domain: journalDomain,
                    symbol: item.payload.symbol || 'TOKEN',
                    contractAddressOrId: item.payload.contractAddress || item.payload.symbol || 'N/A',
                    chain: autoExecDomain === 'meme-robinhood' ? 'robinhood' : 'nft',
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
          if ((item.channelName === 'call-meme-robinhood' || item.channelName === 'call-lp-robinhood') && item.payload.contractAddress) {
            walletTracker.registerTrackedToken('robinhood', item.payload.contractAddress, item.payload.symbol);
          } else if (item.channelName === 'call-nft-robinhood' && item.payload.symbol) {
            // NFT: register collection slug for user position monitoring (floor drop -20%, TP, etc.)
            stateStore.setTrackedNftCollection(item.payload.symbol.toLowerCase());
            console.log(`[POSITION MONITOR] NFT collection di-track: ${item.payload.symbol}`);
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
          // PositionScanner: robinhood chain spot/LP positions (Robinhood Chain)
          const scannerAlerts = await positionScanner.scanAll();
          const allAlerts = [...alerts, ...scannerAlerts];
          if (allAlerts.length > 0) {
            for (const a of allAlerts) {
              await notifyControlRoom(client, `position:${a.type}:${a.address}`, `🚨 **POSITION ALERT**\n${a.reason}`);
            }
          }
          console.log(`[POSITION MONITOR] ${positionManager.getActivePositions().length} spot + ${positionManager.getActiveLpPositions().length} LP + ${positionManager.getActiveNftPositions().length} NFT positions tracked, ${allAlerts.length} alert(s) fired this cycle.`);
        } catch (wtErr: any) {
          console.warn(`[POSITION MONITOR] sync failed this cycle: ${wtErr.message}`);
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
      handleControlRoomMessage(message, hub, aiService);
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

console.log('[SYSTEM] Setup complete. All OpenCat modules ready.');
console.log('[STATE STORE] Persistent state engine active — positions, alerts, and journal survive restarts.');

// Start OpenCat Telemetry & REST API Server
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
