export interface ApiKeyPool {
  readonly baseVar: string;
  readonly keys: string[];
  readonly size: number;
  get(): string | undefined;
  markFailed(reason: string): string | undefined;
  reset(): void;
}

const PLACEHOLDER_RE = /YOUR_|placeholder|mock/i;

export function createApiKeyPool(baseVar: string, keys: string[]): ApiKeyPool {
  const clean = keys.map((k) => k.trim()).filter((k) => k && !PLACEHOLDER_RE.test(k));
  let index = 0;
  let failed = new Set<number>();

  return {
    baseVar,
    keys: clean,
    size: clean.length,
    get(): string | undefined {
      return clean[index] ?? undefined;
    },
    markFailed(reason: string): string | undefined {
      if (clean.length <= 1) return clean[0] ?? undefined;
      failed.add(index);
      if (failed.size >= clean.length) {
        failed = new Set();
        console.warn(`[API KEY POOL] ${baseVar}: all keys failed — rotation reset.`);
      }
      let next = index;
      do {
        next = (next + 1) % clean.length;
      } while (failed.has(next) && failed.size < clean.length);
      index = next;
      console.warn(`[API KEY POOL] ${baseVar}: rotating to key #${index + 1}/${clean.length} (${reason}).`);
      return clean[index] ?? undefined;
    },
    reset(): void {
      failed = new Set();
    },
  };
}

export function loadApiKeyPool(baseVar: string): ApiKeyPool {
  const primary = process.env[baseVar] || '';
  const backups = process.env[`${baseVar}_BACKUP_KEYS`] || process.env[`${baseVar.replace(/_API_KEY$/, '')}_BACKUP_KEYS`] || '';
  return createApiKeyPool(baseVar, [primary, ...backups.split(',')]);
}
