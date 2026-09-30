import { describe, it, expect } from 'vitest';
import { PlatformReporter } from '../src/services/platform-reporter.js';

describe('platform reporter', () => {
  it('posts a signal to the platform with the desk key', async () => {
    let seen: { url: string; auth: string; body: string } | null = null;
    const reporter = new PlatformReporter({
      url: 'http://platform.test',
      deskKey: 'nz_sbx_abc',
      fetchImpl: async (url, init) => {
        seen = { url, auth: init.headers.Authorization, body: init.body };
        return { ok: true, status: 200, text: async () => '' };
      },
    });

    reporter.report({ type: 'signal', domain: 'meme-robinhood', symbol: 'PEPE', confidence: 86 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(seen).not.toBeNull();
    expect(seen!.url).toBe('http://platform.test/platform/activity');
    expect(seen!.auth).toBe('Bearer nz_sbx_abc');
    const body = JSON.parse(seen!.body);
    expect(body.type).toBe('signal');
    expect(body.symbol).toBe('PEPE');
    expect(body.id).toMatch(/^[A-Za-z0-9_.:-]{8,80}$/);
  });

  it('stays quiet when no desk key is configured', async () => {
    let calls = 0;
    const reporter = new PlatformReporter({
      deskKey: '',
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, text: async () => '' };
      },
    });
    reporter.report({ type: 'signal', domain: 'nft', symbol: 'CAT' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(0);
  });
});
