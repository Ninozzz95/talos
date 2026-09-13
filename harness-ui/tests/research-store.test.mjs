import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CARTELLA_RICERCA, ResearchStoreError, aggiornaRicerca, creaRicerca, elencaRicerche, eliminaRicerca, leggiRicerca } from '../src/research-store.mjs';

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-research-store-'));
}

test('⭐⭐⭐ creaRicerca + leggiRicerca: forma completa, terminata/reportLibraryId nulli all\'avvio', async () => {
  const cartella = cartellaVera();
  try {
    const voce = await creaRicerca({ cartella, id: 'sess-abc', domanda: 'Come funziona il caching di OpenRouter?', profondita: 'deep' });
    assert.equal(voce.id, 'sess-abc');
    assert.equal(voce.domanda, 'Come funziona il caching di OpenRouter?');
    assert.equal(voce.profondita, 'deep');
    assert.equal(voce.titolo, null);
    assert.equal(voce.terminata, null);
    assert.equal(voce.reportLibraryId, null);
    assert.ok(voce.avviataAlle);
    const riletta = await leggiRicerca({ cartella, id: 'sess-abc' });
    assert.deepEqual(riletta, voce);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ creaRicerca: profondita default "deep" se assente', async () => {
  const cartella = cartellaVera();
  try {
    const voce = await creaRicerca({ cartella, id: 'sess-x', domanda: 'y' });
    assert.equal(voce.profondita, 'deep');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ creaRicerca: rifiuta senza id o senza domanda (mai una scrittura a metà)', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => creaRicerca({ cartella, id: '', domanda: 'x' }), ResearchStoreError);
    await assert.rejects(() => creaRicerca({ cartella, id: 'sess-y', domanda: '   ' }), ResearchStoreError);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ leggiRicerca: un id inesistente torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await leggiRicerca({ cartella, id: 'mai-esistita' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ elencaRicerche: cartella assente torna [] (mai un errore), più recenti prime', async () => {
  const cartella = cartellaVera();
  try {
    assert.deepEqual(await elencaRicerche({ cartella }), []);
    await creaRicerca({ cartella, id: 'sess-1', domanda: 'prima' });
    await new Promise((r) => setTimeout(r, 5));
    await creaRicerca({ cartella, id: 'sess-2', domanda: 'seconda' });
    const elenco = await elencaRicerche({ cartella });
    assert.equal(elenco.length, 2);
    assert.equal(elenco[0].id, 'sess-2', 'la più recente è prima');
    assert.equal(elenco[1].id, 'sess-1');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ elencaRicerche AL CONTRARIO: una voce corrotta è saltata, le altre restano visibili', async () => {
  const cartella = cartellaVera();
  try {
    await creaRicerca({ cartella, id: 'sess-buona', domanda: 'x' });
    mkdirSync(join(cartella, CARTELLA_RICERCA), { recursive: true });
    writeFileSync(join(cartella, CARTELLA_RICERCA, 'sess-corrotta.json'), '{ non e json valido', 'utf8');
    const elenco = await elencaRicerche({ cartella });
    assert.equal(elenco.length, 1);
    assert.equal(elenco[0].id, 'sess-buona');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ aggiornaRicerca: titolo/terminata/reportLibraryId aggiornabili singolarmente, undefined non tocca il campo', async () => {
  const cartella = cartellaVera();
  try {
    await creaRicerca({ cartella, id: 'sess-a', domanda: 'x' });
    const conTitolo = await aggiornaRicerca({ cartella, id: 'sess-a', titolo: 'Il mio titolo' });
    assert.equal(conTitolo.titolo, 'Il mio titolo');
    assert.equal(conTitolo.terminata, null, 'terminata non toccata da un aggiornamento che non la nomina');
    const conclusa = await aggiornaRicerca({ cartella, id: 'sess-a', terminata: 'done', reportLibraryId: 'lib-xyz' });
    assert.equal(conclusa.titolo, 'Il mio titolo', 'il titolo di prima resta, mai perso da un secondo aggiornamento parziale');
    assert.equal(conclusa.terminata, 'done');
    assert.equal(conclusa.reportLibraryId, 'lib-xyz');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ aggiornaRicerca AL CONTRARIO: titolo:null è un valore ESPLICITO (resetta), diverso da titolo assente (undefined)', async () => {
  const cartella = cartellaVera();
  try {
    await creaRicerca({ cartella, id: 'sess-b', domanda: 'x' });
    await aggiornaRicerca({ cartella, id: 'sess-b', titolo: 'Un nome' });
    const resettata = await aggiornaRicerca({ cartella, id: 'sess-b', titolo: null });
    assert.equal(resettata.titolo, null, 'titolo:null azzera davvero, non viene scambiato per "non passato"');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ aggiornaRicerca: un id inesistente torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await aggiornaRicerca({ cartella, id: 'mai-esistita', titolo: 'x' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ eliminaRicerca: cancella davvero (elencaRicerche non la vede più)', async () => {
  const cartella = cartellaVera();
  try {
    await creaRicerca({ cartella, id: 'sess-c', domanda: 'x' });
    const esito = await eliminaRicerca({ cartella, id: 'sess-c' });
    assert.deepEqual(esito, { id: 'sess-c' });
    assert.equal(await leggiRicerca({ cartella, id: 'sess-c' }), null);
    assert.deepEqual(await elencaRicerche({ cartella }), []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ eliminaRicerca AL CONTRARIO: idempotente — un id già assente torna null, mai un\'eccezione (stesso principio di library-store)', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await eliminaRicerca({ cartella, id: 'mai-esistita' }), null);
    await creaRicerca({ cartella, id: 'sess-d', domanda: 'x' });
    await eliminaRicerca({ cartella, id: 'sess-d' });
    assert.equal(await eliminaRicerca({ cartella, id: 'sess-d' }), null, 'una seconda eliminazione sullo stesso id non lancia');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
