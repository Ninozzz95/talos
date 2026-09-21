import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MAX_TOOL_INSTALLATI, ToolForgeStoreError, abilitaToolForgiato, elencaToolForgiati, eliminaToolForgiato, installaToolForgiato, leggiToolForgiato } from '../src/tool-forge-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-forge-store-'));
}

function manifestoDiProva(id = 'log-water-intake') {
  return { id, title: 'Log water intake', description: 'x', flow: { entry: 'n1', maxTransitions: 10, nodes: [] } };
}

test('⭐⭐⭐ installaToolForgiato + leggiToolForgiato: nasce SEMPRE abilitato:false', async () => {
  const cartella = cartellaVera();
  try {
    const voce = await installaToolForgiato({ cartella, manifest: manifestoDiProva(), capacita: ['notes.create'], azioni: ['write'], rischio: 'R2' });
    assert.equal(voce.id, 'log-water-intake');
    assert.equal(voce.abilitato, false);
    assert.deepEqual(voce.manifest, manifestoDiProva());
    assert.deepEqual(voce.capacita, ['notes.create']);
    const riletta = await leggiToolForgiato({ cartella, id: 'log-water-intake' });
    assert.deepEqual(riletta, voce);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ AL CONTRARIO — installaToolForgiato: un id già esistente è rifiutato, mai un secondo tool silenzioso', async () => {
  const cartella = cartellaVera();
  try {
    await installaToolForgiato({ cartella, manifest: manifestoDiProva(), capacita: [], azioni: [], rischio: 'R1' });
    await assert.rejects(
      () => installaToolForgiato({ cartella, manifest: manifestoDiProva(), capacita: [], azioni: [], rischio: 'R1' }),
      (errore) => {
        assert.ok(errore instanceof ToolForgeStoreError);
        assert.equal(errore.code, 'FORGE_VERSION_NOT_NEWER');
        assert.match(errore.message, /already exists/);
        return true;
      },
    );
    assert.equal((await elencaToolForgiati({ cartella })).length, 1, 'un solo tool sul disco, mai due');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ AL CONTRARIO — installaToolForgiato: registro pieno (MAX_TOOL_INSTALLATI) rifiuta il successivo', async () => {
  const cartella = cartellaVera();
  try {
    for (let i = 0; i < MAX_TOOL_INSTALLATI; i += 1) {
      await installaToolForgiato({ cartella, manifest: manifestoDiProva(`tool-${i}`), capacita: [], azioni: [], rischio: 'R1' });
    }
    await assert.rejects(
      () => installaToolForgiato({ cartella, manifest: manifestoDiProva('uno-in-piu'), capacita: [], azioni: [], rischio: 'R1' }),
      (errore) => { assert.equal(errore.code, 'FORGE_REGISTRY_FULL'); return true; },
    );
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔ installaToolForgiato: un manifest senza id valido è rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => installaToolForgiato({ cartella, manifest: {}, capacita: [], azioni: [], rischio: 'R1' }), ToolForgeStoreError);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔ leggiToolForgiato: un id inesistente torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await leggiToolForgiato({ cartella, id: 'mai-esistito' }), null);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐⭐ elencaToolForgiati: cartella assente torna [] (mai un errore), più recenti prime', async () => {
  const cartella = cartellaVera();
  try {
    assert.deepEqual(await elencaToolForgiati({ cartella }), []);
    await installaToolForgiato({ cartella, manifest: manifestoDiProva('primo'), capacita: [], azioni: [], rischio: 'R1' });
    await new Promise((r) => setTimeout(r, 5));
    await installaToolForgiato({ cartella, manifest: manifestoDiProva('secondo'), capacita: [], azioni: [], rischio: 'R1' });
    const elenco = await elencaToolForgiati({ cartella });
    assert.equal(elenco.length, 2);
    assert.equal(elenco[0].id, 'secondo');
    assert.equal(elenco[1].id, 'primo');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔ elencaToolForgiati AL CONTRARIO: una voce corrotta è saltata, le altre restano visibili', async () => {
  const cartella = cartellaVera();
  try {
    await installaToolForgiato({ cartella, manifest: manifestoDiProva('buono'), capacita: [], azioni: [], rischio: 'R1' });
    writeFileSync(join(cartella, 'corrotto.json'), '{ non e json valido', 'utf8');
    const elenco = await elencaToolForgiati({ cartella });
    assert.equal(elenco.length, 1);
    assert.equal(elenco[0].id, 'buono');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ AL CONTRARIO — cartella è il bersaglio DIRETTO, mai un genitore da suffissare: installaToolForgiato scrive ESATTAMENTE in <cartella>/<id>.json, nessun sottolivello .tool-forge-store/', async () => {
  const cartella = cartellaVera();
  try {
    await installaToolForgiato({ cartella, manifest: manifestoDiProva('diretto'), capacita: [], azioni: [], rischio: 'R1' });
    // stesso contratto di notes-store.mjs: nessuna sottocartella creata, il file è un figlio DIRETTO di `cartella`.
    const { readdirSync } = await import('node:fs');
    assert.deepEqual(readdirSync(cartella), ['diretto.json']);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐⭐ abilitaToolForgiato: cambia DAVVERO lo stato, riletto dal disco', async () => {
  const cartella = cartellaVera();
  try {
    await installaToolForgiato({ cartella, manifest: manifestoDiProva(), capacita: [], azioni: [], rischio: 'R1' });
    const abilitata = await abilitaToolForgiato({ cartella, id: 'log-water-intake', abilitato: true });
    assert.equal(abilitata.abilitato, true);
    const riletta = await leggiToolForgiato({ cartella, id: 'log-water-intake' });
    assert.equal(riletta.abilitato, true);
    const disabilitata = await abilitaToolForgiato({ cartella, id: 'log-water-intake', abilitato: false });
    assert.equal(disabilitata.abilitato, false);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔ abilitaToolForgiato: un id inesistente torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await abilitaToolForgiato({ cartella, id: 'mai-esistito', abilitato: true }), null);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐⭐ eliminaToolForgiato: cancella davvero (elencaToolForgiati non lo vede più)', async () => {
  const cartella = cartellaVera();
  try {
    await installaToolForgiato({ cartella, manifest: manifestoDiProva(), capacita: [], azioni: [], rischio: 'R1' });
    const esito = await eliminaToolForgiato({ cartella, id: 'log-water-intake' });
    assert.deepEqual(esito, { id: 'log-water-intake' });
    assert.equal(await leggiToolForgiato({ cartella, id: 'log-water-intake' }), null);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ eliminaToolForgiato AL CONTRARIO: idempotente — un id già assente torna null', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await eliminaToolForgiato({ cartella, id: 'mai-esistito' }), null);
    await installaToolForgiato({ cartella, manifest: manifestoDiProva(), capacita: [], azioni: [], rischio: 'R1' });
    await eliminaToolForgiato({ cartella, id: 'log-water-intake' });
    assert.equal(await eliminaToolForgiato({ cartella, id: 'log-water-intake' }), null, 'una seconda eliminazione sullo stesso id non lancia');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});
