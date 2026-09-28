/*
 * agent-service-letture-sezioni.test.mjs — decisione owner 27/09 (memoria `decisioni-owner-capacita-sezioni-27-09`): il
 *   cablaggio vero fra i NEGOZI (su disco, cartelle temporanee) e il kernel. `onLetturaSezione` e `memorieNelPrompt` arrivano a
 *   `talosLavora`, leggono le cartelle GLOBALI giuste, e il caso dell'owner — «d'ora in poi parla sempre in linguaggio
 *   pirata» salvato in memoria — arriva nel blocco per il prompt della chat nuova.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { avviaSessione } from '../src/agent-service.mjs';
import { creaMemoria } from '../src/memory-store.mjs';
import { creaNota } from '../src/notes-store.mjs';
import { creaAttivita } from '../src/tasks-store.mjs';

const TASK = { consegna: 'fai qualcosa' };

async function avvia(t, extra = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-letture-sezioni-servizio-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const cartelle = { cartellaMemoria: join(radice, 'memoria'), cartellaNote: join(radice, 'note'), cartellaAttivita: join(radice, 'attivita') };
  await creaMemoria({ cartella: cartelle.cartellaMemoria, title: 'Lingua', content: "d'ora in poi parla sempre in linguaggio pirata", origine: 'persona' });
  await creaNota({ cartella: cartelle.cartellaNote, title: 'Idee per la board', content: 'Una board delle attività e la ricerca nelle conversazioni' });
  await creaAttivita({ cartella: cartelle.cartellaAttivita, title: 'Rilasciare la 0.1.16', description: 'dopo F7' });
  let catturato;
  await avviaSessione({
    cartella: join(radice, 'progetto'), ...cartelle, task: TASK, modello: 'm', chiave: 'k', onEvento: () => {},
    talosLavoraFn: async (input) => { catturato = input; return { comeFinita: 'concluso', detto: 'fatto' }; },
    ...extra,
  });
  return catturato;
}

test('SERVIZIO-SEZIONI-01 — il caso dell’owner: la memoria «pirata» arriva nel blocco per il prompt della chat nuova', async (t) => {
  const input = await avvia(t);
  assert.equal(typeof input.memorieNelPrompt, 'string');
  assert.match(input.memorieNelPrompt, /^MEMORY — what the person asked TALOS to remember: 1 of 1/u);
  assert.match(input.memorieNelPrompt, /- Lingua: d'ora in poi parla sempre in linguaggio pirata \(id /u);
});

test('SERVIZIO-SEZIONI-02 — le letture nuove leggono i negozi veri: memoria, note (cerca e leggi), attività', async (t) => {
  const input = await avvia(t);
  const leggi = input.onLetturaSezione;
  assert.equal(typeof leggi, 'function');
  assert.match(await leggi('memory_list', {}), /^Memory: showing 1 of 1, most recently updated first\.\n- Lingua: d'ora in poi parla sempre in linguaggio pirata — id /u);
  const trovate = await leggi('notes_search', { query: 'attivita board' });
  assert.match(trovate, /^Notes: 1 of 1 match «attivita», «board», showing 1, best first\.\n- Idee per la board: /u);
  const id = /— id (\S+)$/u.exec(trovate)[1];
  assert.match(await leggi('notes_read', { id }), /^Note «Idee per la board» — id [^\n]+\nUna board delle attività e la ricerca nelle conversazioni$/u);
  assert.match(await leggi('notes_read', { id: 'nessuna' }), /^notes_read: no note with id «nessuna»/u);
  assert.match(await leggi('tasks_search', { query: 'rilasciare' }), /- \[ \] Rilasciare la 0\.1\.16: dopo F7 — id /u);
});

test('SERVIZIO-SEZIONI-03 — ricerche e conversazioni passano dal registro; senza, l’attrezzo lo dice', async (t) => {
  const senza = await avvia(t);
  assert.equal(await senza.onLetturaSezione('research_search', { query: 'x' }), 'deep research is not configured on this harness.');
  assert.equal(await senza.onLetturaSezione('conversation_search', {}), 'conversations are not available on this harness.');
  const ricevuti = [];
  const con = await avvia(t, {
    onRicercaCerca: async (a) => { ricevuti.push(['ricerche', a]); return 'r'; },
    conversazioniFn: async (a) => { ricevuti.push(['conversazioni', a]); return 'c'; },
  });
  assert.equal(await con.onLetturaSezione('research_search', { query: 'llama' }), 'r');
  assert.equal(await con.onLetturaSezione('conversation_search', { status: 'done' }), 'c');
  assert.deepEqual(ricevuti, [['ricerche', { query: 'llama' }], ['conversazioni', { status: 'done' }]]);
});

test('SERVIZIO-SEZIONI-04 — AL CONTRARIO: senza memorie nessun blocco, e memory_search dice quante ce ne sono quando non trova', async (t) => {
  const radice = mkdtempSync(join(tmpdir(), 'talos-letture-sezioni-vuote-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  let input;
  await avviaSessione({
    cartella: join(radice, 'p'), cartellaMemoria: join(radice, 'm'), cartellaNote: join(radice, 'n'), cartellaAttivita: join(radice, 'a'),
    task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: async (i) => { input = i; return { comeFinita: 'concluso', detto: 'fatto' }; },
  });
  assert.equal(input.memorieNelPrompt, null);
  const piena = await avvia(t);
  const cercata = await piena.onMemoriaCerca({ query: 'memorie salvate dall’utente' });
  assert.deepEqual({ trovate: cercata.memorie.length, inTutto: cercata.inTutto }, { trovate: 0, inTutto: 1 });
  const tutte = await piena.onMemoriaCerca({ query: '*' });
  assert.deepEqual({ trovate: tutte.memorie.length, tutte: tutte.tutte }, { trovate: 1, tutte: true });
});

test('SERVIZIO-SEZIONI-05 — una figlia e una ripresa non leggono nemmeno le memorie (Hermes: skip_memory per i sotto-agenti)', async (t) => {
  for (const extra of [{ agentRole: 'child' }, { messaggiIniziali: [{ role: 'user', content: 'ciao' }] }]) {
    let letture = 0;
    const input = await avvia(t, { ...extra, elencaMemorieFn: async () => { letture += 1; return []; } });
    assert.equal(input.memorieNelPrompt, null, JSON.stringify(extra));
    assert.equal(letture, 0, `nessuna lettura d’avvio: ${JSON.stringify(extra)}`);
    assert.match(await input.onLetturaSezione('memory_list', {}), /^Nothing is remembered yet/u, 'l’attrezzo resta: legge quando serve');
    assert.equal(letture, 1);
  }
});
