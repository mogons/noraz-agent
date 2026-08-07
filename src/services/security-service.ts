export interface RugCheckResult {
  tokenMint: string;
  score: number; // Low score = high safety, high score = high risk
  tokenType: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isRugged: boolean;
  lpBurnedPercentage: number;
  topHoldersSharePercentage: number;
  risks: Array<{ name: string; value: string; description: string; score: number }>;
  isSafeForRunner: boolean;
}

export class RugCheckService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.RUGCHECK_API_URL || 'https://api.rugcheck.xyz/v1';
  }

  public async auditSolanaToken(tokenMint: string): Promise<RugCheckResult> {
    try {
      console.log(`[RUGCHECK SERVICE] Auditing Solana token: ${tokenMint} via RugCheck API...`);
      
      const endpoint = `${this.apiUrl}/tokens/${tokenMint}/report`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        console.warn(`[RUGCHECK SERVICE] API HTTP ${response.status} for ${tokenMint}. Treating as HIGH RISK.`);
        return this.highRiskFallback(tokenMint, `RugCheck API returned HTTP ${response.status}`);
      }

      const data: any = await response.json();

      // Parse risk score (RugCheck: lower score = safer)
      const score = typeof data.score === 'number' ? data.score : 9999;
      const tokenType = data.tokenType || data.tokenMeta?.type || 'spl-token';
      const mintAuthority = data.mintAuthority || data.token?.mintAuthority || null;
      const freezeAuthority = data.freezeAuthority || data.token?.freezeAuthority || null;

      // Parse top holders concentration
      let topHoldersSharePct = 0;
      if (Array.isArray(data.topHolders)) {
        topHoldersSharePct = data.topHolders
          .slice(0, 10)
          .reduce((sum: number, h: any) => sum + (h.pct || h.percentage || 0), 0);
      }

      // Parse LP burned percentage
      let lpBurnedPct = 0;
      if (Array.isArray(data.markets)) {
        for (const market of data.markets) {
          if (market.lp && typeof market.lp.lpLockedPct === 'number') {
            lpBurnedPct = Math.max(lpBurnedPct, market.lp.lpLockedPct);
          }
        }
      }

      // Parse risks array
      const risks: Array<{ name: string; value: string; description: string; score: number }> = [];
      if (Array.isArray(data.risks)) {
        for (const r of data.risks) {
          risks.push({
            name: r.name || 'Unknown Risk',
            value: r.value || '',
            description: r.description || '',
            score: typeof r.score === 'number' ? r.score : 0,
          });
        }
      }

      const isRugged = score >= 5000 || (data.rugged === true);
      // Safe threshold: score < 1000, no mint/freeze authority, LP > 50% locked
      const isSafeForRunner = score < 1000 && !mintAuthority && !freezeAuthority && !isRugged;

      console.log(`[RUGCHECK SERVICE] Audit complete for ${tokenMint}: Score=${score}, Safe=${isSafeForRunner}, Risks=${risks.length}`);

      return {
        tokenMint,
        score,
        tokenType,
        mintAuthority,
        freezeAuthority,
        isRugged,
        lpBurnedPercentage: lpBurnedPct,
        topHoldersSharePercentage: topHoldersSharePct,
        risks,
        isSafeForRunner,
      };
    } catch (err: any) {
      console.error('[RUGCHECK SERVICE ERROR]', err.message);
      return this.highRiskFallback(tokenMint, err.message);
    }
  }

  private highRiskFallback(tokenMint: string, errorMessage: string): RugCheckResult {
    return {
      tokenMint,
      score: 9999,
      tokenType: 'unknown',
      mintAuthority: 'UNKNOWN',
      freezeAuthority: 'UNKNOWN',
      isRugged: true,
      lpBurnedPercentage: 0,
      topHoldersSharePercentage: 100,
      risks: [{ name: 'RugCheck API Error', value: errorMessage, description: 'Failed to fetch audit report', score: 9999 }],
      isSafeForRunner: false,
    };
  }
}
