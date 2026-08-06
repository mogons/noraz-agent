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
 * Full Athena persisted state — survives bot restarts
 */
export interface AthenaPersistedState {
  // Core position tracking
  openPositions: Record<string, OpenPosition>;
  activeLpPositions: Record<string, ActiveLPPosition>;
  activeNftPositions: Record<string, ActiveNFTPosition>;

  // Services state
  priceAlerts: Record<string, PriceAlert>;
  tradeJournalEntries: Record<string, TradeJournalEntry>;

  // Agent on/off states
  agentStates: Record<string, boolean>;

  // Signal audit ledger (append-only)
  signalLedger: SignalLedgerEntry[];

  // Metadata
  lastUpdated: string;
  version: number;
}

const CURRENT_VERSION = 2;

export class StateStore {
  private dbFilePath: string;
  private state: AthenaPersistedState;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 1000; // coalesce rapid writes into 1 disk write per second

  constructor(filePath?: string) {
    const dbDir = path.resolve(process.cwd(), 'database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.dbFilePath = filePath || path.join(dbDir, 'athena_state.json');
    this.state = this.loadFromDisk();
    console.log(`[STATE STORE] Loaded persistent state from ${this.dbFilePath} (${this.state.signalLedger.length} ledger entries, ${Object.keys(this.state.priceAlerts).length} alerts, ${Object.keys(this.state.tradeJournalEntries).length} journal entries)`);
  }

  // ==========================================
  // DISK I/O
  // ==========================================

  private createEmptyState(): AthenaPersistedState {
    return {
      openPositions: {},
      activeLpPositions: {},
      activeNftPositions: {},
      priceAlerts: {},
      tradeJournalEntries: {},
      agentStates: {},
      signalLedger: [],
      lastUpdated: new Date().toISOString(),
      version: CURRENT_VERSION,
    };
  }

  private loadFromDisk(): AthenaPersistedState {
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
        agentStates: data.agentStates || {},
        signalLedger: Array.isArray(data.signalLedger) ? data.signalLedger : [],
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        version: CURRENT_VERSION,
      };
    } catch (err: any) {
      console.error('[STATE STORE ERROR] Failed to load state, starting fresh:', err.message);
      return this.createEmptyState();
    }
  }

  private saveToDiskSync(state: AthenaPersistedState): void {
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

  public getPosition(id: string): OpenPosition | undefined {
    return this.state.openPositions[id];
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

  public getLpPosition(id: string): ActiveLPPosition | undefined {
    return this.state.activeLpPositions[id];
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

  public getNftPosition(id: string): ActiveNFTPosition | undefined {
    return this.state.activeNftPositions[id];
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

  public getAlert(id: string): PriceAlert | undefined {
    return this.state.priceAlerts[id];
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

  public getJournalEntry(id: string): TradeJournalEntry | undefined {
    return this.state.tradeJournalEntries[id];
  }

  public getAllJournalEntries(): TradeJournalEntry[] {
    return Object.values(this.state.tradeJournalEntries);
  }

  // ==========================================
  // AGENT STATES
  // ==========================================

  public setAgentState(domain: string, active: boolean): void {
    this.state.agentStates[domain] = active;
    this.scheduleSave();
  }

  public getAgentState(domain: string): boolean | undefined {
    return this.state.agentStates[domain];
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

  public getRecentSignals(count: number = 50): SignalLedgerEntry[] {
    return this.state.signalLedger.slice(-count);
  }

  public getSignalsByDomain(domain: string, count: number = 50): SignalLedgerEntry[] {
    return this.state.signalLedger
      .filter(s => s.domain === domain)
      .slice(-count);
  }

  public getSignalById(id: string): SignalLedgerEntry | undefined {
    return this.state.signalLedger.find(s => s.id === id);
  }
}
