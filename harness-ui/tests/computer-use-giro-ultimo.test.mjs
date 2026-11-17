/**
 * 0.2.2-CU, the last round («the one that makes it true», owner yes via the judge 11/11/2026 09:35) after the yellow of the reviewer of
 * the five cures.
 * - U1: the cap of a remembered yes (the approved send and at most 3 more) held only for a blind click. A TARGETED send under the yes of
 *   the page had no cap: 20 clicks or presses on «Invia», «Send», «Submit», an icon button named «Send», Ctrl+Enter in the message,
 *   Enter in a chat field, a text ending with a new line: 20 sends under ONE card. Now one card every 4 sends, blind or targeted, mixed.
 * - U2: the recipient of a remembered yes is read from the «To» field also when it is a combobox (Outlook) or is named «To recipients»
 *   (Gmail), «Destinatari», «Cc»; a field named «Messaggio» is not a recipient.
 * - U3 (8d, the reviewer's form v-8d): plain texts count for the forgiveness only of the element just pressed with success: a blinking
 *   button with a clock and a successful action repeated in front of it is back to 4 requests (it was 20).
 * - U4 (8c, the reviewer's form a): the key of progress keeps the written text, at most 3 progresses per element: healthy tasks that
 *   rewrite the same field (an email corrected 2-5 times, discount codes tried 2-4 times) end well; the broken loop 3-c costs 5
 *   requests instead of 3. A checkbox and a button with the same name are two elements (mutant «key without role»).
 * - U5: with the guard's checkout yes (variant A), a blind click on a payment window asks its own payment card (one more card than
 *   before: decision 375, declared in the CHANGELOG); a targeted «Pay now» stays covered.
 * Fake ports only. Hermes re-captures before any retry (tools/computer_use/tool.py:521-563); Codex skips the prompt only for a key
 * already approved (codex-rs/core/src/tools/sandboxing.rs:66-97); neither caps the uses of a yes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito } from '../src/computer-use/ciclo.mjs';
import { POLITICHE } from '../src/computer-use/protezioni.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO } = POLITICHE;
const BUIO = { tipo: 'clic', x: 5, y: 5 };
const uno = (...azioni) => ({ azioni });
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });

function porte({ risposte = [], guarda, agisci = () => ({ esito: 'non-verificabile', modo: 'sottofondo' }), carta = () => 'si' } = {}) {
  let k = 0;
  const p = { eseguite: [], domande: [], richieste: 0, catture: 0, ora: 0 };
  p.porte = {
    guarda: async () => { p.catture += 1; return guarda(p); },
    chiedi: async () => { p.richieste += 1; const r = typeof risposte === 'function' ? risposte(p) : (k < risposte.length ? risposte[k++] : null); return r ?? { fine: { riuscito: true } }; },
    agisci: async (azione, bersaglio) => { const r = await agisci(azione, bersaglio, p); p.eseguite.push(azione.tipo); return r; },
    bersaglio: (azione, s) => (azione.ref != null && azione.ref !== '' ? s.elementi.find((e) => e.ref === azione.ref) ?? null : null),
    chiediPersona: async (q) => { p.domande.push(q); return carta(q, p); },
    attendi: async () => {}, emetti: () => {}, adesso: () => { p.ora += 10; return p.ora; },
  };
  return p;
}
const carte = (p) => p.domande.filter((q) => q.motivo === 'conferma');
const volte = (n, azione) => { let k = 0; return () => (++k <= n ? uno(typeof azione === 'function' ? azione(k) : azione) : null); };

// ------------------------------------------------ U1 the cap on targeted sends ------------------------------------------------
const POSTA = ['marco@esempio.it', 'banca@esempio.it', 'capo@esempio.it', 'tutti@esempio.it', 'lista@esempio.it', 'giulia@esempio.it'];
const bozza = (pulsante, { a = POSTA[0], ruoloA = 'campo', nomeA = 'A' } = {}) => ({ frenoArmato: true, app: 'outlook', titolo: 'Posta', elementi: [
  el('h', 'intestazione', 'Nuovo messaggio'), el('a', ruoloA, nomeA, { valore: a }), el('m', 'campo', 'Messaggio', { valore: 'ciao' }), el('inv', 'pulsante', pulsante)] });
const dialogo = ({ testata = 'Marco', a = POSTA[0], ruoloA = 'campo', nomeA = 'A' } = {}) => ({ frenoArmato: true, app: 'outlook', titolo: 'Posta', elementi: [
  el('h', 'intestazione', testata), el('a', ruoloA, nomeA, { valore: a }), el('w', 'finestra', 'Invia', { modale: true }),
  el('t', 'testo', 'Inviare il messaggio senza oggetto?', { finestra: 'w' }), el('b1', 'pulsante', 'Invia', { finestra: 'w' }), el('b2', 'pulsante', 'Annulla', { finestra: 'w' })] });
const chat = () => ({ frenoArmato: true, dominio: 'web.whatsapp.com', titolo: 'WhatsApp', elementi: [el('h', 'intestazione', 'Marco'), el('c', 'campo', 'Scrivi un messaggio', { valore: 'ciao' })] });
const modulo = () => ({ frenoArmato: true, dominio: 'modulo.example', titolo: 'Contatti', elementi: [el('h', 'intestazione', 'Contattaci'), el('e', 'campo', 'Email', { valore: 'io@esempio.it' }), el('inv', 'pulsante', 'Submit')] });

test('U1: the same TARGETED send 20 times under a remembered yes: a card every 4 sends (the approved one and at most 3 more), for every way of sending', async () => {
  const casi = [
    ['a click on «Invia» of the dialog', { tipo: 'clic', ref: 'b1' }, () => dialogo(), 'manda le mail'],
    ['a press on «Invia» of the dialog', { tipo: 'premi', ref: 'b1' }, () => dialogo(), 'manda le mail'],
    ['«Invia» of the draft', { tipo: 'premi', ref: 'inv' }, () => bozza('Invia'), 'manda le mail'],
    ['«Send» of the draft', { tipo: 'premi', ref: 'inv' }, () => bozza('Send'), 'manda le mail'],
    ['«Submit» of a form', { tipo: 'premi', ref: 'inv' }, modulo, 'manda il modulo'],
    ['an icon button whose name comes from aria-label «Send»', { tipo: 'premi', ref: 'inv' }, () => ({ ...bozza('Send'), elementi: bozza('Send').elementi.map((e) => (e.ref === 'inv' ? { ...e, icona: true } : e)) }), 'manda le mail'],
    ['Ctrl+Enter in the message field', { tipo: 'tasti', combinazione: 'ctrl+enter', ref: 'm' }, () => bozza('Invia'), 'manda le mail'],
    ['Enter in a chat field', { tipo: 'tasti', combinazione: 'enter', ref: 'c' }, chat, 'manda un messaggio a Giulia'],
    ['a text that ends with a new line in a chat field', { tipo: 'scrivi', ref: 'c', testo: 'ciao\n' }, chat, 'manda un messaggio a Giulia'],
  ];
  for (const [nome, azione, guarda, frase] of casi) {
    const p = porte({ risposte: volte(20, azione), guarda });
    await eseguiCompito({ testoDellaPersona: frase, politica: NORMALE, porte: p.porte });
    assert.deepEqual([carte(p).length, p.eseguite.length], [5, 20], nome);
    assert.ok(carte(p).every((q) => q.protezione === 'invio'), nome);
  }
  // blind and targeted clicks mixed: one yes for the same window and recipient, one cap: the cards at sends 1, 5, 9, 13, 17
  // (before the cap 4 cards, the targeted yes had none; in the last round 6, two yeses with a card asked right after the first)
  const misto = porte({ risposte: volte(20, (k) => (k % 2 ? BUIO : { tipo: 'clic', ref: 'b1' })), guarda: () => dialogo() });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: misto.porte });
  assert.deepEqual([carte(misto).length, misto.eseguite.length], [5, 20]);
  // Full access is untouched: a send there asks no card at all
  const pieno = porte({ risposte: volte(20, { tipo: 'premi', ref: 'inv' }), guarda: () => bozza('Invia') });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: PIENO, porte: pieno.porte });
  assert.deepEqual([carte(pieno).length, pieno.eseguite.length], [0, 20]);
  // the cap is for sends only: six «I accept the terms» boxes on the same sign-up page stay under one card (decision 375)
  const termini = porte({ risposte: volte(6, (k) => ({ tipo: 'clic', ref: `t${k}` })), guarda: () => ({ frenoArmato: true, dominio: 'sito.example', titolo: 'Iscrizione',
    elementi: [1, 2, 3, 4, 5, 6].map((k) => el(`t${k}`, 'casella', `Accetto i termini e condizioni ${k}`)) }) });
  await eseguiCompito({ testoDellaPersona: 'iscriviti', politica: NORMALE, porte: termini.porte });
  assert.deepEqual([carte(termini).length, termini.eseguite.length], [1, 6]);
});

// ------------------------------------------------ U2 the recipient from other fields ------------------------------------------------
test('U2: six different addresses in a «To» combobox, «To recipients», «Destinatari» or «Cc»: a card for each new recipient, blind or targeted; «Messaggio» is not a recipient', async () => {
  for (const [ruoloA, nomeA] of [['scelta', 'A'], ['campo', 'To recipients'], ['scelta', 'To recipients'], ['campo', 'Destinatari'], ['campo', 'Cc']]) {
    const buio = porte({ risposte: volte(6, BUIO), guarda: (q) => dialogo({ testata: 'Nuovo messaggio', ruoloA, nomeA, a: POSTA[Math.min(q.eseguite.length, 5)] }) });
    await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: buio.porte });
    assert.deepEqual([carte(buio).length, buio.eseguite.length], [6, 6], `blind, ${ruoloA} «${nomeA}»`);
    const mirato = porte({ risposte: volte(6, { tipo: 'premi', ref: 'inv' }), guarda: (q) => bozza('Invia', { ruoloA, nomeA, a: POSTA[Math.min(q.eseguite.length, 5)] }) });
    await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: mirato.porte });
    assert.deepEqual([carte(mirato).length, mirato.eseguite.length], [6, 6], `targeted, ${ruoloA} «${nomeA}»`);
  }
  // the body of the message changes behind the dialog, the header is generic: not another recipient, the cap decides (2 cards for 6)
  const corpo = porte({ risposte: volte(6, BUIO), guarda: (q) => dialogo({ testata: 'Nuovo messaggio', nomeA: 'Messaggio', a: `bozza ${q.eseguite.length}` }) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: corpo.porte });
  assert.deepEqual([carte(corpo).length, corpo.eseguite.length], [2, 6]);
  // a checkbox named «Cc» («send me a copy») that is ticked and unticked is not a recipient: only fields and comboboxes are read
  const casella = porte({ risposte: volte(6, BUIO), guarda: (q) => ({ ...dialogo({ testata: 'Nuovo messaggio' }),
    elementi: [...dialogo({ testata: 'Nuovo messaggio' }).elementi, el('k', 'casella', 'Cc', { valore: q.eseguite.length % 2 ? 'vero' : 'falso' })] }) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: casella.porte });
  assert.deepEqual([carte(casella).length, casella.eseguite.length], [2, 6]);
  // the same «Cc» under a conversation that changes person (a reply to six people with the boss in copy): a card for each person
  const persone = ['Marco', 'Giulia', 'Paolo', 'Anna', 'Luca', 'Sara'];
  const risposta = porte({ risposte: volte(6, BUIO), guarda: (q) => dialogo({ testata: persone[Math.min(q.eseguite.length, 5)], nomeA: 'Cc', a: POSTA[2] }) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: risposta.porte });
  assert.deepEqual([carte(risposta).length, risposta.eseguite.length], [6, 6]);
});

test('U2 (the reviewer\'s K5-13): an unreadable recipient, the screen changes and comes back: the yes of the window is gone, a new card', async () => {
  const st = { altro: false };
  const schermo = () => ({ frenoArmato: true, app: 'outlook', titolo: 'Posta', elementi: [el('a', 'campo', 'A', { valore: '' }),
    ...(st.altro ? [el('n', 'testo', 'Nuova mail arrivata')] : []), el('w', 'finestra', 'Invia', { modale: true }),
    el('t', 'testo', 'Inviare il messaggio senza oggetto?', { finestra: 'w' }), el('b1', 'pulsante', 'Invia', { finestra: 'w' }), el('b2', 'pulsante', 'Annulla', { finestra: 'w' })] });
  const piano = [BUIO, { tipo: 'scorri', direzione: 'giu', quantita: 1 }, { tipo: 'scorri', direzione: 'su', quantita: 1 }, BUIO];
  let i = 0;
  const p = porte({ risposte: () => (i < piano.length ? uno(piano[i++]) : null), guarda: schermo,
    agisci: (a) => { if (a.tipo === 'scorri') st.altro = a.direzione === 'giu'; return { esito: 'non-verificabile', modo: 'sottofondo' }; } });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
  assert.deepEqual([carte(p).length, p.eseguite.length], [2, 4]);
});

// ------------------------------------------------ U3 8d, the reviewer's form v-8d ------------------------------------------------
test('U3 (8d): a blinking button with a text clock and a successful action repeated in front of it closes at 4 requests, not 20', async () => {
  for (const [nome, prima] of [['nothing in front', { tipo: 'scorri', direzione: 'giu', quantita: 3 }], ['the same click that works', { tipo: 'clic', ref: 'v1' }], ['the same write that works', { tipo: 'scrivi', ref: 'cf', testo: 'x' }]]) {
    const p = porte({ risposte: () => uno(prima, { tipo: 'premi', ref: 'e9' }),
      guarda: (q) => ({ frenoArmato: true, app: 'chrome', dominio: 'sito.example', titolo: 'Lista', elementi: [el('l', 'voce', 'Riga'), el('v1', 'voce', 'Voce 1'), el('cf', 'campo', 'Filtro'),
        ...(q.catture % 2 === 1 ? [el('e9', 'pulsante', 'Carica altri')] : []), el('o', 'testo', `ore 10:00:${q.catture}`)] }) });
    const r = await eseguiCompito({ testoDellaPersona: 'carica tutto', politica: PIENO, porte: p.porte });
    assert.deepEqual([r.esito, r.motivo, p.richieste], ['non-riuscito', 'elemento-non-trovato', 4], nome);
  }
});

// ------------------------------------------------ U4 8c, the reviewer's form a ------------------------------------------------
test('U4 (8c): healthy tasks that rewrite the same field end well: an email corrected 2 to 5 times, discount codes tried 2 to 4 times', async () => {
  for (const k of [2, 3, 4, 5]) {
    const st = { v: '', ok: false, n: 0 };
    const p = porte({ risposte: () => (st.ok ? null : uno({ tipo: 'scrivi', ref: 'c0', testo: `mario${st.n}@esempio.it` }, { tipo: 'premi', ref: 'sa' })),
      guarda: () => ({ frenoArmato: true, app: 'chrome', dominio: 'modulo.example', titolo: 'Modulo', elementi: [el('c0', 'campo', 'Email', { valore: st.v }), el('sa', 'pulsante', 'Salva'),
        el('err', 'testo', st.n ? `Indirizzo non valido: ${st.v}` : '')] }),
      agisci: (a, b) => { if (a.tipo === 'scrivi') { st.v = a.testo; st.n += 1; return { esito: 'non-verificabile' }; } if (b?.ref === 'sa') { if (st.n < k) return { esito: 'rifiutata', motivo: 'altro' }; st.ok = true; } return { esito: 'non-verificabile' }; } });
    const r = await eseguiCompito({ testoDellaPersona: 'salva il modulo', politica: PIENO, porte: p.porte });
    assert.deepEqual([r.esito, st.ok], ['riuscito', true], `email ${k}`);
  }
  for (const k of [2, 3, 4]) {
    const st = { n: 0, ok: false };
    const p = porte({ risposte: () => (st.ok ? null : uno({ tipo: 'scrivi', ref: 'cs', testo: `CODICE${st.n}` }, { tipo: 'premi', ref: 'ap' })),
      guarda: () => ({ frenoArmato: true, app: 'chrome', dominio: 'negozio.example', titolo: 'Carrello', elementi: [el('cs', 'campo', 'Codice sconto'), el('ap', 'pulsante', 'Applica'), el('x', 'testo', st.n ? 'Codice non valido' : '')] }),
      agisci: (a, b) => { if (a.tipo === 'scrivi') { st.n += 1; return { esito: 'non-verificabile' }; } if (b?.ref === 'ap') { if (st.n < k) return { esito: 'rifiutata', motivo: 'altro' }; st.ok = true; } return { esito: 'non-verificabile' }; } });
    const r = await eseguiCompito({ testoDellaPersona: 'prova i codici sconto BENVENUTO, NATALE, AMICI, FEDELTA', politica: PIENO, porte: p.porte });
    assert.deepEqual([r.esito, st.ok], ['riuscito', true], `codes ${k}`);
  }
});

test('U4 (8c, the reviewer\'s «key without role»): a checkbox «Accetto» and a button «Accetto» are two elements, two progresses', async () => {
  const st = { casella: false, banner: false, prove: 0, ok: false };
  const S = { tipo: 'clic', ref: 'sa' }; const SC = { tipo: 'scorri', direzione: 'giu', quantita: 1 };
  const piano = [S, { tipo: 'clic', ref: 'kc' }, S, { tipo: 'clic', ref: 'kb' }, S, SC, S, SC, S];
  let i = 0;
  const p = porte({ risposte: () => (i < piano.length ? uno(piano[i++]) : null),
    guarda: () => ({ frenoArmato: true, app: 'chrome', dominio: 'modulo.example', titolo: 'Iscrizione', elementi: [el('kc', 'casella', 'Accetto'), el('kb', 'pulsante', 'Accetto'), el('sa', 'pulsante', 'Salva')] }),
    agisci: (a, b) => {
      if (b?.ref === 'kc') st.casella = true; if (b?.ref === 'kb') st.banner = true;
      if (b?.ref === 'sa') { st.prove += 1; if (!(st.casella && st.banner) || st.prove < 5) return { esito: 'rifiutata', motivo: 'altro' }; st.ok = true; }
      return { esito: 'non-verificabile' };
    } });
  const r = await eseguiCompito({ testoDellaPersona: 'iscriviti', politica: PIENO, porte: p.porte });
  assert.deepEqual([r.esito, st.ok], ['riuscito', true], JSON.stringify(r.storia.slice(-3)));
});

// ------------------------------------------------ U5 the guard's checkout yes and a blind click ------------------------------------------------
test('U5: after the guard\'s checkout yes, a blind click on the open payment window asks its own payment card; a targeted «Pay now» stays covered', async () => {
  const MIN = 60 * 1000;
  const cassa = ({ modale = false } = {}) => ({ frenoArmato: true, titolo: 'Checkout - Negozio', dominio: 'negozio.example', origine: 'https://negozio.example/cassa',
    elementi: [el('r0', 'testo', 'Totale 30,00 €'), el('paga', 'pulsante', 'Paga ora'), el('cc', 'voce', 'Visa •••• 4242'), el('cp', 'campo', 'Codice sconto'),
      ...(modale ? [el('w', 'finestra', 'Conferma acquisto', { modale: true }), el('wt', 'testo', 'Confermi l\'acquisto? Totale 30,00 €', { finestra: 'w' }),
        el('wb', 'pulsante', 'Conferma', { finestra: 'w' }), el('wa', 'pulsante', 'Annulla', { finestra: 'w' })] : [])] });
  const NEG = { testoDellaPersona: 'compra le cuffie', piano: { domini: ['negozio.example'], app: [] }, guardia: { accesa: true, aggiunti: ['negozio.example'] }, limiti: { millisecondi: 60 * MIN } };
  const corri = async (piano, modale, politica) => {
    let i = 0;
    const p = porte({ risposte: () => (i < piano.length ? uno(piano[i++]) : null), guarda: () => cassa({ modale }), agisci: () => ({ esito: 'confermata' }) });
    await eseguiCompito({ ...NEG, politica, porte: p.porte });
    return [carte(p).length, p.domande.filter((q) => q.motivo === 'guardia').length, p.eseguite.length];
  };
  const CODICE = { tipo: 'scrivi', ref: 'cp', testo: 'BENVENUTO' };
  // the code, then «Conferma» clicked blind on the window already open: the guard card and ONE payment card (before: the guard card only)
  assert.deepEqual(await corri([CODICE, BUIO], true, NORMALE), [1, 1, 2]);
  assert.deepEqual(await corri([CODICE, BUIO], true, PIENO), [1, 1, 2]);
  // a blind double click: two payment cards in Normal, one in Full access (one card for the same payment)
  assert.deepEqual(await corri([CODICE, BUIO, BUIO], true, NORMALE), [2, 1, 3]);
  // the code, then «Pay now» TARGETED: still covered by the guard's checkout yes
  assert.deepEqual(await corri([CODICE, { tipo: 'premi', ref: 'paga' }], false, NORMALE), [0, 1, 2]);
});
