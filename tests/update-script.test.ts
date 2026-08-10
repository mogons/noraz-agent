import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAthenaUpdate } from '../scripts/update-core.mjs';

const mockExecSync = vi.fn();
const mockSpawn = vi.fn(() => ({ unref: vi.fn(), on: vi.fn() }));
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

describe('runAthenaUpdate', () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.DISCORD_DEPLOY_WEBHOOK_URL;
    mockExecSync.mockReset();
    mockExecSync.mockImplementation(() => '');
    mockSpawn.mockReset();
    mockSpawn.mockImplementation(() => ({ unref: vi.fn(), on: vi.fn() }));
  });

  it('runs stash (only when dirty), pull, install, build, then schedules pm2 restart via detached spawn', async () => {
    mockExecSync.mockImplementationOnce(() => ' M src/x.ts\n'); // dirty worktree
    const result = await runAthenaUpdate({ cwd: '/repo' });

    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toBe('git status --porcelain');
    expect(calls[1]).toContain('git stash push');
    expect(calls[2]).toBe('git pull --ff-only');
    expect(calls[3]).toBe('git stash pop');
    expect(calls[4]).toBe('npm install');
    expect(calls[5]).toBe('npm run build');
    // pm2 restart now runs via detached spawn, not execSync
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [shell, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(shell).toBe('sh');
    expect(args[1]).toContain('pm2 restart athena-agent');
    expect(result.ok).toBe(true);
    expect(result.restartOk).toBe(true);
  });

  it('skips stash when the worktree is clean', async () => {
    mockExecSync.mockImplementationOnce(() => ''); // clean
    const result = await runAthenaUpdate({ cwd: '/repo' });

    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toBe('git status --porcelain');
    expect(calls.some((c) => c.includes('git stash push'))).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('skips pm2 restart when noRestart is set', async () => {
    const result = await runAthenaUpdate({ cwd: '/repo', noRestart: true });
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('reports ok=false and continues when npm install fails', async () => {
    mockExecSync
      .mockImplementationOnce(() => '') // clean
      .mockImplementationOnce(() => '') // pull
      .mockImplementationOnce(() => { throw new Error('install failed'); }); // npm install
    const result = await runAthenaUpdate({ cwd: '/repo' });

    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls).toContain('npm run build'); // build still attempted
    expect(result.ok).toBe(false);
  });

  it('continues past a failed stash pop (conflict tolerated)', async () => {
    mockExecSync
      .mockImplementationOnce(() => ' M src/x.ts') // dirty
      .mockImplementationOnce(() => '') // stash push ok
      .mockImplementationOnce(() => '') // pull ok
      .mockImplementationOnce(() => { throw new Error('conflict'); }) // stash pop fails
      .mockImplementationOnce(() => '') // npm install
      .mockImplementationOnce(() => ''); // build
    const result = await runAthenaUpdate({ cwd: '/repo' });
    expect(result.ok).toBe(true); // pop failure is tolerated
  });
});

import { notifyUpdate } from '../scripts/notify-update.mjs';

it('notifyUpdate sends Telegram + Discord webhook payloads and never throws', async () => {
  const calls: Array<{ url: string; body: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    calls.push({ url, body: JSON.parse(init?.body || '{}') });
    return new Response('{"ok":true}', { status: 200 });
  }));
  process.env.TELEGRAM_BOT_TOKEN = 'tg-token';
  process.env.TELEGRAM_CHAT_ID = 'tg-chat';
  process.env.DISCORD_DEPLOY_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/2';
  await notifyUpdate({ ok: true, restartOk: true, steps: [{ label: 'git pull', ok: true }, { label: 'npm run build', ok: true }] });
  expect(calls.length).toBe(2);
  expect(calls[0].url).toContain('api.telegram.org');
  expect(calls[0].body.chat_id).toBe('tg-chat');
  expect(calls[1].url).toContain('api/webhooks');
  expect(calls[1].body.embeds[0].title).toContain('Complete');
  delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID; delete process.env.DISCORD_DEPLOY_WEBHOOK_URL;
  vi.unstubAllGlobals();
});

it('notifyUpdate tolerates missing envs (no fetch, no throw)', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID; delete process.env.DISCORD_DEPLOY_WEBHOOK_URL;
  const spy = vi.fn();
  vi.stubGlobal('fetch', spy);
  await expect(notifyUpdate({ ok: false, restartOk: false, steps: [] })).resolves.toBeUndefined();
  expect(spy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
