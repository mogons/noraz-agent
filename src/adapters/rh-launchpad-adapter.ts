/**
 * Robinhood Chain launch origin — native to Noraz.
 * DexScreener only shows Uniswap after graduation. Origin is the factory
 * that minted the token (public pad APIs + factory eth_calls).
 * No dune-research, no Dune, no extra keys. Uses EVM_ROBINHOOD_RPC_URL.
 */

import { keccak256, toBytes } from 'viem';
import { getEnvString } from '../config/config.js';

const DEFAULT_RPC = 'https://rpc.mainnet.chain.robinhood.com';
const PONS_TOKEN = 'https://www.ponsfamily.com/api/pons-token/{token}';
const STONK_FLOOR = 'https://stonkbrokers.wtf/api/safe-launch/floor';
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const STONK_TTL_MS = 10 * 60 * 1000;

export interface RhLaunchpadOrigin {
  name: string;
  graduated: boolean | null;
}

function selector(sig: string, known?: string): string {
  try {
    return keccak256(toBytes(sig)).slice(2, 10);
  } catch {
    return known || '';
  }
}

const SEL_LAUNCH_FACTORY = selector('launchFactory()', '536dac9b');
const SEL_FACTORY = selector('factory()', 'c45a0155');
const SEL_HOOK = selector('hook()', '7f5a7c7b');
const SEL_GET_LAUNCHED = selector('getLaunchedToken(address)', '3cf28b5a');
const SEL_IS_HOOD = selector('isHoodToken(address)', 'f7c40209');
const SEL_POOL_OF = selector('poolOf(address)', '988b1fa7');
const SEL_LAUNCHES = selector('launches(address)', '1f2d8550');
const SEL_CURVES = selector('curves(address)', '2cc3dc6e');
const SEL_TOKEN_INFO = selector('tokenInfoByAddress(address)');
const SEL_ASSET_DATA = selector('getAssetData(address)');
const SEL_DEPLOYER_OF = selector('deployerOf(address)');

/** Verified RH factory → pad name. */
export const FACTORY_PAD: Record<string, string> = {
  '0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb': 'Pons',
  '0x0c37a24f5d23a486fa692d1500881d698b1f77a4': 'Pons',
  '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e': 'Pons',
  '0xd9ec2db5f3d1b236843925949fe5bd8a3836fccb': 'NOXA Fun',
  '0x5bd1fbe78a78fe8236fa00cf48fbeba74ae34661': 'LetsCash',
  '0x75a54357d9c78a2db19004a5fdc76c50f9242aec': 'LetsCash',
  '0x411f21283d3e492bc395027329e08f9f4f560ba5': 'o1 Launchpad',
  '0xe64ac4113848bbc1a6dde1a6d1da96720a36f297': 'o1 Launchpad',
  '0x278d4989232c0c213ed4a8a0652f46a21b0fd226': 'StonkBrokers',
  '0x5fcc1df0dc020cf454e742e9a8ae2554c37a452c': 'Hood.fun',
  '0xa3a71925be892c609ac4be4efe918dc9c35fc5e8': 'RealFun',
  '0xd861cb5dc71a0171e8f0f6586cadb069f3a35e4d': 'RobinFun',
  '0x16cf6788b762ee8969744586ed16fc5705140dd7': 'Klik',
  '0x1bed2687321074a198302c004036b51923812b18': 'Bottom.fun',
  '0x22e99278308b393ea1260859b181ad7e78f5eeed': 'Long.xyz',
  '0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862': 'Long.xyz',
  '0x80b42aed46d73f47119dc444bea28a9e68f32bf4': 'DYOR.fun',
  '0x6e4910ea5a04376032f6564da9a9e4e88b7a87c1': 'ApeStore',
  '0xc70e510e14710ea535cab7b2414860af63feab79': 'Bow.fun',
};

const GET_LAUNCHED_FACTORIES = [
  '0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB',
  '0x0c37a24F5D23A486FA692d1500881d698B1F77a4',
  '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
  '0xD9eC2db5f3D1b236843925949fe5bd8a3836FCcB',
  '0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661',
  '0x80b42aed46d73f47119dc444bea28a9e68f32bf4',
  '0x411F21283D3E492BC395027329e08f9F4F560Ba5',
  '0xe64AC4113848BBC1a6dDE1A6D1da96720A36F297',
  '0x278d4989232c0c213ed4a8a0652f46a21b0fd226',
];

type SpecialKind = 'bool' | 'addr' | 'launches' | 'info' | 'nonzero';

const SPECIALS: Array<{ name: string; factory: string; selector: string; kind: SpecialKind }> = [
  { name: 'Hood.fun', factory: '0x5fcc1df0dc020cf454e742e9a8ae2554c37a452c', selector: SEL_IS_HOOD, kind: 'bool' },
  { name: 'RealFun', factory: '0xa3A71925be892c609Ac4BE4EFe918Dc9C35fc5e8', selector: SEL_POOL_OF, kind: 'addr' },
  { name: 'RobinFun', factory: '0xd861cb5dc71a0171e8f0f6586cadb069f3a35e4d', selector: SEL_CURVES, kind: 'nonzero' },
  { name: 'Bottom.fun', factory: '0x1bed2687321074a198302c004036b51923812b18', selector: SEL_LAUNCHES, kind: 'launches' },
  { name: 'Klik', factory: '0x16cF6788B762EE8969744586eD16fc5705140dd7', selector: SEL_TOKEN_INFO, kind: 'info' },
  { name: 'Long.xyz', factory: '0x22e99278308b393ea1260859b181ad7e78f5eeed', selector: SEL_ASSET_DATA, kind: 'nonzero' },
  { name: 'Bow.fun', factory: '0xc70e510e14710ea535cab7b2414860af63feab79', selector: SEL_DEPLOYER_OF, kind: 'addr' },
].filter((row) => Boolean(row.selector));

function norm(addr: string): string {
  return (addr || '').trim().toLowerCase();
}

function padAddr(addr: string): string {
  return norm(addr).replace(/^0x/, '').padStart(64, '0');
}

function wordAddr(word: string): string | null {
  if (!word) return null;
  try {
    if (BigInt(`0x${word}`) === 0n) return null;
  } catch {
    return null;
  }
  return `0x${word.slice(-40).toLowerCase()}`;
}

export function decodeAddr(data: string | null | undefined): string | null {
  if (!data || data === '0x' || data === '0x0' || data.length < 66) return null;
  return wordAddr(data.slice(2, 66));
}

export function wordsOf(data: string | null | undefined): string[] {
  if (!data || data === '0x') return [];
  const raw = data.startsWith('0x') ? data.slice(2) : data;
  const out: string[] = [];
  for (let i = 0; i + 64 <= raw.length; i += 64) out.push(raw.slice(i, i + 64));
  return out;
}

export function callData(sel: string, addr?: string): string {
  return addr === undefined ? `0x${sel}` : `0x${sel}${padAddr(addr)}`;
}

export function existsGetLaunched(token: string, data: string | null | undefined): boolean {
  const words = wordsOf(data);
  if (words.length === 0) return false;
  const first = wordAddr(words[0]);
  if (first === norm(token)) return true;
  if (words.length >= 12 && first === null) return false;
  if (words.length >= 12 && BigInt(`0x${words[11]}`) === 1n && first === norm(token)) return true;
  return false;
}

function collectHexAddrs(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const value of node) collectHexAddrs(value, into);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectHexAddrs(value, into);
    return;
  }
  if (typeof node === 'string' && node.startsWith('0x') && node.length >= 42) {
    into.add(node.toLowerCase().slice(0, 42));
  }
}

export class RhLaunchpadAdapter {
  private static hits = new Map<string, { origin: RhLaunchpadOrigin; at: number }>();
  private static misses = new Map<string, number>();
  private static stonk: { at: number; addrs: Set<string> } | null = null;

  public static resetCache(): void {
    RhLaunchpadAdapter.hits.clear();
    RhLaunchpadAdapter.misses.clear();
    RhLaunchpadAdapter.stonk = null;
  }

  private rpcUrl(): string {
    return getEnvString('EVM_ROBINHOOD_RPC_URL') || getEnvString('EVM_RPC_URL') || DEFAULT_RPC;
  }

  private async rpcBatch(calls: Array<[string, string]>): Promise<Array<string | null>> {
    if (calls.length === 0) return [];
    try {
      const payload = calls.map(([to, data], i) => ({
        jsonrpc: '2.0',
        id: i,
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
      }));
      const res = await fetch(this.rpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'noraz/1.0' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return calls.map(() => null);
      const body = await res.json();
      if (!Array.isArray(body)) return calls.map(() => null);
      const byId = new Map<number, any>();
      for (const row of body) {
        if (row && typeof row === 'object') byId.set(Number(row.id), row);
      }
      return calls.map((_, i) => {
        const row = byId.get(i) || {};
        if (row.error) return null;
        return typeof row.result === 'string' ? row.result : null;
      });
    } catch (err: any) {
      console.warn(`[RH LAUNCHPAD] RPC batch failed: ${err?.message || err}`);
      return calls.map(() => null);
    }
  }

  private async ponsHttp(token: string): Promise<string | null> {
    try {
      const res = await fetch(PONS_TOKEN.replace('{token}', token), { headers: { 'User-Agent': 'noraz/1.0' } });
      if (!res.ok) return null;
      const payload: any = await res.json();
      if (!payload || typeof payload !== 'object' || payload.error) return null;
      if (payload.token || payload.factory || payload.symbol) return 'Pons';
      return null;
    } catch {
      return null;
    }
  }

  private async stonkAddrs(): Promise<Set<string>> {
    const now = Date.now();
    if (RhLaunchpadAdapter.stonk && now - RhLaunchpadAdapter.stonk.at < STONK_TTL_MS) {
      return RhLaunchpadAdapter.stonk.addrs;
    }
    const addrs = new Set<string>();
    try {
      const res = await fetch(STONK_FLOOR, { headers: { 'User-Agent': 'noraz/1.0' } });
      if (res.ok) {
        const payload: any = await res.json();
        const rows = payload?.rows ?? payload;
        if (Array.isArray(rows)) collectHexAddrs(rows, addrs);
      }
    } catch {
      if (RhLaunchpadAdapter.stonk) return RhLaunchpadAdapter.stonk.addrs;
    }
    RhLaunchpadAdapter.stonk = { at: now, addrs };
    return addrs;
  }

  public async lookup(address: string): Promise<RhLaunchpadOrigin | null> {
    try {
      return await this.lookupSafe(address);
    } catch (err: any) {
      console.warn(`[RH LAUNCHPAD] lookup failed: ${err?.message || err}`);
      return null;
    }
  }

  public async originName(address: string): Promise<string | null> {
    const hit = await this.lookup(address);
    return hit?.name ?? null;
  }

  private async lookupSafe(address: string): Promise<RhLaunchpadOrigin | null> {
    const token = norm(address);
    if (!token.startsWith('0x') || token.length !== 42) return null;
    const hit = RhLaunchpadAdapter.hits.get(token);
    if (hit && Date.now() - hit.at < HIT_TTL_MS) return hit.origin;
    const missed = RhLaunchpadAdapter.misses.get(token);
    if (missed && Date.now() - missed < MISS_TTL_MS) return null;

    const origin = await this.lookupUncached(token);
    if (origin) {
      RhLaunchpadAdapter.hits.set(token, { origin, at: Date.now() });
      RhLaunchpadAdapter.misses.delete(token);
      return origin;
    }
    RhLaunchpadAdapter.misses.set(token, Date.now());
    return null;
  }

  private remember(name: string): RhLaunchpadOrigin {
    return { name, graduated: null };
  }

  private async lookupUncached(token: string): Promise<RhLaunchpadOrigin | null> {
    const pons = await this.ponsHttp(token);
    if (pons) return this.remember(pons);

    const owned = await this.rpcBatch([
      [token, callData(SEL_LAUNCH_FACTORY)],
      [token, callData(SEL_FACTORY)],
      [token, callData(SEL_HOOK)],
    ]);
    for (const raw of owned) {
      const pointed = decodeAddr(raw);
      if (pointed && FACTORY_PAD[pointed]) return this.remember(FACTORY_PAD[pointed]);
    }

    const calls: Array<[string, string]> = [];
    for (const factory of GET_LAUNCHED_FACTORIES) {
      calls.push([factory, callData(SEL_GET_LAUNCHED, token)]);
    }
    const specials = SPECIALS.filter((s) => s.selector);
    for (const row of specials) {
      calls.push([row.factory, callData(row.selector, token)]);
    }

    const results = await this.rpcBatch(calls);
    if (results.length === 0) {
      if ((await this.stonkAddrs()).has(token)) return this.remember('StonkBrokers');
      return null;
    }

    for (let i = 0; i < GET_LAUNCHED_FACTORIES.length; i++) {
      if (existsGetLaunched(token, results[i])) {
        const name = FACTORY_PAD[norm(GET_LAUNCHED_FACTORIES[i])];
        if (name) return this.remember(name);
      }
    }

    const offset = GET_LAUNCHED_FACTORIES.length;
    for (let i = 0; i < specials.length; i++) {
      const data = results[offset + i];
      const words = wordsOf(data);
      const { name, kind } = specials[i];
      if (kind === 'bool') {
        if (data && data !== '0x' && data !== '0x0') {
          try {
            if (BigInt(data) === 1n) return this.remember(name);
          } catch { /* ignore */ }
        }
      } else if (kind === 'addr') {
        if (decodeAddr(data)) return this.remember(name);
      } else if (kind === 'launches' || kind === 'info') {
        const first = words[0] ? wordAddr(words[0]) : null;
        if (first === token) return this.remember(name);
      } else if (kind === 'nonzero') {
        if (words.slice(0, 4).some((w) => {
          try { return BigInt(`0x${w}`) !== 0n; } catch { return false; }
        })) return this.remember(name);
      }
    }

    if ((await this.stonkAddrs()).has(token)) return this.remember('StonkBrokers');
    return null;
  }
}
