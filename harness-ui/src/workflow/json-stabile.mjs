/*
 * 05/11/2026 — STABLE JSON for Workflow programs (decision 234, block 1, review cures).
 *
 * The keyed journal hashed the call with canonical-json.mjs, whose I-JSON check REFUSES U+FFFF, U+FFFE, U+FDD0..U+FDEF, the
 * astral non-characters and lone surrogates: a prompt carrying text from a damaged file threw before the host was called
 * (review 2, reproduced). Here every JSON value has ONE text, never refused for its characters:
 *   - JSON.stringify first (toJSON, undefined dropped, -0 written as 0, a Date as its ISO string; BigInt or a cycle throw);
 *   - then object keys sorted by UTF-16 code units, strings written by JSON.stringify (a lone surrogate becomes a \udXXX
 *     escape, so two different strings never share a text).
 * For every value canonical-json.mjs accepts, the text is byte-for-byte the RFC 8785 text (same key order, same number and
 * string forms as the `canonicalize` package, which also calls JSON.stringify), so keys recorded before this change still match.
 * The same text is what the guest receives from an agent call: a live run and a resumed run see the same key order
 * (review 2, finding 4: {z:1,a:2} gave [z,a] live and [a,z] on replay).
 */
import { createHash } from 'node:crypto';

export const MAX_STABLE_DEPTH = 256;

export class WorkflowStableJsonError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkflowStableJsonError';
    this.code = 'WORKFLOW_STABLE_JSON_INVALID';
  }
}

function write(value, depth) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (depth >= MAX_STABLE_DEPTH) throw new WorkflowStableJsonError(`the value is nested deeper than ${MAX_STABLE_DEPTH} levels`);
  if (Array.isArray(value)) return `[${value.map((item) => write(item, depth + 1)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${write(value[key], depth + 1)}`).join(',')}}`;
}

/** The stable text of a value (undefined is written as null). Throws WorkflowStableJsonError for what JSON cannot hold. */
export function jsonStabile(value) {
  let text;
  try { text = JSON.stringify(value === undefined ? null : value); } catch (error) {
    throw new WorkflowStableJsonError(`the value is not JSON: ${error.message}`);
  }
  if (text === undefined) return 'null';
  return write(JSON.parse(text), 0);
}

/** sha256:<hex> of the UTF-8 bytes of the stable text. */
export function improntaStabile(value) {
  return `sha256:${createHash('sha256').update(Buffer.from(jsonStabile(value), 'utf8')).digest('hex')}`;
}
