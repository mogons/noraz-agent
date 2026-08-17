export type CallDomain = 'MEME_ROBINHOOD' | 'NFT' | 'LP_ROBINHOOD' | 'ALPHA_ROBINHOOD' | 'WHALE_ETH';

/** Whale tracking: a single open position >= threshold belonging to one smart trader. */
export interface WhaleTraderEntry {
  address: string;
  sizeUsd: number;
  entryPx: number;
  returnPct: number;
}

/** Whale tracking: spot flow (fills >= threshold) per market within a 5-minute window. */
export interface WhaleSpotEntry {
  market: string;
  buyUsd: number;
  sellUsd: number;
  fillCount: number;
}

/** Whale tracking: smart trader position report per asset (BTC/ETH). */
export interface WhaleReport {
  coin: string;
  totalLongUsd: number;
  totalShortUsd: number;
  netUsd: number;
  longCount: number;
  shortCount: number;
  longTraders: WhaleTraderEntry[];
  shortTraders: WhaleTraderEntry[];
  spotFlow: WhaleSpotEntry[];
}

export interface CallCardPayload {
  domain: CallDomain;
  title: string;
  symbol: string;
  contractAddress?: string;
  network: string;
  tokenAge?: string;
  priceUsd?: string;
  marketCap?: string;
  liquidity?: string;
  volume5m?: string;
  volume1h?: string;
  volume24h?: string;
  txRatio?: string;
  feeApr?: string;
  lpStrategy?: string;
  top10Pct?: string;
  devHoldingPct?: string;
  sniperPct?: string;
  bundlerPct?: string;
  dexPaidStatus?: string;
  smartMoneyInfo?: string;
  tokenVerified?: boolean;
  confidenceScore?: number;
  securityScore?: string;
  aiThesis: string;
  dexScreenerUrl?: string;
  gmgnUrl?: string;
  goplusUrl?: string;
  poolUrl?: string;
  krystalUrl?: string;
  token0Address?: string;
  token1Address?: string;
  token0Symbol?: string;
  token1Symbol?: string;
  token0ChartUrl?: string;
  token1ChartUrl?: string;
  token0PriceUsd?: number;
  token0MarketCapUsd?: number;
  token0Volume24hUsd?: number;
  token0Holders?: number;
  token0AgeHours?: number;
  token0SmartDegenCount?: number;
  token0Verified?: boolean;
  securityAuditPassed: boolean;
  socialHypeScore: number;
  liquidityUsd: number;
  volume1hUsd: number;
  whaleReport?: WhaleReport;
  cexRadar?: any[];
}

export interface AgentReport<TSignal = unknown> {
  passed: boolean;
  signal: TSignal;
  reason: string;
  confidence: number;
  payload?: CallCardPayload;
}

export interface ScreeningAgent<TSignal = unknown> {
  readonly domain: string;
  runScreeningPass(): Promise<AgentReport<TSignal>[]>;
}
