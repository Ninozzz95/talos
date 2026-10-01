import test from 'node:test';
import assert from 'node:assert/strict';
const url = new URL('../../src/components/session-deletion-feedback.js', import.meta.url);
const api = await import(url.href).catch(e => {if (e.code === 'ERR_MODULE_NOT_FOUND' && e.url === url.href) return {}; throw e;});
function memory() {
  const values = new Map([['unrelated', 'keep']]);
  return {values, getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k)};
}
function setup(storage = memory()) {
  assert.equal(typeof api.creaAvvisiEliminazione, 'function', 'deletion cleanup must have a persistent user-visible receipt');
  const shown = [], close = new EventTarget();
  const feedback = api.creaAvvisiEliminazione({storage: () => storage, mostraToast: (...args) => {shown.push(args); return {querySelector: () => close};}});
  return {feedback, storage, shown, close};
}
test('OUTPUT19-RELOAD: pending output survives reload until explicit acknowledgement', () => {
  const a = setup();
  assert.deepEqual(a.feedback.registra({outputCleanup: {state: 'pending', code: 'OUTPUT_STORE_IO'}}), {pending: true, persisted: true});
  const b = setup(a.storage); assert.equal(b.feedback.pendente(), true); b.feedback.mostra();
  assert.equal(b.shown[0][2].durata, 0); assert.equal(b.shown[0][2].tono, 'guasto');
  assert.match(b.shown[0][1], /output/); assert.doesNotMatch(b.shown[0][1], /OUTPUT_STORE_IO/);
  b.shown[0][2].azione.esegui(); assert.equal(setup(a.storage).feedback.pendente(), false);
  assert.equal(a.storage.values.get('unrelated'), 'keep');
});
test('OUTPUT19-MERGE: output and workflow warnings accumulate; subsequent complete deletion never hides them', () => {
  const a = setup();
  a.feedback.registra({workflowNonEliminati: [{runId: 'private', code: 'secret'}]});
  a.feedback.registra({outputCleanup: {state: 'pending'}});
  a.feedback.registra({outputCleanup: {state: 'complete'}, workflowNonEliminati: []});
  a.feedback.mostra(); assert.match(a.shown[0][1], /output/); assert.match(a.shown[0][1], /automazioni/);
  assert.doesNotMatch([...a.storage.values.values()].join(''), /private|secret/);
});
test('OUTPUT19-LEGACY: a successful legacy response adds no cleanup warning', () => {
  const a = setup(); assert.deepEqual(a.feedback.registra({ok: true}), {pending: false, persisted: true});
  assert.equal(a.feedback.mostra(), null); assert.equal(a.shown.length, 0);
});
test('OUTPUT19-CORRUPT: malformed, oversized or unknown storage never becomes notification content', () => {
  for (const raw of ['bad', 'x'.repeat(257), 'null', '{"schema":"talos.session-deletion-feedback.v1","output":"yes","workflow":false}', '{"schema":"talos.session-deletion-feedback.v1","output":true,"workflow":false,"html":"<img>"}']) {
    const storage = memory(); storage.setItem('talos.session-deletion-feedback.v1', raw);
    const a = setup(storage); assert.equal(a.feedback.pendente(), false); assert.equal(a.feedback.mostra(), null);
  }
});
test('OUTPUT19-STORAGE-DENIED: no storage never hides a pending warning; close invokes deferred navigation once', () => {
  const storage = {getItem() {throw Error('denied');}, setItem() {throw Error('quota');}, removeItem() {throw Error('denied');}};
  const a = setup(storage); assert.deepEqual(a.feedback.registra({outputCleanup: {state: 'pending'}}), {pending: true, persisted: false});
  let navigated = 0; a.feedback.mostra({dopoLettura: () => navigated++});
  a.close.dispatchEvent(new Event('click')); a.shown[0][2].azione.esegui();
  assert.equal(navigated, 1); assert.equal(a.feedback.pendente(), false);
});
test('OUTPUT19-GETTER-DENIED: blocked storage property is handled without losing the current receipt', () => {
  assert.equal(typeof api.creaAvvisiEliminazione, 'function');
  const f = api.creaAvvisiEliminazione({storage: () => {throw Error('security');}, mostraToast() {}});
  assert.deepEqual(f.registra({workflowNonEliminati: [{}]}), {pending: true, persisted: false});
});
