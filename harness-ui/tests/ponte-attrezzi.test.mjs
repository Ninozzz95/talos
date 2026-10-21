import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora, ATTREZZI_OPENAI, ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs';
import {
  ATTREZZI_DIFFERIBILI, NOMI_DEL_PONTE, dividiPerIlPonte, cercaAttrezzi, descriviAttrezzi, risolviChiamataDelPonte, chiamataPerChiGuarda,
} from '../src/kernel/ponte-attrezzi.mjs';
import { eventiPerRisposta } from '../src/agui-events.mjs';
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';
import { consenteAttrezzoDelega } from '../src/delegation-contract.mjs';

/*
 * ⭐ C5 ATTREZZI DIFFERITI (owner 17/10/2026: «Ponte fisso come Hermes», «Quelli che scattano su richiesta»).
 *   Fonte: Hermes `tools/tool_search.py`, `agent/tool_executor.py:395-445` (clone 2026-10-07). Vedi `src/kernel/ponte-attrezzi.mjs`.
 */

const LISTA_DI_SERIE = [...ATTREZZI_OPENAI, ...ATTREZZI_ESTESI_OPENAI.filter((a) => STRUMENTI_ESTESI_PREDEFINITI.includes(a.function.name))];
const nomi = (lista) => lista.map((a) => a.function.name);

/* Un fornitore finto: risponde con le chiamate scritte nel copione, una risposta per richiesta, e tiene i corpi delle richieste. */
function fornitore(copione) {
  const richieste = [];
  let n = 0;
  const fetchDiRete = async (_url, init) => {
    richieste.push(JSON.parse(init.body));
    const passo = copione[n] ?? { content: 'fatto' };
    n += 1;
    const message = passo.chiamate
      ? { role: 'assistant', content: null, tool_calls: passo.chiamate.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }
      : { role: 'assistant', content: passo.content };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: passo.chiamate ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchDiRete, richieste };
}

const esitoDi = (richieste, id) => richieste.flatMap((r) => r.messages).find((m) => m.role === 'tool' && m.tool_call_id === id)?.content;

/* `ponte: 'assente'` ⇒ la chiave non si passa affatto: è il «di serie» di chi chiama oggi (banco, CLI, mobile). */
async function giro({ copione, ponte = true, ...altro }) {
  const { fetchDiRete, richieste } = fornitore(copione);
  const note = [];
  await talosLavora({
    cartella: mkdtempSync(join(tmpdir(), 'ponte-')), task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 4, fetchDiRete,
    livelloAccesso: 'accesso-pieno', chiediApprovazioneFn: async () => true,
    strumentiEstesi: [...STRUMENTI_ESTESI_PREDEFINITI],
    onNoteCrea: async (argomenti) => { note.push(argomenti); return { ok: true, esito: 'saved note-1' }; },
    ...(ponte === 'assente' ? {} : { attrezziDifferiti: ponte }),
    ...altro,
  });
  return { richieste, note };
}

test('PONTE-01: la divisione della lista di serie — 45 dietro il ponte, la domanda alla persona MAI, stesso oggetto a ogni giro', () => {
  const { attrezzi, differiti } = dividiPerIlPonte(LISTA_DI_SERIE);
  assert.equal(differiti.size, ATTREZZI_DIFFERIBILI.size, 'ogni differibile è nella lista di serie');
  assert.deepEqual(nomi(attrezzi).slice(-3), NOMI_DEL_PONTE);
  for (const n of ['ask_user_question', 'elenca', 'cerca', 'leggi', 'scrivi', 'shell', 'delega_sottotask', 'memory_write', 'memory_find']) {
    assert.ok(nomi(attrezzi).includes(n), `${n} resta davanti`);
  }
  assert.ok(!ATTREZZI_DIFFERIBILI.has('ask_user_question'), 'Hermes: l\'unica regressione è la domanda alla persona');
  assert.equal(dividiPerIlPonte(LISTA_DI_SERIE), dividiPerIlPonte(LISTA_DI_SERIE), 'stessa lista ⇒ stesso oggetto (richiesta uguale fra i giri)');
  assert.ok(JSON.stringify(attrezzi).length < JSON.stringify(LISTA_DI_SERIE).length * 0.55, 'almeno −45% di caratteri');
  // AL CONTRARIO: senza nessun differibile la lista torna com'è, senza ponte
  const soloBase = [...ATTREZZI_OPENAI];
  assert.equal(dividiPerIlPonte(soloBase).attrezzi, soloBase);
});

test('PONTE-02: SPENTO di serie — la richiesta porta gli attrezzi di sempre e nessun ponte', async () => {
  const { richieste } = await giro({ copione: [{ content: 'ciao' }], ponte: 'assente' });
  const offerti = nomi(richieste[0].tools);
  assert.ok(offerti.includes('notes_create'));
  for (const n of NOMI_DEL_PONTE) assert.ok(!offerti.includes(n), `${n} non c'è a ponte spento`);
});

test('PONTE-03: ACCESO — la richiesta porta il ponte e non i differiti, e l\'elenco dei nomi sta nella descrizione di tool_search', async () => {
  const { richieste } = await giro({ copione: [{ content: 'ciao' }] });
  const offerti = nomi(richieste[0].tools);
  for (const n of NOMI_DEL_PONTE) assert.ok(offerti.includes(n));
  assert.ok(!offerti.includes('notes_create') && !offerti.includes('automation_create'));
  const ricerca = richieste[0].tools.find((a) => a.function.name === 'tool_search').function.description;
  assert.match(ricerca, /- notes_create: Save a note for the user\./u);
  assert.match(ricerca, /do NOT claim it is unavailable/u);
});

test('PONTE-04: tool_call esegue l\'attrezzo VERO con i suoi argomenti, e la storia tiene la chiamata al ponte', async () => {
  const { richieste, note } = await giro({ copione: [{ chiamate: [['c1', 'tool_call', { name: 'notes_create', arguments: { title: 'T', content: 'C' } }]] }] });
  assert.deepEqual(note, [{ title: 'T', content: 'C' }]);
  assert.equal(esitoDi(richieste, 'c1'), 'saved note-1');
  const chiamata = richieste[1].messages.find((m) => m.role === 'assistant' && m.tool_calls)?.tool_calls[0];
  assert.equal(chiamata.function.name, 'tool_call', 'il modello rilegge la propria chiamata, non una riscritta');
});

test('PONTE-05: AL CONTRARIO — il cancello dei permessi vale anche attraverso il ponte (sola lettura ⇒ rifiutato, niente salvato)', async () => {
  const { richieste, note } = await giro({
    livelloAccesso: 'lettura', chiediApprovazioneFn: async () => false,
    copione: [{ chiamate: [['c1', 'tool_call', { name: 'notes_create', arguments: { title: 'T', content: 'C' } }]] }],
  });
  assert.deepEqual(note, []);
  assert.match(esitoDi(richieste, 'c1'), /^REFUSED\./u);
});

test('PONTE-06: un nome che la sessione non offre, o argomenti che lo schema non regge, si rifiutano senza eseguire', async () => {
  const { richieste, note } = await giro({
    strumentiEstesi: ['notes_create'],
    copione: [{ chiamate: [
      ['c1', 'tool_call', { name: 'automation_create', arguments: {} }],
      ['c2', 'tool_call', { name: 'notes_create', arguments: { title: 'solo titolo' } }],
      ['c3', 'tool_call', { name: 'tool_call', arguments: {} }],
      ['c4', 'tool_call', { arguments: {} }],
    ] }],
  });
  assert.deepEqual(note, []);
  assert.match(esitoDi(richieste, 'c1'), /'automation_create' is not available in this session/u);
  assert.match(esitoDi(richieste, 'c2'), /notes_create needs `content`\. Parameters schema: \{/u);
  assert.match(esitoDi(richieste, 'c3'), /is called directly/u);
  assert.match(esitoDi(richieste, 'c4'), /needs `name`/u);
});

test('PONTE-07: Piano — cercare si può, eseguire una scrittura attraverso il ponte no', async () => {
  const { richieste, note } = await giro({
    modalitaOperativa: 'piano',
    copione: [{ chiamate: [
      ['c1', 'tool_search', { queries: ['notes find'] }],
      ['c2', 'tool_call', { name: 'notes_create', arguments: { title: 'T', content: 'C' } }],
    ] }],
  });
  assert.deepEqual(note, []);
  assert.match(esitoDi(richieste, 'c1'), /- notes_find:/u);
  assert.match(esitoDi(richieste, 'c2'), /not available in this session|Plan mode/u);
});

test('PONTE-08: una delega in sola lettura cerca nel catalogo ma non scrive attraverso il ponte', async () => {
  const contrattoDelega = { schema: 'talos.delegation.v1', modalita: 'lettura' };
  assert.equal(consenteAttrezzoDelega({ contrattoDelega }, 'tool_search'), true);
  assert.equal(consenteAttrezzoDelega({ contrattoDelega }, 'tool_describe'), true);
  const { richieste, note } = await giro({
    task: { consegna: 'prova', contrattoDelega },
    copione: [{ chiamate: [['c1', 'tool_call', { name: 'notes_create', arguments: { title: 'T', content: 'C' } }]] }],
  });
  assert.deepEqual(note, []);
  assert.match(esitoDi(richieste, 'c1'), /^REFUSED\./u);
});

test('PONTE-09: tool_search e tool_describe — risultati in righe, lo schema completo, e i casi vuoti che dicono cosa fare', () => {
  const { differiti } = dividiPerIlPonte(LISTA_DI_SERIE);
  const trovati = cercaAttrezzi(differiti, { queries: ['notes create'], limit: 2 });
  assert.match(trovati.split('\n')[1], /^- notes_create: /u, 'il nome pesa più delle descrizioni lunghe');
  assert.match(cercaAttrezzi(differiti, { queries: 'xyzzy' }), /no tool matches/u);
  assert.match(cercaAttrezzi(differiti, {}), /needs `queries`/u);
  const schema = JSON.parse(descriviAttrezzi(differiti, { names: 'notes_create' }));
  assert.deepEqual(schema[0].parameters.required, ['title', 'content']);
  assert.match(descriviAttrezzi(differiti, { names: ['shell'] }), /Not loaded on demand: shell/u);
  assert.match(risolviChiamataDelPonte({ name: 'notes_create', arguments: [] }, LISTA_DI_SERIE).rifiuto, /must be an object/u);
});

test('PONTE-10: chi guarda vede l\'attrezzo vero — eventi AG-UI della risposta, e una chiamata illeggibile resta com\'è', () => {
  const risposta = { role: 'assistant', content: null, tool_calls: [
    { id: 'c1', type: 'function', function: { name: 'tool_call', arguments: JSON.stringify({ name: 'notes_create', arguments: { title: 'T', content: 'C' } }) } },
    { id: 'c2', type: 'function', function: { name: 'tool_search', arguments: '{"queries":["notes"]}' } },
  ] };
  const eventi = eventiPerRisposta(risposta, { messageId: 'm', ponteAcceso: true });
  assert.deepEqual(eventi.filter((e) => e.type === 'ToolCallStart').map((e) => e.toolCallName), ['notes_create', 'tool_search']);
  assert.equal(eventi.find((e) => e.type === 'ToolCallArgs' && e.toolCallId === 'c1').delta, '{"title":"T","content":"C"}');
  assert.deepEqual(chiamataPerChiGuarda('tool_call', '{"name":'), { nome: 'tool_call', argomenti: '{"name":' });
  assert.deepEqual(chiamataPerChiGuarda('shell', '{"comando":"ls"}'), { nome: 'shell', argomenti: '{"comando":"ls"}' });
});

test('PONTE-11: la Ricerca approfondita tiene davanti il suo attrezzo centrale (research_deposit); le chat normali no', async () => {
  const conRicerca = await giro({ task: { consegna: 'ricerca', ricercaId: 'ric-1', ricercaDomanda: 'd' }, livelloAccesso: 'ricerca', copione: [{ content: 'ok' }] });
  const offertiRicerca = nomi(conRicerca.richieste[0].tools);
  assert.ok(offertiRicerca.includes('research_deposit'), 'nella ricerca è davanti');
  assert.ok(offertiRicerca.includes('tool_search'), 'il ponte resta per gli altri');
  const normale = await giro({ copione: [{ content: 'ok' }] });
  assert.ok(!nomi(normale.richieste[0].tools).includes('research_deposit'), 'AL CONTRARIO: in una chat normale resta dietro il ponte');
  assert.notEqual(dividiPerIlPonte(LISTA_DI_SERIE, ['research_deposit']), dividiPerIlPonte(LISTA_DI_SERIE), 'due divisioni diverse non si confondono nella memoria');
});

/* H-04 della revisione H del bugfixer (17/10/2026, `tests/ponte-revisione-bugfixer.test.mjs` nel suo worktree), ripresa qui. */
test('PONTE-12: il deposito a pezzi misura i byte degli argomenti VERI anche dal ponte (H-04)', async () => {
  const misure = {};
  for (const via of ['diretto', 'ponte']) {
    const visti = [];
    const argomenti = { testo: 'x'.repeat(100), affermazioni: [], fonti: [], parte: { indice: 1, totale: 2 } };
    const chiamata = via === 'diretto' ? ['r1', 'research_deposit', argomenti] : ['r1', 'tool_call', { name: 'research_deposit', arguments: argomenti }];
    await giro({ livelloAccesso: 'ricerca', task: { consegna: 'ricerca', ricercaId: 'ric-1', ricercaDomanda: 'domanda' },
      componiRapportoRicercaFn: async (a) => { visti.push(a.byteArgomenti); return { ok: true, daNoi: false, completo: false, motivo: 'parte 1/2 tenuta' }; },
      copione: [{ chiamate: [chiamata] }, { content: 'ok' }] });
    misure[via] = { misurati: visti[0] ?? null, veri: Buffer.byteLength(JSON.stringify(argomenti), 'utf8') };
  }
  assert.equal(misure.diretto.misurati, misure.diretto.veri);
  assert.equal(misure.ponte.misurati, misure.ponte.veri, 'dal ponte non si misura l\'involucro {name, arguments}');
});

test('PONTE-13: a ponte SPENTO chi guarda vede `tool_call` com\'è (il kernel risponde «unknown tool»), a ponte acceso l\'attrezzo vero (H-06)', () => {
  const risposta = { role: 'assistant', content: null, tool_calls: [
    { id: 'x1', type: 'function', function: { name: 'tool_call', arguments: JSON.stringify({ name: 'notes_create', arguments: { title: 'a' } }) } },
  ] };
  const nome = (opzioni) => eventiPerRisposta(risposta, { messageId: 'm', ...opzioni }).find((e) => e.type === 'ToolCallStart').toolCallName;
  assert.equal(nome({}), 'tool_call');
  assert.equal(nome({ ponteAcceso: true }), 'notes_create');
});

test('PONTE-14: le correzioni del desktop valgono anche per una chiamata dal ponte («è un FILE, non una cartella»)', async () => {
  const { correggiMessaggiDesktop } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
  const { writeFileSync } = await import('node:fs');
  const cartella = mkdtempSync(join(tmpdir(), 'ponte-desk-'));
  writeFileSync(join(cartella, 'a.txt'), 'x');
  const esitoGrezzo = '"a.txt" is not a readable folder of this workspace.';
  const corretto = (nome, argomenti) => correggiMessaggiDesktop([
    { role: 'assistant', content: null, tool_calls: [{ id: 'e1', type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] },
    { role: 'tool', tool_call_id: 'e1', content: esitoGrezzo },
  ], { cartella })[1].content;
  const diretto = corretto('elenca', { percorso: 'a.txt' });
  assert.match(diretto, /is a FILE, not a folder/u, 'premessa: la correzione esiste per la chiamata diretta');
  assert.equal(corretto('tool_call', { name: 'elenca', arguments: { percorso: 'a.txt' } }), diretto);
});

test('PONTE-15: l\'indice dei file della compattazione conta anche i file letti dal ponte', async () => {
  const { indiceMeccanico } = await import('../src/kernel/compattazione-desktop.mjs');
  const storia = (nome, argomenti) => [
    { role: 'assistant', content: null, tool_calls: [{ id: 'l1', type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] },
    { role: 'tool', tool_call_id: 'l1', content: 'contenuto' },
  ];
  const diretto = indiceMeccanico(storia('leggi', { percorso: 'src/a.mjs' })).fileRiletti;
  assert.deepEqual(diretto, ['src/a.mjs'], 'premessa: la lettura diretta entra nell\'indice');
  assert.deepEqual(indiceMeccanico(storia('tool_call', { name: 'leggi', arguments: { percorso: 'src/a.mjs' } })).fileRiletti, diretto);
});

test('LINGUA-TEL-01 (owner 19/10) la riga della lingua va SOLO col profilo del telefono: col ponte di serie e spento il primo messaggio di sistema non la porta', async () => {
  const { talosLavora, RIGA_LINGUA_DELLA_PERSONA } = await import('../src/kernel/talosHarness.mjs')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const primoSistema = async (attrezziDifferiti) => {
    let sistema = null
    await talosLavora({
      cartella: mkdtempSync(join(tmpdir(), 'talos-lingua-')), task: { consegna: 'ciao' }, modello: 'x', chiave: 'y', attrezziDifferiti,
      fetchDiRete: async (_u, init) => { sistema ??= JSON.parse(init.body).messages[0].content; return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) } },
    })
    return String(sistema)
  }
  assert.ok((await primoSistema('essenziali')).includes(RIGA_LINGUA_DELLA_PERSONA))
  assert.ok(!(await primoSistema(true)).includes(RIGA_LINGUA_DELLA_PERSONA))
  assert.ok(!(await primoSistema(false)).includes(RIGA_LINGUA_DELLA_PERSONA))
})
