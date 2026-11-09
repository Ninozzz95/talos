/*
 * Decisioni 57 e 144 (04/11/2026): dollari dove il prezzo è noto, altrimenti il lavoro. Le funzioni pure di `kernel/costo-in-dollari.mjs`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { dollariDaUsage, formattaDollari, prezzoDelModelloEntro, prezzoPerLaRicerca, prezzoValido, sommaDollari } from '../src/kernel/costo-in-dollari.mjs';

test('DOLL-01 la cifra ha la forma di Hermes: zero, sotto il centesimo a quattro decimali, mai uno zero finto', () => {
  assert.equal(formattaDollari(0), '$0.00');
  assert.equal(formattaDollari(0.0046), '~$0.0046');
  assert.equal(formattaDollari(0.00004), '~$<0.0001', 'una cifra positiva non si legge mai come zero');
  assert.equal(formattaDollari(0.00005), '~$0.0001');
  assert.equal(formattaDollari(0.0099), '~$0.0099');
  assert.equal(formattaDollari(0.01), '~$0.01');
  assert.equal(formattaDollari(1.234), '~$1.23');
  assert.equal(formattaDollari(12), '~$12.00');
  for (const storta of [null, undefined, NaN, Infinity, -0.01, '0.5']) assert.equal(formattaDollari(storta), null, String(storta));
});

test('DOLL-02 la cifra dichiarata dal fornitore vince sul prezzo pubblicato', () => {
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 500, cost: 0.0021 }, { in: 1, out: 4 }), 0.0021);
  assert.equal(dollariDaUsage({ cost: 0 }, null), 0, 'gratis dichiarato è gratis');
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 500, cost: -1 }, null), null, 'una cifra negativa non è un costo');
});

test('DOLL-03 dal prezzo pubblicato: ingresso e uscita ognuno col suo prezzo', () => {
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 500 }, { in: 1, out: 4 }), 0.003);
  assert.equal(dollariDaUsage({ prompt_tokens: 2_000_000 }, { in: 0.5, out: 4 }), 1);
  assert.equal(dollariDaUsage({ completion_tokens: 1_000_000 }, { in: 0.5, out: 4 }), 4);
});

test('DOLL-04 AL CONTRARIO: prezzo ignoto, uso assente o cache senza prezzo ⇒ ignoto, mai zero', () => {
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 500 }, null), null);
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 500 }, { in: 1 }), null, 'manca l\'uscita');
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 500 }, { in: -1, out: 1 }), null, 'un listino variabile non è un prezzo');
  assert.equal(dollariDaUsage(null, { in: 1, out: 1 }), null);
  assert.equal(dollariDaUsage({}, { in: 1, out: 1 }), null);
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 10, cached_tokens: 800 }, { in: 1, out: 4 }), null, 'la cache non ha prezzo nel catalogo');
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 800 } }, { in: 1, out: 4 }), null);
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 10, cached_tokens: 800 }, { in: 0, out: 0 }), 0, 'un modello gratis resta gratis');
  assert.equal(dollariDaUsage({ prompt_tokens: 1000, completion_tokens: 10, cached_tokens: 0 }, { in: 1, out: 4 }), 0.00104);
});

test('DOLL-05 una somma con una cifra ignota è ignota', () => {
  assert.equal(sommaDollari([0.001, 0.002]), 0.003);
  assert.equal(sommaDollari([]), 0);
  assert.equal(sommaDollari([0.001, null]), null);
  assert.equal(sommaDollari([0.001, NaN]), null);
});

test('DOLL-06 il prezzo per il piano della ricerca, e il prezzo valido', () => {
  assert.deepEqual(prezzoPerLaRicerca({ in: 0.4, out: 1.6 }), { currency: 'USD', promptPerMillion: 0.4, completionPerMillion: 1.6 });
  assert.equal(prezzoPerLaRicerca(null), null);
  assert.equal(prezzoPerLaRicerca({ in: 0.4 }), null);
  assert.deepEqual(prezzoValido({ in: 0, out: 0, altro: 1 }), { in: 0, out: 0 });
  assert.equal(prezzoValido('x'), null);
});

test('DOLL-07 il prezzo del modello: errore, attesa oltre il tetto, forma storta o niente funzione ⇒ null', async () => {
  assert.deepEqual(await prezzoDelModelloEntro(async (m) => (m === 'a/b' ? { in: 1, out: 2 } : null), 'a/b'), { in: 1, out: 2 });
  assert.deepEqual(await prezzoDelModelloEntro((m) => ({ in: 1, out: 2, m }), 'a/b'), { in: 1, out: 2 }, 'anche sincrona');
  assert.equal(await prezzoDelModelloEntro(async () => { throw new Error('giù'); }, 'a/b'), null);
  assert.equal(await prezzoDelModelloEntro(() => { throw new Error('giù'); }, 'a/b'), null);
  assert.equal(await prezzoDelModelloEntro(() => new Promise(() => {}), 'a/b', 20), null);
  assert.equal(await prezzoDelModelloEntro(async () => ({ in: 'x', out: 1 }), 'a/b'), null);
  assert.equal(await prezzoDelModelloEntro(null, 'a/b'), null);
  assert.equal(await prezzoDelModelloEntro(async () => ({ in: 1, out: 1 }), ''), null);
});

/* Condizioni di Performance sulla forma (04/11/2026): (1) col catalogo freddo la carta non aspetta la rete più di 300 ms; (2) finita la
   lettura, il timer del tetto si spegne: nessun timer appeso. */
test('DOLL-08 Performance: il tetto di serie è 300 ms, al millisecondo (orologio finto)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let esito = 'in attesa';
  const lettura = prezzoDelModelloEntro(() => new Promise(() => {}), 'a/b').then((v) => { esito = v; });
  await new Promise(setImmediate);
  t.mock.timers.tick(299);
  await new Promise(setImmediate);
  assert.equal(esito, 'in attesa', 'a 299 ms la carta aspetta ancora');
  t.mock.timers.tick(1);
  await new Promise(setImmediate);
  assert.equal(esito, null, 'a 300 ms la carta esce col lavoro');
  t.mock.timers.tick(60_000); // con un tetto più lungo la lettura si chiude qui: la prova fallisce sopra, non resta appesa
  await lettura;
});

test('DOLL-09 Performance: finita la lettura (prezzo, nulla, errore, forma storta) il timer del tetto è spento', async () => {
  const creati = [];
  const spenti = new Set();
  const { setTimeout: st, clearTimeout: ct } = globalThis;
  globalThis.setTimeout = (...a) => { const h = st(...a); creati.push(h); return h; };
  globalThis.clearTimeout = (h) => { spenti.add(h); return ct(h); };
  try {
    for (const fn of [async () => ({ in: 1, out: 1 }), () => ({ in: 1, out: 1 }), async () => null, async () => { throw new Error('giù'); }, async () => ({ in: 'x' })]) {
      await prezzoDelModelloEntro(fn, 'a/b');
    }
  } finally {
    globalThis.setTimeout = st;
    globalThis.clearTimeout = ct;
  }
  assert.equal(creati.length, 5, 'un timer per lettura');
  assert.ok(creati.every((h) => spenti.has(h)), 'ogni timer del tetto spento appena la lettura finisce');
});
