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

    const active = engine.setActiveStrategy('meme-solana', 'test-momentum');
    expect(active.success).toBe(true);

    const listAfter = engine.listStrategies();
    expect(listAfter.find((s) => s.id === 'test-momentum')?.active).toBe(true);
  });

  it('activates the default meme-solana strategy', () => {
    const engine = new StrategyEngine();
    const res = engine.setActiveStrategy('meme-solana', 'meme-solana-default');
    expect(res.success).toBe(true);
    const active = engine.getActiveStrategy('meme-solana');
    expect(active?.id).toBe('meme-solana-default');
  });

  it('falls back to domain-default strategy without explicit activation', () => {
    const engine = new StrategyEngine();
    // No active map set — the shipped meme-solana-default must be active out-of-the-box
    const active = engine.getActiveStrategy('meme-solana');
    expect(active?.id).toBe('meme-solana-default');
    // Domain normalization: uppercase/underscore (swarm style) also resolves
    const swarmStyle = engine.getActiveStrategy('MEME_SOLANA');
    expect(swarmStyle?.id).toBe('meme-solana-default');
  });

  it('returns null when no strategy exists for the domain', () => {
    const engine = new StrategyEngine();
    expect(engine.getActiveStrategy('nft')).toBeNull();
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
