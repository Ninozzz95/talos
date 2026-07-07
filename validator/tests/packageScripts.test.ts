import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('package scripts', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

  it('runs Vitest through the local Node executable entrypoint', () => {
    expect(pkg.scripts.test).toBe('node ./node_modules/vitest/vitest.mjs run');
  });

  it('runs TypeScript through the local Node executable entrypoint', () => {
    expect(pkg.scripts.build).toBe('node ./node_modules/typescript/bin/tsc --pretty false');
  });
});

