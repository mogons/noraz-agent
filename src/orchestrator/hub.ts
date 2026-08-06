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

  constructor() {
    this.riskManager = new RiskManager();
  }

  public toggleChannelScreening(channelId: string, domain: string, active: boolean, minLiquidityUsd: number = 5000): ChannelStatus {
    const status: ChannelStatus = { channelId, domain, active, minLiquidityUsd };
    this.channelStates.set(channelId, status);
    return status;
  }

  public getChannelStatus(channelId: string): ChannelStatus | undefined {
    return this.channelStates.get(channelId);
  }

  public getAllActiveChannels(): ChannelStatus[] {
    return Array.from(this.channelStates.values()).filter(c => c.active);
  }

  public getRiskManager(): RiskManager {
    return this.riskManager;
  }
}
