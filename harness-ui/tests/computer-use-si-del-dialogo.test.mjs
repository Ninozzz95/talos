/**
 * 0.2.2-CU round 3 (judge v1314; reviews of 09/11/2026: CLI R1, Phone R1): the cycle after the person says «Allow».
 * Point 1: an action with NO target (a coordinate click on a point with no readable element, a key sent to the window) was dropped as
 *   «element gone» after every yes, because two missing targets were never «the same»: 20 cards, 0 clicks.
 * Point 2 (decision 375, never twenty cards for the same window): the yes given to a blind click is remembered for the other blind
 *   clicks while the SAME confirmation windows are on screen. «Same» is measured: same app or site, same window title, same titles
 *   and texts of the confirmation windows (`improntaDeiDialoghi`), same protection, reason and evidence. Never for a payment.
 * The other way round is pinned too: another window, a window closed and opened again, a suspicion born later, a pause, a payment,
 * a readable button all ask again.
 * Hermes gives an approval a scope key and a lifetime (tools/computer_use/tool.py:34 and :382-401); Codex asks again only when the
 * key of the action changes (codex-rs/core/src/tools/sandboxing.rs:66-97). Fake ports: no screen, no helper, no model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito, EVENTI } from '../src/computer-use/ciclo.mjs';
import { POLITICHE } from '../src/computer-use/protezioni.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO } = POLITICHE;
const TESTO = 'Eliminare definitivamente questo file? L\'azione non può essere annullata.';
/** a screen with one irreversible confirmation window; `over` changes the screen, `testo` and `titolo` the window */
const dialogo = ({ testo = TESTO, titolo = 'Elimina file', pulsanti = ['Elimina', 'Annulla'], ...over } = {}) => ({ frenoArmato: true, app: 'explorer', titolo: 'Download', elementi: [
  { ref: 'w', ruolo: 'finestra', nome: titolo, modale: true }, { ref: 't', ruolo: 'testo', nome: testo, finestra: 'w' },
  ...pulsanti.map((nome, k) => ({ ref: `b${k + 1}`, ruolo: 'pulsante', nome, finestra: 'w' }))], ...over });
const piano = (over = {}) => ({ frenoArmato: true, app: 'explorer', titolo: 'Download', elementi: [{ ref: 'v1', ruolo: 'voce', nome: 'relazione.docx' }], ...over });
const BUIO = { tipo: 'clic', x: 5, y: 5 }; // a coordinate click with no element under the point
const ASPETTA = { tipo: 'aspetta', secondi: 1 };
const uno = (...azioni) => ({ azioni });

/** Fake ports. `risposte`: what the model says, in order (then «done»). `carta`: what the person answers to a card. */
function porte({ risposte = [], guarda = () => dialogo(), agisci = () => ({ esito: 'non-verificabile', modo: 'sottofondo' }), carta = () => 'si', ...altro } = {}) {
  let t = 0; let k = 0;
  const p = { eventi: [], eseguite: [], domande: [], richieste: 0, catture: 0 };
  p.porte = {
    guarda: async () => { p.catture += 1; return guarda(p); },
    chiedi: async () => { p.richieste += 1; return k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }; },
    agisci: async (azione, bersaglio) => { p.eseguite.push(azione.tipo); return agisci(azione, bersaglio, p); },
    bersaglio: (azione, s) => (azione.ref ? s.elementi.find((e) => e.ref === azione.ref) ?? null : null),
    chiediPersona: async (q) => { p.domande.push(q); return carta(q, p); },
    attendi: async () => {},
    emetti: (nome, dati) => p.eventi.push({ nome, dati }),
    adesso: () => { t += 10; return t; },
    ...altro,
  };
  return p;
}
const corsa = async (p, politica = NORMALE, extra = {}) => eseguiCompito({ testoDellaPersona: 'riordina la cartella Download', politica, porte: p.porte, ...extra });
const carte = (p) => p.domande.filter((q) => q.motivo === 'conferma').length;

test('SID-1 (point 1, the reviewer\'s case): Normal, irreversible window, an action with no target, «Allow» ⇒ ONE card and the action STARTS', async () => {
  for (const azione of [BUIO, { tipo: 'tasti', combinazione: 's' }]) {
    const p = porte({ risposte: [uno(azione)] });
    const r = await corsa(p);
    assert.deepEqual([r.esito, carte(p), p.eseguite], ['riuscito', 1, [azione.tipo]], azione.tipo);
    assert.deepEqual(r.conferme, [{ passo: 1, protezione: 'cancellazione', azioni: [azione.tipo] }], azione.tipo);
    assert.ok(!r.storia.some((riga) => riga.includes('elemento-sparito')), JSON.stringify(r.storia));
    // the card says what the protections found: a deletion, with the text of the window as evidence (the evidence stays in the trace)
    assert.deepEqual([p.domande[0].protezione, p.domande[0].azione], ['cancellazione', azione.tipo]);
  }
  // Full access (decision 159): no card, the click goes and is marked
  const pieno = porte({ risposte: [uno(BUIO)] });
  const rp = await corsa(pieno, PIENO);
  assert.deepEqual([rp.esito, carte(pieno), pieno.eseguite, rp.protezioni[0]?.decisione], ['riuscito', 0, ['clic'], 'procedi-e-segna']);
  // «Don't allow» ⇒ nothing starts, and the second refusal of the same action closes the task
  const no = porte({ risposte: [uno(BUIO), uno(BUIO), uno(BUIO)], carta: () => 'no' });
  const rn = await corsa(no);
  assert.deepEqual([rn.esito, rn.motivo, carte(no), no.eseguite], ['fermato', 'rifiutata-dalla-persona', 2, []]);
});

test('SID-2 (point 2, decision 375): the same blind click repeated in front of the SAME window is ONE card, not twenty', async () => {
  // six model requests, one blind click each, the screen never changes. Round 4 (F2): a remembered yes covers at most 3 clicks after
  // the one of its card, so the fifth click asks again (before round 4: one card for any number of clicks)
  const sei = porte({ risposte: Array.from({ length: 6 }, () => uno(BUIO)) });
  const r = await corsa(sei);
  assert.deepEqual([r.esito, carte(sei), sei.eseguite.length], ['riuscito', 2, 6]);
  assert.deepEqual(r.conferme, [{ passo: 1, protezione: 'cancellazione', azioni: Array(4).fill('clic') }, { passo: 5, protezione: 'cancellazione', azioni: Array(2).fill('clic') }],
    'the outcome lists what was done under each yes');
  assert.equal(r.storia.filter((riga) => riga.includes('vale il sì del passo 1')).length, 3, JSON.stringify(r.storia));
  assert.deepEqual(r.decisioni.map((d) => d.fonte), ['si-carta', 'serie', 'serie', 'serie', 'si-carta', 'serie']);
  // a model that never stops: the task ends at the step limit with 5 cards for 20 clicks (round 3: 1; before round 3: 20 cards and 0 clicks)
  const sempre = porte({ risposte: Array.from({ length: 40 }, () => uno(BUIO)) });
  const rs = await corsa(sempre);
  assert.deepEqual([rs.esito, rs.motivo, carte(sempre), sempre.eseguite.length], ['fermato', 'tetto-passi', 5, 20]);
  // three blind clicks in one batch
  const lotto = porte({ risposte: [uno(BUIO, BUIO, BUIO)] });
  await corsa(lotto);
  assert.deepEqual([carte(lotto), lotto.eseguite], [1, ['clic', 'clic', 'clic']]);
  // the references of the elements change at every capture (the helper numbers them again): still the same window
  const numeri = porte({ risposte: [uno(BUIO), uno(BUIO), uno(BUIO)],
    guarda: (p) => { const s = dialogo(); return { ...s, elementi: s.elementi.map((e) => ({ ...e, ref: `${e.ref}-${p.catture}`, ...(e.finestra ? { finestra: `w-${p.catture}` } : {}) })) }; } });
  await corsa(numeri);
  assert.deepEqual([carte(numeri), numeri.eseguite.length], [1, 3]);
});

test('SID-3 (point 2, the other way round): another window, the same one closed and opened again, a suspicion, a pause ⇒ the card comes back', async () => {
  // what the screen shows after the first click has gone
  const DOPO = {
    'another text': () => dialogo({ testo: 'Eliminare definitivamente la cartella «Foto»? L\'azione non può essere annullata.' }),
    'another window title': () => dialogo({ titolo: 'Elimina cartella' }),
    'another app': () => dialogo({ app: 'outlook' }),
    'another title of the app window': () => ({ ...dialogo(), titolo: 'Documenti' }),
    'one more irreversible window': () => { const s = dialogo(); return { ...s, elementi: [...s.elementi, { ref: 'w2', ruolo: 'finestra', nome: 'Svuota cestino', modale: true },
      { ref: 't2', ruolo: 'testo', nome: 'Eliminare definitivamente 12 elementi?', finestra: 'w2' }] }; },
  };
  for (const [nome, dopo] of Object.entries(DOPO)) {
    const p = porte({ risposte: [uno(BUIO), uno(BUIO)], guarda: (q) => (q.eseguite.length === 0 ? dialogo() : dopo()) });
    await corsa(p);
    assert.deepEqual([carte(p), p.eseguite], [2, ['clic', 'clic']], nome);
  }
  // control: nothing changes ⇒ one card (the cases above differ from this one only in what the screen shows after the first click)
  const fermo = porte({ risposte: [uno(BUIO), uno(BUIO)] });
  await corsa(fermo);
  assert.deepEqual([carte(fermo), fermo.eseguite], [1, ['clic', 'clic']]);
  // the window closes (one capture without it) and the SAME window opens again: it is a new question
  const riaperta = porte({ risposte: [uno(BUIO), uno(ASPETTA), uno(BUIO)], guarda: (q) => (q.eseguite.length === 1 ? piano() : dialogo()) });
  await corsa(riaperta);
  assert.deepEqual([carte(riaperta), riaperta.eseguite], [2, ['clic', 'aspetta', 'clic']]);
  // a suspicion born after the yes: the yes was given on a clean screen
  const sospetta = porte({ risposte: [uno(BUIO), uno(BUIO)], guarda: (q) => (q.eseguite.length === 0 ? dialogo() : dialogo({ sospetto: 'istruzioni nella pagina' })) });
  const rs = await corsa(sospetta);
  assert.equal(carte(sospetta), 2, JSON.stringify(rs.storia));
  // a pause in between (screen locked, person away): no yes crosses it
  const pausa = porte({ risposte: [uno(BUIO), uno(BUIO)], guarda: (q) => (q.eseguite.length === 1 && !q.ripreso ? dialogo({ pausa: 'schermo-bloccato' }) : dialogo()) });
  pausa.porte.attendiRipresa = async () => { pausa.ripreso = true; return true; };
  await corsa(pausa);
  assert.deepEqual([carte(pausa), pausa.eseguite], [2, ['clic', 'clic']]);
  // the remembered yes is for blind clicks only: the readable «Elimina» button and a key sent to the window ask their own card
  for (const seconda of [{ tipo: 'premi', ref: 'b1' }, { tipo: 'tasti', combinazione: 's' }]) {
    const p = porte({ risposte: [uno(BUIO), uno(seconda)] });
    await corsa(p);
    assert.deepEqual([carte(p), p.eseguite], [2, ['clic', seconda.tipo]], seconda.tipo);
  }
  // and only a blind click opens it: the yes given to a key does not cover the blind click after it
  const tasto = porte({ risposte: [uno({ tipo: 'tasti', combinazione: 's' }), uno(BUIO)] });
  await corsa(tasto);
  assert.deepEqual([carte(tasto), tasto.eseguite], [2, ['tasti', 'clic']]);
  // with no confirmation window on screen there is no «same window» to recognise: whatever made the protections ask, they ask again
  const chiedeSempre = () => ({ decisione: 'chiedi', protezione: 'cancellazione', motivo: 'dialogo', prova: 'x' });
  const nuda = porte({ risposte: [uno(BUIO), uno(BUIO)], guarda: () => piano() });
  await corsa(nuda, NORMALE, { valuta: chiedeSempre });
  assert.deepEqual([carte(nuda), nuda.eseguite], [2, ['clic', 'clic']]);
  // the yes is for what the protections found, evidence included: same window, another evidence (or reason, or protection) ⇒ a new card
  for (const cambia of ['prova', 'motivo', 'protezione']) {
    let k = 0;
    const altra = () => { const v = { decisione: 'chiedi', protezione: 'cancellazione', motivo: 'dialogo', prova: 'x' }; if (k++ >= 2) v[cambia] = cambia === 'protezione' ? 'invio' : 'y'; return v; };
    const p = porte({ risposte: [uno(BUIO), uno(BUIO)] });
    await corsa(p, NORMALE, { valuta: altra });
    assert.deepEqual([carte(p), p.eseguite], [2, ['clic', 'clic']], cambia);
  }
  // a refusal is not remembered as a yes: the next blind click asks again
  let k = 0;
  const rifiuto = porte({ risposte: [uno(BUIO), uno(BUIO)], carta: () => (k++ === 0 ? 'no' : 'si') });
  await corsa(rifiuto);
  assert.deepEqual([carte(rifiuto), rifiuto.eseguite], [2, ['clic']]);
});

test('SID-4 (RC-02b in the cycle): with no target the yes is for THE window the card had in front; if it changes while the card is open the action does not start', async () => {
  const CAMBI = {
    'the text of the window changes': () => dialogo({ testo: 'Eliminare definitivamente la cartella «Foto»? L\'azione non può essere annullata.' }),
    'the window closes': () => piano(),
    'a second irreversible window opens': () => { const s = dialogo(); return { ...s, elementi: [...s.elementi, { ref: 'w2', ruolo: 'finestra', nome: 'Formatta disco', modale: true },
      { ref: 't2', ruolo: 'testo', nome: 'Tutti i dati verranno eliminati definitivamente.', finestra: 'w2' }] }; },
  };
  for (const azione of [BUIO, { tipo: 'tasti', combinazione: 's' }]) {
    for (const [nome, dopo] of Object.entries(CAMBI)) {
      const p = porte({ risposte: [uno(azione)], guarda: (q) => (q.domande.length === 0 ? dialogo() : dopo()) });
      const r = await corsa(p);
      assert.deepEqual([carte(p), p.eseguite], [1, []], `${azione.tipo}, ${nome}`);
      assert.ok(r.storia.some((riga) => riga.includes('→ non-eseguita (schermo-cambiato)')), `${azione.tipo}, ${nome}: ${JSON.stringify(r.storia)}`);
    }
  }
  // and nothing is remembered from a yes whose action never started: on the new window the card is asked again, then the click goes
  const p = porte({ risposte: [uno(BUIO), uno(BUIO)], guarda: (q) => (q.domande.length === 0 ? dialogo() : CAMBI['the text of the window changes']()) });
  await corsa(p);
  assert.deepEqual([carte(p), p.eseguite], [2, ['clic']]);
});

test('SID-5 (Phone: the same pattern at the other re-reads): after the person solves a captcha or turns a permission on, an action with no target starts', async () => {
  // anti-robot: the person solves it, the screen is read again, the blind click goes (before: «element gone»)
  let risolto = false;
  const robot = porte({ risposte: [uno(BUIO)], carta: () => { risolto = true; return 'fatto'; },
    guarda: () => piano({ elementi: [...(risolto ? [] : [{ ref: 'cap', ruolo: 'casella', nome: 'Non sono un robot' }]), { ref: 'v1', ruolo: 'voce', nome: 'relazione.docx' }] }) });
  const r = await corsa(robot);
  assert.deepEqual([r.esito, robot.domande.map((q) => q.motivo), robot.eseguite], ['riuscito', ['anti-robot'], ['clic']]);
  // the other way round: an action that NAMES an element which is not there has no «same target» after the wait. It stays «element
  // gone» and goes back to the model as before: no «cannot check» card in Normal, no stop in Full access
  for (const [politica, assente] of [[NORMALE, { tipo: 'premi', ref: 'e9' }], [PIENO, { tipo: 'premi', ref: 'e9' }], [NORMALE, { tipo: 'scrivi', ref: 'e9', testo: 'x' }],
    [NORMALE, { tipo: 'tasti', combinazione: 'enter', legatoA: { ref: 'e9', ruolo: 'pulsante', nome: 'OK' } }]]) {
    let fatto = false;
    const p = porte({ risposte: [uno(assente)], carta: (q) => { if (q.motivo === 'anti-robot') { fatto = true; return 'fatto'; } return 'si'; },
      guarda: () => piano({ elementi: [...(fatto ? [] : [{ ref: 'cap', ruolo: 'casella', nome: 'Non sono un robot' }]), { ref: 'v1', ruolo: 'voce', nome: 'relazione.docx' }] }) });
    const ra = await corsa(p, politica);
    assert.deepEqual([ra.esito, p.domande.map((q) => q.motivo), p.eseguite], ['riuscito', ['anti-robot'], []], `${politica.nome} ${assente.tipo}`);
    assert.ok(ra.storia.some((riga) => riga.includes('→ non-eseguita (elemento-sparito)')), JSON.stringify(ra.storia));
  }
  // the «I can» row: the protections stop, the person turns the permission on, the blind click goes
  const valuta = (acceso) => ({ schermata }) => (schermata.elementi.some((e) => e.modale) && !acceso()
    ? { decisione: 'ferma', protezione: 'cancellazione', motivo: 'dialogo', prova: 'x' } : { decisione: 'procedi', protezione: null, motivo: null, prova: null });
  let acceso = false;
  const posso = porte({ risposte: [uno(BUIO)], permessoMancante: async () => { acceso = true; return 'aggiunto'; } });
  const rp = await corsa(posso, NORMALE, { valuta: valuta(() => acceso) });
  assert.deepEqual([rp.esito, posso.eseguite], ['riuscito', ['clic']]);
  // the other way round: the window changed while the person was turning it on ⇒ the click does not start
  let acceso2 = false;
  const cambiata = porte({ risposte: [uno(BUIO)], permessoMancante: async () => { acceso2 = true; return 'aggiunto'; },
    guarda: () => (acceso2 ? dialogo({ testo: 'Eliminare definitivamente la cartella «Foto»?' }) : dialogo()) });
  const rc = await corsa(cambiata, NORMALE, { valuta: valuta(() => acceso2) });
  assert.deepEqual(cambiata.eseguite, []);
  assert.ok(rc.storia.some((riga) => riga.includes('→ non-eseguita (schermo-cambiato)')), JSON.stringify(rc.storia));
});

test('SID-6: a blind click in front of a window whose strongest button pays never pays by itself inside the spending limit, and its yes is never remembered', async () => {
  const cassa = () => ({ frenoArmato: true, titolo: 'Cassa - Negozio', dominio: 'negozio.example', elementi: [
    { ref: 'w', ruolo: 'finestra', nome: 'Conferma ordine', modale: true }, { ref: 't', ruolo: 'testo', nome: 'Totale 30,00 €', finestra: 'w' },
    { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora', finestra: 'w' }, { ref: 'no', ruolo: 'pulsante', nome: 'Annulla', finestra: 'w' }] });
  const TETTO = { testoDellaPersona: 'compra le cuffie, fino a 50 €', piano: { domini: ['negozio.example'], app: [] } };
  // control: the readable button pays inside the limit with no card, and the spending is counted
  const letto = porte({ risposte: [uno({ tipo: 'premi', ref: 'paga' })], guarda: cassa });
  const rl = await corsa(letto, NORMALE, TETTO);
  assert.deepEqual([carte(letto), letto.eseguite, rl.spese.length], [0, ['premi'], 1]);
  // the blind click: a card with the total, and no spending written for a click that may have fallen on «Annulla»
  const buio = porte({ risposte: [uno(BUIO), uno(BUIO)], guarda: cassa });
  const rb = await corsa(buio, NORMALE, TETTO);
  assert.deepEqual([carte(buio), buio.eseguite, rb.spese], [2, ['clic', 'clic'], []]);
  assert.deepEqual([buio.domande[0].protezione, buio.domande[0].totale], ['pagamento', { importo: 30, valuta: 'EUR' }]);
});

test('SID-7: the yes for a window is in the outcome and in the events like every other yes, and a card that cannot be shown stops the task', async () => {
  const p = porte({ risposte: [uno(BUIO), uno(BUIO)] });
  const r = await corsa(p);
  const fine = p.eventi.find((e) => e.nome === EVENTI.esito).dati;
  assert.deepEqual(fine.conferme, r.conferme);
  assert.deepEqual(p.eventi.filter((e) => e.nome === EVENTI.protezione).map((e) => e.dati.decisione), ['chiedi', 'procedi-e-segna']);
  // with no way to ask the person the blind click in front of the window does not start at all
  const muto = porte({ risposte: [uno(BUIO)] });
  delete muto.porte.chiediPersona;
  const rm = await corsa(muto);
  assert.deepEqual([rm.esito, muto.eseguite], ['fermato', []]);
});
