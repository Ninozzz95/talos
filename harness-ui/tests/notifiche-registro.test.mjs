/*
 * Il registro delle notifiche del PC — le prove previste dal contratto (31/10/2026, bozza 2, OK di CLI, Performance e Mobile;
 * `handoff-talos-2026-09-27/in-corso/CONTRATTO-NOTIFICHE-2026-10-31.md`, «Prove previste»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, appendFile } from 'node:fs/promises';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaRegistroNotifiche, tagliaSullaParola } from '../src/notifiche-registro.mjs';

const T0 = Date.parse('2026-10-31T10:00:00.000Z');
async function cartella(t) {
  const dir = await mkdtemp(join(tmpdir(), 'notifiche-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir));
  return join(dir, 'notifiche.jsonl');
}
const permesso = (n = 1, extra = {}) => ({ id: `permesso:sessione-a:${n}`, fatto: 'approvazione', azione: 'scrivere', cosa: { tipo: 'sessione', id: 'sessione-a', nome: 'Rifattorizza il parser' }, dato: { genere: 'file', valore: `src/parser-${n}.js` }, porta: { tipo: 'sessione', id: 'sessione-a', giro: 3 }, istante: '2026-10-31T09:59:00.000Z', ...extra });

test('NOTIF-01 a stable id: the same card replayed does not create a second entry, not even after a restart', async (t) => {
  const file = await cartella(t);
  const r = creaRegistroNotifiche({ file, adesso: () => T0 });
  const prima = await r.scrivi(permesso());
  const rigiocata = await r.scrivi(permesso());
  assert.equal(rigiocata.seq, prima.seq, 'the replay changes nothing, seq included');
  assert.equal((await r.elenco()).voci.length, 1);
  const dopoIlRiavvio = creaRegistroNotifiche({ file, adesso: () => T0 });
  await dopoIlRiavvio.scrivi(permesso());
  const elenco = await dopoIlRiavvio.elenco();
  assert.equal(elenco.voci.length, 1);
  assert.equal(elenco.ultimoSeq, prima.seq);
});

test('NOTIF-02 seq moves on a state change: a client with an old cursor sees an old entry become resolved', async (t) => {
  const r = creaRegistroNotifiche({ file: await cartella(t), adesso: () => T0 });
  const a = await r.scrivi(permesso(1));
  await r.scrivi({ ...permesso(2), fatto: 'fine', azione: null });
  const cursore = (await r.elenco()).ultimoSeq;
  await r.risolvi((v) => v.id === a.id);
  const nuove = await r.elenco({ dopo: cursore });
  assert.deepEqual(nuove.voci.map((v) => [v.id, v.stato.risolto]), [[a.id, true]]);
  assert.ok(nuove.voci[0].seq > cursore);
  assert.equal(nuove.totaleDaFare, 0, 'a resolved approval no longer waits for the person');
});

test('NOTIF-03 seen-all { finoA } does not mark an entry that arrived after finoA; never «everything» without a bound', async (t) => {
  const r = creaRegistroNotifiche({ file: await cartella(t), adesso: () => T0 });
  await r.scrivi(permesso(1));
  const confine = (await r.elenco()).ultimoSeq;
  const arrivataDopo = await r.scrivi(permesso(2));
  await r.segnaVisteFinoA(confine);
  const tutte = (await r.elenco()).voci;
  assert.equal(tutte.find((v) => v.id === permesso(1).id).stato.visto, true);
  assert.equal(tutte.find((v) => v.id === arrivataDopo.id).stato.visto, false);
  await assert.rejects(r.segnaVisteFinoA(undefined), /finoA/u);
});

test('NOTIF-04 the cap never drops an entry that waits for the person and is not resolved; a cursor below a dropped entry restarts', async (t) => {
  const r = creaRegistroNotifiche({ file: await cartella(t), adesso: () => T0, tettoVoci: 3 });
  await r.scrivi(permesso(1)); // aspetta te, non risolta
  for (let i = 2; i <= 6; i++) await r.scrivi({ ...permesso(i), fatto: 'fine', azione: null });
  const elenco = await r.elenco();
  assert.ok(elenco.voci.some((v) => v.id === permesso(1).id), 'the waiting approval survived the cap');
  assert.ok(elenco.voci.length <= 3);
  assert.equal((await r.elenco({ dopo: 1 })).ripartito, true, 'entries after the cursor were dropped: the client rereads');
  // al contrario: un cursore che vede tutto ciò che c'è non riparte
  assert.equal((await r.elenco({ dopo: elenco.ultimoSeq })).ripartito, undefined);
});

test('NOTIF-05 a cursor gap made only by state changes is not a restart', async (t) => {
  const r = creaRegistroNotifiche({ file: await cartella(t), adesso: () => T0 });
  await r.scrivi(permesso(1));
  await r.scrivi(permesso(2));
  await r.segnaViste([permesso(1).id, permesso(2).id]); // seq 1 e 2 diventano 3 e 4
  assert.equal((await r.elenco({ dopo: 2 })).ripartito, undefined);
});

test('NOTIF-06 the 30 days: an old finished entry goes, an old waiting one stays', async (t) => {
  let ora = T0;
  const r = creaRegistroNotifiche({ file: await cartella(t), adesso: () => ora });
  await r.scrivi({ ...permesso(1), istante: '2026-09-01T09:00:00.000Z' });
  await r.scrivi({ ...permesso(2), fatto: 'fine', azione: null, istante: '2026-09-01T09:00:00.000Z' });
  ora = T0 + 1;
  await r.scrivi({ ...permesso(3), fatto: 'fine', azione: null });
  const ids = (await r.elenco()).voci.map((v) => v.id);
  assert.ok(ids.includes(permesso(1).id), 'waiting and unresolved: kept');
  assert.ok(!ids.includes(permesso(2).id), 'finished and 60 days old: dropped');
});

test('NOTIF-07 the time is the EVENT time; a secret in the data is hidden; the text is ≤ 240 characters cut on a word', async (t) => {
  const file = await cartella(t);
  const r = creaRegistroNotifiche({ file, adesso: () => T0, pulisciTesto: (x) => x.replace(/[*#`]/gu, '') });
  const chiave = 'sk-proj-ab12cd34ef56gh78ij90kl12mn34';
  const v = await r.scrivi({ ...permesso(1), fatto: 'risposta', dato: { genere: 'testo', valore: `**Fatto.** La chiave ${chiave} ${'parola '.repeat(60)}` } });
  assert.equal(v.istante, '2026-10-31T09:59:00.000Z');
  assert.ok(!v.dato.valore.includes(chiave), 'the key never reaches the register');
  assert.ok(!v.dato.valore.includes('**'), 'Markdown cleaned by whoever writes the register');
  assert.ok(v.dato.valore.length <= 240);
  assert.match(v.dato.valore, /parola…$/u, 'cut after a whole word');
  assert.ok(!(await readFile(file, 'utf8')).includes(chiave), 'not even on disk');
});

test('NOTIF-08 unknown fatto, cosa.tipo and porta.tipo are kept as they are, never an error', async (t) => {
  const r = creaRegistroNotifiche({ file: await cartella(t), adesso: () => T0 });
  const v = await r.scrivi({ id: 'nuovo:x:1', fatto: 'qualcosa-di-nuovo', cosa: { tipo: 'cosa-nuova', id: 'x', nome: 'Una cosa' }, porta: { tipo: 'porta-nuova', id: 'x' } });
  assert.equal(v.fatto, 'qualcosa-di-nuovo');
  assert.equal(v.cosa.tipo, 'cosa-nuova');
  assert.equal(v.porta.tipo, 'porta-nuova');
  assert.equal((await r.elenco()).totaleDaFare, 0, 'an unknown fact does not wait for the person');
});

test('NOTIF-09 the list gives at most 100 entries, oldest first, and says there are more', async (t) => {
  const r = creaRegistroNotifiche({ file: await cartella(t), adesso: () => T0 });
  for (let i = 1; i <= 105; i++) await r.scrivi({ ...permesso(i), fatto: 'fine', azione: null });
  const primo = await r.elenco();
  assert.equal(primo.voci.length, 100);
  assert.equal(primo.altre, true);
  assert.equal(primo.voci[0].id, permesso(1).id);
  const secondo = await r.elenco({ dopo: primo.voci.at(-1).seq });
  assert.equal(secondo.voci.length, 5);
  assert.equal(secondo.altre, false);
});

test('NOTIF-10 a torn last line (an interrupted write) does not stop the register', async (t) => {
  const file = await cartella(t);
  const r = creaRegistroNotifiche({ file, adesso: () => T0 });
  await r.scrivi(permesso(1));
  await appendFile(file, '{"id":"permesso:sessione-a:2","fatto":"appro', 'utf8');
  const dopo = creaRegistroNotifiche({ file, adesso: () => T0 });
  assert.equal((await dopo.elenco()).voci.length, 1);
});

test('NOTIF-11 tagliaSullaParola keeps short text as it is and never cuts inside a word', () => {
  assert.equal(tagliaSullaParola('  breve   testo '), 'breve testo');
  const lungo = tagliaSullaParola('abcdefghij '.repeat(40), 50);
  assert.ok(lungo.length <= 50);
  assert.match(lungo, /abcdefghij…$/u);
});

test('NOTIF-12 the notice leaves only after the entry is on disk, with the to-do count; a broken listener stops nothing', async (t) => {
  const file = await cartella(t);
  const r = creaRegistroNotifiche({ file, adesso: () => T0 });
  const visti = [];
  r.ascolta(() => { throw new Error('ascoltatore rotto'); });
  const smetti = r.ascolta((avviso) => { visti.push({ avviso, sulDisco: readFileSync(file, 'utf8').includes(avviso.voce.id) }); });
  await r.scrivi(permesso(1));
  await r.segnaViste(['permesso:sessione-a:1']);
  assert.equal(visti.length, 2);
  assert.ok(visti.every((x) => x.sulDisco), 'whoever rereads after the notice finds the entry on disk');
  assert.deepEqual(visti.map((x) => [x.avviso.voce.seq, x.avviso.ultimoSeq, x.avviso.totaleDaFare]), [[1, 1, 1], [2, 2, 1]]);
  smetti();
  await r.scrivi(permesso(2));
  assert.equal(visti.length, 2, 'after smetti() nothing more arrives');
  assert.deepEqual(await r.riassunto(), { ultimoSeq: 3, totaleDaFare: 2 });
});
