export type CallDomain = 'MEME_SOLANA' | 'MEME_EVM' | 'PERPS' | 'NFT' | 'LP_METEORA' | 'LP_ROBINHOOD' | 'PREDICTION' | 'CT_ALPHA' | 'WHALE';

/** Whale tracking: satu entri posisi terbuka >= ambang milik seorang smart trader. */
export interface WhaleTraderEntry {
  address: string;
  sizeUsd: number;
  entryPx: number;
  returnPct: number;
}

/** Whale tracking: aliran spot (fills >= ambang) per market dalam window 5 menit. */
export interface WhaleSpotEntry {
  market: string;
  buyUsd: number;
  sellUsd: number;
  fillCount: number;
}

/** Whale tracking: laporan posisi smart trader per aset (BTC/ETH/SOL). */
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
  /** Informational only (never a filter): apakah token terverifikasi di platform (Meteora blue check, dll). */
  tokenVerified?: boolean;
  confidenceScore?: number;
  securityScore?: string;
  aiThesis: string;
  dexScreenerUrl?: string;
  gmgnUrl?: string;
  rugcheckUrl?: string;
  /** Direct pool page (Meteora app / Uniswap explore) — domain-specific LP link. */
  poolUrl?: string;
  /** Extra data-source link for LP (e.g. Krystal pool page — verifikasi data). */
  krystalUrl?: string;
  /** LP: kontrak masing-masing token di pool (token X/meme & token Y/base). */
  token0Address?: string;
  token1Address?: string;
  token0Symbol?: string;
  token1Symbol?: string;
  /** LP: chart token (DexScreener/GMGN) — per token. */
  token0ChartUrl?: string;
  token1ChartUrl?: string;
  /** LP: detail token meme (token X) — degen style. */
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
  /** Whale tracking: laporan posisi smart trader (domain WHALE) — render embed khusus. */
  whaleReport?: WhaleReport;
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
