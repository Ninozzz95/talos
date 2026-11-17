/*
 * ⛔ Decisione 374, giro piccolo dopo il revisore B del giro 8 (giudice v1630): le due prove di B (`rev-b-g8-t1-luoghi.test.mjs`, che
 *   uccidono i suoi mutanti G01 e G03, vivi sulle prove dell'autore) portate nel ramo. Il T1 vale anche per i luoghi ricordati, non solo
 *   per l'impostazione; e (L2, tenuto prudente per le decisioni 323 e 370, «carta sempre») «assente» vuol dire anche versione approvata =
 *   «nessun file»: la persona accende dalle Impostazioni, i luoghi non sono mai stati creati, un comando in Accesso pieno li crea ⇒ messi
 *   da parte con 1 copia e 1 avviso (misura di B, ESITO-T1V), il computer use resta acceso. Il CHANGELOG lo dice in inglese e italiano.
 * Concorrenti: hermes-agent tools/file_tools_write_guards.py:166 (il file della politica non si crea né si cambia dagli attrezzi);
 *   codex protocol/src/permissions.rs:2387-2390 («so first-time creation still goes through the protected-path approval flow»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import { creaCustodeFileComputerUse, EVENTO_FILE_COMPUTER_USE_RIPRISTINATI as EVENTO } from '../src/computer-use/file-approvati.mjs';
import { creaImpostazioneComputerUse } from '../src/computer-use/impostazione.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SPENTA = '{"schema":"talos.computer-use-settings.v1","acceso":false}\n';
const ACCESA = '{"schema":"talos.computer-use-settings.v1","acceso":true}\n';
const LUOGHI = '{"versione":1,"voci":[{"tipo":"dominio","nome":"example.com","quando":"2026-11-07T10:00:00.000Z"}]}\n';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const muto = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

/** `stato`: 'aggiornamento' (file sul disco, nessuna voce), 'nuova' (niente file, nessuna voce), 'approvata' (versione approvata vera). */
async function banco(stato) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374g8t1-'));
  const fi = join(cartella, '.computer-use-impostazione.json');
  const fl = join(cartella, '.computer-use-luoghi.json');
  const pk = creaAdattatorePortachiaviInMemoria();
  if (stato === 'aggiornamento') { writeFileSync(fi, ACCESA); writeFileSync(fl, LUOGHI); }
  const nuovo = () => creaCustodeFileComputerUse({ file: [fi, fl], portachiavi: pk });
  const custode = await muto(async () => { const c = nuovo(); await c.avvia?.(); return c; });
  if (stato === 'approvata') await muto(async () => { await custode.scrivi(fi, SPENTA); await custode.scrivi(fl, LUOGHI); });
  const acceso = (c = custode) => creaImpostazioneComputerUse({ file: fi, custode: c, avvisa: () => {} }).acceso();
  const copie = () => readdirSync(cartella).filter((f) => f.includes('.computer-use-impostazione.json.changed-')).length;
  return { cartella, fi, fl, custode, nuovo, acceso, copie, chiudi: () => rimuoviCartellaDiProva(cartella) };
}

function sessione(b, permessiScelto = 'Full access') {
  let input = null;
  let risolvi;
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: b.cartella, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }), registraRigaFn: async () => true, cartellaEsisteFn: () => true,
    guardaWorkspaceFn: () => () => {}, custodeFileComputerUse: b.custode,
  });
  const { sessionId } = registro.avvia('task-a', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return {
    pronta: async () => { for (let i = 0; i < 100 && !input; i += 1) await pausa(5); assert.ok(input); },
    async comando(comando, durante) {
      await input.hookFn({ tipo: 'pre_tool_call', azione: 'shell', argomenti: { comando }, giro: 0 });
      durante?.();
      await input.hookFn({ tipo: 'post_tool_call', azione: 'shell', esito: 'exit 0\n', giro: 0 });
    },
    /** un attrezzo che scrive per percorso: risponde `si` alla carta se arriva, poi scrive e chiude come il kernel */
    async attrezzo(azione, argomenti, { si = true, scrive = () => {} } = {}) {
      const prima = ricevuti.length;
      const p = input.hookFn({ tipo: 'pre_tool_call', azione, argomenti, giro: 0 });
      await pausa(10);
      const carta = ricevuti.slice(prima).find((e) => e.type === 'ApprovalRequested');
      if (carta) registro.rispondiApprovazione(sessionId, carta.requestId, si);
      const esito = await p;
      if (esito?.consentito !== false) { scrive(); await input.hookFn({ tipo: 'post_tool_call', azione, esito: 'ok', giro: 0 }); }
      return { esito, carta: Boolean(carta) };
    },
    carte: () => ricevuti.filter((e) => e.type === 'ApprovalRequested').length,
    avvisi: () => ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO).length,
    chiudi: () => { input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
  };
}


const LUOGHI2 = '{"versione":1,"voci":[{"tipo":"app","nome":"cmd.exe","quando":"2026-11-12T10:00:00.000Z"}]}\n';
test('374 g8 T1-luoghi (revisore B): dopo un aggiornamento un comando in Accesso pieno che cambia i luoghi ricordati: messi da parte, copia, avviso', { timeout: 10_000 }, async () => {
  const b = await banco('aggiornamento');
  const A = sessione(b);
  try {
    await A.pronta();
    await muto(() => A.comando('node luoghi.mjs', () => writeFileSync(b.fl, LUOGHI2)));
    const copieL = readdirSync(b.cartella).filter((f) => f.includes('.computer-use-luoghi.json.changed-')).length;
    assert.equal(b.custode.testo(b.fl), null, 'i luoghi scritti dal comando non diventano approvati');
    assert.equal(existsSync(b.fl), false, 'messi da parte subito');
    assert.deepEqual([copieL, A.avvisi(), A.carte()], [2, 2, 0], 'la copia e l avviso dell avvio, poi quelli del comando; nessuna carta');
  } finally { A.chiudi(); b.chiudi(); }
});
test('374 g8 L2 (revisore B): impostazione approvata dalla persona, luoghi mai creati (approvato = assente): un comando in Accesso pieno che crea i luoghi', { timeout: 10_000 }, async () => {
  const b = await banco('nuova');
  const A = sessione(b);
  try {
    await A.pronta();
    await muto(() => b.custode.scrivi(b.fi, ACCESA)); // la persona accende dalle Impostazioni: la voce del portachiavi c e
    await muto(() => A.comando('node luoghi.mjs', () => writeFileSync(b.fl, LUOGHI2)));
    const copieL = readdirSync(b.cartella).filter((f) => f.includes('.computer-use-luoghi.json.changed-')).length;
    assert.equal(b.custode.testo(b.fl), null, 'la versione approvata resta «nessun file»');
    assert.equal(existsSync(b.fl), false, 'messi da parte subito');
    assert.deepEqual([copieL, A.avvisi(), A.carte(), b.acceso()], [1, 1, 0, true], 'la misura di L2: 1 copia, 1 avviso, nessuna carta, il computer use resta acceso');
  } finally { A.chiudi(); b.chiudi(); }
});
