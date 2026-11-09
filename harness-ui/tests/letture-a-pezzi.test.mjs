import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { ESPORTAZIONE_MASSIMA_BYTE, creaLettureAPezzi, oraDellUltimoEvento, pezzoDi } from '../src/letture-a-pezzi.mjs';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { BYTE_MASSIMI } from '../src/remoto/filo.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * Ultima richiesta ed esportazione a pezzi (`CONTRATTO-REMOTO-CONTEXT-MANAGER-2026-10-31.md`). Il tetto del filo, il taglio che non spezza un carattere, l'oscuramento prima
 * del taglio e una volta sola, il confine fisso dell'esportazione, il consenso nella rotta. La chiave è finta e costruita a pezzi, così non resta nel sorgente.
 */
const CHIAVE = ['sk', 'or', 'v1', 'a'.repeat(64)].join('-');
const leggiTutto = async (elenco, pezzo) => {
  let daByte = 0; let testo = ''; let passi = 0;
  while (daByte !== null) {
    const r = await pezzo(daByte);
    assert.equal(r.byteTotali, elenco);
    testo += r.testo; daByte = r.prossimoByte; passi += 1;
    assert.ok(passi < 10_000, 'non finisce');
  }
  return { testo, passi };
};
const registroCon = (extra = {}) => ({ leggiUltimaRichiesta: () => undefined, esporta: () => null, ...extra });

test('PZ-01 il taglio non spezza un carattere, e `prossimoByte` riparte da lì fino a ricomporre il testo', () => {
  const testo = 'a€b𝄞c'.repeat(50);
  const byte = Buffer.from(testo, 'utf8');
  for (const passo of [4, 5, 7, 16]) {
    let daByte = 0; let fuori = '';
    while (daByte !== null) {
      const r = pezzoDi(byte.subarray(daByte, daByte + passo), { daByte, byteTotali: byte.length });
      assert.ok(!r.testo.includes('�'), `carattere spezzato a ${daByte}`);
      fuori += r.testo; daByte = r.prossimoByte;
    }
    assert.equal(fuori, testo, `passo ${passo}`);
  }
});

test('PZ-02 un pezzo che con gli escape non sta sul filo cede, e il testo non si perde', () => {
  const byte = Buffer.from('"'.repeat(800_000), 'utf8');
  const r = pezzoDi(byte, { daByte: 0, byteTotali: byte.length });
  assert.ok(Buffer.byteLength(JSON.stringify(r.testo)) < BYTE_MASSIMI);
  assert.ok(r.prossimoByte > 0 && r.prossimoByte < byte.length);
});

test('PZ-03 ultima richiesta: oscurata prima del taglio e una volta sola; due letture a byte non la rifanno', async () => {
  const contenuto = `${'x'.repeat(1_000)}${CHIAVE}${'y'.repeat(1_000)}`;
  let oscurate = 0;
  const oscura = (t) => { oscurate += 1; return t.replaceAll(CHIAVE, '[redacted]'); };
  const letture = creaLettureAPezzi({ oscura, sessionRegistry: registroCon({ leggiUltimaRichiesta: () => ({ at: 't1', messages: [{ role: 'user', content: contenuto }, { role: 'tool', content: [{ type: 'text', text: 'ok' }] }], tools: [{ name: 'x' }], ripartizione: { messaggi: 2 } }) }) });
  const elenco = letture.elencoUltimaRichiesta('s');
  assert.equal(elenco.messaggi.length, 2);
  assert.equal(elenco.messaggi[0].ruolo, 'user');
  assert.equal(elenco.messaggi[0].byte, 2_010, 'i byte si contano sul testo oscurato');
  assert.equal(elenco.attrezziByte, JSON.stringify([{ name: 'x' }]).length);
  const dopoElenco = oscurate;
  /* il taglio cade in mezzo a dove stava la chiave */
  const { testo, passi } = await leggiTutto(2_010, (daByte) => letture.pezzoDellUltimaRichiesta('s', { impronta: elenco.impronta, indice: 0, daByte, quantiByte: 1_005 }));
  assert.equal(passi, 2);
  assert.ok(!testo.includes(CHIAVE));
  assert.ok(testo.includes('[redacted]'));
  assert.equal(oscurate, dopoElenco, 'mai a ogni pezzo');
});

test('PZ-04 ultima richiesta: impronta cambiata ⇒ PIECE_CHANGED; finestra oltre il tetto ⇒ TOO_LARGE; indice storto ⇒ QUERY_INVALID; niente richiesta ⇒ elenco vuoto', () => {
  let at = 't1';
  const letture = creaLettureAPezzi({ sessionRegistry: registroCon({ leggiUltimaRichiesta: (id) => (id === 'vuota' ? null : { at, messages: [{ role: 'user', content: 'ciao' }], tools: [] }) }) });
  const { impronta } = letture.elencoUltimaRichiesta('s');
  assert.throws(() => letture.pezzoDellUltimaRichiesta('s', { impronta, indice: 0, daByte: 0, quantiByte: BYTE_MASSIMI + 1 }), { code: 'TOO_LARGE' });
  assert.throws(() => letture.pezzoDellUltimaRichiesta('s', { impronta, indice: 9, daByte: 0, quantiByte: 10 }), { code: 'QUERY_INVALID' });
  assert.throws(() => letture.pezzoDellUltimaRichiesta('s', { impronta, indice: 0, daByte: -1, quantiByte: 10 }), { code: 'QUERY_INVALID' });
  at = 't2';
  assert.throws(() => letture.pezzoDellUltimaRichiesta('s', { impronta, indice: 0, daByte: 0, quantiByte: 10 }), { code: 'PIECE_CHANGED' });
  assert.deepEqual(letture.elencoUltimaRichiesta('vuota'), { impronta: null, attrezziByte: 0, messaggi: [], ripartizione: null });
});

const conEventi = (eventi) => () => ({ schema: 'e', sessionId: 's', nome: 'Prova', eventi });
const esportazione = (t, opzioni = {}, cartella = cartellaDiProva('talos-pezzi-')) => {
  const eventi = [{ _sequenza: 1, type: 'x', testo: `chiave ${CHIAVE}` }, { _sequenza: 2, type: 'y', testo: 'è più lungo €' }];
  const letture = creaLettureAPezzi({ cartella, sessionRegistry: registroCon({ esporta: conEventi(eventi) }), ...opzioni });
  t.after(() => letture.chiudi());
  return { letture, eventi, cartella };
};

test('PZ-05 esportazione: JSON intero a pezzi, oscurata ovunque, fino all\'evento del momento; gli eventi nuovi non cambiano la copia già fatta', async (t) => {
  const { letture, eventi } = esportazione(t);
  const elenco = await letture.elencoEsportazione('s');
  assert.equal(elenco.finoAllEvento, 2);
  eventi.push({ _sequenza: 3, type: 'z' });
  const { testo } = await leggiTutto(elenco.byteTotali, (daByte) => letture.pezzoDellEsportazione('s', { impronta: elenco.impronta, daByte, quantiByte: 7 }));
  const letto = JSON.parse(testo);
  assert.equal(letto.nome, 'Prova');
  assert.deepEqual(letto.eventi.map((e) => e._sequenza), [1, 2], 'il confine è fisso');
  assert.ok(!testo.includes(CHIAVE), 'chiave nell\'esportazione');
  assert.equal(letto.eventi[1].testo, 'è più lungo €');
});

test('PZ-06 esportazione: una preparazione sola; stesso confine = stessa copia; confine nuovo = copia nuova, e la vecchia è PIECE_CHANGED', async (t) => {
  const { letture, eventi, cartella } = esportazione(t);
  const [a, b] = await Promise.all([letture.elencoEsportazione('s'), letture.elencoEsportazione('s')]);
  assert.deepEqual(a, b);
  assert.deepEqual(await letture.elencoEsportazione('s'), a);
  eventi.push({ _sequenza: 3, type: 'z' });
  const nuova = await letture.elencoEsportazione('s');
  assert.notEqual(nuova.impronta, a.impronta);
  await assert.rejects(letture.pezzoDellEsportazione('s', { impronta: a.impronta, daByte: 0, quantiByte: 10 }), { code: 'PIECE_CHANGED' });
  assert.equal(readdirSync(cartella).length, 1, 'una copia per sessione');
});

test('PZ-07 esportazione: oltre il tetto errore col peso e nessun file; scaduta si toglie; all\'avvio le copie rimaste spariscono', async (t) => {
  const cartella = cartellaDiProva('talos-pezzi-tetto-');
  writeFileSync(join(cartella, 'rimasta.json'), '{}');
  const { letture } = esportazione(t, { massimoByte: 50 }, cartella);
  await assert.rejects(letture.elencoEsportazione('s'), (e) => e.code === 'EXPORT_TOO_LARGE' && e.byteTotali > 50);
  assert.deepEqual(readdirSync(cartella), [], 'né la rimasta né il pezzo interrotto');
  assert.equal(ESPORTAZIONE_MASSIMA_BYTE, 256 * 1024 * 1024);
  const breve = esportazione(t, { viveMs: 15 });
  const { impronta } = await breve.letture.elencoEsportazione('s');
  await new Promise((ok) => { setTimeout(ok, 60); });
  assert.deepEqual(readdirSync(breve.cartella), []);
  await assert.rejects(breve.letture.pezzoDellEsportazione('s', { impronta, daByte: 0, quantiByte: 10 }), { code: 'PIECE_CHANGED' });
});

test('PZ-11 il confine è fisso anche mentre la copia si prepara: un evento arrivato a metà non entra', async (t) => {
  const eventi = Array.from({ length: 450 }, (_, i) => ({ _sequenza: i + 1, type: 'x' }));
  const letture = creaLettureAPezzi({ cartella: cartellaDiProva('talos-pezzi-corsa-'), sessionRegistry: registroCon({ esporta: conEventi(eventi) }) });
  t.after(() => letture.chiudi());
  const inCorso = letture.elencoEsportazione('s');
  await new Promise((ok) => { setImmediate(ok); });
  eventi.push({ _sequenza: 451, type: 'dopo' });
  const elenco = await inCorso;
  assert.equal(elenco.finoAllEvento, 450);
  const { testo } = await leggiTutto(elenco.byteTotali, (daByte) => letture.pezzoDellEsportazione('s', { impronta: elenco.impronta, daByte, quantiByte: 8_192 }));
  assert.equal(JSON.parse(testo).eventi.length, 450);
});

test('PZ-12 la copia si prepara una volta: due letture insieme non la rifanno, e nemmeno una lettura dopo con lo stesso confine', async (t) => {
  let oscurate = 0;
  const oscura = (x) => { oscurate += 1; return x; };
  const { letture } = esportazione(t, { oscura });
  await Promise.all([letture.elencoEsportazione('s'), letture.elencoEsportazione('s')]);
  const una = oscurate;
  const altra = esportazione(t);
  let solo = 0;
  const conta = creaLettureAPezzi({ oscura: (x) => { solo += 1; return x; }, cartella: altra.cartella, sessionRegistry: registroCon({ esporta: conEventi(altra.eventi) }) });
  t.after(() => conta.chiudi());
  await conta.elencoEsportazione('s');
  assert.equal(una, solo, 'due letture insieme, una preparazione');
  await letture.elencoEsportazione('s');
  assert.equal(oscurate, una + 0, 'stesso confine, stessa copia');
});

test('PZ-13 «fino alle»: l\'ultimo evento con un orario, mai uno inventato', async (t) => {
  assert.equal(oraDellUltimoEvento([{ timestamp: 1_800_000_000_000 }, { timestamp: 1_800_000_060_000 }, { type: 'senza' }]), new Date(1_800_000_060_000).toISOString());
  assert.equal(oraDellUltimoEvento([{ type: 'senza' }, { timestamp: 'ieri' }, { timestamp: 9e15 }]), null);
  assert.equal(oraDellUltimoEvento([]), null);
  const conOra = creaLettureAPezzi({ cartella: cartellaDiProva('talos-pezzi-ora-'), sessionRegistry: registroCon({ esporta: conEventi([{ _sequenza: 1, timestamp: 1_800_000_000_000 }, { _sequenza: 2 }]) }) });
  t.after(() => conOra.chiudi());
  assert.deepEqual(Object.keys(await conOra.elencoEsportazione('s')).sort(), ['byteTotali', 'finoAllEvento', 'finoAlle', 'impronta']);
  assert.equal((await conOra.elencoEsportazione('s')).finoAlle, new Date(1_800_000_000_000).toISOString());
});

test('PZ-14 le copie rimaste spariscono all\'avvio, senza aspettare un\'esportazione; una copia tolta sotto i piedi è PIECE_CHANGED, non un guasto', async (t) => {
  const cartella = cartellaDiProva('talos-pezzi-avvio-');
  writeFileSync(join(cartella, 'rimasta.json'), '{}');
  writeFileSync(join(cartella, 'altro.txt'), 'x');
  const { letture } = esportazione(t, {}, cartella);
  for (let giro = 0; giro < 100 && existsSync(join(cartella, 'rimasta.json')); giro += 1) await new Promise((ok) => { setTimeout(ok, 5); });
  assert.deepEqual(readdirSync(cartella), ['altro.txt'], 'tolte solo le copie');
  const { impronta } = await letture.elencoEsportazione('s');
  rmSync(join(cartella, readdirSync(cartella).find((n) => n.endsWith('.json'))));
  await assert.rejects(letture.pezzoDellEsportazione('s', { impronta, daByte: 0, quantiByte: 10 }), { code: 'PIECE_CHANGED' });
});

test('PZ-08 una lettura tiene viva la copia: la scadenza riparte da lì', async (t) => {
  // Margini larghi (sesta suite del 04/11): con 40 ms di attesa e 80 di vita, sotto carico un'attesa sforava la vita. Tre letture a
  // 500 ms con 1200 di vita: senza il rinnovo la copia muore prima della terza lettura (1500 > 1200).
  const { letture, cartella } = esportazione(t, { viveMs: 1200 });
  const { impronta } = await letture.elencoEsportazione('s');
  for (let giro = 0; giro < 3; giro += 1) {
    await new Promise((ok) => { setTimeout(ok, 500); });
    await letture.pezzoDellEsportazione('s', { impronta, daByte: 0, quantiByte: 10 });
  }
  assert.equal(readdirSync(cartella).length, 1);
});

const DISP = 'dispositivo-A1';
function banco() {
  const radice = cartellaDiProva('talos-pezzi-ponte-');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p); };
  const avm = crea('progetti', 'AVM');
  const dati = crea('dati');
  const copie = crea('copie');
  const messaggio = { role: 'user', content: `dimmi ${CHIAVE}` };
  const sessionRegistry = {
    cartellePiuUsate: () => [{ percorso: avm, conteggio: 1, ultimaVolta: '2026-11-01T10:00:00.000Z' }],
    elenca: () => [{ sessionId: 's1', titolo: 's1' }],
    esiste: (id) => id === 's1',
    async cartellaPerChatFile(id) { return id === 's1' ? { ok: true, cartella: avm } : { code: 'NOT_FOUND', reason: 'session-not-found' }; },
    leggiUltimaRichiesta: (id) => (id === 's1' ? { at: 't1', messages: [messaggio], tools: [] } : undefined),
    esporta: (id) => (id === 's1' ? { schema: 'e', sessionId: 's1', eventi: [{ _sequenza: 1, messaggio }] } : null),
  };
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'), sessionRegistry, cartelleAmmesse: [], cartelleEscluse: [dati] });
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry, remotoFn: () => ({ cartelle }), cartellaEsportazioni: copie });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const passate = [];
  const operazioni = creaOperazioni({ chiama: (c) => { passate.push(c); return chiama(c); }, sessionRegistry, iscriviConRigiocata, cartelle });
  const contesto = { dispositivo: { id: DISP, nome: 'OnePlus Pad 3' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  return { avm, operazioni, contesto, passate, chiama, copie };
}
const ROTTE = ['/api/v1/sessions/s1/last-request/pieces', '/api/v1/sessions/s1/export/pieces', `/api/v1/sessions/s1/last-request/pieces/0?impronta=${'a'.repeat(64)}&daByte=0&quantiByte=10`, `/api/v1/sessions/s1/export/pieces/data?impronta=${'a'.repeat(64)}&daByte=0&quantiByte=10`];

test('PZ-09 senza il consenso le quattro letture si fermano nel ponte e nella rotta; le rotte intere del PC non cambiano', async () => {
  const b = banco();
  for (const [op, args] of [['session.last-request', {}], ['session.export', {}], ['session.last-request.message', { impronta: 'a'.repeat(64), indice: 0, daByte: 0, quantiByte: 10 }], ['session.export.piece', { impronta: 'a'.repeat(64), daByte: 0, quantiByte: 10 }]]) {
    await assert.rejects(b.operazioni.esegui(op, { sessionId: 's1', ...args }, b.contesto), (e) => e.code === 'CONSENT_REQUIRED' && e.params?.nome === 'AVM', op);
  }
  assert.deepEqual(b.passate, []);
  for (const percorso of ROTTE) await assert.rejects(b.chiama({ metodo: 'GET', percorso, origine: 'telefono', origineRemota: { tipo: 'telefono', nome: 'X', dispositivoId: DISP } }), (e) => e.code === 'CONSENT_REQUIRED', percorso);
  assert.deepEqual(readdirSync(b.copie), [], 'nessuna copia senza consenso');
  assert.equal((await b.chiama({ metodo: 'GET', percorso: '/api/v1/sessions/s1/last-request', origine: 'pc' })).dati.ultimaRichiesta.messages[0].content.includes(CHIAVE), true, 'il PC legge la sua richiesta intera');
  assert.equal((await b.chiama({ metodo: 'GET', percorso: ROTTE[0], origine: 'pc' })).dati.messaggi.length, 1, 'dal PC niente consenso');
});

test('PZ-10 col consenso, dal ponte: ultima richiesta ed esportazione arrivano oscurate; argomenti storti ⇒ BAD_MESSAGE senza chiamata', async () => {
  const b = banco();
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/remote/phones/${DISP}/folders`, corpo: { percorso: b.avm }, origine: 'pc' });
  const elenco = await b.operazioni.esegui('session.last-request', { sessionId: 's1' }, b.contesto);
  const pezzo = await b.operazioni.esegui('session.last-request.message', { sessionId: 's1', impronta: elenco.impronta, indice: 0, daByte: 0, quantiByte: 4_096 }, b.contesto);
  assert.ok(pezzo.testo.startsWith('dimmi '));
  assert.ok(!pezzo.testo.includes(CHIAVE));
  assert.equal(pezzo.prossimoByte, null);
  const esportata = await b.operazioni.esegui('session.export', { sessionId: 's1' }, b.contesto);
  const copia = await b.operazioni.esegui('session.export.piece', { sessionId: 's1', impronta: esportata.impronta, daByte: 0, quantiByte: 4_096 }, b.contesto);
  assert.equal(JSON.parse(copia.testo).eventi.length, 1);
  assert.ok(!copia.testo.includes(CHIAVE));
  assert.equal(existsSync(join(b.copie, readdirSync(b.copie)[0])), true);
  assert.ok(!readFileSync(join(b.copie, readdirSync(b.copie)[0]), 'utf8').includes(CHIAVE), 'nemmeno sul disco del PC la copia ha la chiave');
  b.passate.length = 0;
  for (const args of [{ indice: 0 }, { impronta: 'x', indice: 0, daByte: 0, quantiByte: 1 }, { impronta: 'a'.repeat(64), indice: -1, daByte: 0, quantiByte: 1 }, { impronta: 'a'.repeat(64), indice: 0, daByte: -1, quantiByte: 1 }, { impronta: 'a'.repeat(64), indice: 0, daByte: 0, quantiByte: 0 }]) {
    await assert.rejects(b.operazioni.esegui('session.last-request.message', { sessionId: 's1', ...args }, b.contesto), { code: 'BAD_MESSAGE' }, JSON.stringify(args));
  }
  assert.deepEqual(b.passate, []);
  await assert.rejects(b.operazioni.esegui('session.last-request.message', { sessionId: 's1', impronta: 'a'.repeat(64), indice: 0, daByte: 0, quantiByte: 10 }, b.contesto), { code: 'PIECE_CHANGED' });
});
