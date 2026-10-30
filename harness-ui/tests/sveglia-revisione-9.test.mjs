/* Revisione avversaria del blocco 9 (27/10/2026), portata nel repo con la cura D-R1 (l'istante esatto della nascita nell'elenco).
   Originale in handoff/revisione-blocco-9-prove-2026-10-27/D-sveglie-b9.test.mjs; l'elenco finto ora dà anche `inAttesaApprovazioneDalle`. */
/*
 * Revisione blocco 9 (27/10/2026) — pezzo D, `778feba32` (H-R1..R3): «avvisato» solo per chi aspetta; un'approvazione nata più di 1 s
 * dopo quella vista prima è una carta nuova. `creaSveglia` VERO, invio/elenco/orologio finti (il banco del blocco 8).
 * i moduli di questo repo.
 */
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { SVEGLIE_MINIME_MS, creaSveglia } = await import(new URL('../src/remoto/sveglia.mjs', import.meta.url).href);

const ORA = Date.parse('2026-10-27T09:00:00Z');
const vapid = (() => { const e = createECDH('prime256v1'); e.generateKeys(); const k = e.getPrivateKey(); return { publicKey: e.getPublicKey().toString('base64url'), privateKey: Buffer.concat([Buffer.alloc(32 - k.length), k]).toString('base64url') }; })();
function banco() {
  let t = ORA; let sessioni = []; const inviate = []; const avvisi = [];
  const s = creaSveglia({
    elenca: () => sessioni, inLinea: () => [], vapid, clock: () => t, avvisa: (a) => avvisi.push(a),
    dispositivi: { elenca: async () => [{ id: 't1', sveglia: true, revocatoAlle: null }], iscrizione: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }), aggiornaSveglia: async () => {} },
    invia: async () => { inviate.push(t); return { statusCode: 201 }; },
  });
  return { s, inviate, avvisi, set: (x) => { sessioni = x; }, avanza: (ms) => { t += ms; }, ora: () => t };
}
/* una sessione che aspetta un'approvazione nata a `nataAlle` (l'elenco dà l'età, come `session-registry.mjs` inAttesaApprovazioneDaMs) */
const conApprovazione = (b, nataAlle) => ({ sessionId: 's1', conclusa: false, avviataAlle: new Date(ORA - 60_000).toISOString(), inAttesaApprovazione: true, inAttesaApprovazioneDaMs: b.ora() - nataAlle, inAttesaApprovazioneDalle: nataAlle }); // D-R1: l'istante, come il registro vero
const ferma = () => ({ sessionId: 's1', conclusa: false, avviataAlle: new Date(ORA - 60_000).toISOString() });

test('REV-B9-D1 approvazione 1 vista e svegliata, risposta subito dal PC, approvazione 2 nata 500 ms dopo la 1 (attrezzi in parallelo): la 2 eredita «avvisato» senza sveglia', async (t) => {
  const b = banco();
  b.set([ferma()]); await b.s.giro();
  b.avanza(100); const nata1 = b.ora();
  b.avanza(100);
  b.set([conApprovazione(b, nata1)]);
  assert.equal(await b.s.giro(), 1, 'premessa: sveglia per la carta 1');
  const alle1 = b.s.ultimeSveglie().find((x) => x.sessione === 's1')?.alle;
  /* risposta dal PC e carta 2, 500 ms dopo la nascita della 1 */
  b.avanza(400); const nata2 = b.ora();
  b.avanza(SVEGLIE_MINIME_MS + 1);
  b.set([conApprovazione(b, nata2)]);
  const partite = await b.s.giro();
  const riga = b.s.ultimeSveglie().find((x) => x.sessione === 's1');
  t.diagnostic(JSON.stringify({ nascitaFra: nata2 - nata1, sveglieCarta2: partite, avvisatoAlle: riga ? riga.alle - ORA : null, sveglia1: alle1 - ORA }));
  assert.ok(partite === 1 || !riga || riga.alle >= nata2, `carta 2 nata ${nata2 - nata1} ms dopo la 1: nessuna sveglia, e «avvisato» con la sveglia della carta 1 (alle ${riga?.alle - ORA} < nascita ${nata2 - ORA})`);
});

test('REV-B9-D2 (controllo) la stessa scena con la carta 2 nata 1,5 s dopo: sveglia nuova e record nuovo', async () => {
  const b = banco();
  b.set([ferma()]); await b.s.giro();
  b.avanza(100); const nata1 = b.ora(); b.avanza(100);
  b.set([conApprovazione(b, nata1)]);
  assert.equal(await b.s.giro(), 1);
  b.avanza(1_500); const nata2 = b.ora();
  b.avanza(SVEGLIE_MINIME_MS + 1);
  b.set([conApprovazione(b, nata2)]);
  assert.equal(await b.s.giro(), 1);
  assert.ok(b.s.ultimeSveglie().find((x) => x.sessione === 's1').alle >= nata2);
});

test('REV-B9-D3 (controllo) la stessa carta vista a due giri con l\'elenco lento (età calcolata 900 ms dopo l\'orologio della sveglia): nessuna sveglia doppia', async () => {
  const b = banco();
  b.set([ferma()]); await b.s.giro();
  b.avanza(100); const nata = b.ora(); b.avanza(100);
  b.set([conApprovazione(b, nata)]);
  assert.equal(await b.s.giro(), 1);
  b.avanza(SVEGLIE_MINIME_MS + 1);
  b.set([{ ...conApprovazione(b, nata), inAttesaApprovazioneDaMs: b.ora() - nata - 900 }]);
  assert.equal(await b.s.giro(), 0, 'la stessa carta non sveglia di nuovo');
});

test('REV-B9-D4 (misura) H-R4 rifatta: 20 sessioni che aspettano, 2 telefoni: quanti annunci', async (t) => {
  let tt = ORA; let sessioni = []; const avvisi = [];
  const s = creaSveglia({ elenca: () => sessioni, inLinea: () => [], vapid, clock: () => tt, avvisa: (a) => avvisi.push(a),
    dispositivi: { elenca: async () => [{ id: 't1', sveglia: true }, { id: 't2', sveglia: true }], iscrizione: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }), aggiornaSveglia: async () => {} },
    invia: async () => ({ statusCode: 201 }) });
  const venti = Array.from({ length: 20 }, (_, i) => ({ sessionId: `s${i}`, conclusa: false }));
  sessioni = venti; await s.giro();
  sessioni = venti.map((x) => ({ ...x, inAttesaDomanda: true })); tt += 1000; await s.giro();
  const annunci = avvisi.filter((a) => a.tipo === 'sveglia-inviata').length;
  t.diagnostic(`annunci: ${annunci} (blocco 8: 40), record tenuti: ${s.ultimeSveglie().length}`);
  assert.ok(annunci <= 16);
});
