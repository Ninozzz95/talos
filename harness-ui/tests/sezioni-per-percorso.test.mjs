import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { creaIniettoreSezioni } from '../src/sezioni-istruzioni.mjs';
import { collegaSezioniAiContextHooks, prepareProviderContext } from '../src/context-provider-adapter.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { ALIAS_PERCORSO, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contenuto = '## Non-Negotiable User Rule\nMai commit.\n## Una\n<!-- talos: paths: harness-ui/**, mobile/** -->\nPrima regola. Dettaglio uno.\n## Due\n<!-- talos: paths: harness-ui/** -->\nSeconda regola. Dettaglio due.\n';
const file = [{ etichetta: 'AGENTS.md', contenuto }];
const radice = resolve('progetto-finto');
const cartella = join(radice, 'harness-ui');
const scambio = (nome, argomenti, risultato = 'contenuto', id = 'uno') => [
  { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] },
  { role: 'tool', tool_call_id: id, content: risultato },
];
const crea = (extra = {}) => creaIniettoreSezioni({ file, cartella, radice, ...extra });

for (const [nome, args, risultato] of [['leggi', { percorso: 'src/a.mjs' }, 'dato'], ['scrivi', { path: 'src/a.mjs' }, 'scritto'], ['file_edit', { percorso: 'src/a.mjs' }, 'edited: src/a.mjs (1 occurrence replaced)'], ['cerca', { nome: 'a' }, 'src/a.mjs'], ['elenca', { percorso: 'src' }, 'src/a.mjs']]) {
  test(`BC48-A-PATH-${nome}: due sezioni stesso glob, una volta sola, in coda e ordine del file`, () => {
    const inietta = crea();
    const messages = [{ role: 'system', content: 'Prefisso stabile.' }, ...scambio(nome, args, risultato)];
    const prima = structuredClone(messages);
    inietta(messages);
    assert.deepEqual(messages.slice(0, prima.length), prima);
    assert.equal(messages.length, prima.length + 2);
    assert.match(messages.at(-2).content, /Prima regola. Dettaglio uno./);
    assert.match(messages.at(-1).content, /Seconda regola. Dettaglio due./);
    assert.doesNotMatch(messages.at(-1).content, /<!--/);
    prepareProviderContext({ messages, provider: 'local', model: 'prova' });
    const dopo = structuredClone(messages);
    inietta(messages);
    assert.deepEqual(messages, dopo);
    crea()(messages); // nuovo adapter/turno, cronologia persistita
    assert.deepEqual(messages, dopo);
  });
}

test('BC48-A-PATH-NO: estraneo, fuori radice e testo che cita un percorso non attivano', () => {
  for (const messages of [scambio('leggi', { percorso: '../core/a.php' }), scambio('leggi', { percorso: '../../harness-ui/a' }), scambio('shell', {}, 'src/a.mjs'), [{ role: 'user', content: 'src/a.mjs' }]]) {
    const prima = structuredClone(messages);
    crea()(messages);
    assert.deepEqual(messages, prima);
  }
});

test('BC48-A-BATCH: non inserire messaggi fra chiamate e risultati pendenti', () => {
  const inietta = crea();
  const a = scambio('leggi', { percorso: 'src/a' }, 'a', 'a');
  const b = scambio('leggi', { percorso: 'src/b' }, 'b', 'b');
  a[0].tool_calls.push(b[0].tool_calls[0]);
  inietta(a);
  assert.equal(a.length, 2);
  a.push(b[1]);
  inietta(a);
  assert.equal(a.length, 5);
});

test('BC48-A-SESSIONI: nessuna contaminazione e separatori Windows normalizzati', () => {
  for (let i = 0; i < 2; i++) {
    const messages = scambio('leggi', { percorso: 'src\\a.mjs' });
    crea()(messages);
    assert.equal(messages.length, 4);
  }
});

test('BC48-A-ERRORI: JSON malformato, risultato orfano e ricerca vuota non attivano', () => {
  const malformed = scambio('leggi', {}); malformed[0].tool_calls[0].function.arguments = '{';
  for (const messages of [malformed, [{ role: 'tool', tool_call_id: 'manca', content: 'src/a' }], scambio('cerca', {}, 'no file matches. Scanned 3 files.')]) {
    const prima = structuredClone(messages);
    crea()(messages);
    assert.deepEqual(messages, prima);
  }
});

test('BC48-A-PATH-TETTO: sezione enorme omessa con avviso una volta sola', () => {
  const enorme = [{ etichetta: 'AGENTS.md', contenuto: '## Area\n<!-- talos: paths: harness-ui/** -->\nINIZIO ' + 'x'.repeat(3000) + ' FINE\n' }];
  const messages = scambio('leggi', { percorso: 'src/a' });
  const inietta = crea({ file: enorme, tetto: 450 });
  inietta(messages);
  assert.equal(messages.length, 3);
  assert.ok(Buffer.byteLength(messages.at(-1).content) <= 450);
  assert.match(messages.at(-1).content, /⚠ Tetto delle istruzioni/);
  assert.doesNotMatch(messages.at(-1).content, /INIZIO|FINE/);
  inietta(messages); assert.equal(messages.length, 3);
});

test('BC48-A-RIGHE-SPOSTATE: la stessa sezione non ritorna se cambiano le righe sul disco', () => {
  const messages = scambio('leggi', { percorso: 'src/a' });
  crea()(messages);
  const prima = structuredClone(messages);
  crea({ file: [{ ...file[0], contenuto: '# Nuova premessa\n\n' + contenuto }] })(messages);
  assert.deepEqual(messages, prima);
});

test('BC48-A-ALIAS: tutti i nomi percorso del kernel attivano le sezioni', () => {
  for (const alias of ALIAS_PERCORSO) {
    const messages = scambio('leggi', { [alias]: 'src/a' });
    crea()(messages);
    assert.equal(messages.length, 4, alias);
  }
});

test('BC48-A-PATH-MOLTE: nessuna omissione silenziosa quando il tetto non contiene gli avvisi', () => {
  const messages = scambio('leggi', { percorso: 'src/a' });
  const prima = structuredClone(messages);
  const f = [{ etichetta: 'AGENTS.md', contenuto: Array.from({ length: 4 }, (_, i) => `## Area ${i}\n<!-- talos: paths: harness-ui/** -->\n${'X'.repeat(1000)}\n`).join('') }];
  assert.throws(() => crea({ file: f, tetto: 100 })(messages), /tetto/i);
  assert.deepEqual(messages, prima);
});

test('BC48-A-LOCALI: file corto e sezioni sempre non si ripetono durante il giro', () => {
  const messages = scambio('leggi', { percorso: 'src/a' });
  const corto = [{ etichetta: 'harness-ui/AGENTS.md', contenuto: '## Area\n<!-- talos: paths: harness-ui/** -->\nUna regola.\n' }];
  crea({ file: corto })(messages);
  assert.equal(messages.length, 2);
  crea({ file: [{ ...file[0], contenuto: contenuto.replace('## Una', '## Una\n<!-- talos: sempre -->').replace('## Due', '## Due\n<!-- talos: sempre -->') }] })(messages);
  assert.equal(messages.length, 2);
});

test('BC48-A-GLOB: upstream reale, radice relativa, brace e titoli ripetuti distinti', () => {
  const f = [{ etichetta: 'AGENTS.md', contenuto: '## Area\n<!-- talos: paths: harness-ui/**/*.{mjs,ts} -->\nRegola uno.\n## Area\n<!-- talos: paths: harness-ui/** -->\nRegola due.\n## Estranea\n<!-- talos: paths: src/** -->\nRegola fuori.\n' }];
  const messages = scambio('leggi', { percorso: 'src/a.mjs' });
  crea({ file: f })(messages);
  assert.equal(messages.length, 4);
  assert.match(messages[2].content, /Regola uno/);
  assert.match(messages[3].content, /Regola due/);
  crea({ file: f })(messages);
  assert.equal(messages.length, 4);
});

test('BC48-A-HOOK: accoda prima di archivio e misura, non modifica gli hook originali', async () => {
  const visti = [];
  const hooks = Object.freeze({ capture: async ({ messages }) => visti.push(structuredClone(messages)), prepare: async ({ messages }) => ({ messages: structuredClone(messages) }), infer: () => 'stabile' });
  const collegati = collegaSezioniAiContextHooks({ contextHooks: hooks, file, cartella, radice });
  const messages = scambio('leggi', { percorso: 'src/a' });
  await collegati.capture({ messages, reason: 'tool-result' });
  assert.equal(visti[0].length, 4);
  const dopo = await collegati.prepare({ messages });
  assert.deepEqual(dopo.messages, messages);
  assert.equal(collegati.infer, hooks.infer);
  assert.equal(collegaSezioniAiContextHooks({ file, cartella, radice }), undefined);
});

test('BC48-A-RUNTIME: istruzioni su disco raggiungono la richiesta e messaggiFinali senza rete', async t => {
  const base = await mkdtemp(join(tmpdir(), 'bc48-a-'));
  assert.ok(relative(tmpdir(), base).startsWith('bc48-a-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(base));
  await mkdir(join(base, 'harness-ui'));
  await writeFile(join(base, '.git'), '');
  await writeFile(join(base, 'AGENTS.md'), contenuto);
  let richiesta;
  const adapter = createOwnerRuntimeAdapter({ modulePath: join(base, 'runtime.mjs'), importFn: async () => ({ talosLavora: async input => {
    const messages = scambio('leggi', { percorso: 'src/a' });
    await input.contextHooks.capture({ messages, reason: 'tool-result' });
    const preparati = await input.contextHooks.prepare({ messages });
    await input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { body: JSON.stringify({ model: 'prova', messages: preparati.messages }) });
    return { messaggiFinali: messages };
  } }) });
  const esito = await adapter.talosLavora({ cartella: join(base, 'harness-ui'), contextHooks: { capture: async () => {}, prepare: async ({ messages }) => ({ messages }) }, fetchDiRete: async (_url, init) => { richiesta = JSON.parse(init.body); return Response.json({}); } });
  assert.equal(richiesta.messages.length, 4);
  assert.deepEqual(richiesta.messages, esito.messaggiFinali);
});

test('BC48-A-KERNEL-REALE: lettura vera, due turni, storico accodato e nessuna rete', async t => {
  const base = await mkdtemp(join(tmpdir(), 'bc48-a-kernel-'));
  assert.ok(relative(tmpdir(), base).startsWith('bc48-a-kernel-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(base));
  const cwd = join(base, 'harness-ui');
  await mkdir(join(cwd, 'src'), { recursive: true });
  await writeFile(join(base, '.git'), '');
  await writeFile(join(base, 'AGENTS.md'), contenuto);
  await writeFile(join(cwd, 'src/a.txt'), 'Contenuto vero dal disco.');
  const richieste = [];
  const adapter = createOwnerRuntimeAdapter({ modulePath: join(base, 'runtime.mjs'), importFn: async () => ({ talosLavora }) });
  const hooks = { capture: async () => {}, prepare: async ({ messages }) => ({ messages }) };
  const reteFinta = async (_url, init) => {
    richieste.push(JSON.parse(init.body));
    assert.ok(richieste.length <= 4, 'numero di richieste deterministico');
    const message = richieste.length % 2 === 1 ? scambio('leggi', { percorso: 'src/a.txt' }, '', `lettura-${richieste.length}`)[0] : { role: 'assistant', content: 'Ho letto il file.' };
    return Response.json({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  };
  const input = { cartella: cwd, task: { consegna: 'Leggi src/a.txt' }, modello: 'prova', chiave: 'finta', contextHooks: hooks, fetchDiRete: reteFinta };
  const primo = await adapter.talosLavora(input);
  assert.equal(richieste.length, 2);
  assert.ok(primo.messaggiFinali.some(m => m.role === 'tool' && m.content === 'Contenuto vero dal disco.'));
  const marche = messages => messages.filter(m => typeof m.content === 'string' && m.content.startsWith('Sezione di `'));
  assert.equal(marche(richieste[0].messages).length, 0);
  assert.equal(marche(richieste[1].messages).length, 2);
  const storico = [...primo.messaggiFinali, { role: 'user', content: 'rileggi quel file, contnua da lì' }];
  const prima = structuredClone(storico);
  const secondo = await adapter.talosLavora({ ...input, messaggiIniziali: storico });
  assert.equal(richieste.length, 4);
  assert.deepEqual(secondo.messaggiFinali.slice(0, prima.length), prima);
  assert.equal(marche(secondo.messaggiFinali).length, 2);
  assert.deepEqual(storico, prima);
});
