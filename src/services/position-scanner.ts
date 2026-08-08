import { PositionManager } from '../position/position-manager.js';
import { WalletService } from './wallet-service.js';
import { StateStore } from './state-store.js';

export interface PositionAlert {
  type: string;
  reason: string;
  address: string;
}

/**
 * PositionScanner — scans the user's REAL positions across all domains and
 * feeds them into the PositionManager lifecycle (alerts only fire when a
 * position actually exists; no position = no alert, fail-closed).
 *
 * Domains:
 *  - perps:     Hyperliquid Info API `clearinghouseState` (EVM wallet)
 *  - lp-solana: Meteora DLMM Data API `/portfolio/open` (Solana pubkey)
 *  - prediction: Polymarket data-api `/positions` (EVM wallet)
 *  - meme + lp-robinhood: already handled by WalletTracker (RPC scans)
 *  - nft:       OpenSea owned-NFT scan (EVM wallet)
 */
export class PositionScanner {
  private positionManager: PositionManager;
  private walletService?: WalletService;
  private stateStore?: StateStore;

  constructor(deps: { positionManager: PositionManager; walletService?: WalletService; stateStore?: StateStore }) {
    this.positionManager = deps.positionManager;
    this.walletService = deps.walletService;
    this.stateStore = deps.stateStore;
  }

  /**
   * Scan all external domains. Fail-closed: any missing wallet / failed API
   * returns [] (never fabricates positions, never triggers alerts).
   */
  public async scanAll(): Promise<PositionAlert[]> {
    const alerts: PositionAlert[] = [];
    const [perps, lp, prediction, nft] = await Promise.all([
      this.scanPerps(),
      this.scanLPSolana(),
      this.scanPrediction(),
      this.scanNFT(),
    ]);
    alerts.push(...perps, ...lp, ...prediction, ...nft);
    return alerts;
  }

  // ─── PERPS (Hyperliquid) ────────────────────────────────────────────────

  private async scanPerps(): Promise<PositionAlert[]> {
    const alerts: PositionAlert[] = [];
    let evmAddress: string;
    try {
      evmAddress = this.walletService?.getEvmAddress() || '';
    } catch {
      return alerts;
    }
    if (!evmAddress) return alerts;

    try {
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearinghouseState', user: evmAddress }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return alerts;
      const data = (await res.json()) as {
        assetPositions?: Array<{
          position: {
            coin: string;
            szi: string;
            entryPx: string;
            positionValue: string;
            unrealizedPnl: string;
            leverage: { value: number; isCross: boolean };
          };
        }>;
      };
      const positions = data.assetPositions || [];
      for (const p of positions) {
        const pos = p.position;
        const coin = pos.coin;
        const entryPx = Number(pos.entryPx) || 0;
        const positionValue = Number(pos.positionValue) || 0;
        const unrealizedPnl = Number(pos.unrealizedPnl) || 0;
        if (!coin || entryPx <= 0 || positionValue <= 0) continue;

        // Feed PositionManager lifecycle — create if missing, update if exists.
        const id = `perps:${coin}`;
        const existing = this.positionManager.getActivePositions().find((x) => x.id === id);
        if (!existing) {
          this.positionManager.addPosition({
            id,
            symbol: coin,
            contractAddress: `perps:${coin}`,
            entryPriceUsd: entryPx,
            currentPriceUsd: entryPx * (1 + unrealizedPnl / positionValue),
            amount: Math.abs(Number(pos.szi) || 0),
            highWaterMarkUsd: entryPx,
          });
        } else {
          const currentPrice = entryPx * (1 + unrealizedPnl / positionValue);
          const res2 = this.positionManager.updateMemePosition(id, currentPrice);
          // -50% drawdown from entry already fires a CRITICAL alert via
          // updateMemePosition; surface the PnL too for perps context.
          if (res2.triggerAlert) {
            alerts.push({ type: res2.type, reason: res2.reason || '', address: `perps:${coin}` });
          }
        }
      }
      // Remove tracked perps positions no longer held (fail-closed: only when
      // the scan succeeded).
      for (const tracked of this.positionManager.getActivePositions()) {
        if (tracked.id.startsWith('perps:') && !positions.some((p) => `perps:${p.position.coin}` === tracked.id)) {
          this.positionManager.removePosition(tracked.id);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[POSITION SCANNER] Perps scan failed (fail-closed): ${message}`);
    }
    return alerts;
  }

  // ─── LP SOLANA (Meteora DLMM Data API) ──────────────────────────────────

  private async scanLPSolana(): Promise<PositionAlert[]> {
    const alerts: PositionAlert[] = [];
    let solanaAddress: string;
    try {
      solanaAddress = this.walletService?.getSolanaAddress() || '';
    } catch {
      return alerts;
    }
    if (!solanaAddress) return alerts;

    try {
      const res = await fetch(
        `https://dlmm.datapi.meteora.ag/portfolio/open?user=${solanaAddress}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) return alerts;
      const data = (await res.json()) as { positions?: Array<{ pool: { address: string; name: string } }> };
      const positions = data.positions || [];
      const heldPoolIds = new Set(positions.map((p) => p.pool.address));

      for (const p of positions) {
        const pool = p.pool;
        const id = `lp:${pool.address}`;
        const existing = this.positionManager.getActiveLpPositions().find((x) => x.id === id);
        if (!existing) {
          this.positionManager.addLpPosition({
            id,
            poolAddress: pool.address,
            pairName: pool.name,
            network: 'Solana',
            isOutOfRange: false,
            currentVolumeToActiveTvl4h: 0,
            currentFeesToTvlRatio4h: 0,
            currentOrganicVolumeScore4h: 100,
          });
        }
      }
      // Remove LP positions no longer held.
      for (const tracked of this.positionManager.getActiveLpPositions()) {
        if (!heldPoolIds.has(tracked.poolAddress)) {
          this.positionManager.removeLpPosition(tracked.id);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[POSITION SCANNER] LP Solana scan failed (fail-closed): ${message}`);
    }
    return alerts;
  }

  // ─── PREDICTION (Polymarket data-api) ───────────────────────────────────

  private async scanPrediction(): Promise<PositionAlert[]> {    const alerts: PositionAlert[] = [];
    let evmAddress: string;
    try {
      evmAddress = this.walletService?.getEvmAddress() || '';
    } catch {
      return alerts;
    }
    if (!evmAddress) return alerts;

    try {
      const res = await fetch(
        `https://data-api.polymarket.com/positions?user=${evmAddress}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) return alerts;
      const data = (await res.json()) as Array<{
        conditionId: string;
        size: number;
        avgPrice: number;
        currentValue: number;
        percentPnl: number;
        curPrice: number;
      }>;
      const positions = Array.isArray(data) ? data.filter((p) => p.size > 0 && p.currentValue > 0) : [];
      const heldIds = new Set(positions.map((p) => p.conditionId));

      for (const p of positions) {
        const id = `pred:${p.conditionId}`;
        const existing = this.positionManager.getActivePositions().find((x) => x.id === id);
        if (!existing) {
          this.positionManager.addPosition({
            id,
            symbol: `MARKET-${p.conditionId.slice(0, 6)}`,
            contractAddress: p.conditionId,
            entryPriceUsd: p.avgPrice || 0,
            currentPriceUsd: p.curPrice || p.avgPrice || 0,
            amount: p.size,
            highWaterMarkUsd: p.avgPrice || 0,
          });
        } else {
          // -50% value drop triggers CRITICAL via updateMemePosition
          const res2 = this.positionManager.updateMemePosition(id, p.curPrice || p.avgPrice || 0);
          if (res2.triggerAlert) {
            alerts.push({ type: res2.type, reason: res2.reason || '', address: p.conditionId });
          }
        }
      }
      for (const tracked of this.positionManager.getActivePositions()) {
        if (tracked.id.startsWith('pred:') && !heldIds.has(tracked.id.slice(5))) {
          this.positionManager.removePosition(tracked.id);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[POSITION SCANNER] Prediction scan failed (fail-closed): ${message}`);
    }
    return alerts;
  }

  // ─── NFT (OpenSea owned NFTs vs tracked collections) ────────────────────

  private async scanNFT(): Promise<PositionAlert[]> {
    const alerts: PositionAlert[] = [];
    let evmAddress: string;
    try {
      evmAddress = this.walletService?.getEvmAddress() || '';
    } catch {
      return alerts;
    }
    if (!evmAddress) return alerts;

    const trackedSlugs = (this.stateStore?.getTrackedNftCollections() || []).map((s) => s.toLowerCase());
    if (trackedSlugs.length === 0) return alerts; // tidak ada koleksi di-track → skip

    try {
      const apiKey = process.env.OPENSEA_API_KEY || '';
      const res = await fetch(
        `https://api.opensea.io/api/v2/chain/ethereum/account/${evmAddress}/nfts?limit=50`,
        { headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) return alerts;
      const data = (await res.json()) as { nfts?: Array<{ identifier: string; collection: string; name?: string }> };
      const owned = data.nfts || [];

      // Kelompokkan NFT per collection yang di-track
      const heldPerSlug = new Map<string, string[]>();
      for (const n of owned) {
        const slug = (n.collection || '').toLowerCase();
        if (trackedSlugs.includes(slug)) {
          const list = heldPerSlug.get(slug) || [];
          list.push(n.identifier);
          heldPerSlug.set(slug, list);
        }
      }

      for (const slug of trackedSlugs) {
        const tokenIds = heldPerSlug.get(slug) || [];
        if (tokenIds.length === 0) continue;

        // Ambil floor price collection (ETH) untuk entry/current price
        const floorRes = await fetch(`https://api.opensea.io/api/v2/collections/${slug}`, {
          headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        let floorEth = 0;
        if (floorRes.ok) {
          const coll = (await floorRes.json()) as { collection?: string; name?: string; stats?: { floor_price?: number; sales?: { velocity?: number } } };
          floorEth = Number(coll?.stats?.floor_price) || 0;
        }

        const id = `nft:${slug}`;
        const existing = this.positionManager.getActiveNftPositions().find((x) => x.id === id);
        if (!existing) {
          this.positionManager.addNftPosition({
            id,
            collectionSlug: slug,
            collectionName: slug,
            tokenId: tokenIds[0],
            entryFloorEth: floorEth || 0,
            currentFloorEth: floorEth || 0,
            highestFloorEth: floorEth || 0,
            salesVelocity1h: 0,
          });
        } else if (floorEth > 0) {
          const res2 = this.positionManager.updateNftPosition(id, floorEth, 0);
          if (res2.triggerAlert) {
            alerts.push({ type: res2.type, reason: res2.reason || '', address: `nft:${slug}` });
          }
        }
      }

      // Hapus posisi NFT yang sudah tidak dimiliki
      for (const tracked of this.positionManager.getActiveNftPositions()) {
        if (tracked.id.startsWith('nft:') && !heldPerSlug.has(tracked.id.slice(4))) {
          this.positionManager.removeNftPosition(tracked.id);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[POSITION SCANNER] NFT scan failed (fail-closed): ${message}`);
    }
    return alerts;
  }
}
