import fs from 'fs';
import path from 'path';

export interface AuditMemoryRecord {
  id: string;
  contractAddress: string;
  symbol: string;
  chain: string;
  score: number;
  verdict: string;
  timestampIso: string;
  details: string;
}

export class SessionMemoryService {
  private dbPath: string;
  private auditMemories: AuditMemoryRecord[] = [];

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'database', 'session_memory.json');
    this.ensureDatabaseFile();
    this.loadMemory();
  }

  private ensureDatabaseFile(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify({ auditMemories: [], userQueries: [] }, null, 2), 'utf-8');
    }
  }

  private loadMemory(): void {
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.auditMemories = parsed.auditMemories || [];
      console.log(`[SESSION MEMORY] Loaded ${this.auditMemories.length} past token audits.`);
    } catch (err: any) {
      console.warn(`[SESSION MEMORY WARNING] Failed loading memory store: ${err.message}`);
    }
  }

  private saveMemory(): void {
    try {
      fs.writeFileSync(
        this.dbPath,
        JSON.stringify({ auditMemories: this.auditMemories, userQueries: [] }, null, 2),
        'utf-8'
      );
    } catch (err: any) {
      console.error(`[SESSION MEMORY ERROR] Failed saving memory store: ${err.message}`);
    }
  }

  public recordAudit(contractAddress: string, symbol: string, chain: string, score: number, verdict: string, details: string): AuditMemoryRecord {
    const record: AuditMemoryRecord = {
      id: `AUDIT_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      contractAddress,
      symbol,
      chain,
      score,
      verdict,
      timestampIso: new Date().toISOString(),
      details,
    };

    // Prepend to top
    this.auditMemories.unshift(record);
    // Keep max 500 records
    if (this.auditMemories.length > 500) {
      this.auditMemories = this.auditMemories.slice(0, 500);
    }

    this.saveMemory();
    return record;
  }

  /**
   * Fast zero-LLM-token keyword search over past audits
   */
  public searchAudits(query: string): AuditMemoryRecord[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.auditMemories.slice(0, 5);

    return this.auditMemories.filter(
      a =>
        a.contractAddress.toLowerCase().includes(q) ||
        a.symbol.toLowerCase().includes(q) ||
        a.chain.toLowerCase().includes(q) ||
        a.verdict.toLowerCase().includes(q) ||
        a.details.toLowerCase().includes(q)
    );
  }

  public getRecentAudits(limit: number = 5): AuditMemoryRecord[] {
    return this.auditMemories.slice(0, limit);
  }

  /**
   * Build a compact memory-context string (last N audits) to inject into the AI
   * system prompt. Keeps token cost small (~200-400 tokens) while giving the LLM
   * lightweight cross-chat memory. Zero-cost if no records exist.
   */
  public buildMemoryContextLine(maxAudits: number = 4): string {
    const audits = this.auditMemories.slice(0, maxAudits);

    if (audits.length === 0) return '';

    const lines: string[] = ['\nSHORT MEMORY (from previous session):'];
    lines.push('- Audit terakhir:');
    for (const a of audits) {
      const d = a.timestampIso ? a.timestampIso.slice(0, 16) : '';
      lines.push(`  • ${a.symbol} (${a.chain}): ${a.verdict} [${a.score}/100] @${d}`);
    }
    return lines.join('\n');
  }
}
