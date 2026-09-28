import assert from 'node:assert/strict';
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ETA_MINIMA_RESIDUO_DOCTOR_MS, ripulisciResiduiDoctor } from '../src/doctor.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * DESK-TEMP-1, 23/09/2026 — il Doctor toglie SOLO le sue cartelle vecchie, lasciate da un server
 * fermato mentre la prova era aperta. Misurato prima della cura: 2 cartelle `talos-doctor-*` restavano
 * in TEMP in alcuni giri di `server-workflow-wiring.test.mjs`.
 * Corsia SCRATCH, 24/09/2026 — adattato: la pulizia è diventata un caso di `ripulisciScratch`
 * (src/scratch.mjs), asincrona, e la cartella di prova del Doctor nasce sotto la radice dei temporanei.
 * Le quattro affermazioni sono le stesse di prima.
 */
test('DESK-TEMP-DOCTOR-01 — via le cartelle talos-doctor- vecchie; restano le recenti, quelle altrui e i file', async () => {
  const radice = cartellaDiProva('talos-doctor-gate-');
  const adesso = Date.now();
  const vecchio = (adesso - ETA_MINIMA_RESIDUO_DOCTOR_MS - 60_000) / 1000;
  const crea = (nome, { cartella = true, vecchia = true } = {}) => {
    const percorso = join(radice, nome);
    if (cartella) mkdirSync(percorso); else writeFileSync(percorso, 'x');
    if (vecchia) utimesSync(percorso, vecchio, vecchio);
    return percorso;
  };
  const residuo = crea('talos-doctor-ABC123');
  const recente = crea('talos-doctor-DEF456', { vecchia: false });
  const altrui = crea('talos-altro-GHI789');
  const file = crea('talos-doctor-file', { cartella: false });

  const tolte = await ripulisciResiduiDoctor({ cartella: radice, adesso });

  assert.deepEqual(tolte, ['talos-doctor-ABC123']);
  assert.equal(existsSync(residuo), false, 'la cartella vecchia del Doctor doveva sparire');
  assert.equal(existsSync(recente), true, 'un Doctor che gira adesso non si tocca');
  assert.equal(existsSync(altrui), true, 'le cartelle con un altro prefisso non sono nostre');
  assert.equal(existsSync(file), true, 'un file col nostro prefisso non è una cartella del Doctor');
});

test('DESK-TEMP-DOCTOR-02 — una TEMP illeggibile non inventa niente e non lancia', async () => {
  assert.deepEqual(await ripulisciResiduiDoctor({ cartella: join(cartellaDiProva('talos-doctor-vuota-'), 'non-esiste') }), []);
});
