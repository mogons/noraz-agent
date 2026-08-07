import { Connection, PublicKey } from '@solana/web3.js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { PositionManager } from '../position/position-manager.js';
import { StateStore } from '../services/state-store.js';
import { WalletService } from '../services/wallet-service.js';
import { GMGNAdapter } from '../adapters/gmgn-adapter.js';
import { SolanaTradeAdapter } from '../adapters/solana-adapter.js';

/**
 * DI seam for EVM balance reads (defaults to a viem public client). Injected in
 * tests to avoid mocking viem; callers can also swap in a custom RPC strategy.
 */
export type EvmBalanceReader = (chain: string, token: string, owner: string) => Promise<bigint | null>;

export interface WalletTrackerDeps {
  positionManager: PositionManager;
  stateStore?: StateStore;
  gmgn?: GMGNAdapter;
  solanaConnection?: Connection;
  walletService?: WalletService;
  evmBalanceReader?: EvmBalanceReader;
}

export interface WalletHolding {
  chain: 'sol' | 'robinhood';
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

/** SPL Token Program (not exported by @solana/web3.js). */
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Minimal parsed-shape view of a getTokenAccountsByOwner result (fields we read only). */
interface ParsedTokenAccount {
  account: {
    data: {
      parsed?: {
        info?: {
          mint?: string | { toBase58?: () => string };
          tokenAmount?: { uiAmount?: number | null; amount?: string | number };
        };
      };
    };
  };
}

/**
 * Wallet auto-tracker: scans wallet holdings on Solana + EVM, mirrors them into
 * the PositionManager lifecycle (auto-add / update / auto-close) and surfaces
 * position alerts. Every scan is fail-closed (returns [] on error or missing key)
 * so the tracker can never fabricate holdings.
 */
export class WalletTracker {
  private positionManager: PositionManager;
  private stateStore?: StateStore;
  private gmgn?: GMGNAdapter;
  private connection: Connection;
  private walletService?: WalletService;
  private evmBalanceReader: EvmBalanceReader;

  constructor(deps: WalletTrackerDeps) {
    this.positionManager = deps.positionManager;
    this.stateStore = deps.stateStore;
    this.gmgn = deps.gmgn;
    // SolanaTradeAdapter.getActiveConnection() has RPC failover — use it by default.
    this.connection = deps.solanaConnection ?? new SolanaTradeAdapter().getActiveConnection();
    this.walletService = deps.walletService;
    this.evmBalanceReader = deps.evmBalanceReader ?? this.defaultEvmBalanceReader;
  }

  private defaultEvmBalanceReader: EvmBalanceReader = async (_chain, token, owner) => {
    try {
      // Robinhood L2 is Base-compatible; use the robinhood RPC first, base as fallback.
      const rpc = process.env.EVM_ROBINHOOD_RPC_URL || process.env.EVM_BASE_RPC_URL || undefined;
      const publicClient = createPublicClient({ chain: base, transport: http(rpc) });
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

  /** Scan Solana wallet for SPL token balances (raw base-unit amounts). Fail-closed []. */
  public async scanSolanaHoldings(): Promise<Array<{ mint: string; amount: number }>> {
    return (await this.scanSolanaHoldingsSafe()).holdings;
  }

  private async scanSolanaHoldingsSafe(): Promise<{ holdings: Array<{ mint: string; amount: number }>; ok: boolean }> {
    if (!this.walletService || !this.walletService.hasWallet('solana')) {
      return { holdings: [], ok: false };
    }
    try {
      const pubkey = new PublicKey(this.walletService.getSolanaAddress());
      const res = await this.connection.getTokenAccountsByOwner(pubkey, { programId: new PublicKey(TOKEN_PROGRAM_ID) });
      const accounts = (res?.value ?? []) as unknown as ParsedTokenAccount[];
      const holdings: Array<{ mint: string; amount: number }> = [];
      for (const { account } of accounts) {
        const info = account?.data?.parsed?.info;
        if (!info) continue;
        const rawMint = info.mint;
        if (!rawMint) continue;
        const mint = typeof rawMint === 'string' ? rawMint : (rawMint.toBase58 ? rawMint.toBase58() : String(rawMint));
        const ta = info.tokenAmount;
        if (!ta) continue;
        const uiAmount = Number(ta.uiAmount ?? 0);
        const rawAmount = Number(ta.amount ?? 0);
        if (!(uiAmount > 0) && !(rawAmount > 0)) continue;
        const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : uiAmount;
        holdings.push({ mint, amount });
      }
      return { holdings, ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET TRACKER] Solana holdings scan failed: ${message}`);
      return { holdings: [], ok: false };
    }
  }

  /** Scan tracked EVM tokens for non-zero balances. Fail-closed []. */
  public async scanEvmHoldings(): Promise<Array<{ address: string }>> {
    return (await this.scanEvmHoldingsSafe()).holdings;
  }

  private async scanEvmHoldingsSafe(): Promise<{
    holdings: Array<{ address: string }>;
    ok: boolean;
    scannedOk: Set<string>;
  }> {
    if (!this.stateStore || !this.walletService || !this.walletService.hasWallet('evm')) {
      return { holdings: [], ok: false, scannedOk: new Set() };
    }
    try {
      const owner = this.walletService.getEvmAddress();
      const tracked = this.stateStore.getTrackedTokens().filter((t) => t.chain === 'robinhood');
      const holdings: Array<{ address: string }> = [];
      const scannedOk = new Set<string>();
      for (const tok of tracked) {
        const balance = await this.evmBalanceReader(tok.chain, tok.address, owner);
        if (balance === null) {
          console.warn(`[WALLET TRACKER] EVM balance read failed for ${tok.symbol} (${tok.address}) — excluded from scan`);
          continue;
        }
        scannedOk.add(tok.address.toLowerCase());
        if (balance > 0n) holdings.push({ address: tok.address });
      }
      return { holdings, ok: true, scannedOk };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WALLET TRACKER] EVM holdings scan failed: ${message}`);
      return { holdings: [], ok: false, scannedOk: new Set() };
    }
  }

  /** Persist a token as an auto-tracking target (deduped by chain + address in StateStore). */
  public registerTrackedToken(chain: 'sol' | 'robinhood', address: string, symbol: string): void {
    this.stateStore?.setTrackedToken({ chain, address, symbol, addedAt: Date.now() });
  }

  /**
   * Lifecycle engine: reconciles wallet holdings against the PositionManager.
   * 1. holdings = solana + evm scans (deduped by address)
   * 2. new holdings -> fetch token info (GMGN) -> addPosition (skip on fetch failure)
   * 3. existing holdings -> updateMemePosition with fresh price/volume/smart money -> collect alerts
   * 4. tracked positions no longer held -> removePosition (only when that chain's scan actually ran,
   *    so a missing wallet / failed RPC can never wipe positions)
   */
  public async syncPositions(): Promise<WalletAlert[]> {
    const alerts: WalletAlert[] = [];
    const [solanaScan, evmScan] = await Promise.all([this.scanSolanaHoldingsSafe(), this.scanEvmHoldingsSafe()]);

    const holdings: WalletHolding[] = [
      ...solanaScan.holdings.map((h) => ({ chain: 'sol' as const, address: h.mint, amount: h.amount })),
      ...evmScan.holdings.map((h) => ({ chain: 'robinhood' as const, address: h.address, amount: 0 })),
    ];

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
      }
    }

    // Auto-close positions no longer held — but only when at least one scan actually
    // ran successfully (fail-closed scans report ok: false, so they never trigger mass
    // closes). Per position, a close is only allowed when the owning chain's scan ran:
    // Solana closes need the full scan to have succeeded, EVM closes are additionally
    // gated per token: only positions whose contract address was actually read
    // successfully (scannedOk) may be closed, so a single failed balanceOf read can
    // never look like a "not held" and trigger a wrongful auto-close.
    if (solanaScan.ok || evmScan.ok) {
      for (const pos of active) {
        if (heldAddresses.has(pos.contractAddress.toLowerCase())) continue;
        const isEvm = pos.contractAddress.toLowerCase().startsWith('0x');
        const scanOk = isEvm ? evmScan.scannedOk.has(pos.contractAddress.toLowerCase()) : solanaScan.ok;
        if (!scanOk) continue;
        this.positionManager.removePosition(pos.id);
        console.log(`[WALLET TRACKER] Auto-closed position ${pos.symbol} (${pos.id}) — no longer held`);
      }
    }

    return alerts;
  }
}
