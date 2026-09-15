import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * BC-09 — la prova dell'aiuto che ritenta, presa NEI DUE VERSI.
 *
 * ⛔ Perche' e' scritta cosi'. La prima versione di questo file assumeva che «su Windows un file
 * aperto blocca la rimozione»: MISURATO il 13/09/2026 su Windows 11 / Node v24.18.0, e' FALSO —
 * con un handle `openSync(file,'r+')` aperto la cartella si cancella senza un errore. Quelle due
 * prove erano ROSSE (lanciate davvero: 2 fallite su 4), e la premessa era inventata. Le premesse
 * qui sotto sono le uniche che su questa macchina producono l'errore, misurate PRIMA di scrivere:
 *   · un PROCESSO col cwd dentro la cartella  → `rmSync` EPERM (8 giri su 8), `rm` EBUSY;
 *   · uno SCRITTORE concorrente               → ENOTEMPTY, lo stesso codice che ha ucciso il tag.
 *
 * ⛔ Seconda asimmetria misurata: `rmSync` NON ritenta su EPERM (fallisce in 1 ms, 8 su 8, anche
 * con `maxRetries: 20`), mentre `rm` asincrona ritenta e recupera (303 ms). Percio' il verso «i
 * ritentativi recuperano» si prova sulla via ASINCRONA e il verso «l'errore arriva al chiamante»
 * sulla via SINCRONA: ognuna col caso che sa produrre davvero.
 *
 * Sei prove: quattro sul CONTRATTO, con la primitiva di rimozione iniettata (deterministiche, su
 * ogni piattaforma), e due di INTEGRAZIONE sul disco vero, che esistono per dimostrare che la
 * premessa non e' finta.
 */

// ---------------------------------------------------------------- contratto (primitiva iniettata)

function primitivaChe(...esiti) {
  const chiamate = [];
  return {
    chiamate,
    rimuovi: (cartella, opzioni) => {
      chiamate.push({ cartella, opzioni });
      const esito = esiti[chiamate.length - 1];
      if (esito instanceof Error) throw esito;
      return esito;
    },
  };
}
const errore = (code) => Object.assign(new Error('finto ' + code), { code });

function conAvvisiRaccolti(fn) {
  const avvisi = [];
  const ascolta = (a) => avvisi.push(a);
  process.on('warning', ascolta);
  return Promise.resolve(fn(avvisi)).finally(() => process.off('warning', ascolta));
}

test('BC09-1 — cartella pulita: UN solo tentativo, senza opzioni di ritentativo e senza avvisi', async () => {
  await conAvvisiRaccolti(async (avvisi) => {
    const p = primitivaChe(undefined);
    rimuoviCartellaDiProva('/finta/pulita', { rimuovi: p.rimuovi });
    await new Promise((r) => setImmediate(r));
    assert.equal(p.chiamate.length, 1, 'sul caso normale non deve costare un tentativo in piu');
    assert.deepEqual(p.chiamate[0].opzioni, { recursive: true, force: true });
    assert.deepEqual(avvisi.filter((a) => a.name === 'RimozioneDiProvaRitentata'), [], 'niente avvisi quando non ci sono state corse');
  });
});

test('BC09-2 — codice della corsa al primo colpo: si ritenta CON le opzioni ufficiali e si lascia un AVVISO', async () => {
  await conAvvisiRaccolti(async (avvisi) => {
    const p = primitivaChe(errore('ENOTEMPTY'), undefined);
    rimuoviCartellaDiProva('/finta/in-corsa', { rimuovi: p.rimuovi });
    await new Promise((r) => setImmediate(r));
    assert.equal(p.chiamate.length, 2, 'il secondo tentativo E la cura: senza, non ce n’e nessuna');
    assert.deepEqual(p.chiamate[1].opzioni, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    const avviso = avvisi.find((a) => a.name === 'RimozioneDiProvaRitentata');
    assert.ok(avviso, '⛔ il ritentativo deve LASCIARE TRACCIA: senza avviso, un handle dimenticato dal prodotto diventa invisibile');
    assert.match(avviso.message, /ENOTEMPTY/);
    assert.match(avviso.message, /in-corsa/, 'l’avviso deve dire QUALE cartella, non solo che e successo');
  });
});

test('BC09-3, VERSO CHE DEVE FALLIRE — un codice ESTRANEO alla corsa non si ritenta e non si maschera', async () => {
  await conAvvisiRaccolti(async (avvisi) => {
    const p = primitivaChe(errore('EACCES'), undefined);
    assert.throws(() => rimuoviCartellaDiProva('/finta/permessi', { rimuovi: p.rimuovi }), { code: 'EACCES' });
    await new Promise((r) => setImmediate(r));
    assert.equal(p.chiamate.length, 1, '⛔ se ritentasse anche qui, l’aiuto starebbe curando guasti che non sono corse');
    assert.deepEqual(avvisi.filter((a) => a.name === 'RimozioneDiProvaRitentata'), []);
  });
});

test('BC09-4, VERSO CHE DEVE FALLIRE — se anche il ritentativo fallisce, l’errore ARRIVA al chiamante', async () => {
  await conAvvisiRaccolti(async (avvisi) => {
    const p = primitivaChe(errore('ENOTEMPTY'), errore('ENOTEMPTY'));
    assert.throws(() => rimuoviCartellaDiProva('/finta/mai', { rimuovi: p.rimuovi }), { code: 'ENOTEMPTY' });
    const q = primitivaChe(errore('EBUSY'), errore('EBUSY'));
    await assert.rejects(() => rimuoviCartellaDiProvaAttesa('/finta/mai', { rimuovi: q.rimuovi }), { code: 'EBUSY' });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(avvisi.filter((a) => a.name === 'RimozioneDiProvaRitentata'), [], '⛔ un fallimento non si annuncia come recupero riuscito');
  });
});

// ------------------------------------------------- integrazione: la premessa esiste sul disco vero

const SOLO_WINDOWS = process.platform === 'win32'
  ? false
  : 'la premessa misurata (un processo col cwd dentro la cartella, EPERM/EBUSY) e un comportamento di Windows: su POSIX la cartella si cancella lo stesso e la prova non misurerebbe niente';

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

function cartellaTenutaDaUnProcesso() {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-bc09-'));
  const dentro = join(cartella, 'dentro');
  mkdirSync(dentro);
  writeFileSync(join(dentro, 'registro.jsonl'), '{"tipo":"riga"}\n');
  const figlio = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { cwd: dentro, stdio: 'ignore' });
  return { cartella, figlio };
}

test('BC09-5 INTEGRAZIONE, VERSO CHE DEVE FALLIRE — una cartella tenuta da un processo VIVO non viene ingoiata', { skip: SOLO_WINDOWS }, async () => {
  const { cartella, figlio } = cartellaTenutaDaUnProcesso();
  try {
    await attesa(250); // il figlio ha davvero preso la cartella
    assert.throws(
      () => rimuoviCartellaDiProva(cartella),
      (e) => { assert.ok(['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(e.code), 'codice inatteso: ' + e.code); return true; },
      '⛔ se questa prova diventa verde senza eccezione, o l’aiuto sta nascondendo le risorse non chiuse, o la premessa e sparita da sotto e va rimisurata',
    );
    assert.equal(existsSync(cartella), true, 'la cartella deve essere ancora li: nessuna finzione di pulizia');
  } finally {
    figlio.kill();
    await attesa(200);
    rmSync(cartella, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  }
});

test('BC09-6 INTEGRAZIONE — un processo che se ne va DURANTE i ritentativi: la via asincrona recupera e lo dice', { skip: SOLO_WINDOWS }, async () => {
  const { cartella, figlio } = cartellaTenutaDaUnProcesso();
  await attesa(250);
  await conAvvisiRaccolti(async (avvisi) => {
    setTimeout(() => figlio.kill(), 150); // se ne va DENTRO la finestra dei ritentativi
    await rimuoviCartellaDiProvaAttesa(cartella);
    assert.equal(existsSync(cartella), false, 'la cartella deve essere sparita');
    await new Promise((r) => setImmediate(r));
    assert.ok(
      avvisi.some((a) => a.name === 'RimozioneDiProvaRitentata'),
      '⛔ il recupero deve essere ANNUNCIATO: se qui non c’e avviso, o il primo tentativo non ha mai fallito (premessa sparita) o l’aiuto tace',
    );
  });
  figlio.kill();
});
