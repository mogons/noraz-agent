import { loadApiKeyPool, type ApiKeyPool } from '../services/api-key-pool.js';

export interface XTweetSignal {
  id: string;
  text: string;
  authorId?: string;
  createdAt?: string;
  retweetCount?: number;
  likeCount?: number;
  replyCount?: number;
  impressionCount?: number;
  contractAddresses: string[];
  tickerSymbols: string[];
}

export interface XSearchResult {
  success: boolean;
  tweets: XTweetSignal[];
  totalVolume: number;
  error?: string;
}

export class XApiAdapter {
  private keyPool: ApiKeyPool;
  private isEnabled: boolean;

  constructor() {
    this.keyPool = loadApiKeyPool('X_API_BEARER_TOKEN');
    this.isEnabled = process.env.ENABLE_X_ALPHA_SCRAPER === 'true' || this.keyPool.size > 0;
  }

  public isConfigured(): boolean {
    return this.keyPool.size > 0;
  }

  /**
   * Search recent tweets via Official X (Twitter) API v2 (recent search endpoint).
   * Parses contract addresses (0x...) and ticker symbols ($SYMBOL).
   */
  public async searchRobinhoodAlpha(query = 'robinhood chain OR #robinhoodchain OR "robinhood dex"'): Promise<XSearchResult> {
    const bearerToken = this.keyPool.get();
    if (!bearerToken) {
      return {
        success: false,
        tweets: [],
        totalVolume: 0,
        error: 'Official X_API_BEARER_TOKEN is not configured. Enable in opencat onboard or set X_API_BEARER_TOKEN in .env.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const endpoint = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&tweet.fields=created_at,public_metrics,author_id&max_results=25`;

      let response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'User-Agent': 'OpenCatAI-Robinhood/1.0.0',
        },
        signal: controller.signal,
      });

      if ((response.status === 401 || response.status === 403 || response.status === 429) && this.keyPool.size > 1) {
        const nextKey = this.keyPool.markFailed(`HTTP ${response.status}`);
        if (nextKey) {
          response = await fetch(endpoint, {
            headers: {
              'Authorization': `Bearer ${nextKey}`,
              'User-Agent': 'OpenCatAI-Robinhood/1.0.0',
            },
            signal: controller.signal,
          });
        }
      }

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[X API ADAPTER] Search failed (HTTP ${response.status}): ${errText}`);
        return {
          success: false,
          tweets: [],
          totalVolume: 0,
          error: `X API HTTP ${response.status}: ${errText}`,
        };
      }

      const body = await response.json() as Record<string, unknown>;
      const rawData = (body.data as Array<Record<string, unknown>>) || [];

      const tweets: XTweetSignal[] = [];
      const caRegex = /0x[a-fA-F0-9]{40}/g;
      const symbolRegex = /\$([A-Za-z0-9]{2,10})/g;

      for (const item of rawData) {
        const text = String(item.text || '');
        const metrics = (item.public_metrics as Record<string, number>) || {};

        const foundCAs = Array.from(new Set(text.match(caRegex) || []));
        const foundSymbols = Array.from(new Set(
          (text.match(symbolRegex) || []).map(s => s.replace('$', '').toUpperCase())
        ));

        tweets.push({
          id: String(item.id || ''),
          text,
          authorId: String(item.author_id || ''),
          createdAt: String(item.created_at || ''),
          retweetCount: metrics.retweet_count || 0,
          likeCount: metrics.like_count || 0,
          replyCount: metrics.reply_count || 0,
          impressionCount: metrics.impression_count || 0,
          contractAddresses: foundCAs,
          tickerSymbols: foundSymbols,
        });
      }

      return {
        success: true,
        tweets,
        totalVolume: tweets.length,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[X API ADAPTER ERROR] ${errMsg}`);
      return {
        success: false,
        tweets: [],
        totalVolume: 0,
        error: errMsg,
      };
    }
  }
}
