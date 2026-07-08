import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import { resolve } from 'node:path';

const originalPhpBin = process.env.PHP_BIN;
const originalKadmosChatScript = process.env.KADMOS_CHAT_SCRIPT;

afterEach(() => {
  if (originalPhpBin === undefined) {
    delete process.env.PHP_BIN;
  } else {
    process.env.PHP_BIN = originalPhpBin;
  }

  if (originalKadmosChatScript === undefined) {
    delete process.env.KADMOS_CHAT_SCRIPT;
  } else {
    process.env.KADMOS_CHAT_SCRIPT = originalKadmosChatScript;
  }
});

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

  it('applies allowed_node_types as a registry allowlist', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [
          { action: 'SPAWN_NODE', node_id: 'n_sql', node_type: 'QUERY_DATABASE' },
        ],
        context: {},
        allowed_node_types: ['HTTP_REQUEST'],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(false);
    expect(body.errors[0].message).toContain('not available');
  });
});

describe('POST /chat', () => {
  const server = buildServer();

  afterAll(async () => {
    await server.close();
  });

  it('forwards TALOS tool_context to the core chat process', async () => {
    process.env.PHP_BIN = process.execPath;
    process.env.KADMOS_CHAT_SCRIPT = resolve(__dirname, 'fixtures/chat-echo.mjs');

    const response = await server.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'Use available tools only.',
        api_key: 'sk-test',
        tool_context: {
          source: 'talos_tool_registry',
          tools: [
            { name: 'HTTP_REQUEST', risk_level: 'medium' },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().received_tool_context.tools[0].name).toBe('HTTP_REQUEST');
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
