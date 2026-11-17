/*
 * ⛔ Decisione 374, giro 2 (revisori A, B e C del giro 1): l'impronta approvata dei due file del computer use vive FUORI dai file, nel
 *   portachiavi che TALOS usa già; un riavvio non adotta più ciò che trova sul disco. Qui anche le altre cure del giro: la carta 373
 *   adotta solo i file che il comando nomina, `prova` passa dal controllo come `shell`, l'Accesso completo controlla prima di adottare,
 *   le copie hanno un tetto, `scrivi` non sovrascrive ciò che non ha messo da parte, l'avviso va a chi ha il comando in corso e non si
 *   ripete uguale. Le sonde dei revisori (A S1-S6, B S1-S6 e S4b, C X2-X3) sono qui dentro, una prova per sonda.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaImpostazioneComputerUse } from '../src/computer-use/impostazione.mjs';
import { creaRegistroLuoghi } from '../src/computer-use/luoghi-ricordati.mjs';
import { porteDelComputerUse } from '../src/computer-use/interruttore.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import * as custodeMod from '../src/computer-use/file-approvati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { creaCustodeFileComputerUse, EVENTO_FILE_COMPUTER_USE_RIPRISTINATI: EVENTO } = custodeMod;
const QUI = dirname(fileURLToPath(import.meta.url));
const APPROVATA = '{"schema":"talos.computer-use-settings.v1","acceso":false}\n';
const ACCESA = '{"schema":"talos.computer-use-settings.v1","acceso":true}\n';
const LUOGHI = '{"versione":1,"voci":[]}\n';
const LUOGHI_ESTRANEI = '{"versione":1,"voci":[{"tipo":"app","nome":"cmd.exe","quando":"2026-11-08T10:00:00.000Z"}]}\n';
const occupato = () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); };

function banco({ impostazione = APPROVATA, luoghi = LUOGHI, portachiavi = creaAdattatorePortachiaviInMemoria(), semina = true, ...o } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374g2-'));
  const fi = join(cartella, '.computer-use-impostazione.json');
  const fl = join(cartella, '.computer-use-luoghi.json');
  if (impostazione !== null) writeFileSync(fi, impostazione);
  if (luoghi !== null) writeFileSync(fl, luoghi);
  /* Giro 3 (B2): senza voce nel portachiavi i file vanno da parte all'avvio; di serie il banco la semina come dopo un'approvazione,
     `semina: false` per le prove della prima installazione e dell'aggiornamento. */
  if (semina) { const sha = (t) => (t === null ? 'assente' : createHash('sha256').update(t, 'utf8').digest('hex')); try { portachiavi?.set?.(custodeMod.SERVIZIO_IMPRONTE_COMPUTER_USE, custodeMod.accountDelleImpronte([fi, fl]), `v1:${sha(impostazione)},${sha(luoghi)}`); } catch { /* un portachiavi finto che non salva */ } }
  const nuovo = (altro = {}) => creaCustodeFileComputerUse({ file: [fi, fl], portachiavi, ...o, ...altro });
  const custode = nuovo();
  const copie = (nome) => readdirSync(cartella).filter((f) => f.startsWith(`${nome}.changed-`)).sort().map((f) => join(cartella, f));
  const acceso = (c) => creaImpostazioneComputerUse({ file: fi, custode: c, avvisa: () => {} }).acceso();
  const luoghiDi = (c) => creaRegistroLuoghi({ file: fl, custode: c }).perIlCiclo();
  const voceDelPortachiavi = () => [custodeMod.SERVIZIO_IMPRONTE_COMPUTER_USE, custodeMod.accountDelleImpronte([fi, fl])];
  return { cartella, fi, fl, portachiavi, custode, nuovo, copie, acceso, luoghiDi, voceDelPortachiavi, chiudi: () => rimuoviCartellaDiProva(cartella) };
}
const conAvvisiMuti = async (fn) => {
  const warn = console.warn; const righe = []; console.warn = (m) => righe.push(String(m));
  try { return { esito: await fn(), righe }; } finally { console.warn = warn; }
};

/* ——— 1. l'impronta fuori dai file ——— */

test('374 g2 (A S2) riavvio dopo una scrittura in sottofondo: il file diverso dall impronta va da parte, spento, nessun luogo, avviso', async () => {
  const b = banco();
  try {
    await b.custode.controlla(); // la prima volta l'impronta si salva
    writeFileSync(b.fi, ACCESA); writeFileSync(b.fl, LUOGHI_ESTRANEI); // dopo l'ultimo controllo, poi il server riparte
    const { esito: dopo, righe } = await conAvvisiMuti(() => b.nuovo());
    assert.equal(b.acceso(dopo), false, 'il riavvio non accende');
    assert.deepEqual(await b.luoghiDi(dopo), { domini: [], app: [] }, 'nessun luogo estraneo');
    assert.equal(existsSync(b.fi), false, 'il file estraneo non resta al suo posto');
    assert.equal(readFileSync(b.copie('.computer-use-impostazione.json')[0], 'utf8'), ACCESA, 'messo da parte, mai cancellato');
    assert.equal(readFileSync(b.copie('.computer-use-luoghi.json')[0], 'utf8'), LUOGHI_ESTRANEI);
    assert.ok(righe.some((r) => /did not match the approved version/.test(r)), 'detto anche nel registro del server');
    const esito = await dopo.controlla();
    assert.deepEqual(esito.ripristinati.map((r) => [r.allAvvio, typeof r.copia]), [[true, 'string'], [true, 'string']], 'il primo controllo lo riferisce');
    assert.deepEqual(await dopo.controlla(), { ripristinati: [], errori: [] }, 'una volta sola');
    assert.equal(b.nuovo().testo(b.fi), null, 'l impronta salvata dopo è «assente»: un altro riavvio resta spento');
  } finally { b.chiudi(); }
});

test('374 g2 prima installazione (nessun file, nessuna impronta): un file comparso prima del riavvio non è adottato', async () => {
  const b = banco({ impostazione: null, luoghi: null });
  try {
    await b.custode.controlla();
    assert.equal(b.portachiavi.get(...b.voceDelPortachiavi()), 'v1:assente,assente');
    writeFileSync(b.fi, ACCESA);
    const { esito: dopo } = await conAvvisiMuti(() => b.nuovo());
    assert.equal(b.acceso(dopo), false);
    assert.equal(existsSync(b.fi), false);
  } finally { b.chiudi(); }
});

test('374 g3 (B2) aggiornamento dalla versione di oggi (file presenti, voce mai salvata): da parte SUBITO, spento, una voce; chi riaccende lo fa una volta', async () => {
  const b = banco({ impostazione: ACCESA, semina: false });
  try {
    assert.equal(b.acceso(b.custode), false, 'senza voce nel portachiavi niente si adotta, nemmeno la prima volta');
    assert.equal(existsSync(b.fi), false, 'messo da parte già alla nascita del custode, non al primo comando');
    assert.equal(readFileSync(b.copie('.computer-use-impostazione.json')[0], 'utf8'), ACCESA, 'mai cancellato');
    assert.equal(b.portachiavi.get(...b.voceDelPortachiavi()), 'v1:assente,assente', 'la voce si salva subito');
    const esito = await b.custode.avvia();
    assert.deepEqual(esito.ripristinati.map((r) => [r.allAvvio, typeof r.copia]), [[true, 'string'], [true, 'string']]);
    assert.equal((await b.custode.controlla()).ripristinati.length, 2, 'l esito dell avvio resta per il primo controllo di una sessione');
    assert.deepEqual(await b.custode.controlla(), { ripristinati: [], errori: [] }, 'poi una volta sola');
    await b.custode.scrivi(b.fi, ACCESA); // la persona lo riaccende dalle Impostazioni
    const { esito: dopo } = await conAvvisiMuti(() => b.nuovo());
    assert.equal(b.acceso(dopo), true, 'riacceso una volta, resta acceso ai riavvii');
    assert.equal(b.copie('.computer-use-impostazione.json').length, 1, 'nessuna copia nuova al riavvio');
  } finally { b.chiudi(); }
});

test('374 g2 impronta illeggibile (portachiavi che lancia, assente, voce storta, conto sbagliato): chiuso, file non toccato, avviso', async () => {
  const casi = [
    ['lancia', () => ({ get: () => { throw Object.assign(new Error('locked'), { code: 'EKEYCHAIN' }); }, set: () => {}, remove: () => {} }), 'EKEYCHAIN'],
    ['assente', () => null, 'NO_KEYCHAIN'],
    ['storta', (b) => { const p = creaAdattatorePortachiaviInMemoria(); p.set(...b.voceDelPortachiavi(), 'v1:zzz,assente'); return p; }, 'MALFORMED'],
    ['una sola', (b) => { const p = creaAdattatorePortachiaviInMemoria(); p.set(...b.voceDelPortachiavi(), 'v1:assente'); return p; }, 'MALFORMED'],
  ];
  for (const [nome, fa, codice] of casi) {
    const b = banco({ impostazione: ACCESA });
    try {
      const { esito: c } = await conAvvisiMuti(() => b.nuovo({ portachiavi: fa(b) }));
      assert.equal(c.testo(b.fi), null, `${nome}: mai aperto`);
      assert.equal(b.acceso(c), false, nome);
      const esito = await c.controlla();
      assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, `${nome}: il file resta dov è`);
      assert.deepEqual(esito.errori.map((e) => [e.fase, e.codice]), [['impronta', codice], ['impronta', codice]], nome);
    } finally { b.chiudi(); }
  }
  assert.throws(() => creaCustodeFileComputerUse({ file: [join(tmpdir(), 'x.json')] }), /keychain/u, 'il portachiavi va detto, anche null');
});

test('374 g2 (A S5) file bloccato all avvio (rinomina impossibile): chiuso, nessuna adozione, impronta tenuta', async () => {
  const b = banco();
  try {
    await b.custode.controlla();
    writeFileSync(b.fi, ACCESA);
    const { esito: c } = await conAvvisiMuti(() => b.nuovo({ deps: { renameSync: occupato } }));
    assert.equal(b.acceso(c), false);
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, 'non sovrascritto');
    const esito = await c.controlla();
    assert.deepEqual(esito.errori.map((e) => [e.fase, e.codice, e.allAvvio]), [['da-parte', 'EBUSY', true]]);
    const { esito: ancora } = await conAvvisiMuti(() => b.nuovo({ deps: { renameSync: occupato } }));
    assert.equal(ancora.testo(b.fi), null, 'l impronta approvata resta quella di prima: chiuso anche al riavvio dopo');
  } finally { b.chiudi(); }
});

test('374 g2 un salvataggio dell impronta che fallisce si dice, e al riavvio il file non torna approvato', async () => {
  const vero = creaAdattatorePortachiaviInMemoria();
  let rotto = false;
  const portachiavi = { get: (s, a) => vero.get(s, a), set: (s, a, v) => { if (rotto) throw new Error('denied'); vero.set(s, a, v); }, remove: () => {} };
  const b = banco({ portachiavi });
  try {
    await b.custode.controlla();
    rotto = true;
    const { righe } = await conAvvisiMuti(() => b.custode.scrivi(b.fi, ACCESA));
    assert.ok(righe.some((r) => /could not be saved/.test(r)));
    assert.equal(b.custode.testo(b.fi), ACCESA, 'la sessione viva usa la scrittura approvata');
    const { esito: dopo } = await conAvvisiMuti(() => b.nuovo());
    assert.equal(dopo.testo(b.fi), null);
  } finally { b.chiudi(); }
});

test('374 g3 (B2) la voce del portachiavi cancellata: i file vanno da parte, spento; limite misurato: chi la RISCRIVE ottiene una adozione', async () => {
  const b = banco();
  try {
    await b.custode.controlla();
    writeFileSync(b.fi, ACCESA);
    b.portachiavi.remove(...b.voceDelPortachiavi());
    const { esito: dopo } = await conAvvisiMuti(() => b.nuovo());
    assert.equal(dopo.testo(b.fi), null, 'una voce che manca non è più un adozione: l approvato è «assente»');
    assert.equal(existsSync(b.fi), false);
    writeFileSync(b.fi, ACCESA);
    b.portachiavi.set(...b.voceDelPortachiavi(), `v1:${createHash('sha256').update(ACCESA, 'utf8').digest('hex')},assente`);
    assert.equal(b.nuovo().testo(b.fi), ACCESA, 'come Hermes vault_keychain.py:8-9: il portachiavi non separa dal codice dello stesso utente');
  } finally { b.chiudi(); }
});

/* ——— 5. tetto delle copie; 6. scrivi che non mette da parte rifiuta ——— */

test('374 g2 (A S6) trenta contenuti nuovi: al massimo 10 copie per file, la più recente resta sempre; tetto di dimensione', async () => {
  const b = banco();
  try {
    let ultima = '';
    for (let i = 0; i < 30; i += 1) { ultima = LUOGHI_ESTRANEI.replace('cmd.exe', `c${i}.exe`); writeFileSync(b.fl, ultima); await b.custode.controlla(); }
    const copie = b.copie('.computer-use-luoghi.json');
    assert.equal(copie.length, custodeMod.COPIE_PER_FILE);
    assert.equal(custodeMod.COPIE_PER_FILE, 10);
    assert.ok(copie.some((c) => readFileSync(c, 'utf8') === ultima), 'la copia più recente c è');
    assert.ok(!copie.some((c) => readFileSync(c, 'utf8').includes('"c0.exe"')), 'la più vecchia è tolta');
    const grande = 'x'.repeat(custodeMod.BYTE_DELLE_COPIE_PER_FILE - 10);
    writeFileSync(b.fi, `${grande}1`); await b.custode.controlla();
    writeFileSync(b.fi, `${grande}${'y'.repeat(20)}2`); const esito = await b.custode.controlla(); // la più recente da sola supera il tetto
    const restano = b.copie('.computer-use-impostazione.json');
    assert.equal(restano.length, 1, 'oltre il tetto di dimensione si tolgono le più vecchie');
    assert.equal(readFileSync(restano[0], 'utf8'), `${grande}${'y'.repeat(20)}2`, 'mai la più recente, anche se da sola supera il tetto');
    assert.equal(esito.ripristinati[0].tolte, 1);
  } finally { b.chiudi(); }
});

test('374 g2 (A S4) scrivi con un file estraneo che non si mette da parte: rifiuta e lo dice, il file resta', async () => {
  const b = banco({ deps: { rename: async () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); } } });
  try {
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    const luoghi = creaRegistroLuoghi({ file: b.fl, custode: b.custode });
    await assert.rejects(luoghi.ricorda({ domini: ['nuovo.example'] }), (e) => e.code === 'COMPUTER_USE_FILE_NOT_SET_ASIDE' && /could not be moved aside/u.test(e.message));
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI_ESTRANEI, 'mai sovrascritto');
    assert.equal(b.custode.testo(b.fl), LUOGHI, 'l approvato non cambia');
    const illeggibile = banco({ deps: { readFile: async () => { throw Object.assign(new Error('locked'), { code: 'EACCES' }); } } });
    try { await assert.rejects(illeggibile.custode.scrivi(illeggibile.fi, ACCESA), { code: 'COMPUTER_USE_FILE_NOT_SET_ASIDE' }); } finally { illeggibile.chiudi(); }
    const http = readFileSync(join(QUI, '..', 'src', 'http-app.mjs'), 'utf8');
    assert.match(http, /COMPUTER_USE_FILE_NOT_SET_ASIDE: '[^']*moved aside/u, 'il messaggio del codice');
    assert.match(http, /COMPUTER_USE_FILE_NOT_SET_ASIDE: 409/u, 'lo stato del codice');
    const errori = readFileSync(join(QUI, '..', 'frontend', 'src', 'i18n', 'testi', 'errori.js'), 'utf8');
    assert.equal(errori.split("'COMPUTER_USE_FILE_NOT_SET_ASIDE.message'").length - 1, 2, 'italiano e inglese');
  } finally { b.chiudi(); }
});

test('374 g2 un file incerto (illeggibile all avvio) scritto da una porta approvata: prima va da parte, poi si scrive', async () => {
  const b = banco({ impostazione: ACCESA, deps: { readFileSync: () => { throw Object.assign(new Error('locked'), { code: 'EACCES' }); } } });
  try {
    await conAvvisiMuti(() => b.custode.scrivi(b.fi, APPROVATA));
    assert.equal(readFileSync(b.copie('.computer-use-impostazione.json')[0], 'utf8'), ACCESA);
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA);
  } finally { b.chiudi(); }
});

test('374 g2 un file incerto che non si mette da parte (EBUSY): scrivi rifiuta, il file resta', async () => {
  const chiuso = { get: () => { throw Object.assign(new Error('locked'), { code: 'EKEYCHAIN' }); }, set: () => {}, remove: () => {} };
  const b = banco({ impostazione: ACCESA, portachiavi: chiuso, deps: { rename: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } } });
  try {
    await assert.rejects(conAvvisiMuti(() => b.custode.scrivi(b.fi, APPROVATA)), { code: 'COMPUTER_USE_FILE_NOT_SET_ASIDE' });
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, 'mai sovrascritto');
  } finally { b.chiudi(); }
});

test('374 g2 l impronta tenuta di un file incerto resta nel portachiavi quando si scrive l altro file', async () => {
  const b = banco();
  try {
    await b.custode.controlla();
    const soloFi = (f, enc) => { if (f === b.fi) throw Object.assign(new Error('locked'), { code: 'EACCES' }); return readFileSync(f, enc); };
    const { esito: c } = await conAvvisiMuti(() => b.nuovo({ deps: { readFileSync: soloFi } }));
    await c.scrivi(b.fl, LUOGHI_ESTRANEI);
    const dopo = b.nuovo();
    assert.equal(dopo.testo(b.fi), APPROVATA, 'l impronta del file incerto non si perde');
    assert.equal(dopo.testo(b.fl), LUOGHI_ESTRANEI);
  } finally { b.chiudi(); }
});

test('374 g2 adotta salva subito l impronta: un riavvio senza altri controlli non mette da parte il file adottato', async () => {
  const b = banco();
  try {
    await b.custode.controlla();
    writeFileSync(b.fi, ACCESA);
    await b.custode.adotta([b.fi]);
    const { esito: dopo } = await conAvvisiMuti(() => b.nuovo());
    assert.equal(dopo.testo(b.fi), ACCESA);
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA);
  } finally { b.chiudi(); }
});

test('374 g2 l account del portachiavi non dipende da maiuscole e minuscole (Windows: lo stesso file)', () => {
  const base = join(tmpdir(), 'Talos-Account');
  assert.equal(custodeMod.accountDelleImpronte([join(base, 'A.json'), join(base, 'B.json')]),
    custodeMod.accountDelleImpronte([join(base.toLowerCase(), 'b.json'), join(base.toUpperCase(), 'a.JSON')]));
});

test('374 g2 le copie messe da parte all avvio rispettano il tetto al primo controllo, la nuova resta', async () => {
  const b = banco();
  try {
    await b.custode.controlla();
    for (let k = 1; k <= 12; k += 1) writeFileSync(join(b.cartella, `.computer-use-impostazione.json.changed-2026-01-01T00-00-00-000Z-1-${k}`), `vecchia ${k}`);
    writeFileSync(b.fi, ACCESA);
    const { esito: c } = await conAvvisiMuti(() => b.nuovo());
    const esito = await c.controlla();
    const copie = b.copie('.computer-use-impostazione.json');
    assert.equal(copie.length, custodeMod.COPIE_PER_FILE);
    assert.ok(copie.some((p) => readFileSync(p, 'utf8') === ACCESA), 'la copia dell avvio resta');
    assert.equal(esito.ripristinati.find((r) => r.allAvvio)?.tolte, 3);
  } finally { b.chiudi(); }
});

/* ——— i fili nel registro delle sessioni ——— */

function sessione(custode, { permessiScelto = 'Workspace write', registro: altro = {} } = {}) {
  let input = null;
  let risolvi;
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: tmpdir(), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }),
    custodeFileComputerUse: custode,
    ...altro,
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return {
    async attrezzo(azione, argomenti, { si = true, durante } = {}) {
      const prima = ricevuti.length;
      const p = input.hookFn({ tipo: 'pre_tool_call', azione, argomenti, giro: 0 });
      await new Promise((r) => setTimeout(r, 5));
      const carta = ricevuti.slice(prima).find((e) => e.type === 'ApprovalRequested');
      if (carta) registro.rispondiApprovazione(sessionId, carta.requestId, si);
      const esito = await p;
      if (esito?.consentito !== false) await durante?.();
      await input.hookFn({ tipo: 'post_tool_call', azione, esito: 'ok', giro: 0 });
      return { esito, carta: carta ?? null };
    },
    carte: () => ricevuti.filter((e) => e.type === 'ApprovalRequested').length,
    avvisi: () => ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO),
    chiudi: () => { input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
  };
}

test('374 g2 (A S1) carta 373 accettata per un file: si adotta SOLO quello, non ciò che un processo scrive nell altro', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    const { carta } = await s.attrezzo('shell', { comando: 'type .computer-use-impostazione.json' }, { durante: () => writeFileSync(b.fl, LUOGHI_ESTRANEI) });
    assert.ok(carta);
    assert.equal(b.custode.testo(b.fl), LUOGHI, 'i luoghi scritti in sottofondo non diventano approvati');
    assert.deepEqual(await b.luoghiDi(b.custode), { domini: [], app: [] });
    await s.attrezzo('shell', { comando: 'git status' });
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI, 'il comando dopo li rimette');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g2 (A S3) `prova` passa dallo stesso controllo della shell: prima e dopo, senza carta', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    await s.attrezzo('prova', {}, { durante: () => writeFileSync(b.fi, ACCESA) });
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA, 'rimesso dopo la prova');
    assert.equal(s.avvisi().length, 1);
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    await s.attrezzo('prova', {});
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI, 'e prima della prova');
    assert.equal(s.carte(), 0);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g2 (A4) Accesso completo: controllo prima (un cambio lasciato da altri torna indietro), adotta ciò che cambia durante; carte solo per scrivere i file (giro 8)', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode, { permessiScelto: 'Full access' });
  try {
    writeFileSync(b.fl, LUOGHI_ESTRANEI); // lasciato da un processo di un altra sessione
    await s.attrezzo('shell', { comando: 'node imposta.mjs .computer-use-impostazione.json' }, { durante: () => writeFileSync(b.fi, ACCESA) });
    assert.equal(b.custode.testo(b.fl), LUOGHI, 'non adottato');
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI);
    assert.equal(b.custode.testo(b.fi), ACCESA, 'il cambio del comando pieno diventa approvato');
    writeFileSync(b.fi, APPROVATA); // di nuovo un altro processo, poi una scrittura per percorso dell'altro file
    await s.attrezzo('scrivi', { percorso: b.fl }, { durante: () => writeFileSync(b.fl, LUOGHI.replace('[]', '[ ]')) });
    assert.equal(b.custode.testo(b.fl), LUOGHI.replace('[]', '[ ]'));
    assert.equal(b.custode.testo(b.fi), ACCESA, 'la scrittura per percorso adotta solo il suo file');
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, 'e controlla prima');
    const relativo = join(basename(b.cartella), '.computer-use-luoghi.json'); // la cartella della sessione è tmpdir(), mai quella del processo
    await s.attrezzo('scrivi', { percorso: relativo }, { durante: () => writeFileSync(b.fl, LUOGHI.replace('[]', '[  ]')) });
    assert.equal(b.custode.testo(b.fl), LUOGHI.replace('[]', '[  ]'), 'il percorso relativo si risolve sulla cartella della sessione');
    /* giro 4 (decisione 390, «Non toccare nulla»; il giro 3 A1 è tolto): in Accesso completo anche la shell che non nomina il file
       lo adotta, come la base 373 */
    const avvisiPrima = s.avvisi().length; // quelli dei controlli di prima, qui sopra
    await s.attrezzo('shell', { comando: 'node altro.mjs' }, { durante: () => writeFileSync(b.fi, APPROVATA) });
    assert.equal(b.custode.testo(b.fi), APPROVATA, 'la shell muta adotta in Accesso completo');
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA, 'e il cambio resta');
    assert.equal(s.avvisi().length, avvisiPrima, 'nessun avviso nuovo');
    assert.equal(s.carte(), 2, 'giro 8 (decisioni 323 e 370, «carta sempre»): le due scritture per percorso dei file del computer use chiedono la carta anche in Accesso pieno; la shell nessuna (decisione 390)');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g2 (C X2) l avviso va alla sessione col comando in corso, non a quella che controlla', { timeout: 10_000 }, async () => {
  const b = banco();
  const A = sessione(b.custode); const B = sessione(b.custode);
  try {
    await A.attrezzo('shell', { comando: 'node scripts/setup.mjs' }, { durante: async () => { writeFileSync(b.fi, ACCESA); await B.attrezzo('shell', { comando: 'git status' }); } });
    assert.equal(A.avvisi().length, 1, 'A, il cui comando ha cambiato il file');
    assert.equal(B.avvisi().length, 0);
    writeFileSync(b.fi, ACCESA); // nessun comando in corso: lo dice chi controlla
    await B.attrezzo('shell', { comando: 'git status' });
    assert.equal(B.avvisi().length, 1);
  } finally { A.chiudi(); B.chiudi(); b.chiudi(); }
});

test('374 g2 (C X3) uno scrittore in ciclo, cinque comandi: un avviso, un evento; il contenuto nuovo aggiorna lo stesso avviso', { timeout: 10_000 }, async () => {
  const b = banco();
  /* Giro 3 (B6): `_sequenza` c'è su ogni evento non effimero, durevole o no: l'asserzione vera è la riga scritta con `durable: true`. */
  const scritte = [];
  const s = sessione(b.custode, { registro: { cartellaStore: b.cartella, registraRigaFn: (a) => { scritte.push(a); return Promise.resolve(); } } });
  try {
    for (let k = 0; k < 5; k += 1) { writeFileSync(b.fi, ACCESA); await s.attrezzo('shell', { comando: 'npm test' }); }
    assert.equal(s.avvisi().length, 1, 'un evento solo');
    const righeAvviso = scritte.filter((a) => a.record?.type === 'CUSTOM' && a.record?.name === EVENTO);
    assert.deepEqual(righeAvviso.map((a) => a.durable), [true], 'una riga sul disco, scritta come durevole (non effimera, non la coda semplice)');
    writeFileSync(b.fl, LUOGHI_ESTRANEI); await s.attrezzo('shell', { comando: 'npm test' });
    assert.equal(s.avvisi().length, 2);
    assert.equal(new Set(s.avvisi().map((e) => e.value.idAvviso)).size, 1);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g2 l avviso dell avvio e del portachiavi chiuso: testi e chiavi propri', { timeout: 10_000 }, async () => {
  const b = banco();
  try {
    await b.custode.controlla();
    writeFileSync(b.fi, ACCESA);
    const { esito: dopo } = await conAvvisiMuti(() => b.nuovo());
    const s = sessione(dopo);
    try {
      await s.attrezzo('shell', { comando: 'git status' });
      const [avviso] = s.avvisi();
      assert.match(avviso.value.testo, /did not match the approved version/u);
      assert.deepEqual(avviso.value.altreChiavi.map((c) => c.chiave), ['server.computerUseFiles.setAsideAtStart']);
      assert.deepEqual(avviso.value.file, [], 'non è un comando ad averlo cambiato');
    } finally { s.chiudi(); }
    const { esito: chiuso } = await conAvvisiMuti(() => b.nuovo({ portachiavi: null }));
    const t = sessione(chiuso);
    try {
      await t.attrezzo('shell', { comando: 'git status' });
      assert.deepEqual(t.avvisi()[0].value.altreChiavi.map((c) => c.chiave), ['server.computerUseFiles.fingerprintUnreadable']);
      assert.deepEqual(t.avvisi()[0].value.nonRimessi, []);
    } finally { t.chiudi(); }
    const testi = readFileSync(join(QUI, '..', 'frontend', 'src', 'i18n', 'testi', 'server.js'), 'utf8');
    for (const k of ['setAsideAtStart', 'fingerprintUnreadable', 'oldCopiesRemoved']) assert.equal(testi.split(`'computerUseFiles.${k}'`).length - 1, 2, `${k}: italiano e inglese`);
  } finally { b.chiudi(); }
});

/* ——— le sonde del revisore B (giro 1), col portachiavi ——— */

test('374 g2 (B S1) prima installazione, approvato «assente»: un file comparso non accende né aggiunge luoghi', async () => {
  const b = banco({ impostazione: null, luoghi: null });
  try {
    writeFileSync(b.fi, ACCESA); writeFileSync(b.fl, LUOGHI_ESTRANEI);
    assert.equal(b.acceso(b.custode), false);
    assert.deepEqual(await b.luoghiDi(b.custode), { domini: [], app: [] });
  } finally { b.chiudi(); }
});

test('374 g2 (B S2) porteDelComputerUse passa il custode ai luoghi', async () => {
  const b = banco();
  try {
    const { registroLuoghi } = porteDelComputerUse({ fileLuoghi: b.fl, acceso: () => true, custode: b.custode, aiutante: {} });
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    assert.deepEqual(await registroLuoghi.perIlCiclo(), { domini: [], app: [] });
  } finally { b.chiudi(); }
});

test('374 g2 (B S3) due copie nello stesso millesimo: nessuna sovrascrive l altra', async () => {
  const b = banco({ adesso: () => 1_762_600_000_000 });
  try {
    writeFileSync(b.fi, 'A\n'); await b.custode.controlla();
    writeFileSync(b.fi, 'B\n'); await b.custode.controlla();
    assert.deepEqual(b.copie('.computer-use-impostazione.json').map((c) => readFileSync(c, 'utf8')).sort(), ['A\n', 'B\n']);
  } finally { b.chiudi(); }
});

test('374 g2 (B S4, S4b) due controlli e una scrittura insieme, anche con letture lente: una copia, nessun errore', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const deps of [{}, { readFile: async (f, e) => { await new Promise((r) => setTimeout(r, 30)); return readFile(f, e); } }]) {
    const b = banco({ deps });
    try {
      writeFileSync(b.fi, '{"acceso":true}\n');
      const esiti = await Promise.all([b.custode.controlla(), b.custode.controlla(), b.custode.scrivi(b.fl, LUOGHI)]);
      assert.deepEqual(esiti.slice(0, 2).flatMap((e) => e.errori), []);
      assert.equal(b.copie('.computer-use-impostazione.json').length, 1);
      assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA);
    } finally { b.chiudi(); }
  }
});

test('374 g2 (B S5) illeggibile all avvio, poi adottato: da lì il controllo lo custodisce', async () => {
  const b = banco({ deps: { readFileSync: () => { throw Object.assign(new Error('locked'), { code: 'EACCES' }); } } });
  try {
    await conAvvisiMuti(() => b.custode.adotta());
    assert.equal(b.custode.testo(b.fi), APPROVATA);
    writeFileSync(b.fi, '{"acceso":true}\n');
    assert.equal((await b.custode.controlla()).ripristinati.length, 1);
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA);
  } finally { b.chiudi(); }
});

test('374 g2 (B S6) il server passa il custode al registro e il portachiavi al custode', () => {
  const srv = readFileSync(join(QUI, '..', 'server.mjs'), 'utf8');
  const codice = srv.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:'"`])\/\/.*$/gmu, '$1');
  assert.match(codice, /^\s*custodeFileComputerUse,\s*$/mu);
  assert.match(codice, /creaCustodeFileComputerUse\(\{ file: \[[^\]]+\], portachiavi: providerKeyring \}\)/u);
});
