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

test('DOCTOR-NEGOZIO-01 (24/09) — diagnosi() dice come il negozio pubblica l’intestazione: link, ripiego exFAT, o non ancora noto', async () => {
  const base = { chiaveConfigurata: true, eseguiComandoSandboxatoFn: async () => ({ enforcement: 'desktop' }), spawnSyncFn: () => ({ status: 0 }) };
  const link = await diagnosi({ ...base, negozioSessioni: { modalitaIntestazione: 'link', cartella: 'C:/dati/store' } });
  assert.equal(link.negozioSessioni.modalitaIntestazione, 'link');
  assert.equal(link.negozioSessioni.cartella, 'C:/dati/store');
  assert.match(link.negozioSessioni.dettaglio, /hard link/); // K4a: la frase inglese è la riserva, la chiave dice la stessa cosa nelle due lingue
  assert.equal(link.negozioSessioni.dettaglioChiave, 'server.doctor.sessionStore.link');
  const ripiego = await diagnosi({ ...base, negozioSessioni: { modalitaIntestazione: 'senza-link' } });
  assert.equal(ripiego.negozioSessioni.modalitaIntestazione, 'senza-link');
  assert.match(ripiego.negozioSessioni.dettaglio, /exFAT/);
  assert.equal(ripiego.negozioSessioni.dettaglioChiave, 'server.doctor.sessionStore.noLink');
  assert.equal('cartella' in ripiego.negozioSessioni, false, 'senza cartella non si inventa un percorso');
  const ignoto = await diagnosi({ ...base, negozioSessioni: { modalitaIntestazione: null } });
  assert.equal(ignoto.negozioSessioni.modalitaIntestazione, null);
  assert.match(ignoto.negozioSessioni.dettaglio, /first write/);
  assert.equal(ignoto.negozioSessioni.dettaglioChiave, 'server.doctor.sessionStore.unknown');
  /* al contrario: un valore che non è fra i tre non passa per buono */
  const strano = await diagnosi({ ...base, negozioSessioni: { modalitaIntestazione: 'boh' } });
  assert.equal(strano.negozioSessioni.modalitaIntestazione, null);
  /* e senza il dato il Doctor non aggiunge la voce (i 4 controlli di sempre) */
  const senza = await diagnosi(base);
  assert.equal('negozioSessioni' in senza, false);
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
    dettaglio: 'No project folder has been set up in the allowed list.',
    dettaglioChiave: 'server.doctor.folders.none',
  });
  /* e con le cartelle: una chiave sola, il numero nei valori (l'interfaccia sceglie singolare o plurale) */
  const due = await diagnosi({ chiaveConfigurata: false, cartelleProgetto: [{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B' }], eseguiComandoSandboxatoFn: async () => ({ enforcement: 'none' }), spawnSyncFn: () => ({ status: 0 }) });
  assert.deepEqual([due.cartelleProgetto.dettaglio, due.cartelleProgetto.dettaglioChiave, due.cartelleProgetto.dettaglioParams], ['2 project folders available.', 'server.doctor.folders.available', { n: 2 }]);
  const una = await diagnosi({ chiaveConfigurata: false, cartelleProgetto: [{ id: 'a', nome: 'A' }], eseguiComandoSandboxatoFn: async () => ({ enforcement: 'none' }), spawnSyncFn: () => ({ status: 0 }) });
  assert.equal(una.cartelleProgetto.dettaglio, '1 project folder available.');
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
    ownerRuntime: { configurato: true, pronto: false, dettaglio: 'The agent runtime does not expose all the required features yet.' },
    catalogoTask: { disponibile: false, dettaglio: 'The preset tasks list is not available.' },
    eseguiComandoSandboxatoFn: async () => ({ enforcement: 'desktop' }),
    spawnSyncFn: () => ({ status: 0 }),
  });
  assert.deepEqual(risultato.ownerRuntime, { configurato: true, pronto: false, dettaglio: 'The agent runtime does not expose all the required features yet.' });
  assert.deepEqual(risultato.catalogoTask, { disponibile: false, dettaglio: 'The preset tasks list is not available.' });
  /* K4a: chi chiama può portare la chiave e i valori del suo dettaglio, e il Doctor li lascia passare */
  const conChiave = await diagnosi({
    chiaveConfigurata: true,
    ownerRuntime: { configurato: true, pronto: true, dettaglio: 'Agent runtime ready.', dettaglioChiave: 'server.doctor.runtime.ready' },
    eseguiComandoSandboxatoFn: async () => ({ enforcement: 'desktop' }), spawnSyncFn: () => ({ status: 0 }),
  });
  assert.deepEqual(conChiave.ownerRuntime, { configurato: true, pronto: true, dettaglio: 'Agent runtime ready.', dettaglioChiave: 'server.doctor.runtime.ready' });
  /* e al contrario: senza dettaglio dice il suo, con la sua chiave */
  const senzaDettaglio = await diagnosi({ chiaveConfigurata: true, ownerRuntime: { configurato: true, pronto: true }, catalogoTask: { disponibile: true }, eseguiComandoSandboxatoFn: async () => ({ enforcement: 'desktop' }), spawnSyncFn: () => ({ status: 0 }) });
  assert.deepEqual([senzaDettaglio.ownerRuntime.dettaglio, senzaDettaglio.ownerRuntime.dettaglioChiave], ['Runtime state not observed.', 'server.doctor.runtime.notObserved']);
  assert.deepEqual([senzaDettaglio.catalogoTask.dettaglio, senzaDettaglio.catalogoTask.dettaglioChiave], ['Preset tasks list not observed.', 'server.doctor.catalog.notObserved']);
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
  const pubblico = { source: 'duckduckgo', endpoint: '', readiness: 'pronta', fonti: [{ id: 'duckduckgo', label: 'DuckDuckGo (no key)', labelChiave: 'server.search.label.duckduckgo', keyless: true, keyConfigured: false }] };
  const con = await diagnosi({ chiaveConfigurata: true, ricercaWeb: pubblico, eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.equal(con.ricercaWeb.fonte, 'duckduckgo');
  assert.equal(con.ricercaWeb.pronta, true);
  assert.match(con.ricercaWeb.dettaglio, /no key needed/);
  assert.equal(con.ricercaWeb.dettaglioChiave, 'server.doctor.search.readyKeyless');
  assert.deepEqual([con.ricercaWeb.etichetta, con.ricercaWeb.etichettaChiave], ['DuckDuckGo (no key)', 'server.search.label.duckduckgo']);
  const spenta = await diagnosi({ chiaveConfigurata: true, ricercaWeb: { ...pubblico, source: 'off', readiness: 'spenta' }, eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.equal(spenta.ricercaWeb.pronta, false);
  assert.match(spenta.ricercaWeb.dettaglio, /Turned off/);
  assert.equal(spenta.ricercaWeb.dettaglioChiave, 'server.doctor.search.off');
  /* con la fonte spenta il nome è «Off», con la sua chiave; con una chiave che manca, il nome della fonte è un parametro che ha la sua chiave */
  const spentaDel = await diagnosi({ chiaveConfigurata: true, ricercaWeb: { source: 'off', endpoint: '', readiness: 'spenta', fonti: [] }, eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.deepEqual([spentaDel.ricercaWeb.etichetta, spentaDel.ricercaWeb.etichettaChiave], ['Off', 'server.doctor.search.offLabel']);
  const senzaChiave = await diagnosi({ chiaveConfigurata: true, ricercaWeb: { source: 'searxng', endpoint: '', readiness: 'indirizzo-mancante', fonti: [{ id: 'searxng', label: 'SearXNG (your instance)', labelChiave: 'server.search.label.searxng', keyless: false, keyConfigured: false }] }, eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.equal(senzaChiave.ricercaWeb.dettaglio, 'The address of the SearXNG (your instance) instance is still needed.');
  assert.deepEqual(senzaChiave.ricercaWeb.dettaglioParams, { label: 'SearXNG (your instance)', labelChiave: 'server.search.label.searxng' });
});

test('W0-04 — Doctor elenca i lab accesi come informazione (mai un problema), e «nessuno» quando la lista è vuota', async () => {
  const eseguiComandoSandboxatoFn = async () => ({ enforcement: 'none' });
  const spawnSyncFn = () => ({ status: 0 });
  const nessuno = await diagnosi({ chiaveConfigurata: true, labsAccesi: [], eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.deepEqual(nessuno.labs, { accesi: [], dettaglio: 'Labs on: none.', dettaglioChiave: 'server.doctor.labs.none' });
  const due = await diagnosi({ chiaveConfigurata: true, labsAccesi: ['electron-shell', 'remote-node'], eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.deepEqual(due.labs.accesi, ['electron-shell', 'remote-node']);
  assert.match(due.labs.dettaglio, /NOT_LIVE_VALIDATED/);
  assert.deepEqual([due.labs.dettaglioChiave, due.labs.dettaglioParams], ['server.doctor.labs.on', { list: 'electron-shell, remote-node' }]);
  const senza = await diagnosi({ chiaveConfigurata: true, eseguiComandoSandboxatoFn, spawnSyncFn });
  assert.equal('labs' in senza, false);
});

test('W0-01 — Doctor riporta le sessioni scartate col motivo, il conto per motivo e una frase che dice dove è finita la differenza', async () => {
  const eseguiComandoSandboxatoFn = async () => ({ enforcement: 'none' });
  const spawnSyncFn = () => ({ status: 0 });
  const esito = await diagnosi({
    chiaveConfigurata: true, eseguiComandoSandboxatoFn, spawnSyncFn,
    sessioniPersistenza: { corrotte: ['c1'], scartate: [{ sessionId: 'c1', motivo: 'corrotta' }, { sessionId: 'v1', motivo: 'vuota' }, { sessionId: 'v2', motivo: 'vuota' }, { sessionId: 'l1', motivo: 'lettura-fallita', dettaglio: 'EACCES' }], ultimaLettura: { ripristinate: 10, totali: 14 } },
  });
  assert.deepEqual(esito.sessioniPersistenza.perMotivo, { corrotta: 1, vuota: 2, 'lettura-fallita': 1 });
  assert.equal(esito.sessioniPersistenza.scartate.length, 4);
  assert.match(esito.sessioniPersistenza.dettaglio, /10 restored, 4 discarded out of 14: 1 corrotta, 2 vuota, 1 lettura-fallita/);
  assert.equal(esito.sessioniPersistenza.dettaglioChiave, 'server.doctor.sessions.restoredSome');
  assert.deepEqual(esito.sessioniPersistenza.dettaglioParams, { restored: 10, discarded: 4, total: 14, reasons: '1 corrotta, 2 vuota, 1 lettura-fallita' });
  const pulito = await diagnosi({ chiaveConfigurata: true, eseguiComandoSandboxatoFn, spawnSyncFn, sessioniPersistenza: { corrotte: [], ultimaLettura: { ripristinate: 3, totali: 3 } } });
  assert.deepEqual(pulito.sessioniPersistenza.scartate, []);
  assert.match(pulito.sessioniPersistenza.dettaglio, /none discarded/);
  assert.deepEqual([pulito.sessioniPersistenza.dettaglioChiave, pulito.sessioniPersistenza.dettaglioParams], ['server.doctor.sessions.restoredAll', { restored: 3, total: 3 }]);
});
