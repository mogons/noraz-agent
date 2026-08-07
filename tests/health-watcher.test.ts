import { describe, it, expect } from 'vitest';
import { HealthWatcherService } from '../src/services/health-watcher.js';

describe('HealthWatcherService', () => {
  it('marks an agent responsive after a real heartbeat', () => {
    const hw = new HealthWatcherService();
    hw.recordHeartbeat('meme-solana');
    const { report } = hw.auditSystemHealth();
    const sol = report.find((a) => a.domain === 'meme-solana');
    expect(sol).toBeDefined();
    expect(sol!.status).toBe('HEALTHY');
  });

  it('normalizes heartbeat domain casing', () => {
    const hw = new HealthWatcherService();
    hw.recordHeartbeat('MEME_SOLANA');
    const { report } = hw.auditSystemHealth();
    const sol = report.find((a) => a.domain === 'meme-solana');
    expect(sol).toBeDefined();
    expect(sol!.status).toBe('HEALTHY');
  });
});
