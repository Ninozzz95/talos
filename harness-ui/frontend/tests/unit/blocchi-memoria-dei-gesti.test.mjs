/*
 * Cura BG3 round 5 (reviewer A of round 4, BASSO-1; reviewer C, BASSO): the per-chat memory of gestures (`creaMemoriaAzioni`, E3 of
 * round 4) made a Map for every chat id it ever saw, even on a plain lookup, and never dropped one: it grew with every chat opened in one
 * page life. Now a plain lookup creates nothing, and only the most recently used chats are kept (`CHAT_CON_GESTI_MASSIME`). A chat
 * dropped from the memory loses nothing: when it is opened again with no ready page its journal is replayed (`spegni`), and a ready
 * page (at most `CHAT_PRONTE_MASSIME`, 3) keeps its shells' state in the holders it took with it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import * as aggancio from '../../src/components/blocchi/aggancio.js';
import { CHAT_PRONTE_MASSIME } from '../../src/components/chat-pronte.js';

impostaLingua('it');
const SCELTE = readFileSync(new URL('../../../tests/fixtures/blocchi/03-scelte.txt', import.meta.url), 'utf8').trim();
const { creaAggancioBlocchi, impronta } = aggancio;
const opzioni = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const risposto = (nodo) => opzioni(nodo).some((b) => b.getAttribute('aria-pressed') === 'true') && opzioni(nodo).every((b) => spento(b));

test('G5-7 the cap is named and leaves room for every chat whose page can come back with no replay', () => {
  const N = aggancio.CHAT_CON_GESTI_MASSIME;
  assert.equal(Number.isInteger(N), true, 'CHAT_CON_GESTI_MASSIME is exported');
  assert.ok(N >= 4 * (CHAT_PRONTE_MASSIME + 1), `${N}: the open chat and the ${CHAT_PRONTE_MASSIME} ready ones, with room to spare`);
  assert.ok(N <= 64, `${N}: a cap, not a leak`);
});

test('G5-8 a plain lookup creates no memory; past the cap the least recently used chat is dropped, a chat looked up again is kept', () => {
  assert.equal(typeof aggancio.creaMemoriaAzioni, 'function', 'creaMemoriaAzioni is exported for this test');
  let chat = 'c0';
  const m = aggancio.creaMemoriaAzioni(() => chat, 3);
  for (const c of ['x1', 'x2', 'x3', 'x4', 'x5']) { chat = c; assert.equal(m.cerca('k'), null); }
  assert.equal(m.quante(), 0, 'lookups in chats with no gesture made no memory');
  for (const c of ['a', 'b', 'c']) { chat = c; m.segna({ chiave: 'k', tipo: 'scelte', valore: c }); }
  assert.equal(m.quante(), 3);
  // BG3 round 6 (reviewer B of round 5, M9): a `segna` refreshes the order too, not only a `cerca` (a `nome:` key reaches `segna` with no
  // `cerca` before it): order a, b, c → segna in a → b, c, a → cerca in b → c, a, b → d arrives → c, the least recently used, goes
  chat = 'a'; m.segna({ chiave: 'k2', tipo: 'scelte', valore: 'a2' });
  chat = 'b'; assert.deepEqual(m.cerca('k'), { tipo: 'scelte', valore: 'b' }, 'b used again: now the most recent');
  chat = 'd'; m.segna({ chiave: 'k', tipo: 'scelte', valore: 'd' });
  assert.equal(m.quante(), 3, 'never more than the cap');
  const vale = (c) => { chat = c; return m.cerca('k')?.valore ?? null; };
  assert.deepEqual(['a', 'b', 'c', 'd'].map(vale), ['a', 'b', null, 'd'], 'c, the least recently used, is the one dropped: a segna and a cerca both count as a use');
  chat = 'a'; m.segna({ chiave: 'k', tipo: 'scelte', valore: 'altro' });
  assert.equal(m.cerca('k').valore, 'a', 'first gesture still wins inside a chat');
});

test('G5-9 through the hook: many chats answered in one page life keep the memory at the cap; the recent chats keep their answers', () => {
  const N = aggancio.CHAT_CON_GESTI_MASSIME ?? 16;
  const document = documento();
  let corrente = 's0';
  const a = creaAggancioBlocchi({ document, sessione: () => corrente, timer: orologio().timer, consegna: () => {} });
  const chiave = (s) => `${s}:${impronta(SCELTE)}#prossimo`; // no place lookup in this host: the old key
  const chat = Array.from({ length: N + 5 }, (_, i) => `s${i}`);
  for (const s of chat) { corrente = s; a.spegni(chiave(s), { tipo: 'scelte', valore: 'Continua' }); }
  const vede = (s) => { corrente = s; const n = a.blocco(SCELTE, true); document.body.append(n); return risposto(n); };
  assert.deepEqual(chat.slice(-N).map(vede).filter((x) => !x), [], `the last ${N} chats still show their answers`);
  assert.equal(vede('s0'), false, 's0, the oldest, was dropped: if it comes back with no ready page its journal is replayed');
});
