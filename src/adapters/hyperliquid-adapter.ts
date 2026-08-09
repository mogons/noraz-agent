/**
 * Hyperliquid Adapter — Whale Positioning Tracker
 *
 * Reads Hyperliquid L1 DEX data for smart-money tracking:
 * - stats-data leaderboard (PvP, 30d, cached 1 hour) → top trader addresses
 *   (the /info "leaderboard" endpoint has been removed by Hyperliquid — 422; the live
 *   one is https://stats-data.hyperliquid.xyz/Mainnet/leaderboard)
 * - clearinghouseState per address → open positions (signed size, USD value)
 * - userFills per address → recent fills (incl. spot) for whale flow detection
 *
 * API Docs: https://hyperliquid.gitbook.io/hyperliquid-docs
 */

export interface HyperliquidTrader {
  address: string;
  returnPct: number;   // PvP 30d return % (month ROI * 100)
  pnlUsd: number;      // PvP 30d PnL USD
}

export interface HyperliquidPosition {
  coin: string;           // e.g. "BTC", "ETH", "SOL"
  side: 'LONG' | 'SHORT'; // derived from signed size
  sizeUsd: number;        // position notional value in USD
  entryPx: number;
  leverage: number;       // e.g. 10
  funding: number;        // 8h funding rate
}

export interface HyperliquidTradeFill {
  coin: string;        // perps: "BTC"; spot: "BTC/USDC" etc.
  isSpot: boolean;
  px: number;
  sz: number;
  usd: number;         // px * sz
  side: 'BUY' | 'SELL'; // derived from order side
  user: string;
  timestamp: number;
}

export class HyperliquidAdapter {
  private infoApiUrl = 'https://api.hyperliquid.xyz/info';
  private statsDataUrl = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard?window=30d&asset=0';

  // Assets tracked by the whale agent (perps indices live on Hyperliquid main dex).
  // GOLD & XYZ100 are no longer in the main dex universe (XYZ100 moved to the "xyz" dex).
  public readonly trackedAssets: string[] = ['BTC', 'ETH', 'SOL', 'HYPE'];

  // PvP leaderboard cache (stats-data response is large: ~41k traders / tens of MB) —
  // fetched at most once per hour, not per pass. The server ignores the asset/size params.
  private leaderboardCache: HyperliquidTrader[] | null = null;
  private leaderboardCachedAt = 0;
  private static readonly LEADERBOARD_TTL_MS = 60 * 60 * 1000;

  /**
   * Top PvP leaderboard traders (30d window) — from stats-data.hyperliquid.xyz
   * (the /info "leaderboard" endpoint has been removed by Hyperliquid, always HTTP 422).
   * The server ignores the coin/asset params — the global list is sorted by account value
   * (largest whales), cached for 1 hour (large payload), then sliced to top N. Positions
   * per coin are filtered during aggregation (clearinghouseState).
   */
  public async fetchLeaderboardTraders(
    coin: string,
    topN: number,
    _timeWindow: '30d' = '30d',
  ): Promise<HyperliquidTrader[]> {
    try {
      if (!this.leaderboardCache || Date.now() - this.leaderboardCachedAt >= HyperliquidAdapter.LEADERBOARD_TTL_MS) {
        const res = await fetch(this.statsDataUrl, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) {
          console.error(`[HYPERLIQUID] leaderboard stats-data HTTP ${res.status}`);
          return [];
        }
        const data: any = await res.json();
        const rows: any[] = Array.isArray(data?.leaderboardRows) ? data.leaderboardRows : [];
        this.leaderboardCache = rows
          .map((e: any) => {
            const wp: any[] = Array.isArray(e?.windowPerformances) ? e.windowPerformances : [];
            // 30d window → use the 'month' bucket (roi/pnl sent as STRING)
            const perf = wp.find((x) => Array.isArray(x) && x[0] === 'month' && x[1]);
            const roi = Number(perf?.[1]?.roi ?? 0);
            const pnl = Number(perf?.[1]?.pnl ?? 0);
            return {
              address: String(e?.ethAddress || ''),
              returnPct: Number((roi * 100).toFixed(2)) || 0,
              pnlUsd: Number.isFinite(pnl) ? pnl : 0,
              accountValue: Number(e?.accountValue ?? 0),
            };
          })
          .filter((t: HyperliquidTrader & { accountValue: number }) => t.address.length > 0)
          .sort((a, b) => b.accountValue - a.accountValue)
          .map((t) => ({ address: t.address, returnPct: t.returnPct, pnlUsd: t.pnlUsd }));
        this.leaderboardCachedAt = Date.now();
        console.log(`[HYPERLIQUID] leaderboard cached: ${this.leaderboardCache.length} traders (stats-data, 30d, TTL 1h)`);
      }
      return this.leaderboardCache.slice(0, topN);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[HYPERLIQUID] leaderboard(${coin}) failed: ${message}`);
      return [];
    }
  }

  /**
   * Open positions (clearinghouse state) for one wallet address.
   * `szi` is signed: > 0 = LONG, < 0 = SHORT. `positionValue` is in USD.
   */
  public async fetchClearinghouseState(user: string): Promise<HyperliquidPosition[]> {
    try {
      const res = await fetch(this.infoApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearinghouseState', user }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.error(`[HYPERLIQUID] clearinghouseState HTTP ${res.status} (${user.slice(0, 6)}…)`);
        return [];
      }
      const data: any = await res.json();
      const positions = Array.isArray(data?.assetPositions) ? data.assetPositions : [];
      const out: HyperliquidPosition[] = [];
      for (const ap of positions) {
        const pos = ap?.position;
        if (!pos) continue;
        const coin = String(pos.coin || '');
        const szi = Number(pos.szi) || 0;
        const positionValue = Number(pos.positionValue) || 0;
        if (!coin || szi === 0 || positionValue <= 0) continue;
        out.push({
          coin,
          side: szi > 0 ? 'LONG' : 'SHORT',
          sizeUsd: positionValue,
          entryPx: Number(pos.entryPx) || 0,
          leverage: Number(pos.leverage?.value) || 0,
          funding: Number(pos.funding) || 0,
        });
      }
      return out;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[HYPERLIQUID] clearinghouseState(${user.slice(0, 6)}…) failed: ${message}`);
      return [];
    }
  }

  /**
   * Recent fills (perps + spot) for one wallet since `sinceMs`.
   * Replaces the "leaderboardTrades" endpoint removed by Hyperliquid (422).
   * Spot coins come back as "BTC/USDC" style (isSpot = coin contains '/').
   */
  public async fetchUserFills(user: string, sinceMs: number): Promise<HyperliquidTradeFill[]> {
    try {
      const res = await fetch(this.infoApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'userFills', user, startTime: sinceMs }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.error(`[HYPERLIQUID] userFills HTTP ${res.status} (${user.slice(0, 6)}…)`);
        return [];
      }
      const data: any = await res.json();
      if (!Array.isArray(data)) return [];
      return data
        .map((t: any) => {
          const coin = String(t.coin || '');
          const px = Number(t.px) || 0;
          const sz = Number(t.sz) || 0;
          const side: 'BUY' | 'SELL' | null = t.side === 'B' ? 'BUY' : t.side === 'A' ? 'SELL' : null;
          if (!coin || px <= 0 || sz <= 0 || !side) return null;
          return {
            coin,
            isSpot: coin.includes('/'),
            px,
            sz,
            usd: px * sz,
            side,
            user,
            timestamp: Number(t.time) || 0,
          };
        })
        .filter((f: HyperliquidTradeFill | null): f is HyperliquidTradeFill => f !== null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[HYPERLIQUID] userFills(${user.slice(0, 6)}…) failed: ${message}`);
      return [];
    }
  }
}
