import { describe, it, expect } from 'vitest';
import { NodeDefinitionSchema } from '../src/schemas/nodes';

describe('NodeDefinitionSchema', () => {
  it('accepts HTTP_REQUEST node with valid payload', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'HTTP_REQUEST',
      payload: {
        url: 'https://example.com',
        method: 'GET',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts QUERY_DATABASE node with valid payload', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'QUERY_DATABASE',
      payload: {
        query: 'SELECT 1',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown node_type', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'UNKNOWN_TYPE',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects HTTP_REQUEST payload on QUERY_DATABASE node_type', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'QUERY_DATABASE',
      payload: {
        url: 'https://example.com',
        method: 'GET',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects QUERY_DATABASE payload on HTTP_REQUEST node_type', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'HTTP_REQUEST',
      payload: {
        query: 'SELECT 1',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects node without payload', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'HTTP_REQUEST',
    });
    expect(result.success).toBe(false);
  });

  it('rejects HTTP_REQUEST with invalid payload (bad URL)', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'HTTP_REQUEST',
      payload: {
        url: 'not-a-url',
      },
    });
    expect(result.success).toBe(false);
  });
});
