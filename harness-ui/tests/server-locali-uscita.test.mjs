/*
 * ⭐ Owner 27/10/2026, server locali nella scheda Browser — il lettore dell'uscita (`src/server-locali.mjs`), regole di VS Code
 *   `UrlFinder` più i nomi dei framework. Banner VERI dei loro avvii; ogni regola ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaLettoreUscita, frameworkDaUscita, togliAnsi, trovaIndirizziLocali } from '../src/server-locali.mjs';

const VITE = '\u001b[32m\u001b[1mVITE\u001b[22m v5.4.10\u001b[39m  \u001b[2mready in \u001b[0m\u001b[1m312\u001b[22m\u001b[2m\u001b[0m ms\u001b[22m\n\n'
  + '  \u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:\u001b[1m5173\u001b[22m/\u001b[39m\n'
  + '  \u001b[32m➜\u001b[39m  \u001b[1mNetwork\u001b[22m\u001b[2m: use \u001b[22m\u001b[1m--host\u001b[22m\u001b[2m to expose\u001b[22m\n';
const NEXT = '  ▲ Next.js 15.0.3\n  - Local:        http://localhost:3000\n\n ✓ Starting...\n ✓ Ready in 1912ms\n';

test('SL-USCITA-01 Vite coi suoi colori: l\'indirizzo e il nome, ANSI tolto prima di cercare', () => {
  assert.equal(togliAnsi(VITE).includes('\u001b'), false);
  assert.deepEqual(trovaIndirizziLocali(togliAnsi(VITE)), [{ host: 'localhost', porta: 5173 }]);
  assert.equal(frameworkDaUscita(togliAnsi(VITE)), 'Vite');
});

test('SL-USCITA-02 Next, Django, Flask, Python http.server: indirizzo e nome', () => {
  assert.deepEqual(trovaIndirizziLocali(NEXT), [{ host: 'localhost', porta: 3000 }]);
  assert.equal(frameworkDaUscita(NEXT), 'Next.js');
  const django = 'Django version 5.1, using settings \'sito.settings\'\nStarting development server at http://127.0.0.1:8000/\nQuit the server with CTRL-BREAK.\n';
  assert.deepEqual(trovaIndirizziLocali(django), [{ host: '127.0.0.1', porta: 8000 }]);
  assert.equal(frameworkDaUscita(django), 'Django');
  const flask = ' * Serving Flask app \'app\'\n * Debug mode: on\n * Running on http://127.0.0.1:5000\n';
  assert.deepEqual(trovaIndirizziLocali(flask), [{ host: '127.0.0.1', porta: 5000 }]);
  assert.equal(frameworkDaUscita(flask), 'Flask');
  const python = 'Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...\n';
  assert.deepEqual(trovaIndirizziLocali(python), [{ host: '0.0.0.0', porta: 8080 }]);
  assert.equal(frameworkDaUscita(python), 'Python');
  assert.deepEqual(trovaIndirizziLocali('Serving HTTP on 127.0.0.1 port 9000 ...'), [{ host: '127.0.0.1', porta: 9000 }], 'il ripiego di Python senza URL');
});

test('SL-USCITA-03 AL CONTRARIO: il debugger, gli indirizzi pubblici e le porte impossibili non sono server locali', () => {
  assert.deepEqual(trovaIndirizziLocali('Debugger listening on ws://127.0.0.1:9229/1b2c-3d4e\nFor help, see: https://nodejs.org/en/docs/inspector\n'), []);
  assert.deepEqual(trovaIndirizziLocali('Debugger listening on ws://127.0.0.1:9333/abc\n'), []);
  assert.deepEqual(trovaIndirizziLocali('Docs at https://vitejs.dev and https://example.com:8443/x'), []);
  assert.deepEqual(trovaIndirizziLocali('http://localhost:99999/ e http://localhost:0/'), []);
  assert.equal(frameworkDaUscita('npm install finished in 3s'), null);
});

test('SL-USCITA-04 un indirizzo ripetuto si conta una volta; due server, due indirizzi nell\'ordine', () => {
  const testo = 'Local: http://localhost:5173/\nLocal: http://localhost:5173/\napi on http://127.0.0.1:8787\n';
  assert.deepEqual(trovaIndirizziLocali(testo), [{ host: 'localhost', porta: 5173 }, { host: '127.0.0.1', porta: 8787 }]);
});

function orologioFinto() {
  const coda = [];
  return {
    programma: (fn, ms) => { const t = { fn, ms, vivo: true }; coda.push(t); return t; },
    annulla: (t) => { t.vivo = false; },
    avanza: () => { for (const t of coda.splice(0)) if (t.vivo) t.fn(); },
    get quanti() { return coda.filter((t) => t.vivo).length; },
  };
}

test('SL-USCITA-05 il lotto: i pezzi si raccolgono e si leggono insieme dopo la calma; il banner di un lotto vale per il dopo', () => {
  const o = orologioFinto();
  const visti = [];
  const l = creaLettoreUscita({ onTrovato: (x) => visti.push(x), programma: o.programma, annulla: o.annulla });
  l.scrivi('\u001b[32mVITE\u001b[39m v5.4.10  ready in 312 ms\n');
  o.avanza();
  assert.deepEqual(visti, [], 'nessun indirizzo ancora');
  l.scrivi('  ➜  Local:   http://local');
  l.scrivi(Buffer.from('host:5174/\n'));
  assert.equal(o.quanti, 1, 'un timer solo, rimandato a ogni pezzo');
  o.avanza();
  assert.deepEqual(visti, [{ indirizzi: [{ host: 'localhost', porta: 5174 }], framework: 'Vite' }]);
});

test('SL-USCITA-06 AL CONTRARIO: un lotto oltre il tetto si butta intero (VS Code), e chiudi() legge ciò che resta', () => {
  const o = orologioFinto();
  const visti = [];
  const l = creaLettoreUscita({ onTrovato: (x) => visti.push(x), programma: o.programma, annulla: o.annulla, tettoCaratteri: 100 });
  l.scrivi(`${'x'.repeat(120)} http://localhost:4000\n`);
  o.avanza();
  assert.deepEqual(visti, []);
  l.scrivi('ready on http://localhost:4001\n');
  l.chiudi();
  assert.deepEqual(visti, [{ indirizzi: [{ host: 'localhost', porta: 4001 }], framework: null }]);
  l.scrivi('http://localhost:4002\n');
  o.avanza();
  assert.equal(visti.length, 1, 'dopo chiudi() non si legge più');
});
