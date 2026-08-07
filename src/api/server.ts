import http from 'http';
import { AthenaHub } from '../orchestrator/hub.js';
import { globalHealthWatcher } from '../services/health-watcher.js';
import { globalMarketRegimeFilter } from '../services/market-regime.js';
import { globalRiskEngineV2 } from '../orchestrator/risk-engine-v2.js';
import { tradeJournalService } from '../discord/handlers/command-handlers.js';

export class AthenaRESTServer {
  private server: http.Server | null = null;
  private port: number;

  constructor(port = 3000) {
    this.port = Number(process.env.API_PORT) || port;
  }

  public start(hub: AthenaHub): void {
    this.server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/health' || req.url === '/api/status') {
        const health = globalHealthWatcher.auditSystemHealth();
        const regime = globalMarketRegimeFilter.getRegime();
        const isKillSwitch = globalRiskEngineV2.checkKillSwitchStatus();

        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: isKillSwitch ? 'KILL_SWITCH_LOCKED' : health.allHealthy ? 'HEALTHY' : 'DEGRADED',
            activeDomains: hub.getActiveDomains(),
            marketRegime: regime,
            subAgentsReport: health.report,
            timestamp: new Date().toISOString(),
          })
        );
      } else if (req.url === '/api/analytics') {
        const summary = tradeJournalService.getSummaryStats();
        res.statusCode = 200;
        res.end(JSON.stringify(summary));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    });

    this.server.listen(this.port, () => {
      console.log(`📡 ATHENA 2.0 REST API Server listening on port ${this.port}`);
    });
  }
}
