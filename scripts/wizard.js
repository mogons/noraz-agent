import fs from 'fs';
import path from 'path';
import readline from 'readline';

const envPath = path.join(process.cwd(), '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[38;2;0;230;118m',    // #00E676 Jade Spirit
  lime: '\x1b[38;2;204;255;0m',     // #CCFF00 Robinhood Green
  pink: '\x1b[38;2;255;183;178m',   // #FFB7B2 Pastel Pink
  lavender: '\x1b[38;2;214;199;255m',// #D6C7FF Lavender Purple
  cyan: '\x1b[38;2;128;222;234m',   // #80DEEA Retro Cyan
  yellow: '\x1b[38;2;255;245;157m', // #FFF59D Pastel Yellow
  gold: '\x1b[38;2;255;215;0m',     // #FFD700 Golden Fortune
  red: '\x1b[38;2;229;57;53m',      // #E53935 Maneki-Neko Red
  magenta: '\x1b[38;2;123;31;162m', // #7B1FA2 Royal Violet
};

const PROVIDER_PRESETS = {
  anthropic: {
    label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5',
    models: [
      ['claude-sonnet-5', 'Sonnet 5 — best balance ($2/$10 per MTok, intro)'],
      ['claude-opus-5', 'Opus 5 — maximum intelligence ($5/$25)'],
      ['claude-fable-5', 'Fable 5 — newest flagship'],
      ['claude-haiku-4-5', 'Haiku 4.5 — fast & cheap ($1/$5)'],
    ],
  },
  openai: {
    label: 'OpenAI GPT', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.2-chat',
    models: [
      ['gpt-5.2-chat', 'GPT-5.2 Chat — current API chat model (tools)'],
      ['gpt-4.1', 'GPT-4.1 — reliable workhorse ($2/$8)'],
      ['gpt-4.1-mini', 'GPT-4.1 mini — cheap ($0.4/$1.6)'],
      ['gpt-4o-mini', 'GPT-4o mini — cheapest legacy'],
    ],
  },
  zai: {
    label: 'Z.ai (Zhipu GLM)', baseUrl: 'https://api.z.ai/api/coding/paas/v4', model: 'glm-5.2',
    sub: [
      { key: 'codingplan', label: 'GLM Coding Plan (subscription)', baseUrl: 'https://api.z.ai/api/coding/paas/v4', models: [
        ['glm-5.2', 'GLM-5.2 — flagship (744B, 1M ctx)'],
        ['glm-5-turbo', 'GLM-5-Turbo — fast flagship'],
        ['glm-4.7', 'GLM-4.7 — stable 200K ctx'],
        ['glm-4.5-air', 'GLM-4.5-Air — light'],
      ] },
      { key: 'zai', label: 'Z.ai Pay-as-you-go (top-up)', baseUrl: 'https://api.z.ai/api/paas/v4', models: [
        ['glm-5.2', 'GLM-5.2 — flagship (744B, 1M ctx)'],
        ['glm-4.7', 'GLM-4.7 — stable 200K ctx'],
        ['glm-4.7-flash', 'GLM-4.7-Flash — FREE tier'],
      ] },
    ],
  },
  openrouter: {
    label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'inclusionai/ling-2.6-flash:free',
    models: [
      ['inclusionai/ling-2.6-flash:free', 'Ling 2.6 Flash — FREE, 262K ctx (default)'],
      ['openai/gpt-oss-120b:free', 'GPT-OSS-120B — FREE, open reasoning'],
      ['qwen/qwen3-30b-a3b-instruct-2507:free', 'Qwen3 30B — FREE, 262K ctx'],
      ['nvidia/nemotron-3-ultra-550b-a55b:free', 'Nemotron 3 Ultra — FREE, 1M ctx'],
      ['google/gemma-4-26b-a4b:free', 'Gemma 4 — FREE, multimodal'],
      ['deepseek/deepseek-r1:free', 'DeepSeek R1 — FREE, reasoning'],
      ['openrouter/auto', 'openrouter/auto — PAID (needs >= $10 credits)'],
    ],
    freeNote: 'Free tier is rate-limited (20 req/min, ~50-1000 req/day) and the roster rotates. Consider a one-time $10 credit for production use.',
  },
  minimax: {
    label: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', model: 'MiniMax-M3',
    sub: [
      { key: 'minimax', label: 'MiniMax Token Plan (subscription — coding plan)', baseUrl: 'https://api.minimax.chat/v1', keyHint: 'Subscription Key (Token Plan)', models: [
        ['MiniMax-M3', 'MiniMax-M3 — flagship (1M ctx, $0.30/$1.20)'],
        ['MiniMax-M2.7', 'MiniMax-M2.7 — strong coding'],
        ['MiniMax-M2.5', 'MiniMax-M2.5 — legacy, cheap'],
      ] },
      { key: 'minimax-payg', label: 'MiniMax API (pay-as-you-go)', baseUrl: 'https://api.minimax.chat/v1', keyHint: 'API Key (pay-as-you-go)', models: [
        ['MiniMax-M3', 'MiniMax-M3 — flagship (1M ctx, $0.30/$1.20)'],
        ['MiniMax-M2.7', 'MiniMax-M2.7 — strong coding'],
        ['MiniMax-M2.7-highspeed', 'MiniMax-M2.7 highspeed — 100 tps'],
        ['MiniMax-M2.5', 'MiniMax-M2.5 — legacy, cheap'],
      ] },
    ],
  },
  deepseek: {
    label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
    models: [
      ['deepseek-v4-flash', 'V4 Flash — fast & cheap (1M ctx)'],
      ['deepseek-v4-pro', 'V4 Pro — premium reasoning'],
    ],
  },
  gemini: {
    label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-pro',
    models: [
      ['gemini-2.5-pro', 'Gemini 2.5 Pro — stable, 1M ctx'],
      ['gemini-3.1-flash-lite', '3.1 Flash-Lite — stable, cheapest ($0.25/$1.50)'],
      ['gemini-2.5-flash', 'Gemini 2.5 Flash — stable, fast'],
      ['gemini-3-flash-preview', '3 Flash — preview'],
      ['gemini-3.1-pro-preview', '3.1 Pro — preview'],
    ],
  },
};

const customNote = `\n${C.dim}Using another LLM provider (Groq, Mistral, xAI, local Ollama, etc.)? Choose Custom OpenAI-Compatible Endpoint and enter the base URL + model ID yourself.${C.reset}`;

async function pickFromList(title, items, defaultIdx = 0, suffixNote = '') {
  console.log(`\n ${C.cyan}${title}${C.reset}`);
  items.forEach(([value, desc], i) => {
    const dflt = i === defaultIdx ? `${C.green} [ENTER = default]${C.reset}` : '';
    console.log(`   [${i + 1}] ${desc}${dflt}`);
  });
  console.log(`   [${items.length + 1}] ${C.yellow}Type a custom value${C.reset}`);
  if (suffixNote) console.log(`${C.dim}   ${suffixNote}${C.reset}`);
  const choice = await askQuestion(`   Choice [Default ${defaultIdx + 1}]: `);
  const idx = parseInt(choice, 10);
  if (choice.trim() === '') return items[defaultIdx][0];
  if (idx >= 1 && idx <= items.length) return items[idx - 1][0];
  if (idx === items.length + 1) {
    const custom = await askQuestion(`   Custom value: `);
    return custom.trim() || items[defaultIdx][0];
  }
  return items[defaultIdx][0];
}

async function askModelPicker({ models, label, defaultModelId, providerKey, freeNote = '' }, existingModelName, existingProviderKey) {
  if (!Array.isArray(models) || models.length === 0) return existingModelName || defaultModelId || '';
  const target = (existingProviderKey === providerKey && existingModelName) ? existingModelName : defaultModelId;
  const defaultIdx = Math.max(models.findIndex(([m]) => m === target), 0);
  return pickFromList(`Select ${label} model:`, models, defaultIdx, freeNote);
}

async function askAiProviderConfig(existingProvider, existingBaseUrl, existingModelName) {
  const menuKeys = ['anthropic', 'openai', 'zai', 'openrouter', 'minimax', 'deepseek', 'gemini', 'custom'];
  console.log(`\n ${C.cyan}Select AI provider:${C.reset}`);
  if (existingProvider) console.log(`   [0] Keep existing config (${existingProvider} | ${existingModelName || 'default'})`);
  menuKeys.forEach((k, i) => {
    const p = PROVIDER_PRESETS[k];
    const label = p ? (p.sub ? p.label : `${p.label} — ${p.model}`) : 'Custom OpenAI-Compatible Endpoint (no defaults)';
    console.log(`   [${i + 1}] ${label}`);
  });
  console.log(customNote);
  const defaultChoice = existingProvider ? '0' : '1';
  const choice = (await askQuestion(`   Choice [Default ${defaultChoice}]: `)) || defaultChoice;

  let providerKey, baseUrl, modelName, keyHint;
  if (existingProvider && choice === '0') {
    return { provider: existingProvider, baseUrl: existingBaseUrl || 'https://openrouter.ai/api/v1', modelName: existingModelName || 'openrouter/auto', keyHint: '' };
  }
  const chosen = menuKeys[parseInt(choice, 10) - 1] || 'custom';
  if (chosen === 'custom') {
    let baseUrl = '';
    for (let attempt = 0; attempt < 2 && !baseUrl; attempt++) {
      const input = (await askQuestion(`   Base URL (required): `)).trim();
      if (input) { baseUrl = input; continue; }
      if (attempt === 0) console.log(`   ${C.yellow}Base URL is required — please enter it.${C.reset}`);
    }
    let modelName = '';
    for (let attempt = 0; attempt < 2 && !modelName; attempt++) {
      const input = (await askQuestion(`   Model ID (required): `)).trim();
      if (input) { modelName = input; continue; }
      if (attempt === 0) console.log(`   ${C.yellow}Model ID is required — please enter it.${C.reset}`);
    }
    return { provider: 'custom', baseUrl, modelName, keyHint: '' };
  }
  let preset = PROVIDER_PRESETS[chosen];
  let presetModels, presetLabel, presetDefaultModel;
  if (preset.sub) {
    console.log(`\n ${C.cyan}${preset.label} — select billing:${C.reset}`);
    preset.sub.forEach((s, i) => console.log(`   [${i + 1}] ${s.label}`));
    const subChoice = (await askQuestion(`   Choice [Default 1]: `)) || '1';
    const sub = preset.sub[parseInt(subChoice, 10) - 1] || preset.sub[0];
    providerKey = sub.key; baseUrl = sub.baseUrl; keyHint = sub.keyHint || '';
    presetModels = sub.models; presetLabel = sub.label; presetDefaultModel = sub.models[0][0];
  } else {
    providerKey = chosen; baseUrl = preset.baseUrl; keyHint = '';
    presetModels = preset.models; presetLabel = preset.label; presetDefaultModel = preset.model;
  }
  const defaultUrl = (existingBaseUrl && existingBaseUrl.includes(new URL(baseUrl).hostname)) ? existingBaseUrl : baseUrl;
  const urlIn = await askQuestion(`   API endpoint [ENTER = default ${defaultUrl}]: `);
  baseUrl = urlIn.trim() || defaultUrl;
  modelName = await askModelPicker(
    { models: presetModels, label: presetLabel, defaultModelId: presetDefaultModel, providerKey, freeNote: preset.freeNote || '' },
    existingModelName, existingProvider,
  );
  return { provider: providerKey, baseUrl, modelName, keyHint };
}

async function askBackupKeys(label, primaryKey) {
  const want = (await askQuestion(`   Add backup API key(s) for ${label}? (y/N): `)) || 'n';
  if (want.toLowerCase() !== 'y') return [];
  const count = Math.min(Math.max(parseInt((await askQuestion('   How many? (1-5) [Default 1]: ')) || '1', 10) || 1, 1), 5);
  const backups = [];
  for (let i = 1; i <= count; i++) {
    const v = (await askQuestion(`   Backup key #${i}: `)).trim();
    if (v) backups.push(v);
  }
  return backups;
}

async function askKeyWithBackup(label, prompt, currentValue, mandatory = false) {
  const suffix = currentValue ? ` [Default: ${currentValue.slice(0, 10)}...]` : (mandatory ? ` ${C.red}[REQUIRED]${C.reset}` : ` ${C.dim}[OPTIONAL — ENTER to skip]${C.reset}`);
  let value = currentValue || '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const input = (await askQuestion(`  ${prompt}${suffix}: `)).trim();
    if (input) { value = input; break; }
    if (value) break;
    if (!mandatory) break;
    if (attempt === 0) console.log(`   ${C.yellow}Please enter a value — this key is required.${C.reset}`);
  }
  const backups = value ? await askBackupKeys(label, value) : [];
  return { value, backups };
}

// ── Screening strategy configuration (STEP 5.5) ─────────────────────────
const STRATEGY_DOMAINS = [
  {
    key: 'meme-robinhood',
    label: 'Meme tokens (Robinhood Chain DEX)',
    params: [
      { name: 'minVolume24hUsd', label: 'Minimum 24h Volume (USD)', def: 25000, unit: 'USD', example: '100000 = $100k/day' },
      { name: 'minLiquidityUsd', label: 'Minimum Liquidity (USD)', def: 5000, unit: 'USD', example: '50000 = $50k pool' },
      { name: 'minTotalFeeUsd', label: 'Minimum Total Fees (USD)', def: 250, unit: 'USD', example: '1000 = $1k fees/day' },
      { name: 'minVisitingCount', label: 'Minimum GMGN Visiting Count', def: 100, unit: 'count', example: '300 = well-watched token' },
    ],
  },
  {
    key: 'lp-robinhood',
    label: 'Concentrated Liquidity pools (Uniswap v3 / Krystal)',
    params: [
      { name: 'minTvlUsd', label: 'Minimum Pool TVL (USD)', def: 10000, unit: 'USD', example: '50000 = $50k TVL' },
      { name: 'minVol24hUsd', label: 'Minimum 24h Volume (USD)', def: 100000, unit: 'USD', example: '500000 = $500k/day' },
      { name: 'minFeeTvlRatio24h', label: 'Minimum 24h Fee/TVL ratio (%)', def: 2, unit: '%', example: '4.0 = aggressive yield' },
      { name: 'minMarketCapUsd', label: 'Minimum Meme-Token Market Cap (USD)', def: 100000, unit: 'USD', example: '500000 = $500k' },
    ],
  },
  {
    key: 'nft',
    label: 'NFT collections (OpenSea)',
    params: [
      { name: 'minSurgePct', label: 'Minimum Floor Surge 1h (%)', def: 10, unit: '%', example: '25 = +25% in 1h' },
      { name: 'minVolSpike', label: 'Minimum Volume Spike (x baseline)', def: 1.5, unit: 'x', example: '3.0 = 3x usual volume' },
      { name: 'minVelocity1h', label: 'Minimum Sales Velocity (/hour)', def: 3, unit: '/h', example: '10 = 10 sales/h' },
    ],
  },
  {
    key: 'whale-eth',
    label: 'ETH Whales & Smart Money (Hyperliquid)',
    params: [
      { name: 'minPerpsUsd', label: 'Minimum Perps Position (USD)', def: 500000, unit: 'USD', example: '1000000 = $1M perps' },
      { name: 'minSpotUsd', label: 'Minimum Spot Fill (USD)', def: 50000, unit: 'USD', example: '100000 = $100k spot' },
      { name: 'minWhaleCount', label: 'Minimum Whale Traders Count', def: 1, unit: 'count', example: '2 = at least 2 whales' },
    ],
  },
];

async function askNumeric(promptText, def, unit, example) {
  let value = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = (await askQuestion(`   ${promptText} [Default: ${def}] [Example: ${example}]: `)).trim();
    if (raw === '') return def;
    const parsed = Number(raw);
    if (!isNaN(parsed) && parsed >= 0 && Number.isFinite(parsed)) { value = parsed; break; }
    if (attempt === 0) console.log(`   ${C.yellow}Please enter a valid number (${unit}). Example: ${example}${C.reset}`);
  }
  return value === null ? def : value;
}

// Per-domain evaluate bodies for the numeric editor. Each reads the REAL runtime
// ctx contract (verified against the agents):
//   meme: ctx.gmgn snake_case (volume_24h, liquidity, total_fee, native_price_usd, visiting_count)
//         + flat ctx.volume24hUsd / ctx.liquidityUsd fallbacks
//   nft:  ctx.nft block (floor_surge_1h_pct, volume_spike_1h_ratio, sales_velocity_1h)
//         + flat ctx.floorSurge1hPct / ctx.volumeSpike1hRatio / ctx.salesVelocity1h fallbacks
//   lp:   ctx.pool (tvlUsd, volume24hUsd, feesToTvlRatio24h, marketCapUsd)
const STRATEGY_EVALUATE_BODIES = {
  'meme-robinhood': `  evaluate(ctx) {
    const p = this.params;
    const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const g = ctx.gmgn || {};
    const volume24h = num(g.volume_24h ?? ctx.volume24hUsd);
    const liquidity = num(g.liquidity ?? ctx.liquidityUsd);
    const totalFeeNative = num(g.total_fee);
    const nativePriceUsd = num(g.native_price_usd);
    const totalFeeUsd = totalFeeNative !== null && nativePriceUsd !== null ? totalFeeNative * nativePriceUsd : null;
    const visitingCount = num(g.visiting_count);
    if (volume24h === null || volume24h < p.minVolume24hUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: '24h volume gate not met.' };
    if (liquidity === null || liquidity < p.minLiquidityUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Liquidity gate not met.' };
    if (p.minTotalFeeUsd > 0 && (totalFeeUsd === null || totalFeeUsd < p.minTotalFeeUsd)) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Total fee gate not met.' };
    if (visitingCount !== null && visitingCount < p.minVisitingCount) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Visiting count gate not met.' };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Security audit failed.' };
    return { confidence: 80, recommendedAction: 'BUY', reason: 'All custom numeric gates passed.' };
  },`,
  'lp-robinhood': `  evaluate(ctx) {
    const p = this.params;
    const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const pool = ctx.pool || {};
    const tvl = num(pool.tvlUsd ?? ctx.liquidityUsd);
    const vol24h = num(pool.volume24hUsd ?? ctx.volume24hUsd);
    const feeTvl = num(pool.feesToTvlRatio24h);
    const mc = num(pool.marketCapUsd);
    if (tvl === null || tvl < p.minTvlUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: 'TVL gate not met.' };
    if (vol24h === null || vol24h < p.minVol24hUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: '24h volume gate not met.' };
    if (feeTvl === null || feeTvl < p.minFeeTvlRatio24h) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Fee/TVL gate not met.' };
    if (mc === null || mc < p.minMarketCapUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Market cap gate not met.' };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Security audit failed.' };
    return { confidence: 80, recommendedAction: 'BUY', reason: 'All custom numeric gates passed.' };
  },`,
  nft: `  evaluate(ctx) {
    const p = this.params;
    const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const n = ctx.nft || {};
    const surge = num(n.floor_surge_1h_pct ?? ctx.floorSurge1hPct);
    const volSpike = num(n.volume_spike_1h_ratio ?? ctx.volumeSpike1hRatio);
    const velocity = num(n.sales_velocity_1h ?? ctx.salesVelocity1h);
    if (surge === null || surge < p.minSurgePct) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Floor surge gate not met.' };
    if (volSpike === null || volSpike < p.minVolSpike) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Volume spike gate not met.' };
    if (velocity === null || velocity < p.minVelocity1h) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Sales velocity gate not met.' };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Security audit failed.' };
    return { confidence: 80, recommendedAction: 'BUY', reason: 'All custom numeric gates passed.' };
  },`,
  'whale-eth': `  evaluate(ctx) {
    const p = this.params;
    const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const w = ctx.whale || ctx.whaleReport || {};
    const totalLong = num(w.totalLongUsd ?? w.total_long_usd);
    const totalShort = num(w.totalShortUsd ?? w.total_short_usd);
    const longCount = num(w.longCount ?? w.long_count ?? 0);
    const shortCount = num(w.shortCount ?? w.short_count ?? 0);
    const totalVolume = (totalLong || 0) + (totalShort || 0);
    const totalWhales = (longCount || 0) + (shortCount || 0);
    if (totalWhales < p.minWhaleCount && totalVolume < p.minPerpsUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Whale count and volume below threshold.' };
    const netUsd = (totalLong || 0) - (totalShort || 0);
    return { confidence: 85, recommendedAction: netUsd >= 0 ? 'BUY' : 'SELL', reason: 'ETH Whale positioning threshold met.' };
  },`,
};

function buildCustomStrategyModule(domainKey, params, label) {
  const lines = [];
  for (const p of params) {
    // Fee/TVL is collected as a PERCENT (editor default 2 = 2%); strategies
    // compare against a 0-1 ratio, so the entered percent is divided by 100.
    const isFeeTvlPct = domainKey === 'lp-robinhood' && p.name === 'minFeeTvlRatio24h';
    lines.push(`    ${p.name}: ${isFeeTvlPct ? `${p.value} / 100` : p.value},`);
  }
  const evaluateBody = STRATEGY_EVALUATE_BODIES[domainKey] || STRATEGY_EVALUATE_BODIES['meme-robinhood'];
  return `export default {
  id: '${domainKey}-custom',
  name: '${label} (Custom)',
  version: '1.0.0',
  description: 'Custom numeric strategy generated from the onboarding wizard (real GMGN/pool/nft ctx fields, fail-closed).',
  params: {
    passThreshold: 80,
${lines.join('\n')}
  },
${evaluateBody}
};
`;
}

function writeActiveStrategyMap(map) {
  const dir = path.join(process.cwd(), 'strategies');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.active.json'), JSON.stringify(map, null, 2), 'utf-8');
}

async function askStrategyConfig() {
  console.log(`\n ${C.cyan}${C.bold}🧠 STEP 5.5: SCREENING STRATEGY${C.reset}`);
  console.log('   How strict should OpenCat be when selecting signals?');
  console.log('   [1] Loosened Default (2x) — more call signals, still >= 80% quality   [Default]');
  console.log('   [2] Standard — strict thresholds (previous defaults)');
  console.log('   [3] Custom Prompt — describe your ideal screening strategy in plain English;');
  console.log('       OpenCat writes the code after deploy (auto on first boot, re-runnable anytime via chat)');
  console.log('   [4] Advanced — edit filter numbers per agent directly');
  const choice = (await askQuestion('   Choice [Default 1]: ')) || '1';

  const activeMap = {};
  const domainDefaults = {
    'meme-robinhood': 'meme-robinhood-default',
    'lp-robinhood': 'lp-robinhood-default',
    nft: 'nft-default',
    'whale-eth': 'whale-eth-default',
  };
  const domainStandard = {
    'meme-robinhood': 'meme-robinhood-standard',
    'lp-robinhood': 'lp-robinhood-standard',
    nft: 'nft-standard',
    'whale-eth': 'whale-eth-standard',
  };

  if (choice === '2') {
    for (const d of STRATEGY_DOMAINS) activeMap[d.key] = domainStandard[d.key];
    console.log(`   ${C.green}✓${C.reset} Standard presets activated (strict thresholds).`);
    return { preset: 'standard', activeMap };
  }

  if (choice === '3') {
    console.log(`\n   ${C.yellow}Write your strategy prompt (multi-line; finish with an empty line):${C.reset}`);
    console.log(`   ${C.dim}Hint: mention filters like volume, liquidity, fees, market cap, TVL,`);
    console.log(`   surge %, velocity, security rules, and how aggressive you want to be.${C.reset}`);
    const lines = [];
    let line = '';
    do {
      line = await askQuestion('   > ');
      if (line.trim()) lines.push(line.trim());
    } while (line.trim());
    const prompt = lines.join('\n');
    if (prompt) {
      const dir = path.join(process.cwd(), 'strategies');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'custom-strategy-prompt.txt'), prompt, 'utf-8');
      console.log(`   ${C.green}✓${C.reset} Prompt saved to strategies/custom-strategy-prompt.txt — Opencat will compile it after deploy.`);
    } else {
      console.log(`   ${C.yellow}Empty prompt — using loosened defaults.${C.reset}`);
      for (const d of STRATEGY_DOMAINS) activeMap[d.key] = domainDefaults[d.key];
      return { preset: 'loosened', activeMap };
    }
    for (const d of STRATEGY_DOMAINS) activeMap[d.key] = `${d.key}-custom`;
    return { preset: 'custom', activeMap };
  }

  if (choice === '4') {
    const edits = [];
    for (const domain of STRATEGY_DOMAINS) {
      console.log(`\n   ${C.cyan}${domain.label}${C.reset} — press ENTER to keep each default:`);
      const values = {};
      for (const p of domain.params) {
        const val = await askNumeric(`${p.label} (${p.unit})`, p.def, p.unit, p.example);
        values[p.name] = val;
      }
      const module = buildCustomStrategyModule(domain.key, domain.params.map((p) => ({ name: p.name, value: values[p.name], label: p.label })), domain.label);
      const file = path.join(process.cwd(), 'strategies', `${domain.key}-custom.mjs`);
      if (!fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, module, 'utf-8');
      activeMap[domain.key] = `${domain.key}-custom`;
      edits.push(domain.key);
    }
    console.log(`\n   ${C.green}✓${C.reset} Custom numeric strategies written for: ${edits.join(', ')}`);
    return { preset: 'custom', activeMap };
  }

  // Default: [1] loosened
  for (const d of STRATEGY_DOMAINS) activeMap[d.key] = domainDefaults[d.key];
  console.log(`   ${C.green}✓${C.reset} Loosened defaults (2x) activated — more signals, >= 80% quality floor.`);
  return { preset: 'loosened', activeMap };
}

function drawProgressHeader(step, total, done) {
  const cells = [];
  for (let i = 1; i <= total; i++) {
    if (i < step) cells.push(`${C.green}${i}✓${C.reset}`);
    else if (i === step) cells.push(`${C.bold}${C.lime}[${i}]${C.reset}`);
    else cells.push(`${C.dim}${i}${C.reset}`);
  }
  console.log(`\n${C.lime}${C.bold}🐾  OPENCAT AI — MASTER ONBOARDING WIZARD${C.reset}`);
  console.log(` ${C.cyan}Step ${step} of ${total} — ${done ? C.green + 'configuring ' + done : 'beginning'}${C.reset}`);
  console.log(` ${cells.join(' ')}\n`);
}

async function runWizard() {
  console.log(`
${C.lime}${C.bold}       /\\_____/\\
      /  ${C.pink}■${C.lime}   ${C.pink}■${C.lime}  \\      ${C.lime}🐾 OPENCAT AI ONBOARDING WIZARD 🐾${C.reset}
${C.lime}     ( ==  ${C.pink}^${C.lime}  == )     ${C.cyan}Robinhood Chain Multi-Agent Trading Swarm${C.reset}
${C.lime}      )    ${C.yellow}~${C.lime}    (      ${C.lavender}EVM L2 #4663 • Native ETH • Uniswap V3${C.reset}
${C.lime}     (   _____   )     ${C.gold}"Chill trades, 9 lives, sharp alpha."${C.reset}
${C.lime}    ( (  )   (  ) )
   (__(__)___(__)__)${C.reset}
`);
  console.log(`${C.lime}========================================================================${C.reset}`);
  console.log(`${C.lime}🐾 OPENCAT MULTI-AGENT ENGINE - MASTER ONBOARDING WIZARD 🐾${C.reset}`);
  console.log(`${C.lime}========================================================================${C.reset}\n`);
  console.log('💡 Note: API keys are MANDATORY for their respective sub-agents to run. Press ENTER to keep existing values.\n');

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
  let controlRoomId = existingEnv.DISCORD_CHANNEL_CONTROL_ROOM || '';
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

    const defaultCtrlMsg = controlRoomId ? ` [Default: ${controlRoomId}]` : ' [Optional — alerts are sent here; falls back to #opencat-control-room]';
    const inputCtrl = await askQuestion(` 3. Enter DISCORD_CHANNEL_CONTROL_ROOM (channel ID)${defaultCtrlMsg}: `);
    controlRoomId = inputCtrl.trim() || controlRoomId;
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

  // 4. OPENCAT'S REASONING ENGINE
  drawProgressHeader(4, 9, 'AI provider & model');
  console.log(` ${C.cyan}${C.bold}🧠 STEP 4: OPENCAT'S REASONING ENGINE (AI PROVIDER)${C.reset}`);
  let existingProvider = existingEnv.AI_PROVIDER || '';
  let existingBaseUrl = existingEnv.AI_BASE_URL || '';
  let existingModelName = existingEnv.AI_MODEL_NAME || '';
  let rawExistingKeys = existingEnv.AI_API_KEYS || existingEnv.AI_API_KEY || '';
  let existingKeyList = rawExistingKeys.split(',').map((k) => k.trim()).filter(Boolean);
  let allKeys = [];

  if (existingKeyList.length > 0) {
    console.log(`   ℹ️  Found ${existingKeyList.length} existing AI key(s):`);
    existingKeyList.forEach((k, idx) => console.log(`      - Key #${idx + 1}: ${k.slice(0, 14)}...`));
    const keepKeys = (await askQuestion('   Keep existing AI API key(s)? (Y/n) [Default Y]: ')) || 'y';
    if (keepKeys.toLowerCase() !== 'n') allKeys = existingKeyList;
  }

  let provider = existingProvider || 'anthropic';
  let baseUrl = existingBaseUrl || 'https://api.anthropic.com/v1';
  let modelName = existingModelName || 'claude-sonnet-5';
  const backupCfgEntries = [];

  if (allKeys.length === 0) {
    const keyIn = (await askQuestion(`   Enter PRIMARY AI API KEY ${C.red}[REQUIRED]${C.reset}: `)).trim();
    if (!keyIn) { console.log(`   ${C.yellow}AI key is required — falling back to existing/empty and continuing.${C.reset}`); }
    const primaryAiKey = keyIn || existingEnv.AI_API_KEY || '';
    if (primaryAiKey) allKeys.push(primaryAiKey);

    const cfg = await askAiProviderConfig(existingProvider, existingBaseUrl, existingModelName);
    provider = cfg.provider; baseUrl = cfg.baseUrl; modelName = cfg.modelName;

    const stackChoice = (await askQuestion('   Add a failover BACKUP AI key (provider may differ)? (y/N) [Default N]: ')) || 'n';
    if (stackChoice.toLowerCase() === 'y') {
      const backupCount = Math.min(Math.max(parseInt((await askQuestion('   How many backup AI keys? (1-5) [Default 1]: ')) || '1', 10) || 1, 1), 5);
      for (let i = 1; i <= backupCount; i++) {
        const bKey = (await askQuestion(`   Backup AI API KEY #${i}: `)).trim();
        if (!bKey) { console.log('      Skipped — empty backup key.'); continue; }
        allKeys.push(bKey);
        const bCfg = await askAiProviderConfig(existingProvider, existingBaseUrl, existingModelName);
        backupCfgEntries.push({ slot: i + 1, cfg: bCfg });
      }
    }
  } else {
    const cfg = await askAiProviderConfig(existingProvider, existingBaseUrl, existingModelName);
    provider = cfg.provider; baseUrl = cfg.baseUrl; modelName = cfg.modelName;
  }
  const combinedKeys = allKeys.join(',');

  // 4.5 OFFICIAL X (TWITTER) API V2 ALPHA SCRAPER (OPTIONAL)
  console.log(`\n ${C.cyan}${C.bold}🐦 STEP 4.5: OFFICIAL X (TWITTER) API V2 ALPHA SCRAPER (OPTIONAL)${C.reset}`);
  console.log('   Enable Robinhood Chain social sentiment & tweet searching via official X API v2?');
  const enableXChoice = (await askQuestion('   Enable X (Twitter) Alpha Scraper? (y/N) [Default N]: ')) || 'n';
  let enableXScraper = 'false';
  let xApiBearerToken = existingEnv.X_API_BEARER_TOKEN || '';
  let xBackupKeys = [];

  if (enableXChoice.toLowerCase() === 'y') {
    enableXScraper = 'true';
    const xKeyRes = await askKeyWithBackup('X (Twitter) API v2', 'X_API_BEARER_TOKEN (Official X API v2 Bearer Token)', xApiBearerToken, true);
    xApiBearerToken = xKeyRes.value.trim();
    xBackupKeys = xKeyRes.backups;
  }

  // 5. MARKET DATA & SECURITY APIS (with backup key support)
  drawProgressHeader(5, 9, 'market data & security APIs');
  console.log(` ${C.cyan}${C.bold}📊 STEP 5: MARKET DATA & SECURITY APIS${C.reset}`);
  const gmgn = await askKeyWithBackup('GMGN', 'GMGN_API_KEY (smart-money/rank/security)', existingEnv.GMGN_API_KEY || '', true);
  const gmgnRh = { value: (await askQuestion(`  GMGN_API_KEY_ROBINHOOD (optional — dedicated robinhood key) [Default: ${existingEnv.GMGN_API_KEY_ROBINHOOD ? 'set' : 'none'}]: `)).trim() || existingEnv.GMGN_API_KEY_ROBINHOOD || '' };
  const krystal = await askKeyWithBackup('Krystal Cloud', 'KRYSTAL_CLOUD_API_KEY (LP pool data — mandatory for LP agent)', existingEnv.KRYSTAL_CLOUD_API_KEY || '', true);
  const opensea = await askKeyWithBackup('OpenSea', 'OPENSEA_API_KEY (NFT floor & rarity — mandatory for NFT agent)', existingEnv.OPENSEA_API_KEY || '', true);
  const goplus = await askKeyWithBackup('GoPlus', 'GOPLUS_API_KEY (EVM security audit — mandatory for /audit)', existingEnv.GOPLUS_API_KEY || '', true);
  const uniswap = await askKeyWithBackup('Uniswap V3 API', 'UNISWAP_API_KEY (Uniswap V3 Developer API — required for real-market quotes in DRY_RUN & AUTO_EXECUTE)', existingEnv.UNISWAP_API_KEY || '', false);

  // 5.5 SCREENING STRATEGY
  const strategy = await askStrategyConfig();
  let strategyPreset = strategy.preset;

  // 6. WEB3 RPC ENDPOINTS
  console.log('\n⚡ STEP 6: WEB3 RPC ENDPOINTS (Robinhood Chain — EVM L2, chain ID 4663, native ETH)');
  let evmRobinhoodRpcUrl = existingEnv.EVM_ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

  const defaultRhRpc = evmRobinhoodRpcUrl ? ` [ALREADY SET: ${evmRobinhoodRpcUrl}]` : ' [Default: https://rpc.mainnet.chain.robinhood.com]';
  const inputRhRpc = await askQuestion(` 1. EVM_ROBINHOOD_RPC_URL (Robinhood Chain RPC — used for on-chain swaps & honeypot checks)${defaultRhRpc}: `);
  evmRobinhoodRpcUrl = inputRhRpc.trim() || evmRobinhoodRpcUrl;

  // 7. BURNER WALLET / ADDRESS (EVM — Robinhood Chain)
  console.log('\n👛 STEP 7: ON-CHAIN BURNER WALLET / ADDRESS (EVM — Robinhood Chain)');
  console.log('   ⚠️  Private Key is required ONLY for AUTO_EXECUTE mode. DRY_RUN & SIGNAL_ONLY can use Wallet Address only.');
  let evmPrivateKey = existingEnv.EVM_PRIVATE_KEY || '';
  let evmWalletAddress = existingEnv.EVM_WALLET_ADDRESS || '';

  const defaultEvmPk = evmPrivateKey ? ` [ALREADY SET: ${evmPrivateKey.slice(0, 8)}...]` : ' [Optional for DRY_RUN/SIGNAL_ONLY — ENTER to skip]';
  const inputEvmPk = await askQuestion(` 1. EVM_PRIVATE_KEY${defaultEvmPk}: `);
  evmPrivateKey = inputEvmPk.trim() || evmPrivateKey;

  const defaultEvmAddr = evmWalletAddress ? ` [ALREADY SET: ${evmWalletAddress}]` : ' [Optional — public wallet address for position tracking]';
  const inputEvmAddr = await askQuestion(` 2. EVM_WALLET_ADDRESS${defaultEvmAddr}: `);
  evmWalletAddress = inputEvmAddr.trim() || evmWalletAddress;

  // 8. OPERATING MODE & RISK CONTROLS
  console.log('\n⚙️ STEP 8: OPERATING MODE & AUTO TP/SL RISK CONTROLS');
  console.log(' [1] DRY_RUN — Safe realistic simulation with real market quotes & fees (Address only, Default)');
  console.log(' [2] SIGNAL_ONLY — OpenCat Intelligence Hub (Call Signals + Wallet Tracking, Address only)');
  console.log(' [3] AUTO_EXECUTE — Autonomous Trading via Uniswap V3 (Private Key required)');
  const modeInput = (await askQuestion(' Selection (1/2/3) [Default 1]: ')) || '1';

  let execMode = 'DRY_RUN';
  if (modeInput === '2') execMode = 'SIGNAL_ONLY';
  if (modeInput === '3') execMode = 'AUTO_EXECUTE';

  const isDryRunStr = execMode === 'AUTO_EXECUTE' ? 'false' : 'true';
  const autoExecEnabled = execMode === 'AUTO_EXECUTE' ? 'true' : 'false';

  console.log(`\n 🛡️  Default Risk & Auto TP/SL Management Settings:`);
  const tp1Input = await askQuestion(`   - TP1 Target % [Default +100%]: `);
  const defaultTp1 = tp1Input.trim() ? Number(tp1Input.trim()) : 100;

  const tp2Input = await askQuestion(`   - TP2 Target % [Default +200%]: `);
  const defaultTp2 = tp2Input.trim() ? Number(tp2Input.trim()) : 200;

  const slInput = await askQuestion(`   - SL Target % [Default -50%]: `);
  const defaultSl = slInput.trim() ? Number(slInput.trim()) : -50;

  const drawdownInput = await askQuestion(`   - Max Portfolio Drawdown Limit % [Default 15%]: `);
  const maxDrawdown = drawdownInput.trim() ? Number(drawdownInput.trim()) : 15;

  const defaultEthSim = existingEnv.SIMULATION_BALANCE_ETH ? ` [ALREADY SET: ${existingEnv.SIMULATION_BALANCE_ETH} ETH]` : ' [Default 1.0]';
  const simEthBalance = await askQuestion(`   - Starting Simulation Balance for EVM (ETH)${defaultEthSim}: `) || existingEnv.SIMULATION_BALANCE_ETH || '1.0';

  const updates = {
    NODE_ENV: 'production',
    EXECUTION_MODE: execMode,
    DRY_RUN: isDryRunStr,
    AUTO_EXECUTE_ENABLED: autoExecuteEnabled,
    DEFAULT_TP1_PCT: String(defaultTp1),
    DEFAULT_TP2_PCT: String(defaultTp2),
    DEFAULT_SL_PCT: String(defaultSl),
    MAX_DRAWDOWN_LIMIT_PCT: String(maxDrawdown),
    LOG_LEVEL: 'info',
    SIMULATION_BALANCE_ETH: simEthBalance.trim(),
    STRATEGY_PRESET: strategyPreset,
    DISCORD_BOT_TOKEN: botToken.trim(),
    DISCORD_CLIENT_ID: clientId.trim(),
    DISCORD_CHANNEL_CONTROL_ROOM: controlRoomId.trim(),
    TELEGRAM_BOT_TOKEN: telegramToken.trim(),
    TELEGRAM_CHAT_ID: telegramChatId.trim(),
    AI_PROVIDER: provider,
    AI_BASE_URL: baseUrl,
    AI_API_KEYS: combinedKeys,
    AI_API_KEY: (allKeys[0] || '').trim(),
    AI_MODEL_NAME: modelName,
    OPENROUTER_API_KEY: (allKeys[0] || '').trim(),
    OPENAI_API_KEY: (allKeys[0] || '').trim(),
    ANTHROPIC_API_KEY: (allKeys[0] || '').trim(),
    GMGN_API_KEY: gmgn.value.trim(),
    GMGN_API_KEY_ROBINHOOD: gmgnRh.value.trim(),
    GMGN_BACKUP_KEYS: gmgn.backups.join(','),
    KRYSTAL_CLOUD_API_KEY: krystal.value.trim(),
    KRYSTAL_CLOUD_BACKUP_KEYS: krystal.backups.join(','),
    OPENSEA_API_KEY: opensea.value.trim(),
    OPENSEA_BACKUP_KEYS: opensea.backups.join(','),
    GOPLUS_API_KEY: goplus.value.trim(),
    GOPLUS_BACKUP_KEYS: goplus.backups.join(','),
    UNISWAP_API_KEY: uniswap.value.trim(),
    UNISWAP_BACKUP_KEYS: uniswap.backups.join(','),
    ENABLE_X_ALPHA_SCRAPER: enableXScraper,
    X_API_BEARER_TOKEN: xApiBearerToken,
    X_API_BACKUP_KEYS: xBackupKeys.join(','),
    EVM_RPC_URL: evmRobinhoodRpcUrl.trim(),
    EVM_ROBINHOOD_RPC_URL: evmRobinhoodRpcUrl.trim(),
    EVM_PRIVATE_KEY: evmPrivateKey.trim(),
    EVM_WALLET_ADDRESS: evmWalletAddress.trim(),
  };

  // Per-key backup config: AI_KEY_N_PROVIDER / AI_KEY_N_BASE_URL / AI_KEY_N_MODEL_NAME (slot = position in AI_API_KEYS)
  for (const { slot, cfg } of backupCfgEntries) {
    updates[`AI_KEY_${slot}_PROVIDER`] = cfg.provider;
    updates[`AI_KEY_${slot}_BASE_URL`] = cfg.baseUrl;
    updates[`AI_KEY_${slot}_MODEL_NAME`] = cfg.modelName;
  }

  // ⚠️ TRIAL OF CONFIGURATION — review before saving
  console.log(`\n${C.magenta}${C.bold}========================================================${C.reset}`);
  console.log(`${C.magenta}${C.bold} ⚠️  TRIAL OF CONFIGURATION — REVIEW SUMMARY${C.reset}`);
  console.log(`${C.magenta}${C.bold}========================================================${C.reset}`);
  const rows = [
    ['Execution Mode', execMode === 'AUTO_EXECUTE' ? `${C.red}AUTO_EXECUTE (LIVE UNISWAP TRADING)${C.reset}` : execMode === 'SIGNAL_ONLY' ? `${C.cyan}SIGNAL_ONLY (INTELLIGENCE HUB)${C.reset}` : `${C.green}DRY_RUN (SIMULATION)${C.reset}`],
    ['Primary Swap Venue', 'Uniswap V3 (Robinhood Chain L2)'],
    ['Auto TP / SL', `TP1: +${defaultTp1}% | TP2: +${defaultTp2}% | SL: ${defaultSl}%`],
    ['Max Drawdown', `${maxDrawdown}%`],
    ['Strategy', strategyPreset === 'custom'
      ? `${C.green}custom${C.reset} (${fs.existsSync(path.join(process.cwd(), 'strategies', 'custom-strategy-prompt.txt')) ? 'prompt saved' : 'numeric editor'})`
      : strategyPreset === 'standard' ? 'standard (strict)' : `${C.green}loosened 2x${C.reset} (default)`],
    ['Discord', botToken ? `${C.green}✓${C.reset} token set` : `${C.red}✗${C.reset} not set`],
    ['Telegram', telegramToken ? `${C.green}✓${C.reset} token set` : `${C.dim}–${C.reset} not set`],
    ['AI Provider', `${provider} (${modelName})`],
    ['AI Keys', `${allKeys.length} total (${backupCfgEntries.length} backup)`],
    ['GMGN', gmgn.value ? `${C.green}✓${C.reset} +${gmgn.backups.length} backup` : `${C.red}✗${C.reset}`],
    ['Krystal', krystal.value ? `${C.green}✓${C.reset} +${krystal.backups.length} backup` : `${C.red}✗${C.reset}`],
    ['OpenSea', opensea.value ? `${C.green}✓${C.reset} +${opensea.backups.length} backup` : `${C.red}✗${C.reset}`],
    ['GoPlus', goplus.value ? `${C.green}✓${C.reset} +${goplus.backups.length} backup` : `${C.red}✗${C.reset}`],
    ['Uniswap', uniswap.value ? `${C.green}✓${C.reset} +${uniswap.backups.length} backup` : `${C.dim}–${C.reset} optional`],
    ['Robinhood RPC', evmRobinhoodRpcUrl],
    ['EVM Wallet Address', evmWalletAddress ? evmWalletAddress : (evmPrivateKey ? `${C.green}✓${C.reset} PK set` : `${C.dim}–${C.reset} not set`)],
  ];
  for (const [label, val] of rows) console.log(`   ${label.padEnd(16)} ${val}`);
  const confirmWrite = (await askQuestion(`\n   Save this configuration to .env? (Y/n) [Default Y]: `)) || 'y';
  if (confirmWrite.toLowerCase() === 'n') {
    console.log(`\n${C.yellow}Configuration discarded. Rerun 'opencat wizard' when ready.${C.reset}`);
    rl.close();
    return;
  }

  if (strategy.activeMap && Object.keys(strategy.activeMap).length > 0) {
    writeActiveStrategyMap(strategy.activeMap);
    console.log(`${C.green}✓${C.reset} Screening strategy activated (strategies/.active.json).`);
  }

  // ── MERGE-BASED .env WRITE ─────────────────────────────────────────────
  // Never clobber the whole file: keep every existing key, only update the
  // values this wizard run collected. Unknown/extra keys survive untouched.

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

  console.log(`\n${C.lime}${C.bold}========================================================${C.reset}`);
  console.log(`${C.lime}${C.bold} 🐾 CONFIGURATION SAVED — OPENCAT IS READY 🐾${C.reset}`);
  console.log(`${C.lime}${C.bold}========================================================${C.reset}`);
  console.log(`   ${C.bold}Command Center:${C.reset} run \`opencat terminal\` to open the interactive TUI.`);
  console.log(`   ${C.bold}OpenCat Engine:${C.reset} run \`opencat run\` (dev) or \`opencat deploy\` (24/7 via PM2 — Cat Den).`);
  console.log(`   ${C.bold}Diagnostics:${C.reset}    \`opencat doctor\` | \`opencat test\` | \`opencat update\``);
  console.log(`\n${C.dim}Wise words: 9 lives in crypto — DRY_RUN is your armor, strike when ready. 🐱${C.reset}\n`);

  rl.close();
}

runWizard().catch(console.error);
