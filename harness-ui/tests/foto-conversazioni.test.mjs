/* 01/11/2026, «Memoria delle conversazioni»: il collegamento al motore. Motore finto che scrive i file come llama-server. */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { identitaFoto } from '../src/archivio-foto.mjs';
import { creaFotoConversazioni, nomeDellaFoto } from '../src/foto-conversazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const GB = 1024 ** 3;
const elenco = (c) => readdirSync(c).filter((f) => f !== 'proprietario.json'); // the owner file of the folder (review 1/11, note 4)
const ID = identitaFoto({ modello: 'q4', ggufSha256: 'aa', build: 'b11669', finestra: 32768, motore: 'vulkan', livelli: 99 });

function banco(t, { byte = 4096, stato = {}, salvati = () => 900 } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-foto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiamate = [];
  const s = { state: 'ready', fotoAttive: true, processo: 1, modelId: 'q4', ...stato };
  const motore = {
    s,
    stato: () => s,
    async slot(azione, filename) {
      chiamate.push([azione, filename]);
      const p = join(cartella, filename);
      if (azione === 'save') { writeFileSync(p, Buffer.alloc(byte)); return { n_saved: salvati(), timings: { save_ms: 12.5 } }; }
      if (!existsSync(p)) throw Object.assign(new Error('failed to restore slot'), { code: 'HTTP_400' });
      return { n_restored: 900, timings: { restore_ms: 7.5 } };
    },
  };
  return { cartella, chiamate, motore };
}
const crea = (b, extra = {}) => creaFotoConversazioni({ cartella: b.cartella, motore: b.motore, identita: async () => ID, avvisa: () => {}, ...extra });

test('FC-1 end of turn saves under a temporary name then renames; back on the conversation after another one it is put back', async (t) => {
  const b = banco(t);
  const f = await crea(b);
  assert.equal((await f.primaDelGiro('A')).esito, 'assente');
  const s = await f.dopoIlGiro('A', { token: 900 });
  assert.deepEqual(s, { esito: 'salvata', ms: 12.5, bytes: 4096 });
  const nome = nomeDellaFoto('q4', 'A');
  assert.deepEqual(b.chiamate[0], ['save', `t${nome}.bin`]);
  assert.deepEqual(elenco(b.cartella).sort(), [`${nome}.bin`, 'indice.json']);
  assert.equal((await f.primaDelGiro('A')).esito, 'gia-sulla-scheda', 'the live slot is newer than the disk (Jan)');
  assert.equal((await f.primaDelGiro('B')).esito, 'assente');
  const r = await f.primaDelGiro('A');
  assert.equal(r.esito, 'rimessa');
  assert.equal(r.ms, 7.5);
  assert.deepEqual(b.chiamate.at(-1), ['restore', `${nome}.bin`]);
});

test('FC-2 a new engine process has an empty slot: the same conversation is put back; a different identity is dropped, never restored', async (t) => {
  const b = banco(t);
  let id = ID;
  const f = await crea(b, { identita: async () => id });
  await f.primaDelGiro('A');
  await f.dopoIlGiro('A', { token: 900 });
  b.motore.s.processo = 2;
  assert.equal((await f.primaDelGiro('A')).esito, 'rimessa');
  b.motore.s.processo = 3;
  id = identitaFoto({ modello: 'q4', ggufSha256: 'aa', build: 'b11960', finestra: 32768, motore: 'vulkan', livelli: 99 });
  assert.equal((await f.primaDelGiro('A')).esito, 'identita-diversa');
  assert.equal(b.chiamate.filter(([a]) => a === 'restore').length, 1);
  assert.deepEqual(elenco(b.cartella), ['indice.json'], 'the file that can never match again is deleted');
});

test('FC-3 nothing written: short conversation, disk under 20 GB, unchanged conversation, another conversation on the slot, engine without snapshots', async (t) => {
  const b = banco(t);
  let libero = 100 * GB;
  const f = await crea(b, { discoLibero: () => libero });
  await f.primaDelGiro('A');
  assert.equal((await f.dopoIlGiro('A', { token: 100 })).esito, 'troppo-corta');
  libero = 19 * GB;
  assert.equal((await f.dopoIlGiro('A', { token: 900 })).esito, 'disco-pieno');
  libero = 100 * GB;
  assert.equal((await f.dopoIlGiro('A', { token: 900 })).esito, 'salvata');
  assert.equal((await f.dopoIlGiro('A', { token: 900 })).esito, 'uguale', 'Performance 3: no rewrite');
  assert.equal((await f.dopoIlGiro('B', { token: 900 })).esito, 'non-sulla-scheda');
  b.motore.s.fotoAttive = false;
  assert.equal((await f.dopoIlGiro('A', { token: 2000 })).esito, 'motore-senza-foto');
  assert.equal((await f.primaDelGiro('A')).esito, 'motore-senza-foto');
  assert.equal(b.chiamate.filter(([a]) => a === 'save').length, 1);
});

test('FC-4 the cap: the least recently used conversation goes first; at 0 nothing is written and what was saved is freed', async (t) => {
  const b = banco(t, { byte: 4096 });
  let tetto = 8192;
  let ora = 1000;
  const f = await crea(b, { tettoConversazioni: () => tetto, adesso: () => ora });
  for (const s of ['A', 'B', 'C']) { ora += 10; await f.primaDelGiro(s); await f.dopoIlGiro(s, { token: 900 }); }
  const presenti = elenco(b.cartella).filter((x) => x.endsWith('.bin')).sort();
  assert.deepEqual(presenti, [nomeDellaFoto('q4', 'B'), nomeDellaFoto('q4', 'C')].map((n) => `${n}.bin`).sort(), 'A, the oldest, went');
  assert.equal(f.occupato().conversazioni, 8192);
  tetto = 0;
  assert.equal((await f.primaDelGiro('B')).esito, 'spenta');
  assert.deepEqual(elenco(b.cartella), ['indice.json']);
  assert.equal((await f.dopoIlGiro('B', { token: 900 })).esito, 'spenta');
});

test('FC-5 at start: a temporary file and a file without an index entry are leftovers; an entry without its file is forgotten; a missing file at restore is a normal miss', async (t) => {
  const b = banco(t);
  const f = await crea(b);
  await f.primaDelGiro('A');
  await f.dopoIlGiro('A', { token: 900 });
  await f.primaDelGiro('B');
  await f.dopoIlGiro('B', { token: 900 });
  writeFileSync(join(b.cartella, `t${'0'.repeat(32)}.bin`), 'x');
  writeFileSync(join(b.cartella, `${'1'.repeat(32)}.bin`), 'x');
  const { unlinkSync } = await import('node:fs');
  unlinkSync(join(b.cartella, `${nomeDellaFoto('q4', 'B')}.bin`));
  const g = await crea(b);
  assert.deepEqual(elenco(b.cartella).sort(), [`${nomeDellaFoto('q4', 'A')}.bin`, 'indice.json'].sort());
  assert.equal((await g.primaDelGiro('B')).esito, 'assente');
  unlinkSync(join(b.cartella, `${nomeDellaFoto('q4', 'A')}.bin`));
  assert.equal((await g.primaDelGiro('A')).esito, 'non-riuscita', 'the engine refused: dropped, the conversation is read again');
  assert.equal(g.occupato().totale, 0);
});

test('FC-6 a message that arrives during a save waits for it, and the wait is measured; a deleted conversation loses its snapshots', async (t) => {
  const b = banco(t);
  let libera;
  const lento = new Promise((r) => { libera = r; });
  const save = b.motore.slot;
  b.motore.slot = async (azione, file) => { if (azione === 'save') await lento; return save(azione, file); };
  let ora = 0;
  const f = await crea(b, { adesso: () => ora });
  await f.primaDelGiro('A');
  const salvo = f.dopoIlGiro('A', { token: 900 });
  const prossimo = f.primaDelGiro('B');
  ora = 250;
  libera();
  assert.equal((await salvo).esito, 'salvata');
  assert.equal((await prossimo).attesaMs, 250);
  assert.equal(await f.dimentica('A'), 1);
  assert.deepEqual(elenco(b.cartella), ['indice.json']);
});

test('FC-7 tokens not known (the end of a turn): the engine answer decides after the save; too short or unchanged leave nothing on disk', async (t) => {
  let n = 100;
  const b = banco(t, { salvati: () => n });
  const f = await crea(b);
  await f.primaDelGiro('A');
  assert.equal((await f.dopoIlGiro('A')).esito, 'troppo-corta');
  assert.deepEqual(elenco(b.cartella).filter((x) => x.endsWith('.bin')), [], 'the temporary file is gone');
  n = 900;
  assert.equal((await f.dopoIlGiro('A')).esito, 'salvata');
  assert.equal((await f.dopoIlGiro('A')).esito, 'uguale');
  assert.deepEqual(elenco(b.cartella).filter((x) => x.endsWith('.bin')), [`${nomeDellaFoto('q4', 'A')}.bin`]);
  n = 1500;
  assert.equal((await f.dopoIlGiro('A')).esito, 'salvata', 'the conversation grew');
});

test('FC-8 a request for another model does not touch the slot; a request without a conversation takes it, so the next turn puts the conversation back', async (t) => {
  const b = banco(t);
  const f = await crea(b);
  await f.primaDelGiro('A');
  await f.dopoIlGiro('A', { modello: 'q4' });
  assert.equal((await f.primaDelGiro('A', { modello: 'llama3:8b' })).esito, 'altro-motore');
  assert.equal((await f.dopoIlGiro('A', { modello: 'llama3:8b' })).esito, 'altro-motore');
  assert.equal((await f.primaDelGiro('A', { modello: 'q4' })).esito, 'gia-sulla-scheda');
  assert.equal((await f.primaDelGiro(null)).esito, 'senza-conversazione', 'a background summary on the same engine');
  assert.equal((await f.primaDelGiro('A', { modello: 'q4' })).esito, 'rimessa');
  assert.equal((await f.dopoIlGiro(null)).esito, 'non-sulla-scheda');
});

test('FC-9 a message during a long save (Mobile 2) waits at most the cap, restores nothing, and the slot is then its conversation', async (t) => {
  const b = banco(t);
  let libera;
  const lento = new Promise((r) => { libera = r; });
  const save = b.motore.slot;
  b.motore.slot = async (azione, file) => { if (azione === 'save') await lento; return save(azione, file); };
  const f = await crea(b, { tettoAttesaMs: 60 });
  await f.primaDelGiro('B');
  b.motore.slot = save; // B saves at once: B has a snapshot on disk
  await f.dopoIlGiro('B', { token: 900 });
  b.motore.slot = async (azione, file) => { if (azione === 'save') await lento; return save(azione, file); };
  await f.primaDelGiro('A');
  const salvo = f.dopoIlGiro('A', { token: 900 });
  const t0 = Date.now();
  assert.equal((await f.primaDelGiro('B')).esito, 'attesa-scaduta');
  assert.ok(Date.now() - t0 < 1_000);
  libera();
  assert.equal((await salvo).esito, 'salvata');
  assert.equal((await f.primaDelGiro('B')).esito, 'gia-sulla-scheda', 'the engine ran that message after the save: the slot is B now');
  assert.equal(b.chiamate.filter(([a]) => a === 'restore').length, 0, 'B is NOT put back late, over the message the engine already read');
});

/* A fake engine that applies the operations in the order they arrive, like the single queue of llama-server (server-queue.cpp:41, :148):
   `scheda` is who REALLY sits on the slot. Found by the adversarial review of 1/11 (the reviewer's own test). */
function motoreInOrdine(cartella) {
  const st = { scheda: null, ritardo: { save: 0, restore: 0 } };
  const s = { state: 'ready', fotoAttive: true, processo: 1, modelId: 'q4' };
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    st,
    motore: {
      stato: () => s,
      async slot(azione, file) {
        if (azione === 'save') { const dentro = st.scheda; await dorme(st.ritardo.save); writeFileSync(join(cartella, file), `${dentro}`.padEnd(400, '.')); return { n_saved: 900 }; }
        st.scheda = readFileSync(join(cartella, file), 'utf8').replace(/\.+$/u, ''); await dorme(st.ritardo.restore); return { n_restored: 900 };
      },
    },
    completamento: (chi) => { st.scheda = chi; },
  };
}
const dentroDi = (cartella, chi) => { try { return readFileSync(join(cartella, `${nomeDellaFoto('q4', chi)}.bin`), 'utf8').replace(/\.+$/u, ''); } catch { return null; } };

test('FC-10 a message that went past the cap does not make the driver believe the slot is its own when a later restore took it (review 1/11)', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-foto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const { st, motore, completamento } = motoreInOrdine(cartella);
  /* Rule 6 (03/11): the cap was 150 ms with a 160 ms save, so C had 10 ms of room and went red under load in the merge queue.
     Now C waits ~40 ms of a 400 ms cap and B's cap (at ~450 ms) falls in the middle of C's restore (60 -> 860 ms): the order of the
     timers decides, not the load (Node runs expired timers by deadline). Same story as before, room on both sides. */
  const f = await creaFotoConversazioni({ cartella, motore, identita: async () => ID, avvisa: () => {}, tettoAttesaMs: 400 });
  await f.primaDelGiro('C'); completamento('C'); await f.dopoIlGiro('C', { token: 900 });
  await f.primaDelGiro('A'); completamento('A');
  st.ritardo.save = 60; st.ritardo.restore = 800;
  const salvaA = f.dopoIlGiro('A', { token: 900 });
  await new Promise((r) => setTimeout(r, 20));
  const primaC = f.primaDelGiro('C');
  await new Promise((r) => setTimeout(r, 30));
  const primaB = f.primaDelGiro('B');
  assert.equal((await primaB).esito, 'attesa-scaduta');
  completamento('B');
  assert.equal((await primaC).esito, 'rimessa');
  completamento('C');
  await salvaA;
  st.ritardo.save = 0;
  assert.equal(st.scheda, 'C');
  await f.dopoIlGiro('B', { token: 1200 });
  await f.dopoIlGiro('C', { token: 1300 });
  assert.notEqual(dentroDi(cartella, 'B'), 'C', 'the snapshot of B holds the conversation of C');
  assert.equal(dentroDi(cartella, 'C'), 'C', 'C, really on the slot, is saved');
});

test('FC-11 a save still waiting in the queue when a request went past the cap is dropped: the slot is no longer the one it was asked for', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-foto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const { st, motore, completamento } = motoreInOrdine(cartella);
  const f = await creaFotoConversazioni({ cartella, motore, identita: async () => ID, avvisa: () => {}, tettoAttesaMs: 60 });
  await f.primaDelGiro('B'); completamento('B'); await f.dopoIlGiro('B', { token: 900 });
  await f.primaDelGiro('A'); completamento('A'); await f.dopoIlGiro('A', { token: 900 });
  st.ritardo.restore = 200;
  const primaB = f.primaDelGiro('B'); // a slow restore holds the queue
  await new Promise((r) => setTimeout(r, 10));
  completamento('B');
  const salvaB = f.dopoIlGiro('B', { token: 1500 }); // queued behind the restore
  const riassunto = f.primaDelGiro(null); // the end-of-turn summary: past the cap it goes to the engine
  assert.equal((await riassunto).esito, 'attesa-scaduta');
  completamento('SUMMARY');
  await primaB;
  const esito = await salvaB;
  assert.notEqual(dentroDi(cartella, 'B'), 'SUMMARY', 'the summary was saved under the name of B');
  assert.equal(esito.esito, 'superata');
});

test('FC-13 two TALOS processes on the same data folder (review 1/11, note 4): one owner; the other runs without snapshots and deletes nothing; a dead owner is replaced', async (t) => {
  const b = banco(t);
  const primo = await crea(b, { pid: 1001, vivo: () => true });
  await primo.primaDelGiro('A');
  assert.equal((await primo.dopoIlGiro('A', { token: 900 })).esito, 'salvata');
  writeFileSync(join(b.cartella, `t${'0'.repeat(32)}.bin`), 'x'); // a write of the first process still in progress
  const secondo = await crea(b, { pid: 2002, vivo: () => true });
  assert.equal(secondo.proprietario, false);
  assert.equal((await secondo.primaDelGiro('A')).esito, 'altro-processo');
  assert.equal((await secondo.dopoIlGiro('A', { token: 900 })).esito, 'altro-processo');
  assert.ok(existsSync(join(b.cartella, `t${'0'.repeat(32)}.bin`)), 'the second process does not sweep the first one\'s files');
  assert.ok(existsSync(join(b.cartella, `${nomeDellaFoto('q4', 'A')}.bin`)));
  const dopo = await crea(b, { pid: 3003, vivo: (p) => p !== 1001 });
  assert.equal(dopo.proprietario, true, 'the first owner is dead: the folder is taken over');
});

test('FC-14 a conversation deleted while its save is in progress (Performance 1/11): the file goes after the save, and a save asked later is refused', async (t) => {
  const b = banco(t);
  let libera;
  const lento = new Promise((r) => { libera = r; });
  const save = b.motore.slot;
  let partito;
  const inCorso = new Promise((r) => { partito = r; });
  b.motore.slot = async (azione, file) => { if (azione === 'save') { partito(); await lento; } return save(azione, file); };
  const f = await crea(b);
  await f.primaDelGiro('A');
  const salvo = f.dopoIlGiro('A', { token: 900 });
  await inCorso; // the engine is writing the snapshot right now
  const via = f.dimentica('A'); // the person deletes the conversation now
  const annullato = f.dopoIlGiro('A', { token: 900 }); // and a save still waiting in the queue (behind the deletion)
  libera();
  assert.equal((await salvo).esito, 'salvata');
  assert.equal(await via, 1);
  assert.equal((await annullato).esito, 'dimenticata', 'the save that was waiting is cancelled');
  assert.deepEqual(elenco(b.cartella).filter((x) => x.endsWith('.bin')), [], 'nothing of A is left on the disk');
  assert.equal((await f.dopoIlGiro('A', { token: 2000 })).esito, 'dimenticata', 'a save after the deletion never writes the text back');
  assert.deepEqual(elenco(b.cartella).filter((x) => x.endsWith('.bin')), []);
});

test('FC-12 the engine reopened while the identity was read (review note 5): nothing is put back, nothing is saved', async (t) => {
  const b = banco(t);
  let riapri = false;
  const f = await crea(b, { identita: async () => { if (riapri) b.motore.s.processo += 1; return ID; } });
  await f.primaDelGiro('A');
  await f.dopoIlGiro('A', { token: 900 });
  await f.primaDelGiro('B');
  riapri = true;
  assert.equal((await f.primaDelGiro('A')).esito, 'motore-cambiato');
  assert.equal(b.chiamate.filter(([a]) => a === 'restore').length, 0);
  riapri = false;
  assert.equal((await f.primaDelGiro('A')).esito, 'rimessa', 'on the new process, steady, A comes back');
  riapri = true;
  assert.equal((await f.dopoIlGiro('A', { token: 2000 })).esito, 'motore-cambiato');
  assert.equal(b.chiamate.filter(([a]) => a === 'save').length, 1);
});
