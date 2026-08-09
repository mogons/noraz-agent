export default {
  id: 'prediction-default',
  name: 'Polymarket Liquidity + Odds Value',
  version: '1.0.0',
  description:
    'Default prediction strategy: odds-value scoring for Polymarket markets. ' +
    'Gates: min liquidity $50k (fail-closed if missing), min 24h volume $25k, max spread 0.05 when book data ' +
    'available (null spread passes the gate — the agent audit already gates liquidity+volume for null books), ' +
    'market security audit must pass. ' +
    'Scoring (0-100): recommended-outcome odds 40, liquidity 20, 24h volume 20, spread 20. ' +
    'Deterministic, no LLM. Signals below 80 are SKIP.',
  params: {
    passThreshold: 80,
    minLiquidityUsd: 50000,
    minVolume24hUsd: 25000,
    maxSpread: 0.05,
  },
  evaluate(ctx) {
    const p = this.params;
    const poly = ctx.prediction || {}; // snake_case prediction fields filled by the agent (never hardcoded)

    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const liquidity = num(ctx.liquidityUsd ?? poly.liquidity_usd);
    const volume = num(ctx.volume24hUsd ?? poly.volume_24h_usd);
    const odds = num(ctx.priceUsd ?? poly.current_odds_pct);
    const spread = num(ctx.spread ?? poly.spread); // null when no book data
    const outcome = ctx.outcome === 'Yes' || ctx.outcome === 'No' ? ctx.outcome : poly.outcome === 'Yes' || poly.outcome === 'No' ? poly.outcome : null;

    const reasons = [];

    // ── Hard fail-closed gates (missing data = reject, never fake-pass) ──
    if (outcome === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Recommended outcome unknown (fail-closed).' };
    if (liquidity === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Market liquidity unknown (fail-closed).' };
    if (liquidity < p.minLiquidityUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Likuiditas $${(liquidity / 1e3).toFixed(0)}k < $${p.minLiquidityUsd / 1e3}k minimum.` };
    if (volume === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ 24h volume unknown (fail-closed).' };
    if (volume < p.minVolume24hUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Volume 24h $${(volume / 1e3).toFixed(0)}k < $${p.minVolume24hUsd / 1e3}k minimum.` };
    if (spread !== null && spread > p.maxSpread) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Spread ${(spread * 100).toFixed(2)}% > ${p.maxSpread * 100}% max.` };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Market security audit failed (liquidity/volume/spread).' };

    let score = 0;

    // ── Recommended-outcome odds (40) — probability edge ──
    if (odds !== null) {
      if (odds >= 92) { score += 40; reasons.push(`🎯 ${outcome} @ ${odds.toFixed(1)}% (+40)`); }
      else if (odds >= 80) { score += 30; reasons.push(`🎯 ${outcome} @ ${odds.toFixed(1)}% (+30)`); }
      else if (odds >= 65) { score += 20; reasons.push(`🎯 ${outcome} @ ${odds.toFixed(1)}% (+20)`); }
      else { score += 10; reasons.push(`🎯 ${outcome} @ ${odds.toFixed(1)}% (+10)`); }
    }

    // ── Liquidity (20) — bet can be filled without slippage ──
    if (liquidity >= 500000) { score += 20; reasons.push(`🏦 Liquidity $${(liquidity / 1e6).toFixed(1)}M (+20)`); }
    else if (liquidity >= 100000) { score += 15; reasons.push(`🏦 Liquidity $${(liquidity / 1e3).toFixed(0)}k (+15)`); }
    else { score += 8; reasons.push(`🏦 Liquidity $${(liquidity / 1e3).toFixed(0)}k (+8)`); }

    // ── 24h volume (20) — real betting activity ──
    if (volume >= 1000000) { score += 20; reasons.push(`🔥 Volume $${(volume / 1e6).toFixed(1)}M/24h (+20)`); }
    else if (volume >= 250000) { score += 15; reasons.push(`🔥 Volume $${(volume / 1e3).toFixed(0)}k/24h (+15)`); }
    else { score += 8; reasons.push(`🔥 Volume $${(volume / 1e3).toFixed(0)}k/24h (+8)`); }

    // ── Spread (20) — tight book = clean fills; null book treated as neutral
    //    (the audit gate already covered liquidity+volume for null spreads) ──
    if (spread !== null) {
      if (spread <= 0.03) { score += 20; reasons.push(`💎 Spread ${(spread * 100).toFixed(2)}% (+20)`); }
      else if (spread <= 0.05) { score += 12; reasons.push(`💎 Spread ${(spread * 100).toFixed(2)}% (+12)`); }
      else { score += 5; reasons.push(`💎 Spread ${(spread * 100).toFixed(2)}% (+5)`); }
    } else {
      score += 20; // neutral: no book data observed
    }

    const capped = Math.min(100, score);
    const passed = capped >= p.passThreshold;
    return {
      confidence: capped,
      recommendedAction: passed ? 'BUY' : 'SKIP',
      reason: passed
        ? `🟢 ${outcome} ${ctx.symbol}: ${capped}% (${reasons.join(', ')})`
        : `⚪ ${outcome} ${ctx.symbol}: ${capped}% < ${p.passThreshold}% (${reasons.join(', ')})`,
    };
  },
};
