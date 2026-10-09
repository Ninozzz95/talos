/*
 * ⭐ Owner, 08/10/2026 notte: «elenco vero, e si scrivono» — Note, Attività e Memoria sono della PERSONA (gli archivi sono già
 *   globali), quindi si leggono e si scrivono anche SENZA una sessione aperta. Prima, senza sessione, le tre pagine dicevano
 *   «nessuna nota» / zero attività / zero ricordi anche con elementi salvati (misurato sulla 4176: una nota e un'attività
 *   salvate, pagine a zero). Le porte con la sessione restano (CLI, mobile) e verificano ancora che la sessione esista.
 * Forma: `/api/v1/me/<risorsa>[/<id>]`, la forma «personale» delle API Google (`users/me`; AIP-122: nel nome il genitore è il
 *   proprietario). Le prove usano i magazzini VERI in una cartella temporanea e il registro VERO, come
 *   http-routes-note-attivita-memoria.test.mjs: una scrittura della persona e una lettura degli elenchi devono toccare lo
 *   stesso file.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { elencaNote } from '../src/notes-store.mjs';
import { NoteStoreError } from '../src/notes-store.mjs';

async function server(t) {
  const radice = cartellaDiProva('talos-me-'); // la toglie l'aiutante a fine prova (classe dichiarata, BC09)
  const cartelle = { cartellaNote: join(radice, 'note'), cartellaAttivita: join(radice, 'attivita'), cartellaMemoria: join(radice, 'memoria') };
  const registro = createSessionRegistry({ modello: 'm', chiave: 'k', ...cartelle });
  const app = createHttpApp({ staticHandler: async () => null, listaTaskDisponibili: () => [], elencaCartelleProgetto: () => [], sessionRegistry: registro, ...cartelle });
  const s = createServer(app);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => s.close(r)));
  return { base: `http://127.0.0.1:${s.address().port}`, ...cartelle };
}
const chiama = (base, percorso, metodo = 'GET', corpo) => fetch(`${base}${percorso}`, {
  method: metodo, headers: { 'Content-Type': 'application/json' }, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
});

test('ME-01 — NOTE senza sessione: crea (201 + Location /me), elenco, leggi, modifica, elimina; il file è nell\'archivio globale', async (t) => {
  const { base, cartellaNote } = await server(t);
  const creata = await chiama(base, '/api/v1/me/notes', 'POST', { titolo: 'Senza sessione', contenuto: 'la persona scrive' });
  assert.equal(creata.status, 201);
  const nota = (await creata.json()).data.nota;
  assert.equal(creata.headers.get('location'), `/api/v1/me/notes/${nota.id}`);
  assert.equal(nota.origine, 'persona');
  assert.deepEqual((await elencaNote({ cartella: cartellaNote })).map((n) => n.id), [nota.id], 'sta nell\'archivio globale, lo stesso degli attrezzi del modello');
  const elenco = (await (await chiama(base, '/api/v1/me/notes')).json()).data;
  assert.deepEqual(elenco.note.map((n) => n.id), [nota.id]);
  assert.equal(elenco.errore, null);
  assert.equal((await chiama(base, `/api/v1/me/notes/${nota.id}`)).status, 200);
  const dopo = (await (await chiama(base, `/api/v1/me/notes/${nota.id}`, 'PATCH', { contenuto: 'cambiata' })).json()).data.nota;
  assert.equal(dopo.contenuto, 'cambiata');
  assert.equal((await chiama(base, `/api/v1/me/notes/${nota.id}`, 'DELETE')).status, 200);
  assert.deepEqual((await (await chiama(base, '/api/v1/me/notes')).json()).data.note, []);
  assert.equal((await chiama(base, `/api/v1/me/notes/${nota.id}`)).status, 404, 'una voce sparita è 404 col suo codice');
});

test('ME-02 — ATTIVITÀ e MEMORIA senza sessione: crea, elenca, e lo stato di un\'attività cambia dalla sua porta', async (t) => {
  const { base } = await server(t);
  const attivita = (await (await chiama(base, '/api/v1/me/tasks', 'POST', { titolo: 'Da fare senza sessione' })).json()).data.attivita;
  const fatta = await chiama(base, `/api/v1/me/tasks/${attivita.id}/stato`, 'POST', { stato: 'done' });
  assert.equal(fatta.status, 200);
  assert.equal((await fatta.json()).data.attivita.stato, 'done');
  assert.deepEqual((await (await chiama(base, '/api/v1/me/tasks')).json()).data.attivita.map((a) => [a.id, a.stato]), [[attivita.id, 'done']]);
  const ricordo = await chiama(base, '/api/v1/me/memory', 'POST', { titolo: 'Tema', contenuto: 'preferisco il tema scuro' });
  assert.equal(ricordo.status, 201);
  assert.equal((await (await chiama(base, '/api/v1/me/memory')).json()).data.memorie.length, 1);
});

test('ME-05 — eliminazione in blocco senza sessione: le voci della persona spariscono, una inesistente lo dice da sola', async (t) => {
  const { base } = await server(t);
  const ids = [];
  for (const titolo of ['uno', 'due']) ids.push((await (await chiama(base, '/api/v1/me/notes', 'POST', { titolo, contenuto: titolo })).json()).data.nota.id);
  const blocco = await chiama(base, '/api/v1/me/notes/batch', 'POST', { azione: 'elimina', ids: [...ids, 'mai-esistita'] });
  assert.equal(blocco.status, 200);
  const dati = (await blocco.json()).data;
  assert.deepEqual(dati.riepilogo, { richiesti: 3, riusciti: 2, falliti: 1 });
  assert.equal(dati.esiti[2].code, 'NOTE_NOT_FOUND');
  assert.deepEqual((await (await chiama(base, '/api/v1/me/notes')).json()).data.note, []);
  assert.equal((await chiama(base, '/api/v1/me/library/batch', 'POST', { azione: 'elimina', ids: ['x'] })).status, 404, 'la Libreria resta del progetto');
});

test('ME-03 AL CONTRARIO — la forma con la sessione verifica ancora che la sessione esista; i metodi falsi dicono 405 col vero Allow', async (t) => {
  const { base } = await server(t);
  assert.equal((await chiama(base, '/api/v1/sessions/mai-esistita/notes', 'POST', { titolo: 'x', contenuto: 'y' })).status, 404);
  assert.equal((await chiama(base, '/api/v1/sessions/mai-esistita/notes')).status, 404);
  const put = await chiama(base, '/api/v1/me/notes', 'PUT', {});
  assert.equal(put.status, 405);
  assert.equal(put.headers.get('allow'), 'GET, HEAD, POST', 'HEAD viaggia con GET, come per le altre rotte');
  const statoGet = await chiama(base, '/api/v1/me/tasks/abc/stato');
  assert.equal(statoGet.status, 405);
  assert.equal(statoGet.headers.get('allow'), 'POST');
  assert.equal((await chiama(base, '/api/v1/me/library')).status, 404, 'la Libreria è del progetto: niente forma personale');
});

test('ME-04 — registro: elenca*Personali leggono l\'archivio globale senza sessione; con la sessione la lettura è la STESSA', async () => {
  const pronta = { id: 'n1', titolo: 'T', contenuto: 'C', creataAlle: 'x', aggiornataAlle: '2026-10-08T20:00:00.000Z' };
  let cartellaRicevuta;
  const registro = createSessionRegistry({ modello: 'm', chiave: 'k', cartellaNote: '/globale/note', elencaNoteRegistroFn: async ({ cartella }) => { cartellaRicevuta = cartella; return [pronta]; } });
  const esito = await registro.elencaNotePersonali();
  assert.equal(cartellaRicevuta, '/globale/note');
  assert.deepEqual(esito, { ok: true, note: [{ id: 'n1', titolo: 'T', contenuto: 'C', aggiornataAlle: '2026-10-08T20:00:00.000Z' }], errore: null });
  const rotto = createSessionRegistry({ modello: 'm', chiave: 'k', elencaNoteRegistroFn: async () => { throw new NoteStoreError('rotta.json non è JSON valido', 'NOTE_STORE_MALFORMED'); } });
  const malformato = await rotto.elencaNotePersonali();
  assert.equal(malformato.note, null, 'null, non []: «archivio illeggibile» non è «nessuna nota»');
  assert.match(malformato.errore, /non è JSON valido/u);
  assert.equal((await registro.elencaNote('mai-esistita')).code, 'NOT_FOUND', 'con la sessione nel nome si verifica ancora che esista');
});
