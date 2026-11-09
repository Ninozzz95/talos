/*
 * Revisione UX della candidata, 04/11/2026 (agente Z), righe 33 e 36: senza rete il selettore del modello diceva «Catalogo OpenRouter non
 * disponibile: Failed to fetch» e restava così anche dopo il ritorno della rete; la barra sotto la chat diceva «Il server non risponde» in carattere
 * da codice, mentre il problema era la rete del computer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento } from './aiuto-dom-blocchi.mjs';
import { aggiornaStatoConnessione, eSenzaRete } from '../../src/components/connessione.js';
import { TESTI } from '../../src/i18n/testi/index.js';

const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');

function barra() {
  const d = documento();
  const b = d.createElement('div');
  const span = d.createElement('span'); span.setAttribute('data-runtime-connessione', '');
  const riprova = d.createElement('button'); riprova.setAttribute('data-runtime-riprova', '');
  b.append(span, riprova);
  return { b, span, riprova };
}

test('UX36 senza rete la barra dice che il computer è senza rete, non che il server non risponde', () => {
  const { b, span, riprova } = barra();
  aggiornaStatoConnessione(b, 'caduto', { tentativi: 4, online: false });
  assert.equal(span.textContent, TESTI.it['app.connection.offline']);
  assert.equal(riprova.hidden, false, 'Riprova resta');
  aggiornaStatoConnessione(b, 'riconnessione', { tentativi: 1, online: false });
  assert.equal(span.textContent, TESTI.it['app.connection.offline']);
  aggiornaStatoConnessione(b, 'caduto', { tentativi: 4, online: true });
  assert.equal(span.textContent, TESTI.it['app.connection.down'], 'con la rete accesa il guasto è del server');
  aggiornaStatoConnessione(b, 'ricollegato', { online: false });
  assert.equal(span.textContent, TESTI.it['app.connection.backTitle'], 'il ritorno si dice sempre');
  assert.ok(TESTI.en['app.connection.offline'], 'inglese prima');
});

test('UX36 la barra della connessione e il suo Riprova sono testo normale, non carattere da codice', () => {
  const regola = (sel) => [...css.matchAll(new RegExp(`${sel.replace(/[.[\]]/gu, '\\$&')}\\{([^}]*)\\}`, 'gu'))].map((m) => m[1]).join(';');
  assert.match(regola('.talos-statusbar__connessione'), /font-family:var\(--talos-font-ui\)/u);
  assert.doesNotMatch(regola('.talos-statusbar [data-runtime-riprova]'), /font-mono/u);
  assert.match(regola('.talos-statusbar [data-runtime-riprova]'), /font-family:var\(--talos-font-ui\)/u);
});

test('UX33 un errore di rete si riconosce; un errore del server no', () => {
  assert.equal(eSenzaRete(new TypeError('Failed to fetch'), true), true);
  assert.equal(eSenzaRete(new TypeError('NetworkError when attempting to fetch resource.'), true), true);
  assert.equal(eSenzaRete(new TypeError('Load failed'), true), true);
  assert.equal(eSenzaRete(new Error('HTTP 502'), false), true, 'il browser dice «senza rete»: basta');
  assert.equal(eSenzaRete(new Error('HTTP 502'), true), false);
  assert.equal(eSenzaRete(null, true), false);
});

test('UX33 il selettore senza rete lo dice in parole semplici e ricarica da solo al ritorno; un altro guasto ha «Riprova» accanto', () => {
  const ramo = app.slice(app.indexOf("tr('app.modelPicker.catalogLoading')"), app.indexOf('function apri() {', app.indexOf("tr('app.modelPicker.catalogLoading')")));
  assert.match(ramo, /eSenzaRete\(error\)/u);
  assert.match(ramo, /tr\('app\.modelPicker\.catalogOffline'\)/u);
  assert.match(ramo, /addEventListener\('online'/u, 'al ritorno della rete il catalogo si ricarica da solo');
  assert.match(ramo, /tr\('app\.common\.tryAgain'\)/u, 'accanto all\'errore un «Riprova»');
  assert.doesNotMatch(TESTI.it['app.modelPicker.catalogOffline'], /fetch|OpenRouter/iu);
  assert.ok(TESTI.en['app.modelPicker.catalogOffline']);
});
