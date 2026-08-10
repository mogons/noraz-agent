import { AthenaHub } from '../orchestrator/hub.js';

export async function runAthenaDoctor(): Promise<void> {
  console.log('\n======================================================');
  console.log('🩺 ATHENA AGENT SYSTEM DOCTOR & DIAGNOSTICS');
  console.log('======================================================\n');

  // 1. Check API Keys Configuration
  console.log('🔑 1. API KEYS CONFIGURATION AUDIT:');
  const envKeys = [
    { name: 'AI_API_KEY / AI_API_KEYS', val: process.env.AI_API_KEYS || process.env.AI_API_KEY, required: true },
    { name: 'GMGN_API_KEY', val: process.env.GMGN_API_KEY, required: false },
    { name: 'OPENSEA_API_KEY', val: process.env.OPENSEA_API_KEY, required: false },
    { name: 'TWEX_API_KEY', val: process.env.TWEX_API_KEY || process.env.TWITTER_BEARER_TOKEN, required: false },
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
  console.log('\n🏛️ 3. SUB-AGENT 24/7 SCREENING STATUSES:');
  const hub = new AthenaHub();
  const statuses = hub.getAgentStatuses();
  for (const [name, state] of Object.entries(statuses)) {
    console.log(`   • ${name.toUpperCase().padEnd(20)}: ${state.active ? '🟢 ACTIVE (24/7 Background Running)' : '🔴 PAUSED'}`);
  }

  console.log('\n======================================================');
  console.log('✅ Diagnostic check completed successfully!');
  console.log('======================================================\n');
}

if (process.argv[1] && process.argv[1].includes('doctor')) {
  runAthenaDoctor().catch(console.error);
}
