/*
 * Owner 27/10/2026 («Di serie nelle Impostazioni + per conversazione») — DOVE GIRANO I COMANDI delle conversazioni NUOVE.
 * La scelta di serie sta sul server (`impostazioni-comandi.mjs`, `GET/POST /api/v1/command-settings`), si legge alla NASCITA e si
 * timbra sulla conversazione come la scelta del foglio dei permessi (D-10F). Figlie e rami ereditano dalla conversazione da cui
 * nascono; una ripresa non è una nascita; un valore che non è uno dei tre vale «Automatico».
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createImpostazioniComandi } from '../src/impostazioni-comandi.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SYS = { role: 'system', content: 's' };
const u = (t) => ({ role: 'user', content: t });
const a = (t) => ({ role: 'assistant', content: t });
const passo = () => new Promise((r) => setImmediate(r));
const intestazione = (cartella, id) => JSON.parse(readFileSync(join(cartella, `${id}.jsonl`), 'utf8').split('\n')[0]);

function registroAGiri(opzioni = {}) {
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      const n = giri.length + 1;
      giri.push({ concludi: (messaggiFinali) => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${n}` }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${n}`, input: input.task });
      return attesa;
    },
    ...opzioni,
  });
  return { registro, giri };
}

test('DOVE-SERIE-01: the store starts automatic, keeps a choice across a restart, refuses anything but the three values', async (t) => {
  const cartella = cartellaDiProva('talos-dove-serie-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const file = join(cartella, '.impostazioni-comandi.json');
  const store = createImpostazioniComandi({ file, avvisa: () => {} });
  assert.deepEqual(await store.leggi(), { doveDiSerie: null });
  assert.equal(store.dovePerUnaConversazioneNuova(), null);
  assert.deepEqual(await store.scrivi({ doveDiSerie: 'wsl2' }), { doveDiSerie: 'wsl2' });
  assert.equal(store.dovePerUnaConversazioneNuova(), 'wsl2');
  assert.equal(createImpostazioniComandi({ file }).dovePerUnaConversazioneNuova(), 'wsl2', 'a new process reads the file synchronously');
  for (const sbagliato of [{ doveDiSerie: 'bash' }, { doveDiSerie: 'wsl2', altro: 1 }, {}, null, ['wsl2'], { doveDiSerie: undefined }]) {
    await assert.rejects(store.scrivi(sbagliato), { code: 'COMMAND_SETTINGS_INVALID' }, JSON.stringify(sbagliato));
  }
  assert.equal(store.dovePerUnaConversazioneNuova(), 'wsl2', 'a refused write changed nothing');
  await store.scrivi({ doveDiSerie: null });
  assert.equal(createImpostazioniComandi({ file }).dovePerUnaConversazioneNuova(), null, 'back to automatic is a real value, saved');
});

test('DOVE-SERIE-02: an unreadable or hand-edited file means automatic, and it says so', async (t) => {
  const cartella = cartellaDiProva('talos-dove-serie-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  mkdirSync(cartella, { recursive: true });
  for (const testo of ['{', '{"doveDiSerie":"cmd"}', '{"doveDiSerie":"wsl2","x":1}', '"wsl2"']) {
    const file = join(cartella, `prova-${Math.abs(testo.length)}-${testo.charCodeAt(1) || 0}.json`);
    writeFileSync(file, testo);
    const avvisi = [];
    const store = createImpostazioniComandi({ file, avvisa: (m) => avvisi.push(m) });
    assert.equal(store.dovePerUnaConversazioneNuova(), null, testo);
    assert.equal(avvisi.length, 1, `one warning for ${testo}`);
  }
});

test('DOVE-SERIE-03: a new conversation is stamped with the default of the moment; changing it later does not move it; the stamp survives a restart', async (t) => {
  const cartellaStore = cartellaDiProva('talos-dove-serie-');
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); rimuoviCartellaDiProva(cartellaStore); });
  let dove = 'wsl2';
  const { registro, giri } = registroAGiri({ cartellaStore, doveComandiPerNuoveFn: () => dove });
  const { sessionId: prima } = registro.avvia('task-vero');
  dove = 'windows';
  const { sessionId: seconda } = registro.avvia('task-vero');
  assert.equal(registro.impostazioniComandi(prima).dove, 'wsl2');
  assert.equal(registro.impostazioniComandi(seconda).dove, 'windows');
  giri[0].concludi([SYS, u('c'), a('r1')]); giri[1].concludi([SYS, u('c'), a('r1')]); await passo();
  await attendiScritture({ cartellaStore, sessionId: prima });
  assert.equal(intestazione(cartellaStore, prima).doveGiranoIComandi, 'wsl2', 'on the journal header');
  const riavvio = registroAGiri({ cartellaStore, doveComandiPerNuoveFn: () => null }).registro;
  await riavvio.ripristina();
  assert.equal(riavvio.impostazioniComandi(prima).dove, 'wsl2', 'today\'s default does not rewrite a conversation born yesterday');
  assert.equal(riavvio.impostazioniComandi(seconda).dove, 'windows');
});

test('DOVE-SERIE-04: a resume is not a birth, and the choice made in the sheet wins over the default', async () => {
  let dove = 'wsl2';
  const { registro, giri } = registroAGiri({ doveComandiPerNuoveFn: () => dove });
  const { sessionId } = registro.avvia('task-vero');
  giri[0].concludi([SYS, u('c'), a('r1')]); await passo();
  await registro.doveGiranoIComandi(sessionId, null); // la persona sceglie «Automatico» nel foglio
  dove = 'windows';
  registro.resume(sessionId, 'seconda domanda');
  assert.equal(registro.impostazioniComandi(sessionId).dove, null);
  giri[1].concludi([SYS, u('c'), a('r1'), u('seconda domanda'), a('r2')]); await passo();
});

test('DOVE-SERIE-05: a branch inherits the conversation it comes from, never the default', async () => {
  let dove = 'wsl2';
  const { registro, giri } = registroAGiri({ doveComandiPerNuoveFn: () => dove });
  const { sessionId } = registro.avvia('task-vero');
  giri[0].concludi([SYS, u('c'), a('r1')]); await passo();
  await registro.doveGiranoIComandi(sessionId, 'windows');
  dove = 'wsl2';
  const ramo = registro.forka(sessionId);
  assert.ok(ramo?.sessionId, JSON.stringify(ramo));
  assert.equal(registro.impostazioniComandi(ramo.sessionId).dove, 'windows');
  // e un ramo di una conversazione in automatico resta in automatico, anche se il default dice altro
  await registro.doveGiranoIComandi(sessionId, null);
  const ramo2 = registro.forka(sessionId);
  assert.equal(registro.impostazioniComandi(ramo2.sessionId).dove, null);
});

test('DOVE-SERIE-06: without the function (old wiring), or with one that throws or answers nonsense, a new conversation is automatic', () => {
  for (const fn of [undefined, () => { throw new Error('rotto'); }, () => 'bash', () => 'WSL2', () => ({})]) {
    const { registro, giri } = registroAGiri(fn ? { doveComandiPerNuoveFn: fn } : {});
    const { sessionId } = registro.avvia('task-vero');
    assert.equal(registro.impostazioniComandi(sessionId).dove, null, String(fn));
    giri[0].concludi([SYS, u('c'), a('r1')]);
  }
});

test('DOVE-SERIE-07: GET and POST /api/v1/command-settings — only the expected field, the three values, nothing else changes', async (t) => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const http = await import('node:http');
  const cartella = cartellaDiProva('talos-dove-serie-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const store = createImpostazioniComandi({ file: join(cartella, '.impostazioni-comandi.json'), avvisa: () => {} });
  const server = http.createServer(createHttpApp({ impostazioniComandi: store }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/command-settings`;
  const posta = (corpo) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  assert.deepEqual((await (await fetch(base)).json()).data, { doveDiSerie: null });
  const post = await posta({ doveDiSerie: 'windows' });
  assert.equal(post.status, 200);
  assert.deepEqual((await post.json()).data, { doveDiSerie: 'windows' });
  for (const corpo of [{}, { doveDiSerie: 'bash' }, { doveDiSerie: 'wsl2', altro: 1 }, { dove: 'wsl2' }]) {
    assert.equal((await posta(corpo)).status, 400, JSON.stringify(corpo));
  }
  assert.equal(store.dovePerUnaConversazioneNuova(), 'windows', 'refused bodies changed nothing');
  assert.equal((await fetch(`${base}?x=1`)).status, 400, 'no query string');
  const senza = http.createServer(createHttpApp({}));
  await new Promise((r) => senza.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => senza.close(r)));
  const risposta = await fetch(`http://127.0.0.1:${senza.address().port}/api/v1/command-settings`);
  assert.equal((await risposta.json()).error?.code, 'COMMAND_SETTINGS_UNAVAILABLE');
});
