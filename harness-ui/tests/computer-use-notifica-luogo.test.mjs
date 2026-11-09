/*
 * Ritocchi dopo il treno H (computer use, 03/11/2026): la carta che toglie un luogo ricordato (`computer_use_places_remove`) nel registro
 * delle notifiche. La riga dice QUALE luogo si toglie (`dato` di genere `luogo`), ma non si approva mai dalla tendina del telefono:
 * togliere un luogo cambia i permessi futuri, quindi si guarda la carta intera (come `semprePersona`). Mobile 03/11: nella notifica va solo
 * il nome breve, mai un percorso intero (si vede anche sulla schermata bloccata). Al contrario: un comando breve e pulito resta approvabile.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs';
import { creaScrittoriNotifiche } from '../src/notifiche-scrittori.mjs';
import { creaRegistroLuoghi } from '../src/computer-use/luoghi-ricordati.mjs';
import { creaOspiteLuoghi } from '../src/computer-use/luoghi-ospite.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const T0 = Date.parse('2026-11-03T20:00:00.000Z');
const unGiro = () => new Promise((r) => setImmediate(r));

async function scrittore(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-notifica-luogo-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const notifiche = creaRegistroNotifiche({ file: join(dir, 'n.jsonl'), adesso: () => T0 });
  const s = creaScrittoriNotifiche({ registro: notifiche, adesso: () => T0 });
  const info = { sessionId: 's1', radiceId: 's1', nome: 'Una chat' };
  const fine = async () => { await unGiro(); await notifiche.attendi(); await unGiro(); await notifiche.attendi(); };
  const voce = async (requestId) => (await notifiche.elenco()).voci.find((v) => v.richiesta?.requestId === requestId);
  return { dir, s, info, fine, voce };
}

test('CU-NOTIF-LUOGO-01 removing a remembered place: the row names the place, and it is never approvable from the phone', async (t) => {
  const { dir, s, info, fine, voce } = await scrittore(t);
  /* la forma vera dell'azione, dall'ospite dei luoghi (fase anteprima), non una copia a mano */
  const luoghi = creaRegistroLuoghi({ file: join(dir, 'l.json'), adesso: () => T0 });
  await luoghi.ricorda({ domini: ['example.org'], app: [] });
  const anteprima = await creaOspiteLuoghi({ registro: luoghi })('computer_use_places_remove', { type: 'site', name: 'example.org' }, { fase: 'anteprima' });
  assert.equal(anteprima.carta, true, 'removing asks for the card');
  assert.equal(anteprima.azione.tipo, 'computer_use_places_remove');
  s.evento(info, { type: 'ApprovalRequested', requestId: 'luogo', azione: anteprima.azione });
  await fine();
  const v = await voce('luogo');
  assert.ok(v, 'the card became a row');
  assert.equal(v.azione, 'computer_use_places_remove');
  assert.deepEqual(v.dato, { genere: 'luogo', valore: 'example.org' }, 'the row says which place is removed');
  assert.notEqual(v.approvabileFuori, true, 'removing a remembered place is confirmed on the card, never from the phone shade');
});

test('CU-NOTIF-LUOGO-02 a program held as a path: the row shows only the short name, never the whole path (lock screen)', async (t) => {
  const { s, info, fine, voce } = await scrittore(t);
  const casi = {
    windows: ['C:\\Program Files\\Paint\\mspaint.exe', 'mspaint.exe'],
    posix: ['/usr/bin/gimp', 'gimp'],
    finale: ['C:\\Tools\\Editor\\', 'Editor'],
    breve: ['Esplora file', 'Esplora file'],
  };
  for (const [id, [nome]] of Object.entries(casi)) {
    s.evento(info, { type: 'ApprovalRequested', requestId: id, azione: { tipo: 'computer_use_places_remove', luogo: { tipo: 'app', nome } } });
  }
  s.evento(info, { type: 'ApprovalRequested', requestId: 'vuoto', azione: { tipo: 'computer_use_places_remove', luogo: { tipo: 'app', nome: '' } } });
  await fine();
  for (const [id, [, breve]] of Object.entries(casi)) {
    const v = await voce(id);
    assert.deepEqual(v.dato, { genere: 'luogo', valore: breve }, `${id}: only the last part of the name`);
    assert.notEqual(v.approvabileFuori, true, `${id}: never approvable from the phone`);
  }
  assert.equal((await voce('vuoto')).dato, null, 'an empty name gives no data');
});

test('CU-NOTIF-LUOGO-03 the other way round: a short clean command stays approvable, so the guard does not switch everything off', async (t) => {
  const { s, info, fine, voce } = await scrittore(t);
  s.evento(info, { type: 'ApprovalRequested', requestId: 'comando', azione: { tipo: 'shell', comando: 'npm install' } });
  /* revisione Computer use (M6): un'altra azione che porta un `luogo` non prende il dato, e la tendina resta com'era (senza dato, chiusa) */
  s.evento(info, { type: 'ApprovalRequested', requestId: 'altro', azione: { tipo: 'altro', luogo: { tipo: 'app', nome: 'x' } } });
  await fine();
  const v = await voce('comando');
  assert.deepEqual(v.dato, { genere: 'comando', valore: 'npm install' });
  assert.equal(v.approvabileFuori, true);
  const altro = await voce('altro');
  assert.equal(altro.dato, null, 'only the remove-a-place card reads luogo');
  assert.equal('approvabileFuori' in altro, false, 'the shade stays as before: no data, not approvable');
});
