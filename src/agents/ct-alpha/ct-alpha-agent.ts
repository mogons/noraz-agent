import { TwitterService, TweetItem } from '../../services/twitter-service.js';
import { AIService } from '../../services/ai-service.js';

export interface CTAlphaSignal {
  id: string;
  category: 'AI_AGENTS' | 'AIRDROP_YIELD' | 'SMART_CT_CALL' | 'TICKER_SURGE' | 'STEALTH_LAUNCH';
  title: string;
  authorUsername: string;
  authorName: string;
  tweetText: string;
  tweetUrl: string;
  likes: number;
  retweets: number;
  actionableTakeaway: string;
  symbolMentioned?: string;
  contractAddress?: string;
  confidenceScore: number; // 0 - 100
  postedAt: string;
}

export class CTAlphaAgent {
  private twitterService: TwitterService;
  private aiService: AIService;

  constructor(twitterService?: TwitterService, aiService?: AIService) {
    this.twitterService = twitterService || new TwitterService();
    this.aiService = aiService || new AIService();
  }

  /**
   * Evaluates tweets for high-value Alpha, AI agent trends, and yield opportunities
   */
  public async evaluateTweetsForAlpha(query: string = 'AI agent crypto alpha'): Promise<CTAlphaSignal[]> {
    console.log(`[CT ALPHA AGENT] Scanning Smart CT & AI narratives for query: "${query}"...`);
    const tweets = await this.twitterService.searchTweets(query, 10);

    const signals: CTAlphaSignal[] = [];

    for (const t of tweets) {
      // Strict Realtime Filter: Ignore tweets older than 1 hour (max 3600000 ms)
      const tweetDate = t.createdAt ? new Date(t.createdAt).getTime() : Date.now();
      const tweetAgeMs = Date.now() - tweetDate;
      const MAX_AGE_MS = 60 * 60 * 1000; // 1 Hour Max

      if (!t.createdAt || isNaN(tweetAgeMs) || tweetAgeMs > MAX_AGE_MS) {
        console.log(`[CT ALPHA AGENT] Skipping stale/historical tweet from ${t.authorUsername} (Age: ${(tweetAgeMs / 3600000).toFixed(1)}h > 1h max limit).`);
        continue;
      }

      // Strict Engagement Filter: Ignore low-engagement noise (min 50 likes & 10 retweets)
      const isHighEngagement = t.likes >= 50 && t.retweets >= 10;
      if (!isHighEngagement) {
        console.log(`[CT ALPHA AGENT] Skipping low-engagement tweet from @${t.authorUsername} (${t.likes} likes / ${t.retweets} retweets < min 50/10 threshold).`);
        continue;
      }

      const isAiNarrative = t.text.toLowerCase().includes('ai') || t.text.toLowerCase().includes('agent');
      const isYield = t.text.toLowerCase().includes('yield') || t.text.toLowerCase().includes('airdrop') || t.text.toLowerCase().includes('farm');

      const category: CTAlphaSignal['category'] = isAiNarrative
        ? 'AI_AGENTS'
        : isYield
        ? 'AIRDROP_YIELD'
        : 'SMART_CT_CALL';

      const engagementFactor = Math.min(18, Math.floor(t.likes / 50) + Math.floor(t.retweets / 10));
      const confidenceScore = Math.min(98, 80 + engagementFactor);

      signals.push({
        id: `ct_alpha_${t.id}`,
        category,
        title: `🔥 Smart CT Alpha: ${category.replace('_', ' ')} Opportunities`,
        authorUsername: t.authorUsername,
        authorName: t.authorName,
        tweetText: t.text,
        tweetUrl: t.url,
        likes: t.likes,
        retweets: t.retweets,
        actionableTakeaway: `💡 Actionable Alpha: Realtime Smart CT accumulation detected (< 1h). ${isAiNarrative ? 'High AI agent narrative momentum.' : 'High yield / airdrop potential.'}`,
        symbolMentioned: query.toUpperCase(),
        confidenceScore,
        postedAt: t.createdAt,
      });
    }

    return signals;
  }

  public async runScreeningPass(): Promise<Array<{ passed: boolean; signal: CTAlphaSignal; reason: string }>> {
    console.log('[CT ALPHA AGENT] Running Smart CT & AI narrative surveillance pass...');
    const signals = await this.evaluateTweetsForAlpha('AI agent crypto alpha');

    return signals.map(s => ({
      passed: s.confidenceScore >= 80,
      signal: s,
      reason: `🎯 SMART CT ALPHA (${s.category}): ${s.actionableTakeaway} (Score: ${s.confidenceScore}%)`,
    }));
  }
}
