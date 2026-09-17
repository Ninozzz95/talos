import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { creaSorveglianzaConnessione, RITMO } from '../../src/components/connessione.js';
import { limitiDialogo, misuraDialogo, leggiMisure, salvaMisura, dimenticaMisura } from '../../src/components/dialoghi.js';
import { motion, movimentoSpento, millisecondiDelToken, fermaTutto, quanteVive } from '../../src/components/motion-mockup.js';

function differita() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function banco(ping = async () => false) {
  let seq = 0;
  const jobs = new Map(); const cambi = []; let riprese = 0;
  const sorveglianza = creaSorveglianzaConnessione({
    ping, suCambio: (...args) => cambi.push(args), suRicollegato: () => riprese++,
    pianifica: (fn, ms) => { const id = ++seq; jobs.set(id, { fn, ms }); return id; },
    annulla: id => jobs.delete(id),
  });
  return { s: sorveglianza, jobs, cambi, get riprese() { return riprese; },
    prossimo() {
      const [id, job] = jobs.entries().next().value || [];
      assert.ok(job, 'deve esistere un timer'); jobs.delete(id); return job;
    },
  };
}

test('UI-CONN: una ripresa emette il callback una sola volta anche con un burst di eventi', () => {
  const b = banco(); b.s.segnalaRete(false); b.s.segnalaEventoVivo();
  const timers = [...b.jobs.keys()];
  for (let i = 0; i < 8; i++) { b.s.segnalaEventoVivo(); b.s.segnalaRete(true); }
  assert.equal(b.riprese, 1);
  assert.deepEqual([...b.jobs.keys()], timers, 'gli eventi sani non rinviano la conferma');
  assert.equal(b.prossimo().ms, RITMO.ricollegatoVisibileMs);
});
test('UI-CONN: un ping fallito tardivo non smentisce uno stream già vivo', async () => {
  const p = differita(); const b = banco(() => p.promise);
  b.s.segnalaRete(false); const run = b.prossimo().fn();
  b.s.segnalaEventoVivo(); p.resolve(false); await run;
  assert.equal(b.s.stato(), 'ricollegato');
  assert.equal(b.s.tentativi(), 0);
  assert.equal([...b.jobs.values()].filter(j => j.ms !== RITMO.ricollegatoVisibileMs).length, 0);
});
for (const result of [true, false]) test(`UI-CONN: ferma invalida il ping pendente (${result})`, async () => {
  const p = differita(); const b = banco(() => p.promise);
  b.s.segnalaRete(false); const run = b.prossimo().fn(); b.s.ferma();
  const count = b.cambi.length;
  p.resolve(result); await run;
  assert.equal(b.cambi.length, count); assert.equal(b.riprese, 0); assert.equal(b.jobs.size, 0);
});
test('UI-CONN: una nuova caduta non eredita il successo del vecchio ping', async () => {
  const p = differita(); const b = banco(() => p.promise);
  b.s.segnalaRete(false); const run = b.prossimo().fn();
  b.s.segnalaEventoVivo(); b.s.segnalaRete(false, 'nuova-caduta');
  p.resolve(true); await run;
  assert.equal(b.s.stato(), 'riconnessione'); assert.equal(b.riprese, 1);
  assert.equal(b.jobs.size, 1, 'serve una sonda della nuova epoca');
});
test('UI-CONN: dopo ferma un nuovo segnale esplicito conserva la possibilità di riprendere', () => {
  const b = banco(); b.s.segnalaRete(false); b.s.ferma(); b.s.segnalaSse(0);
  assert.equal(b.s.stato(), 'riconnessione'); assert.equal(b.jobs.size, 1);
});
test('UI-CONN: dopo le risposte negative compare caduto, poi Riprova ripristina il collegamento', async () => {
  let ok = false; const b = banco(async () => ok);
  b.s.segnalaSse(2);
  for (let i = 1; i < RITMO.tentativiPrimaDiArrendersi; i++) await b.prossimo().fn();
  assert.equal(b.s.stato(), 'caduto');
  ok = true; b.s.riprova(); const j = b.prossimo(); assert.equal(j.ms, 0); await j.fn();
  assert.equal(b.s.stato(), 'ricollegato'); assert.equal(b.riprese, 1);
  b.prossimo().fn(); assert.equal(b.s.stato(), 'collegato'); assert.equal(b.jobs.size, 0);
});
test('UI-CONN: Riprova durante un ping non avvia richieste concorrenti', async () => {
  const p = differita(); let calls = 0; const b = banco(() => { calls++; return p.promise; });
  b.s.segnalaRete(false); const run = b.prossimo().fn();
  b.s.riprova(); b.s.riprova();
  while (b.jobs.size) b.prossimo().fn();
  assert.equal(calls, 1); p.resolve(false); await run; b.s.ferma();
});
test('UI-CONN: online è un sospetto da verificare, non una conferma', () => {
  const b = banco(); b.s.segnalaBrowser(false); b.s.segnalaBrowser(true);
  assert.equal(b.s.stato(), 'riconnessione'); assert.equal(b.riprese, 0);
  assert.equal(b.prossimo().ms, 0);
});

for (const [w, h] of [[320, 568], [240, 200], [360, 160], [375, 667], [768, 1024]]) {
  test(`UI-DLG: la misura resta nel viewport ${w}x${h} meno il padding`, () => {
    const limits = limitiDialogo('veloModello', { innerWidth: w, innerHeight: h });
    const size = misuraDialogo(2000, 2000, limits);
    assert.ok(size.width <= w - 48, `${size.width} > ${w - 48}`);
    assert.ok(size.height <= h - 48, `${size.height} > ${h - 48}`);
    assert.ok(limits.minW <= limits.maxW && limits.minH <= limits.maxH);
  });
}
test('UI-DLG: i limiti desktop esistenti restano invariati', () => {
  assert.deepEqual(limitiDialogo('veloModello', { innerWidth: 1440, innerHeight: 900, pad: 24 }),
    { minW: 520, minH: 340, maxW: 1392, maxH: 810 });
});
test('UI-DLG: padding nullo e asimmetrico vengono rispettati', () => {
  assert.equal(limitiDialogo('veloModello', { innerWidth: 320, innerHeight: 568, pad: 0 }).maxW, 320);
  const limits = limitiDialogo('veloModello', { innerWidth: 600, innerHeight: 600, padX: 40, padY: 80 });
  assert.equal(limits.maxW, 520); assert.equal(limits.maxH, 440);
});
test('UI-DLG: il massimo non viene arrotondato fuori da uno spazio frazionario', () => {
  const limits = limitiDialogo('veloModello', { innerWidth: 320.5, innerHeight: 568.5, pad: 24 });
  assert.ok(misuraDialogo(9999, 9999, limits).width <= 272.5);
});
test('UI-DLG: un getter localStorage negato non impedisce il funzionamento dei dialoghi', () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.deepEqual(leggiMisure(), {});
    assert.doesNotThrow(() => salvaMisura('sheet:model', { width: 600, height: 400 }));
    assert.doesNotThrow(() => dimenticaMisura('sheet:model'));
  } finally {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior); else delete globalThis.localStorage;
  }
});
test('UI-DLG: il formato di persistenza resta compatibile', () => {
  const data = new Map(); const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  salvaMisura('sheet:model', { width: 701.1, height: 499.9 }, storage);
  assert.deepEqual(leggiMisure(storage)['sheet:model'], { width: 701, height: 500 });
  dimenticaMisura('sheet:model', storage); assert.deepEqual(leggiMisure(storage), {});
});

function ambienteMotion() {
  const listeners = new Set(); const observers = new Set();
  const media = { matches: false, addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) };
  const classes = () => { const set = new Set(); return { add: v => set.add(v), remove: v => set.delete(v), contains: v => set.has(v) }; };
  const values = new Map([['--talos-motion-duration-surface-enter', '1000ms'], ['--talos-motion-ease', 'ease-out']]);
  const doc = { documentElement: { classList: classes() }, body: { classList: classes() } };
  doc.defaultView = {
    matchMedia: () => media,
    getComputedStyle: () => ({ getPropertyValue: key => values.get(key) || '' }),
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe() { observers.add(this); } disconnect() { observers.delete(this); } },
  };
  const el = () => ({ animate() {
    const finished = differita();
    return { finished: finished.promise, cancelled: false, cancel() { this.cancelled = true; finished.reject(new Error('AbortError')); }, complete() { finished.resolve(); } };
  } });
  return { doc, values, listeners, observers, el,
    mediaChange(value) { media.matches = value; for (const f of [...listeners]) f(); },
    mutation() { for (const o of [...observers]) o.fn(); },
  };
}
afterEach(() => fermaTutto());

test('UI-MOTION: la preferenza viene letta dalla finestra del documento', () => {
  const b = ambienteMotion(); b.mediaChange(true);
  assert.equal(movimentoSpento({ document: b.doc }), true);
  assert.equal(motion(b.el(), [], { document: b.doc }), null);
});
test('UI-MOTION: un cambiamento di sistema annulla le animazioni già attive', () => {
  const b = ambienteMotion(); const a = motion(b.el(), [], { document: b.doc });
  b.mediaChange(true); assert.equal(a.cancelled, true); assert.equal(quanteVive(), 0);
});
test('UI-MOTION: la leva navigation non cancella la famiglia feedback', () => {
  const b = ambienteMotion();
  const nav = motion(b.el(), [], { document: b.doc, leva: 'motion-navigation-off' });
  const feedback = motion(b.el(), [], { document: b.doc, leva: 'motion-feedback-off' });
  b.doc.documentElement.classList.add('motion-navigation-off'); b.mutation();
  assert.equal(nav.cancelled, true); assert.equal(feedback.cancelled, false); assert.equal(quanteVive(), 1);
});
test('UI-MOTION: portare a zero il token annulla anche una transizione in volo', () => {
  const b = ambienteMotion(); const a = motion(b.el(), [], { document: b.doc });
  b.values.set('--talos-motion-duration-surface-enter', '0ms'); b.mutation();
  assert.equal(a.cancelled, true); assert.equal(quanteVive(), 0);
});
test('UI-MOTION: la richiesta spento cancella subito la transizione precedente dello stesso elemento', () => {
  const b = ambienteMotion(); const el = b.el(); const a = motion(el, [], { document: b.doc });
  b.doc.body.classList.add('reduce-motion');
  assert.equal(motion(el, [], { document: b.doc }), null); assert.equal(a.cancelled, true);
});
test('UI-MOTION: gli osservatori si liberano al termine, senza polling permanente', async () => {
  const b = ambienteMotion(); const a = motion(b.el(), [], { document: b.doc });
  assert.equal(b.listeners.size, 1); assert.equal(b.observers.size, 1);
  a.complete(); await Promise.resolve();
  assert.equal(quanteVive(), 0); assert.equal(b.listeners.size, 0); assert.equal(b.observers.size, 0);
});
test('UI-MOTION: sostituire una transizione non rimuove quella nuova quando termina la vecchia', async () => {
  const b = ambienteMotion(); const el = b.el(); const a = motion(el, [], { document: b.doc });
  const c = motion(el, [], { document: b.doc }); await Promise.resolve();
  assert.equal(a.cancelled, true); assert.equal(c.cancelled, false); assert.equal(quanteVive(), 1);
  b.mediaChange(true); assert.equal(c.cancelled, true);
});
test('UI-MOTION: i token in ms e secondi mantengono lo stesso significato', () => {
  const b = ambienteMotion(); b.values.set('--talos-motion-duration-surface-enter', '0.18s');
  assert.equal(millisecondiDelToken('surface-enter', 0, b.doc), 180);
  b.values.set('--talos-motion-duration-surface-enter', '180ms');
  assert.equal(millisecondiDelToken('surface-enter', 0, b.doc), 180);
});
test('UI-MOTION: il cambio di preferenza non ferma animazioni di un altro documento', () => {
  const b = ambienteMotion(); const c = ambienteMotion();
  const a = motion(b.el(), [], { document: b.doc }); const other = motion(c.el(), [], { document: c.doc });
  b.mediaChange(true); assert.equal(a.cancelled, true); assert.equal(other.cancelled, false);
});
