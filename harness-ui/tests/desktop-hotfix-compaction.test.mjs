/*
 * F1 (24/09/2026) — la compattazione dell'adapter desktop, quello che gira sul 4174.
 *
 * Prima di questo file il percorso `maybeCompactLegacy` di `talosHarness.desktop-hotfix.mjs` non aveva UN test
 * (ricognizione K6): K1-K5 e K8 passavano tutti in verde. Ogni caso qui sotto è nato ROSSO sulla base `e2eb2a5ce`
 * (l'output è nel rapporto F1) e prova una decisione dell'owner del 24/09/2026, con il suo verso contrario.
 * Tutto ermetico: modello finto, nessuna rete, TEMP privata, nessuna porta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import {
  MARCATORE_INDICE, MARCATORE_RIASSUNTO, MAX_TOKEN_RIASSUNTO, SCHEMA_RECORD_COMPATTAZIONE, VARIABILE_TETTO_TOKEN,
  applicaRecord,
} from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONSEGNA = 'CONSEGNA-ORIGINALE-MARKER: leggi grande.txt più volte e riferisci.';
const PREAMBOLO = 'PREAMBOLO-PROGETTO ' + 'x'.repeat(12_000);
const PIANO = 'Modalità Piano attiva';

function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-hotfix-compaction-'));
  writeFileSync(join(dir, 'grande.txt'), 'g'.repeat(4_000));
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

const eRichiestaDiRiassunto = (body) => {
  const ultimo = String(body.messages.at(-1)?.content ?? '');
  return ultimo.includes('CONTEXT COMPACTION') || ultimo.includes('summarize your progress');
};

const orfaniTool = (messages) => {
  const aperti = new Set();
  let orfani = 0;
  for (const m of messages) {
    for (const c of m.tool_calls ?? []) aperti.add(c.id);
    if (m.role === 'tool' && !aperti.has(m.tool_call_id)) orfani += 1;
  }
  return orfani;
};

/* Il marcatore di cache del kernel trasforma l ultimo `system` in parti `[{type:'text', text}]`: si legge il testo. */
const testoDi = (m) => (typeof m?.content === 'string' ? m.content
  : Array.isArray(m?.content) ? m.content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('')
    : JSON.stringify(m?.content ?? ''));

/**
 * Il fornitore finto: `chiamateTool` chiamate a `leggi grande.txt` (≈1.000 token l'una), poi «Fatto.».
 * `usage.prompt_tokens` è la misura VERA della richiesta (caratteri/4 sul corpo): è il numero su cui l'adapter
 * deve decidere. `riassunto(n)` decide cosa risponde il riassuntore alla n-esima richiesta di riassunto.
 */
function fintoFornitore({ chiamateTool = 10, attrezzo = 'leggi', argomenti = '{"percorso":"grande.txt"}', riassunto, errorePerRichiesta } = {}) {
  const corpi = [];
  let lavoro = 0;
  let riassunti = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    const promptTokens = Math.ceil(JSON.stringify(body.messages).length / 4);
    const usage = { prompt_tokens: promptTokens, completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) {
      riassunti += 1;
      const scelta = riassunto?.(riassunti) ?? { role: 'assistant', content: `RIASSUNTO ${riassunti}: ho letto grande.txt più volte.` };
      return Response.json({ choices: [{ message: scelta, finish_reason: scelta.tool_calls ? 'tool_calls' : 'stop' }], usage });
    }
    lavoro += 1;
    const errore = errorePerRichiesta?.(lavoro, body);
    if (errore) return errore;
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: attrezzo, arguments: argomenti } }] }, finish_reason: 'tool_calls' }], usage });
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

test('CTX-HOTFIX-SHORT-TURNS-COMPACT — una sessione di turni corti sopra soglia compatta (K1)', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  let storia = null;
  let record = null;
  let compattazioni = 0;
  let riassunti = 0;
  for (let turno = 1; turno <= 6; turno += 1) {
    const fornitore = fintoFornitore({ chiamateTool: 3 });
    const { esito } = await giro(t, {
      cartella, fornitore,
      ...(storia ? { messaggiIniziali: [...storia, { role: 'user', content: `turno ${turno}: ` + 'y'.repeat(2_000) }] } : {}),
      ...(record ? { recordCompattazioneIniziale: record } : {}),
    });
    assert.equal(esito.comeFinita, 'concluso', `turno ${turno} deve concludersi`);
    storia = esito.messaggiFinali;
    compattazioni += esito.compattazioni;
    riassunti += fornitore.riassuntiChiesti().length;
    if (esito.recordDiCompattazione?.length) record = esito.recordDiCompattazione.at(-1);
  }
  assert.ok(compattazioni >= 1, `almeno una compattazione in 6 turni corti: ${compattazioni}`);
  assert.ok(riassunti >= 1, `almeno una richiesta di riassunto: ${riassunti}`);
  assert.ok(record, 'il record dell ultima compattazione arriva sul risultato del giro');
});

test('CTX-HOTFIX-SMALL-HISTORY-NEVER-COMPACTS — sotto soglia non compatta MAI, nemmeno a 100 richieste', async (t) => {
  conTetto(t, undefined);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 100, attrezzo: 'elenca', argomenti: '{"percorso":"."}' });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(fornitore.corpi.length, 101, 'cento chiamate di attrezzo più la risposta finale');
  assert.equal(fornitore.riassuntiChiesti().length, 0, 'nessuna richiesta di riassunto');
  assert.equal(esito.compattazioni, 0);
  assert.equal(eventi.filter((e) => e.tipo === 'compattazione-inizio').length, 0);
});

test('CTX-HOTFIX-KEEPS-TASK-VERBATIM — dopo il riassunto restano la consegna, TUTTI i system iniziali, nessun orfano (K3)', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 10 });
  const { esito } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const dopo = fornitore.corpi.filter((b) => b.messages.some((m) => testoDi(m).startsWith(MARCATORE_RIASSUNTO)));
  assert.ok(dopo.length >= 1, 'almeno una richiesta porta la storia compattata');
  for (const body of dopo) {
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[1].role, 'system');
    assert.ok(testoDi(body.messages[1]).includes('PREAMBOLO-PROGETTO'), 'il preambolo del progetto sopravvive');
    assert.ok(body.messages.some((m) => m.role === 'user' && testoDi(m).includes('CONSEGNA-ORIGINALE-MARKER')), 'la consegna della persona sopravvive alla lettera');
    assert.equal(orfaniTool(body.messages), 0, 'nessun risultato di attrezzo orfano');
    // Gli ultimi due scambi restano alla lettera: c'è ancora un tool_calls con il suo tool.
    assert.ok(body.messages.some((m) => m.role === 'assistant' && m.tool_calls?.length), 'gli scambi recenti restano alla lettera');
  }
});

test('CTX-HOTFIX-SUMMARY-NO-TOOLS — il riassuntore non riceve attrezzi e ha max_tokens dichiarato (K4)', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 10 });
  await giro(t, { cartella, fornitore });
  const riassunti = fornitore.riassuntiChiesti();
  assert.ok(riassunti.length >= 1);
  for (const body of riassunti) {
    assert.deepEqual(body.tools ?? [], [], 'nessun attrezzo al riassuntore');
    assert.equal(body.max_tokens, MAX_TOKEN_RIASSUNTO);
    assert.ok(!body.messages.some((m) => testoDi(m).startsWith(PIANO)), 'nessun effimero nel riassunto');
  }
});

test('CTX-HOTFIX-SUMMARY-RETRIES-ONCE — un riassunto con attrezzo o vuoto si ritenta UNA volta, poi si va avanti', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({
    chiamateTool: 10,
    riassunto: (n) => (n === 1
      ? { role: 'assistant', content: '', tool_calls: [{ id: 'r1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }
      : n === 2 ? { role: 'assistant', content: '   ' } : undefined),
  });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine');
  assert.ok(fini.length >= 1);
  assert.equal(fini[0].compattato, false, 'il primo tentativo (attrezzo + vuoto) è dichiarato fallito');
  assert.equal(fornitore.riassuntiChiesti().length >= 2, true, 'due richieste di riassunto per un tentativo fallito');
  // Nessun attrezzo eseguito per colpa del riassuntore: `r1` non compare mai come risultato di attrezzo.
  assert.ok(!fornitore.corpi.some((b) => b.messages.some((m) => m.role === 'tool' && m.tool_call_id === 'r1')));
});

test('CTX-HOTFIX-PLAN-NO-ORPHAN-TOOL — in Piano il sistema effimero si stacca prima e si riattacca dopo (K5)', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 10 });
  const { esito } = await giro(t, { cartella, fornitore, modalitaOperativa: 'piano' });
  assert.equal(esito.comeFinita, 'concluso');
  assert.ok(esito.compattazioni >= 1);
  for (const body of fornitore.corpi) {
    assert.equal(orfaniTool(body.messages), 0, 'nessun risultato di attrezzo orfano in nessuna richiesta');
    const effimeri = body.messages.filter((m) => m.role === 'system' && testoDi(m).startsWith(PIANO));
    if (eRichiestaDiRiassunto(body)) assert.equal(effimeri.length, 0, 'il riassuntore non vede il Piano');
    else {
      assert.equal(effimeri.length, 1, 'il Piano resta UNA volta');
      assert.ok(testoDi(body.messages.at(-1)).startsWith(PIANO), 'e resta in coda');
    }
  }
  assert.ok(!esito.messaggiFinali.some((m) => m.role === 'system' && testoDi(m).startsWith(PIANO)), 'l archivio non contiene l effimero');
});

test('CTX-HOTFIX-TRIAL-RAW-PREPARE — il trial riceve `messages` corretto e `originali` grezzo, senza effimeri (T1/T2)', async (t) => {
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 1, attrezzo: 'elenca', argomenti: '{"percorso":"uno.txt"}' });
  const visti = [];
  const contextHooks = { async prepare(payload) { visti.push(payload); return { messages: payload.messages }; } };
  const { esito } = await giro(t, { cartella, fornitore, contextHooks, modalitaOperativa: 'piano' });
  assert.equal(esito.comeFinita, 'concluso');
  const secondo = visti[1];
  assert.ok(Array.isArray(secondo.originali), 'prepare porta `originali`');
  const grezzo = secondo.originali.find((m) => m.role === 'tool');
  const corretto = secondo.messages.find((m) => m.role === 'tool');
  assert.match(String(grezzo.content), /is not a readable folder/);
  assert.match(String(corretto.content), /is a FILE, not a folder/);
  for (const lista of [secondo.messages, secondo.originali]) {
    assert.ok(!lista.some((m) => testoDi(m).startsWith(PIANO)), 'nessun effimero nelle due liste');
  }
  const ultimaRichiesta = fornitore.corpi.at(-1);
  assert.ok(testoDi(ultimaRichiesta.messages.at(-1)).startsWith(PIANO), 'il fornitore riceve il Piano riattaccato in coda');
});

test('CTX-HOTFIX-RECORD-EMITTED-AND-REPLAYABLE — record `talos.compattazione.v1` sugli eventi e sul risultato; applicaRecord rifà la proiezione', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 7 });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  const inizi = eventi.filter((e) => e.tipo === 'compattazione-inizio');
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato);
  assert.equal(inizi.length, 1, 'una sola compattazione con questo tetto');
  assert.equal(fini.length, 1);
  assert.equal(inizi[0].motivo, 'soglia');
  assert.equal(typeof inizi[0].tokenMisurati, 'number');
  assert.equal(inizi[0].soglia, 8_000);
  const record = fini[0].record;
  assert.equal(record.schema, SCHEMA_RECORD_COMPATTAZIONE);
  assert.equal(record.misura, 'fornitore', 'il numero che ha deciso è quello del fornitore');
  assert.ok(record.tokenPrima >= 8_000 && record.tokenDopo < record.tokenPrima, `${record.tokenPrima} → ${record.tokenDopo}`);
  assert.equal(record.modello, 'z-ai/glm-5.3-flash');
  assert.deepEqual(esito.recordDiCompattazione, [record]);
  assert.ok(esito.messaggiFinali.length > record.coveredThrough, 'la storia grezza resta intera sul risultato');
  assert.ok(!esito.messaggiFinali.some((m) => testoDi(m).startsWith(MARCATORE_RIASSUNTO)), 'e non contiene il riassunto');
  // La richiesta subito dopo la compattazione è ESATTAMENTE la proiezione del record sulla storia grezza.
  const proiezione = applicaRecord(esito.messaggiFinali, record);
  const dopo = fornitore.corpi.find((b) => !eRichiestaDiRiassunto(b) && b.messages.some((m) => testoDi(m).startsWith(MARCATORE_RIASSUNTO)));
  const soloRuoliETesti = (lista) => lista.filter((m) => m.role !== 'system').map((m) => [m.role, testoDi(m), (m.tool_calls ?? []).map((c) => c.id).join(',')]);
  assert.deepEqual(soloRuoliETesti(dopo.messages), soloRuoliETesti(proiezione.slice(0, dopo.messages.length)));
});

test('CTX-HOTFIX-RECORD-CARRIED-INTO-NEXT-TURN — col record del turno prima, il turno dopo parte già compattato senza ripagare il riassunto', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const primo = fintoFornitore({ chiamateTool: 10 });
  const { esito: e1 } = await giro(t, { cartella, fornitore: primo });
  const record = e1.recordDiCompattazione.at(-1);
  assert.ok(record);
  const secondo = fintoFornitore({ chiamateTool: 0 });
  const { esito: e2 } = await giro(t, {
    cartella, fornitore: secondo,
    messaggiIniziali: [...e1.messaggiFinali, { role: 'user', content: 'seconda domanda breve' }],
    recordCompattazioneIniziale: record,
  });
  assert.equal(e2.comeFinita, 'concluso');
  assert.equal(secondo.riassuntiChiesti().length, 0, 'nessun nuovo riassunto');
  const prima = secondo.corpi[0];
  assert.ok(prima.messages.some((m) => testoDi(m).startsWith(MARCATORE_RIASSUNTO)), 'la prima richiesta è già proiettata');
  assert.ok(testoDi(prima.messages.at(-1)).includes('seconda domanda breve'));
  assert.ok(prima.messages.length < e1.messaggiFinali.length + 1);
});

test('CTX-HOTFIX-INDEX-HAS-PATH — l indice meccanico porta un percorso preso dagli argomenti degli attrezzi', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 10 });
  await giro(t, { cartella, fornitore });
  const dopo = fornitore.corpi.find((b) => b.messages.some((m) => testoDi(m).includes(MARCATORE_INDICE)));
  assert.ok(dopo, 'una richiesta porta l indice');
  const indice = dopo.messages.find((m) => testoDi(m).includes(MARCATORE_INDICE));
  assert.ok(testoDi(indice).includes('grande.txt'));
  assert.ok(!fornitore.riassuntiChiesti().some((b) => b.messages.some((m) => testoDi(m).includes(MARCATORE_INDICE))), 'l indice NON passa dal riassuntore');
});

test('CTX-HOTFIX-EMERGENCY-AFTER-FAILED-RETRY — la via normale fallita non spegne l emergenza', async (t) => {
  conTetto(t, 8_000); // soglia 8.000, emergenza 9.600 (tetto × 1,2 senza finestra)
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({
    chiamateTool: 8,
    riassunto: (n) => (n <= 2 ? { role: 'assistant', content: '' } : undefined),
  });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const inizi = eventi.filter((e) => e.tipo === 'compattazione-inizio');
  assert.deepEqual(inizi.map((e) => e.motivo), ['soglia', 'emergenza']);
  assert.equal(esito.compattazioni, 1);
  assert.equal(fornitore.riassuntiChiesti().length, 3, 'due tentativi falliti sulla soglia, uno riuscito in emergenza');
});

test('CTX-HOTFIX-INCOMPRESSIBLE-FLOOR-STOPS — un tetto sotto il pavimento incomprimibile non fa pagare un riassunto a ogni richiesta', async (t) => {
  conTetto(t, 4_000); // il solo preambolo vale ~3.000 token: la proiezione non può scendere sotto il tetto
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 10 });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const inizi = eventi.filter((e) => e.tipo === 'compattazione-inizio');
  const lavoro = fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b));
  // Due compattazioni giudicate inefficaci sul numero VERO del fornitore chiudono il turno; a cavallo della soglia
  // può passarne una in più (giudicata efficace). Mai una per richiesta.
  assert.ok(inizi.length <= 3, `al massimo tre compattazioni, non una per richiesta: ${inizi.map((e) => e.motivo).join(',')}`);
  assert.ok(fornitore.riassuntiChiesti().length < lavoro.length / 2, `${fornitore.riassuntiChiesti().length} riassunti contro ${lavoro.length} richieste di lavoro`);
  assert.equal(esito.compattazioni, inizi.length);
});

test('CTX-HOTFIX-TAIL-PRESSURE-STAYS-BOUNDED — letture grandi nella coda letterale non spengono la compattazione (owner 26/09, «Come Hermes»)', async (t) => {
  /* Il difetto del 24/09 (ledger F2 onda 2 §8): due letture da ~15K token nella coda la tenevano sopra il tetto, due
   * verdetti «inefficace» spegnevano la compattazione e la richiesta cresceva di una lettura a ogni giro (581.089 token
   * in 40 giri sulla base). Qui 12 giri: senza la cura si arriva oltre 150.000. */
  conTetto(t, 20_000);
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'grande.txt'), Array.from({ length: 1_000 }, (_, i) => `riga ${i} ${'y'.repeat(50)}`).join('\n'));
  const fornitore = fintoFornitore({ chiamateTool: 12 });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const lavoro = fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b));
  const dimensioni = lavoro.map((b) => Math.ceil(JSON.stringify(b.messages).length / 4));
  const massima = Math.max(...dimensioni);
  assert.ok(massima < 40_000, `nessuna richiesta oltre il doppio del tetto: massima ${massima} (${dimensioni.join(',')})`);
  assert.ok(lavoro.every((b) => orfaniTool(b.messages) === 0), 'nessun esito di attrezzo orfano dopo l accorciamento');
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine');
  assert.ok(fini.length >= 3, `la compattazione continua lungo il turno: ${fini.length}`);
  assert.ok(fini.every((e) => e.compattato), 'ogni compattazione riesce');
  const ultima = lavoro.at(-1).messages;
  assert.ok(ultima.some((m) => m.role === 'tool' && testoDi(m).includes('characters omitted to fit the context window')), 'gli esiti lunghi della coda portano il rimando');
  assert.ok(ultima.some((m) => testoDi(m).includes(CONSEGNA.slice(0, 30))), 'la consegna della persona resta alla lettera');
});

test('CTX-HOTFIX-OVERFLOW-RETRY-ONCE — contesto pieno dichiarato dal fornitore: UN ritentativo compattato, poi l errore passa classificato (K8)', async (t) => {
  conTetto(t, undefined);
  const cartella = cartellaDiProva(t);
  const overflow = () => new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 131072 tokens. However, you requested about 135349 tokens (60662 of text input, 10687 of tool input, 64000 in the output). Please reduce the length of either one, or use the context-compression plugin." } }), { status: 400, headers: { 'content-type': 'application/json' } });
  const storia = [];
  for (let i = 1; i <= 4; i += 1) {
    storia.push({ role: 'assistant', content: '', tool_calls: [{ id: `old_${i}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] });
    storia.push({ role: 'tool', tool_call_id: `old_${i}`, content: 'g'.repeat(4_000) });
  }
  storia.push({ role: 'assistant', content: 'Letto quattro volte.' });
  const fornitore = fintoFornitore({
    chiamateTool: 5,
    errorePerRichiesta: (n) => (n === 1 || n === 4 ? overflow() : null),
  });
  const messaggiIniziali = [
    { role: 'system', content: 'You are a coding agent.' }, { role: 'system', content: PREAMBOLO },
    { role: 'user', content: CONSEGNA }, ...storia, { role: 'user', content: 'ancora una volta' },
  ];
  let errore = null;
  let esito = null;
  const eventi = [];
  try {
    esito = await talosLavora({
      cartella, task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
      fetchDiRete: fornitore.fetchDiRete, comandoProva: 'node -e 0', messaggiIniziali, onGiro: (e) => eventi.push(e),
    });
  } catch (e) { errore = e; }
  assert.equal(esito, null, 'il secondo overflow non viene ritentato: il giro fallisce');
  assert.ok(errore, 'l errore del fornitore arriva com è');
  assert.match(errore.message, /HTTP 400/);
  assert.equal(errore.classificazione, 'contesto-pieno');
  assert.equal(fornitore.riassuntiChiesti().length, 1, 'un solo riassunto forzato');
  const inizi = eventi.filter((e) => e.tipo === 'compattazione-inizio');
  assert.deepEqual(inizi.map((e) => e.motivo), ['overflow']);
  const lavoro = fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b));
  assert.ok(lavoro[1].messages.some((m) => testoDi(m).startsWith(MARCATORE_RIASSUNTO)), 'il ritentativo parte con la storia compattata');
  assert.ok(lavoro[0].messages.length > lavoro[1].messages.length);
});

/*
 * ⛔⛔⛔ 25/09/2026 sera, MiniCPM5 sul 4174 (sessione 5233facd): il motore locale pieno non arriva come un 400 ma come un
 *   errore LANCIATO dall'adapter (`ContestoLocalePienoError`, codice `LOCAL_CONTEXT_EXCEEDED`, in italiano coi numeri).
 *   Il kernel deve riconoscerlo, comprimere e riprovare una volta — come per il 400 del fornitore qui sopra — invece di
 *   lasciarlo morire. Prima della cura quell'errore non esisteva: la riprova senza attrezzi lo nascondeva.
 */
test('CTX-HOTFIX-OVERFLOW-LOCAL — il contesto pieno del motore locale, lanciato dall adapter: compattazione e UN ritentativo che riesce', async (t) => {
  conTetto(t, undefined);
  const cartella = cartellaDiProva(t);
  const storia = [];
  for (let i = 1; i <= 4; i += 1) {
    storia.push({ role: 'assistant', content: '', tool_calls: [{ id: `old_${i}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] });
    storia.push({ role: 'tool', tool_call_id: `old_${i}`, content: 'g'.repeat(4_000) });
  }
  storia.push({ role: 'assistant', content: 'Letto quattro volte.' });
  const fornitore = fintoFornitore({
    chiamateTool: 1,
    errorePerRichiesta: (n) => {
      if (n === 1) throw Object.assign(new Error('La conversazione (17230 token) non entra nella finestra del modello locale (16384 token).'), { code: 'LOCAL_CONTEXT_EXCEEDED', stato: 400 });
      return null;
    },
  });
  const messaggiIniziali = [
    { role: 'system', content: 'You are a coding agent.' }, { role: 'system', content: PREAMBOLO },
    { role: 'user', content: CONSEGNA }, ...storia, { role: 'user', content: 'ancora una volta' },
  ];
  const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: CONSEGNA }, modello: 'local:un-gguf', chiave: 'fixture',
    fetchDiRete: fornitore.fetchDiRete, comandoProva: 'node -e 0', messaggiIniziali, onGiro: (e) => eventi.push(e),
  });
  assert.ok(esito, 'il giro riesce dopo la compattazione');
  assert.equal(fornitore.riassuntiChiesti().length, 1, 'un solo riassunto forzato');
  assert.deepEqual(eventi.filter((e) => e.tipo === 'compattazione-inizio').map((e) => e.motivo), ['overflow']);
  const lavoro = fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b));
  assert.ok(lavoro[1].messages.some((m) => testoDi(m).startsWith(MARCATORE_RIASSUNTO)), 'il ritentativo parte con la storia compattata');
  assert.ok(lavoro[1].tools?.length > 0, 'e con gli attrezzi: il contesto pieno non li toglie');
});

test('CTX-HOTFIX-OVERFLOW-TWICE-IN-A-ROW — se anche il ritentativo compattato va in overflow, l errore passa classificato e non si ritenta più', async (t) => {
  conTetto(t, undefined);
  const cartella = cartellaDiProva(t);
  const overflow = () => new Response(JSON.stringify({ error: { code: 'context_length_exceeded', message: 'The maximum context length is 1000 tokens.' } }), { status: 400, headers: { 'content-type': 'application/json' } });
  const storia = [];
  for (let i = 1; i <= 4; i += 1) {
    storia.push({ role: 'assistant', content: '', tool_calls: [{ id: `old_${i}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] });
    storia.push({ role: 'tool', tool_call_id: `old_${i}`, content: 'g'.repeat(4_000) });
  }
  storia.push({ role: 'assistant', content: 'Letto.' });
  const fornitore = fintoFornitore({ chiamateTool: 3, errorePerRichiesta: () => overflow() });
  const messaggiIniziali = [
    { role: 'system', content: 'You are a coding agent.' }, { role: 'system', content: PREAMBOLO },
    { role: 'user', content: CONSEGNA }, ...storia, { role: 'user', content: 'ancora' },
  ];
  await assert.rejects(talosLavora({
    cartella, task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: fornitore.fetchDiRete, comandoProva: 'node -e 0', messaggiIniziali,
  }), (e) => e.classificazione === 'contesto-pieno' && /HTTP 400/.test(e.message));
  assert.equal(fornitore.riassuntiChiesti().length, 1, 'un solo riassunto forzato');
  assert.equal(fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b)).length, 2, 'la richiesta originale e UN ritentativo');
});

test('CTX-HOTFIX-400-NOT-OVERFLOW — un 400 senza le parole del contesto pieno NON fa partire nessun riassunto', async (t) => {
  conTetto(t, undefined);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({
    chiamateTool: 2,
    errorePerRichiesta: (n) => (n === 1 ? new Response(JSON.stringify({ error: { code: 400, message: 'Invalid value for tool_choice' } }), { status: 400 }) : null),
  });
  await assert.rejects(giro(t, { cartella, fornitore }), (e) => e.classificazione === undefined && /HTTP 400/.test(e.message));
  assert.equal(fornitore.riassuntiChiesti().length, 0);
});
