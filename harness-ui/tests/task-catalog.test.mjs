import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { TaskCatalogError, listaTaskDisponibili, preparaEsecuzione } from '../src/task-catalog.mjs';

const TASK = Object.freeze({
  id: 'sconto-a-scaglioni', progetto: 'listino', difficolta: 1,
  consegnaCorta: 'Aggiungi una funzione di sconto.', comando: 'npm test',
});

const provider = Object.freeze({
  list: () => [TASK],
  prepare: (taskId) => {
    if (taskId !== TASK.id) throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
    const cartella = mkdtempSync(join(tmpdir(), 'talos-task-provider-'));
    writeFileSync(join(cartella, 'README.md'), 'fixture posseduta dal provider di test');
    return { cartella, comandoProva: TASK.comando, task: TASK, pulisci: () => rmSync(cartella, { recursive: true, force: true }) };
  },
});

// ⛔ Nessun mock di preparaCopia qui: e' un cpSync locale, zero rete, zero
// comando eseguito (non si chiama mai "prova"/npm test in questi test) - lo
// stesso principio di rischio-zero gia' usato per onScrittura in
// talosHarness.test.mjs. L'allowlist e il ciclo checkout->pulizia si provano
// SUL VERO corpus, non su un doppio.

test('listaTaskDisponibili torna un elenco LEGGERO: mai la consegna intera', () => {
  const elenco = listaTaskDisponibili(provider);
  assert.ok(elenco.length > 0, 'il corpus progetti non deve essere vuoto');
  for (const voce of elenco) {
    assert.equal(typeof voce.id, 'string');
    assert.equal(typeof voce.consegnaCorta, 'string');
    assert.ok(!('consegna' in voce), 'la consegna lunga non appartiene a un menu');
  }
});

test('⭐ preparaEsecuzione su un id vero produce una cartella reale, con la copia dentro', () => {
  const primo = listaTaskDisponibili(provider)[0];
  const { cartella, comandoProva, task, pulisci } = preparaEsecuzione(primo.id, provider);

  try {
    assert.ok(existsSync(cartella), 'la cartella deve esistere davvero sul disco');
    assert.ok(readdirSync(cartella).length > 0, 'e non deve essere vuota: e la copia del progetto');
    assert.equal(task.id, primo.id);
    assert.equal(typeof comandoProva, 'string');
    assert.ok(comandoProva.length > 0);
  } finally {
    pulisci();
  }
});

test('⭐⭐ pulisci() rimuove davvero la cartella usa-e-getta', () => {
  const primo = listaTaskDisponibili(provider)[0];
  const { cartella, pulisci } = preparaEsecuzione(primo.id, provider);
  assert.ok(existsSync(cartella));
  pulisci();
  assert.ok(!existsSync(cartella), 'dopo pulisci() non deve restare niente');
});

test('⛔⛔ ALLOWLIST: un id inventato è rifiutato, mai una cartella a caso', () => {
  assert.throws(
      () => preparaEsecuzione('questo-task-non-esiste-di-sicuro-24-8', provider),
    (errore) => errore instanceof TaskCatalogError && errore.code === 'TASK_NOT_ALLOWED',
  );
});

test('⛔ e il VERSO CONTRARIO: un id che è quasi giusto (prefisso/suffisso di uno vero) non fa match parziale', () => {
  const vero = listaTaskDisponibili(provider)[0].id;
  for (const quasi of [`${vero}-extra`, vero.slice(0, -1), `${vero} `, `x${vero}`]) {
    assert.throws(
      () => preparaEsecuzione(quasi, provider),
      (errore) => errore instanceof TaskCatalogError && errore.code === 'TASK_NOT_ALLOWED',
      `"${quasi}" non deve corrispondere a "${vero}"`,
    );
  }
});

test('⛔ input non-stringa o vuoto è QUERY_INVALID, non un crash e non un match a caso', () => {
  for (const input of ['', undefined, null, 42, {}]) {
    assert.throws(
      () => preparaEsecuzione(input, provider),
      (errore) => errore instanceof TaskCatalogError && errore.code === 'QUERY_INVALID',
      `input ${JSON.stringify(input)} deve essere rifiutato esplicitamente`,
    );
  }
});

test('senza provider il catalogo è indisponibile, non sostituito da fixture', () => {
  assert.throws(() => listaTaskDisponibili(), (error) => error instanceof TaskCatalogError && error.code === 'TASK_CATALOG_UNAVAILABLE');
  assert.throws(() => preparaEsecuzione(TASK.id), (error) => error instanceof TaskCatalogError && error.code === 'TASK_CATALOG_UNAVAILABLE');
});
