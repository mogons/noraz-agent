import fs from 'fs';
import path from 'path';
import { StrategyEngine } from './strategy-engine.js';
import type { AIService } from '../services/ai-service.js';

const DEFAULT_STRATEGIES_DIR = path.join(process.cwd(), 'strategies');
const PROMPT_FILE = 'custom-strategy-prompt.txt';
const DOMAINS = ['meme-robinhood', 'lp-robinhood', 'nft'];

const STRATEGY_RULES = `
You are writing an AthenaStrategy .mjs module for the Athena screening engine.
Export a default object: { id, name, version, description, params, evaluate(ctx) }.
- id MUST be '<domain>-custom'.
- params MUST include passThreshold (keep 80).
- evaluate(ctx) MUST return { confidence: 0-100, recommendedAction: 'BUY'|'SELL'|'HOLD'|'SKIP', reason: string }.
- Rules: fail-closed (missing data -> SKIP with confidence 0, never fake-pass); quality floor >= 80;
  honor the user's prompt as hard gates and scoring; deterministic, no LLM calls inside evaluate.
- Available ctx fields:
  - meme-robinhood: ctx.gmgn (ageHours, volume_24h, liquidity, rug_ratio, rat_trader_amount_rate,
    top_10_holder_rate, is_wash_trading, cto_flag, creator_close, dev_team_hold_rate, smart_degen_count,
    renowned_count, buys, sells, visiting_count, twitter_rename_count, twitter_del_post_token_count,
    twitter_create_token_count, total_fee, native_price_usd) + ctx.smartMoneyCount, ctx.securityAuditPassed.
  - lp-robinhood: ctx.pool (tvlUsd, volume24hUsd, fee24hUsd, feesToTvlRatio24h, token0Symbol, token1Symbol,
    marketCapUsd, feeTier, apr24h, farmApr24h, volumeToActiveTvlRatio1h) + ctx.securityAuditPassed.
  - nft: ctx.floorPriceEth, ctx.priceEth, ctx.floorSurge1hPct, ctx.volumeSpike1hRatio, ctx.salesVelocity1h,
    ctx.isWhaleSweep, ctx.isVerified.
Return ONLY the .mjs code, no markdown fences, no commentary.
`;

export interface BootstrapResult {
  generated: string[];
  failed: string[];
  skipped: boolean;
}

/**
 * Startup bootstrap: if strategies/custom-strategy-prompt.txt exists, ask the
 * LLM to compile a per-domain <domain>-custom.mjs strategy, validate it through
 * the StrategyEngine sandbox and activate it. Fail-closed: any generation or
 * validation error keeps the shipped default strategy — boot never breaks.
 */
export async function bootstrapCustomStrategies(opts: {
  strategiesDir?: string;
  aiService?: Pick<AIService, 'generateCompletion'>;
  engine?: StrategyEngine;
  log?: (msg: string) => void;
} = {}): Promise<BootstrapResult> {
  const strategiesDir = opts.strategiesDir || DEFAULT_STRATEGIES_DIR;
  const engine = opts.engine || new StrategyEngine();
  const log = opts.log || ((msg: string) => console.log(`[STRATEGY BOOTSTRAP] ${msg}`));
  const ai = opts.aiService;

  const promptFile = path.join(strategiesDir, PROMPT_FILE);
  if (!fs.existsSync(promptFile)) {
    log('No custom strategy prompt found — using wizard/default presets.');
    return { generated: [], failed: [], skipped: true };
  }
  const prompt = fs.readFileSync(promptFile, 'utf-8').trim();
  if (!prompt) {
    log('Custom strategy prompt is empty — skipping generation.');
    return { generated: [], failed: [], skipped: true };
  }

  const generated: string[] = [];
  const failed: string[] = [];

  for (const domain of DOMAINS) {
    const customFile = path.join(strategiesDir, `${domain}-custom.mjs`);
    if (fs.existsSync(customFile)) {
      log(`Custom strategy for ${domain} already exists — skipping.`);
      continue;
    }
    if (!ai) {
      failed.push(domain);
      log(`No AI service available for ${domain} — keeping default.`);
      continue;
    }
    try {
      log(`Generating custom strategy for ${domain}...`);
      const code = await ai.generateCompletion(
        [
          { role: 'system', content: 'You are Athena, the strategy compiler. Write valid strategy modules only.' },
          { role: 'user', content: `${STRATEGY_RULES}\n\nUser strategy prompt:\n${prompt}\n\nDomain: ${domain}` },
        ],
        1500,
      );
      const trimmed = (code || '').trim();
      if (!trimmed) throw new Error('Empty LLM response');
      const write = engine.writeStrategy(`${domain}-custom`, trimmed);
      if (!write.success) throw new Error(write.message);
      const act = engine.setActiveStrategy(domain, `${domain}-custom`);
      if (!act.success) throw new Error(act.message);
      generated.push(`${domain}-custom`);
      log(`${domain}-custom generated, validated and activated.`);
    } catch (err: any) {
      failed.push(domain);
      log(`${domain} custom strategy failed (${err?.message || String(err)}) — keeping default.`);
      if (fs.existsSync(customFile)) {
        try { fs.unlinkSync(customFile); } catch { /* ignore */ }
      }
    }
  }

  return { generated, failed, skipped: generated.length === 0 && failed.length === 0 };
}
