import fs from 'fs';
import path from 'path';

export interface AthenaPersistedState {
  priceAlerts: any[];
  tradeJournalEntries: any[];
  lastUpdated: string;
}

export class DbService {
  private dbFilePath: string;

  constructor(filePath?: string) {
    const dbDir = path.resolve(process.cwd(), 'database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.dbFilePath = filePath || path.join(dbDir, 'athena_state.json');
  }

  public loadState(): AthenaPersistedState {
    try {
      if (!fs.existsSync(this.dbFilePath)) {
        const initialState: AthenaPersistedState = {
          priceAlerts: [],
          tradeJournalEntries: [],
          lastUpdated: new Date().toISOString(),
        };
        this.saveState(initialState);
        return initialState;
      }

      const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
      const data = JSON.parse(raw);
      return {
        priceAlerts: Array.isArray(data.priceAlerts) ? data.priceAlerts : [],
        tradeJournalEntries: Array.isArray(data.tradeJournalEntries) ? data.tradeJournalEntries : [],
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      };
    } catch (err: any) {
      console.error('[DB SERVICE ERROR] Failed to load state:', err.message);
      return { priceAlerts: [], tradeJournalEntries: [], lastUpdated: new Date().toISOString() };
    }
  }

  public saveState(state: AthenaPersistedState): void {
    try {
      state.lastUpdated = new Date().toISOString();
      const tempPath = `${this.dbFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbFilePath); // Atomic file replace
      console.log(`[DB SERVICE] Atomic save completed at ${state.lastUpdated}`);
    } catch (err: any) {
      console.error('[DB SERVICE ERROR] Failed to save state:', err.message);
    }
  }
}
