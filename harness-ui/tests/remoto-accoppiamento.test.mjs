import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import {
  BLOCCO_MS, DURATA_OFFERTA_MS, OFFERTE_APERTE_MASSIME, TENTATIVI_SBAGLIATI_MASSIMI, codiceDiVerifica, creaAccoppiamento, relayNelQr, testoDelQr,
} from '../src/remoto/accoppiamento.mjs';
import { TELEFONI_MASSIMI, creaElencoDispositivi } from '../src/remoto/dispositivi.mjs';
import { moduliDelQr } from '../src/remoto/index.mjs';
import { BYTE_MASSIMI, codifica, creaLettore } from '../src/remoto/filo.mjs';

/*
 * 18/10/2026 — controllo remoto, primo passo del modulo `src/remoto/` (contratto v0.3 §B, §D, §F, §12-14; mockup v5). Le parti
 * pure: accoppiamento (gettone monouso, codice di 6 cifre, tetti di Hermes), elenco dei telefoni (chi entra), filo (lunghezza +
 * JSON). Nessuna rete. Ogni prova ha il suo verso contrario.
 */
const ORA = 1_800_000_000_000;
const orologio = () => { let t = ORA; return { clock: () => t, avanza: (ms) => { t += ms; } }; };
const PC = 'pc0000000000000000000000000000000000000000000000000000000000000a';
const TEL = 'te1111111111111111111111111111111111111111111111111111111111111b';
const ALTRO = 'st2222222222222222222222222222222222222222222222222222222222222c';
let contatore = 0;
const casuale = (n) => { contatore += 1; return Buffer.alloc(n, contatore % 251); };

test('ACC-01 codice di 6 cifre: stabile per gli stessi capi, diverso se chiama un ALTRO telefono con lo stesso gettone', () => {
  const gettone = Buffer.alloc(16, 7).toString('base64url');
  const a = codiceDiVerifica({ pcId: PC, telefonoId: TEL, gettone });
  assert.match(a, /^\d{6}$/);
  assert.equal(codiceDiVerifica({ pcId: PC, telefonoId: TEL, gettone }), a);
  assert.notEqual(codiceDiVerifica({ pcId: PC, telefonoId: ALTRO, gettone }), a, 'un QR fotografato e usato da un altro telefono dà un altro codice');
  assert.notEqual(codiceDiVerifica({ pcId: PC, telefonoId: TEL, gettone: Buffer.alloc(16, 8).toString('base64url') }), a);
  /* Vettore fisso: il telefono deve calcolare lo stesso numero (lo stesso vettore va nel contratto del filo). */
  assert.equal(codiceDiVerifica({ pcId: 'pc', telefonoId: 'tel', gettone: Buffer.alloc(16, 0).toString('base64url') }), VETTORE);
  assert.throws(() => codiceDiVerifica({ pcId: PC, telefonoId: TEL, gettone: 'corto' }), { code: 'PAIR_BAD_INPUT' });
});
const VETTORE = '645739'; // calcolato a parte con Python (hashlib), non col modulo

test('ACC-02 il gettone vale UNA volta: la seconda presentazione è rifiutata', () => {
  const o = orologio(); const acc = creaAccoppiamento({ clock: o.clock, casuale });
  const { gettone, qr } = acc.apri({ pcId: PC, relay: 'https://relay.example' });
  assert.match(qr, /^talos-remote:1\?pc=.+&relay=https:\/\/relay\.example&t=.+&exp=\d+$/);
  const p = acc.presenta({ gettone, pcId: PC, telefonoId: TEL, nome: 'Pad di Nino' });
  assert.equal(p.codice, codiceDiVerifica({ pcId: PC, telefonoId: TEL, gettone }));
  assert.throws(() => acc.presenta({ gettone, pcId: PC, telefonoId: ALTRO }), { code: 'PAIR_TOKEN_INVALID' });
});

test('ACC-03 il gettone scade dopo 5 minuti, non prima', () => {
  const o = orologio(); const acc = creaAccoppiamento({ clock: o.clock, casuale });
  const a = acc.apri({ pcId: PC });
  o.avanza(DURATA_OFFERTA_MS - 1);
  assert.ok(acc.presenta({ gettone: a.gettone, pcId: PC, telefonoId: TEL }).codice);
  const b = acc.apri({ pcId: PC });
  o.avanza(DURATA_OFFERTA_MS);
  /* revisione blocco 8 (F-R1): un gettone di questo PC solo scaduto si dice «scaduto», non «sconosciuto» (e non conta verso il blocco) */
  assert.throws(() => acc.presenta({ gettone: b.gettone, pcId: PC, telefonoId: TEL }), { code: 'PAIR_EXPIRED' });
});

test('ACC-04 al più 3 offerte aperte: la quarta chiude la più vecchia', () => {
  const o = orologio(); const acc = creaAccoppiamento({ clock: o.clock, casuale });
  const prime = [];
  for (let i = 0; i < OFFERTE_APERTE_MASSIME; i += 1) { prime.push(acc.apri({ pcId: PC })); o.avanza(1000); }
  acc.apri({ pcId: PC });
  assert.equal(acc.stato().offerteAperte, OFFERTE_APERTE_MASSIME);
  assert.throws(() => acc.presenta({ gettone: prime[0].gettone, pcId: PC, telefonoId: TEL }), { code: 'PAIR_TOKEN_INVALID' });
  assert.ok(acc.presenta({ gettone: prime[1].gettone, pcId: PC, telefonoId: TEL }).codice, 'le altre restano buone');
});

test('ACC-05 cinque tentativi sbagliati (gettoni falsi E codici rifiutati) bloccano per 15 minuti, poi si riparte', () => {
  const o = orologio(); const acc = creaAccoppiamento({ clock: o.clock, casuale });
  const falso = Buffer.alloc(16, 200).toString('base64url');
  for (let i = 0; i < TENTATIVI_SBAGLIATI_MASSIMI - 2; i += 1) assert.throws(() => acc.presenta({ gettone: falso, pcId: PC, telefonoId: ALTRO }), { code: 'PAIR_TOKEN_INVALID' });
  /* il quarto è un codice che la persona RIFIUTA sul PC: conta (Nino1, contratto §18.2) */
  const a = acc.apri({ pcId: PC });
  const p = acc.presenta({ gettone: a.gettone, pcId: PC, telefonoId: ALTRO });
  assert.equal(acc.rifiuta(p.id), true);
  /* il quinto, ancora un gettone falso: blocco */
  assert.throws(() => acc.presenta({ gettone: falso, pcId: PC, telefonoId: ALTRO }), (e) => e.code === 'PAIR_LOCKED' && e.retryAfterMs === BLOCCO_MS);
  assert.throws(() => acc.apri({ pcId: PC }), { code: 'PAIR_LOCKED' }, 'nel blocco nemmeno un QR nuovo');
  o.avanza(BLOCCO_MS);
  const b = acc.apri({ pcId: PC });
  assert.ok(acc.presenta({ gettone: b.gettone, pcId: PC, telefonoId: TEL }).codice, 'finito il blocco si riparte da zero');
});

test('ACC-06 un telefono che annulla NON conta come sbagliato; confermare risolve l\'attesa e consegna i dati del telefono', async () => {
  const o = orologio(); const acc = creaAccoppiamento({ clock: o.clock, casuale });
  for (let i = 0; i < TENTATIVI_SBAGLIATI_MASSIMI + 2; i += 1) {
    const a = acc.apri({ pcId: PC });
    const p = acc.presenta({ gettone: a.gettone, pcId: PC, telefonoId: TEL });
    assert.equal(acc.annulla(p.id), true);
  }
  assert.equal(acc.stato().sbagliati, 0);
  const a = acc.apri({ pcId: PC });
  const sveglia = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } };
  const p = acc.presenta({ gettone: a.gettone, pcId: PC, telefonoId: TEL, nome: '  Pad di Nino  ', sveglia });
  assert.deepEqual(acc.inAttesa().map((x) => [x.telefonoId, x.nome, x.codice]), [[TEL, 'Pad di Nino', p.codice]]);
  assert.ok(!JSON.stringify(acc.inAttesa()).includes(a.gettone), 'il gettone non esce mai');
  assert.deepEqual(acc.conferma(p.id), { telefonoId: TEL, nome: 'Pad di Nino', sveglia });
  assert.deepEqual(await p.attendi(), { esito: 'confermato' });
  assert.throws(() => acc.conferma(p.id), { code: 'PAIR_NOT_PENDING' });
});

test('ACC-07 una conferma lasciata a metà scade col gettone', async () => {
  const o = orologio(); const acc = creaAccoppiamento({ clock: o.clock, casuale });
  const a = acc.apri({ pcId: PC });
  const p = acc.presenta({ gettone: a.gettone, pcId: PC, telefonoId: TEL });
  o.avanza(DURATA_OFFERTA_MS);
  assert.deepEqual(acc.inAttesa(), []);
  assert.deepEqual(await p.attendi(), { esito: 'scaduto' });
  assert.throws(() => acc.conferma(p.id), { code: 'PAIR_NOT_PENDING' });
});

test('ACC-08 testoDelQr senza relay non scrive un relay vuoto', () => {
  assert.equal(testoDelQr({ pcId: 'abc', gettone: 'g', scadeAlle: 5000 }), 'talos-remote:1?pc=abc&t=g&exp=5');
});

const cartella = () => mkdtempSync(join(tmpdir(), 'talos-remoto-'));

test('DIS-01 solo un telefono accoppiato e NON revocato è ammesso; la revoca vale subito e resta scritta', async (t) => {
  const dir = cartella(); t.after(() => rimuoviCartellaDiProva(dir));
  const o = orologio(); const file = join(dir, 'remoto', 'telefoni.json');
  const el = creaElencoDispositivi({ file, clock: o.clock, casuale });
  assert.equal(await el.ammesso(TEL), null);
  const v = await el.aggiungi({ endpointId: TEL, nome: 'Pad di Nino', sveglia: { endpoint: 'https://x', keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url'), auth: Buffer.alloc(16, 9).toString('base64url') } } /* 21/10: la forma vera (RFC 8291), `svegliaValida` */ });
  assert.equal((await el.ammesso(TEL)).id, v.id);
  assert.equal(await el.ammesso(ALTRO), null);
  assert.equal(v.sveglia, true, 'la finestra sa che c\'è la sveglia');
  assert.ok(!JSON.stringify(await el.elenca()).includes('p256dh'), 'le chiavi della sveglia non escono verso l\'interfaccia');
  await el.revoca(v.id, 'telefono');
  assert.equal(await el.ammesso(TEL), null);
  const riletto = creaElencoDispositivi({ file, clock: o.clock, casuale });
  const [voce] = await riletto.elenca();
  assert.equal(voce.revocatoDa, 'telefono');
  assert.equal(await riletto.ammesso(TEL), null, 'la revoca sopravvive al riavvio');
  assert.equal(await riletto.iscrizione(v.id), null, 'un revocato non si sveglia più');
  assert.ok(!readFileSync(file, 'utf8').includes('p256dh'), 'e le chiavi della sua sveglia non restano sul disco');
});

test('DIS-02 lo stesso telefono riaccoppiato: una voce viva sola', async (t) => {
  const dir = cartella(); t.after(() => rimuoviCartellaDiProva(dir));
  const el = creaElencoDispositivi({ file: join(dir, 't.json'), casuale });
  const a = await el.aggiungi({ endpointId: TEL, nome: 'uno' });
  const b = await el.aggiungi({ endpointId: TEL, nome: 'due' });
  assert.notEqual(a.id, b.id);
  assert.equal((await el.ammesso(TEL)).id, b.id);
  assert.equal((await el.elenca()).filter((x) => !x.revocatoAlle).length, 1);
});

test('DIS-03 al più 16 telefoni vivi', async (t) => {
  const dir = cartella(); t.after(() => rimuoviCartellaDiProva(dir));
  const el = creaElencoDispositivi({ file: join(dir, 't.json'), casuale });
  for (let i = 0; i < TELEFONI_MASSIMI; i += 1) await el.aggiungi({ endpointId: `id-${i}` });
  await assert.rejects(el.aggiungi({ endpointId: 'uno-di-troppo' }), { code: 'REMOTE_TOO_MANY_PHONES' });
});

test('DIS-04 un file illeggibile NON si legge come vuoto e non si riscrive', async (t) => {
  const dir = cartella(); t.after(() => rimuoviCartellaDiProva(dir));
  const file = join(dir, 't.json');
  writeFileSync(file, '{ rotto');
  const el = creaElencoDispositivi({ file, casuale });
  await assert.rejects(el.ammesso(TEL), { code: 'REMOTE_DEVICES_UNREADABLE' });
  await assert.rejects(el.aggiungi({ endpointId: TEL }), { code: 'REMOTE_DEVICES_UNREADABLE' });
  assert.equal(readFileSync(file, 'utf8'), '{ rotto');
});

test('FILO-01 andata e ritorno anche a pezzi di 1 byte e con due messaggi incollati', () => {
  const a = codifica({ t: 'req', n: 'x1', op: 'sessions.list' });
  const b = codifica({ t: 'ping', s: 3 });
  const tutto = Buffer.concat([a, b]);
  const l1 = creaLettore();
  assert.deepEqual(l1.aggiungi(tutto).map((m) => m.t), ['req', 'ping']);
  const l2 = creaLettore(); const usciti = [];
  for (const byte of tutto) usciti.push(...l2.aggiungi([byte]));
  assert.deepEqual(usciti, [{ v: 1, t: 'req', n: 'x1', op: 'sessions.list' }, { v: 1, t: 'ping', s: 3 }]);
  assert.equal(l2.inSospeso, 0);
});

test('FILO-02 oltre 1 MiB: rifiutato in scrittura e in lettura PRIMA di accumulare il corpo', () => {
  assert.throws(() => codifica({ t: 'msg', b: 'x'.repeat(BYTE_MASSIMI) }), { code: 'TOO_LARGE' });
  const testa = Buffer.alloc(4); testa.writeUInt32BE(BYTE_MASSIMI + 1, 0);
  assert.throws(() => creaLettore().aggiungi(testa), { code: 'TOO_LARGE' });
  const quasi = codifica({ t: 'msg', b: 'x'.repeat(BYTE_MASSIMI - 64) });
  assert.equal(creaLettore().aggiungi(quasi).length, 1, 'sotto il tetto passa');
});

test('FILO-03 versione sconosciuta, JSON rotto e messaggio senza tipo sono errori tipizzati', () => {
  const grezzo = (s) => { const c = Buffer.from(s); const h = Buffer.alloc(4); h.writeUInt32BE(c.length, 0); return Buffer.concat([h, c]); };
  assert.throws(() => creaLettore().aggiungi(grezzo('{"v":2,"t":"ping"}')), { code: 'VERSION_UNSUPPORTED' });
  assert.throws(() => creaLettore().aggiungi(grezzo('{"v":1')), { code: 'BAD_MESSAGE' });
  assert.throws(() => creaLettore().aggiungi(grezzo('{"v":1}')), { code: 'BAD_MESSAGE' });
  assert.throws(() => creaLettore().aggiungi(grezzo('[1]')), { code: 'BAD_MESSAGE' });
});

/*
 * Il QR più piccolo (owner 26/10/2026 notte tarda, «Sì, rimpicciolisci»). Il relay nel QR con la codifica leggera: crudi i caratteri
 *   non riservati e `: / ? =`, codificati `% + & #` e lo spazio — il telefono legge con `URLSearchParams` (`filoRemoto.ts:48-52`) e il
 *   gettone con `URLDecoder` (`TalosRemotoCustodia.kt:100-102`): misurato dal Mobile, un `+` crudo diventa spazio, un `&` crudo tronca,
 *   un `%XX` crudo si decodifica due volte. Queste prove sono il riferimento che il Mobile rispecchia sul telefono.
 */
const leggiComeIlTelefono = (qr) => new URLSearchParams(qr.slice(qr.indexOf('?') + 1));
const RELAY_DIFFICILI = [
  'https://relay.example',
  'https://euc1-1.relay.n0.example/',
  'https://relay.casa-di-nino.example/?token=segreto-43',
  'https://relay.example/talos/?token=a+b/c%2Fd&e=1#frammento',
  'https://relay.example/?token=con spazio+più%25e&x=y=z?w',
];

test('ACC-QR-01 andata e ritorno: il relay letto come lo legge il telefono è byte per byte quello di partenza, e gli altri campi restano', () => {
  for (const relay of RELAY_DIFFICILI) {
    const qr = testoDelQr({ pcId: 'a'.repeat(64), relay, gettone: 'AbC-_9'.repeat(4).slice(0, 22), scadeAlle: 1_761_500_000_000 });
    const letto = leggiComeIlTelefono(qr);
    assert.equal(letto.get('relay'), relay, `relay: ${relay} → ${qr}`);
    assert.equal(letto.get('pc'), 'a'.repeat(64));
    assert.equal(letto.get('t'), 'AbC-_9'.repeat(4).slice(0, 22));
    assert.equal(letto.get('exp'), '1761500000');
  }
});

test('ACC-QR-02 i caratteri che il telefono leggerebbe male restano codificati: niente + & # o spazio crudi, ogni % è un %XX', () => {
  for (const relay of RELAY_DIFFICILI) {
    const pezzo = relayNelQr(relay);
    assert.doesNotMatch(pezzo, /[+&# ]/u, `crudo pericoloso in ${pezzo}`);
    assert.doesNotMatch(pezzo, /%(?![0-9A-F]{2})/u, `un % che non apre un %XX in ${pezzo}`);
    assert.match(pezzo, /^https:\/\//u, 'i : e le / restano crudi (il guadagno)');
  }
  assert.equal(relayNelQr('https://r.example/?token=a%2Fb'), 'https://r.example/?token=a%252Fb', 'un %XX del gettone si codifica: il telefono lo decodifica una volta sola');
});

test('ACC-QR-03 la codifica leggera accorcia: «://» e le «/» crude, 8 caratteri in meno sul relay di casa di n0', () => {
  const relay = 'https://euc1-1.relay.n0.example/';
  assert.equal(encodeURIComponent(relay).length - relayNelQr(relay).length, 8);
});

test('ACC-QR-04 correzione d\'errore L: il QR di n0 (id di 64 caratteri, nessun relay) ha 41 moduli per lato — con M erano 45', () => {
  const qr = testoDelQr({ pcId: 'f'.repeat(64), gettone: 'x'.repeat(22), scadeAlle: 1_761_500_000_000 });
  assert.equal(qr.length, 122, 'premessa: il testo misurato dalla CLI');
  assert.equal(moduliDelQr(qr).lato, 41);
});

/* Revisione del blocco 8 (27/10/2026), F-R1: con la tolleranza di 120 s del telefono un QR scaduto arriva al PC. Prima contava come
   gettone sbagliato e al quinto bloccava gli accoppiamenti 15 minuti, chiudendo anche il QR buono. */
test('ACC-SCADUTO-01 (blocco 8, F-R1) un QR scaduto emesso da questo PC risponde PAIR_EXPIRED e non conta; uno sconosciuto conta ancora', async () => {
  const { creaAccoppiamento, DURATA_OFFERTA_MS, RICORDO_SCADUTI_MS } = await import('../src/remoto/accoppiamento.mjs');
  let ora = Date.parse('2026-10-27T10:00:00.000Z');
  let n = 0;
  const acc = creaAccoppiamento({ clock: () => ora, casuale: (k) => Buffer.alloc(k, (n += 1) % 250) });
  const pc = 'p'.repeat(64);
  const vecchi = Array.from({ length: 6 }, () => acc.apri({ pcId: pc }).gettone).slice(-3);
  ora += DURATA_OFFERTA_MS + 1_000;
  const buono = acc.apri({ pcId: pc }).gettone;
  for (const g of vecchi) {
    assert.throws(() => acc.presenta({ gettone: g, pcId: pc, telefonoId: 't'.repeat(64) }), { code: 'PAIR_EXPIRED' });
  }
  assert.throws(() => acc.presenta({ gettone: vecchi[0], pcId: pc, telefonoId: 't'.repeat(64) }), { code: 'PAIR_TOKEN_INVALID' }, 'un gettone scaduto si dice una volta, poi è sconosciuto');
  assert.ok(acc.presenta({ gettone: buono, pcId: pc, telefonoId: 't'.repeat(64) }).codice, 'il QR buono funziona ancora: nessun blocco');
  /* AL CONTRARIO: dopo RICORDO_SCADUTI_MS un gettone scaduto torna sconosciuto, e gli sconosciuti contano verso il blocco */
  const tardi = acc.apri({ pcId: pc }).gettone;
  ora += DURATA_OFFERTA_MS + RICORDO_SCADUTI_MS + 1_000;
  assert.throws(() => acc.presenta({ gettone: tardi, pcId: pc, telefonoId: 't'.repeat(64) }), { code: 'PAIR_TOKEN_INVALID' });
});
