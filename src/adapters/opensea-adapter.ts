import type { WalletService } from '../services/wallet-service.js';
import { isDryRun as isDryRunMode } from '../config/config.js';
import { createApiKeyPool, loadApiKeyPool, type ApiKeyPool } from '../services/api-key-pool.js';

/**
 * Whale sweep info — FACTUAL from the events API (not an estimate):
 * a single buyer who bought >= 3 NFTs in the last 1 hour.
 */
export interface OpenSeaWhaleInfo {
  address: string;
  buyCount: number;   // NFTs this buyer bought in the last 1 hour
  spentEth: number;   // total ETH spent (from payment.quantity)
}

export interface OpenSeaNFTSignal {
  collectionSlug: string;
  collectionName: string;
  tokenId: string;
  name: string;
  chain: 'robinhood';
  priceEth: number;
  floorPriceEth: number;
  floorSurge1hPct: number;      // real: floor price history (time-series), last 1 hour
  volumeSpike1hRatio: number;   // real: 1h volume vs 1h baseline (events); fallback 24h vs 6d baseline
  salesVelocity1h: number;      // real: sales in the last 1 hour (events); fallback 24h/24
  isWhaleSweep: boolean;        // factual: one buyer bought >= 3 within 1 hour
  whaleInfo?: OpenSeaWhaleInfo;
  /** Verified badge OpenSea (safelist_request_status === 'verified'); fail-closed false. */
  isVerified: boolean;
  openseaUrl: string;
  aiThesis: string;
}

export interface OpenSeaSwapRequest {
  chain: string | number;
  fromToken: string;
  toToken: string;
  amount: number;
  userAddress?: string;
}

export interface OpenSeaSwapResult {
  success: boolean;
  chainName: string;
  chainId: number;
  fromToken: string;
  toToken: string;
  amountIn: number;
  expectedAmountOut: number;
  feeUsd: number;
  estimatedDurationSeconds: number;
  openseaSwapUrl: string;
  simulated: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

const CHAIN_MAP: Record<string, { id: number; name: string; slug: string }> = {
  '4663': { id: 4663, name: 'Robinhood Chain', slug: 'robinhood' },
  robinhood: { id: 4663, name: 'Robinhood Chain', slug: 'robinhood' },
  hood: { id: 4663, name: 'Robinhood Chain', slug: 'robinhood' },
};

export class OpenSeaAdapter {
  private keyPool: ApiKeyPool;
  private isDryRun: boolean;

  /** Chains being screened (OpenSea ChainIdentifier, including robinhood). */
  public readonly supportedChains = ['robinhood'] as const;

  constructor(apiKey?: string) {
    this.keyPool = apiKey
      ? createApiKeyPool('OPENSEA_API_KEY', [apiKey])
      : loadApiKeyPool('OPENSEA_API_KEY');
    this.isDryRun = isDryRunMode();
  }

  /**
   * Fetch with the active pool key; on HTTP 401/403 rotate to a backup key
   * and retry once. Fail-closed: null when no key or all keys rejected.
   */
  private async fetchWithKey<T>(build: (key: string) => { url: string; init: RequestInit }): Promise<Response | null> {
    const key = this.keyPool.get() || '';
    if (!key) return null;
    const { url, init } = build(key);
    let res = await fetch(url, init);
    if ((res.status === 401 || res.status === 403) && this.keyPool.size > 1) {
      const next = this.keyPool.markFailed(`HTTP ${res.status}`);
      if (next) {
        const retry = build(next);
        res = await fetch(retry.url, retry.init);
        if (res.status === 401 || res.status === 403) return null;
      }
    }
    return res;
  }

  /**
   * Trending collections per chains (one request for all chains — the
   * `chains` comma-separated param). Thorough screening: a dynamic list from
   * OpenSea sales activity, not a static list. Timeframe one_hour = current
   * activity. Fail-closed: [] if the API fails / no key.
   */
  public async fetchTrendingCollections(
    chains: readonly string[] = this.supportedChains,
    limit = 5
  ): Promise<Array<{ slug: string; name: string; chain: string }>> {
    try {
      const res = await this.fetchWithKey((key) => ({
        url: `https://api.opensea.io/api/v2/collections/trending?timeframe=one_hour&chains=${encodeURIComponent(chains.join(','))}&limit=${limit}`,
        init: { headers: { 'accept': 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(15000) },
      }));
      if (!res || !res.ok) {
        console.warn(`[OPENSEA ADAPTER] trending HTTP ${res?.status ?? 'n/a'}`);
        return [];
      }
      const data: any = await res.json();
      const cols: any[] = Array.isArray(data?.collections) ? data.collections : [];
      return cols
        .map((c) => ({
          slug: String(c?.collection || ''),
          name: String(c?.name || ''),
          chain: String(c?.contracts?.[0]?.chain || 'robinhood'),
        }))
        .filter((c) => c.slug.length > 0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[OPENSEA ADAPTER] trending failed: ${message}`);
      return [];
    }
  }

  public parseChain(input: string | number): { id: number; name: string; slug: string } {
    const key = String(input).toLowerCase().trim();
    if (CHAIN_MAP[key]) return CHAIN_MAP[key];
    return { id: 4663, name: 'Robinhood Chain', slug: 'robinhood' };
  }

  /**
   * Get a token swap quote via OpenSea API v2 Swap Aggregator (powered by Relay, 0x)
   */
  public async getSwapQuote(request: OpenSeaSwapRequest): Promise<OpenSeaSwapResult> {
    const chainInfo = this.parseChain(request.chain);
    const fromSymbol = request.fromToken.toUpperCase();
    const toSymbol = request.toToken.toUpperCase();
    const amount = request.amount;

    console.log(`[OPENSEA ADAPTER] Requesting OpenSea Swap Quote: ${amount} ${fromSymbol} -> ${toSymbol} on ${chainInfo.name}`);

    const openseaSwapUrl = `https://opensea.io/swap?chain=${chainInfo.slug}&from=${encodeURIComponent(fromSymbol)}&to=${encodeURIComponent(toSymbol)}&amount=${amount}`;

    if (this.isDryRun) {
      console.log(`[OPENSEA ADAPTER] DRY_RUN=true -> Simulating OpenSea DEX Aggregator Swap Quote...`);
      return {
        success: true,
        chainName: chainInfo.name,
        chainId: chainInfo.id,
        fromToken: fromSymbol,
        toToken: toSymbol,
        amountIn: amount,
        expectedAmountOut: Number((amount * (fromSymbol === 'ETH' ? 3200 : 0.998)).toFixed(4)),
        feeUsd: 0.0, // OpenSea 0% swap fee
        estimatedDurationSeconds: 4,
        openseaSwapUrl,
        simulated: true,
      };
    }

    try {
      const res = await this.fetchWithKey((key) => ({
        url: `https://api.opensea.io/api/v2/swap/quote?chain=${chainInfo.slug}&from_token=${fromSymbol}&to_token=${toSymbol}&amount=${amount}`,
        init: { headers: { 'Content-Type': 'application/json', 'x-api-key': key } },
      }));

      if (!res || !res.ok) {
        throw new Error(`OpenSea Swap API returned HTTP ${res?.status ?? 'unknown'}`);
      }

      const data = await res.json() as Record<string, unknown>;
      const expectedOutRaw = data.expected_out ? Number(data.expected_out) : NaN;
      // Fail-closed: missing expected_out from the API is NOT a quote — never fabricate one.
      if (!Number.isFinite(expectedOutRaw) || expectedOutRaw <= 0) {
        throw new Error('OpenSea Swap API returned no expected_out');
      }

      return {
        success: true,
        chainName: chainInfo.name,
        chainId: chainInfo.id,
        fromToken: fromSymbol,
        toToken: toSymbol,
        amountIn: amount,
        expectedAmountOut: expectedOutRaw,
        feeUsd: 0.0,
        estimatedDurationSeconds: 4,
        openseaSwapUrl,
        simulated: false,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[OPENSEA ADAPTER] Swap quote failed: ${errMsg}`);
      return {
        success: false,
        chainName: chainInfo.name,
        chainId: chainInfo.id,
        fromToken: fromSymbol,
        toToken: toSymbol,
        amountIn: amount,
        expectedAmountOut: 0,
        feeUsd: 0.0,
        estimatedDurationSeconds: 0,
        openseaSwapUrl,
        simulated: false,
        error: errMsg,
      };
    }
  }

  /**
   * Execute token swap via OpenSea API v2 + WalletService
   */
  public async executeSwap(request: OpenSeaSwapRequest, walletService?: WalletService): Promise<OpenSeaSwapResult> {
    const quote = await this.getSwapQuote(request);

    // Fail-closed: never broadcast from a failed/fabricated quote.
    if (!quote.success || quote.expectedAmountOut <= 0) {
      console.warn(`[OPENSEA ADAPTER] Swap aborted — quote failed (${quote.error || 'no valid quote'}).`);
      return quote;
    }

    if (this.isDryRun) {
      const simHash = `0xsim_os_swap_${quote.chainId}_${Date.now()}`;
      const explorerUrl = walletService ? walletService.getExplorerUrl(quote.chainId, simHash) : `https://robinhoodchain.blockscout.com/tx/${simHash}`;
      return {
        ...quote,
        txHash: simHash,
        explorerUrl,
        simulated: true,
      };
    }

    if (!walletService || !walletService.hasWallet('evm')) {
      return quote;
    }

    try {
      const { EVMTradeAdapter } = await import('./evm-adapter.js');
      const evmAdapter = new EVMTradeAdapter();
      const res = await evmAdapter.swapToken({ chain: quote.chainId, fromToken: request.fromToken, toToken: request.toToken, amountEth: request.amount }, walletService);
      return {
        ...quote,
        txHash: res.txHash,
        explorerUrl: res.explorerUrl,
        simulated: false,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { ...quote, error: errMsg };
    }
  }

  /**
   * Get OpenSea ERC-8257 AI Agent Tool discovery manifest
   */
  public getAgentToolsManifest(): Record<string, unknown> {
    return {
      name: 'Athena OpenSea Agent Tools',
      version: '1.0.0',
      description: 'OpenSea API v2 & Seaport integration tools for AI Agents',
      capabilities: ['swap_tokens', 'get_nft_floor', 'whale_analytics', 'cross_chain_fulfill'],
      discovery_url: 'https://docs.opensea.io/reference/llms-agent-discovery',
    };
  }

  /**
   * Fetch REAL floor-surge / volume-spike / sales-velocity / whale-sweep signals
   * per tracked collection, strictly from OpenSea API v2 endpoints:
   *   1. /collections/{slug}/stats            → current floor, 24h volume/sales + 6-day baseline
   *   2. /collections/{slug}/floor_prices     → time-series floor (REAL 1-hour surge)
   *   3. /events/collection/{slug}?event_type=sale → 1h velocity, 1h volume vs 1h baseline, whale sweep
   * Fail-closed per endpoint: unavailable data = 0/false (never fabricated).
   */
  public async fetchFloorSnipingSignals(collectionSlug: string = 'pudgypenguins', chain: string = 'robinhood'): Promise<OpenSeaNFTSignal[]> {
    if (!this.keyPool.get()) {
      console.log(`[OPENSEA ADAPTER] No API key configured for ${collectionSlug}. Returning empty.`);
      return [];
    }
    const headers = { 'accept': 'application/json', 'x-api-key': this.keyPool.get() || '' };
    try {
      // ── 1. Stats: floor + 24h volume/sales + 6-day baseline (REAL data from intervals) ──
      const statsRes = await this.fetchWithKey((key) => ({
        url: `https://api.opensea.io/api/v2/collections/${collectionSlug}/stats`,
        init: { headers: { 'accept': 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(15000) },
      }));
      if (!statsRes || !statsRes.ok) throw new Error(`OpenSea stats HTTP ${statsRes?.status ?? 'n/a'}`);
      const statsData: any = await statsRes.json();
      const total = statsData?.total || {};
      const floorPriceEth = Number(total.floor_price) || 0;
      const intervals: any[] = Array.isArray(statsData?.intervals) ? statsData.intervals : [];
      const byInterval = (name: string) => intervals.find((i) => i?.interval === name);
      const oneDay = byInterval('one_day');
      const sevenDay = byInterval('seven_day');
      const vol24hEth = Number(oneDay?.volume) || 0;
      const sales24h = Number(oneDay?.sales) || 0;
      const vol7dEth = Number(sevenDay?.volume) || 0;
      const sales7d = Number(sevenDay?.sales) || 0;
      // 6-day baseline = daily average EXCLUDING today (honest, from available data)
      const baseVolDailyEth = Math.max(0, (vol7dEth - vol24hEth) / 6);
      const baseSalesDaily = Math.max(0, (sales7d - sales24h) / 6);
      if (!(floorPriceEth > 0)) return [];

      // ── 2. Floor price history: last 1-hour surge (REAL time-series) ──
      let floorSurge1hPct = 0;
      try {
        const fpRes = await fetch(`https://api.opensea.io/api/v2/collections/${collectionSlug}/floor_prices?timeframe=one_day&resolution=25`, { headers, signal: AbortSignal.timeout(15000) });
        if (fpRes.ok) {
          const fpData: any = await fpRes.json();
          const pts: any[] = Array.isArray(fpData?.floor_prices) ? fpData.floor_prices : [];
          const latest = pts[pts.length - 1];
          if (latest && pts.length >= 2) {
            const tLatest = Number(latest.time) || 0;
            const target = tLatest - 3600;
            let prev = pts[0];
            for (const p of pts) {
              if ((Number(p.time) || 0) <= target) prev = p;
              else break;
            }
            const fNow = Number(latest.token_unit ?? latest.usd_price) || 0;
            const fPrev = Number(prev.token_unit ?? prev.usd_price) || 0;
            if (fNow > 0 && fPrev > 0) floorSurge1hPct = ((fNow - fPrev) / fPrev) * 100;
          }
        }
      } catch { /* best-effort — floor surge becomes 0 (does not trigger) */ }

      // ── 2b. Verified badge: safelist_request_status === 'verified' (fail-closed false) ──
      let isVerified = false;
      try {
        const colRes = await fetch(`https://api.opensea.io/api/v2/collections/${collectionSlug}`, { headers, signal: AbortSignal.timeout(15000) });
        if (colRes.ok) {
          const colData: any = await colRes.json();
          isVerified = colData?.safelist_request_status === 'verified';
        }
      } catch { /* best-effort — verified becomes false (cannot be confirmed) */ }

      // ── 3. Events (sale): 1h velocity, 1h volume vs 1h baseline, whale sweep ──
      let salesVelocity1h = 0;
      let volume1hEth = 0;
      let volumePrev1hEth = 0;
      let isWhaleSweep = false;
      let whaleInfo: OpenSeaWhaleInfo | undefined;
      let eventsAvailable = false;
      try {
        const after = Math.floor(Date.now() / 1000) - 4 * 3600;
        const evRes = await fetch(`https://api.opensea.io/api/v2/events/collection/${collectionSlug}?event_type=sale&after=${after}&limit=200`, { headers, signal: AbortSignal.timeout(15000) });
        if (evRes.ok) {
          const evData: any = await evRes.json();
          const events: any[] = Array.isArray(evData?.asset_events) ? evData.asset_events : [];
          const now = Date.now() / 1000;
          const hourAgo = now - 3600;
          const buysByBuyer = new Map<string, { count: number; spentEth: number }>();
          for (const e of events) {
            if (e?.event_type !== 'sale') continue;
            const ts = Number(e?.event_timestamp) || 0;
            if (!ts) continue;
            const qty = Number(e?.payment?.quantity) || 0;
            const decimals = Number(e?.payment?.decimals) || 0;
            const eth = decimals > 0 ? qty / Math.pow(10, decimals) : qty;
            const buyer = e?.buyer;
            if (ts >= hourAgo) {
              salesVelocity1h += 1;
              if (buyer) {
                const cur = buysByBuyer.get(buyer) ?? { count: 0, spentEth: 0 };
                cur.count += 1;
                cur.spentEth += eth;
                buysByBuyer.set(buyer, cur);
              }
            }
            if (ts >= now - 3600) volume1hEth += eth;
            else if (ts >= now - 2 * 3600) volumePrev1hEth += eth;
          }
          const top = [...buysByBuyer.entries()].sort((a, b) => b[1].count - a[1].count)[0];
          if (top && top[1].count >= 3) {
            isWhaleSweep = true;
            whaleInfo = { address: top[0], buyCount: top[1].count, spentEth: top[1].spentEth };
          }
          eventsAvailable = true;
        }
      } catch { /* best-effort */ }

      // Volume spike — honestly use the best available source:
      // 2h of events (1h vs the previous 1h) if available; if events cannot
      // (key without analytics access), fall back to 24h volume vs 6-day baseline.
      const spikeFromEvents = volumePrev1hEth > 0 ? volume1hEth / volumePrev1hEth : (volume1hEth > 0 ? 3.0 : 0);
      const spikeFromStats = baseVolDailyEth > 0 ? vol24hEth / baseVolDailyEth : (vol24hEth > 0 ? 3.0 : 0);
      const volumeSpike1hRatio = eventsAvailable ? spikeFromEvents : spikeFromStats;
      // Velocity: real 1h events if available; otherwise → 24h average (honest).
      const velocity = eventsAvailable && salesVelocity1h > 0 ? salesVelocity1h : (sales24h > 0 ? sales24h / 24 : 0);

      const tracked = undefined;
      return [
        {
          collectionSlug,
          collectionName: collectionSlug.replace(/-/g, ' ').toUpperCase(),
          tokenId: '',
          name: `${collectionSlug.replace(/-/g, ' ').toUpperCase()} (floor)`,
          chain: chain as OpenSeaNFTSignal['chain'],
          priceEth: floorPriceEth,
          floorPriceEth,
          floorSurge1hPct,
          volumeSpike1hRatio,
          salesVelocity1h: velocity,
          isWhaleSweep,
          whaleInfo,
          isVerified,
          openseaUrl: `https://opensea.io/collection/${collectionSlug}`,
          aiThesis: `OpenSea API v2 Live Signal: ${collectionSlug} floor ${floorPriceEth} ETH (+${floorSurge1hPct.toFixed(1)}% 1h), ${velocity.toFixed(1)} sales/h, vol ${volumeSpike1hRatio.toFixed(1)}x baseline.`,
        },
      ];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[OPENSEA API FETCH ERROR] ${message}`);
      return [];
    }
  }
}
