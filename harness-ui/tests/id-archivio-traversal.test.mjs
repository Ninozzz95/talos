import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { idArchivioValido } from '../src/id-archivio.mjs';
import { creaNota, leggiNota, aggiornaNota, eliminaNota, NoteStoreError } from '../src/notes-store.mjs';
import { creaAttivita, leggiAttivita, aggiornaAttivita, eliminaAttivita, TaskStoreError } from '../src/tasks-store.mjs';
import { creaMemoria, leggiMemoria, aggiornaMemoria, eliminaMemoria, MemoryStoreError } from '../src/memory-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔⛔ F01 — L'ID DI UN ARCHIVIO NON PUÒ USCIRE DALLA CARTELLA. 14/09/2026.
 *
 * La review ingegneristica del 13/09 lo ha trovato e io l'ho CONFERMATO dal vivo su un banco a porta effimera: una
 * `DELETE .../notes/..%5C<nome>` cancellava un file fuori da `.notes-store/`. L'id arriva da un indirizzo HTTP e dagli
 * attrezzi del modello, non solo da un randomUUID nostro (la Libreria aveva già chiuso lo stesso buco il 10/09).
 *
 * ⛔ La forma della prova è quella della Libreria, non quella della patch della review: da noi un id fuori grammatica è
 *   «non c'è», non un'eccezione — `leggi` torna `null`, `elimina` è un no-op idempotente, `aggiorna` risponde NOT_FOUND.
 *   Le prove al contrario stanno accanto: un id vero fa un giro completo, e la sentinella FUORI dalla cartella sopravvive.
 */

const STORE = [
  { nome: 'notes', crea: creaNota, leggi: leggiNota, aggiorna: aggiornaNota, elimina: eliminaNota, Errore: NoteStoreError, codiceNotFound: 'NOTE_NOT_FOUND', campi: { title: 'T', content: 'body' } },
  { nome: 'tasks', crea: creaAttivita, leggi: leggiAttivita, aggiorna: aggiornaAttivita, elimina: eliminaAttivita, Errore: TaskStoreError, codiceNotFound: 'TASK_NOT_FOUND', campi: { title: 'T', description: 'body' } },
  { nome: 'memory', crea: creaMemoria, leggi: leggiMemoria, aggiorna: aggiornaMemoria, elimina: eliminaMemoria, Errore: MemoryStoreError, codiceNotFound: 'MEMORY_NOT_FOUND', campi: { title: 'T', content: 'body' } },
];

/** Un id vero uguale a quello che genera lo store (`randomUUID`) — per confermare che la cura non tocca il caso legittimo. */
function idDi(creato) {
  const voce = creato?.voce ?? creato; // memory torna `{voce, duplicato}`
  return voce.id;
}

const CATTIVI = ['../fuori', '..\\fuori', 'a/b', 'a\\b', '..', '.', '', 'a\0b', 'a:b'];

test('IDA-01 — la grammatica accetta un UUID e respinge ogni id che porta fuori dalla cartella', () => {
  assert.equal(idArchivioValido('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(idArchivioValido('lib-abc_1.txt'), true, 'punti, trattini e underscore in mezzo restano ammessi, come in Libreria');
  for (const id of CATTIVI) assert.equal(idArchivioValido(id), false, `«${id}» deve essere respinto`);
  assert.equal(idArchivioValido(42), false);
  assert.equal(idArchivioValido(null), false);
});

for (const s of STORE) {
  test(`IDA-${s.nome} — un id con traversal NON tocca un file fuori dalla cartella, e un id vero fa il giro intero`, async (t) => {
    const radice = mkdtempSync(join(tmpdir(), `talos-f01-${s.nome}-`));
    t.after(() => rimuoviCartellaDiProva(radice)); // classe A di BC-09: solo file scritti e chiusi qui, nessuna risorsa viva
    const store = join(radice, 'store');
    mkdirSync(store, { recursive: true });
    const sentinella = join(radice, 'sentinella.json');
    writeFileSync(sentinella, '{"fuori":"dallo store"}');

    /* AL CONTRARIO — il caso legittimo continua a funzionare: crea, leggi, aggiorna, elimina con un id vero. */
    const idVero = idDi(await s.crea({ cartella: store, ...s.campi }));
    assert.match(idVero, /^[a-f0-9-]{36}$/, 'lo store genera ancora un UUID');
    assert.ok(await s.leggi({ cartella: store, id: idVero }), 'un id vero si legge');
    await s.aggiorna({ cartella: store, id: idVero, title: 'T2' });
    await s.elimina({ cartella: store, id: idVero });
    assert.equal(await s.leggi({ cartella: store, id: idVero }), null, 'dopo elimina non c\'è più');

    /* IL BUCO CHIUSO — con un id che punta alla sentinella (un solo `..` dallo store): niente lettura, niente cancellazione. */
    const cattivo = join('..', 'sentinella'); // diventa `../sentinella` → `../sentinella.json` = la sentinella FUORI dallo store
    assert.equal(await s.leggi({ cartella: store, id: cattivo }), null, 'leggi non segue il traversal');
    let toccatoDaElimina = false;
    await s.elimina({ cartella: store, id: cattivo }, { rmFn: async () => { toccatoDaElimina = true; } });
    assert.equal(toccatoDaElimina, false, 'elimina non arriva mai al filesystem con un id fuori grammatica');
    await assert.rejects(
      () => s.aggiorna({ cartella: store, id: cattivo, ...s.campi }),
      (e) => e instanceof s.Errore && e.code === s.codiceNotFound,
      'aggiorna su un id fuori grammatica risponde «non trovato», non segue il traversal',
    );
    assert.equal(existsSync(sentinella), true, 'la sentinella FUORI dalla cartella è ancora lì');
    assert.equal(readFileSync(sentinella, 'utf8'), '{"fuori":"dallo store"}', 'e intatta');

    /* E ogni altra forma di id cattivo è respinta allo stesso modo. */
    for (const id of CATTIVI) {
      assert.equal(await s.leggi({ cartella: store, id }), null, `leggi(${JSON.stringify(id)}) deve essere «non c'è»`);
      let toccato = false;
      await s.elimina({ cartella: store, id }, { rmFn: async () => { toccato = true; } });
      assert.equal(toccato, false, `elimina(${JSON.stringify(id)}) non deve toccare il filesystem`);
    }
  });
}
