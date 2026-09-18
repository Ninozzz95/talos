import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creaSessionItem, ordinaSessioniAdAlbero, SEGNALE_NOVITA_MS } from '../../src/components/session-item.js';

const ADESSO = new Date('2026-09-17T12:00:00.000Z');
const iso = (differenzaMs) => new Date(ADESSO.getTime() - differenzaMs).toISOString();

// Double DOM limitato alla costruzione della riga: non simula layout, focus o accessibilità browser.
function documentoMinimo() {
  const doc = {
    createElement(tag) {
      const attributi = new Map();
      const nodo = {
        tagName: tag.toUpperCase(), ownerDocument: doc, dataset: {}, children: [],
        className: '', textContent: '',
        setAttribute(nome, valore) { attributi.set(nome, String(valore)); },
        getAttribute(nome) { return attributi.get(nome) ?? null; },
        append(...figli) { this.children.push(...figli); },
        addEventListener() {},
      };
      nodo.classList = {
        add(...nomi) { nodo.className = [...new Set([...nodo.className.split(' ').filter(Boolean), ...nomi])].join(' '); },
      };
      return nodo;
    },
  };
  return doc;
}

function nuovaRiga(ultimaRispostaAlle, opzioni = {}) {
  return creaSessionItem({
    sessionId: 'sessione-1', nome: 'Controllo della sidebar', conclusa: true,
    ultimoEsito: 'successo', avviataAlle: iso(90_000), ultimaRispostaAlle,
  }, { document: documentoMinimo(), adesso: ADESSO, ...opzioni });
}

for (const [nome, data, atteso] of [
  ['risposta appena finita', iso(0), 'si'],
  ['risposta di un millisecondo fa', iso(1), 'si'],
  ['confine incluso dei sessanta secondi', iso(SEGNALE_NOVITA_MS), 'si'],
  ['risposta scaduta', iso(SEGNALE_NOVITA_MS + 1), undefined],
  ['timestamp futuro di un millisecondo', iso(-1), undefined],
  ['timestamp futuro di un giorno', iso(-86_400_000), undefined],
  ['timestamp mancante', undefined, undefined],
  ['timestamp nullo', null, undefined],
  ['timestamp vuoto', '', undefined],
  ['timestamp non valido', 'non-una-data', undefined],
]) {
  test(`novità: ${nome}`, () => {
    assert.equal(nuovaRiga(data).dataset.novita, atteso);
  });
}

test('novità: la sessione corrente non viene segnalata', () => {
  const riga = nuovaRiga(iso(1), { corrente: true });
  assert.equal(riga.dataset.novita, undefined);
  assert.equal(riga.getAttribute('aria-current'), 'true');
  assert.equal(riga.tagName, 'BUTTON');
  assert.equal(riga.type, 'button');
});

test('novità: un orologio non valido non produce un segnale', () => {
  assert.equal(nuovaRiga(iso(1), { adesso: new Date(NaN) }).dataset.novita, undefined);
});

test('la riga conserva giri di sessione e giri fermati senza usare il solo ultimo invio', () => {
  const riga = creaSessionItem({
    sessionId: 'conteggio', nome: 'Conteggio', conclusa: true, ultimoEsito: 'successo',
    avviataAlle: iso(120_000), modello: 'provider/modello-di-prova',
    usage: { giri: 1 }, usageSessione: { giri: 3 }, giriFermati: 2,
  }, { document: documentoMinimo(), adesso: ADESSO });
  const aside = riga.children.find((n) => n.className === 'talos-session-item__aside');
  assert.equal(aside.children.at(-1).textContent, '5 giri');
  assert.match(aside.children.at(-1).title, /2 giri fermati/);
  assert.equal(riga.children[0].children[1].children[1].textContent, 'conclusa · modello-di-prova');
});

function sessione(sessionId, extra = {}) {
  return { sessionId, conclusa: true, ultimoEsito: 'successo', avviataAlle: iso(120_000), ...extra };
}

// Definizione precedente di `ultima`: prima riga successiva che non è una discendente.
// Resta volutamente semplice e indipendente dallo stack della produzione.
function verificaUltime(righe) {
  righe.forEach((riga, i) => {
    const successiva = righe.slice(i + 1).find((altra) => altra.profondita <= riga.profondita);
    assert.equal(riga.ultima, !successiva || successiva.profondita < riga.profondita,
      `ultima errata per ${riga.sessione.sessionId} a profondità ${riga.profondita}`);
  });
}

test('albero: input vuoto o assente', () => {
  for (const valore of [[], undefined, null, [null, undefined]]) {
    assert.deepEqual(ordinaSessioniAdAlbero(valore), []);
  }
});

test('albero: le vive salgono come prima e le figlie restano con la madre in ordine di avvio', () => {
  const elenco = [
    sessione('ferma'),
    sessione('altra-viva', { conclusa: false, ultimaRispostaAlle: iso(10_000) }),
    sessione('madre'),
    sessione('seconda', { padreId: 'madre', avviataAlle: iso(60_000), conclusa: false, ultimaRispostaAlle: iso(1_000) }),
    sessione('prima', { padreId: 'madre', avviataAlle: iso(90_000) }),
  ];
  const righe = ordinaSessioniAdAlbero(elenco);
  assert.deepEqual(righe.map((r) => r.sessione.sessionId), ['madre', 'prima', 'seconda', 'altra-viva', 'ferma']);
  assert.deepEqual(righe.map((r) => r.profondita), [0, 1, 1, 0, 0]);
  assert.deepEqual(righe.map((r) => r.ultima), [false, false, true, false, true]);
  verificaUltime(righe);
});

test('albero: i nomi distintivi delle sorelle e gli oggetti originali sono conservati', () => {
  const elenco = Object.freeze([
    Object.freeze(sessione('madre')),
    Object.freeze(sessione('a', { padreId: 'madre', taskDelega: 'Crea un file chiamato parte1.md con un riepilogo' })),
    Object.freeze(sessione('b', { padreId: 'madre', taskDelega: 'Crea un file chiamato parte2.md con un riepilogo' })),
  ]);
  const righe = ordinaSessioniAdAlbero(elenco);
  assert.equal(righe[1].nomeDistintivo, '…parte1.md con un riepilogo');
  assert.equal(righe[2].nomeDistintivo, '…parte2.md con un riepilogo');
  righe.forEach((riga, i) => assert.equal(riga.sessione, elenco[i]));
  verificaUltime(righe);
});

test('albero: orfane, cicli e auto-riferimenti non perdono sessioni', () => {
  const elenco = [
    sessione('orfana', { padreId: 'assente' }), sessione('a', { padreId: 'b' }),
    sessione('b', { padreId: 'a' }), sessione('auto', { padreId: 'auto' }), sessione('radice'),
  ];
  const righe = ordinaSessioniAdAlbero(elenco);
  assert.equal(righe.length, elenco.length);
  assert.deepEqual(new Set(righe.map((r) => r.sessione.sessionId)), new Set(elenco.map((s) => s.sessionId)));
  verificaUltime(righe);
});

test('albero: chiusura dei rami su più livelli e ultima discendente', () => {
  const righe = ordinaSessioniAdAlbero([
    sessione('r'), sessione('a', { padreId: 'r' }), sessione('aa', { padreId: 'a' }),
    sessione('aaa', { padreId: 'aa' }), sessione('ab', { padreId: 'a' }),
    sessione('b', { padreId: 'r' }), sessione('s'),
  ]);
  assert.deepEqual(righe.map((r) => r.sessione.sessionId), ['r', 'a', 'aa', 'aaa', 'ab', 'b', 's']);
  assert.deepEqual(righe.map((r) => r.ultima), [false, false, false, true, true, true, true]);
  verificaUltime(righe);
});

function casualeDeterministico(seme) {
  let stato = seme >>> 0;
  return () => { stato = (Math.imul(stato, 1664525) + 1013904223) >>> 0; return stato / 2 ** 32; };
}

for (const quanti of [5, 50, 200, 1000]) {
  test(`albero: equivalenza della chiusura dei rami con ${quanti} sessioni, senza mutare lo snapshot`, () => {
    for (let seme = 1; seme <= 8; seme += 1) {
      const casuale = casualeDeterministico(seme);
      const elenco = Array.from({ length: quanti }, (_, i) => sessione(`s-${i}`, {
        padreId: i > 0 && casuale() < 0.6 ? `s-${Math.floor(casuale() * i)}` : null,
        avviataAlle: iso(120_000 + i * 1000),
        conclusa: casuale() < 0.7,
        ultimaRispostaAlle: iso(Math.floor(casuale() * 180_000)),
      }));
      for (let i = elenco.length - 1; i > 0; i -= 1) {
        const j = Math.floor(casuale() * (i + 1));
        [elenco[i], elenco[j]] = [elenco[j], elenco[i]];
      }
      elenco.forEach(Object.freeze);
      Object.freeze(elenco);
      const righe = ordinaSessioniAdAlbero(elenco);
      assert.equal(righe.length, quanti);
      assert.equal(new Set(righe.map((r) => r.sessione.sessionId)).size, quanti);
      verificaUltime(righe);
    }
  });
}
