import { describe, it, expect } from 'vitest';
import { validateMutations } from '../src/schemas/validate';

describe('validateMutations', () => {
  it('returns valid for a batch of correct mutations', () => {
    const result = validateMutations(
      [
        { action: 'SPAWN_NODE', node_id: 'n_1', node_type: 'HTTP_REQUEST' },
        { action: 'MUTATE_PAYLOAD', node_id: 'n_1', payload: { url: 'https://example.com' } },
        { action: 'YIELD_EXECUTION' },
      ],
      { n_1: 'HTTP_REQUEST' }
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects unknown action', () => {
    const result = validateMutations(
      [{ action: 'UNKNOWN' }],
      {}
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('rejects SPAWN_NODE with missing node_id', () => {
    const result = validateMutations(
      [{ action: 'SPAWN_NODE', node_type: 'HTTP_REQUEST' }],
      {}
    );
    expect(result.valid).toBe(false);
  });

  it('rejects MUTATE_PAYLOAD with missing node_id in context', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_missing', payload: { url: 'https://example.com' } }],
      {}
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].message).toContain('n_missing');
  });

  it('rejects MUTATE_PAYLOAD with wrong payload type (HTTP body on SQL node)', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_sql', payload: { url: 'https://example.com' } }],
      { n_sql: 'QUERY_DATABASE' }
    );
    expect(result.valid).toBe(false);
  });

  it('accepts MUTATE_PAYLOAD with correct context and valid payload', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_http', payload: { url: 'https://example.com' } }],
      { n_http: 'HTTP_REQUEST' }
    );
    expect(result.valid).toBe(true);
  });

  it('accepts SQL MUTATE_PAYLOAD with correct context', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_sql', payload: { query: 'SELECT 1' } }],
      { n_sql: 'QUERY_DATABASE' }
    );
    expect(result.valid).toBe(true);
  });

  it('rejects entire batch if one mutation fails (atomicity)', () => {
    const result = validateMutations(
      [
        { action: 'SPAWN_NODE', node_id: 'n_1', node_type: 'HTTP_REQUEST' },
        { action: 'MUTATE_PAYLOAD', node_id: 'n_bad', payload: { invalid: true } },
      ],
      {}
    );
    expect(result.valid).toBe(false);
  });

  it('returns errors in VALIDATION_FAULT format', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_1', payload: { url: 'not-a-url' } }],
      { n_1: 'HTTP_REQUEST' }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    for (const err of result.errors!) {
      expect(err).toHaveProperty('field');
      expect(err).toHaveProperty('expected');
      expect(err).toHaveProperty('received');
      expect(err).toHaveProperty('message');
      expect(typeof err.field).toBe('string');
      expect(typeof err.expected).toBe('string');
      expect(typeof err.received).toBe('string');
      expect(typeof err.message).toBe('string');
    }
  });

  it('accepts YIELD_EXECUTION without context', () => {
    const result = validateMutations(
      [{ action: 'YIELD_EXECUTION' }],
      {}
    );
    expect(result.valid).toBe(true);
  });

  it('rejects unknown node_type in context for MUTATE_PAYLOAD', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_1', payload: {} }],
      { n_1: 'UNKNOWN_TYPE' }
    );
    expect(result.valid).toBe(false);
  });

  it('accepts empty mutations array', () => {
    const result = validateMutations([], {});
    expect(result.valid).toBe(true);
  });

  it('rejects SPAWN_NODE node types outside the allowed registry list', () => {
    const result = validateMutations(
      [{ action: 'SPAWN_NODE', node_id: 'n_sql', node_type: 'QUERY_DATABASE' }],
      {},
      ['HTTP_REQUEST']
    );

    expect(result.valid).toBe(false);
    expect(result.errors?.[0].field).toContain('node_type');
    expect(result.errors?.[0].message).toContain('not available');
  });
});
