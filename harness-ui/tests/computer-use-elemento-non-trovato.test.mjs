/**
 * 0.2.1-CU, second round (three adversarial reviews of 09/11/2026: CLI M1/M2/M6, Performance MA/MB/MC and R1, Phone MT2-MT6).
 * «press» or «select» on an element that is not on the screen goes back to the model (S7), and it must NOT become a way to burn the
 * whole step budget: two in a row close the task, three in one task close it even with successful steps in between, and a blind
 * coordinate click that left the screen as it was does not wipe the failures in a row.
 * Hermes caps the same loop by counting calls, not by trusting the last result (tools/computer_use/tool.py:521-563, `escalate`);
 * sources read on 09/11/2026: agentpatterns.ai/loop-engineering/stuck-loop-recovery, learn.microsoft.com Copilot Studio computer use
 * troubleshooting («stuck» = flat progress, 2-3 retries at most). Fake ports only: no helper, no screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito, EVENTI, SUGGERIMENTI, LIMITI_PREDEFINITI } from '../src/computer-use/ciclo.mjs';
import { POLITICHE } from '../src/computer-use/protezioni.mjs';

const schermo = (over = {}) => ({ frenoArmato: true, app: 'blocco note', titolo: 'Senza titolo', elementi: [{ ref: 'b1', ruolo: 'pulsante', nome: 'Avanti' }, { ref: 'c1', ruolo: 'campo', nome: 'Nome' }], ...over });
const FANTASMA = { tipo: 'premi', ref: 'e9' }; // not on the screen
const VERO = { tipo: 'premi', ref: 'b1' };
const BUIO = { tipo: 'clic', x: 5, y: 5 }; // a coordinate click with no element under the point
const SEMPRE = (lotto) => Array.from({ length: 40 }, (_, k) => ({ azioni: lotto(k) }));

/** Fake ports. `risposte`: what the model says, in order (then «done»). Every request, capture and executed action is counted. */
function porte({ risposte = [], guarda = () => schermo(), agisci = () => ({ esito: 'non-verificabile', modo: 'sottofondo' }), ...altro } = {}) {
  let t = 0; let k = 0;
  const p = { eventi: [], eseguite: [], domande: [], richieste: 0, catture: 0, storie: [] };
  p.porte = {
    guarda: async () => { p.catture += 1; return guarda(p); },
    chiedi: async ({ storia }) => { p.richieste += 1; p.storie.push(storia); return k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }; },
    agisci: async (azione, bersaglio) => { p.eseguite.push(azione.tipo); return agisci(azione, bersaglio, p); },
    bersaglio: (azione, s) => (azione.ref ? s.elementi.find((e) => e.ref === azione.ref) ?? null : null),
    chiediPersona: async (q) => { p.domande.push(q); return 'si'; },
    attendi: async () => {}, // the cursor flight before a click: no real waiting here
    emetti: (nome, dati) => p.eventi.push({ nome, dati }),
    adesso: () => { t += 10; return t; },
    ...altro,
  };
  return p;
}
const corsa = async (p, politica = POLITICHE.pcAccessoPieno, limiti) => {
  const r = await eseguiCompito({ testoDellaPersona: 'apri la pagina', politica, porte: p.porte, ...(limiti ? { limiti } : {}) });
  const fine = p.eventi.find((e) => e.nome === EVENTI.esito || e.nome === EVENTI.fermato)?.dati ?? {};
  const nonTrovati = p.eventi.filter((e) => e.nome === EVENTI.passo && e.dati.motivo === 'elemento-non-trovato').length;
  return { r, fine, nonTrovati };
};
const POLITICHE_PROVATE = ['pcAccessoPieno', 'pcNormale', 'pcConsentiSempre', 'telefono', 'telefonoAccessoPieno'];

test('ENT-1 (CLI M1, Performance MA and MC, Phone MT3 and MT4): two «press» in a row on a missing element close at 2 steps, 2 model requests, 0 actions; same on every policy', async () => {
  for (const nome of POLITICHE_PROVATE) {
    const p = porte({ risposte: SEMPRE(() => [FANTASMA]) });
    const { r, fine, nonTrovati } = await corsa(p, POLITICHE[nome]);
    assert.deepEqual([r.esito, r.motivo, r.passi], ['non-riuscito', 'errori-di-fila', 2], nome);
    assert.deepEqual([p.richieste, fine.richieste, p.eseguite.length, fine.azioni, nonTrovati], [2, 2, 0, 0, 2], nome);
    // the first one went back to the model with reason and hint, on one line
    assert.ok(p.storie[1].some((riga) => riga.includes('→ non-eseguita (elemento-non-trovato)') && riga.includes(SUGGERIMENTI.elementoNonTrovato)), `${nome}: ${JSON.stringify(p.storie[1])}`);
  }
  // «select» takes the same road
  const q = porte({ risposte: SEMPRE(() => [{ tipo: 'scegli', ref: 'e9', valore: 'x' }]) });
  const s = await corsa(q);
  assert.deepEqual([s.r.motivo, s.r.passi, q.richieste, q.eseguite.length], ['errori-di-fila', 2, 2, 0]);
  // exactly at the limit, not one later: with a limit of 3 in a row the task closes at 3
  const tre = porte({ risposte: SEMPRE(() => [FANTASMA]) });
  const t = await corsa(tre, POLITICHE.pcAccessoPieno, { fallimentiDiFila: 3, elementiNonTrovati: 9 });
  assert.deepEqual([t.r.motivo, t.r.passi, tre.richieste], ['errori-di-fila', 3, 3]);
});

test('ENT-2 (CLI M2 and M6, Performance MB, Phone MT5): in a batch the actions after the missing element do NOT start and are written as not done', async () => {
  for (const nome of POLITICHE_PROVATE) {
    for (const seconda of [{ tipo: 'scrivi', ref: 'c1', testo: 'ciao' }, VERO]) {
      const p = porte({ risposte: [{ azioni: [FANTASMA, seconda] }, { fine: { riuscito: true } }] });
      const { r } = await corsa(p, POLITICHE[nome]);
      assert.equal(r.esito, 'riuscito', `${nome}: ${r.motivo}`);
      assert.deepEqual(p.eseguite, [], `${nome}: the action after the missing element started`);
      assert.ok(r.storia.includes(`passo 1: ${seconda.tipo} → non-eseguita`), `${nome}: ${JSON.stringify(r.storia)}`);
      assert.equal(p.catture, 2, `${nome}: one capture per model request, none for the actions that did not start`);
    }
  }
});

test('ENT-3 (Phone MT6; round 3, point 5): «keys» with NO ref, «type» with no ref and «drag» with a missing target do NOT take the S7 road: nothing goes back as «element not found», the task stops as before', async () => {
  // Round 3 (CLI, point 5): «type» and «keys» that NAME an element (`ref`) which is not on the screen DO take the S7 road now: see GAV-1
  // in computer-use-giri-a-vuoto.test.mjs. What stays here is what names no element (the host never sends «type» without ref).
  const casi = [{ tipo: 'scrivi', testo: 'ciao' }, { tipo: 'tasti', combinazione: 'enter' }, { tipo: 'trascina', ref: 'e9', a: { x: 5, y: 5 } }];
  // what the cycle did before this round, pinned: Full access and the phone stop at once; Normal asks, and two «no» close the task
  const ATTESO = { pcAccessoPieno: ['fermato', 'protezione:non-valutabile', 1, 1, 0, 0], telefono: ['fermato', 'protezione:non-valutabile', 1, 1, 0, 0],
    telefonoAccessoPieno: ['fermato', 'protezione:non-valutabile', 1, 1, 0, 0], pcNormale: ['fermato', 'rifiutata-dalla-persona', 2, 2, 0, 2] };
  for (const nome of Object.keys(ATTESO)) {
    for (const azione of casi) {
      const p = porte({ risposte: SEMPRE(() => [azione]) });
      p.porte.chiediPersona = async (q) => { p.domande.push(q); return 'no'; };
      const { r, nonTrovati } = await corsa(p, POLITICHE[nome]);
      const dove = `${nome} ${azione.tipo}`;
      assert.equal(nonTrovati, 0, dove);
      assert.ok(!r.storia.some((riga) => riga.includes(SUGGERIMENTI.elementoNonTrovato) || riga.includes('elemento-non-trovato')), `${dove}: ${JSON.stringify(r.storia)}`);
      assert.deepEqual([r.esito, r.motivo, r.passi, p.richieste, p.eseguite.length, p.domande.length], ATTESO[nome], dove);
      // «drag» is not in the phone vocabulary at all; everything else is «target missing»
      assert.equal(r.protezioni[0]?.prova, azione.tipo === 'trascina' && nome.startsWith('telefono') ? 'tipo-fuori-vocabolario' : 'bersaglio-mancante', dove);
    }
  }
});

test('ENT-4 (Phone MT2): on the phone a coordinate «click» is outside the vocabulary: the task stops at the first step, nothing is sent', async () => {
  for (const nome of ['telefono', 'telefonoAccessoPieno']) {
    const p = porte({ risposte: SEMPRE(() => [BUIO]) });
    const { r, nonTrovati } = await corsa(p, POLITICHE[nome]);
    assert.deepEqual([r.esito, r.motivo, r.passi, p.eseguite.length, nonTrovati], ['fermato', 'protezione:non-valutabile', 1, 0, 0], nome);
    assert.deepEqual([r.protezioni[0]?.prova, p.domande.length], ['tipo-fuori-vocabolario', 0], nome);
  }
});

test('ENT-5 (Performance R1, part b): a blind click that left the screen as it was does not wipe the failures in a row: blind click / missing element closes at 4 steps, not at the step limit', async () => {
  const p = porte({ risposte: SEMPRE((k) => [k % 2 ? FANTASMA : BUIO]) });
  const { r, fine } = await corsa(p);
  assert.deepEqual([r.esito, r.motivo, r.passi], ['non-riuscito', 'errori-di-fila', 4]);
  assert.deepEqual([p.richieste, fine.richieste, p.eseguite], [4, 4, ['clic', 'clic']]);
  // same thing inside one batch: [blind click, missing element] twice ⇒ closed at 2 steps
  const q = porte({ risposte: SEMPRE(() => [BUIO, FANTASMA]) });
  const s = await corsa(q);
  assert.deepEqual([s.r.motivo, s.r.passi, q.richieste], ['errori-di-fila', 2, 2]);
  // the screenshot alone is enough to say «unchanged» when the tree is empty (the owner's desktop: «albero null»)
  const vuoto = porte({ risposte: SEMPRE((k) => [k % 2 ? FANTASMA : BUIO]), guarda: () => schermo({ elementi: [], impronta: 'aa' }) });
  assert.deepEqual([(await corsa(vuoto)).r.passi, vuoto.richieste], [4, 4]);
});

test('ENT-6 (part b, the other way round): a blind click that CHANGED the screen is a real success and resets the failures in a row; the per-task counter then closes at the third miss', async () => {
  for (const cambia of ['titolo', 'app', 'dominio', 'impronta', 'elementi', 'valore']) {
    const guarda = (p) => {
      const k = p.eseguite.length;
      if (cambia === 'titolo') return schermo({ titolo: `Pagina ${k}` });
      if (cambia === 'app') return schermo({ app: `app ${k}` });
      if (cambia === 'dominio') return schermo({ dominio: `sito${k}.example` });
      if (cambia === 'impronta') return schermo({ elementi: [], impronta: `h${k}` });
      if (cambia === 'elementi') return schermo({ elementi: [{ ref: 'b1', ruolo: 'pulsante', nome: `Avanti ${k}` }] });
      return schermo({ elementi: [{ ref: 'c1', ruolo: 'campo', nome: 'Nome', valore: `v${k}` }] });
    };
    const p = porte({ risposte: SEMPRE((k) => [k % 2 ? FANTASMA : BUIO]), guarda });
    const { r, fine, nonTrovati } = await corsa(p);
    assert.deepEqual([r.esito, r.motivo, r.passi], ['non-riuscito', 'elemento-non-trovato', 6], cambia);
    assert.deepEqual([p.richieste, fine.richieste, p.eseguite.length, nonTrovati], [6, 6, 3, 3], cambia);
  }
});

test('ENT-7 (Performance R1, part a): the third «element not found» of a task closes it even with successful steps in between; two do not; the limit is a setting', async () => {
  assert.equal(LIMITI_PREDEFINITI.elementiNonTrovati, 3);
  const p = porte({ risposte: SEMPRE((k) => [k % 2 ? FANTASMA : VERO]), agisci: () => ({ esito: 'confermata' }) });
  const { r, fine, nonTrovati } = await corsa(p);
  assert.deepEqual([r.esito, r.motivo, r.passi], ['non-riuscito', 'elemento-non-trovato', 6]);
  assert.deepEqual([p.richieste, fine.richieste, p.eseguite.length, nonTrovati], [6, 6, 3, 3]);
  assert.ok(r.storia.at(-1).includes(SUGGERIMENTI.elementoNonTrovato), 'the last line still says why');
  // a healthy task that meets it twice and then finishes is NOT closed
  const sano = porte({ risposte: [{ azioni: [FANTASMA] }, { azioni: [VERO] }, { azioni: [FANTASMA] }, { azioni: [VERO] }, { fine: { riuscito: true } }], agisci: () => ({ esito: 'confermata' }) });
  const s = await corsa(sano);
  assert.deepEqual([s.r.esito, s.r.motivo, s.r.passi, sano.eseguite.length, s.nonTrovati], ['riuscito', 'completato', 5, 2, 2]);
  // the limit comes from `limiti`
  const cinque = porte({ risposte: SEMPRE((k) => [k % 2 ? FANTASMA : VERO]), agisci: () => ({ esito: 'confermata' }) });
  const c = await corsa(cinque, POLITICHE.pcAccessoPieno, { elementiNonTrovati: 5 });
  assert.deepEqual([c.r.motivo, c.r.passi, c.nonTrovati], ['elemento-non-trovato', 10, 5]);
  // on the phone the same counter (the cycle is one)
  const tel = porte({ risposte: SEMPRE((k) => [k % 2 ? FANTASMA : VERO]), agisci: () => ({ esito: 'confermata' }) });
  const t = await corsa(tel, POLITICHE.telefono);
  assert.deepEqual([t.r.motivo, t.r.passi], ['elemento-non-trovato', 6]);
});

test('ENT-8: what must NOT close a task: blind clicks alone are not failures, and a real success after a blind click resets the failures in a row', async () => {
  const soli = porte({ risposte: [{ azioni: [BUIO] }, { azioni: [BUIO] }, { azioni: [BUIO] }, { azioni: [BUIO] }, { fine: { riuscito: true } }] });
  const a = await corsa(soli);
  assert.deepEqual([a.r.esito, a.r.passi, soli.eseguite.length], ['riuscito', 5, 4]);
  for (const riga of a.r.storia) assert.ok(riga.includes(SUGGERIMENTI.clicAlBuio) && riga.includes('→ non-verificabile'), riga);
  // missing element, blind click (screen as before), REAL press, missing element, done ⇒ succeeded: the press in the middle reset the count
  const misto = porte({ risposte: [{ azioni: [FANTASMA] }, { azioni: [BUIO] }, { azioni: [VERO] }, { azioni: [FANTASMA] }, { fine: { riuscito: true } }] });
  const b = await corsa(misto);
  assert.deepEqual([b.r.esito, b.r.motivo, b.r.passi, misto.eseguite], ['riuscito', 'completato', 5, ['clic', 'premi']]);
  // a blind click judged against the screen read BEFORE it, not against an older one: changed, blind click, unchanged ⇒ still 1 failure
  let titolo = 'A';
  const fresco = porte({ risposte: [{ azioni: [FANTASMA] }, { azioni: [VERO] }, { azioni: [FANTASMA] }, { azioni: [BUIO] }, { azioni: [FANTASMA] }],
    guarda: () => schermo({ titolo }), agisci: (azione) => { if (azione.tipo === 'premi') titolo = 'B'; return { esito: 'confermata' }; } });
  const c = await corsa(fresco);
  assert.deepEqual([c.r.esito, c.r.motivo, c.r.passi], ['non-riuscito', 'errori-di-fila', 5]);
});

test('ENT-10 (part b): only the FIRST capture after a blind click is compared with the one before it: a screen that changes later on its own does not wipe the failures in a row', async () => {
  // missing element (1 failure), blind click on screen A, capture A again (no reset), missing element (2), the screen turns into B by
  // itself, missing element (3) ⇒ closed for failures in a row at step 4. With the comparison still armed, B would have reset the count.
  const p = porte({ risposte: [{ azioni: [FANTASMA] }, { azioni: [BUIO] }, { azioni: [FANTASMA] }, { azioni: [FANTASMA] }, { fine: { riuscito: true } }],
    guarda: (q) => schermo({ titolo: q.richieste >= 3 ? 'B' : 'A' }) });
  const { r, nonTrovati } = await corsa(p, POLITICHE.pcAccessoPieno, { fallimentiDiFila: 3, elementiNonTrovati: 9 });
  assert.deepEqual([r.esito, r.motivo, r.passi], ['non-riuscito', 'errori-di-fila', 4]);
  assert.deepEqual([p.richieste, p.eseguite, nonTrovati], [4, ['clic'], 3]);
});

test('ENT-9 (Phone D1): the actions beyond the batch limit are ONE line too, however many the model sends: ten kinds at most, then «…»', async () => {
  const ASPETTA = { tipo: 'aspetta', secondi: 1 };
  const alterni = (n) => Array.from({ length: n }, (_, k) => (k % 2 ? VERO : ASPETTA));
  // 10 waits (the batch), then 12 more alternating: 12 kinds ⇒ the line stops at ten and says there is more
  const lungo = porte({ risposte: [{ azioni: [...Array(10).fill(ASPETTA), ...alterni(12)] }, { fine: { riuscito: true } }] });
  const a = await corsa(lungo);
  assert.equal(a.r.storia[0], 'passo 1: azioni 11-22 del lotto (aspetta, premi, aspetta, premi, aspetta, premi, aspetta, premi, aspetta, premi, …) → non-eseguita');
  assert.equal(a.r.storia.filter((riga) => riga.includes('del lotto')).length, 1, a.r.storia.join(' | '));
  // exactly ten kinds: all of them, no «…»
  const dieci = porte({ risposte: [{ azioni: [...Array(10).fill(ASPETTA), ...alterni(10)] }, { fine: { riuscito: true } }] });
  const b = await corsa(dieci);
  assert.equal(b.r.storia[0], 'passo 1: azioni 11-20 del lotto (aspetta, premi, aspetta, premi, aspetta, premi, aspetta, premi, aspetta, premi) → non-eseguita');
  // 500 equal actions beyond the limit stay a short line
  const tante = porte({ risposte: [{ azioni: [...Array(10).fill(ASPETTA), ...Array(500).fill(VERO)] }, { fine: { riuscito: true } }] });
  const t = await corsa(tante);
  assert.equal(t.r.storia[0], 'passo 1: azioni 11-510 del lotto (premi ×500) → non-eseguita');
});
