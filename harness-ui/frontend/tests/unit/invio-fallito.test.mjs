/*
 * R8 della revisione del blocco difetti (02/11/2026): invio fallito in una chat già aperta: tornavano solo le immagini, l'allegato file
 *   si perdeva. La chat nuova invece rimetteva tutto (`rimettiNelCompositore`). Stesso difetto nell'accodamento fallito. Ora una strada sola.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { destinoInvioFallito, dividiBozza, motivoDelCaricamento } from '../../src/components/invio-fallito.js';

const FILE = { id: 'f1', tipo: 'file', nome: 'a.txt' };
const FOTO = { id: 'i1', tipo: 'immagine', nome: 'a.png' };

test('R8-01: nella stessa chat tutto torna nel campo: testo, file, immagini', () => {
  assert.deepEqual(destinoInvioFallito({ sessionId: 's1', chiaveAperta: 'sessione:s1', ripristino: { testo: 'ciao', allegati: [FILE, FOTO] }, immagini: [FOTO] }),
    { dove: 'campo', allegati: [FILE, FOTO], testo: 'ciao' });
});

test('R8-02: se la persona è già su un altra chat, tutto torna alla bozza della sua: mai perso, mai nel campo di un altra', () => {
  assert.deepEqual(destinoInvioFallito({ sessionId: 's1', chiaveAperta: 'sessione:s2', ripristino: { testo: 'ciao', allegati: [FILE] }, immagini: [] }),
    { dove: 'bozza', chiave: 'sessione:s1', allegati: [FILE], testo: 'ciao' });
  assert.equal(destinoInvioFallito({ sessionId: 's1', chiaveAperta: null, ripristino: { testo: '', allegati: [FILE] }, immagini: [] }).dove, 'bozza');
});

test('R8-03: al contrario, un immagine che non sta negli allegati non si perde, una che sta non si raddoppia, e senza ripristino non si inventa niente', () => {
  assert.deepEqual(destinoInvioFallito({ sessionId: 's1', chiaveAperta: 'sessione:s1', ripristino: { testo: '', allegati: [FILE] }, immagini: [FOTO] }).allegati, [FILE, FOTO]);
  assert.deepEqual(destinoInvioFallito({ sessionId: 's1', chiaveAperta: 'sessione:s1', ripristino: { testo: '', allegati: [FOTO] }, immagini: [FOTO] }).allegati, [FOTO]);
  assert.equal(destinoInvioFallito({ sessionId: 's1', chiaveAperta: 'sessione:s1', ripristino: null, immagini: [FOTO] }), null);
});

test('R8-04: i due invii dal campo portano il ripristino, e tutti e due gli errori passano dalla stessa strada', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  // unione del 03/11: gli invii portano anche il blocco del Frontend, e il ripristino resta
  assert.match(app, /accodaMessaggioReale\(value, immagini, bollaDaInviare\(mostra, value, allegati, blocco\), ripristinoInvio\)/u);
  assert.match(app, /resumeSession\(value, immagini, \{ bolla: bollaDaInviare\(mostra, value, allegati, blocco\), ripristino: ripristinoInvio \}\)/u);
  assert.equal(app.match(/rimettiInvioFallito\(sessionId, ripristino, immagini\)/gu).length, 3, 'ripresa, ripresa con la chat cambiata, accodamento');
  assert.match(app, /resumeSession\(testo, immagini, \{ \.\.\.\(bolla \? \{ bolla \} : \{\}\), ripristino \}\)/u, 'la coda che ripiega sulla ripresa non perde niente');
});

/* Revisione del blocco dati, BD24: oltre il tetto i file in più restavano fuori e sparivano in silenzio */
test('BD24: al ritorno in una chat i file che non entrano restano nella bozza', () => {
  const [a, b, c] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(dividiBozza([a, b, c], [], 2), { entrano: [a, b], restano: [c] });
  assert.deepEqual(dividiBozza([a, b], [a], 2), { entrano: [b], restano: [] }, 'chi è già nel campo non entra due volte');
  assert.deepEqual(dividiBozza([a], [b, c], 2), { entrano: [], restano: [a] });
});

test('BD24: il campo lo usa, e li tiene', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  /* decisione 201 (owner 04/11/2026): la pagina aperta nel Browser non torna come allegato, si filtra prima di dividere */
  assert.match(app, /const \{ entrano, restano \} = dividiBozza\(bozza\.allegati\.filter\(\(a\) => !a\?\.daBrowser\), allegatiComposer, TETTI_ALLEGATI\.quanti\);/u);
  assert.match(app, /if \(restano\.length\) \{ bozzeAllegati\.set\(chiave, \{ allegati: restano, testo: '' \}\);/u);
});

/* BD11: il 503 «cartella dei dati assente» diventava il generico «il server non ha confermato» */
test('BD11: ogni rifiuto del caricamento dice il suo perché', () => {
  assert.equal(motivoDelCaricamento(413), 'app.attachments.fileTooLargeBody');
  assert.equal(motivoDelCaricamento(503), 'app.attachments.storeUnavailable');
  assert.equal(motivoDelCaricamento(507), 'app.attachments.storeFull');
  assert.equal(motivoDelCaricamento(500), 'app.attachments.serverNoConfirm');
  assert.match(readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8'), /throw new Error\(tr\(motivoDelCaricamento\(response\.status\)\)\);/u);
});
