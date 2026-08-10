import { createPublicClient, http } from 'viem';
import { robinhood } from 'viem/chains';
import { PositionManager } from '../position/position-manager.js';
import { StateStore } from '../services/state-store.js';
import { WalletService } from '../services/wallet-service.js';
import { TradeJournalService } from '../services/trade-journal-service.js';
import { GMGNAdapter, type GMGNTrackTrade } from '../adapters/gmgn-adapter.js';

export type EvmBalanceReader = (chain: string, token: string, owner: string) => Promise<bigint | null>;

export interface WalletTrackerDeps {
  positionManager: PositionManager;
  stateStore?: StateStore;
  gmgn?: GMGNAdapter;
  walletService?: WalletService;
  tradeJournal?: TradeJournalService;
  evmBalanceReader?: EvmBalanceReader;
  exitMinWallets?: number;
  exitMinUsd?: number;
  exitWindowMs?: number;
  exitAlertsEnabled?: boolean;
}

export interface WalletHolding {
  chain: 'robinhood';
  address: string;
  amount: number;
}

export interface WalletAlert {
  type: string;
  reason: string;
  address: string;
}

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export class WalletTracker {
  private positionManager: PositionManager;
  private stateStore?: StateStore;
  private gmgn?: GMGNAdapter;
  private walletService?: WalletService;
  private tradeJournal?: TradeJournalService;
  private evmBalanceReader: EvmBalanceReader;
  private exitMinWallets: number;
  private exitMinUsd: number;
  private exitWindowMs: number;
  private exitAlertsEnabled: boolean;

  constructor(deps: WalletTrackerDeps) {
    this.positionManager = deps.positionManager;
    this.stateStore = deps.stateStore;
    this.gmgn = deps.gmgn;
    this.walletService = deps.walletService;
    this.tradeJournal = deps.tradeJournal;
    this.evmBalanceReader = deps.evmBalanceReader ?? this.defaultEvmBalanceReader;
    this.exitMinWallets = deps.exitMinWallets ?? 2;
    this.exitMinUsd = deps.exitMinUsd ?? 20_000;
    this.exitWindowMs = deps.exitWindowMs ?? 2 * 60 * 60 * 1000;
    this.exitAlertsEnabled = deps.exitAlertsEnabled ?? true;
  }

  private defaultEvmBalanceReader: EvmBalanceReader = async (_chain, token, owner) => {
    try {
      const rpc = process.env.EVM_ROBINHOOD_RPC_URL || undefined;
      const publicClient = createPublicClient({ chain: robinhood, transport: http(rpc) });
      return await publicClient.readContract({
        address: token as `0x${string}`,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [owner as `0x${string}`],
      });
    } catch {
      return null;
    }
  };

  /** Scan tracked robinhood tokens for non-zero balances. Fail-closed []. */
  public async scanEvmHoldings(): Promise<Array<{ address: string; amount: number }>> {
    return (await this.scanEvmHoldingsSafe()).holdings;
  }

  private async scanEvmHoldingsSafe(): Promise<{
    holdings: Array<{ address: string; amount: number }>;
    ok: boolean;
    scannedOk: Set<string>;
  }> {
    if (!this.stateStore || !this.walletService || !this.walletService.hasWallet('evm')) {
      return { holdings: [], ok: false, scannedOk: new Set() };
    }
    try {
      const owner = this.walletService.getEvmAddress();
      const tracked = this.stateStore.getTrackedTokens().filter((t) => t.chain === 'robinhood');
      const holdings: Array<{ address: string; amount: number }> = [];
      const scannedOk = new Set<string>();
      for (const tok of tracked) {
        const balance = await this.evmBalanceReader(tok.chain, tok.address, owner);
        if (balance === null) {
          console.warn(`[WALLET TRACKER] EVM balance read failed for ${tok.symbol} (${tok.address}) — excluded from scan`);
          continue;
        }
        scannedOk.add(tok.address.toLowerCase());
        if (balance > 0n) holdings.push({ address: tok.address, amount: Number(balance) });
      }
      return { holdings, ok: true, scannedOk };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET TRACKER] EVM holdings scan failed: ${message}`);
      return { holdings: [], ok: false, scannedOk: new Set() };
    }
  }

  /** Persist a token as an auto-tracking target (deduped by chain + address in StateStore). */
  public registerTrackedToken(chain: 'robinhood', address: string, symbol: string): void {
    this.stateStore?.setTrackedToken({ chain, address, symbol, addedAt: Date.now() });
  }

  public async syncPositions(): Promise<WalletAlert[]> {
    const alerts: WalletAlert[] = [];
    const evmScan = await this.scanEvmHoldingsSafe();

    const holdings: WalletHolding[] = evmScan.holdings.map((h) => ({ chain: 'robinhood' as const, address: h.address, amount: h.amount }));

    // Dedupe by address (case-insensitive)
    const seen = new Set<string>();
    const deduped = holdings.filter((h) => {
      const key = h.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const active = this.positionManager.getActivePositions();
    const heldAddresses = new Set(deduped.map((h) => h.address.toLowerCase()));

    for (const holding of deduped) {
      const tok = this.gmgn ? await this.gmgn.fetchTokenInfo(holding.chain, holding.address) : null;
      if (!tok) {
        console.warn(`[WALLET TRACKER] Skipping ${holding.chain} holding ${holding.address}: token info unavailable`);
        continue;
      }
      const pos = active.find((p) => p.contractAddress.toLowerCase() === holding.address.toLowerCase());
      if (!pos) {
        this.positionManager.addPosition({
          id: holding.address,
          symbol: tok.symbol || 'TOKEN',
          contractAddress: holding.address,
          entryPriceUsd: tok.priceUsd,
          currentPriceUsd: tok.priceUsd,
          amount: holding.amount || 0,
          highWaterMarkUsd: tok.priceUsd,
          initialVolume4hUsd: tok.volume24hUsd / 6,
          initialSmartMoneyCount: tok.smartDegenCount,
        });
        console.log(`[WALLET TRACKER] Added auto-tracked position ${tok.symbol} (${holding.address}) at $${tok.priceUsd}`);
      } else {
        const res = this.positionManager.updateMemePosition(pos.id, tok.priceUsd, tok.volume24hUsd / 6, tok.smartDegenCount);
        if (res.triggerAlert) {
          alerts.push({ type: res.type, reason: res.reason || '', address: holding.address });
        }
        // Feed current price into Swarm Learning — outcome tracking (TP/SL) that
        // recalibrates agent weights based on real results. (wired 2026-08-08)
        try {
          const { globalSwarmLearning } = await import('../orchestrator/swarm-learning.js');
          globalSwarmLearning.updateSignalPrice(holding.address, tok.priceUsd);
        } catch (learnErr: any) {
          // non-fatal — learning must never break position tracking
          console.warn(`[SWARM LEARNING] price update failed for ${holding.address}: ${learnErr.message}`);
        }
      }
    }

    // Auto-close positions no longer held — but only when the scan actually ran
    // successfully (fail-closed scans report ok: false, so they never trigger mass
    // closes). A close is only allowed when the position's contract address was
    // actually read successfully (scannedOk), so a single failed balanceOf read can
    // never look like a "not held" and trigger a wrongful auto-close.
    if (evmScan.ok) {
      for (const pos of active) {
        if (heldAddresses.has(pos.contractAddress.toLowerCase())) continue;
        if (!evmScan.scannedOk.has(pos.contractAddress.toLowerCase())) continue;
        this.positionManager.removePosition(pos.id);
        // Close any OPEN journal entry for this contract — exit PnL audit trail.
        try {
          const closed = this.tradeJournal?.closeByContractAddressOrId(pos.contractAddress, pos.currentPriceUsd, 'CLOSED_MANUAL', 'wallet auto-close: no longer held');
          if (closed) console.log(`[WALLET TRACKER] Closed ${closed} journal entry(ies) for ${pos.symbol} (${pos.id})`);
        } catch (journalErr: any) {
          console.warn(`[WALLET TRACKER] Journal close failed for ${pos.symbol}: ${journalErr.message}`);
        }
        console.log(`[WALLET TRACKER] Auto-closed position ${pos.symbol} (${pos.id}) — no longer held`);
      }
    }

    // Smart Money Exit alert: only for tokens YOU still hold. Without
    // a position = no trigger (exit signals never become calls).
    if (this.exitAlertsEnabled) {
      try {
        const exitAlerts = await this.checkSmartMoneyExit(active);
        alerts.push(...exitAlerts);
      } catch (exitErr: any) {
        console.warn(`[WALLET TRACKER] Smart money exit check failed (skipped): ${exitErr.message}`);
      }
    }

    return alerts;
  }

  /**
   * Detect Smart Money Exit on positions still being held:
   * >= exitMinWallets smart wallets performing a full-close (side=sell +
   * is_open_or_close=1) within exitWindowMs, total exit >= exitMinUsd.
   * Data from GMGN `/v1/user/smartmoney` (60s cache, fail-open []).
   * Alert only — never affects screening/calls.
   */
  public async checkSmartMoneyExit(activePositions: Array<{ contractAddress: string; symbol?: string }>): Promise<WalletAlert[]> {
    if (!this.gmgn) return [];
    const heldAddrs: Set<string> = new Set();
    for (const p of activePositions) {
      const addr = String(p.contractAddress || '');
      if (!addr) continue;
      heldAddrs.add(addr.toLowerCase());
    }
    if (heldAddrs.size === 0) return [];

    const alerts: WalletAlert[] = [];
    const nowSec = Date.now() / 1000;
    let trades: GMGNTrackTrade[] = [];
    try {
      trades = await this.gmgn.fetchTrackTrades('robinhood', 'smartmoney');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET TRACKER] Track feed robinhood failed (skipped): ${message}`);
      return alerts;
    }
    if (trades.length === 0) return alerts;
    const { buildTrackAccumulation } = await import('../agents/shared/gmgn-meme-helpers.js');
    const acc = buildTrackAccumulation(trades);
    for (const heldAddr of heldAddrs) {
      const a = acc.get(heldAddr);
      if (!a) continue;
      if (a.fullCloseWallets.size < this.exitMinWallets) continue;
      if (a.fullCloseTotalUsd < this.exitMinUsd) continue;
      if (nowSec - a.lastFullCloseAt > this.exitWindowMs / 1000) continue;
      const mins = Math.max(0, Math.round((nowSec - a.lastFullCloseAt) / 60));
      alerts.push({
        type: 'sm-exit',
        reason: `⚠️ **Smart Money Exit:** $${a.symbol || heldAddr.slice(0, 8)} — ${a.fullCloseWallets.size} smart wallets full-closed $${(a.fullCloseTotalUsd / 1000).toFixed(1)}k in the last ${mins}m. You still hold this position — consider exiting.`,
        address: heldAddr,
      });
      console.log(`[WALLET TRACKER] 🚨 SM Exit: ${a.symbol || heldAddr} — ${a.fullCloseWallets.size} wallet full-close $${(a.fullCloseTotalUsd / 1000).toFixed(1)}k`);
    }
    return alerts;
  }
}
