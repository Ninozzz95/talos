import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { MAX_CHAT_FILE_BYTES } from '../src/chat-file-upload.mjs';
import { CODICI, codifica, creaLettore } from '../src/remoto/filo.mjs';
import { PEZZO_MASSIMO, VITA_TRASFERIMENTO_MS, creaFileDeiDispositivi, tipoDaiByte } from '../src/remoto/file-dispositivi.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { creaServizioRemoto } from '../src/remoto/servizio.mjs';
import { ALPN_LAVORO } from '../src/remoto/accoppiamento.mjs';

/*
 * 24/10/2026 notte — R5.13, lo scambio di file PC↔dispositivo, il FILO lato server (contratto
 * `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, Parte 2, «Revision 1: AGREED»; decisioni D1-D8 dell'owner).
 * Upload a pezzi con ripresa (P2.1), elenco e lettura a intervalli (P2.2), offerte (P2.4), l'avviso `file.nuovo`, i codici nuovi.
 * La pubblicazione passa dal VERO `saveChatFile` (l'helper nativo verificato): nessun secondo scrittore, nemmeno nelle prove.
 */

const HELPER = fileURLToPath(new URL('../native/talos-chat-upload.exe', import.meta.url));
/* 25/10/2026 (dalla CLI): `saveChatFile` verifica l'helper e, se serve, lo ricostruisce con `scripts/build-chat-upload-helper.mjs`; un
   albero con l'exe ignorato ma senza lo script (quello della CLI) lanciava invece di saltare. Servono tutti e due. */
const SCRIPT_HELPER = fileURLToPath(new URL('../scripts/build-chat-upload-helper.mjs', import.meta.url));
const senzaHelper = !existsSync(HELPER) || !existsSync(SCRIPT_HELPER);

const sha = (b) => createHash('sha256').update(b).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const resti = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).filter((n) => /\.(part|json)$/u.test(n) && !n.endsWith('offerte.json') && !n.endsWith('caricati.json')) : []);

/** Un banco: cartella dei dati, una sessione con la sua cartella, eventi finti e un orologio a comando. */
function banco(t, { eventi = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-file-disp-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const cartellaDati = join(dir, 'dati');
  const progetto = join(dir, 'progetto');
  mkdirSync(progetto, { recursive: true });
  const sessioni = new Map([['s1', realpathSync(progetto)]]);
  const orologio = { ora: 1_800_000_000_000 };
  const registro = {
    esiste: (id) => sessioni.has(id),
    cartellaPerChatFile: async (id) => (sessioni.has(id) ? { ok: true, cartella: sessioni.get(id) } : { erroreAvvio: true, code: 'NOT_FOUND' }),
  };
  const crea = (extra = {}) => creaFileDeiDispositivi({
    cartella: cartellaDati, sessionRegistry: registro, eventiDellaSessione: (id) => (sessioni.has(id) ? eventi : []), clock: () => orologio.ora, ...extra,
  });
  return { dir, cartellaDati, trasferimenti: join(cartellaDati, 'trasferimenti'), progetto: realpathSync(progetto), sessioni, orologio, registro, eventi, crea, file: crea() };
}

async function caricaTutto(f, { dispositivoId = 'dA', sessionId = 's1', nome, contenuto, pezzo = PEZZO_MASSIMO }) {
  const avvio = await f.inizia({ dispositivoId, sessionId, nome, dimensione: contenuto.length, sha256: sha(contenuto) });
  for (let da = 0; da < contenuto.length; da += pezzo) {
    await f.pezzo({ dispositivoId, trasferimentoId: avvio.trasferimentoId, da, dati: b64u(contenuto.subarray(da, da + pezzo)) });
  }
  return { avvio, esito: await f.fine({ dispositivoId, trasferimentoId: avvio.trasferimentoId }) };
}

const rifiutaCon = (code, extra = () => true) => (e) => { assert.equal(e.code, code, `atteso ${code}, arrivato ${e.code}: ${e.message}`); return extra(e); };

test('FD-00 i codici nuovi sono nel filo; FILE_NOT_ALLOWED riservato', () => {
  for (const c of ['FILE_TOO_LARGE', 'TRANSFER_UNKNOWN', 'TRANSFER_EXPIRED', 'CHECKSUM_MISMATCH', 'FILE_GONE', 'FILE_NOT_ALLOWED']) assert.ok(CODICI.includes(c), c);
});

test('FD-01 upload intero in pezzi: pubblicato in allegati/ dal vero saveChatFile, il parziale sparisce', { skip: senzaHelper }, async (t) => {
  const b = banco(t);
  const contenuto = Buffer.alloc(PEZZO_MASSIMO * 2 + 1234, 7);
  const { avvio, esito } = await caricaTutto(b.file, { nome: 'dati.bin', contenuto });
  assert.match(avvio.trasferimentoId, /^[A-Za-z0-9_-]{22}$/u);
  assert.equal(avvio.pezzo, PEZZO_MASSIMO);
  assert.equal(avvio.ricevuti, 0);
  assert.equal(esito.nome, 'dati.bin');
  assert.equal(esito.percorso, 'allegati/dati.bin');
  assert.equal(esito.dimensione, contenuto.length);
  assert.equal(esito.immagine, false);
  assert.equal(esito.sha256, sha(contenuto));
  assert.match(esito.fileId, /^[A-Za-z0-9_-]{32}$/u);
  assert.ok(readFileSync(join(b.progetto, 'allegati', 'dati.bin')).equals(contenuto));
  assert.equal(Object.hasOwn(esito, 'assoluto'), false, 'mai il percorso assoluto del PC al dispositivo');
  assert.deepEqual(resti(b.trasferimenti), []);
  /* e compare in file.list come allegato, con lo sha256 che il PC conosce, anche per un altro dispositivo della sessione */
  const { items } = await b.file.elenco({ dispositivoId: 'dB', sessionId: 's1' });
  const riga = items.find((r) => r.fileId === esito.fileId);
  assert.equal(riga?.origine, 'allegato');
  assert.equal(riga?.sha256, sha(contenuto));
  /* un `end` ripetuto (risposta persa, `n` nuovo) ridà lo stesso esito invece di TRANSFER_UNKNOWN */
  assert.deepEqual(await b.file.fine({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId }), esito);
});

test('FD-02 ripresa a metà, anche dopo un riavvio del server', { skip: senzaHelper }, async (t) => {
  const b = banco(t);
  const contenuto = Buffer.alloc(PEZZO_MASSIMO + 99, 3);
  const avvio = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'r.bin', dimensione: contenuto.length, sha256: sha(contenuto) });
  await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId, da: 0, dati: b64u(contenuto.subarray(0, PEZZO_MASSIMO)) });
  const dopo = b.crea(); // un server nuovo sugli stessi dati
  const ripresa = await dopo.inizia({ dispositivoId: 'dA', sessionId: 's1', riprendi: avvio.trasferimentoId });
  assert.equal(ripresa.trasferimentoId, avvio.trasferimentoId);
  assert.equal(ripresa.ricevuti, PEZZO_MASSIMO);
  await dopo.pezzo({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId, da: PEZZO_MASSIMO, dati: b64u(contenuto.subarray(PEZZO_MASSIMO)) });
  const esito = await dopo.fine({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId });
  assert.ok(readFileSync(join(b.progetto, esito.percorso)).equals(contenuto));
  /* riprendere in un'altra sessione non apre il trasferimento di questa */
  const altro = await dopo.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'q.bin', dimensione: 4, sha256: 'a'.repeat(64) });
  b.sessioni.set('s2', b.progetto);
  await assert.rejects(dopo.inizia({ dispositivoId: 'dA', sessionId: 's2', riprendi: altro.trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
});

test('FD-03 un pezzo ripetuto è idempotente; FD-04 un `da` sbagliato si rifiuta col `ricevuti` attuale', async (t) => {
  const b = banco(t);
  const contenuto = Buffer.alloc(300, 1);
  const { trasferimentoId } = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'x.bin', dimensione: 300, sha256: sha(contenuto) });
  assert.equal((await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 0, dati: b64u(contenuto.subarray(0, 100)) })).ricevuti, 100);
  assert.equal((await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 0, dati: b64u(contenuto.subarray(0, 100)) })).ricevuti, 100);
  await assert.rejects(b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 200, dati: b64u(contenuto.subarray(200)) }),
    rifiutaCon('BAD_MESSAGE', (e) => e.reason === 'offset-mismatch' && e.params?.ricevuti === 100 && e.stato === 409));
  /* sovrapposto a metà: non è una ripetizione, è un `da` sbagliato */
  await assert.rejects(b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 50, dati: b64u(contenuto.subarray(50, 150)) }),
    rifiutaCon('BAD_MESSAGE', (e) => e.params?.ricevuti === 100));
  /* tus 1.0: dopo il 409 il caricamento resta com'era e si continua dal `ricevuti` */
  assert.equal((await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 100, dati: b64u(contenuto.subarray(100)) })).ricevuti, 300);
  const part = resti(b.trasferimenti).find((n) => n.endsWith('.part'));
  assert.equal(readFileSync(join(b.trasferimenti, part)).length, 300, 'la ripetizione non ha scritto due volte');
});

test('FD-05 oltre il tetto: dichiarato troppo grande, e dichiarato piccolo che mente', async (t) => {
  const b = banco(t);
  await assert.rejects(b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'g.bin', dimensione: MAX_CHAT_FILE_BYTES + 1, sha256: 'a'.repeat(64) }), rifiutaCon('FILE_TOO_LARGE'));
  const { trasferimentoId } = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'm.bin', dimensione: 10, sha256: 'a'.repeat(64) });
  await assert.rejects(b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 0, dati: b64u(Buffer.alloc(20)) }), rifiutaCon('FILE_TOO_LARGE'));
  /* il trasferimento che ha mentito non resta aperto, e il suo parziale non resta sul disco */
  await assert.rejects(b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 0, dati: b64u(Buffer.alloc(5)) }), rifiutaCon('TRANSFER_UNKNOWN'));
  assert.deepEqual(resti(b.trasferimenti), []);
  /* un pezzo più grande di 512 KiB grezzi si rifiuta (la busta lo porterebbe, il contratto no) */
  const altro = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'p.bin', dimensione: PEZZO_MASSIMO + 1, sha256: 'a'.repeat(64) });
  await assert.rejects(b.file.pezzo({ dispositivoId: 'dA', trasferimentoId: altro.trasferimentoId, da: 0, dati: b64u(Buffer.alloc(PEZZO_MASSIMO + 1)) }), rifiutaCon('BAD_MESSAGE'));
  /* base64url storto */
  await assert.rejects(b.file.pezzo({ dispositivoId: 'dA', trasferimentoId: altro.trasferimentoId, da: 0, dati: 'ab+/==' }), rifiutaCon('BAD_MESSAGE'));
});

test('FD-06 sha256 sbagliato: CHECKSUM_MISMATCH e niente in allegati/', async (t) => {
  const b = banco(t);
  const contenuto = Buffer.from('ciao');
  const { trasferimentoId } = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'c.txt', dimensione: 4, sha256: sha(Buffer.from('cia0')) });
  await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 0, dati: b64u(contenuto) });
  await assert.rejects(b.file.fine({ dispositivoId: 'dA', trasferimentoId }), rifiutaCon('CHECKSUM_MISMATCH'));
  assert.equal(existsSync(join(b.progetto, 'allegati', 'c.txt')), false);
  assert.deepEqual(resti(b.trasferimenti), []);
  /* fine prima del tempo: incompleto, col `ricevuti` */
  const due = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'd.txt', dimensione: 4, sha256: sha(contenuto) });
  await assert.rejects(b.file.fine({ dispositivoId: 'dA', trasferimentoId: due.trasferimentoId }), rifiutaCon('BAD_MESSAGE', (e) => e.reason === 'transfer-incomplete' && e.params?.ricevuti === 0));
  /* uno sha256 che non è uno sha256 */
  await assert.rejects(b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'e.txt', dimensione: 4, sha256: 'xyz' }), rifiutaCon('BAD_MESSAGE'));
});

test('FD-07 scaduto dopo 24 ore senza attività: TRANSFER_EXPIRED, e il parziale si cancella', async (t) => {
  const b = banco(t);
  const { trasferimentoId } = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'e.bin', dimensione: 10, sha256: 'a'.repeat(64) });
  await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 0, dati: b64u(Buffer.alloc(4)) });
  b.orologio.ora += VITA_TRASFERIMENTO_MS - 1;
  await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 4, dati: b64u(Buffer.alloc(2)) }); // ancora vivo, e l'attività rinnova
  b.orologio.ora += VITA_TRASFERIMENTO_MS + 1;
  await assert.rejects(b.file.pezzo({ dispositivoId: 'dA', trasferimentoId, da: 6, dati: b64u(Buffer.alloc(4)) }), rifiutaCon('TRANSFER_EXPIRED'));
  await assert.rejects(b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', riprendi: trasferimentoId }), rifiutaCon('TRANSFER_EXPIRED'));
  assert.deepEqual(resti(b.trasferimenti), []);
  /* scaduto si riconosce anche da un server nuovo, che spazza all'avvio */
  const secondo = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'f.bin', dimensione: 10, sha256: 'a'.repeat(64) });
  b.orologio.ora += VITA_TRASFERIMENTO_MS + 1;
  await assert.rejects(b.crea().inizia({ dispositivoId: 'dA', sessionId: 's1', riprendi: secondo.trasferimentoId }), rifiutaCon('TRANSFER_EXPIRED'));
  /* un id mai visto è un'altra cosa */
  await assert.rejects(b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', riprendi: 'A'.repeat(22) }), rifiutaCon('TRANSFER_UNKNOWN'));
  await assert.rejects(b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', riprendi: '../../x' }), rifiutaCon('TRANSFER_UNKNOWN'));
});

test('FD-08 nomi ostili rifiutati PRIMA di ricevere un byte', async (t) => {
  const b = banco(t);
  for (const nome of ['..', '.', '...', 'a/b', 'a\\b', '../x', 'x'.repeat(241), '', 'con\u0000trollo', 7]) {
    await assert.rejects(b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome, dimensione: 1, sha256: 'a'.repeat(64) }),
      rifiutaCon('QUERY_INVALID', (e) => e.reason === 'file-name-invalid'), JSON.stringify(nome));
  }
  assert.deepEqual(resti(b.trasferimenti), []);
});

test('FD-09 il tipo si decide sui BYTE, non sul nome', { skip: senzaHelper }, async (t) => {
  assert.deepEqual(tipoDaiByte(PNG), { mime: 'image/png', immagine: true });
  assert.equal(tipoDaiByte(Buffer.from('%PDF-1.7\n')).mime, 'application/pdf');
  assert.equal(tipoDaiByte(Buffer.from([0, 1, 2, 3, 0xff])).mime, 'application/octet-stream');
  const b = banco(t);
  const finta = await caricaTutto(b.file, { nome: 'foto.png', contenuto: Buffer.from('non sono una foto') });
  assert.equal(finta.esito.immagine, false);
  assert.equal(finta.esito.mime, 'text/plain');
  const vera = await caricaTutto(b.file, { nome: 'nota.txt', contenuto: PNG });
  assert.equal(vera.esito.immagine, true);
  assert.equal(vera.esito.mime, 'image/png');
});

test('FD-10 file.read a intervalli; su un file cambiato FILE_GONE; FD-11 un fileId inventato FILE_GONE', async (t) => {
  const b = banco(t);
  const contenuto = Buffer.alloc(1000, 9);
  writeFileSync(join(b.progetto, 'report.pdf'), contenuto);
  const offerta = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'report.pdf') });
  const { items } = await b.file.elenco({ dispositivoId: 'dA', sessionId: 's1' });
  const riga = items.find((r) => r.fileId === offerta.fileId);
  assert.equal(riga.origine, 'inviato');
  assert.equal(riga.sha256, sha(contenuto));
  assert.equal(Object.hasOwn(riga, 'percorso'), false, 'mai un percorso al dispositivo');
  const primo = await b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 0, quanti: 600 });
  assert.equal(primo.fine, false);
  const secondo = await b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 600, quanti: 600 });
  assert.equal(secondo.fine, true);
  assert.ok(Buffer.concat([Buffer.from(primo.dati, 'base64url'), Buffer.from(secondo.dati, 'base64url')]).equals(contenuto));
  await assert.rejects(b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 0, quanti: PEZZO_MASSIMO + 1 }), rifiutaCon('BAD_MESSAGE'));
  /* il file cambia: la versione vecchia non legge più */
  writeFileSync(join(b.progetto, 'report.pdf'), Buffer.alloc(1001, 1));
  utimesSync(join(b.progetto, 'report.pdf'), new Date(), new Date(Date.now() + 5000));
  await assert.rejects(b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 0, quanti: 10 }), rifiutaCon('FILE_GONE'));
  await assert.rejects(b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: 'Z'.repeat(32), versione: riga.versione, da: 0, quanti: 10 }), rifiutaCon('FILE_GONE'));
});

test('FD-12 il dispositivo B non vede né legge l\'offerta fatta al dispositivo A; FD-14 né tocca i suoi trasferimenti', async (t) => {
  const b = banco(t);
  writeFileSync(join(b.progetto, 'solo-per-a.txt'), 'segreto di A');
  const offerta = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'solo-per-a.txt') });
  const delB = await b.file.elenco({ dispositivoId: 'dB', sessionId: 's1' });
  assert.equal(delB.items.some((r) => r.fileId === offerta.fileId), false);
  await assert.rejects(b.file.leggi({ dispositivoId: 'dB', sessionId: 's1', fileId: offerta.fileId, versione: offerta.versione, da: 0, quanti: 10 }), rifiutaCon('FILE_GONE'));
  const { trasferimentoId } = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'a.bin', dimensione: 4, sha256: 'a'.repeat(64) });
  await assert.rejects(b.file.pezzo({ dispositivoId: 'dB', trasferimentoId, da: 0, dati: b64u(Buffer.alloc(4)) }), rifiutaCon('TRANSFER_UNKNOWN'));
  await assert.rejects(b.file.inizia({ dispositivoId: 'dB', sessionId: 's1', riprendi: trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
  await assert.rejects(b.file.fine({ dispositivoId: 'dB', trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
});

test('FD-15 le offerte: stato inviato → in scaricamento con percentuale → scaricato con l\'ora; D2 resta per chi è fuori linea; D8 muore col file cambiato', async (t) => {
  const b = banco(t);
  writeFileSync(join(b.progetto, 'r.txt'), Buffer.alloc(1000, 65));
  const offerta = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'r.txt') });
  assert.equal(b.file.offerte('s1')[0].stato, 'inviato');
  /* D2: un server nuovo (il dispositivo era fuori linea) la conserva */
  const dopo = b.crea();
  const riga = (await dopo.elenco({ dispositivoId: 'dA', sessionId: 's1' })).items.find((r) => r.fileId === offerta.fileId);
  assert.equal(riga?.origine, 'inviato');
  /* D-1 del Mobile (25/10/2026): la riga porta l'id dell'offerta e l'ora dell'invio (mai il percorso) */
  assert.equal(riga.offertaId, offerta.offertaId);
  assert.equal(riga.inviataAlle, b.orologio.ora);
  assert.equal(Object.hasOwn(riga, 'percorso'), false);
  await dopo.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 0, quanti: 620 });
  const meta = dopo.offerte('s1')[0];
  assert.equal(meta.stato, 'in-scaricamento');
  assert.equal(meta.percentuale, 62);
  /* letture fuori ordine non spostano la percentuale */
  await dopo.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 900, quanti: 50 });
  assert.equal(dopo.offerte('s1')[0].percentuale, 62);
  b.orologio.ora += 1234;
  await dopo.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 620, quanti: 620 });
  const finita = dopo.offerte('s1')[0];
  assert.equal(finita.stato, 'scaricato');
  assert.equal(finita.percentuale, 100);
  assert.equal(finita.scaricatoAlle, b.orologio.ora);
  /* lo stato «scaricato» sopravvive a un riavvio */
  assert.equal(b.crea().offerte('s1')[0].stato, 'scaricato');
  /* D8: il file cambia ⇒ l'offerta non è più nell'elenco del dispositivo, e il PC la vede «cambiato» (D6: «Manda di nuovo») */
  writeFileSync(join(b.progetto, 'r.txt'), Buffer.alloc(10, 66));
  utimesSync(join(b.progetto, 'r.txt'), new Date(), new Date(Date.now() + 5000));
  assert.equal((await dopo.elenco({ dispositivoId: 'dA', sessionId: 's1' })).items.some((r) => r.origine === 'inviato'), false);
  /* owner 25/10/2026: già SCARICATA ⇒ per il PC resta «scaricato», col segno della versione nuova (prima: «cambiato») */
  assert.equal(dopo.offerte('s1')[0].stato, 'scaricato');
  assert.equal(dopo.offerte('s1')[0].cambiatoDopo, true);
  /* una conversazione cancellata non porta più le sue offerte */
  b.sessioni.delete('s1');
  assert.deepEqual(dopo.offerte('s1'), []);
  /* un percorso fuori dalla cartella della sessione non si offre */
  b.sessioni.set('s1', b.progetto);
  writeFileSync(join(b.dir, 'fuori.txt'), 'fuori');
  await assert.rejects(b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.dir, 'fuori.txt') }), rifiutaCon('FILE_GONE'));
});

test('FD-18 file.list: allegati delle bolle solo dentro allegati/, file del modello coi giri, mai fuori dalla cartella', async (t) => {
  const eventi = [];
  const b = banco(t, { eventi });
  mkdirSync(join(b.progetto, 'allegati'), { recursive: true });
  writeFileSync(join(b.progetto, 'allegati', 'foto.png'), PNG);
  writeFileSync(join(b.progetto, 'scritto.md'), '# ciao');
  writeFileSync(join(b.dir, 'segreto.txt'), 'fuori dalla cartella');
  eventi.push(
    { type: 'RunStarted', contesto: { bolla: { testo: 'guarda', allegati: [{ nome: 'foto.png', percorso: 'allegati/foto.png' }, { nome: 's', percorso: join(b.dir, 'segreto.txt') }, { nome: 'x', percorso: 'scritto.md' }] } } },
    { type: 'RunStarted' },
    { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'scrivi' },
    { type: 'ToolCallArgs', toolCallId: 't1', delta: JSON.stringify({ percorso: 'scritto.md' }) },
    { type: 'ToolCallResult', toolCallId: 't1' },
    { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'file_edit' },
    { type: 'ToolCallArgs', toolCallId: 't2', delta: JSON.stringify({ path: join(b.dir, 'segreto.txt') }) },
    { type: 'ToolCallResult', toolCallId: 't2' },
    { type: 'ToolCallStart', toolCallId: 't3', toolCallName: 'scrivi' },
    { type: 'ToolCallArgs', toolCallId: 't3', delta: JSON.stringify({ percorso: 'fallito.md' }) },
    { type: 'ToolCallResult', toolCallId: 't3', isError: true },
  );
  writeFileSync(join(b.progetto, 'fallito.md'), 'esiste ma la scrittura del modello è fallita');
  const { items } = await b.file.elenco({ dispositivoId: 'dA', sessionId: 's1' });
  const perNome = Object.fromEntries(items.map((r) => [r.nome, r]));
  assert.equal(perNome['foto.png']?.origine, 'allegato');
  assert.equal(perNome['foto.png']?.mime, 'image/png');
  assert.equal(perNome['foto.png']?.giro, 1);
  assert.equal(perNome['scritto.md']?.origine, 'modello', 'una bolla che nomina un file fuori da allegati/ non lo rende allegato');
  assert.equal(perNome['scritto.md']?.giro, 2);
  assert.equal(perNome['segreto.txt'], undefined, 'un percorso fuori dalla cartella della sessione non si elenca mai');
  assert.equal(perNome['fallito.md'], undefined, 'una scrittura fallita non è un file del modello');
  await assert.rejects(b.file.elenco({ dispositivoId: 'dA', sessionId: 'nessuna' }), rifiutaCon('NOT_FOUND'));
});

/* ---------- dentro le operazioni del filo: consenso, file.nuovo, l'elenco chiuso ---------- */

function bancoOperazioni(t, { consentite = new Set(['dA']) } = {}) {
  const b = banco(t);
  const cartelle = {
    consentita: async (dispositivoId) => consentite.has(dispositivoId),
    descrivi: async () => ({ cartellaId: 'cid', nome: 'progetto' }),
    elenco: async () => [],
  };
  const operazioni = creaOperazioni({ chiama: async () => ({ dati: {} }), sessionRegistry: b.registro, iscriviConRigiocata: () => () => {}, cartelle, file: b.file });
  const contesto = (id) => {
    const inviati = [];
    const iscrizioni = new Map();
    return { dispositivo: { id, nome: id }, iscrizioni, inviati, iscrivi: (sub, chiudi) => { iscrizioni.set(sub, chiudi); return async (data) => { inviati.push({ sub, data }); }; } };
  };
  return { ...b, operazioni, contesto, consentite };
}

test('FD-13 senza consenso: begin, chunk ed end si rifiutano con CONSENT_REQUIRED; la lettura resta libera', async (t) => {
  const b = bancoOperazioni(t);
  const cA = b.contesto('dA');
  const { trasferimentoId } = await b.operazioni.esegui('file.upload.begin', { sessionId: 's1', nome: 'n.txt', dimensione: 2, sha256: sha(Buffer.from('ok')) }, cA);
  await assert.rejects(b.operazioni.esegui('file.upload.begin', { sessionId: 's1', nome: 'n.txt', dimensione: 2, sha256: 'a'.repeat(64) }, b.contesto('dB')), rifiutaCon('CONSENT_REQUIRED'));
  b.consentite.delete('dA'); // il PC toglie il consenso a metà
  await assert.rejects(b.operazioni.esegui('file.upload.chunk', { trasferimentoId, da: 0, dati: b64u(Buffer.from('ok')) }, cA), rifiutaCon('CONSENT_REQUIRED'));
  await assert.rejects(b.operazioni.esegui('file.upload.end', { trasferimentoId }, cA), rifiutaCon('CONSENT_REQUIRED'));
  const elenco = await b.operazioni.esegui('file.list', { sessionId: 's1' }, b.contesto('dB'));
  assert.ok(Array.isArray(elenco.items));
  for (const op of ['file.upload.begin', 'file.upload.chunk', 'file.upload.end', 'file.list', 'file.read']) assert.ok(b.operazioni.elenco().includes(op), op);
  /* un id di sessione storto è BAD_MESSAGE prima del consenso */
  await assert.rejects(b.operazioni.esegui('file.upload.begin', { sessionId: '..', nome: 'n.txt', dimensione: 2, sha256: 'a'.repeat(64) }, b.contesto('dB')), rifiutaCon('BAD_MESSAGE'));
});

test('FD-13b senza il modulo dei file (o delle cartelle) le operazioni dei file non esistono', async () => {
  const operazioni = creaOperazioni({ chiama: async () => ({ dati: {} }), sessionRegistry: { esiste: () => true }, iscriviConRigiocata: () => () => {} });
  assert.equal(operazioni.elenco().includes('file.upload.begin'), false);
  await assert.rejects(operazioni.esegui('file.upload.begin', { sessionId: 's1' }, { dispositivo: { id: 'dA' } }), rifiutaCon('UNKNOWN_OPERATION'));
});

test('FD-16 l\'avviso file.nuovo arriva sullo stream degli eventi già aperto, solo al dispositivo dell\'offerta', async (t) => {
  const b = bancoOperazioni(t);
  const cA = b.contesto('dA');
  const cB = b.contesto('dB');
  await b.operazioni.esegui('session.events', { sessionId: 's1', sub: 'evA' }, cA);
  await b.operazioni.esegui('session.events', { sessionId: 's1', sub: 'evB' }, cB);
  writeFileSync(join(b.progetto, 'per-a.txt'), 'x');
  const offerta = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'per-a.txt') });
  assert.deepEqual(cA.inviati, [{ sub: 'evA', data: { type: 'CUSTOM', name: 'file.nuovo', value: { sessionId: 's1', fileId: offerta.fileId } } }]);
  assert.deepEqual(cB.inviati, []);
  /* chiusa l'iscrizione, niente più avvisi */
  await b.operazioni.esegui('session.unsubscribe', { sub: 'evA' }, cA);
  writeFileSync(join(b.progetto, 'per-a-2.txt'), 'y');
  await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'per-a-2.txt') });
  assert.equal(cA.inviati.length, 1);
});

/* ---------- la finestra di 4 pezzi in volo sullo STESSO stream, trattati in ordine ---------- */

test('FD-17 quattro pezzi in volo in una sola scrittura: quattro risposte, in ordine', async (t) => {
  const b = bancoOperazioni(t);
  const versoPc = []; const attese = []; const uscite = [];
  const lettore = creaLettore();
  let chiusa = false;
  const conn = {
    remoteId: 'tel', alpn: ALPN_LAVORO,
    stream: {
      leggi: () => (versoPc.length ? Promise.resolve(versoPc.shift()) : chiusa ? Promise.resolve(null) : new Promise((r) => attese.push(r))),
      scrivi: async (bytes) => { uscite.push(...lettore.aggiungi(bytes)); },
      finisci: async () => {},
    },
    chiudi() { chiusa = true; while (attese.length) attese.shift()(null); },
  };
  const dispositivi = { ammesso: async () => ({ id: 'dA', nome: 'Pad' }), visto: async () => {} };
  const servizio = creaServizioRemoto({ pcId: 'pc', accoppiamento: {}, dispositivi, operazioni: b.operazioni });
  const contenuto = Buffer.alloc(4 * 1000, 5);
  const fatto = servizio.gestisci(conn);
  const metti = (pezzo) => { const a = attese.shift(); if (a) a(pezzo); else versoPc.push(pezzo); };
  const aspetta = async (n) => { for (let i = 0; uscite.length < n && i < 2000; i += 1) await new Promise((r) => setTimeout(r, 1)); };
  metti(codifica({ t: 'req', n: 'begin-0001', op: 'file.upload.begin', args: { sessionId: 's1', nome: 'w.bin', dimensione: contenuto.length, sha256: sha(contenuto) } }));
  await aspetta(1);
  const tid = uscite[0].data.trasferimentoId;
  metti(Buffer.concat([0, 1, 2, 3].map((i) => codifica({ t: 'req', n: `chunk-000${i}`, op: 'file.upload.chunk', args: { trasferimentoId: tid, da: i * 1000, dati: b64u(contenuto.subarray(i * 1000, (i + 1) * 1000)) } }))));
  await aspetta(5);
  assert.deepEqual(uscite.slice(1).map((m) => [m.n, m.ok, m.data?.ricevuti]), [['chunk-0000', true, 1000], ['chunk-0001', true, 2000], ['chunk-0002', true, 3000], ['chunk-0003', true, 4000]]);
  conn.chiudi();
  await fatto;
});

/* ---------- la misura: 25 MiB in locale ---------- */

test('FD-20 misura: 25 MiB caricati in locale, tempo e memoria del processo', { skip: senzaHelper }, async (t) => {
  const b = banco(t);
  const contenuto = Buffer.alloc(MAX_CHAT_FILE_BYTES);
  for (let i = 0; i < contenuto.length; i += 4096) contenuto[i] = i % 251;
  const prima = process.memoryUsage();
  let piccoRss = prima.rss;
  const inizio = process.hrtime.bigint();
  const avvio = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'grande.bin', dimensione: contenuto.length, sha256: sha(contenuto) });
  for (let da = 0; da < contenuto.length; da += PEZZO_MASSIMO) {
    await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId, da, dati: b64u(contenuto.subarray(da, da + PEZZO_MASSIMO)) });
    piccoRss = Math.max(piccoRss, process.memoryUsage().rss);
  }
  const esito = await b.file.fine({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId });
  const ms = Number(process.hrtime.bigint() - inizio) / 1e6;
  piccoRss = Math.max(piccoRss, process.memoryUsage().rss);
  assert.equal(esito.dimensione, contenuto.length);
  assert.ok(readFileSync(join(b.progetto, 'allegati', 'grande.bin')).equals(contenuto));
  const MiB = (n) => (n / 1048576).toFixed(1);
  t.diagnostic(`MISURA 25 MiB: ${ms.toFixed(0)} ms, ${(25 / (ms / 1000)).toFixed(1)} MiB/s; rss prima ${MiB(prima.rss)} MiB, picco ${MiB(piccoRss)} MiB (+${MiB(piccoRss - prima.rss)}); heap ${MiB(process.memoryUsage().heapUsed)} MiB`);
});

/* ---------- il cablaggio in `creaRemoto` (index.mjs) ---------- */

test('FD-19 creaRemoto: il modulo dei file c\'è con le cartelle, legge gli eventi dalla rigiocata del registro, e manca senza', async (t) => {
  const { creaRemoto } = await import('../src/remoto/index.mjs');
  const { creaAdattatorePortachiaviInMemoria } = await import('../src/adattatore-keyring.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'talos-file-disp-remoto-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const progetto = join(dir, 'progetto');
  mkdirSync(join(progetto, 'allegati'), { recursive: true });
  writeFileSync(join(progetto, 'allegati', 'a.txt'), 'allegato');
  const eventi = [{ type: 'RunStarted', bolla: { testo: 'x', allegati: [{ percorso: 'allegati/a.txt' }] } }];
  let iscritti = 0;
  const sessionRegistry = {
    esiste: (id) => id === 's1', cartellePiuUsate: () => [],
    cartellaPerChatFile: async (id) => (id === 's1' ? { ok: true, cartella: progetto } : { code: 'NOT_FOUND' }),
    iscriviti: (id, fn) => { iscritti += 1; for (const e of eventi) fn(e); return () => { iscritti -= 1; }; },
  };
  const base = { keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'r', 'impostazioni.json'), fileTelefoni: join(dir, 'r', 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry, iscriviConRigiocata: () => () => {}, caricaIroh: async () => null, nomePc: 'PC' };
  const conCartelle = creaRemoto({ ...base, fileConsensi: join(dir, 'r', 'consensi.json'), fileSegretoCartelle: join(dir, 'r', 'segreto-cartelle') });
  assert.ok(conCartelle.file, 'il modulo dei file esiste accanto alle cartelle');
  const { items } = await conCartelle.file.elenco({ dispositivoId: 'dA', sessionId: 's1' });
  assert.deepEqual(items.map((r) => [r.nome, r.origine]), [['a.txt', 'allegato']]);
  assert.equal(iscritti, 0, 'la rigiocata degli eventi si chiude subito');
  assert.ok(existsSync(join(dir, 'r', 'file-dispositivi', 'segreto')), 'i dati stanno accanto a quelli delle cartelle');
  assert.equal(creaRemoto(base).file, null, 'senza le cartelle col consenso, niente scambio di file');
});

test('FD-21 il servizio NON ricorda le risposte di file.read (fino a 683 KiB l\'una): una lettura ripetuta col suo `n` si rifà', async (t) => {
  const b = bancoOperazioni(t);
  const versoPc = []; const attese = []; const uscite = [];
  const lettore = creaLettore();
  let chiusa = false;
  const conn = {
    remoteId: 'tel', alpn: ALPN_LAVORO,
    stream: {
      leggi: () => (versoPc.length ? Promise.resolve(versoPc.shift()) : chiusa ? Promise.resolve(null) : new Promise((r) => attese.push(r))),
      scrivi: async (bytes) => { uscite.push(...lettore.aggiungi(bytes)); },
      finisci: async () => {},
    },
    chiudi() { chiusa = true; while (attese.length) attese.shift()(null); },
  };
  const servizio = creaServizioRemoto({ pcId: 'pc', accoppiamento: {}, dispositivi: { ammesso: async () => ({ id: 'dA', nome: 'Pad' }), visto: async () => {} }, operazioni: b.operazioni });
  const fatto = servizio.gestisci(conn);
  const metti = (pezzo) => { const a = attese.shift(); if (a) a(pezzo); else versoPc.push(pezzo); };
  const aspetta = async (n) => { for (let i = 0; uscite.length < n && i < 2000; i += 1) await new Promise((r) => setTimeout(r, 1)); };
  writeFileSync(join(b.progetto, 'v.txt'), 'prima');
  const offerta = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'v.txt') });
  const lettura = { t: 'req', n: 'read-00001', op: 'file.read', args: { sessionId: 's1', fileId: offerta.fileId, versione: offerta.versione, da: 0, quanti: 100 } };
  metti(codifica(lettura));
  await aspetta(1);
  assert.equal(Buffer.from(uscite[0].data.dati, 'base64url').toString(), 'prima');
  writeFileSync(join(b.progetto, 'v.txt'), 'dopo, più lungo');
  metti(codifica(lettura)); // stesso `n`: se fosse ricordata tornerebbero i byte vecchi
  await aspetta(2);
  assert.equal(uscite[1].ok, false);
  assert.equal(uscite[1].code, 'FILE_GONE');
  conn.chiudi();
  await fatto;
});

test('FD-OFF-01 (D-3, 25/10) `file.offers`: le offerte ancora da scaricare di QUEL dispositivo, in tutte le sessioni, senza percorsi', async (t) => {
  const b = banco(t);
  writeFileSync(join(b.progetto, 'a.txt'), 'uno');
  writeFileSync(join(b.progetto, 'b.txt'), 'due');
  const oa = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'a.txt') });
  await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dB', percorso: join(b.progetto, 'b.txt') });
  const { items } = await b.file.offerteInAttesa('dA');
  assert.equal(items.length, 1, 'solo quelle di dA');
  assert.deepEqual(Object.keys(items[0]).sort(), ['dimensione', 'fileId', 'inviataAlle', 'mime', 'nome', 'offertaId', 'sessionId', 'versione']);
  assert.equal(items[0].offertaId, oa.offertaId);
  assert.equal(items[0].fileId, oa.fileId);
  assert.equal(items[0].mime, 'text/plain');
  assert.ok(!JSON.stringify(items).includes(basename(b.progetto)), 'nessuna cartella del PC');
  /* D8: cambiato ⇒ non c'è più, e il PC lo vede «cambiato» */
  writeFileSync(join(b.progetto, 'a.txt'), 'uno cambiato');
  utimesSync(join(b.progetto, 'a.txt'), new Date(), new Date(Date.now() + 5000));
  assert.deepEqual((await b.file.offerteInAttesa('dA')).items, []);
  assert.equal(b.file.offerte('s1').find((o) => o.offertaId === oa.offertaId).stato, 'cambiato');
});

test('FD-OFF-02 (D-3) `file.offers` dal canale: il dispositivo viene dal canale, mai dagli argomenti', async (t) => {
  const b = bancoOperazioni(t);
  writeFileSync(join(b.progetto, 'c.txt'), 'tre');
  const o = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'c.txt') });
  assert.ok(b.operazioni.elenco().includes('file.offers'));
  assert.deepEqual((await b.operazioni.esegui('file.offers', {}, b.contesto('dA'))).items.map((i) => i.offertaId), [o.offertaId]);
  assert.deepEqual((await b.operazioni.esegui('file.offers', { dispositivoId: 'dA' }, b.contesto('dB'))).items, [], 'un altro dispositivo non vede le offerte di dA');
});

/* ——— D-5/D-6 (25/10/2026, contratto Parte 2 «Revision 3»): un'immagine per il modello, come quella della finestra ——— */
const PNG_MINIMO = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(40, 7)]);

function bancoImmagini(t, { conArchivio = true } = {}) {
  const b = banco(t);
  const salvate = [];
  const file = b.crea(conArchivio ? { salvaImmagine: async ({ nome, dataUrl }) => { salvate.push({ nome, dataUrl }); return { id: 'a'.repeat(64), mimeType: 'image/png', byte: 48 }; } } : {});
  const operazioni = creaOperazioni({ chiama: async () => ({ dati: {} }), sessionRegistry: b.registro, iscriviConRigiocata: () => () => {},
    cartelle: { consentita: async () => false, descrivi: async () => ({}), elenco: async () => [] }, file });
  const contesto = { dispositivo: { id: 'dI', nome: 'dI' }, iscrizioni: new Map(), inviati: [], iscrivi: () => async () => {} };
  return { ...b, file, operazioni, contesto, salvate };
}

test('IMG-01 un\'immagine dal dispositivo SENZA conversazione e SENZA consenso: va all\'archivio delle immagini, mai in allegati/', async (t) => {
  const b = bancoImmagini(t);
  const inizio = await b.operazioni.esegui('file.upload.begin', { immagine: true, nome: 'lavagna.png', dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) }, b.contesto);
  await b.operazioni.esegui('file.upload.chunk', { trasferimentoId: inizio.trasferimentoId, da: 0, dati: b64u(PNG_MINIMO) }, b.contesto);
  const fine = await b.operazioni.esegui('file.upload.end', { trasferimentoId: inizio.trasferimentoId }, b.contesto);
  assert.deepEqual(Object.keys(fine).sort(), ['byte', 'immagineId', 'mime', 'nome', 'sha256']);
  assert.equal(fine.immagineId, 'a'.repeat(64));
  assert.equal(b.salvate.length, 1);
  assert.equal(b.salvate[0].dataUrl, `data:image/png;base64,${PNG_MINIMO.toString('base64')}`);
  assert.equal(existsSync(join(b.progetto, 'allegati')), false, 'niente in allegati/');
  /* idempotente: lo stesso end ridà lo stesso esito, senza salvare due volte */
  assert.deepEqual(await b.operazioni.esegui('file.upload.end', { trasferimentoId: inizio.trasferimentoId }, b.contesto), fine);
  assert.equal(b.salvate.length, 1);
});

test('IMG-02 i rifiuti: non un\'immagine, oltre 5 MiB, con una sessione, senza archivio', async (t) => {
  const b = bancoImmagini(t);
  const testo = Buffer.from('non sono una immagine');
  const i = await b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'x.png', dimensione: testo.length, sha256: sha(testo) });
  await b.file.pezzo({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId, da: 0, dati: b64u(testo) });
  await assert.rejects(b.file.fine({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId }), rifiutaCon('BAD_MESSAGE', (e) => e.reason === 'image-invalid'));
  assert.equal(b.salvate.length, 0);
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'g.png', dimensione: 5 * 1024 * 1024 + 1, sha256: 'a'.repeat(64) }),
    rifiutaCon('BAD_MESSAGE', (e) => e.reason === 'image-too-large'));
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', immagine: true, sessionId: 's1', nome: 'g.png', dimensione: 10, sha256: 'a'.repeat(64) }), rifiutaCon('BAD_MESSAGE'));
  const senza = bancoImmagini(t, { conArchivio: false });
  await assert.rejects(senza.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'g.png', dimensione: 10, sha256: 'a'.repeat(64) }),
    rifiutaCon('BAD_MESSAGE', (e) => e.reason === 'images-unavailable'));
});

test('IMG-03 la ripresa di un\'immagine resta un\'immagine; un file normale non può riprendere un trasferimento d\'immagine', async (t) => {
  const b = bancoImmagini(t);
  const i = await b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'l.png', dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  await b.file.pezzo({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId, da: 0, dati: b64u(PNG_MINIMO.subarray(0, 10)) });
  const r = await b.file.inizia({ dispositivoId: 'dI', immagine: true, riprendi: i.trasferimentoId });
  assert.equal(r.ricevuti, 10);
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', sessionId: 's1', riprendi: i.trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', riprendi: i.trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'), 'senza `immagine` non si riprende una immagine');
});

test('IMG-04 con l\'archivio VERO delle immagini della chat: l\'id torna, e il messaggio lo può portare', async (t) => {
  const { createChatImageStore } = await import('../src/chat-image-attachments.mjs');
  const b = banco(t);
  const archivio = createChatImageStore({ rootDir: join(b.dir, 'immagini') });
  const file = b.crea({ salvaImmagine: (x) => archivio.upload(x) });
  const i = await file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'l.png', dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  await file.pezzo({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId, da: 0, dati: b64u(PNG_MINIMO) });
  const fine = await file.fine({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId });
  assert.match(fine.immagineId, /^[a-f0-9]{64}$/u);
  const [rif] = await archivio.validateReferences([{ id: fine.immagineId }]);
  assert.equal(rif.mimeType, 'image/png');
});

/* ——— revisione a blocco 7 (25/10/2026): B-7 e B-8 ——— */
test('B7-01 offerteAggiornate: scaricata e poi cambiata resta «scaricato» col segno della versione nuova (il percorso della GET della finestra)', async (t) => {
  const b = banco(t);
  writeFileSync(join(b.progetto, 'r.txt'), Buffer.alloc(100, 65));
  const o = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'r.txt') });
  const riga = (await b.file.elenco({ dispositivoId: 'dA', sessionId: 's1' })).items.find((r) => r.fileId === o.fileId);
  await b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 0, quanti: 100 });
  assert.equal(b.file.offerte('s1')[0].stato, 'scaricato');
  writeFileSync(join(b.progetto, 'r.txt'), Buffer.alloc(10, 66));
  utimesSync(join(b.progetto, 'r.txt'), new Date(), new Date(Date.now() + 5000));
  const [vista] = await b.file.offerteAggiornate('s1');
  assert.equal(vista.stato, 'scaricato');
  assert.equal(vista.cambiatoDopo, true);
});

test('B7-02 file.offers: una conversazione cancellata non porta le sue offerte', async (t) => {
  const b = banco(t);
  writeFileSync(join(b.progetto, 'c.txt'), 'tre');
  await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'c.txt') });
  assert.equal((await b.file.offerteInAttesa('dA')).items.length, 1);
  b.sessioni.delete('s1');
  assert.deepEqual((await b.file.offerteInAttesa('dA')).items, []);
});

test('B7-03 (B-8) un\'offerta salvata prima di `relativo` lo riceve alla prima lettura della finestra', async (t) => {
  const b = banco(t);
  mkdirSync(join(b.progetto, 'sub'), { recursive: true });
  writeFileSync(join(b.progetto, 'sub', 'n.txt'), 'x');
  await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: join(b.progetto, 'sub', 'n.txt') });
  /* come un file di offerte scritto dalla versione di prima: senza `relativo` */
  const fileOfferte = readdirSync(b.cartellaDati, { recursive: true }).map(String).find((n) => n.endsWith('offerte.json'));
  const percorsoOfferte = join(b.cartellaDati, fileOfferte);
  const dati = JSON.parse(readFileSync(percorsoOfferte, 'utf8'));
  for (const o of dati.offerte) delete o.relativo;
  writeFileSync(percorsoOfferte, JSON.stringify(dati));
  const dopo = b.crea();
  assert.equal(dopo.offerte('s1')[0].relativo, null, 'la vista di prima: senza');
  const [vista] = await dopo.offerteAggiornate('s1');
  assert.equal(vista.relativo, 'sub/n.txt');
  /* ⛔ B8-5 (debito del blocco 8): la cartella della conversazione cambia dopo la prima lettura ⇒ il percorso segue quella di ORA,
     non resta fissato a quella vecchia; e sul disco non si scrive niente */
  b.sessioni.set('s1', join(b.progetto, 'sub'));
  const [ancora] = await dopo.offerteAggiornate('s1');
  assert.equal(ancora.relativo, 'n.txt');
  assert.equal(JSON.parse(readFileSync(percorsoOfferte, 'utf8')).offerte[0].relativo, undefined, 'mai salvato');
});

test('B8-01 (B8-1) un\'immagine a metà si riprende dopo un riavvio del server, e scaduta si pulisce', async (t) => {
  const b = bancoImmagini(t);
  const i = await b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'l.png', dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  await b.file.pezzo({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId, da: 0, dati: b64u(PNG_MINIMO.subarray(0, 10)) });
  const salvate = [];
  const dopo = b.crea({ salvaImmagine: async ({ nome, dataUrl }) => { salvate.push({ nome, dataUrl }); return { id: 'b'.repeat(64), mimeType: 'image/png', byte: 48 }; } });
  const r = await dopo.inizia({ dispositivoId: 'dI', immagine: true, riprendi: i.trasferimentoId });
  assert.equal(r.ricevuti, 10, 'ripresa dopo il riavvio');
  await dopo.pezzo({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId, da: 10, dati: b64u(PNG_MINIMO.subarray(10)) });
  const fine = await dopo.fine({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId });
  assert.equal(fine.immagineId, 'b'.repeat(64));
  assert.equal(salvate.length, 1);
  assert.deepEqual(resti(b.trasferimenti), [], 'niente parziale');
  /* il verso contrario: una a metà lasciata lì, 25 ore e un riavvio dopo, non resta sul disco */
  const j = await dopo.inizia({ dispositivoId: 'dI', immagine: true, nome: 'm.png', dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  await dopo.pezzo({ dispositivoId: 'dI', trasferimentoId: j.trasferimentoId, da: 0, dati: b64u(PNG_MINIMO.subarray(0, 10)) });
  assert.equal(resti(b.trasferimenti).length, 2);
  b.orologio.ora += 25 * 60 * 60 * 1000;
  b.crea();
  for (let k = 0; k < 50 && resti(b.trasferimenti).length; k += 1) await new Promise((x) => setTimeout(x, 10));
  assert.deepEqual(resti(b.trasferimenti), [], 'scaduta e pulita al riavvio');
});

test('B8-08 (debito del blocco 8) dopo un riavvio un `end` ripetuto ridà lo stesso esito, senza una seconda copia; dopo 24 ore no', async (t) => {
  const b = bancoImmagini(t);
  const i = await b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'l.png', dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  await b.file.pezzo({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId, da: 0, dati: b64u(PNG_MINIMO) });
  const fine = await b.file.fine({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId });
  const salvate = [];
  const salva = async ({ nome, dataUrl }) => { salvate.push({ nome, dataUrl }); return { id: 'c'.repeat(64), mimeType: 'image/png', byte: 48 }; };
  const dopo = b.crea({ salvaImmagine: salva }); // un server nuovo sugli stessi dati
  assert.deepEqual(await dopo.fine({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId }), fine, 'lo stesso esito di prima del riavvio');
  assert.equal(salvate.length, 0, 'nessuna seconda copia nell\'archivio');
  /* un altro dispositivo con lo stesso id di trasferimento non riceve l'esito altrui */
  await assert.rejects(dopo.fine({ dispositivoId: 'dX', trasferimentoId: i.trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
  /* il verso contrario: 25 ore dopo il ricordo è scaduto, anche attraverso un altro riavvio */
  b.orologio.ora += 25 * 60 * 60 * 1000;
  const tardi = b.crea({ salvaImmagine: salva });
  await assert.rejects(tardi.fine({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId }), (e) => ['TRANSFER_UNKNOWN', 'TRANSFER_EXPIRED'].includes(e.code));
  /* un file del ricordo rovinato non ferma l'avvio */
  writeFileSync(join(b.cartellaDati, 'completati.json'), '{ rotto');
  assert.doesNotThrow(() => b.crea());
});

test('B8-02 (B8-7) un\'immagine vuota dice «vuota», non «oltre 5 MiB»', async (t) => {
  const b = bancoImmagini(t);
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'v.png', dimensione: 0, sha256: 'a'.repeat(64) }),
    rifiutaCon('BAD_MESSAGE', (e) => e.reason === 'image-empty' && e.stato === 400 && /cannot be empty/u.test(e.message)));
});

test('B9-01 (B9-1) la ripresa di un trasferimento GIÀ finito dice «tutto ricevuto», e il suo end ridà l\'esito: niente seconda copia', async (t) => {
  const b = bancoImmagini(t);
  const i = await b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'l.png', dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  await b.file.pezzo({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId, da: 0, dati: b64u(PNG_MINIMO) });
  const fine = await b.file.fine({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId });
  /* la risposta a end persa: il dispositivo riprende, anche dopo un riavvio del PC */
  for (const f of [b.file, b.crea({ salvaImmagine: async () => { throw new Error('una seconda copia') } })]) {
    const r = await f.inizia({ dispositivoId: 'dI', immagine: true, riprendi: i.trasferimentoId });
    assert.deepEqual(r, { trasferimentoId: i.trasferimentoId, pezzo: PEZZO_MASSIMO, ricevuti: PNG_MINIMO.length });
    assert.deepEqual(await f.fine({ dispositivoId: 'dI', trasferimentoId: i.trasferimentoId }), fine);
  }
  assert.equal(b.salvate.length, 1, 'una sola immagine nell\'archivio');
  /* il verso contrario: un altro dispositivo, una sessione, o «come file» non riprendono l'esito altrui */
  await assert.rejects(b.file.inizia({ dispositivoId: 'dX', immagine: true, riprendi: i.trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', riprendi: i.trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', sessionId: 's1', riprendi: i.trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
});

test('B9-01b (B9-1) anche per un FILE: ripreso dopo la fine, end ridà lo stesso allegato, senza «-2»', { skip: senzaHelper }, async (t) => {
  const b = banco(t);
  const contenuto = Buffer.from('rapporto');
  const { avvio, esito } = await caricaTutto(b.file, { nome: 'rapporto.txt', contenuto });
  const dopo = b.crea();
  const r = await dopo.inizia({ dispositivoId: 'dA', sessionId: 's1', riprendi: avvio.trasferimentoId });
  assert.equal(r.ricevuti, contenuto.length);
  assert.deepEqual(await dopo.fine({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId }), esito);
  assert.deepEqual(readdirSync(join(b.progetto, 'allegati')), ['rapporto.txt']);
});

test('B9-03 (B9-3) al tetto di 8 il PC libera il trasferimento FERMO più vecchio dello stesso dispositivo; se sono tutti attivi resta RATE_LIMITED', async (t) => {
  const b = bancoImmagini(t);
  const apri = (n) => b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: `i${n}.png`, dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  const primi = [];
  for (let n = 0; n < 8; n += 1) { primi.push(await apri(n)); b.orologio.ora += 1000; }
  /* tutti attivi da poco: il nono aspetta il suo turno */
  await assert.rejects(apri(8), rifiutaCon('RATE_LIMITED'));
  /* 10 minuti senza pezzi, tranne l'ultimo aperto che riceve un pezzo: si libera il PRIMO, non quello attivo */
  b.orologio.ora += 10 * 60_000;
  await b.file.pezzo({ dispositivoId: 'dI', trasferimentoId: primi[7].trasferimentoId, da: 0, dati: b64u(PNG_MINIMO.subarray(0, 4)) });
  const nono = await apri(8);
  assert.ok(nono.trasferimentoId);
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', immagine: true, riprendi: primi[0].trasferimentoId }), rifiutaCon('TRANSFER_EXPIRED'));
  assert.equal((await b.file.inizia({ dispositivoId: 'dI', immagine: true, riprendi: primi[7].trasferimentoId })).ricevuti, 4, 'quello attivo resta');
  /* un altro dispositivo non libera i trasferimenti di questo */
  for (let n = 0; n < 8; n += 1) await b.file.inizia({ dispositivoId: 'dY', immagine: true, nome: `y${n}.png`, dimensione: 10, sha256: 'a'.repeat(64) });
  assert.equal((await b.file.inizia({ dispositivoId: 'dI', immagine: true, riprendi: primi[1].trasferimentoId })).ricevuti, 0, 'di dI resta');
});

test('B9-04 (A9-4) all\'avvio: un .json storto col nome di un trasferimento si toglie col suo parziale; il tipo si legge in un modo solo', async (t) => {
  const b = bancoImmagini(t);
  const i = await b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: 'l.png', dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  const dir = join(b.trasferimenti, readdirSync(b.trasferimenti)[0]);
  const scrivi = (id, campi) => { writeFileSync(join(dir, `${id}.json`), JSON.stringify({ v: 1, trasferimentoId: id, dispositivoId: 'dI', nome: 'x', dimensione: 10, sha256: 'a'.repeat(64), creatoAlle: b.orologio.ora, attivoAlle: b.orologio.ora, ...campi })); writeFileSync(join(dir, `${id}.part`), ''); };
  const storti = {
    ['A'.repeat(22)]: { sessionId: null }, // B81b: senza sessione ma non immagine
    ['B'.repeat(22)]: { sessionId: 's1', immagine: 'no' }, // immagine «truthy»
    ['C'.repeat(22)]: { sessionId: 's1', immagine: true }, // immagine con sessione
  };
  for (const [id, campi] of Object.entries(storti)) scrivi(id, campi);
  writeFileSync(join(dir, 'altro.json'), '{}'); // un nome non nostro resta
  const dopo = b.crea();
  for (const id of Object.keys(storti)) {
    assert.equal(existsSync(join(dir, `${id}.json`)), false, `${id} tolto`);
    assert.equal(existsSync(join(dir, `${id}.part`)), false, `${id}.part tolto`);
    await assert.rejects(dopo.inizia({ dispositivoId: 'dI', sessionId: 's1', riprendi: id }), (e) => ['TRANSFER_UNKNOWN', 'TRANSFER_EXPIRED'].includes(e.code));
  }
  assert.equal(existsSync(join(dir, 'altro.json')), true);
  assert.equal((await dopo.inizia({ dispositivoId: 'dI', immagine: true, riprendi: i.trasferimentoId })).ricevuti, 0, 'quello buono resta');
});

test('B10-01 (A10-1, A10-8 R6) una ripresa conta come attività; il confine dei 10 minuti è esatto', async (t) => {
  const b = bancoImmagini(t);
  const apri = (n) => b.file.inizia({ dispositivoId: 'dI', immagine: true, nome: `i${n}.png`, dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) });
  const tutti = [];
  for (let n = 0; n < 8; n += 1) { tutti.push(await apri(n)); b.orologio.ora += 1000; }
  b.orologio.ora += 10 * 60_000 - 8_000 - 1; // il più vecchio è fermo da 10 minuti meno 1 ms
  await assert.rejects(apri(8), rifiutaCon('RATE_LIMITED'), 'a 10 minuti meno 1 ms nessuno è fermo');
  /* il più vecchio viene ripreso: da qui è attivo, e a 10 minuti esatti si libera il SECONDO più vecchio */
  b.orologio.ora += 1;
  await b.file.inizia({ dispositivoId: 'dI', immagine: true, riprendi: tutti[0].trasferimentoId });
  b.orologio.ora += 1000;
  await apri(9);
  assert.equal((await b.file.inizia({ dispositivoId: 'dI', immagine: true, riprendi: tutti[0].trasferimentoId })).ricevuti, 0, 'il ripreso resta');
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', immagine: true, riprendi: tutti[1].trasferimentoId }), rifiutaCon('TRANSFER_EXPIRED'));
});

test('B10-02 (A10-7, A10-8 R12/R15) il ricordo dei finiti scritto prima del tipo, o con campi storti, si legge in un modo solo', async (t) => {
  const b = bancoImmagini(t);
  const k = (id) => `dI\0${id}`;
  const voci = [
    { k: k('A'.repeat(22)), at: b.orologio.ora, risultato: { immagineId: 'a'.repeat(64), byte: 10 }, sessionId: null }, // di prima: senza tipo
    { k: k('B'.repeat(22)), at: b.orologio.ora, risultato: { fileId: 'f', dimensione: 5 }, sessionId: 's1', immagine: 'sì' }, // tipo «truthy»
    { k: k('C'.repeat(22)), at: b.orologio.ora, risultato: { immagineId: 'c'.repeat(64), byte: 7 }, sessionId: null, immagine: true, dimensione: -5 },
  ];
  writeFileSync(join(b.cartellaDati, 'completati.json'), JSON.stringify({ v: 1, completati: voci }));
  const f = b.crea();
  assert.equal((await f.inizia({ dispositivoId: 'dI', immagine: true, riprendi: 'A'.repeat(22) })).ricevuti, 10, 'senza tipo e senza sessione = immagine');
  await assert.rejects(f.inizia({ dispositivoId: 'dI', immagine: true, riprendi: 'B'.repeat(22) }), rifiutaCon('TRANSFER_UNKNOWN'), '«sì» non è un\'immagine');
  assert.equal((await f.inizia({ dispositivoId: 'dI', sessionId: 's1', riprendi: 'B'.repeat(22) })).ricevuti, 5, '«sì» con una sessione si riprende come FILE');
  assert.equal((await f.inizia({ dispositivoId: 'dI', immagine: true, riprendi: 'C'.repeat(22) })).ricevuti, 7, 'una dimensione storta non si usa');
});

test('B10-03 (A10-5) un ricordo dei finiti enorme si carica solo per le ultime 500 voci', async (t) => {
  const b = bancoImmagini(t);
  const voci = Array.from({ length: 2_000 }, (_, n) => ({ k: `dI\0${String(n).padStart(22, 'x')}`, at: b.orologio.ora, risultato: { immagineId: 'a'.repeat(64), byte: 3 }, sessionId: null, immagine: true, dimensione: 3 }));
  writeFileSync(join(b.cartellaDati, 'completati.json'), JSON.stringify({ v: 1, completati: voci }));
  const f = b.crea();
  await assert.rejects(f.inizia({ dispositivoId: 'dI', immagine: true, riprendi: String(0).padStart(22, 'x') }), rifiutaCon('TRANSFER_UNKNOWN'), 'la prima resta fuori');
  assert.equal((await f.inizia({ dispositivoId: 'dI', immagine: true, riprendi: String(1_999).padStart(22, 'x') })).ricevuti, 3, 'l\'ultima c\'è');
  assert.equal((await f.inizia({ dispositivoId: 'dI', immagine: true, riprendi: String(1_500).padStart(22, 'x') })).ricevuti, 3, 'la 500ª dal fondo c\'è');
  await assert.rejects(f.inizia({ dispositivoId: 'dI', immagine: true, riprendi: String(1_499).padStart(22, 'x') }), rifiutaCon('TRANSFER_UNKNOWN'));
});

test('B10-04 (A10-8 R2) un file finito in una conversazione non si riprende da un\'altra', { skip: senzaHelper }, async (t) => {
  const b = banco(t);
  const { avvio } = await caricaTutto(b.file, { nome: 'r.txt', contenuto: Buffer.from('r') });
  b.sessioni.set('s2', b.progetto);
  await assert.rejects(b.file.inizia({ dispositivoId: 'dA', sessionId: 's2', riprendi: avvio.trasferimentoId }), rifiutaCon('TRANSFER_UNKNOWN'));
  assert.equal((await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', riprendi: avvio.trasferimentoId })).ricevuti, 1);
});

test('B10-05 (B10-1, «Revision 4») file.upload.abort toglie subito il parziale del SUO trasferimento e libera il posto; idempotente', async (t) => {
  const b = bancoImmagini(t);
  assert.ok(b.operazioni.elenco().includes('file.upload.abort'));
  const apri = (n) => b.operazioni.esegui('file.upload.begin', { immagine: true, nome: `i${n}.png`, dimensione: PNG_MINIMO.length, sha256: sha(PNG_MINIMO) }, b.contesto);
  const tutti = [];
  for (let n = 0; n < 8; n += 1) tutti.push(await apri(n));
  await b.operazioni.esegui('file.upload.chunk', { trasferimentoId: tutti[0].trasferimentoId, da: 0, dati: b64u(PNG_MINIMO.subarray(0, 4)) }, b.contesto);
  await assert.rejects(apri(8), rifiutaCon('RATE_LIMITED'), 'pieno, e tutti attivi');
  assert.deepEqual(await b.operazioni.esegui('file.upload.abort', { trasferimentoId: tutti[0].trasferimentoId }, b.contesto), { ok: true });
  assert.equal(resti(b.trasferimenti).length, 14, 'via il .json e il .part del primo, subito');
  assert.ok((await apri(8)).trasferimentoId, 'il posto è libero');
  await assert.rejects(b.operazioni.esegui('file.upload.chunk', { trasferimentoId: tutti[0].trasferimentoId, da: 4, dati: b64u(PNG_MINIMO.subarray(4)) }, b.contesto), rifiutaCon('TRANSFER_UNKNOWN'));
  /* idempotente: di nuovo, un id sconosciuto */
  assert.deepEqual(await b.operazioni.esegui('file.upload.abort', { trasferimentoId: tutti[0].trasferimentoId }, b.contesto), { ok: true });
  assert.deepEqual(await b.operazioni.esegui('file.upload.abort', { trasferimentoId: 'Z'.repeat(22) }, b.contesto), { ok: true });
  /* il verso contrario: un altro dispositivo non toglie i trasferimenti di questo; un id storto è un messaggio storto */
  const altro = { ...b.contesto, dispositivo: { id: 'dX', nome: 'dX' } };
  assert.deepEqual(await b.operazioni.esegui('file.upload.abort', { trasferimentoId: tutti[1].trasferimentoId }, altro), { ok: true });
  assert.equal((await b.file.inizia({ dispositivoId: 'dI', immagine: true, riprendi: tutti[1].trasferimentoId })).ricevuti, 0, 'di dI resta');
  await assert.rejects(b.operazioni.esegui('file.upload.abort', { trasferimentoId: '../x' }, b.contesto), rifiutaCon('BAD_MESSAGE'));
});
