import { RugCheckService } from './security-service.js';
import { GoPlusSecurityService } from './goplus-security-service.js';
import { GMGNAdapter, type GMGNRawToken, type GMGNSecurityAudit } from '../adapters/gmgn-adapter.js';

export interface TokenAuditResult {
  success: boolean;
  content: string;
}

/** Compact USD: $1.2k / $34.5M / $1.23B — never fabricated, 0 → '—'. */
function fmtUsd(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(4)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtInt(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

function fmtAge(creationTs: number | null | undefined): string {
  if (!creationTs) return '—';
  const ageMs = Date.now() - creationTs * 1000;
  if (ageMs <= 0) return 'baru';
  const hours = Math.floor(ageMs / 3600_000);
  if (hours < 1) return `${Math.floor(ageMs / 60_000)}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function yesNo(v: boolean | undefined | null, warnWhen = true): string {
  if (v === undefined || v === null) return '—';
  if (v) return warnWhen ? '⚠️ YA' : 'YA';
  return 'Tidak';
}

/** Sinyal creator/anti-rug dari GMGN — hanya baris yang datanya tersedia. */
function creatorSignals(token: GMGNRawToken): string {
  const parts: string[] = [];
  if (token.devTeamHoldRate !== null && token.devTeamHoldRate !== undefined) parts.push(`Dev hold ${fmtPct(token.devTeamHoldRate)}`);
  if (token.bundlerRate !== null && token.bundlerRate !== undefined) parts.push(`Bundler ${fmtPct(token.bundlerRate)}`);
  if (token.rugRatio !== null && token.rugRatio !== undefined) parts.push(`Rug ratio ${fmtPct(token.rugRatio)}`);
  if (token.ratTraderAmountRate !== null && token.ratTraderAmountRate !== undefined) parts.push(`Rat trader ${fmtPct(token.ratTraderAmountRate)}`);
  if (token.isWashTrading) parts.push('Wash trading ⚠️');
  if (token.ctoFlag) parts.push('CTO ⚠️');
  if (token.creatorClose) parts.push('Creator close ⚠️');
  if (token.isHoneypot) parts.push('Honeypot ⚠️');
  if (token.exchange) parts.push(`Venue: ${token.exchange}`);
  if (token.launchpadPlatform) parts.push(`Launchpad: ${token.launchpadPlatform}`);
  return parts.length > 0 ? parts.join(' • ') : '—';
}

/** Baris market & aktivitas dari GMGN — konsisten untuk Solana & EVM. */
function marketLines(token: GMGNRawToken | null): string[] {
  if (!token) return ['📊 **Harga:** —', '📈 **Aktivitas:** —', '👥 **Holder:** — | **Umur:** —'];
  const tx = token.buys > 0 || token.sells > 0 ? `${fmtInt(token.buys)}/${fmtInt(token.sells)} (${token.swaps ? `${fmtInt(token.swaps)} swaps` : ''})` : '—';
  return [
    `📊 **Price:** ${fmtUsd(token.priceUsd)} | **MC:** ${fmtUsd(token.marketCapUsd)} | **Liq:** ${fmtUsd(token.liquidityUsd)} | **24h Vol:** ${fmtUsd(token.volume24hUsd)}`,
    `📈 **1h:** ${token.priceChange1h !== null && token.priceChange1h !== undefined ? `${token.priceChange1h >= 0 ? '+' : ''}${token.priceChange1h.toFixed(1)}%` : '—'} | **Buys/Sells:** ${tx}`,
    `👥 **Holder:** ${fmtInt(token.holderCount)} | **Umur:** ${fmtAge(token.creationTimestamp)}`,
  ];
}

/** Baris audit keamanan GMGN `/v1/token/security` (panel Token Audit UI GMGN). */
function gmgnAuditLine(audit: GMGNSecurityAudit | null): string {
  if (!audit) return '🛡️ **GMGN Audit:** ⚠️ tidak tersedia (fail-closed)';
  const parts: string[] = [];
  parts.push(`Honeypot: ${yesNo(audit.isHoneypot)}`);
  parts.push(`Blacklist: ${yesNo(audit.isBlacklist)}`);
  parts.push(`Renounced: ${yesNo(audit.isRenounced, false)}`);
  parts.push(`CanSell: ${audit.canNotSell ? '⚠️ TIDAK' : 'Ya'}`);
  parts.push(`Tax avg ${audit.averageTaxPct.toFixed(1)}%${audit.highTaxPct > 0 ? ` / high ${audit.highTaxPct.toFixed(1)}%` : ''}`);
  if (audit.burnRatioPct > 0) parts.push(`Burn ${audit.burnRatioPct.toFixed(1)}%`);
  if (audit.isOpenSource) parts.push('Open Source');
  if (audit.isLocked) parts.push('Locked');
  if (audit.flags.length > 0) parts.push(`Flags: ${audit.flags.join(',')}`);
  return `🛡️ **GMGN Audit:** ${parts.join(' | ')}`;
}

/**
 * On-demand token audit (used when a contract address is pasted into Discord).
 * Data lengkap: GMGN (market, holder, aktivitas, sinyal creator/anti-rug) +
 * RugCheck (Solana) / GoPlus full (EVM). EVM CA di-scan sebagai Robinhood chain.
 * Fail-closed on errors — tidak pernah mengarang angka.
 */
export async function runTokenAudit(contract: string): Promise<TokenAuditResult> {
  const isSol = !contract.toLowerCase().startsWith('0x');
  try {
    if (isSol) {
      const security = new RugCheckService();
      const audit = await security.auditSolanaToken(contract);
      const gmgn = new GMGNAdapter();
      const [token, secAudit] = await Promise.all([
        gmgn.fetchTokenInfo('sol', contract),
        gmgn.fetchTokenSecurity('sol', contract),
      ]);
      const apiError = audit.risks[0]?.name === 'RugCheck API Error';

      if (apiError && !token && !secAudit) {
        return { success: false, content: '⚠️ Data audit tidak tersedia saat ini. Coba lagi nanti.' };
      }

      const riskLines = audit.risks
        .filter((r) => r.name !== 'RugCheck API Error')
        .slice(0, 5)
        .map((r) => `${r.name}${r.score ? ` (${r.score})` : ''}`);
      const auditLine = apiError
        ? '🛡️ **Audit:** ⚠️ RugCheck API tidak tersedia saat ini'
        : `🛡️ **RugCheck Score:** ${audit.score}${audit.isSafeForRunner ? ' (Safe ✅)' : ' (⚠️ Risky)'} | **Top 10 Holders:** ${audit.topHoldersSharePercentage.toFixed(1)}% | **LP Locked:** ${audit.lpBurnedPercentage.toFixed(0)}%`;
      const authorityLine = apiError
        ? '🔏 **Authority:** —'
        : `🔏 **Mint Auth:** ${audit.mintAuthority ? '⚠️ AKTIF' : 'None ✅'} | **Freeze Auth:** ${audit.freezeAuthority ? '⚠️ AKTIF' : 'None ✅'}`;

      const lines: string[] = [
        `📌 **Contract:** \`${contract}\` (Solana)`,
        ...marketLines(token),
        auditLine,
        authorityLine,
        gmgnAuditLine(secAudit),
        riskLines.length > 0 ? `⚠️ **Risks:** ${riskLines.join(' • ')}` : '🟢 **Risks:** Tidak ada risk tercatat',
        `🧠 **Creator:** ${token ? creatorSignals(token) : '—'}`,
        `🔗 [DexScreener](https://dexscreener.com/solana/${contract}) | [RugCheck](https://rugcheck.xyz/tokens/${contract})`,
      ];
      return { success: true, content: lines.join('\n') };
    }

    const goplus = new GoPlusSecurityService();
    const security = await goplus.auditTokenFull('robinhood', contract);
    const gmgn = new GMGNAdapter();
    const [token, secAudit] = await Promise.all([
      gmgn.fetchTokenInfo('robinhood', contract),
      gmgn.fetchTokenSecurity('robinhood', contract),
    ]);

    if (!security && !token && !secAudit) {
      return { success: false, content: '⚠️ Data audit tidak tersedia saat ini. Coba lagi nanti.' };
    }

    const securityLine = security
      ? `🛡️ **GoPlus:** Honeypot: ${yesNo(security.isHoneypot)} | BuyTax ${security.buyTaxPct}% | SellTax ${security.sellTaxPct}% | Blacklist: ${yesNo(security.isBlacklisted)} | Open Source: ${yesNo(security.isOpenSource, false)} | Holder ${fmtInt(security.holderCount)}${security.lpHolderCount ? ` | LP Holders ${fmtInt(security.lpHolderCount)}` : ''}`
      : '🛡️ **GoPlus:** ⚠️ tidak ada data untuk chain robinhood (4663)';
    const ownerLine = security
      ? `🔏 **Owner:** ${security.isOwnerRenounced ? 'Renounced ✅' : security.canTakeBackOwnership ? '⚠️ BISA AMBIL KEMBALI' : security.ownerAddress ? 'Aktif (bukan renounced)' : '—'} | Mintable: ${yesNo(security.isMintable)} | Proxy: ${yesNo(security.isProxy)} | Transfer Pausable: ${yesNo(security.isTransferPausable)} | Paused: ${yesNo(security.isPaused)} | Airdrop Scam: ${yesNo(security.isAirdropScam)}`
      : '🔏 **Owner:** —';

    const lines: string[] = [
      `📌 **Contract:** \`${contract}\` (EVM/Robinhood)`,
      ...marketLines(token),
      securityLine,
      ownerLine,
      gmgnAuditLine(secAudit),
      `🧠 **Creator:** ${token ? creatorSignals(token) : '—'}`,
      `🔗 [DexScreener](https://dexscreener.com/robinhood/${contract}) | [GoPlus](https://gopluslabs.io/token-security/4663/${contract})`,
    ];
    return { success: true, content: lines.join('\n') };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[AUDIT] Failed for ${contract}: ${message}`);
    return { success: false, content: '⚠️ Data audit tidak tersedia saat ini. Coba lagi nanti.' };
  }
}
