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
  if (ageMs <= 0) return 'new';
  const hours = Math.floor(ageMs / 3600_000);
  if (hours < 1) return `${Math.floor(ageMs / 60_000)}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function yesNo(v: boolean | undefined | null, warnWhen = true): string {
  if (v === undefined || v === null) return '—';
  if (v) return warnWhen ? '⚠️ Ya' : 'Ya ✅';
  return warnWhen ? 'Tidak ✅' : '⚠️ Tidak';
}

function creatorSignals(t: GMGNRawToken): string {
  const parts: string[] = [];
  if (t.creatorClose) parts.push('Dev exited/closed ✅');
  if (t.ctoFlag) parts.push('CTO active 🚀');
  if (t.renouncedMint) parts.push('Mint renounced ✅');
  if (t.smartDegenCount) parts.push(`Smart: ${t.smartDegenCount}`);
  if (t.ratTraderAmountRate && t.ratTraderAmountRate > 0.05) parts.push(`Cabals: ${(t.ratTraderAmountRate * 100).toFixed(0)}% ⚠️`);
  return parts.length > 0 ? parts.join(' • ') : 'No special creator signals recorded';
}

function marketLines(t: GMGNRawToken | null): string[] {
  if (!t) return ['📊 **Market Data:** Unavailable'];
  return [
    `📊 **Market:** \`$${t.symbol || '—'}\` (${t.name || '—'})`,
    `💵 **Price:** \`$${t.priceUsd ? t.priceUsd.toFixed(6) : '—'}\` | **MC:** \`${fmtUsd(t.marketCapUsd)}\` | **Liq:** \`${fmtUsd(t.liquidityUsd)}\``,
    `📈 **Vol 24h:** \`${fmtUsd(t.volume24hUsd)}\` | **Holders:** \`${fmtInt(t.holderCount)}\` | **Age:** \`${fmtAge(t.creationTimestamp)}\``,
  ];
}

function gmgnAuditLine(audit: GMGNSecurityAudit | null): string {
  if (!audit) return '🔍 **GMGN Audit:** —';
  const flags: string[] = [];
  if (audit.isHoneypot) flags.push('⚠️ HONEYPOT');
  if (audit.canNotSell) flags.push('⚠️ SELL LOCK');
  if (audit.isBlacklist) flags.push('⚠️ BLACKLIST');
  if (audit.buyTaxPct > 5 || audit.sellTaxPct > 5) flags.push(`⚠️ TAX B:${audit.buyTaxPct.toFixed(1)}%/S:${audit.sellTaxPct.toFixed(1)}%`);
  const status = flags.length > 0 ? flags.join(' • ') : 'Clean ✅';
  return `🔍 **GMGN Audit:** ${status}`;
}

export async function runTokenAudit(contractAddress: string): Promise<TokenAuditResult> {
  const contract = contractAddress.trim();
  if (!contract) {
    return { success: false, content: '❌ Provide a valid Contract Address.' };
  }

  try {
    const goplus = new GoPlusSecurityService();
    const security = await goplus.auditTokenFull('robinhood', contract);
    const gmgn = new GMGNAdapter();
    const [token, secAudit] = await Promise.all([
      gmgn.fetchTokenInfo('robinhood', contract),
      gmgn.fetchTokenSecurity('robinhood', contract),
    ]);

    if (!security && !token && !secAudit) {
      return { success: false, content: '⚠️ Audit data is unavailable right now. Try again later.' };
    }

    const securityLine = security
      ? `🛡️ **GoPlus:** Honeypot: ${yesNo(security.isHoneypot)} | BuyTax ${security.buyTaxPct}% | SellTax ${security.sellTaxPct}% | Blacklist: ${yesNo(security.isBlacklisted)} | Open Source: ${yesNo(security.isOpenSource, false)} | Holder ${fmtInt(security.holderCount)}${security.lpHolderCount ? ` | LP Holders ${fmtInt(security.lpHolderCount)}` : ''}`
      : '🛡️ **GoPlus:** ⚠️ no data for the Robinhood chain (4663)';
    const ownerLine = security
      ? `🔏 **Owner:** ${security.isOwnerRenounced ? 'Renounced ✅' : security.canTakeBackOwnership ? '⚠️ CAN TAKE BACK OWNERSHIP' : security.ownerAddress ? 'Active (not renounced)' : '—'} | Mintable: ${yesNo(security.isMintable)} | Proxy: ${yesNo(security.isProxy)} | Transfer Pausable: ${yesNo(security.isTransferPausable)} | Paused: ${yesNo(security.isPaused)} | Airdrop Scam: ${yesNo(security.isAirdropScam)}`
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
    return { success: false, content: '⚠️ Audit data is unavailable right now. Try again later.' };
  }
}
