/*
 * Blocco 21 (01/11/2026) — `cartella` e `compattazioni` nelle righe di `GET /api/v1/sessions`, secondo il contratto chiuso del 31/10
 *   (`CONTRATTO-ELENCO-SESSIONI-CARTELLA-COMPATTAZIONI-2026-10-31.md`, con le condizioni di Performance e del Mobile). Registro, giornale,
 *   cartelle dei dispositivi, rotta e ponte VERI, su cartelle temporanee; il kernel è finto, nessuna porta, nessun modello.
 */
import assert from 'node:assert/strict';
import fs, { mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import test, { mock } from 'node:test';

import { compattazioniDellaConversazione } from '../frontend/src/components/contesto-scheda.js';
import { interpretaEventoCompattazione } from '../frontend/src/components/compattazione-legacy.js';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const lungo = (n) => 'parola '.repeat(n);
const STORIA = [
  { role: 'system', content: 's' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: lungo(4000) },
  { role: 'user', content: 'continua' }, { role: 'assistant', content: lungo(4000) }, { role: 'user', content: 'ancora' },
  { role: 'assistant', content: 'breve' }, { role: 'user', content: 'fine' }, { role: 'assistant', content: 'ok' },
];
const compattazione = (value) => ({ type: 'CUSTOM', name: 'talos.compattazione', value });
const fineRiuscita = (at, extra = {}) => compattazione({ fase: 'fine', compattato: true, at, tokenPrima: 10, tokenDopo: 5, ...extra });

function banco(t) {
  // il percorso vero anche per la radice: sui runner la TEMP ha il nome corto di Windows
  const radice = realpathSync.native(cartellaDiProva('talos-elenco-cartella-'));
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return p; };
  const store = crea('store');
  const dati = crea('dati');
  const stato = { ora: Date.parse('2026-11-01T10:00:00.000Z'), cartella: crea('progetti', 'AVM') };
  const giri = [];
  const registri = [];
  const nuovoRegistro = (extra = {}) => {
    const registro = createSessionRegistry({
      guardaWorkspaceFn: () => () => {},
      avviaSessioneFn: async (input) => {
        giri.push(input);
        input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
        input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' });
        return { ok: true, esito: { messaggiFinali: STORIA } };
      },
      preparaEsecuzioneFn: () => ({ cartella: stato.cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
      riassumiPerCompattazioneFn: async () => ({ scelta: { role: 'assistant', content: '## Riassunto\nabbiamo parlato di tokenizer.' }, finishReason: 'stop', usage: null }),
      cartellaStore: store, modello: 'z-ai/glm-5.3-flash', chiave: 'k', clock: () => new Date(stato.ora),
      ...extra,
    });
    registri.push(registro);
    return registro;
  };
  t.after(async () => { for (const r of registri) await r.chiudi({ attesaMassimaMs: 2000 }); });
  /* il remoto come lo monta il server: cartelle, rotta, ponte; `creaOperazioni` è ciò che collega le cartelle al registro */
  const monta = (registro, { cartelleEscluse = [dati], avvolgi = (c) => c } = {}) => {
    const cartelle = avvolgi(creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
      sessionRegistry: registro, cartelleAmmesse: [], cartelleEscluse }));
    const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, remotoFn: () => ({ cartelle }) });
    const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
    const operazioni = creaOperazioni({ chiama, sessionRegistry: registro, iscriviConRigiocata, cartelle });
    return {
      cartelle,
      rotta: async () => (await chiama({ metodo: 'GET', percorso: '/api/v1/sessions', origine: 'pc' })).dati.items,
      ponte: async (dispositivo = { id: 'disp-A', nome: 'Pad' }) => (await operazioni.esegui('sessions.list', {}, { dispositivo, iscrizioni: new Map(), iscrivi: () => async () => {} })).items,
    };
  };
  const avvia = async (registro, cartella = stato.cartella) => {
    stato.cartella = cartella;
    const { sessionId } = registro.avvia('task-vero');
    await new Promise((r) => setImmediate(r));
    return sessionId;
  };
  const riga = (registro, id) => registro.elenca().find((r) => r.sessionId === id);
  /* la prima lettura accende il calcolo in sottofondo: la seconda trova il dato */
  const dopoIlCalcolo = async (registro, id) => { registro.elenca(); await registro.attendiCartelle(); return riga(registro, id); };
  const avanza = (ms) => { stato.ora += ms; };
  return { radice, store, dati, stato, giri, crea, nuovoRegistro, monta, avvia, riga, dopoIlCalcolo, avanza };
}

test('EC-01 — stessa cartella ⇒ stesso cartellaId; cartelle diverse ⇒ diverso; il nome è l\'ultima parte; il percorso non esce né dalla rotta né dal ponte', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const { rotta, ponte } = b.monta(registro);
  const avm = b.stato.cartella;
  const app = b.crea('progetti', 'app');
  const uno = await b.avvia(registro, avm);
  const due = await b.avvia(registro, avm);
  const tre = await b.avvia(registro, app);
  await b.dopoIlCalcolo(registro, uno);
  const righe = await rotta();
  const di = (id) => righe.find((r) => r.sessionId === id).cartella;
  assert.deepEqual(Object.keys(di(uno)).sort(), ['cartellaId', 'nome'], 'solo id e nome');
  assert.match(di(uno).cartellaId, /^[A-Za-z0-9_-]{32}$/u);
  assert.equal(di(uno).nome, 'AVM');
  assert.equal(di(uno).cartellaId, di(due).cartellaId, 'stessa cartella, stesso id');
  assert.equal(di(tre).nome, 'app');
  assert.notEqual(di(uno).cartellaId, di(tre).cartellaId, 'AL CONTRARIO: un\'altra cartella, un altro id');
  const percorso = b.radice.replace(/\\/g, '\\\\');
  for (const nome of ['rotta', 'ponte']) {
    const testo = JSON.stringify(nome === 'rotta' ? righe : await ponte());
    assert.ok(!testo.includes(percorso) && !testo.includes('progetti') && !testo.includes('talos-elenco-cartella'), `${nome}: nessun percorso, nemmeno a pezzi`);
  }
});

test('EC-02 — il nuovo cartella.cartellaId è IDENTICO al cartellaId piatto del ponte e a quello di projects.list, anche attraverso una giunzione', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro({ cartelleProgetto: [{ id: '0', nome: 'AVM', percorso: b.stato.cartella }],
    preparaEsecuzioneLiberaFn: () => ({ cartella: b.stato.cartella, comandoProva: 'npm test', task: { id: 'libero', consegna: 'c' } }) });
  const { cartelle, rotta, ponte } = b.monta(registro);
  const vera = b.stato.cartella;
  const giunzione = join(b.radice, 'progetti', 'passaggio');
  symlinkSync(vera, giunzione, 'junction');
  const diretta = await b.avvia(registro, vera);
  const passante = await b.avvia(registro, giunzione);
  await b.dopoIlCalcolo(registro, diretta);
  const dallaRotta = await rotta();
  const dalPonte = await ponte();
  for (const id of [diretta, passante]) {
    const r = dallaRotta.find((x) => x.sessionId === id);
    const p = dalPonte.find((x) => x.sessionId === id);
    assert.equal(r.cartella.cartellaId, p.cartellaId, 'rotta contro ponte piatto');
    assert.equal(p.cartella.cartellaId, p.cartellaId, 'il ponte porta i due, uguali');
    assert.equal(r.cartella.cartellaId, (await cartelle.descrivi(vera)).cartellaId, 'la stessa fonte: il percorso vero');
    assert.equal(r.cartella.nome, 'AVM', 'il nome del percorso vero, non quello della giunzione');
    assert.equal(p.consentita, false, 'il ponte resta com\'è');
  }
  const [inElenco] = await cartelle.elenco('disp-A');
  assert.equal(inElenco.cartellaId, dallaRotta[0].cartella.cartellaId, 'lo stesso legame con projects.list');
  /* Accesso pieno allarga `voce.cartella` alla radice del disco: la cartella della riga resta quella di partenza, come sul ponte */
  const { sessionId: allargata } = registro.avviaLibero({ cartellaId: '0', consegna: 'c', permessi: 'Full access' });
  await new Promise((r) => setImmediate(r));
  assert.notEqual(registro.cartellaDi(allargata), vera, 'la prova morde solo se la cartella si è allargata');
  const dopo = await b.dopoIlCalcolo(registro, allargata);
  assert.equal(dopo.cartella.cartellaId, (await cartelle.descrivi(vera)).cartellaId);
  assert.equal((await ponte()).find((x) => x.sessionId === allargata).cartellaId, dopo.cartella.cartellaId);
});

test('EC-03 — cartella cancellata ⇒ null: prima della prima lettura, e anche dopo (al giro di controllo successivo, non a ogni elenco); ricreata torna col suo id', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  b.monta(registro);
  const mai = b.crea('progetti', 'sparita-subito');
  const dopo = b.crea('progetti', 'sparita-dopo');
  const a = await b.avvia(registro, mai);
  const c = await b.avvia(registro, dopo);
  rimuoviCartellaDiProva(mai);
  assert.equal((await b.dopoIlCalcolo(registro, a)).cartella, null, 'sparita prima della prima lettura');
  const prima = (await b.dopoIlCalcolo(registro, c)).cartella;
  assert.equal(prima.nome, 'sparita-dopo');
  rimuoviCartellaDiProva(dopo);
  assert.deepEqual((await b.dopoIlCalcolo(registro, c)).cartella, prima, 'dentro il minuto si tiene il dato: nessun controllo a ogni elenco');
  b.avanza(61_000);
  assert.equal((await b.dopoIlCalcolo(registro, c)).cartella, null, 'cancellata mentre il server gira');
  mkdirSync(dopo);
  b.avanza(61_000);
  assert.deepEqual((await b.dopoIlCalcolo(registro, c)).cartella, prima, 'AL CONTRARIO: ricreata, torna con lo stesso id');
  rimuoviCartellaDiProva(dopo);
  writeFileSync(dopo, 'non è più una cartella');
  b.avanza(61_000);
  assert.equal((await b.dopoIlCalcolo(registro, c)).cartella, null, 'un file al suo posto non è la cartella');
});

test('EC-04 — sessione del telefono senza PC (nessun modulo delle cartelle) ⇒ null, e il conto c\'è lo stesso; una cartella di TALOS ⇒ null come sul ponte', async (t) => {
  const b = banco(t);
  const senzaPc = b.nuovoRegistro();
  const id = await b.avvia(senzaPc);
  const riga = await b.dopoIlCalcolo(senzaPc, id);
  assert.equal(riga.cartella, null);
  assert.equal(riga.compattazioni, 0);
  const pc = b.nuovoRegistro({ cartellaStore: b.crea('store-2') });
  const { ponte } = b.monta(pc);
  const diTalos = await b.avvia(pc, b.dati);
  assert.equal((await b.dopoIlCalcolo(pc, diTalos)).cartella, null, 'esclusa: lo decide `descrivi`, non un calcolo a parte');
  assert.equal((await ponte()).find((r) => r.sessionId === diTalos).cartellaId, undefined);
});

test('EC-05 — una compattazione ⇒ il conto sale; un Annulla lo fa scendere; un riassunto scartato non conta; il riassunto che sostituisce il rapido non raddoppia', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const id = await b.avvia(registro);
  const conto = () => b.riga(registro, id).compattazioni;
  assert.equal(conto(), 0, 'letta, e nessuna compattazione: uno zero vero');
  const esito = await registro.compatta(id);
  assert.equal(esito.compattato, true);
  assert.equal(conto(), 1, 'il /compact sale');
  assert.deepEqual(await registro.annullaCompattazione(id, esito.at), { ok: true, annullata: true });
  assert.equal(conto(), 0, 'l\'Annulla scende');
  const { onEvento } = b.giri.at(-1);
  onEvento(compattazione({ fase: 'inizio', tokenPrima: 10, soglia: 5, motivo: 'soglia', giro: 1 }));
  onEvento(compattazione({ fase: 'fine', compattato: false, motivo: 'superata', at: '2026-11-01T10:00:01.000Z' }));
  onEvento(compattazione({ fase: 'fine', compattato: false, motivo: 'interrotta', giro: 1 }));
  assert.equal(conto(), 0, 'scartati: non contano');
  onEvento(fineRiuscita('2026-11-01T10:00:02.000Z'));
  assert.equal(conto(), 1);
  onEvento(fineRiuscita('2026-11-01T10:00:03.000Z', { migliora: { at: '2026-11-01T10:00:02.000Z' } }));
  assert.equal(conto(), 1, 'il riassunto del modello prende il posto del rapido: la riga è la stessa');
  onEvento(compattazione({ fase: 'annullata', at: '2026-11-01T10:00:03.000Z', motivo: 'giro-fallito' }));
  assert.equal(conto(), 0, 'il giro è fallito: il riassunto non si tiene');
  onEvento(compattazione({ fase: 'annullata', at: '2026-11-01T10:00:09.000Z' }));
  assert.equal(conto(), 0, 'mai sotto zero');
});

test('EC-06 — lo stesso numero della scheda Contesto: la sua regola, applicata agli stessi eventi, dà lo stesso conto (strada semplice e motore del contesto)', async (t) => {
  const b = banco(t);
  const semplice = b.nuovoRegistro();
  const id = await b.avvia(semplice);
  const { onEvento } = b.giri.at(-1);
  const eventi = [
    fineRiuscita('2026-11-01T10:00:01.000Z'), fineRiuscita('2026-11-01T10:00:02.000Z'), compattazione({ fase: 'fine', compattato: false, motivo: 'vuoto', at: 'x' }),
    fineRiuscita('2026-11-01T10:00:03.000Z', { migliora: { at: '2026-11-01T10:00:02.000Z' } }), compattazione({ fase: 'annullata', at: '2026-11-01T10:00:01.000Z' }),
    compattazione({ fase: 'annullata', at: '' }), compattazione({ fase: 'fine', compattato: 'si', at: 'y' }), fineRiuscita('2026-11-01T10:00:04.000Z', { migliora: {} }),
  ];
  for (const e of eventi) onEvento(e);
  // la regola del client (`legacy/app.js`: conta / sostituisce / toglie) sopra il SUO interprete
  let numero = 0;
  for (const e of eventi) {
    const c = interpretaEventoCompattazione(e);
    if (c?.tipo === 'fine' && c.compattato && c.migliora) numero = Math.max(numero, 1);
    else if (c?.tipo === 'fine' && c.compattato) numero += 1;
    else if (c?.tipo === 'annullata') numero = Math.max(0, numero - 1);
  }
  assert.equal(b.riga(semplice, id).compattazioni, numero, 'strada semplice');
  assert.equal(numero, 2, 'la tabella non è banale');

  // Il motore del contesto: la scheda conta i lavori `committed`; ognuno scrive UNA versione sul giornale. Il rapido non è suo.
  const conMotore = b.nuovoRegistro({ cartellaStore: b.crea('store-motore'), motoreContestoPerNuoveFn: () => 'engine' });
  const m = await b.avvia(conMotore);
  const evento = (idEvento, kind, versionId, jobId) => ({ schema: 'talos.context.event.v1', id: idEvento, sessionId: m, versionId, ...(jobId ? { jobId } : {}), kind, createdAt: '2026-11-01T10:00:00.000Z', payload: { coveredThrough: 1 } });
  const jobs = [{ state: 'committed' }, { state: 'committed' }, { state: 'failed' }, { state: 'paused' }];
  await conMotore.pubblicaEventoContesto({ sessionId: m, event: evento('e1', 'context.version.committed', 'v1', 'j1') });
  await conMotore.pubblicaEventoContesto({ sessionId: m, event: evento('e2', 'context.version.committed', 'v2', 'j2') });
  await conMotore.pubblicaEventoContesto({ sessionId: m, event: evento('e2', 'context.version.committed', 'v2', 'j2') }); // consegnato due volte
  await conMotore.pubblicaEventoContesto({ sessionId: m, event: evento('e3', 'context.version.restored', 'v3') });
  await conMotore.pubblicaEventoContesto({ sessionId: m, event: { ...evento('e4', 'context.usage.recorded', undefined), payload: { operationId: 'o', usage: {} } } });
  b.giri.at(-1).onEvento(fineRiuscita('2026-11-01T10:00:05.000Z', { ripiego: true, ragione: 'in-arrivo' }));
  assert.equal(b.riga(conMotore, m).compattazioni, compattazioniDellaConversazione({ motore: { jobs, activeVersion: null } }).numero);
  assert.equal(b.riga(conMotore, m).compattazioni, 2);
  const sconta = await b.avvia(conMotore);
  b.giri.at(-1).onEvento(fineRiuscita('2026-11-01T10:00:06.000Z', { ripiego: true, ragione: 'in-arrivo' }));
  assert.equal(b.riga(conMotore, sconta).compattazioni, 0, 'col timbro del motore il rapido non conta nemmeno prima della prima versione');
});

test('EC-07 — dopo il riavvio il conto nasce dalla lettura d\'avvio del giornale: una sessione mai aperta porta il suo conto vero, e l\'elenco non rilegge niente', async (t) => {
  const b = banco(t);
  const primo = b.nuovoRegistro();
  const conDue = await b.avvia(primo);
  const senza = await b.avvia(primo);
  const annullata = await b.avvia(primo);
  const esito = await primo.compatta(annullata);
  await primo.annullaCompattazione(annullata, esito.at);
  b.avanza(1000);
  await primo.compatta(conDue);
  /* la seconda: un /compact subito dopo il primo non ha niente da riassumere, quindi arriva dal giro (primo giro di questo banco) */
  b.giri[0].onEvento(fineRiuscita('2026-11-01T10:00:09.000Z'));
  assert.equal(b.riga(primo, conDue).compattazioni, 2);
  await primo.chiudi({ attesaMassimaMs: 5000 });

  let letture = 0;
  const secondo = b.nuovoRegistro();
  const { ripristinate } = await secondo.ripristina();
  assert.equal(ripristinate, 3);
  const spia = mock.method(fs, 'createReadStream', function spiata(...a) { letture += 1; return spia.mock.original.apply(this, a); });
  const spiaOpen = mock.method(fs.promises, 'open', async function spiata(...a) { letture += 1; return spiaOpen.mock.original.apply(this, a); });
  const spiaRead = mock.method(fs.promises, 'readFile', async function spiata(...a) { letture += 1; return spiaRead.mock.original.apply(this, a); });
  syncBuiltinESMExports();
  try {
    for (let i = 0; i < 5; i += 1) secondo.elenca();
    assert.equal(b.riga(secondo, conDue).compattazioni, 2, 'mai aperta dopo il riavvio: il conto vero');
    assert.equal(b.riga(secondo, annullata).compattazioni, 0, 'l\'Annulla regge al riavvio');
    assert.equal(b.riga(secondo, senza).compattazioni, 0, 'lo zero viene da un giornale letto');
    assert.equal(letture, 0, 'nessuna lettura di file nell\'elenco');
  } finally {
    spia.mock.restore(); spiaOpen.mock.restore(); spiaRead.mock.restore();
    syncBuiltinESMExports();
  }
});

test('EC-08 — il conto si tiene per sessione: elenca consuma solo gli eventi nuovi, non riscorre quelli già contati', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const id = await b.avvia(registro);
  const visti = [];
  const togli = registro.iscriviti(id, (e) => visti.push(e));
  t.after(() => togli?.());
  const { onEvento } = b.giri.at(-1);
  onEvento(fineRiuscita('2026-11-01T10:00:01.000Z'));
  assert.equal(b.riga(registro, id).compattazioni, 1);
  /* un evento già contato che cambia sotto i piedi: chi riscorresse la storia a ogni elenco lo vedrebbe */
  const contato = visti.find((e) => e.name === 'talos.compattazione');
  contato.value.compattato = false;
  assert.equal(b.riga(registro, id).compattazioni, 1, 'non riscorso');
  onEvento(fineRiuscita('2026-11-01T10:00:02.000Z'));
  assert.equal(b.riga(registro, id).compattazioni, 2, 'gli eventi nuovi sì');
});

test('EC-10 — `descrivi` che fallisce (il segreto illeggibile) non ferma l\'elenco né resta per sempre: null adesso, e il giro dopo riprova', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const id = await b.avvia(registro);
  const altra = await b.avvia(registro, b.crea('progetti', 'altra'));
  let tentativi = 0;
  registro.usaDescrizioneCartelle(async (percorso) => {
    if (percorso.endsWith('altra')) return { cartellaId: 'y'.repeat(32), nome: 'altra' };
    tentativi += 1;
    if (tentativi === 1) throw Object.assign(new Error('illeggibile'), { code: 'REMOTE_CONSENTS_UNREADABLE' });
    return { cartellaId: 'x'.repeat(32), nome: 'AVM' };
  });
  await registro.attendiCartelle();
  assert.equal(b.riga(registro, id).cartella, null);
  assert.equal(b.riga(registro, altra).cartella?.nome, 'altra', 'la cartella dopo non paga il guasto di quella prima');
  b.avanza(61_000);
  assert.deepEqual((await b.dopoIlCalcolo(registro, id)).cartella, { cartellaId: 'x'.repeat(32), nome: 'AVM' });
  assert.equal(tentativi, 2);
});

/* 500 sessioni vere su disco: una copiata, con la cartella cambiata; dieci cartelle e un percorso irraggiungibile */
async function cinquecento(b, { irraggiungibile }) {
  const primo = b.nuovoRegistro();
  const base = await b.avvia(primo);
  await primo.compatta(base);
  await primo.chiudi({ attesaMassimaMs: 5000 });
  const nomeBase = `${base}.jsonl`;
  assert.ok(readdirSync(b.store).includes(nomeBase));
  const testo = readFileSync(join(b.store, nomeBase), 'utf8');
  const cartelle = Array.from({ length: 10 }, (_, i) => b.crea('progetti', `p${i}`));
  const originale = JSON.stringify(b.stato.cartella).slice(1, -1);
  for (let i = 0; i < 499; i += 1) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const cartella = i === 0 ? irraggiungibile : cartelle[i % 10];
    writeFileSync(join(b.store, `${id}.jsonl`), testo.split(base).join(id).split(originale).join(JSON.stringify(cartella).slice(1, -1)));
  }
}

test('EC-09 — 500 sessioni, un percorso irraggiungibile: il disco morto non ferma l\'elenco, `descrivi` gira una volta per cartella, nessuna lettura di giornale', async (t) => {
  const b = banco(t);
  const spento = '\\\\10.255.255.1\\spento\\progetto';
  await cinquecento(b, { irraggiungibile: spento });
  let descrizioni = 0;
  const controllati = [];
  const registro = b.nuovoRegistro({
    /* il disco di rete spento: il controllo non torna mai */
    statCartellaFn: (p) => { controllati.push(p); return p === spento ? new Promise(() => {}) : fs.promises.stat(p); },
    attesaControlloCartellaMs: 200,
  });
  const { ripristinate } = await registro.ripristina();
  assert.equal(ripristinate, 500);
  registro.usaDescrizioneCartelle(async (p) => { descrizioni += 1; return { cartellaId: `id-${p.split(/[\\/]/u).pop()}`, nome: 'n', percorso: p, tipo: 'chat' }; });
  await registro.attendiCartelle();
  const distinte = new Set(registro.elenca().map((r) => r.cartella?.cartellaId));
  assert.equal(distinte.has(undefined), true, 'la riga del disco spento è null, non aspetta');
  assert.equal(descrizioni, 11, 'una per cartella (le dieci più quella di partenza), il disco spento no');
  const riga = registro.elenca().find((r) => r.cartella);
  assert.deepEqual(Object.keys(riga.cartella).sort(), ['cartellaId', 'nome'], 'nient\'altro passa, nemmeno `tipo` o un percorso');
  for (let i = 0; i < 20; i += 1) registro.elenca();
  assert.equal(descrizioni, 11, 'una volta sola, non a ogni elenco');
  b.avanza(61_000);
  registro.elenca();
  await registro.attendiCartelle();
  assert.equal(descrizioni, 11, 'il giro dopo controlla che ci siano, l\'id resta quello');
  assert.equal(controllati.filter((p) => p === spento).length, 1, 'sul disco spento mai due controlli insieme: il filo del pool è già occupato');
  assert.equal(controllati.filter((p) => p !== spento).length, 22, 'le altre undici sì, due volte');
});

/* R2 (revisione del Blocco 21): la riparazione dell'archivio manda lavori e versioni alla copia da parte, e la scheda riparte da 0. L'elenco conta dal giornale */
const versioneCommitted = (sessionId, id) => ({ schema: 'talos.context.event.v1', id: `e-${id}`, sessionId, versionId: `v-${id}`, jobId: `j-${id}`, kind: 'context.version.committed', createdAt: '2026-11-01T10:00:00.000Z', payload: { coveredThrough: 1 } });

test('EC-11 — archivio riparato: con il servizio, lo store e il registro veri la riga dice lo stesso numero della scheda Contesto, anche dopo il riavvio', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro({ motoreContestoPerNuoveFn: () => 'engine' });
  const m = await b.avvia(registro);
  const ora = '2026-11-01T10:00:00.000Z';
  const conta = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
  const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: conta, clock: () => ora });
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === m ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === m,
    resolveSessionModel: async () => MODELLO, onEvent: (x) => registro.pubblicaEventoContesto(x), clock: () => ora });
  t.after(() => service.close());
  const hooks = await service.createKernelHooks({ sessionId: m, runId: 'giro-1' });
  const prima = [{ role: 'user', content: 'uno' }, { role: 'assistant', content: 'due' }, { role: 'user', content: 'tre' }];
  const dopo = [prima[0], { role: 'assistant', content: 'due, riscritto' }, prima[2]];
  await hooks.prepare({ messages: prima, originali: prima, tools: [] });
  await registro.pubblicaEventoContesto({ sessionId: m, event: versioneCommitted(m, 1) });
  await registro.pubblicaEventoContesto({ sessionId: m, event: versioneCommitted(m, 2) });
  assert.equal(b.riga(registro, m).compattazioni, 2, 'premessa');
  const esito = await hooks.prepare({ messages: dopo, originali: dopo, tools: [] });
  assert.ok(esito.riallineato, 'premessa: riparato');
  const scheda = compattazioniDellaConversazione({ motore: await service.request({ sessionId: m, method: 'GET', path: '/' }) }).numero;
  assert.equal(scheda, 0, 'lavori e versioni sono nella copia da parte');
  assert.equal(b.riga(registro, m).compattazioni, scheda, 'due numeri diversi per la stessa conversazione');
  await registro.pubblicaEventoContesto({ sessionId: m, event: versioneCommitted(m, 3) });
  assert.equal(b.riga(registro, m).compattazioni, 1, 'dopo la riparazione si conta da capo');
  await registro.chiudi({ attesaMassimaMs: 5000 });
  const secondo = b.nuovoRegistro({ motoreContestoPerNuoveFn: () => 'engine' });
  await secondo.ripristina();
  assert.equal(b.riga(secondo, m).compattazioni, 1, 'il riavvio rigioca il giornale nello stesso ordine');
});

test('EC-12 — l\'azzeramento è del motore: la strada semplice non si tocca, e una conversazione di prova (senza timbro) resta col conto del motore', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const azzera = (sessionId, id) => ({ schema: 'talos.context.event.v1', id: `a-${id}`, sessionId, kind: 'context.archive.set-aside', createdAt: '2026-11-01T10:00:00.000Z', payload: { asideId: `${sessionId}.aside-1` } });
  const semplice = await b.avvia(registro);
  b.giri.at(-1).onEvento(fineRiuscita('2026-11-01T10:00:01.000Z'));
  await registro.pubblicaEventoContesto({ sessionId: semplice, event: azzera(semplice, 1) });
  assert.equal(b.riga(registro, semplice).compattazioni, 1, 'senza versioni del motore il conto è quello semplice');
  const diProva = await b.avvia(registro);
  b.giri.at(-1).onEvento(fineRiuscita('2026-11-01T10:00:02.000Z'));
  await registro.pubblicaEventoContesto({ sessionId: diProva, event: versioneCommitted(diProva, 1) });
  await registro.pubblicaEventoContesto({ sessionId: diProva, event: azzera(diProva, 2) });
  assert.equal(b.riga(registro, diProva).compattazioni, 0, 'la scheda di una conversazione col motore dice 0, il rapido non è suo');
});

/* R10 (revisione del Blocco 21): «uno alla volta» limita le partenze, non le operazioni appese. Finta sul `stat`: un disco di rete vero non c'è */
test('EC-13 — dischi spenti: al più due operazioni appese insieme, e nessun giro ne aggiunge (i fili del pool servono anche ai giornali)', async (t) => {
  const b = banco(t);
  let appesi = 0;
  const registro = b.nuovoRegistro({ statCartellaFn: () => { appesi += 1; return new Promise(() => {}); }, attesaControlloCartellaMs: 200 });
  for (let i = 0; i < 6; i += 1) await b.avvia(registro, b.crea(`spento-${i}`));
  registro.usaDescrizioneCartelle(async () => ({ cartellaId: 'x', nome: 'n' }));
  await registro.attendiCartelle();
  assert.equal(appesi, 2);
  for (let i = 0; i < 3; i += 1) { b.avanza(61_000); registro.elenca(); await registro.attendiCartelle(); }
  assert.equal(appesi, 2, 'i giri dopo non ne aprono altri');
});

test('EC-14 — un controllo appeso che torna libera il posto, e la cartella mai guardata passa davanti a quelle che non rispondono', async (t) => {
  const b = banco(t);
  const sblocca = [];
  const avviati = [];
  const registro = b.nuovoRegistro({ statCartellaFn: (p) => { avviati.push(p); return p.includes('spento') ? new Promise((_ok, no) => { sblocca.push(no); }) : fs.promises.stat(p); }, attesaControlloCartellaMs: 200 });
  await b.avvia(registro, b.crea('spento-1'));
  await b.avvia(registro, b.crea('spento-2'));
  const viva = await b.avvia(registro, b.crea('viva'));
  registro.usaDescrizioneCartelle(async (p) => ({ cartellaId: p.split(/[\\/]/u).pop(), nome: 'n' }));
  await registro.attendiCartelle();
  assert.equal(avviati.length, 2, 'la terza aspetta');
  assert.equal(b.riga(registro, viva).cartella, null);
  sblocca[0](new Error('EHOSTDOWN'));
  await new Promise((r) => setImmediate(r));
  assert.equal((await b.dopoIlCalcolo(registro, viva)).cartella?.cartellaId, 'viva', 'non deve aspettare il giro del minuto, e non paga il primo disco che torna a non rispondere');
});

/* R11 (revisione del Blocco 21): `descrivi` legge il segreto sul disco dei dati, e non aveva un tempo massimo */
test('EC-15 — una `descrivi` appesa non ferma il giro: le altre cartelle si calcolano, mai due sullo stesso percorso, e la risposta tardiva vale', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro({ attesaControlloCartellaMs: 200 });
  const lenta = await b.avvia(registro, b.crea('lenta'));
  const altra = await b.avvia(registro, b.crea('altra'));
  let rispondi = null;
  let chiamate = 0;
  registro.usaDescrizioneCartelle((p) => {
    if (!p.endsWith('lenta')) return Promise.resolve({ cartellaId: 'y'.repeat(32), nome: 'altra' });
    chiamate += 1;
    return new Promise((ok) => { rispondi = ok; });
  });
  const entroIlTempo = () => Promise.race([registro.attendiCartelle().then(() => 'finito'), new Promise((r) => { setTimeout(r, 2000, 'appeso'); })]);
  assert.equal(await entroIlTempo(), 'finito', 'il giro resta appeso: nessuna riga nuova porterà più la cartella fino al riavvio');
  assert.equal(b.riga(registro, altra).cartella?.nome, 'altra', 'la cartella dopo non paga quella appesa');
  assert.equal(b.riga(registro, lenta).cartella, null);
  b.avanza(61_000);
  registro.elenca();
  assert.equal(await entroIlTempo(), 'finito');
  assert.equal(chiamate, 1, 'la stessa operazione è ancora appesa: non se ne apre un\'altra');
  rispondi({ cartellaId: 'z'.repeat(32), nome: 'lenta' });
  await new Promise((r) => setImmediate(r));
  b.avanza(61_000);
  assert.deepEqual((await b.dopoIlCalcolo(registro, lenta)).cartella, { cartellaId: 'z'.repeat(32), nome: 'lenta' }, 'la risposta arrivata tardi non si butta');
  assert.equal(chiamate, 1);
});

/* ROSSO 4 della PR 91 (09/11/2026): con 5 ms il `stat` + `realpath` vero di una cartella sul disco del runner di GitHub scadeva, la cartella
 * risultava «assente» e la sua `descrivi` non partiva (1 !== 2). Un'attesa che una cartella vera rispetta sempre: 200 ms, di serie sono 2000.
 * Lo stesso alle EC-09, EC-13, EC-14 ed EC-15 (e la gara di EC-15 sale a 2 s, sopra due attese). */
test('EC-16 — una `descrivi` appesa conta nel tetto delle operazioni appese', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro({ attesaControlloCartellaMs: 200 });
  let chiamate = 0;
  for (let i = 0; i < 4; i += 1) await b.avvia(registro, b.crea(`lenta-${i}`));
  registro.usaDescrizioneCartelle(() => { chiamate += 1; return new Promise(() => {}); });
  await registro.attendiCartelle();
  assert.equal(chiamate, 2);
});

/* R20 (revisione del Blocco 21): il ponte ricalcolava `descrivi` a ogni riga e a ogni elenco. I controlli di consenso restano dal vivo */
test('EC-17 — ponte: `descrivi` non gira più per una cartella già calcolata, e il consenso resta letto dal vivo', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  let descrizioni = 0;
  const { ponte, cartelle } = b.monta(registro, { avvolgi: (c) => ({ ...c, descrivi: (p) => { descrizioni += 1; return c.descrivi(p); } }) });
  const id = await b.avvia(registro);
  const riga = await b.dopoIlCalcolo(registro, id);
  assert.equal(descrizioni, 1, 'il calcolo in sottofondo');
  const dispositivo = { id: 'disp-A', nome: 'Pad' };
  const [prima] = (await ponte(dispositivo)).filter((r) => r.sessionId === id);
  assert.equal(descrizioni, 1, 'nessuna seconda `descrivi` dal ponte');
  assert.equal(prima.cartellaId, riga.cartella.cartellaId, 'lo stesso id piatto');
  assert.equal(prima.consentita, false);
  await cartelle.consentiInAnticipo(dispositivo.id, b.stato.cartella);
  const [dopo] = (await ponte(dispositivo)).filter((r) => r.sessionId === id);
  assert.equal(dopo.consentita, true, 'il consenso non si prende mai dalla memoria dell\'elenco');
  assert.equal(descrizioni, 1);
});

test('EC-18 — ponte: una riga non ancora calcolata dice lo stesso di prima, e la cartella cancellata non esce con l\'id ricordato', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const { ponte } = b.monta(registro);
  const id = await b.avvia(registro, b.crea('che-sparira'));
  const [subito] = (await ponte()).filter((r) => r.sessionId === id);
  assert.match(subito.cartellaId, /^[A-Za-z0-9_-]{32}$/u, 'prima del giro in sottofondo vale ancora `descrivi`');
  await b.dopoIlCalcolo(registro, id);
  rmdirSync(join(b.radice, 'che-sparira'));
  const [subitoDopo] = (await ponte()).filter((r) => r.sessionId === id);
  assert.equal(subitoDopo.cartellaId, undefined, 'il giro del minuto non è ancora passato: decide la cartella letta dal vivo');
  b.avanza(61_000);
  await b.dopoIlCalcolo(registro, id);
  const [dopo] = (await ponte()).filter((r) => r.sessionId === id);
  assert.equal(dopo.cartellaId, undefined);
  assert.equal(dopo.consentita, false);
});

test('EC-20 — ponte: una cartella esclusa già calcolata non si ricalcola a ogni elenco, e resta senza id', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const esclusa = b.crea('esclusa');
  let descrizioni = 0;
  const { ponte } = b.monta(registro, { cartelleEscluse: [b.dati, esclusa], avvolgi: (c) => ({ ...c, descrivi: (p) => { descrizioni += 1; return c.descrivi(p); } }) });
  const id = await b.avvia(registro, esclusa);
  await b.dopoIlCalcolo(registro, id);
  assert.equal(descrizioni, 1);
  const [riga] = (await ponte()).filter((r) => r.sessionId === id);
  assert.equal(riga.cartellaId, undefined);
  assert.equal(descrizioni, 1);
});

test('EC-19 — `cartellaDescritta` porta anche il `tipo` per il ponte (la riga dell\'elenco no), e distingue «non calcolata» da «esclusa»', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const [dirChat, dirEsclusa, dirFallita] = [b.crea('chat'), b.crea('esclusa'), b.crea('segreto-illeggibile')];
  const chat = await b.avvia(registro, dirChat);
  const esclusa = await b.avvia(registro, dirEsclusa);
  const fallita = await b.avvia(registro, dirFallita);
  assert.equal(registro.cartellaDescritta(chat, dirChat), undefined, 'non calcolata');
  registro.usaDescrizioneCartelle(async (p) => {
    if (p.endsWith('segreto-illeggibile')) throw Object.assign(new Error('illeggibile'), { code: 'REMOTE_CONSENTS_UNREADABLE' });
    return p.endsWith('esclusa') ? null : { cartellaId: 'x'.repeat(32), nome: 'chat', tipo: 'chat' };
  });
  await registro.attendiCartelle();
  assert.equal(registro.cartellaDescritta(fallita, dirFallita), undefined, 'il calcolo è fallito: il ponte fa da sé, non è «da non mostrare»');
  assert.deepEqual(registro.cartellaDescritta(chat, dirChat), { cartellaId: 'x'.repeat(32), nome: 'chat', tipo: 'chat' });
  assert.equal(registro.cartellaDescritta(chat, dirEsclusa), undefined, 'RIP-2: la nota è di un altro percorso vero');
  assert.equal(registro.cartellaDescritta(esclusa, dirEsclusa), null, 'calcolata: non è da chiedere di nuovo');
  assert.deepEqual(Object.keys(b.riga(registro, chat).cartella).sort(), ['cartellaId', 'nome']);
  assert.equal(registro.cartellaDescritta('non-esiste', dirChat), undefined);
});
