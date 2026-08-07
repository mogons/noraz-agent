import { describe, it, expect, afterEach } from 'vitest';
import { isDryRun, getEnvString, getApiKey } from '../src/config/config.js';

describe('config helpers', () => {
  afterEach(() => {
    delete process.env.DRY_RUN;
    delete process.env.GMGN_API_KEY;
    delete process.env.TEST_VAR;
  });

  it('isDryRun returns true when DRY_RUN unset or "true"', () => {
    expect(isDryRun()).toBe(true);
    process.env.DRY_RUN = 'true';
    expect(isDryRun()).toBe(true);
  });

  it('isDryRun returns false only when DRY_RUN === "false"', () => {
    process.env.DRY_RUN = 'false';
    expect(isDryRun()).toBe(false);
  });

  it('getEnvString returns value or fallback', () => {
    expect(getEnvString('TEST_VAR', 'fallback')).toBe('fallback');
    process.env.TEST_VAR = 'real';
    expect(getEnvString('TEST_VAR', 'fallback')).toBe('real');
  });

  it('getApiKey returns key value or undefined', () => {
    expect(getApiKey('GMGN_API_KEY')).toBeUndefined();
    process.env.GMGN_API_KEY = 'abc';
    expect(getApiKey('GMGN_API_KEY')).toBe('abc');
  });
});
