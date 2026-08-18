import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOpenCatzUpdate, runOpenCatUpdate, runUpdate } from '../scripts/update-core.mjs';

const mockExecSync = vi.fn();
const mockSpawn = vi.fn(() => ({ unref: vi.fn(), on: vi.fn() }));
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

describe('runOpenCatzUpdate', () => {
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
    const result = await runOpenCatzUpdate({ cwd: '/repo' });

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
    expect(args[1]).toContain('pm2 restart opencatz-agent');
    expect(result.ok).toBe(true);
    expect(result.restartOk).toBe(true);
  });

  it('skips stash when the worktree is clean', async () => {
    mockExecSync.mockImplementationOnce(() => ''); // clean
    const result = await runOpenCatUpdate({ cwd: '/repo' });

    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toBe('git status --porcelain');
    expect(calls.some((c) => c.includes('git stash push'))).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('skips pm2 restart when noRestart is set', async () => {
    const result = await runOpenCatUpdate({ cwd: '/repo', noRestart: true });
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('reports ok=false and continues when npm install fails', async () => {
    mockExecSync
      .mockImplementationOnce(() => '') // clean
      .mockImplementationOnce(() => '') // pull
      .mockImplementationOnce(() => {
        const err = new Error('install failed') as any;
        err.status = 1;
        throw err;
      });

    const result = await runOpenCatUpdate({ cwd: '/repo' });
    expect(result.ok).toBe(false);
    const step = result.log.find((s) => s.label === 'npm install');
    expect(step?.ok).toBe(false);
  });

  it('maintains runUpdate alias', async () => {
    mockExecSync.mockImplementationOnce(() => '');
    const result = await runUpdate({ cwd: '/repo', noRestart: true });
    expect(result.ok).toBe(true);
  });
});
