import { describe, it, expect, vi, afterEach } from 'vitest';
import { TwitterService } from '../src/services/twitter-service.js';

const realTweet = {
  tweet_id: '123',
  full_text: '$TEST pumping hard today',
  user: { screen_name: 'real_user', name: 'Real User' },
  favorite_count: 150,
  retweet_count: 40,
  reply_count: 12,
  created_at_datetime: new Date().toISOString(),
};

const openTwitterTweet = {
  id: 'ot1',
  text: '$OTEST trending with smart money',
  userScreenName: 'ot_user',
  userName: 'OT User',
  favoriteCount: 200,
  retweetCount: 55,
  replyCount: 20,
  createdAt: new Date().toISOString(),
  url: 'https://x.com/ot_user/status/ot1',
};

describe('TwitterService', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.TWEX_API_KEY; delete process.env.TWITTER_TOKEN; });

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

  it('uses OpenTwitter first when TWITTER_TOKEN is set, fallback TwexAPI on empty', async () => {
    process.env.TWITTER_TOKEN = 'ot-token';
    process.env.TWEX_API_KEY = 'twex-test';
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [openTwitterTweet] }) }) // OpenTwitter search
      .mockResolvedValueOnce({ ok: true, json: async () => [{ ...realTweet }] }); // fallback (tidak dipakai)
    vi.stubGlobal('fetch', fn);
    const svc = new TwitterService();
    const tweets = await svc.searchTweets('OTEST');
    expect(tweets.length).toBe(1);
    expect(tweets[0].id).toBe('ot1');
    expect(tweets[0].authorUsername).toBe('ot_user');
    expect(tweets[0].likes).toBe(200);
    const url = String(fn.mock.calls[0][0]);
    expect(url).toContain('ai.6551.io/open/twitter_search');
    expect(fn).toHaveBeenCalledTimes(1); // tidak sampai fallback
  });

  it('OpenTwitter empty result falls back to TwexAPI', async () => {
    process.env.TWITTER_TOKEN = 'ot-token';
    process.env.TWEX_API_KEY = 'twex-test';
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) }) // OpenTwitter kosong
      .mockResolvedValueOnce({ ok: true, json: async () => [{ ...realTweet }] }); // TwexAPI fallback
    vi.stubGlobal('fetch', fn);
    const svc = new TwitterService();
    const tweets = await svc.searchTweets('TEST');
    expect(tweets.length).toBe(1);
    expect(tweets[0].authorUsername).toBe('real_user');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('openTwitterUser & openTwitterKOLFollowers parse profiles and KOL lists', async () => {
    process.env.TWITTER_TOKEN = 'ot-token';
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { userId: '1', screenName: 'whale', name: 'Whale', followersCount: 100000, friendsCount: 500, statusesCount: 900, verified: true } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ screenName: 'ansem' }, { username: 'machibigbrother' }] }) });
    vi.stubGlobal('fetch', fn);
    const svc = new TwitterService();
    const profile = await svc.openTwitterUser('whale');
    expect(profile?.screenName).toBe('whale');
    expect(profile?.followersCount).toBe(100000);
    const kols = await svc.openTwitterKOLFollowers('whale');
    expect(kols).toEqual(['ansem', 'machibigbrother']);
  });

  it('OpenTwitter fail-closed (401) returns empty, no crash', async () => {
    process.env.TWITTER_TOKEN = 'ot-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const svc = new TwitterService();
    expect(await svc.openTwitterSearch('TEST')).toEqual([]);
    expect(await svc.openTwitterKOLFollowers('whale')).toEqual([]);
  });
});
