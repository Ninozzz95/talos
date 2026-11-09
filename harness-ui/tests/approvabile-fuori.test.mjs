/*
 * FE-011 (forma `FORMA-BARRA-APPROVAZIONI-2026-11-03.md`, strada 1 decisa dal Desktop): `approvabileFuori` esce sull'evento della richiesta. Stessa regola delle Notifiche, una
 * funzione sola; il campo è additivo e non approva niente da solo. Le due prove chieste dal Mobile: si calcola prima di serializzare (`CARTA_SEMPRE` è un Symbol) e torna uguale
 * nella rigiocata.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { approvalRequested } from '../src/agui-events.mjs';
import { approvabileFuori, datoDellAzione } from '../src/approvabile-fuori.mjs';
import { CARTA_SEMPRE } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

function registroCon(azione) {
  let input = null;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, attesaSilenzioPrimaMs: 30, attesaSilenzioRipetiMs: 30,
    preparaEsecuzioneFn: (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'prova' } }),
    avviaSessioneFn(i) { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
  });
  const { sessionId } = registro.avvia('task-vero', { modalitaOperativaScelta: 'normale', permessiScelto: 'Full access' });
  const visti = [];
  const disiscrivi = registro.iscriviti(sessionId, (e) => visti.push(e));
  input.chiediApprovazioneFn(azione);
  const chiudi = () => { disiscrivi(); try { registro.rispondiApprovazione(sessionId, visti.find((e) => e.type === 'ApprovalRequested').requestId, false); } catch { /* già chiusa */ } };
  return { registro, sessionId, visti, chiudi };
}

test('AF-01 il campo c\'è sull\'evento, nel giornale e nella rigiocata', async () => {
  const { registro, sessionId, visti, chiudi } = registroCon({ tipo: 'scrivi', percorso: 'src/a.js' });
  try {
    const prima = visti.find((e) => e.type === 'ApprovalRequested');
    assert.equal(prima.approvabileFuori, true);
    assert.equal(registro.esporta(sessionId).eventi.find((e) => e.type === 'ApprovalRequested').approvabileFuori, true);
    await attendi(80);
    const rigiocata = visti.find((e) => e.type === 'ApprovalRequested' && e.rigiocoAttesa === true);
    assert.ok(rigiocata, 'la domanda deve tornare');
    assert.equal(rigiocata.approvabileFuori, true);
  } finally { chiudi(); }
});

test('AF-02 una carta forzata non lo porta, nemmeno nella rigiocata', async () => {
  const { visti, chiudi } = registroCon({ tipo: 'scrivi', percorso: 'src/.env', segreto: { percorso: 'src/.env' } });
  try {
    await attendi(80);
    const domande = visti.filter((e) => e.type === 'ApprovalRequested');
    assert.ok(domande.length >= 2);
    for (const d of domande) assert.equal('approvabileFuori' in d, false);
  } finally { chiudi(); }
});

test('AF-03 si calcola prima di serializzare: il segno `CARTA_SEMPRE` è un Symbol e nel JSON si perde', () => {
  const azione = { tipo: 'scrivi', percorso: 'src/a.js', [CARTA_SEMPRE]: true };
  assert.equal(approvabileFuori(azione, datoDellAzione(azione)), false);
  const { visti, chiudi } = registroCon(azione);
  try {
    const evento = visti.find((e) => e.type === 'ApprovalRequested');
    assert.equal('approvabileFuori' in JSON.parse(JSON.stringify(evento)), false);
  } finally { chiudi(); }
});

test('AF-04 additivo: «no» è assente, e l\'evento senza il campo resta quello di sempre', () => {
  assert.deepEqual(approvalRequested({ requestId: 'r', azione: { tipo: 'x' } }), { type: 'ApprovalRequested', requestId: 'r', azione: { tipo: 'x' } });
  assert.deepEqual(approvalRequested({ requestId: 'r', azione: { tipo: 'x' }, approvabileFuori: false }), { type: 'ApprovalRequested', requestId: 'r', azione: { tipo: 'x' } });
  assert.equal(approvalRequested({ requestId: 'r', azione: {}, approvabileFuori: true }).approvabileFuori, true);
});

test('AF-05 strada 1: il campo resta com\'è, un comando passa; lo tiene fuori la barra, non il server', () => {
  const shell = { tipo: 'shell', comando: 'npm test' };
  assert.equal(approvabileFuori(shell, datoDellAzione(shell)), true);
  const senzaDato = { tipo: 'library_delete' };
  assert.equal(approvabileFuori(senzaDato, datoDellAzione(senzaDato)), false);
  const indirizzo = { tipo: 'naviga', url: 'https://a.example' };
  assert.equal(approvabileFuori(indirizzo, datoDellAzione(indirizzo)), false);
  const tagliato = { tipo: 'shell', comando: 'x'.repeat(5000) };
  assert.equal(approvabileFuori(tagliato, datoDellAzione(tagliato)), false);
});

test('AF-06 una regola sola: le Notifiche e l\'evento usano la stessa funzione, e nessuna richiesta nasce senza', () => {
  const ns = readFileSync(new URL('../src/notifiche-scrittori.mjs', import.meta.url), 'utf8');
  assert.match(ns, /from '\.\/approvabile-fuori\.mjs'/u);
  assert.doesNotMatch(ns, /function approvabileFuori/u);
  const sr = readFileSync(new URL('../src/session-registry.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(sr, /approvalRequested\(\{ requestId, azione \}\)/u);
});
