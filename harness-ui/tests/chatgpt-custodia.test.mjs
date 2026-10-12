import assert from 'node:assert/strict';
import test from 'node:test';

import { CARATTERI_PER_PEZZO, SERVIZIO_CHATGPT, creaCustodiaChatgpt } from '../src/chatgpt-custodia.mjs';

/*
 * «Continue with ChatGPT» (11/10/2026) — la custodia a pezzi. Il portachiavi finto ha lo STESSO limite misurato su Windows
 * (1280 caratteri per voce): una custodia che scrivesse un token intero qui fallisce come fallirebbe là.
 */
function portachiaviFinto({ limite = 1280 } = {}) {
  const voci = new Map();
  let rompiSet = null;
  return {
    voci,
    rompiAllaScrittura(n) { rompiSet = n; },
    get: (servizio, account) => voci.get(`${servizio}|${account}`) ?? null,
    set: (servizio, account, valore) => {
      if (valore.length > limite) throw new Error("Value of 'password encoded as UTF-16' is longer than the platform limit of 2560");
      if (rompiSet !== null) { if (rompiSet === 0) { rompiSet = null; throw new Error('keyring down'); } rompiSet -= 1; }
      voci.set(`${servizio}|${account}`, valore);
    },
    remove: (servizio, account) => { voci.delete(`${servizio}|${account}`); },
  };
}
let conta = 0;
const generazione = () => `g${(conta += 1)}`;
const sessione = (n = 1) => ({ accessToken: `A${n}`.padEnd(2600, 'a'), refreshToken: `R${n}`.padEnd(900, 'r'), idToken: `I${n}`.padEnd(1900, 'i'), scadeAlle: 123, scopes: ['openid'] });

test('CUSTODIA-01 — a session longer than one keyring entry is stored in pieces and read back whole', () => {
  const k = portachiaviFinto();
  const c = creaCustodiaChatgpt({ keyring: k, generazione });
  assert.equal(c.leggi('sessione'), null);
  c.scrivi('sessione', sessione(1));
  assert.deepEqual(c.leggi('sessione'), sessione(1));
  const chiavi = [...k.voci.keys()];
  assert.ok(chiavi.every((x) => x.startsWith(`${SERVIZIO_CHATGPT}|sessione:`)));
  assert.ok(chiavi.length >= 5, `pieces + index (${chiavi.length})`);
  assert.ok([...k.voci.values()].every((v) => v.length <= CARATTERI_PER_PEZZO));
  // the other way round: a custody that writes the whole value in one entry would be refused by this keyring
  assert.throws(() => k.set(SERVIZIO_CHATGPT, 'x', JSON.stringify(sessione(1))), /platform limit/);
});

test('CUSTODIA-02 — rewriting leaves no old pieces, and the two entries do not touch each other', () => {
  const k = portachiaviFinto();
  const c = creaCustodiaChatgpt({ keyring: k, generazione });
  c.scrivi('registrazione', { clientId: 'oaiapp_x', idDellHost: 'urn:uuid:1' });
  c.scrivi('sessione', sessione(1));
  const dopoLaPrima = k.voci.size;
  c.scrivi('sessione', sessione(2));
  assert.deepEqual(c.leggi('sessione'), sessione(2));
  assert.equal(k.voci.size, dopoLaPrima, 'the pieces of the previous generation are gone');
  c.togli('sessione');
  assert.equal(c.leggi('sessione'), null);
  assert.deepEqual(c.leggi('registrazione'), { clientId: 'oaiapp_x', idDellHost: 'urn:uuid:1' }, 'signing out keeps the registration');
  assert.equal([...k.voci.keys()].some((x) => x.includes('|sessione:')), false);
  c.togli('sessione'); // not there: no throw
});

test('CUSTODIA-03 — a write that fails halfway keeps the previous session whole and leaves no orphans', () => {
  const k = portachiaviFinto();
  const c = creaCustodiaChatgpt({ keyring: k, generazione });
  c.scrivi('sessione', sessione(1));
  const prima = new Map(k.voci);
  for (const quando of [0, 2, 4]) { // first piece, a middle piece, the index
    k.rompiAllaScrittura(quando);
    assert.throws(() => c.scrivi('sessione', sessione(9)), (e) => e.code === 'CHATGPT_CUSTODIA_FALLITA' && !e.message.includes('A9'));
    assert.deepEqual(c.leggi('sessione'), sessione(1), `failure at write ${quando}`);
    assert.deepEqual([...k.voci.keys()].sort(), [...prima.keys()].sort(), 'no orphan pieces');
  }
});

test('CUSTODIA-04 — an entry that cannot be read whole counts as absent, never as half a token', () => {
  const k = portachiaviFinto();
  const c = creaCustodiaChatgpt({ keyring: k, generazione });
  c.scrivi('sessione', sessione(1));
  const unPezzo = [...k.voci.keys()].find((x) => /:\d+$/u.test(x) && !x.endsWith(':indice'));
  const tenuto = k.voci.get(unPezzo);
  k.voci.delete(unPezzo);
  assert.equal(c.leggi('sessione'), null, 'missing piece');
  k.voci.set(unPezzo, `${tenuto.slice(0, -5)}"}}}}`);
  assert.equal(c.leggi('sessione'), null, 'broken JSON');
  k.voci.set(unPezzo, tenuto);
  assert.deepEqual(c.leggi('sessione'), sessione(1));
  k.voci.set(`${SERVIZIO_CHATGPT}|sessione:indice`, '{"g":"x","n":100000}');
  assert.equal(c.leggi('sessione'), null, 'an absurd index is not followed');
  k.voci.set(`${SERVIZIO_CHATGPT}|sessione:indice`, 'non-json');
  assert.equal(c.leggi('sessione'), null);
});

test('CUSTODIA-05 — no keyring, no custody; unknown entries are refused', () => {
  assert.throws(() => creaCustodiaChatgpt({ keyring: null }), (e) => e.code === 'CHATGPT_CUSTODIA_ASSENTE');
  const c = creaCustodiaChatgpt({ keyring: portachiaviFinto(), generazione });
  for (const fn of [() => c.leggi('altro'), () => c.scrivi('altro', {}), () => c.togli('altro'), () => c.scrivi('sessione', null)]) {
    assert.throws(fn, (e) => e.code === 'CHATGPT_CUSTODIA_VOCE');
  }
});
