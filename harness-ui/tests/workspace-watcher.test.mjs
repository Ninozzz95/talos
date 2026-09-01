import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaGestoreWorkspaceWatcher } from '../src/workspace-watcher.mjs';

// ⭐ Disco VERO, chokidar VERO — stesso principio di workspace-tree.test.mjs:
// un watcher non si prova bene con un mock, il suo intero scopo è
// reagire a eventi del filesystem reale. I tempi (attese fisse) sono
// intenzionalmente generosi: un timer di test troppo stretto sarebbe
// più fragile del codice che prova.
function radiceVera() {
  const radice = mkdtempSync(join(tmpdir(), 'talos-watch-test-'));
  mkdirSync(join(radice, '.git'));
  mkdirSync(join(radice, 'node_modules'));
  return radice;
}

test('⭐⭐⭐ un file nuovo genera un evento col suo percorso relativo, mai la scansione iniziale', async () => {
  const radice = radiceVera();
  writeFileSync(join(radice, 'esistente.txt'), 'x'); // PRIMA del watcher — ignoreInitial deve tacere su questo
  const { guardaWorkspace } = creaGestoreWorkspaceWatcher();
  const ricevuti = [];
  const stop = guardaWorkspace(radice, (percorsi) => ricevuti.push(percorsi));
  try {
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(ricevuti.length, 0, 'la scansione iniziale non deve generare eventi');
    writeFileSync(join(radice, 'nuovo.txt'), 'ciao');
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(ricevuti.length, 1);
    assert.deepEqual(ricevuti[0], ['nuovo.txt']);
  } finally {
    stop();
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ una raffica di scritture diventa UN solo evento (debounce), non uno per file', async () => {
  const radice = radiceVera();
  const { guardaWorkspace } = creaGestoreWorkspaceWatcher();
  const ricevuti = [];
  const stop = guardaWorkspace(radice, (percorsi) => ricevuti.push(percorsi));
  try {
    await new Promise((r) => setTimeout(r, 800));
    for (let i = 0; i < 5; i++) writeFileSync(join(radice, `raffica-${i}.txt`), 'x');
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(ricevuti.length, 1, 'una raffica deve coalescere in UN evento');
    assert.equal(ricevuti[0].length, 5);
  } finally {
    stop();
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — .git e node_modules non generano MAI un evento, anche quando cambiano davvero', async () => {
  const radice = radiceVera();
  const { guardaWorkspace } = creaGestoreWorkspaceWatcher();
  const ricevuti = [];
  const stop = guardaWorkspace(radice, (percorsi) => ricevuti.push(percorsi));
  try {
    await new Promise((r) => setTimeout(r, 800));
    writeFileSync(join(radice, '.git', 'HEAD'), 'ref: refs/heads/master');
    writeFileSync(join(radice, 'node_modules', 'pacchetto.js'), 'x');
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(ricevuti.length, 0);
  } finally {
    stop();
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — lo stato interno di Harness non riattiva il watcher e non crea un ciclo di eventi', async () => {
  const radice = radiceVera();
  mkdirSync(join(radice, '.sessions-store'));
  mkdirSync(join(radice, '.automations'));
  mkdirSync(join(radice, '.generated-images'));
  const { guardaWorkspace } = creaGestoreWorkspaceWatcher();
  const ricevuti = [];
  const stop = guardaWorkspace(radice, (percorsi) => ricevuti.push(percorsi));
  try {
    await new Promise((r) => setTimeout(r, 800));
    writeFileSync(join(radice, '.sessions-store', 'session.jsonl'), '{}');
    writeFileSync(join(radice, '.automations', 'job.json'), '{}');
    writeFileSync(join(radice, '.generated-images', 'image.png'), 'x');
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(ricevuti.length, 0, 'i file interni non devono diventare eventi workspace');
  } finally {
    stop();
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ due sottoscrittori sulla stessa cartella condividono UN watcher, entrambi ricevono lo stesso evento', async () => {
  const radice = radiceVera();
  const { guardaWorkspace, quantiWatcherAttiviPerTest } = creaGestoreWorkspaceWatcher();
  const ricevuti1 = [];
  const ricevuti2 = [];
  const stop1 = guardaWorkspace(radice, (p) => ricevuti1.push(p));
  const stop2 = guardaWorkspace(radice, (p) => ricevuti2.push(p));
  try {
    assert.equal(quantiWatcherAttiviPerTest(), 1, 'deduplicato — un solo watcher per cartella');
    await new Promise((r) => setTimeout(r, 800));
    writeFileSync(join(radice, 'condiviso.txt'), 'x');
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(ricevuti1.length, 1);
    assert.equal(ricevuti2.length, 1);
  } finally {
    stop1();
    stop2();
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — il watcher si chiude SOLO quando l\'ULTIMO sottoscrittore si disiscrive, non prima', async () => {
  const radice = radiceVera();
  const { guardaWorkspace, quantiWatcherAttiviPerTest } = creaGestoreWorkspaceWatcher();
  const stop1 = guardaWorkspace(radice, () => {});
  const stop2 = guardaWorkspace(radice, () => {});
  try {
    stop1();
    assert.equal(quantiWatcherAttiviPerTest(), 1, 'un sottoscrittore in meno non chiude il watcher se un altro resta');
    stop2();
    assert.equal(quantiWatcherAttiviPerTest(), 0, 'l\'ultimo unsubscribe chiude davvero il watcher');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

/*
 * ⛔⛔⛔ 28/8, trovato dal vivo (screenshot/CDP, non da un test — la
 * causa vera del "il browser non vede mai i cambiamenti esterni" dopo
 * ore di sessioni di prova sulla stessa cartella): un `for...of` senza
 * try/catch abortiva l'INTERO giro al primo sottoscrittore che lancia
 * — quelli iscritti DOPO (ordine di iscrizione = sessioni più recenti
 * sulla stessa cartella) non venivano mai notificati. Con `guardati`
 * come singleton di modulo che sopravvive a intere sessioni di test
 * finché il processo non riavvia, un vecchio sottoscrittore rotto
 * blocca silenziosamente ogni sessione nuova sulla stessa cartella.
 */
test('⛔⛔⛔ AL CONTRARIO — un sottoscrittore che lancia non blocca gli ALTRI, iscritti prima o dopo di lui', async () => {
  const radice = radiceVera();
  const { guardaWorkspace } = creaGestoreWorkspaceWatcher();
  const ricevutiPrima = [];
  const ricevutiDopo = [];
  const stopPrima = guardaWorkspace(radice, (p) => ricevutiPrima.push(p));
  const stopRotto = guardaWorkspace(radice, () => { throw new Error('sottoscrittore rotto, apposta'); });
  const stopDopo = guardaWorkspace(radice, (p) => ricevutiDopo.push(p));
  try {
    await new Promise((r) => setTimeout(r, 800));
    writeFileSync(join(radice, 'nuovo.txt'), 'x');
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(ricevutiPrima.length, 1, 'il sottoscrittore PRIMA di quello rotto riceve comunque l\'evento');
    assert.equal(ricevutiDopo.length, 1, 'il sottoscrittore DOPO quello rotto riceve comunque l\'evento — questo è il bug reale trovato');
  } finally {
    stopPrima();
    stopRotto();
    stopDopo();
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ una cartella inesistente non lancia — degrada a "nessun refresh automatico"', () => {
  const { guardaWorkspace } = creaGestoreWorkspaceWatcher();
  assert.doesNotThrow(() => {
    const stop = guardaWorkspace('C:\\questa\\cartella\\non\\esiste\\davvero\\mai', () => {});
    stop();
  });
});
