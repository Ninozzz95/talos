import { describe, it, expect } from 'vitest';
import { HttpRequestPayloadSchema, QueryDatabasePayloadSchema } from '../src/schemas/payloads';

describe('HttpRequestPayloadSchema', () => {
  it('accepts a valid HTTP request payload', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://api.example.com/data',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
      timeout_ms: 3000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal payload with defaults', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe('GET');
      expect(result.data.timeout_ms).toBe(5000);
    }
  });

  it('accepts body as object', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
      body: { key: 'value' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative timeout', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
      timeout_ms: -100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects timeout above 60 seconds', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
      timeout_ms: 60001,
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
      unexpected: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid method', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
      method: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});

describe('QueryDatabasePayloadSchema', () => {
  it('accepts a valid query with params', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'SELECT * FROM users WHERE id = :id',
      params: { id: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts query without params', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'SELECT 1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts params with string, number, boolean, null', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'INSERT INTO t VALUES (:a, :b, :c, :d)',
      params: { a: 'text', b: 42, c: true, d: null },
    });
    expect(result.success).toBe(true);
  });

  it('rejects params with object values', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'SELECT 1',
      params: { bad: { nested: 'obj' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty query', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects query shorter than 5 chars', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('rejects destructive SQL without enterprise policy override', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'DROP TABLE users',
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'SELECT 1',
      unsafe: true,
    });
    expect(result.success).toBe(false);
  });
});
