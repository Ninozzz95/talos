/*
 * F5 File reader (26/09/2026) — le decisioni PURE del lettore (`src/components/lettore/lettore.js`): quali viste ha un
 * tipo, i tetti, lo zoom delle immagini, il tipo MIME dalla firma, e soprattutto che l'attributo `csp` della cornice sia
 * la STESSA politica che il server manda con la pagina (`politicaPagina`, `harness-ui/src/http-app.mjs`): se divergono,
 * la CSP Embedded Enforcement non protegge più quello che il server crede. Il DOM si prova nel browser vero.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CARATTERI_MOSTRATI, SCALINI_ZOOM, TETTO_FILE, TETTO_TESTO, decidiLettura, etichettaTipo, iconaTipo, linguaDi, mimeImmagine,
  modiDelTipo, politicaCornice, prossimoZoomImmagine,
} from '../../src/components/lettore/lettore.js';
import { politicaPagina } from '../../../src/http-app.mjs';

test('LETTORE-MODI: due viste solo dove dicono due cose diverse', () => {
  assert.deepEqual(modiDelTipo('markdown'), ['resa', 'sorgente']);
  assert.deepEqual(modiDelTipo('tabella'), ['resa', 'sorgente']);
  assert.deepEqual(modiDelTipo('html'), ['resa', 'sorgente']);
  assert.deepEqual(modiDelTipo('immagine', 'svg'), ['resa', 'sorgente'], 'un SVG è anche testo');
  assert.deepEqual(modiDelTipo('immagine', 'png'), ['resa']);
  assert.deepEqual(modiDelTipo('testo', 'js'), ['sorgente'], 'la resa di un sorgente È il sorgente');
  for (const tipo of ['pdf', 'documento', 'foglio', 'presentazione', 'binario']) assert.deepEqual(modiDelTipo(tipo), ['resa'], tipo);
});

test('LETTORE-CSP: l\'attributo csp della cornice è la politica del server, byte per byte', () => {
  const base = 'http://127.0.0.1:4174/api/v1/pagine/abc/';
  assert.equal(politicaCornice(base), politicaPagina(base));
  assert.match(politicaCornice(base), /connect-src 'none'/u);
  assert.doesNotMatch(politicaCornice(base), /sandbox|frame-ancestors|report-/u, 'nell\'attributo non vanno sandbox, frame-ancestors né rapporti');
});

test('LETTORE-TETTI: 512 kB di testo prima di «Mostra comunque», 50 MB prima di «si apre fuori»', () => {
  assert.equal(TETTO_TESTO, 512 * 1024);
  assert.equal(TETTO_FILE, 50 * 1024 * 1024);
  assert.equal(CARATTERI_MOSTRATI, 400_000, 'come l\'anteprima della Libreria');
  assert.equal(decidiLettura(TETTO_FILE), 'leggi');
  assert.equal(decidiLettura(TETTO_FILE + 1), 'fuori');
  assert.equal(decidiLettura(undefined), 'leggi', 'senza taglia dichiarata si legge, e si decide sui byte');
  assert.equal(decidiLettura(Number.NaN), 'leggi');
});

test('LETTORE-ZOOM: scalini in su e in giù, fermi agli estremi, anche partendo da una misura fra due scalini', () => {
  assert.equal(prossimoZoomImmagine(1, 1), 1.5);
  assert.equal(prossimoZoomImmagine(1, -1), 0.75);
  assert.equal(prossimoZoomImmagine(0.6, 1), 0.75, 'dall\'«adatta» al 60%: il primo scalino sopra');
  assert.equal(prossimoZoomImmagine(0.6, -1), 0.5);
  assert.equal(prossimoZoomImmagine(8, 1), 8);
  assert.equal(prossimoZoomImmagine(0.1, -1), 0.1);
  assert.equal(prossimoZoomImmagine(undefined, 1), 1.5, 'uno zoom illeggibile vale 100%');
  assert.deepEqual([...SCALINI_ZOOM].sort((a, b) => a - b), [...SCALINI_ZOOM]);
});

test('LETTORE-TIPI: MIME dalla firma, lingua dall\'estensione, etichette e icone con un ripiego', () => {
  assert.equal(mimeImmagine('png', 'pdf'), 'image/png', 'decide la firma, non il nome');
  assert.equal(mimeImmagine(null, 'svg'), 'image/svg+xml');
  assert.equal(mimeImmagine(null, 'png'), 'application/octet-stream');
  assert.equal(linguaDi('mjs'), 'javascript');
  assert.equal(linguaDi('ps1'), 'powershell');
  assert.equal(linguaDi('ignota'), '');
  assert.equal(etichettaTipo('foglio'), 'Foglio di calcolo');
  assert.equal(etichettaTipo('boh'), 'File');
  assert.equal(iconaTipo('immagine'), 'i-image');
  assert.equal(iconaTipo('boh'), 'i-file');
});
