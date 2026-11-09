/*
 * FE-010: la scheda «A lato». Il filo sta in memoria, per sessione; la risposta del modello entra solo come testo (il DOM finto lancia su `innerHTML`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { creaChatALato } from '../../src/components/pannello/a-lato.js';

const attesa = () => new Promise((f) => setTimeout(f, 5));
function vista(extra = {}) {
  const document = documento();
  let id = 's1';
  const chieste = []; const corse = []; const aperte = [];
  const lato = creaChatALato({
    document, sessione: () => id, chiedi: async (s, corpo) => { chieste.push({ s, corpo }); return { risposta: `Risposta ${chieste.length}`, usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 } }; },
    trasforma: async (s, filo) => ({ sessionId: 'nuova', s, filo }), apriSessione: (e) => aperte.push(e), quandoCorre: () => corse.push(1),
    testoConsumo: (u) => `${u.prompt_tokens + u.completion_tokens} token`, testoErrore: (e) => `guasto: ${e.message}`, ...extra,
  });
  return { lato, nodo: lato.nodo, chieste, corse, aperte, cambia: (nuovo) => { id = nuovo; lato.perSessione(); } };
}
const testi = (nodo) => nodo.querySelectorAll('.lato-msg p').map((n) => n.textContent);

test('LATO-FE-01 domanda e risposta nel filo, solo testo; il secondo giro manda il filo', async () => {
  const { lato, nodo, chieste } = vista({ chiedi: undefined });
  assert.equal(nodo.querySelector('.lato-filo').childNodes.length, 0);
  const male = '<img src=x onerror=alert(1)>';
  const prima = vista({ chiedi: async () => ({ risposta: male, usage: null }) });
  prima.lato.fai('a che punto sei?');
  await attesa();
  assert.deepEqual(testi(prima.nodo), ['a che punto sei?', male]);
  assert.equal(prima.nodo.querySelector('img'), null);
  assert.ok(lato && chieste);
  const due = vista();
  due.lato.fai('uno');
  await attesa();
  due.lato.fai('due');
  await attesa();
  assert.deepEqual(due.chieste[1].corpo, { domanda: 'due', filo: [{ domanda: 'uno', risposta: 'Risposta 1' }] });
  assert.match(due.nodo.querySelector('.lato-piede .talos-mono').textContent, /24 token/u);
});

test('LATO-FE-02 mentre risponde corre l\'orologio dell\'attività e non si chiede due volte', async () => {
  let libera;
  const { lato, nodo, corse } = vista({ chiedi: () => new Promise((f) => { libera = () => f({ risposta: 'ok', usage: null }); }) });
  lato.fai('x');
  assert.ok(nodo.querySelector('[data-attivita-da]'));
  assert.equal(corse.length, 1);
  assert.equal(nodo.querySelector('button').disabled, true);
  assert.equal(lato.fai('y'), false);
  libera();
  await attesa();
  assert.equal(nodo.querySelector('[data-attivita-da]'), null);
});

test('LATO-FE-03 un errore si dice nel filo e la domanda torna nel campo', async () => {
  const { lato, nodo } = vista({ chiedi: async () => { throw new Error('rete giù'); } });
  lato.fai('la mia domanda');
  await attesa();
  assert.match(nodo.querySelector('.lato-filo').textContent, /guasto: rete giù/u);
  assert.equal(nodo.querySelector('input').value, 'la mia domanda');
  assert.deepEqual(testi(nodo), []);
});

test('LATO-FE-04 con il modello locale aspetta il giro, coi secondi, e parte da sola a fine giro', async () => {
  let n = 0;
  const { lato, nodo } = vista({ chiedi: async () => { n += 1; if (n === 1) throw Object.assign(new Error('x'), { problem: { reason: 'aspetta-il-giro' } }); return { risposta: 'ora sì', usage: null }; } });
  lato.fai('x');
  await attesa();
  assert.match(nodo.querySelector('.lato-filo').textContent, /Aspetta il giro/u);
  assert.ok(nodo.querySelector('[data-attivita-da]'));
  lato.giroFinito();
  await attesa();
  assert.deepEqual(testi(nodo), ['x', 'ora sì']);
  assert.equal(n, 2);
});

test('LATO-FE-05 il filo è della sua sessione; Trasforma appare dal primo scambio e apre la sessione nuova', async () => {
  const { lato, nodo, cambia, aperte } = vista();
  const bottone = () => nodo.querySelector('.lato-piede button');
  assert.equal(bottone().hidden, true);
  lato.fai('qui');
  await attesa();
  assert.equal(bottone().hidden, false);
  cambia('s2');
  assert.deepEqual(testi(nodo), []);
  cambia('s1');
  assert.equal(testi(nodo)[0], 'qui');
  clic(bottone());
  await attesa();
  assert.equal(aperte[0].sessionId, 'nuova');
  assert.deepEqual(aperte[0].filo, [{ domanda: 'qui', risposta: 'Risposta 1' }]);
  assert.deepEqual(testi(nodo), testi(nodo));
});

test('LATO-FE-06 Trasforma con un giro in corso dice di aspettare e non perde il filo', async () => {
  const { lato, nodo, aperte } = vista({ trasforma: async () => { throw Object.assign(new Error('x'), { problem: { reason: 'running' } }); } });
  lato.fai('qui');
  await attesa();
  clic(nodo.querySelector('.lato-piede button'));
  await attesa();
  assert.equal(aperte.length, 0);
  assert.match(nodo.querySelector('.lato-filo').textContent, /fine del giro/u);
  assert.equal(testi(nodo)[0], 'qui');
});

test('LATO-FE-07 la scheda è nel pannello, Ctrl ; e `/btw` la aprono, lo stile è caricato', () => {
  const pagina = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
  assert.match(pagina, /data-rail="lato" aria-controls="railLato"/u);
  assert.match(pagina, /id="railLato" role="tabpanel"/u);
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /event\.key === ';'/u);
  assert.match(app, /\/\^\\\/btw\\b/u);
  assert.match(app, /chatALato\?\.giroFinito\(\)/u);
  assert.match(app, /chatALato\?\.perSessione\(\)/u);
  assert.match(readFileSync(new URL('../../src/styles/main.css', import.meta.url), 'utf8'), /@import '\.\/a-lato\.css'/u);
});

/* Decisioni 57 e 144 (04/11/2026): dollari dove il prezzo è noto, altrimenti il lavoro come oggi. Il costo di ogni risposta lo dice il server
   (`costo`); la riga a piè della scheda lo somma e lo mette davanti al lavoro, nella forma di `formattaDollari`. */
test('LATO-FE-DOLLARI-1 prezzo noto: la riga dice i dollari sommati, poi il lavoro', async () => {
  const { lato, nodo } = vista({ chiedi: async () => ({ risposta: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 }, costo: 0.0012 }) });
  lato.fai('uno');
  await attesa();
  assert.equal(nodo.querySelector('.lato-piede .talos-mono').textContent, '~$0.0012 · 12 token sommati alla sessione');
  lato.fai('due');
  await attesa();
  assert.equal(nodo.querySelector('.lato-piede .talos-mono').textContent, '~$0.0024 · 24 token sommati alla sessione');
});
test('LATO-FE-DOLLARI-2 AL CONTRARIO: una risposta senza prezzo e il filo dice solo il lavoro, come oggi', async () => {
  let n = 0;
  const { lato, nodo } = vista({ chiedi: async () => { n += 1; return { risposta: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 }, ...(n === 1 ? { costo: 0.0012 } : { costo: null }) }; } });
  lato.fai('uno');
  await attesa();
  lato.fai('due');
  await attesa();
  assert.equal(nodo.querySelector('.lato-piede .talos-mono').textContent, '24 token sommati alla sessione');
  const vecchio = vista();
  vecchio.lato.fai('server di prima, senza il campo');
  await attesa();
  assert.doesNotMatch(vecchio.nodo.querySelector('.lato-piede .talos-mono').textContent, /\$/u);
});
test('LATO-FE-DOLLARI-3 gratis è detto gratis; il filo trasformato riparte da zero', async () => {
  const { lato, nodo } = vista({ chiedi: async () => ({ risposta: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 }, costo: 0 }) });
  lato.fai('uno');
  await attesa();
  assert.match(nodo.querySelector('.lato-piede .talos-mono').textContent, /^\$0\.00 · /u);
  clic(nodo.querySelector('.lato-piede button'));
  await attesa();
  lato.perSessione(); // l'app ridisegna al cambio di sessione (`passaASessione`)
  assert.equal(nodo.querySelector('.lato-piede .talos-mono').textContent, '');
});

/* Prova dell'escape (Desktop 04/11/2026, dopo la prova CRC-11 del Mobile): la riga a piè della chat a lato mostra «~$<0.0001» e un importo
   normale come testo, in italiano e in inglese (il DOM finto fa cadere ogni innerHTML). */
test('LATO-FE-DOLLARI-ESCAPE «~$<0.0001» e un importo normale: la riga li mostra come testo, nelle due lingue', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  try {
    for (const [costo, atteso] of [[0.00000002, '~$<0.0001'], [0.0012, '~$0.0012']]) {
      for (const [lingua, coda] of [['it', '12 token sommati alla sessione'], ['en', '12 token added to the session']]) {
        impostaLingua(lingua);
        const { lato, nodo } = vista({ chiedi: async () => ({ risposta: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 }, costo }) });
        lato.fai('uno');
        await attesa();
        const riga = nodo.querySelector('.lato-piede .talos-mono').textContent;
        assert.equal(riga, `${atteso} · ${coda}`, lingua);
        assert.doesNotMatch(riga, /&(?:lt|gt|amp|quot|#\d+);/u);
      }
    }
  } finally { impostaLingua('it'); }
});
