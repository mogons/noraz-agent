/**
 * Type declarations for scripts/update-core.mjs (single source of truth for
 * self-update: `opencat update` CLI + Discord `/update`).
 */
export interface UpdateStepLog {
  label: string;
  command: string;
  ok: boolean;
}

export interface OpenCatUpdateResult {
  ok: boolean;
  restartOk: boolean;
  log: UpdateStepLog[];
}

export type AthenaUpdateResult = OpenCatUpdateResult;

export declare function runOpenCatUpdate(opts?: { noRestart?: boolean; cwd?: string }): Promise<OpenCatUpdateResult>;
export declare function runAthenaUpdate(opts?: { noRestart?: boolean; cwd?: string }): Promise<AthenaUpdateResult>;
