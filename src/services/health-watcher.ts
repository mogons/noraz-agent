/**
 * Opencatz AI - System Health Monitoring & Incident Watcher (HealthWatcherService)
 * Tracks sub-agent heartbeats, detects silent failures, and triggers alerts/auto-restart notifications.
 */

export interface AgentHeartbeat {
  domain: string;
  lastPingAt: number;
  status: 'HEALTHY' | 'DEGRADED' | 'UNRESPONSIVE';
  errorCount: number;
}

export class HealthWatcherService {
  private agentMap: Map<string, AgentHeartbeat> = new Map();
  private checkIntervalMs = 60000; // 60 seconds

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents() {
    const subAgents = ['meme-robinhood', 'lp-robinhood', 'nft'];
    subAgents.forEach((domain) => {
      this.agentMap.set(domain, {
        domain,
        lastPingAt: Date.now(),
        status: 'HEALTHY',
        errorCount: 0,
      });
    });
  }

  /**
   * Sub-agents register a heartbeat ping
   */
  public recordHeartbeat(domain: string, isError = false): void {
    const key = domain.toLowerCase();
    const current = this.agentMap.get(key) || {
      domain: key,
      lastPingAt: Date.now(),
      status: 'HEALTHY',
      errorCount: 0,
    };

    current.lastPingAt = Date.now();
    if (isError) {
      current.errorCount++;
      if (current.errorCount >= 3) {
        current.status = 'DEGRADED';
      }
    } else {
      current.errorCount = 0;
      current.status = 'HEALTHY';
    }

    this.agentMap.set(key, current);
  }

  /**
   * Audit all registered agents for unresponsiveness (> 3 minutes without ping)
   */
  public auditSystemHealth(): { allHealthy: boolean; report: AgentHeartbeat[] } {
    const now = Date.now();
    const maxTimeoutMs = 6 * 60 * 1000; // 6 minutes (above the 5-minute screening loop interval)
    let allHealthy = true;
    const report: AgentHeartbeat[] = [];

    this.agentMap.forEach((agent) => {
      if (now - agent.lastPingAt > maxTimeoutMs) {
        agent.status = 'UNRESPONSIVE';
        allHealthy = false;
        console.warn(`🚨 🐾 OPENCATZ HEALTH WATCHER: Agent [${agent.domain}] is UNRESPONSIVE! Last ping: ${Math.round((now - agent.lastPingAt) / 1000)}s ago.`);
      }
      report.push({ ...agent });
    });

    return { allHealthy, report };
  }
}

export const globalHealthWatcher = new HealthWatcherService();
