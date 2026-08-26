import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { TaskCatalogError, listaTaskDisponibili, preparaEsecuzione } from '../src/task-catalog.mjs';

// ⛔ Nessun mock di preparaCopia qui: e' un cpSync locale, zero rete, zero
// comando eseguito (non si chiama mai "prova"/npm test in questi test) - lo
// stesso principio di rischio-zero gia' usato per onScrittura in
// talosHarness.test.mjs. L'allowlist e il ciclo checkout->pulizia si provano
// SUL VERO corpus, non su un doppio.

test('listaTaskDisponibili torna un elenco LEGGERO: mai la consegna intera', () => {
  const elenco = listaTaskDisponibili();
  assert.ok(elenco.length > 0, 'il corpus progetti non deve essere vuoto');
  for (const voce of elenco) {
    assert.equal(typeof voce.id, 'string');
    assert.equal(typeof voce.consegnaCorta, 'string');
    assert.ok(!('consegna' in voce), 'la consegna lunga non appartiene a un menu');
  }
});

test('⭐ preparaEsecuzione su un id vero produce una cartella reale, con la copia dentro', () => {
  const primo = listaTaskDisponibili()[0];
  const { cartella, comandoProva, task, pulisci } = preparaEsecuzione(primo.id);

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
  const primo = listaTaskDisponibili()[0];
  const { cartella, pulisci } = preparaEsecuzione(primo.id);
  assert.ok(existsSync(cartella));
  pulisci();
  assert.ok(!existsSync(cartella), 'dopo pulisci() non deve restare niente');
});

test('⛔⛔ ALLOWLIST: un id inventato è rifiutato, mai una cartella a caso', () => {
  assert.throws(
    () => preparaEsecuzione('questo-task-non-esiste-di-sicuro-24-8'),
    (errore) => errore instanceof TaskCatalogError && errore.code === 'TASK_NOT_ALLOWED',
  );
});

test('⛔ e il VERSO CONTRARIO: un id che è quasi giusto (prefisso/suffisso di uno vero) non fa match parziale', () => {
  const vero = listaTaskDisponibili()[0].id;
  for (const quasi of [`${vero}-extra`, vero.slice(0, -1), `${vero} `, `x${vero}`]) {
    assert.throws(
      () => preparaEsecuzione(quasi),
      (errore) => errore instanceof TaskCatalogError && errore.code === 'TASK_NOT_ALLOWED',
      `"${quasi}" non deve corrispondere a "${vero}"`,
    );
  }
});

test('⛔ input non-stringa o vuoto è QUERY_INVALID, non un crash e non un match a caso', () => {
  for (const input of ['', undefined, null, 42, {}]) {
    assert.throws(
      () => preparaEsecuzione(input),
      (errore) => errore instanceof TaskCatalogError && errore.code === 'QUERY_INVALID',
      `input ${JSON.stringify(input)} deve essere rifiutato esplicitamente`,
    );
  }
});
