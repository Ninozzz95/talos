/* Revisione avversaria del blocco 9 (27/10/2026), portata nel repo con la cura B-R1 (PAIR_EXPIRED arriva al telefono). Originale in
   handoff/revisione-blocco-9-prove-2026-10-27/B-qr-scaduto-b9.test.mjs. */
/*
 * Revisione blocco 9 (27/10/2026) — pezzo B, F-R1 `cf384277d`: un QR emesso da questo PC e scaduto da poco risponde PAIR_EXPIRED e non
 * conta. `creaAccoppiamento` e `creaServizioRemoto` VERI (trasporto finto in memoria, come `tests/remoto-servizio.test.mjs`), orologio
 * finto, nessuna rete. i moduli di questo repo.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const { ALPN_ACCOPPIAMENTO, DURATA_OFFERTA_MS, RICORDO_SCADUTI_MS, creaAccoppiamento } = await imp('src/remoto/accoppiamento.mjs');
const { creaElencoDispositivi } = await imp('src/remoto/dispositivi.mjs');
const { codifica, creaLettore } = await imp('src/remoto/filo.mjs');
const { creaServizioRemoto } = await imp('src/remoto/servizio.mjs');

const PC = 'pc-endpoint-id';
function coda() {
  const pezzi = []; const attesi = []; let finita = false;
  return {
    metti(b) { if (finita) return; const a = attesi.shift(); if (a) a(b); else pezzi.push(b); },
    fine() { finita = true; while (attesi.length) attesi.shift()(null); },
    prendi() { if (pezzi.length) return Promise.resolve(pezzi.shift()); if (finita) return Promise.resolve(null); return new Promise((r) => attesi.push(r)); },
  };
}
function connessione(remoteId) {
  const versoPc = coda(); const versoTel = coda(); const stato = { chiusaCon: null };
  const lettore = creaLettore(); const ricevuti = []; const attese = [];
  (async () => { for (;;) { const b = await versoTel.prendi(); if (b == null) { while (attese.length) attese.shift()(null); return; } for (const m of lettore.aggiungi(b)) { const a = attese.shift(); if (a) a(m); else ricevuti.push(m); } } })();
  const pc = { remoteId, alpn: ALPN_ACCOPPIAMENTO, chiusa: new Promise(() => {}),
    stream: { leggi: () => versoPc.prendi(), scrivi: async (b) => { versoTel.metti(b); }, finisci: async () => {} },
    chiudi(code) { if (stato.chiusaCon) return; stato.chiusaCon = code; versoPc.fine(); versoTel.fine(); } };
  const tel = { manda: (m) => versoPc.metti(codifica(m)), ricevi: () => (ricevuti.length ? Promise.resolve(ricevuti.shift()) : new Promise((r) => attese.push(r))) };
  return { pc, tel, stato };
}
function banco(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rev-b9-srv-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  let ora = Date.parse('2026-10-27T09:00:00Z');
  const accoppiamento = creaAccoppiamento({ clock: () => ora });
  const dispositivi = creaElencoDispositivi({ file: join(dir, 'telefoni.json') });
  const servizio = creaServizioRemoto({ pcId: PC, nomePc: 'PC', vapidPubblica: 'BPUB', accoppiamento, dispositivi, operazioni: { esegui: async () => ({}) }, attesaDopoPairOkMs: 10 });
  return { accoppiamento, servizio, avanza: (ms) => { ora += ms; } };
}

test('REV-B9-B1 un QR scaduto da 30 s presentato al servizio VERO: che codice legge il telefono sul filo?', async (t) => {
  const b = banco(t);
  const { gettone } = b.accoppiamento.apri({ pcId: PC });
  b.avanza(DURATA_OFFERTA_MS + 30_000);
  const c = connessione('telefono-endpoint-id');
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'pair.hello', gettone, nome: 'Pad' });
  const risposta = await c.tel.ricevi();
  await fatto;
  t.diagnostic(`sul filo: ${JSON.stringify(risposta)}; chiusa con ${c.stato.chiusaCon}; sbagliati ${b.accoppiamento.stato().sbagliati}`);
  assert.equal(b.accoppiamento.stato().sbagliati, 0, 'premessa (la cura): non conta');
  assert.equal(risposta?.code, 'PAIR_EXPIRED', `il modulo dice PAIR_EXPIRED, ma il telefono legge ${risposta?.code}: «codice sconosciuto o già usato» invece di «QR scaduto, chiedine uno nuovo»`);
});

test('REV-B9-B2 (misura) un QR CHIUSO dalla persona o spinto fuori dal quarto QR: conta come gettone sbagliato', async (t) => {
  const b = banco(t);
  const esiti = {};
  /* chiuso */
  const a = b.accoppiamento.apri({ pcId: PC });
  b.accoppiamento.chiudi(a.gettone);
  try { b.accoppiamento.presenta({ gettone: a.gettone, pcId: PC, telefonoId: 'tel' }); } catch (e) { esiti.chiuso = e.code; }
  /* spinto fuori: tre aperti, il quarto toglie il più vecchio */
  const vecchio = b.accoppiamento.apri({ pcId: PC });
  b.avanza(1); b.accoppiamento.apri({ pcId: PC }); b.avanza(1); b.accoppiamento.apri({ pcId: PC }); b.avanza(1); b.accoppiamento.apri({ pcId: PC });
  try { b.accoppiamento.presenta({ gettone: vecchio.gettone, pcId: PC, telefonoId: 'tel' }); } catch (e) { esiti.spinto = e.code; }
  t.diagnostic(JSON.stringify({ ...esiti, sbagliati: b.accoppiamento.stato().sbagliati }));
  assert.deepEqual(esiti, { chiuso: 'PAIR_TOKEN_INVALID', spinto: 'PAIR_TOKEN_INVALID' });
});

test('REV-B9-B3 (controllo) un gettone scaduto dice «scaduto» UNA volta sola: il secondo invio conta; oltre i 10 minuti conta', async (t) => {
  const b = banco(t);
  const g = b.accoppiamento.apri({ pcId: PC }).gettone;
  b.avanza(DURATA_OFFERTA_MS + 1);
  const codici = [];
  for (let i = 0; i < 2; i += 1) { try { b.accoppiamento.presenta({ gettone: g, pcId: PC, telefonoId: 'tel' }); } catch (e) { codici.push(e.code); } }
  const g2 = b.accoppiamento.apri({ pcId: PC }).gettone;
  b.avanza(DURATA_OFFERTA_MS + RICORDO_SCADUTI_MS + 1);
  try { b.accoppiamento.presenta({ gettone: g2, pcId: PC, telefonoId: 'tel' }); } catch (e) { codici.push(e.code); }
  assert.deepEqual(codici, ['PAIR_EXPIRED', 'PAIR_TOKEN_INVALID', 'PAIR_TOKEN_INVALID']);
  assert.equal(b.accoppiamento.stato().sbagliati, 2);
});

test('REV-B9-B4 (controllo) memoria: 10.000 QR aperti uno dopo l\'altro, ognuno lasciato scadere: quanti gettoni scaduti ricorda il PC', async (t) => {
  const b = banco(t);
  let massimo = 0;
  for (let i = 0; i < 10_000; i += 1) {
    b.accoppiamento.apri({ pcId: PC });
    b.avanza(60_000);
    /* nessun accesso al Map: misura dall'esterno, il tempo di presenta() su un gettone a caso cresce col numero ricordato */
  }
  /* misura indiretta: un gettone sconosciuto costa un confronto per voce; 50 tentativi bastano per vedere un costo lineare */
  const t0 = process.hrtime.bigint();
  try { b.accoppiamento.presenta({ gettone: Buffer.alloc(16, 1).toString('base64url'), pcId: PC, telefonoId: 'x' }); } catch { /* conta */ }
  massimo = Number(process.hrtime.bigint() - t0) / 1e6;
  t.diagnostic(`presenta() dopo 10.000 QR (uno al minuto): ${massimo.toFixed(3)} ms`);
  assert.ok(massimo < 50);
});

test('REV-B9-B5 (misura) l\'orologio torna indietro di un\'ora dopo il blocco: quanto dura il blocco', async (t) => {
  let ora = Date.parse('2026-10-27T09:00:00Z');
  const acc = creaAccoppiamento({ clock: () => ora });
  acc.apri({ pcId: PC });
  for (let i = 0; i < 5; i += 1) { try { acc.presenta({ gettone: Buffer.alloc(16, i + 1).toString('base64url'), pcId: PC, telefonoId: 'x' }); } catch { /* */ } }
  const fino = acc.stato().bloccatoFinoA;
  ora -= 3_600_000;
  t.diagnostic(`blocco: ${(fino - ora) / 60_000} minuti dall'ora nuova (era 15, di prima della cura)`);
  assert.ok(fino - ora > 15 * 60_000);
});
