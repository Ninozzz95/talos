/*
 * Giudice 07/11/2026 23:12, GIALLO B e C: i due elenchi dei file scritti dalla chat (`percorsiScrittiDaEventi`, che decide quali file
 * FUORI dalla cartella si scaricano o vanno al telefono, decisione 215, e `daiEventi` di `remoto/file-dispositivi.mjs`, l'elenco del
 * telefono) leggevano `percorso ?? path ?? file_path`, mentre il nucleo scrive col PRIMO alias non vuoto di `percorsoDiFile`
 * (`kernel/talosHarness.mjs:1665`). Due divari: `filePath`/`file`/`filename` non si elencavano, e `{ percorso: '', path: 'b' }`
 * (il nucleo scrive `b`) non elencava niente. Il verso pericoloso, chiavi gemelle `{ percorso: 'a', path: <segreto> }`, deve restare
 * chiuso: si elenca solo `a`, il file che il nucleo ha scritto davvero. Nessuna chiave, nessun dato vero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { percorsiScrittiDaEventi, realeScrittoDallaChat, scrittureConfermateDaEventi } from '../src/file-scritti-dalla-chat.mjs';
import { creaFileDeiDispositivi } from '../src/remoto/file-dispositivi.mjs';
import { percorsoDiFile, talosLavora } from '../src/kernel/talosHarness.mjs';
import { eventoPerScrittura } from '../src/agui-events.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { cartelleGlobaliDiProva } from './aiuto/cartelle-globali-di-prova.mjs'; // decision 381: never the stores beside the code
import { spawnSync } from 'node:child_process';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

let n = 0;
/**
 * Una chiamata riuscita (o fallita) di un attrezzo che scrive, coi suoi argomenti, come la registra il server. Round 3 (08/11): una
 * scrittura RIUSCITA porta, fra l'inizio e l'esito, lo `StateDelta` che il nucleo manda dopo aver scritto (`onScrittura` con
 * `percorsoDelGiro(percorsoDiFile(argomenti))`, kernel/talosHarness.mjs; l'evento è `eventoPerScrittura` di agui-events.mjs, lo stesso
 * che usa agent-service). Il nucleo scrive solo un percorso di testo non vuoto: un numero o un vuoto falliscono e non mandano niente.
 * `scritto: false` è un `file_edit` che non trova il testo (`isError` falso, nessuna scrittura, nessun evento).
 */
function chiamata(argomenti, { nome = 'scrivi', isError, scritto = isError !== true && (nome === 'scrivi' || nome === 'file_edit') } = {}) {
  n += 1;
  const id = `c${n}`;
  const percorso = percorsoDiFile(argomenti);
  const delta = scritto && typeof percorso === 'string' && percorso ? [eventoPerScrittura({ percorso, contenuto: 'x', esisteva: false })] : [];
  return [
    { type: 'ToolCallStart', toolCallId: id, toolCallName: nome },
    { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(argomenti) },
    ...delta,
    { type: 'ToolCallResult', toolCallId: id, ...(isError === undefined ? {} : { isError }) },
  ];
}

const ALIAS = ['percorso', 'path', 'file_path', 'filePath', 'file', 'filename'];

test('percorsiScrittiDaEventi lists the file the kernel writes for every path alias, with scrivi and file_edit', () => {
  for (const nome of ['scrivi', 'file_edit']) {
    for (const chiave of ALIAS) {
      const argomenti = { [chiave]: `out-${chiave}.txt` };
      assert.deepEqual(percorsiScrittiDaEventi(chiamata(argomenti, { nome })), [percorsoDiFile(argomenti)], `${nome} con ${chiave}`);
    }
  }
});

test('twin keys: only the file the kernel writes is listed, never the second key (both directions)', () => {
  assert.deepEqual(percorsiScrittiDaEventi(chiamata({ percorso: 'a.txt', path: 'C:/segreto/chiavi.txt' })), ['a.txt']);
  assert.deepEqual(percorsiScrittiDaEventi(chiamata({ path: 'a.txt', percorso: 'C:/segreto/chiavi.txt' })), ['C:/segreto/chiavi.txt'],
    'the kernel order is percorso first whatever the JSON order');
  assert.deepEqual(percorsiScrittiDaEventi(chiamata({ file_path: 'a.txt', filename: 'C:/segreto/chiavi.txt' })), ['a.txt']);
  assert.deepEqual(percorsiScrittiDaEventi(chiamata({ percorso: '', path: 'b.txt' })), ['b.txt'], 'an empty percorso: the kernel writes path');
  assert.deepEqual(percorsiScrittiDaEventi(chiamata({ percorso: null, file: 'c.txt' })), ['c.txt'], 'a null percorso: the kernel writes file');
  assert.deepEqual(percorsiScrittiDaEventi(chiamata({ path: 123, file_path: 'x.txt' })), [], 'a non-string first alias: nothing is listed');
  assert.deepEqual(percorsiScrittiDaEventi(chiamata({ filePath: 'f.txt' }, { isError: true })), [], 'a failed write is never listed');
  assert.deepEqual(percorsiScrittiDaEventi(chiamata({ filePath: 'f.txt' }, { nome: 'leggi' })), [], 'a read is never listed');
});

test('realeScrittoDallaChat serves a file outside the folder written with filePath, and never the twin key', (t) => {
  const radice = realpathSync(mkdtempSync(join(tmpdir(), 'talos-scritti-alias-')));
  t.after(() => rimuoviCartellaDiProva(radice));
  const cartella = join(radice, 'progetto');
  const fuori = join(radice, 'fuori');
  mkdirSync(cartella); mkdirSync(fuori);
  const scritto = join(fuori, 'nota.md');
  const segreto = join(fuori, 'segreto.txt');
  const altro = join(fuori, 'altro.md');
  writeFileSync(scritto, 'scritto dalla chat'); writeFileSync(segreto, 'mai scritto dalla chat'); writeFileSync(altro, 'scritto dalla chat');
  const eventi = [...chiamata({ filePath: scritto }), ...chiamata({ percorso: altro, path: segreto })];
  assert.equal(realeScrittoDallaChat({ cartella, percorso: scritto, eventi }), realpathSync.native(scritto));
  assert.equal(realeScrittoDallaChat({ cartella, percorso: altro, eventi }), realpathSync.native(altro));
  assert.equal(realeScrittoDallaChat({ cartella, percorso: segreto, eventi }), null, 'the second key of a twin pair is never served');
});

test('phone file list: a model file written with any alias is listed, the twin key and an empty percorso are not', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-file-disp-alias-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const progetto = join(dir, 'progetto');
  mkdirSync(progetto, { recursive: true });
  for (const nome of [...ALIAS.map((c) => `m-${c}.md`), 'b.md', 'gemello.md', 'vuoto.md']) writeFileSync(join(progetto, nome), '# ciao');
  const eventi = [{ type: 'RunStarted' }];
  for (const chiave of ALIAS) eventi.push(...chiamata({ [chiave]: `m-${chiave}.md` }, { nome: chiave === 'file' ? 'file_edit' : 'scrivi' }));
  eventi.push(...chiamata({ percorso: '', path: 'b.md' }));
  eventi.push(...chiamata({ percorso: 'm-percorso.md', path: 'gemello.md' }));
  eventi.push(...chiamata({ percorso: '', path: 123, file: 'vuoto.md' }));
  const reale = realpathSync(progetto);
  const registro = {
    esiste: (id) => id === 's1',
    cartellaPerChatFile: async (id) => (id === 's1' ? { ok: true, cartella: reale } : { erroreAvvio: true, code: 'NOT_FOUND' }),
  };
  const file = creaFileDeiDispositivi({ cartella: join(dir, 'dati'), sessionRegistry: registro, eventiDellaSessione: () => eventi, clock: () => 1_800_000_000_000 });
  const { items } = await file.elenco({ dispositivoId: 'dA', sessionId: 's1' });
  const perNome = Object.fromEntries(items.map((r) => [r.nome, r]));
  for (const chiave of ALIAS) assert.equal(perNome[`m-${chiave}.md`]?.origine, 'modello', `scritto con ${chiave}`);
  assert.equal(perNome['b.md']?.origine, 'modello', 'an empty percorso: the kernel wrote path');
  assert.equal(perNome['gemello.md'], undefined, 'the second key of a twin pair is not a model file');
  assert.equal(perNome['vuoto.md'], undefined, 'a non-string first alias (the kernel path is a number): not a model file');
});

// ---- Round 2 (reviewer of tests and mutants, 07/11): every ordered pair of aliases, and a number on disk; named for the mutants ----
const COPPIE = ALIAS.flatMap((a, i) => ALIAS.slice(i + 1).map((b) => [a, b]));

test('F1 F2: every ordered pair of aliases with two different files: only the first in kernel order is listed', () => {
  for (const [primo, secondo] of COPPIE) {
    for (const nome of ['scrivi', 'file_edit']) {
      assert.deepEqual(percorsiScrittiDaEventi(chiamata({ [secondo]: 'gemello.txt', [primo]: 'vero.txt' }, { nome })), ['vero.txt'], `${nome} ${primo} + ${secondo}`);
    }
  }
});

test('D1 D2 D4: phone list, every ordered pair of aliases lists only the first; a number path is never a model file even if "123" exists', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-file-disp-coppie-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const progetto = join(dir, 'progetto');
  mkdirSync(progetto, { recursive: true });
  const veri = COPPIE.map(([a, b]) => `v-${a}-${b}.md`);
  const gemelli = COPPIE.map(([a, b]) => `g-${a}-${b}.md`);
  for (const nome of [...veri, ...gemelli, '123', '0']) writeFileSync(join(progetto, nome), '# ciao');
  const eventi = [{ type: 'RunStarted' }];
  COPPIE.forEach(([a, b], i) => eventi.push(...chiamata({ [b]: gemelli[i], [a]: veri[i] })));
  eventi.push(...chiamata({ path: 123 }), ...chiamata({ percorso: '', file_path: 123 }), ...chiamata({ filename: 0 }));
  const reale = realpathSync(progetto);
  const registro = {
    esiste: (id) => id === 's1',
    cartellaPerChatFile: async (id) => (id === 's1' ? { ok: true, cartella: reale } : { erroreAvvio: true, code: 'NOT_FOUND' }),
  };
  const file = creaFileDeiDispositivi({ cartella: join(dir, 'dati'), sessionRegistry: registro, eventiDellaSessione: () => eventi, clock: () => 1_800_000_000_000 });
  const { items } = await file.elenco({ dispositivoId: 'dA', sessionId: 's1' });
  const perNome = Object.fromEntries(items.map((r) => [r.nome, r]));
  for (const nome of veri) assert.equal(perNome[nome]?.origine, 'modello', nome);
  for (const nome of gemelli) assert.equal(perNome[nome], undefined, `${nome}: the second key of a pair is not a model file`);
  assert.equal(perNome['123'], undefined, 'a number path is not a file the kernel wrote');
  assert.equal(perNome['0'], undefined, 'zero is not a file the kernel wrote');
});

// ---- Round 3 (08/11, decision 215, MEDIUM): only a write the kernel CONFIRMS enters the list; a failed file_edit never does ----
// ⚠ This RESTRICTS what the phone can download and receive: a file the kernel did not write is no longer "written by this chat".

const elencoDelTelefono = async (t, cartellaProgetto, eventi) => {
  const reale = realpathSync(cartellaProgetto);
  const registro = {
    esiste: (id) => id === 's1',
    cartellaPerChatFile: async (id) => (id === 's1' ? { ok: true, cartella: reale } : { erroreAvvio: true, code: 'NOT_FOUND' }),
  };
  const dati = mkdtempSync(join(tmpdir(), 'talos-file-disp-dati-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  const file = creaFileDeiDispositivi({ cartella: dati, sessionRegistry: registro, eventiDellaSessione: () => eventi, clock: () => 1_800_000_000_000 });
  const { items } = await file.elenco({ dispositivoId: 'dA', sessionId: 's1' });
  return Object.fromEntries(items.map((r) => [r.nome, r]));
};

test('B1: a failed file_edit (NOT FOUND, isError false, no StateDelta) with each of the six aliases is NOT written by the chat: not in the list, not served, not on the phone', async (t) => {
  const radice = realpathSync(mkdtempSync(join(tmpdir(), 'talos-scritti-b1-')));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto'); const fuori = join(radice, 'fuori');
  mkdirSync(progetto); mkdirSync(fuori);
  const eventi = [{ type: 'RunStarted' }];
  for (const chiave of ALIAS) {
    writeFileSync(join(progetto, `dentro-${chiave}.md`), 'mai scritto'); writeFileSync(join(fuori, `fuori-${chiave}.md`), 'mai scritto');
    eventi.push(...chiamata({ [chiave]: `dentro-${chiave}.md`, old_string: 'assente', new_string: 'x' }, { nome: 'file_edit', isError: false, scritto: false }));
    eventi.push(...chiamata({ [chiave]: join(fuori, `fuori-${chiave}.md`), old_string: 'assente', new_string: 'x' }, { nome: 'file_edit', isError: false, scritto: false }));
  }
  assert.deepEqual(percorsiScrittiDaEventi(eventi), []);
  assert.deepEqual(scrittureConfermateDaEventi(eventi), []);
  for (const chiave of ALIAS) assert.equal(realeScrittoDallaChat({ cartella: progetto, percorso: join(fuori, `fuori-${chiave}.md`), eventi }), null, chiave);
  const perNome = await elencoDelTelefono(t, progetto, eventi);
  for (const chiave of ALIAS) assert.notEqual(perNome[`dentro-${chiave}.md`]?.origine, 'modello', `${chiave}: a failed edit is not a model file`);
});

test('B2: the other direction, a confirmed scrivi and file_edit with each of the six aliases ARE written by the chat (list, served, phone)', async (t) => {
  const radice = realpathSync(mkdtempSync(join(tmpdir(), 'talos-scritti-b2-')));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto'); const fuori = join(radice, 'fuori');
  mkdirSync(progetto); mkdirSync(fuori);
  const eventi = [{ type: 'RunStarted' }];
  for (const nome of ['scrivi', 'file_edit']) {
    for (const chiave of ALIAS) {
      writeFileSync(join(progetto, `${nome}-${chiave}.md`), 'scritto'); writeFileSync(join(fuori, `${nome}-${chiave}.md`), 'scritto');
      eventi.push(...chiamata({ [chiave]: `${nome}-${chiave}.md` }, { nome }));
      eventi.push(...chiamata({ [chiave]: join(fuori, `${nome}-${chiave}.md`) }, { nome }));
    }
  }
  const perNome = await elencoDelTelefono(t, progetto, eventi);
  for (const nome of ['scrivi', 'file_edit']) {
    for (const chiave of ALIAS) {
      assert.equal(realeScrittoDallaChat({ cartella: progetto, percorso: join(fuori, `${nome}-${chiave}.md`), eventi }), realpathSync.native(join(fuori, `${nome}-${chiave}.md`)), `${nome} ${chiave}`);
      assert.equal(perNome[`${nome}-${chiave}.md`]?.origine, 'modello', `${nome} ${chiave}`);
    }
  }
  // the delta outside a write call (document_create, library_export) is in the decision-215 list as before, not a phone model row
  const doc = [{ type: 'RunStarted' }, eventoPerScrittura({ percorso: 'documento.md', contenuto: 'x', esisteva: false })];
  assert.deepEqual(percorsiScrittiDaEventi(doc), ['documento.md']);
  assert.deepEqual(scrittureConfermateDaEventi(doc), []);
});

test('B3: a StateDelta inside a scrivi call lists the file the kernel wrote (whatever the result flag); a delta inside a read is not a phone row', () => {
  const eventi = [{ type: 'RunStarted' }, { type: 'RunStarted' },
    { type: 'ToolCallStart', toolCallId: 'x', toolCallName: 'scrivi' }, { type: 'ToolCallArgs', toolCallId: 'x', delta: '{"path":"a.md"}' },
    eventoPerScrittura({ percorso: 'C:/casa/a.md', contenuto: 'x', esisteva: true }), // the Windows view of a Linux-home path
    { type: 'ToolCallResult', toolCallId: 'x', isError: true }, // the result flag does not decide: the kernel wrote
    { type: 'ToolCallStart', toolCallId: 'y', toolCallName: 'leggi' }, eventoPerScrittura({ percorso: 'b.md', contenuto: 'x', esisteva: false }),
    { type: 'ToolCallResult', toolCallId: 'y' }];
  assert.deepEqual(scrittureConfermateDaEventi(eventi), [{ percorso: 'C:/casa/a.md', giro: 2 }]);
});

/*
 * N22 (round-2 reviewer): the phone list must keep the case of the path the kernel wrote. On a case-insensitive Windows folder a
 * lowercased path still resolves to the file (equivalent), so the test turns the folder case-sensitive (fsutil, no admin needed,
 * measured in round 3), as Linux always is; where that cannot be done it is skipped and says why.
 */
test('N22: phone list, a model file with capitals keeps its case (case-sensitive folder)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-file-disp-maiuscole-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const progetto = join(dir, 'progetto');
  mkdirSync(progetto, { recursive: true });
  if (process.platform === 'win32') {
    const r = spawnSync('fsutil.exe', ['file', 'setCaseSensitiveInfo', progetto, 'enable'], { encoding: 'utf8' });
    if (r.status !== 0) { t.skip(`fsutil could not make the folder case-sensitive: ${String(r.stdout || r.stderr).trim().slice(0, 120)}`); return; }
  }
  writeFileSync(join(progetto, 'Nota-Grande.MD'), '# ciao');
  writeFileSync(join(progetto, 'Altro.MD'), '# ciao');
  assert.equal(existsSync(join(progetto, 'nota-grande.md')), false, 'the folder must be case-sensitive for this test');
  const eventi = [{ type: 'RunStarted' }, ...chiamata({ path: 'Nota-Grande.MD' }), ...chiamata({ filename: 'Altro.MD' }, { nome: 'file_edit' })];
  const perNome = await elencoDelTelefono(t, progetto, eventi);
  assert.equal(perNome['Nota-Grande.MD']?.origine, 'modello', JSON.stringify(Object.keys(perNome)));
  assert.equal(perNome['Altro.MD']?.origine, 'modello', JSON.stringify(Object.keys(perNome)));
});

// ---- the real wire: what the kernel really sends, for every writer and every alias (judge 00:37, GIALLO F) ----
const enc = new TextEncoder();
const flusso = (pezzi) => new Response(new ReadableStream({ start(c) {
  for (const x of pezzi) c.enqueue(enc.encode(`data: ${JSON.stringify(x)}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n'));
  c.close();
} }));
const chiamataDelModello = (id, nome, argomenti) => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] }]);
const VOCI = [{ id: 'lib-1', nome: 'esportato.md' }];

/** One real turn in Full access (no cards): the model calls each of `chiamate` in order; returns the project and every event. */
async function giroDiScritture(t, chiamate, { esistenti = {} } = {}) {
  const progetto = realpathSync(mkdtempSync(join(tmpdir(), 'talos-scritti-filo-')));
  t.after(() => rimuoviCartellaDiProva(progetto));
  for (const [rel, testo] of Object.entries(esistenti)) writeFileSync(join(progetto, rel), testo);
  let k = 0;
  const fetchDiRete = async () => {
    const c = chiamate[k]; k += 1;
    return c ? chiamataDelModello(`c${k}`, c[0], c[1]) : flusso([{ choices: [{ delta: { content: 'fatto' } }] }]);
  };
  const registro = createSessionRegistry({
    ...cartelleGlobaliDiProva(), modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, caricaHooksFn: async () => ({ hooks: [] }), cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'prova' } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (kk) => talosLavora({ ...kk, fetchDiRete }),
      elencaVociFn: async () => VOCI.map((v) => ({ ...v, fileType: 'document', origine: 'uploaded' })),
      leggiBytesVoceFn: async ({ id }) => { const v = VOCI.find((x) => x.id === id); return v ? { bytes: Buffer.from('FROM LIBRARY'), nome: v.nome, mediaType: 'text/markdown' } : null; } }),
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Full access' });
  const eventi = [];
  t.after(registro.iscriviti(sessionId, (e) => eventi.push(e)));
  const inizio = Date.now();
  while (!eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError') && Date.now() - inizio < 60_000) await new Promise((r) => setTimeout(r, 10));
  return { progetto, eventi };
}

test('B4 (GIALLO F): real wire, no truly written file leaves the lists: scrivi and successful file_edit with the six aliases, document_create, library_export; a failed file_edit with the six aliases never enters', { timeout: 120_000 }, async (t) => {
  const esistenti = {};
  const chiamate = [];
  for (const chiave of ALIAS) {
    chiamate.push(['scrivi', { [chiave]: `s-${chiave}.md`, contenuto: 'nuovo' }]);
    esistenti[`e-${chiave}.md`] = 'vecchio testo'; esistenti[`x-${chiave}.md`] = 'vecchio testo';
    chiamate.push(['leggi', { percorso: `e-${chiave}.md` }], ['file_edit', { [chiave]: `e-${chiave}.md`, old_string: 'vecchio', new_string: 'nuovo' }]);
    chiamate.push(['leggi', { percorso: `x-${chiave}.md` }], ['file_edit', { [chiave]: `x-${chiave}.md`, old_string: 'ASSENTE', new_string: 'nuovo' }]);
  }
  chiamate.push(['document_create', { format: 'md', title: 'documento', body: 'x' }], ['library_export', { reference: 'esportato.md' }]);
  const { progetto, eventi } = await giroDiScritture(t, chiamate, { esistenti });
  assert.ok(eventi.some((e) => e.type === 'RunFinished'), 'the turn did not finish');
  const lista = new Set(percorsiScrittiDaEventi(eventi).map((p) => p.replace(/\\/gu, '/').split('/').pop()));
  const perNome = await elencoDelTelefono(t, progetto, eventi);
  const rossi = [];
  for (const chiave of ALIAS) {
    if (readFileSync(join(progetto, `e-${chiave}.md`), 'utf8') !== 'nuovo testo') rossi.push(`file_edit ${chiave}: not edited`);
    if (readFileSync(join(progetto, `x-${chiave}.md`), 'utf8') !== 'vecchio testo') rossi.push(`failed file_edit ${chiave}: the file changed`);
    for (const [rel, atteso] of [[`s-${chiave}.md`, true], [`e-${chiave}.md`, true], [`x-${chiave}.md`, false]]) {
      if (lista.has(rel) !== atteso) rossi.push(`215 list ${rel}: ${lista.has(rel)}`);
      if ((perNome[rel]?.origine === 'modello') !== atteso) rossi.push(`phone ${rel}: ${perNome[rel]?.origine}`);
    }
  }
  for (const rel of ['documento.md', 'esportato.md']) {
    if (!existsSync(join(progetto, rel))) rossi.push(`${rel}: not written`);
    if (!lista.has(rel)) rossi.push(`215 list ${rel}: missing`);
  }
  assert.deepEqual(rossi, []);
});
