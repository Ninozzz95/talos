/*
 * Revisione Z (04/11/2026), D7 opzione C: una domanda che arriva DOPO che un salvataggio ha finito di scrivere non deve unirsi a una
 * scansione partita PRIMA della scrittura. Sulla candidata b13064330 `legamiInVolo` la univa (la chiave è solo la cartella) e la domanda
 * rispondeva `null`: il PC memorizza quel `null` per la pagina e il tasto restava «Salva in Libreria» per un blocco già salvato (rossa 2/2).
 * Cura: `dimenticaScansione(cartella)` dopo ogni scrittura riuscita, dentro la fila (`src/blocchi/in-libreria.mjs`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { salvaVoce } from '../src/library-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

for (const porta of ['clic', 'artifact_create']) {
  test(`REVZ-D7-01 (${porta}) — a question asked after a save has finished sees that save, even with an older scan still in flight`, async (t) => {
    const { voceDelBlocco, salvaBloccoInLibreria, creaVoceDiBlocco } = await import('../src/blocchi/in-libreria.mjs');
    const dati = mkdtempSync(join(tmpdir(), 'talos-revz-d7-'));
    t.after(() => rimuoviCartellaDiProva(dati));
    const tabella = (await readFile(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8')).trimEnd();
    const altra = await salvaVoce({ cartella: dati, nome: 'altra.txt', mediaType: 'text/plain', origine: 'generated', testo: 'x' });
    let apri;
    const cancello = new Promise((r) => { apri = r; });
    let chiuso = true;
    const deps = { readdirFn: readdir, readFileFn: async (percorso, ...resto) => {
      if (chiuso && /meta\.json$/u.test(String(percorso)) && String(percorso).includes(altra)) { chiuso = false; await cancello; }
      return readFile(percorso, ...resto);
    } };
    /* another block of the page asks first: its scan stays open on the gate (a slow disk, 3000 entries) */
    const vecchia = voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'altro' }, deps);
    await pausa(10);
    /* the save of block «vendite» finishes completely */
    const salvata = porta === 'clic'
      ? await salvaBloccoInLibreria({ cartella: dati, testo: tabella, sessionId: 'A' })
      : await creaVoceDiBlocco({ cartella: dati, testo: tabella, titolo: 'Vendite', sessionId: 'A' });
    /* only now the PC draws «vendite» and asks */
    const nuova = voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, deps);
    await pausa(10);
    apri();
    const [, risposta] = await Promise.all([vecchia, nuova]);
    assert.equal(risposta?.id ?? null, salvata.id, 'the question after the save must see the saved entry');
  });
}

/*
 * REVZ-D7-02: the scan is forgotten AFTER the write, not before. If it were forgotten before the write, a question asked WHILE the
 * entry is being written would open a new scan that misses it (its `meta.json` is not on disk yet), and a question asked after the
 * save has finished would join that scan and answer `null` again: the same lie, with a narrower window.
 */
for (const porta of ['clic', 'artifact_create']) {
  test(`REVZ-D7-02 (${porta}) — the in-flight scan is forgotten after the write, so a scan opened during the write is not reused`, async (t) => {
    const { voceDelBlocco, salvaBloccoInLibreria, creaVoceDiBlocco } = await import('../src/blocchi/in-libreria.mjs');
    const dati = mkdtempSync(join(tmpdir(), 'talos-revz-d7b-'));
    t.after(() => rimuoviCartellaDiProva(dati));
    const tabella = (await readFile(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8')).trimEnd();
    const altra = await salvaVoce({ cartella: dati, nome: 'altra.txt', mediaType: 'text/plain', origine: 'generated', testo: 'x' });
    /* two gates on the other entry's meta.json: the first scan and the second one stay open until the end */
    const cancelli = [];
    let aperti = false;
    const apriTutti = () => { aperti = true; for (const c of cancelli) c.apri(); };
    let tenute = 0;
    const deps = { readdirFn: readdir, readFileFn: async (percorso, ...resto) => {
      if (!aperti && tenute < 2 && /meta\.json$/u.test(String(percorso)) && String(percorso).includes(altra)) {
        tenute += 1;
        let apri;
        const cancello = new Promise((r) => { apri = r; });
        cancelli.push({ apri });
        await cancello;
      }
      return readFile(percorso, ...resto);
    } };
    /* the save stops just before writing the entry's meta.json (its folder already exists) */
    let riprendi;
    const ripresa = new Promise((r) => { riprendi = r; });
    let fermo;
    const fermato = new Promise((r) => { fermo = r; });
    let fermata = false;
    const writeFileFn = async (percorso, ...resto) => {
      if (!fermata && /meta\.json$/u.test(String(percorso))) { fermata = true; fermo(); await ripresa; }
      return writeFile(percorso, ...resto);
    };
    const vecchia = voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'altro' }, deps);
    await pausa(10);
    const salvataggio = porta === 'clic'
      ? salvaBloccoInLibreria({ cartella: dati, testo: tabella, sessionId: 'A' }, { writeFileFn })
      : creaVoceDiBlocco({ cartella: dati, testo: tabella, titolo: 'Vendite', sessionId: 'A' },
        { salvaVoceFn: (voce) => salvaVoce(voce, { writeFileFn }) });
    await fermato;
    /* a question asked during the write (truly concurrent: any answer is fair) */
    const durante = voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, deps);
    await pausa(20);
    riprendi();
    const salvata = await salvataggio;
    /* a question asked after the save has finished */
    const dopo = voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, deps);
    await pausa(10);
    apriTutti();
    const [, , risposta] = await Promise.all([vecchia, durante, dopo]);
    assert.equal(risposta?.id ?? null, salvata.id, 'the question after the save must see the saved entry');
  });
}
