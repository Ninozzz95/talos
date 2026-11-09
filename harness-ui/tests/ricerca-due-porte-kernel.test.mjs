import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora, chiamataInizialeValida } from '../src/kernel/talosHarness.mjs';
import { pesoInToken, NOMI_DEL_PONTE } from '../src/kernel/ponte-attrezzi.mjs';
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs';

/*
 * ⭐ RICERCA APPROFONDITA A DUE PORTE — il nucleo (owner 22/10/2026; forma `FORMA-RICERCA-DUE-PORTE-2026-11-01.md`, OK di Mobile, CLI e
 *   Performance con le loro condizioni):
 *   - `ricercaDavanti` (opzione dell'ospite, spenta di serie — CLI): `research_start` davanti solo con l'opzione E `onRicercaAvvia`
 *     (Mobile), mai nel modo «essenziali»; la lista resta identica byte per byte fra i giri (Performance) e, spenta, è quella di oggi;
 *   - `chiamataIniziale`: il primo passo è la chiamata della persona, col suo sì, e i divieti restano.
 */

const nomi = (lista) => lista.map((a) => a.function.name);
const elencoDelPonte = (tools) => tools.find((a) => a.function.name === 'tool_search')?.function.description ?? '';

function fornitore(copione) {
  const richieste = [];
  let n = 0;
  const fetchDiRete = async (_url, init) => {
    richieste.push(corpoSenzaMarcatori(init.body));
    const passo = copione[n] ?? { content: 'fatto' };
    n += 1;
    const message = passo.chiamate
      ? { role: 'assistant', content: null, tool_calls: passo.chiamate.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }
      : { role: 'assistant', content: passo.content };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: passo.chiamate ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchDiRete, richieste };
}

async function giro({ copione = [{ content: 'ciao' }], conRicerca = true, ...altro } = {}) {
  const { fetchDiRete, richieste } = fornitore(copione);
  const avviate = [];
  const ordine = [];
  const fetchConOrdine = async (u, i) => { ordine.push('rete'); return fetchDiRete(u, i); };
  const approvazioni = [];
  const eventi = [];
  const delta = [];
  await talosLavora({
    cartella: mkdtempSync(join(tmpdir(), 'ricerca-due-porte-')), task: { consegna: 'Compare llama.cpp and MLC LLM on Snapdragon' }, modello: 'f', chiave: 'k', giriMassimi: 4,
    fetchDiRete: fetchConOrdine, livelloAccesso: 'accesso-pieno',
    chiediApprovazioneFn: async (azione) => { approvazioni.push(azione); return true; },
    strumentiEstesi: [...STRUMENTI_ESTESI_PREDEFINITI],
    attrezziDifferiti: true,
    ...(conRicerca ? { onRicercaAvvia: async (argomenti) => { ordine.push('ricerca'); avviate.push(argomenti); return { ok: true, esito: 'Started the research (id r-1). It runs in the background.' }; } } : {}),
    onGiro: (e) => eventi.push(e), onDelta: (d) => delta.push(d),
    ...altro,
  });
  return { richieste, avviate, ordine, approvazioni, eventi, delta };
}

test('RDP-K01: ACCESA (opzione + chi la esegue) — research_start davanti, fuori dall\'elenco del ponte, e la lista è identica byte per byte fra due giri', async () => {
  const { richieste } = await giro({ ricercaDavanti: true, copione: [{ chiamate: [['c1', 'time_now', {}]] }, { content: 'fine' }] });
  assert.equal(richieste.length, 2, 'premessa: due richieste al modello');
  for (const r of richieste) {
    assert.ok(nomi(r.tools).includes('research_start'), 'research_start davanti');
    assert.doesNotMatch(elencoDelPonte(r.tools), /- research_start:/u, 'e non più nell\'elenco del ponte');
    assert.match(elencoDelPonte(r.tools), /- research_read:/u, 'gli altri research_* restano dietro il ponte');
  }
  assert.equal(JSON.stringify(richieste[1].tools), JSON.stringify(richieste[0].tools), 'stessa lista byte per byte fra i giri (cache)');
});

test('RDP-K02: SPENTA di serie — la lista è quella di oggi, byte per byte (CLI); AL CONTRARIO accesa cambia', async () => {
  const assente = await giro({});
  const spenta = await giro({ ricercaDavanti: false });
  const accesa = await giro({ ricercaDavanti: true });
  assert.equal(JSON.stringify(spenta.richieste[0].tools), JSON.stringify(assente.richieste[0].tools), 'false = assente');
  assert.ok(!nomi(assente.richieste[0].tools).includes('research_start'), 'di serie research_start resta dietro il ponte');
  assert.match(elencoDelPonte(assente.richieste[0].tools), /- research_start:/u);
  assert.notEqual(JSON.stringify(accesa.richieste[0].tools), JSON.stringify(assente.richieste[0].tools), 'controllo positivo: accesa la lista cambia');
  const prima = pesoInToken(JSON.stringify(assente.richieste[0].tools));
  const dopo = pesoInToken(JSON.stringify(accesa.richieste[0].tools));
  // il valore del contatore del ponte, per il commit (Performance)
  test.diagnostic?.(`contatore del ponte: ${prima} → ${dopo} (+${dopo - prima})`);
  console.log(`RDP-K02 contatore del ponte (pesoInToken): ${prima} → ${dopo} = +${dopo - prima} token`);
  assert.ok(dopo - prima > 200 && dopo - prima < 340, `+${dopo - prima} token, atteso ~+268`);
});

test('RDP-K03: opzione accesa ma NESSUNO che la esegue (Codice del telefono) — research_start resta dove è oggi', async () => {
  const senza = await giro({ ricercaDavanti: true, conRicerca: false });
  const oggi = await giro({ conRicerca: false });
  assert.ok(!nomi(senza.richieste[0].tools).includes('research_start'));
  assert.equal(JSON.stringify(senza.richieste[0].tools), JSON.stringify(oggi.richieste[0].tools));
});

test('RDP-K04: nel modo «essenziali» research_start resta dietro il ponte anche con l\'opzione', async () => {
  const { richieste } = await giro({ ricercaDavanti: true, attrezziDifferiti: 'essenziali' });
  assert.ok(!nomi(richieste[0].tools).includes('research_start'));
  for (const n of NOMI_DEL_PONTE) assert.ok(nomi(richieste[0].tools).includes(n));
});

test('RDP-K05: chiamataIniziale — la ricerca parte PRIMA di ogni richiesta al modello, con domanda e profondità della persona, senza carta', async () => {
  const { richieste, avviate, ordine, approvazioni, eventi, delta } = await giro({
    ricercaDavanti: true,
    chiamataIniziale: { nome: 'research_start', argomenti: { question: '  Compare llama.cpp and MLC LLM  ', depth: 'exhaustive' } },
  });
  assert.deepEqual(avviate, [{ question: 'Compare llama.cpp and MLC LLM', depth: 'exhaustive' }]);
  assert.deepEqual(ordine, ['ricerca', 'rete'], 'prima la ricerca, poi UNA richiesta al modello');
  assert.equal(approvazioni.filter((a) => a?.tipo === 'research_start').length, 0, 'il clic è il sì: nessuna carta');
  const assistente = richieste[0].messages.find((m) => m.role === 'assistant' && m.tool_calls);
  assert.equal(assistente.tool_calls[0].function.name, 'research_start');
  assert.match(assistente.tool_calls[0].id, /^persona-[0-9a-f]{12}$/u);
  const esito = richieste[0].messages.find((m) => m.role === 'tool' && m.tool_call_id === assistente.tool_calls[0].id);
  assert.match(esito.content, /Started the research/u, 'il modello vede l\'esito come per una sua chiamata');
  assert.ok(eventi.some((e) => e.tipo === 'chiamata-della-persona' && e.nome === 'research_start'));
  assert.ok(delta.some((d) => d.tipo === 'tool-inizio' && d.dallaPersona === true && d.nome === 'research_start'));
  assert.ok(eventi.some((e) => e.tipo === 'ricevuta' && e.ricevuta?.status === 'succeeded'), 'la ricevuta di sempre');
  /* revisione 01/11 (M4): la risposta sintetica del primo passo dice come è finita, come una del fornitore che chiama un attrezzo */
  const primaRisposta = eventi.find((e) => e.tipo === 'risposta' && e.giro === 0);
  assert.equal(primaRisposta?.motivoFine, 'tool_calls');
  assert.equal(primaRisposta?.risposta?.tool_calls?.[0]?.function?.name, 'research_start');
});

test('RDP-K09 (revisione S3-4): dentro una ricerca (`task.ricercaId`) research_start NON va davanti anche con l\'opzione e chi la esegue', async () => {
  const dentro = await giro({ ricercaDavanti: true, task: { consegna: 'indaga', ricercaId: 'r-1' } });
  assert.ok(!nomi(dentro.richieste[0].tools).includes('research_start'), 'una sessione che lavora per una ricerca non ne apre un\'altra davanti');
  const fuori = await giro({ ricercaDavanti: true, task: { consegna: 'indaga' } });
  assert.ok(nomi(fuori.richieste[0].tools).includes('research_start'), 'controllo positivo: fuori da una ricerca sì');
});

test('RDP-K06: i divieti restano — «nega» su research_start e il Piano rifiutano, e la ricerca NON parte', async () => {
  const negata = await giro({
    permessiPerAttrezzo: { research_start: 'nega' },
    chiamataIniziale: { nome: 'research_start', argomenti: { question: 'una domanda' } },
  });
  assert.deepEqual(negata.avviate, []);
  const esitoNegato = negata.richieste[0].messages.find((m) => m.role === 'tool')?.content;
  assert.match(String(esitoNegato), /REFUSED/u);
  const piano = await giro({
    modalitaOperativa: 'piano',
    chiamataIniziale: { nome: 'research_start', argomenti: { question: 'una domanda' } },
  });
  assert.deepEqual(piano.avviate, [], 'in Piano non parte');
});

test('RDP-K07: una chiamataIniziale storta si ignora — il giro parte col modello, come sempre', async () => {
  for (const storta of [
    { nome: 'shell', argomenti: { comando: 'echo x' } },
    { nome: 'shell', argomenti: { question: 'una forma che passerebbe' } }, // lista bianca di UN nome: la forma giusta non basta
    { nome: 'research_read', argomenti: { question: 'ok' } },
    { nome: 'research_start', argomenti: { question: 'x'.repeat(501) } },
    { nome: 'research_start', argomenti: { question: '   ' } },
    { nome: 'research_start', argomenti: { question: 'ok', depth: 'infinita' } },
    'research_start',
  ]) {
    assert.equal(chiamataInizialeValida(storta), null, JSON.stringify(storta));
    const { avviate, ordine } = await giro({ chiamataIniziale: storta });
    assert.deepEqual(avviate, []);
    assert.equal(ordine[0], 'rete');
  }
  assert.deepEqual(chiamataInizialeValida({ nome: 'research_start', argomenti: { question: 'x'.repeat(500) } })?.argomenti.question.length, 500, 'al bordo: 500 passa');
});

test('RDP-K08: in «Chiede prima» la chiamata della persona NON porta una carta; AL CONTRARIO la stessa chiamata fatta dal modello sì', async () => {
  const persona = await giro({
    livelloAccesso: 'su-richiesta', chiediApprovazioneFn: async () => false, ricercaDavanti: true,
    chiamataIniziale: { nome: 'research_start', argomenti: { question: 'Compare two engines' } },
  });
  assert.deepEqual(persona.avviate, [{ question: 'Compare two engines' }], 'il clic è il sì');
  const modello = await giro({
    livelloAccesso: 'su-richiesta', ricercaDavanti: true,
    copione: [{ chiamate: [['m1', 'research_start', { question: 'Compare two engines' }]] }, { content: 'fine' }],
  });
  assert.ok(modello.approvazioni.some((a) => a?.tipo === 'research_start'), 'controllo positivo: per il modello la carta c\'è');
});
