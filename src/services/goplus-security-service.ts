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
  robinhood: 5318008,
};

export class GoPlusSecurityService {
  private baseUrl = 'https://api.gopluslabs.io/api/v1';

  public async auditToken(chain: EvmChain, contractAddress: string): Promise<GoPlusTokenSecurity | null> {
    const chainId = CHAIN_ID_MAP[chain];
    if (!chainId) return null;
    try {
      const res = await fetch(
        `${this.baseUrl}/token_security/${chainId}?contract_addresses=${contractAddress}`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { result?: Record<string, any> };
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
