import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  SessionStoreError,
  elencaSessioniPersistite,
  leggiRegistro,
  registraRiga,
  registraRigaSync,
} from '../src/session-store.mjs';

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-session-store-'));
}

test('⭐⭐⭐ registraRiga + leggiRegistro: le righe tornano nell\'ordine in cui sono state accodate', async () => {
  const cartellaStore = cartellaVera();
  try {
    await registraRiga({ cartellaStore, sessionId: 'sess-1', record: { type: 'RunStarted', threadId: 'sess-1' } });
    await registraRiga({ cartellaStore, sessionId: 'sess-1', record: { type: 'TextMessageContent', delta: 'ciao' } });
    await registraRiga({ cartellaStore, sessionId: 'sess-1', record: { type: 'RunFinished' } });
    const record = await leggiRegistro({ cartellaStore, sessionId: 'sess-1' });
    assert.deepEqual(record.map((r) => r.type), ['RunStarted', 'TextMessageContent', 'RunFinished']);
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

test('⭐⭐ registraRiga: crea la cartella da sola se non esiste ancora', async () => {
  const radice = cartellaVera();
  const cartellaStore = join(radice, 'non-esiste-ancora');
  try {
    await registraRiga({ cartellaStore, sessionId: 'sess-1', record: { type: 'RunStarted' } });
    const record = await leggiRegistro({ cartellaStore, sessionId: 'sess-1' });
    assert.equal(record.length, 1);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐ registraRiga: MAI una riscrittura — due sessioni diverse restano in file separati, una non tocca l\'altra', async () => {
  const cartellaStore = cartellaVera();
  try {
    await registraRiga({ cartellaStore, sessionId: 'sess-a', record: { type: 'RunStarted', v: 'a' } });
    await registraRiga({ cartellaStore, sessionId: 'sess-b', record: { type: 'RunStarted', v: 'b' } });
    await registraRiga({ cartellaStore, sessionId: 'sess-a', record: { type: 'RunFinished', v: 'a' } });
    const a = await leggiRegistro({ cartellaStore, sessionId: 'sess-a' });
    const b = await leggiRegistro({ cartellaStore, sessionId: 'sess-b' });
    assert.equal(a.length, 2);
    assert.equal(b.length, 1);
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ leggiRegistro: un id senza file torna null, mai un\'eccezione', async () => {
  const cartellaStore = cartellaVera();
  try {
    assert.equal(await leggiRegistro({ cartellaStore, sessionId: 'mai-esistita' }), null);
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — leggiRegistro: l\'ULTIMA riga corrotta (crash a metà scrittura) viene scartata, le precedenti restano', async () => {
  const cartellaStore = cartellaVera();
  try {
    mkdirSync(cartellaStore, { recursive: true });
    writeFileSync(
      join(cartellaStore, 'sess-1.jsonl'),
      '{"type":"RunStarted"}\n{"type":"TextMessageContent","delta":"ci',
      // ^ riga finale TRONCATA A METÀ, esattamente come un crash durante l'append lascerebbe sul disco
    );
    const record = await leggiRegistro({ cartellaStore, sessionId: 'sess-1' });
    assert.deepEqual(record, [{ type: 'RunStarted' }]);
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — leggiRegistro: una riga corrotta che NON è l\'ultima è un file danneggiato, errore dichiarato', async () => {
  const cartellaStore = cartellaVera();
  try {
    mkdirSync(cartellaStore, { recursive: true });
    writeFileSync(join(cartellaStore, 'sess-1.jsonl'), '{"type":"RunStarted"}\nQUESTA RIGA NON E JSON\n{"type":"RunFinished"}\n');
    await assert.rejects(() => leggiRegistro({ cartellaStore, sessionId: 'sess-1' }), (errore) => {
      assert.ok(errore instanceof SessionStoreError);
      assert.equal(errore.code, 'SESSION_STORE_CORRUPT');
      return true;
    });
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ elencaSessioniPersistite: torna gli id VERI (nome file senza estensione), non i percorsi', async () => {
  const cartellaStore = cartellaVera();
  try {
    await registraRiga({ cartellaStore, sessionId: 'sess-a', record: { type: 'RunStarted' } });
    await registraRiga({ cartellaStore, sessionId: 'sess-b', record: { type: 'RunStarted' } });
    const id = (await elencaSessioniPersistite({ cartellaStore })).sort();
    assert.deepEqual(id, ['sess-a', 'sess-b']);
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — elencaSessioniPersistite: una cartella assente (primo avvio) torna [], mai un errore', async () => {
  const radice = cartellaVera();
  try {
    const id = await elencaSessioniPersistite({ cartellaStore: join(radice, 'non-esiste') });
    assert.deepEqual(id, []);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — elencaSessioniPersistite: un file NON .jsonl nella cartella è ignorato', async () => {
  const cartellaStore = cartellaVera();
  try {
    mkdirSync(cartellaStore, { recursive: true });
    writeFileSync(join(cartellaStore, 'note.txt'), 'non è una sessione');
    await registraRiga({ cartellaStore, sessionId: 'sess-vera', record: { type: 'RunStarted' } });
    const id = await elencaSessioniPersistite({ cartellaStore });
    assert.deepEqual(id, ['sess-vera']);
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

/*
 * ⭐⭐⭐ FASE L, trovato dalla verifica dal vivo (30/8): un server VERO
 * ucciso 6ms dopo aver creato una sessione perdeva la sessione INTERA sul
 * riavvio ("114/115 ripristinate") — la scrittura fire-and-forget di
 * `registraRiga` non aveva ancora toccato il disco. `registraRigaSync`
 * chiude quella finestra per la SOLA intestazione (vedi il commento in
 * session-store.mjs): niente `await`, niente Promise — se la riga è
 * leggibile SUBITO dopo la chiamata, senza nessuna attesa, è perché la
 * scrittura è VERAMENTE sincrona, non perché il test ha aspettato
 * abbastanza.
 */
test('⭐⭐⭐ registraRigaSync: la riga è leggibile SUBITO, zero await fra la chiamata e la lettura', () => {
  const cartellaStore = cartellaVera();
  try {
    registraRigaSync({ cartellaStore, sessionId: 'sess-sync', record: { tipo: 'intestazione', sessionId: 'sess-sync' } });
    // Lettura sincrona diretta (mai leggiRegistro, che e' async) — la prova vera e' che non serve ATTENDERE nulla.
    const contenuto = readFileSync(join(cartellaStore, 'sess-sync.jsonl'), 'utf8');
    assert.deepEqual(JSON.parse(contenuto.trim()), { tipo: 'intestazione', sessionId: 'sess-sync' });
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

test('⭐⭐ registraRigaSync: crea la cartella da sola se non esiste ancora (stesso comportamento di registraRiga)', () => {
  const radice = cartellaVera();
  const cartellaStore = join(radice, 'non-esiste-ancora-sync');
  try {
    registraRigaSync({ cartellaStore, sessionId: 'sess-1', record: { tipo: 'intestazione' } });
    const record = JSON.parse(readFileSync(join(cartellaStore, 'sess-1.jsonl'), 'utf8').trim());
    assert.deepEqual(record, { tipo: 'intestazione' });
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐ registraRigaSync: due chiamate sulla stessa sessione ACCODANO, mai una riscrittura (stessa garanzia di registraRiga)', () => {
  const cartellaStore = cartellaVera();
  try {
    registraRigaSync({ cartellaStore, sessionId: 'sess-1', record: { tipo: 'intestazione', v: 1 } });
    registraRigaSync({ cartellaStore, sessionId: 'sess-1', record: { type: 'RunStarted', v: 2 } });
    const righe = readFileSync(join(cartellaStore, 'sess-1.jsonl'), 'utf8').trim().split('\n').map((r) => JSON.parse(r));
    assert.equal(righe.length, 2);
    assert.equal(righe[0].v, 1);
    assert.equal(righe[1].v, 2);
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — registraRigaSync: un errore fs (mkdir che fallisce) si PROPAGA come lancio sincrono, mai inghiottito', () => {
  const cartellaStore = cartellaVera();
  try {
    assert.throws(() => {
      registraRigaSync(
        { cartellaStore, sessionId: 'sess-1', record: { tipo: 'intestazione' } },
        { mkdirSyncFn: () => { throw new Error('disco pieno, finto'); } },
      );
    }, /disco pieno, finto/);
  } finally {
    rmSync(cartellaStore, { recursive: true, force: true });
  }
});
