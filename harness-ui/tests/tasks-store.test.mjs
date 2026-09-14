import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { TaskStoreError, aggiornaAttivita, completaAttivita, creaAttivita, elencaAttivita, eliminaAttivita, leggiAttivita } from '../src/tasks-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-tasks-store-'));
}

test('⭐⭐⭐ creaAttivita + leggiAttivita: nasce "todo", priorità default "normal", descrizione assente diventa null', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaAttivita({ cartella, title: 'Chiama idraulico' });
    assert.equal(creata.titolo, 'Chiama idraulico');
    assert.equal(creata.descrizione, null);
    assert.equal(creata.priorita, 'normal');
    assert.equal(creata.stato, 'todo');
    assert.ok(creata.id);
    const riletta = await leggiAttivita({ cartella, id: creata.id });
    assert.deepEqual(riletta, creata);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐ creaAttivita: title + description + priority espliciti, e una descrizione di soli spazi diventa null', async () => {
  const cartella = cartellaVera();
  try {
    const conDescrizione = await creaAttivita({ cartella, title: 'x', description: 'dettaglio vero', priority: 'high' });
    assert.equal(conDescrizione.descrizione, 'dettaglio vero');
    assert.equal(conDescrizione.priorita, 'high');
    const soloSpazi = await creaAttivita({ cartella, title: 'y', description: '   ' });
    assert.equal(soloSpazi.descrizione, null);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔ leggiAttivita: un id inesistente torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await leggiAttivita({ cartella, id: 'mai-esistita' }), null);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔ elencaAttivita: cartella assente (primo avvio) torna [], mai un errore', async () => {
  const radice = cartellaVera();
  try {
    assert.deepEqual(await elencaAttivita({ cartella: join(radice, 'non-esiste') }), []);
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});

test('⭐⭐⭐ elencaAttivita: più recentemente aggiornate per prime', async () => {
  const cartella = cartellaVera();
  try {
    let orologio = new Date('2026-08-30T10:00:00.000Z').getTime();
    const clockFn = () => new Date(orologio);
    const prima = await creaAttivita({ cartella, title: 'Prima' }, { clockFn });
    orologio += 60_000;
    const seconda = await creaAttivita({ cartella, title: 'Seconda' }, { clockFn });
    orologio += 60_000;
    await completaAttivita({ cartella, id: prima.id, status: 'done' }, { clockFn }); // tocca "aggiornataAlle" della prima, deve salire in cima
    const elenco = await elencaAttivita({ cartella });
    assert.deepEqual(elenco.map((a) => a.id), [prima.id, seconda.id]);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ AL CONTRARIO — elencaAttivita: un file .json corrotto non nasconde le altre attività', async () => {
  const cartella = cartellaVera();
  try {
    await creaAttivita({ cartella, title: 'Buona' });
    mkdirSync(cartella, { recursive: true });
    writeFileSync(join(cartella, 'corrotta.json'), '{ non e\' json valido');
    const elenco = await elencaAttivita({ cartella });
    assert.equal(elenco.length, 1);
    assert.equal(elenco[0].titolo, 'Buona');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ AL CONTRARIO — creaAttivita: title vuoto o oltre 200 caratteri è TASK_INVALID, mai una scrittura parziale', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => creaAttivita({ cartella, title: '' }), (errore) => {
      assert.ok(errore instanceof TaskStoreError);
      assert.equal(errore.code, 'TASK_INVALID');
      return true;
    });
    await assert.rejects(() => creaAttivita({ cartella, title: 'x'.repeat(201) }), (errore) => {
      assert.equal(errore.code, 'TASK_INVALID');
      return true;
    });
    assert.deepEqual(await elencaAttivita({ cartella }), []);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ AL CONTRARIO — creaAttivita: priority fuori dal vocabolario è TASK_INVALID', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => creaAttivita({ cartella, title: 'x', priority: 'urgentissimo' }), (errore) => {
      assert.equal(errore.code, 'TASK_INVALID');
      return true;
    });
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐⭐ aggiornaAttivita: solo i campi mandati cambiano, MAI lo stato (quello è completaAttivita)', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaAttivita({ cartella, title: 'Vecchio', description: 'vecchia descrizione', priority: 'low' });
    const aggiornata = await aggiornaAttivita({ cartella, id: creata.id, title: 'Nuovo' });
    assert.equal(aggiornata.titolo, 'Nuovo');
    assert.equal(aggiornata.descrizione, 'vecchia descrizione', 'description non mandata: resta quella di prima');
    assert.equal(aggiornata.priorita, 'low', 'priority non mandata: resta quella di prima');
    assert.equal(aggiornata.stato, 'todo', 'lo stato non lo tocca mai aggiornaAttivita');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ AL CONTRARIO — aggiornaAttivita: un id inesistente è TASK_NOT_FOUND, mai un\'attività creata al volo', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => aggiornaAttivita({ cartella, id: 'mai-esistita', title: 'x' }), (errore) => {
      assert.ok(errore instanceof TaskStoreError);
      assert.equal(errore.code, 'TASK_NOT_FOUND');
      return true;
    });
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐⭐ completaAttivita: cambia lo stato e SOLO lo stato', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaAttivita({ cartella, title: 'x', description: 'y', priority: 'high' });
    const completata = await completaAttivita({ cartella, id: creata.id, status: 'done' });
    assert.equal(completata.stato, 'done');
    assert.equal(completata.titolo, 'x');
    assert.equal(completata.descrizione, 'y');
    assert.equal(completata.priorita, 'high');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐ completaAttivita: default "done" se status non passato', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaAttivita({ cartella, title: 'x' });
    const completata = await completaAttivita({ cartella, id: creata.id });
    assert.equal(completata.stato, 'done');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ AL CONTRARIO — completaAttivita: un id inesistente è TASK_NOT_FOUND', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => completaAttivita({ cartella, id: 'mai-esistita' }), (errore) => {
      assert.equal(errore.code, 'TASK_NOT_FOUND');
      return true;
    });
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ AL CONTRARIO — completaAttivita: uno status fuori dal vocabolario è TASK_INVALID', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaAttivita({ cartella, title: 'x' });
    await assert.rejects(() => completaAttivita({ cartella, id: creata.id, status: 'quasi-fatto' }), (errore) => {
      assert.equal(errore.code, 'TASK_INVALID');
      return true;
    });
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐ eliminaAttivita: l\'attività sparisce davvero dal disco', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaAttivita({ cartella, title: 'x' });
    await eliminaAttivita({ cartella, id: creata.id });
    assert.equal(await leggiAttivita({ cartella, id: creata.id }), null);
    assert.deepEqual(await elencaAttivita({ cartella }), []);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔ AL CONTRARIO — eliminaAttivita: un id già assente non lancia, è idempotente', async () => {
  const cartella = cartellaVera();
  try {
    await eliminaAttivita({ cartella, id: 'mai-esistita' }); // non deve lanciare
    assert.deepEqual(await elencaAttivita({ cartella }), []);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});
