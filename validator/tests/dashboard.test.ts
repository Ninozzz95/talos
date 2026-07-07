import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('dashboard benchmark lab', () => {
  const html = readFileSync(resolve(__dirname, '../src/dashboard.html'), 'utf8');

  it('uses the deterministic comparison endpoint instead of the legacy two-mode benchmark endpoint', () => {
    expect(html).toContain('/benchmark/compare');
    expect(html).not.toContain("fetch('/benchmark',");
  });

  it('renders AVM ON, AVM OFF Direct, and Tool Agent comparison modes', () => {
    expect(html).toContain('AVM ON');
    expect(html).toContain('AVM OFF Direct');
    expect(html).toContain('Tool Agent');
  });
});
