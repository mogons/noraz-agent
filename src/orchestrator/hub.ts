import { RiskManager } from './risk-manager.js';
import { globalRiskEngineV2 } from './risk-engine-v2.js';
import { AGENT_DOMAINS, getAgentDomain, normalizeDomainKey as registryNormalizeDomain } from './agent-registry.js';
import type { AgentDomainId } from './agent-registry.js';
import type { AgentReport, ScreeningAgent } from '../agents/shared/agent-contract.js';
import type { MeteoraDLMMAdapter } from '../adapters/meteora-dlmm-adapter.js';
import type { KrystalCloudAdapter } from '../adapters/krystal-cloud-adapter.js';
import type { GMGNAdapter } from '../adapters/gmgn-adapter.js';
import { securityGateToken, tokenSecurityLabel } from '../agents/shared/gmgn-meme-helpers.js';
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
  krystalAdapter?: KrystalCloudAdapter;
  gmgnAdapter?: GMGNAdapter;
}

export class AthenaHub {
  private riskManager: RiskManager;
  private channelStates: Map<string, ChannelStatus> = new Map();
  private agentStates: Map<string, boolean> = new Map();
  private autoExecuteStates: Map<string, { enabled: boolean; maxTradeAmount: number }> = new Map();

  private agentFactories: Partial<Record<AgentDomainId, () => ScreeningAgent | Promise<ScreeningAgent>>>;
  private meteoraAdapter?: MeteoraDLMMAdapter;
  private krystalAdapter?: KrystalCloudAdapter;
  private gmgnAdapter?: GMGNAdapter;

  private stateStore?: any;

  constructor(options: AthenaHubOptions = {}) {
    this.riskManager = new RiskManager();
    this.agentFactories = options.agentFactories ?? {};
    this.meteoraAdapter = options.meteoraAdapter;
    this.krystalAdapter = options.krystalAdapter;
    this.gmgnAdapter = options.gmgnAdapter;
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
      const { GMGNAdapter } = await import('../adapters/gmgn-adapter.js');
      const adapter = this.meteoraAdapter ?? new MeteoraDLMMAdapter();
      const high = adapter.filterHighYieldPools(await adapter.fetchTopYieldPools());
      // Enrich token meme (tokenX) dengan GMGN: Meteora DLMM API tidak expose
      // smart money/KOL/CTO — ambil dari GMGN token/info (fail-open). Security
      // gate token (honeypot/tax/rug/insider/bundler/top-10) dipakai sebagai
      // FILTER: token berbahaya menolak pool-nya (fail-open bila tidak ditemukan).
      const gmgn = this.gmgnAdapter ?? new GMGNAdapter();
      const enriched = new Map<string, any>();
      const results: AgentReport[] = [];
      for (const p of high) {
        if (p.tokenXAddress && !enriched.has(p.tokenXAddress)) {
          try {
            const info = await gmgn.fetchTokenInfo('sol', p.tokenXAddress);
            enriched.set(p.tokenXAddress, info);
          } catch { enriched.set(p.tokenXAddress, null); }
        }
        const info = enriched.get(p.tokenXAddress) ?? null;
        if (info) {
          // LP: tax gate dimatikan (token LP sering punya tax kecil) — gate lain tetap.
          const sec = securityGateToken(info, { enableTaxGate: false });
          if (!sec.ok) {
            console.log(`[LP SOLANA] ⛔ Pool ditolak: ${p.pairName} — ${sec.reasons.join(' ')}`);
            continue;
          }
        }
        const payload = buildLPPayload(p);
        if (info) {
          payload.token0PriceUsd = info.priceUsd || payload.token0PriceUsd;
          payload.token0MarketCapUsd = info.marketCapUsd || payload.token0MarketCapUsd;
          payload.token0Volume24hUsd = info.volume24hUsd || payload.token0Volume24hUsd;
          payload.token0Holders = info.holderCount || payload.token0Holders;
          payload.token0AgeHours = info.creationTimestamp ? (Date.now() / 1000 - info.creationTimestamp) / 3600 : payload.token0AgeHours;
          const smart = (info.smartDegenCount ?? 0) + (info.renownedCount ?? 0);
          if (smart > 0) payload.token0SmartDegenCount = smart;
          payload.gmgnUrl = `https://gmgn.ai/sol/token/${p.tokenXAddress}`;
          payload.securityAuditPassed = true;
          payload.securityScore = tokenSecurityLabel(info);
        } else {
          payload.securityScore = '⚠️ Tidak diaudit (GMGN)';
        }
        results.push({
          passed: true,
          signal: p,
          reason: p.aiRecommendation,
          confidence: 80,
          payload,
        });
      }
      return results;
    }
    // lp-robinhood: Krystal Cloud Data API (indexer pool robinhood chain yang
    // andal — subgraph unsupported, Uniswap Data API butuh akses khusus).
    // Data NYATA: tvl, volume/fee/APR per 1h-24h, farm incentives. Filter
    // mirror LP solana (Meteora): fee1h>=7, 24h Fee/TVL>1%, velocity>=100%,
    // tvl>=10k, dedupe per pair. CA kedua token + chart link di-surface;
    // detail token meme (harga/MC/volume/holder/umur/smart money) di-enrich
    // dari GMGN token/info — token meme = yang BUKAN base asset (WETH/USDC/…),
    // fail-open.
    const { KrystalCloudAdapter } = await import('../adapters/krystal-cloud-adapter.js');
    const { GMGNAdapter } = await import('../adapters/gmgn-adapter.js');
    const krystal = this.krystalAdapter ?? new KrystalCloudAdapter();
    const high = krystal.filterHighYieldPools(await krystal.fetchTopRobinhoodPools());
    // Enrich pakai key GMGN robinhood (rate limit per key) — fallback ke GMGN_API_KEY.
    // Security gate token meme (honeypot/tax/rug/insider/bundler/top-10) = FILTER:
    // token berbahaya menolak pool-nya (fail-open bila tidak ditemukan di GMGN).
    const gmgn = this.gmgnAdapter ?? new GMGNAdapter(process.env.GMGN_API_KEY_ROBINHOOD || process.env.GMGN_API_KEY);
    const isBaseAsset = (sym: string) => /^(WETH|ETH|USDC|USDT|DAI|WBTC|WSTETH|STETH)$/i.test(sym);
    const enriched = new Map<string, any>(); // tokenAddress -> GMGN info
    const results: AgentReport[] = [];
    for (const p of high) {
      // Urutkan token: token meme (non-base, mis. PEPE) jadi yang pertama,
      // base asset (WETH/USDC/…) jadi kedua — konsisten dengan LP solana
      // (Meteora: "Chiikawa-SOL", meme duluan). Fallback: token0 tetap pertama.
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
      // Market cap token meme WAJIB > $100k (fail-closed: token tidak ditemukan
      // di GMGN / MC tidak diketahui = pool ditolak).
      if (!info) {
        console.log(`[LP ROBINHOOD] ⛔ Pool ditolak: ${memeToken.sym}-${baseToken.sym} — token tidak ditemukan di GMGN (MC tidak bisa diverifikasi).`);
        continue;
      }
      if (info.marketCapUsd < 100000) {
        console.log(`[LP ROBINHOOD] ⛔ Pool ditolak: ${memeToken.sym} MC $${(info.marketCapUsd / 1000).toFixed(0)}k < $100k.`);
        continue;
      }
      if (info) {
        // LP: tax gate dimatikan (token LP sering punya tax kecil) — gate lain tetap.
        const sec = securityGateToken(info, { enableTaxGate: false });
        if (!sec.ok) {
          console.log(`[LP ROBINHOOD] ⛔ Pool ditolak: ${memeToken.sym}-${baseToken.sym} — ${sec.reasons.join(' ')}`);
          continue;
        }
      }
      const ageHours = info?.creationTimestamp !== null && info?.creationTimestamp ? (Date.now() / 1000 - info.creationTimestamp) / 3600 : undefined;
      const smart = (info?.smartDegenCount ?? 0) + (info?.renownedCount ?? 0);
      results.push({
        passed: true,
        signal: p,
        reason: p.aiRecommendation,
        confidence: 80,
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
          confidenceScore: 80,
          securityAuditPassed: true,
          securityScore: tokenSecurityLabel(info),
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
