/*
 * Decisione 47 dell'owner: il telefono NUOVO dichiara di saper usare i dati di TALOS, quello vecchio continua a scrivere nel progetto, solo
 * collegato al PC, finché l'eccezione non si toglie dopo due versioni. Qui il lato del PC: il telefono lo fa il Mobile (COD-247).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { creaArchivioAllegati } from '../src/allegati-dati.mjs';
import { creaFileDeiDispositivi } from '../src/remoto/file-dispositivi.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const b64u = (b) => b.toString('base64url');
const CONTENUTO = Buffer.from('ordini del pad');

function banco(t, { conArchivio = true, tetti } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'talos-ponte-allegati-')));
  t.after(() => rimuoviCartellaDiProva(dir));
  const progetto = join(dir, 'progetto');
  mkdirSync(progetto);
  const eventi = [];
  const salvaFinto = async ({ rootDir, name, source }) => {
    const pezzi = [];
    for await (const p of source) pezzi.push(p);
    const byte = Buffer.concat(pezzi);
    mkdirSync(join(rootDir, 'allegati'), { recursive: true });
    writeFileSync(join(rootDir, 'allegati', name), byte);
    return { tipo: 'file', nome: name, percorso: `allegati/${name}`, bytes: byte.length, assoluto: join(rootDir, 'allegati', name) };
  };
  const archivioAllegati = conArchivio ? creaArchivioAllegati({ cartella: join(dir, 'dati', 'allegati'), salva: salvaFinto, ...(tetti ? { tetti } : {}) }) : null;
  const registro = { esiste: (id) => id === 's1', cartellaPerChatFile: async (id) => (id === 's1' ? { ok: true, cartella: progetto } : { erroreAvvio: true, code: 'NOT_FOUND' }) };
  const file = creaFileDeiDispositivi({ cartella: join(dir, 'trasferimenti'), sessionRegistry: registro, eventiDellaSessione: () => eventi, salva: salvaFinto, archivioAllegati });
  const operazioni = creaOperazioni({ chiama: async () => ({ dati: {} }), sessionRegistry: registro, iscriviConRigiocata: () => () => {},
    cartelle: { consentita: async () => false, descrivi: async () => ({}), elenco: async () => [] }, file });
  const contesto = { dispositivo: { id: 'dI', nome: 'dI' }, iscrizioni: new Map(), inviati: [], iscrivi: () => async () => {} };
  const inviaTutto = async () => {
    const inizio = await operazioni.esegui('file.upload.begin', { datiTalos: true, nome: 'ordini.csv', dimensione: CONTENUTO.length, sha256: sha(CONTENUTO) }, contesto);
    await operazioni.esegui('file.upload.chunk', { trasferimentoId: inizio.trasferimentoId, da: 0, dati: b64u(CONTENUTO) }, contesto);
    return { inizio, fine: await operazioni.esegui('file.upload.end', { trasferimentoId: inizio.trasferimentoId }, contesto) };
  };
  return { dir, progetto, eventi, archivioAllegati, file, operazioni, contesto, inviaTutto };
}

test('PONTE-01: col segnale esplicito il file va nei dati di TALOS, senza sessione né consenso, e il progetto non si tocca', async (t) => {
  const b = banco(t);
  const { fine } = await b.inviaTutto();
  assert.deepEqual(Object.keys(fine).sort(), ['allegatoId', 'dimensione', 'immagine', 'mime', 'nome', 'percorso', 'sha256']);
  assert.equal(fine.percorso, `attachments/${fine.allegatoId}/ordini.csv`);
  assert.equal(fine.dimensione, CONTENUTO.length);
  assert.deepEqual(readdirSync(b.progetto), []);
  assert.ok(existsSync(b.archivioAllegati.percorsoDi(fine.allegatoId)));
});

test('PONTE-02: lo stesso `end` ridà lo stesso esito, e una ripresa resta dei dati', async (t) => {
  const b = banco(t);
  const { inizio, fine } = await b.inviaTutto();
  assert.deepEqual(await b.operazioni.esegui('file.upload.end', { trasferimentoId: inizio.trasferimentoId }, b.contesto), fine);
  assert.deepEqual(b.archivioAllegati.uso(), { file: 1, byte: CONTENUTO.length });
  const ripresa = await b.operazioni.esegui('file.upload.begin', { datiTalos: true, riprendi: inizio.trasferimentoId, nome: 'ordini.csv', dimensione: CONTENUTO.length, sha256: sha(CONTENUTO) }, b.contesto);
  assert.equal(ripresa.ricevuti, CONTENUTO.length);
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', sessionId: 's1', riprendi: inizio.trasferimentoId }), { code: 'TRANSFER_UNKNOWN' }, 'una ripresa di un altro tipo no');
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', riprendi: inizio.trasferimentoId }), { code: 'TRANSFER_UNKNOWN' }, 'nemmeno senza il segnale');
});

test('PONTE-03: al contrario, il telefono vecchio manda la sessione e scrive nel progetto, come prima', async (t) => {
  const b = banco(t);
  const avvio = await b.file.inizia({ dispositivoId: 'dI', sessionId: 's1', nome: 'vecchio.csv', dimensione: CONTENUTO.length, sha256: sha(CONTENUTO) });
  await b.file.pezzo({ dispositivoId: 'dI', trasferimentoId: avvio.trasferimentoId, da: 0, dati: b64u(CONTENUTO) });
  const fine = await b.file.fine({ dispositivoId: 'dI', trasferimentoId: avvio.trasferimentoId });
  assert.equal(fine.percorso, 'allegati/vecchio.csv');
  assert.equal(fine.allegatoId, undefined);
  assert.ok(existsSync(join(b.progetto, 'allegati', 'vecchio.csv')));
  assert.deepEqual(b.archivioAllegati.uso(), { file: 0, byte: 0 });
});

test('PONTE-04: al contrario, il segnale con una sessione si rifiuta; senza archivio e a spazio pieno si dice, e niente va nel progetto', async (t) => {
  const b = banco(t);
  await assert.rejects(b.file.inizia({ dispositivoId: 'dI', sessionId: 's1', datiTalos: true, nome: 'a', dimensione: 1, sha256: sha(Buffer.from('a')) }), { code: 'BAD_MESSAGE' });
  const senza = banco(t, { conArchivio: false });
  await assert.rejects(senza.inviaTutto(), { code: 'ATTACHMENTS_UNAVAILABLE' });
  assert.deepEqual(readdirSync(senza.progetto), []);
  const pieno = banco(t, { tetti: { byteTotali: 1, file: 9, bytePerDispositivo: 1 } });
  await assert.rejects(pieno.inviaTutto(), (e) => e.code === 'ATTACHMENTS_FULL' && e.stato === 507);
  assert.deepEqual(readdirSync(pieno.progetto), []);
});

test('PONTE-05: dopo il legame il telefono vede il suo allegato in `file.list` e lo legge; prima no, e il percorso del PC non esce', async (t) => {
  const b = banco(t);
  const { fine } = await b.inviaTutto();
  assert.deepEqual((await b.file.elenco({ dispositivoId: 'dI', sessionId: 's1' })).items, []);
  b.eventi.push({ type: 'CUSTOM', name: 'talos.allegati-legati', value: { allegati: [{ allegatoId: fine.allegatoId, nome: fine.nome, riferimento: fine.percorso }] } });
  const { items } = await b.file.elenco({ dispositivoId: 'dI', sessionId: 's1' });
  assert.equal(items.length, 1);
  assert.equal(items[0].nome, 'ordini.csv');
  assert.equal(items[0].allegatoId, fine.allegatoId);
  const letto = await b.file.leggi({ dispositivoId: 'dI', sessionId: 's1', fileId: items[0].fileId, versione: items[0].versione, da: 0, quanti: 1024 });
  assert.equal(Buffer.from(letto.dati, 'base64url').toString(), CONTENUTO.toString());
  assert.ok(!JSON.stringify(items).includes(b.dir.replaceAll('\\', '\\\\')));
});

test('PONTE-06 (BD14): a spazio pieno il no arriva alla `begin`: il file non viaggia e non resta niente', async (t) => {
  const b = banco(t, { tetti: { byteTotali: 1, file: 9, bytePerDispositivo: 1 } });
  await assert.rejects(b.operazioni.esegui('file.upload.begin', { datiTalos: true, nome: 'ordini.csv', dimensione: CONTENUTO.length, sha256: sha(CONTENUTO) }, b.contesto),
    (e) => e.code === 'ATTACHMENTS_FULL' && e.stato === 507);
  const senza = banco(t, { conArchivio: false });
  await assert.rejects(senza.operazioni.esegui('file.upload.begin', { datiTalos: true, nome: 'ordini.csv', dimensione: CONTENUTO.length, sha256: sha(CONTENUTO) }, senza.contesto), { code: 'ATTACHMENTS_UNAVAILABLE' });
});

test('PONTE-07 (BD14): se lo spazio finisce mentre il file viaggia, il parziale non resta', async (t) => {
  const b = banco(t);
  const inizio = await b.operazioni.esegui('file.upload.begin', { datiTalos: true, nome: 'ordini.csv', dimensione: CONTENUTO.length, sha256: sha(CONTENUTO) }, b.contesto);
  await b.operazioni.esegui('file.upload.chunk', { trasferimentoId: inizio.trasferimentoId, da: 0, dati: b64u(CONTENUTO) }, b.contesto);
  b.archivioAllegati.salva = async () => { throw Object.assign(new Error('pieno'), { code: 'ATTACHMENTS_FULL', stato: 507 }); };
  await assert.rejects(b.operazioni.esegui('file.upload.end', { trasferimentoId: inizio.trasferimentoId }, b.contesto), { code: 'ATTACHMENTS_FULL' });
  await assert.rejects(b.operazioni.esegui('file.upload.end', { trasferimentoId: inizio.trasferimentoId }, b.contesto), { code: 'TRANSFER_UNKNOWN' });
});

test('PONTE-08 (BD16): una giunzione al posto della cartella dell allegato non si elenca', async (t) => {
  const b = banco(t);
  const { fine } = await b.inviaTutto();
  b.eventi.push({ type: 'CUSTOM', name: 'talos.allegati-legati', value: { allegati: [{ allegatoId: fine.allegatoId, nome: fine.nome, riferimento: fine.percorso }] } });
  const dove = join(b.dir, 'dati', 'allegati', fine.allegatoId);
  renameSync(dove, `${dove}-via`);
  execFileSync('cmd.exe', ['/c', 'mklink', '/J', dove, `${dove}-via`], { stdio: 'ignore' });
  assert.deepEqual((await b.file.elenco({ dispositivoId: 'dI', sessionId: 's1' })).items, []);
});
