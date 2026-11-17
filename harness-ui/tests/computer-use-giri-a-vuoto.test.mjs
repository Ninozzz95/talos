/**
 * 0.2.2-CU round 3 (judge v1314; reviews of 09/11/2026): the loops that still reached the step limit, and the healthy long tasks the
 * round-2 ceiling closed too early.
 * - Point 5 (CLI): «type» or «keys» naming an element that is not on the screen, alternated with blind clicks, made 20 model requests
 *   and 10 «a step TALOS cannot check» cards in Normal. They now go back to the model as «element not found», like «press».
 * - N1 (Performance): «the third element not found closes the task» closed healthy tasks whose element was only late (the address
 *   suggestion after typing, «Load more» while the page loads). A miss born after an action of the same batch is forgiven when the
 *   element is on screen in one of the captures up to the one of the second model request after it.
 * - N2 (Performance): a press that fails on a real element, alternated with something that works, reached 20 requests. The third
 *   failure of the same action on the same element closes the task with its own reason.
 * - N3: with a batch of 12 the actions beyond the limit were written twice in the history.
 * - NP1, NP2: the two mutants the Performance reviewer left alive («select» not counted per task; the capture imprint computed on its
 *   first 64 characters only).
 * The scenes L1 and L3 come from the reviewer's stateful fake screen (C:/T/rev-021-cu2-performance/misura-lunghi.test.mjs), where
 * «late» means: the element appears only after the model has thought once more. Selenium and Playwright treat an element that is
 * not ready yet the same way: wait and read again before calling it an error. Fake ports and a fake helper: no screen, no model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito, EVENTI, SUGGERIMENTI, LIMITI_PREDEFINITI } from '../src/computer-use/ciclo.mjs';
import { POLITICHE } from '../src/computer-use/protezioni.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE, fraseFinale } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

const schermo = (over = {}) => ({ frenoArmato: true, app: 'blocco note', titolo: 'Senza titolo', elementi: [{ ref: 'b1', ruolo: 'pulsante', nome: 'Avanti' }, { ref: 'c1', ruolo: 'campo', nome: 'Nome' }], ...over });
const FANTASMA = { tipo: 'premi', ref: 'e9' }; // not on the screen
const VERO = { tipo: 'premi', ref: 'b1' };
const BUIO = { tipo: 'clic', x: 5, y: 5 }; // a coordinate click with no element under the point
const ASPETTA = { tipo: 'aspetta', secondi: 1 };
const SEMPRE = (lotto) => Array.from({ length: 40 }, (_, k) => ({ azioni: lotto(k) }));
const OK = () => ({ esito: 'confermata' });

/** Fake ports. The model is `risposte` (a list, then «done») or `modello(schermo, p)`. Requests, captures, actions and cards are counted. */
function porte({ risposte = [], modello = null, guarda = () => schermo(), agisci = () => ({ esito: 'non-verificabile', modo: 'sottofondo' }), ...altro } = {}) {
  let t = 0; let k = 0;
  const p = { eventi: [], eseguite: [], domande: [], richieste: 0, catture: 0, storie: [] };
  p.porte = {
    guarda: async () => { p.catture += 1; return guarda(p); },
    chiedi: async ({ osservazione, storia }) => {
      p.richieste += 1; p.storie.push(storia);
      if (modello) return modello(osservazione, p);
      return k < risposte.length ? risposte[k++] : { fine: { riuscito: true } };
    },
    agisci: async (azione, bersaglio) => { p.eseguite.push(azione.tipo); return agisci(azione, bersaglio, p); },
    bersaglio: (azione, s) => (azione.ref ? s.elementi.find((e) => e.ref === azione.ref) ?? null : null),
    chiediPersona: async (q) => { p.domande.push(q); return 'si'; },
    attendi: async () => {},
    emetti: (nome, dati) => p.eventi.push({ nome, dati }),
    adesso: () => { t += 10; return t; },
    ...altro,
  };
  return p;
}
const corsa = async (p, politica = POLITICHE.pcAccessoPieno, limiti) => {
  const r = await eseguiCompito({ testoDellaPersona: 'apri la pagina', politica, porte: p.porte, ...(limiti ? { limiti } : {}) });
  const nonTrovati = p.eventi.filter((e) => e.nome === EVENTI.passo && e.dati.motivo === 'elemento-non-trovato').length;
  return { r, nonTrovati };
};
const POLITICHE_PC = ['pcAccessoPieno', 'pcNormale', 'pcConsentiSempre'];

// ------------------------------------------------ point 5 ------------------------------------------------
test('GAV-1 (point 5, CLI): «type» and «keys» that NAME a missing element go back to the model as «element not found»: no card, and with blind clicks in between the task closes at 4 steps, not 20', async () => {
  const ASSENTI = [{ tipo: 'scrivi', ref: 'e9', testo: 'ciao' }, { tipo: 'tasti', ref: 'e9', combinazione: 'enter' }, { tipo: 'tasti', ref: 'e9', combinazione: 'ctrl+a' }];
  for (const nome of [...POLITICHE_PC, 'telefono', 'telefonoAccessoPieno']) {
    for (const assente of ASSENTI) {
      const dove = `${nome} ${assente.tipo} ${assente.combinazione ?? ''}`;
      // alone: two in a row close the task, nothing is sent, nobody is asked
      const solo = porte({ risposte: SEMPRE(() => [assente]) });
      const a = await corsa(solo, POLITICHE[nome]);
      assert.deepEqual([a.r.esito, a.r.motivo, a.r.passi, solo.richieste, solo.eseguite, solo.domande.length, a.nonTrovati], ['non-riuscito', 'errori-di-fila', 2, 2, [], 0, 2], dove);
      assert.ok(solo.storie[1].some((riga) => riga.includes('→ non-eseguita (elemento-non-trovato)') && riga.includes(SUGGERIMENTI.elementoNonTrovato)), dove);
      if (nome.startsWith('telefono')) continue; // the phone has no coordinate click
      // the reviewer's loop: blind click / missing element, the screen never changes
      const giro = porte({ risposte: SEMPRE((k) => [k % 2 ? assente : BUIO]) });
      const b = await corsa(giro, POLITICHE[nome]);
      assert.deepEqual([b.r.esito, b.r.motivo, b.r.passi, giro.richieste, giro.eseguite, giro.domande.length], ['non-riuscito', 'errori-di-fila', 4, 4, ['clic', 'clic'], 0], dove);
    }
  }
  // in front of an irreversible window too: a key for an element that is not there cannot start, so there is nothing to ask
  const dialogo = () => schermo({ elementi: [{ ref: 'w', ruolo: 'finestra', nome: 'Elimina file', modale: true }, { ref: 't', ruolo: 'testo', nome: 'Eliminare definitivamente questo file?', finestra: 'w' }] });
  const p = porte({ risposte: SEMPRE(() => [{ tipo: 'tasti', ref: 'e9', combinazione: 'enter' }]), guarda: dialogo });
  const { r } = await corsa(p, POLITICHE.pcNormale);
  assert.deepEqual([r.motivo, r.passi, p.domande.length, p.eseguite], ['errori-di-fila', 2, 0, []]);
  // the per-task ceiling counts them like the missing «press»: missing / real press / missing … closes at the third
  const misto = porte({ risposte: SEMPRE((k) => [k % 2 ? { tipo: 'scrivi', ref: 'e9', testo: 'x' } : VERO]), agisci: OK });
  const m = await corsa(misto);
  assert.deepEqual([m.r.esito, m.r.motivo, m.r.passi], ['non-riuscito', 'elemento-non-trovato', 6]);
});

test('GAV-2 (point 5, the other way round): what does NOT take that road: keys with no element go to the window, a field that is there is written', async () => {
  // «keys» with no ref that do not confirm go to the window (attrezzo.mjs): they start
  const tasti = porte({ risposte: [{ azioni: [{ tipo: 'tasti', combinazione: 'ctrl+a' }] }] });
  const a = await corsa(tasti);
  assert.deepEqual([a.r.esito, tasti.eseguite, a.nonTrovati], ['riuscito', ['tasti'], 0]);
  // a captcha on the screen comes first, as for «press»: the person is asked to solve it, the miss is not told as «element not found»
  let risolto = false;
  const robot = porte({ risposte: [{ azioni: [{ tipo: 'scrivi', ref: 'e9', testo: 'ciao' }] }],
    guarda: () => schermo({ elementi: [...(risolto ? [] : [{ ref: 'cap', ruolo: 'casella', nome: 'Non sono un robot' }]), { ref: 'c1', ruolo: 'campo', nome: 'Nome' }] }) });
  robot.porte.chiediPersona = async (q) => { robot.domande.push(q); if (q.motivo === 'anti-robot') { risolto = true; return 'fatto'; } return 'no'; };
  const b = await corsa(robot, POLITICHE.pcNormale);
  assert.deepEqual([robot.domande[0]?.motivo, b.nonTrovati, robot.eseguite], ['anti-robot', 0, []]);
  // a field that is on the screen is written, in every PC policy, with no card
  for (const nome of POLITICHE_PC) {
    const p = porte({ risposte: [{ azioni: [{ tipo: 'scrivi', ref: 'c1', testo: 'Mario' }, { tipo: 'tasti', ref: 'c1', combinazione: 'tab' }] }] });
    const { r, nonTrovati } = await corsa(p, POLITICHE[nome]);
    assert.deepEqual([r.esito, p.eseguite, p.domande.length, nonTrovati], ['riuscito', ['scrivi', 'tasti'], 0, 0], nome);
  }
});

// ------------------------------------------------ N1 ------------------------------------------------
/** The reviewer's L1 in small: typing in «A» makes a suggestion appear, but only `ritardo` model requests later. The model that has
 *  learnt the form writes and presses the suggestion in the same batch; when it sees text typed and no suggestion, it waits. */
function posta({ ritardo, persone = 5 }) {
  const st = { digitato: false, pensieri: 0, fatti: 0 };
  const guarda = () => schermo({ app: 'posta', titolo: 'Nuovo messaggio', elementi: [{ ref: 'c1', ruolo: 'campo', nome: 'A', valore: `${st.fatti} destinatari` },
    ...(st.digitato && st.pensieri >= ritardo ? [{ ref: 's1', ruolo: 'voce', nome: 'Mario Rossi (suggerimento)' }] : [])] });
  const modello = (s) => {
    st.pensieri += 1;
    if (s.elementi.some((e) => e.ref === 's1')) return { azioni: [{ tipo: 'premi', ref: 's1' }] };
    if (st.digitato) return { azioni: [ASPETTA] };
    if (st.fatti < persone) return { azioni: [{ tipo: 'scrivi', ref: 'c1', testo: 'Ma' }, { tipo: 'premi', ref: 's1' }] };
    return { fine: { riuscito: true } };
  };
  const agisci = (azione) => {
    if (azione.tipo === 'scrivi') { st.digitato = true; st.pensieri = 0; }
    if (azione.tipo === 'premi' && azione.ref === 's1') { st.fatti += 1; st.digitato = false; }
    return { esito: 'confermata' };
  };
  return { st, p: porte({ modello, guarda, agisci }) };
}

test('GAV-3 (N1, Performance): an element that is only LATE is not «missing»: five recipients, five late suggestions, the task ends well', async () => {
  const { st, p } = posta({ ritardo: 1 });
  const { r, nonTrovati } = await corsa(p);
  assert.deepEqual([r.esito, r.motivo, st.fatti], ['riuscito', 'completato', 5], JSON.stringify(r.storia.slice(-4)));
  assert.equal(nonTrovati, 5, 'each miss is still told to the model with its hint');
  assert.ok(r.passi <= LIMITI_PREDEFINITI.passi);
});

test('GAV-4 (N1, the other way round): what is NOT forgiven: an element that never comes, one that comes too late, a miss with nothing done before it in the batch', async () => {
  // never: a wrong or stale name. The third miss closes the task as in round 2
  const mai = porte({ risposte: SEMPRE(() => [{ tipo: 'scrivi', ref: 'c1', testo: 'Ma' }, FANTASMA]), agisci: OK });
  const a = await corsa(mai);
  assert.deepEqual([a.r.esito, a.r.motivo, a.r.passi, a.nonTrovati], ['non-riuscito', 'elemento-non-trovato', 3, 3]);
  // too late: the suggestion shows up only at the capture of the THIRD model request after the miss
  const tardi = posta({ ritardo: 2 });
  const b = await corsa(tardi.p);
  assert.deepEqual([b.r.esito, b.r.motivo, b.nonTrovati, tardi.st.fatti], ['non-riuscito', 'elemento-non-trovato', 3, 2]);
  // a blinking element pressed as the FIRST action of its batch: the model had just seen the screen without it. Not forgiven
  const lampeggia = porte({ risposte: SEMPRE((k) => [k % 2 ? ASPETTA : { tipo: 'premi', ref: 's1' }]), agisci: OK,
    guarda: (q) => schermo({ elementi: [{ ref: 'c1', ruolo: 'campo', nome: 'A' }, ...(q.richieste % 2 ? [{ ref: 's1', ruolo: 'voce', nome: 'Suggerimento' }] : [])] }) });
  const c = await corsa(lampeggia);
  assert.deepEqual([c.r.esito, c.r.motivo, c.r.passi, c.nonTrovati], ['non-riuscito', 'elemento-non-trovato', 5, 3]);
  // a forgiven miss does not pay for a later real one: two late elements forgiven, then three that never come ⇒ closed at the third of THOSE
  const SCRIVI = { tipo: 'scrivi', ref: 'c1', testo: 'Ma' };
  const poi = porte({ risposte: [{ azioni: [SCRIVI, { tipo: 'premi', ref: 's1' }] }, { azioni: [SCRIVI, { tipo: 'premi', ref: 's1' }] }, ...SEMPRE(() => [SCRIVI, FANTASMA])], agisci: OK,
    guarda: (q) => schermo({ elementi: [{ ref: 'c1', ruolo: 'campo', nome: 'A', valore: `${q.eseguite.length} lettere` }, ...(q.catture % 2 ? [{ ref: 's1', ruolo: 'voce', nome: 'Suggerimento' }] : [])] }) });
  const d = await corsa(poi);
  assert.deepEqual([d.r.esito, d.r.motivo, d.r.passi, d.nonTrovati], ['non-riuscito', 'elemento-non-trovato', 5, 5]);
  // one forgiveness for each screen: an element that blinks (gone at the re-read after the wait, back at the next capture, and the
  // screen is the very same every time) is forgiven ONCE. Measured without this rule: 20 requests and 41 captures; with it, 4 and 8
  const batte = porte({ risposte: SEMPRE(() => [ASPETTA, { tipo: 'premi', ref: 's1' }]), agisci: OK,
    guarda: (q) => schermo({ elementi: [{ ref: 'c1', ruolo: 'campo', nome: 'A' }, ...(q.catture % 2 ? [{ ref: 's1', ruolo: 'voce', nome: 'Suggerimento' }] : [])] }) });
  const e = await corsa(batte);
  assert.deepEqual([e.r.esito, e.r.motivo, e.r.passi, batte.richieste, e.nonTrovati], ['non-riuscito', 'elemento-non-trovato', 4, 4, 4]);
  // the picture alone does not make it «another screen» (a blinking cursor, an animation), and neither do renumbered references
  const animata = porte({ risposte: SEMPRE(() => [ASPETTA, { tipo: 'premi', ref: 's1' }]), agisci: OK,
    guarda: (q) => schermo({ impronta: `h${q.catture}`, elementi: [{ ref: `c${q.catture}`, ruolo: 'campo', nome: 'A' }, ...(q.catture % 2 ? [{ ref: 's1', ruolo: 'voce', nome: 'Suggerimento' }] : [])] }) });
  const g = await corsa(animata);
  assert.deepEqual([g.r.motivo, g.r.passi], ['elemento-non-trovato', 4]);
});

// ------------------------------------------------ N2 ------------------------------------------------
test('GAV-5 (N2, Performance S8 and S9): a press that fails on a REAL element, with something that works in between, closes at the third failure with its own reason, not at the step limit', async () => {
  const rotto = (azione) => (azione.tipo === 'premi' ? { esito: 'rifiutata', motivo: 'altro' } : { esito: 'non-verificabile', modo: 'sottofondo' });
  const siMuove = (q) => schermo({ titolo: `Pagina ${q.catture}` }); // an animated window: every capture differs, so a blind click «worked»
  // (only the title moves: the texts of the elements stay, so nothing is forgiven; when they change the count starts again once, R3
  // of computer-use-lotti-cura-del-rosso.test.mjs, cure of the reviewer's RED N2, 11/11)
  for (const [nome, altra] of [['S8 blind click', BUIO], ['S9 scroll', { tipo: 'scorri', ref: 'c1', direzione: 'down', quantita: 3 }]]) {
    const p = porte({ risposte: SEMPRE((k) => [k % 2 ? VERO : altra]), agisci: rotto, guarda: siMuove });
    const { r } = await corsa(p);
    assert.deepEqual([r.esito, r.motivo, r.passi, p.richieste], ['non-riuscito', 'elemento-non-risponde', 6, 6], nome);
  }
  assert.equal(LIMITI_PREDEFINITI.fallimentiSulloStessoElemento, 3);
  // the limit is a setting
  const due = porte({ risposte: SEMPRE((k) => [k % 2 ? VERO : BUIO]), agisci: rotto, guarda: siMuove });
  assert.deepEqual([(await corsa(due, POLITICHE.pcAccessoPieno, { fallimentiSulloStessoElemento: 2 })).r.passi], [4]);
  // the other way round. A success on THAT element starts its count again: fail, work, fail, work … is a slow task, not a loop
  let n = 0;
  const alterno = porte({ risposte: Array.from({ length: 12 }, () => ({ azioni: [VERO] })), agisci: () => (n++ % 2 ? { esito: 'confermata' } : { esito: 'rifiutata', motivo: 'altro' }) });
  const a = await corsa(alterno);
  assert.deepEqual([a.r.esito, a.r.motivo, alterno.eseguite.length], ['riuscito', 'completato', 12]);
  // failures on DIFFERENT elements do not add up: b1, c1, b1, c1 with blind clicks in between ⇒ two each, the task goes on
  const diversi = porte({ risposte: Array.from({ length: 8 }, (_, k) => ({ azioni: [k % 2 ? { tipo: 'premi', ref: k % 4 === 1 ? 'b1' : 'c1' } : BUIO] })), agisci: rotto, guarda: siMuove });
  const b = await corsa(diversi);
  assert.deepEqual([b.r.esito, b.r.motivo, b.r.passi], ['riuscito', 'completato', 9]);
  // two failures in a row still close first, as before
  const fila = porte({ risposte: SEMPRE(() => [VERO]), agisci: rotto });
  assert.deepEqual([(await corsa(fila)).r.motivo, fila.richieste], ['errori-di-fila', 2]);
});

test('GAV-6 (N2): the new closing reason has its sentence for the assistant model and for the screen, English first and then Italian, never the code', async () => {
  const frase = fraseFinale({ esito: 'non-riuscito', motivo: 'elemento-non-risponde', passi: 6 });
  assert.match(frase, /not completed, the same element did not respond several times \(after 6 steps\)\. Tell the person what is left to do/u);
  assert.doesNotMatch(frase, /elemento-non-risponde|an unexpected stop/u);
  const { readFileSync } = await import('node:fs');
  const parole = readFileSync(new URL('../frontend/src/components/computer-use/parole.js', import.meta.url), 'utf8');
  assert.match(parole, /'elemento-non-risponde': 'computer\.end\.notResponding'/u);
  const { default: testi } = await import('../frontend/src/i18n/testi/computer.js');
  assert.equal(testi.en['end.notResponding'], "I tried the same thing several times and it didn't respond, so I stopped.");
  assert.equal(testi.it['end.notResponding'], 'Ho provato più volte la stessa cosa e non ha risposto, quindi mi sono fermato.');
});

// ------------------------------------------------ N3, NP1 ------------------------------------------------
test('GAV-7 (N3, Performance): with a batch of 12 the two actions beyond the limit are written ONCE: the rest of a batch that stops is «2-10», not «2-12»', async () => {
  const p = porte({ risposte: [{ azioni: [FANTASMA, ...Array(11).fill(VERO)] }, { fine: { riuscito: true } }] });
  const { r } = await corsa(p);
  const delLotto = r.storia.filter((riga) => riga.includes('del lotto'));
  assert.deepEqual(delLotto, ['passo 1: azioni 11-12 del lotto (premi ×2) → non-eseguita', 'passo 1: azioni 2-10 del lotto (premi ×9) → non-eseguita'], JSON.stringify(r.storia));
  assert.deepEqual(p.eseguite, []);
  // a batch that runs to its end starts exactly ten actions, and the two beyond are still one line
  const pieno = porte({ risposte: [{ azioni: Array(12).fill(VERO) }, { fine: { riuscito: true } }] });
  const s = await corsa(pieno);
  assert.deepEqual([pieno.eseguite.length, s.r.storia.filter((riga) => riga.includes('del lotto'))], [10, ['passo 1: azioni 11-12 del lotto (premi ×2) → non-eseguita']]);
});

test('GAV-8 (NP1, a mutant the reviewer left alive): «select» on a missing element counts for the task like «press»: with real steps in between it closes at the third', async () => {
  const p = porte({ risposte: SEMPRE((k) => [k % 2 ? { tipo: 'scegli', ref: 'e9', valore: 'x' } : VERO]), agisci: OK });
  const { r, nonTrovati } = await corsa(p);
  assert.deepEqual([r.esito, r.motivo, r.passi, p.richieste, nonTrovati], ['non-riuscito', 'elemento-non-trovato', 6, 6, 3]);
});

// ------------------------------------------------ the real host with a fake helper ------------------------------------------------
function png(w, h, coda = 0) {
  const b = Buffer.alloc(24 + coda);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const PER_APP = /wants to use this computer|outside the places/u;
/** the owner's desktop: a window whose tree is null; `immagine(clic)` gives the bytes of the capture after `clic` clicks */
function desktop({ immagine = () => png(1600, 900) } = {}) {
  const f = { window_id: 500, pid: 77, app_name: 'explorer.exe', title: 'Program Manager', bounds: { x: 0, y: 0, width: 1600, height: 900 }, z_index: 9, is_on_screen: true, minimized: false };
  const a = { clic: 0, azioni: [], async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [f] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, dati: { window_id: f.window_id, pid: f.pid, window_title: f.title, app_name: f.app_name, window_bounds: f.bounds, screenshot_width: 1600, screenshot_height: 900,
          elements: null, tree_markdown: null }, immagine: { base64: immagine(a.clic).toString('base64'), mime: 'image/png' }, errore: null };
      }
      if (nome === 'click') a.clic += 1;
      a.azioni.push(nome); return { ok: true, dati: {}, immagine: null, errore: null };
    } };
  return a;
}
async function ospite(aiutante, modello, livello = 'accesso-pieno') {
  const carte = []; let n = 0;
  const sessione = { testoDellaPersona: 'esplora il desktop',
    chiediModello: async () => { const x = modello(n); n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => { validaDomandeUtente(q); carte.push(q[0].question); return { status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }; },
    emetti: () => {} };
  const esito = await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'explore the desktop' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione });
  return { testo: esito.testo, richieste: n, carte: carte.filter((c) => !PER_APP.test(c)).length, azioni: aiutante.azioni };
}
const PUNTO = { type: 'click', x: 640, y: 690 };

test('GAV-9 (point 5 through the real host, the reviewer\'s probe): Normal, «type» or «keys enter» on a ref that is not there, alternated with blind clicks ⇒ 4 requests and 0 cards (before: 20 and 10)', async () => {
  for (const assente of [{ type: 'type', ref: 'e9', text: 'ciao' }, { type: 'keys', ref: 'e9', keys: 'enter' }]) {
    const r = await ospite(desktop(), (n) => ({ actions: [n % 2 ? assente : PUNTO] }), 'scrittura-progetto');
    assert.match(r.testo, /too many failed steps in a row \(after 4 steps\)/u, `${assente.type}: ${r.testo}`);
    assert.deepEqual([r.richieste, r.carte, r.azioni], [4, 0, ['click', 'click']], assente.type);
  }
});

test('GAV-10 (NP2, a mutant the reviewer left alive): the capture imprint reads the WHOLE picture: two captures that differ only after their first bytes are two screens', async () => {
  // 600 bytes of picture, the same in the first 590: only the tail says the window reacted to the click
  const mossa = await ospite(desktop({ immagine: (clic) => { const b = png(1600, 900, 576); b[590] = clic; return b; } }), (n) => ({ actions: [n % 2 ? { type: 'press', ref: 'e9' } : PUNTO] }));
  assert.match(mossa.testo, /it looked several times for an element that is not on the screen \(after 6 steps\)/u, mossa.testo);
  assert.deepEqual([mossa.richieste, mossa.azioni.length], [6, 3]);
  // control: the very same bytes ⇒ the blind click did nothing we can see, and two misses close the task at 4 steps
  const ferma = await ospite(desktop({ immagine: () => png(1600, 900, 576) }), (n) => ({ actions: [n % 2 ? { type: 'press', ref: 'e9' } : PUNTO] }));
  assert.match(ferma.testo, /too many failed steps in a row \(after 4 steps\)/u, ferma.testo);
});

// ---------- N1 through the real host: the reviewer's scenes L1 and L3 (stateful fake screen, a fake model that READS the prompt) ----------
const el = (i, role, label, y, value) => ({ element_index: i, element_token: `s1:${i}`, role, label, depth: 3, actions: ['invoke'],
  frame: { x: 40, y, w: 300, h: 28 }, enabled: true, ...(value !== undefined ? { value } : {}) });
function scena(def) {
  const st = { ...def.iniziale(), pensato: false };
  const finestra = { window_id: 9100, pid: 7300, app_name: def.app, title: def.titolo, bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 1, is_on_screen: true, minimized: false };
  const indice = (t) => Number(String(t ?? '').split(':')[1]);
  return { st, async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome, a) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [finestra] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        const elements = def.elementi(st);
        return { ok: true, dati: { window_id: finestra.window_id, pid: finestra.pid, window_title: def.titolo, app_name: def.app, window_bounds: finestra.bounds,
          screenshot_width: 1280, screenshot_height: 720, elements,
          tree_markdown: `${elements.map((e) => `      - [${e.element_index}] ${e.role} "${e.label}"`).join('\n')}\n` }, immagine: { base64: png(1280, 720).toString('base64'), mime: 'image/png' }, errore: null };
      }
      if (nome === 'click') def.clic?.(st, indice(a.element_token));
      if (nome === 'type_text') def.scrivi?.(st, indice(a.element_token), a.text);
      if (nome === 'scroll') def.scorri?.(st);
      return { ok: true, dati: {}, immagine: null, errore: null };
    } };
}
const leggi = (prompt) => [...String(prompt).matchAll(/^(e\d+) (\S+) "((?:[^"\\]|\\.)*)"/gmu)].map((m) => ({ ref: m[1], ruolo: m[2], nome: JSON.parse(`"${m[3]}"`) }));
const trova = (els, f) => els.find(f)?.ref ?? null;
async function lunga(def, politica) {
  const a = scena(def);
  const eventi = []; const mente = {};
  const sessione = { testoDellaPersona: def.compito,
    chiediModello: async ({ contenuto }) => {
      a.st.pensato = true; // the model has thought: what had to come «late» is there now
      const p = contenuto?.[0]?.text ?? '';
      return { testo: JSON.stringify(politica(leggi(p.split('Last steps:')[0]), a.st, mente, p)), usage: null };
    },
    chiediDomanda: async (q) => ({ status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }),
    emetti: (nm, dati) => { eventi.push({ nome: nm, dati }); } };
  await creaOspiteComputerUse({ aiutante: a })(NOME_COMPUTER_USE, { task: def.compito },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno', sessione });
  const fine = eventi.find((e) => e.nome === EVENTI.fermato || e.nome === EVENTI.esito)?.dati ?? {};
  return { esito: fine.esito, motivo: fine.motivo, passi: fine.passi, richieste: fine.richieste, fatto: def.fatto(a.st) };
}
const PERSONE = ['Mario Rossi', 'Lucia Bianchi', 'Paolo Verdi', 'Anna Neri', 'Carlo Gallo'];
const POSTA = {
  app: 'olk.exe', titolo: 'Nuovo messaggio - Outlook', compito: 'manda una bozza a Mario, Lucia, Paolo, Anna e Carlo con oggetto Riunione',
  iniziale: () => ({ aperta: false, a: [], digitato: null, oggetto: '', corpo: '', salvata: false }),
  elementi: (st) => {
    if (!st.aperta) return [el(1, 'Button', 'Nuovo messaggio', 40)];
    const r = [el(2, 'Edit', 'A', 80, [...st.a, ...(st.digitato ? [st.digitato] : [])].join('; ')), el(3, 'Edit', 'Oggetto', 120, st.oggetto),
      el(4, 'Edit', 'Messaggio', 160, st.corpo), el(5, 'Button', 'Salva bozza', 400)];
    if (st.digitato && st.pensato) r.push(el(6, 'ListItem', `${PERSONE.find((p) => p.startsWith(st.digitato))} (suggerimento)`, 100));
    return r;
  },
  clic: (st, i) => {
    if (i === 1) st.aperta = true;
    if (i === 6 && st.digitato && st.pensato) { st.a.push(PERSONE.find((p) => p.startsWith(st.digitato))); st.digitato = null; }
    if (i === 5) st.salvata = true;
  },
  scrivi: (st, i, t) => { if (i === 2) { st.digitato = t; st.pensato = false; } if (i === 3) st.oggetto = t; if (i === 4) st.corpo = t; },
  fatto: (st) => st.salvata && st.a.length === 5 && st.oggetto === 'Riunione',
};
/** after seeing the suggestion once, the model writes and presses it in the same batch (a model that has learnt the form) */
const politicaPosta = (els, st, m) => {
  const nuovo = trova(els, (e) => e.nome === 'Nuovo messaggio'); if (nuovo) return { actions: [{ type: 'press', ref: nuovo }] };
  const sugg = els.find((e) => e.ruolo === 'item' || /suggerimento/u.test(e.nome));
  if (sugg) { m.visto = sugg.ref; return { actions: [{ type: 'press', ref: sugg.ref }] }; }
  const campoA = els.find((e) => e.nome === 'A');
  if (st.digitato) return { actions: [{ type: 'wait', seconds: 0.01 }] }; // typed but no suggestion yet: wait
  if (st.a.length < PERSONE.length) {
    return { actions: [{ type: 'type', ref: campoA.ref, text: PERSONE[st.a.length].split(' ')[0] }, ...(m.visto ? [{ type: 'press', ref: m.visto }] : [])] };
  }
  if (!st.oggetto) return { actions: [{ type: 'type', ref: trova(els, (e) => e.nome === 'Oggetto'), text: 'Riunione' }] };
  if (!st.corpo) return { actions: [{ type: 'type', ref: trova(els, (e) => e.nome === 'Messaggio'), text: 'Ci vediamo giovedì alle 10.' }] };
  if (!st.salvata) return { actions: [{ type: 'press', ref: trova(els, (e) => e.nome === 'Salva bozza') }] };
  return { done: { success: true, impossible: false, note: 'bozza salvata' } };
};
const NEGOZIO = {
  app: 'negozio.exe', titolo: 'Cavi - Negozio', compito: 'trova il cavo USB-C da 2 metri e mettilo nel carrello',
  iniziale: () => ({ pagina: 1, carica: false, scelto: false, carrello: false }),
  elementi: (st) => {
    if (st.carica && st.pensato) { st.carica = false; st.pagina += 1; } // the loading ends while the model thinks
    const voci = Array.from({ length: 8 }, (_, k) => el(10 + k, 'ListItem', st.pagina === 8 && k === 3 ? 'Cavo USB-C 2 m' : `Cavo ${st.pagina}-${k}`, 60 + 30 * k));
    const r = [el(2, 'Edit', 'Cerca', 20), ...voci];
    if (st.scelto) r.push(el(40, 'Button', 'Aggiungi al carrello', 600));
    if (st.carica && !st.pensato) r.push(el(29, 'Text', 'Caricamento…', 560));
    else if (st.pagina < 8) r.push(el(30, 'Button', 'Carica altri', 580));
    return r;
  },
  clic: (st, i) => { if (i === 30) { st.carica = true; st.pensato = false; } if (i === 13 && st.pagina === 8) st.scelto = true; if (i === 40) st.carrello = true; },
  scorri: (st) => { if (st.pagina < 8) { st.carica = true; st.pensato = false; } }, // scrolling to the bottom starts the loading (endless scroll)
  fatto: (st) => st.carrello,
};
const politicaNegozio = (els, st, m, prompt) => {
  const cavo = trova(els, (e) => e.nome === 'Cavo USB-C 2 m');
  const aggiungi = trova(els, (e) => e.nome === 'Aggiungi al carrello');
  if (st.carrello) return { done: { success: true, impossible: false, note: 'nel carrello' } };
  if (aggiungi) return { actions: [{ type: 'press', ref: aggiungi }] };
  if (cavo) return { actions: [{ type: 'press', ref: cavo }] };
  const altri = trova(els, (e) => e.nome === 'Carica altri');
  if (altri) return { actions: [{ type: 'scroll', ref: 'e10', direction: 'down' }, { type: 'press', ref: altri }] };
  if (/Caricamento/u.test(prompt.split('Last steps:')[0])) return { actions: [{ type: 'wait', seconds: 0.01 }] };
  return { done: { success: false, impossible: true, note: 'non trovato' } };
};

test('GAV-11 (N1 through the real host, the reviewer\'s scenes): L1, a mail to five people with late suggestions, and L3, a shop with «Load more», end well again (round 2 closed them at steps 11 and 5)', async () => {
  const l1 = await lunga(POSTA, politicaPosta);
  assert.deepEqual([l1.esito, l1.motivo, l1.fatto], ['riuscito', 'completato', true], JSON.stringify(l1));
  const l3 = await lunga(NEGOZIO, politicaNegozio);
  assert.deepEqual([l3.esito, l3.motivo, l3.fatto], ['riuscito', 'completato', true], JSON.stringify(l3));
  console.log(`# GAV-11 L1 ${l1.passi} steps, ${l1.richieste} requests; L3 ${l3.passi} steps, ${l3.richieste} requests`);
});
