import fs from 'fs';
import path from 'path';
import readline from 'readline';

const envPath = path.join(process.cwd(), '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function runWizard() {
  console.log('\n======================================================');
  console.log('🏛️ ATHENA MULTI-AGENT ENGINE - MASTER ONBOARDING WIZARD');
  console.log('======================================================\n');
  console.log('💡 Note: API keys are MANDATORY for respective sub-agents to run cleanly. Press ENTER to keep existing configured values.\n');

  let existingEnv = {};
  if (fs.existsSync(envPath)) {
    const rawEnv = fs.readFileSync(envPath, 'utf8');
    rawEnv.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        existingEnv[match[1].trim()] = match[2].trim();
      }
    });
  }

  // 1. INTERFACE MODE SELECTION
  console.log('📌 STEP 1: INTERFACE MODE SELECTION');
  console.log(' [1] Discord Command Center (Default)');
  console.log(' [2] Telegram Bot & Forum Topics Bridge');
  console.log(' [3] Dual Mode (Discord + Telegram Bridge)');
  console.log(' [4] Standalone Terminal TUI (Direct VPS Console)');
  const interfaceChoice = await askQuestion('Selection (1/2/3/4) [Default 1]: ') || '1';

  let botToken = existingEnv.DISCORD_BOT_TOKEN || '';
  let clientId = existingEnv.DISCORD_CLIENT_ID || '';
  let telegramToken = existingEnv.TELEGRAM_BOT_TOKEN || '';
  let telegramChatId = existingEnv.TELEGRAM_CHAT_ID || '';

  // 2. DISCORD CREDENTIALS
  if (interfaceChoice === '1' || interfaceChoice === '3') {
    console.log('\n💬 STEP 2: DISCORD BOT CREDENTIALS');
    const defaultBotMsg = botToken ? ` [Default: ${botToken.slice(0, 10)}...]` : '';
    const inputBot = await askQuestion(` 1. Enter DISCORD_BOT_TOKEN${defaultBotMsg}: `);
    botToken = inputBot.trim() || botToken;

    const defaultClientMsg = clientId ? ` [Default: ${clientId}]` : '';
    const inputClient = await askQuestion(` 2. Enter DISCORD_CLIENT_ID${defaultClientMsg}: `);
    clientId = inputClient.trim() || clientId;
  }

  // 3. TELEGRAM CREDENTIALS
  if (interfaceChoice === '2' || interfaceChoice === '3') {
    console.log('\n📱 STEP 3: TELEGRAM BOT CREDENTIALS');
    const defaultTgBotMsg = telegramToken ? ` [Default: ${telegramToken.slice(0, 10)}...]` : '';
    const inputTgBot = await askQuestion(` 1. Enter TELEGRAM_BOT_TOKEN${defaultTgBotMsg}: `);
    telegramToken = inputTgBot.trim() || telegramToken;

    const defaultTgChatMsg = telegramChatId ? ` [Default: ${telegramChatId}]` : '';
    const inputTgChat = await askQuestion(` 2. Enter TELEGRAM_CHAT_ID${defaultTgChatMsg}: `);
    telegramChatId = inputTgChat.trim() || telegramChatId;
  }

  // 4. AI REASONING ENGINE
  console.log('\n🤖 STEP 4: AI REASONING ENGINE CREDENTIALS (MANDATORY)');
  let existingProvider = existingEnv.AI_PROVIDER || '';
  let existingBaseUrl = existingEnv.AI_BASE_URL || '';
  let existingModelName = existingEnv.AI_MODEL_NAME || '';
  let aiKey = existingEnv.AI_API_KEY || existingEnv.OPENROUTER_API_KEY || existingEnv.OPENAI_API_KEY || '';
  let rawExistingKeys = existingEnv.AI_API_KEYS || existingEnv.AI_API_KEY || '';
  let existingKeyList = rawExistingKeys.split(',').map(k => k.trim()).filter(Boolean);
  let allKeys = [];

  if (existingKeyList.length > 0) {
    console.log(` ℹ️  Found ${existingKeyList.length} API key(s) in existing config:`);
    existingKeyList.forEach((k, idx) => {
      console.log(`   - Key #${idx + 1}: ${k.slice(0, 14)}...`);
    });
    const keepKeys = await askQuestion(' Keep existing API key(s)? (Y/n) [Default Y]: ') || 'y';
    if (keepKeys.toLowerCase() !== 'n') {
      allKeys = existingKeyList;
      aiKey = existingKeyList[0];
    }
  }

  if (allKeys.length === 0) {
    const defaultAiKeyMsg = aiKey ? ` [Default: ${aiKey.slice(0, 12)}...]` : ' [Mandatory - OpenCode / Z.ai / OpenRouter]';
    const inputAiKey = await askQuestion(` 1. Enter Primary AI API KEY (OpenCode Go / Z.ai / OpenRouter / OpenAI)${defaultAiKeyMsg}: `);
    aiKey = inputAiKey.trim() || aiKey;

    const stackChoice = await askQuestion(' 2. Add Failover Backup API Key (e.g. Z.ai CodingPlan GLM 4.7 backup)? (y/N) [Default N]: ');
    let allKeysList = aiKey ? aiKey.split(',').map(k => k.trim()).filter(Boolean) : [];
    if (allKeysList.length === 0 && aiKey) allKeysList.push(aiKey);

    if (stackChoice.toLowerCase() === 'y') {
      const backupCountStr = await askQuestion('   How many backup API keys to add? (1-5) [Default 1]: ') || '1';
      const backupCount = Math.min(Math.max(parseInt(backupCountStr) || 1, 1), 5);
      for (let i = 1; i <= backupCount; i++) {
        const bKey = await askQuestion(`   ➡️ Enter Backup API Key #${i} (e.g., Z.ai / OpenRouter key): `);
        if (bKey.trim()) allKeysList.push(bKey.trim());
      }
    }
    allKeys = allKeysList;
  }
  const combinedKeys = allKeys.join(',');

  // Auto-detect provider if existingProvider not set
  let detectedProvider = existingProvider;
  let detectedBaseUrl = existingBaseUrl;
  let detectedModelName = existingModelName;

  if (!detectedProvider) {
    const lowerKey = aiKey.toLowerCase();
    if (lowerKey.includes('opencode') || existingBaseUrl.includes('opencode')) {
      detectedProvider = 'opencode';
      detectedBaseUrl = 'https://opencode.ai/zen/go/v1';
      detectedModelName = 'deepseek-v4-pro';
    } else if (lowerKey.includes('zai') || lowerKey.includes('glm') || existingBaseUrl.includes('z.ai')) {
      detectedProvider = 'zai';
      detectedBaseUrl = 'https://api.z.ai/api/coding/paas/v4';
      detectedModelName = 'glm-4.7';
    } else {
      detectedProvider = 'opencode';
      detectedBaseUrl = 'https://opencode.ai/zen/go/v1';
      detectedModelName = 'deepseek-v4-pro';
    }
  }

  console.log('\n Select AI Provider & Model Configuration:');
  if (existingProvider) {
    console.log(` [1] Keep Existing Config (${existingProvider} | ${existingModelName || 'default'} | ${existingBaseUrl || 'default'})`);
    console.log(' [2] OpenCode Go (DeepSeek V4 Pro / Flash - opencode.ai/go)');
    console.log(' [3] Z.ai / Zhipu GLM Coding Plan (GLM 4.7 / 5.2 - z.ai)');
    console.log(' [4] OpenRouter (openrouter.ai/api/v1)');
    console.log(' [5] Anthropic Claude (Claude 3.5 Sonnet)');
    console.log(' [6] OpenAI (GPT-4o)');
    console.log(' [7] Custom OpenAI-Compatible Endpoint');
  } else {
    console.log(` [1] OpenCode Go (DeepSeek V4 Pro / Flash - opencode.ai/go) ${detectedProvider === 'opencode' ? '⭐ (Auto-Detected)' : ''}`);
    console.log(` [2] Z.ai / Zhipu GLM Coding Plan (GLM 4.7 / 5.2 - z.ai) ${detectedProvider === 'zai' ? '⭐ (Auto-Detected)' : ''}`);
    console.log(` [3] OpenRouter (Access to free & open models) ${detectedProvider === 'openrouter' ? '⭐ (Default)' : ''}`);
    console.log(' [4] Anthropic Claude (Claude 3.5 Sonnet)');
    console.log(' [5] OpenAI (GPT-4o)');
    console.log(' [6] Custom OpenAI-Compatible Endpoint');
  }

  const defaultChoiceStr = existingProvider ? '1' : (detectedProvider === 'opencode' ? '1' : (detectedProvider === 'zai' ? '2' : '3'));
  const providerChoice = await askQuestion(` Choice [Default ${defaultChoiceStr}]: `) || defaultChoiceStr;

  let provider = detectedProvider || 'opencode';
  let baseUrl = detectedBaseUrl || 'https://opencode.ai/zen/go/v1';
  let modelName = detectedModelName || 'deepseek-v4-pro';

  if (existingProvider && providerChoice === '1') {
    provider = existingProvider;
    baseUrl = existingBaseUrl || (existingProvider === 'opencode' ? 'https://opencode.ai/zen/go/v1' : (existingProvider === 'zai' ? 'https://api.z.ai/api/coding/paas/v4' : 'https://openrouter.ai/api/v1'));
    modelName = existingModelName || (existingProvider === 'opencode' ? 'deepseek-v4-pro' : (existingProvider === 'zai' ? 'glm-4.7' : 'openrouter/auto'));
  } else {
    const isOpencodeChoice = (!existingProvider && providerChoice === '1') || (existingProvider && providerChoice === '2');
    const isZaiChoice = (!existingProvider && providerChoice === '2') || (existingProvider && providerChoice === '3');
    const isOpenRouterChoice = (!existingProvider && providerChoice === '3') || (existingProvider && providerChoice === '4');
    const isAnthropicChoice = (!existingProvider && providerChoice === '4') || (existingProvider && providerChoice === '5');
    const isOpenAiChoice = (!existingProvider && providerChoice === '5') || (existingProvider && providerChoice === '6');
    const isCustomChoice = (!existingProvider && providerChoice === '6') || (existingProvider && providerChoice === '7');

    if (isOpencodeChoice) {
      provider = 'opencode';
      const defaultUrl = existingBaseUrl || 'https://opencode.ai/zen/go/v1';
      const defaultModel = existingModelName || 'deepseek-v4-pro';
      baseUrl = await askQuestion(` Enter OpenCode AI_BASE_URL [Default ${defaultUrl}]: `) || defaultUrl;
      modelName = await askQuestion(` Enter OpenCode AI_MODEL_NAME [Default ${defaultModel}]: `) || defaultModel;
    } else if (isZaiChoice) {
      provider = 'zai';
      const defaultUrl = existingBaseUrl || 'https://api.z.ai/api/coding/paas/v4';
      const defaultModel = existingModelName || 'glm-4.7';
      baseUrl = await askQuestion(` Enter Z.ai AI_BASE_URL [Default ${defaultUrl}]: `) || defaultUrl;
      modelName = await askQuestion(` Enter Z.ai AI_MODEL_NAME [Default ${defaultModel}]: `) || defaultModel;
    } else if (isOpenRouterChoice) {
      provider = 'openrouter';
      baseUrl = 'https://openrouter.ai/api/v1';
      modelName = await askQuestion(` Enter OpenRouter AI_MODEL_NAME [Default ${existingModelName || 'openrouter/auto'}]: `) || existingModelName || 'openrouter/auto';
    } else if (isAnthropicChoice) {
      provider = 'anthropic';
      baseUrl = 'https://api.anthropic.com/v1';
      modelName = 'claude-3-5-sonnet-20241022';
    } else if (isOpenAiChoice) {
      provider = 'openai';
      baseUrl = 'https://api.openai.com/v1';
      modelName = 'gpt-4o';
    } else if (isCustomChoice) {
      provider = 'custom';
      baseUrl = await askQuestion(` Enter AI_BASE_URL [Default ${existingBaseUrl || 'https://api.9router.com/v1'}]: `) || existingBaseUrl || 'https://api.9router.com/v1';
      modelName = await askQuestion(` Enter AI_MODEL_NAME [Default ${existingModelName || 'glm-4'}]: `) || existingModelName || 'glm-4';
    }
  }

  // 5. PRO MARKET DATA & SECURITY AUDIT APIS
  console.log('\n📊 STEP 5: PRO MARKET DATA & SECURITY AUDIT APIS (MANDATORY FOR AGENTS)');
  let gmgnApiKey = existingEnv.GMGN_API_KEY || '';
  let openseaApiKey = existingEnv.OPENSEA_API_KEY || '';
  let twexApiKey = existingEnv.TWEX_API_KEY || existingEnv.TWITTER_BEARER_TOKEN || '';
  let goplusApiKey = existingEnv.GOPLUS_API_KEY || '';
  let polymarketPrivateKey = existingEnv.POLYMARKET_PRIVATE_KEY || '';

  const defaultGmgn = gmgnApiKey ? ` [Default: ${gmgnApiKey.slice(0, 8)}...]` : ' [Mandatory for Solana/LP Agents]';
  const inputGmgn = await askQuestion(` 1. GMGN_API_KEY (GMGN AI Pro API for Smart Money & Snipers)${defaultGmgn}: `);
  gmgnApiKey = inputGmgn.trim() || gmgnApiKey;

  const defaultOpensea = openseaApiKey ? ` [Default: ${openseaApiKey.slice(0, 8)}...]` : ' [Mandatory for NFT Agent]';
  const inputOpensea = await askQuestion(` 2. OPENSEA_API_KEY (OpenSea REST API v2 for NFT Floor & Rarity)${defaultOpensea}: `);
  openseaApiKey = inputOpensea.trim() || openseaApiKey;

  const defaultTwex = twexApiKey ? ` [Default: ${twexApiKey.slice(0, 8)}...]` : ' [Mandatory for CT Alpha Agent]';
  const inputTwex = await askQuestion(` 3. TWEX_API_KEY / TWITTER_BEARER_TOKEN (X/Twitter Sentiment & CT Alpha)${defaultTwex}: `);
  twexApiKey = inputTwex.trim() || twexApiKey;

  const defaultGoplus = goplusApiKey ? ` [Default: ${goplusApiKey.slice(0, 8)}...]` : ' [Mandatory for EVM/LP Agents]';
  const inputGoplus = await askQuestion(` 4. GOPLUS_API_KEY (EVM Anti-Honeypot Audit Key)${defaultGoplus}: `);
  goplusApiKey = inputGoplus.trim() || goplusApiKey;

  const defaultPoly = polymarketPrivateKey ? ` [Default: ${polymarketPrivateKey.slice(0, 8)}...]` : ' [Mandatory for Polymarket Agent]';
  const inputPoly = await askQuestion(` 5. POLYMARKET_PRIVATE_KEY (Polymarket Polygon L2 Trading Key)${defaultPoly}: `);
  polymarketPrivateKey = inputPoly.trim() || polymarketPrivateKey;

  // 6. WEB3 RPC ENDPOINTS
  console.log('\n⚡ STEP 6: WEB3 RPC ENDPOINTS & HIGH-VELOCITY NETWORK NODES');
  let solanaRpcUrl = existingEnv.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  let solanaWssUrl = existingEnv.SOLANA_WSS_URL || 'wss://api.mainnet-beta.solana.com';
  let evmBaseRpcUrl = existingEnv.EVM_BASE_RPC_URL || existingEnv.EVM_RPC_URL || 'https://mainnet.base.org';
  let evmEthRpcUrl = existingEnv.EVM_ETH_RPC_URL || 'https://eth.llamarpc.com';
  let evmRobinhoodRpcUrl = existingEnv.EVM_ROBINHOOD_RPC_URL || 'https://arb1.arbitrum.io/rpc';

  console.log(' 💡 Opsi Cepat Solana RPC: Kamu bisa langsung memasukkan HELIUS API KEY saja!');
  const heliusInput = await askQuestion(' 1. Punya Helius API Key? Masukkan Key di sini (atau tekan ENTER untuk diisi manual/default): ');
  
  if (heliusInput.trim()) {
    const key = heliusInput.trim();
    solanaRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${key}`;
    solanaWssUrl = `wss://mainnet.helius-rpc.com/?api-key=${key}`;
    console.log(`    ✅ Auto-Configured Helius RPC & WSS URLs dengan API Key kamu!`);
  } else {
    const defaultSolRpc = solanaRpcUrl ? ` [SUDAH TERISI: ${solanaRpcUrl.slice(0, 35)}...]` : ' [Default: Public Solana RPC]';
    const inputSolRpc = await askQuestion(`    a. SOLANA_RPC_URL (HTTP)${defaultSolRpc}: `);
    solanaRpcUrl = inputSolRpc.trim() || solanaRpcUrl;

    const defaultSolWss = solanaWssUrl ? ` [SUDAH TERISI: ${solanaWssUrl.slice(0, 35)}...]` : ' [Default: Public Solana WSS]';
    const inputSolWss = await askQuestion(`    b. SOLANA_WSS_URL (WebSocket)${defaultSolWss}: `);
    solanaWssUrl = inputSolWss.trim() || solanaWssUrl;
  }

  const defaultBaseRpc = evmBaseRpcUrl ? ` [SUDAH TERISI: ${evmBaseRpcUrl}]` : ' [Default: https://mainnet.base.org]';
  const inputBaseRpc = await askQuestion(` 2. EVM_BASE_RPC_URL (Base L2 RPC)${defaultBaseRpc}: `);
  evmBaseRpcUrl = inputBaseRpc.trim() || evmBaseRpcUrl;

  const defaultEthRpc = evmEthRpcUrl ? ` [SUDAH TERISI: ${evmEthRpcUrl}]` : ' [Default: https://eth.llamarpc.com]';
  const inputEthRpc = await askQuestion(` 3. EVM_ETH_RPC_URL (Ethereum Mainnet RPC)${defaultEthRpc}: `);
  evmEthRpcUrl = inputEthRpc.trim() || evmEthRpcUrl;

  const defaultRhRpc = evmRobinhoodRpcUrl ? ` [SUDAH TERISI: ${evmRobinhoodRpcUrl}]` : ' [Default: https://arb1.arbitrum.io/rpc]';
  const inputRhRpc = await askQuestion(` 4. EVM_ROBINHOOD_RPC_URL (Robinhood L2 / Arbitrum RPC)${defaultRhRpc}: `);
  evmRobinhoodRpcUrl = inputRhRpc.trim() || evmRobinhoodRpcUrl;

  // 7. BURNER WALLETS & PERPS KEYS
  console.log('\n👛 STEP 7: ON-CHAIN BURNER WALLETS & EXCHANGE API KEYS');
  let solanaPrivateKey = existingEnv.SOLANA_PRIVATE_KEY || '';
  let evmPrivateKey = existingEnv.EVM_PRIVATE_KEY || '';
  let hyperliquidPrivateKey = existingEnv.HYPERLIQUID_PRIVATE_KEY || '';

  const defaultSolPk = solanaPrivateKey ? ` [SUDAH TERISI: ${solanaPrivateKey.slice(0, 8)}...]` : ' [Required for On-Chain Solana Execution]';
  const inputSolPk = await askQuestion(` 1. SOLANA_PRIVATE_KEY${defaultSolPk}: `);
  solanaPrivateKey = inputSolPk.trim() || solanaPrivateKey;

  const defaultEvmPk = evmPrivateKey ? ` [SUDAH TERISI: ${evmPrivateKey.slice(0, 8)}...]` : ' [Required for On-Chain EVM Execution]';
  const inputEvmPk = await askQuestion(` 2. EVM_PRIVATE_KEY${defaultEvmPk}: `);
  evmPrivateKey = inputEvmPk.trim() || evmPrivateKey;

  const defaultHlPk = hyperliquidPrivateKey ? ` [SUDAH TERISI: ${hyperliquidPrivateKey.slice(0, 8)}...]` : ' [Mandatory for Perps Agent]';
  const inputHlPk = await askQuestion(` 3. HYPERLIQUID_PRIVATE_KEY (Perps Trading Account Key)${defaultHlPk}: `);
  hyperliquidPrivateKey = inputHlPk.trim() || hyperliquidPrivateKey;

  // 8. SIMULATION MODE
  console.log('\n⚙️ STEP 8: OPERATING MODE & SIMULATION BALANCES');
  const dryRunChoice = await askQuestion(' 1. Run agent in Simulation Mode (DRY_RUN)? (Y/n) [Default Y]: ') || 'y';
  const isDryRun = dryRunChoice.toLowerCase() !== 'n' ? 'true' : 'false';

  const defaultSolSim = existingEnv.SIMULATION_BALANCE_SOL ? ` [SUDAH TERISI: ${existingEnv.SIMULATION_BALANCE_SOL} SOL]` : ' [Default 10.0]';
  const simSolBalance = await askQuestion(` 2. Starting Simulation Balance for Solana (SOL)${defaultSolSim}: `) || existingEnv.SIMULATION_BALANCE_SOL || '10.0';

  const defaultEthSim = existingEnv.SIMULATION_BALANCE_ETH ? ` [SUDAH TERISI: ${existingEnv.SIMULATION_BALANCE_ETH} ETH]` : ' [Default 1.0]';
  const simEthBalance = await askQuestion(` 3. Starting Simulation Balance for EVM (ETH)${defaultEthSim}: `) || existingEnv.SIMULATION_BALANCE_ETH || '1.0';

  const defaultPolySim = existingEnv.SIMULATION_BALANCE_POLYMARKET ? ` [SUDAH TERISI: ${existingEnv.SIMULATION_BALANCE_POLYMARKET} USDC]` : ' [Default 500.0]';
  const simPolyBalance = await askQuestion(` 4. Starting Simulation Balance for Polymarket (USDC)${defaultPolySim}: `) || existingEnv.SIMULATION_BALANCE_POLYMARKET || '500.0';

  const defaultHlSim = existingEnv.SIMULATION_BALANCE_HYPERLIQUID ? ` [SUDAH TERISI: ${existingEnv.SIMULATION_BALANCE_HYPERLIQUID} USDC]` : ' [Default 1000.0]';
  const simHlBalance = await askQuestion(` 5. Starting Simulation Balance for Hyperliquid Perps (USDC)${defaultHlSim}: `) || existingEnv.SIMULATION_BALANCE_HYPERLIQUID || '1000.0';

  const primaryAiKey = allKeys[0] || '';

  let envContent = `NODE_ENV=production
DRY_RUN=${isDryRun}
LOG_LEVEL=info

# Simulated Starting Balance (Used in DRY_RUN / Demo mode)
SIMULATION_BALANCE_SOL=${simSolBalance.trim()}
SIMULATION_BALANCE_ETH=${simEthBalance.trim()}
SIMULATION_BALANCE_POLYMARKET=${simPolyBalance.trim()}
SIMULATION_BALANCE_HYPERLIQUID=${simHlBalance.trim()}

# Discord Credentials
DISCORD_BOT_TOKEN=${botToken.trim()}
DISCORD_CLIENT_ID=${clientId.trim()}
DISCORD_GUILD_ID=

# Telegram Credentials
TELEGRAM_BOT_TOKEN=${telegramToken.trim()}
TELEGRAM_CHAT_ID=${telegramChatId.trim()}

# AI Provider Configuration & Stacked Backup Keys
AI_PROVIDER=${provider}
AI_BASE_URL=${baseUrl}
AI_API_KEYS=${combinedKeys}
AI_API_KEY=${primaryAiKey}
AI_MODEL_NAME=${modelName}
OPENROUTER_API_KEY=${primaryAiKey}
OPENAI_API_KEY=${primaryAiKey}
ANTHROPIC_API_KEY=${primaryAiKey}

# Pro Market Data & Security Audit APIs
GMGN_API_KEY=${gmgnApiKey.trim()}
OPENSEA_API_KEY=${openseaApiKey.trim()}
TWEX_API_KEY=${twexApiKey.trim()}
TWITTER_BEARER_TOKEN=${twexApiKey.trim()}
GOPLUS_API_KEY=${goplusApiKey.trim()}
POLYMARKET_PRIVATE_KEY=${polymarketPrivateKey.trim()}

# Web3 RPC Endpoints & High-Velocity Network Nodes
SOLANA_RPC_URL=${solanaRpcUrl.trim()}
SOLANA_WSS_URL=${solanaWssUrl.trim()}
EVM_BASE_RPC_URL=${evmBaseRpcUrl.trim()}
EVM_RPC_URL=${evmBaseRpcUrl.trim()}
EVM_ETH_RPC_URL=${evmEthRpcUrl.trim()}
EVM_ROBINHOOD_RPC_URL=${evmRobinhoodRpcUrl.trim()}


# Web3 Burner Wallets & Perps Account Keys
SOLANA_PRIVATE_KEY=${solanaPrivateKey.trim()}
EVM_PRIVATE_KEY=${evmPrivateKey.trim()}
HYPERLIQUID_PRIVATE_KEY=${hyperliquidPrivateKey.trim()}

# Security Audit Endpoints
RUGCHECK_API_URL=https://api.rugcheck.xyz/v1
`;

  fs.writeFileSync(envPath, envContent, 'utf8');

  console.log('\n======================================================');
  console.log('✅ Configuration file (.env) successfully generated!');
  console.log(`💡 Operating Mode: ${isDryRun === 'true' ? 'SIMULATION (DRY_RUN ACTIVE)' : 'LIVE TRADING (CAUTION)'}`);
  console.log(`🪙 Demo Balance: ${simSolBalance} SOL | ${simEthBalance} ETH`);
  console.log('💡 All API keys and adapter credentials saved securely in .env');
  console.log('======================================================\n');

  rl.close();
}

runWizard().catch(console.error);
