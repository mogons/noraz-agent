import { describe, it, expect } from 'vitest';
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
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.passed).toBe(true);
  });

  it('2. Solana Meme Agent: Should evaluate Solana DEX signals', () => {
    const agent = new SolanaScreeningAgent();
    const report = agent.detectRevivalAndCTO(
      {
        symbol: 'SOLMEME',
        contractAddress: 'So11111111111111111111111111111111111111112',
        volume24hUsd: 150000,
        smartMoneyNetBuySolOrEth: 12,
        devHoldingPercentage: 0.5,
        smartMoneyCount: 3,
        dexscreenerUrl: 'https://dexscreener.com/solana',
      },
      {
        mintAuthorityDisabled: true,
        freezeAuthorityDisabled: true,
        lpBurnedPercentage: 100,
        top10HoldersPercentage: 12.5,
        isHoneypot: false,
        score: 95,
        riskLevel: 'GOOD',
      }
    );

    expect(report.isCTO).toBe(true);
    expect(report.volumeSpikeRatio).toBeGreaterThan(5.0);
  });

  it('3. EVM Meme Agent: Should evaluate Base, ETH, & Robinhood L2 DEX signals', () => {
    const agent = new EVMScreeningAgent();
    const report = agent.evaluateEVMToken(
      {
        symbol: 'BASEMEME',
        contractAddress: '0x1234567890123456789012345678901234567890',
        volume24hUsd: 120000,
        smartMoneyNetBuySolOrEth: 2.5,
        devHoldingPercentage: 2.0,
        smartMoneyCount: 4,
        dexscreenerUrl: 'https://dexscreener.com/base',
      },
      'base'
    );

    expect(report.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(report.chain).toBe('base');
  });

  it('4. Perpetual Futures Agent: Should evaluate Hyperliquid leverage setups', async () => {
    const hlAdapter = new HyperliquidAdapter();
    const agent = new PerpsScreeningAgent(hlAdapter);
    const reports = await agent.screenAllAssets();
    expect(Array.isArray(reports)).toBe(true);
  });

  it('5. EVM NFT Agent: Should evaluate NFT Momentum & Whale Sweeps', async () => {
    const agent = new NFTScreeningAgent();
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0].confidenceScore).toBeGreaterThanOrEqual(80);
    expect(reports[0].isFloorSurge).toBe(true);
  });

  it('6. Polymarket Prediction Agent: Should evaluate prediction market odds', async () => {
    const agent = new PolymarketAgent();
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0].confidenceScore).toBeGreaterThanOrEqual(80);
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

  it('9. Twitter Service: Should evaluate X/Twitter hype and TwexAPI search', async () => {
    const { TwitterService } = await import('../src/services/twitter-service.js');
    const twitter = new TwitterService();
    const hype = await twitter.getHypeScore('ATHENA');
    expect(hype.sentimentScore).toBeGreaterThanOrEqual(70);
    expect(Array.isArray(hype.topTweets)).toBe(true);
    expect(hype.topTweets.length).toBeGreaterThan(0);
  });

  it('10. Trade Journal Service: Should record trades, calculate Win Rate, and export CSV', async () => {
    const { TradeJournalService } = await import('../src/services/trade-journal-service.js');
    const journal = new TradeJournalService();
    const stats = journal.getSummaryStats();

    expect(stats.totalTrades).toBeGreaterThanOrEqual(2);
    expect(stats.winRatePct).toBe(100);
    expect(stats.totalRealizedPnlUsd).toBeGreaterThan(0);

    const csv = journal.exportCsv();
    expect(csv).toContain('ID,Domain,Symbol,Chain,Status');
    expect(csv).toContain('ATHENA');
    expect(csv).toContain('PUDGY');
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

  it('12. Smart CT Alpha Agent: Should evaluate X/Twitter for AI narratives and yield opportunities', async () => {
    const { CTAlphaAgent } = await import('../src/agents/ct-alpha/ct-alpha-agent.js');
    const agent = new CTAlphaAgent();
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0].confidenceScore ?? reports[0].signal.confidenceScore).toBeGreaterThanOrEqual(80);
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

  it('17. Solana Adapter Direct Execution: Should simulate sendToken and swapToken', async () => {
    const { SolanaTradeAdapter } = await import('../src/adapters/solana-adapter.js');
    const adapter = new SolanaTradeAdapter();

    const sendRes = await adapter.sendToken({
      recipientAddress: '7XwW4PzZg8Zp4kH7XwW4PzZg8Zp4kH7XwW4PzZg8Zp4k',
      amountSol: 0.5,
    });
    expect(sendRes.success).toBe(true);
    expect(sendRes.simulated).toBe(true);
    expect(sendRes.explorerUrl).toContain('solscan.io');

    const swapRes = await adapter.swapToken({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
      amountSol: 1.0,
    });
    expect(swapRes.success).toBe(true);
    expect(swapRes.simulated).toBe(true);
    expect(swapRes.outputTokens).toBeGreaterThan(0);
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
    const { SwarmLearningEngine } = await import('../src/orchestrator/swarm-learning.js');
    const engine = new SwarmLearningEngine();

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
});


