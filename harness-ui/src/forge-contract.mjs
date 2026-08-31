/** Canonical, provider-neutral contract for user-authored forged tools. */
const MAX_MANIFEST_BYTES = 65_536;
const MAX_NODES = 64;
const MAX_TRANSITIONS = 256;
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);
const READ_ONLY_ROOTS = new Set(['input', 'runtime']);
const NODE_TYPES = ['capability', 'if', 'return', 'fail'];
const CAPABILITIES = Object.freeze({
  'tasks.list': { actions: ['read'], risk: 'R1' },
  'tasks.create': { actions: ['write'], risk: 'R2' },
  'tasks.setStatus': { actions: ['write'], risk: 'R2' },
  'notes.list': { actions: ['read'], risk: 'R1' },
  'notes.create': { actions: ['write'], risk: 'R2' },
  'notes.update': { actions: ['write'], risk: 'R2' },
  'memory.search': { actions: ['read'], risk: 'R2' },
  'memory.create': { actions: ['write'], risk: 'R3' },
});
const RISK_ORDER = { R1: 1, R2: 2, R3: 3 };
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

function rawSegments(path) {
  const normalized = path.startsWith('$.') ? path.slice(2) : path === '$' ? '' : path;
  return normalized.split('.').filter(Boolean);
}

export function forgePathViolation(path, { writable = false } = {}) {
  if (typeof path !== 'string') return 'must be a string';
  const parts = rawSegments(path);
  if (parts.length > 16) return 'path exceeds 16 segments';
  for (const part of parts) {
    if (part.length > 64) return `segment "${part}" exceeds 64 characters`;
    if (!SAFE_SEGMENT.test(part)) return `segment "${part}" must be alphanumeric, "_" or "-" only`;
    if (FORBIDDEN_SEGMENTS.has(part)) return `segment "${part}" is forbidden`;
  }
  if (writable && parts[0] && READ_ONLY_ROOTS.has(parts[0])) return `"${parts[0]}" is read-only; write to "state" instead`;
  return null;
}

function isReference(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && typeof value.$ref === 'string';
}

function collectReferences(value, result = []) {
  if (isReference(value)) { result.push(value.$ref); return result; }
  if (Array.isArray(value)) { for (const item of value) collectReferences(item, result); return result; }
  if (value && typeof value === 'object') { for (const item of Object.values(value)) collectReferences(item, result); }
  return result;
}

function addReferenceDiagnostics(value, path, add) {
  for (const reference of collectReferences(value)) {
    const violation = forgePathViolation(reference);
    if (violation) add(path, `unsafe $ref "${reference}": ${violation}`);
  }
}

/**
 * Validates the versioned forge manifest without any filesystem or process
 * access. It returns diagnostics instead of throwing so the caller can show
 * a useful explanation and avoid writing an unsafe manifest.
 */
export function validaManifestForgeLocale(manifest) {
  const diagnostics = [];
  const add = (path, message) => diagnostics.push(`${path}: ${message}`);
  if (!manifest || typeof manifest !== 'object') return { ok: false, diagnostica: ['manifest: must be an object'] };
  let bytes;
  try { bytes = new TextEncoder().encode(JSON.stringify(manifest)).length; } catch { bytes = Number.POSITIVE_INFINITY; }
  if (bytes > MAX_MANIFEST_BYTES) add('manifest', `exceeds ${MAX_MANIFEST_BYTES} bytes`);
  if (typeof manifest.id !== 'string' || !ID_PATTERN.test(manifest.id)) add('id', 'must be a lowercase slug, 3-64 chars, a-z0-9_- only');
  if (typeof manifest.title !== 'string' || manifest.title.length < 1 || manifest.title.length > 80) add('title', 'must be 1-80 characters');
  if (typeof manifest.description !== 'string' || manifest.description.length < 1 || manifest.description.length > 400) add('description', 'must be 1-400 characters');
  const flow = manifest.flow;
  if (!flow || typeof flow !== 'object') { add('flow', 'is required'); return { ok: false, diagnostica: diagnostics }; }
  if (typeof flow.entry !== 'string' || flow.entry.length === 0) add('flow.entry', 'is required');
  if (!Array.isArray(flow.nodes) || flow.nodes.length === 0) add('flow.nodes', 'must be a non-empty array');
  if (Array.isArray(flow.nodes) && flow.nodes.length > MAX_NODES) add('flow.nodes', `exceeds ${MAX_NODES} nodes`);
  const maxTransitions = Number(flow.maxTransitions);
  if (!Number.isFinite(maxTransitions) || maxTransitions < 1 || maxTransitions > MAX_TRANSITIONS) add('flow.maxTransitions', `must be 1-${MAX_TRANSITIONS}`);
  if (!Array.isArray(flow.nodes)) return { ok: false, diagnostica: diagnostics };
  const ids = new Set();
  const capabilities = new Set();
  for (const [index, node] of flow.nodes.entries()) {
    const path = `flow.nodes[${index}]`;
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || node.id.length === 0) { add(path, 'must have a non-empty "id"'); continue; }
    if (ids.has(node.id)) add(path, `duplicate node id "${node.id}"`);
    ids.add(node.id);
    if (!NODE_TYPES.includes(node.type)) { add(`${path}.type`, `must be one of ${NODE_TYPES.join(', ')}`); continue; }
    if (node.type === 'capability') {
      if (typeof node.capability !== 'string' || !CAPABILITIES[node.capability]) add(`${path}.capability`, `must be one of ${Object.keys(CAPABILITIES).join(', ')}`);
      else capabilities.add(node.capability);
      if (typeof node.next !== 'string' || node.next.length === 0) add(`${path}.next`, 'is required');
      addReferenceDiagnostics(node.input, `${path}.input`, add);
      if (node.target !== undefined) {
        const violation = typeof node.target !== 'string' ? 'must be a string path' : forgePathViolation(node.target, { writable: true });
        if (violation) add(`${path}.target`, violation);
      }
    } else if (node.type === 'if') {
      if (!node.condition || typeof node.condition !== 'object') add(`${path}.condition`, 'is required');
      else { addReferenceDiagnostics(node.condition.left, `${path}.condition`, add); addReferenceDiagnostics(node.condition.right, `${path}.condition`, add); }
      if (typeof node.then !== 'string' || node.then.length === 0) add(`${path}.then`, 'is required');
      if (typeof node.else !== 'string' || node.else.length === 0) add(`${path}.else`, 'is required');
    } else if (node.type === 'return') {
      addReferenceDiagnostics(node.value, `${path}.value`, add);
    } else if (node.type === 'fail') {
      if (typeof node.code !== 'string' || node.code.length === 0) add(`${path}.code`, 'is required');
      if (typeof node.message !== 'string' || node.message.length === 0) add(`${path}.message`, 'is required');
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostica: diagnostics };
  for (const node of flow.nodes) {
    for (const field of ['next', 'then', 'else']) {
      if (typeof node[field] === 'string' && !ids.has(node[field])) return { ok: false, diagnostica: [`flow: "${node[field]}" (referenced by node "${node.id}".${field}) is not a node id`] };
    }
  }
  if (!ids.has(flow.entry)) return { ok: false, diagnostica: [`flow.entry: "${flow.entry}" is not a node id`] };
  const actions = new Set();
  let risk = 'R1';
  for (const capability of capabilities) {
    const descriptor = CAPABILITIES[capability];
    for (const action of descriptor.actions) actions.add(action);
    if (RISK_ORDER[descriptor.risk] > RISK_ORDER[risk]) risk = descriptor.risk;
  }
  return { ok: true, diagnostica: [], capacita: [...capabilities], azioni: [...actions], rischio: risk };
}

export const FORGE_PREFISSO_NOME_TOOL = 'forge_';

export function forgeReadPath(root, path) {
  if (path === '$') return root;
  let current = root;
  for (const segment of rawSegments(path)) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) { current = current[Number(segment)]; continue; }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

export function forgeWritePath(root, path, value) {
  const violation = forgePathViolation(path, { writable: true });
  if (violation) throw new Error(`TALOS_FORGE_PATH_UNSAFE:${violation}`);
  const parts = rawSegments(path);
  if (parts.length === 0) throw new Error('TALOS_FORGE_SET_ROOT_FORBIDDEN');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) current[part] = Object.create(null);
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

export function forgeResolveExpression(expression, vars) {
  if (isReference(expression)) return forgeReadPath(vars, expression.$ref);
  if (Array.isArray(expression)) return expression.map((value) => forgeResolveExpression(value, vars));
  if (expression && typeof expression === 'object') return Object.fromEntries(Object.entries(expression).map(([key, value]) => [key, forgeResolveExpression(value, vars)]));
  return expression;
}

export function forgeEvaluateCondition(condition, vars) {
  const left = forgeResolveExpression(condition.left, vars);
  const right = forgeResolveExpression(condition.right, vars);
  switch (condition.op) {
    case 'eq': return Object.is(left, right);
    case 'neq': return !Object.is(left, right);
    case 'truthy': return Boolean(left);
    case 'exists': return left !== undefined && left !== null;
    case 'contains': return typeof left === 'string' ? left.includes(String(right ?? '')) : Array.isArray(left) ? left.some((value) => Object.is(value, right)) : false;
    case 'gt': return typeof left === 'number' && typeof right === 'number' && left > right;
    case 'gte': return typeof left === 'number' && typeof right === 'number' && left >= right;
    case 'lt': return typeof left === 'number' && typeof right === 'number' && left < right;
    case 'lte': return typeof left === 'number' && typeof right === 'number' && left <= right;
    default: return false;
  }
}

export async function eseguiFlowForgeLocale(manifest, input, { capacitaFn } = {}) {
  if (typeof capacitaFn !== 'function') throw new Error('TALOS_FORGE_CAPABILITY_UNAVAILABLE');
  const vars = Object.create(null);
  vars.input = input;
  vars.state = Object.create(null);
  const trace = [];
  const nodes = new Map(manifest.flow.nodes.map((node) => [node.id, node]));
  let currentId = manifest.flow.entry;
  let transitions = 0;
  const limit = Number.isFinite(manifest.flow.maxTransitions) ? Math.min(manifest.flow.maxTransitions, MAX_TRANSITIONS) : MAX_TRANSITIONS;
  const pathFailure = (error) => ({ status: 'failed', error: { code: 'TALOS_FORGE_PATH_UNSAFE', message: error instanceof Error ? error.message : String(error) }, trace });
  while (true) {
    transitions += 1;
    if (transitions > limit) return { status: 'failed', error: { code: 'TALOS_FORGE_MAX_TRANSITIONS', message: 'The tool ran too many steps without finishing.' }, trace };
    const node = nodes.get(currentId);
    if (!node) return { status: 'failed', error: { code: 'TALOS_FORGE_NODE_MISSING', message: `Node "${currentId}" does not exist.` }, trace };
    if (node.type === 'capability') {
      let resolved;
      try { resolved = forgeResolveExpression(node.input, vars); } catch (error) { return pathFailure(error); }
      let result;
      try { result = await capacitaFn(node.capability, resolved); } catch (error) { return { status: 'failed', error: { code: 'TALOS_FORGE_CAPABILITY_FAILED', message: `Capability "${node.capability}" failed: ${error instanceof Error ? error.message : String(error)}` }, trace }; }
      trace.push({ node: node.id, type: 'capability', capability: node.capability });
      if (node.target) { try { forgeWritePath(vars, node.target, result); } catch (error) { return pathFailure(error); } }
      currentId = node.next;
    } else if (node.type === 'if') {
      let outcome;
      try { outcome = forgeEvaluateCondition(node.condition, vars); } catch (error) { return pathFailure(error); }
      trace.push({ node: node.id, type: 'if', result: outcome });
      currentId = outcome ? node.then : node.else;
    } else if (node.type === 'return') {
      let output;
      try { output = forgeResolveExpression(node.value, vars); } catch (error) { return pathFailure(error); }
      trace.push({ node: node.id, type: 'return' });
      return { status: 'succeeded', output, trace };
    } else if (node.type === 'fail') {
      trace.push({ node: node.id, type: 'fail' });
      return { status: 'failed', error: { code: node.code, message: node.message }, trace };
    } else {
      return { status: 'failed', error: { code: 'TALOS_FORGE_NODE_TYPE_UNKNOWN', message: `Unknown node type "${node.type}".` }, trace };
    }
  }
}

