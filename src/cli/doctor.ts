import { OpenCatzHub, OpenCatHub } from '../orchestrator/hub.js';

// ANSI Color Tokens from OpenCatz Palette
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  lime: '\x1b[38;2;204;255;0m',      // #CCFF00 Robinhood Green
  pink: '\x1b[38;2;255;183;178m',    // #FFB7B2 Pastel Pink
  lavender: '\x1b[38;2;214;199;255m',// #D6C7FF Lavender Purple
  cyan: '\x1b[38;2;128;222;234m',    // #80DEEA Retro Cyan
  yellow: '\x1b[38;2;255;245;157m',  // #FFF59D Pastel Yellow
  gold: '\x1b[38;2;255;215;0m',      // #FFD700 Golden Fortune
  red: '\x1b[38;2;229;57;53m',       // #E53935 Maneki-Neko Red
  green: '\x1b[38;2;0;230;118m',     // #00E676 Jade Spirit
};

export async function runOpenCatzDoctor(): Promise<void> {
  console.log(`
${C.lime}${C.bold}       /\\_____/\\
      /  ${C.pink}■${C.lime}   ${C.pink}■${C.lime}  \\      ${C.green}🐾 OPENCATZ AI — SYSTEM DOCTOR 🐾${C.reset}
${C.lime}     ( ==  ${C.pink}^${C.lime}  == )     ${C.cyan}Autonomous Multi-Agent Health Audit${C.reset}
${C.lime}      )    ${C.yellow}~${C.lime}    (      ${C.lavender}Robinhood Chain EVM L2 • Chain ID: 4663${C.reset}
${C.lime}     (   _____   )     ${C.gold}"Chill trades, 9 lives, sharp alpha."${C.reset}
${C.lime}    ( (  )   (  ) )
   (__(__)___(__)__)${C.reset}
`);
  console.log(`${C.lime}${C.bold}========================================================================${C.reset}`);
  console.log(`${C.lime}${C.bold}🩺 OPENCATZ AI AGENT SYSTEM DOCTOR & DIAGNOSTICS AUDIT${C.reset}`);
  console.log(`${C.lime}${C.bold}========================================================================${C.reset}\n`);

  // 1. Check API Keys Configuration
  console.log('🔑 1. API KEYS CONFIGURATION AUDIT:');
  const envKeys = [
    { name: 'AI_API_KEY / AI_API_KEYS', val: process.env.AI_API_KEYS || process.env.AI_API_KEY, required: true },
    { name: 'GMGN_API_KEY', val: process.env.GMGN_API_KEY, required: false },
    { name: 'OPENSEA_API_KEY', val: process.env.OPENSEA_API_KEY, required: false },
    { name: 'GOPLUS_API_KEY', val: process.env.GOPLUS_API_KEY, required: false },
    { name: 'DISCORD_BOT_TOKEN', val: process.env.DISCORD_BOT_TOKEN, required: false },
    { name: 'TELEGRAM_BOT_TOKEN', val: process.env.TELEGRAM_BOT_TOKEN, required: false },
  ];

  for (const k of envKeys) {
    const isSet = Boolean(k.val);
    const symbol = isSet ? '🟢 CONFIGURED' : k.required ? '🔴 MISSING (REQUIRED)' : '⚪ UNSET (OPTIONAL)';
    const hint = isSet ? `(${k.val!.slice(0, 10)}...)` : '';
    console.log(`   • ${k.name.padEnd(28)}: ${symbol} ${hint}`);
  }

  // 2. Check RPC Node Connectivity
  console.log('\n⚡ 2. WEB3 RPC NODE LATENCY CHECKS:');
  const rpcs = [
    { chain: 'Robinhood Chain', url: process.env.EVM_ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com' },
  ];

  for (const rpc of rpcs) {
    const start = Date.now();
    try {
      const res = await fetch(rpc.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      const latency = Date.now() - start;
      console.log(`   • ${rpc.chain.padEnd(20)}: 🟢 ONLINE (${latency}ms) | Endpoint: ${rpc.url}`);
    } catch (err: any) {
      console.log(`   • ${rpc.chain.padEnd(20)}: 🔴 OFFLINE (${err.message}) | Endpoint: ${rpc.url}`);
    }
  }

  // 3. Sub-Agent Statuses
  console.log('\n🐾 3. SUB-AGENT 24/7 SCREENING STATUSES:');
  const hub = new OpenCatzHub();
  const statuses = hub.getAgentStatuses();
  for (const [name, state] of Object.entries(statuses)) {
    console.log(`   • ${name.toUpperCase().padEnd(20)}: ${state.active ? '🟢 ACTIVE (24/7 Background Running)' : '🔴 PAUSED'}`);
  }

  console.log('\n======================================================');
  console.log('✅ Opencatz diagnostic check completed successfully!');
  console.log('======================================================\n');
}

/** Backward-compatible alias */
export const runOpenCatDoctor = runOpenCatzDoctor;

if (process.argv[1] && process.argv[1].includes('doctor')) {
  runOpenCatzDoctor().catch(console.error);
}
