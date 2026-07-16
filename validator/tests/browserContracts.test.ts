import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BrowserActionSchema,
  BrowserContractSchemasByVersion,
  BrowserEvidenceBundleSchema,
  BrowserTaskSchema,
  parseBrowserContract,
  verifyBrowserEvidenceAgainstAction,
} from '../src/schemas/browserContracts.js';

const fixtureRoot = fileURLToPath(new URL('../../core/tests/Fixtures/browser/v1/', import.meta.url));

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(`${fixtureRoot}/${path}.json`, 'utf8')) as unknown;
}

describe('canonical Browser v1 contracts', () => {
  it('parses every shared valid fixture through its schema version', () => {
    for (const name of [
      'browser-task',
      'browser-action-intent',
      'browser-action',
      'browser-artifact-reference',
      'browser-evidence-bundle',
      'browser-checkpoint',
      'browser-capability-manifest',
      'browser-session-lease',
    ]) {
      const value = fixture(`valid/${name}`) as { schema_version: string };
      expect(BrowserContractSchemasByVersion[value.schema_version], name).toBeDefined();
      expect(parseBrowserContract(value), name).toEqual(value);
    }
  });

  it('rejects unknown versions, list roots, unknown fields and object/list coercion', () => {
    expect(() => parseBrowserContract(fixture('invalid/unknown-version'))).toThrow();
    expect(() => parseBrowserContract(fixture('invalid/list-instead-of-object'))).toThrow();
    expect(() => BrowserActionSchema.parse(fixture('invalid/unknown-action-field'))).toThrow();

    const action = fixture('valid/browser-action') as Record<string, unknown>;
    expect(() => BrowserActionSchema.parse({ ...action, arguments: [] })).toThrow();
    expect(() => BrowserActionSchema.parse({ ...action, preconditions: {} })).toThrow();
  });

  it('rejects evidence whose task or action identity does not match', () => {
    const action = BrowserActionSchema.parse(fixture('valid/browser-action'));
    const evidence = BrowserEvidenceBundleSchema.parse(fixture('invalid/mismatched-evidence'));
    expect(() => verifyBrowserEvidenceAgainstAction(evidence, action)).toThrow();
  });

  it('exports strict Draft 2020-12-compatible object schemas', () => {
    const taskJsonSchema = z.toJSONSchema(BrowserTaskSchema, { target: 'draft-2020-12' });
    expect(taskJsonSchema.type).toBe('object');
    expect(taskJsonSchema.additionalProperties).toBe(false);
    expect(taskJsonSchema.properties?.budget).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('accepts bounded optional domain and token budgets without breaking legacy fixtures', () => {
    const extendedTask = fixture('valid/browser-task') as Record<string, unknown>;
    const { max_domains: _domains, max_tokens: _tokens, ...legacyBudget } = extendedTask.budget as Record<string, unknown>;
    const legacyTask = { ...extendedTask, budget: legacyBudget };
    expect(BrowserTaskSchema.parse(legacyTask)).toEqual(legacyTask);

    const budget = {
      ...legacyBudget,
      max_domains: 8,
      max_tokens: 32_000,
    };
    expect(BrowserTaskSchema.parse({ ...legacyTask, budget })).toMatchObject({ budget });

    for (const invalidBudget of [
      { ...budget, max_domains: 0 },
      { ...budget, max_domains: 129 },
      { ...budget, max_tokens: 0 },
      { ...budget, max_tokens: 10_000_001 },
      { ...budget, max_unknown: 1 },
    ]) {
      expect(() => BrowserTaskSchema.parse({ ...legacyTask, budget: invalidBudget })).toThrow();
    }
  });
});
