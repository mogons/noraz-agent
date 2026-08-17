export interface StrategyContext {
  domain: string;
  symbol: string;
  contractAddress?: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  volume1hUsd: number;
  smartMoneyCount: number;
  securityAuditPassed: boolean;
  socialHypeScore: number;
  [key: string]: unknown;
}

export interface StrategyEvaluation {
  confidence: number; // 0-100
  recommendedAction: 'BUY' | 'SELL' | 'HOLD' | 'SKIP';
  reason: string;
}

export interface OpenCatStrategy {
  id: string;
  name: string;
  version: string;
  description: string;
  params: Record<string, any>;
  evaluate(context: StrategyContext): StrategyEvaluation;
}

export type AthenaStrategy = OpenCatStrategy;

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OpenCatIndicator {
  id: string;
  name: string;
  version: string;
  calculate(candles: Candle[]): number[];
}

export type AthenaIndicator = OpenCatIndicator;
