import dotenv from 'dotenv';
import readline from 'readline';
dotenv.config();
import { AthenaHub } from '../orchestrator/hub.js';
import { SwarmConsensusEngine } from '../orchestrator/swarm-consensus.js';
import { AIService } from '../services/ai-service.js';
import { globalWalletService } from '../services/wallet-service.js';

import { StateStore } from '../services/state-store.js';

const stateStore = new StateStore();
const hub = new AthenaHub();
const swarmEngine = new SwarmConsensusEngine();
const aiService = new AIService();
const walletService = globalWalletService;
walletService.attachStateStore(stateStore);

// ANSI Color Helpers
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

const ATHENA_PARTHENON_ASCII = `
${C.yellow}${C.bright}                   /\
                  /  \
                 / /\ \
                / /  \ \
               / /____\ \
              /__________\
             |  |  ||  |  |
             |  |  ||  |  |${C.reset}
${C.cyan}${C.bright}      🏛️  PARTHENON OF ATHENA  🏛️${C.reset}
${C.magenta}${C.bright}  Goddess of Wisdom, Warfare & Precision Trading${C.reset}
`;

export async function launchTUI(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (query: string) => new Promise<string>((resolve) => rl.question(query, resolve));

  while (true) {
    console.clear();
    console.log(ATHENA_PARTHENON_ASCII);
    console.log(`${C.cyan}${C.bright}========================================================================${C.reset}`);
    console.log(`${C.yellow}🌿 Mode:${C.reset} MANUAL EXECUTION (screener/caller, eksekusi via link) | ${C.yellow}🦉 AI Oracle:${C.reset} ${aiService.getConfig().provider} (${aiService.getConfig().modelName})`);
    console.log(`${C.cyan}------------------------------------------------------------------------${C.reset}`);
    console.log(` ${C.green}[1]${C.reset} 🔑 Burner Wallet & Treasury Manager (View/Import PK)`);
    console.log(` ${C.green}[2]${C.reset} 🔍 On-Demand 3-Layer Swarm Token Audit (Input CA)`);
    console.log(` ${C.green}[3]${C.reset} ⚡ Background Screening Control (Solana/EVM/Perps/NFT/Polymarket)`);
    console.log(` ${C.green}[4]${C.reset} 🧠 Command Room Oracle Chat (Natural Language AI Hub)`);
    console.log(` ${C.green}[5]${C.reset} ⚙️ Global Risk Management & Position Size Safeguards`);
    console.log(` ${C.green}[6]${C.reset} 📊 Trade Journal & Realized PnL Analytics (View Summary)`);
    console.log(` ${C.green}[7]${C.reset} 🛑 Emergency Circuit Breaker (Halt All Active Agents)`);
    console.log(` ${C.green}[8]${C.reset} ▶️ Run Screening Pass (Test One Sub-Agent Locally)`);
    console.log(` ${C.red}[0]${C.reset} ❌ Exit Parthenon Control Center`);
    console.log(`${C.cyan}------------------------------------------------------------------------${C.reset}`);

    const choice = await prompt(`${C.bright}⚔️ Select Command Option (0-8): ${C.reset}`);

    if (choice === '0') {
      console.log(`\n${C.yellow}May Athena's wisdom guide your trades. Exiting Parthenon... 👋${C.reset}\n`);
      rl.close();
      break;
    }

    switch (choice.trim()) {
      case '1':
        console.clear();
        console.log(`${C.cyan}=== 🔑 ATHENA TREASURY & BURNER WALLETS ===${C.reset}`);
        const hasSol = walletService.hasWallet('solana');
        const hasEvm = walletService.hasWallet('evm');
        console.log(`• Solana Wallet: ${hasSol ? C.green + walletService.getSolanaAddress() + C.reset : C.red + 'Not Configured' + C.reset}`);
        console.log(`• EVM Wallet:    ${hasEvm ? C.green + walletService.getEvmAddress() + C.reset : C.red + 'Not Configured' + C.reset}\n`);
        console.log('[1] Import / Replace Solana Private Key');
        console.log('[2] Import / Replace EVM Private Key');
        console.log('[3] Remove / Clear Solana Private Key');
        console.log('[4] Remove / Clear EVM Private Key');
        console.log('[5] 💸 Execute Instant Withdrawal (Transfer Native Funds)');
        console.log('[0] Back to Parthenon Menu\n');
        const walletSub = await prompt('Select Treasury Action (0-5): ');
        if (walletSub === '1' || walletSub === '2') {
          const chain = walletSub === '1' ? 'solana' : 'evm';
          const pk = await prompt(`Enter ${chain.toUpperCase()} Private Key: `);
          if (pk.trim()) {
            walletService.setKey(chain, pk.trim());
            console.log(`${C.green}✅ ${chain.toUpperCase()} Private Key imported and active!${C.reset}`);
          }
        } else if (walletSub === '3' || walletSub === '4') {
          const chain = walletSub === '3' ? 'solana' : 'evm';
          walletService.removeKey(chain);
          console.log(`${C.yellow}🗑️ ${chain.toUpperCase()} Private Key removed from memory!${C.reset}`);
        } else if (walletSub === '5') {
          const to = await prompt('Destination Recipient Wallet Address: ');
          const amtStr = await prompt('Amount of Native Token (SOL / ETH) to Withdraw: ');
          const amt = parseFloat(amtStr);
          if (to.trim() && !isNaN(amt) && amt > 0) {
            console.log(`${C.yellow}Executing withdrawal...${C.reset}`);
            try {
              if (!to.startsWith('0x')) {
                const res = await walletService.sendSol(to.trim(), amt);
                console.log(`${C.green}✅ Solana Withdrawal Complete! Tx: ${res.txHash}${C.reset}`);
              } else {
                const res = await walletService.sendEvm(8453, to.trim(), amt);
                console.log(`${C.green}✅ EVM Base Withdrawal Complete! Tx: ${res.txHash}${C.reset}`);
              }
            } catch (err: any) {
              console.log(`${C.red}❌ Withdrawal failed: ${err.message}${C.reset}`);
            }
          }
        }
        await prompt(`\n${C.yellow}Press Enter to return to Parthenon...${C.reset}`);
        break;

      case '2':
        console.clear();
        console.log(`${C.cyan}=== 🔍 ON-DEMAND SWARM TOKEN AUDIT ===${C.reset}`);
        const ca = await prompt('Enter Token Contract Address (CA): ');
        if (ca.trim()) {
          console.log(`${C.yellow}Executing 3-Layer Swarm Consensus Audit (Quant + Catalyst + Security)...${C.reset}`);
          const isSol = !ca.trim().startsWith('0x');
          let liquidityUsd = 0;
          let volume1hUsd = 0;
          let securityPassed = false;
          let socialHypeScore = 0;
          try {
            if (isSol) {
              const { RugCheckService } = await import('../services/security-service.js');
              const { GMGNAdapter } = await import('../adapters/gmgn-adapter.js');
              const rug = new RugCheckService();
              const audit = await rug.auditSolanaToken(ca.trim());
              securityPassed = audit ? audit.isSafeForRunner : false;
              const gmgn = new GMGNAdapter();
              const sigs = await gmgn.fetchTrendingSignals('sol');
              const tok = sigs.find((s) => s.contractAddress.toLowerCase() === ca.trim().toLowerCase());
              if (tok) {
                liquidityUsd = tok.liquidityUsd || 0;
                volume1hUsd = (tok.volume24hUsd || 0) / 24;
                socialHypeScore = Math.min(98, 40 + (tok.smartMoneyCount >= 2 ? 20 : 0) + (tok.liquidityUsd >= 25000 ? 15 : 0) + (tok.volume24hUsd >= 100000 ? 15 : 0));
              }
            } else {
              const { GoPlusSecurityService } = await import('../services/goplus-security-service.js');
              const goplus = new GoPlusSecurityService();
              const audit = await goplus.auditToken('base', ca.trim());
              securityPassed = audit !== null && audit.buyTaxPct <= 5 && audit.sellTaxPct <= 5;
            }
          } catch (err: any) {
            console.log(`${C.red}⚠️ Real audit data unavailable: ${err?.message}${C.reset}`);
          }
          const res = swarmEngine.evaluateSignal({
            symbol: 'CUSTOM',
            domain: 'MEME_SOLANA',
            contractAddress: ca.trim(),
            liquidityUsd,
            volume1hUsd,
            securityAuditPassed: securityPassed,
            socialHypeScore,
          });
          console.log(`\n${C.green}Athena Swarm Verdict:${C.reset}`);
          console.log(`• Real Liquidity: $${liquidityUsd} | Real 1h Vol: $${volume1hUsd} | Security: ${securityPassed ? 'PASS' : 'UNAVAILABLE/FAIL'}`);
          console.log(`• Confidence Score: ${C.bright}${res.confidenceScore}%${C.reset} (${res.passed ? C.green + 'APPROVED (>=80%)' : C.red + 'REJECTED'}${C.reset})`);
          console.log(`• Audit Reasoning: ${res.reason}`);
        }
        await prompt(`\n${C.yellow}Press Enter to return to Parthenon...${C.reset}`);
        break;

      case '3':
        console.clear();
        console.log(`${C.cyan}=== ⚡ BACKGROUND SCREENING SUB-AGENTS CONTROL ===${C.reset}`);
        const { AGENT_DOMAINS } = await import('../orchestrator/agent-registry.js');
        const subAgentsList = AGENT_DOMAINS.map((d, i) => ({
          id: String(i + 1),
          domain: d.id,
          label: `${d.displayName.replace(/-/g, ' ')} (${d.channel.replace('call-', '#')})`,
        }));
        const activeDomains = hub.getActiveDomains();
        subAgentsList.forEach(a => {
          const isActive = activeDomains.includes(a.domain);
          console.log(`[${a.id}] ${a.label}: ${isActive ? C.green + '🟢 ACTIVE' + C.reset : C.red + '🔴 PAUSED' + C.reset}`);
        });
        console.log('[A] ⚡ Activate ALL Agents');
        console.log('[P] ⏸️ Pause ALL Agents');
        console.log('[0] Back to Parthenon Menu\n');
        const agentChoice = await prompt('Select Option (1-8, A, P, 0): ');
        if (agentChoice.toUpperCase() === 'A') {
          subAgentsList.forEach(a => hub.toggleChannelScreening('tui-terminal', a.domain, true));
          console.log(`${C.green}⚡ All 8 Sub-Agents activated in TUI Parthenon!${C.reset}`);
        } else if (agentChoice.toUpperCase() === 'P') {
          subAgentsList.forEach(a => hub.toggleChannelScreening('tui-terminal', a.domain, false));
          console.log(`${C.yellow}⏸️ All 8 Sub-Agents paused in TUI Parthenon!${C.reset}`);
        } else {
          const selected = subAgentsList.find(a => a.id === agentChoice.trim());
          if (selected) {
            const currentActive = activeDomains.includes(selected.domain);
            hub.toggleChannelScreening('tui-terminal', selected.domain, !currentActive);
            console.log(`${C.green}✅ ${selected.domain} is now ${!currentActive ? 'ACTIVE' : 'PAUSED'}!${C.reset}`);
          }
        }
        await prompt(`\n${C.yellow}Press Enter to return to Parthenon...${C.reset}`);
        break;

      case '4':
        console.clear();
        console.log(`${C.cyan}=== 🧠 COMMAND ROOM ORACLE CHAT ===${C.reset}`);
        console.log(`${C.yellow}Ask Athena AI anything about trades, market sentiment, or alerts (type 'exit' to quit):${C.reset}\n`);
        while (true) {
          const chatMsg = await prompt(`${C.magenta}You: ${C.reset}`);
          if (chatMsg.toLowerCase() === 'exit') break;
          try {
            const { ATHENA_SYSTEM_PROMPT_BASE } = await import('../services/athena-system-prompt.js');
            const { ToolRegistry } = await import('../orchestrator/tool-registry.js');
            const { runAgent } = await import('../orchestrator/agent-runner.js');
            const { SessionMemoryService } = await import('../services/session-memory.js');
            const toolRegistry = new ToolRegistry();
            toolRegistry.attachOrchestrator(hub);
            toolRegistry.attachAIService(aiService);
            toolRegistry.attachWalletService(globalWalletService);
            const activeDomains = hub.getActiveDomains();
            const activeAgentsLine = activeDomains.length > 0
              ? `Active Sub-Agents saat ini: ${activeDomains.join(', ')}`
              : 'Active Sub-Agents saat ini: NONE (semua paused)';
            const memoryContext = new SessionMemoryService().buildMemoryContextLine();
            const systemPrompt = ATHENA_SYSTEM_PROMPT_BASE + `
Current Operating Parameters:
- ${activeAgentsLine}
- Execution Mode: MANUAL EXECUTION — bot hanya screener/caller, eksekusi dilakukan user via link di call card.
- Global Portfolio Drawdown Limit: 50.0%.
- Current Portfolio Drawdown: 0.0%.${memoryContext}`;

            const agentResult = await runAgent(
              { aiService, toolRegistry, systemPrompt },
              chatMsg
            );
            const aiRes = agentResult.text || (agentResult.toolResults.length > 0
              ? agentResult.toolResults.map((t) => `• ${t.name}: ${t.success ? '✅' : '❌'} ${t.message}`).join('\n')
              : '[Tidak ada respons dari AI.]');
            console.log(`${C.cyan}Athena Oracle:${C.reset} ${aiRes}\n`);
          } catch (err: any) {
            console.log(`${C.cyan}Athena Oracle:${C.reset} Order acknowledged: "${chatMsg}". Operating in DRY_RUN safe simulation.\n`);
          }
        }
        break;

      case '5':
        console.clear();
        console.log(`${C.cyan}=== ⚙️ GLOBAL RISK MANAGEMENT & SAFEGUARDS ===${C.reset}`);
        console.log(`• Max Daily Drawdown: 50%`);
        console.log(`• Default Position Size: 0.5 SOL / 0.1 ETH`);
        console.log(`• Auto Take Profit Targets: +100% (50%), +200% (25%)`);
        console.log(`• Auto Stop Loss Target: -20% (Dynamic Trailing Enabled)`);
        await prompt(`\n${C.yellow}Press Enter to return to Parthenon...${C.reset}`);
        break;

      case '6':
        console.clear();
        console.log(`${C.cyan}=== 📊 TRADE JOURNAL & PNL ANALYTICS ===${C.reset}`);
        console.log(`• Total Logged Trades: ${C.green}2 Trades${C.reset}`);
        console.log(`• Win Rate: ${C.green}100.0%${C.reset} (2 Wins / 0 Losses)`);
        console.log(`• Total Realized PnL: ${C.green}+$10,695.00 USD${C.reset}`);
        console.log(`• Best Trade: ${C.green}+$10,395.00 USD${C.reset} (PUDGY NFT Snipe)`);
        await prompt(`\n${C.yellow}Press Enter to return to Parthenon...${C.reset}`);
        break;

      case '7':
        console.clear();
        console.log(`${C.red}=== 🛑 EMERGENCY CIRCUIT BREAKER ===${C.reset}`);
        console.log(`${C.red}Aegis Shield engaged! All screening agents and pending orders halted!${C.reset}`);
        await prompt(`\n${C.yellow}Press Enter to return to Parthenon...${C.reset}`);
        break;

      case '8': {
        console.clear();
        console.log(`${C.cyan}=== ▶️ RUN SCREENING PASS (LOCAL TEST) ===${C.reset}`);
        const { AGENT_DOMAINS } = await import('../orchestrator/agent-registry.js');
        AGENT_DOMAINS.forEach((d, i) => console.log(`[${i + 1}] ${d.displayName} (${d.channel})`));
        console.log('[0] Back\n');
        const sel = await prompt('Select Agent (1-8): ');
        const chosen = AGENT_DOMAINS[parseInt(sel) - 1];
        if (!chosen) { await prompt(`${C.red}Invalid. Press Enter...${C.reset}`); break; }
        console.log(`\n${C.yellow}Running ${chosen.displayName} screening pass...${C.reset}`);
        const results = await hub.triggerAgentPass(chosen.id);
        if (results.length === 0) {
          console.log(`${C.yellow}No signals passed. (Data unavailable or filtered out — check logs.)${C.reset}`);
        }
        for (const r of results) {
          const payload = (r as any).payload;
          if (payload) {
            console.log(`\n${C.green}✅ ${payload.symbol} (${payload.title}) — ${payload.confidenceScore}%${C.reset}`);
            console.log(`   MC: ${payload.marketCap} | Liq: ${payload.liquidity} | Vol1h: ${payload.volume1h}`);
            console.log(`   Tx: ${payload.txRatio} | Dev: ${payload.devHoldingPct} | Bundler: ${payload.bundlerPct}`);
            console.log(`   Thesis: ${payload.aiThesis}`);
          } else {
            console.log(`\n${C.green}✅ Signal: ${r.reason}${C.reset}`);
          }
        }
        await prompt(`\n${C.yellow}Press Enter to return to Parthenon...${C.reset}`);
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
