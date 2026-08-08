export interface TweetItem {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  likes: number;
  retweets: number;
  replies: number;
  createdAt: string;
  url: string;
}

export interface TwitterUserProfile {
  userId: string;
  screenName: string;
  name: string;
  description?: string;
  followersCount: number;
  friendsCount: number;
  statusesCount: number;
  verified?: boolean;
}

export interface TwitterHypeResult {
  symbol: string;
  contractAddress?: string;
  sentimentScore: number;
  tweetCount1h: number;
  influencerMentions: string[];
  topTweets: TweetItem[];
  isCtoVerified?: boolean;
}

const INFLUENCERS = ['ansem', 'machibigbrother', 'beanie', 'pranksy'];

/**
 * Multi-source Twitter/X service:
 *  1. OpenTwitter (6551.io) — sumber utama: profil, search + engagement filter,
 *     KOL followers, follower events, deleted tweets. Butuh TWITTER_TOKEN (6551).
 *  2. TwexAPI — fallback klasik (TWEX_API_KEY).
 *  Fail-closed: tanpa token & tanpa key -> hasil kosong (tidak pernah fabricate).
 */
export class TwitterService {
  private twexApiKey?: string;
  private twexApiUrl = 'https://api.twexapi.io';
  private openTwitterBase = 'https://ai.6551.io';

  constructor(apiKey?: string) {
    this.twexApiKey = apiKey || process.env.TWEX_API_KEY;
  }

  public isConfigured(): boolean {
    return Boolean(process.env.TWITTER_TOKEN || this.twexApiKey);
  }

  public isOpenTwitterConfigured(): boolean {
    return Boolean(process.env.TWITTER_TOKEN);
  }

  // ── OpenTwitter (6551) ──────────────────────────────────────────────

  private async openTwitter<T>(subPath: string, body: Record<string, unknown>): Promise<T | null> {
    const token = process.env.TWITTER_TOKEN;
    if (!token) return null;
    try {
      const res = await fetch(`${this.openTwitterBase}${subPath}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        console.warn(`[TWITTER SERVICE] OpenTwitter HTTP ${res.status} for ${subPath}`);
        return null;
      }
      const payload: any = await res.json();
      if (payload?.success === false) {
        console.warn(`[TWITTER SERVICE] OpenTwitter error: ${payload.error || 'unknown'}`);
        return null;
      }
      return payload?.data ?? null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[TWITTER SERVICE] OpenTwitter error: ${message}`);
      return null;
    }
  }

  /** Cari tweet via OpenTwitter (keywords/hashtag + engagement filter). */
  public async openTwitterSearch(
    query: string,
    opts: {
      maxResults?: number;
      minLikes?: number;
      minRetweets?: number;
      minReplies?: number;
      fromUser?: string;
      sinceDate?: string;
      product?: 'Top' | 'Latest' | 'Media';
    } = {}
  ): Promise<TweetItem[]> {
    const data = await this.openTwitter<any[]>('/open/twitter_search', {
      keywords: query,
      maxResults: Math.min(Math.max(opts.maxResults ?? 20, 1), 100),
      ...(opts.minLikes ? { minLikes: opts.minLikes } : {}),
      ...(opts.minRetweets ? { minRetweets: opts.minRetweets } : {}),
      ...(opts.minReplies ? { minReplies: opts.minReplies } : {}),
      ...(opts.fromUser ? { fromUser: opts.fromUser } : {}),
      ...(opts.sinceDate ? { sinceDate: opts.sinceDate } : {}),
      ...(opts.product ? { product: opts.product } : {}),
    });
    if (!Array.isArray(data)) return [];
    return data.map((t: any) => this.mapOpenTwitterTweet(t)).filter((t: TweetItem) => t.id !== '');
  }

  /** Profil user via OpenTwitter. */
  public async openTwitterUser(username: string): Promise<TwitterUserProfile | null> {
    const d = await this.openTwitter<any>('/open/twitter_user_info', { username });
    if (!d) return null;
    return {
      userId: String(d.userId ?? d.id ?? ''),
      screenName: d.screenName ?? d.username ?? username,
      name: d.name ?? d.screenName ?? username,
      description: d.description,
      followersCount: Number(d.followersCount ?? d.followers ?? 0),
      friendsCount: Number(d.friendsCount ?? d.friends ?? 0),
      statusesCount: Number(d.statusesCount ?? 0),
      verified: d.verified,
    };
  }

  /** KOL (influencer) followers dari sebuah akun — alpha signal: KOL mulai follow = perhatian. */
  public async openTwitterKOLFollowers(username: string): Promise<string[]> {
    const data = await this.openTwitter<any[]>('/open/twitter_kol_followers', { username });
    if (!Array.isArray(data)) return [];
    return data
      .map((k: any) => k.screenName ?? k.username ?? k.userName ?? '')
      .filter((s: string) => s !== '')
      .slice(0, 20);
  }

  /** Follower/unfollower events baru. */
  public async openTwitterFollowerEvents(username: string, isFollow = true, maxResults = 20): Promise<Array<Record<string, unknown>>> {
    const data = await this.openTwitter<any[]>('/open/twitter_follower_events', {
      username, isFollow, maxResults: Math.min(Math.max(maxResults, 1), 100),
    });
    return Array.isArray(data) ? data : [];
  }

  private mapOpenTwitterTweet(t: any): TweetItem {
    const id = String(t.id ?? t.tweetId ?? '');
    const username = t.userScreenName ?? t.screenName ?? t.username ?? 'unknown';
    const text = t.text ?? t.fullText ?? t.content ?? '';
    return {
      id,
      text,
      authorUsername: username,
      authorName: t.userName ?? t.name ?? username,
      likes: Number(t.favoriteCount ?? t.likes ?? 0),
      retweets: Number(t.retweetCount ?? t.retweets ?? 0),
      replies: Number(t.replyCount ?? t.replies ?? 0),
      createdAt: t.createdAt ?? '',
      url: t.url ?? `https://x.com/${username}/status/${id}`,
    };
  }

  // ── TwexAPI (fallback) ──────────────────────────────────────────────

  public isTwexConfigured(): boolean {
    return Boolean(this.twexApiKey);
  }

  private async twexSearchTweets(query: string, maxResults: number): Promise<TweetItem[]> {
    if (!this.isTwexConfigured()) {
      console.warn(`[TWITTER SERVICE] TWEX_API_KEY not configured for query "${query}" — returning empty (fail-closed).`);
      return [];
    }
    try {
      const response = await fetch(
        `${this.twexApiUrl}/twitter/advanced_search`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.twexApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchTerms: [query],
            maxItems: maxResults,
            sortBy: 'Latest',
          }),
        }
      );
      if (!response.ok) {
        console.warn(`[TWITTER SERVICE] TwexAPI HTTP ${response.status} for "${query}" — returning empty.`);
        return [];
      }
      const payload: any = await response.json();
      const tweets = Array.isArray(payload) ? payload : (payload.data || payload.tweets || payload.results || []);
      if (!Array.isArray(tweets) || tweets.length === 0) return [];
      return tweets.map((t: any) => ({
        id: String(t.tweet_id || t.id || ''),
        text: t.text || t.full_text || t.content || '',
        authorUsername: t.user?.screen_name || t.author?.username || t.username || 'unknown',
        authorName: t.user?.name || t.author?.name || t.author_name || 'Unknown',
        likes: Number(t.favorite_count || t.public_metrics?.like_count || t.likes || 0),
        retweets: Number(t.retweet_count || t.public_metrics?.retweet_count || t.retweets || 0),
        replies: Number(t.reply_count || t.public_metrics?.reply_count || t.replies || 0),
        createdAt: t.created_at_datetime || t.created_at || '',
        url: t.url || `https://x.com/${t.user?.screen_name || t.author?.username || 'i'}/status/${t.tweet_id || t.id}`,
      })).filter((t: TweetItem) => t.id !== '');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[TWITTER SERVICE ERROR] ${message}`);
      return [];
    }
  }

  // ── Unified API (OpenTwitter dulu, fallback TwexAPI) ───────────────

  public async searchTweets(query: string, maxResults: number = 10): Promise<TweetItem[]> {
    if (this.isOpenTwitterConfigured()) {
      const tweets = await this.openTwitterSearch(query, { maxResults, product: 'Latest' });
      if (tweets.length > 0) return tweets;
      console.warn(`[TWITTER SERVICE] OpenTwitter kosong untuk "${query}" — fallback TwexAPI.`);
    }
    return this.twexSearchTweets(query, maxResults);
  }

  public async getHypeScore(symbol: string, contractAddress?: string): Promise<TwitterHypeResult> {
    const tweets = await this.searchTweets(symbol);
    if (tweets.length === 0) {
      return {
        symbol, contractAddress,
        sentimentScore: 0,
        tweetCount1h: 0,
        influencerMentions: [],
        topTweets: [],
        isCtoVerified: undefined,
      };
    }
    const totalEngagement = tweets.reduce((s, t) => s + t.likes + t.retweets * 2 + t.replies, 0);
    const sentimentScore = Math.min(95, Math.round((totalEngagement / (tweets.length * 100)) * 50 + 30));
    const influencerMentions = tweets
      .map((t) => t.authorUsername.replace(/^@/, '').toLowerCase())
      .filter((u) => INFLUENCERS.includes(u))
      .slice(0, 5)
      .map((u) => `@${u}`);
    const ctoHints = tweets.some((t) => /cto|renounce|community takeover/i.test(t.text));
    return {
      symbol, contractAddress,
      sentimentScore,
      tweetCount1h: tweets.length,
      influencerMentions,
      topTweets: tweets,
      isCtoVerified: ctoHints ? true : undefined,
    };
  }
}
