/*
 * Decisione 142 dell'owner (04/11/2026): «Salva in Libreria» per i blocchi vivi, con le versioni.
 *   - il primo salvataggio di un blocco crea una voce della Libreria (versione 1) col SORGENTE del blocco;
 *   - un secondo salvataggio dello STESSO blocco (stessa conversazione, stesso `id`) aggiunge una versione alla stessa voce;
 *   - un blocco rotto non si salva come vivo;
 *   - condizione del Mobile sulla 142: il telefono legge l'ultima versione dal suo percorso (`scaricaVoceLibreria`, la stessa
 *     strada di `session.library.fetch`) e la forma della voce nell'elenco non cambia;
 *   - seconda porta: il modello salva un blocco con `artifact_create` / `artifact_update`, nessun attrezzo nuovo.
 * Ricerca: Downloads/TALOS/desktop/in-corso/RICERCA-BLOCCHI-IN-LIBRERIA-2026-11-04.md (Hermes `store/artifacts.ts:14-17, :274-297`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { salvaBloccoInLibreria, sorgenteDelBlocco } from '../src/blocchi/in-libreria.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { CARTELLA_LIBRERIA, elencaVersioni, elencaVoci, leggiVersione, leggiVoce, salvaVoce, trovaVocePerBlocco } from '../src/library-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const FIXTURE = (nome) => readFileSync(new URL(`./fixtures/blocchi/${nome}`, import.meta.url), 'utf8').trimEnd(); // la voce tiene il sorgente senza spazi in coda
const TABELLA = FIXTURE('01-tabella.txt');
const TABELLA_2 = TABELLA.replace('["Marzo"]', '["Marzo", 1500]');
const SCELTE = FIXTURE('03-scelte.txt');
const ROTTO = FIXTURE('26-rotto-sintassi.txt');
const RECINTO = (testo) => `\`\`\`talos-blocco\n${testo}\n\`\`\``;

function cartella(t, prefisso = 'talos-blocchi-lib-') {
  const dati = mkdtempSync(join(tmpdir(), prefisso));
  t.after(() => rimuoviCartellaDiProva(dati));
  return dati;
}
const metaDi = (dati, id) => JSON.parse(readFileSync(join(dati, CARTELLA_LIBRERIA, id, 'meta.json'), 'utf8'));

/* ——— il magazzino ——— */

test('BLOCCHI-LIB-01 — il primo salvataggio crea una voce v1 col sorgente del blocco, di testo, e ricorda il blocco', async (t) => {
  const dati = cartella(t);
  const r = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1', sessionNome: 'Vendite', modello: 'm-1' });
  assert.match(r.id, /^lib-[0-9a-f-]{36}$/u);
  assert.deepEqual({ versione: r.versione, totale: r.totale, nome: r.nome, nuova: r.nuova }, { versione: 1, totale: 1, nome: 'Vendite per mese.txt', nuova: true });
  const voce = await leggiVoce({ cartella: dati, id: r.id });
  assert.equal(voce.testo, TABELLA, 'la voce tiene il SORGENTE, non un disegno');
  assert.equal(voce.mediaType, 'text/plain');
  assert.equal(voce.origine, 'generated');
  assert.deepEqual(metaDi(dati, r.id).blocco, { sessionId: 'sess-1', id: 'vendite' }, 'il legame blocco → voce sta nel meta.json');
  assert.equal(metaDi(dati, r.id).sessionId, 'sess-1');
  assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'vendite' }), r.id);
  assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: 'sess-2', idBlocco: 'vendite' }), null);
});

test('BLOCCHI-LIB-02 — salvare di nuovo lo STESSO blocco aggiunge la v2 alla stessa voce; stesso testo nessuna versione; altra chat o altro id voce nuova', async (t) => {
  const dati = cartella(t);
  const v1 = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  const uguale = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  assert.deepEqual({ id: uguale.id, versione: uguale.versione, nuova: uguale.nuova }, { id: v1.id, versione: 1, nuova: false }, 'stesso testo: niente doppione (Hermes, upsertArtifact)');
  const v2 = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
  assert.deepEqual({ id: v2.id, versione: v2.versione, totale: v2.totale, nuova: v2.nuova }, { id: v1.id, versione: 2, totale: 2, nuova: true });
  assert.equal((await leggiVersione({ cartella: dati, id: v1.id, n: 1 })).testo, TABELLA);
  assert.equal((await leggiVersione({ cartella: dati, id: v1.id, n: 2 })).testo, TABELLA_2);
  assert.equal((await elencaVoci({ cartella: dati })).length, 1, 'una voce sola, con due versioni');
  /* AL CONTRARIO: un'altra conversazione con un blocco dallo stesso id, o un altro blocco della stessa conversazione, non toccano la voce */
  const altraChat = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-2' });
  const altroBlocco = await salvaBloccoInLibreria({ cartella: dati, testo: SCELTE, sessionId: 'sess-1' });
  assert.notEqual(altraChat.id, v1.id);
  assert.notEqual(altroBlocco.id, v1.id);
  assert.equal(altraChat.versione, 1);
  assert.equal((await elencaVersioni({ cartella: dati, id: v1.id })).length, 2);
  assert.equal((await elencaVoci({ cartella: dati })).length, 3);
  /* la voce cancellata dalla persona non resta un legame fantasma: il salvataggio dopo ne crea una nuova */
  const { eliminaVoce } = await import('../src/library-store.mjs');
  await eliminaVoce({ cartella: dati, id: v1.id });
  const dopo = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
  assert.notEqual(dopo.id, v1.id);
  assert.equal(dopo.versione, 1);
});

test('BLOCCHI-LIB-03 — un blocco rotto (o a metà, o vuoto) non si salva come vivo; il recinto ```talos-blocco si toglie', async (t) => {
  const dati = cartella(t);
  for (const testo of [ROTTO, 'root = Tabella("vendite", "Vendite", [', '', '   ', 'just some prose', 42]) {
    await assert.rejects(salvaBloccoInLibreria({ cartella: dati, testo, sessionId: 'sess-1' }), (e) => e.code === 'LIBRARY_INVALID', String(testo).slice(0, 30));
  }
  assert.deepEqual(await elencaVoci({ cartella: dati }), [], 'niente sul disco');
  assert.equal(sorgenteDelBlocco(RECINTO(SCELTE)), SCELTE);
  assert.equal(sorgenteDelBlocco(`\n\n${SCELTE}\n`), SCELTE);
  const r = await salvaBloccoInLibreria({ cartella: dati, testo: RECINTO(SCELTE), sessionId: 'sess-1' });
  assert.equal((await leggiVoce({ cartella: dati, id: r.id })).testo, SCELTE);
  assert.equal(r.nome, 'prossimo.txt', 'senza titolo il nome è l\'id del blocco');
  /* troppo grande: si rifiuta prima di leggerlo */
  await assert.rejects(salvaBloccoInLibreria({ cartella: dati, testo: `root = Avviso("a", null, "info", "${'x'.repeat(400_001)}")`, sessionId: 's' }), (e) => e.code === 'LIBRARY_INVALID');
});

test('BLOCCHI-LIB-04 — due clic insieme sullo stesso blocco: UNA voce, mai due', async (t) => {
  const dati = cartella(t);
  const [a, b] = await Promise.all([
    salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' }),
    salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' }),
  ]);
  assert.equal(a.id, b.id);
  assert.equal((await elencaVoci({ cartella: dati })).length, 1);
  assert.equal((await elencaVersioni({ cartella: dati, id: a.id })).length, 1);
});

test('BLOCCHI-LIB-05 — salvaVoce senza `blocco` scrive il meta.json di ieri, campo per campo', async (t) => {
  const dati = cartella(t);
  const id = await salvaVoce({ cartella: dati, nome: 'a.txt', mediaType: 'text/plain', origine: 'generated', testo: 'x', sessionId: 's' });
  assert.deepEqual(Object.keys(metaDi(dati, id)), ['nome', 'mediaType', 'origine', 'creatoIl', 'aggiornatoIl', 'sessionId']);
  /* un `blocco` malformato non entra */
  const id2 = await salvaVoce({ cartella: dati, nome: 'b.txt', mediaType: 'text/plain', origine: 'generated', testo: 'x', blocco: { sessionId: '', id: 'v' } });
  assert.equal(metaDi(dati, id2).blocco, undefined);
});

/* ——— il registro vero, la rotta, e il percorso del telefono ——— */

async function registroVero(t) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-blocchi-lib-r-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  const dati = join(radice, 'dati');
  await mkdir(progetto, { recursive: true });
  await mkdir(dati, { recursive: true });
  const giri = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => {
      let risolvi;
      const fine = new Promise((ok) => { risolvi = ok; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` });
      return fine;
    },
    modello: 'm', chiave: 'k',
    cartellaDatiProgettoFn: () => dati,
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero', {});
  t.after(() => { giri.forEach((g, k) => { g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k + 1}` }); g.risolvi({ ok: true }); }); });
  return { registro, sessionId, dati };
}

test('BLOCCHI-LIB-06 — Mobile (condizione sulla 142): dopo due salvataggi il percorso del telefono dà l\'ULTIMA versione, e la voce nell\'elenco ha la forma di sempre', async (t) => {
  const { registro, sessionId, dati } = await registroVero(t);
  const v1 = await registro.salvaBloccoInLibreria(sessionId, TABELLA);
  assert.equal(v1.ok, true, JSON.stringify(v1));
  const v2 = await registro.salvaBloccoInLibreria(sessionId, TABELLA_2);
  assert.deepEqual({ id: v2.id, versione: v2.versione }, { id: v1.id, versione: 2 });
  /* il percorso del telefono: `session.library.fetch` → `scaricaVoceLibreria` (src/remoto/operazioni.mjs) */
  const scarico = await registro.scaricaVoceLibreria(sessionId, v1.id);
  assert.equal(scarico.ok, true);
  assert.equal(Buffer.from(scarico.bytes).toString('utf8'), TABELLA_2, 'il telefono legge l\'ultima versione');
  /* la forma della voce: le stesse chiavi di una voce qualunque (un file caricato), niente campo nuovo */
  await salvaVoce({ cartella: dati, nome: 'notes.txt', mediaType: 'text/plain', origine: 'uploaded', testo: 'n' });
  const { voci } = await registro.elencaLibreria(sessionId);
  const delBlocco = voci.find((v) => v.id === v1.id);
  const qualunque = voci.find((v) => v.id !== v1.id);
  assert.deepEqual(Object.keys(delBlocco), Object.keys(qualunque));
  assert.equal(delBlocco.fileType, qualunque.fileType);
  assert.equal(delBlocco.nome, 'Vendite per mese.txt');
  /* AL CONTRARIO: una sessione che non c'è e un blocco rotto */
  assert.equal((await registro.salvaBloccoInLibreria('nessuna', TABELLA)).code, 'NOT_FOUND');
  const rotto = await registro.salvaBloccoInLibreria(sessionId, ROTTO);
  assert.equal(rotto.code, 'LIBRARY_INVALID');
  assert.equal((await registro.elencaLibreria(sessionId)).voci.length, 2);
});

test('BLOCCHI-LIB-07 — la rotta POST /sessions/:id/blocks/library: 200 con la versione, 400 rotto o corpo sbagliato, 401 senza il cookie', async (t) => {
  const { registro, sessionId } = await registroVero(t);
  const GETTONE = 'b'.repeat(64);
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, listaTaskDisponibili: () => [], token: GETTONE });
  const server = createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const indirizzo = `${base}/api/v1/sessions/${encodeURIComponent(sessionId)}/blocks/library`;
  const post = (corpo, conCookie = true) => fetch(indirizzo, { method: 'POST', headers: { 'content-type': 'application/json', ...(conCookie ? { cookie: `talos_token=${GETTONE}` } : {}) }, body: JSON.stringify(corpo) });
  const r1 = await post({ testo: TABELLA });
  const c1 = await r1.json();
  assert.equal(r1.status, 200, JSON.stringify(c1));
  assert.deepEqual({ versione: c1.data.versione, totale: c1.data.totale, nome: c1.data.nome, nuova: c1.data.nuova }, { versione: 1, totale: 1, nome: 'Vendite per mese.txt', nuova: true });
  const c2 = await (await post({ testo: TABELLA_2 })).json();
  assert.deepEqual({ id: c2.data.id, versione: c2.data.versione }, { id: c1.data.id, versione: 2 });
  assert.equal((await post({ testo: ROTTO })).status, 400);
  for (const corpo of [{}, { testo: 3 }, { testo: TABELLA, altro: 1 }]) assert.equal((await post(corpo)).status, 400, JSON.stringify(corpo));
  assert.equal((await post({ testo: TABELLA }, false)).status, 401);
  assert.equal((await fetch(`${base}/api/v1/sessions/nessuna/blocks/library`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `talos_token=${GETTONE}` }, body: JSON.stringify({ testo: TABELLA }) })).status, 404);
});

/* ——— la seconda porta: il modello, con artifact_create / artifact_update ——— */

async function servizio(t, passi, { sessionId = 'sess-1', dati = cartella(t, 'talos-blocchi-lib-s-') } = {}) {
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

test('BLOCCHI-LIB-08 — artifact_create col sorgente di un blocco: voce di blocco v1 (non una pagina HTML); artifact_update aggiunge la v2', async (t) => {
  let id;
  const { dati, eventi, risultati } = await servizio(t, [
    async (i) => { const r = await i.onArtefatto('Vendite', RECINTO(TABELLA)); id = r.voceLibreriaId; return r; },
    async (i) => i.onAggiornaArtefatto(id, { edits: [{ old: '["Marzo"]', new: '["Marzo", 1500]' }] }, {}),
    async (i) => i.onAggiornaArtefatto(id, { html: TABELLA }, {}),
  ]);
  assert.match(id, /^lib-/u);
  assert.equal((await leggiVersione({ cartella: dati, id, n: 1 })).testo, TABELLA, 'la v1 tiene il sorgente, senza il recinto');
  const voce = await leggiVoce({ cartella: dati, id: risultati[0].voceLibreriaId });
  assert.equal(voce.mediaType, 'text/plain');
  assert.equal(voce.nome, 'Vendite.txt', 'il titolo dell\'attrezzo, quello del «created: "Vendite"» del nucleo (revisione J, nota)');
  assert.deepEqual(metaDi(dati, id).blocco, { sessionId: 'sess-1', id: 'vendite' });
  assert.deepEqual({ versione: risultati[1].versione, totale: risultati[1].totale }, { versione: 2, totale: 2 });
  assert.equal((await leggiVersione({ cartella: dati, id, n: 2 })).testo, TABELLA_2);
  assert.equal(risultati[2].versione, 3);
  assert.equal(eventi.length, 0, 'nessuna carta di pagina HTML in chat per un blocco: si disegnerebbe come testo');
  /* la persona che poi salva lo stesso blocco dalla chat trova la voce del modello; il testo della v2 non fa la v4 (revisione J, D5:
     un testo già presente in QUALUNQUE versione resta quella versione, Hermes `artifacts.ts:281-285`), uno mai visto sì */
  const persona = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
  assert.deepEqual({ id: persona.id, versione: persona.versione, nuova: persona.nuova }, { id, versione: 2, nuova: false });
  const nuova = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA.replace('1200', '1250'), sessionId: 'sess-1' });
  assert.deepEqual({ id: nuova.id, versione: nuova.versione }, { id, versione: 4 });
});

test('BLOCCHI-LIB-09 — AL CONTRARIO: un blocco reso rotto da artifact_update non si salva; l\'HTML resta com\'era; sola lettura non salva', async (t) => {
  let id;
  const HTML = '<!doctype html><html><body><h1>Sales</h1></body></html>';
  const { dati, risultati } = await servizio(t, [
    async (i) => { id = (await i.onArtefatto('Vendite', TABELLA)).voceLibreriaId; },
    async (i) => i.onAggiornaArtefatto(id, { edits: [{ old: 'Tabella(', new: 'Tabella((' }] }, {}),
    async (i) => i.onAggiornaArtefatto(id, { html: ROTTO }, {}),
    async (i) => i.onArtefatto('Pagina', HTML),
    async (i) => i.onArtefatto('Rotto', ROTTO),
    async (i) => i.onArtefatto('Sola lettura', SCELTE, { copiaInLibreria: false }),
  ]);
  assert.equal(risultati[1].errore, 'BLOCK_INVALID');
  assert.match(risultati[1].messaggio, /not a valid live block/u);
  assert.match(risultati[1].messaggio, /Nothing was changed\.$/u);
  assert.equal(risultati[2].errore, 'BLOCK_INVALID');
  assert.equal((await elencaVersioni({ cartella: dati, id })).length, 1);
  const pagina = await leggiVoce({ cartella: dati, id: risultati[3].voceLibreriaId });
  assert.equal(pagina.mediaType, 'text/html', 'una pagina HTML resta una pagina HTML');
  assert.equal(pagina.testo, HTML);
  assert.equal(risultati[4].errore, 'BLOCK_INVALID', 'un sorgente di blocco rotto non diventa una pagina né una voce viva');
  assert.equal(risultati[5].errore, 'READ_ONLY', 'sola lettura: un blocco non si vede in chat e non si salva, quindi niente «created» (revisione J, D3)');
  assert.equal(readdirSync(join(dati, CARTELLA_LIBRERIA)).length, 2, 'il blocco + la pagina, niente altro');
});

test('BLOCCHI-LIB-10 — il kernel: l\'errore di un blocco rotto arriva al modello come testo, mai come «updated»', async () => {
  const cartellaK = mkdtempSync(join(tmpdir(), 'talos-blocchi-lib-k-'));
  const richieste = [];
  let n = 0;
  const copione = [[['c', 'artifact_update', { id: 'lib-11111111-2222-4333-8444-555555555555', html: ROTTO }]]];
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
    await talosLavora({ cartella: cartellaK, task: { consegna: 'x' }, modello: 'f', chiave: 'k', giriMassimi: 3, fetchDiRete, strumentiEstesi: ['artifact_create', 'artifact_update'],
      onAggiornaArtefatto: async () => { throw Object.assign(new Error('INVALID. The new version is not a valid live block (syntax). Nothing was changed.'), { code: 'BLOCK_INVALID' }); } });
  } finally { rimuoviCartellaDiProva(cartellaK); }
  const esito = richieste.flatMap((r) => r.messages).find((m) => m.role === 'tool' && m.tool_call_id === 'c')?.content ?? '';
  assert.doesNotMatch(esito, /^updated/u);
  assert.match(esito, /not a valid live block/u);
});

/* ——— i casi di bordo che i mutanti hanno trovato scoperti ——— */

test('BLOCCHI-LIB-11 — bordi: senza conversazione si rifiuta; due voci dello stesso blocco ⇒ vince la più recente, in ogni ordine del disco', async (t) => {
  const dati = cartella(t);
  for (const sessionId of [undefined, '   ', 7]) {
    await assert.rejects(salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId }), (e) => e.code === 'LIBRARY_INVALID', String(sessionId));
    assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId, idBlocco: 'vendite' }), null);
  }
  assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: undefined }), null);
  assert.deepEqual(await elencaVoci({ cartella: dati }), []);
  /* il modello che chiama artifact_create due volte con lo stesso blocco fa due voci legate: la persona salva sulla più recente */
  const legame = { sessionId: 'sess-1', id: 'vendite' };
  const vecchia = await salvaVoce({ cartella: dati, nome: 'a.txt', mediaType: 'text/plain', origine: 'generated', testo: TABELLA, blocco: legame });
  await new Promise((r) => setTimeout(r, 15));
  const recente = await salvaVoce({ cartella: dati, nome: 'b.txt', mediaType: 'text/plain', origine: 'generated', testo: TABELLA, blocco: legame });
  const { readdir } = await import('node:fs/promises');
  for (const ordina of [(a) => a, (a) => [...a].reverse()]) {
    const readdirFn = async (...arg) => ordina((await readdir(...arg)).sort((x, y) => (x.name === vecchia ? -1 : y.name === vecchia ? 1 : 0)));
    assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'vendite' }, { readdirFn }), recente);
  }
  /* con voci legate sul disco, una ricerca senza conversazione o senza blocco dà null, mai un'eccezione */
  for (const [sessionId, idBlocco] of [[undefined, 'vendite'], [7, 'vendite'], ['sess-1', undefined], ['sess-1', 7], ['  ', 'vendite']]) {
    assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId, idBlocco }), null, `${sessionId}/${idBlocco}`);
  }
});

test('BLOCCHI-LIB-12 — artifact_update di un blocco: toglie il recinto, in sola lettura non salva, e una voce di testo che non è HTML né .txt di blocco resta fuori', async (t) => {
  let id;
  const dati = cartella(t, 'talos-blocchi-lib-s-');
  const altra = await salvaVoce({ cartella: dati, nome: 'note.md', mediaType: 'text/markdown', origine: 'generated', testo: TABELLA });
  const { risultati } = await servizio(t, [
    async (i) => { id = (await i.onArtefatto('Vendite', TABELLA)).voceLibreriaId; },
    async (i) => i.onAggiornaArtefatto(id, { html: RECINTO(TABELLA_2) }, {}),
    async (i) => i.onAggiornaArtefatto(id, { html: TABELLA }, { copiaInLibreria: false }),
    async (i) => i.onAggiornaArtefatto(altra, { html: TABELLA_2 }, {}),
  ], { dati });
  assert.equal(risultati[1].versione, 2);
  assert.equal((await leggiVersione({ cartella: dati, id, n: 2 })).testo, TABELLA_2, 'il recinto non entra nella versione');
  assert.equal(risultati[2].errore, 'READ_ONLY', 'sola lettura: niente «shown» per un blocco (revisione J, D3)');
  assert.equal((await elencaVersioni({ cartella: dati, id })).length, 2, 'la sola lettura non aggiunge versioni');
  assert.equal(risultati[3].errore, 'NOT_AN_ARTIFACT', 'un Markdown generato non è un blocco, anche se il testo lo sembra');
  assert.equal((await elencaVersioni({ cartella: dati, id: altra })).length, 1);
});
