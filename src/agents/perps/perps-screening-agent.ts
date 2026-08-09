/**
 * Whale Tracking Agent (Hyperliquid) — replaces the old perps call agent.
 *
 * Tracks smart-money positioning on BTC / ETH / SOL:
 * - PvP leaderboard (30d, stats-data, cached 1 jam) → top trader addresses
 * - clearinghouseState per address → actual OPEN positions (long/short + USD size)
 * - userFills per address (5 menit) → spot order flow (buy vs sell), fills >= $100k
 *
 * Posts to #call-whale-tracking ONLY on material change (new/closed >= $1M
 * position, net direction flip, >= 30% long/short shift, or new >= $100k spot
 * fill), with a 10-minute per-asset cooldown.
 *
 * All aggregation runs locally in TypeScript — zero LLM API cost.
 */

import { HyperliquidAdapter, HyperliquidPosition, HyperliquidTradeFill } from '../../adapters/hyperliquid-adapter.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';

export interface WhaleTraderPosition {
  address: string;
  side: 'LONG' | 'SHORT';
  sizeUsd: number;
  entryPx: number;
  returnPct: number; // PvP 30d return % of the trader (0 when unknown)
}

export interface WhaleSpotFlow {
  market: string;      // e.g. "BTC/USDC"
  buyUsd: number;
  sellUsd: number;
  fillCount: number;
}

export interface WhalePositionSignal {
  coin: string;                    // "BTC" | "ETH" | "SOL"
  totalLongUsd: number;
  totalShortUsd: number;
  netUsd: number;                  // totalLong - totalShort
  longCount: number;
  shortCount: number;
  longTraders: WhaleTraderPosition[];
  shortTraders: WhaleTraderPosition[];
  spotFlow: WhaleSpotFlow[];
  generatedAt: number;
}

export interface WhaleTrackConfig {
  topTraderCount: number;     // leaderboard depth per asset
  minPerpsUsd: number;        // only perps positions >= this are detailed (per trader)
  minSpotUsd: number;         // only spot fills >= this are reported
  spotFillTraderLimit: number; // max trader per coin yang dibaca userFills-nya (hemat API call)
  changeThresholdPct: number; // total long OR short shift that triggers a post
  postCooldownMs: number;     // min interval between posts per asset
}

const DEFAULT_CONFIG: WhaleTrackConfig = {
  topTraderCount: 50,
  minPerpsUsd: 1_000_000,
  minSpotUsd: 100_000,
  spotFillTraderLimit: 5,
  changeThresholdPct: 30,
  postCooldownMs: 10 * 60 * 1000,
};

interface AssetSnapshot {
  totalLongUsd: number;
  totalShortUsd: number;
  longs: Map<string, number>;   // address -> sizeUsd
  shorts: Map<string, number>;  // address -> sizeUsd
  spot: Map<string, WhaleSpotFlow>; // market -> flow (untuk deteksi fill baru)
  lastPostAt: number;
}

export class PerpsScreeningAgent implements ScreeningAgent<WhalePositionSignal> {
  readonly domain = 'perps';
  private adapter: HyperliquidAdapter;
  private config: WhaleTrackConfig;
  private snapshots = new Map<string, AssetSnapshot>();

  constructor(adapter: HyperliquidAdapter, config?: Partial<WhaleTrackConfig>) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run a single whale-tracking pass. Returns reports ONLY for assets that
   * changed materially since the previous pass (or the first pass ever).
   */
  public async runScreeningPass(): Promise<AgentReport<WhalePositionSignal>[]> {
    console.log('[WHALE AGENT] Starting smart-money positioning pass...');
    const reports: AgentReport<WhalePositionSignal>[] = [];

    // Spot flow (shared across assets — aggregate dari userFills per trader)
    const spotFlowByMarket = new Map<string, WhaleSpotFlow>();

    // Perps: leaderboard per asset -> top addresses -> open positions + fills
    for (const coin of this.adapter.trackedAssets) {
      const traders = await this.adapter.fetchLeaderboardTraders(coin, this.config.topTraderCount);
      if (traders.length === 0) {
        console.log(`[WHALE AGENT] ⚪ ${coin}: leaderboard kosong (data tidak tersedia), skip.`);
        continue;
      }

      const returnByAddress = new Map(traders.map((t) => [t.address, t.returnPct]));
      const positions: Array<{ address: string; pos: HyperliquidPosition }> = [];
      const fillsSince = Date.now() - 5 * 60 * 1000;
      let fillReadCount = 0;
      for (const trader of traders) {
        const pos = await this.adapter.fetchClearinghouseState(trader.address);
        for (const p of pos) positions.push({ address: trader.address, pos: p });
        if (fillReadCount < this.config.spotFillTraderLimit) {
          const fills = await this.adapter.fetchUserFills(trader.address, fillsSince);
          this.mergeSpotFlow(spotFlowByMarket, this.aggregateSpotFlow(fills));
          fillReadCount += 1;
        }
        await this.sleep(30); // be gentle: ~30ms between wallet reads
      }

      const signal = this.buildSignal(coin, positions, returnByAddress, spotFlowByMarket);
      if (!this.isMaterialChange(coin, signal)) {
        console.log(`[WHALE AGENT] ⚪ ${coin}: tidak ada perubahan material, skip post.`);
        continue;
      }

      this.storeSnapshot(coin, signal);
      const payload = this.buildPayload(signal);
      reports.push({
        passed: true,
        signal,
        reason: signal.coin,
        confidence: 80,
        payload,
      });
      console.log(`[WHALE AGENT] 🐋 ${coin}: post (long $${(signal.totalLongUsd / 1e6).toFixed(2)}M / short $${(signal.totalShortUsd / 1e6).toFixed(2)}M)`);
    }

    return reports;
  }

  /** Merge hasil aggregateSpotFlow per trader ke peta spot flow global (per market). */
  private mergeSpotFlow(target: Map<string, WhaleSpotFlow>, incoming: Map<string, WhaleSpotFlow>): void {
    for (const [market, flow] of incoming) {
      const cur = target.get(market);
      if (!cur) {
        target.set(market, flow);
        continue;
      }
      cur.buyUsd += flow.buyUsd;
      cur.sellUsd += flow.sellUsd;
      cur.fillCount += flow.fillCount;
    }
  }

  /**
   * Aggregate open positions per trader into a per-asset whale signal.
   * Total long/short covers ALL tracked traders (no threshold); the detailed
   * per-trader lists only include positions >= minPerpsUsd.
   */
  public buildSignal(
    coin: string,
    positions: Array<{ address: string; pos: HyperliquidPosition }>,
    returnByAddress: Map<string, number>,
    spotFlow: Map<string, WhaleSpotFlow>,
  ): WhalePositionSignal {
    let totalLongUsd = 0;
    let totalShortUsd = 0;
    const longByAddress = new Map<string, WhaleTraderPosition>();
    const shortByAddress = new Map<string, WhaleTraderPosition>();

    for (const { address, pos } of positions) {
      if (pos.coin !== coin) continue;
      const returnPct = returnByAddress.get(address) ?? 0;
      if (pos.side === 'LONG') {
        totalLongUsd += pos.sizeUsd;
        const existing = longByAddress.get(address);
        if (existing) existing.sizeUsd += pos.sizeUsd;
        else longByAddress.set(address, { address, side: 'LONG', sizeUsd: pos.sizeUsd, entryPx: pos.entryPx, returnPct });
      } else {
        totalShortUsd += pos.sizeUsd;
        const existing = shortByAddress.get(address);
        if (existing) existing.sizeUsd += pos.sizeUsd;
        else shortByAddress.set(address, { address, side: 'SHORT', sizeUsd: pos.sizeUsd, entryPx: pos.entryPx, returnPct });
      }
    }

    const longTraders = [...longByAddress.values()].filter((t) => t.sizeUsd >= this.config.minPerpsUsd);
    const shortTraders = [...shortByAddress.values()].filter((t) => t.sizeUsd >= this.config.minPerpsUsd);

    return {
      coin,
      totalLongUsd,
      totalShortUsd,
      netUsd: totalLongUsd - totalShortUsd,
      longCount: longByAddress.size,
      shortCount: shortByAddress.size,
      longTraders,
      shortTraders,
      spotFlow: this.spotFlowForCoin(coin, spotFlow),
      generatedAt: Date.now(),
    };
  }

  /**
   * Compare the fresh signal against the stored snapshot and decide whether a
   * post is warranted: new/closed >= $1M position, net flip, >= 30% long/short
   * shift, or new >= $100k spot fill — all gated by per-asset cooldown.
   */
  public isMaterialChange(coin: string, signal: WhalePositionSignal): boolean {
    const prev = this.snapshots.get(coin);

    // First pass for this asset — always post the baseline.
    if (!prev) return true;

    // Cooldown: never post more often than configured per asset.
    if (Date.now() - prev.lastPostAt < this.config.postCooldownMs) return false;

    // New spot fill >= minSpotUsd since last post.
    if (this.hasNewSpotFlow(prev, signal)) return true;

    // >= 30% shift of total long OR total short.
    const longShiftPct = prev.totalLongUsd > 0
      ? Math.abs(signal.totalLongUsd - prev.totalLongUsd) / prev.totalLongUsd * 100
      : signal.totalLongUsd > 0 ? 100 : 0;
    const shortShiftPct = prev.totalShortUsd > 0
      ? Math.abs(signal.totalShortUsd - prev.totalShortUsd) / prev.totalShortUsd * 100
      : signal.totalShortUsd > 0 ? 100 : 0;
    if (longShiftPct >= this.config.changeThresholdPct || shortShiftPct >= this.config.changeThresholdPct) {
      return true;
    }

    // Net direction flip (incl. from flat).
    if ((prev.totalLongUsd >= prev.totalShortUsd) !== (signal.totalLongUsd >= signal.totalShortUsd)) {
      return true;
    }

    // Position-level: a >= $1M position opened or closed.
    return this.hasPositionChange(prev, signal);
  }

  private hasPositionChange(prev: AssetSnapshot, signal: WhalePositionSignal): boolean {
    const min = this.config.minPerpsUsd;
    const nowLongs = new Map(signal.longTraders.map((t) => [t.address, t.sizeUsd]));
    const nowShorts = new Map(signal.shortTraders.map((t) => [t.address, t.sizeUsd]));

    for (const [addr, size] of nowLongs) {
      const was = prev.longs.get(addr) ?? 0;
      if (size >= min && was < min) return true;
    }
    for (const [addr, size] of nowShorts) {
      const was = prev.shorts.get(addr) ?? 0;
      if (size >= min && was < min) return true;
    }
    for (const [addr, size] of prev.longs) {
      const now = nowLongs.get(addr) ?? 0;
      if (size >= min && now < min) return true;
    }
    for (const [addr, size] of prev.shorts) {
      const now = nowShorts.get(addr) ?? 0;
      if (size >= min && now < min) return true;
    }
    return false;
  }

  private hasNewSpotFlow(prev: AssetSnapshot, signal: WhalePositionSignal): boolean {
    for (const flow of signal.spotFlow) {
      const was = prev.spot.get(flow.market);
      if (!was) {
        if (flow.buyUsd > 0 || flow.sellUsd > 0) return true;
        continue;
      }
      if (flow.buyUsd > was.buyUsd || flow.sellUsd > was.sellUsd || flow.fillCount > was.fillCount) return true;
    }
    return false;
  }

  private storeSnapshot(coin: string, signal: WhalePositionSignal): void {
    this.snapshots.set(coin, {
      totalLongUsd: signal.totalLongUsd,
      totalShortUsd: signal.totalShortUsd,
      longs: new Map(signal.longTraders.map((t) => [t.address, t.sizeUsd])),
      shorts: new Map(signal.shortTraders.map((t) => [t.address, t.sizeUsd])),
      spot: new Map(signal.spotFlow.map((f) => [f.market, f])),
      lastPostAt: Date.now(),
    });
  }

  /** Aggregate spot fills per market — only fills >= minSpotUsd are counted. */
  public aggregateSpotFlow(fills: HyperliquidTradeFill[]): Map<string, WhaleSpotFlow> {
    const byMarket = new Map<string, WhaleSpotFlow>();
    for (const f of fills) {
      if (f.usd < this.config.minSpotUsd) continue;
      const entry = byMarket.get(f.coin) ?? { market: f.coin, buyUsd: 0, sellUsd: 0, fillCount: 0 };
      if (f.side === 'BUY') entry.buyUsd += f.usd;
      else entry.sellUsd += f.usd;
      entry.fillCount += 1;
      byMarket.set(f.coin, entry);
    }
    return byMarket;
  }

  /** Spot markets whose base coin matches a tracked asset (e.g. "BTC" -> "BTC/USDC"). */
  private spotFlowForCoin(coin: string, spotFlow: Map<string, WhaleSpotFlow>): WhaleSpotFlow[] {
    const prefix = `${coin}/`;
    return [...spotFlow.values()].filter((f) => f.market.startsWith(prefix));
  }

  /** Build call-card payload for the WHALE embed. */
  public buildPayload(signal: WhalePositionSignal): CallCardPayload {
    const fmtUsd = (v: number) => `$${(v / 1e6).toFixed(2)}M`;
    const lines: string[] = [
      `${signal.coin}: net ${fmtUsd(signal.netUsd)} (${signal.longCount} long vs ${signal.shortCount} short trader)`,
      `Long ${fmtUsd(signal.totalLongUsd)} | Short ${fmtUsd(signal.totalShortUsd)}`,
    ];
    for (const flow of signal.spotFlow) {
      lines.push(`Spot ${flow.market}: buy ${fmtUsd(flow.buyUsd)} / sell ${fmtUsd(flow.sellUsd)} (${flow.fillCount} fill)`);
    }

    return {
      domain: 'WHALE',
      title: `WHALE WATCH: ${signal.coin}`,
      symbol: signal.coin,
      contractAddress: signal.coin,
      network: 'Hyperliquid',
      priceUsd: fmtUsd(signal.netUsd),
      confidenceScore: 80,
      aiThesis: lines.join(' • '),
      securityAuditPassed: true,
      socialHypeScore: 80,
      liquidityUsd: signal.totalLongUsd + signal.totalShortUsd,
      volume1hUsd: signal.totalLongUsd + signal.totalShortUsd,
      dexScreenerUrl: `https://app.hyperliquid.xyz/trade/${signal.coin}`,
      whaleReport: {
        coin: signal.coin,
        totalLongUsd: signal.totalLongUsd,
        totalShortUsd: signal.totalShortUsd,
        netUsd: signal.netUsd,
        longCount: signal.longCount,
        shortCount: signal.shortCount,
        longTraders: signal.longTraders.map((t) => ({ address: t.address, sizeUsd: t.sizeUsd, entryPx: t.entryPx, returnPct: t.returnPct })),
        shortTraders: signal.shortTraders.map((t) => ({ address: t.address, sizeUsd: t.sizeUsd, entryPx: t.entryPx, returnPct: t.returnPct })),
        spotFlow: signal.spotFlow,
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
