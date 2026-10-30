/*
 * Owner 29/10/2026 sera — lo Stop coi sotto-agenti (contratto `CONTRATTO-FERMA-TUTTE-2026-10-29.md`). Va in `frontend/tests/unit/`
 * così com'è: prova la decisione (quando chiedere, cosa mandare) e le voci del menu nelle due lingue. Il percorso d'import qui sotto è
 * quello del kit; nell'app diventa `../../src/components/menu-stop.js`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { impostaLingua } from '../../src/components/lingua.js';
import { decidiStop, sceltaStop, vociMenuStop, SCELTE_STOP } from '../../src/components/menu-stop.js';

test('MENU-STOP-01 senza agenti vivi lo Stop è immediato e manda il corpo di oggi, qualunque sia la preferenza', () => {
  for (const preferenza of [...SCELTE_STOP, undefined, 'storta']) {
    for (const agentiVivi of [0, -1, 1.5, '3', null, undefined]) {
      assert.deepEqual(decidiStop({ agentiVivi, preferenza }), { chiedi: false, figlie: null }, `${preferenza} ${agentiVivi}`);
    }
  }
});

test('MENU-STOP-02 con agenti vivi: «chiedi» apre il menu; la scelta ricordata manda subito «tutte» o «nessuna»', () => {
  assert.deepEqual(decidiStop({ agentiVivi: 3, preferenza: 'chiedi' }), { chiedi: true, figlie: null });
  assert.deepEqual(decidiStop({ agentiVivi: 3 }), { chiedi: true, figlie: null }, 'di serie si chiede');
  assert.deepEqual(decidiStop({ agentiVivi: 3, preferenza: 'tutte' }), { chiedi: false, figlie: 'tutte' });
  assert.deepEqual(decidiStop({ agentiVivi: 1, preferenza: 'solo-chat' }), { chiedi: false, figlie: 'nessuna' });
  assert.equal(sceltaStop('qualcosa'), 'chiedi', 'una preferenza storta vale «chiedi», mai una scelta che ferma');
});

test('MENU-STOP-03 le voci: «Ferma tutto» per prima, col numero giusto e il singolare; inglese prima, poi italiano', () => {
  impostaLingua('en');
  assert.deepEqual(vociMenuStop(3).map((v) => [v.figlie, v.testo, v.aiuto]), [
    ['tutte', 'Stop everything', 'The chat and 3 agents'],
    ['nessuna', 'Stop only the chat', 'The agents keep working; stop them from the Agents tab'],
  ]);
  assert.equal(vociMenuStop(1)[0].aiuto, 'The chat and 1 agent');
  impostaLingua('it');
  assert.deepEqual(vociMenuStop(2).map((v) => v.testo), ['Ferma tutto', 'Ferma solo la chat']);
  assert.equal(vociMenuStop(2)[0].aiuto, 'La chat e 2 agenti');
});
