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

export class TwitterService {
  private twexApiKey?: string;
  private twexApiUrl = 'https://api.twexapi.io';

  constructor(apiKey?: string) {
    this.twexApiKey = apiKey || process.env.TWEX_API_KEY;
  }

  public isTwexConfigured(): boolean {
    return Boolean(this.twexApiKey);
  }

  public async searchTweets(query: string, maxResults: number = 10): Promise<TweetItem[]> {
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
