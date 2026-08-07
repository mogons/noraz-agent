export interface GMGNTokenSignal {
  chain: 'sol' | 'base' | 'eth' | 'bsc' | 'robinhood';
  symbol: string;
  name: string;
  contractAddress: string;
  priceUsd: number;
  marketCapUsd: number;
  volume24hUsd: number;
  liquidityUsd: number;
  smartMoneyNetBuySolOrEth: number;
  smartMoneyCount: number;
  sniperRatioPercentage: number;
  devHoldingPercentage: number;
  tokenAgeHours?: number;
  gmgnUrl: string;
  aiThesis: string;
}

export class GMGNAdapter {
  private baseUrl = 'https://openapi.gmgn.ai';
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GMGN_API_KEY;
  }

  public isApiKeyConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  public getGMGNWebUrl(chain: 'sol' | 'base' | 'eth' | 'bsc' | 'robinhood', contractAddress: string): string {
    return `https://gmgn.ai/${chain}/token/${contractAddress}`;
  }

  public async fetchTrendingSignals(chain: 'sol' | 'base' | 'eth' | 'bsc' = 'sol'): Promise<GMGNTokenSignal[]> {
    if (this.apiKey) {
      console.log(`[GMGN ADAPTER] Synchronized with authenticated GMGN API Key for chain: ${chain.toUpperCase()}`);
      try {
        const gmgnRes = await fetch(`${this.baseUrl}/v1/token/trending/${chain}`, {
          headers: {
            'Content-Type': 'application/json',
            'x-route-key': this.apiKey,
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });
        if (gmgnRes.ok) {
          const gmgnData: any = await gmgnRes.json();
          const items = Array.isArray(gmgnData) ? gmgnData : (gmgnData.data || gmgnData.rank);
          if (Array.isArray(items) && items.length > 0) {
            return items.map((item: any) => ({
              chain,
              symbol: item.symbol || 'TOKEN',
              name: item.name || item.symbol || 'Token',
              contractAddress: item.address || item.contract_address || item.token_address,
              priceUsd: parseFloat(item.price || item.price_usd || '0'),
              marketCapUsd: item.market_cap || item.fdv || 0,
              volume24hUsd: item.volume_24h || item.volume || 0,
              liquidityUsd: item.liquidity || 0,
              smartMoneyNetBuySolOrEth: Number(item.smart_money_net_buy) || 0,
              smartMoneyCount: Number(item.smart_money_count) || 0,
              sniperRatioPercentage: Number(item.sniper_ratio) || 0,
              devHoldingPercentage: Number(item.dev_holding) || 0,
              gmgnUrl: `https://gmgn.ai/${chain}/token/${item.address || item.contract_address || item.token_address}`,
              aiThesis: `GMGN Pro API Signal: $${item.symbol} Smart Money Inflow (+${Number(item.smart_money_net_buy) || 0} SOL/ETH). Snipers: ${Number(item.sniper_ratio) || 0}%.`,
            }));
          }
        }
      } catch (err: any) {
        console.error('[GMGN API AUTH FETCH ERROR]', err.message);
      }
    } else {
      console.log(`[GMGN ADAPTER] Fetching live public DEX trending signals via DexScreener for chain: ${chain.toUpperCase()}...`);
    }

    try {
      // 1. Try DexScreener Top Boosts API for real live trending tokens
      const boostsRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
      if (boostsRes.ok) {
        const boostedTokens: any[] = (await boostsRes.json()) as any[];
        const targetChainId = chain === 'sol' ? 'solana' : chain;
        const matchingBoosted = boostedTokens.filter((t: any) => t.chainId === targetChainId);

        if (matchingBoosted.length > 0) {
          const addrs = matchingBoosted.slice(0, 10).map((t: any) => t.tokenAddress).join(',');
          const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`);
          if (pairRes.ok) {
            const pairData: any = await pairRes.json();
            if (pairData.pairs && Array.isArray(pairData.pairs) && pairData.pairs.length > 0) {
              return pairData.pairs.map((pair: any) => {
                const tokenAddr = pair.baseToken.address;
                const symbol = pair.baseToken.symbol;
                const name = pair.baseToken.name;
                const priceUsd = parseFloat(pair.priceUsd || '0');
                const volume24h = pair.volume?.h24 || 0;
                const liquidityUsd = pair.liquidity?.usd || 0;
                const marketCapUsd = pair.marketCap || pair.fdv || 0;

                return {
                  chain,
                  symbol,
                  name,
                  contractAddress: tokenAddr,
                  priceUsd,
                  marketCapUsd,
                  volume24hUsd: volume24h,
                  liquidityUsd,
                  smartMoneyNetBuySolOrEth: 0,
                  smartMoneyCount: 0,
                  sniperRatioPercentage: 0,
                  devHoldingPercentage: 0,
                  gmgnUrl: `https://gmgn.ai/${chain}/token/${tokenAddr}`,
                  aiThesis: `Real-time DexScreener surge: $${symbol} (${name}) with $${(volume24h / 1000).toFixed(1)}k 24h volume & $${(liquidityUsd / 1000).toFixed(1)}k liquidity on ${chain.toUpperCase()}.`,
                };
              });
            }
          }
        }
      }

      // 2. Fallback to DexScreener Search API if Top Boosts is empty for target chain
      const query = chain === 'sol' ? 'pump' : chain;
      const searchRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${query}`);
      if (searchRes.ok) {
        const searchData: any = await searchRes.json();
        const targetChainId = chain === 'sol' ? 'solana' : chain;
        if (searchData.pairs && Array.isArray(searchData.pairs)) {
          const chainPairs = searchData.pairs.filter((p: any) => p.chainId === targetChainId);
          if (chainPairs.length > 0) {
            return chainPairs.slice(0, 10).map((pair: any) => {
              const tokenAddr = pair.baseToken.address;
              const symbol = pair.baseToken.symbol;
              const name = pair.baseToken.name;
              const priceUsd = parseFloat(pair.priceUsd || '0');
              const volume24h = pair.volume?.h24 || 0;
              const liquidityUsd = pair.liquidity?.usd || 0;
              const marketCapUsd = pair.marketCap || pair.fdv || 0;

              return {
                chain,
                symbol,
                name,
                contractAddress: tokenAddr,
                priceUsd,
                marketCapUsd,
                volume24hUsd: volume24h,
                liquidityUsd,
                smartMoneyNetBuySolOrEth: 0,
                smartMoneyCount: 0,
                sniperRatioPercentage: 0,
                devHoldingPercentage: 0,
                gmgnUrl: `https://gmgn.ai/${chain}/token/${tokenAddr}`,
                aiThesis: `DexScreener Search Surge: $${symbol} (${name}) with $${(volume24h / 1000).toFixed(1)}k 24h volume & $${(liquidityUsd / 1000).toFixed(1)}k liquidity.`,
              };
            });
          }
        }
      }
    } catch (err: any) {
      console.error('[GMGN ADAPTER DEXSCREENER ERROR]', err.message);
    }

    return [];
  }
}
