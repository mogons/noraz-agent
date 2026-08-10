export default {
  id: 'lp-robinhood-default',
  name: 'Robinhood LP Velocity (Loosened default)',
  version: '1.0.0',
  description:
    'Default LP strategy (2x looser): concentrated-liquidity pools on Robinhood Chain (Uniswap v3 via Krystal). ' +
    'Hard gates: TVL >= $10k, 24h volume >= $100k, 24h Fee/TVL >= 2%, meme-token market cap >= $100k, security audit pass. ' +
    'Fail-closed: missing pool data = SKIP. Confidence 80 when all gates pass. No LLM.',
  params: {
    passThreshold: 80,
    minTvlUsd: 10000,
    minVol24hUsd: 100000,
    minFeeTvlRatio24h: 0.02,
    minMarketCapUsd: 100000,
  },
  evaluate(ctx) {
    const p = this.params;
    const pool = ctx.pool || {};
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

    const tvl = num(pool.tvlUsd ?? ctx.liquidityUsd);
    const vol24h = num(pool.volume24hUsd ?? ctx.volume24hUsd);
    const feeTvl = num(pool.feesToTvlRatio24h);
    const mc = num(pool.marketCapUsd);

    if (tvl === null) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Pool TVL unknown (fail-closed).' };
    if (tvl < p.minTvlUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `TVL $${(tvl / 1000).toFixed(0)}k < $${(p.minTvlUsd / 1000).toFixed(0)}k.` };
    if (vol24h === null) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Pool 24h volume unknown (fail-closed).' };
    if (vol24h < p.minVol24hUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `24h volume $${(vol24h / 1000).toFixed(0)}k < $${(p.minVol24hUsd / 1000).toFixed(0)}k.` };
    if (feeTvl === null) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Fee/TVL ratio unknown (fail-closed).' };
    if (feeTvl < p.minFeeTvlRatio24h) return { confidence: 0, recommendedAction: 'SKIP', reason: `Fee/TVL ${(feeTvl * 100).toFixed(2)}% < ${(p.minFeeTvlRatio24h * 100).toFixed(1)}%.` };
    if (mc === null) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Meme-token market cap unknown (fail-closed).' };
    if (mc < p.minMarketCapUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `Market cap $${(mc / 1000).toFixed(0)}k < $${(p.minMarketCapUsd / 1000).toFixed(0)}k.` };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: 'Security audit failed.' };

    return {
      confidence: 80,
      recommendedAction: 'BUY',
      reason: `${pool.token0Symbol || '?'}-${pool.token1Symbol || '?'}: TVL $${(tvl / 1000).toFixed(1)}k, 24h vol $${(vol24h / 1000).toFixed(1)}k, Fee/TVL ${(feeTvl * 100).toFixed(2)}%, MC $${(mc / 1000).toFixed(0)}k.`,
    };
  },
};
