import http from 'node:http';
import { AthenaHub } from '../orchestrator/hub.js';
import { globalHealthWatcher } from '../services/health-watcher.js';
import { globalMarketRegimeFilter } from '../services/market-regime.js';
import { globalRiskEngineV2 } from '../orchestrator/risk-engine-v2.js';
import { tradeJournalService } from '../discord/handlers/command-handlers.js';
import { globalStateStore } from '../services/state-store.js';
import { getExecutionMode } from '../config/config.js';
import { AGENT_DOMAINS } from '../orchestrator/agent-registry.js';
import { ToolRegistry } from '../orchestrator/tool-registry.js';

export class AthenaRESTServer {
  private server: http.Server | null = null;
  private port: number;
  private toolRegistry = new ToolRegistry();

  constructor(port = 3000) {
    this.port = Number(process.env.API_PORT) || port;
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  public start(hub: AthenaHub): void {
    this.toolRegistry.attachOrchestrator(hub);

    this.server = http.createServer(async (req, res) => {
      // Set CORS Headers for website integration
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Athena-Api-Key');
      res.setHeader('Content-Type', 'application/json');

      // Handle CORS Preflight
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      // API Key Authentication Guard (if ATHENA_API_KEY environment variable is configured)
      const authKey = process.env.ATHENA_API_KEY;
      if (authKey && authKey.trim() !== '') {
        const clientKey = req.headers['x-athena-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
        if (clientKey !== authKey) {
          res.statusCode = 401;
          res.end(JSON.stringify({ success: false, error: 'Unauthorized: Invalid or missing ATHENA_API_KEY' }));
          return;
        }
      }

      const urlObj = new URL(req.url || '/', `http://localhost:${this.port}`);
      const pathname = urlObj.pathname;

      try {
        // 1. GET /health or /api/status (Full system status & setup overview)
        if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/status')) {
          const health = globalHealthWatcher.auditSystemHealth();
          const regime = globalMarketRegimeFilter.getRegime();
          const isKillSwitch = globalRiskEngineV2.checkKillSwitchStatus();

          const subAgents = AGENT_DOMAINS.map((d) => ({
            id: d.id,
            name: d.name,
            channel: d.channel,
            active: hub.isAgentActive(d.id),
            category: d.category,
          }));

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              status: isKillSwitch ? 'KILL_SWITCH_LOCKED' : health.allHealthy ? 'HEALTHY' : 'DEGRADED',
              executionMode: getExecutionMode(),
              primaryVenue: 'Uniswap V3 • Robinhood Chain L2 (#4663)',
              activeDomains: hub.getActiveDomains(),
              subAgents,
              marketRegime: regime,
              connectedApiKeys: {
                opensea: Boolean(process.env.OPENSEA_API_KEY),
                xApiV2: Boolean(process.env.X_API_BEARER_TOKEN),
                llm: Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY),
                gmgn: Boolean(process.env.GMGN_API_KEY),
              },
              subAgentsReport: health.report,
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        // 2. GET /api/calls (Signal call cards across all 4 sub-agents: meme, lp, nft, alpha-robinhood / X)
        if (req.method === 'GET' && pathname === '/api/calls') {
          const domainFilter = urlObj.searchParams.get('domain') || undefined;
          const limitParam = Number(urlObj.searchParams.get('limit')) || 50;
          const ledger = globalStateStore.getSignalLedger(domainFilter, limitParam);

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              totalCalls: ledger.length,
              domainFilter: domainFilter || 'ALL',
              calls: ledger,
            })
          );
          return;
        }

        // 3. GET /api/positions (Active monitored token, LP, and NFT positions)
        if (req.method === 'GET' && pathname === '/api/positions') {
          const openTokens = globalStateStore.getAllPositions();
          const openLp = globalStateStore.getAllLpPositions();
          const openNft = globalStateStore.getAllNftPositions();

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              summary: {
                tokenCount: openTokens.length,
                lpCount: openLp.length,
                nftCount: openNft.length,
              },
              tokens: openTokens,
              lpPositions: openLp,
              nftPositions: openNft,
            })
          );
          return;
        }

        // 4. GET /api/executions (Trade Journal audit trail & analytics summary)
        if (req.method === 'GET' && (pathname === '/api/executions' || pathname === '/api/journal' || pathname === '/api/analytics')) {
          const summary = tradeJournalService.getSummaryStats();
          const allEntries = tradeJournalService.listTrades();

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              analytics: summary,
              entries: allEntries,
            })
          );
          return;
        }

        // 5. GET /api/alerts (Custom price alerts)
        if (req.method === 'GET' && pathname === '/api/alerts') {
          const alerts = globalStateStore.getAllAlerts();
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              totalAlerts: alerts.length,
              alerts,
            })
          );
          return;
        }

        // 6. POST /api/agents/toggle (Enable / Pause sub-agent dynamically from website)
        if (req.method === 'POST' && pathname === '/api/agents/toggle') {
          const body = await parseJsonBody(req);
          const domain = String(body.domain || '').trim().toLowerCase();
          const active = Boolean(body.active);

          if (!domain) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, error: 'Missing required field "domain"' }));
            return;
          }

          hub.setAgentActive(domain, active);
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              domain,
              active: hub.isAgentActive(domain),
              message: `Sub-agent "${domain}" status updated to ${active ? '🟢 ACTIVE' : '🔴 PAUSED'}`,
            })
          );
          return;
        }

        // 7. POST /api/command (Execute ToolRegistry commands from website UI)
        if (req.method === 'POST' && pathname === '/api/command') {
          const body = await parseJsonBody(req);
          const toolName = String(body.command || body.toolName || '').trim();
          const args = body.args || {};

          if (!toolName) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, error: 'Missing required field "command" or "toolName"' }));
            return;
          }

          const result = await this.toolRegistry.executeToolCall(toolName, args);
          res.statusCode = result.success ? 200 : 400;
          res.end(JSON.stringify(result));
          return;
        }

        // 8. 404 Route Not Found
        res.statusCode = 404;
        res.end(JSON.stringify({ success: false, error: `Endpoint "${pathname}" not found.` }));

      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: `Internal Server Error: ${errMsg}` }));
      }
    });

    this.server.listen(this.port, () => {
      console.log(`📡 ATHENA 2.0 REST API Server listening on port ${this.port}`);
    });
  }
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let bodyStr = '';
    req.on('data', (chunk) => {
      bodyStr += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(bodyStr ? JSON.parse(bodyStr) : {});
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}
