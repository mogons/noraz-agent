/**
 * Type declarations for scripts/update-core.mjs (single source of truth for
 * self-update: `opencatz update` CLI + Discord `/update`).
 */
export interface UpdateStepLog {
  label: string;
  command: string;
  ok: boolean;
}

export interface OpenCatzUpdateResult {
  ok: boolean;
  restartOk: boolean;
  log: UpdateStepLog[];
}

export type OpenCatUpdateResult = OpenCatzUpdateResult;

export declare function runOpenCatzUpdate(opts?: { noRestart?: boolean; cwd?: string }): Promise<OpenCatzUpdateResult>;
export declare function runOpenCatUpdate(opts?: { noRestart?: boolean; cwd?: string }): Promise<OpenCatzUpdateResult>;
export declare function runUpdate(opts?: { noRestart?: boolean; cwd?: string }): Promise<OpenCatzUpdateResult>;

