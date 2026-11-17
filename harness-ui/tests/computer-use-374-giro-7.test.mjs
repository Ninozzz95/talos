/*
 * ⛔ Decisione 374, giro 7 (giudice v1613, 12/11/2026): R2 ALTO del revisore A sul giro 6 (`RAPPORTO-REVISORE-A-CU-374-GIRO-6`).
 *   Un «!» della persona lanciato in B mentre un comando del modello di B gira si registra fra i processi fermabili senza custode
 *   (session-registry `shell()`, `registraComandoFermabileIn`). Se è ancora vivo alla fine del comando del modello, il giro 6 lo contava
 *   fra i processi in sottofondo di quel comando, ma il suo sgancio non avvisava il custode: B restava «in corso» fino al riavvio e
 *   ogni cambio in Accesso pieno di ogni conversazione veniva messo da parte (contro la decisione 390).
 * Qui il «!» passa dal registro vero (`registro.shell`) con l'esecutore finto: la registrazione è quella che fa il kernel.
 * Concorrenti: hermes-agent tools/process_registry.py:2434 (`has_active_processes`: contano solo i processi che il compito ha lanciato);
 *   codex unified_exec/process_manager.rs:1843 (`list_processes`: solo i processi del gestore che li ha aperti).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import * as cm from '../src/computer-use/file-approvati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { creaCustodeFileComputerUse, EVENTO_FILE_COMPUTER_USE_RIPRISTINATI: EVENTO } = cm;
const APPROVATA = '{"schema":"talos.computer-use-settings.v1","acceso":false}\n';
const ACCESA = '{"schema":"talos.computer-use-settings.v1","acceso":true}\n';
const LUOGHI = '{"versione":1,"voci":[{"tipo":"dominio","nome":"example.com","quando":"2026-11-07T10:00:00.000Z"}]}\n';
const SFONDO = 'IN BACKGROUND: started in the background on request.';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const muto = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };
const mutoSinc = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

async function banco() {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374g7-'));
  const fi = join(cartella, '.computer-use-impostazione.json');
  const fl = join(cartella, '.computer-use-luoghi.json');
  const pk = creaAdattatorePortachiaviInMemoria();
  const custode = mutoSinc(() => creaCustodeFileComputerUse({ file: [fi, fl], portachiavi: pk }));
  await muto(async () => { await custode.scrivi(fi, APPROVATA); await custode.scrivi(fl, LUOGHI); });
  const copie = () => readdirSync(cartella).filter((f) => f.includes('.changed-')).length;
  return { cartella, fi, fl, custode, copie, chiudi: () => rimuoviCartellaDiProva(cartella) };
}

/** Una conversazione del registro vero; `bang(comando)` è il «!» della persona e ritorna l'uscita del suo processo. */
function sessione(custode, permessiScelto) {
  let input = null;
  let risolvi;
  let chiusa = false;
  let n = 0;
  const diretti = [];
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: tmpdir(), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    eseguiComandoDirettoFn: (argomenti) => new Promise((esito) => { diretti.push({ argomenti, esito }); }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }), custodeFileComputerUse: custode, registraRigaFn: async () => true,
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  const s = {
    async pre(azione = 'shell', argomenti = { comando: 'npm test' }) {
      const prima = ricevuti.length;
      const p = input.hookFn({ tipo: 'pre_tool_call', azione, argomenti, giro: 0 });
      await pausa(5);
      const carta = ricevuti.slice(prima).find((e) => e.type === 'ApprovalRequested');
      if (carta) registro.rispondiApprovazione(sessionId, carta.requestId, true);
      return p;
    },
    post: (azione = 'shell', esito = 'exit 0\n') => input.hookFn({ tipo: 'post_tool_call', azione, esito, giro: 0 }),
    /** Il «!» della persona: il registro lo passa all'esecutore, che registra il suo processo come fa il kernel. */
    async bang(comando = 'node osserva.mjs') {
      const r = registro.shell(sessionId, comando);
      assert.notEqual(r?.ok, false, `il «!» deve partire: ${JSON.stringify(r)}`);
      await pausa(5);
      const d = diretti.at(-1);
      assert.ok(d, 'l esecutore del «!» non è stato chiamato');
      n += 1;
      const sgancia = d.argomenti.registraComandoFermabile({ toolCallId: `bang-${n}`, ferma: () => {}, pid: () => null });
      return async () => { sgancia(); d.esito({ ok: true, codice: 0, enforcement: 'nessuno', cartellaFinale: null, comando, testo: '' }); await pausa(30); };
    },
    /** Un comando del modello che resta in sottofondo, registrato come fa il kernel (la via del giro 6). */
    async sfondo() {
      await s.pre('shell', { comando: 'node scrittore.mjs', background: true });
      const sgancia = input.registraComandoFermabile({ toolCallId: 'bg-1', ferma: () => {}, pid: () => null });
      await s.post('shell', SFONDO);
      return async () => { sgancia(); await pausa(30); };
    },
    carte: () => ricevuti.filter((e) => e.type === 'ApprovalRequested').length,
    avvisi: () => ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO).length,
    chiudi: () => { if (chiusa) return; chiusa = true; input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
  };
  return s;
}

async function incrocio(livelloB, passi) {
  const b = await banco();
  const B = sessione(b.custode, livelloB);
  const A = sessione(b.custode, 'Full access');
  try {
    await muto(() => passi(b, A, B));
    return { A, B, copie: b.copie(), approvato: [b.custode.testo(b.fi), b.custode.testo(b.fl)], disco: readFileSync(b.fi, 'utf8') };
  } finally { A.chiudi(); B.chiudi(); b.chiudi(); }
}

for (const livelloB of ['On request', 'Workspace write']) {
  test(`374 g7 R2: un «!» della persona in B (${livelloB}), vivo alla fine del comando del modello, non tiene B «in corso»; il cambio di A in Accesso pieno passa`, { timeout: 10_000 }, async () => {
    let inVoloDopoB = null;
    const r = await incrocio(livelloB, async (b, A, B) => {
      await B.pre();
      const esceBang = await B.bang();
      await B.post();
      inVoloDopoB = b.custode.chiHaUnComando().length;
      await A.pre('shell', { comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post();
      await esceBang();
    });
    assert.equal(inVoloDopoB, 0, 'finito il comando del modello, B non è più «in corso»: il «!» è della persona');
    assert.deepEqual(r.approvato, [ACCESA, LUOGHI], 'il cambio proprio di A in Accesso pieno diventa l approvato (decisione 390)');
    assert.equal(r.disco, ACCESA);
    assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [0, 0, 0], 'nessuna copia, nessun avviso');
  });
}

test('374 g7 R2: il «!» esce prima di un comando di A in Accesso pieno: nessun avviso a nessuno e A adotta (controprova)', { timeout: 10_000 }, async () => {
  const r = await incrocio('On request', async (b, A, B) => {
    await B.pre();
    const esceBang = await B.bang();
    await B.post();
    await esceBang();
    await A.pre('shell', { comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post();
  });
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI]);
  assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [0, 0, 0]);
});

test('374 g7 R2: con un «!» vivo, un processo del modello di B in sottofondo tiene ancora B «in corso» (A1 del giro 6 resta chiuso)', { timeout: 10_000 }, async () => {
  let inVolo = null;
  const r = await incrocio('On request', async (b, A, B) => {
    await B.pre();
    const esceBang = await B.bang();
    await B.post();
    const esceSfondo = await B.sfondo();
    inVolo = b.custode.chiHaUnComando().length;
    await A.pre('shell', { comando: 'npm test' }); writeFileSync(b.fi, ACCESA); await A.post();
    await esceSfondo();
    await esceBang();
  });
  assert.equal(inVolo, 1, 'B è «in corso» per il suo processo in sottofondo');
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI], 'il cambio durante il processo di B non diventa l approvato');
  assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [1, 0, 1], 'una copia, l avviso solo a B');
});
