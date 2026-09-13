import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MemoryStoreError, aggiornaMemoria, cercaMemorie, creaMemoria, elencaMemorie, eliminaMemoria, leggiMemoria, trovaMemoriaPerTitolo } from '../src/memory-store.mjs';

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-memory-store-'));
}

test('⭐⭐⭐ creaMemoria + leggiMemoria: torna un id (a differenza di mobile — vedi la doc), genere default "preference"', async () => {
  const cartella = cartellaVera();
  try {
    const { voce, duplicato } = await creaMemoria({ cartella, title: 'Preferenze risposta', content: 'Risposte brevi' });
    assert.equal(duplicato, false);
    assert.equal(voce.titolo, 'Preferenze risposta');
    assert.equal(voce.contenuto, 'Risposte brevi');
    assert.equal(voce.genere, 'preference');
    assert.ok(voce.id);
    const riletta = await leggiMemoria({ cartella, id: voce.id });
    assert.deepEqual(riletta, voce);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ creaMemoria: kind esplicito', async () => {
  const cartella = cartellaVera();
  try {
    const { voce } = await creaMemoria({ cartella, title: 'x', content: 'y', kind: 'policy_note' });
    assert.equal(voce.genere, 'policy_note');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐⭐⭐ creaMemoria: DEDUPLICA per titolo — una seconda chiamata con lo STESSO titolo (case/spazi diversi) torna la voce ESISTENTE, mai una seconda scrittura', async () => {
  const cartella = cartellaVera();
  try {
    const prima = await creaMemoria({ cartella, title: 'Preferenze risposta', content: 'Risposte brevi' });
    assert.equal(prima.duplicato, false);
    const seconda = await creaMemoria({ cartella, title: '  PREFERENZE RISPOSTA  ', content: 'testo diverso, ignorato' });
    assert.equal(seconda.duplicato, true);
    assert.equal(seconda.voce.id, prima.voce.id);
    assert.equal(seconda.voce.contenuto, 'Risposte brevi', 'il contenuto della chiamata duplicata NON sostituisce quello esistente');
    const elenco = await elencaMemorie({ cartella });
    assert.equal(elenco.length, 1, 'una sola voce sul disco, mai due');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ trovaMemoriaPerTitolo: case/spazi-insensitive, null se non trovata', async () => {
  const cartella = cartellaVera();
  try {
    await creaMemoria({ cartella, title: 'Preferenze risposta', content: 'x' });
    assert.ok(await trovaMemoriaPerTitolo({ cartella, title: 'preferenze RISPOSTA' }));
    assert.equal(await trovaMemoriaPerTitolo({ cartella, title: 'mai scritta' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ leggiMemoria: un id inesistente torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await leggiMemoria({ cartella, id: 'mai-esistita' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ elencaMemorie: cartella assente (primo avvio) torna [], mai un errore', async () => {
  const radice = cartellaVera();
  try {
    assert.deepEqual(await elencaMemorie({ cartella: join(radice, 'non-esiste') }), []);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — elencaMemorie: un file .json corrotto non nasconde le altre memorie', async () => {
  const cartella = cartellaVera();
  try {
    await creaMemoria({ cartella, title: 'Buona', content: 'x' });
    mkdirSync(cartella, { recursive: true });
    writeFileSync(join(cartella, 'corrotta.json'), '{ non e\' json valido');
    const elenco = await elencaMemorie({ cartella });
    assert.equal(elenco.length, 1);
    assert.equal(elenco[0].titolo, 'Buona');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

for (const [campo, valoreCorto, valoreLungo, tetto] of [
  ['title', '', 'x'.repeat(81), 80],
  ['content', '', 'x'.repeat(601), 600],
]) {
  test(`⛔⛔ AL CONTRARIO — creaMemoria: ${campo} vuoto o oltre ${tetto} caratteri è MEMORY_INVALID, mai una scrittura parziale`, async () => {
    const cartella = cartellaVera();
    try {
      const base = { cartella, title: 'ok', content: 'ok' };
      await assert.rejects(() => creaMemoria({ ...base, [campo]: valoreCorto }), (errore) => {
        assert.ok(errore instanceof MemoryStoreError);
        assert.equal(errore.code, 'MEMORY_INVALID');
        return true;
      });
      await assert.rejects(() => creaMemoria({ ...base, [campo]: valoreLungo }), (errore) => {
        assert.equal(errore.code, 'MEMORY_INVALID');
        return true;
      });
      assert.deepEqual(await elencaMemorie({ cartella }), []);
    } finally {
      rmSync(cartella, { recursive: true, force: true });
    }
  });
}

test('⛔⛔ AL CONTRARIO — creaMemoria: kind fuori dal vocabolario è MEMORY_INVALID', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => creaMemoria({ cartella, title: 'x', content: 'y', kind: 'rejected' }), (errore) => {
      // ⛔ 'rejected' esiste nello schema mobile ma NON è nel vocabolario dei 4 kind esposti dal tool (KINDS) — deliberatamente fuori anche qui.
      assert.equal(errore.code, 'MEMORY_INVALID');
      return true;
    });
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ aggiornaMemoria: solo i campi mandati cambiano', async () => {
  const cartella = cartellaVera();
  try {
    const { voce: creata } = await creaMemoria({ cartella, title: 'Vecchio', content: 'vecchio contenuto', kind: 'preference' });
    const aggiornata = await aggiornaMemoria({ cartella, id: creata.id, content: 'nuovo contenuto' });
    assert.equal(aggiornata.titolo, 'Vecchio', 'title non mandato: resta quello di prima');
    assert.equal(aggiornata.contenuto, 'nuovo contenuto');
    assert.equal(aggiornata.genere, 'preference', 'kind non mandato: resta quello di prima');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — aggiornaMemoria: un id inesistente è MEMORY_NOT_FOUND, mai una memoria creata al volo', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => aggiornaMemoria({ cartella, id: 'mai-esistita', title: 'x' }), (errore) => {
      assert.ok(errore instanceof MemoryStoreError);
      assert.equal(errore.code, 'MEMORY_NOT_FOUND');
      return true;
    });
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ eliminaMemoria: la memoria sparisce davvero dal disco (cancellazione VERA, non un cambio di stato)', async () => {
  const cartella = cartellaVera();
  try {
    const { voce: creata } = await creaMemoria({ cartella, title: 'x', content: 'y' });
    await eliminaMemoria({ cartella, id: creata.id });
    assert.equal(await leggiMemoria({ cartella, id: creata.id }), null);
    assert.deepEqual(await elencaMemorie({ cartella }), []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — eliminaMemoria: un id già assente non lancia, è idempotente', async () => {
  const cartella = cartellaVera();
  try {
    await eliminaMemoria({ cartella, id: 'mai-esistita' }); // non deve lanciare
    assert.deepEqual(await elencaMemorie({ cartella }), []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ cercaMemorie: sottostringa case-insensitive su titolo O contenuto, pura', () => {
  const memorie = [
    { id: 'mem-1', titolo: 'Preferenze risposta', contenuto: 'Risposte brevi' },
    { id: 'mem-2', titolo: 'Lingua', contenuto: 'Sempre in italiano' },
  ];
  assert.deepEqual(cercaMemorie(memorie, { query: 'RISPOSTA' }).memorie.map((m) => m.id), ['mem-1']);
  assert.deepEqual(cercaMemorie(memorie, { query: 'italiano' }).memorie.map((m) => m.id), ['mem-2'], 'trova anche nel contenuto, non solo nel titolo');
  assert.deepEqual(cercaMemorie(memorie, { query: 'niente di simile' }).memorie, []);
});

test('⭐⭐ cercaMemorie: limit tronca i risultati, ma totale resta il conteggio VERO', () => {
  const memorie = Array.from({ length: 10 }, (_, i) => ({ id: `mem-${i}`, titolo: `nota ${i}`, contenuto: 'x' }));
  const esito = cercaMemorie(memorie, { query: 'nota', limit: 3 });
  assert.equal(esito.memorie.length, 3);
  assert.equal(esito.totale, 10);
});

test('⛔ AL CONTRARIO — cercaMemorie: una query vuota torna zero risultati, mai l\'intero elenco', () => {
  const memorie = [{ id: 'mem-1', titolo: 'x', contenuto: 'y' }];
  assert.deepEqual(cercaMemorie(memorie, { query: '' }).memorie, []);
  assert.deepEqual(cercaMemorie(memorie, {}).memorie, []);
});
