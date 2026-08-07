export default {
  id: 'perps-default',
  name: 'Hyperliquid Perps Trend + Funding',
  version: '1.0.0',
  description:
    'Default perps strategy: direction-aware scoring for LONG/SHORT setups on Hyperliquid perps. ' +
    'Gates: min OI $10M (fail-closed if missing), min 1h volume $5M, max spread 0.1%, max |8h funding| 0.2%. ' +
    'Scoring (0-100): OI depth 30 (mega $1B+), 1h volume 15, spread 10, funding alignment with direction 12, ' +
    'OI momentum 10+10, volume/OI ratio 8. Deterministic, no LLM. Signals below 80 are SKIP.',
  params: {
    passThreshold: 80,
    minOiUsd: 10000000,
    maxSpreadPercent: 0.1,
    maxAbsFunding: 0.002,
    minVolume1hUsd: 5000000,
  },
  evaluate(ctx) {
    const p = this.params;
    const hl = ctx.hyperliquid || {}; // snake_case perps fields filled by the agent (never hardcoded)

    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const oi = num(ctx.openInterestUsd ?? hl.open_interest_usd ?? ctx.liquidityUsd);
    const spread = num(ctx.spreadPercent ?? hl.spread_percent);
    const funding = num(ctx.fundingRate8h ?? hl.funding_rate_8h);
    const vol1h = num(ctx.volume1hUsd ?? hl.volume_1h_usd);
    const vol4h = num(ctx.volume4hUsd ?? hl.volume_4h_usd);
    const oi1h = num(ctx.oiChange1hPercent ?? hl.oi_change_1h_percent);
    const oi4h = num(ctx.oiChange4hPercent ?? hl.oi_change_4h_percent);
    const direction = ctx.direction === 'SHORT' ? 'SHORT' : ctx.direction === 'LONG' ? 'LONG' : null;

    const reasons = [];

    // ── Hard fail-closed gates (missing data = reject, never fake-pass) ──
    if (direction === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Arah sinyal tidak diketahui (fail-closed).' };
    if (oi === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Open Interest tidak diketahui (fail-closed).' };
    if (oi < p.minOiUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ OI $${(oi / 1e6).toFixed(0)}M < $${p.minOiUsd / 1e6}M minimum.` };
    if (vol1h === null || vol1h < p.minVolume1hUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Volume $${vol1h === null ? 'N/A' : '$' + (vol1h / 1e6).toFixed(1) + 'M'} < $${p.minVolume1hUsd / 1e6}M minimum.` };
    if (spread !== null && spread > p.maxSpreadPercent) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Spread ${(spread * 100).toFixed(3)}% > ${p.maxSpreadPercent}%.` };
    if (funding !== null && Math.abs(funding) > p.maxAbsFunding) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ |Funding| ${(Math.abs(funding) * 100).toFixed(4)}% > ${p.maxAbsFunding * 100}% max.` };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Audit keamanan perps tidak lolos (OI/depth/spread/funding).' };

    let score = 0;

    // ── OI depth (30) — deep markets cannot be squeezed ──
    if (oi >= 1e9) { score += 30; reasons.push(`🏦 OI $${(oi / 1e9).toFixed(1)}B (mega, +30)`); }
    else if (oi >= 100e6) { score += 25; reasons.push(`🏦 OI $${(oi / 1e6).toFixed(0)}M (deep, +25)`); }
    else if (oi >= 25e6) { score += 20; reasons.push(`🏦 OI $${(oi / 1e6).toFixed(0)}M (+20)`); }
    else { score += 15; reasons.push(`🏦 OI $${(oi / 1e6).toFixed(0)}M (+15)`); }

    // ── 1h volume (15) ──
    if (vol1h >= 50e6) { score += 15; reasons.push(`🔥 Volume $${(vol1h / 1e6).toFixed(0)}M/1h (+15)`); }
    else if (vol1h >= 20e6) { score += 10; reasons.push(`🔥 Volume $${(vol1h / 1e6).toFixed(0)}M/1h (+10)`); }
    else { score += 7; reasons.push(`🔥 Volume $${(vol1h / 1e6).toFixed(1)}M/1h (+7)`); }

    // ── Spread (10) — tight book = clean fills ──
    if (spread !== null) {
      if (spread <= 0.02) { score += 10; reasons.push(`💎 Spread ${(spread * 100).toFixed(3)}% (+10)`); }
      else if (spread <= 0.05) { score += 7; reasons.push(`💎 Spread ${(spread * 100).toFixed(3)}% (+7)`); }
      else { score += 4; reasons.push(`💎 Spread ${(spread * 100).toFixed(3)}% (+4)`); }
    }

    // ── Funding alignment with direction (12) — getting paid to hold wins ──
    if (funding !== null) {
      const longCost = direction === 'LONG' ? funding : -funding;
      if (longCost <= 0) {
        score += 12;
        reasons.push(`🪙 Funding ${(funding * 100).toFixed(4)}%/8h — ${direction === 'LONG' ? 'longs' : 'shorts'} paid to hold (+12)`);
      } else if (longCost < 0.0005) {
        score += 8;
        reasons.push(`🪙 Funding ${(funding * 100).toFixed(4)}%/8h — mild cost (+8)`);
      } else if (longCost <= 0.001) {
        score += 4;
        reasons.push(`🪙 Funding ${(funding * 100).toFixed(4)}%/8h — elevated cost (+4)`);
      } else {
        score -= 4;
        reasons.push(`🪙 Funding ${(funding * 100).toFixed(4)}%/8h — crowded trade (-4)`);
      }
    }

    // ── OI momentum (10 + 10) — new positioning entering the market ──
    if (oi1h !== null && oi1h >= 15) { score += 10; reasons.push(`🚀 OI +${oi1h.toFixed(1)}% 1h (+10)`); }
    else if (oi1h !== null && oi1h >= 5) { score += 5; reasons.push(`📊 OI +${oi1h.toFixed(1)}% 1h (+5)`); }
    if (oi4h !== null && oi4h >= 15) { score += 10; reasons.push(`📈 OI +${oi4h.toFixed(1)}% 4h (+10)`); }
    else if (oi4h !== null && oi4h >= 8) { score += 5; reasons.push(`📈 OI +${oi4h.toFixed(1)}% 4h (+5)`); }

    // ── Volume/OI ratio (8) — new money inflow vs resting positioning ──
    if (vol4h !== null && oi > 0) {
      const ratio = vol4h / oi;
      if (ratio >= 0.8) { score += 8; reasons.push(`🌊 Volume/OI ${ratio.toFixed(2)}x (+8)`); }
      else if (ratio >= 0.3) { score += 4; reasons.push(`🌊 Volume/OI ${ratio.toFixed(2)}x (+4)`); }
    }

    const capped = Math.min(100, score);
    const passed = capped >= p.passThreshold;
    return {
      confidence: capped,
      recommendedAction: passed ? 'BUY' : 'SKIP',
      reason: passed
        ? `🟢 ${direction} ${ctx.symbol}: ${capped}% (${reasons.join(', ')})`
        : `⚪ ${direction} ${ctx.symbol}: ${capped}% < ${p.passThreshold}% (${reasons.join(', ')})`,
    };
  },
};
