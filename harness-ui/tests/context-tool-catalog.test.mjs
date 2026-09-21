import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextToolCatalog } from '../src/context-tool-catalog.mjs';

const tools = Array.from({ length: 43 }, (_, i) => ({ type: 'function', function: { name: `tool_${i}`, description: `Read document ${i}`, parameters: { type: 'object', properties: { path: { type: 'string', minLength: 1 } }, required: ['path'], additionalProperties: false } } }));
const create = options => createContextToolCatalog({ tools, baseToolNames: ['tool_0'], authorize: async () => true, invoke: async call => call, ...options });

test('CTX-TOOL-DISCOVERY every catalog entry is reachable through exact search and isolated descriptors', async () => {
  const catalog = create();
  for (const tool of tools) assert.equal((await catalog.searchToolCatalog({ query: tool.function.name, limit: 1 }))[0].name, tool.function.name);
  assert.equal((await catalog.getToolDescriptor('tool_42')).name, 'tool_42'); assert.equal(await catalog.getToolDescriptor('absent'), null);
  const descriptors = catalog.descriptors; assert.equal(descriptors.length, 3);
  assert.deepEqual(descriptors.map(d => d.name), ['tool_0', 'tool_search', 'tool_invoke']);
  descriptors[0].parameters.properties.path.type = 'number'; assert.equal((await catalog.getToolDescriptor('tool_0')).parameters.properties.path.type, 'string');
});

test('CTX-POLICY-EQUIVALENCE direct and discovered invocation run identical schema, async policy and dispatch', async () => {
  const events = [];
  const catalog = create({ validateArguments: async ({ name, arguments: args }) => { events.push(`validate:${name}`); return args; }, authorize: async ({ name }) => { events.push(`policy:${name}`); return true; }, invoke: async call => { events.push(`invoke:${call.name}`); return call; } });
  const direct = await catalog.resolveCatalogInvocation({ name: 'tool_42', arguments: { path: 'note' }, callId: 'c' });
  const deferred = await catalog.resolveCatalogInvocation({ name: 'tool_invoke', arguments: { name: 'tool_42', arguments: { path: 'note' } }, callId: 'c' });
  assert.deepEqual(direct, deferred); assert.deepEqual(events, ['validate:tool_42', 'policy:tool_42', 'invoke:tool_42', 'validate:tool_42', 'policy:tool_42', 'invoke:tool_42']);
});

test('CTX-TOOL-SCHEMA malformed arguments fail before callback policy or invocation', async () => {
  let calls = 0; const catalog = create({ authorize: async () => { calls++; return true; }, invoke: async () => { calls++; } });
  for (const args of [{}, { path: 9 }, { path: 'note', extra: true }, [], '{invalid']) await assert.rejects(catalog.resolveCatalogInvocation({ name: 'tool_1', arguments: args }), { code: 'CTX_TOOL_ARGUMENTS' });
  await assert.rejects(catalog.resolveCatalogInvocation({ name: 'tool_invoke', arguments: { name: 'tool_search', arguments: { query: 'x' } } }), { code: 'CTX_TOOL_NOT_FOUND' });
  assert.equal(calls, 0);
});

test('CTX-TOOL-POLICY deny, missing policy and cancellation fail closed', async () => {
  let invoked = false;
  for (const authorize of [undefined, async () => false, async () => ({ allowed: false })]) {
    const catalog = create({ authorize, invoke: async () => { invoked = true; } });
    await assert.rejects(catalog.resolveCatalogInvocation({ name: 'tool_1', arguments: { path: 'note' } }), { code: 'CTX_TOOL_DENIED' });
  }
  await assert.rejects(create().resolveCatalogInvocation({ name: 'tool_1', arguments: { path: 'note' }, signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(invoked, false);
});

test('CTX-TOOL-SCHEMA uses pinned upstream JSON Schema validation including nested composition', async () => {
  const catalog = create({ tools: [{ name: 'nested', description: 'Nested', parameters: { type: 'object', properties: { value: { oneOf: [{ type: 'string', minLength: 3 }, { type: 'integer', minimum: 10 }] } }, required: ['value'], additionalProperties: false } }], baseToolNames: [] });
  await assert.rejects(catalog.validateCatalogArguments({ name: 'nested', arguments: { value: 9 } }), { code: 'CTX_TOOL_ARGUMENTS' });
  assert.deepEqual(await catalog.validateCatalogArguments({ name: 'nested', arguments: { value: 10 } }), { value: 10 });
});

test('CTX-TOOL-SCHEMA-DEFAULT JSON Schema defaults never supply missing required execution arguments', async () => {
  const catalog = create({ tools: [{ name: 'defaults', parameters: { type: 'object', properties: { path: { type: 'string', default: 'dangerous-default' }, optional: { type: 'string', default: 'annotation' }, default: { type: 'number' } }, required: ['path'], additionalProperties: false } }], baseToolNames: [] });
  await assert.rejects(catalog.validateCatalogArguments({ name: 'defaults', arguments: {} }), { code: 'CTX_TOOL_ARGUMENTS' });
  assert.deepEqual(await catalog.validateCatalogArguments({ name: 'defaults', arguments: { path: 'safe' } }), { path: 'safe' });
  await assert.rejects(catalog.validateCatalogArguments({ name: 'defaults', arguments: { path: 'safe', default: 'wrong' } }), { code: 'CTX_TOOL_ARGUMENTS' });
});

test('CTX-TOOL-SCHEMA-UNSUPPORTED retains discovery but fails closed at invocation', async () => {
  const catalog = create({ tools: [{ name: 'conditional', parameters: { type: 'object', if: { properties: { enabled: { const: true } } }, then: { required: ['path'] } } }], baseToolNames: [] });
  assert.equal((await catalog.getToolDescriptor('conditional')).name, 'conditional');
  await assert.rejects(catalog.validateCatalogArguments({ name: 'conditional', arguments: { enabled: true } }), { code: 'CTX_TOOL_SCHEMA_UNSUPPORTED' });
});

test('CTX-TOOL-CANCEL abort during async policy prevents invocation', async () => {
  const controller = new AbortController(); let calls = 0;
  const catalog = create({ authorize: async () => { controller.abort(); return true; }, invoke: async () => { calls++; } });
  await assert.rejects(catalog.resolveCatalogInvocation({ name: 'tool_1', arguments: { path: 'note' }, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});
