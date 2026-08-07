export interface DispatchedSignal {
  channelName: string;
  payload: any;
  rawReason: string;
}

export interface NormalizedReport {
  passed: boolean;
  signal: any;
  reason: string;
}

export interface DispatchDomainOptions {
  domain: string;
  channelName: string;
  isActive: () => boolean;
  runPass: () => Promise<NormalizedReport[]>;
  keyReady: () => { ready: boolean; statusMessage: string };
  buildPayload?: (entry: { signal: any; reason: string }) => any;
  onHalt?: (domain: string, statusMessage: string) => void;
}

export async function dispatchDomain(opts: DispatchDomainOptions): Promise<DispatchedSignal[]> {
  if (!opts.isActive()) return [];
  const keyCheck = opts.keyReady();
  if (!keyCheck.ready) {
    console.warn(keyCheck.statusMessage);
    if (opts.onHalt) {
      try { opts.onHalt(opts.domain, keyCheck.statusMessage); } catch (e: any) {
        console.warn(`[DISPATCH] onHalt notification failed for ${opts.domain}: ${e.message}`);
      }
    }
    return [];
  }
  const reports = await opts.runPass();
  const out: DispatchedSignal[] = [];
  for (const r of reports) {
    if (r.passed && r.signal) {
      out.push({
        channelName: opts.channelName,
        rawReason: r.reason || '',
        payload: opts.buildPayload
          ? opts.buildPayload({ signal: r.signal, reason: r.reason || '' })
          : (r as any).payload || {},
      });
    }
  }
  return out;
}
