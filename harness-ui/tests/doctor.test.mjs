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

test('Doctor segnala runtime agente e catalogo task senza confondere processo vivo e prontezza', async () => {
  const risultato = await diagnosi({
    chiaveConfigurata: true,
    ownerRuntime: { configurato: true, pronto: false, dettaglio: 'Il runtime agente non espone ancora tutte le funzioni richieste.' },
    catalogoTask: { disponibile: false, dettaglio: 'L’elenco delle attività predefinite non è disponibile.' },
    eseguiComandoSandboxatoFn: async () => ({ enforcement: 'desktop' }),
    spawnSyncFn: () => ({ status: 0 }),
  });
  assert.deepEqual(risultato.ownerRuntime, { configurato: true, pronto: false, dettaglio: 'Il runtime agente non espone ancora tutte le funzioni richieste.' });
  assert.deepEqual(risultato.catalogoTask, { disponibile: false, dettaglio: 'L’elenco delle attività predefinite non è disponibile.' });
});

/*
 * ⭐ 04/9 — R-03, la fonte della ricerca web nel Doctor: stato pubblico
 * (fonte, prontezza), mai una chiave; assente se non passata (i test sopra
 * con deepEqual restano validi).
 */
test('ricerca web: Doctor riporta fonte e prontezza dal listPublic dello store, e nulla se non gliela si passa', async () => {
  const eseguiComandoSandboxatoFn = async () => ({ enforcement: 'none' });
  const spawnSyncFn = () => ({ status: 0 });
  const senza = await diagnosi({ chiaveConfigurata: true, eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.equal('ricercaWeb' in senza, false);
  const pubblico = { source: 'duckduckgo', endpoint: '', readiness: 'pronta', fonti: [{ id: 'duckduckgo', label: 'DuckDuckGo (senza chiave)', keyless: true, keyConfigured: false }] };
  const con = await diagnosi({ chiaveConfigurata: true, ricercaWeb: pubblico, eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.equal(con.ricercaWeb.fonte, 'duckduckgo');
  assert.equal(con.ricercaWeb.pronta, true);
  assert.match(con.ricercaWeb.dettaglio, /senza chiave/);
  const spenta = await diagnosi({ chiaveConfigurata: true, ricercaWeb: { ...pubblico, source: 'off', readiness: 'spenta' }, eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.equal(spenta.ricercaWeb.pronta, false);
  assert.match(spenta.ricercaWeb.dettaglio, /Spenta/);
});
