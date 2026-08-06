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

  console.log('📌 PILIHAN MODE ANTARMUKA ATHENA:');
  console.log(' [1] Discord Command Center (Default)');
  console.log(' [2] Telegram Bot & Forum Topics Bridge');
  console.log(' [3] Dual Mode (Discord + Telegram Bridge)');
  console.log(' [4] Standalone Terminal TUI (Tanpa Bot, Langsung Terminal VPS)');
  const interfaceChoice = await askQuestion('Pilihan (1/2/3/4) [Default 1]: ') || '1';

  let botToken = existingEnv.DISCORD_BOT_TOKEN || '';
  let clientId = existingEnv.DISCORD_CLIENT_ID || '';
  let telegramToken = existingEnv.TELEGRAM_BOT_TOKEN || '';
  let telegramChatId = existingEnv.TELEGRAM_CHAT_ID || '';
  let aiKey = existingEnv.AI_API_KEY || '';

  if (interfaceChoice === '1' || interfaceChoice === '3') {
    console.log('\n💬 KREDENSIAL DISCORD BOT:');
    const defaultBotMsg = botToken ? ` [Default: ${botToken.slice(0, 10)}...]` : '';
    const inputBot = await askQuestion(`1. Masukkan DISCORD_BOT_TOKEN${defaultBotMsg}: `);
    botToken = inputBot.trim() || botToken;

    const defaultClientMsg = clientId ? ` [Default: ${clientId}]` : '';
    const inputClient = await askQuestion(`2. Masukkan DISCORD_CLIENT_ID${defaultClientMsg}: `);
    clientId = inputClient.trim() || clientId;
  }

  if (interfaceChoice === '2' || interfaceChoice === '3') {
    console.log('\n📱 KREDENSIAL TELEGRAM BOT:');
    const defaultTgBotMsg = telegramToken ? ` [Default: ${telegramToken.slice(0, 10)}...]` : '';
    const inputTgBot = await askQuestion(`1. Masukkan TELEGRAM_BOT_TOKEN${defaultTgBotMsg}: `);
    telegramToken = inputTgBot.trim() || telegramToken;

    const defaultTgChatMsg = telegramChatId ? ` [Default: ${telegramChatId}]` : '';
    const inputTgChat = await askQuestion(`2. Masukkan TELEGRAM_CHAT_ID${defaultTgChatMsg}: `);
    telegramChatId = inputTgChat.trim() || telegramChatId;
  }

  console.log('\n🤖 KREDENSIAL AI ENGINE:');
  const defaultAiKeyMsg = aiKey ? ` [Default: ${aiKey.slice(0, 12)}...]` : '';
  const inputAiKey = await askQuestion(`Masukkan AI API KEY (OpenRouter / Anthropic / OpenAI / Custom)${defaultAiKeyMsg}: `);
  aiKey = inputAiKey.trim() || aiKey;
  
  console.log('\nPilih AI Provider:');
  console.log(' [1] OpenRouter (Default - Banyak model gratisan)');
  console.log(' [2] Anthropic Claude (Claude 3.5 Sonnet / Opus)');
  console.log(' [3] OpenAI (GPT-4o)');
  console.log(' [4] Custom (GLM 5.2 / 9router / Ollama Local)');
  const providerChoice = await askQuestion('Pilihan (1/2/3/4) [Default 1]: ');

  let provider = 'openrouter';
  let baseUrl = 'https://openrouter.ai/api/v1';
  let modelName = 'meta-llama/llama-3.3-70b-instruct:free';

  if (providerChoice === '2') {
    provider = 'anthropic';
    baseUrl = 'https://api.anthropic.com/v1';
    modelName = 'claude-3-5-sonnet-20241022';
  } else if (providerChoice === '3') {
    provider = 'openai';
    baseUrl = 'https://api.openai.com/v1';
    modelName = 'gpt-4o';
  } else if (providerChoice === '4') {
    provider = 'custom';
    baseUrl = await askQuestion('Masukkan AI_BASE_URL (misal https://api.9router.com/v1): ') || 'https://api.9router.com/v1';
    modelName = await askQuestion('Masukkan AI_MODEL_NAME (misal glm-4): ') || 'glm-4';
  }

  console.log('\n⚙️  PILIHAN SIMULASI & SALDO DEMO:');
  const dryRunChoice = await askQuestion('4. Jalankan bot dalam Mode Simulasi (DRY_RUN)? (Y/n) [Default Y]: ') || 'y';
  const isDryRun = dryRunChoice.toLowerCase() !== 'n' ? 'true' : 'false';

  const simSolBalance = await askQuestion('5. Masukkan Saldo Simulasi Solana (SOL) [Default 10.0]: ') || '10.0';
  const simEthBalance = await askQuestion('6. Masukkan Saldo Simulasi EVM (ETH) [Default 1.0]: ') || '1.0';

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

# AI Provider Configuration
AI_PROVIDER=${provider}
AI_BASE_URL=${baseUrl}
AI_API_KEY=${aiKey.trim()}
AI_MODEL_NAME=${modelName}

# Security Audit Endpoints
RUGCHECK_API_URL=https://api.rugcheck.xyz/v1
GOPLUS_API_KEY=
`;

  fs.writeFileSync(envPath, envContent, 'utf8');

  console.log('\n======================================================');
  console.log('✅ File .env berhasil dibuat secara otomatis!');
  console.log(`💡 Mode: ${isDryRun === 'true' ? 'SIMULASI (DRY_RUN ACTIVE)' : 'LIVE TRADING (CAUTION)'}`);
  console.log(`🪙 Saldo Demo: ${simSolBalance} SOL | ${simEthBalance} ETH`);
  console.log('💡 Discord channels akan dibuatkan OTOMATIS saat bot dinyalakan.');
  console.log('======================================================\n');

  rl.close();
}

runWizard().catch(console.error);
