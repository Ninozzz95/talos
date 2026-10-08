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
      list_children: [],
      stop_child: ['childId'],
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
      memory_list: [['limit'], []],
      notes_search: [['limit', 'query'], ['query']],
      notes_read: [['from', 'id'], ['id']],
      tasks_search: [['limit', 'query', 'status'], ['query']],
      research_search: [['limit', 'query'], ['query']],
      conversation_search: [['around_message', 'conversation_id', 'folder', 'from', 'limit', 'query', 'status', 'window'], []],
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
      automation_list: [[], []],
      automation_runs: [['id', 'limit'], ['id']],
      automation_create: [['cartella', 'coordinazione', 'istruzioni', 'modello', 'nome', 'permessi', 'pianificazione', 'ripeti'], ['istruzioni', 'nome', 'pianificazione']],
      automation_update: [['cartella', 'coordinazione', 'id', 'istruzioni', 'modello', 'nome', 'permessi', 'pianificazione', 'prossimoGiroAlle', 'ripeti'], ['id']],
      automation_pause: [['id'], ['id']],
      automation_resume: [['id'], ['id']],
      automation_run: [['contesto', 'id'], ['id']],
      automation_stop: [['id'], ['id']],
    };
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
    const copia = structuredClone(attrezzi).filter((t) => !['process_output', 'file_edit', 'ask_user_question', 'present_plan', 'workflow_plan_propose', ...Object.keys(runTools), ...Object.keys(dialogueTools), ...Object.keys(lettureSezioni), ...Object.keys(attrezziAutomazioni)].includes((t.function ?? t).name));
    for (const t of copia) {
      const f = t.function ?? t;
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
        else assert.match(f.description, /memory_list or memory_search/u, `${f.name}: deve nominare memory_list per l'id`);
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
