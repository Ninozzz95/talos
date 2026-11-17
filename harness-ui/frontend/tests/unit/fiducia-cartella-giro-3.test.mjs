/*
 * Fiducia della cartella, giro 3 (Desktop 11/11/2026 15:47, giudice v1483): la carta, se mai copre una radice del disco, la NOMINA
 *   (Claude Code `CHANGELOG.md:4615`, «name the repository root the grant covers»): prima il nome si prendeva dall'ultimo pezzo del
 *   percorso, e per «C:\» restava «C:», per «/» niente. E il rifiuto del server (`FOLDER_TRUST_TOO_WIDE`: un disco intero o la casa non
 *   diventano mai fidati) si legge nelle due lingue.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { creaDomandaFiducia, nomeDellaCartella } from '../../src/components/fiducia-cartella.js';

const pausa = () => new Promise((r) => { setTimeout(r, 0); });

test('NOME ROSSA — il nome della cartella nella carta: l\'ultimo pezzo; una radice si nomina intera', () => {
  assert.equal(nomeDellaCartella('C:\\progetti\\progetto'), 'progetto');
  assert.equal(nomeDellaCartella('/home/nino/lavoro/'), 'lavoro');
  assert.equal(nomeDellaCartella('C:\\'), 'C:\\');
  assert.equal(nomeDellaCartella('d:/'), 'd:/');
  assert.equal(nomeDellaCartella('/'), '/');
  assert.equal(nomeDellaCartella('\\\\server\\quota\\'), '\\\\server\\quota\\');
  assert.equal(nomeDellaCartella(''), '');
  assert.equal(nomeDellaCartella(null), '');
});

test('CARTA ROSSA — la carta su una radice la nomina; il rifiuto del server resta nella carta con la sua frase, e i pulsanti si riaccendono', async () => {
  impostaLingua('it');
  const doc = documento();
  const carte = [];
  const domanda = creaDomandaFiducia({ document: doc, leggi: async () => ({ cartella: 'C:\\', fidata: null }),
    salva: async () => { throw Object.assign(new Error(t('errori.FOLDER_TRUST_TOO_WIDE.message')), { code: 'FOLDER_TRUST_TOO_WIDE' }); },
    metti: (scheda) => { doc.body.append(scheda); carte.push(scheda); } });
  await domanda.chiedi({ sessionId: 's1', fiducia: { sessionId: 's1', fiduciaDaChiedere: true, pienoTrattenuto: true } });
  assert.equal(carte.length, 1);
  assert.ok(carte[0].textContent.includes('C:\\'), 'la carta dice quale disco copre');
  clic(carte[0].querySelector('[data-fiducia-si]'));
  await pausa(); await pausa();
  assert.match(carte[0].textContent, /disco intero/u);
  assert.equal(carte[0].querySelector('[data-fiducia-si]').disabled, false);
});

test('NASCITA — la carta prima della conversazione nomina la radice intera che il server dice (app.js)', () => {
  const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const corpo = APP.slice(APP.indexOf('async function chiediFiduciaDellaCartella('), APP.indexOf('async function chiediFiduciaDellaCartella(') + 1400);
  assert.match(corpo, /const radice = typeof letta\?\.cartella === 'string' && nomeDellaCartella\(letta\.cartella\) === letta\.cartella;/u);
  assert.match(corpo, /creaCartaFiducia\(document, \{ cartella: radice \? letta\.cartella : nomeCartella,/u);
});

test('FRASE ROSSA — `FOLDER_TRUST_TOO_WIDE` ha la sua frase in inglese e in italiano', () => {
  impostaLingua('en');
  const en = t('errori.FOLDER_TRUST_TOO_WIDE.message');
  impostaLingua('it');
  const it = t('errori.FOLDER_TRUST_TOO_WIDE.message');
  assert.notEqual(en, 'errori.FOLDER_TRUST_TOO_WIDE.message');
  assert.notEqual(it, 'errori.FOLDER_TRUST_TOO_WIDE.message');
  assert.notEqual(en, it);
  assert.match(en, /whole disk/u);
  assert.match(it, /disco intero/u);
});
