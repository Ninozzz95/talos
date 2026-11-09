/*
 * C1 (owner 09/10/2026 sera): il Context Engine col metodo (livello 1, livello 2 se serve, recupero) diventa il motore DI SERIE
 * del desktop — solo per le conversazioni NUOVE, con un interruttore in Impostazioni → Contesto («Motore del contesto»), acceso
 * di serie; da spento le nuove usano il legacy. Qui l'interruttore (lato server, così vale per ogni porta da cui nasce una
 * conversazione: la chat, le figlie, i Workflow, le automazioni).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rmdir, writeFile, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mock } from 'node:test';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaAccessoLocaleOspite } from '../src/accesso-locale-ospite.mjs';
import { createImpostazioniContesto } from '../src/impostazioni-contesto.mjs';

const rimuoviFile = (p) => fs.promises.rm(p);

async function cartella(t) {
  const dir = await mkdtemp(join(tmpdir(), 'c1-motore-di-serie-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir)); // bc09: la rimozione di prova con l'aiuto (classe A)
  return dir;
}

test('C1-SERIE-01: with no file the engine is ON (the default); the choice is saved and read back after a restart', async (t) => {
  const dir = await cartella(t);
  const file = join(dir, 'impostazioni-contesto.json');
  const prima = createImpostazioniContesto({ file });
  assert.deepEqual(await prima.leggi(), { motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null });
  assert.deepEqual(await prima.scrivi({ motore: 'legacy' }), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: null });
  const dopo = createImpostazioniContesto({ file }); // un processo nuovo
  assert.deepEqual(await dopo.leggi(), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: null });
  assert.equal(JSON.parse(await readFile(file, 'utf8')).schema, 'talos.context-settings.v1');
  assert.equal(dopo.motorePerUnaConversazioneNuova(), 'legacy', 'the synchronous answer for a new conversation follows the saved choice');
});

test('C1-SERIE-02: a wrong value is refused and changes nothing', async (t) => {
  const dir = await cartella(t);
  const impostazioni = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json') });
  await assert.rejects(() => impostazioni.scrivi({ motore: 'turbo' }), { code: 'CTX_SETTINGS_INVALID' });
  await assert.rejects(() => impostazioni.scrivi({ motore: 'legacy', altro: 1 }), { code: 'CTX_SETTINGS_INVALID' });
  assert.deepEqual(await impostazioni.leggi(), { motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null });
});

test('C1-SERIE-03: an unreadable file does not decide for the person: the default, and the problem is said (not hidden)', async (t) => {
  const dir = await cartella(t);
  const file = join(dir, 'impostazioni-contesto.json');
  await writeFile(file, '{ rotto');
  const avvisi = [];
  const impostazioni = createImpostazioniContesto({ file, avvisa: (m) => avvisi.push(m) });
  assert.deepEqual(await impostazioni.leggi(), { motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null });
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0], /impostazioni-contesto\.json/u);
});

/* Il profilo del modello per il motore di serie (non più l'elenco fisso della prova): la finestra dal catalogo, mai oltre
   tetto/0,75 (la soglia del legacy, decisione F2 del 24/09: tetto assoluto 200K più 0,75 della finestra), e la prudenziale
   quando la finestra è ignota; il motore locale solo se è pronto, con quel modello e la sua finestra vera. */
test('C1-SERIE-04: the default profile follows the catalog window, never above cap/0.75, prudential when unknown', async () => {
  const { resolveDesktopDefaultProfile } = await import('../src/context-runtime.mjs');
  const finestre = { 'z-ai/glm-5.3-flash': 200_000, 'grande/un-milione': 1_000_000, 'piccolo/32k': 32_768 };
  const finestraFn = (m) => finestre[m] ?? null;
  const p = (model, env = {}) => resolveDesktopDefaultProfile({ provider: 'openrouter', model, finestraFn, env });
  assert.deepEqual(await p('piccolo/32k'), { provider: 'openrouter', model: 'piccolo/32k', windowTokens: 32_768, responseReserve: 4_096 });
  assert.equal((await p('z-ai/glm-5.3-flash')).windowTokens, 200_000);
  assert.equal((await p('grande/un-milione')).windowTokens, 266_667, 'a 1M model is presented at cap/0.75: the engine triggers near the legacy cap');
  assert.equal((await p('sconosciuto/x')).windowTokens, 266_667, 'unknown window: the prudential one');
  assert.equal((await p('grande/un-milione', { TALOS_COMPACTION_TOKEN_CAP: '600000' })).windowTokens, 800_000, 'the explicit cap moves it');
  /* CONTRATTO-R30-R31 (owner 30/10/2026): la riserva per la risposta arriva a 32.000 (era 16.384) — un ottavo della finestra sotto */
  assert.equal((await p('grande/un-milione')).responseReserve, 32_000);
  assert.equal((await p('z-ai/glm-5.3-flash')).responseReserve, 25_000, 'un ottavo dei 200.000 di GLM');
  const locale = (stato) => resolveDesktopDefaultProfile({ provider: 'local', model: 'gemma', finestraFn, readLocalRuntime: async () => stato });
  assert.equal((await locale({ state: 'ready', modelId: 'gemma', windowTokens: 8192 })).windowTokens, 8192);
  await assert.rejects(() => locale({ state: 'ready', modelId: 'altro', windowTokens: 8192 }), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' });
  await assert.rejects(() => locale({ state: 'loading' }), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' });
});

/* 21/10/2026, dal vivo sul Pad: il motore del contesto dava al modello del motore dell'app 266.667 token (id nudo ⇒ nessuna finestra),
   mentre la politica del registro, che passa l'id col fornitore, diceva 28.160. Si prova con la `finestraDelModelloOspite` VERA:
   riconosce il motore dell'app solo da `locale-ospite:`. */
test('C1-SERIE-04b: the app engine model (locale-ospite) gets its real window, with the provider in the id; prudent 16,384 when unknown', async () => {
  const { resolveDesktopDefaultProfile, FINESTRA_PRUDENTE_MOTORE_DELL_APP } = await import('../src/context-runtime.mjs');
  const { finestraDelModelloOspite } = await import('../src/accesso-locale-ospite.mjs');
  const accesso = { finestra: (id) => (id === 'LFM2.5-2.6B-QAD-Q4_0.gguf' ? 28_160 : null) };
  const chiesti = [];
  const finestraFn = (m) => { chiesti.push(m); const ospite = finestraDelModelloOspite(accesso, m); return ospite !== undefined ? ospite : null; };
  const o = (model) => resolveDesktopDefaultProfile({ provider: 'locale-ospite', model, finestraFn });
  const noto = await o('LFM2.5-2.6B-QAD-Q4_0.gguf');
  assert.equal(noto.windowTokens, 28_160, 'the window the app engine opened, as the registry policy says');
  assert.equal(noto.responseReserve, 3_520);
  assert.equal(chiesti[0], 'locale-ospite:LFM2.5-2.6B-QAD-Q4_0.gguf', 'the id goes with its provider');
  assert.equal((await o('mai-visto.gguf')).windowTokens, FINESTRA_PRUDENTE_MOTORE_DELL_APP, 'unknown: prudent, never the cloud maximum');
  assert.equal(FINESTRA_PRUDENTE_MOTORE_DELL_APP, 16_384);
  // verso contrario: OpenRouter resta con l'id nudo (il catalogo è il suo)
  const orChiesti = [];
  await resolveDesktopDefaultProfile({ provider: 'openrouter', model: 'z-ai/glm-5.3-flash', finestraFn: (m) => { orChiesti.push(m); return 200_000; } });
  assert.deepEqual(orChiesti, ['z-ai/glm-5.3-flash']);
});

/* FE-053: la risposta porta anche `catena`, che ha le sue prove (CATENA-IMP-*): qui contano le tre scelte, e che ci sia sempre */
const leScelte = ({ catena, ...scelte }) => { assert.ok(Array.isArray(catena), 'catena'); return scelte; };

test('C1-SERIE-05: GET and POST /api/v1/context-settings — the switch, a body with only the expected field', async (t) => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const http = await import('node:http');
  const dir = await cartella(t);
  const impostazioniContesto = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json') });
  const server = http.createServer(createHttpApp({ senzaGettone: 'prove', impostazioniContesto }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); // porta di prova dentro il test, chiusa a fine prova (owner 30/09)
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/context-settings`;
  assert.deepEqual(leScelte((await (await fetch(base)).json()).data), { motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null });
  const post = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motore: 'legacy' }) });
  assert.equal(post.status, 200);
  assert.deepEqual(leScelte((await post.json()).data), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: null });
  for (const corpo of [{}, { motore: 'turbo' }, { motore: 'engine', altro: 1 }]) {
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }
  assert.deepEqual(await impostazioniContesto.leggi(), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: null }, 'wrong bodies changed nothing');
  // senza archivio del contesto: 503 dichiarato, non un errore imprevisto
  const spento = http.createServer(createHttpApp({ senzaGettone: 'prove' }));
  await new Promise((r) => spento.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => spento.close(r)));
  const r = await fetch(`http://127.0.0.1:${spento.address().port}/api/v1/context-settings`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'CONTEXT_SETTINGS_UNAVAILABLE');
});

/*
 * Contratto C6 «mai aspettare» (CLI e desktop, 27/10/2026) e bozzetto approvato dall'owner il 28/10 (Impostazioni → Memoria e contesto,
 * card «Riassunto della conversazione», scelte chiuse in «Avanzate»): il modello che scrive i riassunti e la riserva se non risponde.
 * Di serie NESSUNO dei due: il modello della conversazione e nessuna riserva — mai indovinati (Hermes `agent/auxiliary_client.py:4627-4640`).
 * Stanno nello stesso file del motore del contesto, sul server: valgono anche per le conversazioni senza interfaccia.
 */
test('C1-SERIE-06: the summary model and its backup — none by default, saved one at a time without touching the engine switch, read back after a restart', async (t) => {
  const dir = await cartella(t);
  const file = join(dir, 'impostazioni-contesto.json');
  const prima = createImpostazioniContesto({ file });
  assert.deepEqual(await prima.leggi(), { motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null });
  assert.deepEqual(prima.riassuntoPerUnGiro(), { modelloDelRiassunto: null, riservaDelRiassunto: null }, 'the synchronous answer for a turn');
  assert.deepEqual(await prima.scrivi({ modelloDelRiassunto: 'z-ai/glm-5.3-flash' }), { motore: 'engine', modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: null });
  assert.deepEqual(await prima.scrivi({ riservaDelRiassunto: 'local:qwen3.5-9b' }), { motore: 'engine', modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: 'local:qwen3.5-9b' });
  assert.deepEqual(await prima.scrivi({ motore: 'legacy' }), { motore: 'legacy', modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: 'local:qwen3.5-9b' }, 'the engine switch does not reset the summary choices');
  const dopo = createImpostazioniContesto({ file }); // un processo nuovo
  /* 01/11/2026: la scelta si salva come id, il giro la riceve nella forma che la catena legge (RISERVA-VERA-06) */
  assert.deepEqual(dopo.riassuntoPerUnGiro(), { modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: { provider: 'local', model: 'qwen3.5-9b' } });
  assert.deepEqual(await dopo.scrivi({ modelloDelRiassunto: null }), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: 'local:qwen3.5-9b' }, 'null goes back to «same as the conversation»');
});

test('C1-SERIE-07 (wrong values) — an empty or too long id, a number, an unknown key: refused, nothing changes; a file from before keeps working', async (t) => {
  const dir = await cartella(t);
  const file = join(dir, 'impostazioni-contesto.json');
  const impostazioni = createImpostazioniContesto({ file });
  await impostazioni.scrivi({ modelloDelRiassunto: 'z-ai/glm-5.3-flash' });
  for (const storto of [{ modelloDelRiassunto: '' }, { modelloDelRiassunto: '   ' }, { modelloDelRiassunto: 5 }, { modelloDelRiassunto: 'x'.repeat(257) },
    { riservaDelRiassunto: {} }, { altro: 1 }, {}, { motore: 'engine', altro: 1 }]) {
    await assert.rejects(() => impostazioni.scrivi(storto), { code: 'CTX_SETTINGS_INVALID' }, JSON.stringify(storto).slice(0, 60));
  }
  assert.deepEqual(await impostazioni.leggi(), { motore: 'engine', modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: null });
  // il file di prima di questa scheda (solo il motore) si legge com'è, coi due campi vuoti
  const vecchio = join(dir, 'vecchio.json');
  await writeFile(vecchio, JSON.stringify({ schema: 'talos.context-settings.v1', motore: 'legacy' }));
  assert.deepEqual(await createImpostazioniContesto({ file: vecchio }).leggi(), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: null });
});

test('C1-SERIE-08: POST /api/v1/context-settings takes one choice at a time and answers with all of them; a wrong body is a 400 that changes nothing', async (t) => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const http = await import('node:http');
  const dir = await cartella(t);
  const impostazioniContesto = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json') });
  const server = http.createServer(createHttpApp({ senzaGettone: 'prove', impostazioniContesto }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/context-settings`;
  const manda = (corpo) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const ok = await manda({ modelloDelRiassunto: 'z-ai/glm-5.3-flash' });
  assert.equal(ok.status, 200);
  assert.deepEqual(leScelte((await ok.json()).data), { motore: 'engine', modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: null });
  for (const corpo of [{}, { modelloDelRiassunto: 5 }, { riservaDelRiassunto: '' }, { modelloDelRiassunto: 'a', altro: 1 }]) {
    assert.equal((await manda(corpo)).status, 400, JSON.stringify(corpo));
  }
  assert.deepEqual(leScelte((await (await fetch(base)).json()).data), { motore: 'engine', modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: null }, 'wrong bodies changed nothing');
});

/* R7 (revisione del Blocco 21, 01/11/2026): chi legge e riscrive va messo in fila. La rinomina atomica protegge il file, non l'aggiornamento: il ponte apre la seconda porta */
test('C1-SERIE-20 (R7) — two writes at the same moment on two different choices: both stay, in memory and on disk', async (t) => {
  const file = join(await cartella(t), 'impostazioni-contesto.json');
  const impostazioni = createImpostazioniContesto({ file });
  await impostazioni.leggi();
  await Promise.all([impostazioni.scrivi({ modelloDelRiassunto: 'autore/scelto' }), impostazioni.scrivi({ riservaDelRiassunto: 'autore/riserva' }), impostazioni.scrivi({ motore: 'legacy' })]);
  const atteso = { motore: 'legacy', modelloDelRiassunto: 'autore/scelto', riservaDelRiassunto: 'autore/riserva' };
  assert.deepEqual(await impostazioni.leggi(), atteso);
  const { schema: _schema, ...salvate } = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(salvate, atteso);
});

test('C1-SERIE-21 (R7) — a failed write does not stop the queue and changes nothing', async (t) => {
  const file = join(await cartella(t), 'impostazioni-contesto.json');
  const impostazioni = createImpostazioniContesto({ file });
  await impostazioni.scrivi({ modelloDelRiassunto: 'autore/primo' });
  const copia = await readFile(file, 'utf8');
  await rimuoviFile(file);
  await mkdir(file); // una cartella al posto del file: la rinomina non può riuscire
  await assert.rejects(impostazioni.scrivi({ riservaDelRiassunto: 'autore/mai-salvata' }), (e) => ['EPERM', 'EACCES', 'EISDIR'].includes(e.code));
  await rmdir(file);
  await writeFile(file, copia);
  assert.deepEqual(await impostazioni.scrivi({ motore: 'legacy' }), { motore: 'legacy', modelloDelRiassunto: 'autore/primo', riservaDelRiassunto: null });
});

test('C1-SERIE-22 (R7) — a first read still running does not bring back what a write has just replaced', async (t) => {
  const file = join(await cartella(t), 'impostazioni-contesto.json');
  await writeFile(file, JSON.stringify({ schema: 'talos.context-settings.v1', motore: 'legacy' }));
  const vero = fs.promises.readFile;
  let rilascia = null;
  const spia = mock.method(fs.promises, 'readFile', async (...a) => { const testo = await vero(...a); await new Promise((r) => { rilascia = r; }); return testo; });
  syncBuiltinESMExports();
  try {
    const impostazioni = createImpostazioniContesto({ file });
    const lettura = impostazioni.leggi();
    while (!rilascia) await new Promise((r) => setImmediate(r));
    await impostazioni.scrivi({ modelloDelRiassunto: 'autore/nuovo' });
    rilascia();
    assert.equal((await lettura).modelloDelRiassunto, 'autore/nuovo');
    assert.equal((await impostazioni.leggi()).modelloDelRiassunto, 'autore/nuovo');
    assert.equal(impostazioni.riassuntoPerUnGiro().modelloDelRiassunto, 'autore/nuovo');
  } finally { spia.mock.restore(); syncBuiltinESMExports(); }
});

/* R8, prima metà (revisione del Blocco 21): la rotta accettava ogni stringa, e il giro scarta ciò che non ha la forma (`formaDiModelloRiconosciuta`) mentre la catena diceva «pronto» */
test('C1-SERIE-23 (R8) — the route refuses what a turn would ignore: only provider:model or author/model, and «conversazione» as a backup', async (t) => {
  const impostazioni = createImpostazioniContesto({ file: join(await cartella(t), 'impostazioni-contesto.json') });
  for (const storto of [{ modelloDelRiassunto: 'niente che esista' }, { riservaDelRiassunto: 'modello-nudo' }, { modelloDelRiassunto: 'conversazione' }, { riservaDelRiassunto: ':senza-fornitore' }, { riservaDelRiassunto: 'autore/' }]) {
    await assert.rejects(() => impostazioni.scrivi(storto), { code: 'CTX_SETTINGS_INVALID' }, JSON.stringify(storto));
  }
  for (const giusto of ['z-ai/glm-5.3-flash', 'local:qwen3.5-9b', 'chatgpt:gpt-6-luna', 'openrouter:autore/m']) {
    assert.equal((await impostazioni.scrivi({ modelloDelRiassunto: giusto, riservaDelRiassunto: giusto })).modelloDelRiassunto, giusto);
  }
  assert.equal((await impostazioni.scrivi({ riservaDelRiassunto: 'conversazione' })).riservaDelRiassunto, 'conversazione');
  assert.equal((await impostazioni.scrivi({ riservaDelRiassunto: null })).riservaDelRiassunto, null);
});

test('C1-SERIE-26 (R8, second half) — `locale-ospite:` only where that source exists: refused on a PC, valid on the phone even with no model open', async (t) => {
  const sulPc = createImpostazioniContesto({ file: join(await cartella(t), 'impostazioni-contesto.json') });
  for (const k of ['modelloDelRiassunto', 'riservaDelRiassunto']) {
    await assert.rejects(() => sulPc.scrivi({ [k]: 'locale-ospite:lfm2.5' }), { code: 'CTX_SETTINGS_INVALID' }, k);
    await assert.rejects(() => sulPc.scrivi({ [k]: ' Locale-Ospite:lfm2.5' }), { code: 'CTX_SETTINGS_INVALID' }, 'spaces and case do not get through');
  }
  const sulTelefono = createImpostazioniContesto({ file: join(await cartella(t), 'impostazioni-contesto.json'), fonteOspite: true });
  assert.equal((await sulTelefono.scrivi({ modelloDelRiassunto: 'locale-ospite:lfm2.5' })).modelloDelRiassunto, 'locale-ospite:lfm2.5');
});

test('C1-SERIE-27 (R8, second half) — an old file with `locale-ospite:` on a PC goes back to the default with a warning, on the phone it stays', async (t) => {
  const file = join(await cartella(t), 'impostazioni-contesto.json');
  await writeFile(file, JSON.stringify({ schema: 'talos.context-settings.v1', motore: 'legacy', modelloDelRiassunto: 'locale-ospite:lfm2.5', riservaDelRiassunto: null }));
  const avvisi = [];
  assert.deepEqual(await createImpostazioniContesto({ file, avvisa: (m) => avvisi.push(m) }).leggi(), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: null });
  assert.equal(avvisi.length, 1);
  assert.equal((await createImpostazioniContesto({ file, fonteOspite: true }).leggi()).modelloDelRiassunto, 'locale-ospite:lfm2.5');
});

/* RIP-6 (ripassata del Blocco 21, 01/11/2026): nessuna prova avvia `server.mjs`, e senza questo filo il telefono rifiuterebbe i suoi modelli e al primo avvio azzererebbe la scelta salvata */
test('C1-SERIE-28 (RIP-6) — the server tells the settings whether the phone source exists: every `createImpostazioniContesto` in `server.mjs` passes it', async () => {
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  const chiamate = [...server.matchAll(/createImpostazioniContesto\(\{[\s\S]*?\}\)/gu)].map(([chiamata]) => chiamata);
  assert.equal(chiamate.length, 1, 'one place builds the settings of the server');
  assert.match(chiamate[0], /\bfonteOspite: accessoLocaleOspite\.attivo\b/u);
  assert.match(server, /\baccessoLocaleOspite = creaAccessoLocaleOspite\(\{ cartella: process\.env\.TALOS_LOCALE_OSPITE_DIR \|\| null \}\)/u, 'the same switch the phone sets (`TalosR4Avvio.kt`)');
  assert.deepEqual([creaAccessoLocaleOspite({ cartella: null }).attivo, creaAccessoLocaleOspite({ cartella: 'C:/dati' }).attivo], [false, true], '`.attivo` is the boolean the settings expect');
});

test('C1-SERIE-24 (R8) — a file saved before the rule: the id that no turn can use goes back to the default, with a warning, and the other choices stay', async (t) => {
  const file = join(await cartella(t), 'impostazioni-contesto.json');
  await writeFile(file, JSON.stringify({ schema: 'talos.context-settings.v1', motore: 'legacy', modelloDelRiassunto: 'niente che esista', riservaDelRiassunto: 'conversazione' }));
  const avvisi = [];
  const impostazioni = createImpostazioniContesto({ file, avvisa: (m) => avvisi.push(m) });
  assert.deepEqual(await impostazioni.leggi(), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: 'conversazione' });
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0], /modelloDelRiassunto/u);
  await writeFile(file, JSON.stringify({ schema: 'talos.context-settings.v1', motore: 'legacy', modelloDelRiassunto: 12 }));
  const avvisiRotto = [];
  assert.equal((await createImpostazioniContesto({ file, avvisa: (m) => avvisiRotto.push(m) }).leggi()).motore, 'engine', 'al contrario: un file davvero rotto vale come prima');
  assert.equal(avvisiRotto.length, 1);
});

test('C1-SERIE-25 (R8) — through the route the same rule: the wrong form never reaches the chain', async (t) => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const { creaChiamataInterna } = await import('../src/remoto/chiamata-interna.mjs');
  const impostazioni = createImpostazioniContesto({ file: join(await cartella(t), 'impostazioni-contesto.json') });
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, impostazioniContesto: impostazioni, sessionRegistry: { catenaDelleImpostazioni: () => [] } });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  await assert.rejects(chiama({ metodo: 'POST', percorso: '/api/v1/context-settings', corpo: { riservaDelRiassunto: 'niente che esista' }, origine: 'pc' }), { code: 'QUERY_INVALID' });
  assert.equal((await impostazioni.leggi()).riservaDelRiassunto, null);
});
