import { describe, it, expect } from 'vitest';
import { HealthWatcherService } from '../src/services/health-watcher.js';

describe('HealthWatcherService', () => {
  it('marks an agent responsive after a real heartbeat', () => {
    const hw = new HealthWatcherService();
    hw.recordHeartbeat('meme-robinhood');
    const { report } = hw.auditSystemHealth();
    const agent = report.find((a) => a.domain === 'meme-robinhood');
    expect(agent).toBeDefined();
    expect(agent!.status).toBe('HEALTHY');
  });

  it('normalizes heartbeat domain casing', () => {
    const hw = new HealthWatcherService();
    hw.recordHeartbeat('MEME_ROBINHOOD');
    const { report } = hw.auditSystemHealth();
    const agent = report.find((a) => a.domain === 'meme-robinhood');
    expect(agent).toBeDefined();
    expect(agent!.status).toBe('HEALTHY');
  });
});
