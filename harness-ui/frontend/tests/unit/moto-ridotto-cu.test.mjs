/*
 * Reperto 17 (giudice v1470; decisione 252, «col movimento ridotto nessuna attesa»): il movimento ridotto della persona non arrivava al computer use.
 * - La pagina del PC lo dice al server con le impostazioni della sessione (`motoRidotto`), come la lingua delle risposte: prima di ogni messaggio, alla chat
 *   nuova, e di nuovo dopo un riavvio del server (che lo tiene solo in memoria).
 * - Il segno (il cursore di TALOS sullo schermo) leggeva solo il movimento ridotto di Windows, mai «Riduci movimento» di TALOS.
 * Ridotto vuol dire: il sistema lo chiede O l'impostazione di TALOS è accesa, come Claude Code (sistema, editor o `prefersReducedMotion`, CHANGELOG.md:1081).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as messaggi from '../../src/components/computer-use/bolla-messaggi.js';
import * as ponte from '../../src/components/computer-use/ponte-bolla.js';

/* Giro 4 (CU-23): la pagina principale prende `motoRidottoDa` dal ponte, il suo unico import del computer use. Il ponte deve darlo davvero, ed è lo stesso. */
test('MRF-04 il ponte della bolla dà alla pagina principale lo stesso motoRidottoDa, che decide come quello della regia', () => {
  assert.equal(typeof ponte.motoRidottoDa, 'function', 'senza, `import { creaPonteBolla, motoRidottoDa }` di app.js rompe la pagina');
  assert.equal(ponte.motoRidottoDa, messaggi.motoRidottoDa);
  assert.equal(ponte.motoRidottoDa({ impostazioni: { appearance: { reducedMotion: true } }, mediaRidotto: false }), true);
  assert.equal(ponte.motoRidottoDa({ impostazioni: null, mediaRidotto: false }), false);
});

test('MRF-01 ridotto = il sistema lo chiede oppure «Riduci movimento» di TALOS è acceso', () => {
  const { motoRidottoDa } = messaggi;
  assert.equal(typeof motoRidottoDa, 'function');
  assert.equal(motoRidottoDa({ impostazioni: null, mediaRidotto: false }), false);
  assert.equal(motoRidottoDa({ impostazioni: null, mediaRidotto: true }), true);
  assert.equal(motoRidottoDa({ impostazioni: { appearance: { reducedMotion: true } }, mediaRidotto: false }), true);
  assert.equal(motoRidottoDa({ impostazioni: { appearance: { reducedMotion: false } }, mediaRidotto: false }), false);
  assert.equal(motoRidottoDa({ impostazioni: { appearance: { reducedMotion: 'true' } }, mediaRidotto: false }), false, 'solo il vero true');
});

test('MRF-02 il segno legge anche «Riduci movimento» di TALOS, dallo stesso archivio della pagina principale', () => {
  const segno = readFileSync(new URL('../../src/segno.js', import.meta.url), 'utf8');
  assert.match(segno, /ridotto: motoRidottoDa\(\{ impostazioni: impostazioniSalvate\(\), mediaRidotto: matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches \}\)/u);
});

test('MRF-03 la pagina del PC dice il movimento ridotto al server: prima dei messaggi, alla chat nuova, dopo un riavvio', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const allinea = app.slice(app.indexOf('async function allineaLinguaDellaSessione('), app.indexOf('async function reindirizzaSessioneReale('));
  // non detto vale false, come il server di serie: senza movimento ridotto nessuna richiesta in più
  assert.match(allinea, /\.\.\.\(\(motoDettoAlServer\.get\(sessionId\) \?\? false\) === moto \? \{\} : \{ motoRidotto: moto \}\)/u);
  assert.match(allinea, /if \('motoRidotto' in cambi\) motoDettoAlServer\.set\(sessionId, moto\);/u);
  assert.match(app, /if \(stato === 'ricollegato'\) \{ linguaDettaAlServer\.clear\(\); linguaRisposteDettaAlServer\.clear\(\); motoDettoAlServer\.clear\(\); \}/u);
  const nuove = app.split("motoDettoAlServer.set(sessionId, false); void allineaLinguaDellaSessione(sessionId);").length - 1;
  assert.equal(nuove, 2, 'le due strade che aprono una chat nuova dal PC');
});
