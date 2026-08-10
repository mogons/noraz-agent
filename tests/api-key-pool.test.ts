import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApiKeyPool, loadApiKeyPool } from '../src/services/api-key-pool.js';

describe('ApiKeyPool', () => {
  beforeEach(() => { for (const k of Object.keys(process.env)) if (k.startsWith('TESTPOOL')) delete process.env[k]; });
  afterEach(() => { for (const k of Object.keys(process.env)) if (k.startsWith('TESTPOOL')) delete process.env[k]; });

  it('get returns the primary key', () => {
    const pool = createApiKeyPool('TESTPOOL_API_KEY', ['k1', 'k2']);
    expect(pool.get()).toBe('k1');
  });

  it('markFailed rotates to the next key', () => {
    const pool = createApiKeyPool('TESTPOOL_API_KEY', ['k1', 'k2', 'k3']);
    expect(pool.markFailed('HTTP 401')).toBe('k2');
    expect(pool.get()).toBe('k2');
    expect(pool.markFailed('HTTP 429')).toBe('k3');
    expect(pool.get()).toBe('k3');
  });

  it('single-key pool never rotates', () => {
    const pool = createApiKeyPool('TESTPOOL_API_KEY', ['only']);
    expect(pool.markFailed('HTTP 401')).toBe('only');
    expect(pool.get()).toBe('only');
  });

  it('filters placeholders and empties', () => {
    const pool = createApiKeyPool('TESTPOOL_API_KEY', ['real1', 'YOUR_KEY_HERE', '', 'mock_key', '  ', 'real2']);
    expect(pool.keys).toEqual(['real1', 'real2']);
  });

  it('wraps around after all keys fail and resets rotation', () => {
    const pool = createApiKeyPool('TESTPOOL_API_KEY', ['a', 'b']);
    pool.markFailed('x'); // -> b
    pool.markFailed('x'); // -> a (all failed, reset)
    expect(pool.get()).toBe('a');
  });

  it('loadApiKeyPool parses env primary + BACKUP_KEYS', () => {
    process.env.TESTPOOL_API_KEY = 'primary';
    process.env.TESTPOOL_BACKUP_KEYS = 'b1, b2 ,YOUR_MOCK';
    const pool = loadApiKeyPool('TESTPOOL_API_KEY');
    expect(pool.keys).toEqual(['primary', 'b1', 'b2']);
    expect(pool.baseVar).toBe('TESTPOOL_API_KEY');
  });
});
