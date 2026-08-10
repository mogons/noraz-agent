export type AgentDomainId =
  | 'meme-robinhood'
  | 'lp-robinhood'
  | 'nft';

export type AgentCategory = 'MEME' | 'LP' | 'NFT';

export interface AgentDomainInfo {
  id: AgentDomainId;
  displayName: string;
  name: string;
  channel: string;
  aliases: string[];
  requiredKeys: string[];
  category: AgentCategory;
}

export const AGENT_DOMAINS: AgentDomainInfo[] = [
  {
    id: 'meme-robinhood',
    displayName: 'MEME-ROBINHOOD',
    name: 'Robinhood Chain Meme Screening',
    channel: 'call-meme-robinhood',
    aliases: ['robinhood', 'evm', 'evm-meme', 'meme-evm'],
    requiredKeys: ['AI_API_KEY'],
    category: 'MEME',
  },
  {
    id: 'lp-robinhood',
    displayName: 'LP-ROBINHOOD',
    name: 'Robinhood Chain Concentrated Liquidity Velocity',
    channel: 'call-lp-robinhood',
    aliases: ['uniswap', 'evm-lp', 'robinhood-lp'],
    requiredKeys: ['KRYSTAL_CLOUD_API_KEY', 'GMGN_API_KEY', 'AI_API_KEY'],
    category: 'LP',
  },
  {
    id: 'nft',
    displayName: 'NFT-SNIPING',
    name: 'Robinhood Chain NFT Floor & Rarity Sniping (OpenSea)',
    channel: 'call-nft-sniping',
    aliases: ['opensea', 'nft-sniper'],
    requiredKeys: ['OPENSEA_API_KEY', 'AI_API_KEY'],
    category: 'NFT',
  },
];

function canonicalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/^call-/, '')
    .replace(/-token$/, '');
}

export function getAgentDomain(idOrAlias: string): AgentDomainInfo | undefined {
  const key = canonicalize(idOrAlias);
  return AGENT_DOMAINS.find(
    (d) => d.id === key || d.aliases.some((a) => a === key) || d.channel === idOrAlias.toLowerCase()
  );
}

export function normalizeDomainKey(idOrAlias: string): string {
  return getAgentDomain(idOrAlias)?.id ?? canonicalize(idOrAlias);
}
