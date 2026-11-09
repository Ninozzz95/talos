import assert from 'node:assert/strict';
import test from 'node:test';
import { GIORNI_DI_ATTESA, frase, leggiRilasci, numeriDi, verdettoVersione } from '../scripts/controlla-versione-motore.mjs';

const GIORNO = 86_400_000;
const ORA = Date.parse('2026-11-10T12:00:00Z');
const rilascio = (tag, giorniFa, extra = {}) => ({ tag_name: tag, prerelease: false, draft: false, published_at: new Date(ORA - giorniFa * GIORNO).toISOString(), ...extra });
const FISSATA = { versione: '0.7.0' };

test('CVM-1 a stable newer than the pin and older than 7 days is the candidate; the newest mature one wins', () => {
  const v = verdettoVersione([rilascio('v0.7.1', 20), rilascio('v0.8.0', 13), rilascio('v0.7.0', 30)], FISSATA, ORA);
  assert.equal(v.esito, 'candidata');
  assert.deepEqual(v.candidata, { tag: 'v0.8.0', giorni: 13 });
  assert.match(frase(v), /v0\.8\.0, uscita da 13 giorni\. Entra solo se il banco/u);
});

test('CVM-2 younger than 7 days: not a candidate, it is said with the day it matures', () => {
  const v = verdettoVersione([rilascio('v0.8.0', GIORNI_DI_ATTESA - 1)], FISSATA, ORA);
  assert.equal(v.esito, 'aggiornata');
  assert.equal(v.candidata, null);
  assert.equal(v.inAttesa[0].tag, 'v0.8.0');
  assert.equal(v.inAttesa[0].maturaIl.slice(0, 10), '2026-11-11');
  const esattiSette = verdettoVersione([rilascio('v0.8.0', GIORNI_DI_ATTESA)], FISSATA, ORA);
  assert.equal(esattiSette.esito, 'candidata', 'at exactly 7 days it is mature');
});

test('CVM-3 the other way: nightly builds, drafts, pre-releases, older or equal versions and broken dates never count', () => {
  const v = verdettoVersione([
    rilascio('b11960', 30), rilascio('v0.9.0', 30, { prerelease: true }), rilascio('v0.9.1', 30, { draft: true }),
    rilascio('v0.6.9', 30), rilascio('v0.7.0', 30), { tag_name: 'v0.9.2', prerelease: false, draft: false, published_at: 'ieri' }, null,
  ], FISSATA, ORA);
  assert.equal(v.esito, 'aggiornata');
  assert.equal(v.candidata, null);
  assert.deepEqual(v.inAttesa, []);
  assert.match(frase(v), /è l'ultima stabile matura/u);
});

test('CVM-4 numbers compare as numbers, not as text: v0.10.0 is newer than v0.9.0', () => {
  const v = verdettoVersione([rilascio('v0.9.0', 40), rilascio('v0.10.0', 10)], { versione: '0.9.0' }, ORA);
  assert.deepEqual(v.candidata, { tag: 'v0.10.0', giorni: 10 });
  const due = verdettoVersione([rilascio('v0.9.0', 40), rilascio('v0.10.0', 10)], { versione: '0.8.0' }, ORA);
  assert.deepEqual(due.candidata, { tag: 'v0.10.0', giorni: 10 }, 'two mature ones: the newest by number, though "v0.9.0" sorts after "v0.10.0" as text');
  assert.deepEqual(numeriDi('v1.2.3'), [1, 2, 3]);
  assert.equal(numeriDi('v1.2'), null);
  assert.equal(numeriDi('1.2.3'), null);
});

test('CVM-6 sixth review B1: pages are read until one holds a stable not newer than the pin, so a 7-day-old stable is seen', async () => {
  const notturne = (n, giorni) => Array.from({ length: n }, (_, i) => rilascio(`b${12000 - i}`, giorni, { prerelease: true }));
  const pagine = [[...notturne(99, 1), rilascio('v0.8.0', 3)], [...notturne(100, 5)], [...notturne(99, 8), rilascio('v0.7.0', 30)], [rilascio('v0.6.0', 60)]];
  const lette = [];
  const fetchFn = async (url) => { const p = Number(new URL(url).searchParams.get('page')); lette.push(p); return { ok: true, json: async () => pagine[p - 1] ?? [] }; };
  const tutti = await leggiRilasci({ fetchFn, fissata: { versione: '0.7.0' } });
  assert.deepEqual(lette, [1, 2, 3], 'it stops at the page with the pin');
  assert.equal(tutti.length, 300);
  const pocheNotturne = await leggiRilasci({ fetchFn: async (url) => ({ ok: true, json: async () => (new URL(url).searchParams.get('page') === '1' ? [rilascio('v0.8.0', 9)] : []) }), fissata: { versione: '0.7.0' } });
  assert.equal(verdettoVersione(pocheNotturne, { versione: '0.7.0' }, ORA).candidata.tag, 'v0.8.0', 'an empty page ends the reading');
  await assert.rejects(leggiRilasci({ fetchFn: async () => ({ ok: false, status: 403 }), fissata: { versione: '0.7.0' } }), /HTTP 403/u);
});

test('CVM-5 a pin that cannot be read is said, never taken as up to date; no list is no candidate', () => {
  assert.equal(verdettoVersione([rilascio('v0.8.0', 30)], { versione: 'boh' }, ORA).esito, 'illeggibile');
  assert.equal(verdettoVersione(null, FISSATA, ORA).esito, 'aggiornata');
});
