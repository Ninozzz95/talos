// 15/10/2026 — la regola dei nomi corti vive in due copie: `src/titolo-breve.mjs` (server) e `titoloDalPrimoMessaggio` in
// `frontend/src/components/session-item.js` (il pacchetto del browser non importa moduli del server). Qui si tengono uguali,
// e si prova che ogni nome che il client produce il server lo accetta (revisione del bugfixer, REV-TITOLO-01/02b).
import assert from 'node:assert/strict';
import test from 'node:test';
import { contaGrafemi, titoloBreve, TITOLO_MASSIMO } from '../src/titolo-breve.mjs';
import { nomeConSuffisso, titoloDalPrimoMessaggio } from '../frontend/src/components/session-item.js';

const CASI = [
  '', 'ciao!', '  ciao!\n\n  come   stai?  ', 'x'.repeat(80), 'x'.repeat(81), 'x'.repeat(200),
  'ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se ha senso proseguire',
  `${'parola '.repeat(20)}fine`, `${'abc '.repeat(15)}fine, ${'x'.repeat(40)}`,
  `ab ${'🚀'.repeat(50)}`, `${'x'.repeat(10)}${'🚀'.repeat(100)}`, `${'parola '.repeat(11)}${'👨‍👩‍👧‍👦'.repeat(30)}`,
  `${'z'.repeat(77)}🇮🇹🇮🇹🇮🇹🇮🇹`, '日本語のテキストはスペースなしで続きます'.repeat(6), `parola\u3000parola\u00a0parola\u2009${'y'.repeat(90)}`,
];

test('TITOLO-PARITA-01 — server e client danno lo STESSO nome corto, su ogni caso e con ogni riserva', () => {
  for (const caso of CASI) {
    for (const riserva of [0, 2, 3]) {
      assert.equal(titoloDalPrimoMessaggio(caso, 80, { riserva }), titoloBreve(caso, 80, { riserva }), JSON.stringify({ caso: caso.slice(0, 30), riserva }));
    }
  }
});

test('TITOLO-PARITA-02 — ogni nome del client, anche coi suffissi dei doppioni, sta nel tetto che il server conta (grafemi)', () => {
  for (const caso of CASI) {
    const base = titoloDalPrimoMessaggio(caso);
    for (const nome of [base, nomeConSuffisso(base, '-2'), nomeConSuffisso(base, '-12')]) {
      assert.ok(contaGrafemi(nome) <= TITOLO_MASSIMO, `${contaGrafemi(nome)} grafemi: ${nome.slice(-20)}`);
      assert.doesNotMatch(nome, /…-\d+$/u, 'il suffisso va prima dei puntini');
    }
  }
});

test('TITOLO-PARITA-03 — AL CONTRARIO: un\'emoji composta conta 1 e al confine non si spezza (né famiglia né bandiera)', () => {
  assert.equal(contaGrafemi('👨‍👩‍👧‍👦'), 1);
  assert.equal(contaGrafemi('🇮🇹'), 1);
  const titolo = titoloBreve(`${'z'.repeat(77)}🇮🇹🇮🇹🇮🇹🇮🇹`);
  assert.ok(titolo.endsWith('🇮🇹…') || titolo.endsWith('z…'), titolo.slice(-6));
});

test('TITOLO-PARITA-04 — il nome derivato dal compito segue la regola anche quando un altro host (CLI, API) passa una consegnaCorta lunga sua', async () => {
  const { nomeDerivatoDalCompito } = await import('../src/session-registry.mjs');
  const lunga = 'ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se ha senso proseguire';
  assert.equal(nomeDerivatoDalCompito('libero:x', { consegnaCorta: lunga }), titoloBreve(lunga));
  assert.equal(nomeDerivatoDalCompito('libero:x', { consegnaCorta: 'corta' }), 'corta');
  assert.equal(nomeDerivatoDalCompito('corpus:x', { consegnaCorta: lunga }), null, 'AL CONTRARIO: un compito non libero non deriva un nome');
});
