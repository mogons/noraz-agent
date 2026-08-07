import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CTAlphaAgent } from '../src/agents/ct-alpha/ct-alpha-agent.js';
import type { CTAlphaSignal } from '../src/agents/ct-alpha/ct-alpha-agent.js';
import type { TweetItem } from '../src/services/twitter-service.js';

const requireEsm = createRequire(import.meta.url);

// ── Fixtures ──────────────────────────────────────────────────────────────
// NOTE: the healthy text intentionally avoids 'ai'/'agent'/'yield'/'airdrop'/'farm'
// so category resolution lands on SMART_CT_CALL (deterministic).
const mkTweet = (over: Partial<TweetItem> = {}): TweetItem => ({
  id: 't1',
  text: 'Major rotation brewing — smart money positioning $ROT8, do not sleep on this one',
  authorUsername: 'ct_whale',
  authorName: 'CT Whale',
  likes: 800,
  retweets: 150,
  replies: 30,
  createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
  url: 'https://x.com/ct_whale/status/t1',
  ...over,
});

const mkFakeTwitter = (tweets: TweetItem[]) => ({
  searchTweets: vi.fn(async () => tweets),
} as unknown as TwitterService);

const mkSignal = (over: Partial<CTAlphaSignal> = {}): CTAlphaSignal => ({
  id: 'ct_alpha_t1',
  category: 'SMART_CT_CALL',
  title: '🔥 Smart CT Alpha: SMART CT CALL Opportunities',
  authorUsername: 'ct_whale',
  authorName: 'CT Whale',
  tweetText: 'Major rotation brewing — smart money positioning $ROT8, do not sleep on this one',
  tweetUrl: 'https://x.com/ct_whale/status/t1',
  likes: 800,
  retweets: 150,
  actionableTakeaway: '💡 Actionable Alpha: Realtime Smart CT accumulation detected (< 1h).',
  symbolMentioned: 'ROT8',
  contractAddress: '0xabc123',
  confidenceScore: 95,
  postedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
  ...over,
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('CTAlphaAgent', () => {
  it('contract: domain is ct-alpha', () => {
    const agent = new CTAlphaAgent(mkFakeTwitter([]));
    expect(agent.domain).toBe('ct-alpha');
  });

  it('runScreeningPass returns [] with empty feed — no network, no fake data', async () => {
    const agent = new CTAlphaAgent(mkFakeTwitter([]));
    const reports = await agent.runScreeningPass();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
  });

  it('runScreeningPass returns AgentReport[] with payload for a healthy tweet (real default strategy)', async () => {
    const agent = new CTAlphaAgent(mkFakeTwitter([mkTweet()]));
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(1);
    const r = reports[0];
    expect(r.passed).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(80);
    expect(typeof r.reason).toBe('string');
    expect(r.signal.id).toBe('ct_alpha_t1');
    expect(r.payload?.domain).toBe('CT_ALPHA');
    expect(r.payload?.network).toBe('X (Twitter)');
    expect(r.payload?.securityAuditPassed).toBe(true);
    expect(r.payload?.dexScreenerUrl).toBe('https://x.com/ct_whale/status/t1');
  });

  it('runScreeningPass skips stale tweets (> 1h freshness gate)', async () => {
    const fresh = mkTweet({ id: 't_fresh' });
    const stale = mkTweet({ id: 't_stale', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() });
    const agent = new CTAlphaAgent(mkFakeTwitter([fresh, stale]));
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(1);
    expect(reports[0].signal.id).toBe('ct_alpha_t_fresh');
  });

  it('runScreeningPass skips all-stale feeds (fail-closed)', async () => {
    const stale = mkTweet({ createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() });
    const agent = new CTAlphaAgent(mkFakeTwitter([stale]));
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(0);
  });

  it('runScreeningPass skips low-engagement tweets (50 likes / 10 retweets gate)', async () => {
    const quiet = mkTweet({ likes: 30, retweets: 5 });
    const agent = new CTAlphaAgent(mkFakeTwitter([quiet]));
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(0);
  });

  it('strategy extension: SKIP vetoes the signal', async () => {
    const agent = new CTAlphaAgent(mkFakeTwitter([mkTweet()]));
    (agent as any).strategyEngine = {
      getActiveStrategy: () => ({ evaluate: () => ({ confidence: 0, recommendedAction: 'SKIP', reason: 'veto' }) }),
    };
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(0);
  });

  it('strategy extension: BUY blends 0.7/0.3 and keeps the 80 gate', async () => {
    const agent = new CTAlphaAgent(mkFakeTwitter([mkTweet()]));
    (agent as any).strategyEngine = {
      getActiveStrategy: () => ({ evaluate: () => ({ confidence: 90, recommendedAction: 'BUY', reason: 'ok' }) }),
    };
    const reports = await agent.runScreeningPass();
    expect(reports.length).toBe(1);
    // raw agent confidence for the fixture = min(98, 80 + min(18, 16 + 15)) = 98
    const expected = Math.round(98 * 0.7 + 90 * 0.3);
    expect(expected).toBeGreaterThanOrEqual(80);
    expect(reports[0].confidence).toBe(expected);
    expect(reports[0].signal.confidenceScore).toBe(expected);
  });

  it('buildPayload maps real fields with fallbacks', () => {
    const agent = new CTAlphaAgent(mkFakeTwitter([]));
    const signal = mkSignal();
    const p = agent.buildPayload(signal, 'custom thesis');
    expect(p.domain).toBe('CT_ALPHA');
    expect(p.title).toBe(signal.title);
    expect(p.symbol).toBe('ROT8');
    expect(p.contractAddress).toBe('0xabc123');
    expect(p.network).toBe('X (Twitter)');
    expect(p.aiThesis).toBe('custom thesis');
    expect(p.confidenceScore).toBe(95);
    expect(p.socialHypeScore).toBe(95);
    expect(p.dexScreenerUrl).toBe(signal.tweetUrl);

    const bare = agent.buildPayload(mkSignal({ symbolMentioned: undefined, contractAddress: undefined, actionableTakeaway: 'fallback takeaway' }), '');
    expect(bare.symbol).toBe('ALPHA');
    expect(bare.contractAddress).toBe('N/A');
    expect(bare.aiThesis).toBe('fallback takeaway');
  });

  it('buildPayload: securityAuditPassed is derived, never hardcoded true', () => {
    const agent = new CTAlphaAgent(mkFakeTwitter([]));
    const unvetted = mkSignal({ authorVerified: undefined, likes: 50, retweets: 10 });
    expect(agent.buildPayload(unvetted, 'x').securityAuditPassed).toBe(false);
    const vetted = mkSignal({ authorVerified: undefined, likes: 100, retweets: 20 });
    expect(agent.buildPayload(vetted, 'x').securityAuditPassed).toBe(true);
  });

  it('deriveSecurityPassed: author verified OR engagement >= 100 likes AND >= 20 retweets', () => {
    const agent = new CTAlphaAgent(mkFakeTwitter([]));
    // author verified passes even with minimal engagement
    expect(agent.deriveSecurityPassed(mkSignal({ authorVerified: true, likes: 10, retweets: 1 }))).toBe(true);
    // exact engagement boundary passes
    expect(agent.deriveSecurityPassed(mkSignal({ authorVerified: undefined, likes: 100, retweets: 20 }))).toBe(true);
    // each boundary violation fails
    expect(agent.deriveSecurityPassed(mkSignal({ authorVerified: undefined, likes: 99, retweets: 20 }))).toBe(false);
    expect(agent.deriveSecurityPassed(mkSignal({ authorVerified: undefined, likes: 100, retweets: 19 }))).toBe(false);
    expect(agent.deriveSecurityPassed(mkSignal({ authorVerified: undefined, likes: 50, retweets: 10 }))).toBe(false);
    expect(agent.deriveSecurityPassed(mkSignal({ authorVerified: false, likes: 1000, retweets: 5 }))).toBe(false);
  });
});

describe('ct-alpha-default strategy', () => {
  const strat = (requireEsm(path.join(process.cwd(), 'strategies', 'ct-alpha-default.mjs')) as any).default;

  const mkCtx = (over: Record<string, unknown> = {}) => ({
    domain: 'CT_ALPHA', symbol: 'ROT8', contractAddress: '0xabc123',
    priceUsd: 0, liquidityUsd: 0, volume24hUsd: 0, volume1hUsd: 0, smartMoneyCount: 0,
    securityAuditPassed: true, socialHypeScore: 95,
    ct: {
      category: 'SMART_CT_CALL',
      author_username: 'ct_whale',
      author_verified: false,
      likes: 800,
      retweets: 150,
      tweet_age_ms: 6 * 60 * 1000,
      tweet_url: 'https://x.com/ct_whale/status/t1',
      symbol_mentioned: 'ROT8',
      contract_address: '0xabc123',
    },
    ...over,
  });

  it('BUY on healthy ctx (>= 80, not SKIP)', () => {
    const ev = strat.evaluate(mkCtx());
    expect(ev.recommendedAction).toBe('BUY');
    expect(ev.confidence).toBeGreaterThanOrEqual(80);
    expect(ev.reason).toContain('80');
  });

  it('top-tier ctx (verified author, viral engagement, fresh) scores 100', () => {
    const ev = strat.evaluate(mkCtx({
      ct: { category: 'SMART_CT_CALL', author_username: 'big_fish', author_verified: true, likes: 2000, retweets: 400, tweet_age_ms: 5 * 60 * 1000 },
    }));
    expect(ev.recommendedAction).toBe('BUY');
    expect(ev.confidence).toBe(100);
  });

  it('SKIP on weak but security-passing ctx (score < 80)', () => {
    const ev = strat.evaluate(mkCtx({
      ct: { category: 'SMART_CT_CALL', author_username: 'ct_whale', author_verified: false, likes: 100, retweets: 20, tweet_age_ms: 40 * 60 * 1000 },
    }));
    expect(ev.recommendedAction).toBe('SKIP');
    expect(ev.confidence).toBeLessThan(80);
  });

  it('SKIP when likes missing (fail-closed)', () => {
    const ctx = mkCtx();
    ctx.ct = { ...ctx.ct, likes: undefined };
    const ev = strat.evaluate(ctx);
    expect(ev.recommendedAction).toBe('SKIP');
    expect(ev.reason).toContain('fail-closed');
  });

  it('SKIP when likes or retweets below min gates', () => {
    expect(strat.evaluate(mkCtx({ ct: { ...mkCtx().ct, likes: 40 } })).recommendedAction).toBe('SKIP');
    expect(strat.evaluate(mkCtx({ ct: { ...mkCtx().ct, retweets: 9 } })).recommendedAction).toBe('SKIP');
  });

  it('SKIP when tweet older than maxAgeMs (1h)', () => {
    const ev = strat.evaluate(mkCtx({ ct: { ...mkCtx().ct, tweet_age_ms: 65 * 60 * 1000 } }));
    expect(ev.recommendedAction).toBe('SKIP');
    expect(ev.reason).toContain('60m');
  });

  it('SKIP when securityAuditPassed is false (author/engagement proxy failed)', () => {
    const ev = strat.evaluate(mkCtx({ securityAuditPassed: false }));
    expect(ev.recommendedAction).toBe('SKIP');
    expect(ev.reason).toContain('Audit');
  });
});
