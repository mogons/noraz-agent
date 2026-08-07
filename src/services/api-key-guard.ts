import fs from 'fs';
import path from 'path';

export interface DomainKeyRequirement {
  domain: string;
  name: string;
  requiredKeys: string[];
}

export class ApiKeyGuardService {
  private requirements: DomainKeyRequirement[] = [
    {
      domain: 'meme-solana',
      name: 'Solana DEX Meme Screening',
      requiredKeys: ['GMGN_API_KEY', 'AI_API_KEY'],
    },
    {
      domain: 'meme-evm',
      name: 'EVM DEX Meme Screening',
      requiredKeys: ['GOPLUS_API_KEY', 'AI_API_KEY'],
    },
    {
      domain: 'perps',
      name: 'Perpetual Futures Screening (Hyperliquid)',
      requiredKeys: ['EVM_PRIVATE_KEY', 'AI_API_KEY'],
    },
    {
      domain: 'nft',
      name: 'EVM NFT Floor & Rarity Sniping (OpenSea)',
      requiredKeys: ['OPENSEA_API_KEY', 'AI_API_KEY'],
    },
    {
      domain: 'prediction',
      name: 'Polymarket Prediction Market Arbitrage',
      requiredKeys: ['POLYMARKET_API_KEY', 'AI_API_KEY'],
    },
    {
      domain: 'ct-alpha',
      name: 'Smart CT & AI Narrative Intelligence',
      requiredKeys: ['TWEX_API_KEY', 'AI_API_KEY'],
    },
    {
      domain: 'lp-solana',
      name: 'Solana Concentrated Liquidity Velocity (Meteora)',
      requiredKeys: ['GMGN_API_KEY'],
    },
    {
      domain: 'lp-evm',
      name: 'EVM Concentrated Liquidity Velocity (Uniswap)',
      requiredKeys: ['GOPLUS_API_KEY'],
    },
  ];

  public normalizeDomain(domain: string): string {
    const d = domain.toLowerCase().trim();
    if (d === 'solana' || d === 'solana-meme' || d === 'meme-solana') return 'meme-solana';
    if (d === 'evm' || d === 'evm-meme' || d === 'meme-evm' || d === 'base') return 'meme-evm';
    if (d === 'perps' || d === 'perpetual' || d === 'hyperliquid') return 'perps';
    if (d === 'nft' || d === 'opensea') return 'nft';
    if (d === 'prediction' || d === 'polymarket' || d === 'poly') return 'prediction';
    if (d === 'ct-alpha' || d === 'twitter' || d === 'ct') return 'ct-alpha';
    if (d === 'lp-solana' || d === 'meteora') return 'lp-solana';
    if (d === 'lp-evm' || d === 'uniswap') return 'lp-evm';
    return d;
  }

  public checkDomainKeys(domain: string): { ready: boolean; missingKeys: string[]; statusMessage: string } {
    const norm = this.normalizeDomain(domain);
    const req = this.requirements.find(r => r.domain === norm);

    if (!req) {
      return { ready: true, missingKeys: [], statusMessage: `Domain ${domain} has no required API key constraints.` };
    }

    const missingKeys: string[] = [];
    for (const key of req.requiredKeys) {
      let val = process.env[key];
      if (key === 'AI_API_KEY') {
        val = val || process.env.AI_API_KEYS || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
      }
      if (!val || val.trim() === '' || val.includes('YOUR_') || val.includes('placeholder') || val.includes('mock')) {
        missingKeys.push(key);
      }
    }

    if (missingKeys.length > 0) {
      const statusMessage = `⛔ [API KEY GUARD] Sub-agent "${req.name}" is HALTED. Missing required API keys: ${missingKeys.join(', ')}. Please set API keys via chat ("Athena, set ${missingKeys[0]}=...") or wizard before running.`;
      return { ready: false, missingKeys, statusMessage };
    }

    return { ready: true, missingKeys: [], statusMessage: `🟢 [API KEY GUARD] Sub-agent "${req.name}" API key requirements fully satisfied.` };
  }

  public setApiKeyRuntimeAndEnv(keyName: string, keyValue: string): boolean {
    const cleanKey = keyName.trim().toUpperCase();
    const cleanVal = keyValue.trim();
    if (!cleanKey || !cleanVal) return false;

    // 1. Update runtime environment
    process.env[cleanKey] = cleanVal;

    // 2. Persist to .env file
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }

      const keyRegex = new RegExp(`^${cleanKey}=.*$`, 'm');
      if (keyRegex.test(envContent)) {
        envContent = envContent.replace(keyRegex, `${cleanKey}=${cleanVal}`);
      } else {
        envContent += `\n${cleanKey}=${cleanVal}`;
      }

      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
      console.log(`[API KEY GUARD] Successfully set & persisted ${cleanKey} to .env and runtime.`);
      return true;
    } catch (err: any) {
      console.error(`[API KEY GUARD ERROR] Failed to write .env file: ${err.message}`);
      return false;
    }
  }

  public getAllRequirementStatuses(): Array<{ domain: string; name: string; ready: boolean; missingKeys: string[] }> {
    return this.requirements.map(r => {
      const res = this.checkDomainKeys(r.domain);
      return {
        domain: r.domain,
        name: r.name,
        ready: res.ready,
        missingKeys: res.missingKeys,
      };
    });
  }
}
