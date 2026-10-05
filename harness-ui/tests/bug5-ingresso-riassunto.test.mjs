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
  MARCATORE_INGRESSO_TAGLIATO, VARIABILE_TETTO_TOKEN, classificaFallimentoRiassunto, creaRecord,
  limitaIngressoRiassunto,
} from '../src/kernel/compattazione-desktop.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

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
    const body = JSON.parse(init.body);
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

test('BUG5-CLASSI-FALLIMENTO — le sette classi, pure', () => {
  assert.deepEqual([...CLASSI_FALLIMENTO_RIASSUNTO], ['vuoto', 'troncato', 'attrezzo', 'contesto-pieno', 'limite-tariffa', 'errore-rete', 'errore-ignoto']);
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
  const fornitore = fintoFornitore({ chiamateTool: 10, riassunto: () => ({ role: 'assistant', content: '' }) });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso', 'il giro conclude anche con il riassuntore fermo');
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === false);
  const conClasse = fini.find((e) => e.classe === 'vuoto' && e.fallimentiConsecutivi >= 1);
  assert.ok(conClasse, `un fallimento porta classe vuoto e contatore: ${JSON.stringify(fini)}`);
  assert.ok(fini.some((e) => e.fallimentiConsecutivi >= FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI), `il contatore arriva al massimo ${FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI}: ${JSON.stringify(fini.map((e) => e.fallimentiConsecutivi))}`);
  const pagati = fornitore.riassuntiChiesti().length;
  assert.equal(pagati, 3, `si pagano esattamente ${FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI} tentativi, il quarto identico non si chiede: pagati ${pagati}`);
  assert.equal(eventi.filter((e) => e.tipo === 'compattazione-inizio').length, 2, 'due compattazioni provate, poi la rete dei tentativi chiude il turno');
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
    assert.ok(body.messages.some((m) => m.content === MARCATORE_INGRESSO_TAGLIATO), 'il mezzo omesso porta il marcatore');
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
    const body = JSON.parse(init.body);
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
  const esauriti = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === false && e.classe === 'esaurito');
  assert.equal(esauriti.length, 1, `l ingresso a contatore pieno produce UNA chiusura classificata: ${JSON.stringify(eventi.filter((e) => e.tipo === 'compattazione-fine'))}`);
  assert.equal(esauriti[0].motivo, 'esaurito');
  assert.equal(esauriti[0].fallimentiConsecutivi, FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI, 'il contatore NON cresce: nessun nuovo fallimento, il giro era già aperto');
  assert.equal(eventi.filter((e) => e.tipo === 'compattazione-inizio').at(-1)?.motivo, 'overflow', 'la chiusura arriva dalla via K8 (ritentativo overflow)');
  assert.equal(fornitore.riassuntiChiesti().length, FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI, 'l ingresso a contatore pieno NON paga nessun riassunto');
});

test('BUG5-AZZERA-AL-SUCCESSO — un riassunto riuscito in mezzo azzera il contatore (falliti → riuscita → falliti)', async (t) => {
  /* Mutante M7 della review: senza l azzeramento (`if (esito.ok) fallimentiRiassuntoConsecutivi = 0`) i test
   * precedenti restano verdi. Qui il PAVIMENTO (system > soglia) tiene il turno sopra soglia anche dopo una
   * compattazione RIUSCITA: la terza compattazione entra a contatore azzerato e il giro di fallimenti riparte
   * da capo (2 nuovi tentativi pagati), invece di chiudersi subito in `esaurito` con zero tentativi. */
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const pavimento = 'PAVIMENTO-INCOMPRIMIBILE ' + 'p'.repeat(60_000);
  const risposte = ['', '', 'RIASSUNTO BUONINO DEL MEZZO COMPATTATO', '', ''];
  let numeroRiassunti = 0;
  const fornitore = fintoFornitore({
    chiamateTool: 8,
    riassunto: () => ({ role: 'assistant', content: risposte[numeroRiassunti++] ?? '' }),
  });
  const { esito, eventi } = await giro(t, { cartella, fornitore, contestoDelProgetto: pavimento });
  assert.equal(esito.comeFinita, 'concluso');
  const successi = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true);
  assert.ok(successi.length >= 1, `una compattazione RIUSCITA in mezzo: ${JSON.stringify(eventi.filter((e) => e.tipo === 'compattazione-fine'))}`);
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === false);
  assert.equal(fini.at(-1)?.classe, 'vuoto');
  assert.equal(fini.at(-1)?.fallimentiConsecutivi, 2, `dopo il successo il contatore riparte da capo: ultimo=${JSON.stringify(fini.at(-1))}`);
  assert.equal(fornitore.riassuntiChiesti().length, 5, '2 falliti + 1 riuscito + 2 falliti: il contatore azzerato consente nuovi tentativi');
  assert.equal(eventi.some((e) => e.classe === 'esaurito'), false, 'mai entrati a contatore pieno: nessuna chiusura esaurito');
});
