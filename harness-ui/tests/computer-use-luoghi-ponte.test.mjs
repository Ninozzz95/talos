/*
 * I luoghi di «Consenti sempre» dal dispositivo (Mobile, 03/11/2026): `computer-use.places.list/remove/clear` chiamano le stesse rotte
 * della finestra. Togliere va nel verso sicuro: basta un dispositivo abbinato, niente consenso di cartella. Nessuna operazione aggiunge.
 * Ogni rimozione vera diventa una notifica sul PC col nome del dispositivo; una rimozione a vuoto no.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs';
import { creaRegistroLuoghi } from '../src/computer-use/luoghi-ricordati.mjs';
import { creaOperazioni, OPERAZIONI_LUOGHI } from '../src/remoto/operazioni.mjs';

const PAD = { dispositivo: { id: 'dispositivo-A1', nome: 'Pad' }, iscrizioni: new Map() };

async function prepara(t, { conLuoghi = true, conNotifiche = true, notificheRotte = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'luoghi-ponte-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir));
  let tt = Date.parse('2026-11-03T10:00:00.000Z');
  const luoghi = conLuoghi ? creaRegistroLuoghi({ file: join(dir, 'l.json'), adesso: () => (tt += 1000) }) : null;
  if (luoghi) await luoghi.ricorda({ domini: ['luce.example', 'negozio.example'], app: ['Esplora file'] });
  const vere = conNotifiche ? creaRegistroNotifiche({ file: join(dir, 'n.jsonl') }) : null;
  const notifiche = notificheRotte ? { scrivi: async () => { throw new Error('disco'); } } : vere;
  const chiamate = [];
  const cartelle = { consentita: async () => { chiamate.push('consentita'); return false; }, descrivi: async () => null };
  const op = creaOperazioni({ chiama: async (x) => { chiamate.push(x.percorso); return { dati: null }; }, sessionRegistry: null, iscriviConRigiocata: null, cartelle, notifiche, luoghi });
  return { luoghi, notifiche: vere, op, chiamate };
}

test('LUOGHI-PONTE-01: si legge e si toglie da un dispositivo abbinato, senza consenso di cartella; la risposta porta l\'elenco nuovo', async (t) => {
  const { luoghi, op, chiamate } = await prepara(t);
  assert.equal((await op.esegui('computer-use.places.list', {}, PAD)).voci.length, 3);
  const tolto = await op.esegui('computer-use.places.remove', { tipo: 'dominio', nome: 'luce.example' }, PAD);
  assert.deepEqual([tolto.tolti, tolto.voci.map((v) => v.nome).sort()], [1, ['Esplora file', 'negozio.example']]);
  assert.deepEqual((await luoghi.perIlCiclo()).domini, ['negozio.example']);
  const vuoto = await op.esegui('computer-use.places.clear', { conferma: true }, PAD);
  assert.deepEqual([vuoto.tolti, vuoto.voci], [2, []]);
  assert.deepEqual(chiamate, [], 'nessun consenso chiesto, nessuna rotta del PC chiamata');
  for (const nome of OPERAZIONI_LUOGHI) assert.ok(op.elenco().includes(nome), nome);
});

test('LUOGHI-PONTE-02: ogni rimozione vera è una notifica sul PC col dispositivo; a vuoto nessuna; una notifica persa non annulla la rimozione', async (t) => {
  const { notifiche, op } = await prepara(t);
  await op.esegui('computer-use.places.remove', { tipo: 'dominio', nome: 'altro.example' }, PAD);
  assert.equal((await notifiche.elenco({ dopo: 0 })).voci.length, 0, 'a vuoto nessuna notifica');
  await op.esegui('computer-use.places.remove', { tipo: 'dominio', nome: 'luce.example' }, PAD);
  await op.esegui('computer-use.places.clear', { conferma: true }, PAD);
  const voci = (await notifiche.elenco({ dopo: 0 })).voci;
  assert.deepEqual(voci.map((v) => [v.fatto, v.azione, v.cosa.tipo, v.cosa.id, v.cosa.nome, v.dato?.valore]),
    [['luoghi-ricordati', 'tolto', 'dispositivo', 'dispositivo-A1', 'Pad', 'luce.example'], ['luoghi-ricordati', 'svuotati', 'dispositivo', 'dispositivo-A1', 'Pad', '2']]);
  assert.ok(voci.every((v) => v.stato.risolto === true && v.stato.visto === false), 'da vedere, non da fare');
  assert.equal((await notifiche.elenco({ dopo: 0 })).totaleDaFare, 0);
  const rotte = await prepara(t, { notificheRotte: true });
  assert.equal((await rotte.op.esegui('computer-use.places.remove', { tipo: 'dominio', nome: 'luce.example' }, PAD)).tolti, 1);
  assert.deepEqual((await rotte.luoghi.perIlCiclo()).domini, ['negozio.example']);
});

test('LUOGHI-PONTE-03 AL CONTRARIO: svuota senza conferma, corpi storti, nessuna operazione che aggiunge, nessun dispositivo', async (t) => {
  const { luoghi, op } = await prepara(t);
  for (const [nome, args] of [['computer-use.places.clear', {}], ['computer-use.places.clear', { conferma: 'si' }], ['computer-use.places.remove', { tipo: 'sito', nome: 'x' }],
    ['computer-use.places.remove', { tipo: 'dominio' }], ['computer-use.places.remove', null], ['computer-use.places.remove', { tipo: 'dominio', nome: 'luce.example', altro: 1 }]]) {
    await assert.rejects(op.esegui(nome, args, PAD), (e) => e.code === 'QUERY_INVALID' && e.stato === 400, `${nome} ${JSON.stringify(args)}`);
  }
  await assert.rejects(op.esegui('computer-use.places.add', { tipo: 'dominio', nome: 'x.example' }, PAD), (e) => e.code === 'UNKNOWN_OPERATION');
  await assert.rejects(op.esegui('computer-use.places.list', {}, { dispositivo: {}, iscrizioni: new Map() }), (e) => e.code === 'UNKNOWN_OPERATION', 'senza dispositivo');
  assert.equal((await luoghi.perIlCiclo()).domini.length, 2);
});

test('LUOGHI-PONTE-04: un PC senza registro risponde come un PC vecchio; senza notifiche si toglie lo stesso', async (t) => {
  const { op } = await prepara(t, { conLuoghi: false });
  for (const nome of OPERAZIONI_LUOGHI) {
    assert.ok(!op.elenco().includes(nome), nome);
    await assert.rejects(op.esegui(nome, {}, PAD), (e) => e.code === 'UNKNOWN_OPERATION');
  }
  const senza = await prepara(t, { conNotifiche: false });
  assert.equal((await senza.op.esegui('computer-use.places.remove', { tipo: 'app', nome: 'Esplora file' }, PAD)).tolti, 1);
});
