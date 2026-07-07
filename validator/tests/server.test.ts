import { describe, it, expect, afterAll } from 'vitest';
import { buildServer } from '../src/server';

describe('POST /validate', () => {
  const server = buildServer();

  afterAll(async () => {
    await server.close();
  });

  it('returns 200 with valid:true for a correct batch', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [
          { action: 'SPAWN_NODE', node_id: 'n_1', node_type: 'HTTP_REQUEST' },
          { action: 'MUTATE_PAYLOAD', node_id: 'n_1', payload: { url: 'https://example.com' } },
          { action: 'YIELD_EXECUTION' },
        ],
        context: { n_1: 'HTTP_REQUEST' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(true);
    expect(body.errors).toBeUndefined();
  });

  it('returns 200 with valid:false and errors for invalid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [
          { action: 'MUTATE_PAYLOAD', node_id: 'n_bad', payload: { url: 'not-a-url' } },
        ],
        context: { n_bad: 'HTTP_REQUEST' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(false);
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('returns 200 even for completely malformed JSON', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: { not: 'valid' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(false);
  });

  it('returns 200 with valid:false for missing node_id in context', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [
          { action: 'MUTATE_PAYLOAD', node_id: 'n_missing', payload: {} },
        ],
        context: {},
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(false);
  });
});

describe('POST /benchmark/compare', () => {
  const server = buildServer();

  afterAll(async () => {
    await server.close();
  });

  it('returns an AVM ON/OFF/tool-agent comparison report for a known scenario', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/benchmark/compare',
      payload: {
        scenario: '05_deep_chain_failure',
        runs: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.scenario.name).toBe('deep_chain_failure');
    expect(body.modes.avm_on.state_match).toBe(true);
    expect(body.modes.avm_on.blocked_nodes).toBe(3);
    expect(body.modes.avm_off_direct.state_match).toBe(false);
    expect(body.modes.tool_agent.state_match).toBe(false);
  });

  it('rejects unsafe scenario names before spawning PHP', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/benchmark/compare',
      payload: {
        scenario: '../05_deep_chain_failure',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('scenario');
  });
});
