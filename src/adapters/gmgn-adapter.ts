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

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GMGN_API_KEY;
  }

  public isApiKeyConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  public getGMGNWebUrl(chain: SolChain, contractAddress: string): string {
    return `https://gmgn.ai/${chain}/token/${contractAddress}`;
  }

  private async gmgnRequest<T>(
    method: 'GET' | 'POST',
    subPath: string,
    query: Record<string, string | number> = {},
    body?: unknown,
    retries = 1
  ): Promise<T | null> {
    const key = this.apiKey || process.env.GMGN_API_KEY || '';
    if (!key) return null;
    const timestamp = Math.floor(Date.now() / 1000);
    const client_id = crypto.randomUUID();
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), timestamp: String(timestamp), client_id });
    const url = `${this.baseUrl}${subPath}?${qs.toString()}`;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'X-APIKEY': key, 'Content-Type': 'application/json', 'User-Agent': 'athena/1.0' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429) {
        const reset = Number(res.headers.get('X-RateLimit-Reset') || 0) * 1000;
        const waitMs = Math.max(reset - Date.now(), 5000);
        console.warn(`[GMGN] Rate limited. Waiting ${Math.floor(waitMs / 1000)}s before retry (attempt ${retries}).`);
        if (retries > 0) { await new Promise(r => setTimeout(r, waitMs)); return this.gmgnRequest(method, subPath, query, body, retries - 1); }
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
  }

  private normalizeToken(raw: any, chain: SolChain, source: 'gmgn' | 'dexscreener' = 'gmgn'): GMGNRawToken {
    return {
      chain,
      address: raw.address || raw.contract_address || '',
      symbol: raw.symbol || 'TOKEN',
      name: raw.name || raw.symbol || 'Token',
      priceUsd: Number(raw.price || raw.price_usd || 0),
      marketCapUsd: Number(raw.market_cap ?? raw.usd_market_cap ?? 0),
      volume24hUsd: Number(raw.volume ?? raw.volume_24h ?? 0),
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
      source,
    };
  }

  public async fetchRank(chain: SolChain = 'sol', opts: { interval?: RankInterval; limit?: number } = {}): Promise<GMGNRawToken[]> {
    const res = await this.gmgnRequest<any>('GET', '/v1/market/rank', {
      chain, interval: opts.interval || '1h', limit: opts.limit || 20,
    });
    if (!res) return [];
    const rank: any[] = res?.data?.data?.rank || res?.data?.rank || res?.rank || [];
    if (!Array.isArray(rank)) return [];
    return rank.map((t) => this.normalizeToken(t, chain));
  }

  public async fetchTrenches(chain: SolChain = 'sol', opts: { limit?: number } = {}): Promise<{ newCreation: GMGNRawToken[]; nearCompletion: GMGNRawToken[]; completed: GMGNRawToken[] }> {
    const res = await this.gmgnRequest<any>('POST', '/v1/trenches', { chain }, {
      type: ['new_creation', 'near_completion', 'completed'],
      limit: opts.limit || 20,
    });
    const empty = { newCreation: [], nearCompletion: [], completed: [] };
    if (!res) return empty;
    const d = res?.data || {};
    return {
      newCreation: Array.isArray(d.new_creation) ? d.new_creation.map((t: any) => this.normalizeToken(t, chain)) : [],
      nearCompletion: Array.isArray(d.pump) ? d.pump.map((t: any) => this.normalizeToken(t, chain)) : [],
      completed: Array.isArray(d.completed) ? d.completed.map((t: any) => this.normalizeToken(t, chain)) : [],
    };
  }

  public async fetchTokenSignals(chain: SolChain = 'sol', signalTypes: number[] = [], opts: { limit?: number; mcMin?: number; mcMax?: number } = {}): Promise<TokenSignalEvent[]> {
    const res = await this.gmgnRequest<any>('POST', '/v1/market/token_signal', {}, {
      chain,
      groups: [{ signal_type: signalTypes.length > 0 ? signalTypes : undefined, mc_min: opts.mcMin, mc_max: opts.mcMax }],
    });
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

  public async fetchHotSearches(chain: SolChain = 'sol', opts: { interval?: RankInterval; limit?: number } = {}): Promise<GMGNRawToken[]> {
    const res = await this.gmgnRequest<any>('POST', '/v1/market/hot_searches', {}, {
      params: [{ chain, interval: opts.interval || '1h', limit: opts.limit || 20 }],
    });
    if (!res) return [];
    const data = res?.data;
    if (!Array.isArray(data)) return [];
    const tokens = data[0]?.tokens;
    if (!Array.isArray(tokens)) return [];
    return tokens.map((t: any) => this.normalizeToken(t, chain));
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
    }));
  }
}
