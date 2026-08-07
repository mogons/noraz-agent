export default {
  id: 'nft-default',
  name: 'NFT Floor Momentum + Whale Sweep',
  version: '1.0.0',
  description:
    'Default NFT strategy: floor-momentum scoring for EVM collections on OpenSea. ' +
    'Gates: min floor 0.01 ETH (fail-closed if missing), min sales velocity 5/h, min 4h volume spike 1.5x, ' +
    'collection security audit must pass. ' +
    'Scoring (0-100): floor surge 35, volume spike 25, sales velocity 20, verified whale sweep 20. ' +
    'Deterministic, no LLM. Signals below 80 are SKIP.',
  params: {
    passThreshold: 80,
    minFloorEth: 0.01,
    minVelocity1h: 5,
    minVolSpike: 1.5,
  },
  evaluate(ctx) {
    const p = this.params;
    const nft = ctx.nft || {}; // snake_case nft fields filled by the agent (never hardcoded)

    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const floor = num(ctx.floorPriceEth ?? nft.floor_price_eth);
    const price = num(ctx.priceEth ?? nft.price_eth);
    const surge = num(ctx.floorSurge4hPct ?? nft.floor_surge_4h_pct);
    const volSpike = num(ctx.volumeSpike4hRatio ?? nft.volume_spike_4h_ratio);
    const velocity = num(ctx.salesVelocity1h ?? nft.sales_velocity_1h);
    const isWhaleSweep = Boolean(ctx.isWhaleSweep ?? nft.is_whale_sweep);

    const reasons = [];

    // ── Hard fail-closed gates (missing data = reject, never fake-pass) ──
    if (floor === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Floor price tidak diketahui (fail-closed).' };
    if (floor < p.minFloorEth) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Floor ${floor} ETH < ${p.minFloorEth} ETH minimum.` };
    if (price === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Harga listing tidak diketahui (fail-closed).' };
    if (velocity === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Sales velocity tidak diketahui (fail-closed).' };
    if (velocity < p.minVelocity1h) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Velocity ${velocity}/h < ${p.minVelocity1h}/h minimum.` };
    if (volSpike === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Volume spike ratio tidak diketahui (fail-closed).' };
    if (volSpike < p.minVolSpike) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Vol spike ${volSpike.toFixed(2)}x < ${p.minVolSpike}x minimum.` };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Audit keamanan koleksi tidak lolos (floor/velocity/momentum).' };

    let score = 0;

    // ── Floor surge (35) — real price discovery ──
    if (surge !== null) {
      if (surge >= 30) { score += 35; reasons.push(`📈 Floor +${surge.toFixed(1)}% 4h (+35)`); }
      else if (surge >= 15) { score += 25; reasons.push(`📈 Floor +${surge.toFixed(1)}% 4h (+25)`); }
      else if (surge >= 5) { score += 15; reasons.push(`📈 Floor +${surge.toFixed(1)}% 4h (+15)`); }
      else { score += 5; reasons.push(`📈 Floor +${surge.toFixed(1)}% 4h (+5)`); }
    }

    // ── Volume spike (25) — demand explosion ──
    if (volSpike >= 3) { score += 25; reasons.push(`🌊 Vol ${volSpike.toFixed(1)}x 4h (+25)`); }
    else if (volSpike >= 2) { score += 15; reasons.push(`🌊 Vol ${volSpike.toFixed(1)}x 4h (+15)`); }
    else { score += 8; reasons.push(`🌊 Vol ${volSpike.toFixed(1)}x 4h (+8)`); }

    // ── Sales velocity (20) — actual trading activity ──
    if (velocity >= 25) { score += 20; reasons.push(`⚡ ${velocity}/h sales (+20)`); }
    else if (velocity >= 10) { score += 10; reasons.push(`⚡ ${velocity}/h sales (+10)`); }
    else { score += 5; reasons.push(`⚡ ${velocity}/h sales (+5)`); }

    // ── Verified whale sweep (20) — smart money confirmation ──
    if (isWhaleSweep) { score += 20; reasons.push(`🐋 Verified whale sweep (+20)`); }

    const capped = Math.min(100, score);
    const passed = capped >= p.passThreshold;
    return {
      confidence: capped,
      recommendedAction: passed ? 'BUY' : 'SKIP',
      reason: passed
        ? `🟢 ${ctx.symbol}: ${capped}% (${reasons.join(', ')})`
        : `⚪ ${ctx.symbol}: ${capped}% < ${p.passThreshold}% (${reasons.join(', ')})`,
    };
  },
};
