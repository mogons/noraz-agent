export function isDryRun(): boolean {
  return process.env.DRY_RUN !== 'false';
}

export function getEnvString(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

export function getApiKey(name: string): string | undefined {
  return getEnvString(name);
}
