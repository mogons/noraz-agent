export type ExecutionMode = 'AUTO_EXECUTE' | 'DRY_RUN' | 'SIGNAL_ONLY';

export function getExecutionMode(): ExecutionMode {
  const mode = process.env.EXECUTION_MODE?.toUpperCase();
  if (mode === 'AUTO_EXECUTE') return 'AUTO_EXECUTE';
  if (mode === 'SIGNAL_ONLY') return 'SIGNAL_ONLY';
  // Default mode is DRY_RUN (also fallback if process.env.DRY_RUN === 'false' legacy flag set)
  if (process.env.DRY_RUN === 'false' && mode !== 'SIGNAL_ONLY') return 'AUTO_EXECUTE';
  return 'DRY_RUN';
}

export function isDryRun(): boolean {
  const mode = getExecutionMode();
  return mode === 'DRY_RUN' || mode === 'SIGNAL_ONLY';
}

export function isSignalOnly(): boolean {
  return getExecutionMode() === 'SIGNAL_ONLY';
}

export function isAutoExecute(): boolean {
  return getExecutionMode() === 'AUTO_EXECUTE';
}

export function getEnvString(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

export function getApiKey(name: string): string | undefined {
  return getEnvString(name);
}

