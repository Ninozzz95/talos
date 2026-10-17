import test from 'node:test';
import assert from 'node:assert/strict';
/*
 * 16/10/2026, dalla CLI (prima revisione della 0.6.7) — CHI DECIDE quando arriva un segnale e noi abbiamo gruppi di comandi vivi.
 *   Decide l'host se ascolta lui il segnale; non contano i nostri listener né una libreria d'uscita come signal-exit, che agisce solo
 *   quando i listener del segnale sono tutti suoi (3.0.7, `index.js:121`: `if (listeners.length === emitter.count)`).
 *   La regola di prima (`listenerCount > 1`) sbagliava in tutti e due i versi: rimandava il segnale sopra un `once` dell'host
 *   (uccidendolo prima del suo stop ordinato) e non lo rimandava accanto a signal-exit (la CLI restava viva a un SIGINT esterno).
 */
import { EventEmitter } from 'node:events';
import { creaPuliziaDeiGruppi } from '../src/kernel/talosHarness.mjs';

function processoFinto(gruppi = []) {
  const p = new EventEmitter();
  p.pid = 500;
  p.colpi = [];
  p.gruppi = new Set(gruppi);
  p.kill = (pid, s) => {
    if (s === 0) { if (!p.gruppi.has(-pid)) { const e = new Error('kill ESRCH'); e.code = 'ESRCH'; throw e; } return; }
    p.colpi.push([pid, s]);
  };
  p.exit = () => {};
  return p;
}
const timerFinti = () => { const t = []; t.imposta = (f, ms) => { t.push([f, ms]); return { unref() {} }; }; return t; };
const figlio = (pid) => Object.assign(new EventEmitter(), { pid });
const rimandato = (proc, s) => proc.colpi.some(([pid, seg]) => pid === proc.pid && seg === s);

/* Un signal-exit 3.0.7 in miniatura, con la stessa riga che decide: agisce (ripristina e rimanda il segnale) solo se è solo. */
function signalExitFinto(proc, segnale) {
  const emitter = { count: 1 };
  const stato = { agito: 0 };
  const ascolta = function () {
    const listeners = proc.listeners(segnale);
    if (listeners.length === emitter.count) {
      stato.agito++;
      proc.removeListener(segnale, ascolta);
      proc.kill(proc.pid, segnale);
    }
  };
  proc.on(segnale, ascolta);
  return { stato, ascolta };
}

test('CHI-DECIDE-01 — un `once` dell\'host registrato PRIMA di noi decide lui: i gruppi ricevono il segnale, l\'host NON viene ucciso da noi', () => {
  const proc = processoFinto([11]);
  let chiamato = 0;
  proc.once('SIGINT', () => { chiamato++; });
  const pulizia = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: timerFinti().imposta });
  pulizia.registra(figlio(11));
  proc.emit('SIGINT');
  assert.equal(chiamato, 1);
  assert.deepEqual(proc.colpi, [[-11, 'SIGINT']], 'nessun SIGINT rimandato all\'host: lo stop ordinato è suo');
});

test('CHI-DECIDE-02 — AL CONTRARIO: un `once` che l\'host ha tolto da sé prima del segnale non decide più nulla, e il segnale torna all\'host', () => {
  const proc = processoFinto([11]);
  const suo = () => {};
  proc.once('SIGINT', suo);
  const pulizia = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: timerFinti().imposta });
  pulizia.registra(figlio(11));
  proc.removeListener('SIGINT', suo); // l'host ha smesso di ascoltare
  proc.emit('SIGINT');
  assert.ok(rimandato(proc, 'SIGINT'), JSON.stringify(proc.colpi));
  assert.equal(proc.listenerCount('SIGINT'), 0, 'tolti anche la marca e il gestore');
});

test('CHI-DECIDE-03 — un `once` vale una volta: al SECONDO segnale, se l\'host non ascolta più, decidiamo noi', () => {
  const proc = processoFinto([11]);
  proc.once('SIGINT', () => {});
  const pulizia = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: timerFinti().imposta });
  pulizia.registra(figlio(11));
  proc.emit('SIGINT');
  assert.equal(rimandato(proc, 'SIGINT'), false);
  proc.emit('SIGINT');
  assert.ok(rimandato(proc, 'SIGINT'), JSON.stringify(proc.colpi));
});

test('CHI-DECIDE-04 — accanto a signal-exit (registrato prima, come fa Ink all\'avvio) decidiamo NOI: ci togliamo, rimandiamo il segnale, e signal-exit trova i conti giusti', () => {
  const proc = processoFinto([11]);
  const sx = signalExitFinto(proc, 'SIGINT');
  const pulizia = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: timerFinti().imposta });
  pulizia.registra(figlio(11));
  proc.emit('SIGINT');
  assert.equal(sx.stato.agito, 0, 'al primo giro signal-exit vede anche noi e aspetta');
  assert.ok(rimandato(proc, 'SIGINT'), JSON.stringify(proc.colpi));
  assert.deepEqual(proc.listeners('SIGINT'), [sx.ascolta], 'resta solo signal-exit');
  proc.emit('SIGINT'); // il segnale rimandato
  assert.equal(sx.stato.agito, 1, 'signal-exit ripristina il terminale ed esce');
});

test('CHI-DECIDE-05 — signal-exit 4 (`listeners.length === count`) non conta come host', () => {
  const proc = processoFinto([11]);
  const conta = { count: 1 };
  function ascolta() { const listeners = proc.listeners('SIGTERM'); const { count } = conta; if (listeners.length === count) proc.kill(proc.pid, 'SIGTERM'); }
  proc.on('SIGTERM', ascolta);
  const t = timerFinti();
  const pulizia = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: t.imposta });
  pulizia.registra(figlio(11));
  proc.emit('SIGTERM');
  assert.equal(t.length, 1, 'SIGTERM: grazia prima del SIGKILL ai gruppi');
  t[0][0]();
  assert.ok(rimandato(proc, 'SIGTERM'), JSON.stringify(proc.colpi));
});

test('CHI-DECIDE-06 — un listener `on` dell\'host registrato DOPO di noi decide lui (e SIGTERM manda il SIGKILL ai gruppi dopo la grazia)', () => {
  const proc = processoFinto([11]);
  const t = timerFinti();
  const pulizia = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: t.imposta });
  pulizia.registra(figlio(11));
  let chiamato = 0;
  proc.on('SIGTERM', () => { chiamato++; });
  proc.emit('SIGTERM');
  assert.equal(chiamato, 1);
  assert.equal(rimandato(proc, 'SIGTERM'), false);
  t[0][0]();
  assert.deepEqual(proc.colpi.at(-1), [-11, 'SIGKILL']);
});
