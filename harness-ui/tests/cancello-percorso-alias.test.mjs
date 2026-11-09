// Judge 07/11/2026 23:12 (RED, shipped since c0e91faf4): the control-file gate in session-registry.mjs read only
// `argomenti.percorso`, while the kernel writes through every path alias (`ALIAS_PERCORSO`: path, file_path, filePath, file,
// filename; `percorsoDiFile`). A model that wrote `{ path: ".harness-ui-hooks.json" }` changed the agent's rules with no card.
// The real wire: registry + agent-service + kernel with a fake network, a FAKE control file on disk in a temp project (never the
// person's data), the model reads it first (so the "you have not read it" guard is not what stops the write), then writes it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { cartelleGlobaliDiProva } from './aiuto/cartelle-globali-di-prova.mjs'; // decision 381: never the stores beside the code
import { talosLavora, ALIAS_PERCORSO } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { FILE_DI_CONTROLLO } from '../src/path-policy.mjs';

const enc = new TextEncoder();
const flusso = (pezzi) => new Response(new ReadableStream({ start(c) {
  for (const x of pezzi) c.enqueue(enc.encode(`data: ${JSON.stringify(x)}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n'));
  c.close();
} }));
const chiamata = (id, nome, argomenti) => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] }]);

/**
 * One real turn: the model reads `bersaglio` (with `percorso`), then calls `scrivi`/`file_edit` with `argomenti`. Every card is
 * answered with `risposta` (the arguments after `requestId` of `rispondiApprovazione`). Returns the cards and the files after.
 */
async function giro(t, { argomenti, bersagli, permessiScelto, risposta, leggi = bersagli[0], attrezzo = 'scrivi', puntiDiRipristino = null }) {
  const progetto = mkdtempSync(join(tmpdir(), 'cancello-alias-'));
  t.after(() => rimuoviCartellaDiProva(progetto));
  for (const b of bersagli) {
    mkdirSync(dirname(join(progetto, b)), { recursive: true });
    writeFileSync(join(progetto, b), 'VECCHIO');
  }
  let n = 0;
  const fetchDiRete = async () => {
    n += 1;
    if (n === 1 && leggi) return chiamata('c0', 'leggi', { percorso: leggi });
    if (n <= 2) return chiamata('c1', attrezzo, argomenti);
    return flusso([{ choices: [{ delta: { content: 'fatto' } }] }]);
  };
  const registro = createSessionRegistry({
    ...cartelleGlobaliDiProva(), modello: 'm', chiave: 'k', puntiDiRipristino, guardaWorkspaceFn: () => () => {}, caricaHooksFn: async () => ({ hooks: [] }), cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'prova' } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, fetchDiRete }) }),
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  const carte = [];
  const eventi = [];
  t.after(registro.iscriviti(sessionId, (e) => {
    eventi.push(e);
    if (e.type === 'ApprovalRequested' && !e.rigiocoAttesa) {
      carte.push(e.azione);
      setTimeout(() => registro.rispondiApprovazione(sessionId, e.requestId, ...risposta), 0);
    }
  }));
  const inizio = Date.now();
  while (!eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError') && Date.now() - inizio < 20_000) await new Promise((r) => setTimeout(r, 10));
  const contenuti = Object.fromEntries(bersagli.map((b) => [b, existsSync(join(progetto, b)) ? readFileSync(join(progetto, b), 'utf8') : null]));
  const esiti = eventi.filter((e) => e.type === 'ToolCallResult').map((e) => String(e.content ?? ''));
  return { carte, contenuti, esiti, finito: eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError') };
}

const ALIAS_ESTERNI = ALIAS_PERCORSO.filter((k) => k !== 'percorso');
const PROTETTI = [...FILE_DI_CONTROLLO.file, '.talos/x', '.claude/settings.json'];
const RISPOSTE = [
  ['no', [false]],
  ['no with a reason', [false, { motivo: 'not this file' }]],
  ['automatic yes (regola)', [true, { motivo: 'regola' }]],
  ['automatic yes (modalita)', [true, { motivo: 'modalita' }]],
  ['automatic yes (classificatore)', [true, { motivo: 'classificatore' }]],
];
const cartaDelCancello = (carte) => carte.filter((a) => a?.fileDiControllo === true);

test('the kernel and this test agree on the five path aliases', () => {
  assert.deepEqual(ALIAS_ESTERNI, ['path', 'file_path', 'filePath', 'file', 'filename']);
});

for (const alias of ALIAS_PERCORSO) { // `percorso` too: the no with a reason and the automatic yes were open for it as well
  for (const bersaglio of PROTETTI) {
    test(`alias "${alias}" on control file ${bersaglio}: control-file card in Workspace write and On request; no or automatic yes never writes`, { timeout: 120_000 }, async (t) => {
      // every combination is run and counted, so a red run says HOW MANY of the ten are open, not just the first
      const rossi = [];
      for (const permessiScelto of ['Workspace write', 'On request']) {
        for (const [nomeRisposta, risposta] of RISPOSTE) {
          const r = await giro(t, { argomenti: { [alias]: bersaglio, contenuto: 'NUOVO' }, bersagli: [bersaglio], permessiScelto, risposta });
          const gate = cartaDelCancello(r.carte);
          const difetti = [
            r.finito ? null : 'turn did not finish',
            gate.length === 1 ? null : `control-file cards: ${gate.length}`,
            gate[0] && gate[0].percorso !== bersaglio ? `card names ${gate[0].percorso}` : null,
            r.contenuti[bersaglio] === 'VECCHIO' ? null : 'CONTROL FILE WRITTEN',
          ].filter(Boolean);
          if (difetti.length) rossi.push(`${permessiScelto} / ${nomeRisposta}: ${difetti.join(', ')} — ${String(r.esiti.at(-1) ?? '').slice(0, 90)}`);
        }
      }
      if (rossi.length) console.log(`RED ${alias} ${bersaglio} ${rossi.length}/10\n  ${rossi.join('\n  ')}`);
      assert.deepEqual(rossi, []);
    });
  }
}

test('file_edit with alias file_path on .harness-ui-hooks.json: control-file card, no keeps the file', { timeout: 30_000 }, async (t) => {
  for (const permessiScelto of ['Workspace write', 'On request']) {
    const r = await giro(t, { attrezzo: 'file_edit', argomenti: { file_path: '.harness-ui-hooks.json', old_string: 'VECCHIO', new_string: 'NUOVO' }, bersagli: ['.harness-ui-hooks.json'], permessiScelto, risposta: [false] });
    assert.equal(cartaDelCancello(r.carte).length, 1, JSON.stringify(r));
    assert.equal(r.contenuti['.harness-ui-hooks.json'], 'VECCHIO');
  }
});

test('two aliases with different values: the gate looks at the path the kernel writes (first non-empty in kernel order)', { timeout: 30_000 }, async (t) => {
  // path wins over file_path in the kernel: the hooks file is the one written, so the card is for it
  const a = await giro(t, { argomenti: { path: '.harness-ui-hooks.json', file_path: 'note.txt', contenuto: 'NUOVO' }, bersagli: ['.harness-ui-hooks.json', 'note.txt'], permessiScelto: 'Workspace write', risposta: [false] });
  assert.equal(cartaDelCancello(a.carte).length, 1, JSON.stringify(a));
  assert.equal(cartaDelCancello(a.carte)[0].percorso, '.harness-ui-hooks.json');
  assert.deepEqual(a.contenuti, { '.harness-ui-hooks.json': 'VECCHIO', 'note.txt': 'VECCHIO' });
  // the reverse: the kernel writes note.txt, the control file named by the later alias is never touched, so no card
  const b = await giro(t, { argomenti: { path: 'note.txt', file_path: '.harness-ui-hooks.json', contenuto: 'NUOVO' }, bersagli: ['note.txt', '.harness-ui-hooks.json'], permessiScelto: 'Workspace write', risposta: [false] });
  assert.equal(cartaDelCancello(b.carte).length, 0, JSON.stringify(b));
  assert.deepEqual(b.contenuti, { 'note.txt': 'NUOVO', '.harness-ui-hooks.json': 'VECCHIO' });
  // an EMPTY percorso is skipped by the kernel, so the alias after it is the path written
  const c = await giro(t, { argomenti: { percorso: '', path: 'CLAUDE.md', contenuto: 'NUOVO' }, bersagli: ['CLAUDE.md'], permessiScelto: 'Workspace write', risposta: [false] });
  assert.equal(cartaDelCancello(c.carte).length, 1, JSON.stringify(c));
  assert.equal(c.contenuti['CLAUDE.md'], 'VECCHIO');
  // a null percorso is skipped too
  const d = await giro(t, { argomenti: { percorso: null, filename: 'AGENTS.md', contenuto: 'NUOVO' }, bersagli: ['AGENTS.md'], permessiScelto: 'Workspace write', risposta: [false] });
  assert.equal(cartaDelCancello(d.carte).length, 1, JSON.stringify(d));
  assert.equal(d.contenuti['AGENTS.md'], 'VECCHIO');
});

test('an alias that is not a string, and a capitalised "Path": no card, and the kernel writes nothing (same as the kernel)', { timeout: 30_000 }, async (t) => {
  for (const argomenti of [
    { path: 123, contenuto: 'NUOVO' },
    { percorso: 123, path: 'CLAUDE.md', contenuto: 'NUOVO' }, // the kernel takes 123 (first non-null) and fails: CLAUDE.md untouched
    { path: ['CLAUDE.md'], contenuto: 'NUOVO' },
    { Path: 'CLAUDE.md', contenuto: 'NUOVO' },
    { FILE_PATH: 'CLAUDE.md', contenuto: 'NUOVO' },
  ]) {
    const r = await giro(t, { argomenti, bersagli: ['CLAUDE.md'], permessiScelto: 'Workspace write', risposta: [true] });
    assert.equal(r.finito, true, JSON.stringify(argomenti));
    assert.equal(cartaDelCancello(r.carte).length, 0, `${JSON.stringify(argomenti)} ${JSON.stringify(r)}`);
    assert.equal(r.contenuti['CLAUDE.md'], 'VECCHIO', `${JSON.stringify(argomenti)} ${JSON.stringify(r.esiti)}`);
  }
});

test('an alias on an ordinary project file: no control-file card, the write goes through (decision 375)', { timeout: 30_000 }, async (t) => {
  for (const alias of ALIAS_ESTERNI) {
    const r = await giro(t, { argomenti: { [alias]: 'src/app.js', contenuto: 'NUOVO' }, bersagli: ['src/app.js'], permessiScelto: 'Workspace write', risposta: [false] });
    assert.equal(r.carte.length, 0, `${alias} ${JSON.stringify(r)}`);
    assert.equal(r.contenuti['src/app.js'], 'NUOVO', alias);
  }
});

test('the person\'s yes on the control-file card writes through an alias (the gate asks, it does not forbid)', { timeout: 30_000 }, async (t) => {
  const r = await giro(t, { argomenti: { file_path: '.harness-ui-hooks.json', contenuto: '{"hooks":[]}' }, bersagli: ['.harness-ui-hooks.json'], permessiScelto: 'Workspace write', risposta: [true] });
  assert.equal(cartaDelCancello(r.carte).length, 1, JSON.stringify(r));
  assert.equal(r.contenuti['.harness-ui-hooks.json'], '{"hooks":[]}');
});

test('the restore point before a write names the file the kernel writes, with any alias (undo covers it)', { timeout: 60_000 }, async (t) => {
  for (const alias of ALIAS_PERCORSO) {
    const visti = [];
    const puntiDiRipristino = { primaDiScrivere: async ({ percorso }) => { visti.push(percorso); return { fatto: false, motivo: 'prova' }; }, dopoLaScrittura: async () => {} };
    const r = await giro(t, { argomenti: { [alias]: 'src/app.js', contenuto: 'NUOVO' }, bersagli: ['src/app.js'], permessiScelto: 'Workspace write', risposta: [true], puntiDiRipristino });
    assert.equal(r.contenuti['src/app.js'], 'NUOVO', alias);
    assert.deepEqual(visti, ['src/app.js'], alias);
  }
  // an empty value is no file: the restore point is taken for the whole turn (percorso null), as for a shell command
  const visti = [];
  const puntiDiRipristino = { primaDiScrivere: async ({ percorso }) => { visti.push(percorso); return { fatto: false, motivo: 'prova' }; }, dopoLaScrittura: async () => {} };
  await giro(t, { argomenti: { percorso: '', contenuto: 'NUOVO' }, bersagli: ['src/app.js'], leggi: null, permessiScelto: 'Workspace write', risposta: [true], puntiDiRipristino });
  assert.deepEqual(visti.filter((p) => p !== null), [], JSON.stringify(visti));
});

// ---- Round 2 (reviewer of tests and mutants, 07/11): each test below is NAMED for the mutants it kills ----

test('G1: a falsy non-string first alias (0, false) is the path the kernel takes: no card, nothing written', { timeout: 30_000 }, async (t) => {
  for (const argomenti of [
    { percorso: 0, path: 'CLAUDE.md', contenuto: 'NUOVO' },
    { percorso: false, path: 'CLAUDE.md', contenuto: 'NUOVO' },
    { path: 0, filename: 'CLAUDE.md', contenuto: 'NUOVO' },
  ]) {
    const r = await giro(t, { argomenti, bersagli: ['CLAUDE.md'], permessiScelto: 'Workspace write', risposta: [true] });
    assert.equal(r.finito, true, JSON.stringify(argomenti));
    assert.equal(cartaDelCancello(r.carte).length, 0, `${JSON.stringify(argomenti)} ${JSON.stringify(r.carte)}`);
    assert.equal(r.contenuti['CLAUDE.md'], 'VECCHIO', JSON.stringify(argomenti));
  }
});

test('G2 G3: every adjacent pair of aliases in kernel order, ordinary file first: no card, the ordinary file is written', { timeout: 60_000 }, async (t) => {
  for (let k = 1; k < ALIAS_PERCORSO.length; k += 1) {
    const argomenti = { [ALIAS_PERCORSO[k - 1]]: 'note.txt', [ALIAS_PERCORSO[k]]: '.harness-ui-hooks.json', contenuto: 'NUOVO' };
    const r = await giro(t, { argomenti, bersagli: ['note.txt', '.harness-ui-hooks.json'], permessiScelto: 'Workspace write', risposta: [false] });
    assert.equal(cartaDelCancello(r.carte).length, 0, `${JSON.stringify(argomenti)} ${JSON.stringify(r.carte)}`);
    assert.deepEqual(r.contenuti, { 'note.txt': 'NUOVO', '.harness-ui-hooks.json': 'VECCHIO' }, JSON.stringify(argomenti));
  }
});

test('R1: a non-string path (number, true, object) is no file: the restore point is for the turn (null), never the value', { timeout: 60_000 }, async (t) => {
  for (const argomenti of [{ path: 123, contenuto: 'NUOVO' }, { percorso: true, contenuto: 'NUOVO' }, { file: { a: 1 }, contenuto: 'NUOVO' }]) {
    const visti = [];
    const puntiDiRipristino = { primaDiScrivere: async ({ percorso }) => { visti.push(percorso); return { fatto: false, motivo: 'prova' }; }, dopoLaScrittura: async () => {} };
    const r = await giro(t, { argomenti, bersagli: ['src/app.js'], leggi: null, permessiScelto: 'Workspace write', risposta: [true], puntiDiRipristino });
    assert.equal(r.finito, true, JSON.stringify(argomenti));
    assert.ok(visti.length >= 1, `the restore point was not taken: ${JSON.stringify(argomenti)}`);
    assert.deepEqual(visti.filter((p) => p !== null), [], `${JSON.stringify(argomenti)} ${JSON.stringify(visti)}`);
  }
});

test('R2: twin aliases, percorso first: the restore point names percorso, the file the kernel writes', { timeout: 30_000 }, async (t) => {
  for (const [argomenti, atteso] of [
    [{ percorso: 'src/app.js', path: 'other.js', contenuto: 'NUOVO' }, 'src/app.js'],
    [{ file_path: 'src/app.js', filename: 'other.js', contenuto: 'NUOVO' }, 'src/app.js'],
  ]) {
    const visti = [];
    const puntiDiRipristino = { primaDiScrivere: async ({ percorso }) => { visti.push(percorso); return { fatto: false, motivo: 'prova' }; }, dopoLaScrittura: async () => {} };
    const r = await giro(t, { argomenti, bersagli: ['src/app.js', 'other.js'], permessiScelto: 'Workspace write', risposta: [true], puntiDiRipristino });
    assert.deepEqual(visti, [atteso], JSON.stringify(argomenti));
    assert.deepEqual(r.contenuti, { 'src/app.js': 'NUOVO', 'other.js': 'VECCHIO' }, JSON.stringify(argomenti));
  }
});

test('R3: a shell command that carries a path alias still takes the restore point for the whole turn (null)', { timeout: 30_000 }, async (t) => {
  const visti = [];
  const puntiDiRipristino = { primaDiScrivere: async ({ percorso }) => { visti.push(percorso); return { fatto: false, motivo: 'prova' }; }, dopoLaScrittura: async () => {} };
  const r = await giro(t, { attrezzo: 'shell', argomenti: { comando: 'echo ok', path: 'src/app.js' }, bersagli: ['src/app.js'], leggi: null, permessiScelto: 'Workspace write', risposta: [true], puntiDiRipristino });
  assert.equal(r.finito, true);
  assert.ok(visti.length >= 1, `no restore point before the shell command: ${JSON.stringify(r.esiti)}`);
  assert.deepEqual(visti, visti.map(() => null), JSON.stringify(visti));
});

// ---- Round 3 (08/11): the mutants the round-2 reviewer found alive, each with its NAMED test ----

test('N14: twin aliases, control file first: the card names the file the kernel writes (percorsoDiFile), never the second alias', { timeout: 60_000 }, async (t) => {
  for (const [argomenti, atteso, altro] of [
    [{ percorso: 'CLAUDE.md', path: 'a.txt', contenuto: 'NUOVO' }, 'CLAUDE.md', 'a.txt'],
    [{ file_path: 'AGENTS.md', filename: 'a.txt', contenuto: 'NUOVO' }, 'AGENTS.md', 'a.txt'],
    [{ percorso: '', path: 'CLAUDE.md', file: 'a.txt', contenuto: 'NUOVO' }, 'CLAUDE.md', 'a.txt'],
  ]) {
    const r = await giro(t, { argomenti, bersagli: [atteso, altro], permessiScelto: 'Workspace write', risposta: [false] });
    const gate = cartaDelCancello(r.carte);
    assert.equal(gate.length, 1, `${JSON.stringify(argomenti)} ${JSON.stringify(r.carte)}`);
    assert.equal(gate[0].percorso, atteso, `the yes would be for another file: ${JSON.stringify(argomenti)}`);
    assert.deepEqual(r.contenuti, { [atteso]: 'VECCHIO', [altro]: 'VECCHIO' }, JSON.stringify(argomenti));
  }
});

test('N16: the restore point before a file_edit names the file the kernel edits, with any alias', { timeout: 60_000 }, async (t) => {
  for (const alias of ALIAS_PERCORSO) {
    const visti = [];
    const puntiDiRipristino = { primaDiScrivere: async ({ percorso }) => { visti.push(percorso); return { fatto: false, motivo: 'prova' }; }, dopoLaScrittura: async () => {} };
    const r = await giro(t, { attrezzo: 'file_edit', argomenti: { [alias]: 'src/app.js', old_string: 'VECCHIO', new_string: 'NUOVO' }, bersagli: ['src/app.js'], permessiScelto: 'Workspace write', risposta: [true], puntiDiRipristino });
    assert.equal(r.contenuti['src/app.js'], 'NUOVO', `${alias}: ${JSON.stringify(r.esiti)}`);
    assert.deepEqual(visti, ['src/app.js'], alias);
  }
});

/*
 * N17 N18: a trailing space. Node on Windows writes "AGENTS.md " as a file DISTINCT from AGENTS.md (it does not strip the space the
 * way the Win32 shell does: measured, giro3/spazi3.mjs, also for "AGENTS.md." and " AGENTS.md"), and nobody loads it as the agent's
 * rules. So the gate shows no control-file card for it (it is an ordinary file, decision 375), AGENTS.md stays untouched, and the
 * restore point names the file the kernel writes, space included. A gate that trimmed the space would ask for a file that is not
 * written; a restore point that trimmed it would save the wrong file.
 */
test('N17 N18: a trailing space is a distinct ordinary file: no control-file card, AGENTS.md untouched, restore point keeps the space', { timeout: 60_000 }, async (t) => {
  for (const alias of ['percorso', 'path']) {
    const visti = [];
    const puntiDiRipristino = { primaDiScrivere: async ({ percorso }) => { visti.push(percorso); return { fatto: false, motivo: 'prova' }; }, dopoLaScrittura: async () => {} };
    const r = await giro(t, { argomenti: { [alias]: 'AGENTS.md ', contenuto: 'NUOVO' }, bersagli: ['AGENTS.md'], leggi: null, permessiScelto: 'Workspace write', risposta: [false], puntiDiRipristino });
    assert.equal(r.finito, true, alias);
    assert.equal(cartaDelCancello(r.carte).length, 0, `${alias}: ${JSON.stringify(r.carte)}`);
    assert.equal(r.contenuti['AGENTS.md'], 'VECCHIO', `${alias}: the agent's rules changed`);
    // without a read first the fake model sends the write twice (two restore points): every one names the file WITH the space
    assert.ok(visti.length >= 1, alias);
    assert.deepEqual([...new Set(visti)], ['AGENTS.md '], `${alias}: ${JSON.stringify(visti)}`);
  }
  const visti = [];
  const puntiDiRipristino = { primaDiScrivere: async ({ percorso }) => { visti.push(percorso); return { fatto: false, motivo: 'prova' }; }, dopoLaScrittura: async () => {} };
  await giro(t, { argomenti: { file: 'src/app.js ', contenuto: 'NUOVO' }, bersagli: ['src/app.js'], leggi: null, permessiScelto: 'Workspace write', risposta: [true], puntiDiRipristino });
  assert.ok(visti.length >= 1);
  assert.deepEqual([...new Set(visti)], ['src/app.js '], JSON.stringify(visti));
});
