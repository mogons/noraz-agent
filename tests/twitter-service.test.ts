import { describe, it, expect, vi, afterEach } from 'vitest';
import { TwitterService } from '../src/services/twitter-service.js';

const realTweet = {
  id: '123',
  text: '$TEST pumping hard today',
  author: { username: 'real_user', name: 'Real User' },
  public_metrics: { like_count: 150, retweet_count: 40, reply_count: 12 },
  created_at: new Date().toISOString(),
};

describe('TwitterService', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.TWEX_API_KEY; });

  it('returns [] with no API key (no fabricated tweets)', async () => {
    const svc = new TwitterService();
    expect(await svc.searchTweets('TEST')).toEqual([]);
  });

  it('returns real tweets with a key', async () => {
    process.env.TWEX_API_KEY = 'twex-test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ ...realTweet }],
    }));
    const svc = new TwitterService();
    const tweets = await svc.searchTweets('TEST');
    expect(tweets.length).toBe(1);
    expect(tweets[0].authorUsername).toBe('real_user');
    expect(tweets[0].likes).toBe(150);
  });

  it('getHypeScore does not fabricate sentiment from count alone', async () => {
    process.env.TWEX_API_KEY = 'twex-test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ ...realTweet }],
    }));
    const svc = new TwitterService();
    const hype = await svc.getHypeScore('TEST');
    expect(hype.tweetCount1h).toBe(1);
    expect(hype.isCtoVerified).toBeUndefined();
  });
});
