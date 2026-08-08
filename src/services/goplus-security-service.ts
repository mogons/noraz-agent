export interface GoPlusTokenSecurity {
  isHoneypot: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  isBlacklisted: boolean;
  isOpenSource: boolean;
  holderCount: number;
}

export type EvmChain = 'base' | 'eth' | 'bsc' | 'robinhood';

const CHAIN_ID_MAP: Record<EvmChain, number> = {
  base: 8453,
  eth: 1,
  bsc: 56,
  robinhood: 4663, // verified 2026-08-08: GoPlus code=1 OK (5318008 = arbitrum, "not supported")
};

export class GoPlusSecurityService {
  private baseUrl = 'https://api.gopluslabs.io/api/v1';

  public async auditToken(chain: EvmChain, contractAddress: string): Promise<GoPlusTokenSecurity | null> {
    const chainId = CHAIN_ID_MAP[chain];
    if (!chainId) return null;
    try {
      // GoPlus accepts the API key as `api_key` query param; Authorization header is rejected (code 4012).
      let url = `${this.baseUrl}/token_security/${chainId}?contract_addresses=${contractAddress}`;
      const apiKey = process.env.GOPLUS_API_KEY;
      if (apiKey && !apiKey.includes('YOUR_') && !apiKey.includes('placeholder') && !apiKey.includes('mock')) {
        url += `&api_key=${encodeURIComponent(apiKey)}`;
      }
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) return null;
      const data = (await res.json()) as { code?: number; result?: Record<string, any> };
      if (data.code && data.code !== 1) return null;
      const r = data.result?.[contractAddress.toLowerCase()];
      if (!r) return null;
      const isHoneypot = r.is_honeypot === '1';
      if (isHoneypot) return null;
      return {
        isHoneypot: false,
        buyTaxPct: parseFloat(String(r.buy_tax ?? '0')) || 0,
        sellTaxPct: parseFloat(String(r.sell_tax ?? '0')) || 0,
        isBlacklisted: r.is_blacklisted === '1',
        isOpenSource: r.is_open_source === '1',
        holderCount: parseInt(String(r.holder_count ?? '0'), 10) || 0,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[GOPLUS] Audit failed for ${contractAddress}: ${message}`);
      return null;
    }
  }
}
