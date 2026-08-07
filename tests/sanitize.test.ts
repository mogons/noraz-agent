import { describe, it, expect } from 'vitest';
import { sanitizeEmbedField, encodeSymbolForUrl } from '../src/discord/embeds/call-embed.js';

describe('sanitizeEmbedField (prompt-injection defense)', () => {
  it('strips markdown link syntax from token names', () => {
    const evil = '[free SOL](https://evil.example)';
    const out = sanitizeEmbedField(evil);
    expect(out).not.toContain('[');
    expect(out).not.toContain(']');
    expect(out).not.toContain('(https');
    expect(out).not.toContain('https://');
  });

  it('strips code blocks, bold/italic, and pipes', () => {
    expect(sanitizeEmbedField('`code` **bold** _it_ | x')).toBe('code bold it x');
  });

  it('collapses newlines', () => {
    expect(sanitizeEmbedField('line1\nline2\tline3')).toBe('line1 line2 line3');
  });

  it('strips raw URLs (link injection)', () => {
    expect(sanitizeEmbedField('see https://evil.example/x')).toContain('LINK');
    expect(sanitizeEmbedField('see https://evil.example/x')).not.toContain('https://evil');
  });

  it('truncates long fields', () => {
    expect(sanitizeEmbedField('a'.repeat(500), 100).length).toBeLessThanOrEqual(101);
  });

  it('returns empty for null/undefined', () => {
    expect(sanitizeEmbedField(null)).toBe('');
    expect(sanitizeEmbedField(undefined)).toBe('');
  });

  it('encodeSymbolForUrl produces a safe query component', () => {
    expect(encodeSymbolForUrl('ABC()[]')).toBe('ABC');
    expect(encodeSymbolForUrl('DOGE')).toBe('DOGE');
    expect(encodeSymbolForUrl('a b&c')).toBe('a%20b%26c');
  });
});
