/*
 * ⛔ Decisione 374, giro 8 (giudice v1621, punto b; T2 del revisore C del giro 7): per i due file del computer use l'Accesso pieno NON
 *   toglie la carta (decisioni 323 e 370 dell'owner, «carta sempre», richiesta 30). Il cancello del registro saltava la carta di OGNI
 *   file di controllo in Accesso pieno (decisione 155), quindi `scrivi`/`file_edit` del modello sull'impostazione del computer use la
 *   riscriveva senza chiedere e la accendeva subito (misura del revisore C, `sonda-a2-registro.log`). Ora per quei due file la carta
 *   c'è anche in Accesso pieno; gli altri file di controllo restano senza carta in Accesso pieno (decisione 155).
 * Concorrenti: hermes-agent tools/file_tools_write_guards.py:166-173 (il file della politica di sicurezza non si scrive dagli attrezzi
 *   dei file, in nessuna modalità); codex protocol/src/permissions.rs:2387-2393 (le radici protette restano protette anche con la
 *   scrittura libera); Claude Code CHANGELOG.md:353.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import { creaCustodeFileComputerUse } from '../src/computer-use/file-approvati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const APPROVATA = '{"schema":"talos.computer-use-settings.v1","acceso":false}\n';
const ACCESA = '{"schema":"talos.computer-use-settings.v1","acceso":true}\n';
const LUOGHI = '{"versione":1,"voci":[{"tipo":"dominio","nome":"example.com","quando":"2026-11-07T10:00:00.000Z"}]}\n';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const muto = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };
const mutoSinc = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

async function banco({ conCustode = true } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374g8-'));
  const fi = join(cartella, '.computer-use-impostazione.json');
  const fl = join(cartella, '.computer-use-luoghi.json');
  const custode = conCustode ? mutoSinc(() => creaCustodeFileComputerUse({ file: [fi, fl], portachiavi: creaAdattatorePortachiaviInMemoria() })) : null;
  if (custode) await muto(async () => { await custode.scrivi(fi, APPROVATA); await custode.scrivi(fl, LUOGHI); });
  else { writeFileSync(fi, APPROVATA); writeFileSync(fl, LUOGHI); }
  return { cartella, fi, fl, custode, chiudi: () => rimuoviCartellaDiProva(cartella) };
}

/** Una conversazione in Accesso pieno; `attrezzo` fa pre, scrittura (se consentita) e post, e risponde `si` alla carta se arriva. */
function sessione(b, permessiScelto = 'Full access') {
  let input = null;
  let risolvi;
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: b.cartella, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }), registraRigaFn: async () => true, cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
    ...(b.custode ? { custodeFileComputerUse: b.custode } : {}),
  });
  const { sessionId } = registro.avvia('task-a', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return {
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
    chiudi: () => { input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
    pronta: async () => { for (let i = 0; i < 100 && !input; i += 1) await pausa(5); assert.ok(input); },
  };
}

for (const azione of ['scrivi', 'file_edit']) {
  test(`374 g8 T2: ${azione} dell impostazione del computer use in Accesso pieno chiede la carta (decisioni 323 e 370); con No non scrive`, { timeout: 10_000 }, async () => {
    const b = await banco();
    const A = sessione(b);
    try {
      await A.pronta();
      const r = await muto(() => A.attrezzo(azione, { percorso: b.fi, contenuto: ACCESA }, { si: false, scrive: () => writeFileSync(b.fi, ACCESA) }));
      assert.equal(r.carta, true, 'la carta arriva anche in Accesso pieno');
      assert.equal(r.esito?.consentito, false, 'col No non si scrive');
      assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA);
      assert.equal(b.custode.testo(b.fi), APPROVATA);
    } finally { A.chiudi(); b.chiudi(); }
  });

  test(`374 g8 T2: ${azione} dell impostazione in Accesso pieno col Sì: si scrive e diventa la versione approvata`, { timeout: 10_000 }, async () => {
    const b = await banco();
    const A = sessione(b);
    try {
      await A.pronta();
      const r = await muto(() => A.attrezzo(azione, { path: b.fi, contenuto: ACCESA }, { si: true, scrive: () => writeFileSync(b.fi, ACCESA) }));
      assert.equal(r.carta, true);
      assert.notEqual(r.esito?.consentito, false);
      assert.equal(b.custode.testo(b.fi), ACCESA, 'la persona ha visto la carta: il file scritto è l approvato');
    } finally { A.chiudi(); b.chiudi(); }
  });
}

test('374 g8 T2: anche i luoghi ricordati, anche scritti con un nome in maiuscolo, chiedono la carta in Accesso pieno', { timeout: 10_000 }, async () => {
  const b = await banco();
  const A = sessione(b);
  try {
    await A.pronta();
    const r = await muto(() => A.attrezzo('scrivi', { percorso: join(b.cartella, '.Computer-Use-Luoghi.JSON'), contenuto: '{}' }, { si: false }));
    assert.equal(r.carta, true);
    assert.equal(r.esito?.consentito, false);
  } finally { A.chiudi(); b.chiudi(); }
});

/* il nome come lo apre il kernel (Node) su Windows, misurato il 12/11/2026: `x.json::$DATA` è lo stesso file (carta), `x.json.` e
   `x.json . ` sono altri file (Node tiene il punto e lo spazio in coda): nessuna carta, come fuori dall'Accesso pieno (decisione 375) */
const SU_WINDOWS = process.platform === 'win32';
for (const [nome, carta] of [['.computer-use-impostazione.json::$DATA', true], ['.computer-use-impostazione.json.', false], ['.computer-use-impostazione.json . ', false]]) {
  test(`374 g8 T2: il nome «${nome}» in Accesso pieno: ${carta ? 'è lo stesso file, la carta arriva' : 'è un altro file, nessuna carta'}`, { timeout: 10_000, skip: !SU_WINDOWS && 'solo Windows' }, async () => {
    const b = await banco();
    const A = sessione(b);
    try {
      await A.pronta();
      const r = await muto(() => A.attrezzo('scrivi', { percorso: join(b.cartella, nome), contenuto: ACCESA }, { si: false }));
      assert.equal(r.carta, carta);
      assert.equal(r.esito?.consentito !== false, !carta);
    } finally { A.chiudi(); b.chiudi(); }
  });
}

/* L1 del revisore B del giro 8: col sì sulla carta di `x.json::$DATA` la scrittura (stesso file) diventa la versione approvata, come col
   nome semplice; prima `adottaDopoLaScrittura` chiedeva al custode il nome con lo stream, e il file veniva RIMESSO al comando dopo */
for (const permessi of ['Full access', 'Workspace write']) {
  test(`374 g8 L1: il sì sulla carta di «::$DATA» (${permessi}) fa la versione approvata`, { timeout: 10_000, skip: !SU_WINDOWS && 'solo Windows' }, async () => {
    const b = await banco();
    const A = sessione(b, permessi);
    try {
      await A.pronta();
      const nome = join(b.cartella, '.computer-use-impostazione.json::$DATA');
      const r = await muto(() => A.attrezzo('scrivi', { percorso: nome, contenuto: ACCESA }, { si: true, scrive: () => writeFileSync(nome, ACCESA) }));
      assert.equal(r.carta, true);
      assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, 'lo stream ::$DATA è il file stesso');
      assert.equal(b.custode.testo(b.fi), ACCESA, 'il sì della persona fa la versione approvata');
    } finally { A.chiudi(); b.chiudi(); }
  });
}

test('374 g8 T2: senza custode (come la CLI) il nome basta: la carta arriva lo stesso in Accesso pieno', { timeout: 10_000 }, async () => {
  const b = await banco({ conCustode: false });
  const A = sessione(b);
  try {
    await A.pronta();
    const r = await muto(() => A.attrezzo('scrivi', { percorso: b.fi, contenuto: ACCESA }, { si: false }));
    assert.equal(r.carta, true);
    assert.equal(r.esito?.consentito, false);
  } finally { A.chiudi(); b.chiudi(); }
});

test('374 g8 T2 controprova (decisione 155): un altro file di controllo in Accesso pieno si scrive ancora senza carta', { timeout: 10_000 }, async () => {
  const b = await banco();
  const A = sessione(b);
  try {
    await A.pronta();
    const r = await muto(() => A.attrezzo('scrivi', { percorso: join(b.cartella, '.harness-ui-hooks.json'), contenuto: '{}' }, { si: false }));
    assert.equal(r.carta, false);
    assert.notEqual(r.esito?.consentito, false);
  } finally { A.chiudi(); b.chiudi(); }
});
