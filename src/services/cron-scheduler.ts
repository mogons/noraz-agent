import fs from 'fs';
import path from 'path';
import type { OpenCatzHub, OpenCatHub } from '../orchestrator/hub.js';

export interface ScheduledTask {
  id: string;
  expressionOrInterval: string; // e.g. "every 4 hours", "every 30 mins", "0 9 * * *"
  intervalMs: number;
  action: 'screening' | 'portfolio_recap' | 'custom_prompt';
  agentId?: string;
  targetChannelId?: string;
  createdAtIso: string;
  lastRunIso?: string;
  enabled: boolean;
}

export type CronSchedule = ScheduledTask;

export class CronSchedulerService {
  private dbPath: string;
  private tasks: Map<string, ScheduledTask> = new Map();
  private timerIds: Map<string, NodeJS.Timeout> = new Map();
  private hub?: OpenCatzHub;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'database', 'schedules.json');
    this.ensureDatabaseFile();
    this.loadSchedules();
  }

  /**
   * Attach orchestrator hub instance to trigger agent screening passes
   */
  public attachHub(hub: OpenCatzHub): void {
    this.hub = hub;
  }

  private ensureDatabaseFile(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private loadSchedules(): void {
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf-8');
      const list: ScheduledTask[] = JSON.parse(raw);
      for (const t of list) {
        this.tasks.set(t.id, t);
        if (t.enabled) {
          this.startTaskTimer(t);
        }
      }
      console.log(`[CRON SCHEDULER] Loaded ${this.tasks.size} active automation schedules from storage.`);
    } catch (err: any) {
      console.warn(`[CRON SCHEDULER WARNING] Failed loading schedules: ${err.message}`);
    }
  }

  private saveSchedules(): void {
    try {
      const list = Array.from(this.tasks.values());
      fs.writeFileSync(this.dbPath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err: any) {
      console.error(`[CRON SCHEDULER ERROR] Failed saving schedules: ${err.message}`);
    }
  }

  public parseNaturalLanguageInterval(expression: string): number {
    const lower = expression.toLowerCase().trim();

    // Cron-style "0 9 * * *" (minute hour day month weekday) — support hour/minute of day.
    const cronMatch = lower.match(/^(\d{1,2})\s+(\d{1,2})\s+(\*|\d{1,2})\s+(\*|\d{1,2})\s+(\*|\d{1,2})$/);
    if (cronMatch) {
      const minute = parseInt(cronMatch[1], 10);
      const hour = parseInt(cronMatch[2], 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        // Daily at the given time: ms until next occurrence (24h cadence).
        const now = new Date();
        const next = new Date(now);
        next.setHours(hour, minute, 0, 0);
        if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
        return next.getTime() - now.getTime();
      }
    }

    if (lower.includes('min') || lower.includes('menit')) {
      const match = lower.match(/\d+/);
      const mins = match ? parseInt(match[0], 10) : 30;
      return mins * 60 * 1000;
    }
    if (lower.includes('hour') || lower.includes('jam')) {
      const match = lower.match(/\d+/);
      const hours = match ? parseInt(match[0], 10) : 1;
      return hours * 60 * 60 * 1000;
    }
    if (lower.includes('day') || lower.includes('hari') || lower.includes('daily')) {
      return 24 * 60 * 60 * 1000;
    }
    return 60 * 60 * 1000; // Default 1 hour
  }

  public addSchedule(
    expressionOrInterval: string,
    action: 'screening' | 'portfolio_recap' | 'custom_prompt',
    agentId?: string,
    targetChannelId?: string
  ): ScheduledTask {
    const intervalMs = this.parseNaturalLanguageInterval(expressionOrInterval);
    const task: ScheduledTask = {
      id: `CRON_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      expressionOrInterval,
      intervalMs,
      action,
      agentId: agentId || 'meme-robinhood',
      targetChannelId,
      createdAtIso: new Date().toISOString(),
      enabled: true,
    };

    this.tasks.set(task.id, task);
    this.saveSchedules();
    this.startTaskTimer(task);

    console.log(`[CRON SCHEDULER] Registered schedule: "${expressionOrInterval}" (${task.action} -> ${task.agentId})`);
    return task;
  }

  private startTaskTimer(task: ScheduledTask): void {
    if (this.timerIds.has(task.id)) {
      clearInterval(this.timerIds.get(task.id)!);
    }

    const timer = setInterval(async () => {
      console.log(`⏰ [CRON SCHEDULER] Triggering scheduled automation task: ${task.id} (${task.action})`);
      task.lastRunIso = new Date().toISOString();
      this.saveSchedules();

      if (this.hub && task.action === 'screening' && task.agentId) {
        await this.hub.triggerAgentPass(task.agentId);
      }
    }, task.intervalMs);

    this.timerIds.set(task.id, timer);
  }

  public removeSchedule(id: string): boolean {
    if (this.timerIds.has(id)) {
      clearInterval(this.timerIds.get(id)!);
      this.timerIds.delete(id);
    }
    const existed = this.tasks.delete(id);
    if (existed) {
      this.saveSchedules();
    }
    return existed;
  }

  public getAllSchedules(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }
}

/**
 * Process-wide singleton — prevents duplicate timers when tools/agents create
 * CronSchedulerService instances per call (duplicate timers were firing
 * the same task multiple times).
 */
export const globalCronScheduler = new CronSchedulerService();
