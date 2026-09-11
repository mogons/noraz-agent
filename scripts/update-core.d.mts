/**
 * Type declarations for scripts/update-core.mjs (single source of truth for
 * self-update: `noraz update` CLI + Discord `/update`).
 */
export interface UpdateStepLog {
  label: string;
  command: string;
  ok: boolean;
}

export interface NorazUpdateResult {
  ok: boolean;
  restartOk: boolean;
  log: UpdateStepLog[];
}


export declare function runNorazUpdate(opts?: { noRestart?: boolean; cwd?: string }): Promise<NorazUpdateResult>;
export declare function runUpdate(opts?: { noRestart?: boolean; cwd?: string }): Promise<NorazUpdateResult>;

