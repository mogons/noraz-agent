export default {
  id: 'ct-alpha-default',
  name: 'Smart CT Alpha (X/Twitter) Engagement + Freshness',
  version: '1.0.0',
  description:
    'Default ct-alpha strategy: deterministic scoring of Smart CT / AI-narrative tweets from X (Twitter). ' +
    'Gates (fail-closed if missing): >= 50 likes, >= 10 retweets, tweet age <= 1h (3600000ms), ' +
    'securityAuditPassed (author verified OR >= 100 likes AND >= 20 retweets — no on-chain audit exists for tweets). ' +
    'Scoring (0-100): engagement depth 60 (likes/retweets tiers), freshness 15, narrative category 15, author trust 10. ' +
    'Calibrated so a genuinely strong fresh tweet (e.g. 500+ likes, 150+ retweets, < 1h) clears 80. Deterministic, no LLM.',
  params: {
    passThreshold: 80,
    maxAgeMs: 3600000,
    minLikes: 50,
    minRetweets: 10,
  },
  evaluate(ctx) {
    const p = this.params;
    const ct = ctx.ct || {}; // ct-alpha fields filled by the agent (never hardcoded)

    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const likes = num(ct.likes);
    const retweets = num(ct.retweets);
    const ageMs = num(ct.tweet_age_ms);

    const reasons = [];

    // ── Hard fail-closed gates (missing data = reject, never fake-pass) ──
    if (likes === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Jumlah likes tidak diketahui (fail-closed).' };
    if (retweets === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Jumlah retweets tidak diketahui (fail-closed).' };
    if (likes < p.minLikes) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ ${likes} likes < ${p.minLikes} minimum.` };
    if (retweets < p.minRetweets) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ ${retweets} retweets < ${p.minRetweets} minimum.` };
    if (ageMs === null) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Umur tweet tidak diketahui (fail-closed).' };
    if (ageMs > p.maxAgeMs) return { confidence: 0, recommendedAction: 'SKIP', reason: `⛔ Tweet berumur ${(ageMs / 60000).toFixed(0)}m > 60m batas maksimum.` };
    if (!ctx.securityAuditPassed) return { confidence: 0, recommendedAction: 'SKIP', reason: '⛔ Audit keamanan CT tidak lolos (author/engagement proxy).' };

    let score = 0;

    // ── Engagement depth (60) — likes + retweets tiers ──
    if (likes >= 1000) { score += 30; reasons.push(`❤️ ${likes} likes (+30)`); }
    else if (likes >= 500) { score += 25; reasons.push(`❤️ ${likes} likes (+25)`); }
    else if (likes >= 200) { score += 17; reasons.push(`❤️ ${likes} likes (+17)`); }
    else { score += 8; reasons.push(`❤️ ${likes} likes (+8)`); }

    if (retweets >= 300) { score += 30; reasons.push(`🔄 ${retweets} retweets (+30)`); }
    else if (retweets >= 150) { score += 24; reasons.push(`🔄 ${retweets} retweets (+24)`); }
    else if (retweets >= 60) { score += 15; reasons.push(`🔄 ${retweets} retweets (+15)`); }
    else { score += 8; reasons.push(`🔄 ${retweets} retweets (+8)`); }

    // ── Freshness (15) — alpha decays fast ──
    if (ageMs < 10 * 60000) { score += 15; reasons.push('⚡ < 10 menit (+15)'); }
    else if (ageMs < 20 * 60000) { score += 10; reasons.push('⏱️ < 20 menit (+10)'); }
    else if (ageMs < 30 * 60000) { score += 6; reasons.push('⏱️ < 30 menit (+6)'); }
    else if (ageMs < 45 * 60000) { score += 3; reasons.push('⏱️ < 45 menit (+3)'); }

    // ── Narrative (15) — direct trade calls outrank noise ──
    const cat = String(ct.category || '');
    if (cat === 'SMART_CT_CALL') { score += 15; reasons.push('🎯 SMART_CT_CALL (+15)'); }
    else if (cat === 'STEALTH_LAUNCH') { score += 12; reasons.push('🛸 STEALTH_LAUNCH (+12)'); }
    else if (cat === 'AI_AGENTS') { score += 10; reasons.push('🤖 AI_AGENTS (+10)'); }
    else if (cat === 'TICKER_SURGE') { score += 8; reasons.push('📈 TICKER_SURGE (+8)'); }
    else if (cat === 'AIRDROP_YIELD') { score += 8; reasons.push('💧 AIRDROP_YIELD (+8)'); }

    // ── Author trust (10) — verified or heavy follow-through ──
    const engTotal = likes + 2 * retweets;
    if (ct.author_verified === true) { score += 10; reasons.push('✅ Author terverifikasi (+10)'); }
    else if (engTotal >= 1000) { score += 8; reasons.push(`👑 Engagement ${engTotal} (+8)`); }
    else if (engTotal >= 600) { score += 6; reasons.push(`👑 Engagement ${engTotal} (+6)`); }

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
