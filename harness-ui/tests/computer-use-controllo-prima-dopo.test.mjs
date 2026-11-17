/*
 * ⛔ Decisione 374 dell'owner (07/11/2026 22:02, via giudice): fuori dall'Accesso completo, prima e dopo OGNI comando della shell si
 *   controllano `.computer-use-impostazione.json` e `.computer-use-luoghi.json`. Cambiati senza una carta accettata ⇒ si rimette la
 *   versione approvata e si avvisa la persona, una volta. Note a-f del brief:
 *   a) un processo lasciato in sottofondo cambia il file DOPO il controllo ⇒ il computer use legge la versione approvata, non il file;
 *   b) la persona cambia il file a mano mentre il comando gira ⇒ la versione cambiata va accanto (mai cancellata) e l'avviso lo dice;
 *   e) un avviso solo, mai uno per comando; nessuno se il file non è cambiato. Accesso completo: nessun controllo (decisione 372).
 * Le sei prove del metodo (i)-(vi) del brief, rosse sul codice di 25c1364f0 PRIMA della cura (rosso-prima.log del curatore).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaImpostazioneComputerUse } from '../src/computer-use/impostazione.mjs';
import { creaRegistroLuoghi } from '../src/computer-use/luoghi-ricordati.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* il custode nasce con la cura: prima della cura non c'è, e le prove sono rosse per il comportamento che manca, non per l'import */
const custodeMod = await import('../src/computer-use/file-approvati.mjs').catch(() => ({}));
const EVENTO = custodeMod.EVENTO_FILE_COMPUTER_USE_RIPRISTINATI ?? 'talos.file-computer-use-ripristinati';

const IMPOSTAZIONE_APPROVATA = `${JSON.stringify({ schema: 'talos.computer-use-settings.v1', acceso: false }, null, 2)}\n`;
const LUOGHI_APPROVATI = `${JSON.stringify({ versione: 1, voci: [{ tipo: 'dominio', nome: 'example.com', quando: '2026-11-07T10:00:00.000Z' }] }, null, 1)}\n`;
const IMPOSTAZIONE_ESTRANEA = '{"acceso":true}\n';
const LUOGHI_ESTRANEI = '{"versione":1,"voci":[{"tipo":"dominio","nome":"bank.example","quando":"2026-11-08T10:00:00.000Z"},{"tipo":"app","nome":"cmd.exe","quando":"2026-11-08T10:00:00.000Z"}]}\n';
/* un comando qualunque, che non nomina i due file: il cancello 373 non chiede niente, il controllo prima/dopo lo prende */
const COMANDO = 'node scripts/build.mjs';

export function banco() {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374-'));
  const impostazione = join(cartella, '.computer-use-impostazione.json');
  const luoghi = join(cartella, '.computer-use-luoghi.json');
  writeFileSync(impostazione, IMPOSTAZIONE_APPROVATA);
  writeFileSync(luoghi, LUOGHI_APPROVATI);
  /* giro 3 (decisione 387, B2): senza una voce nel portachiavi i file sul disco vanno da parte all'avvio; qui sono quelli approvati da
     un TALOS di prima, quindi la voce c'è (le impronte nell'ordine dei percorsi, impostazione prima di luoghi) */
  const portachiavi = creaAdattatorePortachiaviInMemoria();
  const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
  if (custodeMod.accountDelleImpronte) portachiavi.set(custodeMod.SERVIZIO_IMPRONTE_COMPUTER_USE, custodeMod.accountDelleImpronte([impostazione, luoghi]), `v1:${sha(IMPOSTAZIONE_APPROVATA)},${sha(LUOGHI_APPROVATI)}`);
  const custode = custodeMod.creaCustodeFileComputerUse?.({ file: [impostazione, luoghi], portachiavi }) ?? null;
  const copie = (nome) => readdirSync(cartella).filter((f) => f.startsWith(`${nome}.changed-`)).sort().map((f) => join(cartella, f));
  return { cartella, impostazione, luoghi, custode, copie, chiudi: () => rimuoviCartellaDiProva(cartella) };
}

function sessione(custode, { permessiScelto = 'Workspace write' } = {}) {
  let input = null;
  let risolvi;
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: tmpdir(), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }),
    custodeFileComputerUse: custode,
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return {
    /** un comando della shell come lo vede il registro: pre_tool_call, il comando che gira (`durante`), post_tool_call */
    async comando(testo, durante) {
      const pre = await input.hookFn({ tipo: 'pre_tool_call', azione: 'shell', argomenti: { comando: testo }, giro: 0 });
      assert.deepEqual(pre, { consentito: true }, `${testo}: il comando parte senza carta`);
      await durante?.();
      await input.hookFn({ tipo: 'post_tool_call', azione: 'shell', esito: 'ok', giro: 0 });
    },
    avvisi: () => ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO),
    idAvvisi: () => new Set(ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO).map((e) => e.value?.idAvviso)),
    carte: () => ricevuti.filter((e) => e.type === 'ApprovalRequested'),
    chiudi: () => { input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
  };
}

test('374 (i) — un comando che cambia il file: si rimette la versione approvata, la cambiata va accanto, UN avviso', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    await s.comando(COMANDO, () => writeFileSync(b.impostazione, IMPOSTAZIONE_ESTRANEA));
    assert.equal(readFileSync(b.impostazione, 'utf8'), IMPOSTAZIONE_APPROVATA, 'il file torna quello approvato');
    const copie = b.copie('.computer-use-impostazione.json');
    assert.equal(copie.length, 1, 'la versione cambiata è messa da parte, non cancellata');
    assert.equal(readFileSync(copie[0], 'utf8'), IMPOSTAZIONE_ESTRANEA);
    assert.equal(s.idAvvisi().size, 1, 'un avviso');
    const [avviso] = s.avvisi();
    assert.deepEqual(avviso.value.file, ['.computer-use-impostazione.json']);
    assert.match(avviso.value.testo, /put back/i);
    assert.equal(s.carte().length, 0, 'nessuna carta in più');
    assert.equal(readFileSync(b.luoghi, 'utf8'), LUOGHI_APPROVATI, 'l altro file non si tocca');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 (ii) — un processo in sottofondo cambia i file DOPO il controllo: il computer use legge la versione approvata', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    await s.comando('start /b node sfondo.mjs');
    writeFileSync(b.impostazione, IMPOSTAZIONE_ESTRANEA); // il processo rimasto vivo scrive dopo il post_tool_call
    writeFileSync(b.luoghi, LUOGHI_ESTRANEI);
    const impostazione = creaImpostazioneComputerUse({ file: b.impostazione, custode: b.custode, avvisa: () => {} });
    assert.equal(impostazione.acceso(), false, 'acceso() dalla versione approvata');
    assert.deepEqual(await impostazione.leggi(), { acceso: false });
    const luoghi = creaRegistroLuoghi({ file: b.luoghi, custode: b.custode });
    assert.deepEqual(await luoghi.perIlCiclo(), { domini: ['example.com'], app: [] }, 'i luoghi dalla versione approvata');
    /* il comando dopo trova il cambio e lo rimette */
    await s.comando(COMANDO);
    assert.equal(readFileSync(b.impostazione, 'utf8'), IMPOSTAZIONE_APPROVATA);
    assert.equal(readFileSync(b.luoghi, 'utf8'), LUOGHI_APPROVATI);
    assert.equal(s.idAvvisi().size, 1);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 (iii) — la persona cambia il file a mano mentre il comando gira: copia accanto, ripristino, l avviso lo dice', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    const aMano = `${JSON.stringify({ versione: 1, voci: [{ tipo: 'dominio', nome: 'mio.example', quando: '2026-11-08T10:30:00.000Z' }] }, null, 1)}\n`;
    await s.comando('npm test', () => writeFileSync(b.luoghi, aMano));
    assert.equal(readFileSync(b.luoghi, 'utf8'), LUOGHI_APPROVATI);
    const copie = b.copie('.computer-use-luoghi.json');
    assert.equal(copie.length, 1);
    assert.equal(readFileSync(copie[0], 'utf8'), aMano, 'la modifica della persona è intera, accanto');
    assert.equal(s.idAvvisi().size, 1);
    const ultimo = s.avvisi().at(-1).value;
    assert.deepEqual(ultimo.copie, copie, 'l avviso nomina la copia');
    assert.match(ultimo.testo, /kept/i);
    assert.match(ultimo.testo, /yourself/i, 'dice cosa fare se il cambio era della persona');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 (iv) — file non cambiati: nessun avviso, nessuna copia, i file intatti (con il controllo acceso)', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    for (const c of ['git status', 'npm test', 'ls -la .*', 'cat .env*', 'rg -g "*impostazione*" foo']) await s.comando(c);
    assert.equal(s.avvisi().length, 0, 'nessun avviso');
    assert.deepEqual([...b.copie('.computer-use-impostazione.json'), ...b.copie('.computer-use-luoghi.json')], []);
    assert.equal(readFileSync(b.impostazione, 'utf8'), IMPOSTAZIONE_APPROVATA);
    assert.equal(s.carte().length, 0);
    /* controllo: lo stesso banco, un comando che cambia il file ⇒ un avviso (a controllo spento questa prova è rossa) */
    await s.comando(COMANDO, () => writeFileSync(b.luoghi, LUOGHI_ESTRANEI));
    assert.equal(s.idAvvisi().size, 1, 'controllo acceso');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 (v) g4 (decisione 390) — Accesso completo: il comando che nomina il file, e quello che non lo nomina, non si ripristinano; il cambio diventa approvato, senza carte', { timeout: 10_000 }, async () => {
  const b = banco();
  const pieno = sessione(b.custode, { permessiScelto: 'Full access' });
  const altra = sessione(b.custode);
  try {
    await pieno.comando('node scripts/imposta.mjs .computer-use-impostazione.json', () => writeFileSync(b.impostazione, IMPOSTAZIONE_ESTRANEA));
    assert.equal(readFileSync(b.impostazione, 'utf8'), IMPOSTAZIONE_ESTRANEA, 'in Accesso completo il file resta com è');
    assert.equal(pieno.avvisi().length, 0);
    assert.deepEqual(b.copie('.computer-use-impostazione.json'), []);
    const impostazione = creaImpostazioneComputerUse({ file: b.impostazione, custode: b.custode, avvisa: () => {} });
    assert.equal(impostazione.acceso(), true, 'la scelta fatta in Accesso completo vale');
    /* un altra sessione, fuori dall Accesso completo, non lo rimette indietro: è la versione approvata */
    await altra.comando('npm test');
    assert.equal(readFileSync(b.impostazione, 'utf8'), IMPOSTAZIONE_ESTRANEA);
    assert.equal(altra.avvisi().length, 0);
    /* controllo: la sessione non piena, un comando che cambia l altro file ⇒ ripristino */
    await altra.comando(COMANDO, () => writeFileSync(b.luoghi, LUOGHI_ESTRANEI));
    assert.equal(readFileSync(b.luoghi, 'utf8'), LUOGHI_APPROVATI, 'controllo acceso fuori dall Accesso completo');
    /* giro 4 (decisione 390, «Non toccare nulla»; il giro 3 A1 è tolto): in Accesso completo anche un comando che NON nomina il
       file lo cambia e il cambio resta, senza avviso, copia né carta (come la base 373) */
    const copiePrima = b.copie('.computer-use-luoghi.json').length; // una, quella del controllo della sessione non piena qui sopra
    await pieno.comando(COMANDO, () => writeFileSync(b.luoghi, LUOGHI_ESTRANEI));
    assert.equal(readFileSync(b.luoghi, 'utf8'), LUOGHI_ESTRANEI, 'in Accesso completo la 374 non interviene');
    assert.equal(pieno.avvisi().length, 0);
    assert.equal(b.copie('.computer-use-luoghi.json').length, copiePrima, 'nessuna copia nuova');
    assert.equal(pieno.carte().length, 0, 'decisione 372: nessuna carta in Accesso completo');
  } finally { pieno.chiudi(); altra.chiudi(); b.chiudi(); }
});

test('374 (vi) — due comandi in fila che cambiano i file: un avviso solo, aggiornato', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    await s.comando(COMANDO, () => writeFileSync(b.impostazione, IMPOSTAZIONE_ESTRANEA));
    await s.comando(COMANDO, () => writeFileSync(b.impostazione, IMPOSTAZIONE_ESTRANEA)); // lo stesso contenuto di nuovo
    await s.comando(COMANDO, () => writeFileSync(b.luoghi, LUOGHI_ESTRANEI)); // un cambio diverso, stesso giro
    assert.equal(readFileSync(b.impostazione, 'utf8'), IMPOSTAZIONE_APPROVATA);
    assert.equal(readFileSync(b.luoghi, 'utf8'), LUOGHI_APPROVATI);
    assert.equal(s.idAvvisi().size, 1, 'un avviso solo per il giro');
    assert.equal(b.copie('.computer-use-impostazione.json').length, 1, 'lo stesso contenuto non fa una seconda copia');
    const ultimo = s.avvisi().at(-1).value;
    assert.deepEqual([...ultimo.file].sort(), ['.computer-use-impostazione.json', '.computer-use-luoghi.json'], 'l avviso aggiornato dice tutti e due');
    assert.equal(ultimo.copie.length, 2);
  } finally { s.chiudi(); b.chiudi(); }
});
