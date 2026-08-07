import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import type { AthenaStrategy, AthenaIndicator } from './strategy-types.js';

const requireEsm = createRequire(import.meta.url);

const PROJECT_ROOT = path.resolve(process.cwd());
const STRATEGIES_DIR = path.join(PROJECT_ROOT, 'strategies');
const INDICATORS_DIR = path.join(PROJECT_ROOT, 'indicators');
const STRATEGIES_BACKUP_DIR = path.join(STRATEGIES_DIR, '.backup');
const INDICATORS_BACKUP_DIR = path.join(INDICATORS_DIR, '.backup');
const ACTIVE_FILE = path.join(STRATEGIES_DIR, '.active.json');

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function ensureDirs(): void {
  for (const dir of [STRATEGIES_DIR, INDICATORS_DIR, STRATEGIES_BACKUP_DIR, INDICATORS_BACKUP_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export class StrategyEngine {
  constructor() {
    ensureDirs();
  }

  // ─── Listing / reading ───────────────────────────────────────────────

  public listStrategies(): Array<{ id: string; active: boolean }> {
    ensureDirs();
    const activeMap = this.readActiveMap();
    const files = fs.existsSync(STRATEGIES_DIR)
      ? fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith('.mjs'))
      : [];
    return files.map((f) => {
      const id = f.replace(/\.mjs$/, '');
      return { id, active: activeMap[id] === true };
    });
  }

  public readStrategy(name: string): { success: boolean; message: string; data?: { content: string } } {
    if (!SAFE_NAME_RE.test(name)) return { success: false, message: 'Invalid strategy name (use alphanumeric, dash, underscore).' };
    const file = path.join(STRATEGIES_DIR, `${name}.mjs`);
    if (!fs.existsSync(file)) return { success: false, message: `Strategy ${name} tidak ditemukan.` };
    return { success: true, message: `Isi strategi ${name}.`, data: { content: fs.readFileSync(file, 'utf-8') } };
  }

  // ─── Validation (subprocess import — reliable in dist & test envs) ───

  private validateModuleFile(filePath: string, kind: 'strategy' | 'indicator'): { ok: boolean; error?: string } {
    const url = pathToFileURL(filePath).href;
    const script = `
      const url = process.argv[1];
      const kind = process.argv[2];
      import(url).then((m) => {
        const s = m.default || m;
        if (kind === 'strategy') {
          if (typeof s?.evaluate !== 'function') { console.error('INVALID: module must export { id, evaluate(ctx) }'); process.exit(1); }
          if (typeof s?.id !== 'string' || !s.id) { console.error('INVALID: module must export string id'); process.exit(1); }
        } else {
          if (typeof s?.calculate !== 'function') { console.error('INVALID: module must export { id, calculate(candles) }'); process.exit(1); }
          if (typeof s?.id !== 'string' || !s.id) { console.error('INVALID: module must export string id'); process.exit(1); }
        }
        console.error('VALID'); process.exit(0);
      }).catch((e) => { console.error('INVALID: ' + (e?.message || String(e))); process.exit(1); });
    `;
    try {
      const res = execFileSync(
        process.execPath,
        ['--input-type=module', '-e', script, url, kind],
        { timeout: 20000, encoding: 'utf-8', windowsHide: true }
      );
      return { ok: true };
    } catch (err: any) {
      const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : (err?.message || 'Validasi gagal.');
      return { ok: false, error: stderr };
    }
  }

  // ─── Write (sandbox + backup + validate + rollback) ──────────────────

  public writeStrategy(name: string, code: string): { success: boolean; message: string } {
    return this.writeSandboxed(STRATEGIES_DIR, STRATEGIES_BACKUP_DIR, name, code, 'strategy');
  }

  public writeIndicator(name: string, code: string): { success: boolean; message: string } {
    return this.writeSandboxed(INDICATORS_DIR, INDICATORS_BACKUP_DIR, name, code, 'indicator');
  }

  private writeSandboxed(dir: string, backupDir: string, name: string, code: string, kind: 'strategy' | 'indicator'): { success: boolean; message: string } {
    ensureDirs();
    if (!SAFE_NAME_RE.test(name)) return { success: false, message: 'Nama file tidak valid (hanya alfanumerik, dash, underscore).' };
    if (!code || !code.trim()) return { success: false, message: 'Kode kosong.' };

    const file = path.join(dir, `${name}.mjs`);
    const existed = fs.existsSync(file);

    // 1. Backup existing version
    if (existed) {
      const backupPath = path.join(backupDir, `${name}.mjs.bak`);
      try {
        fs.copyFileSync(file, backupPath);
      } catch (err: any) {
        return { success: false, message: `Gagal backup versi lama: ${err.message}` };
      }
    }

    // 2. Write new version
    try {
      fs.writeFileSync(file, code, 'utf-8');
    } catch (err: any) {
      return { success: false, message: `Gagal menulis file: ${err.message}` };
    }

    // 3. Validate (subprocess import + shape check)
    const validation = this.validateModuleFile(file, kind);
    if (!validation.ok) {
      // 4. Rollback on failure
      const backupPath = path.join(backupDir, `${name}.mjs.bak`);
      if (existed && fs.existsSync(backupPath)) {
        try { fs.copyFileSync(backupPath, file); } catch { /* ignore */ }
        return { success: false, message: `Validasi gagal: ${validation.error}. Versi lama sudah dipulihkan.` };
      }
      if (!existed) {
        try { fs.unlinkSync(file); } catch { /* ignore */ }
      }
      return { success: false, message: `Validasi gagal: ${validation.error}. File baru dihapus.` };
    }

    return { success: true, message: `✅ ${name} berhasil disimpan & tervalidasi.${existed ? ' Versi lama di-backup.' : ''}` };
  }

  public rollbackStrategy(name: string): { success: boolean; message: string } {
    return this.rollbackFile(STRATEGIES_DIR, STRATEGIES_BACKUP_DIR, name);
  }

  private rollbackFile(dir: string, backupDir: string, name: string): { success: boolean; message: string } {
    if (!SAFE_NAME_RE.test(name)) return { success: false, message: 'Nama file tidak valid.' };
    const backupPath = path.join(backupDir, `${name}.mjs.bak`);
    if (!fs.existsSync(backupPath)) return { success: false, message: `Tidak ada backup untuk ${name}.` };
    try {
      fs.copyFileSync(backupPath, path.join(dir, `${name}.mjs`));
      return { success: true, message: `✅ ${name} berhasil di-rollback ke versi backup.` };
    } catch (err: any) {
      return { success: false, message: `Rollback gagal: ${err.message}` };
    }
  }

  // ─── Active strategy per domain ──────────────────────────────────────

  private readActiveMap(): Record<string, boolean> {
    if (!fs.existsSync(ACTIVE_FILE)) return {};
    try {
      return JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }

  private writeActiveMap(map: Record<string, boolean>): void {
    try {
      fs.writeFileSync(ACTIVE_FILE, JSON.stringify(map, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[STRATEGY ENGINE] Gagal persist active map: ${err.message}`);
    }
  }

  public setActiveStrategy(domain: string, strategyId: string): { success: boolean; message: string } {
    const strategies = this.listStrategies();
    if (!strategies.some((s) => s.id === strategyId)) {
      return { success: false, message: `Strategi ${strategyId} tidak ditemukan di strategies/.` };
    }
    const map = this.readActiveMap();
    for (const s of strategies) map[s.id] = s.id === strategyId;
    this.writeActiveMap(map);
    return { success: true, message: `✅ Strategi ${strategyId} aktif untuk domain ${domain}.` };
  }

  public getActiveStrategy(domain: string): AthenaStrategy | null {
    const map = this.readActiveMap();
    const activeId = Object.keys(map).find((k) => map[k] === true);
    if (activeId) {
      const file = path.join(STRATEGIES_DIR, `${activeId}.mjs`);
      if (fs.existsSync(file)) {
        try {
          const mod = this.loadModule(file);
          return mod.default || mod;
        } catch (err: any) {
          console.warn(`[STRATEGY ENGINE] Gagal load strategi aktif ${activeId}: ${err.message}`);
        }
      }
    }
    // Fallback: domain-default strategy (e.g. meme-solana-default.mjs) is active
    // out-of-the-box when no explicit strategy has been set yet.
    const defaultId = `${domain.toLowerCase().replace(/[_\s]+/g, '-')}-default`;
    const defaultFile = path.join(STRATEGIES_DIR, `${defaultId}.mjs`);
    if (fs.existsSync(defaultFile)) {
      try {
        const mod = this.loadModule(defaultFile);
        return mod.default || mod;
      } catch (err: any) {
        console.warn(`[STRATEGY ENGINE] Gagal load strategi default ${defaultId}: ${err.message}`);
      }
    }
    return null;
  }

  public getIndicator(id: string): AthenaIndicator | null {
    const file = path.join(INDICATORS_DIR, `${id}.mjs`);
    if (!fs.existsSync(file)) return null;
    try {
      const mod = this.loadModule(file);
      return mod.default || mod;
    } catch (err: any) {
      console.warn(`[STRATEGY ENGINE] Gagal load indicator ${id}: ${err.message}`);
      return null;
    }
  }

  private loadModule(filePath: string): any {
    const mod = requireEsm(filePath);
    return mod.default || mod;
  }
}
