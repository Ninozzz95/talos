import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { diagnosi } from '../src/doctor.mjs';

// ⛔ Mai un vero WSL2/git in questi test — stesso principio di sempre:
// eseguiComandoSandboxatoFn/spawnSyncFn interamente controllati dal test.

test('⭐ diagnosi() riporta i 4 controlli, con lo shell.enforcement DAVVERO ricevuto da eseguiComandoSandboxato', async () => {
  const risultato = await diagnosi({
    chiaveConfigurata: true,
    eseguiComandoSandboxatoFn: async () => ({ codice: 0, testo: 'ok', enforcement: 'wsl2' }),
    spawnSyncFn: () => ({ status: 0 }),
  });
  assert.deepEqual(risultato, { chiaveApi: true, shell: 'wsl2', git: true, naviga: true });
});

test('⭐ diagnosi() aggiunge il controllo cartelle solo quando riceve la configurazione reale', async () => {
  const risultato = await diagnosi({
    chiaveConfigurata: false,
    cartelleProgetto: [],
    eseguiComandoSandboxatoFn: async () => ({ enforcement: 'none' }),
    spawnSyncFn: () => ({ status: 0 }),
  });
  assert.deepEqual(risultato.cartelleProgetto, {
    disponibili: false,
    conteggio: 0,
    dettaglio: 'Nessuna cartella di progetto è stata configurata nell’elenco consentito.',
  });
});

test('⛔ e AL CONTRARIO: chiave assente, shell "none", git non installato — nessuno di questi si finge presente', async () => {
  const risultato = await diagnosi({
    chiaveConfigurata: false,
    eseguiComandoSandboxatoFn: async () => ({ codice: 0, testo: 'ok', enforcement: 'none' }),
    spawnSyncFn: () => { throw new Error('git non trovato'); },
  });
  assert.deepEqual(risultato, { chiaveApi: false, shell: 'none', git: false, naviga: true });
});

test('⭐⭐ la cartella usa-e-getta del comando diagnostico viene DAVVERO ripulita, anche se eseguiComandoSandboxatoFn lancia', async () => {
  let cartellaVista;
  await assert.rejects(diagnosi({
    chiaveConfigurata: true,
    eseguiComandoSandboxatoFn: async (comando, cartella) => { cartellaVista = cartella; throw new Error('boom'); },
    spawnSyncFn: () => ({ status: 0 }),
  }));
  assert.ok(cartellaVista, 'il comando deve aver ricevuto una cartella');
  assert.equal(existsSync(cartellaVista), false, 'ripulita anche sul percorso di errore, non solo su quello felice');
});

test('git: spawnSync che torna un status diverso da 0 conta come NON disponibile', async () => {
  const risultato = await diagnosi({
    chiaveConfigurata: true,
    eseguiComandoSandboxatoFn: async () => ({ codice: 0, testo: 'ok', enforcement: 'none' }),
    spawnSyncFn: () => ({ status: 1 }),
  });
  assert.equal(risultato.git, false);
});

test('provider: Doctor mostra solo stato pubblico e disponibilità del portachiavi', async () => {
  const risultato = await diagnosi({
    chiaveConfigurata: true,
    providerStoreAvailable: true,
    providerRows: [{ id: 'openrouter', label: 'OpenRouter', keyConfigured: true }],
    eseguiComandoSandboxatoFn: async () => ({ enforcement: 'wsl2' }),
    spawnSyncFn: () => ({ status: 0 }),
  });
  assert.deepEqual(risultato.providers, { storeAvailable: true, items: [{ id: 'openrouter', label: 'OpenRouter', keyConfigured: true }] });
  assert.doesNotMatch(JSON.stringify(risultato), /secret|sk-/i);
});
