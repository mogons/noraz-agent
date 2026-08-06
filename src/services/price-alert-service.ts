import { PriceFeedService } from './price-feed-service.js';
import { StateStore } from './state-store.js';

export interface PriceAlert {
  id: string;
  userId: string;
  symbol: string; // e.g. "BTC", "ETH", "SOL", "HYPE"
  targetPriceUsd: number;
  direction: 'ABOVE' | 'BELOW';
  channelId?: string;
  createdTime: number;
  triggered: boolean;
  lastTriggeredPriceUsd?: number;
}

export class PriceAlertService {
  private alerts: Map<string, PriceAlert> = new Map();
  private stateStore: StateStore | null = null;

  /**
   * Attach persistent StateStore. Loads existing alerts from disk.
   */
  public attachStateStore(store: StateStore): void {
    this.stateStore = store;

    // Restore alerts from persistent storage
    for (const alert of store.getAllAlerts()) {
      this.alerts.set(alert.id, alert);
    }

    const activeCount = Array.from(this.alerts.values()).filter(a => !a.triggered).length;
    if (activeCount > 0) {
      console.log(`[PRICE ALERT SERVICE] Restored ${activeCount} active price alerts from persistent state.`);
    }
  }

  /**
   * Add a new price alert
   */
  public addAlert(alertInput: Omit<PriceAlert, 'id' | 'createdTime' | 'triggered'>): PriceAlert {
    const id = `ALERT_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const alert: PriceAlert = {
      ...alertInput,
      id,
      symbol: alertInput.symbol.toUpperCase().trim(),
      createdTime: Date.now(),
      triggered: false,
    };
    this.alerts.set(id, alert);
    this.stateStore?.setAlert(alert);
    console.log(`[PRICE ALERT SERVICE] Registered alert: ${alert.symbol} ${alert.direction} $${alert.targetPriceUsd} (ID: ${id})`);
    return alert;
  }

  /**
   * Remove/cancel an existing price alert
   */
  public removeAlert(id: string): boolean {
    const removed = this.alerts.delete(id);
    if (removed) this.stateStore?.removeAlert(id);
    return removed;
  }

  /**
   * List active non-triggered price alerts for a user or overall
   */
  public listAlerts(userId?: string): PriceAlert[] {
    const all = Array.from(this.alerts.values()).filter(a => !a.triggered);
    if (userId) {
      return all.filter(a => a.userId === userId);
    }
    return all;
  }

  /**
   * Parse natural language text into a price alert payload
   * Examples:
   * - "Athena, kabari kalau BTC 70k" -> symbol: BTC, target: 70000, ABOVE
   * - "alert me if ETH drops below 1500" -> symbol: ETH, target: 1500, BELOW
   * - "notify when SOL hits 100" -> symbol: SOL, target: 100, ABOVE
   */
  public parseNaturalLanguageAlert(text: string, userId: string, channelId?: string): PriceAlert | null {
    const lower = text.toLowerCase();
    
    // Check if message is requesting a price alert trigger
    const isAlertIntent = lower.includes('kabari') || lower.includes('alert') || lower.includes('notify') || lower.includes('ingatkan') || lower.includes('kasih tau');
    if (!isAlertIntent) return null;

    // Detect crypto symbol
    const knownSymbols = ['BTC', 'ETH', 'SOL', 'HYPE', 'BONK', 'PEPE', 'WIF', 'DOGE', 'AVAX', 'SUI', 'LINK'];
    let matchedSymbol = knownSymbols.find(s => lower.includes(s.toLowerCase()));

    if (!matchedSymbol) {
      if (lower.includes('bitcoin')) matchedSymbol = 'BTC';
      else if (lower.includes('ethereum')) matchedSymbol = 'ETH';
      else if (lower.includes('solana')) matchedSymbol = 'SOL';
    }

    if (!matchedSymbol) return null;

    // Match price pattern (e.g. 70k, $70,000, 70000, 70.5k, 1500)
    const kRegex = /(\$?\d+(\.\d+)?)\s*k\b/i;

    let targetPriceUsd = 0;
    if (kRegex.test(lower)) {
      const match = lower.match(kRegex);
      if (match) {
        const valStr = match[1].replace('$', '');
        targetPriceUsd = parseFloat(valStr) * 1000;
      }
    } else {
      const numbers = lower.match(/\b\d+(\.\d+)?\b/g);
      if (numbers && numbers.length > 0) {
        // Pick largest number if multiple (e.g. "BTC 70000")
        targetPriceUsd = Math.max(...numbers.map(n => parseFloat(n)));
      }
    }

    if (!targetPriceUsd || targetPriceUsd <= 0) return null;

    const direction: 'ABOVE' | 'BELOW' = lower.includes('drop') || lower.includes('turun') || lower.includes('below') || lower.includes('bawah') ? 'BELOW' : 'ABOVE';

    return this.addAlert({
      userId,
      symbol: matchedSymbol,
      targetPriceUsd,
      direction,
      channelId,
    });
  }

  /**
   * Check all active alerts against current prices
   */
  public async checkAlerts(priceFeedService: PriceFeedService): Promise<PriceAlert[]> {
    const activeAlerts = Array.from(this.alerts.values()).filter(a => !a.triggered);
    const triggeredAlerts: PriceAlert[] = [];

    for (const alert of activeAlerts) {
      try {
        const currentPrice = await priceFeedService.getPrice(alert.symbol);
        let isTriggered = false;

        if (alert.direction === 'ABOVE' && currentPrice >= alert.targetPriceUsd) {
          isTriggered = true;
        } else if (alert.direction === 'BELOW' && currentPrice <= alert.targetPriceUsd) {
          isTriggered = true;
        }

        if (isTriggered) {
          alert.triggered = true;
          alert.lastTriggeredPriceUsd = currentPrice;
          this.stateStore?.setAlert(alert); // Persist triggered state
          triggeredAlerts.push(alert);
          console.log(`[PRICE ALERT TRIGGERED] ${alert.symbol} hit target $${alert.targetPriceUsd} (Current: $${currentPrice})!`);
        }
      } catch (err: any) {
        console.error(`[PRICE ALERT ERROR] Failed to check price for ${alert.symbol}:`, err.message);
      }
    }

    return triggeredAlerts;
  }
}
