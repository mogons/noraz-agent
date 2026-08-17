import http from 'node:http';
import { OpenCatHub } from '../orchestrator/hub.js';
import { globalHealthWatcher } from '../services/health-watcher.js';
import { globalMarketRegimeFilter } from '../services/market-regime.js';
import { globalRiskEngineV2 } from '../orchestrator/risk-engine-v2.js';
import { tradeJournalService } from '../discord/handlers/command-handlers.js';
import { globalStateStore } from '../services/state-store.js';
import { getExecutionMode } from '../config/config.js';
import { AGENT_DOMAINS } from '../orchestrator/agent-registry.js';
import { ToolRegistry } from '../orchestrator/tool-registry.js';

export class OpenCatRESTServer {
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

  public start(hub: OpenCatHub): void {
    this.toolRegistry.attachOrchestrator(hub);

    this.server = http.createServer(async (req, res) => {
      // Set CORS Headers for website integration
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-OpenCat-Api-Key');
      res.setHeader('Content-Type', 'application/json');

      // Handle CORS Preflight
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      // API Key Authentication Guard (if OPENCAT_API_KEY is configured)
      const authKey = process.env.OPENCAT_API_KEY;
      if (authKey && authKey.trim() !== '') {
        const clientKey = req.headers['x-opencat-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
        if (clientKey !== authKey) {
          res.statusCode = 401;
          res.end(JSON.stringify({ success: false, error: 'Unauthorized: Invalid or missing API Key' }));
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

        // 2. GET /api/calls (Signal call cards ledger from StateStore)
        if (req.method === 'GET' && pathname === '/api/calls') {
          const limit = Number(urlObj.searchParams.get('limit')) || 50;
          const domain = urlObj.searchParams.get('domain') || undefined;
          const calls = globalStateStore.getSignalLedger(domain, limit);
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, count: calls.length, calls }));
          return;
        }

        // 3. GET /api/positions (Open positions tracking)
        if (req.method === 'GET' && pathname === '/api/positions') {
          const openTokens = globalStateStore.getAllPositions();
          const openLp = globalStateStore.getAllLpPositions();
          const openNfts = globalStateStore.getAllNftPositions();
          const totalCount = openTokens.length + openLp.length + openNfts.length;
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              summary: {
                totalPositions: totalCount,
                tokensCount: openTokens.length,
                lpCount: openLp.length,
                nftCount: openNfts.length,
              },
              tokens: openTokens,
              lpPositions: openLp,
              nftPositions: openNfts,
              totalCount,
            })
          );
          return;
        }

        // 4. GET /api/executions (Trade Journal summary & recent executions)
        if (req.method === 'GET' && pathname === '/api/executions') {
          const stats = tradeJournalService.getSummaryStats();
          const entries = tradeJournalService.listTrades();
          const recentTrades = entries.slice(0, 20);
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              analytics: stats,
              stats,
              entries,
              recentTrades,
            })
          );
          return;
        }

        // 5. GET /api/alerts (Custom price alerts)
        if (req.method === 'GET' && pathname === '/api/alerts') {
          const alerts = globalStateStore.getAllAlerts();
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, count: alerts.length, alerts }));
          return;
        }

        // 6. POST /api/agents/toggle (Toggle sub-agent active state)
        if (req.method === 'POST' && pathname === '/api/agents/toggle') {
          const body = await parseJsonBody(req);
          const domain = String(body.domain || '').trim().toLowerCase();
          const active = typeof body.active === 'boolean' ? body.active : undefined;

          if (!domain) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, error: 'Missing required parameter "domain"' }));
            return;
          }

          const currentActive = hub.isAgentActive(domain);
          const targetActive = active !== undefined ? active : !currentActive;
          hub.setAgentActive(domain, targetActive);

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              domain,
              active: targetActive,
              message: `Sub-Agent "${domain}" is now ${targetActive ? 'ACTIVE' : 'PAUSED'}.`,
            })
          );
          return;
        }

        // 7. POST /api/command (Execute ToolRegistry command via REST)
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
      console.log(`📡 🐾 OPENCAT AI REST API Server listening on port ${this.port}`);
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
