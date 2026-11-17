/**
 * 0.2.2-CU, sends in a batch (owner 11/11/2026 10:57 «Sì, si cura», judge v1437-v1438) after the reviewer of the last round.
 * - B1: the yes given to the single question of a batch covers EXACTLY the sends it listed: each item once, bound to its target
 *   (window, button, recipient). 40 sends in batches of 10 asked ONE question (each item became a remembered yes with 3 more uses);
 *   now 4 questions. A send that matches no item, or an item already used, asks again; a batch whose recipient changes after the
 *   yes asks again for the changed send.
 * - B2: blind and targeted sends, or Ctrl+Enter and «Invia», on the same window to the same recipient are ONE yes with one cap:
 *   5 cards for 20 (6 before: a card asked right after a yes for the same send).
 * - B3: the same address written in other forms (capitals, spaces, «;», «Name <address>») is the same recipient; «Destinatario»
 *   (singular) and «A destinatari» are recipient fields.
 * - B4: guards for the reviewer's alive mutants: K5-09 (a «Loading n%» bar after a useless press), X6 (the chosen value of a select
 *   is progress, like a written text).
 * Fake ports only. Like the approval bound to the exact call (one execution, re-checked at dispatch): Codex stores the decision
 * for each key individually (codex-rs/core/src/tools/sandboxing.rs:69-71); DeepSeek only has one-shot grants
 * (packages/interaction/user-approval/README.md:155).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito } from '../src/computer-use/ciclo.mjs';
import { POLITICHE } from '../src/computer-use/protezioni.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO } = POLITICHE;
const BUIO = { tipo: 'clic', x: 5, y: 5 };
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });

function porte({ risposte, guarda, agisci = () => ({ esito: 'non-verificabile', modo: 'sottofondo' }) }) {
  const p = { eseguite: [], domande: [], richieste: 0, catture: 0, ora: 0 };
  p.porte = {
    guarda: async () => { p.catture += 1; return guarda(p); },
    chiedi: async () => { p.richieste += 1; return risposte(p) ?? { fine: { riuscito: true } }; },
    agisci: async (azione, bersaglio) => { const r = await agisci(azione, bersaglio, p); p.eseguite.push(azione.tipo); return r; },
    bersaglio: (azione, s) => (azione.ref != null && azione.ref !== '' ? s.elementi.find((e) => e.ref === azione.ref) ?? null : null),
    chiediPersona: async (q) => { p.domande.push({ ...q, primaDellInvio: p.eseguite.length + 1 }); return 'si'; },
    attendi: async () => {}, emetti: () => {}, adesso: () => { p.ora += 10; return p.ora; },
  };
  return p;
}
const carte = (p) => p.domande.filter((q) => q.motivo === 'conferma');
const domandeDiLotto = (p) => p.domande.filter((q) => q.motivo === 'conferme');
const POSTA = ['marco@esempio.it', 'banca@esempio.it', 'capo@esempio.it', 'tutti@esempio.it', 'lista@esempio.it', 'giulia@esempio.it'];
const bozza = ({ a = POSTA[0], nomeA = 'A' } = {}) => ({ frenoArmato: true, app: 'outlook', titolo: 'Posta', elementi: [
  el('h', 'intestazione', 'Nuovo messaggio'), el('a', 'campo', nomeA, { valore: a }), el('m', 'campo', 'Messaggio', { valore: 'ciao' }), el('inv', 'pulsante', 'Invia')] });
const dialogo = ({ a = POSTA[0] } = {}) => ({ frenoArmato: true, app: 'outlook', titolo: 'Posta', elementi: [el('h', 'intestazione', 'Marco'), el('a', 'campo', 'A', { valore: a }),
  el('w', 'finestra', 'Invia', { modale: true }), el('t', 'testo', 'Inviare il messaggio senza oggetto?', { finestra: 'w' }),
  el('b1', 'pulsante', 'Invia', { finestra: 'w' }), el('b2', 'pulsante', 'Annulla', { finestra: 'w' })] });
const lotti = (quanti, grandezza, azione) => { let k = 0; return () => (++k <= quanti ? { azioni: Array.from({ length: grandezza }, () => ({ ...azione })) } : null); };

// ------------------------------------------------ B1 the yes of a batch covers exactly its items ------------------------------------------------
test('B1: 40 sends in batches of 10: 4 questions, each listing 10 sends, and no send outside them', async () => {
  const p = porte({ risposte: lotti(4, 10, { tipo: 'premi', ref: 'inv' }), guarda: () => bozza() });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
  assert.deepEqual([domandeDiLotto(p).length, carte(p).length, p.eseguite.length], [4, 0, 40]);
  assert.ok(domandeDiLotto(p).every((q) => q.voci.length === 10));
});

test('B1: a batch of 10 sends approved, then single sends on the same window: each asks again (the items were used)', async () => {
  let k = 0;
  const p = porte({ risposte: () => { k += 1; if (k === 1) return { azioni: Array.from({ length: 10 }, () => ({ tipo: 'premi', ref: 'inv' })) }; return k <= 5 ? { azioni: [{ tipo: 'premi', ref: 'inv' }] } : null; },
    guarda: () => bozza() });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
  // the first single send asks a card; its yes covers the next 3 (the cap of a single yes)
  assert.deepEqual([domandeDiLotto(p).length, carte(p).length, p.eseguite.length], [1, 1, 14]);
});

test('B1: batches of 2 and of 1: each batch of 2 asks its question, single sends keep the cap (5 cards for 20)', async () => {
  const due = porte({ risposte: lotti(10, 2, { tipo: 'premi', ref: 'inv' }), guarda: () => bozza() });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: due.porte });
  assert.deepEqual([domandeDiLotto(due).length, carte(due).length, due.eseguite.length], [10, 0, 20]);
  const uno = porte({ risposte: lotti(20, 1, { tipo: 'premi', ref: 'inv' }), guarda: () => bozza() });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: uno.porte });
  assert.deepEqual([domandeDiLotto(uno).length, carte(uno).length, uno.eseguite.length], [0, 5, 20]);
});

test('B1: the batch changes after the yes: the second send goes to another address, it asks its own card', async () => {
  const p = porte({ risposte: lotti(1, 2, { tipo: 'premi', ref: 'inv' }), guarda: (q) => bozza({ a: POSTA[Math.min(q.eseguite.length, 5)] }) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
  assert.deepEqual([domandeDiLotto(p).length, carte(p).length, p.eseguite.length], [1, 1, 2]);
});

test('B1: Full access is untouched: 40 sends in batches of 10 ask nothing', async () => {
  const p = porte({ risposte: lotti(4, 10, { tipo: 'premi', ref: 'inv' }), guarda: () => bozza() });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: PIENO, porte: p.porte });
  assert.deepEqual([domandeDiLotto(p).length, carte(p).length, p.eseguite.length], [0, 0, 40]);
});

// ------------------------------------------------ B2 mixed sends share one yes ------------------------------------------------
test('B2: blind and targeted clicks on the same window share one yes, one cap, 5 cards for 20; Ctrl+Enter in the message and «Invia» each their own (6)', async () => {
  const misto = porte({ risposte: (() => { let k = 0; return () => (++k <= 20 ? { azioni: [k % 2 ? BUIO : { tipo: 'clic', ref: 'b1' }] } : null); })(), guarda: () => dialogo() });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: misto.porte });
  assert.deepEqual([carte(misto).length, misto.eseguite.length], [5, 20]);
  // the cards before sends 1, 5, 9, 13, 17: the blind clicks count the targeted uses of the same yes
  assert.deepEqual(carte(misto).map((q) => q.primaDellInvio), [1, 5, 9, 13, 17]);
  const tasti = porte({ risposte: (() => { let k = 0; return () => (++k <= 20 ? { azioni: [k % 2 ? { tipo: 'tasti', combinazione: 'ctrl+enter', ref: 'm' } : { tipo: 'premi', ref: 'inv' }] } : null); })(), guarda: () => bozza() });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: tasti.porte });
  // second round (reviewer B, R1 and 5j): Ctrl+Enter in the message field covers only that field, «Invia» only its button: two yeses,
  // each with its own cap of 3 more uses, so 10 + 10 sends ask 3 + 3 cards (one yes shared both before: 5)
  assert.deepEqual([carte(tasti).length, tasti.eseguite.length], [6, 20]);
});

// ------------------------------------------------ B3 the recipient ------------------------------------------------
test('B3: the same address written in four forms is one recipient: 4 sends, 1 card', async () => {
  const forme = ['marco@esempio.it', 'Marco@Esempio.IT', ' marco@esempio.it; ', 'Marco Rossi <marco@esempio.it>'];
  const p = porte({ risposte: (() => { let k = 0; return () => (++k <= 4 ? { azioni: [{ tipo: 'premi', ref: 'inv' }] } : null); })(), guarda: (q) => bozza({ a: forme[Math.min(q.eseguite.length, 3)] }) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
  assert.deepEqual([carte(p).length, p.eseguite.length], [1, 4]);
});

test('B3: «Destinatario» (singular) and «A destinatari» are recipient fields: six addresses, six cards', async () => {
  for (const nomeA of ['Destinatario', 'A destinatari']) {
    const p = porte({ risposte: (() => { let k = 0; return () => (++k <= 6 ? { azioni: [{ tipo: 'premi', ref: 'inv' }] } : null); })(), guarda: (q) => bozza({ nomeA, a: POSTA[Math.min(q.eseguite.length, 5)] }) });
    await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
    assert.deepEqual([carte(p).length, p.eseguite.length], [6, 6], nomeA);
  }
});

// ------------------------------------------------ B4 guards for the alive mutants ------------------------------------------------
test('B4 (K5-09): «Load more» pressed twice per batch loads nothing, a «Loading n%» bar shows only right after the press: closed early', async () => {
  for (const ruolo of ['barra', 'immagine', 'pulsante']) {
    const st = { premuto: -1, n: 0 };
    const p = porte({ risposte: () => ({ azioni: [{ tipo: 'premi', ref: 'e9' }, { tipo: 'premi', ref: 'e9' }] }),
      guarda: (q) => ({ frenoArmato: true, app: 'chrome', dominio: 'sito.example', titolo: 'Lista', elementi: [el('x', 'testo', 'Risultati 1-20'), el('l', 'voce', 'Riga 1'),
        ...(q.catture === st.premuto + 1 ? [el('b', ruolo, `Caricamento ${st.n * 10}%`)] : [el('e9', 'pulsante', 'Carica altri')])] }),
      agisci: (a, b, q) => { st.premuto = q.catture; st.n += 1; return { esito: 'non-verificabile', modo: 'sottofondo' }; } });
    const r = await eseguiCompito({ testoDellaPersona: 'carica tutto', politica: PIENO, porte: p.porte });
    assert.deepEqual([r.esito, r.motivo, p.richieste], ['non-riuscito', 'elemento-non-trovato', 4], ruolo);
  }
});

test('B4 (X6): choosing another size in the same list is progress, like another text: «Add» accepted at the 4th size', async () => {
  const st = { taglia: '', prove: 0, ok: false };
  const taglie = ['S', 'M', 'L', 'XL'];
  const p = porte({ risposte: () => (st.ok ? null : { azioni: [{ tipo: 'scegli', ref: 'tg', valore: taglie[Math.min(st.prove, 3)] }, { tipo: 'premi', ref: 'ag' }] }),
    guarda: () => ({ frenoArmato: true, app: 'chrome', dominio: 'negozio.example', titolo: 'Scarpe', elementi: [el('tg', 'scelta', 'Taglia', { valore: st.taglia }),
      el('ag', 'pulsante', 'Aggiungi'), el('x', 'testo', st.prove ? 'Taglia esaurita' : '')] }),
    agisci: (a, b) => { if (a.tipo === 'scegli') { st.taglia = a.valore; return { esito: 'non-verificabile' }; } if (b?.ref === 'ag') { st.prove += 1; if (st.prove < 4) return { esito: 'rifiutata', motivo: 'altro' }; st.ok = true; } return { esito: 'non-verificabile' }; } });
  const r = await eseguiCompito({ testoDellaPersona: 'aggiungi le scarpe nella prima taglia disponibile', politica: PIENO, porte: p.porte });
  assert.deepEqual([r.esito, st.ok], ['riuscito', true]);
});

test('B4 (X9): a reader that writes a note on every page, then [Next, Next], «Next» back one capture later: all 16 pages (the texts count for «Next», the element just pressed)', async () => {
  const st = { pag: 0, via: -1 };
  const p = porte({ risposte: () => (st.pag >= 16 ? null : { azioni: [{ tipo: 'scrivi', ref: 'n', testo: `nota ${st.pag}` }, { tipo: 'premi', ref: 'av' }, { tipo: 'premi', ref: 'av' }] }),
    guarda: (q) => ({ frenoArmato: true, app: 'lettore', titolo: 'Libro', elementi: [el('t', 'testo', `Pagina ${st.pag}: testo del capitolo ${st.pag}`), el('n', 'campo', 'Nota'),
      ...(q.catture > st.via ? [el('av', 'pulsante', 'Avanti')] : [])] }),
    agisci: (azione, b, q) => { if (azione.tipo === 'premi') { st.pag += 1; st.via = q.catture + 1; } return { esito: 'non-verificabile' }; } });
  const r = await eseguiCompito({ testoDellaPersona: 'leggi il libro', politica: PIENO, porte: p.porte });
  assert.deepEqual([r.esito, r.motivo, st.pag], ['riuscito', 'completato', 16]);
});

test('B4 (the remembered yes keeps its reason outside sends): a yes to type a code does not cover a card number in the next field', async () => {
  const p = porte({ risposte: (() => { let k = 0; return () => { k += 1; if (k === 1) return { azioni: [{ tipo: 'scrivi', ref: 'cod', testo: '123456' }] };
    if (k === 2) return { azioni: [{ tipo: 'scrivi', ref: 'num', testo: '4111 1111 1111 1111' }] }; return null; }; })(),
  guarda: () => ({ frenoArmato: true, app: 'chrome', dominio: 'banca.example', titolo: 'Verifica', elementi: [el('cod', 'campo', 'Codice di verifica'), el('num', 'campo', 'Note')] }) });
  await eseguiCompito({ testoDellaPersona: 'completa la verifica', politica: NORMALE, porte: p.porte });
  assert.deepEqual([carte(p).length, p.eseguite.length], [2, 2]);
});
