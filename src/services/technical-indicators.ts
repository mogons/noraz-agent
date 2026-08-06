/**
 * Technical Indicators Service
 * 
 * Local deterministic calculations for EMA and RSI.
 * All math runs on the VPS CPU — zero LLM API cost.
 * 
 * Supported timeframes: H1 (1-hour), H4 (4-hour)
 */

export interface Candle {
  openTime: number;   // Unix timestamp ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EMAResult {
  period: number;
  timeframe: 'H1' | 'H4';
  values: number[];       // EMA values aligned with candles (newest last)
  currentValue: number;   // Latest EMA value
}

export interface RSIResult {
  period: number;
  timeframe: 'H1' | 'H4';
  values: number[];       // RSI values (0-100)
  currentValue: number;   // Latest RSI value
}

export interface TechnicalSnapshot {
  coin: string;
  timeframe: 'H1' | 'H4';
  currentPrice: number;

  // EMA values
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;

  // EMA cross signals
  ema9AboveEma21: boolean;     // Fast cross above slow = bullish
  ema21AboveEma50: boolean;    // Mid-term trend confirmation
  priceAboveEma200: boolean;   // Long-term trend filter

  // RSI
  rsi14: number;
  rsiZone: 'OVERBOUGHT' | 'NEUTRAL_BULLISH' | 'NEUTRAL' | 'NEUTRAL_BEARISH' | 'OVERSOLD';

  // Combined signal
  trendBias: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
}

export class TechnicalIndicatorsService {

  /**
   * Calculate EMA (Exponential Moving Average) from candle close prices
   */
  public calculateEMA(candles: Candle[], period: number, timeframe: 'H1' | 'H4'): EMAResult {
    const closes = candles.map(c => c.close);
    const multiplier = 2 / (period + 1);
    const emaValues: number[] = [];

    // Seed with SMA of first `period` candles
    let sum = 0;
    for (let i = 0; i < period && i < closes.length; i++) {
      sum += closes[i];
    }
    let prevEma = sum / Math.min(period, closes.length);
    emaValues.push(prevEma);

    // Calculate EMA for remaining candles
    for (let i = period; i < closes.length; i++) {
      const currentEma = (closes[i] - prevEma) * multiplier + prevEma;
      emaValues.push(currentEma);
      prevEma = currentEma;
    }

    return {
      period,
      timeframe,
      values: emaValues,
      currentValue: emaValues[emaValues.length - 1] || 0,
    };
  }

  /**
   * Calculate RSI (Relative Strength Index) from candle close prices
   * Standard 14-period Wilder's smoothing method
   */
  public calculateRSI(candles: Candle[], period: number = 14, timeframe: 'H1' | 'H4'): RSIResult {
    const closes = candles.map(c => c.close);
    const rsiValues: number[] = [];

    if (closes.length < period + 1) {
      return { period, timeframe, values: [50], currentValue: 50 }; // Not enough data, return neutral
    }

    // Calculate initial average gain/loss over first `period` candles
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) avgGain += change;
      else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;

    // First RSI value
    const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(100 - (100 / (1 + firstRS)));

    // Wilder's smoothing for remaining candles
    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const gain = change >= 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsiValues.push(100 - (100 / (1 + rs)));
    }

    return {
      period,
      timeframe,
      values: rsiValues,
      currentValue: rsiValues[rsiValues.length - 1] || 50,
    };
  }

  /**
   * Generate a full technical snapshot for a coin at a given timeframe
   */
  public generateSnapshot(coin: string, candles: Candle[], timeframe: 'H1' | 'H4'): TechnicalSnapshot {
    const currentPrice = candles[candles.length - 1]?.close || 0;

    const ema9 = this.calculateEMA(candles, 9, timeframe);
    const ema21 = this.calculateEMA(candles, 21, timeframe);
    const ema50 = this.calculateEMA(candles, 50, timeframe);
    const ema200 = this.calculateEMA(candles, 200, timeframe);
    const rsi14 = this.calculateRSI(candles, 14, timeframe);

    // EMA cross signals
    const ema9AboveEma21 = ema9.currentValue > ema21.currentValue;
    const ema21AboveEma50 = ema21.currentValue > ema50.currentValue;
    const priceAboveEma200 = currentPrice > ema200.currentValue;

    // RSI zone classification
    let rsiZone: TechnicalSnapshot['rsiZone'] = 'NEUTRAL';
    if (rsi14.currentValue >= 70) rsiZone = 'OVERBOUGHT';
    else if (rsi14.currentValue >= 55) rsiZone = 'NEUTRAL_BULLISH';
    else if (rsi14.currentValue <= 30) rsiZone = 'OVERSOLD';
    else if (rsi14.currentValue <= 45) rsiZone = 'NEUTRAL_BEARISH';

    // Combined trend bias
    let bullishSignals = 0;
    if (ema9AboveEma21) bullishSignals++;
    if (ema21AboveEma50) bullishSignals++;
    if (priceAboveEma200) bullishSignals++;
    if (rsi14.currentValue >= 50 && rsi14.currentValue < 70) bullishSignals++;

    let trendBias: TechnicalSnapshot['trendBias'] = 'NEUTRAL';
    if (bullishSignals >= 4) trendBias = 'STRONG_BULLISH';
    else if (bullishSignals >= 3) trendBias = 'BULLISH';
    else if (bullishSignals <= 0) trendBias = 'STRONG_BEARISH';
    else if (bullishSignals <= 1) trendBias = 'BEARISH';

    return {
      coin,
      timeframe,
      currentPrice,
      ema9: ema9.currentValue,
      ema21: ema21.currentValue,
      ema50: ema50.currentValue,
      ema200: ema200.currentValue,
      ema9AboveEma21,
      ema21AboveEma50,
      priceAboveEma200,
      rsi14: rsi14.currentValue,
      rsiZone,
      trendBias,
    };
  }

  /**
   * Score a technical snapshot for the Perps Swarm Consensus (0-25 points)
   */
  public scoreTechnicals(h1: TechnicalSnapshot, h4: TechnicalSnapshot, direction: 'LONG' | 'SHORT'): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // ── H4 TREND CONFIRMATION (primary trend filter) ──
    if (direction === 'LONG') {
      if (h4.trendBias === 'STRONG_BULLISH') {
        score += 8;
        reasons.push(`📈 H4 Trend: STRONG BULLISH (EMA9 > EMA21 > EMA50, Price > EMA200)`);
      } else if (h4.trendBias === 'BULLISH') {
        score += 5;
        reasons.push(`📈 H4 Trend: BULLISH (EMA alignment confirmed)`);
      } else {
        reasons.push(`⚠️ H4 Trend: ${h4.trendBias} (Weak trend for LONG)`);
      }
    } else {
      if (h4.trendBias === 'STRONG_BEARISH') {
        score += 8;
        reasons.push(`📉 H4 Trend: STRONG BEARISH (EMA9 < EMA21 < EMA50, Price < EMA200)`);
      } else if (h4.trendBias === 'BEARISH') {
        score += 5;
        reasons.push(`📉 H4 Trend: BEARISH (EMA alignment confirmed)`);
      } else {
        reasons.push(`⚠️ H4 Trend: ${h4.trendBias} (Weak trend for SHORT)`);
      }
    }

    // ── H1 ENTRY TIMING (precision entry on lower timeframe) ──
    if (direction === 'LONG') {
      if (h1.ema9AboveEma21 && h1.rsiZone !== 'OVERBOUGHT') {
        score += 7;
        reasons.push(`✅ H1 Entry: EMA9 crossed above EMA21 + RSI not overbought (${h1.rsi14.toFixed(1)})`);
      } else if (h1.ema9AboveEma21) {
        score += 3;
        reasons.push(`⚠️ H1 Entry: EMA9 > EMA21 but RSI is ${h1.rsiZone} (${h1.rsi14.toFixed(1)})`);
      }
    } else {
      if (!h1.ema9AboveEma21 && h1.rsiZone !== 'OVERSOLD') {
        score += 7;
        reasons.push(`✅ H1 Entry: EMA9 crossed below EMA21 + RSI not oversold (${h1.rsi14.toFixed(1)})`);
      } else if (!h1.ema9AboveEma21) {
        score += 3;
        reasons.push(`⚠️ H1 Entry: EMA9 < EMA21 but RSI is ${h1.rsiZone} (${h1.rsi14.toFixed(1)})`);
      }
    }

    // ── RSI MOMENTUM CONFIRMATION ──
    if (direction === 'LONG' && h4.rsiZone === 'OVERSOLD') {
      score += 5;
      reasons.push(`🔥 H4 RSI Oversold Reversal: RSI ${h4.rsi14.toFixed(1)} (Bounce zone!)`);
    } else if (direction === 'SHORT' && h4.rsiZone === 'OVERBOUGHT') {
      score += 5;
      reasons.push(`🔥 H4 RSI Overbought Reversal: RSI ${h4.rsi14.toFixed(1)} (Rejection zone!)`);
    } else if (direction === 'LONG' && h4.rsi14 >= 50 && h4.rsi14 < 70) {
      score += 3;
      reasons.push(`✅ H4 RSI Momentum: ${h4.rsi14.toFixed(1)} (Healthy bullish zone)`);
    } else if (direction === 'SHORT' && h4.rsi14 <= 50 && h4.rsi14 > 30) {
      score += 3;
      reasons.push(`✅ H4 RSI Momentum: ${h4.rsi14.toFixed(1)} (Healthy bearish zone)`);
    }

    // ── EMA200 LONG-TERM FILTER ──
    if (direction === 'LONG' && h4.priceAboveEma200) {
      score += 5;
      reasons.push(`🏔️ Price above H4 EMA200: Long-term uptrend confirmed`);
    } else if (direction === 'SHORT' && !h4.priceAboveEma200) {
      score += 5;
      reasons.push(`🏔️ Price below H4 EMA200: Long-term downtrend confirmed`);
    }

    return { score: Math.min(25, score), reasons };
  }
}
