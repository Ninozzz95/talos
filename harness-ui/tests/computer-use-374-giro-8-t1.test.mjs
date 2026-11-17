/*
 * ⛔ Decisione 374, giro 8 (giudice v1621, punto a; T1 del revisore C del giro 7): senza una versione approvata salvata (dopo
 *   l'aggiornamento da una versione senza custode, o alla prima installazione) i file del computer use sono «assenti» per il custode e
 *   il computer use è spento «finché non lo riaccendi una volta» (CHANGELOG). Ma un comando di shell in Accesso pieno che scriveva il
 *   file lo faceva diventare la versione approvata: computer use acceso, senza carta e senza la persona (misura del revisore C,
 *   `sonda-a2-registro.log`), anche dopo il riavvio. Per i file del computer use l'Accesso pieno non toglie la carta (decisioni 323 e
 *   370): qui un file la cui versione approvata è «assente» non si adotta alla fine di un comando in Accesso pieno; si mette da parte
 *   con la copia e l'avviso alla conversazione che ha lanciato il comando. Lo riaccende solo la persona (Impostazioni, o una carta).
 *   Con una versione approvata vera la decisione 390 resta: ciò che il comando in Accesso pieno lascia diventa l'approvato.
 * Concorrenti: hermes-agent tools/file_tools_write_guards.py:166 (il file della politica non si crea né si cambia dagli attrezzi);
 *   codex protocol/src/permissions.rs:2387-2390 (la cartella protetta è protetta anche prima di esistere: «so first-time creation still
 *   goes through the protected-path approval flow»).
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

/* l'avviso «messo da parte all'avvio» esce al primo controllo di una conversazione (X7, X9C della tabella 375): conta 1 dopo un aggiornamento */
for (const [stato, nome, copieAllAvvio] of [['aggiornamento', 'dopo un aggiornamento (file sul disco, nessuna versione approvata salvata)', 1], ['nuova', 'alla prima installazione (nessun file)', 0]]) {
  test(`374 g8 T1: ${nome}, un comando di shell in Accesso pieno che scrive l impostazione accesa NON riaccende: copia, avviso ad A`, { timeout: 10_000 }, async () => {
    const b = await banco(stato);
    const A = sessione(b);
    try {
      assert.equal(b.acceso(), false, 'spento all avvio');
      assert.equal(b.copie(), copieAllAvvio);
      await A.pronta();
      await muto(() => A.comando('node configura.mjs', () => writeFileSync(b.fi, ACCESA)));
      assert.equal(b.acceso(), false, 'resta spento: lo riaccende solo la persona');
      assert.equal(b.custode.testo(b.fi), null, 'la versione approvata resta «assente»');
      assert.equal(existsSync(b.fi), false, 'il file scritto dal comando è messo da parte');
      assert.equal(b.copie(), copieAllAvvio + 1, 'con la sua copia accanto');
      assert.deepEqual([A.carte(), A.avvisi()], [0, copieAllAvvio + 1], 'nessuna carta; un avviso in più (oltre a quello dell avvio) alla conversazione del comando');
      const dopo = await muto(async () => { const c = b.nuovo(); await c.avvia?.(); return c; });
      assert.equal(b.acceso(dopo), false, 'anche dopo un riavvio');
    } finally { A.chiudi(); b.chiudi(); }
  });
}

test('374 g8 T1: dopo un aggiornamento la persona riaccende dalle Impostazioni; da lì un comando in Accesso pieno cambia il file e resta (decisione 390)', { timeout: 10_000 }, async () => {
  const b = await banco('aggiornamento');
  const A = sessione(b);
  try {
    await A.pronta();
    await muto(() => b.custode.scrivi(b.fi, ACCESA)); // l'interruttore delle Impostazioni
    assert.equal(b.acceso(), true);
    await muto(() => A.comando('node configura.mjs', () => writeFileSync(b.fi, SPENTA)));
    assert.equal(b.custode.testo(b.fi), SPENTA, 'con una versione approvata vera vale la decisione 390');
    assert.deepEqual([A.carte(), A.avvisi()], [0, 1], 'solo l avviso dell avvio, niente per il cambio in Accesso pieno');
  } finally { A.chiudi(); b.chiudi(); }
});

/* mutante P03 del giro 8: la protezione dell'«assente» vale SOLO per l'adozione dell'Accesso pieno, mai per il sì della persona su una carta */
for (const permessi of ['Full access', 'Workspace write']) {
  test(`374 g8 T1 controprova: dopo un aggiornamento la persona approva sulla carta (${permessi}) la scrittura dell impostazione accesa: conta subito`, { timeout: 10_000 }, async () => {
    const b = await banco('aggiornamento');
    const A = sessione(b, permessi);
    try {
      await A.pronta();
      const r = await muto(() => A.attrezzo('scrivi', { percorso: b.fi, contenuto: ACCESA }, { si: true, scrive: () => writeFileSync(b.fi, ACCESA) }));
      assert.equal(r.carta, true, 'la carta arriva (decisioni 323 e 370)');
      assert.equal(b.custode.testo(b.fi), ACCESA, 'il sì della persona fa la versione approvata');
      assert.equal(b.acceso(), true);
      assert.equal(b.copie(), 1, 'solo la copia dell avvio');
    } finally { A.chiudi(); b.chiudi(); }
  });
}

test('374 g8 T1 controprova: con una versione approvata vera un comando in Accesso pieno che accende resta (decisione 390), 0 copie e 0 avvisi', { timeout: 10_000 }, async () => {
  const b = await banco('approvata');
  const A = sessione(b);
  try {
    await A.pronta();
    await muto(() => A.comando('node configura.mjs', () => writeFileSync(b.fi, ACCESA)));
    assert.equal(b.custode.testo(b.fi), ACCESA);
    assert.equal(b.acceso(), true);
    assert.deepEqual([b.copie(), A.carte(), A.avvisi()], [0, 0, 0]);
  } finally { A.chiudi(); b.chiudi(); }
});

test('374 g8 T1: un comando in Accesso pieno che NON tocca i file, dopo un aggiornamento, non costa niente in più (0 carte, solo l avviso dell avvio)', { timeout: 10_000 }, async () => {
  const b = await banco('aggiornamento');
  const A = sessione(b);
  try {
    await A.pronta();
    for (let i = 0; i < 20; i += 1) await muto(() => A.comando(`npm test -- ${i}`));
    assert.deepEqual([A.carte(), A.avvisi(), b.copie()], [0, 1, 1], 'solo l avviso e la copia dell avvio');
  } finally { A.chiudi(); b.chiudi(); }
});
