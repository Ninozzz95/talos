import assert from 'node:assert/strict';
import test from 'node:test';

import { creaGestoreWorkspaceWatcher } from '../src/workspace-watcher.mjs';
import { preparaEsecuzioneLibera } from '../src/custom-task.mjs';

test('Full access su radice volume non avvia un watcher ricorsivo', () => {
  let chiamate = 0;
  const chokidar = {
    watch() {
      chiamate += 1;
      throw new Error('la radice non deve arrivare a chokidar');
    },
  };
  const gestore = creaGestoreWorkspaceWatcher({ chokidar });
  const disiscrivi = gestore.guardaWorkspace('C:\\', () => {});
  assert.equal(chiamate, 0);
  assert.equal(gestore.quantiWatcherAttiviPerTest(), 0);
  assert.doesNotThrow(disiscrivi);
});

test('Full access su una cartella ordinaria mantiene il watcher', () => {
  let chiamate = 0;
  const watcher = {
    on() { return watcher; },
    close() {},
  };
  const gestore = creaGestoreWorkspaceWatcher({
    chokidar: { watch() { chiamate += 1; return watcher; } },
  });
  const disiscrivi = gestore.guardaWorkspace('C:\\workspace\\talos', () => {});
  assert.equal(chiamate, 1);
  assert.equal(gestore.quantiWatcherAttiviPerTest(), 1);
  disiscrivi();
  assert.equal(gestore.quantiWatcherAttiviPerTest(), 0);
});

test('il percorso Full access resta esplicito e non viene trasformato in allowlist', () => {
  const result = preparaEsecuzioneLibera([], {
    cartellaLibera: process.cwd(),
    consegna: 'controlla soltanto il file README',
  }, {
    realpathSyncFn: (value) => value,
    statSyncFn: () => ({ isDirectory: () => true }),
    accessSyncFn: () => undefined,
  });
  assert.equal(result.cartella, process.cwd());
  assert.equal(result.task.progetto, process.cwd().split(/[\\/]/u).pop());
});

