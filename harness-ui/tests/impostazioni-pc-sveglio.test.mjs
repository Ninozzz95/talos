/* 01/11/2026, «Tieni sveglio il PC»: la scelta sul server, le sue due rotte e il guardiano che la applica. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { createImpostazioniPcSveglio, validaModoPcSveglio } from '../src/impostazioni-pc-sveglio.mjs';
import { creaAvvisoSveglio } from '../src/pc-sveglio.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const cartella = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-sveglio-imp-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };

test('IPS-1 the default is «mentre-lavora»; a saved mode survives a restart; a broken file is the default and says it', async (t) => {
  const file = join(cartella(t), 'pc.json');
  const avvisi = [];
  const prima = createImpostazioniPcSveglio({ file, avvisa: (m) => avvisi.push(m) });
  assert.equal(prima.modoAdesso(), 'mentre-lavora');
  assert.deepEqual(await prima.scrivi({ modo: 'sempre' }), { modo: 'sempre' });
  assert.match(readFileSync(file, 'utf8'), /"schema": "talos.keep-awake-settings.v1"/u);
  assert.equal(createImpostazioniPcSveglio({ file }).modoAdesso(), 'sempre', 'read again after a restart');
  writeFileSync(file, '{ rotto');
  assert.equal(createImpostazioniPcSveglio({ file, avvisa: (m) => avvisi.push(m) }).modoAdesso(), 'mentre-lavora');
  assert.equal(avvisi.length, 1);
});

test('IPS-2 the other way: anything but the three modes is refused and nothing is written', async (t) => {
  const file = join(cartella(t), 'pc.json');
  const s = createImpostazioniPcSveglio({ file });
  for (const v of [{ modo: 'boh' }, { modo: 'sempre', altro: 1 }, null, [], { modo: true }]) {
    await assert.rejects(s.scrivi(v), (e) => e.code === 'KEEP_AWAKE_SETTINGS_INVALID');
  }
  assert.equal(s.modoAdesso(), 'mentre-lavora');
  assert.deepEqual(validaModoPcSveglio({ schema: 'x', modo: 'mai' }), { modo: 'mai' });
});

async function app(t, opzioni) {
  const server = createServer(createHttpApp({ senzaGettone: 'prove', ...opzioni }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/keep-awake-settings`;
  return {
    leggi: async () => { const r = await fetch(base); return { stato: r.status, corpo: await r.json() }; },
    salva: async (corpo) => { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); return { stato: r.status, corpo: await r.json() }; },
  };
}

test('IPS-3 the routes: GET says the mode and whether this is the installed app; POST saves only a valid mode', async (t) => {
  const impostazioniPcSveglio = createImpostazioniPcSveglio({ file: join(cartella(t), 'pc.json') });
  const r = await app(t, { impostazioniPcSveglio, nellAppInstallata: () => true });
  assert.deepEqual((await r.leggi()).corpo.data, { modo: 'mentre-lavora', nellApp: true });
  const salvato = await r.salva({ modo: 'mai' });
  assert.equal(salvato.stato, 200);
  assert.deepEqual(salvato.corpo.data, { modo: 'mai', nellApp: true });
  assert.equal(impostazioniPcSveglio.modoAdesso(), 'mai', 'the keep-awake loop reads it at once');
  const rifiuto = await r.salva({ modo: 'boh' });
  assert.equal(rifiuto.stato, 400);
  assert.equal(impostazioniPcSveglio.modoAdesso(), 'mai');
});

test('IPS-4 outside the installed app nellApp is false; without the store the route says it is not available', async (t) => {
  const fuori = await app(t, { impostazioniPcSveglio: createImpostazioniPcSveglio({ file: join(cartella(t), 'pc.json') }) });
  assert.equal((await fuori.leggi()).corpo.data.nellApp, false);
  const senza = await app(t, {});
  const r = await senza.leggi();
  assert.notEqual(r.stato, 200);
  assert.ok(r.corpo.error, 'an error envelope, as the sister route «command-settings» does (its code is normalized by the server)');
});

test('IPS-5 the keep-awake loop follows the saved mode at the next look', async (t) => {
  const s = createImpostazioniPcSveglio({ file: join(cartella(t), 'pc.json') });
  const detti = [];
  const a = creaAvvisoSveglio({ giriAlLavoro: () => 0, modo: () => s.modoAdesso(), manda: (m) => detti.push(m.acceso), ripeti: () => ({}) });
  a.guarda();
  await s.scrivi({ modo: 'sempre' });
  a.guarda();
  assert.deepEqual(detti, [false, true]);
});
