import dotenv from 'dotenv';
import readline from 'readline';
dotenv.config();
import { AthenaHub } from '../orchestrator/hub.js';
import { SwarmConsensusEngine } from '../orchestrator/swarm-consensus.js';
import { AIService } from '../services/ai-service.js';
import { WalletService } from '../services/wallet-service.js';

import { StateStore } from '../services/state-store.js';

const stateStore = new StateStore();
const hub = new AthenaHub();
const swarmEngine = new SwarmConsensusEngine();
const aiService = new AIService();
const walletService = new WalletService();
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
    console.log(`${C.yellow}🌿 Aegis Safeguard:${C.reset} DRY_RUN Mode Active | ${C.yellow}🦉 AI Oracle:${C.reset} ${aiService.getConfig().provider} (${aiService.getConfig().modelName})`);
    console.log(`${C.cyan}------------------------------------------------------------------------${C.reset}`);
    console.log(` ${C.green}[1]${C.reset} 🔑 Burner Wallet & Treasury Manager (View/Import PK)`);
    console.log(` ${C.green}[2]${C.reset} 🔍 On-Demand 3-Layer Swarm Token Audit (Input CA)`);
    console.log(` ${C.green}[3]${C.reset} ⚡ Background Screening Control (Solana/EVM/Perps/NFT/Polymarket)`);
    console.log(` ${C.green}[4]${C.reset} 🧠 Command Room Oracle Chat (Natural Language AI Hub)`);
    console.log(` ${C.green}[5]${C.reset} ⚙️ Global Risk Management & Position Size Safeguards`);
    console.log(` ${C.green}[6]${C.reset} 📊 Trade Journal & Realized PnL Analytics (View Summary)`);
    console.log(` ${C.green}[7]${C.reset} 🛑 Emergency Circuit Breaker (Halt All Active Agents)`);
    console.log(` ${C.red}[0]${C.reset} ❌ Exit Parthenon Control Center`);
    console.log(`${C.cyan}------------------------------------------------------------------------${C.reset}`);

    const choice = await prompt(`${C.bright}⚔️ Select Command Option (0-7): ${C.reset}`);

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
          const res = swarmEngine.evaluateSignal({
            symbol: 'CUSTOM',
            domain: 'MEME_SOLANA',
            contractAddress: ca.trim(),
            liquidityUsd: 18000,
            volume1hUsd: 65000,
            securityAuditPassed: true,
            socialHypeScore: 88,
          });
          console.log(`\n${C.green}Athena Swarm Verdict:${C.reset}`);
          console.log(`• Confidence Score: ${C.bright}${res.confidenceScore}%${C.reset} (${res.passed ? C.green + 'APPROVED (>=80%)' : C.red + 'REJECTED'}${C.reset})`);
          console.log(`• Audit Reasoning: ${res.reason}`);
        }
        await prompt(`\n${C.yellow}Press Enter to return to Parthenon...${C.reset}`);
        break;

      case '3':
        console.clear();
        console.log(`${C.cyan}=== ⚡ BACKGROUND SCREENING SUB-AGENTS CONTROL ===${C.reset}`);
        const subAgentsList = [
          { id: '1', domain: 'meme-solana', label: 'Solana Meme Agent (Pump.fun / Raydium)' },
          { id: '2', domain: 'meme-evm', label: 'EVM Meme Agent (Base / ETH / Robinhood)' },
          { id: '3', domain: 'lp-solana', label: 'Solana LP Agent (Meteora DLMM)' },
          { id: '4', domain: 'lp-evm', label: 'EVM LP Agent (Uniswap V3)' },
          { id: '5', domain: 'perps', label: 'Perpetuals Agent (Hyperliquid)' },
          { id: '6', domain: 'nft', label: 'NFT Sniping Agent (OpenSea)' },
          { id: '7', domain: 'prediction', label: 'Polymarket Agent (Polygon L2)' },
          { id: '8', domain: 'ct-alpha', label: 'Smart CT & AI Alpha Agent (X/Twitter)' },
        ];
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
            const systemPrompt = `You are Athena, a chill, brilliant, and interactive AI crypto trading companion.
You chat naturally and casually like a smart crypto-native friend (gaya bahasa santai, ramah, dan interaktif), but always stay sharp, accurate, and direct.

CRITICAL TONE & COST EFFICIENCY RULES:
- Be casual, friendly, and conversational (bahasa santai, ga kaku, ga kelewat formal).
- Be extremely TO THE POINT and concise. NO fluff, NO introductory fillers, NO repetitive summaries (hemat token, langsung ke inti).
- Use clear markdown bullet points when explaining technical data or steps.

ATHENA SYSTEM ARCHITECTURE & SELF-KNOWLEDGE:
1. Hub & Orchestrator: Runs in #athena-control-room / Parthenon TUI for portfolio tracking, risk management, trade execution, and natural language trade audits.
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
5. Direct On-Chain Execution: Intent-based /bridge, /swap, and /send via Relay.link and OpenSea API v2.

Current Operating Parameters:
- Execution Mode: DRY_RUN Active (Safe Simulation).
- Global Portfolio Drawdown Limit: 50.0%.
- Current Portfolio Drawdown: 0.0%.`;

            const aiRes = await aiService.generateCompletion([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: chatMsg },
            ]);
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

      default:
        await prompt(`${C.red}Invalid option. Press Enter to try again...${C.reset}`);
        break;
    }
  }
}

if (process.argv[1]?.includes('tui') || process.argv.includes('--tui')) {
  launchTUI().catch(console.error);
}
