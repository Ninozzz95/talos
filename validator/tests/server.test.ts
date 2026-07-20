import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function toolContractFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, '../../core/tests/fixtures/tool-contracts', name), 'utf8'));
}

const originalPhpBin = process.env.PHP_BIN;
const originalKadmosChatScript = process.env.KADMOS_CHAT_SCRIPT;
const originalBenchmarkScript = process.env.KADMOS_BENCHMARK_SCRIPT;
const originalKadmosCli = process.env.KADMOS_CLI;
const originalDeepseekApiKey = process.env.DEEPSEEK_API_KEY;

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

  if (originalBenchmarkScript === undefined) {
    delete process.env.KADMOS_BENCHMARK_SCRIPT;
  } else {
    process.env.KADMOS_BENCHMARK_SCRIPT = originalBenchmarkScript;
  }

  if (originalKadmosCli === undefined) {
    delete process.env.KADMOS_CLI;
  } else {
    process.env.KADMOS_CLI = originalKadmosCli;
  }

  if (originalDeepseekApiKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = originalDeepseekApiKey;
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

  it.each([undefined, null])('returns a validation response instead of 500 for an absent or null body', async (payload) => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      ...(payload === undefined ? {} : { payload }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().valid).toBe(false);
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

  it('preserves absent/null legacy node policy but treats an explicit empty list as deny-all', async () => {
    const mutation = [{ action: 'SPAWN_NODE', node_id: 'n_http', node_type: 'HTTP_REQUEST' }];

    for (const policy of ['omitted', 'null'] as const) {
      const payload: Record<string, unknown> = { mutations: mutation, context: {} };
      if (policy === 'null') payload.allowed_node_types = null;
      const response = await server.inject({ method: 'POST', url: '/validate', payload });
      expect(response.json().valid, policy).toBe(true);
    }

    const denied = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: { mutations: mutation, context: {}, allowed_node_types: [] },
    });
    expect(denied.json().valid).toBe(false);
  });

  it('rejects explicitly malformed node policy instead of treating it as omitted', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [{ action: 'SPAWN_NODE', node_id: 'n_http', node_type: 'HTTP_REQUEST' }],
        context: {},
        allowed_node_types: 'HTTP_REQUEST',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().valid).toBe(false);
    expect(response.json().errors[0].field).toContain('allowed_node_types');
  });

  it('fails closed for omitted and empty Browse operation allowlists, then accepts a populated manifest', async () => {
    const mutations = [
      { action: 'SPAWN_NODE', node_id: 'browser_1', node_type: 'BROWSER_COMMAND' },
      {
        action: 'MUTATE_PAYLOAD',
        node_id: 'browser_1',
        payload: {
          schema_version: 'talos_browser_command_v1',
          command_id: 'bc_1',
          run_id: '0190f2f1-7a4b-7abc-8def-0123456789ab',
          node_id: 'browser_1',
          browser_session_id: '0190f2f1-7a4b-7abc-8def-0123456789ac',
          operation: 'snapshot',
          arguments: {},
          observation_request: [],
          risk: 'read',
          expected_evidence_hash: null,
          idempotency_key: `sha256:${'b'.repeat(64)}`,
        },
      },
    ];
    const base = {
      mutations,
      context: { browser_1: 'BROWSER_COMMAND' },
      allowed_node_types: ['BROWSER_COMMAND'],
      browser_mode_enabled: true,
    };

    const omitted = await server.inject({ method: 'POST', url: '/validate', payload: base });
    expect(omitted.json().valid).toBe(false);
    expect(omitted.json().errors.at(-1).message).toContain('allowlist');

    const empty = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: { ...base, allowed_browser_operations: [] },
    });
    expect(empty.json().valid).toBe(false);

    const populated = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: { ...base, allowed_browser_operations: ['snapshot'] },
    });
    expect(populated.json().valid).toBe(true);
  });

  it('requires an authoritative node allowlist for Browse mode', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [{ action: 'SPAWN_NODE', node_id: 'browser_1', node_type: 'BROWSER_COMMAND' }],
        context: {},
        browser_mode_enabled: true,
        allowed_browser_operations: ['snapshot'],
      },
    });

    expect(response.json().valid).toBe(false);
    expect(response.json().errors[0].message).toContain('node allowlist');
  });

  it('denies a Browse spawn before payload validation when operation policy is absent or empty', async () => {
    const base = {
      mutations: [{ action: 'SPAWN_NODE', node_id: 'browser_1', node_type: 'BROWSER_COMMAND' }],
      context: {},
      browser_mode_enabled: true,
      allowed_node_types: ['BROWSER_COMMAND'],
    };

    for (const operations of [undefined, []] as const) {
      const payload: Record<string, unknown> = { ...base };
      if (operations !== undefined) payload.allowed_browser_operations = operations;
      const response = await server.inject({ method: 'POST', url: '/validate', payload });
      expect(response.json().valid).toBe(false);
      expect(response.json().errors[0].message).toContain('operation allowlist');
    }
  });
});

describe('canonical tool contract validation endpoints', () => {
  const server = buildServer();

  afterAll(async () => {
    await server.close();
  });

  it('validates a strict MCP tool definition', async () => {
    const definition = toolContractFixture('valid-definition.json');
    const response = await server.inject({
      method: 'POST',
      url: '/validate/tool-definition',
      payload: { definition },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      valid: true,
      contract: 'tool_definition',
      contract_version: 'mcp-2025-11-25+talos-v1',
      data: definition,
    });
  });

  it('validates a provider tool call together with its execution context', async () => {
    const call = toolContractFixture('valid-call.json');
    const context = toolContractFixture('valid-context.json');
    const response = await server.inject({
      method: 'POST',
      url: '/validate/tool-call',
      payload: { call, context },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      valid: true,
      contract: 'tool_call',
      data: { call, context },
    });
  });

  it('validates a result only when it is correlated to the expected provider call', async () => {
    const result = toolContractFixture('valid-result.json');
    const response = await server.inject({
      method: 'POST',
      url: '/validate/tool-result',
      payload: { result, expected_tool_use_id: 'call_browser_1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      valid: true,
      contract: 'tool_result',
      data: result,
    });
  });

  it.each([
    ['/validate/tool-definition', { definition: { name: 'secret-sk-should-not-leak' } }, 'TOOL_DEFINITION_INVALID'],
    ['/validate/tool-call', { call: {}, context: {} }, 'TOOL_CALL_INVALID'],
    ['/validate/tool-result', { result: toolContractFixture('valid-result.json'), expected_tool_use_id: 'different-call' }, 'TOOL_RESULT_INVALID'],
  ])('returns a typed 422 without reflecting invalid input for %s', async (url, payload, code) => {
    const response = await server.inject({ method: 'POST', url, payload });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      valid: false,
      fault: {
        code,
        issues: expect.any(Array),
      },
    });
    expect(response.body).not.toContain('secret-sk-should-not-leak');
  });

  it('returns a typed 422 instead of a 500 for missing request bodies', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate/tool-result',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().fault.code).toBe('TOOL_RESULT_INVALID');
  });

  it('does not leak unknown client-controlled field names through Zod issue messages', async () => {
    const definition = toolContractFixture('valid-definition.json') as Record<string, unknown>;
    const response = await server.inject({
      method: 'POST',
      url: '/validate/tool-definition',
      payload: {
        definition: {
          ...definition,
          'sk-client-controlled-secret': true,
        },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.body).not.toContain('sk-client-controlled-secret');
  });

  it('returns a typed 400 for malformed JSON before route validation', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate/tool-definition',
      headers: { 'content-type': 'application/json' },
      payload: '{"definition":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      valid: false,
      fault: { code: 'TOOL_DEFINITION_INVALID' },
    });
  });

  it('returns a typed 413 when a contract body exceeds its route limit', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate/tool-call',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ oversized: 'x'.repeat(1_100_000) }),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      valid: false,
      fault: { code: 'TOOL_CALL_INVALID' },
    });
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

  it('propagates its bound validator origin to the core chat process', async () => {
    const boundServer = buildServer();
    const previousValidatorUrl = process.env.KADMOS_VALIDATOR_URL;
    const previousValidatorHealthUrl = process.env.KADMOS_VALIDATOR_HEALTH_URL;

    process.env.PHP_BIN = process.execPath;
    process.env.KADMOS_CHAT_SCRIPT = resolve(__dirname, 'fixtures/chat-validator-env.mjs');
    delete process.env.KADMOS_VALIDATOR_URL;
    delete process.env.KADMOS_VALIDATOR_HEALTH_URL;

    try {
      await boundServer.listen({ host: '127.0.0.1', port: 0 });
      const address = boundServer.server.address();
      expect(address).not.toBeNull();
      expect(typeof address).toBe('object');
      if (address === null || typeof address === 'string') throw new Error('Expected an IP listener.');

      const response = await boundServer.inject({
        method: 'POST',
        url: '/chat',
        payload: { message: 'Verify the bound validator callback.' },
      });

      const origin = `http://127.0.0.1:${address.port}`;
      expect(response.json()).toEqual({
        validator_url: `${origin}/validate`,
        validator_health_url: `${origin}/health`,
      });

      process.env.KADMOS_VALIDATOR_URL = 'http://validator.internal:7300/custom-validate';
      process.env.KADMOS_VALIDATOR_HEALTH_URL = 'http://validator.internal:7300/custom-health';
      const overridden = await boundServer.inject({
        method: 'POST',
        url: '/chat',
        payload: { message: 'Preserve explicit validator endpoints.' },
      });
      expect(overridden.json()).toEqual({
        validator_url: 'http://validator.internal:7300/custom-validate',
        validator_health_url: 'http://validator.internal:7300/custom-health',
      });
    } finally {
      await boundServer.close();
      if (previousValidatorUrl === undefined) delete process.env.KADMOS_VALIDATOR_URL;
      else process.env.KADMOS_VALIDATOR_URL = previousValidatorUrl;
      if (previousValidatorHealthUrl === undefined) delete process.env.KADMOS_VALIDATOR_HEALTH_URL;
      else process.env.KADMOS_VALIDATOR_HEALTH_URL = previousValidatorHealthUrl;
    }
  });

  it('returns structured core process errors instead of generic chat error', async () => {
    process.env.PHP_BIN = process.execPath;
    process.env.KADMOS_CHAT_SCRIPT = resolve(__dirname, 'fixtures/chat-stderr-fail.mjs');

    const response = await server.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'Use DeepSeek.',
        api_key: 'sk-test',
        provider: 'deepseek',
        model: 'deepseek-chat',
        base_url: 'https://api.deepseek.com/v1',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().error).toBe('Core chat process failed.');
    expect(response.json().code).toBe('CORE_CHAT_PROCESS_FAILED');
    expect(response.json().details).toContain('HTTP 401');
    expect(response.json().details).not.toContain('sk-test');
  });

  it('redacts a fallback provider key inherited from the environment', async () => {
    process.env.PHP_BIN = process.execPath;
    process.env.KADMOS_CHAT_SCRIPT = resolve(__dirname, 'fixtures/chat-env-stderr-fail.mjs');
    process.env.DEEPSEEK_API_KEY = 'fallback-secret-value-12345';

    const response = await server.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'Use configured provider.',
        provider: 'deepseek',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().code).toBe('CORE_CHAT_PROCESS_FAILED');
    expect(response.body).not.toContain('fallback-secret-value-12345');
    expect(response.json().details).toContain('[redacted]');
  });

  it('recursively redacts secrets from parsed child JSON', async () => {
    process.env.PHP_BIN = process.execPath;
    process.env.KADMOS_CHAT_SCRIPT = resolve(__dirname, 'fixtures/chat-json-secrets.mjs');

    const response = await server.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'Return structured data.',
        api_key: 'sk-chat-secret-123',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      api_key: '[redacted]',
      nested: {
        token: '[redacted]',
        safe: 'visible',
      },
      items: [{ access_token: '[redacted]' }],
      credentials: '[redacted]',
      private_key: '[redacted]',
      API_KEY: '[redacted]',
      TOKEN: '[redacted]',
      PRIVATE_KEY: '[redacted]',
      auth_token: '[redacted]',
      sessionToken: '[redacted]',
      requestAuthorization: '[redacted]',
      session_cookie: '[redacted]',
      max_tokens: 4096,
    });
    expect(response.json().long_text).toHaveLength(1200);
    expect(response.body).not.toContain('sk-chat-secret-123');
    expect(response.body).not.toContain('nested-password-value');
    expect(response.body).not.toContain('sk-inline-secret');
    expect(response.body).not.toContain('array-chat-token');
    expect(response.body).not.toContain('opaque-credential-value');
    expect(response.body).not.toContain('opaque-private-key-value');
    expect(response.body).not.toContain('uppercase-api-key-value');
    expect(response.body).not.toContain('uppercase-token-value');
    expect(response.body).not.toContain('uppercase-private-key-value');
    expect(response.body).not.toContain('prefixed-auth-token-value');
    expect(response.body).not.toContain('prefixed-session-token-value');
    expect(response.body).not.toContain('prefixed-authorization-value');
    expect(response.body).not.toContain('prefixed-cookie-value');
  });

  it('returns a controlled fault when the chat process cannot spawn', async () => {
    process.env.PHP_BIN = resolve(__dirname, 'fixtures/missing-runtime-do-not-create');

    const response = await server.inject({
      method: 'POST',
      url: '/chat',
      payload: { message: 'Hello.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ code: 'CORE_CHAT_PROCESS_FAILED' });
  });
});

describe('POST /execute process boundary', () => {
  const server = buildServer();

  afterAll(async () => {
    await server.close();
  });

  it('returns a controlled fault when the execute process cannot spawn', async () => {
    process.env.PHP_BIN = resolve(__dirname, 'fixtures/missing-runtime-do-not-create');

    const response = await server.inject({
      method: 'POST',
      url: '/execute',
      payload: { mutations: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ code: 'CORE_EXECUTE_PROCESS_FAILED' });
  });
});

describe('POST /benchmark', () => {
  const server = buildServer();

  afterAll(async () => {
    await server.close();
  });

  it('uses the child environment instead of benchmark argv and redacts parsed JSON recursively', async () => {
    process.env.PHP_BIN = process.execPath;
    process.env.KADMOS_BENCHMARK_SCRIPT = resolve(__dirname, 'fixtures/benchmark-json-secrets.mjs');

    const response = await server.inject({
      method: 'POST',
      url: '/benchmark',
      payload: {
        scenario: '01_simple_http',
        api_key: 'sk-benchmark-secret-123',
        use_live: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      argv_has_api_key: false,
      env_has_api_key: true,
      nested: { api_key: '[redacted]', safe: 'visible' },
    });
    expect(response.body).not.toContain('sk-benchmark-secret-123');
    expect(response.body).not.toContain('nested-benchmark-token');
    expect(response.body).not.toContain('array-benchmark-secret');
  });

  it('rejects unsafe scenario names before spawning a process', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/benchmark',
      payload: { scenario: '../private-file', use_live: false },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('scenario');
  });

  it('uses the real benchmark script and handles spawn failures', async () => {
    const source = readFileSync(resolve(__dirname, '../src/server.ts'), 'utf8');
    expect(source).toContain("join(process.cwd(), '..', 'core', 'kadmos-bench-live.php')");
    expect(source).not.toContain("join(process.cwd(), '..', 'core', 'talos-bench-live.php')");

    process.env.PHP_BIN = resolve(__dirname, 'fixtures/missing-runtime-do-not-create');
    const response = await server.inject({
      method: 'POST',
      url: '/benchmark',
      payload: { scenario: '01_simple_http', use_live: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ code: 'BENCHMARK_PROCESS_FAILED' });
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

  it('recursively redacts secrets from parsed child JSON', async () => {
    process.env.PHP_BIN = process.execPath;
    process.env.KADMOS_CLI = resolve(__dirname, 'fixtures/benchmark-json-secrets.mjs');

    const response = await server.inject({
      method: 'POST',
      url: '/benchmark/compare',
      payload: {
        scenario: '05_deep_chain_failure',
        runs: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      nested: { api_key: '[redacted]', safe: 'visible' },
    });
    expect(response.body).not.toContain('sk-benchmark-secret-123');
    expect(response.body).not.toContain('nested-benchmark-token');
    expect(response.body).not.toContain('array-benchmark-secret');
  });

  it('returns a controlled fault when the comparison process cannot spawn', async () => {
    process.env.PHP_BIN = resolve(__dirname, 'fixtures/missing-runtime-do-not-create');

    const response = await server.inject({
      method: 'POST',
      url: '/benchmark/compare',
      payload: { scenario: '05_deep_chain_failure', runs: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ code: 'BENCHMARK_COMPARE_PROCESS_FAILED' });
  });
});
