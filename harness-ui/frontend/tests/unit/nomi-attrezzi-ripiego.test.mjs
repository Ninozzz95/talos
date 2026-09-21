import test from 'node:test';
import assert from 'node:assert/strict';
import { nomeDiRipiegoAttrezzo, nomeUmanoAttrezzo } from '../../src/components/nomi-attrezzi.js';

/*
 * 17/09/2026 — il ripiego per un attrezzo che non ha (ancora) un nome nostro. Due regole dell'owner del 04/09 si
 * toccano qui: «niente nomi tecnici a schermo» e «ripiego ONESTO: mai un'etichetta inventata». L'id grezzo rompeva
 * la prima, «attrezzo senza nome» la seconda (e nascondeva il nome che la PERSONA ha dato a un attrezzo suo).
 * Il ripiego è il nome stesso, reso leggibile e niente di più.
 */
test('RIPIEGO-01 — un attrezzo creato dalla persona mostra il SUO nome, leggibile', () => {
  assert.equal(nomeDiRipiegoAttrezzo('converti_pdf'), 'converti pdf');
  assert.equal(nomeDiRipiegoAttrezzo('attrezzo_inventato_dall_owner'), 'attrezzo inventato dall owner');
  assert.equal(nomeDiRipiegoAttrezzo('riassumi-fattura'), 'riassumi fattura');
});

test('RIPIEGO-02 — un attrezzo MCP dice cosa fa e da chi viene, senza i doppi trattini bassi', () => {
  assert.equal(nomeDiRipiegoAttrezzo('mcp__github__create_issue'), 'create issue (github)');
  assert.equal(nomeDiRipiegoAttrezzo('mcp__claude_ai_Docs__read'), 'read (claude ai Docs)');
});

test('RIPIEGO-03 — al contrario: niente nome, niente testo (mai un\'etichetta inventata)', () => {
  for (const vuoto of ['', '   ', null, undefined, 42, {}]) assert.equal(nomeDiRipiegoAttrezzo(vuoto), '', String(vuoto));
});

test('RIPIEGO-04 — il ripiego non tocca chi un nome ce l\'ha: la mappa vince sempre', () => {
  assert.equal(nomeUmanoAttrezzo('file_edit'), 'modifica di un file');
  assert.equal(nomeUmanoAttrezzo('shell'), 'comando nel terminale');
  assert.equal(nomeUmanoAttrezzo('attrezzo_mai_visto'), null, 'la mappa dice «non lo conosco»: il ripiego è di chi chiama');
});

test('RIPIEGO-05 — nessun trattino basso e nessun doppio spazio arrivano a schermo', () => {
  for (const id of ['a__b', 'mcp__srv_uno__fai_una_cosa', '_inizio', 'fine_', 'molti___trattini']) {
    const testo = nomeDiRipiegoAttrezzo(id);
    assert.ok(!testo.includes('_'), `${id} → ${testo}`);
    assert.ok(!/\s{2,}/u.test(testo), `${id} → ${testo}`);
    assert.equal(testo, testo.trim());
  }
});
