import { z } from 'zod';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const objectSchema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const discovery = [
  { name: 'tool_search', description: 'Find available tools by exact name or description. Returns their argument schemas.', parameters: objectSchema({ query: { type: 'string', maxLength: 2000 }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, ['query']) },
  { name: 'tool_invoke', description: 'Invoke a discovered tool by its exact name and arguments; its validation and permission checks still apply.', parameters: objectSchema({ name: { type: 'string', minLength: 1 }, arguments: { type: 'object', additionalProperties: true } }, ['name', 'arguments']) },
];

// `default` is an annotation in JSON Schema, but Zod applies it during parse.
// Remove that annotation only at schema positions, never a property named default.
function validationSchema(schema) {
  if (typeof schema === 'boolean' || !schema || typeof schema !== 'object') return schema;
  const result = structuredClone(schema);
  delete result.default;
  for (const key of ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']) {
    if (result[key] && typeof result[key] === 'object') result[key] = Object.fromEntries(Object.entries(result[key]).map(([name, value]) => [name, validationSchema(value)]));
  }
  for (const key of ['additionalProperties', 'propertyNames', 'contains', 'additionalItems', 'not', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties']) {
    if (result[key] !== undefined) result[key] = validationSchema(result[key]);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) if (Array.isArray(result[key])) result[key] = result[key].map(validationSchema);
  if (result.items !== undefined) result.items = Array.isArray(result.items) ? result.items.map(validationSchema) : validationSchema(result.items);
  return result;
}

export function createContextToolCatalog({ tools, baseToolNames = [], validateArguments, authorize, invoke } = {}) {
  if (!Array.isArray(tools) || !Array.isArray(baseToolNames) || typeof invoke !== 'function') fail('CTX_TOOL_CATALOG_INVALID', 'Tools, base names and the existing invocation port are required.');
  const catalog = new Map(); const validators = new Map();
  for (const tool of tools) {
    const value = tool?.type === 'function' ? tool.function : tool;
    if (!value || typeof value.name !== 'string' || !value.name || catalog.has(value.name) || discovery.some(d => d.name === value.name)) fail('CTX_TOOL_CATALOG_INVALID', 'Tool names must be nonempty, unique and distinct from discovery tools.');
    const descriptor = structuredClone({ name: value.name, description: value.description ?? '', parameters: value.parameters ?? value.inputSchema ?? objectSchema({}, []) });
    catalog.set(value.name, descriptor);
    // Retain unsupported schemas in discovery; their invocation fails closed.
    try { validators.set(value.name, z.fromJSONSchema(validationSchema(descriptor.parameters))); } catch { validators.set(value.name, null); }
  }
  if (baseToolNames.some(name => !catalog.has(name))) fail('CTX_TOOL_CATALOG_INVALID', 'Every base tool must exist in the catalog.');
  const discoveryValidators = new Map(discovery.map(d => [d.name, z.fromJSONSchema(d.parameters)]));
  const parse = (args, validator) => {
    let parsed;
    try { parsed = typeof args === 'string' ? JSON.parse(args) : structuredClone(args); } catch { fail('CTX_TOOL_ARGUMENTS', 'Tool arguments must be valid JSON.'); }
    if (!validator) fail('CTX_TOOL_SCHEMA_UNSUPPORTED', 'The pinned schema validator does not support this tool schema.');
    const result = validator.safeParse(parsed);
    if (!result.success) fail('CTX_TOOL_ARGUMENTS', 'Tool arguments do not satisfy the tool schema.');
    // Validation must not apply defaults or strip arguments before the existing executor.
    return parsed;
  };
  const api = {
    get descriptors() { return structuredClone([...new Set(baseToolNames)].map(name => catalog.get(name)).concat(discovery)); },
    async searchToolCatalog({ query, limit = 5 }) {
      parse({ query, limit }, discoveryValidators.get('tool_search'));
      const normalized = query.trim().toLocaleLowerCase('en-US');
      const words = normalized.split(/\s+/u).filter(Boolean);
      return [...catalog.values()].map((descriptor, index) => ({ descriptor, index, score: descriptor.name.toLocaleLowerCase('en-US') === normalized ? 1000000 : words.reduce((score, word) => score + (descriptor.name.toLocaleLowerCase('en-US').includes(word) ? 10 : 0) + (descriptor.description.toLocaleLowerCase('en-US').includes(word) ? 1 : 0), 0) })).filter(item => !normalized || item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(item => structuredClone(item.descriptor));
    },
    async getToolDescriptor(name) { return catalog.has(name) ? structuredClone(catalog.get(name)) : null; },
    async validateCatalogArguments({ name, arguments: args }) {
      if (!catalog.has(name)) fail('CTX_TOOL_NOT_FOUND', 'No tool has this exact catalog name.');
      const validated = parse(args, validators.get(name));
      if (validateArguments) {
        const result = await validateArguments({ name, arguments: structuredClone(validated), descriptor: structuredClone(catalog.get(name)) });
        if (result === false || result?.success === false) fail('CTX_TOOL_ARGUMENTS', 'The existing tool validator rejected these arguments.');
      }
      return structuredClone(validated);
    },
    async resolveCatalogInvocation({ name, arguments: args, callId, signal }) {
      signal?.throwIfAborted();
      if (name === 'tool_search') return api.searchToolCatalog(parse(args, discoveryValidators.get(name)));
      if (name === 'tool_invoke') {
        const target = parse(args, discoveryValidators.get(name)); name = target.name; args = target.arguments;
      }
      const validated = await api.validateCatalogArguments({ name, arguments: args });
      signal?.throwIfAborted();
      if (typeof authorize !== 'function' || await authorize({ name, arguments: structuredClone(validated), callId, signal }) !== true) fail('CTX_TOOL_DENIED', 'The existing tool policy did not authorize this invocation.');
      signal?.throwIfAborted();
      return invoke({ name, arguments: structuredClone(validated), callId, signal });
    },
  };
  return api;
}

export const searchToolCatalog = (request, { catalog }) => catalog.searchToolCatalog(request);
export const getToolDescriptor = (name, { catalog }) => catalog.getToolDescriptor(name);
export const resolveCatalogInvocation = (request, { catalog }) => catalog.resolveCatalogInvocation(request);
export const validateCatalogArguments = (request, { catalog }) => catalog.validateCatalogArguments(request);
