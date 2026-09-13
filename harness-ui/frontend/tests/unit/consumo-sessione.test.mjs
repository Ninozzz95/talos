import test from 'node:test';
import assert from 'node:assert/strict';
import { sommaUsage, usageDellaSessione, esecuzioniDellaSessione } from '../../src/components/consumo-sessione.js';
import { testiUsage } from '../../src/components/chat-foot.js';

/*
 * ⛔⛔⛔ 06/9 — CB-04: «il consumo mostrato è quello dell'ULTIMO INVIO, non della
 * sessione». Numeri VERI, misurati prima della cura su tre invii con
 * `z-ai/glm-5.3-flash` (sonda `.gravi/sonde/01-consumo.mjs`, sessione
 * 53ea52d1-4ead-4bcd-9eef-837d37e3d534): {7669,68,7616} · {7675,28,0} ·
 * {7716,25,7616} ⇒ totale {23.060, 121, 15.232, 3 giri}. A schermo se ne
 * vedeva l'ultimo terzo, e una cache al 99% invece del 66%.
 * Ricerca 06/09/2026: OpenAI «Counting tokens» (usage è per richiesta, la somma
 * la fa chi chiama) · OpenRouter «Prompt Caching» (tasso di sessione = somma
 * dei cached su somma dei prompt).
 */

test('CTX-USAGE-CACHE-UNKNOWN summary cache not reported does not dilute the measured chat cache', () => {
  const chat = { prompt_tokens: 100, completion_tokens: 20, cached_tokens: 40, giri: 1 };
  const compattazione = { prompt_tokens: 1800, completion_tokens: 80, cached_tokens: null, prompt_tokens_con_cache: null };
  const total = { ...chat, prompt_tokens: 1900, completion_tokens: 100, compattazione, prompt_tokens_con_cache: 100 };
  const shown = testiUsage(chat, { usageSessione: total });
  assert.equal(shown.cache, 'cache 40%');
  assert.match(shown.tokenGiri, /2,0k token · 1 giro/);
});

const INVII = [
  { prompt_tokens: 7669, completion_tokens: 68, cached_tokens: 7616, giri: 1 },
  { prompt_tokens: 7675, completion_tokens: 28, cached_tokens: 0, giri: 1 },
  { prompt_tokens: 7716, completion_tokens: 25, cached_tokens: 7616, giri: 1 },
];

test('CB-04 SOMMA: i tre invii veri fanno il totale della sessione', () => {
  const totale = INVII.reduce((acc, u) => sommaUsage(acc, u), null);
  assert.equal(totale.prompt_tokens, 23060);
  assert.equal(totale.completion_tokens, 121);
  assert.equal(totale.cached_tokens, 15232);
  assert.equal(totale.giri, 3);
});

test('⛔ AL CONTRARIO — sommare con «niente» non azzera e non inventa', () => {
  assert.equal(sommaUsage(null, null), null, '«non misurato» resta non misurato');
  assert.deepEqual(sommaUsage(null, INVII[0]), INVII[0]);
  assert.deepEqual(sommaUsage(INVII[0], null), INVII[0]);
  // un campo dichiarato da una parte sola sopravvive, non viene azzerato dall'altra
  const misto = sommaUsage({ prompt_tokens: 100 }, { completion_tokens: 7 });
  assert.equal(misto.prompt_tokens, 100);
  assert.equal(misto.completion_tokens, 7);
  assert.ok(!('cached_tokens' in misto), '⛔ una cache mai dichiarata non diventa uno zero sommando');
});

test('⛔ AL CONTRARIO — la velocità è un TASSO: non si somma', () => {
  const totale = sommaUsage({ prompt_tokens: 10, tokens_per_second: 40 }, { prompt_tokens: 10, tokens_per_second: 60 });
  assert.equal(totale.tokens_per_second, 60, 'resta quella dell’ultimo invio, mai 100');
});

test('CB-04 LETTURA: `usageSessione` vince su `usage`, e senza di lui si ripiega dicendo cosa si legge', () => {
  const riga = { usage: INVII[2], usageSessione: { prompt_tokens: 23060, completion_tokens: 121, cached_tokens: 15232, giri: 3, esecuzioni: 3 } };
  assert.equal(usageDellaSessione(riga).prompt_tokens, 23060);
  assert.equal(esecuzioniDellaSessione(riga), 3);
  // registrazione vecchia: meglio l'ultimo invio che niente, ma il conteggio degli invii non si inventa
  const vecchia = { usage: INVII[2] };
  assert.equal(usageDellaSessione(vecchia).prompt_tokens, 7716);
  assert.equal(esecuzioniDellaSessione(vecchia), null);
  assert.equal(usageDellaSessione(null), null);
});

test('CB-04 BARRA: token e cache vengono dalla SESSIONE, il tetto dei giri dall’INVIO in corso', () => {
  const u = testiUsage(INVII[2], { tettoGiri: 24, usageSessione: { prompt_tokens: 23060, completion_tokens: 121, cached_tokens: 15232, giri: 3 } });
  assert.match(u.tokenGiri, /23,2k token/, '⛔ prima diceva 7,7k: il consumo di un turno solo');
  assert.equal(u.cache, 'cache 66%', '⛔ prima diceva 99%, il tasso dell’ultimo invio');
  assert.equal(u.giri, 1, 'il chip col tetto parla dell’invio in corso');
  assert.ok(!u.tokenGiri.includes('su 24'), '⛔ «3 giri su 24» mescolerebbe la sessione col tetto di un invio');
});

test('⛔ AL CONTRARIO — senza totale di sessione la barra si comporta come prima (una sessione con un invio solo)', () => {
  const u = testiUsage(INVII[0], { tettoGiri: 24 });
  assert.match(u.tokenGiri, /7,7k token · 1 giro su 24/);
  assert.equal(u.cache, 'cache 99%');
  assert.equal(testiUsage(null, {}).tokenGiri, '', 'niente dati, niente numero: mai uno zero al posto di un fatto');
});
