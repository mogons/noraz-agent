/**
 * Default Strategy: Hyperliquid ETH Whale & Smart-Money Tracking (Loosened 2x)
 *
 * Evaluates real smart-money metrics from Hyperliquid L1 (clearinghouse positions & spot fills):
 * - Min Perps Position: $500,000 (loosened for broader signal detection)
 * - Min Spot Fill: $50,000
 * - Min Whale Count: 1
 * - Floor Confidence: 80
 */
export default {
  id: 'whale-eth-default',
  name: 'Hyperliquid ETH Whale Tracking (Loosened Default)',
  version: '1.0.0',
  description: 'Tracks large ETH perps positions and spot accumulation on Hyperliquid with loosened thresholds.',
  params: {
    passThreshold: 80,
    minPerpsUsd: 500000,
    minSpotUsd: 50000,
    minWhaleCount: 1,
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

    if (totalWhales < p.minWhaleCount && totalVolume < p.minPerpsUsd) {
      return {
        confidence: 0,
        recommendedAction: 'SKIP',
        reason: 'Whale count & volume below minimum threshold.',
      };
    }

    const netUsd = (totalLong || 0) - (totalShort || 0);
    const action = netUsd >= 0 ? 'BUY' : 'SELL';
    const bias = netUsd >= 0 ? 'BULLISH (Net Long)' : 'BEARISH (Net Short)';

    return {
      confidence: 85,
      recommendedAction: action,
      reason: `ETH Smart Money ${bias} with $${(Math.abs(netUsd) / 1e6).toFixed(2)}M net bias across ${totalWhales} whales.`,
    };
  },
};
