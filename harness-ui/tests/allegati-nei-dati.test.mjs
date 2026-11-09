/*
 * Decisioni 43 e 47 dell'owner: gli allegati stanno nei dati di TALOS, progetto e git non si toccano.
 * Forma chiusa: Downloads/TALOS/desktop/in-corso/FORMA-ALLEGATI-NEI-DATI-2026-11-02.md (ritocchi di Performance, CLI e Mobile).
 * Qui: l'archivio (riferimento opaco, tetti, pulizia), il legame che nasce dall'invio e la bolla.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { allegatiDaEventi, byteDichiarati, cartellaDegliAllegati, creaArchivioAllegati, eRiferimentoAllegato, riferimentoAllegato } from '../src/allegati-dati.mjs';
import { MAX_CHAT_FILE_BYTES } from '../src/chat-file-upload.mjs';
import { bollaValida, idAllegatiDellaBolla } from '../src/bolla-della-persona.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const ID = /^[0-9a-f]{24}$/u;
function dati(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-allegati-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}
/* L'aiutante nativo vero lo provano `chat-files.test.mjs` e il binario: qui la stessa forma: `<radice>/allegati/<nome>`. */
const salvaFinto = async ({ rootDir, name, source }) => {
  let byte = 0;
  for await (const pezzo of source) byte += pezzo.length;
  mkdirSync(join(rootDir, 'allegati'), { recursive: true });
  writeFileSync(join(rootDir, 'allegati', name), 'x'.repeat(byte));
  return { tipo: 'file', nome: name, percorso: `allegati/${name}`, bytes: byte, assoluto: join(rootDir, 'allegati', name) };
};
const archivio = (cartella, altro = {}) => creaArchivioAllegati({ cartella: join(cartella, 'allegati'), salva: salvaFinto, ...altro });
const sorgente = (n = 3) => Readable.from([Buffer.alloc(n, 1)]);

test('DATI-01: la ricevuta porta il riferimento opaco e il nome corto, mai il percorso del PC', async (t) => {
  const cartella = dati(t);
  const a = archivio(cartella);
  const ricevuta = await a.salva({ nome: 'nota.txt', source: sorgente() });
  assert.match(ricevuta.allegatoId, ID);
  assert.deepEqual(ricevuta, { tipo: 'file', nome: 'nota.txt', bytes: 3, allegatoId: ricevuta.allegatoId, percorso: `attachments/${ricevuta.allegatoId}/nota.txt` });
  assert.ok(!JSON.stringify(ricevuta).includes(cartella.replaceAll('\\', '\\\\')), 'nessun percorso assoluto');
  assert.ok(existsSync(a.percorsoDi(ricevuta.allegatoId)));
  assert.ok(a.percorsoDi(ricevuta.allegatoId).startsWith(join(cartella, 'allegati', ricevuta.allegatoId)) || a.percorsoDi(ricevuta.allegatoId).toLowerCase().includes(ricevuta.allegatoId));
});

test('DATI-02: senza la cartella dei dati nessuna scrittura, un errore chiaro, mai un ripiego nel progetto', async () => {
  const a = creaArchivioAllegati({ cartella: null, salva: () => { throw new Error('non deve scrivere'); } });
  assert.equal(a.disponibile, false);
  await assert.rejects(a.salva({ nome: 'nota.txt', source: sorgente() }), { code: 'ATTACHMENTS_UNAVAILABLE' });
});

test('DATI-03: i due tetti, spazio e numero di file, valgono prima di scrivere; il tetto del dispositivo vale per lui solo', async (t) => {
  const a = archivio(dati(t), { tetti: { byteTotali: 10, file: 2, bytePerDispositivo: 6 } });
  await a.salva({ nome: 'uno.txt', source: sorgente(4), previsti: 4 });
  await assert.rejects(a.salva({ nome: 'due.txt', source: sorgente(7), previsti: 7 }), { code: 'ATTACHMENTS_FULL' });
  await assert.rejects(a.salva({ nome: 'due.txt', source: sorgente(3), previsti: 3 }), { code: 'ATTACHMENTS_FULL' }, 'il dispositivo del PC ha già 4 su 6');
  await a.salva({ nome: 'due.txt', source: sorgente(3), previsti: 3, dispositivo: 'tablet' });
  await assert.rejects(a.salva({ nome: 'tre.txt', source: sorgente(1), previsti: 1, dispositivo: 'altro' }), { code: 'ATTACHMENTS_FULL' }, 'due file su due');
  assert.deepEqual(a.uso(), { file: 2, byte: 7 });
});

test('DATI-03b: il tetto dello spazio totale vale da solo, a dispositivo libero', async (t) => {
  const a = archivio(dati(t), { tetti: { byteTotali: 5, file: 9, bytePerDispositivo: 100 } });
  await a.salva({ nome: 'uno.txt', source: sorgente(4), previsti: 4 });
  await assert.rejects(a.salva({ nome: 'due.txt', source: sorgente(2), previsti: 2 }), { code: 'ATTACHMENTS_FULL' });
});

test('DATI-04: al contrario, un caricamento rifiutato o fallito non lascia niente e non conta', async (t) => {
  const cartella = dati(t);
  const a = creaArchivioAllegati({ cartella: join(cartella, 'allegati'), salva: async () => { throw Object.assign(new Error('no'), { code: 'FILE_WRITE_FAILED' }); } });
  await assert.rejects(a.salva({ nome: 'x.txt', source: sorgente() }), { code: 'FILE_WRITE_FAILED' });
  assert.deepEqual(a.uso(), { file: 0, byte: 0 });
  assert.deepEqual(readdirSync(join(cartella, 'allegati')), [], 'nessuna cartella lasciata lì');
  const rifiutato = archivio(cartella, { tetti: { byteTotali: 1, file: 5, bytePerDispositivo: 1 } });
  let letto = 0;
  const conta = Readable.from((async function* () { letto += 1; yield Buffer.alloc(3, 1); })());
  await assert.rejects(rifiutato.salva({ nome: 'x.txt', source: conta, previsti: 3 }), { code: 'ATTACHMENTS_FULL' });
  assert.equal(letto, 1, 'il corpo della richiesta si drena comunque');
  assert.deepEqual(rifiutato.uso(), { file: 0, byte: 0 });
});

test('DATI-05: un allegato si lega a una conversazione sola; un id inventato o di un altra chat si rifiuta; lo stesso legame due volte non cambia niente', async (t) => {
  const a = archivio(dati(t));
  const { allegatoId } = await a.salva({ nome: 'x.txt', source: sorgente() });
  assert.equal(await a.controlla('s1', [allegatoId]), null);
  await a.lega('s1', [allegatoId]);
  await a.lega('s1', [allegatoId]);
  assert.deepEqual(a.legamiDi(allegatoId), ['s1']);
  assert.equal((await a.controlla('s2', [allegatoId]))?.reason, 'attachment-of-another-chat');
  assert.equal((await a.controlla('s1', ['a'.repeat(24)]))?.reason, 'attachment-unknown');
  assert.equal(await a.controlla('s1', []), null);
  await a.eredita('s1', 'fork1');
  assert.deepEqual(a.legamiDi(allegatoId), ['s1', 'fork1'], 'una fork eredita');
});

test('DATI-06: i legami sopravvivono al riavvio: un archivio nuovo rilegge la cartella', async (t) => {
  const cartella = dati(t);
  const a = archivio(cartella);
  const { allegatoId } = await a.salva({ nome: 'x.txt', source: sorgente() });
  await a.lega('s1', [allegatoId]);
  const dopo = archivio(cartella);
  assert.deepEqual((await dopo.pronto()).uso(), { file: 1, byte: 3 });
  assert.deepEqual(dopo.legamiDi(allegatoId), ['s1']);
  assert.equal(dopo.percorsoDi(allegatoId), a.percorsoDi(allegatoId));
});

test('DATI-07: il file va via con l ultima chat che lo usa; ciò che non è mai stato legato si pulisce dopo una settimana', async (t) => {
  const cartella = dati(t);
  let adesso = 1_000_000;
  const a = archivio(cartella, { clock: () => adesso });
  const legato = await a.salva({ nome: 'a.txt', source: sorgente() });
  const bozza = await a.salva({ nome: 'b.txt', source: sorgente() });
  await a.lega('s1', [legato.allegatoId]);
  await a.eredita('s1', 'fork1');
  const dove = a.percorsoDi(legato.allegatoId);
  await a.sciogli('s1');
  assert.ok(existsSync(dove), 'la fork lo usa ancora');
  await a.sciogli('fork1');
  assert.equal(existsSync(dove), false);
  assert.equal(a.percorsoDi(legato.allegatoId), null);
  const dellaBozza = a.percorsoDi(bozza.allegatoId);
  const usato = await a.salva({ nome: 'c.txt', source: sorgente() });
  await a.lega('s2', [usato.allegatoId]);
  adesso += 6 * 24 * 3_600_000;
  await a.pulisci();
  assert.ok(existsSync(dellaBozza), 'una bozza fresca resta');
  adesso += 2 * 24 * 3_600_000;
  await a.pulisci();
  assert.equal(existsSync(dellaBozza), false);
  assert.ok(existsSync(a.percorsoDi(usato.allegatoId)), 'un file legato non scade');
  await a.sciogli('s2');
  assert.deepEqual(a.uso(), { file: 0, byte: 0 });
});

test('DATI-08: il riferimento ha una forma sola: niente cartelle in più, niente salite', () => {
  const id = 'a'.repeat(24);
  assert.equal(riferimentoAllegato(id, 'x.txt'), `attachments/${id}/x.txt`);
  assert.equal(eRiferimentoAllegato(`attachments/${id}/x.txt`), true);
  for (const no of ['attachments/x.txt', `attachments/${id}`, `attachments/${id}/`, `attachments/${id}/../y`, `attachments/${id}/a/b`, `attachments/${'A'.repeat(24)}/x`, `C:/attachments/${id}/x`, '', null]) {
    assert.equal(eRiferimentoAllegato(no), false, String(no));
  }
});

test('DATI-09: il legame nasce da un campo della bolla, mai dal testo; un id storto cade', () => {
  const id = 'b'.repeat(24);
  const bolla = bollaValida({ testo: `leggi attachments/${'c'.repeat(24)}/x.txt`, allegati: [{ tipo: 'file', nome: 'x.txt', allegatoId: id }, { tipo: 'file', nome: 'y', allegatoId: 'storto' }, { tipo: 'file', nome: 'z' }] });
  assert.deepEqual(idAllegatiDellaBolla(bolla), [id]);
  assert.equal(bolla.allegati[1].allegatoId, undefined);
  assert.deepEqual(idAllegatiDellaBolla(null), []);
  assert.deepEqual(idAllegatiDellaBolla({ testo: `attachments/${id}/x.txt`, allegati: [] }), [], 'il testo non lega niente');
});

test('DATI-10: l elenco della conversazione si legge dal giornale, e un altro evento non conta', () => {
  const id = 'd'.repeat(24);
  const rif = `attachments/${id}/x.txt`;
  const eventi = [
    { type: 'CUSTOM', name: 'talos.allegati-legati', value: { allegati: [{ allegatoId: id, nome: 'x.txt', riferimento: rif }] } },
    { type: 'CUSTOM', name: 'talos.allegati-legati', value: { allegati: [{ allegatoId: id, nome: 'x.txt', riferimento: rif }] } },
    { type: 'TextMessageContent', delta: rif },
    { type: 'CUSTOM', name: 'talos.altro', value: { allegati: [{ allegatoId: 'e'.repeat(24), riferimento: 'attachments/x' }] } },
    { type: 'CUSTOM', name: 'talos.allegati-legati', value: { allegati: [{ allegatoId: 'corto', riferimento: 'x' }] } },
  ];
  assert.deepEqual(allegatiDaEventi(eventi), [{ allegatoId: id, nome: 'x.txt', riferimento: rif }]);
  assert.deepEqual(allegatiDaEventi(null), []);
});

test('DATI-11: una voce rotta sul disco non ferma l archivio e non conta', async (t) => {
  const cartella = dati(t);
  const a = archivio(cartella);
  const { allegatoId } = await a.salva({ nome: 'x.txt', source: sorgente() });
  mkdirSync(join(cartella, 'allegati', 'f'.repeat(24)));
  writeFileSync(join(cartella, 'allegati', 'f'.repeat(24), 'voce.json'), '{rotto');
  mkdirSync(join(cartella, 'allegati', 'non-un-id'));
  const dopo = await archivio(cartella).pronto();
  assert.deepEqual(dopo.uso(), { file: 1, byte: 3 });
  assert.equal(JSON.parse(readFileSync(join(cartella, 'allegati', allegatoId, 'voce.json'), 'utf8')).nome, 'x.txt');
});

/* ---------- Revisione del blocco dati ---------- */
const dueArchivi = (cartella, altro = {}) => [archivio(cartella, altro), archivio(cartella, altro)];

test('BD2: gli allegati stanno accanto alle sessioni: il 4174 e l app, che hanno le stesse sessioni, vedono gli stessi file', () => {
  assert.equal(cartellaDegliAllegati('C:/Dati/TALOS/sessions'), join('C:/Dati/TALOS/sessions', 'allegati'));
  assert.equal(cartellaDegliAllegati(null), null, 'senza sessioni, nessuna cartella: mai accanto al codice');
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /creaArchivioAllegati\(\{ cartella: cartellaDegliAllegati\(config\.cartellaStore\)[,) ]/u);
  assert.doesNotMatch(server, /percorsoDatiDesktop\('allegati'\)/u);
});

test('BD2: un secondo processo sulle stesse sessioni trova il percorso e legge il legame; cancellare la chat di là porta via il file', async (t) => {
  const cartella = dati(t);
  const [primo, secondo] = dueArchivi(cartella);
  await primo.pronto();
  await secondo.pronto();
  const { allegatoId } = await primo.salva({ nome: 'x.txt', source: sorgente() });
  const dove = secondo.percorsoDi(allegatoId);
  assert.ok(dove, 'arrivato dopo la partenza del secondo');
  await primo.lega('s1', [allegatoId]); // il secondo ricorda la voce di prima, senza legame
  assert.equal(await secondo.controlla('s2', [allegatoId]).then((m) => m?.reason), 'attachment-of-another-chat');
  await secondo.sciogli('s1');
  assert.equal(existsSync(dove), false);
});

test('BD5: la pulizia rilegge il disco: una bozza legata da un altro processo non si cancella; il tetto conta anche i suoi file', async (t) => {
  const cartella = dati(t);
  let adesso = 1_000_000;
  const [primo, secondo] = dueArchivi(cartella, { clock: () => adesso, tetti: { byteTotali: 100, file: 2, bytePerDispositivo: 100 } });
  const { allegatoId } = await primo.salva({ nome: 'x.txt', source: sorgente() });
  await secondo.pronto();
  await primo.lega('chat-viva', [allegatoId]);
  adesso += 30 * 24 * 3_600_000;
  await secondo.pulisci();
  assert.ok(existsSync(primo.percorsoDi(allegatoId)));
  assert.deepEqual(secondo.legamiDi(allegatoId), ['chat-viva']);
  await primo.salva({ nome: 'y.txt', source: sorgente() });
  await assert.rejects(secondo.salva({ nome: 'z.txt', source: sorgente(), previsti: 1 }), { code: 'ATTACHMENTS_FULL' }, 'due file su due, uno arrivato dall altro processo');
});

test('BD6: una cartella senza voce (processo ucciso) si toglie dopo un giorno, una fresca no', async (t) => {
  const cartella = dati(t);
  let adesso = Date.now();
  const a = archivio(cartella, { clock: () => adesso });
  await a.pronto();
  const orfana = join(cartella, 'allegati', 'c'.repeat(24));
  mkdirSync(join(orfana, 'allegati'), { recursive: true });
  writeFileSync(join(orfana, 'allegati', 'mezzo.txt'), 'x');
  await a.pulisci();
  assert.ok(existsSync(orfana), 'può essere un caricamento in corso');
  adesso += 25 * 3_600_000;
  await a.pulisci();
  assert.equal(existsSync(orfana), false);
});

test('BD6: un legame verso una chat che non c è più si scioglie all avvio; una chat vera, o una voce appena nata, no', async (t) => {
  const cartella = dati(t);
  let adesso = 1_000_000;
  const a = archivio(cartella, { clock: () => adesso });
  const vecchio = await a.salva({ nome: 'a.txt', source: sorgente() });
  const vivo = await a.salva({ nome: 'b.txt', source: sorgente() });
  await a.lega('chat-sparita', [vecchio.allegatoId]);
  await a.lega('chat-viva', [vivo.allegatoId]);
  const nuovo = await a.salva({ nome: 'c.txt', source: sorgente() });
  await a.lega('chat-sparita', [nuovo.allegatoId]);
  const dove = a.percorsoDi(vecchio.allegatoId);
  await a.sciogliAssenti(async (id) => id === 'chat-viva');
  assert.ok(existsSync(dove), 'appena nate si lasciano stare');
  adesso += 2 * 3_600_000;
  const altro = await a.salva({ nome: 'd.txt', source: sorgente() });
  await a.lega('chat-sparita', [altro.allegatoId]);
  await a.sciogliAssenti(async (id) => id === 'chat-viva');
  assert.equal(existsSync(dove), false);
  assert.ok(existsSync(a.percorsoDi(vivo.allegatoId)));
  assert.deepEqual(a.legamiDi(altro.allegatoId), ['chat-sparita']);
  assert.deepEqual(a.uso(), { file: 2, byte: 6 });
});

test('BD6: se `rm` fallisce il file resta contato e scartato, e il giro dopo si toglie anche se è giovane', async (t) => {
  const cartella = dati(t);
  const a = archivio(cartella);
  const { allegatoId } = await a.salva({ nome: 'x.txt', source: sorgente() });
  await a.lega('s1', [allegatoId]);
  const voce = join(cartella, 'allegati', allegatoId, 'voce.json');
  writeFileSync(voce, JSON.stringify({ ...JSON.parse(readFileSync(voce, 'utf8')), legami: [], scartata: true }));
  const dopo = await archivio(cartella).pronto();
  assert.equal(await dopo.controlla('s2', [allegatoId]).then((m) => m?.reason), 'attachment-unknown', 'uno scartato non si lega');
  await dopo.pulisci();
  assert.equal(existsSync(join(cartella, 'allegati', allegatoId)), false);
});

test('BD4: una scrittura del legame che fallisce non rifiuta: il legame resta e si riscrive alla pulizia', async (t) => {
  const cartella = dati(t);
  let rotta = false;
  const a = archivio(cartella, { scriviFn: async (dove, testo) => { if (rotta) throw Object.assign(new Error('disco pieno'), { code: 'ENOSPC' }); writeFileSync(dove, testo); } });
  const { allegatoId } = await a.salva({ nome: 'x.txt', source: sorgente() });
  rotta = true;
  await a.lega('s1', [allegatoId]);
  assert.deepEqual(a.legamiDi(allegatoId), ['s1']);
  assert.equal(await a.controlla('s2', [allegatoId]).then((m) => m?.reason), 'attachment-of-another-chat', 'la memoria vale più del disco rimasto indietro');
  const voce = join(cartella, 'allegati', allegatoId, 'voce.json');
  assert.deepEqual(JSON.parse(readFileSync(voce, 'utf8')).legami, []);
  rotta = false;
  await a.pulisci();
  assert.deepEqual(JSON.parse(readFileSync(voce, 'utf8')).legami, ['s1']);
});

test('BD10: una cartella che non si crea non resta rotta per sempre, e dice l errore chiaro leggendo il corpo', async (t) => {
  const cartella = dati(t);
  const posto = join(cartella, 'bloccata');
  writeFileSync(posto, 'un file al posto della cartella');
  const a = creaArchivioAllegati({ cartella: join(posto, 'allegati'), salva: salvaFinto });
  let letto = 0;
  const conta = Readable.from((async function* () { letto += 1; yield Buffer.alloc(3, 1); })());
  await assert.rejects(a.salva({ nome: 'x.txt', source: conta }), (e) => e.code === 'ATTACHMENTS_UNAVAILABLE' && e.stato === 503);
  assert.equal(letto, 1);
  rimuoviCartellaDiProva(posto);
  await a.salva({ nome: 'x.txt', source: sorgente() });
  assert.deepEqual(a.uso(), { file: 1, byte: 3 });
});

test('BD12: senza dimensione dichiarata vale il massimo: il tetto scatta prima di scrivere', () => {
  assert.equal(byteDichiarati('12'), 12);
  assert.equal(byteDichiarati('0'), 0);
  assert.equal(byteDichiarati(undefined), MAX_CHAT_FILE_BYTES);
  assert.equal(byteDichiarati('storto'), MAX_CHAT_FILE_BYTES);
});

test('BD13: il dispositivo ha un tetto anche in numero di file; quello del PC resta libero', async (t) => {
  const a = archivio(dati(t), { tetti: { byteTotali: 100, file: 9, bytePerDispositivo: 100, filePerDispositivo: 1 } });
  await a.salva({ nome: 'a.txt', source: sorgente(0), dispositivo: 'tel' });
  await assert.rejects(a.salva({ nome: 'b.txt', source: sorgente(0), dispositivo: 'tel' }), { code: 'ATTACHMENTS_FULL' });
  await a.salva({ nome: 'c.txt', source: sorgente(0) });
  assert.deepEqual(a.uso(), { file: 2, byte: 0 });
});

test('BD14: lo spazio si controlla da fuori, prima che il telefono mandi il file', async (t) => {
  const a = archivio(dati(t), { tetti: { byteTotali: 5, file: 9, bytePerDispositivo: 5 } });
  await a.controllaSpazio({ byte: 5, dispositivo: 'tel' });
  await assert.rejects(a.controllaSpazio({ byte: 6, dispositivo: 'tel' }), (e) => e.code === 'ATTACHMENTS_FULL' && e.stato === 507);
});

test('BD15: un nome che esce dalla sua cartella in `voce.json` non vale: la voce non conta', async (t) => {
  const cartella = dati(t);
  const a = archivio(cartella);
  const { allegatoId } = await a.salva({ nome: 'x.txt', source: sorgente() });
  const voce = join(cartella, 'allegati', allegatoId, 'voce.json');
  const dati2 = JSON.parse(readFileSync(voce, 'utf8'));
  for (const nome of ['../../../segreto.txt', '..', '.', 'a/b', 'a\\b', '']) {
    writeFileSync(voce, JSON.stringify({ ...dati2, nome }));
    assert.equal((await archivio(cartella).pronto()).percorsoDi(allegatoId), null, nome);
  }
});

test('BD19: una bozza vive una settimana, e controllarla la tiene viva', async (t) => {
  const cartella = dati(t);
  let adesso = 1_000_000;
  const a = archivio(cartella, { clock: () => adesso });
  const { allegatoId } = await a.salva({ nome: 'x.txt', source: sorgente() });
  adesso += 6 * 24 * 3_600_000;
  await a.pulisci();
  assert.ok(a.percorsoDi(allegatoId), 'sei giorni dopo c è');
  assert.equal(await a.controlla('s1', [allegatoId]), null);
  adesso += 2 * 24 * 3_600_000;
  await a.pulisci();
  assert.ok(a.percorsoDi(allegatoId), 'il controllo l ha tenuta viva');
  adesso += 8 * 24 * 3_600_000;
  await a.pulisci();
  assert.equal(a.percorsoDi(allegatoId), null);
});

test('BD5: cancellare la chat rilegge il disco: chi ricorda la voce di prima del legame la porta via lo stesso', async (t) => {
  const cartella = dati(t);
  const [primo, secondo] = dueArchivi(cartella);
  await secondo.pronto();
  const { allegatoId } = await primo.salva({ nome: 'x.txt', source: sorgente() });
  const dove = secondo.percorsoDi(allegatoId);
  await primo.lega('s1', [allegatoId]);
  await secondo.sciogli('s1');
  assert.equal(existsSync(dove), false);
});

test('BD9: il PC dichiara al telefono che sa ricevere nei dati, solo se la cartella c è', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /capacita: archivioAllegati\.disponibile \? \['allegati-nei-dati'\] : \[\],/u);
});
