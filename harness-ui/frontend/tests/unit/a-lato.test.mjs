/*
 * FE-010: la scheda «A lato», dall'11/11/2026 l'Assistente (bozzetto firmato `bozzetto-assistente-laterale`). Il filo si salva con la chat e si
 * ricarica dal server; la risposta passa dal disegnatore della chat, la domanda resta testo (il DOM finto lancia su `innerHTML`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { creaChatALato, DOMANDE_PRONTE } from '../../src/components/pannello/a-lato.js';
import { leggiRiferimentoFile, renderizzaMarkdown } from '../../src/components/markdown.js';
import { TESTI } from '../../src/i18n/testi/index.js';

const attesa = () => new Promise((f) => setTimeout(f, 5));
/* il disegnatore della chat usa `appendChild` e un frammento: il DOM finto delle prove dei blocchi ha solo `append` */
{
  const d = documento();
  const proto = Object.getPrototypeOf(d.createElement('div'));
  if (!proto.appendChild) proto.appendChild = function appendChild(f) { this.append(f); return f; };
}
function vista(extra = {}) {
  const document = documento();
  document.createDocumentFragment = () => document.createElement('div');
  let id = 's1';
  const chieste = []; const corse = []; const aperte = [];
  const lato = creaChatALato({
    document, sessione: () => id, chiedi: async (s, corpo) => { chieste.push({ s, corpo }); return { risposta: `Risposta ${chieste.length}`, usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 } }; },
    trasforma: async (s, filo) => ({ sessionId: 'nuova', s, filo }), apriSessione: (e) => aperte.push(e), quandoCorre: () => corse.push(1),
    testoConsumo: (u) => `${u.prompt_tokens + u.completion_tokens} token`, testoErrore: (e) => `guasto: ${e.message}`, ...extra,
  });
  return { lato, nodo: lato.nodo, document, chieste, corse, aperte, cambia: (nuovo) => { id = nuovo; lato.perSessione(); } };
}
const testi = (nodo) => nodo.querySelectorAll('.lato-msg p').map((n) => n.textContent);
const trasformaDi = (nodo) => nodo.querySelector('.al-trasforma');
const costoDi = (nodo) => nodo.querySelector('.al-conto .talos-mono').textContent;
const lavoroDi = (nodo) => nodo.querySelector('.al-lavoro').textContent;

test('LATO-FE-01 domanda e risposta nel filo, la risposta senza HTML; il secondo giro manda il filo', async () => {
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
  assert.match(lavoroDi(due.nodo), /24 token/u);
});

test('LATO-FE-02 mentre risponde corre l\'orologio dell\'attività e non si chiede due volte', async () => {
  let libera;
  const { lato, nodo, corse } = vista({ chiedi: () => new Promise((f) => { libera = () => f({ risposta: 'ok', usage: null }); }) });
  lato.fai('x');
  assert.ok(nodo.querySelector('[data-attivita-da]'));
  assert.equal(corse.length, 1);
  assert.equal(nodo.querySelector('.lato-campo button').disabled, true);
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
  assert.equal(trasformaDi(nodo).hidden, true);
  lato.fai('qui');
  await attesa();
  assert.equal(trasformaDi(nodo).hidden, false);
  cambia('s2');
  assert.deepEqual(testi(nodo), []);
  cambia('s1');
  assert.equal(testi(nodo)[0], 'qui');
  clic(trasformaDi(nodo));
  await attesa();
  assert.equal(aperte[0].sessionId, 'nuova');
  assert.deepEqual(aperte[0].filo, [{ domanda: 'qui', risposta: 'Risposta 1' }]);
});

test('LATO-FE-06 Trasforma con un giro in corso dice di aspettare e non perde il filo', async () => {
  const { lato, nodo, aperte } = vista({ trasforma: async () => { throw Object.assign(new Error('x'), { problem: { reason: 'running' } }); } });
  lato.fai('qui');
  await attesa();
  clic(trasformaDi(nodo));
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

/* Decisioni 57 e 144 (04/11/2026), e l'Assistente (owner 16:45, punto 6): la spesa si vede SEMPRE, anche a zero, in questa chat e in tutto; nessun
   tetto. Il lavoro (token) resta accanto, come prima. */
test('LATO-FE-DOLLARI-1 prezzo noto: i dollari sommati in questa chat, poi il lavoro', async () => {
  const { lato, nodo } = vista({ chiedi: async () => ({ risposta: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 }, costo: 0.0012 }) });
  assert.equal(costoDi(nodo), '$0.00 in questa chat', 'a zero si vede');
  lato.fai('uno');
  await attesa();
  assert.equal(costoDi(nodo), '~$0.0012 in questa chat');
  assert.equal(lavoroDi(nodo), '12 token in questa chat');
  lato.fai('due');
  await attesa();
  assert.equal(costoDi(nodo), '~$0.0024 in questa chat');
  assert.equal(lavoroDi(nodo), '24 token in questa chat');
});
test('LATO-FE-DOLLARI-2 AL CONTRARIO: una risposta senza prezzo e il filo dice solo il lavoro, come oggi', async () => {
  let n = 0;
  const { lato, nodo } = vista({ chiedi: async () => { n += 1; return { risposta: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 }, ...(n === 1 ? { costo: 0.0012 } : { costo: null }) }; } });
  lato.fai('uno');
  await attesa();
  lato.fai('due');
  await attesa();
  assert.equal(costoDi(nodo), '');
  assert.equal(lavoroDi(nodo), '24 token in questa chat');
  const vecchio = vista();
  vecchio.lato.fai('server di prima, senza il campo');
  await attesa();
  assert.doesNotMatch(costoDi(vecchio.nodo), /\$/u);
});
test('LATO-FE-DOLLARI-3 gratis è detto gratis; il filo trasformato riparte da zero', async () => {
  const { lato, nodo } = vista({ chiedi: async () => ({ risposta: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 }, costo: 0 }) });
  lato.fai('uno');
  await attesa();
  assert.equal(costoDi(nodo), '$0.00 in questa chat');
  clic(trasformaDi(nodo));
  await attesa();
  lato.perSessione(); // l'app ridisegna al cambio di sessione (`passaASessione`)
  assert.equal(costoDi(nodo), '$0.00 in questa chat');
  assert.equal(lavoroDi(nodo), '');
});

/* Prova dell'escape (Desktop 04/11/2026, dopo la prova CRC-11 del Mobile): la spesa mostra «~$<0.0001» e un importo normale come testo, in
   italiano e in inglese (il DOM finto fa cadere ogni innerHTML). */
test('LATO-FE-DOLLARI-ESCAPE «~$<0.0001» e un importo normale: la riga li mostra come testo, nelle due lingue', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  try {
    for (const [costo, atteso] of [[0.00000002, '~$<0.0001'], [0.0012, '~$0.0012']]) {
      for (const [lingua, chat, coda] of [['it', 'in questa chat', '12 token in questa chat'], ['en', 'in this chat', '12 token in this chat']]) {
        impostaLingua(lingua);
        const { lato, nodo } = vista({ chiedi: async () => ({ risposta: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 }, costo }) });
        lato.fai('uno');
        await attesa();
        assert.equal(costoDi(nodo), `${atteso} ${chat}`, lingua);
        assert.equal(lavoroDi(nodo), coda, lingua);
        assert.doesNotMatch(costoDi(nodo), /&(?:lt|gt|amp|quot|#\d+);/u);
      }
    }
  } finally { impostaLingua('it'); }
});

/* ------------------------------------------------------------- l'Assistente, pezzo «a domanda» ------------------------------------------------ */

const disegnaVero = (document) => (testo) => renderizzaMarkdown(testo, { document, linkWeb: true, linkFile: true });

test('ASS-FE-01 la risposta col disegnatore della chat: grassetto vero, HTML a testo, javascript: senza indirizzo, file come link', async () => {
  const conDisegno = vista({ disegnaTesto: (t) => disegnaVero(conDisegno.document)(t), chiedi: async () => ({ risposta: '**Fatto** <img src=x onerror=alert(1)> [clicca](javascript:alert(1)) vedi `src/app.js:10-14`', usage: null }) });
  conDisegno.lato.fai('domanda con **asterischi**');
  await attesa();
  const nodo = conDisegno.nodo;
  assert.equal(nodo.querySelector('.al-md strong')?.textContent, 'Fatto');
  assert.equal(nodo.querySelector('img'), null);
  assert.match(nodo.querySelector('.al-md').textContent, /<img src=x onerror=alert\(1\)>/u);
  const a = nodo.querySelectorAll('.al-md a');
  assert.ok(a.every((x) => x.getAttribute('href') === null), 'javascript: resta senza href');
  const file = nodo.querySelector('.talos-link-file');
  assert.equal(file?.getAttribute('data-file'), 'src/app.js');
  assert.equal(file?.getAttribute('data-righe'), '10-14');
  assert.equal(nodo.querySelector('.lato-msg--tu p').textContent, 'domanda con **asterischi**', 'la domanda resta testo');
});

test('ASS-FE-02 tre domande pronte sotto il campo: un clic la manda, e sparisce quando è stata fatta', async () => {
  const { nodo, chieste } = vista();
  const pronte = () => nodo.querySelectorAll('.al-pronte [data-pronta]');
  assert.deepEqual(pronte().map((b) => b.textContent), ['Cosa sta facendo l’agente?', 'È sicuro questo comando?', 'Cosa resta da fare?']);
  assert.equal(DOMANDE_PRONTE.length, 3);
  clic(pronte()[1]);
  await attesa();
  assert.equal(chieste[0].corpo.domanda, 'È sicuro questo comando?');
  assert.deepEqual(pronte().map((b) => b.dataset.pronta), ['q1', 'q3']);
});

test('ASS-FE-03 le domande salvate tornano dal server dopo una ricarica e un cambio di sessione; spesa in tutto e cosa ha letto', async () => {
  const salvati = { s1: { scambi: [{ id: 'a', at: '2026-11-11T17:50:00.000Z', domanda: 'salvata?', risposta: 'sì', diario: [{ nome: 'leggi', cosa: 'src/a.js', rifiutato: false }] }], spesa: { chat: 0.01, inTutto: 0.5 },
    letture: { messaggi: 23, file: 4, uscite: 5 }, modello: { id: 'm', diSerie: true, locale: false }, conStrumenti: true }, s2: { scambi: [], spesa: { chat: 0, inTutto: 0.5 }, letture: { messaggi: 1, file: 0, uscite: 0 } } };
  const caricate = [];
  const { nodo, cambia } = vista({ carica: async (id) => { caricate.push(id); return salvati[id]; } });
  await attesa();
  assert.deepEqual(testi(nodo), ['salvata?', 'sì'], 'ricaricato dal server');
  assert.match(costoDi(nodo), /^~?\$0\.01\d* in questa chat$/u);
  assert.match(nodo.querySelector('.al-in-tutto').textContent, /^~?\$0\.50?\d* in tutto$/u);
  /* giudice v1596 punto 7: i file della testata sono quelli letti dall'Assistente (una fonte con «Ultimo giro»), non i 4 dell'agente */
  assert.match(nodo.querySelector('.al-legge').textContent, /23 messaggi, 1 file e 5 uscite/u);
  cambia('s2');
  await attesa();
  assert.deepEqual(testi(nodo), []);
  assert.equal(costoDi(nodo), '$0.00 in questa chat');
  cambia('s1');
  await attesa();
  assert.deepEqual(testi(nodo), ['salvata?', 'sì']);
  assert.deepEqual(caricate, ['s1', 's2', 's1']);
  clic(nodo.querySelector('.al-legge'));
  assert.match(nodo.querySelector('.al-vista').textContent, /Leggere i file.*1 volta/su);
  assert.match(nodo.querySelector('.al-vista').textContent, /ha letto src\/a\.js/u);
  clic(nodo.querySelector('.al-indietro'));
  assert.equal(nodo.querySelector('.al-vista').hidden, true);
});

test('ASS-FE-04 un file citato si sbircia in sola lettura con le righe accese; un rifiuto si dice', async () => {
  const chiesti = [];
  const { lato, nodo } = vista({
    disegnaTesto: (t) => renderizzaMarkdown(t, { document: nodo.ownerDocument, linkFile: true }),
    chiedi: async () => ({ risposta: 'vedi `src/a.js:2-3` e `.env:1`', usage: null }),
    apriFile: async (_id, percorso) => { chiesti.push(percorso); if (percorso === '.env') throw Object.assign(new Error('Questo file contiene segreti: non si apre da qui.'), { problem: { reason: 'assistant-file-secret' } }); return { testo: 'uno\ndue\ntre\nquattro' }; },
  });
  lato.fai('dove?');
  await attesa();
  const link = nodo.querySelectorAll('.talos-link-file');
  assert.equal(link.length, 2);
  clic(link[0]);
  await attesa();
  const sbircia = nodo.querySelector('.sbircia');
  assert.equal(sbircia.hidden, false);
  assert.deepEqual(sbircia.querySelectorAll('.riga-f--hl').map((r) => r.textContent), ['2due', '3tre']);
  assert.match(sbircia.querySelector('.sbircia-testa').textContent, /sola lettura/u);
  clic(sbircia.querySelector('[data-azione="chiudi-sbirciata"]'));
  assert.equal(sbircia.hidden, true);
  clic(nodo.querySelectorAll('.talos-link-file')[1]);
  await attesa();
  assert.equal(sbircia.hidden, true);
  assert.match(nodo.querySelector('.lato-filo').textContent, /segreti: non si apre da qui/u);
  assert.deepEqual(chiesti, ['src/a.js', '.env']);
});

test('ASS-FE-05 spento: la scheda di oggi con una riga e «Accendi»; acceso la prima volta dice una frase sola', async () => {
  const memoria = new Map();
  const { nodo } = vista({ memoria: { leggi: (k) => memoria.get(k) ?? null, scrivi: (k, v) => memoria.set(k, v) } });
  assert.equal(nodo.querySelector('.al-testa').hidden, false);
  assert.equal(nodo.querySelector('.al-sola').textContent, 'Sola lettura');
  assert.equal(nodo.querySelector('.al-regola').textContent, 'Non scrive e non esegue. Ogni indirizzo web passa dalla tua carta.');
  clic(nodo.querySelector('[role="switch"]'));
  assert.equal(nodo.querySelector('.al-testa').hidden, true);
  assert.equal(nodo.querySelector('.al-accendi').hidden, false);
  assert.equal(memoria.get('talos.assistente.acceso'), 'no');
  assert.equal(nodo.querySelector('.lato-campo').hidden, false, 'si può ancora chiedere');
  clic(nodo.querySelector('.al-accendi .talos-button--primary'));
  assert.equal(nodo.querySelector('.al-primo').hidden, false);
  assert.match(nodo.querySelector('.al-primo').textContent, /^Acceso\./u);
  const dopo = vista({ memoria: { leggi: (k) => memoria.get(k) ?? null, scrivi: (k, v) => memoria.set(k, v) } });
  assert.equal(dopo.nodo.querySelector('.al-testa').hidden, false, 'la scelta resta');
});

test('ASS-FE-06 il nome «Assistente» / «Assistant» nella linguetta; le chiavi nuove esistono nelle due lingue, senza trattino', () => {
  assert.equal(TESTI.it['modello.inspector.aside'], 'Assistente');
  assert.equal(TESTI.en['modello.inspector.aside'], 'Assistant');
  assert.match(readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8'), /aria-controls="railLato">Assistente<\/button>/u);
  const sorgente = readFileSync(new URL('../../src/components/pannello/a-lato.js', import.meta.url), 'utf8');
  const chiavi = new Set([...sorgente.matchAll(/'(sezioni\.aLato\.[A-Za-z.]+)'/gu)].map((m) => m[1]));
  for (const pezzo of ['tool.files', 'tool.network', 'cannot.secrets', 'ready.q1', 'ready.q2', 'ready.q3']) chiavi.add(`sezioni.aLato.${pezzo}`);
  for (const k of chiavi) {
    assert.equal(typeof TESTI.en[k], 'string', `${k} EN`);
    assert.equal(typeof TESTI.it[k], 'string', `${k} IT`);
    assert.doesNotMatch(k, /-/u);
  }
});

test('ASS-FE-07 i riferimenti ai file: solo `percorso:righe` con una barra o un\'estensione', () => {
  assert.deepEqual(leggiRiferimentoFile('src/app.js:10-14'), { percorso: 'src/app.js', righe: '10-14' });
  assert.deepEqual(leggiRiferimentoFile('README.md:3'), { percorso: 'README.md', righe: '3' });
  assert.deepEqual(leggiRiferimentoFile('C:/x/y.mjs:7'), { percorso: 'C:/x/y.mjs', righe: '7' });
  for (const no of ['ora:12', 'a:b', 'src/app.js', 'https://x.test/a.js:3', 'npm run test:unit', '']) assert.equal(leggiRiferimentoFile(no), null, no);
  const d = documento();
  d.createDocumentFragment = () => d.createElement('div');
  const spento = renderizzaMarkdown('`src/app.js:1`', { document: d });
  assert.equal(spento.querySelector('.talos-link-file'), null, 'senza linkFile resta codice');
});

/* ------------------------------------------------------------------------------------------------------------------------------------------
 * Giro di cura dopo i revisori A, B, C (giudice v1554 e v1564, owner 11/11/2026 21:40): la carta di ogni indirizzo, lo Stop, il pannello vivo,
 * il diario a parole semplici con l'ora locale, il perché di un rifiuto, i riferimenti, l'ultimo giro guardato, la scelta del modello.
 * ------------------------------------------------------------------------------------------------------------------------------------------ */
const oraLocale = (iso) => new Intl.DateTimeFormat('it', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

test('ASS-FE-08 il diario a parole semplici e con l\'ora locale; mai i nomi degli attrezzi', async () => {
  const at = '2026-11-11T17:50:00.000Z';
  const diario = [
    { nome: 'leggi', cosa: 'src/server/sessione.js', righe: '1-60', rifiutato: false },
    { nome: 'cerca', cosa: 'maxAge', rifiutato: false },
    { nome: 'git_diff', cosa: '', rifiutato: false },
    { nome: 'uscita_strumento', cosa: 'call-7', rifiutato: false },
    { nome: 'naviga', cosa: 'nodejs.org', rifiutato: true, carta: 'no' },
    { nome: 'web_search', cosa: '', rifiutato: true, carta: 'nessuna' },
    { nome: 'naviga', cosa: 'developer.mozilla.org', rifiutato: false, carta: 'si' },
  ];
  const { nodo } = vista({ carica: async () => ({ scambi: [{ id: 'a', at, domanda: 'd', risposta: 'r', diario }] }) });
  await attesa();
  clic(nodo.querySelector('.al-legge'));
  const voci = nodo.querySelectorAll('.al-vista .diario li').map((li) => li.textContent);
  const ora = oraLocale(at);
  assert.deepEqual(voci, [
    `${ora}ha letto src/server/sessione.js, righe 1-60`,
    `${ora}ha cercato «maxAge» nei file`,
    `${ora}ha guardato le differenze`,
    `${ora}ha letto l’uscita di un passo`,
    `${ora}voleva aprire una pagina di nodejs.org · hai detto no`,
    `${ora}voleva cercare sul web · dal telefono serve il PC`,
    `${ora}ha aperto una pagina di developer.mozilla.org`,
  ]);
  assert.doesNotMatch(nodo.querySelector('.al-vista').textContent, /leggi |git_diff|uscita_strumento|naviga|web_search/u);
});

test('ASS-FE-09 la carta di un indirizzo: l\'indirizzo INTERO, l\'avviso se porta testo letto, Apri e No rispondono; la domanda di un\'altra finestra si vede', async () => {
  const risposte = [];
  const carta = { id: 'c1', nome: 'naviga', indirizzo: 'https://x.test/a?q=VALORE-LETTO-DAL-FILE&b=2', contieneLetto: true };
  const { nodo } = vista({
    carica: async () => ({ scambi: [], inCorso: { domanda: 'dall\'altra finestra', da: new Date().toISOString() }, carta }),
    rispondiCarta: async (id, r) => { risposte.push([id, r]); return { ok: true }; },
  });
  await attesa();
  assert.deepEqual(testi(nodo), ['dall\'altra finestra']);
  const c = nodo.querySelector('.al-carta');
  assert.ok(c, 'la carta c\'è');
  assert.equal(c.querySelector('.al-carta-indirizzo').textContent, carta.indirizzo);
  assert.match(c.textContent, /testo letto/u);
  clic(c.querySelector('[data-carta="si"]'));
  await attesa();
  assert.deepEqual(risposte, [['s1', { id: 'c1', approvato: true }]]);
  assert.equal(nodo.querySelector('.al-carta'), null, 'risposta: la carta se ne va');
  const due = vista({ carica: async () => ({ scambi: [], inCorso: { domanda: 'q', da: new Date().toISOString() }, carta: { ...carta, contieneLetto: false } }),
    rispondiCarta: async (id, r) => { risposte.push([id, r]); return { ok: true }; } });
  await attesa();
  assert.doesNotMatch(due.nodo.querySelector('.al-carta').textContent, /testo letto/u);
  clic(due.nodo.querySelector('.al-carta [data-carta="no"]'));
  await attesa();
  assert.deepEqual(risposte.at(-1), ['s1', { id: 'c1', approvato: false }]);
});

test('ASS-FE-10 il pannello è vivo: stato, carta e scambi di un\'altra finestra arrivano senza cambiare chat', async () => {
  let caricate = 0;
  const { lato, nodo } = vista({ carica: async () => { caricate += 1; return { scambi: caricate > 1 ? [{ id: 'z', domanda: 'dall\'altra finestra', risposta: 'fatto' }] : [] }; } });
  await attesa();
  lato.evento({ type: 'CUSTOM', name: 'talos.assistente-stato', value: { inCorso: { domanda: 'dall\'altra finestra', da: new Date().toISOString() } } });
  assert.deepEqual(testi(nodo), ['dall\'altra finestra']);
  assert.ok(nodo.querySelector('[data-attivita-da]'));
  lato.evento({ type: 'CUSTOM', name: 'talos.assistente-carta', value: { id: 'c9', nome: 'web_search', indirizzo: 'come si usa maxAge', contieneLetto: false } });
  assert.equal(nodo.querySelector('.al-carta .al-carta-indirizzo').textContent, 'come si usa maxAge');
  lato.evento({ type: 'CUSTOM', name: 'talos.assistente-carta', value: { id: 'c9', chiusa: true, approvata: false } });
  assert.equal(nodo.querySelector('.al-carta'), null);
  lato.evento({ type: 'CUSTOM', name: 'talos.assistente-stato', value: { inCorso: null } });
  lato.evento({ type: 'CUSTOM', name: 'assistente-scambio', value: { id: 'z', domanda: 'dall\'altra finestra', risposta: 'fatto' } });
  await attesa();
  assert.deepEqual(testi(nodo), ['dall\'altra finestra', 'fatto']);
  assert.equal(caricate, 2);
});

test('ASS-FE-11 lo Stop del pannello: c\'è mentre risponde, ferma la domanda e la rimette nel campo', async () => {
  const fermate = [];
  let rifiuta;
  const { lato, nodo } = vista({
    chiedi: () => new Promise((_, no) => { rifiuta = no; }),
    ferma: async (id) => { fermate.push(id); rifiuta(Object.assign(new Error('x'), { problem: { reason: 'side-chat-stopped' } })); return { ok: true, fermata: true }; },
  });
  assert.equal(nodo.querySelector('.al-ferma').hidden, true);
  lato.fai('lunga');
  assert.equal(nodo.querySelector('.al-ferma').hidden, false);
  clic(nodo.querySelector('.al-ferma'));
  await attesa();
  assert.deepEqual(fermate, ['s1']);
  assert.equal(nodo.querySelector('.al-ferma').hidden, true);
  assert.match(nodo.querySelector('.lato-filo').textContent, /Fermata/u);
  assert.equal(nodo.querySelector('input').value, 'lunga');
});

test('ASS-FE-12 un file che non si apre dice il perché: segreto o fuori', async () => {
  const { lato, nodo } = vista({
    apriFile: async (_id, p) => { throw Object.assign(new Error('This file does not open from here'), { problem: { code: 'ASSISTANT_FILE_REFUSED', reason: p === '.env' ? 'assistant-file-secret' : 'assistant-file-outside' } }); },
    testoErrore: () => 'Questo file non si apre da qui',
  });
  await lato.apriSbirciata('.env', '1');
  assert.match(nodo.querySelector('.lato-filo').textContent, /contiene segreti/u);
  await lato.apriSbirciata('../fuori.txt', '1');
  assert.match(nodo.querySelector('.lato-filo').textContent, /fuori dalle cartelle fidate/u);
});

test('ASS-FE-13 i riferimenti sotto la risposta: messaggio, passo, file; ognuno porta dove dice', async () => {
  const vai = [];
  const aperti = [];
  const { nodo } = vista({
    carica: async () => ({ scambi: [{ id: 'a', domanda: 'd', risposta: 'r', riferimenti: [{ tipo: 'messaggio', n: 2, giro: 41 }, { tipo: 'passo', n: 7, id: 'call-7' }, { tipo: 'file', percorso: 'src/server/sessione.js', righe: '1-60' }] }] }),
    vaiAlMessaggio: (giro) => vai.push(['messaggio', giro]), vaiAlPasso: (id) => vai.push(['passo', id]),
    apriFile: async (_id, p) => { aperti.push(p); return { testo: 'x' }; },
  });
  await attesa();
  const chip = nodo.querySelectorAll('.rifs .rif');
  assert.deepEqual(chip.map((c) => c.textContent), ['messaggio 2', 'passo 7', 'sessione.js:1-60']);
  chip.forEach((c) => clic(c));
  await attesa();
  assert.deepEqual(vai, [['messaggio', 41], ['passo', 'call-7']]);
  assert.deepEqual(aperti, ['src/server/sessione.js']);
});

test('ASS-FE-14 «Ultimo giro guardato»: ciò che ha letto l\'ultima domanda, con l\'ora locale, nella casella quieta', async () => {
  const at = '2026-11-11T17:51:00.000Z';
  const { nodo } = vista({ carica: async () => ({ scambi: [{ id: 'a', at, domanda: 'd', risposta: 'r', diario: [
    { nome: 'leggi', cosa: 'a.js' }, { nome: 'leggi', cosa: 'b.js' }, { nome: 'leggi', cosa: 'c.js' }, { nome: 'git_diff', cosa: '' },
    { nome: 'uscita_strumento', cosa: '1' }, { nome: 'uscita_strumento', cosa: '2' }, { nome: 'leggi', cosa: '.env', rifiutato: true }] }] }) });
  await attesa();
  assert.equal(nodo.querySelector('.al-ultimo').textContent, `Ultimo giro guardato alle ${oraLocale(at)}: 3 file, le differenze, 2 uscite di comandi.`);
});

test('ASS-FE-15 «Con che modello pensa»: tre scelte come il bozzetto; la chat di serie si salva, le altre portano alle Impostazioni', async () => {
  const scelte = [];
  const aperte = [];
  const { nodo } = vista({
    carica: async () => ({ scambi: [], modello: { id: 'openrouter:x/y', diSerie: false, locale: false } }),
    sceglieModello: async (m) => { scelte.push(m); return { modello: m }; }, apriSceltaModello: (tipo) => aperte.push(tipo),
  });
  await attesa();
  assert.match(nodo.querySelector('.al-mod').textContent, /▾$/u, 'la freccia resta');
  clic(nodo.querySelector('.al-mod'));
  const radio = nodo.querySelectorAll('.scelte-mod [role="radio"]');
  assert.equal(radio.length, 3);
  assert.deepEqual(radio.map((r) => r.getAttribute('aria-checked')), ['false', 'true', 'false']);
  assert.match(radio[0].textContent, /Modello della chat.*Di serie/su);
  assert.match(nodo.querySelector('.al-vista').textContent, /Si cambia qui o nelle Impostazioni/u);
  clic(radio[2]);
  assert.deepEqual(aperte, ['locale']);
  clic(radio[0]);
  await attesa();
  assert.deepEqual(scelte, [null]);
});

test('ASS-FE-16 una risposta dal telefono senza carta lo dice sotto la risposta', async () => {
  const { nodo } = vista({ carica: async () => ({ scambi: [{ id: 'a', domanda: 'd', risposta: 'r', diario: [{ nome: 'naviga', cosa: 'x.test', rifiutato: true, carta: 'nessuna' }] }] }) });
  await attesa();
  assert.match(nodo.querySelector('.lato-filo').textContent, /Dal telefono l’Assistente non apre pagine web/u);
});

test('ASS-FE-17 i testi dicono il vero: niente interruttore «niente rete», niente «mai» senza prova, la spesa è di questa chat', () => {
  for (const lingua of ['it', 'en']) {
    const tutti = Object.entries(TESTI[lingua]).filter(([k]) => k.startsWith('sezioni.aLato.')).map(([, v]) => v).join('\n');
    assert.doesNotMatch(tutti, /niente rete|no network/iu, lingua);
    assert.doesNotMatch(tutti, /sommati alla sessione|added to the session/u, lingua);
  }
  assert.equal(TESTI.it['sezioni.aLato.rule'], 'Non scrive e non esegue. Ogni indirizzo web passa dalla tua carta.');
  assert.equal(TESTI.en['sezioni.aLato.rule'], 'Doesn’t write, doesn’t run. Every web address goes through your card.');
  assert.match(TESTI.it['sezioni.aLato.cannot.sendContents'], /senza la tua carta/u);
  assert.match(TESTI.it['sezioni.aLato.secretsText'], /riconosciut/u);
  assert.doesNotMatch(TESTI.it['sezioni.aLato.honest'], /non fermo mai/u);
});

test('ASS-FE-18 il trascritto esportato: domanda e risposta dell\'Assistente a righe leggibili, mai il JSON', async () => {
  const { trascriviEventoInterno } = await import('../../src/components/trascrizione-eventi-interni.js');
  const fuori = trascriviEventoInterno({ type: 'CUSTOM', name: 'assistente-scambio', value: { schema: 'talos.assistente-scambio.v1', id: 'a', domanda: 'cosa fa?', risposta: 'Legge **file**.', diario: [] } });
  assert.ok(Array.isArray(fuori?.righe));
  const testo = fuori.righe.join('\n');
  assert.match(testo, /Assistente — domanda/u);
  assert.match(testo, /Assistente — risposta/u);
  assert.match(testo, /cosa fa\?/u);
  assert.match(testo, /Legge \*\*file\*\*\./u);
  assert.doesNotMatch(testo, /talos\.assistente-scambio|"diario"/u);
  assert.equal(TESTI.en['app.transcript.sideQuestion'], '**Assistant — question:**');
  assert.equal(TESTI.en['app.transcript.sideAnswer'], '**Assistant — answer:**');
});

test('ASS-FE-19 lo scambio annunciato dall\'evento PRIMA della risposta HTTP non si raddoppia, e il lavoro si conta una volta (foto del giro di cura)', async () => {
  let libera;
  const salvato = { id: 'x1', domanda: 'una', risposta: 'Risposta', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0 } };
  let dalServer = [];
  const { lato, nodo } = vista({
    chiedi: () => new Promise((f) => { libera = () => f({ risposta: 'Risposta', usage: salvato.usage, scambio: salvato }); }),
    carica: async () => ({ scambi: dalServer }),
  });
  await attesa();
  lato.fai('una');
  dalServer = [salvato];
  lato.evento({ type: 'CUSTOM', name: 'assistente-scambio', value: salvato });
  await attesa();
  libera();
  await attesa();
  assert.deepEqual(testi(nodo), ['una', 'Risposta']);
  assert.match(lavoroDi(nodo), /^12 token/u);
});

/* ------------------------------------------- giro corto unico (giudice v1584 + v1596, 12/11/2026) ------------------------------------------- */

test('ASS-FE-20 il diario dice il PERCHÉ di un rifiuto: indirizzo troppo lungo, ricerca web non configurata; «Ultimo giro» non dice «il web» se non c\'è andato', async () => {
  const at = '2026-11-12T00:20:00.000Z';
  const diario = [
    { nome: 'naviga', cosa: 'raccolta.test', rifiutato: true, motivo: 'troppo-lungo' },
    { nome: 'web_search', cosa: '', rifiutato: true, motivo: 'senza-fornitore' },
    { nome: 'leggi', cosa: 'src/a.js', rifiutato: false },
  ];
  const { nodo } = vista({ carica: async () => ({ scambi: [{ id: 'a', at, domanda: 'd', risposta: 'r', diario }] }) });
  await attesa();
  assert.equal(nodo.querySelector('.al-ultimo').textContent, `Ultimo giro guardato alle ${oraLocale(at)}: 1 file.`);
  clic(nodo.querySelector('.al-legge'));
  const voci = nodo.querySelectorAll('.al-vista .diario li').map((li) => li.textContent.slice(oraLocale(at).length));
  assert.deepEqual(voci.slice(0, 2), [
    'voleva aprire una pagina di raccolta.test · l’indirizzo era troppo lungo per mostrarlo intero',
    'voleva cercare sul web · la ricerca web non è configurata',
  ]);
  assert.equal(TESTI.en['sezioni.aLato.did.tooLong'], 'the address was too long to show in full');
  assert.equal(TESTI.en['sezioni.aLato.did.noSearch'], 'web search is not set up');
});

test('ASS-FE-21 dopo 2 «no» lo scambio si ferma con una riga, nel pannello e nel trascritto esportato', async () => {
  const { nodo } = vista({ carica: async () => ({ scambi: [{ id: 'a', domanda: 'apri', risposta: '', fermataDaiNo: true, diario: [
    { nome: 'naviga', cosa: 'a.test', rifiutato: true, carta: 'no' }, { nome: 'naviga', cosa: 'b.test', rifiutato: true, carta: 'no' }] }] }) });
  await attesa();
  const filo = nodo.querySelector('.lato-filo').textContent;
  assert.match(filo, /Fermata dopo due no: non ti mostro altre carte per questa domanda\./u);
  assert.deepEqual(testi(nodo), ['apri'], 'niente bolla vuota al posto della risposta');
  const { trascriviEventoInterno } = await import('../../src/components/trascrizione-eventi-interni.js');
  const righe = trascriviEventoInterno({ type: 'CUSTOM', name: 'assistente-scambio', value: { domanda: 'apri', risposta: '', fermataDaiNo: true, diario: [] } }).righe.join('\n');
  assert.match(righe, /Fermata dopo due no/u);
  assert.equal(TESTI.en['sezioni.aLato.stoppedAfterNo'], 'Stopped after two no’s: no more cards for this question.');
});

test('ASS-FE-22 testata e «Ultimo giro guardato» contano i file dalla STESSA fonte: con 1 file letto entrambe dicono 1', async () => {
  const at = '2026-11-12T00:21:00.000Z';
  const { nodo } = vista({ carica: async () => ({ letture: { messaggi: 2, file: 0, uscite: 0 }, scambi: [{ id: 'a', at, domanda: 'd', risposta: 'r', diario: [
    { nome: 'leggi', cosa: 'src/a.js', righe: '1-3' }, { nome: 'leggi', cosa: 'src/a.js', righe: '4-9' }, { nome: 'leggi', cosa: '.env', rifiutato: true }] }] }) });
  await attesa();
  assert.match(nodo.querySelector('.al-legge').textContent, /2 messaggi, 1 file/u);
  assert.match(nodo.querySelector('.al-ultimo').textContent, /: 1 file\.$/u);
});

test('ASS-FE-23 le due carte delle Impostazioni hanno un ordine fisso: compattazione, memoria del modello, Assistente, a ogni ridisegno', async () => {
  const { posizionaCartaAssistente } = await import('../../src/components/carta-assistente.js');
  /* un pannello minimo: figli in fila, `after` sposta, come il DOM */
  const pannello = { figli: [], querySelector(sel) { const m = /data-settings-card="([^"]+)"/u.exec(sel); return this.figli.find((f) => f.carta === m?.[1]) ?? null; }, append(n) { this.after(null, n); } };
  pannello.after = (dopo, n) => { const i = pannello.figli.indexOf(n); if (i >= 0) pannello.figli.splice(i, 1); pannello.figli.splice(dopo ? pannello.figli.indexOf(dopo) + 1 : pannello.figli.length, 0, n); n.isConnected = true; };
  const nodo = (carta) => ({ carta, isConnected: false, after(n) { pannello.after(this, n); }, get nextElementSibling() { return pannello.figli[pannello.figli.indexOf(this) + 1] ?? null; } });
  const compattazione = nodo('memoria-compattazione'); const memoria = nodo('memoria-modello'); const assistente = nodo('memoria-assistente'); const altra = nodo('memoria-motore-contesto');
  pannello.append(altra); pannello.append(compattazione);
  /* la carta della memoria del modello (ramo della soglia) si mette subito dopo la compattazione a ogni suo ridisegno */
  const ridisegnaMemoria = () => { if (compattazione.nextElementSibling !== memoria) compattazione.after(memoria); };
  ridisegnaMemoria();
  posizionaCartaAssistente(pannello, assistente);
  const ordine = () => pannello.figli.map((f) => f.carta).join(' > ');
  const atteso = 'memoria-motore-contesto > memoria-compattazione > memoria-modello > memoria-assistente';
  assert.equal(ordine(), atteso);
  for (let i = 0; i < 2; i += 1) { ridisegnaMemoria(); posizionaCartaAssistente(pannello, assistente); assert.equal(ordine(), atteso, `ridisegno ${i + 1}`); }
  posizionaCartaAssistente(pannello, assistente); ridisegnaMemoria();
  assert.equal(ordine(), atteso, 'nell\'altro ordine di ridisegno');
});

test('ASS-FE-24 il testo della testata dice quando legge (giudice v1596): EN prima, poi IT; la pillola «Sola lettura» non si nasconde a 340', () => {
  assert.equal(TESTI.en['sezioni.aLato.watching'], 'I read this chat and its files only when you ask');
  assert.equal(TESTI.it['sezioni.aLato.watching'], 'Leggo questa chat e i suoi file solo quando mi chiedi');
  assert.match(TESTI.en['sezioni.aLato.firstOn'], /I read this chat and its files only when you ask/u);
  assert.match(TESTI.it['sezioni.aLato.firstOn'], /Leggo questa chat e i suoi file solo quando mi chiedi/u);
  for (const lingua of ['it', 'en']) assert.doesNotMatch(Object.entries(TESTI[lingua]).filter(([k]) => k.startsWith('sezioni.aLato.')).map(([, v]) => v).join('\n'), /Guardo questa chat|I watch this chat|Watching this chat/u);
  const css = readFileSync(new URL('../../src/styles/a-lato.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.al-sola\s*\{[^}]*display:\s*none/u, 'la pillola non si nasconde a nessuna larghezza');
});
