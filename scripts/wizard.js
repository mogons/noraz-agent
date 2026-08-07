import fs from 'fs';
import path from 'path';
import readline from 'readline';

const envPath = path.join(process.cwd(), '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

const PROVIDER_PRESETS = {
  opencode: { baseUrl: 'https://opencode.ai/zen/go/v1', modelName: 'deepseek-v4-pro' },
  zai: { baseUrl: 'https://api.z.ai/api/coding/paas/v4', modelName: 'glm-4.7' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', modelName: 'openrouter/auto' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', modelName: 'claude-3-5-sonnet-20241022' },
  openai: { baseUrl: 'https://api.openai.com/v1', modelName: 'gpt-4o' },
};

const PROVIDER_DOMAINS = {
  opencode: 'opencode.ai',
  zai: 'z.ai',
  openrouter: 'openrouter.ai',
  anthropic: 'anthropic.com',
  openai: 'openai.com',
};

async function askCustomConfig(presetKey, existingBaseUrl, existingModelName, existingProviderKey) {
  if (presetKey === 'custom') {
    const baseUrl = await askQuestion(` Enter AI_BASE_URL [Default ${existingBaseUrl || 'https://api.9router.com/v1'}]: `) || existingBaseUrl || 'https://api.9router.com/v1';
    const modelName = await askQuestion(` Enter AI_MODEL_NAME [Default ${existingModelName || 'glm-4'}]: `) || existingModelName || 'glm-4';
    return { provider: 'custom', baseUrl, modelName };
  }
  const preset = PROVIDER_PRESETS[presetKey];
  const domain = PROVIDER_DOMAINS[presetKey];
  const defaultUrl = (existingBaseUrl && domain && existingBaseUrl.includes(domain)) ? existingBaseUrl : preset.baseUrl;
  const defaultModel = (existingProviderKey === presetKey && existingModelName) ? existingModelName : preset.modelName;
  const baseUrl = await askQuestion(` Enter ${presetKey} AI_BASE_URL [Default ${defaultUrl}]: `) || defaultUrl;
  const modelName = await askQuestion(` Enter ${presetKey} AI_MODEL_NAME [Default ${defaultModel}]: `) || defaultModel;
  return { provider: presetKey, baseUrl, modelName };
}

// Menu provider untuk PRIMARY key — default = Keep Existing / Auto-Detected
async function askPrimaryProviderConfig(existingProvider, existingBaseUrl, existingModelName, detectedProvider) {
  console.log('\n Select AI Provider & Model Configuration untuk PRIMARY Key:');
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

  if (existingProvider && providerChoice === '1') {
    return {
      provider: existingProvider,
      baseUrl: existingBaseUrl || (PROVIDER_PRESETS[existingProvider]?.baseUrl || 'https://openrouter.ai/api/v1'),
      modelName: existingModelName || (PROVIDER_PRESETS[existingProvider]?.modelName || 'openrouter/auto'),
    };
  }
  const presetKeys = existingProvider
    ? ['keep', 'opencode', 'zai', 'openrouter', 'anthropic', 'openai', 'custom']
    : ['opencode', 'zai', 'openrouter', 'anthropic', 'openai', 'custom'];
  const presetKey = presetKeys[providerChoice - 1] || 'custom';
  if (presetKey === 'keep') {
    return {
      provider: existingProvider,
      baseUrl: existingBaseUrl || 'https://openrouter.ai/api/v1',
      modelName: existingModelName || 'openrouter/auto',
    };
  }
  return await askCustomConfig(presetKey, existingBaseUrl, existingModelName, existingProvider);
}

// Menu provider untuk BACKUP key — default = "Sama dengan Key #1"
async function askBackupProviderConfig(label, primaryCfg) {
  console.log(`\n Select AI Provider & Model Configuration untuk ${label}:`);
  console.log(` [1] Sama dengan Key #1 (${primaryCfg.provider} | ${primaryCfg.modelName}) [Default]`);
  console.log(' [2] OpenCode Go (DeepSeek V4 Pro / Flash - opencode.ai/go)');
  console.log(' [3] Z.ai / Zhipu GLM Coding Plan (GLM 4.7 / 5.2 - z.ai)');
  console.log(' [4] OpenRouter (openrouter.ai/api/v1)');
  console.log(' [5] Anthropic Claude (Claude 3.5 Sonnet)');
  console.log(' [6] OpenAI (GPT-4o)');
  console.log(' [7] Custom OpenAI-Compatible Endpoint');
  const choice = (await askQuestion(' Choice [Default 1]: ')) || '1';
  if (choice === '1') return { ...primaryCfg };
  const presetKeys = ['opencode', 'zai', 'openrouter', 'anthropic', 'openai', 'custom'];
  const presetKey = presetKeys[choice - 2] || 'custom';
  return await askCustomConfig(presetKey, primaryCfg.baseUrl, primaryCfg.modelName, primaryCfg.provider);
}

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

  let provider = existingProvider || 'opencode';
  let baseUrl = existingBaseUrl || 'https://opencode.ai/zen/go/v1';
  let modelName = existingModelName || 'deepseek-v4-pro';
  const backupCfgEntries = [];

  if (allKeys.length === 0) {
    const defaultAiKeyMsg = aiKey ? ` [Default: ${aiKey.slice(0, 12)}...]` : ' [Mandatory - OpenCode / Z.ai / OpenRouter]';
    const inputAiKey = await askQuestion(` 1. Enter PRIMARY AI API KEY (OpenCode Go / Z.ai / OpenRouter / OpenAI)${defaultAiKeyMsg}: `);
    aiKey = inputAiKey.trim() || aiKey;

    // Auto-detect provider untuk primary (logika lama dipertahankan)
    let detectedProvider = existingProvider;
    if (!detectedProvider) {
      const lowerKey = aiKey.toLowerCase();
      if (lowerKey.includes('opencode') || existingBaseUrl.includes('opencode')) {
        detectedProvider = 'opencode';
      } else if (lowerKey.includes('zai') || lowerKey.includes('glm') || existingBaseUrl.includes('z.ai')) {
        detectedProvider = 'zai';
      } else {
        detectedProvider = 'opencode';
      }
    }

    const primaryCfg = await askPrimaryProviderConfig(existingProvider, existingBaseUrl, existingModelName, detectedProvider);
    provider = primaryCfg.provider;
    baseUrl = primaryCfg.baseUrl;
    modelName = primaryCfg.modelName;

    const stackChoice = await askQuestion(' 2. Add Failover Backup API Key (misal Z.ai GLM 4.7 backup, provider boleh beda)? (y/N) [Default N]: ');
    let allKeysList = aiKey ? aiKey.split(',').map(k => k.trim()).filter(Boolean) : [];
    if (allKeysList.length === 0 && aiKey) allKeysList.push(aiKey);

    if (stackChoice.toLowerCase() === 'y') {
      const backupCountStr = await askQuestion('   Berapa jumlah backup API key? (1-5) [Default 1]: ') || '1';
      const backupCount = Math.min(Math.max(parseInt(backupCountStr) || 1, 1), 5);
      for (let i = 1; i <= backupCount; i++) {
        const bKey = await askQuestion(`   ➡️ Enter BACKUP API KEY #${i} (misal Z.ai / OpenRouter key): `);
        if (!bKey.trim()) { console.log('   ⚠️  Backup key kosong, dilewati.'); continue; }
        allKeysList.push(bKey.trim());
        const bCfg = await askBackupProviderConfig(`BACKUP Key #${i}`, primaryCfg);
        backupCfgEntries.push({ slot: i + 1, cfg: bCfg });
      }
    }
    allKeys = allKeysList;
  } else {
    // Keep existing keys — primary provider tetap bisa diganti; AI_KEY_N_* lama dipertahankan oleh merge-write
    const primaryCfg = await askPrimaryProviderConfig(existingProvider, existingBaseUrl, existingModelName, existingProvider);
    provider = primaryCfg.provider;
    baseUrl = primaryCfg.baseUrl;
    modelName = primaryCfg.modelName;
  }
  const combinedKeys = allKeys.join(',');

  // 5. PRO MARKET DATA & SECURITY AUDIT APIS
  console.log('\n📊 STEP 5: PRO MARKET DATA & SECURITY AUDIT APIS (MANDATORY FOR AGENTS)');
  let gmgnApiKey = existingEnv.GMGN_API_KEY || '';
  let openseaApiKey = existingEnv.OPENSEA_API_KEY || '';
  let twexApiKey = existingEnv.TWEX_API_KEY || existingEnv.TWITTER_BEARER_TOKEN || '';
  let goplusApiKey = existingEnv.GOPLUS_API_KEY || '';
  let polymarketPrivateKey = existingEnv.POLYMARKET_PRIVATE_KEY || '';
  let uniswapApiKey = existingEnv.UNISWAP_API_KEY || '';
  let jupiterApiKey = existingEnv.JUPITER_API_KEY || '';

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

  const defaultUniswap = uniswapApiKey ? ` [Default: ${uniswapApiKey.slice(0, 8)}...]` : ' [Mandatory for EVM/Robinhood Entry via Uniswap API]';
  const inputUniswap = await askQuestion(` 6. UNISWAP_API_KEY (Uniswap Trade API — EVM/Robinhood swap entry)${defaultUniswap}: `);
  uniswapApiKey = inputUniswap.trim() || uniswapApiKey;

  const defaultJupiter = jupiterApiKey ? ` [Default: ${jupiterApiKey.slice(0, 8)}...]` : ' [Optional — higher rate limits for Solana Jupiter quotes]';
  const inputJupiter = await askQuestion(` 7. JUPITER_API_KEY (Jupiter API — optional, Solana swap entry rate limits)${defaultJupiter}: `);
  jupiterApiKey = inputJupiter.trim() || jupiterApiKey;

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

  // ── MERGE-BASED .env WRITE ─────────────────────────────────────────────
  // Never clobber the whole file: keep every existing key, only update the
  // values this wizard run collected. Unknown/extra keys survive untouched.
  const updates = {
    NODE_ENV: 'production',
    DRY_RUN: isDryRun,
    LOG_LEVEL: 'info',
    SIMULATION_BALANCE_SOL: simSolBalance.trim(),
    SIMULATION_BALANCE_ETH: simEthBalance.trim(),
    SIMULATION_BALANCE_POLYMARKET: simPolyBalance.trim(),
    SIMULATION_BALANCE_HYPERLIQUID: simHlBalance.trim(),
    DISCORD_BOT_TOKEN: botToken.trim(),
    DISCORD_CLIENT_ID: clientId.trim(),
    TELEGRAM_BOT_TOKEN: telegramToken.trim(),
    TELEGRAM_CHAT_ID: telegramChatId.trim(),
    AI_PROVIDER: provider,
    AI_BASE_URL: baseUrl,
    AI_API_KEYS: combinedKeys,
    AI_API_KEY: primaryAiKey,
    AI_MODEL_NAME: modelName,
    OPENROUTER_API_KEY: primaryAiKey,
    OPENAI_API_KEY: primaryAiKey,
    ANTHROPIC_API_KEY: primaryAiKey,
    GMGN_API_KEY: gmgnApiKey.trim(),
    OPENSEA_API_KEY: openseaApiKey.trim(),
    TWEX_API_KEY: twexApiKey.trim(),
    TWITTER_BEARER_TOKEN: twexApiKey.trim(),
    GOPLUS_API_KEY: goplusApiKey.trim(),
    POLYMARKET_PRIVATE_KEY: polymarketPrivateKey.trim(),
    UNISWAP_API_KEY: uniswapApiKey.trim(),
    JUPITER_API_KEY: jupiterApiKey.trim(),
    SOLANA_RPC_URL: solanaRpcUrl.trim(),
    SOLANA_WSS_URL: solanaWssUrl.trim(),
    EVM_BASE_RPC_URL: evmBaseRpcUrl.trim(),
    EVM_RPC_URL: evmBaseRpcUrl.trim(),
    EVM_ETH_RPC_URL: evmEthRpcUrl.trim(),
    EVM_ROBINHOOD_RPC_URL: evmRobinhoodRpcUrl.trim(),
    SOLANA_PRIVATE_KEY: solanaPrivateKey.trim(),
    EVM_PRIVATE_KEY: evmPrivateKey.trim(),
    HYPERLIQUID_PRIVATE_KEY: hyperliquidPrivateKey.trim(),
    RUGCHECK_API_URL: 'https://api.rugcheck.xyz/v1',
  };

  // Per-key backup config: AI_KEY_N_PROVIDER / AI_KEY_N_BASE_URL / AI_KEY_N_MODEL_NAME (slot = posisi di AI_API_KEYS)
  for (const { slot, cfg } of backupCfgEntries) {
    updates[`AI_KEY_${slot}_PROVIDER`] = cfg.provider;
    updates[`AI_KEY_${slot}_BASE_URL`] = cfg.baseUrl;
    updates[`AI_KEY_${slot}_MODEL_NAME`] = cfg.modelName;
  }

  let mergedLines = [];
  if (fs.existsSync(envPath)) {
    const rawEnv = fs.readFileSync(envPath, 'utf8');
    const seen = new Set();
    for (const line of rawEnv.split('\n')) {
      const match = line.match(/^([^#][^=]*)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        if (key in updates) {
          mergedLines.push(`${key}=${updates[key]}`);
          seen.add(key);
        } else {
          mergedLines.push(line); // preserve unknown keys verbatim
        }
      } else {
        mergedLines.push(line); // preserve comments/blank lines
      }
    }
    // Append any wizard keys that didn't exist yet
    for (const [key, val] of Object.entries(updates)) {
      if (!seen.has(key)) {
        mergedLines.push(`${key}=${val}`);
      }
    }
  } else {
    for (const [key, val] of Object.entries(updates)) {
      mergedLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(envPath, mergedLines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');

  console.log('\n======================================================');
  console.log('✅ Configuration file (.env) successfully generated!');
  console.log(`💡 Operating Mode: ${isDryRun === 'true' ? 'SIMULATION (DRY_RUN ACTIVE)' : 'LIVE TRADING (CAUTION)'}`);
  console.log(`🪙 Demo Balance: ${simSolBalance} SOL | ${simEthBalance} ETH`);
  console.log('💡 All API keys and adapter credentials saved securely in .env');
  console.log('======================================================\n');

  rl.close();
}

runWizard().catch(console.error);
