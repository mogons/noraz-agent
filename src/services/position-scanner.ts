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
 *  - nft: OpenSea owned-NFT scan (Robinhood EVM wallet)
 *  - meme + lp-robinhood: already handled by WalletTracker (RPC scans)
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
    return this.scanNFT();
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
    if (trackedSlugs.length === 0) return alerts; // no tracked collections → skip

    try {
      const apiKey = process.env.OPENSEA_API_KEY || '';
      const res = await fetch(
        `https://api.opensea.io/api/v2/chain/robinhood/account/${evmAddress}/nfts?limit=50`,
        { headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) return alerts;
      const data = (await res.json()) as { nfts?: Array<{ identifier: string; collection: string; name?: string }> };
      const owned = data.nfts || [];

      // Group NFTs per tracked collection
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

        // Fetch the collection floor price (ETH) for entry/current price
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

      // Remove NFT positions no longer owned
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
