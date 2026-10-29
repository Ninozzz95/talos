/* Revisione avversaria del blocco 7 (27/10/2026), B-R1: SVE-T5-05 controlla il SORGENTE e non vede uno stato sbagliato (i mutanti MB7-1 e
   MB7-2 la lasciavano verde). REV-B7-B1 lo prova dal COMPORTAMENTO di `creaRemoto`. Originale in
   handoff/revisione-blocco-7-prove-2026-10-27/B-sveglie.test.mjs; la B2 (carta che perde «avvisato») resta fuori: è da decidere col contratto T5. */
/*
 * Revisione blocco 7 (27/10/2026) — pezzo B, `feat/sveglia-inviata` dff3732c2: «telefono avvisato» provato dal COMPORTAMENTO di
 * `creaRemoto` (non dal sorgente come SVE-T5-05): telefoni accoppiati davvero col servizio, sveglia a tempo vero (giro ogni 5 s),
 * Web Push finto. Nessuna rete. `R4=<cartella harness-ui>` (di serie: r4-sveglie).
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const { rimuoviCartellaDiProva } = await imp('tests/aiuto/rimuovi-cartella-di-prova.mjs');
const { creaAdattatorePortachiaviInMemoria } = await imp('src/adattatore-keyring.mjs');
const { ALPN_LAVORO } = await imp('src/remoto/accoppiamento.mjs');
const { codifica, creaLettore } = await imp('src/remoto/filo.mjs');
const { creaRemoto } = await imp('src/remoto/index.mjs');

const P256DH = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const AUTH = Buffer.alloc(16, 9).toString('base64url');
const ISCRIZIONE = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: P256DH, auth: AUTH } });
const finche = async (cond, entroMs = 20_000) => { const fine = Date.now() + entroMs; while (!(await cond())) { if (Date.now() > fine) throw new Error('condizione non raggiunta'); await new Promise((x) => setTimeout(x, 50)); } };

function banco(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rev-b7-sveglie-'));
  const sessioni = [];
  const inviate = [];
  const annunci = [];
  let gestisci = null;
  const remoto = creaRemoto({
    keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'impostazioni.json'), fileTelefoni: join(dir, 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => true, elenca: () => sessioni.map((s) => ({ ...s })) }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => ({}), nomePc: 'PC di prova',
    avviaTrasporto: async ({ gestisci: g }) => { gestisci = g; return { id: 'pc-id', relayDiCasa: () => null, indirizziDiretti: () => [], ferma: async () => {} }; },
    inviaWebPush: async (iscrizione) => { inviate.push(iscrizione.endpoint); return { statusCode: 201 }; },
  });
  remoto.ascoltaStato((e) => annunci.push(e));
  t.after(async () => { try { await remoto.ferma?.(); } catch { /* */ } await rimuoviCartellaDiProva(dir); });
  return { remoto, sessioni, inviate, annunci, gestisci: (c) => gestisci(c) };
}

async function accoppia(b, nome, sveglia) {
  const coda = []; let fine = false; const attesi = [];
  const conn = (alpn) => ({
    remoteId: `ep-${nome}`, alpn, chiusa: new Promise(() => {}), chiudi() { fine = true; while (attesi.length) attesi.shift()(null); },
    stream: { leggi: () => (coda.length ? Promise.resolve(coda.shift()) : fine ? Promise.resolve(null) : new Promise((x) => attesi.push(x))), scrivi: async () => {}, finisci: async () => {} },
  });
  const manda = (m) => { const byte = codifica(m); const a = attesi.shift(); if (a) a(byte); else coda.push(byte); };
  const { gettone } = await b.remoto.apriAccoppiamento();
  const fatto = b.gestisci(conn('talos-remote-pair/1'));
  manda({ t: 'pair.hello', gettone, nome, sveglia });
  await new Promise((x) => setTimeout(x, 30));
  await b.remoto.conferma((await b.remoto.stato()).attese.at(-1).id);
  manda({ t: 'bye' }); fine = true; while (attesi.length) attesi.shift()(null);
  await fatto.catch(() => {});
  return (await b.remoto.stato()).telefoni.find((v) => v.nome === nome && !v.revocatoAlle).id;
}

test('REV-B7-B1 stato().sveglie dal comportamento: le sveglie accettate coi NOMI dei telefoni, l\'annuncio «sveglia-inviata», e la revoca dal PC le toglie subito', async (t) => {
  const b = banco(t);
  await b.remoto.imposta({ relay: { modo: 'n0' }, acceso: true });
  const a = await accoppia(b, 'tel-a', ISCRIZIONE('a'));
  const c = await accoppia(b, 'tel-c', ISCRIZIONE('c'));
  b.sessioni.push({ sessionId: 'sessione-1' });
  await new Promise((x) => setTimeout(x, 5_600)); // il primo giro fa da base
  b.sessioni[0].inAttesaApprovazione = true;
  await finche(() => b.inviate.length >= 2);
  const s = (await b.remoto.stato()).sveglie;
  t.diagnostic(JSON.stringify(s));
  assert.deepEqual(s.map((x) => [x.nome, x.sessione]).sort(), [['tel-a', 'sessione-1'], ['tel-c', 'sessione-1']]); // B-R2: una riga per (telefono, sessione)
  assert.deepEqual(s.map((x) => x.telefono).sort(), [a, c].sort());
  assert.ok(b.annunci.filter((e) => e.motivo === 'sveglia-inviata').length >= 2, 'la finestra rilegge lo stato');
  assert.ok(b.annunci.filter((e) => e.motivo === 'sveglia-inviata').every((e) => e.sessione === 'sessione-1'), 'B-R2: l\'annuncio dice la sessione');
  await b.remoto.revoca(a);
  assert.deepEqual((await b.remoto.stato()).sveglie.map((x) => x.nome), ['tel-c'], 'revocato dal PC: via subito');
});

