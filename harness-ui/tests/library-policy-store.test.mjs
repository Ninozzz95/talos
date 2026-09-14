import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CARTELLA_LIBRERIA } from '../src/library-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import {
  LibraryPolicyConflictError,
  LibraryPolicyError,
  MODALITA_CONOSCIUTE,
  MODALITA_SUPPORTATE,
  creaRicevutaPolitica,
  creaRicevutePolitica,
  leggiPolitica,
  ricordaRicevutaPolitica,
  scriviPolitica,
} from '../src/library-policy-store.mjs';

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-library-policy-'));
}

test('⭐⭐⭐ leggiPolitica: nessun policy.json — il default onesto (abilitata, agentic_on_demand_v1, nessun override)', async () => {
  const cartella = cartellaVera();
  try {
    const politica = await leggiPolitica({ cartella });
    assert.deepEqual(politica, { revision: 0, enabled: true, mode: 'agentic_on_demand_v1', includedFileIds: [], excludedFileIds: [] });
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐⭐ scriviPolitica + leggiPolitica: la revisione avanza, il contenuto torna quello scritto', async () => {
  const cartella = cartellaVera();
  try {
    const scritta = await scriviPolitica({ cartella, valore: { enabled: false }, revisioneAttesa: 0 });
    assert.equal(scritta.revision, 1);
    assert.equal(scritta.enabled, false);
    const riletta = await leggiPolitica({ cartella });
    assert.equal(riletta.revision, 1);
    assert.equal(riletta.enabled, false);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ AL CONTRARIO — scriviPolitica: una revisioneAttesa sbagliata lancia LibraryPolicyConflictError, MAI una scrittura silenziosa', async () => {
  const cartella = cartellaVera();
  try {
    await scriviPolitica({ cartella, valore: { enabled: false }, revisioneAttesa: 0 });
    await assert.rejects(
      () => scriviPolitica({ cartella, valore: { enabled: true }, revisioneAttesa: 0 }), // stale — la vera è 1 ora
      (errore) => {
        assert.ok(errore instanceof LibraryPolicyConflictError);
        assert.equal(errore.revisioneAttesa, 0);
        assert.equal(errore.revisioneAttuale, 1);
        return true;
      },
    );
    const rimasta = await leggiPolitica({ cartella });
    assert.equal(rimasta.enabled, false, 'la scrittura respinta non deve aver toccato il disco');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐ scriviPolitica: include/exclude file ids sono normalizzati (deduplicati, tetto 64)', async () => {
  const cartella = cartellaVera();
  try {
    const scritta = await scriviPolitica({ cartella, valore: { includedFileIds: ['lib-1', 'lib-1', ' lib-2 '] }, revisioneAttesa: 0 });
    assert.deepEqual(scritta.includedFileIds, ['lib-1', 'lib-2']);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ AL CONTRARIO — leggiPolitica: un policy.json malformato (JSON rotto) lancia LibraryPolicyError, mai un default silenzioso', async () => {
  const cartella = cartellaVera();
  try {
    mkdirSync(join(cartella, CARTELLA_LIBRERIA), { recursive: true });
    writeFileSync(join(cartella, CARTELLA_LIBRERIA, 'policy.json'), '{ non e json');
    await assert.rejects(() => leggiPolitica({ cartella }), (errore) => {
      assert.ok(errore instanceof LibraryPolicyError);
      assert.equal(errore.code, 'LIBRARY_POLICY_MALFORMED');
      return true;
    });
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔ AL CONTRARIO — leggiPolitica: un "mode" sconosciuto (mai scritto da questo modulo) ricade su agentic_on_demand_v1, mai un crash', async () => {
  const cartella = cartellaVera();
  try {
    mkdirSync(join(cartella, CARTELLA_LIBRERIA), { recursive: true });
    writeFileSync(join(cartella, CARTELLA_LIBRERIA, 'policy.json'), JSON.stringify({ revision: 0, enabled: true, mode: 'un-valore-mai-esistito', includedFileIds: [], excludedFileIds: [] }));
    const politica = await leggiPolitica({ cartella });
    assert.equal(politica.mode, 'agentic_on_demand_v1');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐⭐ MODALITA_SUPPORTATE è un sottoinsieme di MODALITA_CONOSCIUTE, e contiene SOLO agentic_on_demand_v1', () => {
  assert.deepEqual(MODALITA_SUPPORTATE, ['agentic_on_demand_v1']);
  for (const m of MODALITA_SUPPORTATE) assert.ok(MODALITA_CONOSCIUTE.includes(m));
  assert.equal(MODALITA_CONOSCIUTE.length, 4, 'le 4 modalità mobile restano tutte CONOSCIUTE, anche se una sola è SUPPORTATA');
});

test('⭐⭐ creaRicevutePolitica: una Map nuova e vuota ad ogni chiamata, mai condivisa', () => {
  const a = creaRicevutePolitica();
  const b = creaRicevutePolitica();
  assert.notEqual(a, b);
  assert.equal(a.size, 0);
});

test('⭐⭐⭐ creaRicevutaPolitica + ricordaRicevutaPolitica: la ricevuta si ritrova per id', () => {
  const ricevute = creaRicevutePolitica();
  const ricevuta = creaRicevutaPolitica({ azione: 'set_enabled', prima: { enabled: true }, revisionePrima: 0, revisioneDopo: 1 });
  ricordaRicevutaPolitica(ricevute, ricevuta);
  assert.equal(ricevute.get(ricevuta.receiptId), ricevuta);
});

test('⛔⛔ AL CONTRARIO — ricordaRicevutaPolitica: oltre 32 ricevute, la PIÙ VECCHIA sparisce (FIFO), mai la più recente', () => {
  const ricevute = creaRicevutePolitica();
  const prima = creaRicevutaPolitica({ azione: 'set_enabled', prima: {}, revisionePrima: 0, revisioneDopo: 1 });
  ricordaRicevutaPolitica(ricevute, prima);
  for (let i = 0; i < 32; i++) {
    ricordaRicevutaPolitica(ricevute, creaRicevutaPolitica({ azione: 'set_enabled', prima: {}, revisionePrima: i, revisioneDopo: i + 1 }));
  }
  assert.equal(ricevute.size, 32);
  assert.equal(ricevute.has(prima.receiptId), false, 'la prima ricevuta scritta deve essere quella evitta');
});
