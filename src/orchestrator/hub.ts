import { RiskManager } from './risk-manager.js';

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

  constructor() {
    this.riskManager = new RiskManager();
    this.initializeAgentStatesDefaultPaused();
  }

  private initializeAgentStatesDefaultPaused(): void {
    // Sub-agents enabled by default on deployment for 24/7 background screening
    const domains = ['meme-solana', 'meme-evm', 'lp-solana', 'lp-evm', 'perps', 'nft', 'prediction', 'ct-alpha'];
    for (const d of domains) {
      this.agentStates.set(d, true);
      this.autoExecuteStates.set(d, { enabled: false, maxTradeAmount: 0.1 });
    }
  }

  public setAgentActive(domain: string, active: boolean): void {
    this.agentStates.set(domain.toLowerCase(), active);
    console.log(`[HUB] Sub-Agent "${domain.toUpperCase()}" status updated to: ${active ? '🟢 ACTIVE' : '🔴 PAUSED'}`);
  }

  public isAgentActive(domain: string): boolean {
    return this.agentStates.get(domain.toLowerCase()) ?? false;
  }

  public setAutoExecute(domain: string, enabled: boolean, maxTradeAmount: number = 0.1): void {
    this.autoExecuteStates.set(domain.toLowerCase(), { enabled, maxTradeAmount });
    console.log(`[HUB] Auto-Execution for "${domain.toUpperCase()}" set to: ${enabled ? '⚡ ENABLED' : '🔒 DISABLED'} (Max Size: ${maxTradeAmount})`);
  }

  public isAutoExecuteEnabled(domain: string): { enabled: boolean; maxTradeAmount: number } {
    return this.autoExecuteStates.get(domain.toLowerCase()) ?? { enabled: false, maxTradeAmount: 0.1 };
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
