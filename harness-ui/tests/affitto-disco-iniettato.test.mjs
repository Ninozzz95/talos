import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { rinumeraGiornale } from '../src/rinumerazione-giornale.mjs';
import * as store from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 13/11/2026 sera — DISCO PIENO e PERMESSI solo INIETTATI nel processo sotto prova (ENOSPC, EACCES, EIO, EPERM), mai un disco vero
 *   riempito. COPIATE e adattate dalle prove del revisore affitto 1 di 3 (`C:/T/rev-aff1-copia/harness-ui/tests/zz-rev-aff1-disco.test.mjs`,
 *   sola lettura) al limite del giudice v1805: una copia a metà ora si SEGNA (`.a-meta`) e si dichiara nell'esito, mai col nome buono;
 *   le copie non si tolgono mai; un temporaneo che nemmeno la cancellazione toglie lo toglie il ripristino dopo, col nome esatto e con
 *   l'affitto. A ogni guasto: il giornale resta quello di prima byte per byte.
 */
const cartella = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-disco-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const errore = (code) => Object.assign(new Error(`${code}: injected`), { code });
const ID = '7e7e7e7e-7e7e-4e7e-8e7e-7e7e7e7e7e7e';
const BUONA = new RegExp(`^${ID}\\.jsonl\\.prima-della-rinumerazione-\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d-\\d\\d-\\d{3}Z$`);
function scrivi(d, mb = 1) {
  const righe = [JSON.stringify({ tipo: 'intestazione', schema: 1, sessionId: ID, taskId: 'libero:disco', cartella: d, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    avviataAlle: '2026-11-13T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true })];
  const tot = Math.floor((mb * 1024 * 1024) / 300);
  for (let i = 0; i < tot; i += 1) righe.push(JSON.stringify({ type: 'CUSTOM', name: 'talos.nota', value: { i, t: `riga ${i} ${'x'.repeat(220)}` }, _sequenza: i < tot / 2 ? i + 1 : i + 1 - Math.floor(tot / 4) }));
  const p = join(d, `${ID}.jsonl`);
  writeFileSync(p, righe.map((r) => `${r}\n`).join(''));
  return p;
}
const vicini = (d) => readdirSync(d).filter((n) => n !== `${ID}.jsonl` && !n.startsWith('.'));

const CASI = [
  ['copy ENOSPC before writing', { copyFileFn: async () => { throw errore('ENOSPC'); } }],
  ['copy ENOSPC half way (half a copy on the disk)', { copyFileFn: async (a, b) => { const buf = readFileSync(a); writeFileSync(b, buf.subarray(0, buf.length >> 1), { flag: 'wx' }); throw errore('ENOSPC'); } }],
  ['copy EACCES', { copyFileFn: async () => { throw errore('EACCES'); } }],
  ['stat EACCES in the check', { statFn: async () => { throw errore('EACCES'); } }],
  ['fingerprint EIO', { improntaFn: async () => { throw errore('EIO'); } }],
  ['naming the verified copy EACCES', { rinominaCopiaFn: async () => { throw errore('EACCES'); } }],
  ['temporary open EACCES', { openFn: async () => { throw errore('EACCES'); } }],
  ['temporary open ENOSPC', { openFn: async () => { throw errore('ENOSPC'); } }],
  ['write ENOSPC at the first block', { scriviFn: async () => { throw errore('ENOSPC'); } }],
  ['write ENOSPC at the second block', () => { let n = 0; return { scriviFn: async (fh, buf) => { n += 1; if (n === 2) throw errore('ENOSPC'); return fh.write(buf); } }; }],
  ['partial write then ENOSPC', () => { let n = 0; return { scriviFn: async (fh, buf) => { n += 1; if (n === 2) { await fh.write(buf.subarray(0, 100)); throw errore('ENOSPC'); } return fh.write(buf); } }; }],
  ['fsync ENOSPC', { fsyncFn: async () => { throw errore('ENOSPC'); } }],
  ['fsync EIO', { fsyncFn: async () => { throw errore('EIO'); } }],
  ['rename EACCES for ever', { renameFn: async () => { throw errore('EACCES'); } }],
  ['rename EPERM for ever', { renameFn: async () => { throw errore('EPERM'); } }],
  ['rename ENOSPC', { renameFn: async () => { throw errore('ENOSPC'); } }],
  ['rename EACCES and unlink EACCES too (the temporary stays)', { renameFn: async () => { throw errore('EACCES'); }, unlinkFn: async () => { throw errore('EACCES'); } }],
];

for (const [nome, fabbrica] of CASI) {
  test(`DISCO: ${nome}: the journal of before, no good-named copy that is not whole, every other copy declared and kept`, async (t) => {
    const deps = typeof fabbrica === 'function' ? fabbrica() : fabbrica;
    const d = cartella(t);
    const p = scrivi(d);
    const prima = sha(p);
    const esito = await rinumeraGiornale(p, deps, { rigaFinale: () => ({ type: 'CUSTOM', name: 'talos.journal-riparato', value: {} }) });
    const accanto = vicini(d);
    const copie = accanto.filter((n) => n.includes('.prima-della-rinumerazione-'));
    const buone = copie.filter((n) => BUONA.test(n));
    const altre = copie.filter((n) => !BUONA.test(n));
    const temp = accanto.filter((n) => n.endsWith('.rinumerazione'));
    t.diagnostic(`esito ${JSON.stringify({ ...esito, copia: esito.copia ? 'si' : esito.copia })} buone ${buone.length} altre ${JSON.stringify(altre.map((n) => n.slice(-30)))} dimensioni ${copie.map((n) => statSync(join(d, n)).size).join('/')} temp ${temp.length}`);
    assert.equal(esito.rinumerato, false);
    assert.equal(sha(p), prima, 'the journal is the one of before, byte for byte');
    for (const n of buone) assert.equal(sha(join(d, n)), prima, `a good-named copy is the whole journal (${n})`);
    const dichiarate = [esito.copiaAMeta, esito.copiaDaVerificare].filter(Boolean).map((x) => x.split(/[\\/]/).pop());
    for (const n of altre) assert.ok(dichiarate.includes(n), `a copy that is not good is declared in the outcome (${n}; declared ${JSON.stringify(dichiarate)})`);
    if (nome.startsWith('copy ENOSPC half way')) assert.match(esito.copiaAMeta ?? '', /\.a-meta$/, 'the half copy is MARKED');
    if (nome.includes('unlink EACCES')) {
      assert.equal(temp.length, 1, 'the temporary could not be removed here');
      store.attivaAffittiArchivio(d, { etichetta: 'disco', battitoMs: 0 });
      t.after(() => store.disattivaAffittiArchivio(d));
      const nomi = store.avanziDellArchivio({ cartellaStore: d }).get(ID);
      const avanzi = await store.avanziDellaRinumerazione({ cartellaStore: d, sessionId: ID, nomi });
      assert.equal(avanzi.temporaneiTolti, 1, 'the restore after removes OUR temporary (exact name, lease in hand)');
      assert.deepEqual(vicini(d).filter((n) => n.endsWith('.rinumerazione')), []);
      assert.equal(vicini(d).filter((n) => n.includes('.prima-della-rinumerazione-')).length, copie.length, 'and no copy');
    } else {
      assert.equal(temp.length, 0, 'no temporary left');
    }
  });
}

test('DISCO-R (from the reviewer): through the RESTORE, rename EACCES for ever: the chat reads the journal as it is (disk order), nothing lost, the journal unchanged', async (t) => {
  const d = cartella(t);
  const p = scrivi(d, 1);
  const prima = sha(p);
  const righePrima = readFileSync(p, 'utf8').split('\n').filter(Boolean).length;
  store.attivaAffittiArchivio(d, { etichetta: 'rev', battitoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(d));
  const registro = createSessionRegistry({ cartellaStore: d, affittoFraProcessi: { etichetta: 'rev' }, avviaSessioneFn: async () => ({ ok: true }),
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    rinumeraGiornaleFn: (a) => store.rinumeraDoppiDelGiornale(a, { renameFn: async () => { throw errore('EACCES'); } }) });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  await store.attendiScritture({ cartellaStore: d, sessionId: ID });
  const v = registro.esporta(ID);
  const note = v.eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.nota').map((e) => e.value.i);
  assert.equal(sha(p), prima);
  assert.deepEqual(note, [...note].sort((a, b) => a - b), 'disk order kept in memory');
  assert.equal(note.length, righePrima - 1, 'every line in memory');
  assert.equal(v.eventi.filter((e) => e.name === 'talos.journal-riparato').length, 0, 'no «recovered» line for a renumbering that did not happen');
});
