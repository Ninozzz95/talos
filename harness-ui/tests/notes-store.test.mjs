import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { NoteStoreError, aggiornaNota, creaNota, elencaNote, eliminaNota, leggiNota } from '../src/notes-store.mjs';

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-notes-store-'));
}

test('⭐⭐⭐ creaNota + leggiNota: la nota torna con lo stesso id, titolo e contenuto', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaNota({ cartella, title: 'Codice cancello', content: '4471' });
    assert.equal(creata.titolo, 'Codice cancello');
    assert.equal(creata.contenuto, '4471');
    assert.ok(creata.id);
    assert.equal(creata.creataAlle, creata.aggiornataAlle);
    const riletta = await leggiNota({ cartella, id: creata.id });
    assert.deepEqual(riletta, creata);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ creaNota: la cartella si crea da sola se non esiste ancora', async () => {
  const radice = cartellaVera();
  const cartella = join(radice, 'non-esiste-ancora');
  try {
    await creaNota({ cartella, title: 'x', content: 'y' });
    const elenco = await elencaNote({ cartella });
    assert.equal(elenco.length, 1);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ leggiNota: un id inesistente torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await leggiNota({ cartella, id: 'mai-esistita' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ elencaNote: cartella assente (primo avvio) torna [], mai un errore', async () => {
  const radice = cartellaVera();
  try {
    assert.deepEqual(await elencaNote({ cartella: join(radice, 'non-esiste') }), []);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ elencaNote: più recentemente aggiornate per prime, stesso ordine di notes_list mobile', async () => {
  const cartella = cartellaVera();
  try {
    let orologio = new Date('2026-08-30T10:00:00.000Z').getTime();
    const clockFn = () => new Date(orologio);
    const prima = await creaNota({ cartella, title: 'Prima', content: 'a' }, { clockFn });
    orologio += 60_000;
    const seconda = await creaNota({ cartella, title: 'Seconda', content: 'b' }, { clockFn });
    orologio += 60_000;
    await aggiornaNota({ cartella, id: prima.id, content: 'a-corretta' }, { clockFn }); // tocca "aggiornataAlle" della prima, deve salire in cima
    const elenco = await elencaNote({ cartella });
    assert.deepEqual(elenco.map((n) => n.id), [prima.id, seconda.id]);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — elencaNote: un file .json corrotto non nasconde le altre note', async () => {
  const cartella = cartellaVera();
  try {
    await creaNota({ cartella, title: 'Buona', content: 'x' });
    mkdirSync(cartella, { recursive: true });
    writeFileSync(join(cartella, 'corrotta.json'), '{ non e\' json valido');
    const elenco = await elencaNote({ cartella });
    assert.equal(elenco.length, 1);
    assert.equal(elenco[0].titolo, 'Buona');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — elencaNote: un file non .json nella cartella è ignorato', async () => {
  const cartella = cartellaVera();
  try {
    await creaNota({ cartella, title: 'x', content: 'y' });
    mkdirSync(cartella, { recursive: true });
    writeFileSync(join(cartella, 'note.txt'), 'non è una nota');
    const elenco = await elencaNote({ cartella });
    assert.equal(elenco.length, 1);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

for (const [campo, valoreCorto, valoreLungo, tetto] of [
  ['title', '', 'x'.repeat(121), 120],
  ['content', '', 'x'.repeat(8_001), 8_000],
]) {
  test(`⛔⛔ AL CONTRARIO — creaNota: ${campo} vuoto o oltre ${tetto} caratteri è NOTE_INVALID, mai una scrittura parziale`, async () => {
    const cartella = cartellaVera();
    try {
      const base = { cartella, title: 'ok', content: 'ok' };
      await assert.rejects(() => creaNota({ ...base, [campo]: valoreCorto }), (errore) => {
        assert.ok(errore instanceof NoteStoreError);
        assert.equal(errore.code, 'NOTE_INVALID');
        return true;
      });
      await assert.rejects(() => creaNota({ ...base, [campo]: valoreLungo }), (errore) => {
        assert.equal(errore.code, 'NOTE_INVALID');
        return true;
      });
      assert.deepEqual(await elencaNote({ cartella }), [], 'nessuna riga scritta su un input rifiutato');
    } finally {
      rmSync(cartella, { recursive: true, force: true });
    }
  });
}

test('⭐⭐⭐ aggiornaNota: solo i campi mandati cambiano, il resto resta intatto', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaNota({ cartella, title: 'Vecchio titolo', content: 'vecchio contenuto' });
    const aggiornata = await aggiornaNota({ cartella, id: creata.id, title: 'Nuovo titolo' });
    assert.equal(aggiornata.titolo, 'Nuovo titolo');
    assert.equal(aggiornata.contenuto, 'vecchio contenuto', 'content non mandato: resta quello di prima');
    assert.ok(aggiornata.aggiornataAlle >= creata.aggiornataAlle);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — aggiornaNota: un id inesistente è NOTE_NOT_FOUND, mai una nota creata al volo', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => aggiornaNota({ cartella, id: 'mai-esistita', title: 'x' }), (errore) => {
      assert.ok(errore instanceof NoteStoreError);
      assert.equal(errore.code, 'NOTE_NOT_FOUND');
      return true;
    });
    assert.deepEqual(await elencaNote({ cartella }), []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — aggiornaNota: title/content passato ma fuori dai tetti è NOTE_INVALID, la nota resta quella di prima', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaNota({ cartella, title: 'ok', content: 'ok' });
    await assert.rejects(() => aggiornaNota({ cartella, id: creata.id, title: '' }), (errore) => {
      assert.equal(errore.code, 'NOTE_INVALID');
      return true;
    });
    const rimasta = await leggiNota({ cartella, id: creata.id });
    assert.equal(rimasta.titolo, 'ok', 'un aggiornamento rifiutato non deve toccare la nota sul disco');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ eliminaNota: la nota sparisce davvero dal disco', async () => {
  const cartella = cartellaVera();
  try {
    const creata = await creaNota({ cartella, title: 'x', content: 'y' });
    await eliminaNota({ cartella, id: creata.id });
    assert.equal(await leggiNota({ cartella, id: creata.id }), null);
    assert.deepEqual(await elencaNote({ cartella }), []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — eliminaNota: un id già assente non lancia, è idempotente (stesso principio del tool mobile)', async () => {
  const cartella = cartellaVera();
  try {
    await eliminaNota({ cartella, id: 'mai-esistita' }); // non deve lanciare
    assert.deepEqual(await elencaNote({ cartella }), []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
