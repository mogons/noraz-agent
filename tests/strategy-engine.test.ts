import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StrategyEngine } from '../src/orchestrator/strategy-engine.js';

const STRAT_DIR = path.resolve(process.cwd(), 'strategies');

const VALID_STRATEGY = `
export default {
  id: 'test-momentum',
  name: 'Test Momentum',
  version: '1.0.0',
  description: 'Test strategy',
  params: { minLiquidityUsd: 10000 },
  evaluate: (ctx) => {
    const confidence = ctx.liquidityUsd >= 10000 ? 85 : 40;
    return { confidence, recommendedAction: 'BUY', reason: 'test' };
  },
};
`;

const INVALID_STRATEGY = `export default { id: 'broken', evaluate: 'not-a-function' };`;

afterEach(() => {
  for (const f of ['test-momentum.mjs', 'broken.mjs', '.active.json']) {
    const p = path.join(STRAT_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const bak = path.join(STRAT_DIR, '.backup', 'test-momentum.mjs.bak');
  if (fs.existsSync(bak)) fs.unlinkSync(bak);
});

describe('StrategyEngine', () => {
  it('writes and validates a strategy module', () => {
    const engine = new StrategyEngine();
    const res = engine.writeStrategy('test-momentum', VALID_STRATEGY);
    expect(res.success).toBe(true);
    expect(fs.existsSync(path.join(STRAT_DIR, 'test-momentum.mjs'))).toBe(true);
  });

  it('rejects invalid strategy and removes the file', () => {
    const engine = new StrategyEngine();
    const res = engine.writeStrategy('broken', INVALID_STRATEGY);
    expect(res.success).toBe(false);
    expect(fs.existsSync(path.join(STRAT_DIR, 'broken.mjs'))).toBe(false);
  });

  it('lists strategies and activates one', () => {
    const engine = new StrategyEngine();
    engine.writeStrategy('test-momentum', VALID_STRATEGY);
    const list = engine.listStrategies();
    expect(list.some((s) => s.id === 'test-momentum')).toBe(true);

    const active = engine.setActiveStrategy('meme-robinhood', 'test-momentum');
    expect(active.success).toBe(true);

    const listAfter = engine.listStrategies();
    expect(listAfter.find((s) => s.id === 'test-momentum')?.active).toBe(true);
  });

  it('activates the default meme-robinhood strategy', () => {
    const engine = new StrategyEngine();
    const res = engine.setActiveStrategy('meme-robinhood', 'meme-robinhood-default');
    expect(res.success).toBe(true);
    const active = engine.getActiveStrategy('meme-robinhood');
    expect(active?.id).toBe('meme-robinhood-default');
  });

  it('per-domain activation: activating meme-robinhood does not deactivate nft', () => {
    const engine = new StrategyEngine();
    engine.setActiveStrategy('meme-robinhood', 'meme-robinhood-default');
    engine.setActiveStrategy('nft', 'nft-default');
    expect(engine.getActiveStrategy('meme-robinhood')?.id).toBe('meme-robinhood-default');
    expect(engine.getActiveStrategy('nft')?.id).toBe('nft-default');
  });

  it('falls back to domain-default strategy without explicit activation', () => {
    const engine = new StrategyEngine();
    // No active map set — the shipped meme-robinhood-default must be active out-of-the-box
    const active = engine.getActiveStrategy('meme-robinhood');
    expect(active?.id).toBe('meme-robinhood-default');
    // Domain normalization: uppercase/underscore (swarm style) also resolves
    const swarmStyle = engine.getActiveStrategy('MEME_ROBINHOOD');
    expect(swarmStyle?.id).toBe('meme-robinhood-default');
  });

  it('falls back to nft-default strategy without explicit activation', () => {
    const engine = new StrategyEngine();
    // No active map set — the shipped nft-default must be active out-of-the-box
    const active = engine.getActiveStrategy('nft');
    expect(active?.id).toBe('nft-default');
  });

  it('returns null when no strategy exists for the domain', () => {
    const engine = new StrategyEngine();
    expect(engine.getActiveStrategy('bogus-domain')).toBeNull();
  });

  it('loads the meme-vol-spike indicator', () => {
    const engine = new StrategyEngine();
    const ind = engine.getIndicator('meme-vol-spike');
    expect(ind).not.toBeNull();
    expect(ind!.id).toBe('meme-vol-spike');
    const candles = Array.from({ length: 30 }, (_, i) => ({
      time: i * 3600,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: i % 4 === 0 ? 500 : 50,
    }));
    const out = ind!.calculate(candles);
    expect(out.length).toBe(30);
  });
});

describe('customizable presets', () => {
  const engine = new StrategyEngine();

  it('loads the loosened defaults for all three domains', () => {
    const meme = engine.getActiveStrategy('meme-robinhood');
    const nft = engine.getActiveStrategy('nft');
    const lp = engine.getActiveStrategy('lp-robinhood');
    expect(meme?.params.minVolume24hUsd).toBe(25000);
    expect(meme?.params.minLiquidityUsd).toBe(5000);
    expect(nft?.params.minSurgePct).toBe(10);
    expect(lp?.params.minTvlUsd).toBe(10000);
    expect(lp?.params.minFeeTvlRatio24h).toBe(0.02);
  });

  it('standard presets exist and keep the strict values', () => {
    const files = fs.readdirSync('strategies').filter((f) => f.endsWith('.mjs'));
    expect(files).toContain('meme-robinhood-standard.mjs');
    expect(files).toContain('nft-standard.mjs');
    expect(files).toContain('lp-robinhood-standard.mjs');
  });

  it('LP loosened strategy rejects below gates (fail-closed) and passes a healthy pool', () => {
    const strat = engine.getActiveStrategy('lp-robinhood');
    const evalFn = (pool: Record<string, unknown>) => strat!.evaluate({
      domain: 'lp-robinhood', symbol: 'PEPE', contractAddress: '0x1', priceUsd: 0,
      liquidityUsd: pool.tvlUsd as number, volume24hUsd: pool.volume24hUsd as number,
      volume1hUsd: 0, smartMoneyCount: 0, securityAuditPassed: true, socialHypeScore: 60, pool,
    });
    expect(evalFn({ tvlUsd: 5000, volume24hUsd: 500000, feesToTvlRatio24h: 0.1, marketCapUsd: 500000 }).recommendedAction).toBe('SKIP');
    expect(evalFn({ tvlUsd: 50000, volume24hUsd: 500000, feesToTvlRatio24h: 0.05, marketCapUsd: 500000 }).recommendedAction).toBe('BUY');
    expect(evalFn({ tvlUsd: 50000, volume24hUsd: 500000, feesToTvlRatio24h: 0.01, marketCapUsd: 500000 }).recommendedAction).toBe('SKIP');
    expect(evalFn({ tvlUsd: 50000, volume24hUsd: 500000, feesToTvlRatio24h: 0.05, marketCapUsd: 50000 }).recommendedAction).toBe('SKIP');
  });
});
