export default {
  id: 'nft-default',
  name: 'NFT Floor Momentum + Whale Sweep',
  version: '2.0.0',
  description:
    'Default NFT strategy: hard filters (bukan scoring) untuk koleksi EVM di OpenSea. ' +
    'Semua wajib lolos: min floor 0.01 ETH (fail-closed jika missing), floor surge >= 20% 1h, ' +
    'volume spike >= 2.0x baseline, sales velocity >= 5/h, collection security audit harus pass. ' +
    'Whale sweep & verified = bonus info di card. ' +
    'Confidence deterministik: 80 (lolos semua filter) + 10 whale sweep + 10 verified, cap 100. ' +
    'Deterministic, no LLM. Signals below 80 are SKIP.',
  params: {
    passThreshold: 80,
    minFloorEth: 0.01,
    minSurgePct: 20,
    minVolSpike: 2.0,
    minVelocity1h: 5.0,
  },
  evaluate(ctx) {
    const p = this.params;
    const nft = ctx.nft || {}; // snake_case nft fields filled by the agent (never hardcoded)

    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const floor = num(ctx.floorPriceEth ?? nft.floor_price_eth);
    const price = num(ctx.priceEth ?? nft.price_eth);
    const surge = num(ctx.floorSurge1hPct ?? nft.floor_surge_1h_pct);
    const volSpike = num(ctx.volumeSpike1hRatio ?? nft.volume_spike_1h_ratio);
    const velocity = num(ctx.salesVelocity1h ?? nft.sales_velocity_1h);
    const isWhaleSweep = Boolean(ctx.isWhaleSweep ?? nft.is_whale_sweep);
    const isVerified = Boolean(ctx.isVerified ?? nft.is_verified);

    const reasons = [];

    // ── Hard fail-closed gates (missing data = reject, never fake-pass) ──
    if (floor === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Floor price tidak diketahui (fail-closed).' };
    if (floor < p.minFloorEth) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Floor ${floor} ETH < ${p.minFloorEth} ETH minimum.` };
    if (price === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Harga listing tidak diketahui (fail-closed).' };
    if (surge === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Floor surge tidak diketahui (fail-closed).' };
    if (surge < p.minSurgePct) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Floor surge +${surge.toFixed(1)}% < ${p.minSurgePct}% minimum.` };
    if (velocity === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Sales velocity tidak diketahui (fail-closed).' };
    if (velocity < p.minVelocity1h) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Velocity ${velocity}/h < ${p.minVelocity1h}/h minimum.` };
    if (volSpike === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Volume spike ratio tidak diketahui (fail-closed).' };
    if (volSpike < p.minVolSpike) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Vol spike ${volSpike.toFixed(2)}x < ${p.minVolSpike}x minimum.` };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Audit keamanan koleksi tidak lolos (floor/velocity/momentum).' };

    // Confidence deterministik — konsisten dengan agent evaluateListing:
    // 80 (semua hard filter lolos) + 10 whale sweep + 10 verified, cap 100.
    let score = 80;
    reasons.push(`📈 Floor +${surge.toFixed(1)}% 1h ✓`);
    reasons.push(`🌊 Vol ${volSpike.toFixed(1)}x 1h ✓`);
    reasons.push(`⚡ ${velocity.toFixed(1)}/h sales ✓`);
    if (isWhaleSweep) { score += 10; reasons.push('🐋 Whale sweep (+10)'); }
    if (isVerified) { score += 10; reasons.push('✅ Verified (+10)'); }

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
