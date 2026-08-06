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
  console.log('🏛️ ATHENA MULTI-AGENT ENGINE - INTERACTIVE ONBOARDING WIZARD');
  console.log('======================================================\n');

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

  console.log('📌 INTERFACE MODE SELECTION:');
  console.log(' [1] Discord Command Center (Default)');
  console.log(' [2] Telegram Bot & Forum Topics Bridge');
  console.log(' [3] Dual Mode (Discord + Telegram Bridge)');
  console.log(' [4] Standalone Terminal TUI (No Bot, Direct VPS Console)');
  const interfaceChoice = await askQuestion('Selection (1/2/3/4) [Default 1]: ') || '1';

  let botToken = existingEnv.DISCORD_BOT_TOKEN || '';
  let clientId = existingEnv.DISCORD_CLIENT_ID || '';
  let telegramToken = existingEnv.TELEGRAM_BOT_TOKEN || '';
  let telegramChatId = existingEnv.TELEGRAM_CHAT_ID || '';
  let aiKey = existingEnv.AI_API_KEY || '';
  let gmgnApiKey = existingEnv.GMGN_API_KEY || '';
  let openseaApiKey = existingEnv.OPENSEA_API_KEY || '';
  let twexApiKey = existingEnv.TWEX_API_KEY || existingEnv.TWITTER_BEARER_TOKEN || '';
  let goplusApiKey = existingEnv.GOPLUS_API_KEY || '';
  let solanaPrivateKey = existingEnv.SOLANA_PRIVATE_KEY || '';
  let evmPrivateKey = existingEnv.EVM_PRIVATE_KEY || '';
  let solanaRpcUrl = existingEnv.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  let evmBaseRpcUrl = existingEnv.EVM_BASE_RPC_URL || 'https://mainnet.base.org';

  let allKeys = [];

  if (interfaceChoice === '1' || interfaceChoice === '3') {
    console.log('\n💬 DISCORD BOT CREDENTIALS:');
    const defaultBotMsg = botToken ? ` [Default: ${botToken.slice(0, 10)}...]` : '';
    const inputBot = await askQuestion(`1. Enter DISCORD_BOT_TOKEN${defaultBotMsg}: `);
    botToken = inputBot.trim() || botToken;

    const defaultClientMsg = clientId ? ` [Default: ${clientId}]` : '';
    const inputClient = await askQuestion(`2. Enter DISCORD_CLIENT_ID${defaultClientMsg}: `);
    clientId = inputClient.trim() || clientId;
  }

  if (interfaceChoice === '2' || interfaceChoice === '3') {
    console.log('\n📱 TELEGRAM BOT CREDENTIALS:');
    const defaultTgBotMsg = telegramToken ? ` [Default: ${telegramToken.slice(0, 10)}...]` : '';
    const inputTgBot = await askQuestion(`1. Enter TELEGRAM_BOT_TOKEN${defaultTgBotMsg}: `);
    telegramToken = inputTgBot.trim() || telegramToken;

    const defaultTgChatMsg = telegramChatId ? ` [Default: ${telegramChatId}]` : '';
    const inputTgChat = await askQuestion(`2. Enter TELEGRAM_CHAT_ID${defaultTgChatMsg}: `);
    telegramChatId = inputTgChat.trim() || telegramChatId;
  }

  console.log('\n🤖 AI REASONING ENGINE CREDENTIALS:');
  let rawExistingKeys = existingEnv.AI_API_KEYS || existingEnv.AI_API_KEY || '';
  let existingKeyList = rawExistingKeys.split(',').map(k => k.trim()).filter(Boolean);

  if (existingKeyList.length > 1) {
    console.log(`ℹ️  Found ${existingKeyList.length} stacked API keys in existing config:`);
    existingKeyList.forEach((k, idx) => {
      console.log(`   - Key #${idx + 1}: ${k.slice(0, 14)}...`);
    });
    const keepKeys = await askQuestion('Keep existing stacked API keys? (Y/n) [Default Y]: ') || 'y';
    if (keepKeys.toLowerCase() !== 'n') {
      allKeys = existingKeyList;
      aiKey = existingKeyList[0];
    } else {
      existingKeyList = [];
    }
  }

  if (existingKeyList.length <= 1) {
    const defaultAiKeyMsg = aiKey ? ` [Default: ${aiKey.slice(0, 12)}...]` : '';
    const inputAiKey = await askQuestion(`1. Enter Primary AI API KEY (OpenRouter / OpenAI / Anthropic)${defaultAiKeyMsg}: `);
    aiKey = inputAiKey.trim() || aiKey;

    const stackChoice = await askQuestion('2. Would you like to add Failover Backup API Keys (Round-Robin Stacking)? (y/N): ');
    let allKeysList = aiKey ? aiKey.split(',').map(k => k.trim()).filter(Boolean) : [];
    if (allKeysList.length === 0 && aiKey) allKeysList.push(aiKey);

    if (stackChoice.toLowerCase() === 'y') {
      const backupCountStr = await askQuestion('   How many backup API keys would you like to add? (1-5) [Default 1]: ') || '1';
      const backupCount = Math.min(Math.max(parseInt(backupCountStr) || 1, 1), 5);
      for (let i = 1; i <= backupCount; i++) {
        const bKey = await askQuestion(`   ➡️ Enter Backup API Key #${i}: `);
        if (bKey.trim()) {
          allKeysList.push(bKey.trim());
        }
      }
    }
    allKeys = allKeysList;
  }
  const combinedKeys = allKeys.join(',');

  console.log('\nSelect AI Model Provider:');
  console.log(' [1] OpenRouter (Default - Access to free & open models)');
  console.log(' [2] OpenCode Go (DeepSeek V4 Pro, GLM 5.2 - opencode.ai/go)');
  console.log(' [3] Z.ai / Zhipu GLM Coding Plan (GLM-5.2, GLM-5-Turbo - z.ai/subscribe)');
  console.log(' [4] Anthropic Claude (Claude 3.5 Sonnet / Opus)');
  console.log(' [5] OpenAI (GPT-4o)');
  console.log(' [6] Custom OpenAI-Compatible Endpoint');
  const providerChoice = await askQuestion('Choice (1/2/3/4/5/6) [Default 1]: ');

  let provider = 'openrouter';
  let baseUrl = 'https://openrouter.ai/api/v1';
  let modelName = 'openrouter/auto';

  if (providerChoice === '2') {
    provider = 'opencode';
    baseUrl = await askQuestion('Enter OpenCode AI_BASE_URL [Default https://opencode.ai/zen/go/v1]: ') || 'https://opencode.ai/zen/go/v1';
    modelName = await askQuestion('Enter OpenCode AI_MODEL_NAME [Default deepseek-v4-pro]: ') || 'deepseek-v4-pro';
  } else if (providerChoice === '3') {
    provider = 'zai';
    baseUrl = await askQuestion('Enter Z.ai AI_BASE_URL [Default https://api.z.ai/api/coding/paas/v4]: ') || 'https://api.z.ai/api/coding/paas/v4';
    modelName = await askQuestion('Enter Z.ai AI_MODEL_NAME [Default glm-4.7]: ') || 'glm-4.7';
  } else if (providerChoice === '4') {
    provider = 'anthropic';
    baseUrl = 'https://api.anthropic.com/v1';
    modelName = 'claude-3-5-sonnet-20241022';
  } else if (providerChoice === '5') {
    provider = 'openai';
    baseUrl = 'https://api.openai.com/v1';
    modelName = 'gpt-4o';
  } else if (providerChoice === '6') {
    provider = 'custom';
    baseUrl = await askQuestion('Enter AI_BASE_URL: ') || 'https://api.9router.com/v1';
    modelName = await askQuestion('Enter AI_MODEL_NAME: ') || 'glm-4';
  }

  console.log('\n📊 PRO MARKET DATA & SECURITY AUDIT APIS (For Real Market Data):');
  const defaultGmgn = gmgnApiKey ? ` [Default: ${gmgnApiKey.slice(0, 8)}...]` : ' [Optional]';
  const inputGmgn = await askQuestion(`1. Enter GMGN_API_KEY (GMGN AI Pro API for Smart Money & Snipers)${defaultGmgn}: `);
  gmgnApiKey = inputGmgn.trim() || gmgnApiKey;

  const defaultOpensea = openseaApiKey ? ` [Default: ${openseaApiKey.slice(0, 8)}...]` : ' [Optional]';
  const inputOpensea = await askQuestion(`2. Enter OPENSEA_API_KEY (OpenSea API v2 for NFT Floor & Rarity)${defaultOpensea}: `);
  openseaApiKey = inputOpensea.trim() || openseaApiKey;

  const defaultTwex = twexApiKey ? ` [Default: ${twexApiKey.slice(0, 8)}...]` : ' [Optional]';
  const inputTwex = await askQuestion(`3. Enter TWEX_API_KEY / TWITTER_BEARER_TOKEN (X/Twitter Sentiment)${defaultTwex}: `);
  twexApiKey = inputTwex.trim() || twexApiKey;

  const defaultGoplus = goplusApiKey ? ` [Default: ${goplusApiKey.slice(0, 8)}...]` : ' [Optional]';
  const inputGoplus = await askQuestion(`4. Enter GOPLUS_API_KEY (EVM Anti-Honeypot Audit Key)${defaultGoplus}: `);
  goplusApiKey = inputGoplus.trim() || goplusApiKey;

  console.log('\n👛 BURNER WALLETS & WEB3 RPC ENDPOINTS:');
  const defaultSolPk = solanaPrivateKey ? ` [Default: ${solanaPrivateKey.slice(0, 8)}...]` : ' [Optional - Base58/JSON]';
  const inputSolPk = await askQuestion(`1. Enter SOLANA_PRIVATE_KEY${defaultSolPk}: `);
  solanaPrivateKey = inputSolPk.trim() || solanaPrivateKey;

  const defaultEvmPk = evmPrivateKey ? ` [Default: ${evmPrivateKey.slice(0, 8)}...]` : ' [Optional - 0x...]';
  const inputEvmPk = await askQuestion(`2. Enter EVM_PRIVATE_KEY${defaultEvmPk}: `);
  evmPrivateKey = inputEvmPk.trim() || evmPrivateKey;

  const defaultSolRpc = solanaRpcUrl ? ` [Default: ${solanaRpcUrl}]` : '';
  const inputSolRpc = await askQuestion(`3. Enter SOLANA_RPC_URL (Helius / QuickNode / Alchemy)${defaultSolRpc}: `);
  solanaRpcUrl = inputSolRpc.trim() || solanaRpcUrl;

  const defaultEvmRpc = evmBaseRpcUrl ? ` [Default: ${evmBaseRpcUrl}]` : '';
  const inputEvmRpc = await askQuestion(`4. Enter EVM_BASE_RPC_URL (Base L2 RPC URL)${defaultEvmRpc}: `);
  evmBaseRpcUrl = inputEvmRpc.trim() || evmBaseRpcUrl;

  console.log('\n⚙️ SIMULATION & DEMO BALANCE OPTIONS:');
  const dryRunChoice = await askQuestion('1. Run agent in Simulation Mode (DRY_RUN)? (Y/n) [Default Y]: ') || 'y';
  const isDryRun = dryRunChoice.toLowerCase() !== 'n' ? 'true' : 'false';

  const simSolBalance = await askQuestion('2. Enter Starting Simulation Balance for Solana (SOL) [Default 10.0]: ') || '10.0';
  const simEthBalance = await askQuestion('3. Enter Starting Simulation Balance for EVM (ETH) [Default 1.0]: ') || '1.0';

  let envContent = `NODE_ENV=production
DRY_RUN=${isDryRun}
LOG_LEVEL=info

# Simulated Starting Balance (Used in DRY_RUN / Demo mode)
SIMULATION_BALANCE_SOL=${simSolBalance.trim()}
SIMULATION_BALANCE_ETH=${simEthBalance.trim()}

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
AI_API_KEY=${allKeys[0] || ''}
AI_MODEL_NAME=${modelName}

# Pro Market Data & Security Audit APIs
GMGN_API_KEY=${gmgnApiKey.trim()}
OPENSEA_API_KEY=${openseaApiKey.trim()}
TWEX_API_KEY=${twexApiKey.trim()}
TWITTER_BEARER_TOKEN=${twexApiKey.trim()}
GOPLUS_API_KEY=${goplusApiKey.trim()}

# Web3 Burner Wallets & RPC Endpoints
SOLANA_PRIVATE_KEY=${solanaPrivateKey.trim()}
EVM_PRIVATE_KEY=${evmPrivateKey.trim()}
SOLANA_RPC_URL=${solanaRpcUrl.trim()}
EVM_BASE_RPC_URL=${evmBaseRpcUrl.trim()}

# Security Audit Endpoints
RUGCHECK_API_URL=https://api.rugcheck.xyz/v1
`;

  fs.writeFileSync(envPath, envContent, 'utf8');

  console.log('\n======================================================');
  console.log('✅ Configuration file (.env) successfully created!');
  console.log(`💡 Mode: ${isDryRun === 'true' ? 'SIMULATION (DRY_RUN ACTIVE)' : 'LIVE TRADING (CAUTION)'}`);
  console.log(`🪙 Demo Balance: ${simSolBalance} SOL | ${simEthBalance} ETH`);
  console.log('💡 All API keys and credentials are now saved safely in .env');
  console.log('======================================================\n');

  rl.close();
}

runWizard().catch(console.error);
