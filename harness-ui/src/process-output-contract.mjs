import {isAbsolute} from 'node:path';

export const OUTPUT_CHUNK_BYTES = 65_536;
export const OUTPUT_MAX_REQUESTS = 64;
export class ProcessOutputStoreError extends Error {
  constructor(message, code = 'OUTPUT_STORE_IO') {super(message); this.name = 'ProcessOutputStoreError'; this.code = code;}
}
const invalid = () => {throw new ProcessOutputStoreError('Invalid process output storage input', 'OUTPUT_INVALID_INPUT');};
const id = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
  return value;
};
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
};
const stream = value => {if (value !== 'stdout' && value !== 'stderr') invalid(); return value;};
export function normalizzaMetadatiCattura(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schema !== 'talos.process-output-metadata.v1'
      || Object.keys(value).some(k => !['schema', 'controlFooter'].includes(k))) invalid();
  const f = value.controlFooter;
  if (f === null) return Object.freeze({schema: value.schema, controlFooter: null});
  if (!f || typeof f !== 'object' || Array.isArray(f)
      || Object.keys(f).some(k => !['type', 'stream', 'marker', 'prefixBytes'].includes(k))
      || f.type !== 'cwd-marker-v1' || f.stream !== 'stdout'
      || typeof f.marker !== 'string' || !/^__TALOS_CWD_[a-f0-9]{16}__$/.test(f.marker)
      || ![0, 1].includes(f.prefixBytes)) invalid();
  return Object.freeze({schema: value.schema, controlFooter: Object.freeze({type: f.type, stream: f.stream, marker: f.marker, prefixBytes: f.prefixBytes})});
}
export function normalizzaConfigurazioneOutput({databasePath, maxOutputBytes} = {}) {
  if (typeof databasePath !== 'string' || databasePath.includes('\0') || (databasePath !== ':memory:' && !isAbsolute(databasePath))) invalid();
  return {databasePath, maxOutputBytes: integer(maxOutputBytes, 1)};
}
export function normalizzaRichiestaOutput(method, args = {}) {
  if (method === 'health' || method === 'close') return {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) invalid();
  if (method === 'listSessionDeletions') {
    if (Object.keys(args).some(k => !['after', 'limit'].includes(k))) invalid();
    return {after: args.after == null ? null : id(args.after), limit: integer(args.limit ?? 128, 1, 256)};
  }
  if (['beginSessionDeletion', 'cancelSessionDeletion', 'completeSessionDeletion'].includes(method)) {
    if (Object.keys(args).some(k => !['sessionId', 'operationId'].includes(k))) invalid();
    const operationId = id(args.operationId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(operationId)) invalid();
    return {sessionId: id(args.sessionId), operationId};
  }
  const result = {sessionId: id(args.sessionId), outputId: id(args.outputId)};
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(result.outputId)) invalid();
  if (method === 'begin') return {...result, runId: id(args.runId), toolCallId: id(args.toolCallId)};
  if (method === 'inspect') return result;
  if (method === 'readPage') return {...result, stream: stream(args.stream), offset: integer(args.offset ?? 0), limit: integer(args.limit ?? OUTPUT_CHUNK_BYTES, 1, OUTPUT_CHUNK_BYTES)};
  result.sequence = integer(args.sequence);
  if (method === 'append') {
    if (!(args.bytes instanceof Uint8Array) || !args.bytes.length || args.bytes.length > OUTPUT_CHUNK_BYTES) invalid();
    return {...result, stream: stream(args.stream), bytes: Uint8Array.from(args.bytes), ...(args.metadata === undefined ? {} : {metadata: normalizzaMetadatiCattura(args.metadata)})};
  }
  if (method === 'finish') {
    // 'background' (08/10/2026): il comando è passato in sottofondo VIVO; ciò che aveva scritto fino a lì è conservato e completo.
    if (!['exited', 'cancelled', 'timeout', 'spawn-error', 'background'].includes(args.termination)) invalid();
    let controlFooter;
    if (args.controlFooter !== undefined) {
      const f = args.controlFooter;
      if (!f || Array.isArray(f) || f.type !== 'cwd-marker-v1' || f.stream !== 'stdout' || !/^__TALOS_CWD_[a-f0-9]{16}__$/.test(f.marker)) invalid();
      controlFooter = {type: f.type, stream: f.stream, marker: f.marker};
    }
    return {...result, termination: args.termination, exitCode: args.exitCode === null ? null : integer(args.exitCode, -2_147_483_648, 2_147_483_647), ...(controlFooter ? {controlFooter} : {}), ...(args.metadata === undefined ? {} : {metadata: normalizzaMetadatiCattura(args.metadata)})};
  }
  if (method === 'fail') {
    if (typeof args.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/u.test(args.code)) invalid();
    return {...result, code: args.code};
  }
  invalid();
}
