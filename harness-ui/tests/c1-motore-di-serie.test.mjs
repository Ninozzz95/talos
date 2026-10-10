/*
 * C1 (owner 09/10/2026 sera): il Context Engine col metodo (livello 1, livello 2 se serve, recupero) diventa il motore DI SERIE
 * del desktop — solo per le conversazioni NUOVE, con un interruttore in Impostazioni → Contesto («Motore del contesto»), acceso
 * di serie; da spento le nuove usano il legacy. Qui l'interruttore (lato server, così vale per ogni porta da cui nasce una
 * conversazione: la chat, le figlie, i Workflow, le automazioni).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImpostazioniContesto } from '../src/impostazioni-contesto.mjs';

async function cartella(t) {
  const dir = await mkdtemp(join(tmpdir(), 'c1-motore-di-serie-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir)); // bc09: la rimozione di prova con l'aiuto (classe A)
  return dir;
}

test('C1-SERIE-01: with no file the engine is ON (the default); the choice is saved and read back after a restart', async (t) => {
  const dir = await cartella(t);
  const file = join(dir, 'impostazioni-contesto.json');
  const prima = createImpostazioniContesto({ file });
  assert.deepEqual(await prima.leggi(), { motore: 'engine' });
  assert.deepEqual(await prima.scrivi({ motore: 'legacy' }), { motore: 'legacy' });
  const dopo = createImpostazioniContesto({ file }); // un processo nuovo
  assert.deepEqual(await dopo.leggi(), { motore: 'legacy' });
  assert.equal(JSON.parse(await readFile(file, 'utf8')).schema, 'talos.context-settings.v1');
  assert.equal(dopo.motorePerUnaConversazioneNuova(), 'legacy', 'the synchronous answer for a new conversation follows the saved choice');
});

test('C1-SERIE-02: a wrong value is refused and changes nothing', async (t) => {
  const dir = await cartella(t);
  const impostazioni = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json') });
  await assert.rejects(() => impostazioni.scrivi({ motore: 'turbo' }), { code: 'CTX_SETTINGS_INVALID' });
  await assert.rejects(() => impostazioni.scrivi({ motore: 'legacy', altro: 1 }), { code: 'CTX_SETTINGS_INVALID' });
  assert.deepEqual(await impostazioni.leggi(), { motore: 'engine' });
});

test('C1-SERIE-03: an unreadable file does not decide for the person: the default, and the problem is said (not hidden)', async (t) => {
  const dir = await cartella(t);
  const file = join(dir, 'impostazioni-contesto.json');
  await writeFile(file, '{ rotto');
  const avvisi = [];
  const impostazioni = createImpostazioniContesto({ file, avvisa: (m) => avvisi.push(m) });
  assert.deepEqual(await impostazioni.leggi(), { motore: 'engine' });
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
  assert.equal((await p('grande/un-milione')).responseReserve, 16_384);
  const locale = (stato) => resolveDesktopDefaultProfile({ provider: 'local', model: 'gemma', finestraFn, readLocalRuntime: async () => stato });
  assert.equal((await locale({ state: 'ready', modelId: 'gemma', windowTokens: 8192 })).windowTokens, 8192);
  await assert.rejects(() => locale({ state: 'ready', modelId: 'altro', windowTokens: 8192 }), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' });
  await assert.rejects(() => locale({ state: 'loading' }), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' });
});

test('C1-SERIE-05: GET and POST /api/v1/context-settings — the switch, a body with only the expected field', async (t) => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const http = await import('node:http');
  const dir = await cartella(t);
  const impostazioniContesto = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json') });
  const server = http.createServer(createHttpApp({ impostazioniContesto }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); // porta di prova dentro il test, chiusa a fine prova (owner 30/09)
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/context-settings`;
  assert.deepEqual((await (await fetch(base)).json()).data, { motore: 'engine' });
  const post = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motore: 'legacy' }) });
  assert.equal(post.status, 200);
  assert.deepEqual((await post.json()).data, { motore: 'legacy' });
  for (const corpo of [{}, { motore: 'turbo' }, { motore: 'engine', altro: 1 }]) {
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }
  assert.deepEqual(await impostazioniContesto.leggi(), { motore: 'legacy' }, 'wrong bodies changed nothing');
  // senza archivio del contesto: 503 dichiarato, non un errore imprevisto
  const spento = http.createServer(createHttpApp({}));
  await new Promise((r) => spento.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => spento.close(r)));
  const r = await fetch(`http://127.0.0.1:${spento.address().port}/api/v1/context-settings`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'CONTEXT_SETTINGS_UNAVAILABLE');
});
