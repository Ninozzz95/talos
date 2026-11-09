/*
 * BUG-5 (05/10/2026) — l'ingresso del riassuntore si limita, i fallimenti si classificano, il cavo della
 * finestra arriva al kernel. Ogni caso qui sotto nato dalla misura sulla sessione vera b1e7382a (tre
 * compattazioni su tre «troncato», 213.785 token inviati AL RIASSUNTORE). Ermetico: modello finto, nessuna
 * rete, nessuna porta. Perimetro cura: `compattazione-desktop.mjs` (esporti additivi in coda),
 * `talosHarness.desktop-hotfix.mjs` (compattaOra + init), `agent-service.mjs` (inoltro `finestraToken`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import {
  CARATTERI_INGRESSO_RIASSUNTO, CLASSI_FALLIMENTO_RIASSUNTO, FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI,
  MARCATORE_INGRESSO_TAGLIATO, MARCATORE_ACCORCIATO, VARIABILE_TETTO_TOKEN, classificaFallimentoRiassunto, creaRecord,
  limitaIngressoRiassunto, stimaConPezzi, stimaDegliAttrezzi,
} from '../src/kernel/compattazione-desktop.mjs';
import { ATTREZZI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

const CONSEGNA = 'CONSEGNA-BUG5: leggi grande.txt più volte e riferisci.';
const PREAMBOLO = 'PREAMBOLO-PROGETTO ' + 'x'.repeat(12_000);

function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-bug5-ingresso-'));
  writeFileSync(join(dir, 'grande.txt'), `${'g'.repeat(79)}\n`.repeat(50));
  writeFileSync(join(dir, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}

function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  if (valore === undefined) delete process.env[VARIABILE_TETTO_TOKEN];
  else process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => {
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN];
    else process.env[VARIABILE_TETTO_TOKEN] = prima;
  });
}

const eRichiestaDiRiassunto = (body) => String(body.messages.at(-1)?.content ?? '').includes('CONTEXT COMPACTION');

/** Il fornitore finto del banco hotfix, con `riassunto` sotto controllo del test. */
function fintoFornitore({ chiamateTool = 10, riassunto } = {}) {
  const corpi = [];
  let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = corpoSenzaMarcatori(init.body);
    corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) {
      const dato = riassunto?.() ?? { role: 'assistant', content: `RIASSUNTO: ${corpi.length}` };
      const scelta = dato?.message ?? dato;
      return Response.json({ choices: [{ message: scelta, finish_reason: 'stop' }], usage });
    }
    lavoro += 1;
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, corpi, riassuntiChiesti: () => corpi.filter(eRichiestaDiRiassunto) };
}

async function giro(t, { cartella, fornitore, ...resto } = {}) {
  const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0',
    onGiro: (e) => eventi.push(e),
    ...resto,
  });
  return { esito, eventi };
}

test('BUG5-INGRESSO-SOTTO-SOGLIA — sotto il budget l ingresso torna IDENTICO (stesso riferimento)', () => {
  const lista = [
    { role: 'system', content: 'S1' },
    { role: 'user', content: 'ciao' },
    { role: 'user', content: 'CONTEXT COMPACTION. riassumi.' },
  ];
  assert.equal(limitaIngressoRiassunto(lista, { caratteriMassimi: 160_000 }), lista);
  assert.deepEqual(limitaIngressoRiassunto(null), [], 'non-array: lista vuota, mai null');
  assert.deepEqual(limitaIngressoRiassunto(lista, { caratteriMassimi: 0 }), lista, 'budget assurdo: si resta com era');
});

test('BUG5-INGRESSO-SOPRA-SOGLIA — testa di system, coda con l istruzione, UN marcatore, totale a cavallo del budget', () => {
  const mezzo = Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: `m${i} `.padEnd(9_000, 'z') }));
  const lista = [
    { role: 'system', content: 'S-IDENTITA '.repeat(50) },
    ...mezzo,
    { role: 'user', content: 'CONSEGNA VERA DELLA PERSONA' },
    { role: 'user', content: 'CONTEXT COMPACTION. Budget: at most 1000 words in total. Reply with ONLY the summary.' },
  ];
  const limitata = limitaIngressoRiassunto(lista, { caratteriMassimi: CARATTERI_INGRESSO_RIASSUNTO });
  assert.notEqual(limitata, lista, 'sopra il budget la lista cambia');
  assert.equal(limitata[0].role, 'system', 'il system di identità resta in testa');
  assert.ok(limitata[0].content.startsWith('S-IDENTITA'), 'il system non si tocca');
  assert.ok(limitata.at(-1).content.includes('Reply with ONLY the summary'), 'l istruzione finale resta per intero');
  assert.ok(limitata.at(-2).content.includes('CONSEGNA VERA DELLA PERSONA'), 'la coda recente resta');
  const marcatori = limitata.filter((m) => m.content === MARCATORE_INGRESSO_TAGLIATO);
  assert.equal(marcatori.length, 1, 'UN messaggio di marcatore, non due');
  const totale = limitata.reduce((s, m) => s + m.content.length, 0);
  assert.ok(totale <= CARATTERI_INGRESSO_RIASSUNTO + MARCATORE_INGRESSO_TAGLIATO.length + 4_000, `totale ${totale} sotto il budget (con slack del test)`);
  const omessi = lista.length - limitata.length;
  assert.ok(omessi >= 10, `la parte centrale si omette per messaggi interi: omessi ${omessi}`);
});

test('BUG5-CLASSI-FALLIMENTO — le otto classi, pure (21/10: «rifiuto», come Hermes `_is_summary_refusal`)', () => {
  assert.deepEqual([...CLASSI_FALLIMENTO_RIASSUNTO], ['vuoto', 'troncato', 'attrezzo', 'rifiuto', 'contesto-pieno', 'limite-tariffa', 'errore-rete', 'errore-ignoto']);
  assert.equal(classificaFallimentoRiassunto({ esito: { ok: false, motivo: 'rifiuto' } }), 'rifiuto');
  assert.equal(classificaFallimentoRiassunto({ esito: { ok: false, motivo: 'vuoto' } }), 'vuoto');
  assert.equal(classificaFallimentoRiassunto({ esito: { ok: false, motivo: 'troncato' } }), 'troncato');
  assert.equal(classificaFallimentoRiassunto({ esito: { ok: false, motivo: 'attrezzo' } }), 'attrezzo');
  assert.equal(classificaFallimentoRiassunto({ errore: Object.assign(new Error('context length exceeded'), { status: 400 }) }), 'contesto-pieno');
  assert.equal(classificaFallimentoRiassunto({ errore: Object.assign(new Error('payment required'), { status: 402 }) }), 'limite-tariffa');
  assert.equal(classificaFallimentoRiassunto({ errore: new Error('HTTP 429 too many requests') }), 'limite-tariffa');
  assert.equal(classificaFallimentoRiassunto({ errore: new Error('fetch failed') }), 'errore-rete');
  assert.equal(classificaFallimentoRiassunto({ errore: Object.assign(new Error('boom'), { name: 'AbortError' }) }), 'errore-rete');
  assert.equal(classificaFallimentoRiassunto({ errore: new Error('qualcosa di mai visto') }), 'errore-ignoto');
  assert.equal(classificaFallimentoRiassunto({}), 'errore-ignoto');
});

test('BUG5-EVENTI-FALLIMENTO-E-GIRO — classe e contatore sugli eventi; il 4° tentativo identico NON si paga', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  /* 22/10/2026 notte (verdetto della CLI, C1): un riassunto si tenta solo se toglie il 10% della soglia al netto del riassunto atteso
     (almeno 2.000 token); con 10 letture, dopo il primo ripiego, la conversazione non tornava abbastanza sopra per un'entrata «esaurito».
     Con 14 sì: la scena è la stessa, solo più lunga. */
  const fornitore = fintoFornitore({ chiamateTool: 14, riassunto: () => ({ role: 'assistant', content: '' }) });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso', 'il giro conclude anche con il riassuntore fermo');
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === false);
  const conClasse = fini.find((e) => e.classe === 'vuoto' && e.fallimentiConsecutivi >= 1);
  assert.ok(conClasse, `un fallimento porta classe vuoto e contatore: ${JSON.stringify(fini)}`);
  /* L1 (owner 20/10/2026, «ripiego senza modello»): al contatore pieno la compattazione non si chiude più a vuoto — si fa col
     riassunto scritto dal codice (`riassuntoDiRipiego`), e l'evento lo dice con la classe del fallimento che l'ha causato. */
  const ripieghi = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ripiego === true);
  assert.equal(ripieghi.length >= 1, true, `al contatore pieno la compattazione si fa col ripiego: ${JSON.stringify(eventi.filter((e) => e.tipo === 'compattazione-fine'))}`);
  /* ⛔ 28/10/2026 (C-8, contratto C1 «mai aspettare»): all'emergenza il primo ripiego è il riassunto senza modello che non aspetta (classe
     'in-arrivo'), e il tentativo pagato si fa in sottofondo: la classe del suo fallimento ('vuoto', col contatore) la porta la
     preparazione. Prima il terzo tentativo era dentro il giro e il primo ripiego aveva la classe 'vuoto'. Il resto della prova non
     cambia: è quello che C-8 cura (due fallimenti in sottofondo spegnevano l'emergenza, e l'entrata «esaurito» non arrivava più). */
  await esito.compattazioneInPreparazione;
  assert.equal(ripieghi[0].classe, 'in-arrivo');
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-preparata' && e.compattato === false && e.classe === 'vuoto' && e.fallimentiConsecutivi >= 1),
    `il fallimento in sottofondo porta classe e contatore: ${JSON.stringify(eventi.filter((e) => e.tipo === 'compattazione-preparata'))}`);
  assert.ok(ripieghi.some((e) => e.classe === 'esaurito'), `l'entrata a contatore pieno va dritta al ripiego, senza pagare: ${JSON.stringify(ripieghi.map((e) => e.classe))}`);
  assert.match(String(ripieghi[0].record?.riassunto?.map?.((m) => m.content).join('\n') ?? ''), /written by TALOS without a model/u);
  const pagati = fornitore.riassuntiChiesti().length;
  assert.equal(pagati, 3, `si pagano esattamente ${FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI} tentativi, il quarto identico non si chiede: pagati ${pagati}`);
  assert.ok(eventi.filter((e) => e.tipo === 'compattazione-inizio').length >= 2, 'la seconda compattazione chiude col ripiego (dopo, la conversazione può crescere ancora)');
});

test('BUG5-MODELLO-CAMBIATO — il record di un altro modello emette l evento; stesso modello, nessun evento', async (t) => {
  conTetto(t, undefined);
  const cartella = cartellaDiProva(t);
  const record = creaRecord({
    coveredThrough: 2,
    riassunto: [{ role: 'user', content: 'RIASSUNTO DEL MODELLO VECCHIO' }],
    tokenPrima: 1_000, tokenDopo: 100, misura: 'stimato', at: '2026-10-05T00:00:00.000Z', modello: 'altro/modello-vecchio',
  });
  const conCambio = await giro(t, { cartella, fornitore: fintoFornitore({ chiamateTool: 1 }), recordCompattazioneIniziale: record });
  const evento = conCambio.eventi.find((e) => e.tipo === 'compattazione-modello-cambiato');
  assert.ok(evento, `l evento di cambio modello deve esserci: ${JSON.stringify(conCambio.eventi.map((e) => e.tipo))}`);
  assert.equal(evento.modello, 'z-ai/glm-5.3-flash');
  assert.equal(evento.modelloPrecedente, 'altro/modello-vecchio');
  const stesso = await giro(t, {
    cartella, fornitore: fintoFornitore({ chiamateTool: 1 }),
    recordCompattazioneIniziale: { ...record, modello: 'z-ai/glm-5.3-flash' },
  });
  assert.equal(stesso.eventi.find((e) => e.tipo === 'compattazione-modello-cambiato'), undefined, 'stesso modello: nessun evento');
});

test('BUG5-INGRESSO-LIMITATO-AL-VIVO — la richiesta di riassunto resta sotto il budget e la compattazione conclude', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 2 });
  const { esito } = await giro(t, {
    cartella, fornitore,
    messaggiIniziali: [
      { role: 'user', content: 'prepara tutto' },
      { role: 'assistant', content: 'MEZZO-ENORME ' + 'a'.repeat(700_000) },
      { role: 'user', content: CONSEGNA },
    ],
  });
  assert.equal(esito.comeFinita, 'concluso');
  assert.ok(esito.compattazioni >= 1, `almeno una compattazione: ${esito.compattazioni}`);
  const riassunti = fornitore.riassuntiChiesti();
  assert.ok(riassunti.length >= 1);
  for (const body of riassunti) {
    const totale = body.messages.reduce((s, m) => s + String(m.content ?? '').length, 0);
    assert.ok(totale <= CARATTERI_INGRESSO_RIASSUNTO + 4_000, `l ingresso del riassuntore ${totale} sta sotto il budget`);
    /* L1 (20/10/2026): il messaggio enorme non arriva MAI intero. Dal 20/10 lo accorcia per primo il taglio per messaggio
       (`ingressoRiassuntoPerFinestra`, come Hermes `_CONTENT_MAX`); il marcatore del mezzo omesso resta per quando non basta. */
    assert.ok(body.messages.some((m) => m.content === MARCATORE_INGRESSO_TAGLIATO || String(m.content ?? '').includes(MARCATORE_ACCORCIATO)),
      'il mezzo omesso o il messaggio accorciato porta il suo marcatore');
    assert.ok(!body.messages.some((m) => String(m.content ?? '').length > 100_000), 'nessun messaggio arriva intero');
  }
  assert.ok(esito.recordDiCompattazione?.length >= 1, 'il record di compattazione esiste: la storia si è sostituita');
});

test('BUG5-FINESTRA-INOLTRATA — avviaSessione inoltra finestraToken a talosLavora (il cavo del BUG-5)', async () => {
  let vista = new Map();
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', finestraToken: 131_072,
    onEvento: () => {},
    talosLavoraFn: async (input) => { vista.set('con', input.finestraToken); return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] }; },
  });
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: () => {},
    talosLavoraFn: async (input) => { vista.set('senza', input.finestraToken); return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] }; },
  });
  assert.equal(vista.get('con'), 131_072, 'la finestra dichiarata arriva al kernel');
  assert.equal(vista.get('senza'), null, 'senza finestra il kernel riceve null e vale il tetto');
});

test('BUG5-GIRO-CHIUSO-K8 — a contatore pieno il ritentativo overflow NON crasha: giro chiuso, classificato, osservabile', async (t) => {
  /* Revisione R1 della review avversariale (05/10/2026): il ritentativo overflow K8 dell'infer chiama
   * `compattaOra` SENZA passare da `decidiCompattazione` — le reti del lane legacy non coprono quella via.
   * Con il contatore già al massimo, PRIMA della micro-cura il guard-break lasciava `esito` undefined e il
   * giro moriva con `TypeError: Cannot read properties of undefined (reading 'ok')`, senza classificazione
   * e senza evento. Atteso OGGI: zero riassunti pagati, UNA chiusura classificata `esaurito` con il
   * contatore INVARIATO, e l'errore del fornitore che risale (classificato dal K8), non un TypeError. */
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const corpi = [];
  let lavoro = 0;
  let riassuntiPagati = 0;
  const fetchDiRete = async (_url, init) => {
    const body = corpoSenzaMarcatori(init.body);
    corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) {
      riassuntiPagati += 1;
      return Response.json({ choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }], usage });
    }
    lavoro += 1;
    /* Tre riassunti vuoti pagati: il giro di fallimenti è aperto. La richiesta principale parte comunque
     * (rete `emergenzaEsaurita`) e il fornitore risponde CONTESTO PIENO → scatta il ritentativo K8. */
    if (riassuntiPagati >= FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI) {
      throw Object.assign(new Error('context length exceeded: la richiesta supera la finestra'), { status: 413 });
    }
    if (lavoro <= 10) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  const fornitore = { fetchDiRete, corpi, riassuntiChiesti: () => corpi.filter(eRichiestaDiRiassunto) };
  const eventi = [];
  let erroreGiro = null;
  try {
    await talosLavora({
      cartella, task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
      fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0',
      onGiro: (e) => eventi.push(e),
    });
  } catch (errore) { erroreGiro = errore; }
  assert.ok(erroreGiro, 'il giro termina con l errore del fornitore (il K8 si ferma in modo pulito)');
  assert.ok(!/Cannot read properties/i.test(String(erroreGiro?.message ?? '')), `NESSUN TypeError dal giro di fallimenti: ${erroreGiro?.message}`);
  assert.equal(erroreGiro.classificazione, 'contesto-pieno', 'l errore che risale è quello del fornitore, classificato dal K8');
  /* L1 (owner 20/10/2026, «ripiego senza modello»): a contatore pieno, zero riassunti pagati e la compattazione si FA col
     riassunto del codice, classificata `esaurito`; l'errore che risale resta quello del fornitore. */
  const ripieghi = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ripiego === true);
  assert.equal(ripieghi.length >= 1, true, `l ingresso a contatore pieno produce UN ripiego classificato: ${JSON.stringify(eventi.filter((e) => e.tipo === 'compattazione-fine'))}`);
  assert.ok(!eventi.some((e) => e.tipo === 'compattazione-fine' && e.compattato === false && e.classe === 'esaurito'), 'nessuna chiusura a vuoto');
  /* L1 (20/10/2026): con il ripiego la compattazione d'emergenza riesce già prima del ritentativo K8; l'entrata a contatore pieno
     (→ ripiego `esaurito`, zero tentativi) la prova BUG5-EVENTI-FALLIMENTO-E-GIRO alla terza compattazione. */
  assert.equal(fornitore.riassuntiChiesti().length, FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI, 'l ingresso a contatore pieno NON paga nessun riassunto');
});

test('BUG5-AZZERA-AL-SUCCESSO — un riassunto riuscito in mezzo azzera il contatore (falliti → riuscita → falliti)', async (t) => {
  /* Mutante M7 della review: senza l azzeramento (`if (esito.ok) fallimentiRiassuntoConsecutivi = 0`) i test
   * precedenti restano verdi. Qui il PAVIMENTO (system > soglia) tiene il turno sopra soglia anche dopo una
   * compattazione RIUSCITA: la terza compattazione entra a contatore azzerato e il giro di fallimenti riparte
   * da capo (2 nuovi tentativi pagati), invece di chiudersi subito in `esaurito` con zero tentativi. */
  /* ⛔ 28/10/2026 — contratto C1, owner 27/10/2026, «Sì, mai aspettare»: l'intento è lo stesso (falliti → riuscito → falliti, e dopo il
     successo il contatore riparte da capo), ma all'emergenza i riassunti del modello non si pagano più dentro il giro: si preparano in
     sottofondo, ed è lì che il contatore sale e si azzera (`compattazione-preparata`). La scena cambia per tenersi su quella strada:
     compattazione istantanea accesa (sotto l'emergenza nessun riassunto dentro il giro), file DIVERSI da leggere (la coda non toglie i
     doppioni, quindi la conversazione cresce davvero fino a tre emergenze) e un modello che risponde in 150 ms (la preparazione di
     sottofondo arriva prima della richiesta dopo, come con un modello vero). Il successo in mezzo è il riassunto del modello arrivato
     («pronta»); le richieste partono col riassunto senza modello. */
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  for (let i = 1; i <= 30; i += 1) writeFileSync(join(cartella, `g${i}.txt`), `${String(i % 10).repeat(79)}\n`.repeat(50));
  /* ⛔ 30/10/2026 (diagnosi D, bisect sulla fusione r4 8a151530f): con 20.000 caratteri il pavimento VERO (system + attrezzi del
     kernel) è salito SOPRA la soglia quando r4 ha portato attrezzi e descrizioni nuove: ogni compattazione diventava «inefficace»
     (`compattazioniInefficaci` 2 ⇒ `emergenzaEsaurita`, la regola anti-ciclo GIUSTA) e la scena non arrivava più alla seconda serie
     di fallimenti. Ora il pavimento si RICAVA dalla misura (suggerimento di CLI e Performance): la somma «pavimento + attrezzi del
     kernel» resta costante (BILANCIO, misurato il 30/10: attrezzi 2.290 token + pavimento ~4.000), così la prossima crescita degli
     attrezzi accorcia il pavimento invece di riportare la scena sopra la soglia in silenzio. Il «tetto del preambolo» (#48 di T3 Code,
     Performance) sorveglia la crescita a parte. */
  const BILANCIO_TOKEN = 6_300;
  /* Performance (30/10): oltre il bilancio il pavimento smette di accorciarsi (il minimo da 4.000 caratteri) — lo si dice a parole */
  assert.ok(stimaDegliAttrezzi(ATTREZZI_OPENAI) < BILANCIO_TOKEN - 1_000, 'gli attrezzi del kernel hanno superato il bilancio della scena: rivedere BILANCIO_TOKEN');
  const caratteriPavimento = Math.max(4_000, (BILANCIO_TOKEN - stimaDegliAttrezzi(ATTREZZI_OPENAI)) * 4);
  const pavimento = 'PAVIMENTO-INCOMPRIMIBILE ' + 'p'.repeat(caratteriPavimento);
  const risposte = ['', '', 'RIASSUNTO BUONINO DEL MEZZO COMPATTATO', '', ''];
  let numeroRiassunti = 0;
  let lavoro = 0;
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) return Response.json({ choices: [{ message: { role: 'assistant', content: risposte[numeroRiassunti++] ?? '' }, finish_reason: 'stop' }], usage });
    lavoro += 1;
    await new Promise((r) => { setTimeout(r, 150); });
    if (lavoro <= 22) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `g${lavoro}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  const { esito, eventi } = await giro(t, { cartella, fornitore: { fetchDiRete }, contestoDelProgetto: pavimento, compattazioneIstantanea: true });
  assert.equal(esito.comeFinita, 'concluso');
  const successi = eventi.filter((e) => e.tipo === 'compattazione-preparata' && e.fase === 'pronta');
  assert.ok(successi.length >= 1, `un riassunto del modello RIUSCITO in mezzo: ${JSON.stringify(eventi.filter((e) => /^compattazione-(fine|preparata)$/u.test(e.tipo)))}`);
  /* 30/10/2026: la prova guarda l'AZZERAMENTO, non un totale che dipende da quanto pesano gli attrezzi del kernel. Il primo fallimento
     DOPO il successo riparte da capo (2 tentativi della sua preparazione); senza l'azzeramento (mutante M7) salirebbe a 4. */
  const iSuccesso = eventi.indexOf(successi[0]);
  const prima = eventi.slice(0, iSuccesso).filter((e) => e.tipo === 'compattazione-preparata' && e.compattato === false);
  const dopo = eventi.slice(iSuccesso + 1).filter((e) => e.tipo === 'compattazione-preparata' && e.compattato === false);
  assert.equal(prima.at(-1)?.fallimentiConsecutivi, 2, `premessa: due falliti prima del successo: ${JSON.stringify(prima)}`);
  assert.equal(dopo[0]?.classe, 'vuoto', `premessa: un fallimento dopo il successo: ${JSON.stringify(dopo)}`);
  assert.equal(dopo[0]?.fallimentiConsecutivi, 2, `dopo il successo il contatore riparte da capo: ${JSON.stringify(dopo[0])}`);
  /* Mobile (revisione 30/10): anche il TETTO — la regola anti-ciclo esiste per fermare i riassunti senza fine. Al massimo: 2 falliti +
     1 riuscito + il massimo dei consecutivi dopo l'azzeramento. */
  const chiesti = corpi.filter(eRichiestaDiRiassunto).length;
  assert.ok(chiesti >= 5, `2 falliti + 1 riuscito + 2 falliti: il contatore azzerato consente nuovi tentativi (${chiesti})`);
  assert.ok(chiesti <= 3 + FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI, `mai oltre il tetto anti-ciclo: ${chiesti}`);
  /* «esaurito» compare SOLO dopo che il contatore, ripartito da capo, è arrivato di nuovo al massimo: è la chiusura giusta (Mobile, 2) */
  const iPieno = eventi.findIndex((e, i) => i > iSuccesso && e.fallimentiConsecutivi >= FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI);
  const iEsaurito = eventi.findIndex((e) => e.classe === 'esaurito');
  assert.ok(iEsaurito === -1 || (iPieno !== -1 && iEsaurito > iPieno), `«esaurito» solo a contatore di nuovo pieno: esaurito=${iEsaurito} pieno=${iPieno}`);
});

/*
 * ⛔ C-8 (28/10/2026; L1 dell'owner del 20/10: «al contatore pieno la compattazione si fa col ripiego senza modello»). Con il contratto C1 i
 *   tentativi pagati all'emergenza si fanno in SOTTOFONDO; prima i loro fallimenti contavano fra i tentativi falliti del giro, e due di
 *   loro spegnevano l'emergenza — anche il riassunto senza modello, che non costa niente. Riprodotto: le richieste salivano oltre il tetto
 *   fino al rifiuto del fornitore (10.910 → 29.063 col tetto a 8.000). Scena: istantanea accesa, riassuntore che risponde vuoto, 22 letture
 *   di file DIVERSI (la coda non toglie i doppioni). Le richieste restano sotto la linea d'emergenza, come sul codice di prima del contratto
 *   (8fde46abf: fra 4.859 e 9.048), e il riassuntore non si paga oltre il suo tetto.
 */
test('C8-SOTTO-IL-TETTO-01 — fallimenti in sottofondo non spengono l\'emergenza: le richieste restano sotto la linea d\'emergenza, e i pagati non superano il tetto dei consecutivi', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  for (let i = 1; i <= 22; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${String(i % 10).repeat(79)}\n`.repeat(50));
  let lavoro = 0;
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) return Response.json({ choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }], usage });
    lavoro += 1;
    await new Promise((r) => { setTimeout(r, 50); });
    if (lavoro <= 22) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${lavoro}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  const { esito, eventi } = await giro(t, { cartella, fornitore: { fetchDiRete }, compattazioneIstantanea: true });
  await esito.compattazioneInPreparazione;
  assert.equal(esito.comeFinita, 'concluso');
  /* con la stima del kernel, quella che decide la linea: `JSON.stringify` / 4 conta anche chiavi e virgolette, e col prompt di base più lungo (Blocco 19) dava 9.628 dove il kernel
     misura 9.280 */
  const richieste = corpi.filter((b) => !eRichiestaDiRiassunto(b)).map((b) => stimaConPezzi(b.messages));
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-preparata' && e.compattato === false && e.classe === 'vuoto'), 'premessa: fallimenti in sottofondo');
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-fine' && e.ripiego === true && e.classe === 'esaurito'), `al contatore pieno il ripiego «esaurito» c'è ancora: ${JSON.stringify(eventi.filter((e) => e.tipo === 'compattazione-fine').map((e) => e.classe ?? e.motivo))}`);
  assert.ok(Math.max(...richieste) < 9_600, `ogni richiesta sotto la linea d'emergenza (9.600): ${richieste.join(', ')}`);
  assert.ok(corpi.filter(eRichiestaDiRiassunto).length <= FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI, `al più ${FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI} riassunti pagati falliti di fila`);
});

/* Riga dei risultati accorciati (owner 01/11/2026), lungo il filo della compattazione semplice: 22 letture in una richiesta sola col tetto a 8.000, e la riga della compattazione dice quante */
test('RIGA-ACCORCIATI-LEGACY-01 — la compattazione semplice dice quante uscite della richiesta in corso ha accorciato', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  for (let i = 1; i <= 22; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${String(i % 10).repeat(79)}\n`.repeat(50));
  let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) return Response.json({ choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }], usage });
    lavoro += 1;
    if (lavoro <= 22) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${lavoro}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  const { esito, eventi } = await giro(t, { cartella, fornitore: { fetchDiRete } });
  assert.equal(esito.comeFinita, 'concluso');
  const numeri = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.accorciateRichiesta > 0).map((e) => e.accorciateRichiesta);
  assert.ok(numeri.length > 0, `la riga porta il numero: ${JSON.stringify(eventi.filter((e) => e.tipo === 'compattazione-fine').map((e) => [e.compattato, e.motivo, e.soloCoda, e.ridotti]))}`);
});

test('RIGA-ACCORCIATI-LEGACY-02 — anche quando non c è niente da riassumere e si accorcia solo la coda', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  for (let i = 1; i <= 5; i += 1) writeFileSync(join(cartella, `g${i}.txt`), `${String(i % 10).repeat(79)}\n`.repeat(200));
  let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) throw new Error('niente riassunto in questa scena');
    lavoro += 1;
    if (lavoro <= 5) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `g${lavoro}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  const { eventi } = await giro(t, { cartella, fornitore: { fetchDiRete } });
  const sole = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.soloCoda === true);
  assert.ok(sole.length > 0, `premessa: ${JSON.stringify(eventi.filter((e) => e.tipo === 'compattazione-fine').map((e) => [e.compattato, e.motivo, e.soloCoda]))}`);
  assert.ok(sole.some((e) => e.accorciateRichiesta > 0), JSON.stringify(sole.map((e) => e.accorciateRichiesta ?? null)));
});
