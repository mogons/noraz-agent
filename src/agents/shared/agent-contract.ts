export type CallDomain = 'MEME_SOLANA' | 'MEME_EVM' | 'PERPS' | 'NFT' | 'LP_METEORA' | 'LP_UNISWAP' | 'PREDICTION' | 'CT_ALPHA';

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
  /** Informational only (never a filter): apakah token terverifikasi di platform (Meteora blue check, dll). */
  tokenVerified?: boolean;
  confidenceScore?: number;
  securityScore?: string;
  aiThesis: string;
  dexScreenerUrl?: string;
  gmgnUrl?: string;
  rugcheckUrl?: string;
  securityAuditPassed: boolean;
  socialHypeScore: number;
  liquidityUsd: number;
  volume1hUsd: number;
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
