import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { bootstrapCustomStrategies } from '../src/orchestrator/strategy-bootstrap.js';
import { StrategyEngine } from '../src/orchestrator/strategy-engine.js';

// Unique temp dir PER TEST: the strategy engine loads .mjs modules via the
// require cache keyed by path — reusing one tmp dir across tests would serve
// a stale cached module (e.g. the earlier valid module at the same path)
// instead of the file just written, defeating the smoke-evaluate test.
let tmp: string;
let strategiesDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-boot-'));
  strategiesDir = path.join(tmp, 'strategies');
  fs.mkdirSync(strategiesDir, { recursive: true });
});
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

// Hermetic fake matching the REAL AIService.generateCompletion signature:
// generateCompletion(messages, maxTokens?) => Promise<string> (plain text, no { text } wrapper).
const fakeAi = {
  generateCompletion: vi.fn(async () => ''),
};

function validStrategyModule(id: string): string {
  return `export default { id: '${id}', name: 'gen', version: '1.0.0', description: 'x', params: { passThreshold: 80 }, evaluate(ctx) { return { confidence: 80, recommendedAction: ctx.symbol === 'GOOD' ? 'BUY' : 'SKIP', reason: 't' }; } };`;
}

describe('bootstrapCustomStrategies', () => {
  it('skips when no prompt file exists', async () => {
    const res = await bootstrapCustomStrategies({ strategiesDir, aiService: fakeAi as any, engine: new StrategyEngine({ strategiesDir }) });
    expect(res.skipped).toBe(true);
    expect(fakeAi.generateCompletion).not.toHaveBeenCalled();
  });

  it('generates, validates and activates custom strategies once per prompt file', async () => {
    fs.writeFileSync(path.join(strategiesDir, 'custom-strategy-prompt.txt'), 'aggressive volume filters please');
    fakeAi.generateCompletion.mockImplementation(async () => validStrategyModule('meme-robinhood-custom'));
    const res = await bootstrapCustomStrategies({ strategiesDir, aiService: fakeAi as any, engine: new StrategyEngine({ strategiesDir }) });
    expect(res.skipped).toBe(false);
    expect(res.generated).toContain('meme-robinhood-custom');
    expect(fs.existsSync(path.join(strategiesDir, 'meme-robinhood-custom.mjs'))).toBe(true);
    const engine = new StrategyEngine({ strategiesDir });
    expect(engine.getActiveStrategy('meme-robinhood')?.id).toBe('meme-robinhood-custom');
    const res2 = await bootstrapCustomStrategies({ strategiesDir, aiService: fakeAi as any, engine: new StrategyEngine({ strategiesDir }) });
    expect(res2.skipped).toBe(true);
  });

  it('falls back to defaults when generation/validation fails (never breaks boot)', async () => {
    fs.writeFileSync(path.join(strategiesDir, 'custom-strategy-prompt.txt'), 'do something');
    fakeAi.generateCompletion.mockImplementation(async () => 'export default { broken');
    const res = await bootstrapCustomStrategies({ strategiesDir, aiService: fakeAi as any, engine: new StrategyEngine({ strategiesDir }) });
    expect(res.generated).toHaveLength(0);
    expect(res.failed.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(strategiesDir, 'meme-robinhood-custom.mjs'))).toBe(false);
    // Hermetic fallback check: seed the shipped default into the temp dir so the
    // fallback resolution stays inside the temp dir (never touches repo strategies/).
    fs.copyFileSync(
      path.resolve(process.cwd(), 'strategies', 'meme-robinhood-default.mjs'),
      path.join(strategiesDir, 'meme-robinhood-default.mjs'),
    );
    const engine = new StrategyEngine({ strategiesDir });
    expect(engine.getActiveStrategy('meme-robinhood')?.params.minVolume24hUsd).toBe(25000);
  });

  it('falls back to defaults when the generated strategy throws at evaluate (smoke test)', async () => {
    fs.writeFileSync(path.join(strategiesDir, 'custom-strategy-prompt.txt'), 'do something');
    // Valid shape (passes sandbox validation) but crashes at runtime on any ctx.
    fakeAi.generateCompletion.mockImplementation(async () => `export default { id: 'meme-robinhood-custom', name: 'gen', version: '1.0.0', description: 'x', params: { passThreshold: 80 }, evaluate(ctx) { if (!ctx.gmgn) throw new Error('boom: missing gmgn'); return { confidence: 80, recommendedAction: 'BUY', reason: 't' }; } };`);
    const res = await bootstrapCustomStrategies({ strategiesDir, aiService: fakeAi as any, engine: new StrategyEngine({ strategiesDir }) });
    expect(res.generated).toHaveLength(0);
    expect(res.failed.length).toBeGreaterThan(0);
    // The file is removed even though write/activate succeeded — the smoke
    // evaluate caught the runtime crash.
    expect(fs.existsSync(path.join(strategiesDir, 'meme-robinhood-custom.mjs'))).toBe(false);
    // .active.json still points at the (now missing) custom file — the engine
    // falls back to <domain>-default when the active file is gone.
    fs.copyFileSync(
      path.resolve(process.cwd(), 'strategies', 'meme-robinhood-default.mjs'),
      path.join(strategiesDir, 'meme-robinhood-default.mjs'),
    );
    const engine = new StrategyEngine({ strategiesDir });
    expect(engine.getActiveStrategy('meme-robinhood')?.id).toBe('meme-robinhood-default');
    expect(engine.getActiveStrategy('meme-robinhood')?.params.minVolume24hUsd).toBe(25000);
  });

  it('StrategyEngine constructor dirs override resolves (hermetic temp dirs)', () => {
    fs.writeFileSync(path.join(strategiesDir, 'marker-strategy.mjs'), validStrategyModule('marker-strategy'));
    const engine = new StrategyEngine({ strategiesDir });
    expect(engine.listStrategies().map((s) => s.id)).toContain('marker-strategy');
    const res = engine.writeStrategy('marker-hermetic', validStrategyModule('marker-hermetic'));
    expect(res.success).toBe(true);
    expect(fs.existsSync(path.join(strategiesDir, 'marker-hermetic.mjs'))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), 'strategies', 'marker-hermetic.mjs'))).toBe(false);
  });
});
