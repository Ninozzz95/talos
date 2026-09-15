import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaNota } from '../src/notes-store.mjs';
import { creaAttivita } from '../src/tasks-store.mjs';
import { creaMemoria } from '../src/memory-store.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SESSIONE = 'fase-3-batch';

async function avvia(t, { sessioneEsiste = true } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-batch-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  const presentiLibreria = new Set();
  const presentiRicerca = new Set();
  const chiamate = [];
  const sessionRegistry = {
    esiste: (id) => sessioneEsiste && id === SESSIONE,
    eliminaVoceLibreria: async (_sessionId, id) => {
      chiamate.push(['library', id]);
      if (!presentiLibreria.delete(id)) throw Object.assign(new Error('voce assente'), { code: 'LIBRARY_NOT_FOUND' });
      return { id, nome: `${id}.md` };
    },
    eliminaRicerca: async (_sessionId, id) => {
      chiamate.push(['research', id]);
      if (!presentiRicerca.delete(id)) return { ok: true, eliminata: null };
      return { ok: true, eliminata: { id, titolo: id } };
    },
  };
  const cartellaNote = join(radice, 'note');
  const cartellaAttivita = join(radice, 'attivita');
  const cartellaMemoria = join(radice, 'memoria');
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry,
    cartellaNote,
    cartellaAttivita,
    cartellaMemoria,
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    cartellaNote,
    cartellaAttivita,
    cartellaMemoria,
    presentiLibreria,
    presentiRicerca,
    chiamate,
  };
}

function batch(base, risorsa, ids, extra = {}) {
  return fetch(`${base}/api/v1/sessions/${SESSIONE}/${risorsa}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ azione: 'elimina', ids, ...extra }),
  });
}

test('FASE3-BATCH-214 — 214 id viaggiano in una richiesta e conservano ordine ed esito', async (t) => {
  const { base, presentiLibreria, chiamate } = await avvia(t);
  const ids = Array.from({ length: 214 }, (_, i) => `lib-${String(i + 1).padStart(3, '0')}`);
  ids.forEach((id) => presentiLibreria.add(id));

  const risposta = await batch(base, 'library', ids);
  assert.equal(risposta.status, 200);
  const data = (await risposta.json()).data;
  assert.equal(data.risorsa, 'library');
  assert.equal(data.richiesti, 214);
  assert.equal(data.riusciti, 214);
  assert.equal(data.falliti, 0);
  assert.deepEqual(data.esiti, ids.map((id) => ({ id, ok: true })));
  assert.deepEqual(chiamate, ids.map((id) => ['library', id]));
});

test('FASE3-BATCH-PARZIALE — le cinque risorse eseguono e una voce assente non annulla le riuscite', async (t) => {
  const { base, cartellaNote, cartellaAttivita, cartellaMemoria, presentiLibreria, presentiRicerca } = await avvia(t);
  const nota = await creaNota({ cartella: cartellaNote, title: 'Da togliere', content: 'x', origine: 'persona' });
  const attivita = await creaAttivita({ cartella: cartellaAttivita, title: 'Da togliere', origine: 'persona' });
  const memoria = (await creaMemoria({ cartella: cartellaMemoria, title: 'Da togliere', content: 'x', origine: 'persona' })).voce;

  presentiLibreria.add('libreria-viva');
  assert.deepEqual((await (await batch(base, 'library', ['libreria-viva'])).json()).data.esiti, [{ id: 'libreria-viva', ok: true }]);

  const note = await batch(base, 'notes', [nota.id, 'nota-assente']);
  assert.equal(note.status, 200);
  assert.deepEqual((await note.json()).data.esiti, [
    { id: nota.id, ok: true },
    { id: 'nota-assente', ok: false, code: 'NOTE_NOT_FOUND' },
  ]);

  assert.deepEqual((await (await batch(base, 'tasks', [attivita.id])).json()).data.esiti, [{ id: attivita.id, ok: true }]);
  assert.deepEqual((await (await batch(base, 'memory', [memoria.id])).json()).data.esiti, [{ id: memoria.id, ok: true }]);

  presentiRicerca.add('ricerca-viva');
  const ricerca = await batch(base, 'research', ['ricerca-viva', 'ricerca-assente']);
  assert.equal(ricerca.status, 200);
  assert.deepEqual((await ricerca.json()).data.esiti, [
    { id: 'ricerca-viva', ok: true },
    { id: 'ricerca-assente', ok: false, code: 'RESEARCH_NOT_FOUND' },
  ]);
});

test('FASE3-BATCH-CAP — vuoto, duplicati, chiavi estranee e 251 id sono rifiutati prima degli effetti', async (t) => {
  const { base, chiamate } = await avvia(t);
  const casi = [
    [],
    ['ripetuto', 'ripetuto'],
    Array.from({ length: 251 }, (_, i) => `id-${i}`),
  ];
  for (const ids of casi) assert.equal((await batch(base, 'library', ids)).status, 400);
  assert.equal((await batch(base, 'library', ['uno'], { ignota: true })).status, 400);
  assert.equal((await batch(base, 'library', ['uno'], { azione: 'sposta' })).status, 400);
  assert.deepEqual(chiamate, []);
});

test('FASE3-BATCH-SESSIONE — sessione assente e risorsa inventata non toccano gli store', async (t) => {
  const { base, chiamate } = await avvia(t, { sessioneEsiste: false });
  assert.equal((await batch(base, 'notes', ['uno'])).status, 404);
  assert.equal((await batch(base, 'projects', ['uno'])).status, 404, 'Progetti non acquisisce una cancellazione finta');
  assert.deepEqual(chiamate, []);
});
