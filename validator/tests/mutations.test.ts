import { describe, it, expect } from 'vitest';
import { JmpMutationSchema } from '../src/schemas/mutations';

describe('JmpMutationSchema', () => {
  describe('SPAWN_NODE', () => {
    it('accepts a valid SPAWN_NODE', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_id: 'n_001',
        parent_id: 'n_root',
        node_type: 'HTTP_REQUEST',
        dependencies: ['n_dep1'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts SPAWN_NODE with minimal fields', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_id: 'n_001',
        node_type: 'QUERY_DATABASE',
      });
      expect(result.success).toBe(true);
    });

    it('rejects SPAWN_NODE without node_id', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_type: 'HTTP_REQUEST',
      });
      expect(result.success).toBe(false);
    });

    it('rejects SPAWN_NODE with invalid node_type', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_id: 'n_001',
        node_type: 'UNKNOWN',
      });
      expect(result.success).toBe(false);
    });

    it('rejects SPAWN_NODE with empty node_id', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_id: '',
        node_type: 'HTTP_REQUEST',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('MUTATE_PAYLOAD', () => {
    it('accepts a valid MUTATE_PAYLOAD with any payload structure', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'MUTATE_PAYLOAD',
        node_id: 'n_001',
        payload: { url: 'https://example.com', method: 'GET' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts MUTATE_PAYLOAD with empty payload', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'MUTATE_PAYLOAD',
        node_id: 'n_001',
        payload: {},
      });
      expect(result.success).toBe(true);
    });

    it('rejects MUTATE_PAYLOAD without node_id', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'MUTATE_PAYLOAD',
        payload: { url: 'https://example.com' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('YIELD_EXECUTION', () => {
    it('accepts YIELD_EXECUTION', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'YIELD_EXECUTION',
      });
      expect(result.success).toBe(true);
    });

    it('rejects YIELD_EXECUTION with extra fields', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'YIELD_EXECUTION',
        extra: 'field',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('unknown action', () => {
    it('rejects unknown action', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'UNKNOWN_ACTION',
      });
      expect(result.success).toBe(false);
    });
  });
});
