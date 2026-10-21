import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 18/10/2026 — R5.8, «chiudi la sessione sul PC» (owner 17/10: «sì, con conferma; la conversazione resta salvata»; 18/10 sera:
 * «Ferma e libera tutto»). Il giro si ferma, i comandi in sottofondo si fermano, i terminali si chiudono; un evento lo dice, con
 * il telefono da cui è partita. La conversazione resta nel registro.
 */
async function banco() {
  const radice = await mkdtemp(join(tmpdir(), 'talos-chiudi-'));
  await mkdir(join(radice, 'p'), { recursive: true });
  let input = null;
  let fine = null;
  const registro = createSessionRegistry({
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' }); return new Promise((ok) => { fine = () => { i.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r1' }); ok({ ok: true }); }; }); },
    preparaEsecuzioneFn: (taskId) => ({ cartella: join(radice, 'p'), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  const togli = registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return {
    registro, sessionId, ricevuti, input: () => input, chiudiGiro: () => { const f = fine; fine = null; f?.(); },
    via: async () => { togli(); const f = fine; fine = null; f?.(); await registro.attendiAssestamento?.(sessionId); await rimuoviCartellaDiProvaAttesa(radice); },
  };
}
const chiusa = (b) => b.ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.sessione-chiusa');

test('CHI-01 a giro in corso: ferma il giro e i comandi in sottofondo, lo scrive con l\'origine, la conversazione resta', async () => {
  const b = await banco();
  try {
    const fermati = [];
    b.input().registraComandoFermabile({ toolCallId: 'cmd-1', ferma: () => { fermati.push('cmd-1'); return true; } });
    const r = b.registro.chiudiSessione(b.sessionId, { origine: { tipo: 'telefono', nome: 'Pad di Nino' } });
    assert.deepEqual([r.ok, r.giri, r.comandi], [true, 1, 1]);
    assert.deepEqual(fermati, ['cmd-1']);
    assert.equal(b.input().segnaleStop?.aborted, true, 'il giro ha ricevuto lo stop (il kernel finto non lo ascolta, ma il segnale c’è)');
    assert.deepEqual(chiusa(b).map((e) => [e.value.giri, e.value.comandi, e.value.origine]), [[1, 1, { tipo: 'telefono', nome: 'Pad di Nino' }]]);
    assert.ok(b.registro.elenca().some((s) => s.sessionId === b.sessionId), 'chiudere non è eliminare');
  } finally { await b.via(); }
});

test('CHI-02 al contrario: a giro finito non ferma niente ma lo scrive lo stesso; una sessione che non c\'è è NOT_FOUND', async () => {
  const b = await banco();
  try {
    b.chiudiGiro();
    await b.registro.attendiAssestamento?.(b.sessionId);
    const r = b.registro.chiudiSessione(b.sessionId);
    assert.deepEqual([r.giri, r.comandi], [0, 0]);
    assert.equal(chiusa(b).length, 1);
    assert.equal(chiusa(b)[0].value.origine, undefined, 'senza telefono, nessuna origine inventata');
    assert.equal(b.registro.chiudiSessione('nessuna').code, 'NOT_FOUND');
  } finally { await b.via(); }
});

test('CHI-03 la rotta chiude anche i terminali di QUELLA sessione; dal telefono l\'origine arriva in processo, mai dal corpo', async () => {
  const chiamate = [];
  const terminali = new Map([['term-a', 's-1'], ['term-b', 's-1'], ['term-c', 's-2']]);
  const sessionRegistry = {
    chiudiSessione: (id, opzioni) => { chiamate.push([id, opzioni]); return id === 's-1' ? { ok: true, giri: 1, comandi: 0 } : { erroreAvvio: 'Session not found', code: 'NOT_FOUND' }; },
    esiste: (id) => id === 's-1',
  };
  const terminalRegistry = {
    elenca: (sid) => ({ items: [...terminali].filter(([, s]) => s === sid).map(([terminalId]) => ({ terminalId, sessionId: sid })) }),
    chiudi: ({ sessionId, terminalId }) => (terminali.get(terminalId) === sessionId ? (terminali.delete(terminalId), { ok: true }) : { erroreAvvio: 'x', code: 'NOT_FOUND' }),
  };
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry, terminalRegistry });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd-1', nome: 'Pad di Nino' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  const r = await operazioni.esegui('session.close', { sessionId: 's-1' }, contesto);
  assert.deepEqual(r, { ok: true, giri: 1, comandi: 0, terminali: 2 });
  assert.deepEqual([...terminali.keys()], ['term-c'], 'i terminali di un\'altra sessione restano');
  assert.deepEqual(chiamate[0][1], { origine: { tipo: 'telefono', nome: 'Pad di Nino' } });
  await assert.rejects(chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/close', corpo: { origine: { tipo: 'telefono', nome: 'finto' } } }).then((x) => { if (x.stato >= 400) throw Object.assign(new Error('rifiutato'), { stato: x.stato }); return x; }), { stato: 400 }, 'un corpo con chiavi non passa');
});

test('CHI-04 chiude tutto l\'albero: una figlia che lavora si ferma con la madre', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-chiudi-figlie-'));
  const giri = [];
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'delega' } }),
    avviaSessioneFn: (input) => { let risolvi; const p = new Promise((ok) => { risolvi = ok; }); giri.push({ input, risolvi }); input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` }); return p; },
  });
  t.after(async () => {
    for (const g of giri) { g.input.onEvento({ type: 'RunFinished' }); g.risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } }); }
    await registro.chiudi?.({ attesaMassimaMs: 1_000 });
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  await giri[0].input.onDelega('figlia: scrivi un file', cartellaStore);
  const figlia = giri.find((g, i) => i > 0)?.input;
  assert.ok(figlia, 'premessa: la figlia lavora');
  const r = registro.chiudiSessione(sessionId);
  assert.equal(r.giri, 2, 'madre e figlia');
  assert.equal(figlia.segnaleStop?.aborted, true, 'il giro della figlia ha ricevuto lo stop');
});
