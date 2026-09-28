import { createHash } from 'node:crypto';

import canonicalize from 'canonicalize';

const MAX_CANONICAL_DEPTH = 256;
const MAX_CANONICAL_NODES = 500_000;

export class WorkflowCanonicalJsonError extends Error {
  constructor(message, code = 'WORKFLOW_CANONICAL_JSON_INVALID') {
    super(message);
    this.name = 'WorkflowCanonicalJsonError';
    this.code = code;
  }
}

function invalid(message, path) {
  throw new WorkflowCanonicalJsonError(`${message} (${path})`);
}

function validateUnicode(value, path) {
  if (!value.isWellFormed()) invalid('Unicode contiene un surrogato isolato', path);
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const low = codePoint & 0xffff;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || low === 0xfffe || low === 0xffff) {
      invalid('Unicode contiene un noncharacter I-JSON', path);
    }
  }
}

function validatePrimitive(value, path) {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    validateUnicode(value, path);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('Il numero deve essere finito', path);
    // ⛔ 22/09/2026 — errata verificata RFC 8785 n. 7920: -0 e +0 hanno
    // la stessa serializzazione. Rifiutare -0 evita di firmare due intenti come uno.
    if (Object.is(value, -0)) invalid('Lo zero negativo non è canonicalizzabile senza perdita', path);
    return;
  }
  invalid(`Tipo non JSON: ${typeof value}`, path);
}

function isArrayIndex(key, length) {
  if (!/^(0|[1-9][0-9]*)$/u.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function inspectArray(value, path, depth, stack) {
  if (value.length > MAX_CANONICAL_NODES) invalid('Array oltre il limite di sicurezza', path);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key === 'symbol') invalid('Una chiave Symbol non appartiene a JSON', path);
    if (key === 'length') continue;
    if (!isArrayIndex(key, value.length)) invalid('Array con proprietà non indicizzate', `${path}.${key}`);
  }
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (!Object.hasOwn(value, index)) invalid('Array sparso non ammesso', `${path}[${index}]`);
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      invalid('Elemento array non enumerabile o accessor', `${path}[${index}]`);
    }
    stack.push({ depth: depth + 1, path: `${path}[${index}]`, value: descriptor.value });
  }
}

function inspectObject(value, path, depth, stack) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid('Sono ammessi soltanto oggetti JSON semplici', path);
  }
  for (const key of Reflect.ownKeys(value).reverse()) {
    if (typeof key === 'symbol') invalid('Una chiave Symbol non appartiene a JSON', path);
    validateUnicode(key, `${path}.<chiave>`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) invalid('Stato non enumerabile non ammesso', `${path}.${key}`);
    if (!Object.hasOwn(descriptor, 'value')) invalid('Getter e setter non sono ammessi', `${path}.${key}`);
    stack.push({ depth: depth + 1, path: `${path}.${key}`, value: descriptor.value });
  }
}

export function validateCanonicalizable(value) {
  const active = new WeakSet();
  const stack = [{ depth: 0, path: '$', value }];
  let visited = 0;

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame.leave) {
      active.delete(frame.value);
      continue;
    }
    visited += 1;
    if (visited > MAX_CANONICAL_NODES) invalid('Valore oltre il limite di nodi', frame.path);
    if (frame.depth > MAX_CANONICAL_DEPTH) invalid('Valore oltre il limite di profondità', frame.path);

    if (frame.value === null || typeof frame.value !== 'object') {
      validatePrimitive(frame.value, frame.path);
      continue;
    }
    if (active.has(frame.value)) invalid('Riferimento circolare non ammesso', frame.path);
    active.add(frame.value);
    stack.push({ leave: true, value: frame.value });

    if (Array.isArray(frame.value)) {
      inspectArray(frame.value, frame.path, frame.depth, stack);
    } else {
      inspectObject(frame.value, frame.path, frame.depth, stack);
    }
  }
  return true;
}

export function canonicalJson(value) {
  validateCanonicalizable(value);
  try {
    const serialized = canonicalize(value);
    if (typeof serialized !== 'string') invalid('La canonicalizzazione non ha prodotto testo', '$');
    return serialized;
  } catch (error) {
    if (error instanceof WorkflowCanonicalJsonError) throw error;
    throw new WorkflowCanonicalJsonError(`Canonicalizzazione RFC 8785 fallita: ${error.message}`);
  }
}

export function canonicalHash(value) {
  const bytes = Buffer.from(canonicalJson(value), 'utf8');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
