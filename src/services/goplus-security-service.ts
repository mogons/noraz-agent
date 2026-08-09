export interface GoPlusTokenSecurity {
  isHoneypot: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  isBlacklisted: boolean;
  isOpenSource: boolean;
  holderCount: number;
  ownerAddress?: string;
  isOwnerRenounced?: boolean;
  canTakeBackOwnership?: boolean;
  isMintable?: boolean;
  isProxy?: boolean;
  isTransferPausable?: boolean;
  isPaused?: boolean;
  isAirdropScam?: boolean;
  lpHolderCount?: number;
  liquidityUsd?: number;
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

  /**
   * Screening path — conservative fail-closed: honeypot => null (rejected).
   * Only basic fields are used for screening (tax, blacklist, open source, holders).
   */
  public async auditToken(chain: EvmChain, contractAddress: string): Promise<GoPlusTokenSecurity | null> {
    const full = await this.auditTokenFull(chain, contractAddress);
    if (!full) return null;
    if (full.isHoneypot) return null;
    return full;
  }

  /**
   * On-demand audit path — full details, honeypot is STILL returned
   * (isHoneypot=true) so it can be shown to the user, not masked as null.
   */
  public async auditTokenFull(chain: EvmChain, contractAddress: string): Promise<GoPlusTokenSecurity | null> {
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
      return {
        isHoneypot: r.is_honeypot === '1',
        buyTaxPct: parseFloat(String(r.buy_tax ?? '0')) || 0,
        sellTaxPct: parseFloat(String(r.sell_tax ?? '0')) || 0,
        isBlacklisted: r.is_blacklisted === '1',
        isOpenSource: r.is_open_source === '1',
        holderCount: parseInt(String(r.holder_count ?? '0'), 10) || 0,
        ownerAddress: r.owner_address || undefined,
        isOwnerRenounced: r.is_owner_renounced === '1',
        canTakeBackOwnership: r.can_take_back_ownership === '1',
        isMintable: r.is_mintable === '1',
        isProxy: r.is_proxy === '1',
        isTransferPausable: r.is_transfer_pausable === '1',
        isPaused: r.is_paused === '1',
        isAirdropScam: r.is_airdrop_scam === '1',
        lpHolderCount: parseInt(String(r.lp_holder_count ?? '0'), 10) || 0,
        liquidityUsd: parseFloat(String(r.liquidity ?? '0')) || 0,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[GOPLUS] Audit failed for ${contractAddress}: ${message}`);
      return null;
    }
  }
}
