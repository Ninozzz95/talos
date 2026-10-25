/*
 * 23/10/2026 sera — R5.12, le cartelle dei dispositivi col consenso del PC (contratto `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-
 *   2026-10-23.md`, parte 1, revisione 1). Il modulo da solo: elenco, id non indovinabili, consenso per dispositivo e cartella,
 *   giunzioni, scadenza, tetto, avvio tenuto dal PC, revoca, dimentica. Cartelle temporanee vere, nessuna porta.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { ATTESA_CONSENSO_MS, creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function ambiente(t, { recenti = [], ammesse = [], escluse = [] } = {}) {
  // 25/10/2026 (PR #81 della 0.1.37, CI rossa): sul runner la TEMP ha il nome corto di Windows (RUNNER~1); il prodotto mostra il percorso vero (`realpathSync.native`, decisione F-E-001), quindi anche la radice di prova si prende col percorso vero, e l'atteso torna uguale su ogni macchina.
  const radice = realpathSync.native(cartellaDiProva('talos-cartelle-disp-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const dati = join(radice, 'dati');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return p; };
  let ora = Date.parse('2026-10-23T18:00:00.000Z');
  const clock = () => ora;
  const avanza = (ms) => { ora += ms; };
  const registro = { cartellePiuUsate: () => recenti.map((r) => (typeof r === 'string' ? { percorso: join(radice, r), conteggio: 1, ultimaVolta: '2026-10-23T10:00:00.000Z' } : { ...r, percorso: join(radice, r.percorso) })) };
  const nuovo = () => creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry: registro, cartelleAmmesse: ammesse.map((a) => join(radice, a)), cartelleEscluse: [dati, ...escluse.map((e) => join(radice, e))], clock });
  return { radice, dati, crea, nuovo, avanza, clock };
}

test('CD-01 — l\'elenco: le cartelle recenti che esistono, più recente prima; MAI la cartella del programma né quella dei dati; nessun percorso; AL CONTRARIO una cartella sparita non c\'è', async (t) => {
  const a = ambiente(t, { recenti: [{ percorso: 'progetti/AVM', ultimaVolta: '2026-10-23T09:00:00.000Z' }, { percorso: 'progetti/app', ultimaVolta: '2026-10-23T11:00:00.000Z' }, 'programma/resources', 'sparita'], escluse: ['programma'] });
  a.crea('progetti', 'AVM'); a.crea('progetti', 'app'); a.crea('programma', 'resources');
  const elenco = await a.nuovo().elenco('disp-A');
  assert.deepEqual(elenco.map((r) => r.nome), ['app', 'AVM'], JSON.stringify(elenco));
  assert.ok(elenco.every((r) => /^[A-Za-z0-9_-]{32}$/u.test(r.cartellaId) && r.consentita === false));
  assert.ok(!JSON.stringify(elenco).includes(a.radice.replace(/\\/g, '\\\\')) && !JSON.stringify(elenco).includes('progetti'), 'nessun percorso, nemmeno a pezzi');
});

test('CD-02 — l\'id è un HMAC col segreto del PC: stabile a un riavvio, diverso da un hash del percorso, diverso con un altro segreto', async (t) => {
  const a = ambiente(t, { recenti: ['progetti/AVM'] });
  const p = a.crea('progetti', 'AVM');
  const primo = (await a.nuovo().elenco('d'))[0].cartellaId;
  assert.equal((await a.nuovo().elenco('d'))[0].cartellaId, primo, 'stabile: il segreto è nella cartella dei dati');
  const chiaveP = process.platform === 'win32' ? p.toLowerCase() : p;
  for (const algoritmo of ['sha256', 'sha1', 'md5']) {
    for (const forma of ['hex', 'base64url']) assert.ok(!createHash(algoritmo).update(chiaveP).digest(forma).startsWith(primo.slice(0, 16)), `non è un ${algoritmo} del percorso`);
  }
  assert.match(readFileSync(join(a.dati, 'remoto', 'segreto-cartelle'), 'utf8'), /^[0-9a-f]{64}$/u);
  rmSync(join(a.dati, 'remoto', 'segreto-cartelle'));
  assert.notEqual((await a.nuovo().elenco('d'))[0].cartellaId, primo, 'AL CONTRARIO: un altro segreto, un altro id');
});

test('CD-03 — il consenso: si chiede, il PC dice sì, vale per QUEL dispositivo e quella cartella, resta dopo un riavvio; AL CONTRARIO un altro dispositivo no', async (t) => {
  const a = ambiente(t, { recenti: ['progetti/AVM'] });
  const avm = a.crea('progetti', 'AVM');
  const c = a.nuovo();
  const [riga] = await c.elenco('disp-A');
  assert.equal(await c.consentita('disp-A', avm), false);
  const richiesta = await c.chiedi({ dispositivoId: 'disp-A', nomeDispositivo: 'OnePlus Pad 3', cartellaId: riga.cartellaId });
  assert.deepEqual([richiesta.stato, richiesta.attesaMs], ['attesa-consenso', ATTESA_CONSENSO_MS]);
  const [carta] = c.inAttesa();
  assert.deepEqual([carta.nomeDispositivo, carta.nome, carta.percorso], ['OnePlus Pad 3', 'AVM', avm], 'la carta del PC ha il percorso intero');
  assert.deepEqual(await c.rispondi(richiesta.richiestaId, 'consentita'), { esito: 'consentita' });
  assert.equal(await c.consentita('disp-A', avm), true);
  assert.equal((await c.elenco('disp-A'))[0].consentita, true);
  assert.equal(await a.nuovo().consentita('disp-A', avm), true, 'resta dopo un riavvio');
  assert.equal(await c.consentita('disp-B', avm), false, 'AL CONTRARIO: è per dispositivo');
  assert.equal((await c.elenco('disp-B'))[0].consentita, false);
});

test('CD-04 — una giunzione cambiata DOPO il consenso non porta il consenso altrove; AL CONTRARIO la cartella vera resta consentita', async (t) => {
  const a = ambiente(t, { recenti: ['vero'] });
  const vero = a.crea('vero');
  const altra = a.crea('altra');
  const c = a.nuovo();
  const r = await c.chiedi({ dispositivoId: 'd', cartellaId: (await c.elenco('d'))[0].cartellaId });
  await c.rispondi(r.richiestaId, 'consentita');
  assert.equal(await c.consentita('d', vero), true);
  /* la cartella consentita viene sostituita da una giunzione verso un'altra */
  rmdirSync(vero); // vuota: nata qui sopra, niente dentro
  symlinkSync(altra, vero, 'junction');
  assert.equal(await c.consentita('d', vero), false, 'il percorso reale ora è un altro: niente consenso');
  assert.equal(await c.consentita('d', altra), false, 'e l\'altra cartella non lo eredita');
});

test('CD-05 — la scadenza: dopo 2 minuti la richiesta è «scaduta», la risposta tardiva non ha effetto; e una risposta due volte nemmeno', async (t) => {
  const a = ambiente(t, { recenti: ['progetti/AVM', 'progetti/app'] });
  const avm = a.crea('progetti', 'AVM'); a.crea('progetti', 'app');
  const c = a.nuovo();
  const [x, y] = await c.elenco('d');
  const r1 = await c.chiedi({ dispositivoId: 'd', cartellaId: x.cartellaId });
  a.avanza(ATTESA_CONSENSO_MS + 1);
  assert.deepEqual(await c.attendi('d', r1.richiestaId, { ms: 10 }), { esito: 'scaduta' });
  await assert.rejects(c.rispondi(r1.richiestaId, 'consentita'), { code: 'CONSENT_NOT_PENDING' });
  assert.equal(await c.consentita('d', avm), false, 'la risposta tardiva non ha consentito niente');
  const r2 = await c.chiedi({ dispositivoId: 'd', cartellaId: y.cartellaId });
  await c.rispondi(r2.richiestaId, 'negata');
  await assert.rejects(c.rispondi(r2.richiestaId, 'consentita'), { code: 'CONSENT_NOT_PENDING' }, 'una richiesta già decisa non cambia');
  assert.deepEqual(await c.attendi('d', r2.richiestaId), { esito: 'negata' });
  await assert.rejects(c.attendi('altro', r2.richiestaId), { code: 'NOT_FOUND' }, 'solo chi ha chiesto la può attendere');
});

test('CD-06 — l\'attesa lunga si sveglia alla risposta; l\'avvio tenuto dal PC parte UNA volta e il suo sessionId è nell\'esito, anche richiamando l\'attesa', async (t) => {
  const a = ambiente(t, { recenti: ['progetti/AVM'] });
  a.crea('progetti', 'AVM');
  const c = a.nuovo();
  let avvii = 0;
  const r = await c.chiedi({ dispositivoId: 'd', cartellaId: (await c.elenco('d'))[0].cartellaId, avvio: async () => { avvii += 1; return 'sessione-1'; } });
  const attesa = c.attendi('d', r.richiestaId, { ms: 5_000 });
  setTimeout(() => { c.rispondi(r.richiestaId, 'consentita'); }, 20);
  assert.deepEqual(await attesa, { esito: 'consentita', sessionId: 'sessione-1' });
  assert.deepEqual(await c.attendi('d', r.richiestaId), { esito: 'consentita', sessionId: 'sessione-1' }, 'richiamata dopo una caduta: lo stesso');
  assert.equal(avvii, 1);
  /* senza risposta entro la chiamata: «attesa», e la richiesta resta */
  const c2 = ambiente(t, { recenti: ['p'] });
  c2.crea('p');
  const m = c2.nuovo();
  const r2 = await m.chiedi({ dispositivoId: 'd', cartellaId: (await m.elenco('d'))[0].cartellaId });
  assert.deepEqual(await m.attendi('d', r2.richiestaId, { ms: 20 }), { stato: 'attesa' });
  assert.equal(m.inAttesa().length, 1);
});

test('CD-07 — una richiesta per dispositivo e cartella (la stessa torna), al più 3 aperte per dispositivo; un id che non c\'è è FOLDER_NOT_LISTED', async (t) => {
  const a = ambiente(t, { recenti: ['a', 'b', 'c', 'd'] });
  for (const n of ['a', 'b', 'c', 'd']) a.crea(n);
  const c = a.nuovo();
  const righe = await c.elenco('x');
  const prima = await c.chiedi({ dispositivoId: 'x', cartellaId: righe[0].cartellaId });
  assert.equal((await c.chiedi({ dispositivoId: 'x', cartellaId: righe[0].cartellaId })).richiestaId, prima.richiestaId, 'la stessa cartella: la stessa richiesta');
  await c.chiedi({ dispositivoId: 'x', cartellaId: righe[1].cartellaId });
  await c.chiedi({ dispositivoId: 'x', cartellaId: righe[2].cartellaId });
  await assert.rejects(c.chiedi({ dispositivoId: 'x', cartellaId: righe[3].cartellaId }), { code: 'RATE_LIMITED' });
  await c.chiedi({ dispositivoId: 'y', cartellaId: righe[3].cartellaId }); // un altro dispositivo ha il suo tetto
  await assert.rejects(c.chiedi({ dispositivoId: 'x', cartellaId: 'non-esiste' }), { code: 'FOLDER_NOT_LISTED' });
});

test('CD-08 — consentire in anticipo dal PC, revocare, dimenticare; la cartella del programma non si può consentire; l\'elenco esplicito vale per tutti', async (t) => {
  const a = ambiente(t, { recenti: [], ammesse: ['admin'], escluse: ['programma'] });
  const fuori = a.crea('fuori-casa');
  const admin = a.crea('admin');
  const prog = a.crea('programma', 'resources');
  const c = a.nuovo();
  const { cartellaId } = await c.consentiInAnticipo('d', fuori);
  assert.equal(await c.consentita('d', fuori), true);
  assert.ok((await c.elenco('d')).some((r) => r.cartellaId === cartellaId && r.consentita), 'consentita in anticipo: è nell\'elenco del dispositivo');
  assert.equal((await c.consensiDi('d'))[0].da, 'anticipo');
  await assert.rejects(c.consentiInAnticipo('d', prog), { code: 'FOLDER_NOT_ALLOWED' });
  assert.equal(await c.consentita('qualunque', admin), true, 'l\'elenco esplicito dell\'amministratore vale per ogni dispositivo');
  await c.revoca('d', cartellaId);
  assert.equal(await c.consentita('d', fuori), false, 'revocata: subito');
  await c.consentiInAnticipo('d', fuori);
  await c.dimentica('d');
  assert.equal(await c.consentita('d', fuori), false, 'dimenticato: niente');
});

test('CD-09 — due cartelle recenti con lo stesso nome portano `dettaglio`: la sola cartella che le contiene, mai un percorso', async (t) => {
  const a = ambiente(t, { recenti: ['clienteA/app', 'clienteB/app', 'altro'] });
  a.crea('clienteA', 'app'); a.crea('clienteB', 'app'); a.crea('altro');
  const elenco = await a.nuovo().elenco('d');
  const app = elenco.filter((r) => r.nome === 'app');
  assert.deepEqual(app.map((r) => r.dettaglio).sort(), ['clienteA', 'clienteB']);
  assert.equal(elenco.find((r) => r.nome === 'altro').dettaglio, undefined);
});
