import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { creaResearchOrchestrator, componiRapportoRicerca } from '../src/research-orchestrator.mjs';
import { creaRicerca, leggiRicerca, aggiornaRicerca, elencaRicerche, leggiGiornale, percorsoGiornale, percorsoRapporto } from '../src/research-store.mjs';
import { talosResearchParseReport } from '../src/research/report.mjs';
import { LIMITE_PARTE_RAPPORTO_BYTE, rileggiPartiRapporto } from '../src/research/deposito-a-pezzi.mjs';
import { talosLavora, ATTREZZI_OPENAI, ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const id = 'bc49';
const domanda = 'Come evolvono gli harness?';
const fonte = { url: 'https://esempio.invalid/a', titolo: 'Fonte', letta: true };
const affermazione = { testo: 'Il dato è verificabile.', fonte: fonte.url, passaggio: 'Il dato è verificabile.' };
const pezzo = (indice, testo = '', ultima = false, affermazioni = [], fonti = []) => ({ testo, affermazioni, fonti, parte: { indice, ultima } });
const parti = [pezzo(1, '# Rapporto\r\n\r\nCaffè ☕ 日本語', false, [affermazione], [fonte]), pezzo(2, '\n\n## Fonti\n- https://esempio.invalid/a\n', true)];
const unico = { testo: parti.map(p => p.testo).join(''), affermazioni: [affermazione], fonti: [fonte] };

async function banco(t, extra = {}) {
  const cartella = await mkdtemp(join(tmpdir(), 'bc49-test-'));
  t.after(async () => {
    assert.ok(resolve(cartella).startsWith(resolve(tmpdir()) + '\\') || resolve(cartella).startsWith(resolve(tmpdir()) + '/'));
    await rimuoviCartellaDiProvaAttesa(cartella);
  });
  const avviati = [], sessioni = new Map();
  const opzioni = {
    sessioni, avviaESeguiFn: spec => { avviati.push(spec); return { sessionId: spec.sessionId }; },
    randomUUIDFn: () => id, clock: () => new Date('2026-09-12T14:00:00Z'), ripresaAutomatica: false,
    creaRicercaFn: creaRicerca, leggiRicercaFn: leggiRicerca, aggiornaRicercaFn: aggiornaRicerca,
    elencaRicercheFn: elencaRicerche, salvaVoceLibreriaFn: async () => 'lib-bc49',
    leggiVoceLibreriaFn: async () => null, eliminaVoceLibreriaFn: async () => {},
    ...extra,
  };
  const orch = creaResearchOrchestrator(opzioni);
  await orch.avvia({ cartella, question: domanda, depth: 'deep', modello: 'autore' });
  const deposita = p => orch.componiRapporto({ cartella, id, domanda, ...p });
  return { cartella, orch, deposita, avviati, sessioni, opzioni };
}

test('BC49: parti ordinate, prosa Unicode e prove producono lo stesso rapporto del deposito unico', async t => {
  const b = await banco(t);
  const atteso = await b.deposita(unico);
  const prima = await b.deposita(parti[0]);
  assert.equal(prima.parziale, true);
  assert.equal(prima.prossimaParte, 2);
  await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
  const ultima = await b.deposita(parti[1]);
  assert.equal(ultima.ok, true);
  assert.equal(ultima.documento, atteso.documento);
  assert.equal(await readFile(percorsoRapporto(b.cartella, id), 'utf8'), atteso.documento);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.deepEqual(j.eventi.filter(e => e.kind === 'deposit_part').map(e => e.indice), [1, 2]);
});

test('BC49: parte ripetuta anche concorrente è idempotente; contenuto diverso allo stesso indice viene rifiutato', async t => {
  const b = await banco(t);
  const risposte = await Promise.all([b.deposita(parti[0]), b.deposita(structuredClone(parti[0]))]);
  assert.ok(risposte.every(r => r.ok && r.prossimaParte === 2));
  assert.equal((await b.deposita({ ...parti[0], testo: 'diverso' })).ok, false);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(j.eventi.filter(e => e.kind === 'deposit_part').length, 1);
  const alterato = structuredClone(j.eventi);
  alterato.find(e => e.kind === 'deposit_part').contenuto.testo = 'manomesso';
  assert.throws(() => rileggiPartiRapporto(alterato), /impronta|integrit[àa]|integrity/i);
});

test('BC49: buco, ultimo prematuro, campo malformato e parte sovradimensionata non committano', async t => {
  const b = await banco(t);
  for (const p of [parti[1], pezzo(0), pezzo(1, '☕'.repeat(LIMITE_PARTE_RAPPORTO_BYTE)), { ...parti[0], parte: null }, { ...parti[0], fonti: {} }]) {
    assert.equal((await b.deposita(p)).ok, false);
  }
  assert.equal((await leggiGiornale({ cartella: b.cartella, id })).eventi.filter(e => e.kind === 'deposit_part').length, 0);
});

for (const conversazione of [false, true]) test(`BC49: caduta e ripresa ${conversazione ? 'con' : 'senza'} conversazione ripartono dalla parte dopo l'ultima committata`, async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  await aggiornaRicerca({ cartella: b.cartella, id, terminata: 'failed', motivoErrore: { classe: 'timeout-fornitore', transitorio: true } });
  b.sessioni.set(id, { cartella: b.cartella, taskId: 'ricerca', task: b.avviati[0].task, conclusa: true, messaggiFinali: conversazione ? [{ role: 'assistant', content: 'Interrotta.' }] : null });
  const dopoRiavvio = creaResearchOrchestrator(b.opzioni);
  assert.equal((await dopoRiavvio.riprendi({ cartella: b.cartella, id })).ok, true);
  const consegna = b.avviati.at(-1).messaggiIniziali.at(-1).content;
  assert.match(consegna, /(?:prossima parte|next part).*2/i);
  assert.match(consegna, /(?:non rigenerare|do not regenerate)/i);
  const ultima = await dopoRiavvio.componiRapporto({ cartella: b.cartella, id, domanda, ...parti[1] });
  assert.equal(ultima.ok, true);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.deepEqual(j.eventi.filter(e => e.kind === 'deposit_part').map(e => e.indice), [1, 2]);
});

test('BC49: JSON mozzato in coda non inghiotte la parte rispedita dopo il riavvio', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  const path = percorsoGiornale(b.cartella, id);
  await writeFile(path, '{"kind":"deposit_part","indice":2', { flag: 'a' });
  assert.equal((await b.deposita(parti[1])).ok, true);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(j.righeSaltate, 1);
  assert.equal(rileggiPartiRapporto(j.eventi).parti.length, 2);
});

test('BC49: ultimo vuoto sigilla, ripetizione finale dopo riavvio riusa documento e giudizio', async t => {
  const b = await banco(t);
  await b.deposita({ ...parti[0], testo: unico.testo });
  const chiusura = pezzo(2, '', true);
  const finito = await b.deposita(chiusura);
  assert.equal(finito.ok, true);
  const prima = await leggiGiornale({ cartella: b.cartella, id });
  const nuovo = creaResearchOrchestrator(b.opzioni);
  const ripetuto = await nuovo.componiRapporto({ cartella: b.cartella, id, domanda, ...chiusura });
  assert.equal(ripetuto.documento, finito.documento);
  const dopo = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(dopo.eventi.length, prima.eventi.length);
  assert.equal((await b.deposita(pezzo(3, 'aggiunta', true))).ok, false);
});

test('BC49: scrittura del giornale fallita non conferma né pubblica una parte', async t => {
  let guasta = false;
  const { accodaEvento } = await import('../src/research-store.mjs');
  const b = await banco(t, { accodaEventoFn: a => { if (guasta) throw new Error('disco pieno'); return accodaEvento(a); } });
  guasta = true;
  await assert.rejects(b.deposita(parti[0]), /disco pieno/);
  await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
  assert.equal((await leggiGiornale({ cartella: b.cartella, id })).eventi.filter(e => e.kind === 'deposit_part').length, 0);
});

async function giroKernel(cartella, argomenti, compositore, livelloAccesso = 'ricerca') {
  const richieste = [], eventi = [];
  await talosLavora({
    cartella, task: { consegna: 'Deposita il rapporto.', ricercaId: id, ricercaDomanda: domanda },
    modello: 'x', chiave: 'y', livelloAccesso, strumentiEstesi: ['research_deposit'],
    componiRapportoRicercaFn: compositore, onGiro: e => eventi.push(e),
    fetchDiRete: async (_url, opzioni) => {
      richieste.push(JSON.parse(opzioni.body));
      const message = richieste.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_bc49', function: { name: 'research_deposit', arguments: JSON.stringify(argomenti) } }] }
        : { role: 'assistant', content: 'Pronto.', tool_calls: [] };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
    },
  });
  return { risposta: richieste.at(-1).messages.find(m => m.role === 'tool')?.content, eventi };
}

test('BC49: kernel conferma la parte senza rapporto incompleto; assenza adattatore e guasto falliscono chiusi', async t => {
  const b = await banco(t);
  const r = await giroKernel(b.cartella, parti[0], a => b.deposita(a));
  assert.match(r.risposta, /(?:parte 1.*registrata|part 1.*recorded)/i);
  await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
  for (const fn of [undefined, async () => { throw new Error('disco pieno'); }]) {
    const rifiuto = await giroKernel(b.cartella, parti[1], fn);
    assert.match(rifiuto.risposta, /^FAILED\./); // H-05 (owner 02/10/2026): un guasto nostro, non un rifiuto di sicurezza
    await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
  }
});

test('BC49: permesso negato non chiama il compositore e non scrive il giornale', async t => {
  const b = await banco(t);
  let chiamate = 0;
  await giroKernel(b.cartella, parti[0], async () => { chiamate++; return { ok: true }; }, 'lettura');
  assert.equal(chiamate, 0);
});

test('BC49: deposito unico del banco resta byte per byte, anche senza adattatore', async t => {
  const b = await banco(t);
  const testo = '  # Rapporto\r\n\r\nCaffè ☕\n\n## Fonti\nhttps://esempio.invalid/a\n  ';
  const r = await giroKernel(b.cartella, { testo }, undefined);
  assert.equal(await readFile(percorsoRapporto(b.cartella, id), 'utf8'), testo);
  assert.match(r.risposta, /^deposited:/);
});

test('BC49: inventario e campi TALOS-BANCO invariati, eccetto le esenzioni dichiarate (deposito, paginazione, modifica, Ask, dialogo agenti, Workflow, lotti, lettura byte)', () => {
  /* 27/09/2026 — l'impronta estesa passa da 3b1ec130… a 105dd078… per l'esenzione della prosa di memory_search/update/delete
   * (vedi sotto). ⛔ Non è stata indovinata: la STESSA esenzione applicata all'inventario del commit 93e99fe2a (prima dei sei
   * attrezzi nuovi) dà 105dd078… anche lì — prova misurata che nient'altro è cambiato. La base (38d65a3f…) non si tocca. */
  for (const [attrezzi, impronta] of [[ATTREZZI_OPENAI, '38d65a3f445bf470c5f79ace0b662ae1eaf619b22cbfabbe885676ee5c5bfd4b'], [ATTREZZI_ESTESI_OPENAI, '105dd0788308b6fd1c637740053cf88e41146b3662a7ef5e00b0495bcd964cbc']]) {
    /* ⛔ PO-12 (13/09/2026) — TERZA esenzione, e la piu' forte delle tre: l'attrezzo NUOVO
     * (`file_edit`) si toglie INTERO dalla copia prima di misurare. Cosi' le due impronte qui
     * sopra NON sono state ristampate — sono le stesse identiche di ieri, e il fatto che
     * combacino ancora e' la prova misurata che dei 43 attrezzi precedenti non e' cambiato un
     * byte: ne' un nome, ne' una descrizione, ne' un campo.
     * ⛔ Prima di toglierlo si asserisce CHE COSA e': se un domani cambiassero i suoi campi o
     *   diventasse obbligatorio `replace_all`, questa prova cade invece di tacere — che e'
     *   esattamente il motivo per cui il cancello esiste.
     * ⛔ E si asserisce che sia ESTESO e non BASE: la lista base e' il metro del banco (sette
     *   nomi, ~505 token), e spostarlo li' dentro cambierebbe il preambolo di ogni campagna.
     *   Anche questo e' un modo in cui il cancello puo' diventare rosso, ed e' voluto. */
    const modifica = attrezzi.map((t) => t.function ?? t).find((f) => f.name === 'file_edit');
    if (attrezzi === ATTREZZI_OPENAI) {
      assert.equal(modifica, undefined, 'file_edit deve restare un attrezzo ESTESO: la lista base del banco non si allunga');
    }
    else {
      assert.ok(modifica, 'file_edit e\' sparito dagli attrezzi estesi: il modello non ha piu\' un attrezzo di modifica');
      const schemaModifica = modifica.parameters ?? modifica.input_schema;
      assert.deepEqual(Object.keys(schemaModifica.properties).sort(), ['new_string', 'old_string', 'percorso', 'replace_all']);
      assert.deepEqual([...schemaModifica.required].sort(), ['new_string', 'old_string', 'percorso']);
      assert.equal(schemaModifica.required.includes('replace_all'), false, 'replace_all deve restare OPZIONALE: il default e\' il match unico');
    }
    /* ⛔ 21/09/2026 — Ask Question è un attrezzo esteso nuovo e intenzionale. Come `file_edit`,
     * si esclude dal censimento storico soltanto DOPO averne fissato tutta la forma pubblica:
     * così il vecchio hash continua a provare che nessuno dei 43 attrezzi precedenti è mutato. */
    const domanda = attrezzi.map((t) => t.function ?? t).find((f) => f.name === 'ask_user_question');
    if (attrezzi === ATTREZZI_OPENAI) {
      assert.equal(domanda, undefined, 'ask_user_question deve restare un attrezzo ESTESO: il banco base non cambia');
    } else {
      assert.ok(domanda, 'ask_user_question è sparito dagli attrezzi estesi');
      const schemaDomanda = domanda.parameters ?? domanda.input_schema;
      assert.deepEqual(Object.keys(schemaDomanda.properties), ['questions']);
      assert.deepEqual(schemaDomanda.required, ['questions']);
      const domande = schemaDomanda.properties.questions;
      assert.equal(domande.type, 'array');
      assert.equal(domande.minItems, 1);
      // 23/09/2026, decisione owner: 1-4 domande × 2-4 opzioni (era 1-3 × 2-5), come AskUserQuestion di Claude Code.
      assert.equal(domande.maxItems, 4);
      // 24/09/2026, decisione owner 32: «perché conta» obbligatorio (`why`) e al più un'opzione consigliata (`recommended`).
      // 02/10/2026, tappa 3 CLI (decisione owner «Estendo il contratto»): titolo breve `header` ≤ 12, facoltativo.
      assert.deepEqual(Object.keys(domande.items.properties).sort(), ['header', 'id', 'multiSelect', 'options', 'question', 'why']);
      assert.equal(domande.items.properties.header.maxLength, 12);
      assert.deepEqual([...domande.items.required].sort(), ['id', 'question', 'why']);
      assert.equal(domande.items.properties.why.type, 'string');
      assert.equal(domande.items.properties.why.maxLength, 300);
      assert.equal(domande.items.properties.id.maxLength, 64);
      assert.equal(domande.items.properties.id.pattern, '^[a-z][a-z0-9_]*$');
      assert.equal(domande.items.properties.question.maxLength, 600);
      const opzioni = domande.items.properties.options;
      assert.equal(opzioni.minItems, 2);
      assert.equal(opzioni.maxItems, 4);
      // 02/10/2026, tappa 3 CLI: anteprima per opzione, facoltativa, ≤ 2.000 caratteri.
      assert.deepEqual(Object.keys(opzioni.items.properties).sort(), ['description', 'label', 'preview', 'recommended']);
      assert.equal(opzioni.items.properties.preview.maxLength, 2000);
      assert.equal(opzioni.items.properties.recommended.type, 'boolean');
      assert.deepEqual([...opzioni.items.required].sort(), ['description', 'label']);
      assert.equal(opzioni.items.properties.label.maxLength, 120);
      assert.equal(opzioni.items.properties.description.maxLength, 300);
      assert.equal(domande.items.properties.multiSelect.type, 'boolean');
    }
    /* BE-AGENT-DIALOGUE-01: quattro tool estesi nuovi, nessuno nel banco base.
     * Fissarne nomi e campi prima di escluderli dall'impronta STORICA. */
    const dialogueTools = {
      ask_parent: ['question'],
      answer_child_question: ['childId', 'requestId', 'answer'],
      ask_child: ['childId', 'question'],
      answer_parent_question: ['requestId', 'answer'],
      /* K3 (F-014, 03/10/2026): elenco e stop dei figli diretti, estesi e nuovi come i quattro sopra — forma fissata qui,
         poi esclusi dall'impronta STORICA, che continua a provare che nessun attrezzo precedente è cambiato. */
      /* C3 tappa 4 (owner 09/10/2026, «due attrezzi nuovi accanto» a stop_child): pausa e ripresa di un figlio diretto, estesi e
         nuovi come stop_child — forma fissata qui, poi esclusi dall'impronta STORICA. ⛔ Il preambolo degli attrezzi ESTESI ha
         due voci in più: una campagna del banco con le deleghe, prima e dopo il 09/10, non ha lo stesso preambolo. */
      /* C5 (owner 10/10/2026): stop_child, pause_child e resume_child sono UN attrezzo, `child_control` con `action`. */
      child_control: ['action', 'childId'],
    };
    for (const [name, fields] of Object.entries(dialogueTools)) {
      const tool = attrezzi.map((entry) => entry.function ?? entry).find((entry) => entry.name === name);
      if (attrezzi === ATTREZZI_OPENAI) assert.equal(tool, undefined, `${name} non deve entrare nel banco base`);
      else {
        assert.ok(tool, `${name} deve essere un attrezzo esteso`);
        const schema = tool.parameters ?? tool.input_schema;
        assert.equal(schema.type, 'object');
        assert.deepEqual(Object.keys(schema.properties).sort(), [...fields].sort());
        assert.deepEqual([...schema.required].sort(), [...fields].sort());
        for (const field of fields) assert.equal(schema.properties[field].type, 'string');
      }
    }
    const workflowTool = attrezzi.map((entry) => entry.function ?? entry).find((entry) => entry.name === 'workflow_plan_propose');
    if (attrezzi === ATTREZZI_OPENAI) assert.equal(workflowTool, undefined, 'Workflow planning must remain an extended tool');
    else {
      assert.ok(workflowTool, 'Workflow planning tool is missing');
      const schema = workflowTool.parameters ?? workflowTool.input_schema;
      assert.equal(schema.type, 'object');
      /* F3-11b (24/09/2026 notte, decisione owner 40): il modello vede SOLO la bozza corta; `core` resta per le prove e le API
       * interne e non si annuncia più. La forma della bozza la fissa per intero WF-DRAFT-SCHEMA-PARITY. */
      assert.deepEqual(Object.keys(schema.properties), ['draft']);
      assert.equal(schema.properties.draft.type, 'object');
      assert.deepEqual([...schema.properties.draft.required].sort(), ['nodes', 'objective', 'phases', 'title']);
      assert.equal(schema.properties.draft.additionalProperties, false);
      assert.deepEqual(schema.required, ['draft']);
      assert.equal(schema.additionalProperties, false);
      assert.match(workflowTool.description, /draft.*phases/u);
      // F3-10 (23/09/2026): il modo «Workflow» è ritirato; la descrizione non promette più un modo che il modello non vede.
      assert.doesNotMatch(workflowTool.description, /Workflow mode|Plan or Workflow/u);
    }
    /* 0.1.19: F-012 e richiesta Piano sono quattro tool estesi nuovi. Si verifica
       il loro contratto prima di escluderli dall'impronta storica. */
    const runTools = {
      workflow_status: [['runId'], []],
      workflow_output: [['limit', 'nodeId', 'offset', 'resultId', 'runId'], ['nodeId', 'runId']],
      workflow_control: [['azione', 'runId'], ['azione', 'runId']],
      request_plan_mode: [[], []],
    };
    for (const [name, [fields, required]] of Object.entries(runTools)) {
      const tool = attrezzi.map((entry) => entry.function ?? entry).find((entry) => entry.name === name);
      if (attrezzi === ATTREZZI_OPENAI) assert.equal(tool, undefined, `${name} non deve entrare nel banco base`);
      else {
        assert.ok(tool, `${name} deve essere esteso`);
        const schema = tool.parameters ?? tool.input_schema;
        assert.equal(schema.type, 'object');
        assert.deepEqual(Object.keys(schema.properties).sort(), fields, name);
        assert.deepEqual([...schema.required].sort(), required, name);
      }
    }
    /* 24/09/2026, decisione owner 36 — `present_plan` è un attrezzo esteso NUOVO e intenzionale (il piano approvabile, come
     * ExitPlanMode di Claude Code). Come gli altri, si fissa tutta la sua forma pubblica PRIMA di escluderlo dal censimento
     * storico: così l'impronta vecchia resta la prova che nessuno degli attrezzi precedenti è cambiato. */
    const pianoTool = attrezzi.map((entry) => entry.function ?? entry).find((entry) => entry.name === 'present_plan');
    if (attrezzi === ATTREZZI_OPENAI) assert.equal(pianoTool, undefined, 'present_plan deve restare un attrezzo ESTESO: il banco base non cambia');
    else {
      assert.ok(pianoTool, 'present_plan è sparito dagli attrezzi estesi');
      const schema = pianoTool.parameters ?? pianoTool.input_schema;
      assert.equal(schema.type, 'object');
      assert.deepEqual(Object.keys(schema.properties), ['plan']);
      assert.deepEqual(schema.required, ['plan']);
      assert.equal(schema.properties.plan.type, 'string');
      assert.equal(schema.properties.plan.maxLength, 100_000);
      assert.match(pianoTool.description, /Plan mode/u);
    }
    /* ⭐ 27/09/2026, decisione owner (memoria `decisioni-owner-capacita-sezioni-27-09`) — sei attrezzi estesi NUOVI di sola
     * lettura (elenco della memoria, cerca e leggi nelle note, cerca in attività e ricerche, Board e Conversazioni). Come gli
     * altri nuovi: nomi, campi e obbligatori fissati qui PRIMA di toglierli dal censimento storico; nessuno entra nella base. */
    const lettureSezioni = {
      notes_read: [['from', 'id'], ['id']],
      // C1 (owner 09/10/2026, il metodo approvato): `this_conversation` cerca e rilegge la conversazione corrente dopo una compattazione
      conversation_search: [['around_message', 'conversation_id', 'folder', 'from', 'limit', 'query', 'status', 'this_conversation', 'window'], []],
    };
    for (const [nome, [campi, obbligatori]] of Object.entries(lettureSezioni)) {
      const tool = attrezzi.map((entry) => entry.function ?? entry).find((entry) => entry.name === nome);
      if (attrezzi === ATTREZZI_OPENAI) assert.equal(tool, undefined, `${nome} non deve entrare nel banco base`);
      else {
        assert.ok(tool, `${nome} deve essere un attrezzo esteso`);
        const schema = tool.parameters ?? tool.input_schema;
        assert.deepEqual(Object.keys(schema.properties).sort(), campi, nome);
        assert.deepEqual([...(schema.required ?? [])].sort(), obbligatori, nome);
      }
    }
    /* Automazioni a due porte (owner 08/10/2026 notte): otto attrezzi estesi NUOVI. Come gli altri: nomi, campi e obbligatori
     * fissati qui PRIMA di toglierli dal censimento storico, nessuno nella base — le due impronte restano quelle di prima. */
    const attrezziAutomazioni = {
      automation_list: [['cursor', 'limit', 'next_run_before', 'response_format', 'state'], []], // C5: filtri e pagine
      automation_runs: [['id', 'limit'], ['id']],
      automation_create: [['cartella', 'coordinazione', 'istruzioni', 'modello', 'nome', 'permessi', 'pianificazione', 'ripeti'], ['istruzioni', 'nome', 'pianificazione']],
      automation_update: [['cartella', 'coordinazione', 'id', 'istruzioni', 'modello', 'nome', 'permessi', 'pianificazione', 'prossimoGiroAlle', 'ripeti'], ['id']],
      // C5 (owner 10/10/2026): pause/resume/run/stop sono UN attrezzo, `automation_control` con `action`
      automation_control: [['action', 'contesto', 'id'], ['action', 'id']],
    };
    /* ⭐ 0.1.25 (owner 09/10/2026): tre attrezzi estesi NUOVI dei fornitori esclusi (la seconda porta della decisione 14). Come
     * le automazioni: nomi, campi e obbligatori fissati qui PRIMA di toglierli dal censimento storico; le due impronte restano. */
    Object.assign(attrezziAutomazioni, {
      provider_exclusions_list: [[], []],
      provider_exclude: [['model', 'provider'], ['provider']],
      provider_allow: [['model', 'provider'], ['provider']],
    });
    for (const [nome, [campi, obbligatori]] of Object.entries(attrezziAutomazioni)) {
      const tool = attrezzi.map((entry) => entry.function ?? entry).find((entry) => entry.name === nome);
      if (attrezzi === ATTREZZI_OPENAI) assert.equal(tool, undefined, `${nome} non deve entrare nel banco base`);
      else {
        assert.ok(tool, `${nome} deve essere un attrezzo esteso`);
        const schema = tool.parameters ?? tool.input_schema;
        assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), campi, nome);
        assert.deepEqual([...(schema.required ?? [])].sort(), obbligatori, nome);
      }
    }
    // OUTPUT15: validate the new read contract before exempting this one addition.
    // Both historic hashes remain unchanged and still protect every previous tool.
    const processOutput = attrezzi.map(t => t.function ?? t).find(f => f.name === 'process_output');
    if (attrezzi === ATTREZZI_OPENAI) assert.equal(processOutput, undefined);
    else {
      assert.ok(processOutput);
      /* OEM36 (owner 30/09 sera): `encoding` FACOLTATIVO, elenco chiuso, mai obbligatorio. Si asserisce che cosa è, poi il
       * resto dello schema deve restare identico a OUTPUT15. */
      const schemaProcessOutput = structuredClone(processOutput.parameters ?? processOutput.input_schema);
      assert.deepEqual(schemaProcessOutput.properties.encoding.enum, ['utf-8', 'cp437', 'cp850', 'cp852', 'cp866', 'windows-1251', 'windows-1252']);
      assert.equal(schemaProcessOutput.properties.encoding.type, 'string');
      assert.match(schemaProcessOutput.properties.encoding.description, /Never guessed; default UTF-8/);
      delete schemaProcessOutput.properties.encoding;
      assert.deepEqual(schemaProcessOutput, {
        type: 'object', additionalProperties: false,
        properties: {
          outputId: {type: 'string'}, stream: {type: 'string', enum: ['stdout', 'stderr']},
          offset: {type: 'integer', minimum: 0}, limit: {type: 'integer', minimum: 4, maximum: 4096},
        }, required: ['outputId'],
      });
      assert.match(processOutput.description, /Read-only; never reruns the command/);
      assert.match(processOutput.description, /BYTES; follow nextOffset/);
    }
    /* ⭐ C5 (owner 10/10/2026, «parametrizzare E accorpare»; contratto `.claude/CONTRATTO-C5-ATTREZZI-BOZZA-2026-10-10.md`) —
     * esenzione DICHIARATA come le altre, in tre parti:
     *   1. `list_children` guadagna i parametri del contratto degli elenchi (filtri, ordine, limit, cursore, formato): si
     *      asserisce la forma intera e resta fuori dall'impronta, come prima;
     *   2. `notes_find` e `tasks_find` PRENDONO IL POSTO di `notes_list` e `tasks_list` (e accorpano `notes_search` e
     *      `tasks_search`, che erano già esclusi): si asserisce la loro forma, poi nella copia si rimette AL LORO POSTO la
     *      definizione storica, congelata qui sotto byte per byte dalla base r4 6135b4eaa;
     *   3. le descrizioni delle scritture di note e attività dicono «from notes_find / tasks_find»: si asserisce, poi nella copia
     *      si riporta il nome vecchio.
     *   ⇒ L'impronta estesa resta 105dd078…: prova misurata che, oltre a questo, nessun attrezzo è cambiato di un byte.
     *   ⛔ Il preambolo degli attrezzi ESTESI è cambiato il 10/10 (due attrezzi in meno, parametri nuovi): una campagna del banco
     *     prima e dopo la C5 non ha lo stesso preambolo, e va detto quando le si confronta. */
    const C5_STORICI = {
      notes_find: {"type":"function","function":{"name":"notes_list","description":"List the notes the user keeps, most recently updated first.","parameters":{"type":"object","properties":{"limit":{"type":"number","description":"Maximum notes to return (1-50, default 20)."}}}}},
      library_find: [{"type":"function","function":{"name":"library_list","description":"List, count or filter the files in this project's Library. Use this when asked what/all files are in the Library without a keyword; use library_search only for filename or content matching. The first page already reports the TOTAL, so answer \"how many\" or \"what is in there\" from it alone, without paging. Paging past the first couple of pages of one listing is REFUSED unless you set browse_every_page, which you may do only when the person explicitly asked to see or act on EVERY entry, repeating the same origin and file_type filters; never page through the whole Library just to look around, and never because the conversation merely mentioned files.","parameters":{"type":"object","properties":{"origin":{"type":"string","enum":["all","uploaded","generated"],"description":"Filter by how the file entered the Library. Default all."},"file_type":{"type":"string","enum":["all","image","document","link"],"description":"Filter images, ordinary documents, or archived web links. Default all."},"page_size":{"type":"number","description":"Maximum entries in this page (1-20, default 10)."},"page_token":{"type":"string","description":"Opaque next_page_token from the preceding library_list result. Repeat the same filters."},"browse_every_page":{"type":"boolean","description":"Set true ONLY when the person explicitly asked to see or act on EVERY entry in the Library. It unlocks further pages of the same listing, up to a hard ceiling. Never set it to look around, to count files, or because the listing looked interesting."}}}}}, {"type":"function","function":{"name":"library_search","description":"Search this project's Library files and return a bounded page of genuine matches with their id, name, origin and a short excerpt. Use it before answering questions about the project's own Library files. The first page reports the TOTAL number of matches: answer from it rather than walking the results. Paging past the first couple of pages of the same search is REFUSED unless you set browse_every_page, which you may do only when the person explicitly asked to see or act on EVERY match; a different query counts as a new search and starts over.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"What to look for, in natural language."},"limit":{"type":"number","description":"How many matching files to return in this page (1-20, default 5)."},"offset":{"type":"number","description":"Zero-based result offset. Use next_offset from the previous page."},"browse_every_page":{"type":"boolean","description":"Set true ONLY when the person explicitly asked to see or act on EVERY match. It unlocks further pages of the same search, up to a hard ceiling. Never set it to look around."}},"required":["query"]}}}],
      research_find: {"type":"function","function":{"name":"research_list","description":"List the deep researches run on this project, with how each one ended and how far it got. Use this whenever the user asks about their researches — what they investigated, which ones are still running, which failed. The first page reports the total: do not keep advancing the offset unless the user explicitly asked for every entry. Do NOT use library_list for that: research reports are saved as Library files, so library_list finds them mixed in with every other document and cannot say whether a research finished, was paused, or failed.","parameters":{"type":"object","properties":{"status":{"type":"string","enum":["all","running","paused","done","cancelled","failed"],"description":"Filter by how it ended. `running` and `paused` are the ones still worth acting on. Default all."},"page_size":{"type":"number","description":"Maximum entries in this page (1-20, default 10)."},"offset":{"type":"number","description":"How many to skip, newest first (default 0)."},"browse_every_page":{"type":"boolean","description":"Set true only when the person explicitly asked to see or act on every research entry."}},"required":[]}}},
      memory_find: {"type":"function","function":{"name":"memory_search","description":"Search what the user has explicitly asked TALOS to remember. Every word counts on its own (accents and case do not matter); an empty query or \"*\" returns them all.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"Words to look for in the memories' titles and text."},"limit":{"type":"number","description":"Maximum matches to return (1-20, default 5)."}},"required":["query"]}}},
      tasks_find: {"type":"function","function":{"name":"tasks_list","description":"List the user's tasks with their status and priority, most recently updated first.","parameters":{"type":"object","properties":{"status":{"type":"string","enum":["all","open","done"],"description":"Filter by completion. Default all."},"limit":{"type":"number","description":"Maximum tasks to return (1-50, default 20)."}}}}},
      // research_control prende il posto di TRE attrezzi storici, in fila come erano (research_pause, research_resume, research_cancel)
      research_control: [{"type":"function","function":{"name":"research_pause","description":"Stop a running research, keeping everything it has collected so far. It can be resumed later with research_resume. Use this when the user wants it to stop for now. If they want it stopped for good, use research_cancel.","parameters":{"type":"object","properties":{"id":{"type":"string","description":"The research id, from research_list."}},"required":["id"]}}},{"type":"function","function":{"name":"research_resume","description":"Carry on a research that was paused, from where it stopped. The ones worth resuming show as paused.","parameters":{"type":"object","properties":{"id":{"type":"string","description":"The research id, from research_list."}},"required":["id"]}}},{"type":"function","function":{"name":"research_cancel","description":"Stop a research for good. What it already collected stays readable; nothing more is searched or paid for. Prefer research_pause when the user only wants it to stop for now: a cancelled research cannot be resumed.","parameters":{"type":"object","properties":{"id":{"type":"string","description":"The research id, from research_list."}},"required":["id"]}}}],
    };
    const C5_FORME = {
      list_children: ['cursor', 'limit', 'response_format', 'sort', 'status', 'workflow'],
      notes_find: ['cursor', 'limit', 'query', 'response_format', 'sort'],
      tasks_find: ['cursor', 'limit', 'query', 'response_format', 'sort', 'status'],
      memory_find: ['cursor', 'kind', 'limit', 'query', 'response_format', 'sort'],
      research_find: ['browse_every_page', 'cursor', 'limit', 'query', 'response_format', 'since', 'sort', 'status', 'until'],
      library_find: ['browse_every_page', 'cursor', 'file_type', 'limit', 'origin', 'query', 'response_format', 'sort'],
    };
    for (const [nome, campi] of Object.entries(C5_FORME)) {
      const tool = attrezzi.map((entry) => entry.function ?? entry).find((entry) => entry.name === nome);
      if (attrezzi === ATTREZZI_OPENAI) { assert.equal(tool, undefined, `${nome} non deve entrare nel banco base`); continue; }
      assert.ok(tool, `${nome} deve essere un attrezzo esteso`);
      const schema = tool.parameters ?? tool.input_schema;
      assert.deepEqual(Object.keys(schema.properties).sort(), campi, nome);
      assert.deepEqual(schema.required ?? [], [], `${nome}: nessun campo obbligatorio`);
      assert.deepEqual(schema.properties.limit, { type: 'integer', minimum: 1, maximum: 100, description: 'Max items (default 20).' }, nome);
      assert.deepEqual(schema.properties.response_format.enum, ['concise', 'detailed'], nome);
    }
    if (attrezzi !== ATTREZZI_OPENAI) {
      const controllo = attrezzi.map((entry) => entry.function ?? entry).find((entry) => entry.name === 'research_control');
      assert.ok(controllo, 'research_control deve essere un attrezzo esteso');
      const schema = controllo.parameters ?? controllo.input_schema;
      assert.deepEqual(Object.keys(schema.properties).sort(), ['action', 'id'], 'research_control');
      assert.deepEqual(schema.properties.action.enum, ['pause', 'resume', 'cancel'], 'research_control');
      assert.deepEqual([...schema.required].sort(), ['action', 'id'], 'research_control');
    }
    for (const vecchio of ['notes_list', 'notes_search', 'tasks_list', 'tasks_search', 'memory_list', 'memory_search', 'research_list', 'research_search', 'library_list', 'library_search', 'research_pause', 'research_resume', 'research_cancel']) {
      assert.equal(attrezzi.some((t) => (t.function ?? t).name === vecchio), false, `${vecchio}: accorpato dalla C5, non si offre più`);
    }
    const copia = structuredClone(attrezzi).filter((t) => !['list_children', 'process_output', 'file_edit', 'ask_user_question', 'present_plan', 'workflow_plan_propose', ...Object.keys(runTools), ...Object.keys(dialogueTools), ...Object.keys(lettureSezioni), ...Object.keys(attrezziAutomazioni)].includes((t.function ?? t).name));
    /* C5: al posto dei due attrezzi accorpati si rimette la definizione storica, e le scritture tornano a nominare il nome vecchio
     * — DOPO aver asserito che oggi nominano quello nuovo (sopra la spiegazione intera). */
    for (let i = 0; i < copia.length; i += 1) {
      const nome = (copia[i].function ?? copia[i]).name;
      if (Object.hasOwn(C5_STORICI, nome)) {
        // library_find prende il posto di DUE attrezzi storici, in fila come erano (library_list, poi library_search)
        const storici = [].concat(structuredClone(C5_STORICI[nome]));
        copia.splice(i, 1, ...storici);
        i += storici.length - 1;
        continue;
      }
      if (['library_read', 'library_file_origin', 'library_rename', 'library_delete'].includes(nome)) {
        const json = JSON.stringify(copia[i]);
        assert.ok(json.includes('library_find') && !/library_(list|search)/u.test(json), `${nome}: deve nominare solo library_find per l'id`);
        copia[i] = JSON.parse(json.replaceAll('library_find', 'library_list or library_search'));
        continue;
      }
      const scrittura = { notes_update: 'notes', notes_delete: 'notes', tasks_complete: 'tasks', tasks_update: 'tasks', tasks_delete: 'tasks',
        research_start: 'research', research_read: 'research', research_rename: 'research', research_delete: 'research' }[nome];
      /* C5 memoria: le descrizioni di memory_update/memory_delete si tolgono più sotto (esenzione del 27/09); qui torna solo il
         campo id di memory_update, che diceva «as returned by memory_search». */
      if (nome === 'memory_update') {
        const id = (copia[i].function ?? copia[i]).parameters.properties.id;
        assert.equal(id.description, 'The memory id, as returned by memory_find.', 'memory_update: l\'id viene da memory_find');
        id.description = 'The memory id, as returned by memory_search.';
        continue;
      }
      if (!scrittura) continue;
      let json = JSON.stringify(copia[i]);
      if (nome === 'research_delete') {
        // C5: research_cancel è accorpato in research_control; la descrizione del delete lo nomina col nome nuovo e l'azione
        const nuovo = JSON.stringify('Prefer research_control with action "cancel"').slice(1, -1);
        assert.ok(json.includes(nuovo), 'research_delete: deve nominare research_control con l\'azione cancel');
        json = json.replace(nuovo, 'Prefer research_cancel');
      }
      assert.ok(json.includes(`${scrittura}_find`), `${nome}: deve nominare ${scrittura}_find per l'id`);
      assert.equal(json.includes(`${scrittura}_list`), false, `${nome}: non deve più nominare ${scrittura}_list`);
      copia[i] = JSON.parse(json.replaceAll(`${scrittura}_find`, `${scrittura}_list`));
    }
    for (const t of copia) {
      const f = t.function ?? t;
      /* C5 (owner 10/10/2026 sera, «Limite + cursore + profondità»), esenzione dichiarata: `elenca` guadagna `depth`, `limit`,
       * `cursor` e una frase sulle pagine. ⛔ Cambia il preambolo BASE del banco (le campagne prima e dopo non hanno lo stesso
       * preambolo; il braccio A dell'A/B della C5 si rifà). Prima si asserisce che cosa sono, poi si tolgono dalla copia. */
      if (f.name === 'elenca') {
        const schema = f.parameters ?? f.input_schema;
        assert.deepEqual(Object.keys(schema.properties).sort(), ['browse_every_page', 'cursor', 'depth', 'limit', 'percorso']);
        assert.equal(schema.properties.browse_every_page.type, 'boolean');
        assert.deepEqual(schema.required, []);
        assert.deepEqual([schema.properties.depth.type, schema.properties.depth.minimum, schema.properties.depth.maximum], ['integer', 1, 3]);
        assert.deepEqual([schema.properties.limit.type, schema.properties.limit.minimum, schema.properties.limit.maximum], ['integer', 1, 500]);
        assert.equal(schema.properties.cursor.type, 'string');
        const frase = ' A big folder comes in pages sorted by path, and the first page already reports the TOTAL: answer from it, open a '
          + 'narrower folder, or use "cerca". Paging past the first couple of pages of one folder is REFUSED unless you set '
          + 'browse_every_page, which you may do only when the person explicitly asked to see or act on EVERY entry.';
        assert.ok(f.description.endsWith(frase), 'elenca: the description says the pages');
        f.description = f.description.slice(0, -frase.length);
        for (const k of ['depth', 'limit', 'cursor', 'browse_every_page']) delete schema.properties[k];
      }
      if (f.name === 'cerca') {
        const schema = f.parameters ?? f.input_schema;
        assert.deepEqual(Object.keys(schema.properties).sort(), ['continua', 'dentro', 'nome', 'offset', 'testo']);
        assert.deepEqual(schema.required, []);
        /* F001b (01/10/2026), esenzione dichiarata col sì dell'owner dello stesso giorno («Ricerca che continua», «riferimento
         * esplicito»): `cerca` guadagna `continua`, il riferimento di una ricerca ancora viva. Si asserisce che cosa è
         * (stringa, facoltativa, e la prosa dice da dove viene), poi si toglie dalla copia come `offset`. */
        assert.equal(schema.properties.continua.type, 'string');
        assert.equal(schema.required.includes('continua'), false, 'cerca: continua NON deve essere obbligatorio');
        assert.match(schema.properties.continua.description, /Reference of a search still running, given by a previous cerca reply/u);
        assert.match(f.description, /gives a reference to pass as "continua"/u);
        delete schema.properties.continua;
        assert.equal(schema.properties.dentro.type, 'string');
        assert.match(f.description, /match BOTH are returned \(AND\)/u);
        assert.match(f.description, /Give "dentro" to search inside ONE subfolder/u);
        /* SEARCH34 (30/09/2026), esenzione dichiarata col sì dell'owner dello stesso giorno: `cerca` guadagna `offset`,
         * la pagina successiva contata in FILE mostrati. Come per BC-10 e i lotti: prima si asserisce che cosa è
         * (intero da 0, facoltativo, e la prosa dice che conta file e non byte), poi si toglie dalla copia. */
        assert.deepEqual(
          { type: schema.properties.offset.type, minimum: schema.properties.offset.minimum, maximum: schema.properties.offset.maximum },
          { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
        assert.equal(schema.required.includes('offset'), false, 'cerca: offset NON deve essere obbligatorio');
        assert.match(f.description, /"offset" skips matching FILES, not bytes or lines/u);
        delete schema.properties.dentro;
        delete schema.properties.offset;
        f.description = 'Finds files anywhere in the workspace, at any depth. '
          + 'Give "testo" to find files CONTAINING that text (e.g. the name of a failing test), '
          + 'and/or "nome" to match the file path. Returns matching paths, most relevant first.';
      }
      /* BUG-3/BUG-14 (3ec7cafea, 04/10/2026), esenzione dichiarata dal bugfixer l'08/10: `shell` e `prova` — DUE ATTREZZI DELLA
       * BASE del banco — guadagnano `timeout` (numero, ms prima di passare in sottofondo, NON di uccidere) e `background`
       * (booleano, in sottofondo subito). Quel commit non aveva toccato questa prova, che da allora era rossa (riprodotta dalla CLI
       * su r4 l'08/10). Si asserisce che cosa sono — facoltativi, col loro tipo, e la prosa dice «NOT killed» — poi si tolgono
       * dalla copia: l'impronta della base torna 38d65a3f…, prova misurata che degli altri campi non è cambiato niente.
       * ⛔ Il preambolo del banco però È cambiato (due campi in più per ognuno dei due attrezzi): una campagna prima del 04/10 e
       *   una dopo non hanno lo stesso preambolo, e va detto quando le si confronta. */
      if (f.name === 'shell' || f.name === 'prova') {
        const schema = f.parameters ?? f.input_schema;
        assert.equal(schema.properties.timeout?.type, 'number', `${f.name}: timeout deve essere un numero`);
        assert.equal(schema.properties.background?.type, 'boolean', `${f.name}: background deve essere un booleano`);
        assert.equal((schema.required ?? []).some((c) => c === 'timeout' || c === 'background'), false, `${f.name}: timeout e background restano FACOLTATIVI`);
        assert.match(schema.properties.timeout.description, /moved to the background \(NOT killed/u, `${f.name}: la scadenza sposta in sottofondo, non uccide`);
        delete schema.properties.timeout;
        delete schema.properties.background;
      }
      /* Owner 09/10/2026 (lane CLI, «Segue il modo + si chiede»): `shell` guadagna `network`, booleano FACOLTATIVO (la rete per quel
       * comando, chiesta alla persona fuori da Full access). Stessa esenzione dichiarata: si asserisce, poi si toglie; il preambolo del
       * banco cambia di un campo, e va detto quando si confrontano campagne di prima e di dopo. */
      if (f.name === 'shell') {
        const schema = f.parameters ?? f.input_schema;
        assert.equal(schema.properties.network?.type, 'boolean', 'shell: network deve essere un booleano');
        assert.equal((schema.required ?? []).includes('network'), false, 'shell: network resta FACOLTATIVO');
        delete schema.properties.network;
      }
      if (f.name === 'research_deposit') {
        const schema = f.parameters ?? f.input_schema;
        assert.ok(schema.properties.parte);
        assert.equal(schema.required.includes('parte'), false);
        delete schema.properties.parte;
        delete f.description;
      }
      /* ⛔ BC-10 (13/09/2026) — esenzione AGGIUNTA, e il motivo conta piu' del codice.
       * La cura di BC-10 ha dato ai due attrezzi della Libreria un campo OPZIONALE di sblocco e ha
       * riscritto le loro descrizioni, quindi l'impronta dell'inventario e' cambiata per davvero.
       * Ristampare l'impronta e basta avrebbe SPENTO questa guardia: da quel momento avrebbe detto
       * «tutto invariato» qualunque cosa cambiasse.
       * ⇒ Si esenta solo cio' che e' cambiato APPOSTA, asserendo prima che il campo esista e che sia
       * opzionale: se un domani diventasse obbligatorio, o sparisse, questa prova cade.
       * ⇒ L'impronta nuova non e' indovinata: applicando questa stessa esenzione all'inventario del
       * commit precedente e a quello di oggi, le due impronte COINCIDONO — prova misurata che
       * nient'altro e' cambiato. La descrizione e' prosa per il modello, non il contratto del banco. */
      if (f.name === 'library_list' || f.name === 'library_search') {
        const schema = f.parameters ?? f.input_schema;
        assert.ok(schema.properties.browse_every_page, `${f.name}: manca il campo di sblocco`);
        assert.equal((schema.required ?? []).includes('browse_every_page'), false, `${f.name}: il campo di sblocco NON deve essere obbligatorio`);
        delete schema.properties.browse_every_page;
        delete f.description;
      }
      /* FASE 3 (15/09/2026) — research_list e' il terzo attrezzo realmente paginato.
       * Riceve lo stesso sblocco esplicito dei due attrezzi Libreria; il campo resta
       * opzionale e viene tolto soltanto dalla copia usata da questo censimento storico. */
      if (f.name === 'research_list') {
        const schema = f.parameters ?? f.input_schema;
        assert.ok(schema.properties.browse_every_page, 'research_list: manca il campo di sblocco');
        assert.equal((schema.required ?? []).includes('browse_every_page'), false, 'research_list: il campo di sblocco NON deve essere obbligatorio');
        assert.match(f.description, /first page reports the total/i, 'research_list: la descrizione deve spiegare il tetto al modello');
        delete schema.properties.browse_every_page;
        f.description = 'List the deep researches run on this project, with how each one ended and how far it got. Use this whenever the user asks about their researches — what they investigated, which ones are still running, which failed. Do NOT use library_list for that: research reports are saved as Library files, so library_list finds them mixed in with every other document and cannot say whether a research finished, was paused, or failed.';
      }
      /* ⭐ LOTTI (16/09/2026) — quarta esenzione: `library_delete` guadagna il campo OPZIONALE
       * `ids` per cancellare piu' file della Libreria in UNA chiamata (tetto 100), e la
       * description lo spiega al modello. Come per BC-10: si asserisce CHE COSA e' — `ids`
       * esiste, NON e' obbligatorio e `id` lo resta — poi si toglie dalla copia insieme alla
       * descrizione, cosi' l'impronta copre tutto il resto dell'inventario e la prosa non parla.
       * ⇒ Prova misurata: applicando questa STESSA esenzione all'inventario di main (senza
       *   lotti) l'impronta estesa COINCIDE (3b1ec130… su entrambi) — nient'altro e' cambiato:
       *   ne' un nome, ne' un campo, ne' un obbligatorio. E la lista base non si tocca:
       *   `library_delete` non c'e' nella base, e la sua impronta 38d65a3f… resta quella. */
      /* ⭐ 27/09/2026, decisione owner (`decisioni-owner-capacita-sezioni-27-09`) — `memory_search` cerca PER PAROLE (vuota o
       * «*» = tutte) e lo dice; `memory_update`/`memory_delete` nominano anche `memory_list` per trovare l'id. Cambia solo la
       * PROSA (descrizioni dell'attrezzo e dei campi): nomi, campi e obbligatori restano quelli di prima. Si asserisce che cosa
       * dice la prosa nuova, poi si toglie dalla copia — se l'impronta storica torna identica, nient'altro è cambiato. */
      if (f.name === 'memory_search' || f.name === 'memory_update' || f.name === 'memory_delete') {
        const schema = f.parameters ?? f.input_schema;
        if (f.name === 'memory_search') {
          assert.match(f.description, /empty query or "\*" returns them all/u, 'memory_search: la descrizione deve dire che vuota = tutte');
          delete schema.properties.query.description;
        }
        else assert.match(f.description, /\bmemory_find\b/u, `${f.name}: deve nominare memory_find per l'id (C5: era memory_list o memory_search)`);
        if (f.name === 'memory_delete') delete schema.properties.id.description;
        delete f.description;
      }
      if (f.name === 'delega_sottotask') {
        const schema = f.parameters ?? f.input_schema;
        /* C2b «Coordinazione» (owner 08/10/2026 sera, esenzione dichiarata da talos desktop): `modello`, facoltativo, SOLO se la
         * persona l'ha chiesto. Si asserisce che cos'è, poi si toglie dalla copia: l'impronta estesa resta 105dd078…, prova misurata
         * che degli altri campi della delega non cambia niente. ⛔ È un campo in più nel preambolo degli attrezzi ESTESI: una
         * campagna del banco che usa la delega, prima e dopo, non ha lo stesso preambolo. */
        assert.deepEqual(Object.keys(schema.properties).sort(), ['cartella', 'modalita', 'modello', 'task']);
        assert.deepEqual(schema.required, ['task']);
        assert.equal(schema.properties.modello.type, 'string', 'delega_sottotask: modello è un nome');
        assert.match(schema.properties.modello.description, /only when the person explicitly asked/u, 'delega_sottotask: solo se la persona lo chiede');
        delete schema.properties.modello;
        assert.deepEqual(schema.properties.modalita, {
          type: 'string', enum: ['lettura', 'modifica'],
          description: 'Optional. Omit it to give the child your own permissions (read-only if you are read-only). lettura = read-only analysis. modifica = changes within your permissions; refused if you are read-only.',
        });
        /* C3 (owner 09/10/2026, dopo la prova dal vivo): il padre aspettava la figlia con `sleep` nella shell. Esenzione dichiarata
           da talos desktop: si asserisce la frase esatta («END YOUR TURN», niente sleep né list_children), poi si toglie dalla copia
           e la catena di prima resta protetta. ⛔ Preambolo degli attrezzi ESTESI cambiato il 09/10. */
        const attesa = ' The child runs in the background: its result reaches you as a new message only after you END YOUR TURN, '
          + 'so never wait for it with sleep or by polling list_children.';
        assert.ok(f.description.endsWith(attesa), 'delega_sottotask: dice al padre di chiudere il turno, non di aspettare');
        f.description = f.description.slice(0, -attesa.length);
        // F-022 (owner 01/10/2026): il predefinito è «i permessi del padre», non più la sola lettura
        const suffix = ' By default the child works with YOUR permissions, never more: it can '
          + 'do what you can do here. If you are read-only, the child is read-only too. Set modalita to '
          + 'lettura when the sub-task is pure analysis: the child then gets no file creation, edits, shell '
          + 'commands, external tools or further delegation.';
        assert.ok(f.description.endsWith(suffix));
        // Exempt only the new capability field and its explanation. The historic
        // inventory hash still protects every pre-existing delegation field/byte.
        delete schema.properties.modalita;
        f.description = f.description.slice(0, -suffix.length);
      }
      if (f.name === 'leggi') {
        const schema = f.parameters ?? f.input_schema;
        /* LEGGI IBRIDA (owner, 30/09 sera): offset/limit sono RIGHE (in hex restano byte) e `byteOffset` prosegue dentro
         * una riga troppo lunga. Come READ22: si asserisce CHE COSA sono i campi aggiunti, poi si tolgono dalla copia;
         * le due impronte storiche continuano a proteggere `percorso` e tutti gli altri attrezzi. */
        assert.deepEqual(Object.keys(schema.properties).sort(), ['byteOffset', 'format', 'limit', 'offset', 'percorso']);
        assert.deepEqual(schema.required, ['percorso']);
        assert.deepEqual(schema.properties.offset, {
          type: 'integer', minimum: 0,
          description: 'First line to read, 1-based (default 1). With format:"hex": start byte offset.',
        });
        /* F-026 (owner 02/10/2026, «Voglio il +1»): `limit` vale anche con `byteOffset`, in byte (4..102400). Esenzione
         * dichiarata come le altre: prima si asserisce la frase esatta, poi il campo si toglie dalla copia. */
        assert.deepEqual(schema.properties.limit, {
          type: 'integer', minimum: 1,
          description: 'Number of lines to read (default 2000). With format:"hex": number of bytes, 4..4096. With byteOffset: bytes to read inside the line, 4..102400 (default 102400).',
        });
        assert.equal(schema.properties.byteOffset.type, 'integer');
        assert.equal(schema.properties.byteOffset.minimum, 0);
        assert.match(schema.properties.byteOffset.description, /inside a line that was too long/);
        assert.match(schema.properties.byteOffset.description, /Not with offset or hex\.$/);
        assert.match(f.description, /up to 100 KB per call \(add limit to take fewer bytes\)/);
        assert.match(f.description, /Reads LINES: by default the first 2000 lines, at most 100 KB per page/);
        assert.deepEqual(schema.properties.format, {
          type: 'string', enum: ['text', 'hex'],
          description: 'Default text. Explicit hex returns original bytes as hexadecimal, with a default and maximum limit of 4096 bytes.',
        });
        assert.match(f.description, /format:"hex".*offset and limit are BYTES \(limit up to 4096\)/);
        delete schema.properties.offset;
        delete schema.properties.limit;
        delete schema.properties.byteOffset;
        delete schema.properties.format;
        f.description = 'Reads one file of the workspace. Path is relative, e.g. "src/prezzo.mjs".';
      }
      if (f.name === 'library_delete') {
        const schema = f.parameters ?? f.input_schema;
        assert.ok(schema.properties.ids, 'library_delete: manca il campo `ids` dei lotti');
        assert.equal((schema.required ?? []).includes('ids'), false, 'library_delete: `ids` NON deve essere obbligatorio');
        assert.deepEqual([...schema.required].sort(), ['id'], 'library_delete: `id` deve restare l\'unico obbligatorio');
        delete schema.properties.ids;
        delete f.description;
      }
    }
    assert.equal(createHash('sha256').update(JSON.stringify(copia)).digest('hex'), impronta);
  }
});

test('BC49: adattatore precedente che ignora parte non pubblica una sezione isolata', async t => {
  const b = await banco(t);
  const r = await giroKernel(b.cartella, parti[0], componiRapportoRicerca);
  assert.match(r.risposta, /^FAILED\./); // H-05: il compositore non supporta le parti — un limite nostro
  await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
});

test('BC49: giornale non leggibile resta un errore, mentre il lettore storico resta tollerante', async () => {
  const deps = { readFileFn: async () => { throw Object.assign(new Error('lettura negata'), { code: 'EACCES' }); } };
  assert.deepEqual((await leggiGiornale({ cartella: tmpdir(), id }, deps)).eventi, []);
  await assert.rejects(leggiGiornale({ cartella: tmpdir(), id, rigoroso: true }, deps), { code: 'EACCES' });
});

test('BC49: ordine delle chiavi JSON non cambia idempotenza; perdita di una parte interna blocca il replay', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  const diversoOrdine = { parte: { ultima: false, indice: 1 }, fonti: [fonte], affermazioni: [affermazione], testo: parti[0].testo };
  assert.equal((await b.deposita(diversoOrdine)).prossimaParte, 2);
  await b.deposita(parti[1]);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.throws(() => rileggiPartiRapporto(j.eventi.filter(e => !(e.kind === 'deposit_part' && e.indice === 1))), /(?:manca una parte|missing a part)/i);
});

test('BC49: errore durante la verifica lascia ultimo checkpoint ripetibile e non raddoppia la prosa', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  const { depositaParteRapporto, consegnaPartiRapporto } = await import('../src/research/deposito-a-pezzi.mjs');
  const { accodaEvento, leggiRapporto } = await import('../src/research-store.mjs');
  await assert.rejects(depositaParteRapporto({ cartella: b.cartella, id, ...parti[1] }, {
    leggiGiornaleFn: leggiGiornale, accodaEventoFn: accodaEvento, leggiRapportoFn: leggiRapporto,
    valida: componiRapportoRicerca, clock: () => new Date(), finalizza: async () => { throw new Error('processo caduto'); },
  }), /processo caduto/);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.match(consegnaPartiRapporto(j.eventi), /(?:ultima parte è già registrata|final part is already recorded)/i);
  const r = await b.deposita(parti[1]);
  assert.equal(talosResearchParseReport(r.documento).summary, unico.testo.trim());
  assert.equal((await leggiGiornale({ cartella: b.cartella, id })).eventi.filter(e => e.kind === 'deposit_part').length, 2);
});

test('BC49: rapporto finale alterato non viene sovrascritto né dichiarato identico', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]); await b.deposita(parti[1]);
  await writeFile(percorsoRapporto(b.cartella, id), 'modifica esterna');
  await assert.rejects(b.deposita(parti[1]), /(?:impronta|digest)/i);
  assert.equal(await readFile(percorsoRapporto(b.cartella, id), 'utf8'), 'modifica esterna');
});

test('BC49: una sola parte già salvata basta alla ripresa automatica BC44, una volta sola', async t => {
  const b = await banco(t, { ripresaAutomatica: true, dormiFn: async () => {} });
  await b.deposita(parti[0]);
  b.sessioni.set(id, { cartella: b.cartella, taskId: 'ricerca', task: b.avviati[0].task, conclusa: true, messaggiFinali: null });
  const caduta = { ok: false, esito: null, erroreInterno: 'Upstream idle timeout exceeded', codiceErrore: 'internal-error' };
  await b.avviati[0].onConclusioneFn(caduta);
  assert.equal(b.avviati.length, 2);
  assert.match(b.avviati[1].messaggiIniziali[0].content, /(?:prossima parte|next part).*2/i);
  await b.avviati[1].onConclusioneFn(caduta);
  assert.equal(b.avviati.length, 2);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(j.eventi.filter(e => e.kind === 'run_resumed' && e.auto).length, 1);
});

test('BC49: L9 giudica le prove assemblate soltanto alla chiusura; ricevuta finale e deposito unico coincidono', async t => {
  let giudizi = 0;
  const b = await banco(t, {
    chiediAlModelloFn: async prompt => { giudizi++; return (prompt.prompt.includes('the passage, ALONE, support') || prompt.prompt.includes('Il passaggio, DA SOLO, sostiene')) ? 'SI — il passaggio lo dice.' : 'NO — nessuna prova contraria.'; },
    modelliGiudiceFn: () => [{ id: 'altro/giudice', provider: 'openrouter', model: 'altro/giudice' }],
  });
  await b.orch.raccoltaDellaRicerca(id).around({ kind: 'extract', url: fonte.url, provider: 'naviga' }, async () => ({ stato: 200, url: fonte.url, corpo: affermazione.passaggio }));
  await giroKernel(b.cartella, parti[0], a => b.deposita(a));
  assert.equal(giudizi, 0);
  const finale = await giroKernel(b.cartella, parti[1], a => b.deposita(a));
  assert.ok(giudizi > 0);
  const testo = await readFile(percorsoRapporto(b.cartella, id), 'utf8');
  const record = talosResearchParseReport(testo);
  assert.equal(record.judge, 'altro/giudice');
  assert.equal(record.claims[0].checks.claimSupported, 'yes');
  const numeroGiudizi = giudizi;
  const ripetuto = await giroKernel(b.cartella, parti[1], a => b.deposita(a));
  assert.equal(giudizi, numeroGiudizi);
  assert.equal(ripetuto.risposta, finale.risposta);
  const storico = await giroKernel(b.cartella, unico, a => b.deposita(a));
  assert.equal(storico.risposta, finale.risposta);
  assert.equal(await readFile(percorsoRapporto(b.cartella, id), 'utf8'), testo);
});

test('BC49: coda mozzata non assorbe il fatto di ripresa e il suo limite di tentativi', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  await writeFile(percorsoGiornale(b.cartella, id), '{"kind":"deposit_part","indice":2', { flag: 'a' });
  await aggiornaRicerca({ cartella: b.cartella, id, terminata: 'failed', motivoErrore: { classe: 'timeout-fornitore', transitorio: true } });
  b.sessioni.set(id, { cartella: b.cartella, taskId: 'ricerca', task: b.avviati[0].task, conclusa: true, messaggiFinali: null });
  await b.orch.riprendi({ cartella: b.cartella, id });
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(j.eventi.filter(e => e.kind === 'run_resumed').length, 1);
  assert.equal(rileggiPartiRapporto(j.eventi).prossimaParte, 2);
});

test('BC49: tetto esatto UTF-8 include prove e JSON; spazi aggiunti dal fornitore contano', async t => {
  const b = await banco(t);
  const vuoto = pezzo(1);
  const spazio = LIMITE_PARTE_RAPPORTO_BYTE - Buffer.byteLength(JSON.stringify(vuoto));
  const alTetto = pezzo(1, 'a'.repeat(spazio));
  assert.equal(Buffer.byteLength(JSON.stringify(alTetto)), LIMITE_PARTE_RAPPORTO_BYTE);
  assert.equal((await b.deposita({ ...alTetto, testo: alTetto.testo + 'a' })).ok, false);
  assert.equal((await b.deposita({ ...alTetto, byteArgomenti: LIMITE_PARTE_RAPPORTO_BYTE + 1 })).ok, false);
  assert.equal((await b.deposita(alTetto)).ok, true);
  assert.equal((await b.deposita(pezzo(2, '', false, [{ ...affermazione, passaggio: 'a'.repeat(LIMITE_PARTE_RAPPORTO_BYTE) }]))).ok, false);
});
