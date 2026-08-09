import crypto from 'node:crypto';

export type SolChain = 'sol' | 'base' | 'eth' | 'bsc' | 'robinhood';
export type RankInterval = '1m' | '5m' | '1h' | '6h' | '24h';

export interface GMGNRawToken {
  chain: SolChain;
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number;
  volume24hUsd: number;
  volume1hUsd: number; // real 1h volume bila tersedia (trenches/signal); 0 = tidak diketahui
  liquidityUsd: number;
  buys: number;
  sells: number;
  swaps: number;
  holderCount: number;
  top10HolderRate: number | null;
  devTeamHoldRate: number | null;
  creatorClose: boolean;
  creatorTokenStatus: string | null;
  smartDegenCount: number;
  renownedCount: number;
  bundlerRate: number | null;
  ratTraderAmountRate: number | null;
  rugRatio: number | null;
  isWashTrading: boolean;
  /** Honeypot flag dari GMGN (EVM: '1' = tidak bisa dijual). null = tidak dilaporkan. */
  isHoneypot: boolean | null;
  ctoFlag: boolean;
  renouncedMint: boolean;
  renouncedFreeze: boolean;
  creationTimestamp: number | null;
  openTimestamp: number | null;
  priceChange1m: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  visitingCount: number;
  squareMentions: number;
  twitterRenameCount: number;
  twitterDelPostCount: number;
  twitterCreateTokenCount: number;
  buyTax: string | null;
  sellTax: string | null;
  dexscrBoostFee: number;
  dexscrAd: number;
  totalFeeNative: number | null;
  /** Current exchange/venue: 'pump' = masih bonding curve; 'pump_amm'/'raydium'/dll = sudah graduated ke DEX. */
  exchange: string | null;
  /** Launchpad asal (Pump.fun, letsbonk, moonshot_app, ...). */
  launchpadPlatform: string | null;
  /** '0' = launching (bonding curve), '1' = migrated/graduated ke DEX. */
  launchpadStatus: string | null;
  /** Bonding curve progress 0-1 (trenches/signal snapshot). */
  progress: number | null;
  source: 'gmgn' | 'dexscreener';
}

export interface TokenSignalEvent {
  token_address: string;
  signal_type: number;
  trigger_at: number;
  trigger_mc: number;
  data: GMGNRawToken;
}

/**
 * Trade feed wallet-level dari GMGN (`/v1/user/smartmoney` & `/v1/user/kol`):
 * real-time buy/sell per smart-money / KOL wallet. Dipakai sebagai candidate
 * source (akumulasi smart money) dan position alerts (smart money exit).
 */
export interface GMGNTrackTrade {
  tokenAddress: string;
  tokenSymbol: string;
  side: 'buy' | 'sell';
  amountUsd: number;
  /** 1 = posisi dibuka penuh / ditutup penuh (konteks bergantung sumber: kol/smartmoney 1 = close/reduce). */
  isFullClose: boolean;
  maker: string;
  makerTags: string[];
  timestamp: number;
  kind: 'smartmoney' | 'kol';
}

/**
 * Audit keamanan token dari GMGN `/v1/token/security` — endpoint audit
 * per-token (panel "Token Audit" di UI GMGN): honeypot, blacklist, renounced,
 * tax, burn, lock, open source. Normalized; semua nilai real dari API.
 */
export interface GMGNSecurityAudit {
  chain: string;
  address: string;
  isHoneypot: boolean;
  isBlacklist: boolean;
  isRenounced: boolean;
  renouncedMint: boolean;
  renouncedFreeze: boolean;
  /** 1 = token TIDAK bisa dijual (sell-locked honeypot). 0/tidak diketahui = 0. */
  canNotSell: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  averageTaxPct: number;
  highTaxPct: number;
  isOpenSource: boolean;
  burnRatioPct: number;
  isLocked: boolean;
  isShowAlert: boolean;
  flags: string[];
}

/**
 * Legacy compatibility alias: GMGNRawToken is the canonical type. Older callers
 * (screening agents, audit service, TUI, hub) rely on the previous
 * GMGNTokenSignal shape — the extra members keep them compiling unchanged.
 */
export type GMGNTokenSignal = GMGNRawToken & {
  contractAddress: string;
  tokenAgeHours?: number;
  smartMoneyNetBuySolOrEth: number;
  smartMoneyCount: number;
  devHoldingPercentage: number;
};

export class GMGNAdapter {
  private baseUrl = 'https://openapi.gmgn.ai';
  private apiKey?: string;

  /** Cache audit security — module-level, dibagi SEMUA instansi adapter. */
  private static securityCache = new Map<string, { audit: GMGNSecurityAudit; at: number }>();
  private static readonly SECURITY_CACHE_TTL_MS = 10 * 60 * 1000;

  /** Cache trade feed — module-level (semua instansi berbagi), TTL 60 detik. */
  private static trackCache = new Map<string, { trades: GMGNTrackTrade[]; at: number }>();
  private static readonly TRACK_CACHE_TTL_MS = 60 * 1000;

  /**
   * Global pacing queue — ALL GMGN requests (every adapter instance: meme
   * solana/robinhood, LP enrich, dll) antri di sini dengan spacing minimal
   * agar request tidak bertabrakan dalam satu sesi 5 menit. GMGN memakai
   * leaky bucket rate=20/capacity=20 per key — dengan spacing ini burst
   * (mis. 30 request enrich LP sekaligus) otomatis tersebar.
   */
  private static requestQueue: Promise<void> = Promise.resolve();
  private static lastRequestAt = 0;
  private readonly requestSpacingMs = Math.max(
    100,
    Number(process.env.GMGN_REQUEST_SPACING_MS || 300)
  );

  private async paced<T>(fn: () => Promise<T>): Promise<T> {
    const prev = GMGNAdapter.requestQueue;
    let release!: () => void;
    GMGNAdapter.requestQueue = new Promise((r) => { release = r; });
    await prev;
    try {
      const wait = Math.max(0, GMGNAdapter.lastRequestAt + this.requestSpacingMs - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      GMGNAdapter.lastRequestAt = Date.now();
      return await fn();
    } finally {
      release();
    }
  }

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GMGN_API_KEY;
  }

  private async gmgnRequest<T>(
    method: 'GET' | 'POST',
    subPath: string,
    query: Record<string, string | number | string[] | number[]> = {},
    body?: unknown,
    retries = 1
  ): Promise<T | null> {
    const key = this.apiKey || process.env.GMGN_API_KEY || '';
    if (!key) return null;
    const doRequest = async (attemptsLeft: number): Promise<T | null> => {
      const timestamp = Math.floor(Date.now() / 1000);
      const client_id = crypto.randomUUID();
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (Array.isArray(v)) {
          for (const item of v) params.append(k, String(item));
        } else {
          params.set(k, String(v));
        }
      }
      params.set('timestamp', String(timestamp));
      params.set('client_id', client_id);
      const url = `${this.baseUrl}${subPath}?${params.toString()}`;
      try {
        const res = await fetch(url, {
          method,
          headers: { 'X-APIKEY': key, 'Content-Type': 'application/json', 'User-Agent': 'athena/1.0' },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (res.status === 429) {
          // Retry santun (docs GMGN): baca waktu reset, tunggu sampai reset + buffer,
          // lalu retry MAKSIMAL sekali. Jangan spam: setiap retry saat cooldown
          // memperpanjang ban 5 detik (sampai 5 menit). Ban panjang (>30s) di-skip —
          // scan berikutnya (5 menit lagi) yang coba ulang.
          let resetSec = Number(res.headers.get('X-RateLimit-Reset') || 0);
          let banned = false;
          if (!resetSec) {
            try {
              const errBody: any = await res.json();
              resetSec = Number(errBody?.reset_at || 0);
              banned = errBody?.error === 'RATE_LIMIT_BANNED';
            } catch { /* body bukan JSON — pakai header saja */ }
          }
          const waitMs = resetSec > 0 ? Math.max(resetSec * 1000 - Date.now(), 0) + 1000 : 5000;
          if (!banned && attemptsLeft > 0 && waitMs <= 30_000) {
            console.warn(`[GMGN] Rate limited. Waiting ${Math.floor(waitMs / 1000)}s, lalu retry sekali (attempt tersisa: ${attemptsLeft}).`);
            await new Promise((r) => setTimeout(r, waitMs));
            return doRequest(attemptsLeft - 1);
          }
          console.warn(`[GMGN] Rate limited${banned ? ' (BANNED)' : ''} — skip ${subPath}, coba lagi di pass berikutnya (~5m).`);
          return null;
        }
        if (!res.ok) { console.warn(`[GMGN] HTTP ${res.status} for ${subPath}`); return null; }
        const json: any = await res.json();
        if (json && typeof json === 'object' && json.code !== undefined && json.code !== 0) {
          console.warn(`[GMGN] API code ${json.code}: ${json.message || json.error || ''}`);
          return null;
        }
        return json as T;
      } catch (err: any) {
        console.error(`[GMGN ERROR] ${subPath}: ${err.message}`);
        return null;
      }
    };
    return this.paced(() => doRequest(retries));
  }

  /**
   * Map a rank/hot_searches interval to the window of the bare `volume` field:
   * intervals <= 1h report 1h volume; 6h/24h intervals report 24h volume.
   */
  private volumeWindowForInterval(interval: RankInterval): '1h' | '24h' {
    return interval === '6h' || interval === '24h' ? '24h' : '1h';
  }

  /**
   * Normalize a raw GMGN token. `raw.volume` semantics depend on the API
   * context:
   *  - /v1/market/rank & /v1/market/hot_searches: `volume` = volume in the
   *    QUERIED INTERVAL (1h when interval=1h, 24h when interval=24h).
   *  - /v1/trenches & token_signal: explicit `volume_1h` / `volume_24h`.
   * Pass `bareVolumeWindow` so bare `volume` is mapped to the right field.
   */
  private normalizeToken(
    raw: any,
    chain: SolChain,
    source: 'gmgn' | 'dexscreener' = 'gmgn',
    bareVolumeWindow: '1h' | '24h' = '24h'
  ): GMGNRawToken {
    const has24h = raw.volume_24h !== undefined && raw.volume_24h !== null;
    const has1h = raw.volume_1h !== undefined && raw.volume_1h !== null;
    const bareVolume = Number(raw.volume ?? 0);
    const volume24hUsd = has24h ? Number(raw.volume_24h) : (bareVolumeWindow === '24h' ? bareVolume : 0);
    const volume1hUsd = has1h ? Number(raw.volume_1h) : (bareVolumeWindow === '1h' ? bareVolume : 0);
    return {
      chain,
      address: raw.address || raw.contract_address || '',
      symbol: raw.symbol || 'TOKEN',
      name: raw.name || raw.symbol || 'Token',
      priceUsd: Number(raw.price || raw.price_usd || 0),
      marketCapUsd: Number(raw.market_cap ?? raw.usd_market_cap ?? 0),
      volume24hUsd,
      volume1hUsd, // real 1h (trenches/signal) atau volume interval-1h (rank/hot); 0 = tidak diketahui
      liquidityUsd: Number(raw.liquidity ?? 0),
      buys: Number(raw.buys ?? raw.buys_24h ?? 0),
      sells: Number(raw.sells ?? raw.sells_24h ?? 0),
      swaps: Number(raw.swaps ?? raw.swaps_24h ?? 0),
      holderCount: Number(raw.holder_count ?? 0),
      top10HolderRate: typeof raw.top_10_holder_rate === 'number' ? raw.top_10_holder_rate : null,
      devTeamHoldRate: typeof raw.dev_team_hold_rate === 'number' ? raw.dev_team_hold_rate : null,
      creatorClose: raw.creator_close === true || raw.creator_token_status === 'creator_close',
      creatorTokenStatus: raw.creator_token_status || null,
      smartDegenCount: Number(raw.smart_degen_count ?? 0),
      renownedCount: Number(raw.renowned_count ?? 0),
      bundlerRate: typeof raw.bundler_rate === 'number' ? raw.bundler_rate : null,
      ratTraderAmountRate: typeof raw.rat_trader_amount_rate === 'number' ? raw.rat_trader_amount_rate : null,
      rugRatio: typeof raw.rug_ratio === 'number' ? raw.rug_ratio : null,
      isWashTrading: raw.is_wash_trading === true || raw.is_wash_trading === 1,
      isHoneypot: raw.is_honeypot === '1' || raw.is_honeypot === 1 || raw.is_honeypot === true
        ? true
        : (raw.is_honeypot === '0' || raw.is_honeypot === 0 || raw.is_honeypot === false ? false : null),
      ctoFlag: raw.cto_flag === 1 || raw.cto_flag === true,
      renouncedMint: raw.renounced_mint === 1 || raw.renounced_mint === true,
      renouncedFreeze: raw.renounced_freeze_account === 1 || raw.renounced_freeze_account === true,
      creationTimestamp: Number(raw.creation_timestamp || raw.open_timestamp || 0) || null,
      openTimestamp: Number(raw.open_timestamp || 0) || null,
      priceChange1m: typeof raw.price_change_percent1m === 'number' ? raw.price_change_percent1m : null,
      priceChange5m: typeof raw.price_change_percent5m === 'number' ? raw.price_change_percent5m : null,
      priceChange1h: typeof raw.price_change_percent1h === 'number' ? raw.price_change_percent1h : null,
      visitingCount: Number(raw.visiting_count ?? 0),
      squareMentions: Number(raw.square_mentions ?? 0),
      twitterRenameCount: Number(raw.twitter_rename_count ?? 0),
      twitterDelPostCount: Number(raw.twitter_del_post_token_count ?? 0),
      twitterCreateTokenCount: Number(raw.twitter_create_token_count ?? 0),
      buyTax: raw.buy_tax !== undefined && raw.buy_tax !== '' ? String(raw.buy_tax) : null,
      sellTax: raw.sell_tax !== undefined && raw.sell_tax !== '' ? String(raw.sell_tax) : null,
      dexscrBoostFee: Number(raw.dexscr_boost_fee ?? 0),
      dexscrAd: Number(raw.dexscr_ad ?? 0),
      totalFeeNative: typeof raw.total_fee === 'number' && raw.total_fee > 0
        ? raw.total_fee
        : (typeof raw.gas_fee === 'number' && raw.gas_fee > 0 ? raw.gas_fee : null),
      exchange: raw.exchange ? String(raw.exchange) : null,
      launchpadPlatform: raw.launchpad_platform ? String(raw.launchpad_platform) : null,
      launchpadStatus: raw.launchpad_status !== undefined && raw.launchpad_status !== null
        ? String(raw.launchpad_status)
        : null,
      progress: typeof raw.progress === 'number' ? raw.progress : null,
      source,
    };
  }

  /**
   * /v1/token/info nests live metrics differently than /v1/market/rank:
   * price/volume/buys/sells/swaps live under `data.price`, holder/supply stats at
   * top level, smart-money counts under `data.wallet_tags_stat`, token-state fields
   * under `data.dev`/`data.stat`. Flatten into the rank-style shape normalizeToken expects.
   */
  private flattenTokenInfo(data: any): any {
    const price = data?.price && typeof data.price === 'object' ? data.price : {};
    const stat = data?.stat && typeof data.stat === 'object' ? data.stat : {};
    const dev = data?.dev && typeof data.dev === 'object' ? data.dev : {};
    const walletTags = data?.wallet_tags_stat && typeof data.wallet_tags_stat === 'object' ? data.wallet_tags_stat : {};
    const priceUsd = Number(price.price ?? data?.price ?? 0) || 0;
    const circSupply = Number(data?.circulating_supply ?? 0);
    const numOrNull = (v: any): number | null => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const pctChange = (baseRaw: any): number | null => {
      const base = numOrNull(baseRaw);
      return base !== null && base > 0 ? ((priceUsd / base - 1) * 100) : null;
    };
    const totalFee = numOrNull(data?.total_fee);
    const hasVol1h = price.volume_1h !== undefined && price.volume_1h !== null;
    const hasVol24h = price.volume_24h !== undefined && price.volume_24h !== null;
    return {
      ...data,
      price: priceUsd,
      volume_1h: hasVol1h ? price.volume_1h : undefined,
      volume_24h: hasVol24h ? price.volume_24h : (data?.volume !== undefined ? data.volume : undefined),
      buys: price.buys_24h ?? data?.buys,
      sells: price.sells_24h ?? data?.sells,
      swaps: price.swaps_24h ?? data?.swaps,
      market_cap: priceUsd > 0 && circSupply > 0 ? priceUsd * circSupply : undefined,
      holder_count: data?.holder_count ?? stat.holder_count ?? 0,
      smart_degen_count: walletTags.smart_wallets ?? stat.bot_degen_count ?? 0,
      renowned_count: walletTags.renowned_wallets ?? 0,
      creator_token_status: dev.creator_token_status ?? data?.creator_token_status ?? null,
      cto_flag: dev.cto_flag ?? data?.cto_flag ?? 0,
      top_10_holder_rate: numOrNull(stat.top_10_holder_rate ?? dev.top_10_holder_rate),
      dev_team_hold_rate: numOrNull(stat.dev_team_hold_rate),
      bundler_rate: numOrNull(stat.top_bundler_trader_percentage),
      rat_trader_amount_rate: numOrNull(stat.top_rat_trader_percentage),
      dexscr_boost_fee: dev.dexscr_boost_fee ?? 0,
      dexscr_ad: dev.dexscr_ad ?? 0,
      twitter_del_post_token_count: dev.twitter_del_post_token_count ?? 0,
      twitter_create_token_count: dev.twitter_create_token_count ?? 0,
      total_fee: totalFee !== null && totalFee > 0 ? totalFee : undefined,
      price_change_percent1m: pctChange(price.price_1m),
      price_change_percent5m: pctChange(price.price_5m),
      price_change_percent1h: pctChange(price.price_1h),
    };
  }

  /**
   * Fetch a single token's detail from GMGN OpenAPI. Response nests the token under
   * `data`; null on any failure (fail-closed).
   */
  public async fetchTokenInfo(chain: SolChain, address: string): Promise<GMGNRawToken | null> {
    const res = await this.gmgnRequest<any>('GET', '/v1/token/info', { chain, address });
    if (!res) return null;
    const data = res?.data;
    if (!data || typeof data !== 'object') return null;
    return this.normalizeToken(this.flattenTokenInfo(data), chain);
  }

  /**
   * Audit keamanan per-token dari `/v1/token/security` (panel "Token Audit"
   * UI GMGN): honeypot, blacklist, renounced, can_sell, tax (avg/high), burn,
   * lock, open source. Cache MODULE-LEVEL 10 menit — dibagi semua instansi
   * (meme agent, hub LP, on-demand audit) supaya token yang sama tidak
   * di-audit berulang dalam jendela yang sama. Fail-closed: error → null.
   */
  public async fetchTokenSecurity(chain: SolChain, address: string): Promise<GMGNSecurityAudit | null> {
    const key = `${chain}:${address.toLowerCase()}`;
    const cached = GMGNAdapter.securityCache.get(key);
    if (cached && Date.now() - cached.at < GMGNAdapter.SECURITY_CACHE_TTL_MS) {
      return cached.audit;
    }
    const res = await this.gmgnRequest<any>('GET', '/v1/token/security', { chain, address });
    if (!res) return null;
    const d = res?.data;
    if (!d || typeof d !== 'object') return null;
    const audit: GMGNSecurityAudit = {
      chain,
      address,
      isHoneypot: d.is_honeypot === true || d.is_honeypot === 1 || d.is_honeypot === '1',
      isBlacklist: d.is_blacklist === true || d.is_blacklist === 1 || d.is_blacklist === '1',
      isRenounced: d.is_renounced === true || d.is_renounced === 1 || d.is_renounced === '1',
      renouncedMint: d.renounced_mint === true || d.renounced_mint === 1 || d.renounced_mint === '1',
      renouncedFreeze: d.renounced_freeze_account === true || d.renounced_freeze_account === 1 || d.renounced_freeze_account === '1',
      canNotSell: d.can_not_sell === true || d.can_not_sell === 1 || d.can_not_sell === '1',
      buyTaxPct: parseFloat(String(d.buy_tax ?? '0')) || 0,
      sellTaxPct: parseFloat(String(d.sell_tax ?? '0')) || 0,
      averageTaxPct: parseFloat(String(d.average_tax ?? '0')) || 0,
      highTaxPct: parseFloat(String(d.high_tax ?? '0')) || 0,
      isOpenSource: d.is_open_source === true || d.is_open_source === 1 || d.is_open_source === '1',
      burnRatioPct: parseFloat(String(d.burn_ratio ?? '0')) || 0,
      isLocked: Boolean(d.lock_summary?.is_locked),
      isShowAlert: d.is_show_alert === true || d.is_show_alert === 1 || d.is_show_alert === '1',
      flags: Array.isArray(d.flags) ? d.flags.map((f: unknown) => String(f)) : [],
    };
    GMGNAdapter.securityCache.set(key, { audit, at: Date.now() });
    return audit;
  }

  /**
   * Trade feed real-time dari smart-money / KOL wallets (`/v1/user/smartmoney`
   * & `/v1/user/kol`). Public keyless (exist auth), weight 1. Cache module-level
   * 60 detik — dipakai meme agents (kandidat akumulasi) & wallet-tracker (exit
   * alert) tanpa duplikasi request. Fail-open: error → [].
   */
  public async fetchTrackTrades(chain: SolChain, kind: 'smartmoney' | 'kol'): Promise<GMGNTrackTrade[]> {
    const key = `track:${chain}:${kind}`;
    const cached = GMGNAdapter.trackCache.get(key);
    if (cached && Date.now() - cached.at < GMGNAdapter.TRACK_CACHE_TTL_MS) {
      return cached.trades;
    }
    const res = await this.gmgnRequest<any>('GET', `/v1/user/${kind}`, { chain, limit: 100 });
    if (!res) return [];
    const list: any[] = Array.isArray(res?.data?.list) ? res.data.list : (Array.isArray(res?.list) ? res.list : []);
    const trades: GMGNTrackTrade[] = list
      .map((t: any) => {
        const addr = String(t?.base_address || '');
        if (!addr) return null;
        const side: 'buy' | 'sell' = String(t?.side || '').toLowerCase() === 'sell' ? 'sell' : 'buy';
        return {
          tokenAddress: addr.toLowerCase(),
          tokenSymbol: String(t?.base_token?.symbol || ''),
          side,
          amountUsd: Number(t?.amount_usd ?? 0) || 0,
          isFullClose: t?.is_open_or_close === 1 || t?.is_open_or_close === '1',
          maker: String(t?.maker || ''),
          makerTags: Array.isArray(t?.maker_info?.tags) ? t.maker_info.tags.map((x: unknown) => String(x)) : [],
          timestamp: Number(t?.timestamp ?? 0) || 0,
          kind,
        };
      })
      .filter((t: GMGNTrackTrade | null): t is GMGNTrackTrade => t !== null)
      .sort((a, b) => b.timestamp - a.timestamp);
    GMGNAdapter.trackCache.set(key, { trades, at: Date.now() });
    return trades;
  }

  /**
   * /v1/market/rank — trending tokens per interval.
   * Server-side filters: boolean tags (e.g. renounced/frozen/is_out_market),
   * platforms (Pump.fun, letsbonk, ...), and min_* / max_* range fields.
   */
  public async fetchRank(
    chain: SolChain = 'sol',
    opts: {
      interval?: RankInterval;
      limit?: number;
      filters?: string[];
      platforms?: string[];
      range?: Record<string, string | number>;
    } = {}
  ): Promise<GMGNRawToken[]> {
    const query: Record<string, string | number | string[]> = {
      chain,
      interval: opts.interval || '1h',
      limit: opts.limit || 100,
    };
    if (opts.filters?.length) query.filters = opts.filters;
    if (opts.platforms?.length) query.platforms = opts.platforms;
    if (opts.range) Object.assign(query, opts.range);
    const res = await this.gmgnRequest<any>('GET', '/v1/market/rank', query);
    if (!res) return [];
    const rank: any[] = res?.data?.data?.rank || res?.data?.rank || res?.rank || [];
    if (!Array.isArray(rank)) return [];
    return rank.map((t) => this.normalizeToken(t, chain, 'gmgn', this.volumeWindowForInterval(opts.interval || '1h')));
  }

  /**
   * /v1/trenches — newly launched tokens per category. Uses the v2 request
   * shape (version + per-category filter section). `near_completion` is
   * returned under the `pump` key by the API.
   */
  public async fetchTrenches(
    chain: SolChain = 'sol',
    opts: {
      types?: Array<'new_creation' | 'near_completion' | 'completed'>;
      limit?: number;
      filters?: Record<string, string | number>;
    } = {}
  ): Promise<{ newCreation: GMGNRawToken[]; nearCompletion: GMGNRawToken[]; completed: GMGNRawToken[] }> {
    const types = opts.types?.length ? opts.types : ['new_creation', 'near_completion', 'completed'];
    const actualLimit = opts.limit || 80;
    // launchpad_platform_v2 breaks robinhood (returns 0 tokens); only SOL supports it
    const section: Record<string, unknown> = {
      filters: ['offchain', 'onchain'],
      ...(chain === 'sol' ? { launchpad_platform_v2: true } : {}),
      limit: actualLimit,
      ...(opts.filters || {}),
    };
    const body: Record<string, unknown> = { version: 'v2' };
    for (const type of types) body[type] = { ...section };
    const res = await this.gmgnRequest<any>('POST', '/v1/trenches', { chain }, body);
    const empty = { newCreation: [], nearCompletion: [], completed: [] };
    if (!res) return empty;
    const d = res?.data || {};
    return {
      newCreation: Array.isArray(d.new_creation) ? d.new_creation.map((t: any) => this.normalizeToken(t, chain)) : [],
      nearCompletion: Array.isArray(d.pump) ? d.pump.map((t: any) => this.normalizeToken(t, chain)) : [],
      completed: Array.isArray(d.completed) ? d.completed.map((t: any) => this.normalizeToken(t, chain)) : [],
    };
  }

  /**
   * /v1/market/token_signal — real-time signal events (price spikes, smart
   * money buys, CTO, KOL buys, ...). Max 50 results per group; multiple
   * groups run in parallel and merge by trigger_at desc.
   */
  public async fetchTokenSignals(
    chain: SolChain = 'sol',
    signalTypes: number[] = [],
    opts: {
      groups?: Array<{ signal_type?: number[]; mc_min?: number; mc_max?: number; trigger_mc_min?: number; trigger_mc_max?: number; total_fee_min?: number; total_fee_max?: number }>;
      mcMin?: number;
      mcMax?: number;
    } = {}
  ): Promise<TokenSignalEvent[]> {
    const groups = opts.groups?.length
      ? opts.groups
      : [{ signal_type: signalTypes.length > 0 ? signalTypes : undefined, mc_min: opts.mcMin, mc_max: opts.mcMax }];
    const res = await this.gmgnRequest<any>('POST', '/v1/market/token_signal', {}, { chain, groups });
    if (!res) return [];
    const data = res?.data;
    if (!Array.isArray(data)) return [];
    return data.map((e: any) => ({
      token_address: e.token_address || '',
      signal_type: Number(e.signal_type || 0),
      trigger_at: Number(e.trigger_at || 0),
      trigger_mc: Number(e.trigger_mc || 0),
      data: this.normalizeToken(e.data || {}, chain),
    })).filter((e) => e.token_address);
  }

  /**
   * /v1/market/hot_searches — most-searched tokens ranked by visiting_count.
   * Supports server-side boolean filters (e.g. migrated/renounced/frozen).
   */
  public async fetchHotSearches(
    opts: {
      chain?: SolChain;
      interval?: RankInterval;
      limit?: number;
      filters?: string[];
    } = {}
  ): Promise<GMGNRawToken[]> {
    const chain = opts.chain || 'sol';
    const res = await this.gmgnRequest<any>('POST', '/v1/market/hot_searches', {}, {
      params: [{
        label: 'hot-search',
        chain,
        interval: opts.interval || '1h',
        limit: opts.limit || 100,
        ...(opts.filters?.length ? { filters: opts.filters } : {}),
      }],
    });
    if (!res) return [];
    const data = res?.data;
    if (!Array.isArray(data) || data.length === 0) return [];
    const tokens = data[0]?.tokens;
    if (!Array.isArray(tokens)) return [];
    return tokens.map((t: any) => this.normalizeToken(t, chain, 'gmgn', this.volumeWindowForInterval(opts.interval || '1h')));
  }

  /**
   * DexScreener fallback (kept from legacy behavior). Returns normalized tokens with
   * source: 'dexscreener' and GMGN-only metrics zeroed/null — used only when GMGN fails.
   */
  public async fetchDexScreenerFallback(chain: SolChain = 'sol'): Promise<GMGNRawToken[]> {
    try {
      // 1. Try DexScreener Top Boosts API for real live trending tokens
      const boostsRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
      if (boostsRes.ok) {
        const boostedTokens: any[] = (await boostsRes.json()) as any[];
        const targetChainId = chain === 'sol' ? 'solana' : chain;
        const matchingBoosted = boostedTokens.filter((t: any) => t.chainId === targetChainId);

        if (matchingBoosted.length > 0) {
          const addrs = matchingBoosted.slice(0, 10).map((t: any) => t.tokenAddress).join(',');
          const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`);
          if (pairRes.ok) {
            const pairData: any = await pairRes.json();
            if (pairData.pairs && Array.isArray(pairData.pairs) && pairData.pairs.length > 0) {
              return pairData.pairs.map((pair: any) => this.normalizeDexScreenerPair(pair, chain));
            }
          }
        }
      }

      // 2. Fallback to DexScreener Search API if Top Boosts is empty for target chain
      const query = chain === 'sol' ? 'pump' : chain;
      const searchRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${query}`);
      if (searchRes.ok) {
        const searchData: any = await searchRes.json();
        const targetChainId = chain === 'sol' ? 'solana' : chain;
        if (searchData.pairs && Array.isArray(searchData.pairs)) {
          const chainPairs = searchData.pairs.filter((p: any) => p.chainId === targetChainId);
          if (chainPairs.length > 0) {
            return chainPairs.slice(0, 10).map((pair: any) => this.normalizeDexScreenerPair(pair, chain));
          }
        }
      }
    } catch (err: any) {
      console.error('[GMGN ADAPTER DEXSCREENER ERROR]', err.message);
    }

    return [];
  }

  private normalizeDexScreenerPair(pair: any, chain: SolChain): GMGNRawToken {
    const priceUsd = parseFloat(pair.priceUsd || '0') || 0;
    const volume24hUsd = pair.volume?.h24 || 0;
    const volume1hUsd = pair.volume?.h1 || 0;
    const liquidityUsd = pair.liquidity?.usd || 0;
    const priceChange1h = typeof pair.priceChange?.h1 === 'number' ? pair.priceChange.h1 : null;
    return {
      chain,
      address: pair.baseToken?.address || '',
      symbol: pair.baseToken?.symbol || 'TOKEN',
      name: pair.baseToken?.name || pair.baseToken?.symbol || 'Token',
      priceUsd,
      marketCapUsd: pair.marketCap || pair.fdv || 0,
      volume24hUsd,
      volume1hUsd,
      liquidityUsd,
      buys: 0,
      sells: 0,
      swaps: 0,
      holderCount: 0,
      top10HolderRate: null,
      devTeamHoldRate: null,
      creatorClose: false,
      creatorTokenStatus: null,
      smartDegenCount: 0,
      renownedCount: 0,
      bundlerRate: null,
      ratTraderAmountRate: null,
      rugRatio: null,
      isWashTrading: false,
      isHoneypot: null,
      ctoFlag: false,
      renouncedMint: false,
      renouncedFreeze: false,
      creationTimestamp: pair.pairCreatedAt || null,
      openTimestamp: null,
      priceChange1m: null,
      priceChange5m: null,
      priceChange1h,
      visitingCount: 0,
      squareMentions: 0,
      twitterRenameCount: 0,
      twitterDelPostCount: 0,
      twitterCreateTokenCount: 0,
      buyTax: null,
      sellTax: null,
      dexscrBoostFee: 0,
      dexscrAd: 0,
      totalFeeNative: null, // DexScreener does not expose total fees
      exchange: null,
      launchpadPlatform: null,
      launchpadStatus: null,
      progress: null,
      source: 'dexscreener',
    };
  }

  /**
   * Kept for legacy callers (screening agents, audit service, TUI, hub): returns the
   * DexScreener fallback list in the old GMGNTokenSignal shape (source: 'dexscreener',
   * smart-money metrics zeroed). New GMGN endpoints live on fetchRank/fetchTrenches/etc.
   */
  public async fetchTrendingSignals(chain: SolChain = 'sol'): Promise<GMGNTokenSignal[]> {
    const tokens = await this.fetchDexScreenerFallback(chain);
    return tokens.map((t) => ({
      ...t,
      contractAddress: t.address,
      smartMoneyNetBuySolOrEth: 0,
      smartMoneyCount: t.smartDegenCount,
      devHoldingPercentage: t.devTeamHoldRate ?? 0,
      tokenAgeHours: t.creationTimestamp ? (Date.now() - t.creationTimestamp) / 3600000 : undefined,
      sniperRatioPercentage: 0,
      gmgnUrl: `https://gmgn.ai/${chain}/token/${t.address}`,
      aiThesis: `DexScreener fallback signal: $${t.symbol} — volume $${(t.volume24hUsd / 1000).toFixed(1)}k, liquidity $${(t.liquidityUsd / 1000).toFixed(1)}k.`,
    }));
  }
}
