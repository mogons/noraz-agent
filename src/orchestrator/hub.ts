import { RiskManager } from './risk-manager.js';
import { globalRiskEngineV2 } from './risk-engine-v2.js';
import { AGENT_DOMAINS, getAgentDomain, normalizeDomainKey as registryNormalizeDomain } from './agent-registry.js';
import type { AgentDomainId } from './agent-registry.js';
import type { AgentReport, ScreeningAgent } from '../agents/shared/agent-contract.js';
import type { MeteoraDLMMAdapter } from '../adapters/meteora-dlmm-adapter.js';
import { buildLPPayload } from './dispatch.js';

export interface ChannelStatus {
  channelId: string;
  domain: string;
  active: boolean;
  minLiquidityUsd: number;
}

export interface AthenaHubOptions {
  /** Optional per-domain agent factories (test DI / custom wiring). Lazy-imports real agents by default. */
  agentFactories?: Partial<Record<AgentDomainId, () => ScreeningAgent | Promise<ScreeningAgent>>>;
  meteoraAdapter?: MeteoraDLMMAdapter;
}

export class AthenaHub {
  private riskManager: RiskManager;
  private channelStates: Map<string, ChannelStatus> = new Map();
  private agentStates: Map<string, boolean> = new Map();
  private autoExecuteStates: Map<string, { enabled: boolean; maxTradeAmount: number }> = new Map();

  private agentFactories: Partial<Record<AgentDomainId, () => ScreeningAgent | Promise<ScreeningAgent>>>;
  private meteoraAdapter?: MeteoraDLMMAdapter;

  private stateStore?: any;

  constructor(options: AthenaHubOptions = {}) {
    this.riskManager = new RiskManager();
    this.agentFactories = options.agentFactories ?? {};
    this.meteoraAdapter = options.meteoraAdapter;
    this.initializeAgentStatesDefaultPaused();
  }

  /** Late wiring seam for composition roots (index.ts): share singleton agents with on-demand passes. */
  public attachAgentFactories(factories: Partial<Record<AgentDomainId, () => ScreeningAgent | Promise<ScreeningAgent>>>): void {
    this.agentFactories = { ...this.agentFactories, ...factories };
  }

  /** Late wiring seam for the Meteora LP adapter (composition root). */
  public attachAdapters(deps: { meteoraAdapter?: MeteoraDLMMAdapter }): void {
    this.meteoraAdapter = deps.meteoraAdapter ?? this.meteoraAdapter;
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

  public async triggerAgentPass(domain: string): Promise<AgentReport[]> {
    const key = domain.toLowerCase().trim();
    console.log(`[HUB] Triggering on-demand screening pass for: ${key.toUpperCase()}`);

    // Registry-driven resolution: canonical id, aliases, and channel names all resolve.
    const info = getAgentDomain(key);
    if (!info) {
      console.warn(`[HUB] Unknown screening domain "${key}" — no agent registered.`);
      return [];
    }

    try {
      // Explicit factory (test DI / custom wiring) wins over default flows.
      const factory = this.agentFactories[info.id];
      if (factory) {
        const agent = await factory();
        return await agent.runScreeningPass();
      }
      if (info.category === 'LP') {
        return await this.runLPPass(info.id);
      }
      const agent = await this.resolveAgent(info.id);
      return await agent.runScreeningPass();
    } catch (err: any) {
      console.error(`[HUB SCREENING PASS ERROR] Failed for ${key}:`, err.message);
    }

    return [];
  }

  /**
   * Resolve the LIVE agent instance for a domain (the same singleton the 5-min
   * loop uses) — or null when no factory is wired (LP domains / fresh resolve).
   * Used by the chat tool `set_screening_config` to update runtime thresholds.
   */
  public async getScreeningAgent(domain: string): Promise<ScreeningAgent | null> {
    const info = getAgentDomain(domain);
    if (!info) return null;
    const factory = this.agentFactories[info.id];
    if (factory) return await factory();
    return null;
  }

  private async resolveAgent(id: AgentDomainId): Promise<ScreeningAgent> {
    switch (id) {
      case 'meme-solana': {
        const { SolanaScreeningAgent } = await import('../agents/meme-solana/solana-screening-agent.js');
        return new SolanaScreeningAgent();
      }
      case 'meme-robinhood': {
        const { RobinhoodScreeningAgent } = await import('../agents/meme-robinhood/robinhood-screening-agent.js');
        return new RobinhoodScreeningAgent();
      }
      case 'nft': {
        const { NFTScreeningAgent } = await import('../agents/nft/nft-screening-agent.js');
        return new NFTScreeningAgent();
      }
      case 'prediction': {
        const { PolymarketAgent } = await import('../agents/prediction/polymarket-agent.js');
        return new PolymarketAgent();
      }
      case 'ct-alpha': {
        const { CTAlphaAgent } = await import('../agents/ct-alpha/ct-alpha-agent.js');
        return new CTAlphaAgent();
      }
      case 'perps': {
        const { PerpsScreeningAgent } = await import('../agents/perps/perps-screening-agent.js');
        const { HyperliquidAdapter } = await import('../adapters/hyperliquid-adapter.js');
        return new PerpsScreeningAgent(new HyperliquidAdapter());
      }
      default:
        throw new Error(`No agent factory registered for domain "${id}"`);
    }
  }

  /**
   * LP domains.
   * - lp-solana: adapter-flow Meteora DLMM (official data API).
   * - lp-robinhood: Robinhood Chain tidak punya indexer pool publik yang
   *   andal (subgraph unsupported, Uniswap Data API butuh akses khusus) —
   *   reuse screening GMGN meme-robinhood (graduated-only + GoPlus) lalu
   *   terapkan filter LP berbasis data GMGN (likuiditas, estimasi fee
   *   yield 0.3% Uniswap v3, velocity) supaya call-nya LP-specific,
   *   bukan duplikat meme. CA di-surface di card; user cari pool di Uniswap.
   */
  public async runLPPass(id: AgentDomainId): Promise<AgentReport[]> {
    if (id === 'lp-solana') {
      const { MeteoraDLMMAdapter } = await import('../adapters/meteora-dlmm-adapter.js');
      const adapter = this.meteoraAdapter ?? new MeteoraDLMMAdapter();
      const high = adapter.filterHighYieldPools(await adapter.fetchTopYieldPools());
      return high.map((p) => ({
        passed: true,
        signal: p,
        reason: p.aiRecommendation,
        confidence: 80,
        payload: buildLPPayload(p, 'lp-solana'),
      }));
    }
    // lp-robinhood: reuse the meme-robinhood screening singleton (GMGN 4 sources,
    // graduated-only, GoPlus audit) — lalu terapkan SATU gate LP:
    //   - velocity: volume 1h >= 100% ACTIVE TVL (0.3% × liq) — cari pool yang
    //     benar-benar ramai diperdagangkan (turnover tinggi)
    //   - liquidity > $10k (pagar keamanan, sama seperti meme agent)
    // Fee/APR TIDAK difilter — user cek sendiri di Uniswap via CA yang di-surface.
    // CA di-surface supaya user bisa cari pool di app.uniswap.org/explore/pools/robinhood.
    const memeAgent = await this.getScreeningAgent('meme-robinhood');
    if (!memeAgent) return [];
    const reports = await memeAgent.runScreeningPass();
    const UNISWAP_V3_FEE_RATE = 0.003; // default 0.3% tier — dipakai hanya untuk active-TVL proxy
    const bestBySymbol = new Map<string, AgentReport>();
    for (const r of reports) {
      const t = (r.signal as { token?: { liquidityUsd?: number; volume24hUsd?: number } } | undefined)?.token;
      if (!t) continue;
      const liquidityUsd = t.liquidityUsd || 0;
      const volume24hUsd = t.volume24hUsd || 0;
      const volume1hUsd = volume24hUsd / 24;
      const activeTvlUsd = UNISWAP_V3_FEE_RATE * liquidityUsd;
      const volumeToActiveTvlRatio1h = activeTvlUsd > 0 ? volume1hUsd / activeTvlUsd : 0;

      // Velocity gate (ramai vs modal aktif) + liquidity floor
      if (liquidityUsd <= 10000) continue;
      if (volumeToActiveTvlRatio1h < 1.0) continue;

      // Dedupe per pair: satu terbaik per symbol (velocity tertinggi)
      const symbol = String(r.payload?.symbol || (t as any).symbol || 'TOKEN').toUpperCase();
      const existing = bestBySymbol.get(symbol);
      if (!existing) {
        bestBySymbol.set(symbol, r);
      } else {
        const existingT = (existing.signal as { token?: { liquidityUsd?: number; volume24hUsd?: number } } | undefined)?.token;
        const existingVel = existingT ? ((existingT.volume24hUsd || 0) / 24) / (UNISWAP_V3_FEE_RATE * (existingT.liquidityUsd || 1)) : 0;
        if (volumeToActiveTvlRatio1h > existingVel) bestBySymbol.set(symbol, r);
      }
    }
    return [...bestBySymbol.values()].map((r) => {
      const t = (r.signal as { token?: { liquidityUsd?: number; volume24hUsd?: number } } | undefined)?.token;
      const liquidityUsd = t?.liquidityUsd || 0;
      const volume24hUsd = t?.volume24hUsd || 0;
      return {
        passed: true,
        signal: r.signal,
        reason: r.reason,
        confidence: r.confidence,
        payload: {
          ...(r.payload || {}),
          domain: 'LP_ROBINHOOD' as const,
          title: r.payload?.title || `${r.payload?.symbol || 'TOKEN'} (LP on Robinhood Chain)`,
          symbol: r.payload?.symbol || 'TOKEN',
          aiThesis: r.payload?.aiThesis || r.reason || 'Token lolos screening — cari pool di Uniswap.',
          network: 'Robinhood Chain (Uniswap v3)',
          dexPaidStatus: 'Uniswap v3 • find pool on app.uniswap.org',
          dexScreenerUrl: `https://app.uniswap.org/explore/pools/robinhood`,
          poolUrl: r.payload?.contractAddress
            ? `https://app.uniswap.org/explore/pools/robinhood/${r.payload.contractAddress}`
            : undefined,
          liquidity: `$${(liquidityUsd / 1000).toFixed(1)}k`,
          securityAuditPassed: r.payload?.securityAuditPassed ?? true,
          socialHypeScore: r.payload?.socialHypeScore ?? r.confidence,
          liquidityUsd: r.payload?.liquidityUsd ?? liquidityUsd,
          volume1hUsd: r.payload?.volume1hUsd ?? volume24hUsd / 24,
        },
      };
    });
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
    globalRiskEngineV2.activateKillSwitch(reason);

    return {
      closedPositionsCount: 0, // Mock count of closed positions
      message: `🚨 Emergency Kill Switch Activated! All sub-agents PAUSED and trading locked. Reason: ${reason}`,
    };
  }
}
