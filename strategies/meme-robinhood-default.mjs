export default {
  id: 'meme-robinhood-default',
  name: 'Robinhood Meme CTO/Revival/Momentum',
  version: '1.0.0',
  description:
    'Loosened default (2x): more signals, still >= 80 quality floor. ' +
    'Detects CTO (community takeover), Revival (dead token waking up), ' +
    'and Momentum (volume/hype pump) signals from real GMGN fields. Deterministic scoring, no LLM. ' +
    'Fail-closed: missing fields contribute 0; signals below 80 are SKIP. ' +
    'Degen early: age & fee gates off by default (0) — smart money/CTO/KOL decide. ' +
    'Agent prefilter seeded from params: 1h volume >= $25k, liquidity >= $5k, fees >= $250, ' +
    'rug <= 0.4, insider <= 0.4, top-10 holders <= 0.5.',
  params: {
    passThreshold: 80,
    minVolume24hUsd: 25000,
    minLiquidityUsd: 5000,
    minAgeHours: 0,
    maxRugRatio: 0.4,
    maxRatTraderRate: 0.4,
    maxTop10HolderRate: 0.5,
    minVisitingCount: 100,
    maxTwitterRenameCount: 3,
    maxTwitterDelPostCount: 5,
    maxTwitterCreateTokenCount: 10,
    minTotalFeeUsd: 250,
    prefilterVolume1hUsd: 25000,
    prefilterLiquidityUsd: 5000,
    prefilterTotalFeeUsd: 250,
    prefilterRugRatio: 0.4,
    prefilterRatTraderRate: 0.4,
    prefilterTop10HolderRate: 0.5,
  },
  evaluate(ctx) {
    const p = this.params;
    const g = ctx.gmgn || {}; // rich GMGN fields filled by the agent (never hardcoded)

    const ageHours = typeof g.ageHours === 'number' ? g.ageHours : null;
    const volume24h = Number(g.volume_24h ?? ctx.volume24hUsd ?? 0);
    const liquidity = Number(g.liquidity ?? ctx.liquidityUsd ?? 0);
    const isWash = g.is_wash_trading === true || g.is_wash_trading === 1;
    const rugRatio = typeof g.rug_ratio === 'number' ? g.rug_ratio : null;
    const ratTrader = typeof g.rat_trader_amount_rate === 'number' ? g.rat_trader_amount_rate : null;
    const top10Holder = typeof g.top_10_holder_rate === 'number' ? g.top_10_holder_rate : null;

    const reasons = [];

    // ── Hard fail-closed gates (missing data = reject, never fake-pass) ──
    if (p.minAgeHours > 0 && ageHours === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Token age unknown (fail-closed).' };
    if (p.minAgeHours > 0 && ageHours < p.minAgeHours) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Age ${ageHours.toFixed(1)}h < ${p.minAgeHours}h minimum.` };
    if (volume24h < p.minVolume24hUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Volume $${(volume24h / 1000).toFixed(1)}k < ${p.minVolume24hUsd / 1000}k.` };
    if (liquidity < p.minLiquidityUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Liquidity $${(liquidity / 1000).toFixed(1)}k < ${p.minLiquidityUsd / 1000}k.` };
    if (isWash) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Wash trading detected (fake volume).' };
    if (rugRatio !== null && rugRatio >= p.maxRugRatio) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Rug ratio ${rugRatio.toFixed(2)} >= ${p.maxRugRatio}.` };
    if (ratTrader !== null && ratTrader >= p.maxRatTraderRate) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Insider/rat trader rate ${(ratTrader * 100).toFixed(1)}% >= ${p.maxRatTraderRate * 100}%.` };
    if (top10Holder !== null && top10Holder >= p.maxTop10HolderRate) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Top-10 holder ${(top10Holder * 100).toFixed(1)}% >= ${p.maxTop10HolderRate * 100}%.` };

    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Security audit (GoPlus) failed.' };

    // ── Global total fees gate OPSIONAL: hanya aktif jika minTotalFeeUsd > 0 ──
    if (p.minTotalFeeUsd > 0) {
      const totalFeeNative = typeof g.total_fee === 'number' && g.total_fee > 0 ? g.total_fee : null;
      const nativePriceUsd = typeof g.native_price_usd === 'number' && g.native_price_usd > 0 ? g.native_price_usd : null;
      if (totalFeeNative === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Total fee unknown (fail-closed).' };
      if (nativePriceUsd === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Live native price unavailable — fee conversion failed (fail-closed).' };
      const totalFeeUsd = totalFeeNative * nativePriceUsd;
      if (totalFeeUsd < p.minTotalFeeUsd) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Total fee $${totalFeeUsd.toFixed(0)} < $${p.minTotalFeeUsd} (${totalFeeNative.toFixed(2)} native ETH @ $${nativePriceUsd.toFixed(2)}).` };
    }

    // ── Social red flags (Twitter/X dev behavior, free — from GMGN fields) ──
    const twitterRename = Number(g.twitter_rename_count ?? 0);
    const twitterDelPost = Number(g.twitter_del_post_token_count ?? 0);
    const twitterCreateTokens = Number(g.twitter_create_token_count ?? 0);
    const visitingCount = typeof g.visiting_count === 'number' ? g.visiting_count : null;
    if (twitterRename > p.maxTwitterRenameCount) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Dev renamed Twitter ${twitterRename}x (suspicious, max ${p.maxTwitterRenameCount}).` };
    if (twitterDelPost > p.maxTwitterDelPostCount) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Dev deleted ${twitterDelPost} Twitter posts (erasing trail, max ${p.maxTwitterDelPostCount}).` };
    if (twitterCreateTokens > p.maxTwitterCreateTokenCount) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Dev promoted ${twitterCreateTokens} tokens on Twitter (serial launcher, max ${p.maxTwitterCreateTokenCount}).` };
    const visitingBonus = visitingCount !== null && visitingCount >= p.minVisitingCount
      ? 5
      : 0;
    if (visitingBonus > 0) reasons.push(`👀 ${visitingCount} GMGN visits (+${visitingBonus})`);

    // ── Signal type detection ──
    const ctoFlag = g.cto_flag === 1 || g.cto_flag === true;
    const creatorClosed = g.creator_close === true || g.creator_token_status === 'creator_close';
    const devHoldRate = typeof g.dev_team_hold_rate === 'number' ? g.dev_team_hold_rate : null;
    const smartDegen = Number(g.smart_degen_count ?? ctx.smartMoneyCount ?? 0);
    const renowned = Number(g.renowned_count ?? 0);
    const buys = Number(g.buys ?? 0);
    const sells = Number(g.sells ?? 0);
    const change5m = typeof g.price_change_percent5m === 'number' ? g.price_change_percent5m : null;
    const change1h = typeof g.price_change_percent1h === 'number' ? g.price_change_percent1h : null;

    // ── Quality gate: at least 1 of 3 {smart wallet, CTO, KOL} ──
    const signalStrength = (smartDegen >= 1 ? 1 : 0) + (ctoFlag ? 1 : 0) + (renowned >= 1 ? 1 : 0);
    if (signalStrength < 1) {
      return { confidence: 0, recommendedAction: 'SKIP', reason: '⚠️ Empty: no smart wallet, CTO, or KOL — skip.' };
    }

    // CTO (Community Takeover)
    if (ctoFlag) {
      let score = 40;
      reasons.push('👥 CTO flag GMGN = 1 (+40)');
      if (creatorClosed || (devHoldRate !== null && devHoldRate <= 5)) { score += 20; reasons.push('👨‍💻 Dev already closed/burned (+20)'); }
      if (smartDegen >= 2) { score += 15; reasons.push(`🧠 Smart money ${smartDegen} wallet (+15)`); }
      if (renowned >= 1) { score += 10; reasons.push(`⭐ KOL ${renowned} (+10)`); }
      if (volume24h >= 100000) { score += 15; reasons.push(`🔥 Volume $${(volume24h / 1000).toFixed(0)}k (+15)`); }
      if (ageHours !== null && ageHours < 2) { score += 10; reasons.push('🆕 New launch + CTO (+10)'); }
      return finish('CTO', score);
    }

    // Revival (dead token waking up) — HANYA token lama (umur >= 4h)
    if (ageHours !== null && ageHours >= 4 && change1h !== null && change1h > 50) {
      let score = 15;
      reasons.push('🕐 Age > 4h (+15)');
      score += 30; reasons.push(`📈 Price +${change1h.toFixed(0)}% 1h (+30)`);
      if (volume24h >= 100000) { score += 15; reasons.push(`🔥 Volume $${(volume24h / 1000).toFixed(0)}k (+15)`); }
      if (smartDegen >= 2) { score += 20; reasons.push(`🧠 Smart money ${smartDegen} wallet (+20)`); }
      if (creatorClosed) { score += 20; reasons.push('👨‍💻 Dev already closed/burned (+20)'); }
      return finish('REVIVAL', score);
    }

    // Momentum (general pump, termasuk degen early)
    {
      let score = 0;
      if (change5m !== null && change5m > 0) { score += 15; reasons.push(`⚡ 5m +${change5m.toFixed(1)}% (+15)`); }
      if (change1h !== null && change1h > 30) { score += 25; reasons.push(`🚀 1h +${change1h.toFixed(0)}% (+25)`); }
      const totalTrades = buys + sells;
      if (totalTrades > 0 && buys / totalTrades > 0.6) { score += 20; reasons.push(`⚖️ Buy ${((buys / totalTrades) * 100).toFixed(0)}% / Sell ${((sells / totalTrades) * 100).toFixed(0)}% (+20)`); }
      if (volume24h >= 100000) { score += 15; reasons.push(`🔥 Volume $${(volume24h / 1000).toFixed(0)}k (+15)`); }
      if (smartDegen >= 1) { score += 15; reasons.push(`🧠 Smart money ${smartDegen} (+15)`); }
      if (ageHours !== null && ageHours < 2 && smartDegen >= 1) { score += 10; reasons.push(`🆕 Launch ${ageHours.toFixed(1)}h + smart money entering alongside (+10)`); }
      if (top10Holder !== null && top10Holder < 0.3) { score += 10; reasons.push(`👥 Top-10 ${(top10Holder * 100).toFixed(1)}% (+10)`); }
      return finish('MOMENTUM', score);
    }

    function finish(type, score) {
      const withVisiting = score + visitingBonus;
      const capped = Math.min(100, withVisiting);
      const passed = capped >= p.passThreshold;
      return {
        confidence: capped,
        recommendedAction: passed ? 'BUY' : 'SKIP',
        reason: passed
          ? `🟢 ${type} signal: ${capped}% (${reasons.join(', ')})`
          : `⚪ ${type} candidate ${capped}% < ${p.passThreshold}% (${reasons.join(', ')})`,
      };
    }
  },
};
