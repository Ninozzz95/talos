/*
 * 23/10/2026 — §4 della CLI, pezzo C (owner 22/10/2026, «Tutto nella 0.6.13»; rapporto `research-overflow-0613/REPORT.md` §4.1).
 * Sul rifiuto del fornitore («contesto pieno») decide un BERSAGLIO: dai numeri del fornitore quando li scrive, altrimenti 70/50/35%
 *   della prima richiesta rifiutata. Prima i passi gratuiti; un riassunto si paga solo se può arrivarci, al primo scalino e una volta
 *   per giro; altrimenti il riassunto senza modello; al più tre ritentativi; mai la stessa richiesta due volte; mai un riassunto cresciuto.
 * Ogni regola si prova nei due versi. Fornitore finto via `fetchDiRete`: `prompt_tokens` = stima dei messaggi, e `scartoMisurato: 0`
 *   (lo scarto è zero), così il numero che il fornitore finto scrive nell'errore è nella stessa scala della stima.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora as talosLavoraVero } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { CODICE_RICHIESTA_TROPPO_GRANDE } from '../src/kernel/richiesta-troppo-grande.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });

/* ------------------------------------------------------------------ le funzioni pure */

test('C-NUMERI-01 — i numeri del rifiuto si leggono nelle forme dei fornitori, e solo se plausibili', () => {
  const n = (message, extra = {}) => compattazione.numeriDelContestoPieno({ message, ...extra });
  assert.deepEqual(n('HTTP 400: prompt is too long: 213462 tokens > 200000 maximum'), { richiesti: 213462, massimo: 200000, uscita: null });
  assert.deepEqual(n("This endpoint's maximum context length is 131072 tokens. However, you requested about 135349 tokens (60662 of text input, 10687 of tool input, 64000 in the output)."),
    { richiesti: 71349, massimo: 131072, uscita: 64000 }, 'OpenRouter con le parti: prompt = testo + attrezzi, l\'uscita a parte');
  assert.deepEqual(n("This model's maximum context length is 8192 tokens. However, you requested 10000 tokens (9000 in the messages, 1000 in the completion)."),
    { richiesti: 9000, massimo: 8192, uscita: 1000 });
  assert.deepEqual(n("This model's maximum context length is 131072 tokens. However, you requested about 140000 tokens."), { richiesti: 140000, massimo: 131072, uscita: null });
  assert.deepEqual(n("Input length (265330) exceeds model's maximum context length (262144)."), { richiesti: 265330, massimo: 262144, uscita: null });
  assert.deepEqual(n('The input token count (1196265) exceeds the maximum number of tokens allowed (1048575)'), { richiesti: 1196265, massimo: 1048575, uscita: null });
  assert.deepEqual(n("This model's maximum prompt length is 131072 but the request contains 537812 tokens"), { richiesti: 537812, massimo: 131072, uscita: null });
  assert.deepEqual(n('Your request exceeded model token limit: 262144 (requested: 300000)'), { richiesti: 300000, massimo: 262144, uscita: null });
  assert.deepEqual(n('Prompt has 17432 tokens, but the configured context size is 16384 tokens'), { richiesti: 17432, massimo: 16384, uscita: null });
  assert.deepEqual(n('HTTP 400: {"error":{"code":400,"message":"the request exceeds the available context size, try increasing it","type":"exceed_context_size_error","n_prompt_tokens":17432,"n_ctx":16384}}'),
    { richiesti: 17432, massimo: 16384, uscita: null }, 'llama-server: i campi del corpo');
  assert.deepEqual(n('La conversazione non entra', { promptToken: 17230, finestraToken: 16384 }), { richiesti: 17230, massimo: 16384, uscita: null }, 'il motore locale porta i numeri nei campi');
  // al contrario
  assert.equal(n("This model's maximum context length is 8192 tokens (context_length_exceeded)"), null, 'solo il massimo: niente numeri da cui scalare');
  assert.equal(n('prompt is too long: 2000 tokens > 900 maximum'), null, 'una finestra sotto 1.024 non è plausibile (Hermes)');
  assert.equal(n('Invalid value for tool_choice'), null);
  assert.equal(compattazione.numeriDelContestoPieno(null), null);
});

test('C-BERSAGLIO-01 — il bersaglio: dai numeri (con la riserva d\'uscita), altrimenti 70%; poi 50% e 35% della prima richiesta rifiutata; mai sopra il 95%', () => {
  const b = compattazione.bersaglioDelContestoPieno;
  // coi numeri, k = stima / conto vero si porta dietro: stima 5.000 contro 10.000 contati, massimo 8.000 ⇒ 5.000 × 7.200 / 10.000
  assert.equal(b({ livello: 0, stimaInviata: 5_000, numeri: { richiesti: 10_000, massimo: 8_000, uscita: null } }), 3_600);
  assert.equal(b({ livello: 0, stimaInviata: 5_000, numeri: { richiesti: 10_000, massimo: 8_000, uscita: 2_000 } }), 3_000, 'la riserva è l\'uscita detta dal fornitore');
  assert.equal(b({ livello: 0, stimaInviata: 10_000 }), 7_000, 'senza numeri, il 70%');
  assert.equal(b({ livello: 1, stimaInviata: 7_000, stimaPrimoRifiuto: 10_000 }), 5_000, 'secondo scalino: il 50% della PRIMA');
  assert.equal(b({ livello: 2, stimaInviata: 5_000, stimaPrimoRifiuto: 10_000 }), 3_500, 'terzo: il 35%');
  assert.equal(b({ livello: 1, stimaInviata: 7_000, stimaPrimoRifiuto: 10_000, numeri: { richiesti: 14_000, massimo: 8_000, uscita: null } }), 3_600,
    'dopo il primo, il più piccolo fra lo scalino e i numeri');
  assert.equal(b({ livello: 0, stimaInviata: 10_000, numeri: { richiesti: 9_000, massimo: 131_072, uscita: null } }), 9_500, 'mai sopra il 95% del rifiutato');
  assert.equal(b({ livello: 0, stimaInviata: 0 }), null);
});

test('C-IMMAGINI-01 — le immagini VECCHIE diventano un segnaposto, quelle dell\'ultima richiesta restano', () => {
  const img = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } };
  const messaggi = [
    { role: 'user', content: [{ type: 'text', text: 'guarda questa' }, img] }, { role: 'assistant', content: 'vista' },
    { role: 'user', content: [{ type: 'text', text: 'e questa' }, img] },
  ];
  const { messaggi: dopo, sostituite } = compattazione.immaginiVecchieInSegnaposto(messaggi);
  assert.equal(sostituite, 1);
  assert.ok(dopo[0].content.some((p) => p.type === 'text' && p.text === compattazione.SEGNAPOSTO_IMMAGINE_VECCHIA));
  assert.ok(!dopo[0].content.some((p) => p.type === 'image_url'));
  assert.ok(dopo[2].content.some((p) => p.type === 'image_url'), 'l\'ultima richiesta tiene la sua immagine');
  assert.equal(messaggi[0].content[1].type, 'image_url', 'la storia non cambia');
  // al contrario: senza immagini vecchie, la stessa lista
  const senza = compattazione.immaginiVecchieInSegnaposto(messaggi.slice(2));
  assert.equal(senza.sostituite, 0);
  assert.equal(senza.messaggi[0], messaggi[2]);
});

/* ------------------------------------------------------------------ il giro, col fornitore finto */

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const rifiuto = (message) => new Response(JSON.stringify({ error: { message } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
/* Il rifiuto coi numeri nella forma di Anthropic: `richiesti` = la stima di ciò che è arrivato, `massimo` scelto dalla prova ⇒ bersaglio = 0,9 × massimo */
const rifiutoConNumeri = (corpo, massimo) => rifiuto(`prompt is too long: ${stima(corpo.messages)} tokens > ${massimo} maximum`);

function fornitore({ rifiuta, riassunto = '## Riassunto\nIn breve: si parlava di parole.', chiamateTool = 0, attrezzo = 'leggi', argomenti = '{"percorso":"grande.txt"}' }) {
  const conti = { riassunti: 0, corpi: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: riassunto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.corpi.push(corpo);
    const n = conti.corpi.length;
    const r = rifiuta?.(n, corpo);
    if (r) return r;
    if (n <= chiamateTool) {
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: attrezzo, arguments: argomenti } }] }, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  return { fetchDiRete, conti };
}

async function giro(t, { messaggiIniziali, rete, ...resto }) {
  const cartella = cartellaDiProva('talos-c-bersaglio-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  let esito = null;
  let errore = null;
  try {
    esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(e); }, ...resto });
  } catch (e) { errore = e; }
  return { esito, errore, eventi, cartella };
}

const conEsitoGrande = (pairs, righe = 600) => [
  ...storia(pairs),
  { role: 'user', content: 'Leggi il file grande.' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'g1', type: 'function', function: { name: 'read_file', arguments: '{"path":"grande.txt"}' } }] },
  { role: 'tool', tool_call_id: 'g1', content: 'contenuto del file grande, riga dopo riga. '.repeat(righe) },
  { role: 'assistant', content: 'Letto.' },
  { role: 'user', content: 'Ora rispondi OK.' },
];

test('C-GRATIS-01 — i passi gratuiti bastano per il bersaglio: si riparte senza pagare niente', async (t) => {
  const messaggi = conEsitoGrande(3);
  const prima = stima(messaggi);
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.floor(prima * 0.6)) : null) });
  const { esito, errore, eventi } = await giro(t, { messaggiIniziali: messaggi, rete });
  assert.equal(errore, null, `il giro finisce (${errore?.message})`);
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(rete.conti.riassunti, 0, 'nessun riassunto pagato');
  assert.equal(rete.conti.corpi.length, 2, 'la richiesta e UN ritentativo');
  const [rifiutata, ritentata] = rete.conti.corpi.map((c) => stima(c.messages));
  assert.ok(ritentata <= Math.floor(prima * 0.6 * 0.9) + 1, `il ritentativo sta nel bersaglio (${rifiutata} → ${ritentata}, bersaglio ≈ ${Math.floor(prima * 0.54)})`);
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.soloCoda === true), JSON.stringify(eventi.map((e) => [e.tipo, e.motivo, e.compattato])));
});

test('C-GRATIS-02 — AL CONTRARIO: i passi gratuiti non bastano e il riassunto può arrivarci: se ne paga UNO, e il ritentativo lo porta', async (t) => {
  const messaggi = [...storia(40), { role: 'user', content: 'Continua.' }];
  const prima = stima(messaggi);
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.floor(prima * 0.6)) : null) });
  const { esito, errore } = await giro(t, { messaggiIniziali: messaggi, rete });
  assert.equal(errore, null, `il giro finisce (${errore?.message})`);
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(rete.conti.riassunti, 1, 'un riassunto pagato');
  assert.ok(JSON.stringify(rete.conti.corpi[1].messages).includes(compattazione.MARCATORE_RIASSUNTO), 'il ritentativo porta il riassunto');
  assert.ok(stima(rete.conti.corpi[1].messages) < stima(rete.conti.corpi[0].messages));
});

test('C-NON-BASTA-01 — il miglior riassunto non arriva al bersaglio: NON si paga, si riparte col riassunto senza modello (ragione «bersaglio»)', async (t) => {
  const messaggi = [...storia(40), { role: 'user', content: 'Continua.' }];
  const prima = stima(messaggi);
  // un bersaglio a cui nessun riassunto arriva (pavimento + riassunto atteso sopra), ma l'indice senza modello sì o quasi
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.max(1_024, Math.floor(prima * 0.12))) : null) });
  const { errore, eventi } = await giro(t, { messaggiIniziali: messaggi, rete });
  assert.equal(rete.conti.riassunti, 0, `nessun riassunto pagato (${errore?.message ?? 'concluso'})`);
  const fine = eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true);
  assert.ok(fine?.ripiego === true && fine.ragione === 'bersaglio', JSON.stringify(eventi.map((e) => [e.tipo, e.motivo, e.compattato, e.ragione])));
  assert.ok(rete.conti.corpi.length >= 2 && stima(rete.conti.corpi[1].messages) < stima(rete.conti.corpi[0].messages), 'il ritentativo è più leggero');
});

test('C-SCARTO-01 — la parte che la compattazione non tocca (gli schemi, nello scarto) si toglie dal bersaglio: senza, la conversazione sembrerebbe già dentro', async (t) => {
  const SCARTO = 2_000;
  const messaggi = [...storia(40), { role: 'user', content: 'Continua.' }];
  const prima = stima(messaggi);
  // il fornitore conta anche gli schemi (lo scarto); il suo massimo lascia entrare la conversazione da sola, ma non con gli schemi
  const massimo = Math.floor((prima + 1_200) / 0.9);
  const bersaglio = Math.floor(0.9 * massimo);
  assert.ok(prima <= bersaglio && prima + SCARTO > bersaglio, `premessa: ${prima} entra da sola in ${bersaglio}, con gli schemi no`);
  const conti = { riassunti: 0, corpi: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.corpi.push(corpo);
    if (conti.corpi.length === 1) return rifiuto(`prompt is too long: ${stima(corpo.messages) + SCARTO} tokens > ${massimo} maximum`);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages) + SCARTO, completion_tokens: 1 } });
  };
  const { esito, errore } = await giro(t, { messaggiIniziali: messaggi, rete: { fetchDiRete }, scartoMisurato: SCARTO });
  assert.equal(errore, null, `${errore?.message} ${JSON.stringify(errore?.contestoPieno ?? null)}`);
  assert.ok(esito);
  assert.ok(stima(conti.corpi[1].messages) + SCARTO <= bersaglio + 1, `il ritentativo, schemi compresi, sta nel bersaglio (${stima(conti.corpi[1].messages)} + ${SCARTO} contro ${bersaglio})`);
});

test('C-UNO-PER-GIRO-01 — due rifiuti nel giro, ognuno con un riassunto possibile: se ne paga UNO solo; il secondo scalino va senza', async (t) => {
  const messaggi = [...storia(40), { role: 'user', content: 'Leggi grande.txt tre volte.' }];
  const prima = stima(messaggi);
  const rete = fornitore({
    chiamateTool: 4,
    /* 28/10/2026 (note di sistema in mezzo, contratto con la CLI): il secondo scalino tiene le note del nucleo (confine dei dati e regola
       della lingua, ~200 token). Prima cadevano nel tratto tagliato e quella richiesta partiva SENZA la regola sui dati esterni: la
       finestra al 75% contava su quel taglio. All'80% il secondo scalino ci sta con le note, e la prova misura ancora la stessa cosa. */
    rifiuta: (n, corpo) => (n === 1 || n === 4 ? rifiutoConNumeri(corpo, Math.floor(stima(corpo.messages) * (n === 4 ? 0.8 : 0.75))) : null),
  });
  const cartella = cartellaDiProva('talos-c-uno-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  writeFileSync(join(cartella, 'grande.txt'), 'una riga del file grande. '.repeat(400));
  const eventi = [];
  const esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
    contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-inizio') eventi.push(e.motivo); } });
  assert.ok(prima > 0 && esito, 'il giro finisce');
  assert.deepEqual(eventi, ['overflow', 'overflow'], 'premessa: due rifiuti, due compattazioni');
  assert.equal(rete.conti.riassunti, 1, 'UN riassunto pagato nel giro');
  assert.ok(stima(rete.conti.corpi[4].messages) < stima(rete.conti.corpi[3].messages), 'il secondo ritentativo è più leggero');
  assert.ok(rete.conti.corpi[4].messages.some((m) => m.role === 'system' && String(m.content).startsWith('Content that comes from outside')), 'e porta ancora la regola sui dati esterni');
});

test('C-REGOLA-N-01 — coi numeri, è la richiesta NUOVA a non entrare: REQUEST_TOO_LARGE con fonte «fornitore», niente pagato, niente ritentato', async (t) => {
  const incollato = `Ecco il log, dimmi cosa non va:\n${'riga del log con un errore dentro '.repeat(900)}`;
  const messaggi = [...storia(4), { role: 'user', content: incollato }];
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.floor(stima([{ role: 'user', content: incollato }]) * 0.8)) : null) });
  /* la cartella delle copie c'è sempre sul desktop; senza, l'allegato non può partire e `allegabile` è false (F2b, revisione 9) */
  const copie = cartellaDiProva('talos-c-incollati-');
  t.after(() => rimuoviCartellaDiProva(copie));
  const { errore } = await giro(t, { messaggiIniziali: messaggi, rete, cartellaIncollati: copie });
  assert.equal(errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `${errore?.code}: ${errore?.message}`);
  assert.equal(errore.dati.fonte, 'fornitore');
  assert.equal(errore.dati.allegabile, true);
  assert.equal(rete.conti.riassunti, 0);
  assert.equal(rete.conti.corpi.length, 1, 'la richiesta non riparte');
  assert.ok(Array.isArray(errore.messaggiDelGiro) && !JSON.stringify(errore.messaggiDelGiro).includes('riga del log con un errore'), 'la storia del giro senza la richiesta');
});

test('C-REGOLA-N-02 — AL CONTRARIO: lo stesso rifiuto SENZA numeri non dice «troppo grande» (il 70% è una stima, non la finestra)', async (t) => {
  const incollato = `Ecco il log, dimmi cosa non va:\n${'riga del log con un errore dentro '.repeat(900)}`;
  const messaggi = [...storia(4), { role: 'user', content: incollato }];
  const rete = fornitore({ rifiuta: (n) => (n === 1 ? rifiuto("This model's maximum context length is 8192 tokens (context_length_exceeded)") : null) });
  const { errore } = await giro(t, { messaggiIniziali: messaggi, rete });
  assert.notEqual(errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `${errore?.code}: ${errore?.message}`);
});

test('C-REGOLA-N-03 — coi numeri e «Invia come allegato»: la richiesta riparte come allegato (inizio, fine e il file) e il giro finisce', async (t) => {
  const incollato = `Ecco il log, dimmi cosa non va:\n${'riga del log con un errore dentro '.repeat(900)}`;
  const messaggi = [...storia(4), { role: 'user', content: incollato }];
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.floor(stima([{ role: 'user', content: incollato }]) * 0.8)) : null) });
  const copie = cartellaDiProva('talos-c-incollati-');
  t.after(() => rimuoviCartellaDiProva(copie));
  const { esito, errore } = await giro(t, { messaggiIniziali: messaggi, rete, allegaSeTroppoGrande: true, cartellaIncollati: copie });
  assert.equal(errore, null, `${errore?.code}: ${errore?.message}`);
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(rete.conti.riassunti, 0);
  const ritentata = JSON.stringify(rete.conti.corpi[1].messages);
  assert.ok(ritentata.includes('incollati') || ritentata.includes('.txt'), 'il ritentativo porta il puntatore al file');
  assert.ok(stima(rete.conti.corpi[1].messages) < stima(rete.conti.corpi[0].messages), 'e pesa meno');
});

test('C-CORNICE-01 — coi numeri, la cornice da sola supera il bersaglio: «non entra» una volta, niente pagato, niente ritentato', async (t) => {
  const messaggi = [{ role: 'system', content: `Regole del progetto: ${'regola importante '.repeat(1200)}` }, ...storia(4), { role: 'user', content: 'ciao' }];
  const rete = fornitore({ rifiuta: (n) => (n === 1 ? rifiuto('prompt is too long: 9000 tokens > 2048 maximum') : null) });
  const { errore, eventi } = await giro(t, { messaggiIniziali: messaggi, rete });
  assert.ok(errore, 'il giro fallisce');
  assert.equal(errore.classificazione, 'contesto-pieno');
  assert.equal(rete.conti.riassunti, 0);
  assert.equal(rete.conti.corpi.length, 1);
  assert.equal(eventi.filter((e) => e.motivo === 'non-entra').length, 1, JSON.stringify(eventi.map((e) => [e.tipo, e.motivo])));
});

test('C-IMMAGINI-02 — sul rifiuto le immagini vecchie diventano un segnaposto nel ritentativo, quella della richiesta nuova resta', async (t) => {
  const img = (n) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(64)}${n}` } });
  const messaggi = [
    ...storia(2),
    { role: 'user', content: [{ type: 'text', text: 'guarda la prima' }, img(1)] }, { role: 'assistant', content: 'vista la prima' },
    { role: 'user', content: [{ type: 'text', text: 'guarda la seconda' }, img(2)] }, { role: 'assistant', content: 'vista la seconda' },
    { role: 'user', content: [{ type: 'text', text: 'e questa?' }, img(3)] },
  ];
  const rete = fornitore({ rifiuta: (n) => (n === 1 ? rifiuto("This model's maximum context length is 8192 tokens (context_length_exceeded)") : null) });
  const { esito, errore, eventi } = await giro(t, { messaggiIniziali: messaggi, rete });
  assert.equal(errore, null, errore?.message);
  assert.ok(esito);
  const conta = (corpo) => corpo.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((p) => p.type === 'image_url').length;
  assert.equal(conta(rete.conti.corpi[0]), 3, 'premessa: la richiesta rifiutata porta tre immagini');
  assert.equal(conta(rete.conti.corpi[1]), 1, 'il ritentativo porta solo quella della richiesta nuova');
  assert.ok(JSON.stringify(rete.conti.corpi[1].messages).includes(compattazione.SEGNAPOSTO_IMMAGINE_VECCHIA));
  /* F1 della revisione 9: la riga senza riassunto dice quante immagini ha messo da parte, e non conta come compattazione */
  const riga = eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true);
  assert.equal(rete.conti.riassunti, 0, 'premessa: niente pagato');
  assert.deepEqual([riga?.soloCoda, riga?.immagini], [true, 2], JSON.stringify(riga));
  assert.equal(esito.compattazioni, 0);
});

/* ------------------------------------------------------------------ le prove nate dai mutanti sopravvissuti (23/10) */

test('C-UNO-PER-GIRO-02 — al secondo rifiuto un riassunto sarebbe alla portata, ma lo scalino non lo ammette: si ripiega senza modello', async (t) => {
  const cartella = cartellaDiProva('talos-c-uno2-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  writeFileSync(join(cartella, 'grande.txt'), 'una riga del file grande. '.repeat(150));
  const messaggi = [...storia(40), { role: 'user', content: 'Leggi grande.txt sette volte.' }];
  const rete = fornitore({
    chiamateTool: 8,
    rifiuta: (n, corpo) => (n === 1 || n === 9 ? rifiutoConNumeri(corpo, Math.floor(stima(corpo.messages) * 0.75)) : null),
  });
  const fini = [];
  const esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
    contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine' && e.compattato) fini.push({ ripiego: e.ripiego === true, ragione: e.ragione ?? null }); } });
  assert.ok(esito, 'il giro finisce');
  assert.equal(fini.length, 2, `premessa: due compattazioni (${JSON.stringify(fini)})`);
  assert.equal(rete.conti.riassunti, 1, `UN riassunto pagato nel giro (${rete.conti.riassunti})`);
  assert.deepEqual(fini[1], { ripiego: true, ragione: 'bersaglio' }, 'il secondo scalino ripiega senza modello');
});

/* Il tetto è per GIRO, non per richiesta: un giro lungo d'attrezzi che il fornitore rifiuta in quattro punti diversi. I primi tre
   ritentativi passano; al quarto rifiuto il giro finisce con «esauriti» invece di ritentare ancora. */
test('C-TETTO-01 — quattro rifiuti nello stesso giro: tre ritentativi, al quarto il giro finisce con «esauriti»', async (t) => {
  const cartella = cartellaDiProva('talos-c-tetto-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  writeFileSync(join(cartella, 'grande.txt'), 'una riga del file grande. '.repeat(300));
  const rifiutate = new Set([1, 4, 7, 10]);
  const rete = fornitore({
    chiamateTool: 20,
    rifiuta: (n, corpo) => (rifiutate.has(n) ? rifiutoConNumeri(corpo, Math.max(1_024, Math.floor(stima(corpo.messages) * 0.8))) : null),
  });
  let errore = null;
  try {
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
      messaggiIniziali: [...storia(30), { role: 'user', content: 'Leggi grande.txt molte volte.' }],
      contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access' });
  } catch (e) { errore = e; }
  assert.ok(errore, 'il giro fallisce al quarto rifiuto');
  assert.equal(errore.classificazione, 'contesto-pieno');
  assert.equal(errore.contestoPieno?.esauriti, true, JSON.stringify(errore.contestoPieno));
  assert.equal(rete.conti.corpi.length, 10, `dieci richieste: l'ultima, rifiutata, non si ritenta (${rete.conti.corpi.length})`);
});

test('C-REGOLA-N-02b — AL CONTRARIO anche con la finestra dichiarata: senza numeri nel rifiuto, nessun «troppo grande»', async (t) => {
  const incollato = `Ecco il log, dimmi cosa non va:\n${'riga del log con un errore dentro '.repeat(900)}`;
  const messaggi = [...storia(4), { role: 'user', content: incollato }];
  const rete = fornitore({ rifiuta: (n) => (n === 1 ? rifiuto("This model's maximum context length is 16384 tokens (context_length_exceeded)") : null) });
  const { errore } = await giro(t, { messaggiIniziali: messaggi, rete, finestraToken: 16_384 });
  assert.notEqual(errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `${errore?.code}: ${errore?.message}`);
});

test('C-BLOCCO-01 — il blocco dei fatti che porterebbe il ritentativo oltre il bersaglio si toglie; il riassunto pagato resta', async (t) => {
  const messaggi = [...storia(40), { role: 'user', content: 'Continua.' }];
  /* un riassunto riconoscibile e più grande di quello atteso: la decisione di pagare resta lontana dal bordo */
  const testoRiassunto = `## Riassunto\n${'SINTESI-PAGATA '.repeat(450)}`;
  // 1. senza fatti dichiarati: quanto pesa il ritentativo col riassunto pagato
  const prova = fornitore({ riassunto: testoRiassunto, rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.floor(stima(corpo.messages) * 0.8)) : null) });
  await giro(t, { messaggiIniziali: messaggi, rete: prova });
  assert.equal(prova.conti.riassunti, 1, 'premessa: il riassunto si paga');
  const conRiassunto = stima(prova.conti.corpi[1].messages);
  // 2. coi fatti al loro tetto (~1.000 token) e un bersaglio sopra il riassunto ma sotto riassunto + fatti
  const bersaglio = conRiassunto + 600;
  const rete = fornitore({ riassunto: testoRiassunto, rifiuta: (n, corpo) => (n === 1 ? rifiuto(`prompt is too long: ${stima(corpo.messages)} tokens > ${Math.ceil(bersaglio / 0.9)} maximum`) : null) });
  const fatti = Array.from({ length: 80 }, (_, i) => `FATTO-DELLA-PROVA-${i}: il file numero ${i} esiste ed è stato letto una volta.`);
  const { esito, errore } = await giro(t, { messaggiIniziali: messaggi, rete, fontiRicarica: { fatti } });
  assert.equal(errore, null, errore?.message);
  assert.ok(esito);
  assert.equal(rete.conti.riassunti, 1, 'il riassunto si paga anche qui');
  const ritentata = JSON.stringify(rete.conti.corpi[1].messages);
  assert.ok(ritentata.includes('SINTESI-PAGATA'), 'il riassunto pagato resta (non lascia il posto a quello senza modello)');
  assert.ok(!ritentata.includes('FATTO-DELLA-PROVA-'), 'il blocco dei fatti è stato tolto');
  assert.ok(stima(rete.conti.corpi[1].messages) <= bersaglio + 1, `e il ritentativo sta nel bersaglio (${stima(rete.conti.corpi[1].messages)} contro ${bersaglio})`);
});

test('C-K-01 — sul rifiuto anche le richieste vecchie si accorciano sul bersaglio (non solo sul tetto di 20.000): bastano, e niente si paga', async (t) => {
  const pasta = (i) => ({ role: 'user', content: `Incollo il documento ${i}:\n${'una frase del documento lungo '.repeat(1_200)}` });
  const messaggi = [];
  for (let i = 1; i <= 2; i += 1) messaggi.push(pasta(i), { role: 'assistant', content: `Letto il documento ${i}.` });
  messaggi.push({ role: 'user', content: 'Quale dei due è il più chiaro?' });
  const prima = stima(messaggi);
  assert.ok(prima < 20_000, `premessa: sotto il tetto di sempre delle richieste vecchie (${prima})`);
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.floor(prima * 0.6)) : null) });
  const copie = cartellaDiProva('talos-c-k-');
  t.after(() => rimuoviCartellaDiProva(copie));
  const { esito, errore, eventi } = await giro(t, { messaggiIniziali: messaggi, rete, cartellaIncollati: copie });
  assert.equal(errore, null, errore?.message);
  assert.ok(esito);
  assert.equal(rete.conti.riassunti, 0, 'nessun riassunto pagato');
  assert.ok(!eventi.some((e) => e.ripiego === true), `nessun riassunto senza modello: bastano i passi gratuiti (${JSON.stringify(eventi.map((e) => [e.tipo, e.motivo, e.ragione]))})`);
  assert.ok(stima(rete.conti.corpi[1].messages) <= Math.floor(prima * 0.6 * 0.9) + 1, `il ritentativo sta nel bersaglio (${stima(rete.conti.corpi[1].messages)})`);
});

test('C-BASE-01 — un riassunto preparato prima che basta per il bersaglio si adotta e basta: nessun lavoro in più sul resto', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-c-base-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const coppie = (token) => { let c = 4; while (stima(storia(c + 1)) < token) c += 1; return c; };
  const r0 = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  /* come S2-2 (3.800, `cli-revisione-613-3-residui`): sopra l'80% della soglia il riassunto si prepara in sottofondo */
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppie(3800)),
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa: un riassunto pronto');
  const messaggi = [...uno.messaggiFinali, { role: 'user', content: 'Ora rispondi OK.' }];
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.floor(stima(corpo.messages) * 0.85)) : null) });
  const fini = [];
  /* senza l'istantanea in questo giro: la preparazione in sottofondo all'inizio del giro correva contro il rifiuto, e la richiesta
     passava a volte dalla base, a volte dal riassunto in arrivo (misurato con una sonda). Il riassunto pronto arriva lo stesso. */
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
    compattazionePronta: pronta, contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine' && e.compattato) fini.push({ istantanea: e.istantanea === true, resto: e.restoNonRiuscito != null }); } });
  assert.equal(rete.conti.corpi.length, 2, 'premessa: rifiutata e ritentata');
  assert.equal(rete.conti.riassunti, 0, 'niente pagato in questo giro');
  assert.deepEqual(fini, [{ istantanea: true, resto: false }], `una sola compattazione, la base adottata, senza un «resto» tentato (${JSON.stringify(fini)})`);
});

test('C-BASE-02 — AL CONTRARIO: la base preparata sta sotto la soglia ma non nel bersaglio del rifiuto: si compatta anche il resto (una riga, «con il resto»)', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-c-base2-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const coppie = (token) => { let c = 4; while (stima(storia(c + 1)) < token) c += 1; return c; };
  const r0 = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppie(3250)),
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa: un riassunto pronto');
  // dopo il tratto coperto dalla base, altra conversazione; il giro parte SOTTO la soglia (niente compattazione prima del rifiuto) e il
  // bersaglio del rifiuto sta sotto ciò che la base lascia: la base da sola non basta
  const messaggi = [...uno.messaggiFinali, ...storia(2).map((m) => ({ ...m, content: m.content.replace(/^(Domanda|Risposta)/, '$1 nuova') })), { role: 'user', content: 'Ora rispondi OK.' }];
  assert.ok(stima(messaggi) < 4_000, `premessa: sotto la soglia (${stima(messaggi)})`);
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? rifiutoConNumeri(corpo, Math.max(1_024, Math.floor(stima(corpo.messages) * 0.3))) : null) });
  const fini = [];
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
    compattazionePronta: pronta, contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine' && e.compattato) fini.push({ conResto: e.adottato?.conResto === true }); } });
  assert.equal(rete.conti.corpi.length, 2, 'premessa: rifiutata e ritentata');
  assert.equal(fini.length, 1, `una riga sola per la richiesta (${JSON.stringify(fini)})`);
  assert.equal(fini[0].conResto, true, 'la base adottata e il resto compattato insieme: la base da sola non bastava');
});

test('C-SCARTO-02 — senza numeri, quando la parte fissa supera già il 70%: si accorcia tutto il possibile e si riprova (non si arrende)', async (t) => {
  const SCARTO = 8_000;
  const messaggi = conEsitoGrande(2, 250);
  const prima = stima(messaggi);
  assert.ok((prima + SCARTO) * 0.7 < SCARTO, `premessa: il 70% della richiesta (${Math.floor((prima + SCARTO) * 0.7)}) sta sotto la parte fissa (${SCARTO})`);
  const rete = fornitore({ rifiuta: (n) => (n === 1 ? rifiuto("This model's maximum context length is 8192 tokens (context_length_exceeded)") : null) });
  const { esito, errore } = await giro(t, { messaggiIniziali: messaggi, rete, scartoMisurato: SCARTO });
  assert.equal(errore, null, `${errore?.message} ${JSON.stringify(errore?.contestoPieno ?? null)}`);
  assert.ok(esito);
  assert.ok(stima(rete.conti.corpi[1].messages) < stima(rete.conti.corpi[0].messages), 'il ritentativo è più leggero');
});

/* ------------------------------------------------------------------ Z-K1 (revisione della CLI su Z, 23/10): la diagnosi arriva al RunError */

test('C-SERVIZIO-01 — Z-K1: sul RunError del «contesto pieno» arrivano `contestoPieno` (solo i campi del contratto) e `classificazione`; AL CONTRARIO un altro errore non li porta', async (t) => {
  const corsa = async (rifiuta) => {
    const cartella = cartellaDiProva('talos-c-servizio-');
    t.after(() => rimuoviCartellaDiProva(cartella));
    const eventi = [];
    const rete = fornitore({ rifiuta });
    await avviaSessione({ cartella, task: { consegna: 'x' }, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', onEvento: (e) => { eventi.push(e); },
      messaggiIniziali: [...storia(30), { role: 'user', content: 'Continua.' }],
      talosLavoraFn: (input) => talosLavora({ ...input, contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access' }) });
    return eventi.find((e) => e.type === 'RunError') ?? null;
  };
  /* rifiutata a ogni scalino coi numeri: tre ritentativi, poi esauriti */
  const pieno = await corsa((_n, corpo) => rifiutoConNumeri(corpo, Math.max(1024, Math.floor(stima(corpo.messages) * 0.7))));
  assert.ok(pieno, 'premessa: il giro finisce con un RunError');
  assert.equal(pieno.classificazione, 'contesto-pieno', JSON.stringify(pieno));
  assert.ok(Number.isSafeInteger(pieno.contestoPieno?.scalino), JSON.stringify(pieno.contestoPieno));
  assert.deepEqual(Object.keys(pieno.contestoPieno).filter((k) => !['scalino', 'bersaglio', 'numeri', 'esauriti'].includes(k)), [], 'solo i campi del contratto');
  assert.ok(Number.isSafeInteger(pieno.contestoPieno.numeri?.richiesti) && Number.isSafeInteger(pieno.contestoPieno.numeri?.massimo), JSON.stringify(pieno.contestoPieno));
  /* AL CONTRARIO: un errore del fornitore che non è il contesto pieno non porta niente di tutto questo */
  const altro = await corsa(() => new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
  assert.ok(altro, 'premessa: anche qui un RunError');
  assert.equal(altro.contestoPieno, undefined);
  assert.equal(altro.classificazione, undefined);
});
