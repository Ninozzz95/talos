/*
 * Revisione J (04/11/2026) di «Salva in Libreria» dei blocchi vivi (decisione 142, commit 4d2c96c7c) e le cure dell'agente L.
 * Le prove della revisione (REV-J-02..09) sono qui con le scelte del Desktop (guida delle piccole scelte, brief delle cure):
 *   - D2: il modello che rifà con `artifact_create` un blocco già in Libreria riceve BLOCK_EXISTS con l'id della voce e «call
 *     artifact_update»; niente seconda voce. Il clic della persona e `artifact_create` stanno nella STESSA fila del blocco;
 *   - D3: in sola lettura un blocco non si «crea» né si «mostra»: READ_ONLY, niente «created» né «shown»;
 *   - D5: come Hermes (`apps/desktop/src/store/artifacts.ts:281-285`): un testo già presente in QUALUNQUE versione non fa una
 *     versione nuova, e la risposta dice quella versione;
 *   - D6: il nome della voce passa da `sanificaNomeLibreria`;
 *   - D7: la rotta di sola lettura che dice in quale versione sta un blocco, per il tasto «In Libreria · vN» dopo una ricarica;
 *   - nota: la voce di un blocco salvato dal modello prende il `titolo` dell'attrezzo (coerente col «created: "<titolo>"» del nucleo).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { impronta } from '../src/blocchi/impronta.mjs';
import { creaVoceDiBlocco, salvaBloccoInLibreria, voceDelBlocco } from '../src/blocchi/in-libreria.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { ATTREZZI_ESTESI_OPENAI, talosLavora } from '../src/kernel/talosHarness.mjs';
import { elencaVersioni, elencaVoci, leggiVoce } from '../src/library-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const FIXTURE = (nome) => readFileSync(new URL(`./fixtures/blocchi/${nome}`, import.meta.url), 'utf8').trimEnd();
const TABELLA = FIXTURE('01-tabella.txt');
const TABELLA_2 = TABELLA.replace('["Marzo"]', '["Marzo", 1500]');
const SCELTE = FIXTURE('03-scelte.txt');
const ROTTO = FIXTURE('26-rotto-sintassi.txt');

function cartella(t) {
  const dati = mkdtempSync(join(tmpdir(), 'talos-rev-j-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  return dati;
}

async function servizio(t, passi, { sessionId = 'sess-1', dati = cartella(t) } = {}) {
  const eventi = [];
  const risultati = [];
  await avviaSessione({
    cartella: dati, task: { id: 't', consegna: 'x' }, modello: 'glm-5.3-flash', chiave: 'k', onEvento: (e) => eventi.push(e),
    cartellaDatiProgettoFn: async () => dati,
    sessionePerLibreria: () => ({ sessionId, sessionNome: 'Vendite' }),
    salvaArtefattoFn: () => {},
    talosLavoraFn: async (input) => {
      for (const passo of passi) {
        try { risultati.push(await passo(input)); } catch (e) { risultati.push({ errore: e.code ?? e.message, messaggio: e.message }); }
      }
      return { ok: true, esito: { comeFinita: 'concluso', detto: 'fatto' } };
    },
  });
  return { dati, eventi: eventi.filter((e) => e.type === 'ArtifactCreated'), risultati };
}

/** Il testo che il nucleo VERO manda al modello come risultato dell'attrezzo `nome`. */
async function rispostaDelNucleo(nome, argomenti, ganci) {
  const cartellaK = mkdtempSync(join(tmpdir(), 'talos-rev-j-k-'));
  const richieste = [];
  let n = 0;
  const copione = [[['c', nome, argomenti]]];
  const fetchDiRete = async (_url, init) => {
    richieste.push(JSON.parse(init.body));
    const passo = copione[n] ?? null;
    n += 1;
    const message = passo
      ? { role: 'assistant', content: null, tool_calls: passo.map(([idc, name, args]) => ({ id: idc, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: passo ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await talosLavora({ cartella: cartellaK, task: { consegna: 'x' }, modello: 'f', chiave: 'k', giriMassimi: 3, fetchDiRete, strumentiEstesi: ['artifact_create', 'artifact_update'], ...ganci });
  } finally { rimuoviCartellaDiProva(cartellaK); }
  return richieste.flatMap((r) => r.messages).find((m) => m.role === 'tool' && m.tool_call_id === 'c')?.content ?? '';
}
const rilancia = (r) => { if (r.errore) throw Object.assign(new Error(r.messaggio), { code: r.errore }); return r; };

test('REV-J-02 (D2) — il modello che rifà con artifact_create lo STESSO blocco già salvato: BLOCK_EXISTS con l\'id, niente seconda voce', async (t) => {
  const dati = cartella(t);
  const persona = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  const { risultati } = await servizio(t, [async (i) => i.onArtefatto('Vendite', TABELLA_2)], { dati });
  const voci = await elencaVoci({ cartella: dati });
  assert.equal(voci.length, 1, `lo stesso blocco ha ora ${voci.length} voci in Libreria (${voci.map((v) => v.id).join(', ')})`);
  assert.equal(risultati[0].errore, 'BLOCK_EXISTS');
  assert.equal(risultati[0].messaggio, `This block is already in the Library as ${persona.id}: call artifact_update with that id. Nothing was created.`);
  assert.equal((await elencaVersioni({ cartella: dati, id: persona.id })).length, 1, 'niente versione di nascosto: la fa artifact_update');
  /* il nucleo vero passa il motivo al modello, mai «created» */
  const esito = await rispostaDelNucleo('artifact_create', { titolo: 'Vendite', html: TABELLA_2 }, { onArtefatto: async () => rilancia(risultati[0]) });
  assert.doesNotMatch(esito, /^created/u, esito);
  assert.match(esito, new RegExp(`${persona.id}: call artifact_update`, 'u'), esito);
  /* AL CONTRARIO: un altro blocco della stessa chat, e lo stesso blocco da un'altra chat, si creano */
  const altri = await servizio(t, [async (i) => i.onArtefatto('Prossimo', SCELTE)], { dati });
  assert.match(altri.risultati[0].voceLibreriaId, /^lib-/u);
  const altraChat = await servizio(t, [async (i) => i.onArtefatto('Vendite', TABELLA)], { dati, sessionId: 'sess-2' });
  assert.match(altraChat.risultati[0].voceLibreriaId, /^lib-/u);
  assert.equal((await elencaVoci({ cartella: dati })).length, 3);
});

test('REV-J-02b (D2, la corsa della nota) — il clic della persona e artifact_create dello stesso blocco nello stesso istante: UNA voce, in tutti e due gli ordini', async (t) => {
  for (const primoIlModello of [false, true]) {
    const dati = cartella(t);
    const passi = [async (i) => {
      const modello = () => i.onArtefatto('Vendite', TABELLA);
      const persona = () => salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
      return Promise.allSettled(primoIlModello ? [modello(), persona()] : [persona(), modello()]);
    }];
    const { risultati } = await servizio(t, passi, { dati });
    const voci = await elencaVoci({ cartella: dati });
    assert.equal(voci.length, 1, `primo il modello: ${primoIlModello}; voci: ${voci.length}`);
    const esiti = risultati[0];
    assert.ok(esiti.every((e) => e.status === 'fulfilled' || e.reason?.code === 'BLOCK_EXISTS'), JSON.stringify(esiti.map((e) => e.reason?.message)));
  }
});

test('REV-J-03 (D3) — sola lettura: artifact_create e artifact_update di un blocco danno READ_ONLY, al modello niente «created» né «shown»', async (t) => {
  let id;
  const { risultati, eventi, dati } = await servizio(t, [
    async (i) => i.onArtefatto('Vendite', TABELLA, { copiaInLibreria: false }),
    async (i) => { id = (await i.onArtefatto('Prossimo', SCELTE)).voceLibreriaId; },
    async (i) => i.onAggiornaArtefatto(id, { html: SCELTE.replace('Continua', 'Vai') }, { copiaInLibreria: false }),
  ]);
  assert.equal(eventi.length, 0, 'premessa: niente carta in chat');
  assert.equal(risultati[0].errore, 'READ_ONLY');
  assert.equal(risultati[0].messaggio, 'Not saved: this conversation is read-only, and a live block is kept only in the Library. Nothing was created.');
  assert.equal(risultati[2].errore, 'READ_ONLY');
  assert.equal(risultati[2].messaggio, 'Not saved: this conversation is read-only, and a live block is kept only in the Library. Nothing was changed.');
  assert.equal((await elencaVoci({ cartella: dati })).length, 1, 'solo il blocco salvato fuori dalla sola lettura');
  assert.equal((await elencaVersioni({ cartella: dati, id })).length, 1);
  const crea = await rispostaDelNucleo('artifact_create', { titolo: 'Vendite', html: TABELLA }, { onArtefatto: async () => rilancia(risultati[0]) });
  assert.doesNotMatch(crea, /^created/u, `al modello arriva: ${crea}`);
  assert.match(crea, /read-only/u, crea);
  const aggiorna = await rispostaDelNucleo('artifact_update', { id, html: SCELTE }, { onAggiornaArtefatto: async () => rilancia(risultati[2]) });
  assert.doesNotMatch(aggiorna, /^(shown|updated)/u, `al modello arriva: ${aggiorna}`);
  assert.match(aggiorna, /read-only/u, aggiorna);
});

test('REV-J-03b (D3, al contrario) — in sola lettura una pagina HTML resta come prima: si mostra, non si salva', async (t) => {
  const HTML = '<!doctype html><html><body><h1>Sales</h1></body></html>';
  const { risultati, eventi, dati } = await servizio(t, [async (i) => i.onArtefatto('Pagina', HTML, { copiaInLibreria: false })]);
  assert.equal(risultati[0].salvata, false);
  assert.equal(eventi.length, 1, 'la carta in chat c\'è');
  assert.deepEqual(await elencaVoci({ cartella: dati }), []);
});

test('REV-J-04 (sospetto smentito) — dopo un riavvio (modulo nuovo, lucchetti vuoti) il legame regge: v2 nella stessa voce, nome .txt', async (t) => {
  const dati = cartella(t);
  const v1 = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  const dopoIlRiavvio = await import(`../src/blocchi/in-libreria.mjs?riavvio=${Date.now()}`);
  const v2 = await dopoIlRiavvio.salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
  assert.deepEqual({ id: v2.id, versione: v2.versione }, { id: v1.id, versione: 2 });
  const voce = await leggiVoce({ cartella: dati, id: v1.id });
  assert.equal(voce.testo, TABELLA_2);
  assert.ok(voce.nome.endsWith('.txt'), 'il lettore del PC lo riconosce solo come .txt');
});

test('REV-J-05 (sospetto smentito) — artifact_create con un blocco rotto: il nucleo passa al modello il motivo, niente «created»', async (t) => {
  const { risultati } = await servizio(t, [async (i) => i.onArtefatto('Vendite', ROTTO)]);
  assert.equal(risultati[0].errore, 'BLOCK_INVALID');
  const esito = await rispostaDelNucleo('artifact_create', { titolo: 'Vendite', html: ROTTO }, { onArtefatto: async () => rilancia(risultati[0]) });
  assert.doesNotMatch(esito, /^created/u);
  assert.match(esito, /not a valid live block/u, esito);
});

test('REV-J-06 (D5) — un blocco VECCHIO salvato dopo uno più nuovo: nessuna versione-copia, la risposta dice la versione che lo tiene', async (t) => {
  const dati = cartella(t);
  const a = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
  const ancora = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  assert.equal(ancora.nuova, false, `la v${ancora.versione} è una copia della v1`);
  assert.deepEqual({ id: ancora.id, versione: ancora.versione, totale: ancora.totale }, { id: a.id, versione: 1, totale: 2 }, '«resta la versione 1»');
  assert.equal((await elencaVersioni({ cartella: dati, id: a.id })).length, 2);
  /* l'ultima resta l'ultima: il telefono e «Apri» leggono ancora la v2 */
  assert.equal((await leggiVoce({ cartella: dati, id: a.id })).testo, TABELLA_2);
  /* AL CONTRARIO: un testo mai visto fa ancora la versione dopo */
  const nuovo = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA.replace('980.5', '981'), sessionId: 'sess-1' });
  assert.deepEqual({ versione: nuovo.versione, totale: nuovo.totale, nuova: nuovo.nuova }, { versione: 3, totale: 3, nuova: true });
});

test('REV-J-07 (D6) — il nome della voce passa dalla stessa pulizia di una rinomina (punti iniziali, NFKC, vuoto ⇒ «block»)', async (t) => {
  const dati = cartella(t);
  const testo = TABELLA.replace('"Vendite per mese"', '"..Vendite"');
  assert.notEqual(testo, TABELLA, 'premessa: il titolo della fixture è cambiato');
  const r = await salvaBloccoInLibreria({ cartella: dati, testo, sessionId: 'sess-1' });
  assert.equal(r.nome, 'Vendite.txt', `nome salvato: ${r.nome}`);
  const soloPunti = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA.replace('"Vendite per mese"', '"..."').replace('"vendite"', '"altro"'), sessionId: 'sess-1' });
  assert.equal(soloPunti.nome, 'block.txt', `nome salvato: ${soloPunti.nome}`);
  const larghe = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA.replace('"Vendite per mese"', '"Ｖendite"').replace('"vendite"', '"terzo"'), sessionId: 'sess-1' });
  assert.equal(larghe.nome, 'Vendite.txt', 'NFKC come la rinomina');
});

test('REV-J-08 (M1, M6) — la rotta rifiuta un\'altra finestra (403, niente scritto) e un GET risponde 405 con Allow: POST', async (t) => {
  const { registro, sessionId, dati } = await registroVero(t);
  const GETTONE = 'b'.repeat(64);
  const base = await ascolta(t, registro, GETTONE);
  const indirizzo = `${base}/api/v1/sessions/${encodeURIComponent(sessionId)}/blocks/library`;
  const r = await fetch(indirizzo, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `talos_token=${GETTONE}`, origin: 'http://evil.example' }, body: JSON.stringify({ testo: TABELLA }) });
  assert.equal(r.status, 403, await r.text());
  assert.equal((await elencaVoci({ cartella: dati })).length, 0, 'niente scritto');
  const g = await fetch(indirizzo, { headers: { cookie: `talos_token=${GETTONE}` } });
  assert.equal(g.status, 405);
  assert.match(g.headers.get('allow') ?? '', /POST/u);
});

test('REV-J-09 (M4) — artifact_update di un blocco con un titolo nuovo rinomina la voce, e resta un .txt che il PC riapre vivo', async (t) => {
  let id;
  const { dati, risultati } = await servizio(t, [
    async (i) => { id = (await i.onArtefatto('Vendite', TABELLA)).voceLibreriaId; },
    async (i) => i.onAggiornaArtefatto(id, { html: TABELLA_2 }, { titolo: 'Vendite: marzo' }),
  ]);
  assert.equal(risultati[1].versione, 2);
  assert.equal((await leggiVoce({ cartella: dati, id })).nome, 'Vendite- marzo.txt');
});

test('REV-J-10 (nota) — la voce di un blocco salvato dal modello prende il titolo dell\'attrezzo, quello che il nucleo gli ripete', async (t) => {
  let id;
  const { dati } = await servizio(t, [
    async (i) => { id = (await i.onArtefatto('..Vendite: Q1', TABELLA)).voceLibreriaId; },
  ]);
  assert.equal((await leggiVoce({ cartella: dati, id })).nome, 'Vendite- Q1.txt');
  /* senza titolo (un chiamante che non lo passa) resta il titolo del blocco */
  let id2;
  const altro = await servizio(t, [async (i) => { id2 = (await i.onArtefatto('', SCELTE)).voceLibreriaId; }]);
  assert.equal((await leggiVoce({ cartella: altro.dati, id: id2 })).nome, 'prossimo.txt');
});

/* ——— D7: la rotta di sola lettura per il tasto «In Libreria · vN» dopo una ricarica ——— */

async function registroVero(t) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-rev-j-r-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  const dati = join(radice, 'dati');
  await mkdir(progetto, { recursive: true });
  await mkdir(dati, { recursive: true });
  const giri = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => { let risolvi; const fine = new Promise((ok) => { risolvi = ok; }); giri.push({ input, risolvi }); input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` }); return fine; },
    modello: 'm', chiave: 'k',
    cartellaDatiProgettoFn: () => dati,
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero', {});
  t.after(() => { giri.forEach((g, k) => { g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k + 1}` }); g.risolvi({ ok: true }); }); });
  return { registro, sessionId, dati };
}

async function ascolta(t, registro, gettone) {
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, listaTaskDisponibili: () => [], token: gettone }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('REV-J-11 (D7) — voceDelBlocco: la voce di (conversazione, id) con l\'impronta di ogni versione; nessuna voce ⇒ null', async (t) => {
  const dati = cartella(t);
  assert.equal(await voceDelBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'vendite' }), null);
  const v1 = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
  assert.deepEqual(await voceDelBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'vendite' }), {
    id: v1.id, nome: 'Vendite per mese.txt', totale: 2, versioni: [{ n: 1, impronta: impronta(TABELLA) }, { n: 2, impronta: impronta(TABELLA_2) }],
  });
  assert.equal(await voceDelBlocco({ cartella: dati, sessionId: 'sess-2', idBlocco: 'vendite' }), null, 'un\'altra chat');
  assert.equal(await voceDelBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'prossimo' }), null, 'un altro blocco');
});

test('REV-J-11b (D7, al contrario) — una versione vecchia senza file o illeggibile si salta: le altre restano, il totale non mente', async (t) => {
  const dati = cartella(t);
  const v1 = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
  const vecchia = /[\\/]versioni[\\/]1$/u;
  for (const code of ['ENOENT', 'EACCES']) {
    const readFileFn = async (percorso, ...resto) => {
      if (vecchia.test(String(percorso))) throw Object.assign(new Error(`finto ${code}`), { code });
      return (await import('node:fs/promises')).readFile(percorso, ...resto);
    };
    assert.deepEqual(await voceDelBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'vendite' }, { readFileFn }), {
      id: v1.id, nome: 'Vendite per mese.txt', totale: 2, versioni: [{ n: 2, impronta: impronta(TABELLA_2) }],
    }, code);
  }
});

test('REV-J-12 (D7) — GET /sessions/:id/blocks/:idBlocco/library: sola lettura, 200 con le versioni o voce null, 404 sessione ignota, 401 senza cookie', async (t) => {
  const { registro, sessionId, dati } = await registroVero(t);
  const GETTONE = 'c'.repeat(64);
  const base = await ascolta(t, registro, GETTONE);
  const indirizzo = (idBlocco, sid = sessionId) => `${base}/api/v1/sessions/${encodeURIComponent(sid)}/blocks/${encodeURIComponent(idBlocco)}/library`;
  const leggi = (url, intestazioni = { cookie: `talos_token=${GETTONE}` }) => fetch(url, { headers: intestazioni });
  const vuota = await leggi(indirizzo('vendite'));
  assert.equal(vuota.status, 200);
  assert.deepEqual((await vuota.json()).data, { voce: null });
  const v1 = await registro.salvaBloccoInLibreria(sessionId, TABELLA);
  const piena = await (await leggi(indirizzo('vendite'))).json();
  assert.deepEqual(piena.data, { voce: { id: v1.id, nome: 'Vendite per mese.txt', totale: 1, versioni: [{ n: 1, impronta: impronta(TABELLA) }] } });
  assert.equal((await elencaVoci({ cartella: dati })).length, 1, 'leggere non scrive');
  assert.equal((await leggi(indirizzo('vendite', 'nessuna'))).status, 404);
  assert.equal((await leggi(indirizzo('vendite'), {})).status, 401);
  assert.equal((await leggi(`${indirizzo('vendite')}?x=1`)).status, 400, 'nessuna domanda nell\'indirizzo');
  const post = await fetch(indirizzo('vendite'), { method: 'POST', headers: { cookie: `talos_token=${GETTONE}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 405);
  assert.match(post.headers.get('allow') ?? '', /GET/u);
});

test('REV-J-13 (D2, al contrario) — senza conversazione non c\'è legame: artifact_create salva come prima, senza BLOCK_EXISTS', async (t) => {
  const { dati, risultati } = await servizio(t, [
    async (i) => i.onArtefatto('Vendite', TABELLA),
    async (i) => i.onArtefatto('Vendite', TABELLA),
  ], { sessionId: null });
  assert.match(risultati[0].voceLibreriaId, /^lib-/u, JSON.stringify(risultati[0]));
  assert.match(risultati[1].voceLibreriaId, /^lib-/u, JSON.stringify(risultati[1]));
  const meta = JSON.parse(readFileSync(join(dati, '.harness-ui-library', risultati[0].voceLibreriaId, 'meta.json'), 'utf8'));
  assert.equal(meta.blocco, undefined, 'nessun legame senza conversazione');
  assert.equal((await leggiVoce({ cartella: dati, id: risultati[0].voceLibreriaId })).testo, TABELLA);
});

/*
 * D1 (forma `FORMA-D1-BLOCCHI-IN-LIBRERIA-2026-11-04.md`, OK di CLI, Mobile e Performance): la seconda porta si fa trovare dal
 * modello dove la usa, nella descrizione dell'attrezzo (come la guida dei consegnabili di Hermes, `agent/prompt_builder.py:320-321`).
 * Lunghezze del 04/11 prima della cura: artifact_create 340, artifact_update 295 caratteri.
 */
test('REV-J-01 (D1) — artifact_create dice come salvare un blocco vivo in Libreria, artifact_update lo nomina; frase costante e corta', async () => {
  const descrizione = (nome) => ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === nome)?.function.description ?? '';
  const crea = descrizione('artifact_create');
  const aggiorna = descrizione('artifact_update');
  assert.match(crea, /Library/u, 'artifact_create nomina la Libreria');
  assert.match(crea, /live block/u, 'artifact_create nomina il blocco vivo');
  assert.match(crea, /root = /u, 'artifact_create dice che cosa passare: il sorgente del blocco');
  assert.match(aggiorna, /live block saved in the Library/u, 'artifact_update dice che cambia anche un blocco salvato');
  assert.ok(crea.length - 340 + (aggiorna.length - 295) <= 160, `al più 160 caratteri in più in tutto (${crea.length - 340 + aggiorna.length - 295})`);
  assert.ok(crea.startsWith('Writes a complete, self-contained HTML document'), 'la frase di oggi resta in testa');
  /* cache dei prompt: lo schema è una costante, byte per byte uguale fra due letture del modulo (nessun testo dinamico) */
  const una = JSON.stringify(ATTREZZI_ESTESI_OPENAI);
  const altra = JSON.stringify((await import(`../src/kernel/talosHarness.mjs?seconda=${Date.now()}`)).ATTREZZI_ESTESI_OPENAI);
  assert.equal(una, altra, 'lo schema degli attrezzi è identico fra due letture');
});

/*
 * Condizione del Mobile sull'OK alla D1 (Desktop, 04/11 12:30): sul telefono la voce salvata da un blocco si legge, almeno come testo
 * col sorgente, mai vuota né errore. Una sessione remota gira sul PC e il telefono legge la Libreria con le stesse rotte HTTP: qui
 * le due porte (il pulsante della persona e `creaVoceDiBlocco`, quella che `artifact_create` chiama) e quello che il telefono riceve.
 */
test('REV-J-14 (D1, condizione del Mobile) — la voce di un blocco, da tutte e due le porte, arriva per HTTP come testo col sorgente: mai vuota né errore', async (t) => {
  const { registro, sessionId, dati } = await registroVero(t);
  const GETTONE = 'd'.repeat(64);
  const base = await ascolta(t, registro, GETTONE);
  const intestazioni = { cookie: `talos_token=${GETTONE}` };
  const dallaPersona = await registro.salvaBloccoInLibreria(sessionId, TABELLA);
  const dalModello = await creaVoceDiBlocco({ cartella: dati, testo: SCELTE, titolo: 'Scelta del menu', sessionId });
  const elenco = await fetch(`${base}/api/v1/sessions/${encodeURIComponent(sessionId)}/library`, { headers: intestazioni });
  assert.equal(elenco.status, 200);
  const dati2 = (await elenco.json()).data;
  const voci = Array.isArray(dati2) ? dati2 : (dati2?.voci ?? dati2?.items ?? []);
  for (const [id, sorgente] of [[dallaPersona.id, TABELLA], [dalModello.id, SCELTE]]) {
    /* Il lettore (`frontend/src/components/lettore/fonti.js`) sceglie COME aprire una voce dal suo tipo e dal nome nell'elenco, e ne
       legge i byte da `/file` (che esce sempre `application/octet-stream` di proposito: è lo scarico, http-app.mjs). */
    const scheda = voci.find((v) => v?.id === id);
    assert.ok(scheda, `${id} nell'elenco della Libreria`);
    assert.equal(scheda.fileType, 'document', `${id}: nell'elenco è un documento, non un'immagine`);
    assert.match(scheda.nome, /\.txt$/u, `${id}: il nome finisce in .txt, il lettore lo apre come testo`);
    assert.equal((await leggiVoce({ cartella: dati, id })).mediaType, 'text/plain', `${id}: il tipo salvato è testo`);
    const file = await fetch(`${base}/api/v1/sessions/${encodeURIComponent(sessionId)}/library/${encodeURIComponent(id)}/file`, { headers: intestazioni });
    assert.equal(file.status, 200, `${id}: il file si apre`);
    const corpo = await file.text();
    assert.ok(corpo.trim().length > 0, `${id}: mai vuota`);
    assert.equal(corpo, sorgente, `${id}: il testo è il sorgente del blocco`);
  }
});
