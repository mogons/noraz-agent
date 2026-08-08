/**
 * Type declarations for scripts/update-core.mjs (single source of truth for
 * self-update: `athena update` CLI + Discord `/update`).
 */
export interface UpdateStepLog {
  label: string;
  command: string;
  ok: boolean;
}

export interface AthenaUpdateResult {
  ok: boolean;
  restartOk: boolean;
  log: UpdateStepLog[];
}

export declare function runAthenaUpdate(opts?: { noRestart?: boolean; cwd?: string }): AthenaUpdateResult;
