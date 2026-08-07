import fs from 'fs';
import path from 'path';
import { AGENT_DOMAINS, normalizeDomainKey } from '../orchestrator/agent-registry.js';

export interface DomainKeyRequirement {
  domain: string;
  name: string;
  requiredKeys: string[];
}

export class ApiKeyGuardService {
  private requirements: DomainKeyRequirement[] = AGENT_DOMAINS.map((d) => ({
    domain: d.id,
    name: d.name,
    requiredKeys: d.requiredKeys,
  }));

  public normalizeDomain(domain: string): string {
    return normalizeDomainKey(domain);
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
}
