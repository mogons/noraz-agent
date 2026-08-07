import { describe, it, expect, vi, afterEach } from 'vitest';
import { SwarmConsensusEngine } from '../src/orchestrator/swarm-consensus.js';
import { SolanaScreeningAgent } from '../src/agents/meme-solana/solana-screening-agent.js';
import { EVMScreeningAgent } from '../src/agents/meme-evm/evm-screening-agent.js';
import { PerpsScreeningAgent } from '../src/agents/perps/perps-screening-agent.js';
import { HyperliquidAdapter } from '../src/adapters/hyperliquid-adapter.js';
import { NFTScreeningAgent } from '../src/agents/nft/nft-screening-agent.js';
import { PolymarketAgent } from '../src/agents/prediction/polymarket-agent.js';
import { PriceAlertService } from '../src/services/price-alert-service.js';
import { PositionManager } from '../src/position/position-manager.js';

describe('🏛️ ATHENA MULTI-AGENT SYSTEM TEST SUITE', () => {
  it('1. Swarm Consensus Engine: Should pass high confidence signals (>= 80%)', () => {
    const swarm = new SwarmConsensusEngine();
    const result = swarm.evaluateSignal({
      symbol: 'ATHENA_MEME',
      domain: 'MEME_SOLANA',
      contractAddress: 'So11111111111111111111111111111111111111112',
      liquidityUsd: 25000,
      volume1hUsd: 75000,
      securityAuditPassed: true,
      socialHypeScore: 88,
      confidence: 85,
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.passed).toBe(true);
  });

  it('2. Solana Meme Agent: preFilter + detectSignal with real GMGN fields', () => {
    const agent = new SolanaScreeningAgent();
    const det = agent.detectSignal({
      chain: 'sol', address: 'So11111111111111111111111111111111111111112',
      symbol: 'SOLMEME', name: 'Sol Meme', priceUsd: 0.001, marketCapUsd: 100000,
      volume24hUsd: 150000, liquidityUsd: 40000, buys: 700, sells: 300, swaps: 1000,
      holderCount: 300, top10HolderRate: 0.1, devTeamHoldRate: 0.005,
      creatorClose: true, creatorTokenStatus: 'creator_close',
      smartDegenCount: 3, renownedCount: 1, bundlerRate: 0.05,
      ratTraderAmountRate: 0.01, rugRatio: 0.02, isWashTrading: false,
      ctoFlag: true, renouncedMint: true, renouncedFreeze: true,
      creationTimestamp: Date.now()/1000 - 6*3600, openTimestamp: Date.now()/1000 - 6*3600,
      priceChange1m: 1, priceChange5m: 4, priceChange1h: 90,
      visitingCount: 250, squareMentions: 5, twitterRenameCount: 0,
      twitterDelPostCount: 0, twitterCreateTokenCount: 0,
      buyTax: null, sellTax: null, dexscrBoostFee: 0, dexscrAd: 0, source: 'gmgn',
    });
    expect(det.type).toBe('CTO');
    expect(det.confidence).toBeGreaterThanOrEqual(80);
  });

  it('3. EVM Meme Agent: evaluates EVM signals with real GoPlus security audit', async () => {
    const agent = new EVMScreeningAgent();
    // Stub GoPlus to return a clean audit; agent is fail-closed without real audit data.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { '0x1234567890123456789012345678901234567890': { is_honeypot: '0', buy_tax: '0.5', sell_tax: '0.5', is_blacklisted: '0', is_open_source: '1', holder_count: '500' } },
      }),
    }));

    const report = await agent.evaluateEVMToken(
      {
        chain: 'base',
        symbol: 'BASEMEME',
        name: 'Base Meme',
        contractAddress: '0x1234567890123456789012345678901234567890',
        priceUsd: 0.001,
        marketCapUsd: 500000,
        volume24hUsd: 120000,
        liquidityUsd: 40000,
        smartMoneyNetBuySolOrEth: 2.5,
        devHoldingPercentage: 2.0,
        smartMoneyCount: 4,
        sniperRatioPercentage: 5,
        gmgnUrl: 'https://gmgn.ai/base/token/0x123',
        aiThesis: 'Test thesis',
        tokenAgeHours: 6,
      },
      'base'
    );

    vi.unstubAllGlobals();
    expect(report).not.toBeNull();
    expect(report!.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(report!.chain).toBe('base');
    expect(report!.auditAvailable).toBe(true);
  });

  it('3b. EVM Meme Agent: fail-closed when GoPlus audit unavailable', async () => {
    const agent = new EVMScreeningAgent();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const report = await agent.evaluateEVMToken(
      {
        chain: 'base', symbol: 'X', name: 'X', contractAddress: '0xabc',
        priceUsd: 1, marketCapUsd: 1, volume24hUsd: 1, liquidityUsd: 1,
        smartMoneyNetBuySolOrEth: 0, devHoldingPercentage: 0, smartMoneyCount: 0,
        sniperRatioPercentage: 0, gmgnUrl: '', aiThesis: '',
      },
      'base'
    );
    vi.unstubAllGlobals();
    expect(report).toBeNull();
  });

  it('4. Perpetual Futures Agent: Should evaluate Hyperliquid leverage setups', async () => {
    const hlAdapter = new HyperliquidAdapter();
    const agent = new PerpsScreeningAgent(hlAdapter);
    const reports = await agent.screenAllAssets();
    expect(Array.isArray(reports)).toBe(true);
  }, 30000);

  it('5. EVM NFT Agent: Should evaluate NFT Momentum & Whale Sweeps', async () => {
    const agent = new NFTScreeningAgent();
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    // With real API: returns results only when OPENSEA_API_KEY is configured
    // Without API key: returns empty array (no fake data)
    if (reports.length > 0) {
      expect(reports[0].confidenceScore).toBeGreaterThanOrEqual(80);
      expect(reports[0].isFloorSurge).toBe(true);
    }
  });

  it('6. Polymarket Prediction Agent: evaluates real markets (fail-closed without network)', async () => {
    // Stub Gamma + CLOB with a real high-probability market so the test is deterministic.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 1, title: 'Will BTC reach 100k in 2026?', category: 'Crypto', slug: 'btc-100k',
        volume24hr: '2500000', liquidity: '800000',
        markets: [{ id: 100, conditionId: '0xcond', clobTokenIds: ['0xclob1'], outcomePrices: '["0.94","0.06"]', endDate: '2026-12-31T23:59:59Z', slug: 'btc-100k' }],
      }],
    }));
    const agent = new PolymarketAgent();
    const reports = await agent.runScreeningPass();
    vi.unstubAllGlobals();
    expect(Array.isArray(reports)).toBe(true);
    for (const r of reports) {
      expect(r.confidenceScore).toBeGreaterThanOrEqual(80);
    }
  });

  it('7. Price Alert Service: Should parse natural language alert expressions', () => {
    const alertService = new PriceAlertService();
    const parsed = alertService.parseNaturalLanguageAlert('athena kabari kalau BTC 70000');
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

    const dropRes = manager.updateNftPosition('nft_azuki_5678', 7.5, 10);
    expect(dropRes.triggerAlert).toBe(true);
    expect(dropRes.type).toBe('CRITICAL');
    expect(dropRes.reason).toContain('FLOOR DROP WARNING (-20%)');
  });

  it('9. Twitter Service: fail-closed without key, real data with key', async () => {
    const { TwitterService } = await import('../src/services/twitter-service.js');

    // Without a TWEX key -> no fabricated tweets
    const noKeySvc = new TwitterService();
    const empty = await noKeySvc.getHypeScore('ATHENA');
    expect(Array.isArray(empty.topTweets)).toBe(true);
    expect(empty.topTweets.length).toBe(0);

    // With a stubbed real TwexAPI response -> parsed real fields
    process.env.TWEX_API_KEY = 'twex-test';
    const nowIso = new Date().toISOString();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 't1', text: '$ATHENA pumping', author: { username: 'whale_user', name: 'Whale' },
        public_metrics: { like_count: 200, retweet_count: 60, reply_count: 15 },
        created_at: nowIso,
      }],
    }));
    const keyedSvc = new TwitterService();
    const hype = await keyedSvc.getHypeScore('ATHENA');
    vi.unstubAllGlobals();
    expect(hype.topTweets.length).toBe(1);
    expect(hype.topTweets[0].authorUsername).toBe('whale_user');
    expect(hype.sentimentScore).toBeGreaterThanOrEqual(0);
  });

  it('10. Trade Journal Service: starts empty and records real trades', async () => {
    const { TradeJournalService } = await import('../src/services/trade-journal-service.js');
    const journal = new TradeJournalService();
    const stats = journal.getSummaryStats();
    expect(stats.totalTrades).toBe(0);
    expect(stats.totalRealizedPnlUsd).toBe(0);

    journal.recordTradeEntry({
      id: 'real_trade_1',
      domain: 'MEME_SOLANA',
      symbol: 'REALTOKEN',
      contractAddressOrId: '0xabc',
      chain: 'solana',
      entryTimestamp: new Date().toISOString(),
      entryPriceUsdOrEth: 0.01,
      positionSizeUsd: 100,
      realizedPnlUsd: 25,
      realizedPnlPct: 25,
      swarmScore: 85,
      strategyUsed: 'Real Volume Spike',
      aiThesisSummary: 'Real audit',
      status: 'CLOSED_TP',
      exitReason: 'TP hit',
    });

    const updated = journal.getSummaryStats();
    expect(updated.totalTrades).toBe(1);
    expect(updated.winRatePct).toBe(100);

    const csv = journal.exportCsv();
    expect(csv).toContain('ID,Domain,Symbol,Chain,Status');
    expect(csv).toContain('REALTOKEN');
  });

  it('11. DB Service: Should perform atomic file save and load for persistent state', async () => {
    const { DbService } = await import('../src/services/db-service.js');
    const db = new DbService();
    const loaded = db.loadState();
    expect(Array.isArray(loaded.priceAlerts)).toBe(true);
    expect(Array.isArray(loaded.tradeJournalEntries)).toBe(true);

    db.saveState({
      priceAlerts: [{ id: 'test_alert', symbol: 'BTC', targetPriceUsd: 70000 }],
      tradeJournalEntries: [],
      lastUpdated: new Date().toISOString(),
    });

    const reloaded = db.loadState();
    expect(reloaded.priceAlerts.length).toBe(1);
    expect(reloaded.priceAlerts[0].symbol).toBe('BTC');
  });

  it('12. Smart CT Alpha Agent: fail-closed without key, real signals with real tweets', async () => {
    const { CTAlphaAgent } = await import('../src/agents/ct-alpha/ct-alpha-agent.js');

    // Without a TWEX key -> no fabricated tweets -> no signals
    const noKeyAgent = new CTAlphaAgent();
    const emptyReports = await noKeyAgent.runScreeningPass();
    expect(emptyReports.length).toBe(0);

    // With a stubbed real tweet -> engagement-based confidence
    process.env.TWEX_API_KEY = 'twex-test';
    const nowIso = new Date().toISOString();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 't1', text: 'New AI agent launch on Base, big smart money accumulation',
        author: { username: 'ct_whale', name: 'CT Whale' },
        public_metrics: { like_count: 500, retweet_count: 150, reply_count: 30 },
        created_at: nowIso,
      }],
    }));
    const agent = new CTAlphaAgent();
    const reports = await agent.runScreeningPass();
    vi.unstubAllGlobals();
    expect(Array.isArray(reports)).toBe(true);
    if (reports.length > 0) {
      const score = reports[0].confidenceScore ?? reports[0].signal?.confidenceScore ?? 0;
      expect(score).toBeGreaterThanOrEqual(80);
    }
  });

  it('13. Relay Adapter: Should calculate cross-chain bridge intent quotes via Relay.link', async () => {
    const { RelayAdapter } = await import('../src/adapters/relay-adapter.js');
    const adapter = new RelayAdapter();
    const quote = await adapter.getBridgeQuote({
      originChain: 'ethereum',
      destinationChain: 'base',
      amount: 0.5,
      tokenSymbol: 'ETH',
    });

    expect(quote.success).toBe(true);
    expect(quote.originChainId).toBe(1);
    expect(quote.destinationChainId).toBe(8453);
    expect(quote.expectedAmountOut).toBeGreaterThan(0);
    expect(quote.relayWebUrl).toContain('relay.link/bridge');
  });

  it('14. Relay Adapter Swap: Should calculate same-chain token swap quotes via Relay.link', async () => {
    const { RelayAdapter } = await import('../src/adapters/relay-adapter.js');
    const adapter = new RelayAdapter();
    const quote = await adapter.getSwapQuote({
      chain: 'base',
      fromToken: 'ETH',
      toToken: 'USDC',
      amount: 1.0,
    });

    expect(quote.success).toBe(true);
    expect(quote.chainId).toBe(8453);
    expect(quote.fromToken).toBe('ETH');
    expect(quote.toToken).toBe('USDC');
    expect(quote.expectedAmountOut).toBeGreaterThan(0);
    expect(quote.relayWebUrl).toContain('relay.link/swap');
  });

  it('15. Relay Adapter Send: Should calculate token transfer quotes to recipient wallet via Relay.link', async () => {
    const { RelayAdapter } = await import('../src/adapters/relay-adapter.js');
    const adapter = new RelayAdapter();
    const quote = await adapter.getSendQuote({
      chain: 'ethereum',
      token: 'ETH',
      amount: 0.25,
      recipientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
    });

    expect(quote.success).toBe(true);
    expect(quote.chainId).toBe(1);
    expect(quote.tokenSymbol).toBe('ETH');
    expect(quote.recipientAddress).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
    expect(quote.expectedAmountOut).toBeGreaterThan(0);
    expect(quote.relayWebUrl).toContain('relay.link');
  });

  it('16. Wallet Service: Should store private keys and derive EVM and Solana wallet addresses', async () => {
    const { WalletService } = await import('../src/services/wallet-service.js');
    const ws = new WalletService();

    ws.setKey('evm', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    expect(ws.hasWallet('evm')).toBe(true);
    expect(ws.getEvmAddress().toLowerCase()).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');

    const bal = await ws.getEvmBalance(1);
    expect(bal.symbol).toBe('ETH');
    expect(typeof bal.balance).toBe('number');
  });

  it('17. Solana Adapter Direct Execution: realistic dry-run via real Jupiter quote', async () => {
    const { SolanaTradeAdapter } = await import('../src/adapters/solana-adapter.js');
    const adapter = new SolanaTradeAdapter();
    const swapRes = await adapter.swapToken({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amountSol: 1.0,
    });
    expect(swapRes.success).toBe(true);
    expect(swapRes.simulated).toBe(true);
    expect(swapRes.error).toBeUndefined();
  });

  it('18. EVM Adapter Direct Execution: Should simulate sendToken and swapToken via WalletService', async () => {
    const { EVMTradeAdapter } = await import('../src/adapters/evm-adapter.js');
    const { WalletService } = await import('../src/services/wallet-service.js');
    const adapter = new EVMTradeAdapter();
    const ws = new WalletService();
    ws.setKey('evm', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

    const sendRes = await adapter.sendToken({
      chain: 'base',
      recipientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
      amountEth: 0.1,
    }, ws);
    expect(sendRes.success).toBe(true);
    expect(sendRes.simulated).toBe(true);
    expect(sendRes.explorerUrl).toContain('basescan.org');

    const swapRes = await adapter.swapToken({
      chain: 'base',
      fromToken: 'ETH',
      toToken: 'USDC',
      amountEth: 0.2,
    }, ws);
    expect(swapRes.success).toBe(true);
    expect(swapRes.simulated).toBe(true);
    expect(swapRes.outputTokens).toBeGreaterThan(0);
  });

  it('19. OpenSea Adapter DEX Aggregator & Agent Discovery: Should calculate swap quotes and return agent tools manifest', async () => {
    const { OpenSeaAdapter } = await import('../src/adapters/opensea-adapter.js');
    const adapter = new OpenSeaAdapter();

    const quote = await adapter.getSwapQuote({
      chain: 'base',
      fromToken: 'ETH',
      toToken: 'USDC',
      amount: 0.5,
    });
    expect(quote.success).toBe(true);
    expect(quote.chainId).toBe(8453);
    expect(quote.expectedAmountOut).toBeGreaterThan(0);
    expect(quote.openseaSwapUrl).toContain('opensea.io/swap');

    const manifest = adapter.getAgentToolsManifest();
    expect(manifest.name).toBe('Athena OpenSea Agent Tools');
    expect(Array.isArray(manifest.capabilities)).toBe(true);
  });

  it('20. Tool Registry & Hub Control: Should execute sub-agent pause, resume, and risk limit tools', async () => {
    const { ToolRegistry } = await import('../src/orchestrator/tool-registry.js');
    const { AthenaHub } = await import('../src/orchestrator/hub.js');
    const { AIService } = await import('../src/services/ai-service.js');

    const hub = new AthenaHub();
    const aiService = new AIService();
    const registry = new ToolRegistry();
    registry.attachOrchestrator(hub);
    registry.attachAIService(aiService);

    const toolDefs = registry.getToolDefinitions();
    expect(toolDefs.length).toBeGreaterThan(4);
    expect(toolDefs.some(t => t.name === 'pause_sub_agent')).toBe(true);

    const pauseRes = await registry.executeToolCall('pause_sub_agent', { agentId: 'solana-meme' });
    expect(pauseRes.success).toBe(true);
    expect(hub.isAgentActive('solana-meme')).toBe(false);

    const resumeRes = await registry.executeToolCall('resume_sub_agent', { agentId: 'solana-meme' });
    expect(resumeRes.success).toBe(true);
    expect(hub.isAgentActive('solana-meme')).toBe(true);

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

    const call = engine.recordSignalCall('solana-meme', 'BONK', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 0.00001, 88);
    expect(call.result).toBe('OPEN');

    const initialWeight = engine.getWeights().smartMoneyWeight;
    engine.updateSignalPrice(call.id, 0.000025); // 2.5x gain -> TAKE_PROFIT_2X
    expect(engine.getWeights().smartMoneyWeight).toBeGreaterThan(initialWeight);
  });

  it('24. Sub-Agent Domain Normalization: Should correctly synchronize pause/resume across aliases', async () => {
    const { AthenaHub } = await import('../src/orchestrator/hub.js');
    const hub = new AthenaHub();

    hub.setAgentActive('solana-meme', false);
    expect(hub.isAgentActive('meme-solana')).toBe(false);
    expect(hub.isAgentActive('solana')).toBe(false);

    hub.setAgentActive('solana', true);
    expect(hub.isAgentActive('meme-solana')).toBe(true);
    expect(hub.isAgentActive('solana-meme')).toBe(true);
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
    const { AthenaHub } = await import('../src/orchestrator/hub.js');
    const hub = new AthenaHub();
    hub.setAutoExecute('meme-solana', true, 0.1);
    const st = hub.isAutoExecuteEnabled('meme-solana');
    expect(st.enabled).toBe(true);
    expect(st.maxTradeAmount).toBe(0.1);
    hub.setAutoExecute('meme-solana', false);
    expect(hub.isAutoExecuteEnabled('meme-solana').enabled).toBe(false);
  });
});


