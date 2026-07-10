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

  it('rejects mixed browser and HTTP write batches even when a broad manifest lists both', () => {
    const result = validateMutations(
      [
        { action: 'SPAWN_NODE', node_id: 'browser_1', node_type: 'BROWSER_COMMAND' },
        { action: 'SPAWN_NODE', node_id: 'write_1', node_type: 'HTTP_REQUEST' },
        { action: 'MUTATE_PAYLOAD', node_id: 'write_1', payload: { url: 'https://example.com/write', method: 'POST' } },
      ],
      { browser_1: 'BROWSER_COMMAND', write_1: 'HTTP_REQUEST' },
      ['BROWSER_COMMAND', 'HTTP_REQUEST'],
      ['snapshot'],
      true,
    );

    expect(result.valid).toBe(false);
    expect(result.errors?.some((fault) => fault.message.includes('planner-only'))).toBe(true);
  });

  it('requires exactly one browser spawn and one matching payload in Browse mode', () => {
    const command = {
      schema_version: 'talos_browser_command_v1', command_id: 'bc_1',
      run_id: '0190f2f1-7a4b-7abc-8def-0123456789ab', node_id: 'browser_1',
      browser_session_id: '0190f2f1-7a4b-7abc-8def-0123456789ac', operation: 'snapshot',
      arguments: {}, observation_request: [], risk: 'read', expected_evidence_hash: null,
      idempotency_key: `sha256:${'b'.repeat(64)}`,
    };
    const first = [
      { action: 'SPAWN_NODE', node_id: 'browser_1', node_type: 'BROWSER_COMMAND' },
      { action: 'MUTATE_PAYLOAD', node_id: 'browser_1', payload: command },
    ];
    const second = [
      { action: 'SPAWN_NODE', node_id: 'browser_2', node_type: 'BROWSER_COMMAND' },
      { action: 'MUTATE_PAYLOAD', node_id: 'browser_2', payload: { ...command, command_id: 'bc_2', node_id: 'browser_2' } },
    ];

    const duplicate = validateMutations([...first, ...second], { browser_1: 'BROWSER_COMMAND', browser_2: 'BROWSER_COMMAND' }, ['BROWSER_COMMAND'], ['snapshot'], true);
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors?.some((fault) => fault.message.includes('exactly one'))).toBe(true);

    const extraPayload = validateMutations([
      ...first,
      { action: 'MUTATE_PAYLOAD', node_id: 'existing_http', payload: { url: 'https://example.com', method: 'POST' } },
    ], { browser_1: 'BROWSER_COMMAND', existing_http: 'HTTP_REQUEST' }, ['BROWSER_COMMAND'], ['snapshot'], true);
    expect(extraPayload.valid).toBe(false);
  });
});
