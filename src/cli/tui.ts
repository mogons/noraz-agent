import dotenv from 'dotenv';
import readline from 'readline';
dotenv.config();
import { OpenCatHub } from '../orchestrator/hub.js';
import { SwarmConsensusEngine } from '../orchestrator/swarm-consensus.js';
import { AIService } from '../services/ai-service.js';
import { globalWalletService } from '../services/wallet-service.js';
import { StateStore } from '../services/state-store.js';
import { AGENT_DOMAINS, getAgentDomain } from '../orchestrator/agent-registry.js';
import { StrategyEngine } from '../orchestrator/strategy-engine.js';
import { globalPriceAlertService } from '../services/price-alert-service.js';

const stateStore = new StateStore();
const hub = new OpenCatHub();
const swarmEngine = new SwarmConsensusEngine();
swarmEngine.attachStateStore(stateStore);
const aiService = new AIService();
const walletService = globalWalletService;
walletService.attachStateStore(stateStore);
const strategyEngine = new StrategyEngine();

// ANSI Color Tokens from Opencatz Master Palette
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  lime: '\x1b[38;2;204;255;0m',      // #CCFF00 Robinhood Green (Legendary Hero)
  pink: '\x1b[38;2;255;183;178m',    // #FFB7B2 Pastel Pink
  lavender: '\x1b[38;2;214;199;255m',// #D6C7FF Lavender Purple
  cyan: '\x1b[38;2;128;222;234m',    // #80DEEA Retro Cyan
  yellow: '\x1b[38;2;255;245;157m',  // #FFF59D Pastel Yellow
  gold: '\x1b[38;2;255;215;0m',      // #FFD700 Golden Fortune
  red: '\x1b[38;2;229;57;53m',       // #E53935 Maneki-Neko Red
  green: '\x1b[38;2;0;230;118m',     // #00E676 Jade Spirit
  magenta: '\x1b[38;2;123;31;162m', // #7B1FA2 Royal Violet
};

function detectPm2(): boolean {
  return Boolean(process.env.pm_id || process.env.PM2_DAEMON_HOME || process.argv.includes('--pm2'));
}

const OPENCATZ_ASCII = `
${C.lime}${C.bright}       /\\_____/\\
      /  ${C.pink}■${C.lime}   ${C.pink}■${C.lime}  \\      ${C.lime}🐾 OPENCATZ AI · COMMAND CENTER TUI 🐾${C.reset}
${C.lime}     ( ==  ${C.pink}^${C.lime}  == )     ${C.cyan}Autonomous Multi-Agent Trading Swarm${C.reset}
${C.lime}      )    ${C.yellow}~${C.lime}    (      ${C.lavender}Robinhood Chain EVM L2 • Chain ID: 4663 • Native: ETH${C.reset}
${C.lime}     (   _____   )     ${C.gold}"Chill trades, 9 lives, sharp alpha."${C.reset}
${C.lime}    ( (  )   (  ) )
   (__(__)___(__)__)${C.reset}
`;

export async function launchTUI(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (query: string) => new Promise<string>((resolve) => rl.question(query, resolve));

  while (true) {
    console.clear();
    console.log(OPENCATZ_ASCII);
    console.log(`${C.lime}${C.bright}========================================================================${C.reset}`);
    const autoExec = process.env.AUTO_EXECUTE_ENABLED === 'true';
    const isDry = process.env.DRY_RUN !== 'false';
    const modeBadge = isDry
      ? `${C.green}DRY_RUN (Safe Market Simulation)${C.reset}`
      : autoExec
        ? `${C.red}⚡ AUTO_EXECUTE (Live On-Chain Trading)${C.reset}`
        : `${C.yellow}MANUAL EXECUTION (Signal Caller)${C.reset}`;

    console.log(`${C.yellow}🌿 Mode:${C.reset} ${modeBadge} | ${C.lime}🐱 OpenCatz Oracle:${C.reset} ${aiService.getConfig().provider} (${aiService.getConfig().modelName})`);
    const activeDomains = hub.getActiveDomains();
    const agentStatus = activeDomains.length === AGENT_DOMAINS.length
      ? `${C.green}🟢 ALL ${AGENT_DOMAINS.length} ACTIVE${C.reset}`
      : activeDomains.length > 0
        ? `${C.yellow}🟡 ${activeDomains.length}/${AGENT_DOMAINS.length} ACTIVE${C.reset}`
        : `${C.red}🔴 ALL PAUSED${C.reset}`;
    console.log(`${C.cyan}🤖 Agents:${C.reset} ${agentStatus} | ${C.gold}🌲 Cat Den Daemon:${C.reset} ${detectPm2() ? 'PM2 daemon (Cat Den)' : 'local process'}`);
    console.log(`${C.lime}------------------------------------------------------------------------${C.reset}`);
    console.log(` ${C.green}[1]${C.reset} 🔑 Burner Wallet & Treasury Manager (View / Import PK / Withdraw)`);
    console.log(` ${C.green}[2]${C.reset} 🔍 On-Demand 3-Layer Swarm Token Audit (Paste Contract Address)`);
    console.log(` ${C.green}[3]${C.reset} ⚡ Background Screening Control (Meme · LP · NFT · Alpha)`);
    console.log(` ${C.green}[4]${C.reset} 🧠 Command Room Oracle Chat (Natural Language AI Agent Loop)`);
    console.log(` ${C.green}[5]${C.reset} ⚙️ Global Risk Management (9-Lives Shield · Drawdown Safeguards)`);
    console.log(` ${C.green}[6]${C.reset} 📊 Trade Journal & Analytics (Realized PnL · Win Rate)`);
    console.log(` ${C.green}[7]${C.reset} 🛑 Emergency Circuit Breaker (Halt All Active Trading)`);
    console.log(` ${C.green}[8]${C.reset} ▶️ Run Screening Pass (Trigger Instant On-Demand Pass)`);
    console.log(` ${C.green}[9]${C.reset} 🎯 Strategy Preset Selector & Custom Strategy Compiler`);
    console.log(` ${C.green}[A]${C.reset} 🔔 Price Alerts Manager (Custom Price Triggers)`);
    console.log(` ${C.green}[P]${C.reset} 💼 Open Positions & Portfolio Scanner (Meme · LP · NFT)`);
    console.log(` ${C.red}[0]${C.reset} ❌ Exit OpenCatz Command Center`);
    console.log(`${C.lime}------------------------------------------------------------------------${C.reset}`);

    const choice = await prompt(`${C.bright}🐾 Select Option (0-9, A, P): ${C.reset}`);

    if (choice === '0') {
      console.log(`\n${C.lime}May OpenCatz's sharp alpha guide your trades. Purring out... 👋🐾${C.reset}\n`);
      rl.close();
      break;
    }

    switch (choice.trim().toUpperCase()) {
      case '1': {
        console.clear();
        console.log(`${C.cyan}=== 🔑 OPENCATZ TREASURY & BURNER WALLETS ===${C.reset}`);
        const hasEvm = walletService.hasWallet('evm');
        console.log(`• Robinhood (EVM) Wallet: ${hasEvm ? C.green + walletService.getEvmAddress() + C.reset : C.red + 'Not Configured' + C.reset}\n`);
        if (hasEvm) {
          try {
            const bal = await walletService.getEvmBalance(4663);
            const balStr = bal ? bal.balance.toFixed(4) : 'unavailable';
            console.log(`• Robinhood ETH Balance: ${C.green}${balStr} ETH${C.reset}`);
          } catch (err: any) {
            console.log(`• Robinhood ETH Balance: ${C.yellow}unavailable (${err?.message || 'read failed'})${C.reset}`);
          }
        }
        console.log('\n[1] Import / Replace EVM Private Key');
        console.log('[2] Remove / Clear EVM Private Key');
        console.log('[3] 💸 Execute Instant Withdrawal (Transfer Native Funds)');
        console.log('[0] Back to Opencatz Menu\n');
        const walletSub = await prompt('Select Treasury Action (0-3): ');
        if (walletSub === '1') {
          const pk = await prompt(`Enter EVM Private Key: `);
          if (pk.trim()) {
            walletService.setKey('evm', pk.trim());
            console.log(`${C.green}✅ EVM Private Key imported and active in memory!${C.reset}`);
          }
        } else if (walletSub === '2') {
          walletService.removeKey('evm');
          console.log(`${C.yellow}🗑️ EVM Private Key removed from memory!${C.reset}`);
        } else if (walletSub === '3') {
          const to = await prompt('Destination Recipient Wallet Address (0x...): ');
          const amtStr = await prompt('Amount of Native Token (ETH) to Withdraw: ');
          const amt = parseFloat(amtStr);
          if (to.trim() && !isNaN(amt) && amt > 0) {
            console.log(`${C.yellow}Executing withdrawal...${C.reset}`);
            try {
              const res = await walletService.sendEvm(4663, to.trim(), amt);
              console.log(`${C.green}✅ EVM Robinhood Withdrawal Complete! Tx: ${res.txHash}${C.reset}`);
            } catch (err: any) {
              console.log(`${C.red}❌ Withdrawal failed: ${err.message}${C.reset}`);
            }
          }
        }
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case '2': {
        console.clear();
        console.log(`${C.cyan}=== 🔍 ON-DEMAND SWARM TOKEN AUDIT ===${C.reset}`);
        const ca = await prompt('Enter Token Contract Address (CA): ');
        if (ca.trim()) {
          console.log(`${C.yellow}Executing 3-Layer Swarm Consensus Audit (Quant + Catalyst + Security)...${C.reset}`);
          const { runTokenAudit } = await import('../services/token-audit-service.js');
          const audit = await runTokenAudit(ca.trim());
          console.log(`\n${C.lime}OpenCatz Audit Report for ${ca.trim()}:${C.reset}`);
          console.log(audit.content);
        }
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case '3': {
        console.clear();
        console.log(`${C.cyan}=== ⚡ BACKGROUND SCREENING SUB-AGENTS CONTROL ===${C.reset}`);
        const subAgentsList = AGENT_DOMAINS.map((d, i) => ({
          id: String(i + 1),
          domain: d.id,
          label: `${d.displayName.replace(/-/g, ' ')} (${d.channel})`,
        }));
        const activeCurrent = hub.getActiveDomains();
        subAgentsList.forEach(a => {
          const isActive = activeCurrent.includes(a.domain);
          console.log(`[${a.id}] ${a.label}: ${isActive ? C.green + '🟢 ACTIVE' + C.reset : C.red + '🔴 PAUSED' + C.reset}`);
        });
        console.log('\n[A] ⚡ Activate ALL Agents');
        console.log('[P] ⏸️ Pause ALL Agents');
        console.log('[0] Back to OpenCatz Menu\n');
        const agentChoice = await prompt(`Select Option (1-${subAgentsList.length}, A, P, 0): `);
        if (agentChoice.toUpperCase() === 'A') {
          subAgentsList.forEach(a => hub.toggleChannelScreening('tui-terminal', a.domain, true));
          console.log(`${C.green}⚡ All ${subAgentsList.length} Sub-Agents activated in OpenCatz TUI!${C.reset}`);
        } else if (agentChoice.toUpperCase() === 'P') {
          subAgentsList.forEach(a => hub.toggleChannelScreening('tui-terminal', a.domain, false));
          console.log(`${C.yellow}⏸️ All ${subAgentsList.length} Sub-Agents paused in OpenCatz TUI!${C.reset}`);
        } else {
          const selected = subAgentsList.find(a => a.id === agentChoice.trim());
          if (selected) {
            const currentActive = activeCurrent.includes(selected.domain);
            hub.toggleChannelScreening('tui-terminal', selected.domain, !currentActive);
            console.log(`${C.green}✅ ${selected.domain} is now ${!currentActive ? 'ACTIVE' : 'PAUSED'}!${C.reset}`);
          }
        }
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case '4': {
        console.clear();
        console.log(`${C.cyan}=== 🧠 COMMAND ROOM ORACLE CHAT ===${C.reset}`);
        console.log(`${C.yellow}Ask OpenCatz AI anything about market conditions, tokens, risks, or settings (type 'exit' to quit):${C.reset}\n`);
        while (true) {
          const chatMsg = await prompt(`${C.magenta}You: ${C.reset}`);
          if (chatMsg.toLowerCase() === 'exit') break;
          try {
            const { OPENCATZ_SYSTEM_PROMPT_BASE } = await import('../services/opencatz-system-prompt.js');
            const { ToolRegistry } = await import('../orchestrator/tool-registry.js');
            const { runAgent } = await import('../orchestrator/agent-runner.js');
            const { SessionMemoryService } = await import('../services/session-memory.js');
            const toolRegistry = new ToolRegistry();
            toolRegistry.attachOrchestrator(hub);
            toolRegistry.attachAIService(aiService);
            toolRegistry.attachWalletService(globalWalletService);
            const activeNow = hub.getActiveDomains();
            const activeAgentsLine = activeNow.length > 0
              ? `Active Sub-Agents right now: ${activeNow.join(', ')}`
              : 'Active Sub-Agents right now: NONE (all paused)';
            const risk = hub.getRiskManager().getRiskState();
            const memoryContext = new SessionMemoryService().buildMemoryContextLine();
            const systemPrompt = OPENCATZ_SYSTEM_PROMPT_BASE + `
Current Operating Parameters:
- ${activeAgentsLine}
- Execution Mode: ${process.env.DRY_RUN === 'false' ? 'LIVE ON-CHAIN' : 'DRY_RUN (Safe Market Simulation)'}.
- Global Portfolio Drawdown Limit: ${risk.maxDrawdownLimitPct}%.
- Current Portfolio Drawdown: ${risk.currentDrawdownPct ?? 0}%.${memoryContext}`;

            const agentResult = await runAgent(
              { aiService, toolRegistry, systemPrompt },
              chatMsg
            );
            const aiRes = agentResult.text || (agentResult.toolResults.length > 0
              ? agentResult.toolResults.map((t) => `• ${t.name}: ${t.success ? '✅' : '❌'} ${t.message}`).join('\n')
              : '[No response from AI.]');
            console.log(`\n${C.lime}OpenCatz Oracle:${C.reset} ${aiRes}\n`);
          } catch (err: any) {
            console.log(`\n${C.lime}OpenCatz Oracle:${C.reset} Acknowledged: "${chatMsg}".\n`);
          }
        }
        break;
      }

      case '5': {
        console.clear();
        const risk = hub.getRiskManager().getRiskState();
        console.log(`${C.cyan}=== ⚙️ GLOBAL RISK MANAGEMENT & SAFEGUARDS ===${C.reset}`);
        console.log(`• Max Portfolio Drawdown Limit: ${risk.maxDrawdownLimitPct}% (current: ${risk.currentDrawdownPct ?? 0}%)`);
        console.log(`• Max Position Size: $${risk.maxPositionSizeUsd} per trade`);
        console.log(`• Max Sector Exposure: ${risk.maxSectorExposurePercent}% | Max Correlated Positions: ${risk.maxCorrelatedPositions}`);
        console.log(`• Trading Paused: ${risk.paused ? 'YES (circuit breaker active)' : 'No'}`);
        const { globalRiskEngineV2 } = await import('../orchestrator/risk-engine-v2.js');
        const killSwitchActive = globalRiskEngineV2.checkKillSwitchStatus();
        console.log(`• 9-Lives Kill-Switch: ${killSwitchActive ? C.red + 'ACTIVE (all trading halted)' + C.reset : C.green + 'INACTIVE' + C.reset}`);
        console.log(`• Position Manager: Auto TP (2x/3x), Stop Loss (-20%), Dynamic Trailing Stops`);
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case '6': {
        console.clear();
        console.log(`${C.cyan}=== 📊 TRADE JOURNAL & PNL ANALYTICS ===${C.reset}`);
        const { TradeJournalService } = await import('../services/trade-journal-service.js');
        const stats = new TradeJournalService().getSummaryStats();
        console.log(`• Total Logged Trades: ${C.green}${stats.totalTrades}${C.reset} (${stats.openTradesCount} Open, ${stats.winCount + stats.lossCount} Closed)`);
        console.log(`• Win Rate: ${C.green}${stats.winRatePct.toFixed(1)}%${C.reset} (${stats.winCount} Wins / ${stats.lossCount} Losses)`);
        console.log(`• Total Realized PnL: ${C.green}$${stats.totalRealizedPnlUsd.toFixed(2)} USD${C.reset}`);
        console.log(`• Best Trade: ${C.green}+$${stats.bestTradeUsd.toFixed(2)} USD${C.reset} | Worst: ${C.red}-$${Math.abs(stats.worstTradeUsd).toFixed(2)} USD${C.reset}`);
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case '7': {
        console.clear();
        console.log(`${C.red}=== 🛑 EMERGENCY CIRCUIT BREAKER (9 LIVES SHIELD) ===${C.reset}`);
        const confirmHalt = (await prompt(`Engage 9-Lives Shield — pause ALL agents, disable auto-execute and activate the kill switch? (y/N): `)) || 'n';
        if (confirmHalt.toLowerCase() === 'y') {
          const res = hub.executeEmergencyCloseAll('User Manual Panic Button (OpenCatz TUI)');
          console.log(`${C.green}✅ 9-Lives Shield engaged: all sub-agents paused, auto-execute disabled, kill switch active.${C.reset}`);
          console.log(`${C.yellow}ℹ️ ${res.message}${C.reset}`);
        } else {
          console.log(`${C.yellow}Circuit breaker not engaged.${C.reset}`);
        }
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case '8': {
        console.clear();
        console.log(`${C.cyan}=== ▶️ RUN SCREENING PASS (LOCAL TEST) ===${C.reset}`);
        AGENT_DOMAINS.forEach((d, i) => console.log(`[${i + 1}] ${d.displayName} (${d.channel})`));
        console.log('[0] Back\n');
        const sel = await prompt(`Select Agent (1-${AGENT_DOMAINS.length}): `);
        const chosen = AGENT_DOMAINS[parseInt(sel) - 1];
        if (!chosen) { await prompt(`${C.red}Invalid. Press Enter...${C.reset}`); break; }
        console.log(`\n${C.yellow}Running ${chosen.displayName} screening pass on Robinhood Chain...${C.reset}`);
        const results = await hub.triggerAgentPass(chosen.id);
        if (results.length === 0) {
          console.log(`${C.yellow}No candidate signals passed 3-Layer Swarm Consensus (>=80% floor required).${C.reset}`);
        }
        for (const r of results) {
          const payload = (r as any).payload;
          if (payload) {
            console.log(`\n${C.green}✅ [${chosen.id.toUpperCase()}] ${payload.symbol || payload.title} — ${payload.confidenceScore || 80}% Confidence${C.reset}`);
            if (payload.marketCap) console.log(`   MC: ${payload.marketCap} | Liq: ${payload.liquidity} | Vol1h: ${payload.volume1h}`);
            if (payload.aiThesis) console.log(`   Thesis: ${payload.aiThesis}`);
          } else {
            console.log(`\n${C.green}✅ Signal: ${r.reason}${C.reset}`);
          }
        }
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case '9': {
        console.clear();
        console.log(`${C.cyan}=== 🎯 STRATEGY PRESET & ENGINE TUNING ===${C.reset}`);
        const currentPreset = process.env.STRATEGY_PRESET || 'loosened';
        console.log(`• Current Screening Preset: ${C.green}${currentPreset.toUpperCase()}${C.reset}\n`);
        console.log('[1] Loosened Preset (2x higher signal frequency, minAgeHours=0, $25k vol)');
        console.log('[2] Standard Preset (Strict high-conviction runner filter, $50k vol)');
        console.log('[0] Back to OpenCatz Menu\n');
        const stratChoice = await prompt('Select Strategy Preset Action (0-2): ');
        if (stratChoice === '1') {
          process.env.STRATEGY_PRESET = 'loosened';
          console.log(`${C.green}✅ Switched to LOOSENED screening strategy preset!${C.reset}`);
        } else if (stratChoice === '2') {
          process.env.STRATEGY_PRESET = 'standard';
          console.log(`${C.green}✅ Switched to STANDARD screening strategy preset!${C.reset}`);
        }
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case 'A': {
        console.clear();
        console.log(`${C.cyan}=== 🔔 PRICE ALERTS MANAGER ===${C.reset}`);
        const alerts = globalPriceAlertService.listAlerts();
        console.log(`Active Price Alerts (${alerts.length}):`);
        if (alerts.length === 0) {
          console.log(`• No active price alerts configured.`);
        } else {
          alerts.forEach((a, i) => {
            console.log(` [${i + 1}] ${a.symbol} ${a.direction} $${a.targetPriceUsd.toLocaleString()} (Created by: ${a.userId})`);
          });
        }
        console.log('\n[1] Create New Price Alert (e.g. "BTC 70000" or "ETH 3000")');
        console.log('[0] Back to OpenCatz Menu\n');
        const alertChoice = await prompt('Select Action (0-1): ');
        if (alertChoice === '1') {
          const expr = await prompt('Enter alert expression (e.g. "ETH 3500"): ');
          const parsed = globalPriceAlertService.parseNaturalLanguageAlert(expr, 'tui_user', 'tui_channel');
          if (parsed) {
            const added = globalPriceAlertService.addAlert(parsed);
            console.log(`${C.green}✅ Price Alert Registered: Notify when ${added.symbol} hits $${added.targetPriceUsd} USD!${C.reset}`);
          } else {
            console.log(`${C.red}Could not parse expression. Example: "ETH 3500" or "BTC 70k"${C.reset}`);
          }
        }
        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      case 'P': {
        console.clear();
        console.log(`${C.cyan}=== 💼 OPEN POSITIONS & PORTFOLIO SCANNER ===${C.reset}`);
        const positions = stateStore.getAllPositions();
        const lpPositions = stateStore.getAllLpPositions();
        const nftPositions = stateStore.getAllNftPositions();

        console.log(`\n• 🌸 Meme Token Holdings (${positions.length}):`);
        if (positions.length === 0) console.log('   (No active meme token holdings)');
        else positions.forEach(p => console.log(`   - ${p.symbol}: Entry $${p.entryPriceUsd} | Current $${p.currentPriceUsd} | High $${p.highWaterMarkUsd}`));

        console.log(`\n• 🌊 Active Concentrated LP Positions (${lpPositions.length}):`);
        if (lpPositions.length === 0) console.log('   (No active LP positions)');
        else lpPositions.forEach(lp => console.log(`   - ${lp.pairName} (${lp.poolAddress}): Fees/TVL ${lp.currentFeesToTvlRatio4h}% | OutOfRange: ${lp.isOutOfRange ? 'YES' : 'NO'}`));

        console.log(`\n• 🔮 Active NFT Floor Trackers (${nftPositions.length}):`);
        if (nftPositions.length === 0) console.log('   (No active NFT floor trackers)');
        else nftPositions.forEach(nft => console.log(`   - ${nft.collectionName}: Entry ${nft.entryFloorEth} ETH | Current ${nft.currentFloorEth} ETH | Peak ${nft.highestFloorEth} ETH`));

        await prompt(`\n${C.yellow}Press Enter to return to OpenCatz Command Center...${C.reset}`);
        break;
      }

      default:
        await prompt(`${C.red}Invalid option. Press Enter to try again...${C.reset}`);
        break;
    }
  }
}

if (process.argv[1]?.includes('tui') || process.argv.includes('--tui')) {
  launchTUI().catch(console.error);
}
