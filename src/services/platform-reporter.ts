import { randomUUID } from 'node:crypto';

const DEFAULT_PLATFORM_URL = 'https://api.noraz.space';

export type ActivityType = 'signal' | 'trade_open' | 'trade_close';

export interface AgentActivityEvent {
  id: string;
  type: ActivityType;
  at: string;
  domain: string;
  symbol: string;
  confidence?: number;
  contractAddress?: string;
  positionSizeUsd?: number;
  pnlUsd?: number;
  positionPnlUsd?: number;
  side?: 'buy' | 'sell';
  thesis?: string;
  txUrl?: string;
  status?: string;
  summary?: string;
  feeTxHash?: string;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Pushes posted signals and trade journal results to the platform as they happen.
 * Auth is the operator's desk key (NORAZ_DESK_KEY). Missing key means local-only.
 */
export class PlatformReporter {
  private readonly url: string;
  private readonly deskKey: string;
  private readonly fetchImpl: FetchLike;
  private warned = false;

  constructor(opts?: { url?: string; deskKey?: string; fetchImpl?: FetchLike }) {
    this.url = (opts?.url ?? process.env.NORAZ_PLATFORM_URL ?? DEFAULT_PLATFORM_URL).replace(/\/$/, '');
    this.deskKey = (opts?.deskKey ?? process.env.NORAZ_DESK_KEY ?? '').trim();
    this.fetchImpl = opts?.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  public enabled(): boolean {
    return this.deskKey.length > 0;
  }

  public report(partial: Omit<AgentActivityEvent, 'id' | 'at'> & { id?: string; at?: string }): void {
    if (!this.enabled()) {
      if (!this.warned) {
        this.warned = true;
        console.log('[PLATFORM] NORAZ_DESK_KEY is unset — agent results stay on this machine.');
      }
      return;
    }
    const event: AgentActivityEvent = {
      ...partial,
      id: partial.id || randomUUID(),
      at: partial.at || new Date().toISOString(),
    };
    void this.send(event);
  }

  private async send(event: AgentActivityEvent): Promise<void> {
    try {
      const res = await this.fetchImpl(`${this.url}/platform/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.deskKey}`,
        },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(`[PLATFORM] Activity ${event.type} ${event.symbol} rejected (${res.status}). ${detail.slice(0, 180)}`);
        return;
      }
      console.log(`[PLATFORM] Reported ${event.type} ${event.symbol} (${event.domain}).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[PLATFORM] Activity ${event.type} ${event.symbol} failed: ${message}`);
    }
  }
}

export const platformReporter = new PlatformReporter();
