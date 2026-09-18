/**
 * Native DexScreener pair tape for Robinhood Chain.
 * Public API — no key, no dune-research, no Postgres.
 * Fail-open: network/parse errors return null / empty maps.
 */

const DEX_BASE = 'https://api.dexscreener.com';
const CHAIN = 'robinhood';
const BATCH_SIZE = 30;
const CACHE_TTL_MS = 60_000;

const DUMP_SELL_MULT = 2.2;
const DUMP_MIN_SELLS = 8;
const VOL_LIQ_RISING = 0.15;
const VOL_LIQ_WARM = 0.05;
const RISING_BONUS = 8;

export interface DexFlowSnapshot {
  chain: typeof CHAIN;
  address: string;
  symbol: string;
  pairAddress: string | null;
  dexId: string | null;
  quoteSymbol: string | null;
  priceUsd: number | null;
  mcapUsd: number | null;
  liqUsd: number;
  vol1hUsd: number;
  vol24hUsd: number;
  buys1h: number;
  sells1h: number;
  pairAgeMin: number | null;
  pairCreatedAt: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  volLiq: number;
  dump: boolean;
  pairUrl: string;
}

export interface DexFlowEval {
  dump: boolean;
  volLiqRising: boolean;
  confidenceDelta: number;
  reasons: string[];
}

function num(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pairAgeMin(createdAt: unknown): number | null {
  const ts = numOrNull(createdAt);
  if (ts === null || ts <= 0) return null;
  const ms = ts > 1e12 ? ts : ts * 1000;
  return Math.max(0, (Date.now() - ms) / 60_000);
}

export function pairUrl(pairAddress?: string | null, tokenAddress?: string | null): string {
  const target = pairAddress || tokenAddress;
  return target ? `https://dexscreener.com/${CHAIN}/${target}` : `https://dexscreener.com/${CHAIN}`;
}

export function isDexDump(buys1h: number, sells1h: number): boolean {
  return sells1h > buys1h * DUMP_SELL_MULT && sells1h > DUMP_MIN_SELLS;
}

export function evaluateDexFlow(flow: DexFlowSnapshot | null | undefined): DexFlowEval {
  if (!flow) {
    return { dump: false, volLiqRising: false, confidenceDelta: 0, reasons: [] };
  }
  const reasons: string[] = [];
  if (flow.dump) {
    reasons.push(`DEX dump: ${flow.sells1h} sells vs ${flow.buys1h} buys (1h)`);
    return { dump: true, volLiqRising: false, confidenceDelta: 0, reasons };
  }
  let confidenceDelta = 0;
  const rising = flow.volLiq >= VOL_LIQ_RISING;
  if (rising) {
    confidenceDelta += RISING_BONUS;
    reasons.push(`DEX vol/liq ${flow.volLiq.toFixed(2)} rising (+${RISING_BONUS})`);
  } else if (flow.volLiq >= VOL_LIQ_WARM) {
    reasons.push(`DEX vol/liq ${flow.volLiq.toFixed(2)}`);
  }
  if (flow.buys1h + flow.sells1h > 0) {
    const buyPct = (flow.buys1h / (flow.buys1h + flow.sells1h)) * 100;
    reasons.push(`DEX 1h ${flow.buys1h} buys / ${flow.sells1h} sells (${buyPct.toFixed(0)}% buy)`);
  }
  return { dump: false, volLiqRising: rising, confidenceDelta, reasons };
}

export function pairToFlow(pair: Record<string, any>): DexFlowSnapshot | null {
  const base = pair.baseToken && typeof pair.baseToken === 'object' ? pair.baseToken : {};
  const address = String(base.address || '');
  if (!address) return null;
  const txns = pair.txns && typeof pair.txns === 'object' ? pair.txns : {};
  const h1 = txns.h1 && typeof txns.h1 === 'object' ? txns.h1 : {};
  const volume = pair.volume && typeof pair.volume === 'object' ? pair.volume : {};
  const change = pair.priceChange && typeof pair.priceChange === 'object' ? pair.priceChange : {};
  const liq = pair.liquidity && typeof pair.liquidity === 'object' ? pair.liquidity : {};
  const quote = pair.quoteToken && typeof pair.quoteToken === 'object' ? pair.quoteToken : {};
  const liqUsd = num(liq.usd);
  const vol1hUsd = num(volume.h1);
  const buys1h = Math.max(0, Math.floor(num(h1.buys)));
  const sells1h = Math.max(0, Math.floor(num(h1.sells)));
  const pairAddress = pair.pairAddress ? String(pair.pairAddress) : null;
  return {
    chain: CHAIN,
    address,
    symbol: String(base.symbol || 'TOKEN'),
    pairAddress,
    dexId: pair.dexId ? String(pair.dexId) : null,
    quoteSymbol: quote.symbol ? String(quote.symbol) : null,
    priceUsd: numOrNull(pair.priceUsd),
    mcapUsd: numOrNull(pair.marketCap ?? pair.fdv),
    liqUsd,
    vol1hUsd,
    vol24hUsd: num(volume.h24),
    buys1h,
    sells1h,
    pairAgeMin: pairAgeMin(pair.pairCreatedAt),
    pairCreatedAt: numOrNull(pair.pairCreatedAt),
    priceChange1h: numOrNull(change.h1),
    priceChange24h: numOrNull(change.h24),
    volLiq: liqUsd > 0 ? vol1hUsd / liqUsd : 0,
    dump: isDexDump(buys1h, sells1h),
    pairUrl: pairUrl(pairAddress, address),
  };
}

export function bestPair(pairs: Record<string, any>[]): Record<string, any> | null {
  let best: { score: number; pair: Record<string, any> } | null = null;
  for (const pair of pairs) {
    if (!pair || typeof pair !== 'object') continue;
    const liq = num(pair.liquidity?.usd);
    const vol = num(pair.volume?.h24);
    const score = liq + vol;
    if (!best || score > best.score) best = { score, pair };
  }
  return best?.pair ?? null;
}

export class DexFlowAdapter {
  private static cache = new Map<string, { flow: DexFlowSnapshot; at: number }>();

  public static resetCache(): void {
    DexFlowAdapter.cache.clear();
  }

  private async getJson(url: string): Promise<unknown | null> {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'noraz/1.0' } });
      if (res.status === 404) return [];
      if (!res.ok) return null;
      return await res.json();
    } catch (err: any) {
      console.warn(`[DEX FLOW] ${url}: ${err?.message || err}`);
      return null;
    }
  }

  public async fetchTokenPairs(address: string): Promise<Record<string, any>[]> {
    const payload = await this.getJson(`${DEX_BASE}/token-pairs/v1/${CHAIN}/${address}`);
    return Array.isArray(payload) ? payload.filter((row) => row && typeof row === 'object') : [];
  }

  public async fetchPairsForTokens(addresses: string[]): Promise<Record<string, any>[]> {
    const out: Record<string, any>[] = [];
    const clean = addresses.map((a) => String(a || '').trim()).filter(Boolean);
    for (let i = 0; i < clean.length; i += BATCH_SIZE) {
      const part = clean.slice(i, i + BATCH_SIZE);
      const payload = await this.getJson(`${DEX_BASE}/tokens/v1/${CHAIN}/${part.join(',')}`);
      if (Array.isArray(payload)) {
        out.push(...payload.filter((row) => row && typeof row === 'object'));
      }
    }
    return out;
  }

  public async fetchFlow(address: string): Promise<DexFlowSnapshot | null> {
    const key = address.toLowerCase();
    const cached = DexFlowAdapter.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.flow;
    const pair = bestPair(await this.fetchTokenPairs(address));
    if (!pair) return null;
    const flow = pairToFlow(pair);
    if (flow) DexFlowAdapter.cache.set(key, { flow, at: Date.now() });
    return flow;
  }

  /**
   * One DexScreener call per 30 addresses. Missing tokens stay absent (fail-open).
   */
  public async fetchFlowBatch(addresses: string[]): Promise<Map<string, DexFlowSnapshot>> {
    const wanted = new Map<string, string>();
    const out = new Map<string, DexFlowSnapshot>();
    const now = Date.now();
    for (const addr of addresses) {
      if (!addr) continue;
      const key = addr.toLowerCase();
      const cached = DexFlowAdapter.cache.get(key);
      if (cached && now - cached.at < CACHE_TTL_MS) {
        out.set(key, cached.flow);
      } else {
        wanted.set(key, addr);
      }
    }
    if (wanted.size === 0) return out;

    let pairs: Record<string, any>[] = [];
    try {
      pairs = await this.fetchPairsForTokens([...wanted.values()]);
    } catch (err: any) {
      console.warn(`[DEX FLOW] Batch failed: ${err?.message || err}`);
      return out;
    }

    const grouped = new Map<string, Record<string, any>[]>();
    for (const pair of pairs) {
      const base = String(pair?.baseToken?.address || '').toLowerCase();
      if (!wanted.has(base)) continue;
      const rows = grouped.get(base) ?? [];
      rows.push(pair);
      grouped.set(base, rows);
    }

    for (const [key, rows] of grouped) {
      const pair = bestPair(rows);
      if (!pair) continue;
      const flow = pairToFlow(pair);
      if (!flow) continue;
      DexFlowAdapter.cache.set(key, { flow, at: Date.now() });
      out.set(key, flow);
    }
    return out;
  }
}
