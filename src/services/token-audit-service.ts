import { RugCheckService } from './security-service.js';
import { GoPlusSecurityService } from './goplus-security-service.js';
import { GMGNAdapter } from '../adapters/gmgn-adapter.js';

export interface TokenAuditResult {
  success: boolean;
  content: string;
}

/**
 * On-demand token audit (used when a contract address is pasted into Discord).
 * Uses GMGN fetchTokenInfo (direct per-token query — NOT the trending fallback)
 * so any valid address gets real price/market data, not just trending tokens.
 * Security audit via RugCheck (Solana) / GoPlus (EVM). Fail-closed on errors.
 */
export async function runTokenAudit(contract: string): Promise<TokenAuditResult> {
  const isSol = !contract.toLowerCase().startsWith('0x');
  try {
    if (isSol) {
      const security = new RugCheckService();
      const audit = await security.auditSolanaToken(contract);
      const gmgn = new GMGNAdapter();
      const token = await gmgn.fetchTokenInfo('sol', contract);
      const apiError = audit.risks[0]?.name === 'RugCheck API Error';

      if (apiError && !token) {
        return { success: false, content: '⚠️ Data audit tidak tersedia saat ini. Coba lagi nanti.' };
      }

      const lines: string[] = [
        `📌 **Contract:** \`${contract}\` (Solana)`,
        token
          ? `📊 **Price:** $${token.priceUsd} | **MC:** $${(token.marketCapUsd / 1000).toFixed(1)}k | **Liq:** $${(token.liquidityUsd / 1000).toFixed(1)}k | **24h Vol:** $${(token.volume24hUsd / 1000).toFixed(1)}k`
          : '📊 **Harga:** —',
        apiError
          ? '🛡️ **Audit:** ⚠️ RugCheck API tidak tersedia saat ini'
          : `🛡️ **RugCheck Score:** ${audit.score}${audit.isSafeForRunner ? ' (Safe)' : ' (⚠️ Risky)'} | **Top 10 Holders:** ${audit.topHoldersSharePercentage.toFixed(1)}% | **LP Locked:** ${audit.lpBurnedPercentage.toFixed(0)}%`,
        `🔗 [DexScreener](https://dexscreener.com/solana/${contract}) | [RugCheck](https://rugcheck.xyz/tokens/${contract})`,
      ];
      return { success: true, content: lines.join('\n') };
    }

    const goplus = new GoPlusSecurityService();
    const security = await goplus.auditToken('base', contract);
    const gmgn = new GMGNAdapter();
    const token = await gmgn.fetchTokenInfo('base', contract);

    if (!security && !token) {
      return { success: false, content: '⚠️ Data audit tidak tersedia saat ini. Coba lagi nanti.' };
    }

    const lines: string[] = [
      `📌 **Contract:** \`${contract}\` (EVM/Base)`,
      token
        ? `📊 **Price:** $${token.priceUsd} | **MC:** $${(token.marketCapUsd / 1000).toFixed(1)}k | **Liq:** $${(token.liquidityUsd / 1000).toFixed(1)}k`
        : '📊 **Harga:** —',
      security
        ? `🛡️ **GoPlus:** BuyTax ${security.buyTaxPct}% | SellTax ${security.sellTaxPct}% | Honeypot: ${security.isHoneypot ? '⚠️ YA' : 'TIDAK'} | Blacklist: ${security.isBlacklisted ? '⚠️ YA' : 'TIDAK'}`
        : '🛡️ **Audit:** —',
      `🔗 [DexScreener](https://dexscreener.com/base/${contract}) | [GoPlus](https://gopluslabs.io/token-security/8453/${contract})`,
    ];
    return { success: true, content: lines.join('\n') };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[AUDIT] Failed for ${contract}: ${message}`);
    return { success: false, content: '⚠️ Data audit tidak tersedia saat ini. Coba lagi nanti.' };
  }
}
