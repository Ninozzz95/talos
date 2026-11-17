/*
 * 05/11/2026 — WORKFLOW PROGRAM, BLOCK 1 (decision 234): the guest side of the sandbox, evaluated inside QuickJS before the
 * program. Same globals as a Claude Code workflow script (agent, parallel, pipeline, phase, log, args, budget, meta), so models
 * already know them (CONFRONTO-FORMA-WORKFLOW-2026-11-05.md, sec. 5).
 *
 * Determinism (a resumed run must take the same path): Date.now(), argless new Date(), Date() and Math.random() throw, like
 * Temporal's workflow sandbox replaces them (temporal sdk-typescript packages/workflow/src/global-overrides.ts:30-39) and
 * Codex's code mode strips its globals (codex-rs code-mode-runtime/src/runtime/globals.rs:20-51). The original Date constructor
 * stays only in this closure: Date.prototype.constructor is rewired, so `new (new Date(0).constructor)()` is blocked too.
 *
 * The host functions (__agent, __log, __phase, __budget, __done, __fail, __issue) and the JSON strings (__metaJson, __argsJson) are read
 * once and deleted from the global object. Values cross the boundary as JSON text only: no guest object is ever held by the host.
 *
 * Built-ins the prelude relies on (JSON.stringify/parse, String, Promise.prototype.then, Reflect.apply/construct) are captured
 * here, before the program runs (review 2, LOW 4: a program that redefined JSON.stringify ended as STALLED). A coded error
 * the prelude throws is first announced to the host (__issue): the host believes only codes it has seen issued (LOW 3).
 *
 * parallel()/pipeline(): an ordinary failure becomes null (Claude Code API), but an InternalError (out of memory, stack overflow,
 * interrupted) and a blocked non-deterministic call are re-thrown: a memory bomb or a clock read inside a thunk must not turn
 * into a silent null.
 */
export const PRELUDE = String.raw`(() => {
  'use strict';
  const g = globalThis;
  const hostAgent = g.__agent, hostLog = g.__log, hostPhase = g.__phase, hostBudget = g.__budget;
  const hostDone = g.__done, hostFail = g.__fail, hostIssue = g.__issue;
  const metaJson = g.__metaJson, argsJson = g.__argsJson;
  for (const k of ['__agent', '__log', '__phase', '__budget', '__done', '__fail', '__issue', '__metaJson', '__argsJson']) delete g[k];
  const stringify = JSON.stringify, parse = JSON.parse, toText = String, apply = Reflect.apply, construct = Reflect.construct;
  const then = Promise.prototype.then;

  const define = (name, value) => Object.defineProperty(g, name, { value, writable: false, enumerable: false, configurable: false });
  const deepFreeze = (v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]); }
    return v;
  };
  const HINT = 'pass the value in through args, or let an agent produce it';
  const blocked = (what) => {
    const e = new Error(what + ' is blocked inside a workflow program: it would make a resumed run take a different path');
    e.code = 'WORKFLOW_PROGRAM_NONDETERMINISTIC';
    e.hint = 'Do not read the clock or random numbers in the program: ' + HINT + '.';
    hostIssue(e.code, e.message, e.hint);
    throw e;
  };

  const RealDate = Date;
  function SafeDate(...a) {
    if (!new.target) blocked('Date()');
    if (a.length === 0) blocked('new Date()');
    return construct(RealDate, a, new.target);
  }
  SafeDate.prototype = RealDate.prototype;
  Object.defineProperty(RealDate.prototype, 'constructor', { value: SafeDate, writable: false, configurable: false });
  SafeDate.now = () => blocked('Date.now()');
  SafeDate.parse = RealDate.parse;
  SafeDate.UTC = RealDate.UTC;
  Object.freeze(SafeDate);
  define('Date', SafeDate);
  Object.defineProperty(Math, 'random', { value: () => blocked('Math.random()'), writable: false, configurable: false });

  const mustRethrow = (e) => e != null && (e.name === 'InternalError' || e.code === 'WORKFLOW_PROGRAM_NONDETERMINISTIC');

  function agent(prompt, options) {
    if (typeof prompt !== 'string' || prompt.length === 0) throw new TypeError('agent(prompt, options): prompt must be a non-empty string');
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('agent(prompt, options): options must be an object when given');
    }
    return apply(then, hostAgent(prompt, stringify(options === undefined ? {} : options)), [(text) => parse(text)]);
  }
  async function parallel(thunks) {
    if (!Array.isArray(thunks)) throw new TypeError('parallel(thunks): pass an array of functions, e.g. items.map((x) => () => agent(x))');
    return Promise.all(thunks.map(async (t) => {
      try { return await (typeof t === 'function' ? t() : t); } catch (e) { if (mustRethrow(e)) throw e; return null; }
    }));
  }
  async function pipeline(items, ...stages) {
    if (!Array.isArray(items)) throw new TypeError('pipeline(items, ...stages): items must be an array');
    if (stages.some((s) => typeof s !== 'function')) throw new TypeError('pipeline(items, ...stages): every stage must be a function');
    return Promise.all(items.map(async (item, index) => {
      try { let r = item; for (const stage of stages) r = await stage(r, item, index); return r; } catch (e) { if (mustRethrow(e)) throw e; return null; }
    }));
  }
  const show = (v) => (typeof v === 'string' ? v : (() => { try { const t = stringify(v); return typeof t === 'string' ? t : toText(t); } catch { try { return toText(v); } catch { return '?'; } } })());
  function log(...parts) { hostLog(parts.map(show).join(' ')); }
  function phase(title) {
    if (typeof title !== 'string' || title.length === 0) throw new TypeError('phase(title): title must be a non-empty string');
    hostPhase(title);
  }
  function budget() { return deepFreeze(parse(hostBudget())); }

  define('agent', agent);
  define('parallel', parallel);
  define('pipeline', pipeline);
  define('log', log);
  define('phase', phase);
  define('budget', budget);
  define('meta', deepFreeze(parse(metaJson)));
  define('args', deepFreeze(parse(argsJson)));

  let started = false;
  g.__start = (main) => {
    delete g.__start;
    if (started) return;
    started = true;
    const invalid = (message) => {
      hostIssue('WORKFLOW_PROGRAM_OUTPUT_INVALID', message, '');
      hostFail('TypeError', message, 'WORKFLOW_PROGRAM_OUTPUT_INVALID', '', '');
    };
    apply(then, main(), [(value) => {
      let text;
      try { text = stringify(value === undefined ? null : value); } catch (e) {
        let why = '';
        try { why = toText(e && e.message); } catch { /* a message that cannot be read */ }
        invalid('the program returned a value that is not JSON: ' + why);
        return;
      }
      hostDone(text === undefined ? 'null' : text);
    }, (e) => {
      // Every read of the thrown value can run guest code (getters, toString): one that throws is still a program error.
      let name = 'Error', message = '', code = '', hint = '', stack = '';
      try {
        const isObj = e !== null && typeof e === 'object';
        name = isObj ? toText(e.name) : 'Error';
        message = isObj ? toText(e.message) : toText(e);
        code = isObj && typeof e.code === 'string' ? e.code : '';
        hint = isObj && typeof e.hint === 'string' ? e.hint : '';
        stack = isObj && typeof e.stack === 'string' ? e.stack : '';
      } catch { name = 'Error'; message = 'the program threw a value that could not be read'; code = ''; hint = ''; stack = ''; }
      hostFail(name, message, code, hint, stack);
    }]);
  };
})();
`;
