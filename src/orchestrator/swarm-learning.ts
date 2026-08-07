import fs from 'fs';
import path from 'path';

export interface SignalOutcome {
  id: string;
  agentId: string;
  symbol: string;
  contractAddress: string;
  initialPriceUsd: number;
  maxPriceReachedUsd: number;
  lowestPriceReachedUsd: number;
  result: 'TAKE_PROFIT_2X' | 'TAKE_PROFIT_1_5X' | 'STOP_LOSS' | 'OPEN';
  confidenceScore: number;
  timestampIso: string;
}

export interface SwarmWeights {
  smartMoneyWeight: number; // default 0.35
  liquidityWeight: number;  // default 0.25
  devHoldingWeight: number; // default 0.20
  twitterWeight: number;    // default 0.20
}

export class SwarmLearningEngine {
  private dbPath: string;
  private outcomes: SignalOutcome[] = [];
  private weights: SwarmWeights = {
    smartMoneyWeight: 0.35,
    liquidityWeight: 0.25,
    devHoldingWeight: 0.20,
    twitterWeight: 0.20,
  };

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'database', 'swarm_learning.json');
    this.ensureDatabaseFile();
    this.loadState();
  }

  private ensureDatabaseFile(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify({ outcomes: [], weights: this.weights }, null, 2), 'utf-8');
    }
  }

  private loadState(): void {
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.outcomes = parsed.outcomes || [];
      if (parsed.weights) {
        this.weights = parsed.weights;
      }
      console.log(`[SWARM LEARNING] Loaded ${this.outcomes.length} signal outcome records.`);
    } catch (err: any) {
      console.warn(`[SWARM LEARNING WARNING] Failed loading learning state: ${err.message}`);
    }
  }

  private saveState(): void {
    try {
      fs.writeFileSync(
        this.dbPath,
        JSON.stringify({ outcomes: this.outcomes, weights: this.weights }, null, 2),
        'utf-8'
      );
    } catch (err: any) {
      console.error(`[SWARM LEARNING ERROR] Failed saving learning state: ${err.message}`);
    }
  }

  public recordSignalCall(agentId: string, symbol: string, contractAddress: string, initialPriceUsd: number, confidenceScore: number): SignalOutcome {
    const outcome: SignalOutcome = {
      id: `CALL_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      agentId,
      symbol,
      contractAddress,
      initialPriceUsd,
      maxPriceReachedUsd: initialPriceUsd,
      lowestPriceReachedUsd: initialPriceUsd,
      result: 'OPEN',
      confidenceScore,
      timestampIso: new Date().toISOString(),
    };

    this.outcomes.unshift(outcome);
    this.saveState();
    return outcome;
  }

  public updateSignalPrice(id: string, currentPriceUsd: number): void {
    const item = this.outcomes.find(o => o.id === id);
    if (!item) return;

    if (currentPriceUsd > item.maxPriceReachedUsd) {
      item.maxPriceReachedUsd = currentPriceUsd;
    }
    if (currentPriceUsd < item.lowestPriceReachedUsd) {
      item.lowestPriceReachedUsd = currentPriceUsd;
    }

    const gainRatio = item.maxPriceReachedUsd / item.initialPriceUsd;
    const lossRatio = item.lowestPriceReachedUsd / item.initialPriceUsd;

    if (gainRatio >= 2.0) {
      item.result = 'TAKE_PROFIT_2X';
      this.recalibrateWeights(true);
    } else if (gainRatio >= 1.5) {
      item.result = 'TAKE_PROFIT_1_5X';
      this.recalibrateWeights(true);
    } else if (lossRatio <= 0.8) {
      item.result = 'STOP_LOSS';
      this.recalibrateWeights(false);
    }

    this.saveState();
  }

  private recalibrateWeights(isSuccess: boolean): void {
    if (isSuccess) {
      // Reward smart money and liquidity weights
      this.weights.smartMoneyWeight = Math.min(0.50, this.weights.smartMoneyWeight + 0.01);
      this.weights.liquidityWeight = Math.min(0.35, this.weights.liquidityWeight + 0.01);
    } else {
      // Penalize and increase dev holding strictness
      this.weights.devHoldingWeight = Math.min(0.40, this.weights.devHoldingWeight + 0.01);
    }
  }

  public getWeights(): SwarmWeights {
    return { ...this.weights };
  }

  public getWinRatePercentage(): number {
    const closed = this.outcomes.filter(o => o.result !== 'OPEN');
    if (closed.length === 0) return 100;

    const wins = closed.filter(o => o.result.startsWith('TAKE_PROFIT')).length;
    return Math.round((wins / closed.length) * 100);
  }
}

/**
 * Process-wide singleton — wired into index.ts (recordSignalCall per posted call)
 * and consumed by position tracking for outcome-driven weight recalibration.
 */
export const globalSwarmLearning = new SwarmLearningEngine();
