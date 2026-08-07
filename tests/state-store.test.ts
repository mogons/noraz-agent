import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StateStore } from '../src/services/state-store.js';

const dbPaths: string[] = [];
const stores: StateStore[] = [];

function newStore(): StateStore {
  const p = path.join(process.cwd(), 'database', `test_state_store_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`);
  dbPaths.push(p);
  const s = new StateStore(p);
  stores.push(s);
  return s;
}

function storeOn(p: string): StateStore {
  const s = new StateStore(p);
  stores.push(s);
  return s;
}

describe('StateStore trackedTokens persistence', () => {
  afterAll(() => {
    // Flush first so no pending debounce timers rewrite the files after deletion
    for (const s of stores) {
      try { s.flushToDisk(); } catch { /* ignore */ }
    }
    for (const p of dbPaths) {
      for (const f of [p, `${p}.tmp`]) {
        try { fs.unlinkSync(f); } catch { /* already gone */ }
      }
    }
  });

  it('setTrackedToken + getTrackedTokens round-trips and persists across reloads', () => {
    const store = newStore();
    store.setTrackedToken({ chain: 'sol', address: 'AAA111', symbol: 'SOLTOK', addedAt: 1000 });
    store.flushToDisk();

    const reloaded = storeOn(dbPaths[dbPaths.length - 1]);
    const tokens = reloaded.getTrackedTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ chain: 'sol', address: 'AAA111', symbol: 'SOLTOK', addedAt: 1000 });
  });

  it('dedupes by chain+address (case-insensitive) and updates the existing entry', () => {
    const store = newStore();
    store.setTrackedToken({ chain: 'sol', address: 'AAA111', symbol: 'SOLTOK', addedAt: 1000 });
    store.setTrackedToken({ chain: 'sol', address: 'aaa111', symbol: 'SOLTOK2', addedAt: 2000 });
    const tokens = store.getTrackedTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].symbol).toBe('SOLTOK2');
    expect(tokens[0].addedAt).toBe(2000);
  });

  it('keeps distinct entries for the same address on different chains', () => {
    const store = newStore();
    store.setTrackedToken({ chain: 'sol', address: 'AAA111', symbol: 'SOLTOK', addedAt: 1000 });
    store.setTrackedToken({ chain: 'robinhood', address: 'AAA111', symbol: 'EVMTOK', addedAt: 3000 });
    expect(store.getTrackedTokens()).toHaveLength(2);
  });

  it('loads an empty trackedTokens list for legacy state files without the field', () => {
    const p = path.join(process.cwd(), 'database', `test_state_store_legacy_${Date.now()}.json`);
    dbPaths.push(p);
    fs.writeFileSync(p, JSON.stringify({ version: 2, openPositions: {} }), 'utf-8');
    const store = storeOn(p);
    expect(store.getTrackedTokens()).toEqual([]);
  });
});
