import { TwitterService } from '../../services/twitter-service.js';
import { StrategyEngine } from '../../orchestrator/strategy-engine.js';
import type { StrategyContext } from '../../orchestrator/strategy-types.js';
import type { ScreeningAgent, AgentReport, CallCardPayload } from '../shared/agent-contract.js';

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
  /**
   * Author verification as reported by the source API. TwitterService does not
   * expose verification yet, so this stays undefined for live fetches — the
   * security proxy then falls back to engagement (see deriveSecurityPassed).
   * Never assumed true.
   */
  authorVerified?: boolean;
}

export interface CTAlphaConfig {
  passThreshold: number; // 80 — swarm consensus gate (>= 80% posted)
  maxResults: number;    // 10
  /** false = NO-CALL MODE: screening tetap jalan (fetch+evaluasi), output ditekan (0 call). */
  emitCalls: boolean;
}

const DEFAULT_CONFIG: CTAlphaConfig = {
  passThreshold: 80,
  maxResults: 10,
  emitCalls: false,
};

/**
 * CT-Alpha Screening Agent (X/Twitter Smart CT & AI narratives)
 *
 * Implements the shared ScreeningAgent contract (mirrors perps/meme pattern):
 * fetch (fail-closed []) → freshness/engagement pre-filter (fail-closed) →
 * deterministic confidence → optional strategy extension layer (0.7/0.3 blend,
 * SKIP vetoes) → agent-built CallCardPayload with real fields / 'N/A' →
 * AgentReport[] (swarm gate still applies downstream).
 *
 * There is no on-chain audit for a tweet (no contract, no chain) — the
 * security proxy is author trust + engagement (deriveSecurityPassed).
 */
export class CTAlphaAgent implements ScreeningAgent<CTAlphaSignal> {
  readonly domain = 'ct-alpha';
  private twitterService: TwitterService;
  private strategyEngine: StrategyEngine;
  private config: CTAlphaConfig;

  constructor(twitterService?: TwitterService, config?: Partial<CTAlphaConfig>) {
    this.twitterService = twitterService || new TwitterService();
    this.strategyEngine = new StrategyEngine();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluates tweets for high-value Alpha, AI agent trends, and yield opportunities.
   * Fail-closed gates kept as-is: freshness <= 1h, engagement >= 50 likes / 10 retweets.
   */
  public async evaluateTweetsForAlpha(query: string = 'AI agent crypto alpha'): Promise<CTAlphaSignal[]> {
    console.log(`[CT ALPHA AGENT] Scanning Smart CT & AI narratives for query: "${query}"...`);
    const tweets = await this.twitterService.searchTweets(query, this.config.maxResults);

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
      let confidenceScore = Math.min(98, 80 + engagementFactor);

      // OpenTwitter bonus: kalau author akun ini di-follow banyak KOL (perhatian
      // institusional), naikkan confidence. Fail-open — tanpa OpenTwitter / gagal,
      // skor tetap seperti biasa.
      const ot = this.twitterService as TwitterService & { isOpenTwitterConfigured?: () => boolean; openTwitterKOLFollowers?: (u: string) => Promise<string[]> };
      if (typeof ot.isOpenTwitterConfigured === 'function' && ot.isOpenTwitterConfigured() && typeof ot.openTwitterKOLFollowers === 'function') {
        try {
          const kols = await ot.openTwitterKOLFollowers(t.authorUsername.replace(/^@/, ''));
          if (kols.length > 0) {
            confidenceScore = Math.min(98, confidenceScore + Math.min(10, kols.length * 2));
            console.log(`[CT ALPHA AGENT] ⭐ @${t.authorUsername} di-follow ${kols.length} KOL (${kols.slice(0, 3).join(', ')}) — +${Math.min(10, kols.length * 2)}`);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[CT ALPHA AGENT] KOL check gagal untuk @${t.authorUsername}: ${message}`);
        }
      }

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

  /**
   * Contract wrapper: evaluate tweets, apply the strategy extension layer per
   * signal (0.7/0.3 confidence blend, SKIP vetoes, getActiveStrategy('ct-alpha')),
   * re-apply the 80 gate on the FINAL blended confidence (fail-closed), then
   * enrich each survivor with a call-card payload built from real fields.
   */
  public async runScreeningPass(): Promise<AgentReport<CTAlphaSignal>[]> {
    console.log('[CT ALPHA AGENT] Running Smart CT & AI narrative surveillance pass...');
    const signals = await this.evaluateTweetsForAlpha('AI agent crypto alpha');

    const reports: AgentReport<CTAlphaSignal>[] = [];

    for (const s of signals) {
      let confidence = s.confidenceScore;

      // Strategy extension layer (optional): adjust confidence
      try {
        const strat = this.strategyEngine.getActiveStrategy('ct-alpha');
        if (strat?.evaluate) {
          const ev = this.strategyEngine.runStrategySafely(strat, 'evaluate', this.buildStrategyCtx(s));
          if (ev?.recommendedAction === 'SKIP') {
            console.log(`[CT ALPHA AGENT] ⛔ @${s.authorUsername}: strategi menolak (${ev.reason})`);
            continue;
          }
          if (ev && typeof ev.confidence === 'number') {
            confidence = Math.round(confidence * 0.7 + Math.max(0, Math.min(100, ev.confidence)) * 0.3);
            s.confidenceScore = confidence;
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[CT ALPHA AGENT] Strategi gagal: ${message}`);
      }

      // Fail-closed: the 80 gate must hold on the FINAL blended confidence
      if (confidence < this.config.passThreshold) {
        console.log(`[CT ALPHA AGENT] ⚪ @${s.authorUsername}: ${confidence}% < ${this.config.passThreshold}% setelah strategi.`);
        continue;
      }

      const thesis = `🎯 SMART CT ALPHA (${s.category}): ${s.actionableTakeaway} (Score: ${confidence}%)`;
      reports.push({ passed: true, signal: s, reason: thesis, confidence, payload: this.buildPayload(s, thesis) });
      console.log(`[CT ALPHA AGENT] 🎯 ${s.category} @${s.authorUsername} ${confidence}%`);
    }

    console.log(`[CT ALPHA AGENT] Pass selesai. ${reports.length} sinyal lolos.`);

    // NO-CALL MODE (emitCalls=false): screening & evaluasi tetap jalan (heartbeat,
    // toggle, health tetap normal) tapi output ditekan — 0 call ke Discord.
    // Hidupkan lagi nanti: set emitCalls=true di DEFAULT_CONFIG.
    if (!this.config.emitCalls) {
      console.log(`[CT ALPHA AGENT] No-call mode aktif (emitCalls=false) — ${reports.length} sinyal ditekan, 0 call dipublikasikan.`);
      return [];
    }

    return reports;
  }

  /**
   * Build call-card payload from real tweet fields (or 'N/A').
   * liquidityUsd/volume1hUsd are required by the contract but tweets carry no
   * on-chain data — 0 is the honest absence, never a fabricated number.
   */
  public buildPayload(signal: CTAlphaSignal, thesis: string): CallCardPayload {
    return {
      domain: 'CT_ALPHA',
      title: signal.title,
      symbol: signal.symbolMentioned || 'ALPHA',
      contractAddress: signal.contractAddress || 'N/A',
      network: 'X (Twitter)',
      aiThesis: thesis || signal.actionableTakeaway,
      confidenceScore: signal.confidenceScore,
      dexScreenerUrl: signal.tweetUrl,
      securityAuditPassed: this.deriveSecurityPassed(signal),
      socialHypeScore: signal.confidenceScore,
      liquidityUsd: 0, // no on-chain liquidity for a tweet
      volume1hUsd: 0,  // no on-chain volume for a tweet
    };
  }

  /**
   * CT-alpha has no on-chain audit (no contract, no chain — nothing to RugCheck
   * or GoPlus). The security proxy is author trust + engagement: an
   * author-verified account passes outright; otherwise engagement must clear
   * the high bar of >= 100 likes AND >= 20 retweets. Never hardcoded true.
   */
  public deriveSecurityPassed(signal: CTAlphaSignal): boolean {
    return signal.authorVerified === true || (signal.likes >= 100 && signal.retweets >= 20);
  }

  /** Map signal -> strategy ctx (flat + snake_case ct-alpha block) */
  private buildStrategyCtx(signal: CTAlphaSignal): StrategyContext {
    const ageMs = signal.postedAt ? Date.now() - new Date(signal.postedAt).getTime() : NaN;
    return {
      domain: 'CT_ALPHA',
      symbol: signal.symbolMentioned || 'ALPHA',
      contractAddress: signal.contractAddress || 'N/A',
      priceUsd: 0,       // tweets carry no price data
      liquidityUsd: 0,   // tweets carry no liquidity data
      volume24hUsd: 0,   // tweets carry no volume data
      volume1hUsd: 0,    // tweets carry no volume data
      smartMoneyCount: 0, // no wallet-count data; kept for StrategyContext parity
      securityAuditPassed: this.deriveSecurityPassed(signal),
      socialHypeScore: signal.confidenceScore,
      ct: {
        category: signal.category,
        author_username: signal.authorUsername,
        author_verified: signal.authorVerified ?? undefined,
        likes: signal.likes,
        retweets: signal.retweets,
        tweet_age_ms: Number.isFinite(ageMs) ? ageMs : null,
        tweet_url: signal.tweetUrl,
        symbol_mentioned: signal.symbolMentioned ?? null,
        contract_address: signal.contractAddress ?? null,
      },
    };
  }
}
