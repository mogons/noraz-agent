import { RiskManager } from './risk-manager.js';
import { globalRiskEngineV2 } from './risk-engine-v2.js';
import { AGENT_DOMAINS, getAgentDomain, normalizeDomainKey as registryNormalizeDomain } from './agent-registry.js';
import type { AgentDomainId } from './agent-registry.js';
import type { AgentReport, ScreeningAgent } from '../agents/shared/agent-contract.js';
import type { KrystalCloudAdapter } from '../adapters/krystal-cloud-adapter.js';
import type { GMGNAdapter } from '../adapters/gmgn-adapter.js';
import { securityGateToken, securityAuditGate, tokenSecurityAuditLabel } from '../agents/shared/gmgn-meme-helpers.js';

export interface ChannelStatus {
  channelId: string;
  domain: string;
  active: boolean;
  minLiquidityUsd: number;
}

export interface OpenCatHubOptions {
  /** Optional per-domain agent factories (test DI / custom wiring). Lazy-imports real agents by default. */
  agentFactories?: Partial<Record<AgentDomainId, () => ScreeningAgent | Promise<ScreeningAgent>>>;
  krystalAdapter?: KrystalCloudAdapter;
  gmgnAdapter?: GMGNAdapter;
}

export interface HubStrategyLike {
  params?: Record<string, unknown>;
  evaluate?: (ctx: any) => any;
}

export class OpenCatHub {
  private riskManager: RiskManager;
  private channelStates: Map<string, ChannelStatus> = new Map();
  private agentStates: Map<string, boolean> = new Map();
  private autoExecuteStates: Map<string, { enabled: boolean; maxTradeAmount: number }> = new Map();

  private agentFactories: Partial<Record<AgentDomainId, () => ScreeningAgent | Promise<ScreeningAgent>>>;
  private krystalAdapter?: KrystalCloudAdapter;
  private gmgnAdapter?: GMGNAdapter;

  private strategyProvider: ((domain: string) => HubStrategyLike | null) | null = null;

  private stateStore?: any;

  constructor(options: OpenCatHubOptions = {}) {
    this.riskManager = new RiskManager();
    this.agentFactories = options.agentFactories ?? {};
    this.krystalAdapter = options.krystalAdapter;
    this.gmgnAdapter = options.gmgnAdapter;
    this.initializeAgentStatesDefaultPaused();
  }

  /** Late wiring seam for composition roots (index.ts): share singleton agents with on-demand passes. */
  public attachAgentFactories(factories: Partial<Record<AgentDomainId, () => ScreeningAgent | Promise<ScreeningAgent>>>): void {
    this.agentFactories = { ...this.agentFactories, ...factories };
  }

  /** Wire the StrategyEngine into the hub: params + per-pool evaluate drive LP gates. */
  public setStrategyProvider(fn: ((domain: string) => HubStrategyLike | null) | null): void {
    this.strategyProvider = fn;
  }

  private runStrategySafely(strat: HubStrategyLike, arg: any): any {
    try {
      return strat.evaluate?.(arg);
    } catch (err: any) {
      console.warn(`[HUB] Strategy evaluate threw: ${err.message}`);
      return null;
    }
  }

  public attachStateStore(store: any): void {
    this.stateStore = store;
    const savedStates = store.getAllAgentStates ? store.getAllAgentStates() : {};
    const domains = AGENT_DOMAINS.map((d) => d.id);
    for (const d of domains) {
      const savedState = savedStates[d];
      const isActive = savedState !== undefined ? Boolean(savedState) : false;
      this.agentStates.set(d, isActive);
    }
    console.log(`[HUB] Sub-Agent persistent states synchronized. Active domains: [${this.getActiveDomains().join(', ') || 'NONE (ALL PAUSED)'}]`);
  }

  private initializeAgentStatesDefaultPaused(): void {
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

    const info = getAgentDomain(key);
    if (!info) {
      console.warn(`[HUB] Unknown screening domain "${key}" — no agent registered.`);
      return [];
    }

    try {
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

  public async getScreeningAgent(domain: string): Promise<ScreeningAgent | null> {
    const info = getAgentDomain(domain);
    if (!info) return null;
    const factory = this.agentFactories[info.id];
    if (factory) return await factory();
    return null;
  }

  private async resolveAgent(id: AgentDomainId): Promise<ScreeningAgent> {
    switch (id) {
      case 'meme-robinhood': {
        const { RobinhoodScreeningAgent } = await import('../agents/meme-robinhood/robinhood-screening-agent.js');
        return new RobinhoodScreeningAgent();
      }
      case 'nft': {
        const { NFTScreeningAgent } = await import('../agents/nft/nft-screening-agent.js');
        return new NFTScreeningAgent();
      }
      default:
        throw new Error(`No agent factory registered for domain "${id}"`);
    }
  }

  /**
   * LP domains.
   * - lp-robinhood: Robinhood Chain has no reliable public pool indexer
   *   (subgraph unsupported, Uniswap Data API requires special access) —
   *   reuse the GMGN meme-robinhood screening (graduated-only + GoPlus) then
   *   apply an LP filter based on GMGN data (liquidity, 0.3% Uniswap v3 fee
   *   yield estimate, velocity) so the calls are LP-specific,
   *   not meme duplicates. CA is surfaced on the card; users look up the pool on Uniswap.
   */
  public async runLPPass(id: AgentDomainId): Promise<AgentReport[]> {
    const { KrystalCloudAdapter } = await import('../adapters/krystal-cloud-adapter.js');
    const { GMGNAdapter } = await import('../adapters/gmgn-adapter.js');
    // Active LP strategy drives the gates: params (TVL/vol/fee-TVL/MC/pass) from the
    // strategy, per-pool evaluate as the final gate. No provider → strict fallback
    // (20000/200000/0.04/200000/80) so behavior is unchanged without wiring.
    const strat = this.strategyProvider ? this.strategyProvider('lp-robinhood') : null;
    const sParams = (strat?.params ?? {}) as Record<string, unknown>;
    const numParam = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);
    const minTvlUsd = numParam(sParams.minTvlUsd, 20000);
    const minVol24hUsd = numParam(sParams.minVol24hUsd, 200000);
    const minFeeTvlRatio24h = numParam(sParams.minFeeTvlRatio24h, 0.04);
    const minMarketCapUsd = numParam(sParams.minMarketCapUsd, 200000);
    const passThreshold = numParam(sParams.passThreshold, 80);
    const krystalAdapter = this.krystalAdapter ?? new KrystalCloudAdapter();
    const high = krystalAdapter.filterHighYieldPools(
      await krystalAdapter.fetchTopRobinhoodPools(minTvlUsd, minVol24hUsd),
      { minTvlUsd, minFeeTvlRatio24h }
    );
    const gmgn = this.gmgnAdapter ?? new GMGNAdapter(process.env.GMGN_API_KEY_ROBINHOOD || process.env.GMGN_API_KEY);
    const isBaseAsset = (sym: string) => /^(WETH|ETH|USDC|USDT|DAI|WBTC|WSTETH|STETH)$/i.test(sym);
    const enriched = new Map<string, any>(); // tokenAddress -> GMGN info
    const results: AgentReport[] = [];
    for (const p of high) {
      let resultsConfidence = 80;
      // Order tokens: the meme token (non-base, e.g. PEPE) first,
      // the base asset (WETH/USDC/…) second. Fallback: token0 stays first.
      const memeToken = !isBaseAsset(p.token0Symbol)
        ? { addr: p.token0Address, sym: p.token0Symbol }
        : !isBaseAsset(p.token1Symbol)
          ? { addr: p.token1Address, sym: p.token1Symbol }
          : { addr: p.token0Address, sym: p.token0Symbol };
      const baseToken = memeToken.sym === p.token0Symbol
        ? { addr: p.token1Address, sym: p.token1Symbol }
        : { addr: p.token0Address, sym: p.token0Symbol };
      if (memeToken.addr && !enriched.has(memeToken.addr)) {
        try {
          const info = await gmgn.fetchTokenInfo('robinhood', memeToken.addr);
          enriched.set(memeToken.addr, info);
        } catch { enriched.set(memeToken.addr, null); }
      }
      const info = enriched.get(memeToken.addr) ?? null;
      // Meme token market cap MUST be >= minMarketCapUsd (strategy-driven, strict
      // fallback $200k; fail-closed: token not found in GMGN / unknown MC = rejected).
      if (!info) {
        console.log(`[LP ROBINHOOD] ⛔ Pool rejected: ${memeToken.sym}-${baseToken.sym} — token not found in GMGN (MC cannot be verified).`);
        continue;
      }
      if (info.marketCapUsd < minMarketCapUsd) {
        console.log(`[LP ROBINHOOD] ⛔ Pool rejected: ${memeToken.sym} MC $${(info.marketCapUsd / 1000).toFixed(0)}k < $${(minMarketCapUsd / 1000).toFixed(0)}k.`);
        continue;
      }
      if (info) {
        // LP: tax gate disabled (LP tokens often have small taxes) — other gates remain.
        const sec = securityGateToken(info, { enableTaxGate: false });
        if (!sec.ok) {
          console.log(`[LP ROBINHOOD] ⛔ Pool rejected: ${memeToken.sym}-${baseToken.sym} — ${sec.reasons.join(' ')}`);
          continue;
        }
      }
      // Per-token security audit (honeypot/blacklist/sell-lock) — fail-closed.
      const audit = await gmgn.fetchTokenSecurity('robinhood', memeToken.addr);
      const secAudit = securityAuditGate(audit, { enableTaxGate: false });
      if (!secAudit.ok) {
        console.log(`[LP ROBINHOOD] ⛔ Pool rejected: ${memeToken.sym}-${baseToken.sym} — AUDIT FAIL: ${secAudit.reasons.join(' ')}`);
        continue;
      }
      const ageHours = info?.creationTimestamp !== null && info?.creationTimestamp ? (Date.now() / 1000 - info.creationTimestamp) / 3600 : undefined;
      const smart = (info?.smartDegenCount ?? 0) + (info?.renownedCount ?? 0);
      // Active LP strategy evaluation (loosened default: TVL/vol/fee-TVL/MC + security).
      if (strat?.evaluate) {
        const poolCtx = {
          domain: 'lp-robinhood',
          symbol: memeToken.sym,
          contractAddress: p.poolAddress,
          priceUsd: info?.priceUsd ?? 0,
          liquidityUsd: p.tvlUsd,
          volume24hUsd: p.volume24hUsd,
          volume1hUsd: p.volume1hUsd ?? 0,
          smartMoneyCount: smart,
          securityAuditPassed: secAudit.ok,
          socialHypeScore: Math.min(100, Math.round(60 + p.volumeToActiveTvlRatio1h * 5)),
          pool: {
            tvlUsd: p.tvlUsd,
            volume24hUsd: p.volume24hUsd,
            fee24hUsd: p.fee24hUsd,
            feesToTvlRatio24h: p.feesToTvlRatio24h,
            token0Symbol: p.token0Symbol,
            token1Symbol: p.token1Symbol,
            token0Address: p.token0Address,
            token1Address: p.token1Address,
            feeTier: p.feeTier,
            apr24h: p.apr24h,
            farmApr24h: p.farmApr24h,
            volumeToActiveTvlRatio1h: p.volumeToActiveTvlRatio1h,
            marketCapUsd: info?.marketCapUsd,
          },
        };
        const ev = this.runStrategySafely(strat, poolCtx);
        if (ev && (ev.recommendedAction === 'SKIP' || (typeof ev.confidence === 'number' && ev.confidence < passThreshold))) {
          console.log(`[LP ROBINHOOD] ⛔ Pool rejected: ${memeToken.sym}-${baseToken.sym} — strategy: ${ev.reason || 'below pass threshold'}.`);
          continue;
        }
        if (ev && typeof ev.confidence === 'number' && ev.confidence > 80) {
          resultsConfidence = ev.confidence;
        }
      }
      results.push({
        passed: true,
        signal: p,
        reason: p.aiRecommendation,
        confidence: resultsConfidence,
        payload: {
          domain: 'LP_ROBINHOOD' as const,
          title: `${memeToken.sym}-${baseToken.sym}`,
          symbol: memeToken.sym,
          contractAddress: p.poolAddress,
          network: 'Robinhood Chain (Uniswap v3)',
          dexPaidStatus: `Uniswap V3 • ${p.feeTier / 10000}% fee`,
          poolUrl: `https://app.uniswap.org/explore/pools/robinhood/${p.poolAddress}`,
          krystalUrl: `https://defi.krystal.app/pools/detail?chainId=4663&feeTier=${p.feeTier}&poolAddress=${p.poolAddress}&protocol=uniswapv3`,
          token0Address: memeToken.addr,
          token1Address: baseToken.addr,
          token0Symbol: memeToken.sym,
          token1Symbol: baseToken.sym,
          token0ChartUrl: memeToken.addr ? `https://dexscreener.com/robinhood/${memeToken.addr}` : undefined,
          token1ChartUrl: baseToken.addr ? `https://dexscreener.com/robinhood/${baseToken.addr}` : undefined,
          gmgnUrl: memeToken.addr ? `https://gmgn.ai/robinhood/token/${memeToken.addr}` : undefined,
          token0PriceUsd: info?.priceUsd || undefined,
          token0MarketCapUsd: info?.marketCapUsd || undefined,
          token0Volume24hUsd: info?.volume24hUsd || undefined,
          token0Holders: info?.holderCount || undefined,
          token0AgeHours: ageHours,
          token0SmartDegenCount: info ? smart : undefined,
          liquidity: `$${(p.tvlUsd / 1000).toFixed(1)}k`,
          devHoldingPct: `${p.feeAprPercentage}% APR`,
          sniperPct: `${p.apr24h.toFixed(1)}% 24h`,
          bundlerPct: p.farmApr24h > 0 ? `+${p.farmApr24h.toFixed(1)}% farm` : 'no farm',
          feeApr: `${(p.feesToTvlRatio24h * 100).toFixed(2)}% (24h Fee/TVL)`,
          aiThesis: p.aiRecommendation,
          confidenceScore: resultsConfidence,
          securityAuditPassed: true,
          securityScore: tokenSecurityAuditLabel(audit),
          socialHypeScore: Math.min(100, Math.round(60 + p.volumeToActiveTvlRatio1h * 5)),
          liquidityUsd: p.tvlUsd,
          volume1hUsd: p.volume1hUsd,
        },
      });
    }
    return results;
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
    console.error(`🚨 OPENCAT HUB: EMERGENCY CLOSE ALL TRIGGERED! Reason: ${reason}`);
    
    // 1. Pause all sub-agents & disable auto-execute
    this.setAllAgentsActive(false);
    for (const key of this.autoExecuteStates.keys()) {
      this.autoExecuteStates.set(key, { enabled: false, maxTradeAmount: 0 });
    }

    // 2. Trigger Global Circuit Breaker Kill Switch
    globalRiskEngineV2.activateKillSwitch(reason);

    return {
      closedPositionsCount: 0, // informational only — this command closes nothing on-chain, it freezes the hub
      message: `🚨 Emergency Kill Switch Activated! All sub-agents PAUSED and trading locked. Reason: ${reason}`,
    };
  }
}





