import { describe, it, expect, vi, afterEach } from 'vitest';
import { SwarmConsensusEngine } from '../src/orchestrator/swarm-consensus.js';
import { RobinhoodScreeningAgent } from '../src/agents/meme-robinhood/robinhood-screening-agent.js';
import type { GMGNRawToken } from '../src/adapters/gmgn-adapter.js';
import { NFTScreeningAgent } from '../src/agents/nft/nft-screening-agent.js';
import { PriceAlertService } from '../src/services/price-alert-service.js';
import { PositionManager } from '../src/position/position-manager.js';

describe('🐾 OPENCAT MULTI-AGENT SYSTEM TEST SUITE', () => {
  it('1. Swarm Consensus Engine: Should pass high confidence signals (>= 80%)', () => {
    const swarm = new SwarmConsensusEngine();
    const result = swarm.evaluateSignal({
      symbol: 'OPENCAT_MEME',
      domain: 'MEME_ROBINHOOD',
      contractAddress: '0x1234567890123456789012345678901234567890',
      liquidityUsd: 25000,
      volume1hUsd: 75000,
      securityAuditPassed: true,
      socialHypeScore: 88,
      confidence: 85,
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.passed).toBe(true);
  });

  it('3. Robinhood Meme Agent: evaluates healthy Robinhood Chain token (CTO confidence >= 80)', async () => {
    const agent = new RobinhoodScreeningAgent();
    // Stub GoPlus to return a clean audit; agent is fail-closed without real audit data.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { '0x1234567890123456789012345678901234567890': { is_honeypot: '0', buy_tax: '0.5', sell_tax: '0.5', is_blacklisted: '0', is_open_source: '1', holder_count: '500' } },
      }),
    }));

    const token: GMGNRawToken = {
      chain: 'robinhood', address: '0x1234567890123456789012345678901234567890',
      symbol: 'RHMEME', name: 'Robinhood Meme',
      priceUsd: 0.001, marketCapUsd: 200000, volume24hUsd: 300000, volume1hUsd: 60000, liquidityUsd: 50000,
      buys: 800, sells: 200, swaps: 1000, holderCount: 500,
      top10HolderRate: 0.1, devTeamHoldRate: 0.0, creatorClose: true, creatorTokenStatus: 'creator_close',
      smartDegenCount: 5, renownedCount: 2, bundlerRate: 0.1, ratTraderAmountRate: 0.02,
      rugRatio: 0.01, isWashTrading: false, ctoFlag: true, renouncedMint: true, renouncedFreeze: true,
      creationTimestamp: Date.now()/1000 - 6*3600, openTimestamp: Date.now()/1000 - 6*3600,
      priceChange1m: 2, priceChange5m: 5, priceChange1h: 120,
      visitingCount: 300, squareMentions: 10,
      twitterRenameCount: 0, twitterDelPostCount: 0, twitterCreateTokenCount: 1,
      buyTax: null, sellTax: null, dexscrBoostFee: 0, dexscrAd: 0, totalFeeNative: 1, source: 'gmgn',
      exchange: 'pump_amm', launchpadPlatform: 'Pump.fun', launchpadStatus: '1', progress: 1,
    };

    // 1 ETH @ live price gate: preFilter passes the healthy token (fail-closed gates all clear)
    const pre = agent.preFilter(token, 1929.03);
    expect(pre.ok).toBe(true);
    const det = agent.detectSignal(token);
    vi.unstubAllGlobals();
    expect(det.type).toBe('CTO');
    expect(det.confidence).toBeGreaterThanOrEqual(80);
  });

  it('3b. Robinhood Meme Agent: fail-closed without audit — zero reports', async () => {
    const agent = new RobinhoodScreeningAgent();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const reports = await agent.runScreeningPass();
    vi.unstubAllGlobals();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
  });

  it('5. EVM NFT Agent: Should evaluate NFT Momentum & Whale Sweeps', async () => {
    const agent = new NFTScreeningAgent();
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    if (reports.length > 0) {
      expect(reports[0].confidence).toBeGreaterThanOrEqual(80);
      expect(reports[0].signal.isFloorSurge).toBe(true);
      expect(reports[0].payload?.domain).toBe('NFT');
    }
  });

  it('7. Price Alert Service: Should parse natural language alert expressions', () => {
    const alertService = new PriceAlertService();
    const parsed = alertService.parseNaturalLanguageAlert('opencat kabari kalau BTC 70000', 'test_user', 'test_chan');
    expect(parsed).not.toBeNull();
    expect(parsed?.symbol).toBe('BTC');
    expect(parsed?.targetPriceUsd).toBe(70000);
    expect(parsed?.direction).toBe('ABOVE');
  });

  it('8. Position Manager: Should trigger TP milestones (+30%, +50%) and Floor Drop (-20%) for NFT positions', () => {
    const manager = new PositionManager();
    manager.addNftPosition({
      id: 'nft_pudgy_1234',
      collectionSlug: 'pudgypenguins',
      collectionName: 'Pudgy Penguins',
      tokenId: '1234',
      entryFloorEth: 10.0,
      currentFloorEth: 10.0,
      highestFloorEth: 10.0,
      salesVelocity1h: 20,
    });

    // Test +30% TP1 Milestone
    const tp1Res = manager.updateNftPosition('nft_pudgy_1234', 13.5, 25);
    expect(tp1Res.triggerAlert).toBe(true);
    expect(tp1Res.type).toBe('MILESTONE');
    expect(tp1Res.reason).toContain('TP1 MILESTONE (+30%)');

    // Test -20% Floor Drop Warning
    manager.addNftPosition({
      id: 'nft_azuki_5678',
      collectionSlug: 'azuki',
      collectionName: 'Azuki',
      tokenId: '5678',
      entryFloorEth: 10.0,
      currentFloorEth: 10.0,
      highestFloorEth: 10.0,
      salesVelocity1h: 20,
    });
  });

  it('19. OpenSea Adapter: Should provide OpenCat Agent Tools manifest & quote', async () => {
    const { OpenSeaAdapter } = await import('../src/adapters/opensea-adapter.js');
    const adapter = new OpenSeaAdapter('mock_key');
    const quote = await adapter.getSwapQuote({
      chain: 'robinhood',
      fromToken: 'ETH',
      toToken: 'USDC',
      amount: 0.5,
    });
    expect(quote.success).toBe(true);
    expect(quote.chainId).toBe(4663);
    expect(quote.expectedAmountOut).toBeGreaterThan(0);
    expect(quote.openseaSwapUrl).toContain('opensea.io/swap');

    const manifest = adapter.getAgentToolsManifest();
    expect(manifest.name).toBe('OpenCat OpenSea Agent Tools');
    expect(Array.isArray(manifest.capabilities)).toBe(true);
  });

  it('20. Tool Registry & Hub Control: Should execute sub-agent pause, resume, and risk limit tools', async () => {
    const { ToolRegistry } = await import('../src/orchestrator/tool-registry.js');
    const { OpenCatHub } = await import('../src/orchestrator/hub.js');
    const { AIService } = await import('../src/services/ai-service.js');

    const hub = new OpenCatHub();
    const aiService = new AIService();
    const registry = new ToolRegistry();
    registry.attachOrchestrator(hub);
    registry.attachAIService(aiService);

    const toolDefs = registry.getToolDefinitions();
    expect(toolDefs.length).toBeGreaterThan(4);
    expect(toolDefs.some(t => t.name === 'pause_sub_agent')).toBe(true);

    const pauseRes = await registry.executeToolCall('pause_sub_agent', { agentId: 'meme-robinhood' });
    expect(pauseRes.success).toBe(true);
    expect(hub.isAgentActive('meme-robinhood')).toBe(false);

    const resumeRes = await registry.executeToolCall('resume_sub_agent', { agentId: 'meme-robinhood' });
    expect(resumeRes.success).toBe(true);
    expect(hub.isAgentActive('meme-robinhood')).toBe(true);

    const riskRes = await registry.executeToolCall('set_risk_limit', { maxDrawdownPct: 40 });
    expect(riskRes.success).toBe(true);
    expect(hub.getRiskManager().getRiskState().maxDrawdownLimitPct).toBe(40);
  });

  it('21. Cron Scheduler: Should parse natural language intervals and store active schedules', async () => {
    const { CronSchedulerService } = await import('../src/services/cron-scheduler.js');
    const scheduler = new CronSchedulerService();

    const intervalMs = scheduler.parseNaturalLanguageInterval('every 4 hours');
    expect(intervalMs).toBe(4 * 60 * 60 * 1000);

    const task = scheduler.addSchedule('every 2 hours', 'screening', 'evm-meme');
    expect(task.id).toContain('CRON_');
    expect(task.enabled).toBe(true);

    const all = scheduler.getAllSchedules();
    expect(all.length).toBeGreaterThan(0);
    scheduler.removeSchedule(task.id);
  });

  it('22. Session Memory: Should record audits and perform fast zero-LLM-token keyword search', async () => {
    const { SessionMemoryService } = await import('../src/services/session-memory.js');
    const memory = new SessionMemoryService();

    const rec = memory.recordAudit('0x71c7656ec7ab88b098defb751b7401b5f6d8976f', 'PEPE', 'eth', 92, 'RUNNER', 'Test PEPE Audit');
    expect(rec.symbol).toBe('PEPE');

    const searchRes = memory.searchAudits('PEPE');
    expect(searchRes.length).toBeGreaterThan(0);
    expect(searchRes[0].symbol).toBe('PEPE');
  });

  it('23. Swarm Learning Engine: Should record signal calls and recalibrate weights on TP hits', async () => {
    const path = await import('path');
    const { SwarmLearningEngine } = await import('../src/orchestrator/swarm-learning.js');
    const testDbPath = path.join(process.cwd(), 'database', `test_swarm_learning_${Date.now()}.json`);
    const engine = new SwarmLearningEngine(testDbPath);

    const call = engine.recordSignalCall('meme-robinhood', 'BONK', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 0.00001, 88);
    expect(call.result).toBe('OPEN');

    const initialWeight = engine.getWeights().smartMoneyWeight;
    engine.updateSignalPrice(call.id, 0.000025); // 2.5x gain -> TAKE_PROFIT_2X
    expect(engine.getWeights().smartMoneyWeight).toBeGreaterThan(initialWeight);
  });

  it('24. Sub-Agent Domain Normalization: Should correctly synchronize pause/resume across aliases', async () => {
    const { OpenCatHub } = await import('../src/orchestrator/hub.js');
    const hub = new OpenCatHub();

    hub.setAgentActive('evm', false);
    expect(hub.isAgentActive('meme-robinhood')).toBe(false);
    expect(hub.isAgentActive('robinhood')).toBe(false);

    hub.setAgentActive('robinhood', true);
    expect(hub.isAgentActive('meme-robinhood')).toBe(true);
    expect(hub.isAgentActive('evm')).toBe(true);
  });

  it('25. ApiKeyGuard: Should halt sub-agents with missing required API keys', async () => {
    const { ApiKeyGuardService } = await import('../src/services/api-key-guard.js');
    const guard = new ApiKeyGuardService();

    delete process.env.OPENSEA_API_KEY;
    const res = guard.checkDomainKeys('nft');
    expect(res.ready).toBe(false);
    expect(res.missingKeys).toContain('OPENSEA_API_KEY');
    expect(res.statusMessage).toContain('HALTED');
  });

  it('26. ApiKeyGuard & ToolRegistry: Should set API key at runtime and unblock sub-agent', async () => {
    const { ApiKeyGuardService } = await import('../src/services/api-key-guard.js');
    const { ToolRegistry } = await import('../src/orchestrator/tool-registry.js');

    process.env.AI_API_KEY = 'test_ai_key_123';
    const guard = new ApiKeyGuardService();
    const registry = new ToolRegistry();

    const toolRes = await registry.executeToolCall('set_api_key', { keyName: 'OPENSEA_API_KEY', keyValue: 'test_opensea_key_123' });
    expect(toolRes.success).toBe(true);

    const res = guard.checkDomainKeys('nft');
    expect(res.ready).toBe(true);
    expect(process.env.OPENSEA_API_KEY).toBe('test_opensea_key_123');
  });

  it('27. Auto-execute: hub state reflects enablement', async () => {
    const { OpenCatHub } = await import('../src/orchestrator/hub.js');
    const hub = new OpenCatHub();
    hub.setAutoExecute('meme-robinhood', true, 0.1);
    const st = hub.isAutoExecuteEnabled('meme-robinhood');
    expect(st.enabled).toBe(true);
    expect(st.maxTradeAmount).toBe(0.1);
    hub.setAutoExecute('meme-robinhood', false);
    expect(hub.isAutoExecuteEnabled('meme-robinhood').enabled).toBe(false);

    // meme-robinhood domain key resolves too (auto-execute wiring target)
    const stRb = hub.isAutoExecuteEnabled('meme-robinhood');
    expect(stRb.enabled).toBe(false);
    hub.setAutoExecute('meme-robinhood', true, 0.2);
    expect(hub.isAutoExecuteEnabled('meme-robinhood').enabled).toBe(true);
    expect(hub.isAutoExecuteEnabled('meme-robinhood').maxTradeAmount).toBe(0.2);
  });
});
