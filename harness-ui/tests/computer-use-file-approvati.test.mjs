/*
 * ⛔ Decisione 374 (07/11/2026): il custode dei due file del computer use (`src/computer-use/file-approvati.mjs`) e i suoi fili nel
 *   registro delle sessioni. Le sei prove del metodo stanno in `computer-use-controllo-prima-dopo.test.mjs`; qui i bordi: versione
 *   approvata «assente», file cancellato, errori chiusi (non si mette da parte ⇒ non si sovrascrive), file illeggibile all'avvio, le
 *   porte che approvano (scrivi, carta 373, scrivi/file_edit approvato, Accesso completo), l'avviso di un giro nuovo, gli errori detti.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaImpostazioneComputerUse } from '../src/computer-use/impostazione.mjs';
import { creaRegistroLuoghi } from '../src/computer-use/luoghi-ricordati.mjs';
import { creaCustodeFileComputerUse, EVENTO_FILE_COMPUTER_USE_RIPRISTINATI as EVENTO, SERVIZIO_IMPRONTE_COMPUTER_USE, accountDelleImpronte } from '../src/computer-use/file-approvati.mjs';
import { createHash } from 'node:crypto';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const APPROVATA = '{"schema":"talos.computer-use-settings.v1","acceso":false}\n';
const ESTRANEA = '{"acceso":true}\n';
const LUOGHI = '{"versione":1,"voci":[]}\n';

function banco({ impostazione = APPROVATA, luoghi = LUOGHI, deps } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374b-'));
  const fi = join(cartella, '.computer-use-impostazione.json');
  const fl = join(cartella, '.computer-use-luoghi.json');
  if (impostazione !== null) writeFileSync(fi, impostazione);
  if (luoghi !== null) writeFileSync(fl, luoghi);
  /* Giro 3 (B2): senza voce nel portachiavi i file vanno da parte all'avvio; il banco la semina come dopo un'approvazione. */
  const portachiavi = creaAdattatorePortachiaviInMemoria();
  const sha = (t) => (t === null ? 'assente' : createHash('sha256').update(t, 'utf8').digest('hex'));
  portachiavi.set(SERVIZIO_IMPRONTE_COMPUTER_USE, accountDelleImpronte([fi, fl]), `v1:${sha(impostazione)},${sha(luoghi)}`);
  const custode = creaCustodeFileComputerUse({ file: [fi, fl], portachiavi, ...(deps ? { deps } : {}) }); // giro 2: l'impronta nel portachiavi
  const copie = (nome) => readdirSync(cartella).filter((f) => f.startsWith(`${nome}.changed-`)).sort().map((f) => join(cartella, f));
  return { cartella, fi, fl, custode, copie, chiudi: () => rimuoviCartellaDiProva(cartella) };
}

test('374 custode — nasce solo coi file, conosce solo i suoi, testo e impronta dalla memoria', () => {
  assert.throws(() => creaCustodeFileComputerUse({ file: [], portachiavi: null }), /files to keep/u, 'una lista vuota, anche col portachiavi detto');
  assert.throws(() => creaCustodeFileComputerUse({ file: [''] }), TypeError);
  assert.throws(() => creaCustodeFileComputerUse({}), TypeError);
  const b = banco();
  try {
    assert.equal(b.custode.custodisce(b.fi), true);
    assert.equal(b.custode.custodisce(join(b.cartella, 'altro.json')), false);
    assert.equal(b.custode.custodisce(null), false);
    assert.throws(() => b.custode.testo(join(b.cartella, 'altro.json')), TypeError);
    assert.equal(b.custode.testo(b.fi), APPROVATA);
    assert.match(b.custode.impronta(b.fi), /^[0-9a-f]{64}$/);
    writeFileSync(b.fi, ESTRANEA);
    assert.equal(b.custode.testo(b.fi), APPROVATA, 'il file cambiato non cambia la versione approvata');
    assert.throws(() => creaImpostazioneComputerUse({ file: join(b.cartella, 'x.json'), custode: b.custode }), /not kept/);
    assert.throws(() => creaRegistroLuoghi({ file: join(b.cartella, 'x.json'), custode: b.custode }), /not kept/);
  } finally { b.chiudi(); }
});

test('374 g2 custode — adotta(soli) ignora un file che non custodisce, senza errori', async () => {
  const b = banco();
  try {
    assert.deepEqual(await b.custode.adotta([join(b.cartella, 'altro.json')]), { errori: [] });
  } finally { b.chiudi(); }
});

test('374 custode — file uguali: niente; file cancellato: si rimette senza copia', async () => {
  const b = banco();
  try {
    assert.deepEqual(await b.custode.controlla(), { ripristinati: [], errori: [] });
    unlinkSync(b.fi);
    const esito = await b.custode.controlla();
    assert.deepEqual(esito.ripristinati, [{ file: b.fi, copia: null }]);
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA);
  } finally { b.chiudi(); }
});

test('374 custode — approvato «assente»: un file comparso va da parte (rinominato, mai cancellato), anche la seconda volta', async () => {
  const b = banco({ impostazione: null });
  try {
    assert.equal(b.custode.testo(b.fi), null);
    writeFileSync(b.fi, ESTRANEA);
    const primo = await b.custode.controlla();
    assert.equal(primo.ripristinati.length, 1);
    assert.equal(existsSync(b.fi), false);
    assert.equal(readFileSync(primo.ripristinati[0].copia, 'utf8'), ESTRANEA);
    writeFileSync(b.fi, ESTRANEA);
    const secondo = await b.custode.controlla();
    assert.equal(existsSync(b.fi), false);
    assert.equal(b.copie('.computer-use-impostazione.json').length, 2, 'lo stesso contenuto, ma tolto di mezzo con una rinomina: mai perso');
    assert.equal(typeof secondo.ripristinati[0].copia, 'string');
    const imp = creaImpostazioneComputerUse({ file: b.fi, custode: b.custode, avvisa: () => {} });
    assert.equal(imp.acceso(), false, 'assente ⇒ il valore di serie, spento');
  } finally { b.chiudi(); }
});

test('374 custode — non si riesce a mettere da parte ⇒ il file NON si sovrascrive, errore detto, i lettori restano sull approvato', async () => {
  const b = banco({ deps: { rename: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } } });
  try {
    writeFileSync(b.fi, ESTRANEA);
    const esito = await b.custode.controlla();
    assert.deepEqual(esito.ripristinati, []);
    assert.deepEqual(esito.errori, [{ file: b.fi, fase: 'da-parte', codice: 'EBUSY' }]);
    assert.equal(readFileSync(b.fi, 'utf8'), ESTRANEA, 'mai sovrascritto senza la copia');
    assert.equal(creaImpostazioneComputerUse({ file: b.fi, custode: b.custode, avvisa: () => {} }).acceso(), false);
  } finally { b.chiudi(); }
});

test('374 custode — il ripristino fallisce o non torna uguale ⇒ errore «ripristino» con la copia; lettura fallita ⇒ errore «lettura»', async () => {
  const fallisce = banco({ deps: { scrivi: async () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); } } });
  try {
    writeFileSync(fallisce.fi, ESTRANEA);
    const esito = await fallisce.custode.controlla();
    assert.equal(esito.ripristinati.length, 0);
    assert.equal(esito.errori.length, 1);
    assert.equal(esito.errori[0].fase, 'ripristino');
    assert.equal(esito.errori[0].codice, 'EPERM');
    assert.equal(readFileSync(esito.errori[0].copia, 'utf8'), ESTRANEA);
  } finally { fallisce.chiudi(); }
  const nonUguale = banco({ deps: { scrivi: async (f) => { writeFileSync(f, 'altro'); } } });
  try {
    writeFileSync(nonUguale.fi, ESTRANEA);
    const esito = await nonUguale.custode.controlla();
    assert.equal(esito.errori[0]?.codice, 'NON_UGUALE');
  } finally { nonUguale.chiudi(); }
  let letture = 0;
  const illeggibile = banco({ deps: { readFile: async () => { letture += 1; throw Object.assign(new Error('locked'), { code: 'EACCES' }); } } });
  try {
    const esito = await illeggibile.custode.controlla();
    assert.deepEqual(esito.errori.map((e) => [e.fase, e.codice]), [['lettura', 'EACCES'], ['lettura', 'EACCES']]);
    assert.equal(letture, 2);
    const adotta = await illeggibile.custode.adotta();
    assert.equal(adotta.errori.length, 2);
    assert.equal(illeggibile.custode.testo(illeggibile.fi), APPROVATA, 'una lettura fallita tiene la versione di prima');
  } finally { illeggibile.chiudi(); }
});

test('374 custode — illeggibile all avvio: lettori a «assente», il controllo non lo tocca, una scrittura approvata lo riprende', async () => {
  const b = banco({ deps: { readFileSync: () => { throw Object.assign(new Error('locked'), { code: 'EACCES' }); } } });
  try {
    assert.equal(b.custode.testo(b.fi), null);
    assert.equal(b.custode.impronta(b.fi), null);
    writeFileSync(b.fi, ESTRANEA);
    assert.deepEqual(await b.custode.controlla(), { ripristinati: [], errori: [] });
    assert.equal(readFileSync(b.fi, 'utf8'), ESTRANEA);
    await b.custode.scrivi(b.fi, APPROVATA);
    assert.equal(b.custode.testo(b.fi), APPROVATA);
    writeFileSync(b.fi, ESTRANEA);
    /* giro 2: lo `scrivi` su un file incerto lo mette prima da parte (riferito al controllo dopo), poi il controllo riprende il nuovo */
    const dopo = (await b.custode.controlla()).ripristinati;
    assert.equal(dopo.length, 2, 'la messa da parte di `scrivi` e il ripristino del controllo');
    assert.equal(readFileSync(dopo[0].copia, 'utf8'), ESTRANEA, 'il file incerto è da parte, mai sovrascritto');
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA, 'da approvato, il controllo lo riprende');
  } finally { b.chiudi(); }
});

test('374 custode — scrivi: un cambio estraneo va da parte prima, poi si scrive e si approva; il controllo dopo lo riferisce', async () => {
  const b = banco();
  try {
    await assert.rejects(b.custode.scrivi(b.fi, 42), TypeError);
    writeFileSync(b.fi, ESTRANEA);
    const imp = creaImpostazioneComputerUse({ file: b.fi, custode: b.custode, avvisa: () => {} });
    assert.equal(imp.acceso(), false, 'letta prima di scrivere: la versione approvata, spento (mai il file estraneo)');
    assert.deepEqual(await imp.scrivi({ acceso: true }), { acceso: true });
    assert.equal(imp.acceso(), true);
    assert.deepEqual(await imp.leggi(), { acceso: true });
    assert.equal(JSON.parse(readFileSync(b.fi, 'utf8')).acceso, true);
    const [copia] = b.copie('.computer-use-impostazione.json');
    assert.equal(readFileSync(copia, 'utf8'), ESTRANEA, 'il cambio estraneo non si perde');
    const esito = await b.custode.controlla();
    assert.deepEqual(esito.ripristinati, [{ file: b.fi, copia }], 'riferito al primo controllo');
    assert.deepEqual(await b.custode.controlla(), { ripristinati: [], errori: [] }, 'una volta sola');
    await assert.rejects(imp.scrivi({ acceso: 'si' }), /true or false/);
  } finally { b.chiudi(); }
});

test('374 custode — i luoghi: ricorda/togli/svuota passano dal custode e diventano l approvato; adotta(soli) solo quello', async () => {
  const b = banco();
  try {
    const luoghi = creaRegistroLuoghi({ file: b.fl, custode: b.custode });
    await luoghi.ricorda({ domini: ['example.com'] });
    assert.deepEqual(await luoghi.perIlCiclo(), { domini: ['example.com'], app: [] });
    assert.match(b.custode.testo(b.fl), /example\.com/);
    assert.equal(readFileSync(b.fl, 'utf8'), b.custode.testo(b.fl));
    await luoghi.svuota();
    assert.deepEqual((await luoghi.elenco()).voci, []);
    writeFileSync(b.fi, ESTRANEA);
    writeFileSync(b.fl, '{"versione":1,"voci":[{"tipo":"app","nome":"cmd.exe"}]}\n');
    await b.custode.adotta([b.fl, join(b.cartella, 'non-mio.json')]);
    assert.deepEqual(await luoghi.perIlCiclo(), { domini: [], app: ['cmd.exe'] }, 'adottato il file indicato');
    assert.equal(b.custode.testo(b.fi), APPROVATA, 'l altro no');
  } finally { b.chiudi(); }
});

/* ——— i fili nel registro delle sessioni ——— */

function sessione(custode, { permessiScelto = 'Workspace write', cartella = tmpdir(), righe = null, store = null } = {}) {
  let input = null;
  let risolvi;
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }),
    custodeFileComputerUse: custode,
    /* giro 2: le righe che il registro scrive nello store (asincrone), prese in memoria per vedere `durable`; le sincrone vanno in `store`,
       una cartella temporanea che la prova toglie */
    ...(righe ? { cartellaStore: store, registraRigaFn: async (a) => { righe.push(a); } } : {}),
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return {
    input: () => input,
    /** pre (rispondendo `si` alla carta, se c'è), `durante`, post */
    async attrezzo(azione, argomenti, { si = true, durante, senzaPost = false } = {}) {
      const prima = ricevuti.length;
      const p = input.hookFn({ tipo: 'pre_tool_call', azione, argomenti, giro: 0 });
      await new Promise((r) => setTimeout(r, 5));
      const carta = ricevuti.slice(prima).find((e) => e.type === 'ApprovalRequested');
      if (carta) registro.rispondiApprovazione(sessionId, carta.requestId, si);
      const esito = await p;
      if (esito?.consentito !== false) await durante?.();
      if (!senzaPost) await input.hookFn({ tipo: 'post_tool_call', azione, esito: 'ok', giro: 0 });
      return { esito, carta: carta ?? null };
    },
    avvisi: () => ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO),
    chiudi: () => { input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
  };
}

test('374 registro — carta 373 accettata: prima si controlla (un cambio in sottofondo torna indietro), dopo si adotta il cambio visto', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    writeFileSync(b.fl, '{"versione":1,"voci":[{"tipo":"app","nome":"cmd.exe"}]}\n'); // un processo rimasto da prima
    const voluto = '{"schema":"talos.computer-use-settings.v1","acceso":true}\n';
    const { esito, carta } = await s.attrezzo('shell', { comando: 'echo x > .computer-use-impostazione.json' }, { durante: () => writeFileSync(b.fi, voluto) });
    assert.ok(carta, 'la carta 373 c è');
    assert.deepEqual(esito, { consentito: true });
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI, 'il controllo PRIMA del comando ha rimesso i luoghi');
    assert.equal(readFileSync(b.fi, 'utf8'), voluto, 'il cambio approvato con la carta resta');
    assert.equal(b.custode.testo(b.fi), voluto, 'ed è la versione approvata');
    assert.equal(s.avvisi().length, 1);
    assert.deepEqual(s.avvisi()[0].value.file, ['.computer-use-luoghi.json']);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 registro — carta 373 negata: il comando non parte, niente controllo né avviso, dopo niente si adotta; il comando dopo rimette', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  const ALTRI = '{"versione":1,"voci":[{"tipo":"app","nome":"cmd.exe"}]}\n';
  try {
    writeFileSync(b.fl, ALTRI); // un processo rimasto da prima
    const { esito } = await s.attrezzo('shell', { comando: 'echo x > .computer-use-impostazione.json' }, { si: false });
    assert.equal(esito.consentito, false);
    assert.equal(readFileSync(b.fl, 'utf8'), ALTRI, 'un comando rifiutato non parte: nessun controllo, nessuna copia');
    assert.equal(b.copie('.computer-use-luoghi.json').length, 0);
    assert.equal(s.avvisi().length, 0, 'nessun avviso per un comando che non è partito');
    writeFileSync(b.fi, ESTRANEA);
    assert.equal(b.custode.testo(b.fi), APPROVATA);
    await s.attrezzo('shell', { comando: 'ls' });
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI, 'il primo comando che parte rimette i luoghi');
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA, 'e l impostazione');
    assert.equal(s.avvisi().length, 1);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 registro — un comando con la carta interrotto prima del post non lascia la sua adozione all attrezzo dopo', { timeout: 10_000 }, async () => {
  const b = banco();
  const s = sessione(b.custode);
  try {
    const { carta } = await s.attrezzo('shell', { comando: 'echo x > .computer-use-impostazione.json' }, { senzaPost: true });
    assert.ok(carta, 'la carta 373 c è ed è accettata');
    await s.attrezzo('leggi', { percorso: 'README.md' }, { durante: () => writeFileSync(b.fi, ESTRANEA) });
    assert.equal(b.custode.testo(b.fi), APPROVATA, 'un cambio durante un altro attrezzo non diventa la versione approvata');
    await s.attrezzo('shell', { comando: 'ls' });
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA, 'il comando dopo lo rimette');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 registro — scrivi/file_edit approvato su un file custodito: dopo si adotta SOLO quello; su un altro file di controllo niente', { timeout: 10_000 }, async () => {
  const b = banco();
  const adottati = [];
  const spia = { ...b.custode, custodisce: b.custode.custodisce, controlla: b.custode.controlla, adotta: async (soli) => { adottati.push(soli); return b.custode.adotta(soli); } };
  const s = sessione(spia); // la cartella della sessione NON è quella che si cancella: il registro lascerebbe un timer vivo
  try {
    for (const azione of ['scrivi', 'file_edit']) {
      const { esito, carta } = await s.attrezzo(azione, { percorso: b.fi }, { durante: () => writeFileSync(b.fi, ESTRANEA) });
      assert.ok(carta);
      assert.deepEqual(esito, { consentito: true });
    }
    assert.deepEqual(adottati, [[b.fi], [b.fi]]);
    assert.equal(b.custode.testo(b.fi), ESTRANEA);
    await s.attrezzo('scrivi', { percorso: join(b.cartella, '.harness-ui-hooks.json') });
    await s.attrezzo('scrivi', { percorso: '.computer-use-impostazione.json' }); // stesso nome, altra cartella: non è il file custodito
    await s.attrezzo('scrivi', { percorso: 'nota.txt' });
    assert.equal(adottati.length, 2, 'un altro file non si adotta');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 registro — Accesso completo: scrivi (con la carta, decisioni 323 e 370, giro 8) e ogni comando adottano; giro 2 (A4) controllano prima; giro 4 (decisione 390) niente torna indietro', { timeout: 10_000 }, async () => {
  const b = banco();
  let controlli = 0;
  const spia = { ...b.custode, custodisce: b.custode.custodisce, adotta: b.custode.adotta, controlla: async () => { controlli += 1; return b.custode.controlla(); } };
  const s = sessione(spia, { permessiScelto: 'Full access' });
  try {
    const { carta } = await s.attrezzo('scrivi', { percorso: b.fl }, { durante: () => writeFileSync(b.fl, '{"versione":1,"voci":[]} \n') });
    assert.ok(carta, 'giro 8 (decisioni 323 e 370, «carta sempre»): scrivere un file del computer use chiede la carta anche in Accesso pieno');
    assert.equal(b.custode.testo(b.fl), '{"versione":1,"voci":[]} \n');
    const { carta: cartaShell } = await s.attrezzo('shell', { comando: 'node x.mjs .computer-use-impostazione.json' }, { durante: () => writeFileSync(b.fi, ESTRANEA) });
    assert.equal(b.custode.testo(b.fi), ESTRANEA);
    assert.equal(cartaShell, null);
    /* giro 2 (revisore A, A4): prima della scrittura, dopo la scrittura (l altro file, che non si adotta) e prima del comando; giro 4
       (decisione 390, come la base 373): il comando pieno adotta tutti e due i file, niente controllo dopo; giro 5 (C3, decisione 396):
       anche dopo `scrivi` in Accesso completo l'altro file si adotta come dopo un comando (nessun'altra conversazione ha un comando
       in corso), non si controlla più ⇒ 2 (prima della scrittura, prima del comando) */
    assert.equal(controlli, 2, 'in Accesso completo si controlla solo prima, senza carte');
    assert.equal(s.avvisi().length, 0, 'niente cambiato fuori dal comando: nessun avviso');
    /* giro 4 (decisione 390): anche un comando che non nomina i file adotta il cambio, senza carta, avviso né copia */
    const nuovo = '{"versione":1,"voci":[]}   \n';
    const { carta: cartaMuta } = await s.attrezzo('shell', { comando: 'node y.mjs' }, { durante: () => writeFileSync(b.fl, nuovo) });
    assert.equal(cartaMuta, null);
    assert.equal(b.custode.testo(b.fl), nuovo, 'adottato');
    assert.equal(readFileSync(b.fl, 'utf8'), nuovo, 'lasciato com è');
    assert.equal(s.avvisi().length, 0);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 registro — l avviso: senza copia dice solo «put back», un giro nuovo ha un avviso nuovo, gli errori si dicono', { timeout: 10_000 }, async () => {
  const b = banco();
  const righe = [];
  const store = mkdtempSync(join(tmpdir(), 'talos-374b-store-'));
  const s = sessione(b.custode, { righe, store });
  try {
    await s.attrezzo('shell', { comando: 'node x.mjs' }, { durante: () => unlinkSync(b.fi) });
    const [primo] = s.avvisi();
    assert.match(primo.value.testo, /put back/);
    assert.doesNotMatch(primo.value.testo, /kept/);
    assert.equal(primo.value.testoChiave, 'server.computerUseFiles.putBack');
    assert.deepEqual(primo.value.testoParams, { files: '.computer-use-impostazione.json' });
    assert.deepEqual(primo.value.copie, []);
    /* giro 2 (revisore B): era `primo.durable ?? true`, vera sempre; e `_sequenza` c'è anche sugli eventi non durevoli (il mutante B26
       restava vivo). Si guarda la riga che il registro scrive nello store: durevole = scritta con `durable: true` (broadcast, ~7679) */
    const riga = righe.find((a) => a.record?.type === 'CUSTOM' && a.record?.name === EVENTO);
    assert.equal(riga?.durable, true, 'durevole: scritto e atteso nella storia della conversazione');
    s.input().onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
    s.input().onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r2' });
    await s.attrezzo('shell', { comando: 'node x.mjs' }, { durante: () => writeFileSync(b.fi, ESTRANEA) });
    const ids = new Set(s.avvisi().map((e) => e.value.idAvviso));
    assert.equal(ids.size, 2, 'un giro nuovo, un avviso nuovo');
    const secondo = s.avvisi().at(-1).value;
    assert.equal(secondo.testoChiave, 'server.computerUseFiles.putBackKept');
    assert.equal(secondo.testoParams.copies, secondo.copie.join(', '));
  } finally { s.chiudi(); b.chiudi(); await new Promise((r) => setTimeout(r, 20)); rimuoviCartellaDiProva(store); }
  const rotto = banco({ deps: { rename: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } } });
  const r = sessione(rotto.custode);
  try {
    await r.attrezzo('shell', { comando: 'node x.mjs' }, { durante: () => writeFileSync(rotto.fi, ESTRANEA) });
    const [avviso] = r.avvisi();
    assert.deepEqual(avviso.value.nonRimessi, ['.computer-use-impostazione.json']);
    assert.equal(avviso.value.erroreChiave, 'server.computerUseFiles.notPutBack');
    assert.deepEqual(avviso.value.erroreParams, { failed: '.computer-use-impostazione.json' }, 'la chat dice quale file');
    assert.match(avviso.value.testo, /could not put back/);
    assert.equal(avviso.value.testoChiave, undefined);
  } finally { r.chiudi(); rotto.chiudi(); }
});

test('374 registro — una lettura che fallisce non fa avvisi; un custode che lancia non ferma il comando', { timeout: 10_000 }, async () => {
  const b = banco({ deps: { readFile: async () => { throw Object.assign(new Error('locked'), { code: 'EACCES' }); } } });
  const s = sessione(b.custode);
  const avvisiConsole = [];
  const warn = console.warn;
  console.warn = (m) => avvisiConsole.push(String(m));
  try {
    await s.attrezzo('shell', { comando: 'node x.mjs' });
    assert.equal(s.avvisi().length, 0);
    assert.ok(avvisiConsole.some((m) => /could not be read/.test(m)));
    const lancia = { custodisce: () => false, testo: () => null, adotta: async () => { throw new Error('boom'); }, controlla: async () => { throw new Error('boom'); } };
    const t = sessione(lancia);
    try {
      const { esito } = await t.attrezzo('shell', { comando: 'node x.mjs' });
      assert.deepEqual(esito, { consentito: true });
      assert.ok(avvisiConsole.some((m) => /check failed: boom/.test(m)));
    } finally { t.chiudi(); }
  } finally { console.warn = warn; s.chiudi(); b.chiudi(); }
});
