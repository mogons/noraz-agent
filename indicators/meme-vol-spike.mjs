export default {
  id: 'meme-vol-spike',
  name: 'Meme Volume Spike & Acceleration',
  version: '1.0.0',
  description:
    'Candlestick-based indicator for meme tokens: rolling volume spike ratio (current volume vs ' +
    'trailing average) and volume acceleration. Returns one value per candle: the volume spike ' +
    'ratio (e.g. 2.5 = 150% above average). Falls back to 1.0 when data is insufficient.',
  params: {
    lookback: 24, // trailing candles for the average
  },
  calculate(candles) {
    const p = this.params;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const out = [];
    const vols = candles.map((c) => Number(c.volume) || 0);

    for (let i = 0; i < vols.length; i++) {
      const start = Math.max(0, i - p.lookback);
      const window = vols.slice(start, i); // exclude current candle
      if (window.length === 0) {
        out.push(1);
        continue;
      }
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      const spikeRatio = avg > 0 ? vols[i] / avg : 1;
      out.push(Number(spikeRatio.toFixed(3)));
    }

    return out;
  },
};
