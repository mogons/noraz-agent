/**
 * Hyperliquid Adapter — Whale Positioning Tracker
 *
 * Reads Hyperliquid L1 DEX data for smart-money tracking:
 * - leaderboard (PvP, 7d) → top trader addresses per asset
 * - clearinghouseState per address → open positions (signed size, USD value)
 * - leaderboardTrades (5m) → recent fills from leaderboard participants (incl. spot)
 *
 * API Docs: https://hyperliquid.gitbook.io/hyperliquid-docs
 */

export interface HyperliquidTrader {
  address: string;
  returnPct: number;   // PvP 7d return %
  pnlUsd: number;
}

export interface HyperliquidPosition {
  coin: string;           // e.g. "BTC", "GOLD", "XYZ100"
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

export interface HyperliquidLeaderboardTrades {
  fills: HyperliquidTradeFill[];
  fetchedAt: number;
}

export class HyperliquidAdapter {
  private infoApiUrl = 'https://api.hyperliquid.xyz/info';

  // Assets tracked by the whale agent (perps indices live on Hyperliquid).
  public readonly trackedAssets: string[] = ['BTC', 'GOLD', 'XYZ100'];

  // Live name → index resolution cache (from meta.universe), refreshed per fetch.
  // Indices MUST come from the live meta() response so perps never reads the
  // wrong coin's leaderboard/positions.
  private universeByName: Map<string, number> | null = null;
  private universeFetchedAt = 0;
  private static readonly UNIVERSE_TTL_MS = 5 * 60 * 1000; // refresh every 5 min

  /**
   * Resolve a coin's current asset index from the live meta() universe.
   * meta.universe is an array where position = asset index. Cached for TTL.
   * Returns null when the coin is not listed (fail-closed — never fall back to a stale map).
   */
  private async resolveAssetIndex(coin: string): Promise<number | null> {
    const upper = coin.toUpperCase();
    if (this.universeByName && Date.now() - this.universeFetchedAt < HyperliquidAdapter.UNIVERSE_TTL_MS) {
      return this.universeByName.get(upper) ?? null;
    }
    try {
      const res = await fetch(this.infoApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      });
      if (!res.ok) {
        console.error(`[HYPERLIQUID] meta() HTTP ${res.status} — cannot resolve indices`);
        return this.universeByName?.get(upper) ?? null;
      }
      const meta: any = await res.json();
      if (Array.isArray(meta?.universe)) {
        const map = new Map<string, number>();
        meta.universe.forEach((u: any, idx: number) => {
          if (typeof u?.name === 'string') map.set(u.name.toUpperCase(), idx);
        });
        this.universeByName = map;
        this.universeFetchedAt = Date.now();
        return map.get(upper) ?? null;
      }
      console.error('[HYPERLIQUID] meta() response missing universe array');
      return this.universeByName?.get(upper) ?? null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[HYPERLIQUID] meta() fetch failed (${message}) — using cached universe if available`);
      return this.universeByName?.get(upper) ?? null;
    }
  }

  /**
   * Top PvP leaderboard traders for one asset (7d window).
   * `asset` 0 = all assets; a specific index = that perps market.
   * Returns the top `topN` traders sorted by PvP PnL.
   */
  public async fetchLeaderboardTraders(
    coin: string,
    topN: number,
    timeWindow: '7d' = '7d',
  ): Promise<HyperliquidTrader[]> {
    const assetIndex = await this.resolveAssetIndex(coin);
    if (assetIndex === null) return [];
    try {
      const res = await fetch(this.infoApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'leaderboard', timeWindow, asset: assetIndex }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.error(`[HYPERLIQUID] leaderboard(${coin}) HTTP ${res.status}`);
        return [];
      }
      const data: any = await res.json();
      if (!Array.isArray(data)) return [];
      return data
        .slice(0, topN)
        .map((t: any) => ({
          address: String(t.address || ''),
          returnPct: Number(t.returnPct) || 0,
          pnlUsd: Number(t.pnl) || 0,
        }))
        .filter((t: HyperliquidTrader) => t.address.length > 0);
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
   * Recent fills from all leaderboard participants (perps + spot) within the
   * window. Spot coins come back as "BTC/USDC" style with isSpot=true.
   */
  public async fetchLeaderboardTrades(
    timeWindow: '5m' = '5m',
  ): Promise<HyperliquidLeaderboardTrades> {
    try {
      const res = await fetch(this.infoApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'leaderboardTrades', timeWindow }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.error(`[HYPERLIQUID] leaderboardTrades HTTP ${res.status}`);
        return { fills: [], fetchedAt: Date.now() };
      }
      const data: any = await res.json();
      const raw: any[] = Array.isArray(data?.trades) ? data.trades : [];
      const fills: HyperliquidTradeFill[] = raw
        .map((t) => {
          const coin = String(t.coin || '');
          const px = Number(t.px) || 0;
          const sz = Number(t.sz) || 0;
          const side = t.side === 'B' ? 'BUY' : t.side === 'A' ? 'SELL' : null;
          if (!coin || px <= 0 || sz <= 0 || !side) return null;
          return {
            coin,
            isSpot: Boolean(t.isSpot),
            px,
            sz,
            usd: px * sz,
            side,
            user: String(t.user || ''),
            timestamp: Number(t.t) || 0,
          };
        })
        .filter((f): f is HyperliquidTradeFill => f !== null);
      return { fills, fetchedAt: Date.now() };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[HYPERLIQUID] leaderboardTrades failed: ${message}`);
      return { fills: [], fetchedAt: Date.now() };
    }
  }
}
