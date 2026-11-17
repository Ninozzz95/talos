/*
 * Workflow program header (recinto-meta.mjs) and guest prelude (recinto-prelude.mjs): the review of 05/11/2026 found 14 of 17
 * meta mutants and most prelude mutants alive (WF-BLOCCO1-REVISIONE-PROVE). Each row below fails one of them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_META_BYTES, MAX_PROGRAM_BYTES, estraiMeta } from '../src/workflow/recinto-meta.mjs';
import { eseguiNelRecinto } from '../src/workflow/recinto.mjs';

const OK = "name: 'n', description: 'd', maxAgents: 1";
const src = (literal, body = '\nreturn 1') => `export const meta = ${literal}${body}`;
const invalid = (source, pattern) => assert.throws(() => estraiMeta(source), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID' && pattern.test(e.message), `${source.slice(0, 120)} -> ${pattern}`);

test('META rejection table: every non-literal form is refused with its reason', () => {
  const rows = [
    [`{ ${OK}, x: ${'['.repeat(33)}${']'.repeat(33)} }`, /nesting deeper than 32/u],
    [`{ ${OK}, __proto__: 1 }`, /the reserved key __proto__/u],
    [`{ ${OK}, 'constructor': 1 }`, /the reserved key constructor/u],
    [`{ ${OK}, prototype: 1 }`, /the reserved key prototype/u],
    [`{ ${OK}, name: 'again' }`, /the duplicate key name/u],
    [`{ ${OK}, x }`, /a missing ':' after x/u],
    [`{ ${OK}, x() { return 1 } }`, /a missing ':'/u],
    [`{ ${OK}, x: 'a\nb' }`, /a line break inside a string/u],
    [`{ ${OK}, x: '\\u{110000}' }`, /an invalid \\u escape/u],
    [`{ ${OK}, x: '\\uZZZZ' }`, /an invalid \\u escape/u],
    [`{ ${OK}, x: '\\xZ1' }`, /an invalid \\x escape/u],
    [`{ ${OK}, x: '\\q' }`, /an unsupported escape \\q/u],
    [`{ ${OK}, x: 1x }`, /an invalid number/u],
    [`{ ${OK}, x: 1.2.3 }`, /an invalid number/u],
    [`{ ${OK} } + 1`, /'\+' after the literal/u],
    [`{ ${OK} }.name`, /'\.' after the literal/u],
    [`{ ${OK}, x: \`\${1}\` }`, /a \$\{\} expression/u],
    [`{ ${OK}, x: y }`, /meta must be a plain literal: 'y \}/u],
    [`{ ${OK}, x: 1 /* open }`, /unterminated comment/u],
    [`{ ${OK}, x: 1 ]`, /an unexpected '\]'/u],
    [`{ ${OK}, 1: 2 }`, /an invalid property name/u],
  ];
  for (const [literal, pattern] of rows) invalid(src(literal), pattern);
  invalid('const meta = {}', /must start with export const meta/u);
  invalid('   \n  ', /the program is empty/u);
  invalid('/* never closed', /unterminated comment/u);
  invalid(`export const meta = { ${OK}, x: 'open }`, /an unterminated string/u);
  assert.match((() => { try { estraiMeta(src(`{ ${OK},\n  x: y }`)); } catch (e) { return e.message; } })(), /line 2, column 6/u);
});

test('META field rules: name, description, maxAgents, phases and the byte caps, at their boundaries', () => {
  const field = (extra) => src(`{ name: 'n', description: 'd', maxAgents: 1, ${extra} }`);
  for (const name of ["''", "'   '", `'${'x'.repeat(129)}'`, '1']) invalid(src(`{ name: ${name}, description: 'd', maxAgents: 1 }`), /meta\.name is required/u);
  assert.equal(estraiMeta(src(`{ name: '${'x'.repeat(128)}', description: 'd', maxAgents: 1 }`)).meta.name.length, 128);
  for (const d of ["''", "' '", `'${'x'.repeat(2001)}'`]) invalid(src(`{ name: 'n', description: ${d}, maxAgents: 1 }`), /meta\.description is required/u);
  assert.equal(estraiMeta(src(`{ name: 'n', description: '${'x'.repeat(2000)}', maxAgents: 1 }`)).meta.description.length, 2000);
  for (const m of ['0', '201', '1.5', "'3'", '-1']) invalid(src(`{ name: 'n', description: 'd', maxAgents: ${m} }`), /meta\.maxAgents is required/u);
  for (const m of [1, 200]) assert.equal(estraiMeta(src(`{ name: 'n', description: 'd', maxAgents: ${m} }`)).meta.maxAgents, m);
  for (const p of ["'x'", '[{}]', '[null]', '[{ title: 1 }]']) invalid(field(`phases: ${p}`), /meta\.phases must be an array/u);
  assert.deepEqual(estraiMeta(field("phases: [{ title: 'A' }]")).meta.phases, [{ title: 'A' }]);
  invalid('export const meta = [1]\nreturn 1', /meta must be an object/u);
  invalid(field(`pad: '${'x'.repeat(MAX_META_BYTES)}'`), /meta is larger than 16384 bytes/u);
  assert.ok(estraiMeta(field(`pad: '${'x'.repeat(MAX_META_BYTES - 200)}'`)).meta.pad);
  const exact = src(`{ ${OK} }`, '\n//');
  const atCap = exact + 'x'.repeat(MAX_PROGRAM_BYTES - Buffer.byteLength(exact));
  assert.equal(Buffer.byteLength(atCap), MAX_PROGRAM_BYTES);
  assert.ok(estraiMeta(atCap).meta);
  invalid(atCap + 'x', /the program is larger than 262144 bytes/u);
});

test('META accepted forms: escapes, nesting 32, comments, quotes, numbers; the header is blanked keeping lines', () => {
  const { meta } = estraiMeta(src(`{ name: '\\u0041\\u{1F600}\\x41\\n\\t\\\\\\'', description: "d\\"q", maxAgents: 1, t: \`x\\\`y\`, n: [-1.5, .5, 2e3, true, false, null], deep: ${'['.repeat(32)}${']'.repeat(32)} }`));
  assert.equal(meta.name, 'A\u{1F600}A\n\t\\\'');
  assert.equal(meta.description, 'd"q');
  assert.equal(meta.t, 'x`y');
  assert.deepEqual(meta.n, [-1.5, 0.5, 2000, true, false, null]);
  const source = `// leading comment\n/* block */ export const meta = { ${OK}, // inline\n  x: 1 };\nconst a = 1\nreturn a`;
  const { body } = estraiMeta(source);
  assert.equal(body.length, source.length);
  assert.equal(body.split('\n').length, source.split('\n').length);
  assert.match(body, /^[ \n]+\nconst a = 1\nreturn a$/u);
  assert.ok(estraiMeta(src(`{ ${OK} }`, '\n+ 1')).body.endsWith('\n+ 1'), 'a line break ends the literal');
});

const META = "export const meta = { name: 'probe', description: 'sandbox probe', maxAgents: 20 }\n";
const echo = async (p, o, ctx) => { await ctx.reserve(); return { value: p, costUsd: 0 }; };
const run = (body, extra = {}) => eseguiNelRecinto({ source: META + body, agent: echo, caps: { maxUsd: 1, estimateUsd: 0.01 }, ...extra });
const typeError = async (body, pattern) => {
  const out = await run(body);
  assert.equal(out.outcome, 'error', body);
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_FAILED', body);
  assert.match(out.error.message, pattern, body);
};

test('PRELUDE argument checks: agent, parallel, pipeline, phase', async () => {
  await typeError("return await agent('')", /prompt must be a non-empty string/u);
  await typeError('return await agent(5)', /prompt must be a non-empty string/u);
  for (const o of ['[]', 'null', '5']) await typeError(`return await agent('x', ${o})`, /agent\(prompt, options\): options must be an object when given/u);
  await typeError('return await parallel(5)', /pass an array of functions/u);
  await typeError("return await pipeline('x', (r) => r)", /items must be an array/u);
  await typeError('return await pipeline([1], 5)', /every stage must be a function/u);
  await typeError("phase('')", /title must be a non-empty string/u);
  await typeError('phase(1)', /title must be a non-empty string/u);
});

test('PRELUDE behaviour: thunks that are values, pipeline stage arguments, rethrows, frozen globals, JSON output', async () => {
  const out = await run("return [await parallel([5, () => 6, () => { throw new Error('x') }]), await pipeline([1, 2], (r) => r * 2, (r, item, index) => r + item * 10 + index * 100), await pipeline([1], () => { throw new Error('x') })]");
  assert.deepEqual(out.value, [[5, 6, null], [12, 124], [null]]);
  const rethrown = await run('return await pipeline([1], () => Date.now())');
  assert.equal(rethrown.error?.code, 'WORKFLOW_PROGRAM_NONDETERMINISTIC', 'pipeline() does not hide a blocked clock as null');
  const deep = await run('function f() { return f() + 1 } return await pipeline([1], () => f())');
  assert.equal(deep.outcome, 'stack_limit', 'pipeline() re-throws an InternalError instead of turning it into null');

  const frozen = await run("'use strict'; const r = []; for (const f of [() => { agent = 1 }, () => { meta.name = 'x' }, () => { args.a = 2 }, () => { budget().agents = 9 }, () => { Date.now = () => 1 }]) { try { f(); r.push('changed') } catch (e) { r.push(e.name) } } return [r, typeof agent, meta.name, args.a, Object.isFrozen(budget())]", { args: { a: 1 } });
  assert.deepEqual(frozen.value, [['TypeError', 'TypeError', 'TypeError', 'TypeError', 'TypeError'], 'function', 'probe', 1, true]);

  for (const body of ['return 1n', 'const o = {}; o.o = o; return o']) {
    const bad = await run(body);
    assert.equal(bad.outcome, 'error', body);
    assert.equal(bad.error.code, 'WORKFLOW_PROGRAM_OUTPUT_INVALID', body);
  }
  assert.equal((await run('return undefined')).value, null);
  assert.equal((await run('return () => 1')).value, null);
  assert.equal((await run("return Date.parse('2020-01-01T00:00:00Z')")).value, 1577836800000);
  const thrown = await run("throw 'plain text'");
  assert.equal(thrown.outcome, 'error');
  assert.match(thrown.error.message, /plain text/u);
  const coded = await run("const e = new Error('mine'); e.code = 'MY_CODE'; e.hint = 'my hint'; throw e");
  assert.equal(coded.error.code, 'WORKFLOW_PROGRAM_FAILED', 'a program cannot forge a code outside its namespace');
  // Review 2, LOW 3 (06/11): a hint or a WORKFLOW_PROGRAM_ code written by the guest is not trusted; only host-issued ones are.
  assert.notEqual(coded.error.hint, 'my hint', 'a program cannot forge the hint either');
  assert.equal((await run("const e = new Error('x'); e.code = 'WORKFLOW_PROGRAM_SPEND_CAP'; throw e")).error.code, 'WORKFLOW_PROGRAM_FAILED', 'nor a code inside the namespace');
  const logged = await run("const c = {}; c.c = c; log('a', 1, { b: 2 }, c); return 1");
  assert.deepEqual(logged.logs, ['a 1 {"b":2} [object Object]']);
});
