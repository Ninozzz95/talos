/*
 * Decisione 215 dell'owner (04/11/2026): un file FUORI dalla cartella della chat si scarica, si apre nel lettore e si manda al
 * telefono solo se QUESTA chat l'ha creato o scritto. Server vero, sessioni finte, cartella temporanea, nessuna chiave.
 *   (a) il file scritto dalla chat fuori dalla cartella: oggi rifiutato, dopo la cura servito (scarico, lettore, anteprima);
 *   (b) un file fuori NON scritto resta rifiutato, anche accanto a quello scritto e anche scritto da un'ALTRA chat;
 *   (c) un `..` che arriva allo stesso file passando da un collegamento: servito solo se il bersaglio vero è il file scritto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eventoPerScrittura } from '../src/agui-events.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { cartelleGlobaliDiProva, cartelleGlobaliDiProvaPerApp } from './aiuto/cartelle-globali-di-prova.mjs'; // decision 381: never the stores beside the code
import { percorsiScrittiDaEventi, realeScrittoDallaChat } from '../src/file-scritti-dalla-chat.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { WorkspaceFileError } from '../src/workspace-files.mjs';

const TOKEN = 'test-scarico-fuori-token';

async function banco(t, opzioniDelRegistro = {}) {
  const radice = realpathSync(mkdtempSync(join(tmpdir(), 'talos-scarico-fuori-')));
  const progetto = join(radice, 'progetto');
  const fuori = join(radice, 'fuori');
  mkdirSync(progetto); mkdirSync(fuori);
  writeFileSync(join(progetto, 'dentro.md'), 'dentro');
  writeFileSync(join(fuori, 'nota.md'), 'scritto dalla chat');
  writeFileSync(join(fuori, 'altro.md'), 'mai scritto');
  writeFileSync(join(fuori, '.env'), 'OPENAI_API_KEY=sk-finta');
  /* una giunzione (Windows) o un collegamento simbolico di cartella: `../ponte/x` porta a `../fuori/x` */
  symlinkSync(fuori, join(radice, 'ponte'), 'junction');
  const ingressi = []; const attese = [];
  const avviaSessioneFn = async (input) => {
    ingressi.push(input);
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${ingressi.length}` });
    return new Promise((risolvi) => { attese.push({ input, risolvi }); });
  };
  const sessionRegistry = createSessionRegistry({ ...cartelleGlobaliDiProva(), avviaSessioneFn, modello: 'test/model', chiave: 'test',
    cartelleProgetto: [{ id: 'p1', nome: 'progetto', percorso: progetto }], ...opzioniDelRegistro });
  const server = createServer(createHttpApp({ ...cartelleGlobaliDiProvaPerApp(), senzaGettone: 'prove', staticHandler: () => {}, token: TOKEN, sessionRegistry }));
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  t.after(async () => {
    for (const { input, risolvi } of attese) {
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r', outcome: 'success' });
      risolvi({ esito: { messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'fatto' }] } });
    }
    await new Promise((risolvi) => setTimeout(risolvi, 30));
    await sessionRegistry.chiudi?.();
    server.closeAllConnections();
    await new Promise((risolvi) => server.close(risolvi));
    rimuoviCartellaDiProva(radice);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const intestazioni = { Origin: base, 'Sec-Fetch-Site': 'same-origin', Cookie: `talos_token=${TOKEN}` };
  const avvia = async () => {
    const r = await fetch(`${base}/api/v1/sessions/custom`, { method: 'POST', body: JSON.stringify({ cartellaId: 'p1', consegna: 'scrivi' }), headers: { ...intestazioni, 'Content-Type': 'application/json' } });
    const corpo = await r.json();
    assert.equal(r.status, 200, JSON.stringify(corpo));
    return { sessionId: corpo.data.sessionId, input: ingressi.at(-1) };
  };
  const scarica = (sessionId, percorso, extra = '') => fetch(`${base}/api/v1/sessions/${sessionId}/file?percorso=${encodeURIComponent(percorso)}${extra}`, { headers: intestazioni });
  const apri = (sessionId, percorso) => fetch(`${base}/api/v1/sessions/${sessionId}/tree/file?percorso=${encodeURIComponent(percorso)}`, { headers: intestazioni });
  return { radice, progetto, fuori, avvia, scarica, apri };
}

const scrive = (input, percorso) => input.onEvento(eventoPerScrittura({ percorso, contenuto: 'x', esisteva: false }));

test('SF-01 (a): il file scritto dalla chat fuori dalla cartella si scarica e si apre nel lettore', async (t) => {
  const b = await banco(t);
  const { sessionId, input } = await b.avvia();
  scrive(input, '../fuori/nota.md');
  const r = await b.scarica(sessionId, '../fuori/nota.md');
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(await r.text(), 'scritto dalla chat');
  assert.match(r.headers.get('content-disposition'), /filename="nota\.md"/u);
  const a = await b.apri(sessionId, '../fuori/nota.md');
  assert.equal(a.status, 200);
  assert.equal((await a.json()).data.contenuto, 'scritto dalla chat');
});

test('SF-02 (a): anche quando il nucleo ha scritto il percorso ASSOLUTO, e lo chiede assoluto', async (t) => {
  const b = await banco(t);
  const { sessionId, input } = await b.avvia();
  scrive(input, join(b.fuori, 'nota.md'));
  const r = await b.scarica(sessionId, join(b.fuori, 'nota.md'));
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'scritto dalla chat');
  assert.equal((await b.scarica(sessionId, '../fuori/nota.md')).status, 200, 'relativo o assoluto, è lo stesso file');
});

test('SF-03 (a): una chiamata riuscita di scrivi conta; una fallita no', async (t) => {
  const b = await banco(t);
  const { sessionId, input } = await b.avvia();
  input.onEvento({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'scrivi' });
  input.onEvento({ type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ percorso: '../fuori/altro.md', contenuto: 'x' }) });
  input.onEvento({ type: 'ToolCallResult', toolCallId: 'c1', isError: true, content: 'REFUSED' });
  assert.equal((await b.scarica(sessionId, '../fuori/altro.md')).status, 400, 'una scrittura fallita non apre niente');
  input.onEvento({ type: 'ToolCallStart', toolCallId: 'c2', toolCallName: 'file_edit' });
  input.onEvento({ type: 'ToolCallArgs', toolCallId: 'c2', delta: JSON.stringify({ path: '../fuori/altro.md' }) });
  // round 3 (decision 215): a call that did not write (file_edit NOT FOUND, isError false) opens nothing; only the kernel's
  // StateDelta, sent after the real write, does
  input.onEvento({ type: 'ToolCallResult', toolCallId: 'c2', content: 'NOT FOUND. Nothing was changed' });
  assert.equal((await b.scarica(sessionId, '../fuori/altro.md')).status, 400, 'a file_edit that did not write opens nothing');
  input.onEvento({ type: 'ToolCallStart', toolCallId: 'c3', toolCallName: 'file_edit' });
  input.onEvento({ type: 'ToolCallArgs', toolCallId: 'c3', delta: JSON.stringify({ path: '../fuori/altro.md' }) });
  scrive(input, '../fuori/altro.md');
  input.onEvento({ type: 'ToolCallResult', toolCallId: 'c3', content: 'ok' });
  assert.equal((await b.scarica(sessionId, '../fuori/altro.md')).status, 200);
});

test('SF-04 (b): al contrario, un file fuori NON scritto resta rifiutato, anche accanto a quello scritto e da un\'altra chat', async (t) => {
  const b = await banco(t);
  const prima = await b.avvia();
  const seconda = await b.avvia();
  scrive(prima.input, '../fuori/nota.md');
  for (const percorso of ['../fuori/altro.md', join(b.fuori, 'altro.md'), '../fuori']) {
    const r = await b.scarica(prima.sessionId, percorso);
    assert.equal(r.status, 400, percorso);
    assert.equal((await r.json()).error.code, 'QUERY_INVALID');
    assert.equal((await b.apri(prima.sessionId, percorso)).status, 400, percorso);
  }
  /* un file fuori che non esiste: come oggi, «non trovato» (il realpath fallisce prima del confine) */
  assert.equal((await b.scarica(prima.sessionId, '../fuori/inesistente.md')).status, 404);
  assert.equal((await b.scarica(seconda.sessionId, '../fuori/nota.md')).status, 400, 'la lista è della chat, non del server');
  assert.equal((await b.scarica(prima.sessionId, 'dentro.md')).status, 200, 'dentro la cartella tutto come prima');
});

test('SF-05 (c): un `..` che passa da una giunzione arriva al file scritto solo se è davvero lui; le maiuscole non aprono altro', async (t) => {
  const b = await banco(t);
  const { sessionId, input } = await b.avvia();
  scrive(input, '../fuori/nota.md');
  assert.equal((await b.scarica(sessionId, '../ponte/nota.md')).status, 200, 'stesso file reale, strada diversa');
  assert.equal((await b.scarica(sessionId, '../ponte/altro.md')).status, 400, 'la giunzione non apre i vicini');
  assert.equal((await b.scarica(sessionId, '../progetto/../ponte/../fuori/altro.md')).status, 400);
  if (process.platform === 'win32') assert.equal((await b.scarica(sessionId, '../FUORI/NOTA.md')).status, 200, 'Windows: stesso file');
  /* e al contrario: la chat ha scritto PASSANDO dalla giunzione, la richiesta arriva diretta */
  const altra = await b.avvia();
  scrive(altra.input, '../ponte/altro.md');
  assert.equal((await b.scarica(altra.sessionId, '../fuori/altro.md')).status, 200);
  assert.equal((await b.scarica(altra.sessionId, '../fuori/nota.md')).status, 400);
});

test('SF-06: i segreti restano fuori dalle anteprime del modello anche se la chat li ha scritti', async (t) => {
  const b = await banco(t);
  const { sessionId, input } = await b.avvia();
  scrive(input, '../fuori/.env');
  const r = await b.scarica(sessionId, '../fuori/.env', '&origine=modello');
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.code, 'PREVIEW_FILE_SECRET');
});

test('SF-07: il modulo puro — elenco dallo StateDelta del nucleo (round 3: la sola chiamata non basta), null senza eventi, null per un percorso con \\0', () => {
  const eventi = [
    eventoPerScrittura({ percorso: 'a.md', contenuto: 'x', esisteva: true }),
    { type: 'StateDelta', delta: [{ op: 'remove', path: '/file/via.md' }, { op: 'add', path: '/usage/x' }] },
    { type: 'ToolCallStart', toolCallId: 'k', toolCallName: 'leggi' },
    { type: 'ToolCallArgs', toolCallId: 'k', delta: '{"percorso":"letto.md"}' },
    { type: 'ToolCallResult', toolCallId: 'k' },
    { type: 'ToolCallStart', toolCallId: 'w', toolCallName: 'scrivi' },
    { type: 'ToolCallArgs', toolCallId: 'w', delta: '{"file_path":"b.md"}' },
    eventoPerScrittura({ percorso: 'b.md', contenuto: 'x', esisteva: false }),
    { type: 'ToolCallResult', toolCallId: 'w' },
    { type: 'ToolCallStart', toolCallId: 'v', toolCallName: 'file_edit' },
    { type: 'ToolCallArgs', toolCallId: 'v', delta: '{"file_path":"mai.md"}' },
    { type: 'ToolCallResult', toolCallId: 'v', content: 'NOT FOUND. Nothing was changed' },
  ];
  assert.deepEqual(percorsiScrittiDaEventi(eventi), ['a.md', 'b.md'], 'mai.md: a file_edit that did not write is not listed');
  assert.deepEqual(percorsiScrittiDaEventi(null), []);
  const radice = realpathSync(mkdtempSync(join(tmpdir(), 'talos-scritti-')));
  try {
    writeFileSync(join(radice, 'a.md'), 'x');
    assert.equal(realeScrittoDallaChat({ cartella: radice, percorso: 'a.md', eventi }), realpathSync.native(join(radice, 'a.md')));
    assert.equal(realeScrittoDallaChat({ cartella: radice, percorso: 'a.md', eventi: [] }), null);
    assert.equal(realeScrittoDallaChat({ cartella: radice, percorso: 'a.md\0', eventi }), null);
    assert.equal(realeScrittoDallaChat({ cartella: radice, percorso: '', eventi }), null);
    assert.equal(realeScrittoDallaChat({ cartella: radice, percorso: 'b.md', eventi }), null, 'scritto ma sparito: non si serve');
  } finally { rimuoviCartellaDiProva(radice); }
});

test('SF-08: il ripiego si guarda SOLO dopo il no del confine: un altro rifiuto di un file scritto dalla chat non si ritenta', async (t) => {
  const letture = [];
  const b = await banco(t, {
    leggiContenutoFileFn: async (richiesta) => { letture.push(richiesta); throw new WorkspaceFileError('File too large', 'FILE_TOO_LARGE'); },
  });
  const { sessionId, input } = await b.avvia();
  scrive(input, 'dentro.md');
  const a = await b.apri(sessionId, 'dentro.md');
  assert.equal(a.status >= 400, true);
  assert.equal((await a.json()).error.code, 'FILE_TOO_LARGE');
  assert.equal(letture.length, 1, 'un rifiuto che non è del confine non riapre il file dalla sua cartella');
});
