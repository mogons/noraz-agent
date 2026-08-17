/**
 * Standard Strategy: Hyperliquid ETH Whale & Smart-Money Tracking (Strict)
 *
 * Strict institutional thresholds:
 * - Min Perps Position: $1,000,000 ($1M)
 * - Min Spot Fill: $100,000 ($100k)
 * - Min Whale Count: 2
 * - Floor Confidence: 80
 */
export default {
  id: 'whale-eth-standard',
  name: 'Hyperliquid ETH Whale Tracking (Standard Strict)',
  version: '1.0.0',
  description: 'Strict institutional whale tracking requiring >= $1M perps positions and multiple confirming whales.',
  params: {
    passThreshold: 80,
    minPerpsUsd: 1000000,
    minSpotUsd: 100000,
    minWhaleCount: 2,
  },
  evaluate(ctx) {
    const p = this.params;
    const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const w = ctx.whale || ctx.whaleReport || {};

    const totalLong = num(w.totalLongUsd ?? w.total_long_usd);
    const totalShort = num(w.totalShortUsd ?? w.total_short_usd);
    const longCount = num(w.longCount ?? w.long_count ?? 0);
    const shortCount = num(w.shortCount ?? w.short_count ?? 0);

    const totalVolume = (totalLong || 0) + (totalShort || 0);
    const totalWhales = (longCount || 0) + (shortCount || 0);

    if (totalWhales < p.minWhaleCount || totalVolume < p.minPerpsUsd) {
      return {
        confidence: 0,
        recommendedAction: 'SKIP',
        reason: 'Whale count or volume below strict $1M threshold.',
      };
    }

    const netUsd = (totalLong || 0) - (totalShort || 0);
    const action = netUsd >= 0 ? 'BUY' : 'SELL';
    const bias = netUsd >= 0 ? 'BULLISH (Net Long)' : 'BEARISH (Net Short)';

    return {
      confidence: 90,
      recommendedAction: action,
      reason: `Strict ETH Smart Money ${bias} with $${(Math.abs(netUsd) / 1e6).toFixed(2)}M net bias across ${totalWhales} institutional whales.`,
    };
  },
};
