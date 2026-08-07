import { RiskManager } from './risk-manager.js';
import { AGENT_DOMAINS, normalizeDomainKey as registryNormalizeDomain } from './agent-registry.js';

export interface ChannelStatus {
  channelId: string;
  domain: string;
  active: boolean;
  minLiquidityUsd: number;
}

export class AthenaHub {
  private riskManager: RiskManager;
  private channelStates: Map<string, ChannelStatus> = new Map();
  private agentStates: Map<string, boolean> = new Map();
  private autoExecuteStates: Map<string, { enabled: boolean; maxTradeAmount: number }> = new Map();

  private stateStore?: any;

  constructor() {
    this.riskManager = new RiskManager();
    this.initializeAgentStatesDefaultPaused();
  }

  public attachStateStore(store: any): void {
    this.stateStore = store;
    const savedStates = store.getAllAgentStates ? store.getAllAgentStates() : {};
    const domains = AGENT_DOMAINS.map((d) => d.id);
    for (const d of domains) {
      const savedState = savedStates[d];
      // Default strictly to false (PAUSED) unless explicitly enabled in state
      const isActive = savedState !== undefined ? Boolean(savedState) : false;
      this.agentStates.set(d, isActive);
    }
    console.log(`[HUB] Sub-Agent persistent states synchronized. Active domains: [${this.getActiveDomains().join(', ') || 'NONE (ALL PAUSED)'}]`);
  }

  private initializeAgentStatesDefaultPaused(): void {
    // All sub-agents are PAUSED by default on startup until explicitly resumed by user
    const domains = AGENT_DOMAINS.map((d) => d.id);
    for (const d of domains) {
      this.agentStates.set(d, false);
      this.autoExecuteStates.set(d, { enabled: false, maxTradeAmount: 0.1 });
    }
  }

  public normalizeDomainKey(domain: string): string {
    return registryNormalizeDomain(domain);
  }

  public setAgentActive(domain: string, active: boolean): void {
    const norm = this.normalizeDomainKey(domain);
    this.agentStates.set(norm, active);
    if (this.stateStore && typeof this.stateStore.setAgentState === 'function') {
      this.stateStore.setAgentState(norm, active);
    }
    console.log(`[HUB] Sub-Agent "${norm.toUpperCase()}" status updated to: ${active ? '🟢 ACTIVE' : '🔴 PAUSED'}`);
  }

  public isAgentActive(domain: string): boolean {
    const norm = this.normalizeDomainKey(domain);
    return this.agentStates.get(norm) ?? false;
  }

  public setAutoExecute(domain: string, enabled: boolean, maxTradeAmount: number = 0.1): void {
    const norm = this.normalizeDomainKey(domain);
    this.autoExecuteStates.set(norm, { enabled, maxTradeAmount });
    console.log(`[HUB] Auto-Execution for "${norm.toUpperCase()}" set to: ${enabled ? '⚡ ENABLED' : '🔒 DISABLED'} (Max Size: ${maxTradeAmount})`);
  }

  public isAutoExecuteEnabled(domain: string): { enabled: boolean; maxTradeAmount: number } {
    const norm = this.normalizeDomainKey(domain);
    return this.autoExecuteStates.get(norm) ?? { enabled: false, maxTradeAmount: 0.1 };
  }

  public setAllAgentsActive(active: boolean): void {
    for (const key of this.agentStates.keys()) {
      this.agentStates.set(key, active);
    }
    console.log(`[HUB] All Sub-Agents status updated to: ${active ? '🟢 ACTIVE' : '🔴 PAUSED'}`);
  }

  public toggleChannelScreening(channelId: string, domain: string, active: boolean, minLiquidityUsd: number = 5000): ChannelStatus {
    const status: ChannelStatus = { channelId, domain, active, minLiquidityUsd };
    this.channelStates.set(channelId, status);
    this.setAgentActive(domain, active);
    return status;
  }

  public getChannelStatus(channelId: string): ChannelStatus | undefined {
    return this.channelStates.get(channelId);
  }

  public getAllActiveChannels(): ChannelStatus[] {
    return Array.from(this.channelStates.values()).filter(c => c.active);
  }

  public getActiveDomains(): string[] {
    const active: string[] = [];
    for (const [domain, isActive] of this.agentStates.entries()) {
      if (isActive) active.push(domain);
    }
    return active;
  }

  public getRiskManager(): RiskManager {
    return this.riskManager;
  }

  public pauseAgent(domain: string): { agentId: string; active: boolean } {
    const key = domain.toLowerCase().trim();
    if (key === 'all') {
      this.setAllAgentsActive(false);
      return { agentId: 'all', active: false };
    }
    this.setAgentActive(key, false);
    return { agentId: key, active: false };
  }

  public resumeAgent(domain: string): { agentId: string; active: boolean } {
    const key = domain.toLowerCase().trim();
    if (key === 'all') {
      this.setAllAgentsActive(true);
      return { agentId: 'all', active: true };
    }
    this.setAgentActive(key, true);
    return { agentId: key, active: true };
  }

  public async triggerAgentPass(domain: string): Promise<any[]> {
    const key = domain.toLowerCase().trim();
    console.log(`[HUB] Triggering on-demand screening pass for: ${key.toUpperCase()}`);

    try {
      if (key.includes('solana') || key.includes('meme-solana')) {
        const { SolanaScreeningAgent } = await import('../agents/meme-solana/solana-screening-agent.js');
        const agent = new SolanaScreeningAgent();
        const { GMGNAdapter } = await import('../adapters/gmgn-adapter.js');
        const { RugCheckService } = await import('../services/security-service.js');
        const gmgn = new GMGNAdapter();
        const rugCheck = new RugCheckService();
        const signals = await gmgn.fetchTrendingSignals('sol');
        const reports = [];
        for (const s of signals.slice(0, 5)) {
          const audit = await rugCheck.auditSolanaToken(s.contractAddress);
          reports.push(agent.detectRevivalAndCTO(s, audit));
        }
        return reports;
      }
      if (key.includes('evm') || key.includes('meme-evm')) {
        const { EVMScreeningAgent } = await import('../agents/meme-evm/evm-screening-agent.js');
        const agent = new EVMScreeningAgent();
        return await agent.runScreeningPass();
      }
      if (key.includes('nft')) {
        const { NFTScreeningAgent } = await import('../agents/nft/nft-screening-agent.js');
        const agent = new NFTScreeningAgent();
        return await agent.runScreeningPass();
      }
      if (key.includes('prediction') || key.includes('poly')) {
        const { PolymarketAgent } = await import('../agents/prediction/polymarket-agent.js');
        const agent = new PolymarketAgent();
        return await agent.runScreeningPass();
      }
      if (key.includes('perp') || key.includes('hyperliquid')) {
        const { PerpsScreeningAgent } = await import('../agents/perps/perps-screening-agent.js');
        const { HyperliquidAdapter } = await import('../adapters/hyperliquid-adapter.js');
        const agent = new PerpsScreeningAgent(new HyperliquidAdapter());
        return await agent.screenAllAssets();
      }
    } catch (err: any) {
      console.error(`[HUB SCREENING PASS ERROR] Failed for ${key}:`, err.message);
    }

    return [];
  }

  public getAgentStatuses(): Record<string, { active: boolean; autoExecute: boolean; maxTradeAmount: number }> {
    const statuses: Record<string, { active: boolean; autoExecute: boolean; maxTradeAmount: number }> = {};
    for (const [domain, active] of this.agentStates.entries()) {
      const autoExec = this.isAutoExecuteEnabled(domain);
      statuses[domain] = {
        active,
        autoExecute: autoExec.enabled,
        maxTradeAmount: autoExec.maxTradeAmount,
      };
    }
    return statuses;
  }

  public setRiskParameters(maxDrawdownPct?: number, maxPositionSizeUsd?: number): { maxDrawdownPct: number; maxPositionSizeUsd: number } {
    if (maxDrawdownPct !== undefined) {
      this.riskManager.setDrawdownLimit(maxDrawdownPct / 100);
    }
    if (maxPositionSizeUsd !== undefined) {
      this.riskManager.setMaxPositionSizeUsd(maxPositionSizeUsd);
    }

    const state = this.riskManager.getRiskState();
    return {
      maxDrawdownPct: state.maxDrawdownLimitPct,
      maxPositionSizeUsd: state.maxPositionSizeUsd,
    };
  }

  /**
   * Emergency One-Click Panic Command (/closeall)
   * Market-closes all positions and freezes all sub-agents & auto-execute states.
   */
  public executeEmergencyCloseAll(reason = 'User Manual Panic Button (/closeall)'): { closedPositionsCount: number; message: string } {
    console.error(`🚨 ATHENA HUB: EMERGENCY CLOSE ALL TRIGGERED! Reason: ${reason}`);
    
    // 1. Pause all sub-agents & disable auto-execute
    this.setAllAgentsActive(false);
    for (const key of this.autoExecuteStates.keys()) {
      this.autoExecuteStates.set(key, { enabled: false, maxTradeAmount: 0 });
    }

    // 2. Trigger Global Circuit Breaker Kill Switch
    const { globalRiskEngineV2 } = require('./risk-engine-v2.js');
    globalRiskEngineV2.activateKillSwitch(reason);

    return {
      closedPositionsCount: 0, // Mock count of closed positions
      message: `🚨 Emergency Kill Switch Activated! All sub-agents PAUSED and trading locked. Reason: ${reason}`,
    };
  }
}
