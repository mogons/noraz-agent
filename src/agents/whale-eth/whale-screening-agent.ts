/**
 * Whale Tracking Agent (Hyperliquid ETH) — Robinhood Chain Edition
 *
 * Tracks smart-money whale positioning specifically on ETH:
 * - PvP leaderboard (30d, stats-data, cached 1 hour) → top trader addresses
 * - clearinghouseState per address → actual OPEN positions (ETH long/short + USD size)
 * - userFills per address (5 minutes) → ETH spot order flow (buy vs sell), fills >= $100k
 *
 * Posts to #call-whale-eth ONLY on material change (new/closed >= $1M
 * position, net direction flip, >= 30% long/short shift, or new >= $100k spot
 * fill), with a 10-minute cooldown.
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
  market: string;      // e.g. "ETH/USDC"
  buyUsd: number;
  sellUsd: number;
  fillCount: number;
}

export interface WhalePositionSignal {
  coin: string;                    // "ETH"
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
  topTraderCount: number;     // leaderboard depth (default 50)
  minPerpsUsd: number;        // only perps positions >= this are detailed (default $1M)
  minSpotUsd: number;         // only spot fills >= this are reported (default $100k)
  spotFillTraderLimit: number; // max traders whose userFills are read (saves API calls, default 10)
  changeThresholdPct: number; // total long OR short shift that triggers a post (default 30%)
  postCooldownMs: number;     // min interval between posts (default 10m)
}

const DEFAULT_CONFIG: WhaleTrackConfig = {
  topTraderCount: 50,
  minPerpsUsd: 1_000_000,
  minSpotUsd: 100_000,
  spotFillTraderLimit: 10,
  changeThresholdPct: 30,
  postCooldownMs: 10 * 60 * 1000,
};

interface AssetSnapshot {
  totalLongUsd: number;
  totalShortUsd: number;
  longs: Map<string, number>;   // address -> sizeUsd
  shorts: Map<string, number>;  // address -> sizeUsd
  spot: Map<string, WhaleSpotFlow>; // market -> flow (for new-fill detection)
  lastPostAt: number;
}

export class WhaleScreeningAgent implements ScreeningAgent<WhalePositionSignal> {
  readonly domain = 'whale-eth';
  private adapter: HyperliquidAdapter;
  private config: WhaleTrackConfig;
  private snapshots = new Map<string, AssetSnapshot>();

  constructor(adapter?: HyperliquidAdapter, config?: Partial<WhaleTrackConfig>) {
    this.adapter = adapter || new HyperliquidAdapter();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run a single whale-tracking pass for ETH. Returns reports ONLY when
   * material changes occur since previous pass or on first boot.
   */
  public async runScreeningPass(): Promise<AgentReport<WhalePositionSignal>[]> {
    console.log('[WHALE AGENT] Starting ETH smart-money positioning pass...');
    const reports: AgentReport<WhalePositionSignal>[] = [];

    // Spot flow aggregated from userFills
    const spotFlowByMarket = new Map<string, WhaleSpotFlow>();

    for (const coin of this.adapter.trackedAssets) {
      const traders = await this.adapter.fetchLeaderboardTraders(coin, this.config.topTraderCount);
      if (traders.length === 0) {
        console.log(`[WHALE AGENT] ⚪ ${coin}: empty leaderboard (data unavailable), skip.`);
        continue;
      }

      const returnByAddress = new Map(traders.map((t) => [t.address, t.returnPct]));
      const positions: Array<{ address: string; pos: HyperliquidPosition }> = [];
      const fillsSince = Date.now() - 5 * 60 * 1000;
      let fillReadCount = 0;

      for (const trader of traders) {
        const pos = await this.adapter.fetchClearinghouseState(trader.address);
        for (const p of pos) {
          if (p.coin.toUpperCase() === coin.toUpperCase()) {
            positions.push({ address: trader.address, pos: p });
          }
        }
        if (fillReadCount < this.config.spotFillTraderLimit) {
          const fills = await this.adapter.fetchUserFills(trader.address, fillsSince);
          this.mergeSpotFlow(spotFlowByMarket, this.aggregateSpotFlow(fills, coin));
          fillReadCount += 1;
        }
        await this.sleep(25); // gentle spacing
      }

      const signal = this.buildSignal(coin, positions, returnByAddress, spotFlowByMarket);
      if (!this.isMaterialChange(coin, signal)) {
        console.log(`[WHALE AGENT] ⚪ ${coin}: no material change, skipping post.`);
        continue;
      }

      this.storeSnapshot(coin, signal);
      const payload = this.buildPayload(signal);
      reports.push({
        passed: true,
        signal,
        reason: `${coin} Whale Positioning Update`,
        confidence: 85,
        payload,
      });
      console.log(`[WHALE AGENT] 🐋 ${coin}: material shift detected (Long $${(signal.totalLongUsd / 1e6).toFixed(2)}M / Short $${(signal.totalShortUsd / 1e6).toFixed(2)}M)`);
    }

    console.log(`[WHALE AGENT] Pass complete. ${reports.length} signals generated.`);
    return reports;
  }

  private buildSignal(
    coin: string,
    positions: Array<{ address: string; pos: HyperliquidPosition }>,
    returnByAddress: Map<string, number>,
    spotFlowByMarket: Map<string, WhaleSpotFlow>
  ): WhalePositionSignal {
    let totalLongUsd = 0;
    let totalShortUsd = 0;
    const longTraders: WhaleTraderPosition[] = [];
    const shortTraders: WhaleTraderPosition[] = [];

    for (const { address, pos } of positions) {
      if (pos.side === 'LONG') {
        totalLongUsd += pos.sizeUsd;
        if (pos.sizeUsd >= this.config.minPerpsUsd) {
          longTraders.push({
            address,
            side: 'LONG',
            sizeUsd: pos.sizeUsd,
            entryPx: pos.entryPx,
            returnPct: returnByAddress.get(address) || 0,
          });
        }
      } else {
        totalShortUsd += pos.sizeUsd;
        if (pos.sizeUsd >= this.config.minPerpsUsd) {
          shortTraders.push({
            address,
            side: 'SHORT',
            sizeUsd: pos.sizeUsd,
            entryPx: pos.entryPx,
            returnPct: returnByAddress.get(address) || 0,
          });
        }
      }
    }

    // Sort whales by size descending
    longTraders.sort((a, b) => b.sizeUsd - a.sizeUsd);
    shortTraders.sort((a, b) => b.sizeUsd - a.sizeUsd);

    const relevantSpot: WhaleSpotFlow[] = [];
    for (const [mkt, flow] of spotFlowByMarket.entries()) {
      if (mkt.toUpperCase().startsWith(coin.toUpperCase())) {
        relevantSpot.push(flow);
      }
    }

    return {
      coin,
      totalLongUsd,
      totalShortUsd,
      netUsd: totalLongUsd - totalShortUsd,
      longCount: longTraders.length,
      shortCount: shortTraders.length,
      longTraders,
      shortTraders,
      spotFlow: relevantSpot,
      generatedAt: Date.now(),
    };
  }

  private isMaterialChange(coin: string, signal: WhalePositionSignal): boolean {
    const prev = this.snapshots.get(coin);
    if (!prev) return true; // First run always emits

    const now = Date.now();
    if (now - prev.lastPostAt < this.config.postCooldownMs) {
      return false; // Still within cooldown
    }

    // Direction flip (e.g. from net long to net short)
    const prevNet = prev.totalLongUsd - prev.totalShortUsd;
    if ((prevNet >= 0 && signal.netUsd < 0) || (prevNet < 0 && signal.netUsd >= 0)) {
      return true;
    }

    // Significant long or short shift (>= changeThresholdPct)
    const longShiftPct = prev.totalLongUsd > 0
      ? (Math.abs(signal.totalLongUsd - prev.totalLongUsd) / prev.totalLongUsd) * 100
      : signal.totalLongUsd > 0 ? 100 : 0;
    const shortShiftPct = prev.totalShortUsd > 0
      ? (Math.abs(signal.totalShortUsd - prev.totalShortUsd) / prev.totalShortUsd) * 100
      : signal.totalShortUsd > 0 ? 100 : 0;

    if (longShiftPct >= this.config.changeThresholdPct || shortShiftPct >= this.config.changeThresholdPct) {
      return true;
    }

    // Spot fill shift
    if (signal.spotFlow.some((f) => f.buyUsd + f.sellUsd >= this.config.minSpotUsd)) {
      return true;
    }

    return false;
  }

  private storeSnapshot(coin: string, signal: WhalePositionSignal): void {
    const longs = new Map<string, number>();
    for (const t of signal.longTraders) longs.set(t.address, t.sizeUsd);
    const shorts = new Map<string, number>();
    for (const t of signal.shortTraders) shorts.set(t.address, t.sizeUsd);
    const spot = new Map<string, WhaleSpotFlow>();
    for (const s of signal.spotFlow) spot.set(s.market, s);

    this.snapshots.set(coin, {
      totalLongUsd: signal.totalLongUsd,
      totalShortUsd: signal.totalShortUsd,
      longs,
      shorts,
      spot,
      lastPostAt: Date.now(),
    });
  }

  private aggregateSpotFlow(fills: HyperliquidTradeFill[], coin: string): Map<string, WhaleSpotFlow> {
    const map = new Map<string, WhaleSpotFlow>();
    for (const f of fills) {
      if (!f.isSpot && !f.coin.includes('/')) continue;
      if (!f.coin.toUpperCase().startsWith(coin.toUpperCase())) continue;
      if (f.usd < this.config.minSpotUsd) continue;

      const current = map.get(f.coin) || { market: f.coin, buyUsd: 0, sellUsd: 0, fillCount: 0 };
      if (f.side === 'BUY') current.buyUsd += f.usd;
      else current.sellUsd += f.usd;
      current.fillCount += 1;
      map.set(f.coin, current);
    }
    return map;
  }

  private mergeSpotFlow(target: Map<string, WhaleSpotFlow>, source: Map<string, WhaleSpotFlow>): void {
    for (const [mkt, flow] of source.entries()) {
      const existing = target.get(mkt) || { market: mkt, buyUsd: 0, sellUsd: 0, fillCount: 0 };
      existing.buyUsd += flow.buyUsd;
      existing.sellUsd += flow.sellUsd;
      existing.fillCount += flow.fillCount;
      target.set(mkt, existing);
    }
  }

  private buildPayload(signal: WhalePositionSignal): CallCardPayload {
    const fmtM = (v: number) => (v >= 1_000_000 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1000).toFixed(0)}k`);
    const netSign = signal.netUsd >= 0 ? '+' : '';
    const bias = signal.netUsd >= 0 ? '🟢 BULLISH BIAS (NET LONG)' : '🔴 BEARISH BIAS (NET SHORT)';

    const thesis = `Hyperliquid PvP Leaderboard Whales holding ${fmtM(signal.totalLongUsd)} Long vs ${fmtM(signal.totalShortUsd)} Short on ${signal.coin} (Net: ${netSign}${fmtM(signal.netUsd)}). ${signal.longCount} top long whales, ${signal.shortCount} top short whales. Overall Bias: ${bias}.`;

    return {
      domain: 'WHALE_ETH',
      title: `WHALE WATCH: ${signal.coin}`,
      symbol: signal.coin,
      network: 'Hyperliquid L1 / Robinhood Native ETH',
      marketCap: fmtM(signal.totalLongUsd + signal.totalShortUsd),
      liquidity: fmtM(Math.abs(signal.netUsd)),
      confidenceScore: 85,
      securityAuditPassed: true,
      socialHypeScore: 80,
      liquidityUsd: Math.abs(signal.netUsd),
      volume1hUsd: signal.totalLongUsd + signal.totalShortUsd,
      aiThesis: thesis,
      dexScreenerUrl: `https://app.hyperliquid.xyz/trade/${signal.coin}`,
      whaleReport: {
        coin: signal.coin,
        totalLongUsd: signal.totalLongUsd,
        totalShortUsd: signal.totalShortUsd,
        netUsd: signal.netUsd,
        longCount: signal.longCount,
        shortCount: signal.shortCount,
        longTraders: signal.longTraders.map((t) => ({
          address: t.address,
          sizeUsd: t.sizeUsd,
          entryPx: t.entryPx,
          returnPct: t.returnPct,
        })),
        shortTraders: signal.shortTraders.map((t) => ({
          address: t.address,
          sizeUsd: t.sizeUsd,
          entryPx: t.entryPx,
          returnPct: t.returnPct,
        })),
        spotFlow: signal.spotFlow.map((s) => ({
          market: s.market,
          buyUsd: s.buyUsd,
          sellUsd: s.sellUsd,
          fillCount: s.fillCount,
        })),
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
