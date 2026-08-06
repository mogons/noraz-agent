import fs from 'fs';
import path from 'path';
import readline from 'readline';

const envPath = path.join(process.cwd(), '.env');
const envExamplePath = path.join(process.cwd(), '.env.example');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function runWizard() {
  console.log('\n======================================================');
  console.log('🏛️ ATHENA AGENT - INTERACTIVE VPS SETUP WIZARD');
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
    const inputAiKey = await askQuestion(`1. Enter Primary AI API KEY${defaultAiKeyMsg}: `);
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
  console.log(' [2] OpenCode Go (DeepSeek V4 Pro, GLM 5.2, GPT 5.6 Luna - opencode.ai/go)');
  console.log(' [3] Z.ai / Zhipu GLM Coding Plan (GLM-5.2, GLM-5-Turbo - z.ai/subscribe)');
  console.log(' [4] Anthropic Claude (Claude 3.5 Sonnet / Opus)');
  console.log(' [5] OpenAI (GPT-4o)');
  console.log(' [6] Custom (9router, Local Ollama, Custom OpenAI-compatible endpoint)');
  const providerChoice = await askQuestion('Choice (1/2/3/4/5/6) [Default 1]: ');

  let provider = 'openrouter';
  let baseUrl = 'https://openrouter.ai/api/v1';
  let modelName = 'openrouter/auto';

  if (providerChoice === '2') {
    provider = 'opencode';
    baseUrl = await askQuestion('Enter OpenCode AI_BASE_URL [Default https://api.opencode.ai/v1]: ') || 'https://api.opencode.ai/v1';
    modelName = await askQuestion('Enter OpenCode AI_MODEL_NAME (e.g. deepseek-v4-pro, glm-5.2) [Default deepseek-v4-pro]: ') || 'deepseek-v4-pro';
  } else if (providerChoice === '3') {
    provider = 'zai';
    baseUrl = await askQuestion('Enter Z.ai AI_BASE_URL [Default https://api.z.ai/v1]: ') || 'https://api.z.ai/v1';
    modelName = await askQuestion('Enter Z.ai AI_MODEL_NAME (e.g. glm-5.2, glm-5-turbo) [Default glm-5.2]: ') || 'glm-5.2';
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
    baseUrl = await askQuestion('Enter AI_BASE_URL (e.g. https://api.9router.com/v1): ') || 'https://api.9router.com/v1';
    modelName = await askQuestion('Enter AI_MODEL_NAME (e.g. glm-4): ') || 'glm-4';
  }

  console.log('\n⚙️  SIMULATION & DEMO BALANCE OPTIONS:');
  const dryRunChoice = await askQuestion('4. Run agent in Simulation Mode (DRY_RUN)? (Y/n) [Default Y]: ') || 'y';
  const isDryRun = dryRunChoice.toLowerCase() !== 'n' ? 'true' : 'false';

  const simSolBalance = await askQuestion('5. Enter Starting Simulation Balance for Solana (SOL) [Default 10.0]: ') || '10.0';
  const simEthBalance = await askQuestion('6. Enter Starting Simulation Balance for EVM (ETH) [Default 1.0]: ') || '1.0';

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

# Security Audit Endpoints
RUGCHECK_API_URL=https://api.rugcheck.xyz/v1
GOPLUS_API_KEY=
`;

  fs.writeFileSync(envPath, envContent, 'utf8');

  console.log('\n======================================================');
  console.log('✅ Configuration file (.env) successfully created!');
  console.log(`💡 Mode: ${isDryRun === 'true' ? 'SIMULATION (DRY_RUN ACTIVE)' : 'LIVE TRADING (CAUTION)'}`);
  console.log(`🪙 Demo Balance: ${simSolBalance} SOL | ${simEthBalance} ETH`);
  console.log('💡 Discord channels and slash commands will be provisioned AUTOMATICALLY upon launch.');
  console.log('======================================================\n');

  rl.close();
}

runWizard().catch(console.error);
