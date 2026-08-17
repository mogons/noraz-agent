import fs from 'fs';
import path from 'path';
import { OpenPosition, ActiveLPPosition, ActiveNFTPosition } from '../position/position-manager.js';
import { PriceAlert } from './price-alert-service.js';
import { TradeJournalEntry } from './trade-journal-service.js';

/**
 * Signal Ledger Entry — immutable audit trail for every signal evaluated by Swarm Consensus
 */
export interface SignalLedgerEntry {
  id: string;
  timestamp: string;
  sourceAgent: string;
  domain: string;
  symbol: string;
  contractAddress: string;
  quantScore: number;
  catalystScore: number;
  securityScore: number;
  totalConfidence: number;
  passed: boolean;
  reason: string;
  rawPayloadJson: string;
}

/**
 * Token tracked by the wallet auto-tracker — resolved on startup via GMGN token info.
 */
export interface TrackedToken {
  chain: 'robinhood';
  address: string;
  symbol: string;
  addedAt: number;
}

/**
 * Full OpenCat persisted state — survives bot restarts
 */
export interface OpenCatPersistedState {
  // Core position tracking
  openPositions: Record<string, OpenPosition>;
  activeLpPositions: Record<string, ActiveLPPosition>;
  activeNftPositions: Record<string, ActiveNFTPosition>;

  // Services state
  priceAlerts: Record<string, PriceAlert>;
  tradeJournalEntries: Record<string, TradeJournalEntry>;

  // Persistent Wallet Private Key (survives process restarts and git updates)
  walletKeys: {
    evmPrivateKey?: string;
  };

  // Agent on/off states
  agentStates: Record<string, boolean>;

  // Signal audit ledger (append-only)
  signalLedger: SignalLedgerEntry[];

  // Persistent signal dedup (survives restarts)
  dedupEntries: Record<string, number>;

  // Wallet auto-tracking targets (survives restarts)
  trackedTokens: TrackedToken[];

  // NFT collections to monitor for user positions (survives restarts)
  trackedNftCollections: string[];

  // Per-domain runtime screening config overrides (set via chat tool; merged
  // over agent defaults at startup). Plain JSON-safe key/value — validation
  // happens in the agents (whitelist + clamps) before persisting.
  screeningConfigs: Record<string, Record<string, unknown>>;

  // Metadata
  lastUpdated: string;
  version: number;
}

const CURRENT_VERSION = 2;

export class StateStore {
  private dbFilePath: string;
  private state: OpenCatPersistedState;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 1000; // coalesce rapid writes into 1 disk write per second

  constructor(filePath?: string) {
    const dbDir = path.resolve(process.cwd(), 'database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const defaultNewPath = path.join(dbDir, 'opencat_state.json');

    if (filePath) {
      this.dbFilePath = filePath;
    } else {
      this.dbFilePath = defaultNewPath;
    }

    this.state = this.loadFromDisk();
    console.log(`[STATE STORE] Loaded persistent state from ${this.dbFilePath} (${this.state.signalLedger.length} ledger entries, ${Object.keys(this.state.priceAlerts).length} alerts, ${Object.keys(this.state.tradeJournalEntries).length} journal entries)`);
  }

  // ==========================================
  // DISK I/O
  // ==========================================

  private createEmptyState(): OpenCatPersistedState {
    return {
      openPositions: {},
      activeLpPositions: {},
      activeNftPositions: {},
      priceAlerts: {},
      tradeJournalEntries: {},
      walletKeys: {},
      agentStates: {},
      signalLedger: [],
      dedupEntries: {},
      trackedTokens: [],
      trackedNftCollections: [],
      screeningConfigs: {},
      lastUpdated: new Date().toISOString(),
      version: CURRENT_VERSION,
    };
  }

  private loadFromDisk(): OpenCatPersistedState {
    try {
      if (!fs.existsSync(this.dbFilePath)) {
        const initial = this.createEmptyState();
        this.saveToDiskSync(initial);
        return initial;
      }

      const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
      const data = JSON.parse(raw);

      // Migrate from v1 (old DbService format) to v2
      if (!data.version || data.version < CURRENT_VERSION) {
        console.log('[STATE STORE] Migrating state from v1 to v2...');
        const migrated = this.createEmptyState();

        // Preserve old data if it exists
        if (Array.isArray(data.priceAlerts)) {
          for (const a of data.priceAlerts) {
            if (a.id) migrated.priceAlerts[a.id] = a;
          }
        }
        if (Array.isArray(data.tradeJournalEntries)) {
          for (const t of data.tradeJournalEntries) {
            if (t.id) migrated.tradeJournalEntries[t.id] = t;
          }
        }

        this.saveToDiskSync(migrated);
        return migrated;
      }

      return {
        openPositions: data.openPositions || {},
        activeLpPositions: data.activeLpPositions || {},
        activeNftPositions: data.activeNftPositions || {},
        priceAlerts: data.priceAlerts || {},
        tradeJournalEntries: data.tradeJournalEntries || {},
        walletKeys: data.walletKeys || {},
        agentStates: data.agentStates || {},
        signalLedger: Array.isArray(data.signalLedger) ? data.signalLedger : [],
        dedupEntries: data.dedupEntries || {},
        trackedTokens: Array.isArray(data.trackedTokens) ? data.trackedTokens : [],
        trackedNftCollections: Array.isArray(data.trackedNftCollections) ? data.trackedNftCollections : [],
        screeningConfigs: data.screeningConfigs || {},
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        version: CURRENT_VERSION,
      };
    } catch (err: any) {
      console.error('[STATE STORE ERROR] Failed to load state, starting fresh:', err.message);
      return this.createEmptyState();
    }
  }

  private saveToDiskSync(state: OpenCatPersistedState): void {
    try {
      state.lastUpdated = new Date().toISOString();
      const tempPath = `${this.dbFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbFilePath); // Atomic file replace
    } catch (err: any) {
      console.error('[STATE STORE ERROR] Failed to save state:', err.message);
    }
  }

  /**
   * Debounced save — coalesces rapid mutations into a single disk write per DEBOUNCE_MS window.
   * Prevents disk thrashing during bursts of position updates or alert checks.
   */
  private scheduleSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveToDiskSync(this.state);
      this.saveDebounceTimer = null;
    }, this.DEBOUNCE_MS);
  }

  /** Force immediate save (use before graceful shutdown) */
  public flushToDisk(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.saveToDiskSync(this.state);
  }

  // ==========================================
  // POSITIONS (Meme & Spot)
  // ==========================================

  public setPosition(pos: OpenPosition): void {
    this.state.openPositions[pos.id] = pos;
    this.scheduleSave();
  }

  public removePosition(id: string): boolean {
    const existed = id in this.state.openPositions;
    delete this.state.openPositions[id];
    if (existed) this.scheduleSave();
    return existed;
  }

  public getAllPositions(): OpenPosition[] {
    return Object.values(this.state.openPositions);
  }

  // ==========================================
  // LP POSITIONS
  // ==========================================

  public setLpPosition(pos: ActiveLPPosition): void {
    this.state.activeLpPositions[pos.id] = pos;
    this.scheduleSave();
  }

  public removeLpPosition(id: string): boolean {
    const existed = id in this.state.activeLpPositions;
    delete this.state.activeLpPositions[id];
    if (existed) this.scheduleSave();
    return existed;
  }

  public getAllLpPositions(): ActiveLPPosition[] {
    return Object.values(this.state.activeLpPositions);
  }

  // ==========================================
  // NFT POSITIONS
  // ==========================================

  public setNftPosition(pos: ActiveNFTPosition): void {
    this.state.activeNftPositions[pos.id] = pos;
    this.scheduleSave();
  }

  public removeNftPosition(id: string): boolean {
    const existed = id in this.state.activeNftPositions;
    delete this.state.activeNftPositions[id];
    if (existed) this.scheduleSave();
    return existed;
  }

  public getAllNftPositions(): ActiveNFTPosition[] {
    return Object.values(this.state.activeNftPositions);
  }

  // ==========================================
  // PRICE ALERTS
  // ==========================================

  public setAlert(alert: PriceAlert): void {
    this.state.priceAlerts[alert.id] = alert;
    this.scheduleSave();
  }

  public removeAlert(id: string): boolean {
    const existed = id in this.state.priceAlerts;
    delete this.state.priceAlerts[id];
    if (existed) this.scheduleSave();
    return existed;
  }

  public getAllAlerts(): PriceAlert[] {
    return Object.values(this.state.priceAlerts);
  }

  // ==========================================
  // TRADE JOURNAL
  // ==========================================

  public setJournalEntry(entry: TradeJournalEntry): void {
    this.state.tradeJournalEntries[entry.id] = entry;
    this.scheduleSave();
  }

  public getAllJournalEntries(): TradeJournalEntry[] {
    return Object.values(this.state.tradeJournalEntries);
  }

  // ==========================================
  // WALLET KEYS (Persistent across bot updates)
  // ==========================================

  public setWalletKey(chain: 'evm', privateKey: string): void {
    if (!this.state.walletKeys) this.state.walletKeys = {};
    this.state.walletKeys.evmPrivateKey = privateKey;
    this.scheduleSave();
  }

  public removeWalletKey(chain: 'evm'): void {
    if (this.state.walletKeys) {
      delete this.state.walletKeys.evmPrivateKey;
      this.scheduleSave();
    }
  }

  public getWalletKeys(): { evmPrivateKey?: string } {
    return this.state.walletKeys || {};
  }

  // ==========================================
  // AGENT STATES
  // ==========================================

  public setAgentState(domain: string, active: boolean): void {
    this.state.agentStates[domain] = active;
    this.scheduleSave();
  }

  public getAllAgentStates(): Record<string, boolean> {
    return { ...this.state.agentStates };
  }

  // ==========================================
  // SIGNAL LEDGER (Append-Only Audit Trail)
  // ==========================================

  public appendSignalLedger(entry: SignalLedgerEntry): void {
    this.state.signalLedger.push(entry);

    // Cap ledger at 10,000 entries to prevent unbounded growth
    if (this.state.signalLedger.length > 10000) {
      this.state.signalLedger = this.state.signalLedger.slice(-5000);
    }

    this.scheduleSave();
  }

  public getSignalLedger(domain?: string, limit = 50): SignalLedgerEntry[] {
    let list = this.state.signalLedger || [];
    if (domain) {
      const norm = domain.toLowerCase().trim();
      list = list.filter((e) => e.domain.toLowerCase() === norm || e.sourceAgent.toLowerCase() === norm);
    }
    return list.slice(-limit).reverse();
  }

  // ==========================================
  // PERSISTENT SIGNAL DEDUP
  // ==========================================

  public setDedupEntry(key: string, timestamp: number): void {
    this.state.dedupEntries[key] = timestamp;
    this.scheduleSave();
  }

  public getAllDedupEntries(): Record<string, number> {
    return this.state.dedupEntries;
  }

  // ==========================================
  // TRACKED TOKENS (Wallet Auto-Tracking)
  // ==========================================

  public getTrackedTokens(): TrackedToken[] {
    return this.state.trackedTokens;
  }

  /** Add or update a tracked token, deduped by chain + address (case-insensitive). */
  public setTrackedToken(tok: TrackedToken): void {
    const existing = this.state.trackedTokens.findIndex(
      (t) => t.chain === tok.chain && t.address.toLowerCase() === tok.address.toLowerCase()
    );
    if (existing >= 0) {
      this.state.trackedTokens[existing] = tok;
    } else {
      this.state.trackedTokens.push(tok);
    }
    this.scheduleSave();
  }

  // ==========================================
  // TRACKED NFT COLLECTIONS (Wallet Auto-Tracking)
  // ==========================================

  public getTrackedNftCollections(): string[] {
    return this.state.trackedNftCollections || [];
  }

  /** Add a collection slug to NFT position tracking (deduped). */
  public setTrackedNftCollection(slug: string): void {
    if (!this.state.trackedNftCollections) this.state.trackedNftCollections = [];
    const key = slug.toLowerCase();
    if (!this.state.trackedNftCollections.some((s) => s.toLowerCase() === key)) {
      this.state.trackedNftCollections.push(slug);
      this.scheduleSave();
    }
  }

  // ==========================================
  // SCREENING CONFIG OVERRIDES (per domain, via chat tool)
  // ==========================================

  public getScreeningConfigs(): Record<string, Record<string, unknown>> {
    return this.state.screeningConfigs;
  }

  /** Merge validated per-domain config overrides into persistent state. */
  public setScreeningConfig(domain: string, partial: Record<string, unknown>): void {
    this.state.screeningConfigs[domain] = { ...(this.state.screeningConfigs[domain] || {}), ...partial };
    this.scheduleSave();
  }
}

export const globalStateStore = new StateStore();
export const stateStore = globalStateStore;
