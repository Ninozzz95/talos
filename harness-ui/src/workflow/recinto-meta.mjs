/*
 * 05/11/2026 — WORKFLOW PROGRAM, BLOCK 1 (decision 234, «one engine, two doors»): the `meta` header of a program.
 *
 * A program starts with `export const meta = { name, description, maxAgents, ... }`, like a Claude Code workflow script. The
 * header is read STATICALLY here, never executed: it must be a pure literal (strings, numbers, booleans, null, arrays, objects,
 * template strings without `${}`), so the card and the caps can trust it before a single line of the program runs.
 * `maxAgents` is mandatory (integer 1..200): the dry run of block 2 cannot bound loops that depend on results, the declared cap
 * can (CONFRONTO-FORMA-WORKFLOW-2026-11-05.md, sec. 2).
 *
 * The body keeps its line numbers: the header is replaced by blanks with the same newlines, so an error on line N of the body
 * is reported on line N of what the model wrote.
 *
 * Errors carry ONE actionable hint, like Hermes's sandbox (hermes-agent tools/code_execution_tool.py:175-190,
 * `_sandbox_failure_hint`: «one actionable recovery hint, first match wins»).
 */

export const MAX_PROGRAM_BYTES = 256 * 1024;
export const MAX_META_BYTES = 16 * 1024;
export const MAX_AGENTS_CEILING = 200;

export class WorkflowProgramError extends Error {
  constructor(code, message, hint = null) {
    super(message);
    this.name = 'WorkflowProgramError';
    this.code = code;
    this.hint = hint;
  }
}

const META_HINT = "Start the program with: export const meta = { name: 'short-name', description: 'what it does', maxAgents: 10 }";

function invalid(message, hint = META_HINT) {
  throw new WorkflowProgramError('WORKFLOW_PROGRAM_INVALID', message, hint);
}

function position(source, index) {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  return `line ${line}, column ${index - before.lastIndexOf('\n')}`;
}

/** Recursive-descent reader of a pure JS literal. Returns { value, end }. */
function readLiteral(source, start) {
  let i = start;
  const fail = (what) => invalid(`meta must be a plain literal: ${what} at ${position(source, i)}`,
    'Write meta with literal values only (no variables, calls, operators or ${} in template strings).');

  const skip = () => {
    for (;;) {
      while (i < source.length && /\s/u.test(source[i])) i += 1;
      if (source.startsWith('//', i)) { const n = source.indexOf('\n', i); i = n === -1 ? source.length : n; continue; }
      if (source.startsWith('/*', i)) { const n = source.indexOf('*/', i + 2); if (n === -1) fail('unterminated comment'); i = n + 2; continue; }
      return;
    }
  };

  const readString = () => {
    const quote = source[i];
    i += 1;
    let out = '';
    while (i < source.length && source[i] !== quote) {
      const c = source[i];
      if (quote === '`' && c === '$' && source[i + 1] === '{') fail('a ${} expression inside a template string');
      if (quote !== '`' && c === '\n') fail('a line break inside a string');
      if (c !== '\\') { out += c; i += 1; continue; }
      const e = source[i + 1];
      i += 2;
      const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\\': '\\', "'": "'", '"': '"', '`': '`', '$': '$', '\n': '' };
      if (Object.hasOwn(simple, e)) { out += simple[e]; continue; }
      if (e === 'u') {
        let hex;
        if (source[i] === '{') { const close = source.indexOf('}', i); hex = source.slice(i + 1, close); i = close + 1; }
        else { hex = source.slice(i, i + 4); i += 4; }
        const code = /^[0-9a-fA-F]{1,6}$/u.test(hex) ? Number.parseInt(hex, 16) : NaN;
        if (!(code <= 0x10ffff)) fail('an invalid \\u escape');
        out += String.fromCodePoint(code);
        continue;
      }
      if (e === 'x') {
        const hex = source.slice(i, i + 2);
        if (!/^[0-9a-fA-F]{2}$/u.test(hex)) fail('an invalid \\x escape');
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
      fail(`an unsupported escape \\${e}`);
    }
    if (i >= source.length) fail('an unterminated string');
    i += 1;
    return out;
  };

  const readValue = (depth) => {
    if (depth > 32) fail('nesting deeper than 32');
    skip();
    const c = source[i];
    if (c === '{') {
      i += 1;
      const object = {};
      for (;;) {
        skip();
        if (source[i] === '}') { i += 1; return object; }
        let key;
        if (source[i] === '"' || source[i] === "'") key = readString();
        else {
          const m = /^[A-Za-z_$][\w$]*/u.exec(source.slice(i, i + 256));
          if (!m) fail('an invalid property name');
          key = m[0];
          i += key.length;
        }
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail(`the reserved key ${key}`);
        if (Object.hasOwn(object, key)) fail(`the duplicate key ${key}`);
        skip();
        if (source[i] !== ':') fail(`a missing ':' after ${key} (shorthand and methods are not literals)`);
        i += 1;
        object[key] = readValue(depth + 1);
        skip();
        if (source[i] === ',') { i += 1; continue; }
        if (source[i] === '}') { i += 1; return object; }
        fail(`an unexpected '${source[i] ?? 'end of program'}'`);
      }
    }
    if (c === '[') {
      i += 1;
      const array = [];
      for (;;) {
        skip();
        if (source[i] === ']') { i += 1; return array; }
        array.push(readValue(depth + 1));
        skip();
        if (source[i] === ',') { i += 1; continue; }
        if (source[i] === ']') { i += 1; return array; }
        fail(`an unexpected '${source[i] ?? 'end of program'}'`);
      }
    }
    if (c === '"' || c === "'" || c === '`') return readString();
    const number = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u.exec(source.slice(i, i + 64));
    if (number) {
      const after = source[i + number[0].length];
      if (after !== undefined && /[\w$.]/u.test(after)) fail('an invalid number');
      i += number[0].length;
      return Number(number[0]);
    }
    for (const [word, value] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(word, i) && !/[\w$]/u.test(source[i + word.length] ?? '')) { i += word.length; return value; }
    }
    fail(c === undefined ? 'the end of the program' : `'${source.slice(i, i + 12)}'`);
  };

  const value = readValue(0);
  // What follows the literal must end the statement: an operator or a call would make it an expression.
  const save = i;
  skip();
  if (source[i] === ';') i += 1;
  else if (i < source.length && !source.slice(save, i).includes('\n')) fail(`'${source[i]}' after the literal`);
  else i = save;
  return { value, end: i };
}

function validateMeta(meta) {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) invalid('meta must be an object');
  if (typeof meta.name !== 'string' || meta.name.trim() === '' || meta.name.length > 128) invalid('meta.name is required: a non-empty string of at most 128 characters');
  if (typeof meta.description !== 'string' || meta.description.trim() === '' || meta.description.length > 2000) {
    invalid('meta.description is required: a non-empty string of at most 2000 characters');
  }
  if (!Number.isSafeInteger(meta.maxAgents) || meta.maxAgents < 1 || meta.maxAgents > MAX_AGENTS_CEILING) {
    invalid(`meta.maxAgents is required: an integer from 1 to ${MAX_AGENTS_CEILING} (found ${JSON.stringify(meta.maxAgents)})`,
      'Declare the most agents the program may start, loops included: meta.maxAgents: 20');
  }
  if (meta.phases !== undefined && (!Array.isArray(meta.phases) || meta.phases.some((p) => p === null || typeof p !== 'object' || typeof p.title !== 'string'))) {
    invalid('meta.phases must be an array of { title: string }');
  }
  if (Buffer.byteLength(JSON.stringify(meta)) > MAX_META_BYTES) invalid(`meta is larger than ${MAX_META_BYTES} bytes`);
  return meta;
}

/** Reads the header of a program. Returns { meta, body } with body = source with the header blanked (newlines kept). */
export function estraiMeta(source) {
  if (typeof source !== 'string' || source.trim() === '') invalid('the program is empty');
  if (Buffer.byteLength(source) > MAX_PROGRAM_BYTES) {
    invalid(`the program is larger than ${MAX_PROGRAM_BYTES} bytes`, 'Move data into args instead of writing it in the program.');
  }
  let i = 0;
  for (;;) {
    while (i < source.length && /\s/u.test(source[i])) i += 1;
    if (source.startsWith('//', i)) { const n = source.indexOf('\n', i); i = n === -1 ? source.length : n; continue; }
    if (source.startsWith('/*', i)) { const n = source.indexOf('*/', i + 2); if (n === -1) invalid('unterminated comment'); i = n + 2; continue; }
    break;
  }
  const header = /^export\s+const\s+meta\s*=/u.exec(source.slice(i, i + 64));
  if (!header) invalid('the program must start with export const meta = { ... }');
  const { value, end } = readLiteral(source, i + header[0].length);
  const meta = validateMeta(value);
  const body = source.slice(0, end).replace(/[^\n]/gu, ' ') + source.slice(end);
  return { meta, body };
}
