import assert from 'node:assert/strict';
import { appendFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

import {
  SessionStoreError,
  elencaSessioniPersistite,
  leggiRegistro,
  registraRiga,
  registraRigaSync,
} from '../src/session-store.mjs';
import * as sessionStore from '../src/session-store.mjs';

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-session-store-'));
}

test('CTX-HEADER-PARTIAL-STAGING — un header incompleto non diventa sessione al replay', async () => {
  const cartellaStore = cartellaVera();
  try {
    assert.equal(typeof sessionStore.registraIntestazioneSync, 'function');
    assert.throws(() => sessionStore.registraIntestazioneSync(
      { cartellaStore, sessionId: 'sess-partial', record: { tipo: 'intestazione', sessionId: 'sess-partial' } },
      { writeFileSyncFn: (path) => { writeFileSync(path, '{"tipo":"int'); throw new Error('disco pieno'); } },
    ), /disco pieno/u);
    assert.deepEqual(await elencaSessioniPersistite({ cartellaStore }), []);
    assert.ok(!readdirSync(cartellaStore).some((name) => name.endsWith('.jsonl')));
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-POST-PUBLISH-THROW — finale esatto dopo eccezione equivale a commit verificato', async () => {
  const cartellaStore = cartellaVera();
  const record = { tipo: 'intestazione', sessionId: 'sess-published' };
  try {
    sessionStore.registraIntestazioneSync(
      { cartellaStore, sessionId: record.sessionId, record },
      { linkSyncFn: (source, target) => { linkSync(source, target); throw new Error('esito link ambiguo'); } },
    );
    assert.equal(readFileSync(join(cartellaStore, 'sess-published.jsonl'), 'utf8'), `${JSON.stringify(record)}\n`);
    assert.deepEqual(await elencaSessioniPersistite({ cartellaStore }), [record.sessionId]);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-COLLISION — non sovrascrive né conferma una sessione preesistente', () => {
  const cartellaStore = cartellaVera();
  const path = join(cartellaStore, 'sess-existing.jsonl');
  try {
    assert.equal(typeof sessionStore.registraIntestazioneSync, 'function');
    writeFileSync(path, '{"tipo":"intestazione","sessionId":"precedente"}\n');
    assert.throws(() => sessionStore.registraIntestazioneSync(
      { cartellaStore, sessionId: 'sess-existing', record: { tipo: 'intestazione', sessionId: 'sess-existing' } },
    ), { name: 'SessionStoreError', code: 'SESSION_STORE_HEADER_EXISTS' });
    assert.equal(readFileSync(path, 'utf8'), '{"tipo":"intestazione","sessionId":"precedente"}\n');
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-STAGING-CLEANUP-FAIL — un alias pending non conferma la creazione né riappare al replay', async () => {
  const cartellaStore = cartellaVera();
  try {
    assert.throws(() => sessionStore.registraIntestazioneSync(
      { cartellaStore, sessionId: 'sess-cleanup', record: { tipo: 'intestazione', sessionId: 'sess-cleanup' } },
      { unlinkSyncFn: (path) => { if (path.endsWith('.pending')) throw new Error('file occupato'); unlinkSync(path); } },
    ), { name: 'SessionStoreError', code: 'SESSION_STORE_HEADER_FAILED' });
    assert.ok(readdirSync(cartellaStore).some((name) => name.endsWith('.pending')));
    assert.deepEqual(await elencaSessioniPersistite({ cartellaStore }), []);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-POST-LINK-VERIFY-FAIL — se verifica e rollback falliscono il pending isola il finale', async () => {
  const cartellaStore = cartellaVera();
  try {
    assert.throws(() => sessionStore.registraIntestazioneSync(
      { cartellaStore, sessionId: 'sess-uncertain', record: { tipo: 'intestazione', sessionId: 'sess-uncertain' } },
      {
        linkSyncFn: (source, target) => { linkSync(source, target); throw new Error('link ambiguo'); },
        readFileSyncFn: (path) => { if (path.endsWith('.jsonl')) throw new Error('read EACCES'); return readFileSync(path); },
        unlinkSyncFn: (path) => { if (path.endsWith('.jsonl')) throw new Error('unlink EACCES'); unlinkSync(path); },
      },
    ), /link ambiguo/u);
    assert.ok(readdirSync(cartellaStore).some((name) => name.endsWith('.pending')));
    assert.deepEqual(await elencaSessioniPersistite({ cartellaStore }), []);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-COLLISION-SAME-BYTES — inode bigint distingue un altro file con header identico', () => {
  const cartellaStore = cartellaVera();
  const record = { tipo: 'intestazione', sessionId: 'sess-same-bytes' };
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
  const finale = join(cartellaStore, 'sess-same-bytes.jsonl');
  try {
    assert.throws(() => sessionStore.registraIntestazioneSync(
      { cartellaStore, sessionId: record.sessionId, record },
      {
        linkSyncFn: (_source, target) => { writeFileSync(target, bytes, { flag: 'wx' }); throw new Error('EEXIST'); },
        statSyncFn: (path, options) => {
          const ino = path.endsWith('.jsonl') ? 9007199254740993n : 9007199254740992n;
          return { dev: options?.bigint ? 1n : 1, ino: options?.bigint ? ino : Number(ino),
            size: options?.bigint ? BigInt(bytes.length) : bytes.length, isFile: () => true };
        },
      },
    ), /EEXIST/u);
    assert.deepEqual(readFileSync(finale), bytes);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-STAGING-DELETE-PRIVACY — successo rimuove alias prima di append e delete', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-private';
  try {
    sessionStore.registraIntestazioneSync({ cartellaStore, sessionId, record: { tipo: 'intestazione', sessionId } });
    assert.deepEqual(readdirSync(cartellaStore), [`${sessionId}.jsonl`]);
    await registraRiga({ cartellaStore, sessionId, record: { type: 'TextMessageContent', delta: 'segreto' } });
    await sessionStore.eliminaSessionePersistita({ cartellaStore, sessionId });
    assert.deepEqual(readdirSync(cartellaStore), []);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-FOREIGN-PENDING-VISIBLE — un file estraneo col nome pending non occulta il journal', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-foreign';
  try {
    sessionStore.registraIntestazioneSync({ cartellaStore, sessionId, record: { tipo: 'intestazione', sessionId } });
    writeFileSync(join(cartellaStore, `.${sessionId}.00000000-0000-4000-8000-000000000001.pending`), 'estraneo');
    assert.deepEqual(await elencaSessioniPersistite({ cartellaStore }), [sessionId]);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-QUARANTINE-INDEX — 200 journal distinguono alias veri ed estranei senza falsi nascosti', async () => {
  const cartellaStore = cartellaVera();
  const visibili = [];
  const quarantena = [];
  try {
    for (let i = 0; i < 200; i += 1) {
      const sessionId = `sess-index-${i}`;
      const finale = join(cartellaStore, `${sessionId}.jsonl`);
      const pending = join(cartellaStore, `.${sessionId}.00000000-0000-4000-8000-${String(i).padStart(12, '0')}.pending`);
      writeFileSync(finale, `${JSON.stringify({ tipo: 'intestazione', sessionId })}\n`);
      if (i % 2 === 0) { linkSync(finale, pending); quarantena.push(sessionId); }
      else { writeFileSync(pending, 'altro file'); visibili.push(sessionId); }
    }
    const index = await elencaSessioniPersistite({ cartellaStore, conDiagnostica: true });
    assert.deepEqual(index.sessionIds.sort(), visibili.sort());
    assert.deepEqual(index.quarantined.map((item) => item.sessionId).sort(), quarantena.sort());
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('CTX-HEADER-ORPHAN-PENDING-DIAGNOSTIC — staging parziale senza finale resta visibile senza prompt', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-orphan';
  try {
    assert.throws(() => sessionStore.registraIntestazioneSync(
      { cartellaStore, sessionId, record: { tipo: 'intestazione', sessionId, task: 'segreto-non-pubblico' } },
      {
        writeFileSyncFn: (path) => { writeFileSync(path, '{"task":"segreto-non-pubblico'); throw new Error('write EACCES'); },
        unlinkSyncFn: () => { throw new Error('unlink EACCES'); },
      },
    ), /write EACCES/u);
    const index = await elencaSessioniPersistite({ cartellaStore, conDiagnostica: true });
    assert.deepEqual(index.sessionIds, []);
    assert.deepEqual(index.quarantined, [{ sessionId, motivo: 'intestazione-pendente-senza-journal' }]);
    assert.doesNotMatch(JSON.stringify(index), /segreto-non-pubblico|\.pending|talos-session-store-/i);
    assert.ok(readdirSync(cartellaStore).some((name) => name.endsWith('.pending')));
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('⭐⭐⭐ registraRiga + leggiRegistro: le righe tornano nell\'ordine in cui sono state accodate', async () => {
  const cartellaStore = cartellaVera();
  try {
    await registraRiga({ cartellaStore, sessionId: 'sess-1', record: { type: 'RunStarted', threadId: 'sess-1' } });
    await registraRiga({ cartellaStore, sessionId: 'sess-1', record: { type: 'TextMessageContent', delta: 'ciao' } });
    await registraRiga({ cartellaStore, sessionId: 'sess-1', record: { type: 'RunFinished' } });
    const record = await leggiRegistro({ cartellaStore, sessionId: 'sess-1' });
    assert.deepEqual(record.map((r) => r.type), ['RunStarted', 'TextMessageContent', 'RunFinished']);
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
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
    rimuoviCartellaDiProva(radice);
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
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('⭐⭐⭐ leggiRegistro: un id senza file torna null, mai un\'eccezione', async () => {
  const cartellaStore = cartellaVera();
  try {
    assert.equal(await leggiRegistro({ cartellaStore, sessionId: 'mai-esistita' }), null);
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
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
    rimuoviCartellaDiProva(cartellaStore);
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
    rimuoviCartellaDiProva(cartellaStore);
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
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('⛔ AL CONTRARIO — elencaSessioniPersistite: una cartella assente (primo avvio) torna [], mai un errore', async () => {
  const radice = cartellaVera();
  try {
    const id = await elencaSessioniPersistite({ cartellaStore: join(radice, 'non-esiste') });
    assert.deepEqual(id, []);
  } finally {
    rimuoviCartellaDiProva(radice);
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
    rimuoviCartellaDiProva(cartellaStore);
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
    rimuoviCartellaDiProva(cartellaStore);
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
    rimuoviCartellaDiProva(radice);
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
    rimuoviCartellaDiProva(cartellaStore);
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
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-STORE-POST-APPEND-THROW — byte completi verificati sono un commit, anche se la primitiva lancia dopo', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-post-append';
  try {
    registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'intestazione' } });
    await sessionStore.registraRigaConfermata(
      { cartellaStore, sessionId, record: { tipo: 'messaggi-finali', messaggiFinali: [{ role: 'user', content: 'sintesi' }] } },
      { appendFileSyncFn: (path, data, options) => { appendFileSync(path, data, options); throw new Error('chiusura ambigua dopo append'); } },
    );
    const righe = await leggiRegistro({ cartellaStore, sessionId });
    assert.equal(righe.length, 2);
    assert.equal(righe.at(-1).messaggiFinali[0].content, 'sintesi');
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-STORE-PARTIAL-APPEND-THROW — un prefisso scritto e riconosciuto viene tolto prima del retry', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-partial-append';
  try {
    registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'intestazione' } });
    const path = join(cartellaStore, `${sessionId}.jsonl`);
    await assert.rejects(() => sessionStore.registraRigaConfermata(
      { cartellaStore, sessionId, record: { tipo: 'messaggi-finali', messaggiFinali: [{ role: 'user', content: 'sintesi' }] } },
      { appendFileSyncFn: (target, data) => {
        const bytes = Buffer.from(data);
        appendFileSync(target, bytes.subarray(0, Math.floor(bytes.length / 2)));
        throw new Error('append interrotto');
      } },
    ), /append interrotto/);
    assert.ok(readFileSync(path, 'utf8').endsWith('\n'));
    await registraRiga({ cartellaStore, sessionId, record: { tipo: 'dopo-errore' } });
    const righe = await leggiRegistro({ cartellaStore, sessionId });
    assert.deepEqual(righe.map((riga) => riga.tipo), ['intestazione', 'dopo-errore']);
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-STORE-UNKNOWN-TAIL-FAIL-CLOSED — byte estranei non vengono troncati o dichiarati rollback', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-unknown-tail';
  try {
    registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'intestazione' } });
    const path = join(cartellaStore, `${sessionId}.jsonl`);
    await assert.rejects(() => sessionStore.registraRigaConfermata(
      { cartellaStore, sessionId, record: { tipo: 'messaggi-finali', messaggiFinali: [{ role: 'user', content: 'sintesi' }] } },
      { appendFileSyncFn: (target) => { appendFileSync(target, 'byte-estranei'); throw new Error('append inatteso'); } },
    ), (error) => error?.code === 'SESSION_STORE_AMBIGUOUS');
    assert.ok(readFileSync(path, 'utf8').endsWith('byte-estranei'), 'i byte sconosciuti restano disponibili per diagnosi');
    await assert.rejects(() => sessionStore.registraRigaConfermata(
      { cartellaStore, sessionId, record: { tipo: 'tentativo-successivo' } },
    ), (error) => error?.code === 'SESSION_STORE_AMBIGUOUS');
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

/*
 * ⛔ 24/09/2026 — F2: i due casi qui sotto asserivano il contratto OPPOSTO («replay leggibile non autorizza append
 * dietro una coda rotta», «JSON valido senza newline non è una coda appendibile»), cioè J1: un journal spezzato
 * avvelenava la sessione a ogni riavvio, senza via d'uscita. La decisione dell'owner del 24/09/2026 (n. 7) è la
 * riparazione AUTOMATICA e DICHIARATA al replay: backup `.bak` + troncamento all'ultimo `\n`. Il testo dei casi
 * è riscritto sul contratto nuovo; il nome resta per la tracciabilità. I casi completi della riparazione stanno
 * in `tests/session-store-flush-riparazione.test.mjs`.
 */
test('CTX-STORE-REPLAY-TRUNCATED-TAIL-BLOCKS-APPEND — (dal 24/09/2026) il replay ripara la coda rotta con backup e dichiara; l append dopo riesce', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-replay-tail';
  try {
    const path = join(cartellaStore, `${sessionId}.jsonl`);
    const spezzato = '{"tipo":"intestazione"}\n{"tipo":"messaggi-finali","messaggiFinali":[';
    writeFileSync(path, spezzato);
    const letto = await leggiRegistro({ cartellaStore, sessionId });
    assert.deepEqual(letto, [{ tipo: 'intestazione' }]);
    assert.equal(letto.riparazione?.riparato, true);
    assert.equal(letto.riparazione.righeScartate, 1);
    assert.equal(readFileSync(letto.riparazione.backup, 'utf8'), spezzato, 'il backup conserva i byte originali');
    assert.equal(readFileSync(path, 'utf8'), '{"tipo":"intestazione"}\n');
    await registraRiga({ cartellaStore, sessionId, record: { tipo: 'si-accoda' } });
    assert.equal(readFileSync(path, 'utf8'), '{"tipo":"intestazione"}\n{"tipo":"si-accoda"}\n');
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-STORE-REPLAY-VALID-UNTERMINATED-TAIL-BLOCKS-APPEND — (dal 24/09/2026) JSON valido senza newline si COMPLETA, non si scarta; l append dopo riesce', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-valid-unterminated-tail';
  try {
    const path = join(cartellaStore, `${sessionId}.jsonl`);
    writeFileSync(path, '{"tipo":"intestazione"}\n{"tipo":"messaggi-finali"}');
    const letto = await leggiRegistro({ cartellaStore, sessionId });
    assert.deepEqual(letto, [{ tipo: 'intestazione' }, { tipo: 'messaggi-finali' }]);
    assert.equal(letto.riparazione?.completata, true);
    assert.equal(letto.riparazione.righeScartate, 0);
    assert.equal(letto.riparazione.backup, null);
    assert.equal(readFileSync(path, 'utf8'), '{"tipo":"intestazione"}\n{"tipo":"messaggi-finali"}\n');
    await registraRiga({ cartellaStore, sessionId, record: { tipo: 'si-accoda' } });
    assert.ok(readFileSync(path, 'utf8').endsWith('{"tipo":"messaggi-finali"}\n{"tipo":"si-accoda"}\n'));
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-STORE-COLD-TAIL-BLOCKS-ALL-WRITERS — writer async e sync controllano il journal anche senza replay', async () => {
  const cartellaStore = cartellaVera();
  try {
    for (const [sessionId, writer] of [
      ['sess-cold-async', () => registraRiga({ cartellaStore, sessionId: 'sess-cold-async', record: { tipo: 'vietato' } })],
      ['sess-cold-sync', () => registraRigaSync({ cartellaStore, sessionId: 'sess-cold-sync', record: { tipo: 'vietato' } })],
    ]) {
      const path = join(cartellaStore, `${sessionId}.jsonl`);
      const originale = '{"tipo":"intestazione"}\n{"tipo":"finale"}';
      writeFileSync(path, originale);
      if (sessionId.endsWith('async')) {
        await assert.rejects(writer, (error) => error?.code === 'SESSION_STORE_AMBIGUOUS');
      } else {
        assert.throws(writer, (error) => error?.code === 'SESSION_STORE_AMBIGUOUS');
      }
      assert.equal(readFileSync(path, 'utf8'), originale);
    }
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-STORE-ASYNC-PARTIAL-FAIL-BLOCKS-NEXT — il secondo writer non corrompe un prefisso lasciato dal primo', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-async-partial';
  try {
    const primo = registraRiga(
      { cartellaStore, sessionId, record: { tipo: 'interrotto' } },
      { appendFileFn: async (path, data) => {
        appendFileSync(path, data.slice(0, Math.floor(data.length / 2)));
        throw new Error('append interrotto');
      } },
    );
    const secondo = registraRiga({ cartellaStore, sessionId, record: { tipo: 'non-si-accoda' } });
    const risultati = await Promise.allSettled([primo, secondo]);
    assert.equal(risultati[0].status, 'rejected');
    assert.equal(risultati[1].status, 'rejected');
    assert.equal(risultati[1].reason?.code, 'SESSION_STORE_AMBIGUOUS');
    assert.ok(!readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').includes('non-si-accoda'));
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-STORE-ASYNC-MALFORMED-LF-BLOCKS-NEXT — append fallito con newline non autorizza il writer successivo', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-async-malformed-lf';
  try {
    const primo = registraRiga(
      { cartellaStore, sessionId, record: { tipo: 'interrotto' } },
      { appendFileFn: async (path) => { appendFileSync(path, '{"tipo":\n'); throw new Error('append interrotto'); } },
    );
    const secondo = registraRiga({ cartellaStore, sessionId, record: { tipo: 'non-si-accoda' } });
    const risultati = await Promise.allSettled([primo, secondo]);
    assert.equal(risultati[0].status, 'rejected');
    assert.equal(risultati[1].status, 'rejected');
    assert.equal(risultati[1].reason?.code, 'SESSION_STORE_AMBIGUOUS');
    assert.equal(readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8'), '{"tipo":\n');
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-STORE-SYNC-MALFORMED-LF-BLOCKS-CONFIRMED — errore sync non lascia confermare dietro una riga incerta', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-sync-malformed-lf';
  try {
    registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'intestazione' } });
    assert.throws(() => registraRigaSync(
      { cartellaStore, sessionId, record: { tipo: 'interrotto' } },
      { appendFileSyncFn: (path) => { appendFileSync(path, '{"tipo":\n'); throw new Error('append interrotto'); } },
    ), /append interrotto/);
    await assert.rejects(() => sessionStore.registraRigaConfermata({ cartellaStore, sessionId, record: { tipo: 'compatta' } }),
      (error) => error?.code === 'SESSION_STORE_AMBIGUOUS');
    assert.ok(readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').endsWith('{"tipo":\n'));
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});
