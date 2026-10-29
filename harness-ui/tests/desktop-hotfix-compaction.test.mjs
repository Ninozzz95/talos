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

import { RITENTATIVI_CONTESTO_PIENO_MASSIMI, talosLavora as talosLavoraVero } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
/* Revisione 6 della CLI (S2-2): senza uno scarto misurato la prima richiesta di un giro porta la stima degli schemi degli attrezzi (i fornitori veri li contano). Il fornitore finto di questo file risponde `prompt_tokens` = stima dei soli MESSAGGI: lo scarto che il registro misurerebbe su di lui è 0, e lo si dichiara (`scartoMisurato: 0`) invece di cambiare tutte le soglie. */
const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });
import {
  MARCATORE_INDICE, MARCATORE_RIASSUNTO, MAX_TOKEN_RIASSUNTO, SCHEMA_RECORD_COMPATTAZIONE, VARIABILE_TETTO_TOKEN,
  applicaRecord,
} from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

const CONSEGNA = 'CONSEGNA-ORIGINALE-MARKER: leggi grande.txt più volte e riferisci.';
const PREAMBOLO = 'PREAMBOLO-PROGETTO ' + 'x'.repeat(12_000);
const PIANO = 'Plan mode is on';

function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-hotfix-compaction-'));
  // LEGGI IBRIDA (owner 30/09): stessi 4.000 byte (≈1.000 token per lettura), in righe normali, perché una riga sola
  // oltre 2000 caratteri ora si accorcia apposta e il contesto non crescerebbe come la prova presuppone
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
/* `extraPrompt`: i token che il fornitore conta in più della conversazione (gli schemi degli attrezzi), solo sulle richieste di lavoro */
function fintoFornitore({ chiamateTool = 10, attrezzo = 'leggi', argomenti = '{"percorso":"grande.txt"}', riassunto, errorePerRichiesta, extraPrompt = 0 } = {}) {
  const corpi = [];
  let lavoro = 0;
  let riassunti = 0;
  const fetchDiRete = async (_url, init) => {
    const body = corpoSenzaMarcatori(init.body);
    corpi.push(body);
    const promptTokens = Math.ceil(JSON.stringify(body.messages).length / 4);
    const usage = { prompt_tokens: promptTokens, completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) {
      riassunti += 1;
      /* `riassunto(n)` può dare il messaggio, oppure `{ message, finish_reason }` per un riassunto fermato dal tetto. */
      const dato = riassunto?.(riassunti);
      const scelta = dato?.message ?? dato ?? { role: 'assistant', content: `RIASSUNTO ${riassunti}: ho letto grande.txt più volte.` };
      const fine = dato?.finish_reason ?? (scelta.tool_calls ? 'tool_calls' : 'stop');
      return Response.json({ choices: [{ message: scelta, finish_reason: fine }], usage });
    }
    lavoro += 1;
    usage.prompt_tokens += extraPrompt;
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
    /* 02/10/2026: il budget di Hermes (2.000-10.000) scala col mezzo e sta nel PROMPT (le parole). 21/10/2026 (owner, «sta maledetta
     * compattazione»; revisione S2): sul filo il tetto è quello di opencode — qui finestra e limite del modello sono ignoti ⇒ 32.000. */
    assert.equal(body.max_tokens, 32_000, `max_tokens ${body.max_tokens}`);
    const parole = Number(/at most (\d+) words/u.exec(testoDi(body.messages.at(-1)))?.[1]);
    assert.ok(parole >= Math.floor((2_000 * 1_200) / 2_048) && parole <= Math.floor((10_000 * 1_200) / 2_048), `le parole seguono il budget: ${parole}`);
    assert.ok(!body.messages.some((m) => testoDi(m).startsWith(PIANO)), 'nessun effimero nel riassunto');
  }
  assert.ok(MAX_TOKEN_RIASSUNTO > 0, 'la costante storica resta esportata');
});

test('CTX-HOTFIX-SUMMARY-TRUNCATED-NO-IDENTICAL-RETRY — un riassunto fermato dal tetto NON si richiede UGUALE: una volta, più breve (21/10, Hermes :768)', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({
    chiamateTool: 10,
    riassunto: () => ({ message: { role: 'assistant', content: '## Objective\nparziale, il tetto lo ha fermato a met' }, finish_reason: 'length' }),
  });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const inizi = eventi.filter((e) => e.tipo === 'compattazione-inizio').length;
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine');
  assert.ok(inizi >= 1, 'almeno una compattazione tentata');
  /* un fallimento è «troncato»; una compattazione fatta viene SOLO dal ripiego senza modello (contatore pieno, L1) — mai dal testo troncato */
  assert.ok(fini.every((f) => (f.compattato === false && f.motivo === 'troncato') || (f.compattato === true && f.ripiego === true)), JSON.stringify(fini.map((f) => [f.compattato, f.motivo, f.ripiego])));
  const chiesti = fornitore.riassuntiChiesti();
  assert.ok(chiesti.length <= 2 * inizi, `al più la richiesta e UN ritentativo per compattazione: ${chiesti.length} per ${inizi}`);
  assert.ok(chiesti.length >= 2, 'premessa: il ritentativo più breve c’è stato');
  const paroleDi = (b) => Number(/at most (\d+) words/u.exec(testoDi(b.messages.at(-1)))?.[1]);
  assert.ok(paroleDi(chiesti[1]) < paroleDi(chiesti[0]), `il ritentativo chiede meno parole, mai la stessa richiesta: ${paroleDi(chiesti[0])} → ${paroleDi(chiesti[1])}`);
});

test('CTX-HOTFIX-SUMMARY-BUDGET-SCALES — una conversazione grande riceve più di 2.048 token per il riassunto (sessione b1e7382a)', async (t) => {
  conTetto(t, 80_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 90 });
  const { esito } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const riassunti = fornitore.riassuntiChiesti();
  assert.ok(riassunti.length >= 1, 'la conversazione ha superato la soglia');
  const primo = riassunti[0];
  /* 21/10/2026: il budget che scala si legge nelle PAROLE del prompt; sul filo il tetto di opencode (ignoti ⇒ 32.000) */
  const parole = Number(/at most (\d+) words/u.exec(testoDi(primo.messages.at(-1)))?.[1]);
  assert.ok(parole > Math.floor((2_048 * 1_200) / 2_048), `il riassunto di una conversazione grande ha più dei 2.048 storici: ${parole} parole`);
  assert.ok(parole <= Math.floor((10_000 * 1_200) / 2_048), `mai oltre il tetto di Hermes: ${parole} parole`);
  assert.equal(primo.max_tokens, 32_000);
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
  /* 22/10/2026 notte (verdetto della CLI sulla regola del riassunto, C1): un riassunto vero pesa il suo budget d'uscita (almeno 2.000
     token) e si paga solo se toglie il 10% della soglia al netto di quello. Con 8.000 il preambolo (~3.000), la coda e il riassunto
     atteso non lasciavano il 10%: la scena è a 12.000, con le letture in proporzione. */
  conTetto(t, 12_000);
  const cartella = cartellaDiProva(t);
  /* C1 (09/10/2026): con 7 letture la proiezione dopo la compattazione finiva a meno di 80 token dalla soglia, e la riga di
     recupero (`RIGA_RECUPERO`, ~80 token, voluta) la riportava sopra all'ultima lettura: una seconda compattazione vera, non
     un difetto del record. Con 6 la prova resta quella di prima: UNA compattazione alla soglia, record emesso e rigiocabile. */
  const fornitore = fintoFornitore({ chiamateTool: 10 });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  const inizi = eventi.filter((e) => e.tipo === 'compattazione-inizio');
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato);
  assert.equal(inizi.length, 1, 'una sola compattazione con questo tetto');
  assert.equal(fini.length, 1);
  assert.equal(inizi[0].motivo, 'soglia');
  assert.equal(typeof inizi[0].tokenMisurati, 'number');
  assert.equal(inizi[0].soglia, 12_000);
  const record = fini[0].record;
  assert.equal(record.schema, SCHEMA_RECORD_COMPATTAZIONE);
  assert.equal(record.misura, 'fornitore', 'il numero che ha deciso è quello del fornitore');
  assert.ok(record.tokenPrima >= 12_000 && record.tokenDopo < record.tokenPrima, `${record.tokenPrima} → ${record.tokenDopo}`);
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
  /* 22/10/2026 notte (verdetto della CLI sulla regola del riassunto, C1): un riassunto vero pesa il suo budget d'uscita (almeno 2.000
     token) e si paga solo se toglie il 10% della soglia al netto di quello. Con 8.000 il preambolo (~3.000), la coda e il riassunto
     atteso non lasciavano il 10%: la scena è a 12.000, con le letture in proporzione. */
  conTetto(t, 12_000); // soglia 12.000, emergenza 14.400 (tetto × 1,2 senza finestra)
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({
    chiamateTool: 12,
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
  /* F1 della revisione 9 della CLI (23/10/2026): il conto `compattazioni` dice le righe dei RIASSUNTI — la «sola coda» (passi gratuiti)
     ha la sua riga, `soloCoda:true`, ma non è una compattazione; e la sua riga dice cosa ha accorciato */
  const righe = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true);
  assert.ok(righe.some((e) => e.soloCoda), `premessa: qui c'è una sola coda (${JSON.stringify(righe.map((e) => [e.soloCoda ?? false, e.ridotti ?? 0]))})`);
  assert.equal(esito.compattazioni, righe.filter((e) => !e.soloCoda).length, JSON.stringify(righe.map((e) => [e.soloCoda ?? false, e.ridotti ?? 0, e.accorciati ?? 0])));
  for (const r of righe.filter((e) => e.soloCoda)) assert.ok((r.ridotti ?? 0) + (r.accorciati ?? 0) + (r.immagini ?? 0) > 0, `una riga «sola coda» dice cosa ha accorciato (${JSON.stringify(r)})`);
});

test('CTX-HOTFIX-R8-VERDETTO-SCARTO — il verdetto «inefficace» confronta il numero del fornitore con la SOLA proiezione: con ~4.000 token di schemi che tengono la richiesta sopra il tetto, le compattazioni si fermano come davanti a un pavimento vero; AL CONTRARIO senza schemi la stessa scena compatta e scende sotto il tetto', async (t) => {
  /* Revisione 8 della CLI (N3): `tokenDopo` ora porta lo scarto; il verdetto deve rifare la stima della proiezione, o lo scarto «vero»
     (numero del fornitore meno la proiezione) diventa ~0 e il pavimento vero non arriva mai alla soglia: una compattazione per richiesta */
  const corsa = async (extraPrompt) => {
    conTetto(t, 8_000);
    const cartella = cartellaDiProva(t);
    const fornitore = fintoFornitore({ chiamateTool: 12, extraPrompt });
    const { esito, eventi } = await giro(t, { cartella, fornitore, scartoMisurato: extraPrompt });
    assert.equal(esito.comeFinita, 'concluso');
    const lavoro = fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b));
    return { inizi: eventi.filter((e) => e.tipo === 'compattazione-inizio').length, riassunti: fornitore.riassuntiChiesti().length, lavoro: lavoro.length };
  };
  const conSchemi = await corsa(4_000);
  assert.ok(conSchemi.inizi <= 3, `al più tre compattazioni, non una per richiesta (${JSON.stringify(conSchemi)})`);
  const senza = await corsa(0);
  assert.ok(senza.inizi >= 1, `AL CONTRARIO: senza schemi la scena compatta (${JSON.stringify(senza)})`);
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

/* Pezzo C (§4.1 del rapporto della CLI, owner 22/10 «Tutto nella 0.6.13»): prima UN ritentativo per giro e il secondo rifiuto faceva
   fallire il giro (K8). Ora il secondo rifiuto passa allo scalino dopo, senza un riassunto pagato nuovo, e il giro finisce. Il fornitore
   qui dice i numeri con le parti (OpenRouter): il bersaglio esce da loro, e l'uscita (64.000) non si conta come prompt. */
test('CTX-HOTFIX-OVERFLOW-SCALINI — contesto pieno due volte nel giro: il secondo rifiuto va allo scalino dopo, nessun riassunto pagato in più, il giro finisce', async (t) => {
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
  assert.equal(errore, null, `il giro finisce: ${errore?.message ?? ''} ${JSON.stringify(errore?.contestoPieno ?? null)}`);
  assert.ok(esito, 'il giro finisce');
  assert.ok(fornitore.riassuntiChiesti().length <= 1, `al più un riassunto pagato nel giro (${fornitore.riassuntiChiesti().length})`);
  const inizi = eventi.filter((e) => e.tipo === 'compattazione-inizio');
  assert.deepEqual(inizi.map((e) => e.motivo), ['overflow', 'overflow'], 'una compattazione per ciascuno dei due rifiuti');
  const lavoro = fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b));
  const peso = (b) => JSON.stringify(b.messages).length;
  assert.ok(peso(lavoro[1]) < peso(lavoro[0]), `il primo ritentativo è più leggero della richiesta rifiutata (${peso(lavoro[0])} → ${peso(lavoro[1])})`);
  assert.ok(peso(lavoro[4]) < peso(lavoro[3]), `il secondo ritentativo è più leggero della sua richiesta rifiutata (${peso(lavoro[3])} → ${peso(lavoro[4])})`);
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

/* Pezzo C: prima un ritentativo e basta; ora al più tre scalini per giro (70/50/35%), un riassunto pagato al più, ogni ritentativo più
   leggero del precedente, mai la stessa richiesta due volte — poi l'errore passa classificato, con la diagnosi. */
test('CTX-HOTFIX-OVERFLOW-TWICE-IN-A-ROW — se il fornitore rifiuta sempre: al più tre ritentativi sempre più leggeri, un riassunto pagato al più, poi l errore classificato con la diagnosi', async (t) => {
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
  }), (e) => e.classificazione === 'contesto-pieno' && /HTTP 400/.test(e.message) && Number.isFinite(e.contestoPieno?.bersaglio));
  assert.ok(fornitore.riassuntiChiesti().length <= 1, `al più un riassunto pagato (${fornitore.riassuntiChiesti().length})`);
  const lavoro = fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b));
  assert.ok(lavoro.length >= 2 && lavoro.length <= 1 + RITENTATIVI_CONTESTO_PIENO_MASSIMI, `la richiesta e da uno a tre ritentativi (${lavoro.length})`);
  const pesi = lavoro.map((b) => JSON.stringify(b.messages).length);
  for (let i = 1; i < pesi.length; i += 1) assert.ok(pesi[i] < pesi[i - 1], `ogni ritentativo è più leggero del precedente (${pesi.join(' → ')})`);
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

/*
 * ⛔⛔ Owner 12/10/2026, «errori di compattazione non devono bloccare il flusso chat… è una regressione grave». Dal vivo (trascritto
 *   dell'owner, sessione 33f2c3fc) `CTX_HISTORY_DIVERGED` usciva da `prepare` del motore del contesto e fermava OGNI giro dal
 *   settimo, anche un «ciao». Ora: se il motore fallisce la richiesta parte dalla compattazione semplice, e la chat lo dice UNA
 *   volta con una riga che non ferma niente (`compattazione-fine`, `compattato:false`, `motivo:'ripiego'`). Uno Stop resta uno Stop.
 */
const divergenza = () => Object.assign(new Error('The active history differs from the archive. The originals are kept; the full version must be recovered.'), { code: 'CTX_HISTORY_DIVERGED' });
/* R-05: chi fallisce può dire DOVE la storia non combaciava (posizioni e ruolo); la riga lo porta, e senza non lo inventa. */
const DOVE = Object.freeze({ archiviati: 12, attivi: 14, primoDiverso: 7, forma: 'riscritta', ruolo: 'assistant' });

test('CTX-HOTFIX-FAIL-OPEN-01 — il motore del contesto che fallisce NON ferma il giro: si va avanti, e lo si dice una volta', async (t) => {
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 3, attrezzo: 'elenca', argomenti: '{"percorso":"."}' });
  let chiamate = 0;
  const contextHooks = { async prepare() { chiamate += 1; throw Object.assign(divergenza(), { dettaglio: DOVE }); } };
  const { esito, eventi } = await giro(t, { cartella, fornitore, contextHooks });
  assert.equal(esito.comeFinita, 'concluso', 'il giro arriva in fondo nonostante il motore');
  assert.equal(chiamate, 4, 'a ogni richiesta si riprova il motore (se torna sano, si riusa)');
  assert.equal(fornitore.corpi.filter((b) => !eRichiestaDiRiassunto(b)).length, 4, 'tutte le richieste partono');
  const righe = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego');
  assert.equal(righe.length, 1, 'la riga non bloccante, una volta sola per turno');
  assert.equal(righe[0].compattato, false);
  assert.equal(righe[0].codice, 'CTX_HISTORY_DIVERGED');
  assert.deepEqual(righe[0].dettaglio, DOVE, 'R-05: la riga dice dove la storia non combaciava');
  assert.ok(fornitore.corpi[0].messages.some((m) => testoDi(m).includes('CONSEGNA-ORIGINALE-MARKER')), 'la storia parte intera');
});

test('CTX-HOTFIX-FAIL-OPEN-02 — AL CONTRARIO: col motore sano nessuna riga di ripiego, e uno Stop durante il motore resta uno Stop', async (t) => {
  const cartella = cartellaDiProva(t);
  const sano = fintoFornitore({ chiamateTool: 1, attrezzo: 'elenca', argomenti: '{"percorso":"."}' });
  const { esito, eventi } = await giro(t, { cartella, fornitore: sano, contextHooks: { async prepare(p) { return { messages: p.messages }; } } });
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(eventi.filter((e) => e.motivo === 'ripiego').length, 0);
  const stop = new AbortController();
  const fermato = fintoFornitore({ chiamateTool: 1 });
  const contextHooks = { async prepare() { stop.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } };
  let errore = null; let finito = null;
  try { finito = await giro(t, { cartella, fornitore: fermato, contextHooks, segnaleStop: stop.signal }); } catch (e) { errore = e; }
  assert.equal(fermato.corpi.length, 0, 'dopo uno Stop non parte nessuna richiesta');
  assert.equal((finito?.eventi ?? []).filter((e) => e.motivo === 'ripiego').length, 0, 'uno Stop non è un ripiego');
  assert.ok(errore || finito?.esito?.comeFinita !== 'concluso', 'il giro si ferma come prima');
});

/* 12/10/2026, decisione dell'owner («Si ripara da solo»): il motore ha messo da parte i vecchi originali ed è ripartito dalla
   storia attiva. Il giro NON è in ripiego (il motore ha lavorato), e la chat lo dice con la sua riga, senza l'id di servizio. */
test('CTX-HOTFIX-RIALLINEATO-01 — archivio riallineato dal motore: una riga col «dove», nessun ripiego; e al contrario senza riallineo nessuna riga', async (t) => {
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ chiamateTool: 2, attrezzo: 'elenca', argomenti: '{"percorso":"."}' });
  let chiamate = 0;
  const contextHooks = { async prepare(p) { chiamate += 1; return { messages: p.messages, ...(chiamate === 1 ? { riallineato: { asideId: 'chat.aside-1', ...DOVE } } : {}) }; } };
  const { esito, eventi } = await giro(t, { cartella, fornitore, contextHooks });
  assert.equal(esito.comeFinita, 'concluso');
  const righe = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'archivio-riallineato');
  assert.equal(righe.length, 1, 'una riga, alla richiesta in cui è successo');
  assert.equal(righe[0].compattato, false);
  assert.equal(righe[0].codice, 'CTX_HISTORY_DIVERGED');
  assert.deepEqual(righe[0].dettaglio, DOVE, 'posizioni e ruolo; l id di servizio non esce');
  assert.equal(eventi.filter((e) => e.motivo === 'ripiego').length, 0, 'il motore ha lavorato: non è un ripiego');
  const sano = fintoFornitore({ chiamateTool: 1, attrezzo: 'elenca', argomenti: '{"percorso":"."}' });
  const altro = await giro(t, { cartella, fornitore: sano, contextHooks: { async prepare(p) { return { messages: p.messages }; } } });
  assert.equal(altro.eventi.filter((e) => e.motivo === 'archivio-riallineato').length, 0);
});

test('CTX-HOTFIX-FAIL-OPEN-03 — in ripiego anche il contesto troppo grande si riprende: compattazione e UN ritentativo', async (t) => {
  conTetto(t, undefined);
  const cartella = cartellaDiProva(t);
  const overflow = () => new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 131072 tokens. However, you requested about 135349 tokens." } }), { status: 400, headers: { 'content-type': 'application/json' } });
  const storia = [];
  for (let i = 1; i <= 4; i += 1) {
    storia.push({ role: 'assistant', content: '', tool_calls: [{ id: `old_${i}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] });
    storia.push({ role: 'tool', tool_call_id: `old_${i}`, content: 'g'.repeat(4_000) });
  }
  storia.push({ role: 'assistant', content: 'Letto quattro volte.' });
  const fornitore = fintoFornitore({ chiamateTool: 0, errorePerRichiesta: (n) => (n === 1 ? overflow() : null) });
  const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete: fornitore.fetchDiRete, comandoProva: 'node -e 0',
    messaggiIniziali: [{ role: 'system', content: 'You are a coding agent.' }, { role: 'system', content: PREAMBOLO }, { role: 'user', content: CONSEGNA }, ...storia, { role: 'user', content: 'ancora' }],
    onGiro: (e) => eventi.push(e), contextHooks: { async prepare() { throw divergenza(); } },
  });
  assert.equal(esito.comeFinita, 'concluso', 'il giro arriva in fondo: il contesto pieno si è ripreso anche in ripiego');
  assert.equal(fornitore.riassuntiChiesti().length, 1, 'un riassunto forzato, come a motore spento');
  assert.deepEqual(eventi.filter((e) => e.tipo === 'compattazione-inizio').map((e) => e.motivo), ['overflow']);
});

test('CTX-HOTFIX-FAIL-OPEN-04 — in ripiego una storia sopra soglia si compatta DAVVERO, come a motore spento (controllo positivo prima)', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const storia = [{ role: 'system', content: 'You are a coding agent.' }, { role: 'user', content: CONSEGNA }];
  for (let i = 1; i <= 14; i += 1) {
    storia.push({ role: 'assistant', content: '', tool_calls: [{ id: `old_${i}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] });
    storia.push({ role: 'tool', tool_call_id: `old_${i}`, content: 'g'.repeat(4_000) });
  }
  storia.push({ role: 'assistant', content: 'Letto quattordici volte.' }, { role: 'user', content: 'ancora' });
  const giroCon = async (contextHooks) => {
    const fornitore = fintoFornitore({ chiamateTool: 1 });
    const { esito, eventi } = await giro(t, { cartella, fornitore, messaggiIniziali: storia, ...(contextHooks ? { contextHooks } : {}) });
    return { esito, eventi, riassunti: fornitore.riassuntiChiesti().length };
  };
  const spento = await giroCon(null);
  assert.ok(spento.riassunti >= 1, 'CONTROLLO: a motore spento questa storia supera la soglia e si riassume');
  const ripiego = await giroCon({ async prepare() { throw divergenza(); } });
  assert.equal(ripiego.esito.comeFinita, 'concluso');
  assert.ok(ripiego.riassunti >= 1, 'in ripiego si riassume come a motore spento');
  assert.ok(ripiego.eventi.some((e) => e.tipo === 'compattazione-fine' && e.compattato === true), 'una compattazione vera, non solo la riga');
  assert.equal(ripiego.eventi.filter((e) => e.motivo === 'ripiego').length, 1);
});
