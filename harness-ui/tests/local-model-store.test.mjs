import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalModelStore, LocalModelStoreError } from '../src/local-model-store.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const valid = {
  id: 'lfm2-6b-q6',
  repo: 'LiquidAI/LFM2.5-2.6B-GGUF',
  revision: 'dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe',
  files: [{ path: 'LFM2.5-2.6B-Q6_K.gguf', bytes: 1024, sha256: 'a'.repeat(64) }],
  bytes: 1024,
  sha256: 'a'.repeat(64),
  license: 'apache-2.0',
  path: 'lfm2-6b-q6/LFM2.5-2.6B-Q6_K.gguf',
  state: 'ready',
  updatedAt: '2026-08-30T12:00:00.000Z',
};

async function withStore(run, options = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'talos-model-store-'));
  try {
    await run(createLocalModelStore({ rootDir, ...options }), rootDir);
  } finally {
    await rimuoviCartellaDiProvaAttesa(rootDir);
  }
}

test('register and inspect persist a validated manifest atomically', async () => {
  await withStore(async (store) => {
    assert.deepEqual(await store.register(valid), valid);
    assert.deepEqual(await store.inspect(valid.id), valid);
  });
});

test('rejects traversal, absolute paths, short revisions, invalid hashes and unknown fields', async () => {
  await withStore(async (store) => {
    await assert.rejects(store.register({ ...valid, path: '../outside.gguf' }), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.register({ ...valid, path: 'C:\\models\\model.gguf' }), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.register({ ...valid, revision: 'short' }), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.register({ ...valid, sha256: 'invalid' }), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.register({ ...valid, prompt: 'secret' }), (error) => error.code === 'MODEL_INVALID');
  });
});

test('rejects an id collision instead of overwriting the existing manifest', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    await assert.rejects(store.register({ ...valid, license: 'mit' }), (error) => error.code === 'MODEL_EXISTS');
    assert.equal((await store.inspect(valid.id)).license, valid.license);
  });
});

test('allows one lock, rejects a second lock, and releases it explicitly', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    assert.equal(await store.lock(valid.id), true);
    await assert.rejects(store.lock(valid.id), (error) => error.code === 'MODEL_LOCKED');
    assert.equal(await store.unlock(valid.id), true);
    assert.equal(await store.lock(valid.id), true);
  });
});

test('does not publish a manifest when the atomic rename fails', async () => {
  await withStore(async (_unused, rootDir) => {
    const store = createLocalModelStore({
      rootDir,
      fsImpl: { rename: async () => { throw new Error('disk full'); } },
    });
    await assert.rejects(store.register(valid), (error) => error instanceof LocalModelStoreError && error.code === 'MODEL_WRITE_FAILED');
    assert.equal(await store.inspect(valid.id), null);
  });
});

test('MODEL-STORE-STATE-01 aggiorna lo stato del manifest con rename atomico', async () => {
  await withStore(async (store, rootDir) => {
    await store.register({ ...valid, state: 'incomplete' });
    const updated = await store.setState(valid.id, 'ready');
    assert.equal(updated.state, 'ready');
    assert.equal((await store.inspect(valid.id)).state, 'ready');
    const files = await readdir(join(rootDir, 'manifests'));
    assert.deepEqual(files, [`${valid.id}.json`]);
  });
});

test('MODEL-STORE-LIST-01 elenca solo manifest validi, ordinati per id', async () => {
  await withStore(async (store) => {
    await store.register({ ...valid, id: 'z-model' });
    await store.register({ ...valid, id: 'a-model' });
    assert.deepEqual((await store.list()).map(({ id }) => id), ['a-model', 'z-model']);
  });
});

test('MODEL-STORE-RENAME-01 rinomina il nome visualizzato senza cambiare id o percorso', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    const renamed = await store.rename(valid.id, 'Modello cucina');
    assert.equal(renamed.id, valid.id);
    assert.equal(renamed.name, 'Modello cucina');
    assert.equal(renamed.path, valid.path);
    assert.equal((await store.inspect(valid.id)).name, 'Modello cucina');
  });
});

test('MODEL-STORE-RENAME-02 rifiuta nomi vuoti o troppo lunghi', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    await assert.rejects(store.rename(valid.id, ''), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.rename(valid.id, 'x'.repeat(161)), (error) => error.code === 'MODEL_INVALID');
  });
});

test('MODEL-STORE-REMOVE-01 «Elimina» toglie anche i pesi e la cartella del modello, mai la radice', async () => {
  await withStore(async (store, rootDir) => {
    const { mkdir, writeFile, stat } = await import('node:fs/promises');
    const cartella = join(rootDir, 'lfm2-6b-q6');
    await mkdir(cartella, { recursive: true });
    await writeFile(join(cartella, 'LFM2.5-2.6B-Q6_K.gguf'), 'pesi');
    await writeFile(join(rootDir, 'altro.txt'), 'non mio');
    await store.register(valid);
    assert.equal(await store.remove(valid.id), true);
    await assert.rejects(stat(join(cartella, 'LFM2.5-2.6B-Q6_K.gguf')), 'il peso è stato cancellato');
    await assert.rejects(stat(cartella), 'la cartella del modello è stata cancellata');
    assert.equal(await store.inspect(valid.id), null, 'il manifest non c\'è più');
    await stat(join(rootDir, 'altro.txt')); // il verso contrario: un file fuori dalla cartella del modello resta
    await stat(rootDir);
  });
});

test('MODEL-STORE-REMOVE-02 senza manifest cancella solo ciò che è suo e non tocca la radice', async () => {
  await withStore(async (store, rootDir) => {
    const { writeFile, stat } = await import('node:fs/promises');
    await writeFile(join(rootDir, 'altro.txt'), 'non mio');
    assert.equal(await store.remove('inesistente'), true);
    await stat(join(rootDir, 'altro.txt'));
  });
});

/*
 * ⭐⭐⭐ BC-13 (11/09/2026) — «i modelli locali devono comparire ISTANTANEI».
 *
 * Il principio arriva dal mobile, che ci ha lavorato oggi:
 * `AVM/mobile/src/lib/models/localCatalogueSignal.ts:1-89` — «un elenco che non
 * si aggiorna da solo è un elenco che mente finché qualcuno non lo interroga».
 *
 * ⛔ Una cache si prova DUE volte: che risponda senza toccare il disco (sotto,
 *   CACHE-01) e che NON menta quando il disco cambia — dall'interno (02, 03, 04)
 *   e da FUORI dallo store (05). Provare solo il primo verso è come provare un
 *   cancello facendo passare chi ha il permesso: un cancello inerte supera quella
 *   prova esattamente come uno vero.
 */

/** Avvolge `fs` contando quante volte si legge davvero un manifest dal disco. */
function contaLetture() {
  const conteggio = { readFile: 0, readdir: 0 };
  return {
    conteggio,
    fsImpl: {
      readFile: async (...args) => { conteggio.readFile += 1; return (await import('node:fs/promises')).readFile(...args); },
      readdir: async (...args) => { conteggio.readdir += 1; return (await import('node:fs/promises')).readdir(...args); },
    },
  };
}

test('BC-13-CACHE-01 la seconda list() risponde senza rileggere un solo manifest', async () => {
  const spia = contaLetture();
  await withStore(async (store) => {
    await store.register({ ...valid, id: 'a-model' });
    await store.register({ ...valid, id: 'z-model' });
    await store.list();
    const dopoIlPrimoGiro = { ...spia.conteggio };
    const secondo = await store.list();
    assert.deepEqual(secondo.map(({ id }) => id), ['a-model', 'z-model']);
    assert.equal(spia.conteggio.readFile, dopoIlPrimoGiro.readFile, 'nessuna readFile in più: la risposta viene dalla cache');
    assert.equal(spia.conteggio.readdir, dopoIlPrimoGiro.readdir, 'nemmeno la cartella si rilegge');
  }, { fsImpl: spia.fsImpl });
});

test('BC-13-CACHE-02 VERSO CONTRARIO: un modello registrato DOPO compare subito', async () => {
  await withStore(async (store) => {
    await store.register({ ...valid, id: 'a-model' });
    assert.deepEqual((await store.list()).map(({ id }) => id), ['a-model']);
    await store.register({ ...valid, id: 'b-model' });
    assert.deepEqual((await store.list()).map(({ id }) => id), ['a-model', 'b-model'], 'la cache non deve nascondere un modello nuovo');
  });
});

test('BC-13-CACHE-03 VERSO CONTRARIO: un modello rimosso sparisce dall\'elenco', async () => {
  await withStore(async (store) => {
    await store.register({ ...valid, id: 'a-model' });
    await store.register({ ...valid, id: 'b-model' });
    await store.list();
    await store.remove('b-model');
    assert.deepEqual((await store.list()).map(({ id }) => id), ['a-model'], 'la cache non deve resuscitare un modello cancellato');
  });
});

test('BC-13-CACHE-04 VERSO CONTRARIO: un nome cambiato arriva nell\'elenco', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    assert.equal((await store.list())[0].name, undefined);
    await store.rename(valid.id, 'Il mio modello');
    assert.equal((await store.list())[0].name, 'Il mio modello', 'la cache non deve tenere il nome vecchio');
  });
});

test('BC-13-CACHE-05 VERSO CONTRARIO: un manifest scritto da FUORI dallo store viene visto', async () => {
  await withStore(async (store, rootDir) => {
    const { writeFile, utimes } = await import('node:fs/promises');
    await store.register({ ...valid, id: 'a-model' });
    await store.list(); // scalda la cache
    /*
     * ⛔ Questo è il caso che il solo contatore interno NON prende: nessuna
     * scrittura è passata dallo store. Lo prende il mtime della cartella —
     * misurato l'11/09 su NTFS: una voce NUOVA lo muove sempre.
     */
    await writeFile(join(rootDir, 'manifests', 'fuori-model.json'), JSON.stringify({ ...valid, id: 'fuori-model', path: 'fuori-model/x.gguf' }));
    /*
     * ⛔ 14/09 — il mtime della cartella si muove A MANO, e la prova ci guadagna. Su questa macchina una voce nuova lo
     *   muoveva sempre (misurato l'11/09 su NTFS); sul runner del tag `desktop-v0.1.6` NON si è mosso, e questa prova
     *   è diventata rossa mentre il prodotto non aveva niente che non andasse — la cache decade eccome, quando la
     *   cartella cambia. ⇒ Si misura ciò che si voleva misurare (la cache rilegge il disco quando la cartella cambia)
     *   invece della risoluzione del timestamp del filesystem sotto, che è un fatto della macchina, non del prodotto.
     */
    const quando = new Date(Date.now() + 2000);
    await utimes(join(rootDir, 'manifests'), quando, quando);
    assert.deepEqual((await store.list()).map(({ id }) => id), ['a-model', 'fuori-model'], 'il disco è l\'unica fonte che non può essere in ritardo');
  });
});

test('BC-13-CACHE-06 list({fresco:true}) rilegge il disco anche a cache calda', async () => {
  const spia = contaLetture();
  await withStore(async (store) => {
    await store.register(valid);
    await store.list();
    const prima = spia.conteggio.readFile;
    await store.list({ fresco: true });
    assert.ok(spia.conteggio.readFile > prima, 'con `fresco` si torna sul disco per davvero');
  }, { fsImpl: spia.fsImpl });
});

test('BC-13-CACHE-07 chi riceve l\'elenco può maneggiarlo senza avvelenare il giro dopo', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    const primo = await store.list();
    primo[0].id = 'manomesso';
    primo[0].files.push({ path: 'intruso.gguf', bytes: 1, sha256: 'd'.repeat(64) });
    const secondo = await store.list();
    assert.equal(secondo[0].id, valid.id, 'la cache non si lascia riscrivere da chi legge');
    assert.equal(secondo[0].files.length, 1);
  });
});

test('BC-13-PAR-01 un manifest corrotto fa fallire list() come prima, anche leggendo in parallelo', async () => {
  await withStore(async (store, rootDir) => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(rootDir, 'manifests'), { recursive: true });
    await store.register(valid);
    await writeFile(join(rootDir, 'manifests', 'rotto.json'), 'non è JSON');
    await assert.rejects(store.list(), (error) => error instanceof LocalModelStoreError && error.code === 'MODEL_CORRUPT');
  });
});
