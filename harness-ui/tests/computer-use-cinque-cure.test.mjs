/**
 * 0.2.2-CU, the five small cures after the round-4 reviewer (yellow verdict of 11/11/2026; owner yes via the judge, 11/11 07:47-07:52).
 * - C5-1 (F2 on the send): with a remembered yes, «Send the message without a subject?» clicked blind 20 times sent 20 messages under
 *   ONE card, because the old remembered yes of the page (T2) answered first and had no cap of uses; and the recipient was read only
 *   from the header, so a generic header («New message») with the real address in the «To» field changing at every click sent six
 *   messages to six people with one yes. Now the yes of a blind click has a cap (3 more sends after the approved one) and the recipient
 *   is read from the «To» field too: another recipient asks again.
 * - C5-2: the line of `guarda` that drops a remembered payment yes as soon as the screen changes had no test (mutant K4-P6f alive): a
 *   «Payment successful» notice that shows behind the dialog during a wait and goes away is a second payment, and asks again.
 * - C5-3 (8c): the progress of a task was keyed on the element reference, which the helper renumbers at every capture; the same useless
 *   click counted as new progress every time (3-a: 6 requests became 20) and so did a field rewritten with another text (3-c: 3 → 20).
 *   The key is now kind | role | name: the same element filled again is not progress. A click on a NEW box still is (mutant K4-8c-b).
 * - C5-4 (8d): a page reader whose pages differ only in plain text was closed at page 4 of 16 (the forgiveness ignored plain texts so
 *   that a clock would not count as a new screen). Plain texts count again when they follow an action that worked. A screen that changes
 *   only in its title (a keyboard page-down) is a new screen too (mutant K4-8d-a).
 * - C5-5 lives in G4-6 (the «I can» row with another title of the window: mutant K4-A2).
 * Fake ports only: no screen, no helper, no model. Hermes re-captures and checks the result before any retry
 * (tools/computer_use/tool.py:521-563); Codex asks again when the key of the approved action changes
 * (codex-rs/core/src/tools/sandboxing.rs:66-97).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito } from '../src/computer-use/ciclo.mjs';
import { POLITICHE } from '../src/computer-use/protezioni.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO } = POLITICHE;
const BUIO = { tipo: 'clic', x: 5, y: 5 }; // a coordinate click with no element under the point
const uno = (...azioni) => ({ azioni });
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });

function porte({ risposte = [], guarda, agisci = () => ({ esito: 'non-verificabile', modo: 'sottofondo' }), carta = () => 'si', ...altro } = {}) {
  let k = 0;
  const p = { eseguite: [], domande: [], richieste: 0, catture: 0, ora: 0 };
  p.porte = {
    guarda: async () => { p.catture += 1; return guarda(p); },
    chiedi: async () => { p.richieste += 1; const r = typeof risposte === 'function' ? risposte(p) : (k < risposte.length ? risposte[k++] : null); return r ?? { fine: { riuscito: true } }; },
    agisci: async (azione, bersaglio) => { const r = await agisci(azione, bersaglio, p); p.eseguite.push(azione.tipo); return r; },
    bersaglio: (azione, s) => (azione.ref != null && azione.ref !== '' ? s.elementi.find((e) => e.ref === azione.ref) ?? null : null),
    chiediPersona: async (q) => { p.domande.push(q); return carta(q, p); },
    attendi: async () => {}, emetti: () => {},
    adesso: () => { p.ora += 10; return p.ora; },
    ...altro,
  };
  return p;
}
const corsa = (p, politica, testoDellaPersona) => eseguiCompito({ testoDellaPersona, politica, porte: p.porte });
const carte = (p) => p.domande.filter((q) => q.motivo === 'conferma');

// ------------------------------------------------ C5-1 F2 on the send ------------------------------------------------
const POSTA = ['marco@esempio.it', 'banca@esempio.it', 'capo@esempio.it', 'tutti@esempio.it', 'lista@esempio.it', 'giulia@esempio.it'];
/** the reviewer's compose window: a header behind it, the «A» (To) field, the dialog «send without a subject?» */
const scrivi = (testata, a) => ({ frenoArmato: true, app: 'outlook', titolo: 'Posta', elementi: [...(testata ? [el('h', 'intestazione', testata)] : []),
  el('a', 'campo', 'A', { valore: a }), el('w', 'finestra', 'Invia', { modale: true }),
  el('t', 'testo', 'Inviare il messaggio senza oggetto?', { finestra: 'w' }), el('b1', 'pulsante', 'Invia', { finestra: 'w' }), el('b2', 'pulsante', 'Annulla', { finestra: 'w' })] });

test('C5-1 (F2): 20 blind sends to the same recipient: a card every 4 sends (the approved one and at most 3 more), never 20 under one yes', async () => {
  let k = 0;
  const p = porte({ risposte: () => (++k <= 20 ? uno(BUIO) : null), guarda: () => scrivi('Marco', POSTA[0]) });
  const r = await corsa(p, NORMALE, 'manda le mail');
  assert.deepEqual([carte(p).length, p.eseguite.length], [5, 20], JSON.stringify(r.storia.slice(-3)));
  assert.ok(carte(p).every((q) => q.protezione === 'invio'));
});

test('C5-1 (F2): the recipient is read from the «A/To» field too: another address there is another send and asks again', async () => {
  for (const testata of ['Nuovo messaggio', 'Marco', null]) {
    let k = 0;
    const p = porte({ risposte: () => (++k <= 6 ? uno(BUIO) : null), guarda: (q) => scrivi(testata, POSTA[Math.min(q.eseguite.length, 5)]) });
    await corsa(p, NORMALE, 'manda le mail');
    assert.deepEqual([carte(p).length, p.eseguite.length], [6, 6], `header ${testata}`);
  }
  // the same address in the field and the same header: the yes is remembered as before (one card, then 3 more sends)
  let k = 0;
  const stesso = porte({ risposte: () => (++k <= 4 ? uno(BUIO) : null), guarda: () => scrivi('Nuovo messaggio', POSTA[0]) });
  await corsa(stesso, NORMALE, 'manda le mail');
  assert.deepEqual([carte(stesso).length, stesso.eseguite.length], [1, 4]);
});

test('C5-1 (F2): an EMPTY «A/To» field and no header is still a recipient that cannot be read: the yes holds only while the whole screen stays the same', async () => {
  const vuoto = (corpo) => { const s = scrivi(null, ''); return { ...s, elementi: [el('m', 'campo', 'Messaggio', { valore: corpo }), ...s.elementi] }; };
  let k = 0;
  const p = porte({ risposte: () => (++k <= 3 ? uno(BUIO) : null), guarda: (q) => vuoto(`bozza ${q.eseguite.length}`) });
  await corsa(p, NORMALE, 'manda le mail');
  assert.deepEqual([carte(p).length, p.eseguite.length], [3, 3]);
});

test('C5-1 (F2): the yes of the page (a pressed «Send» button) reads the «A/To» field too: the same address is covered, another address asks again', async () => {
  const bozza = (a) => ({ frenoArmato: true, app: 'outlook', titolo: 'Posta', elementi: [el('h', 'intestazione', 'Nuovo messaggio'), el('a', 'campo', 'A', { valore: a }), el('inv', 'pulsante', 'Invia')] });
  for (const [nome, indirizzo, attese] of [['the same address', () => POSTA[0], 1], ['another address after the first send', (q) => POSTA[Math.min(q.eseguite.length, 1)], 2]]) {
    const p = porte({ risposte: [uno({ tipo: 'premi', ref: 'inv' }), uno({ tipo: 'premi', ref: 'inv' })], guarda: (q) => bozza(indirizzo(q)) });
    await corsa(p, NORMALE, 'manda le mail');
    assert.deepEqual([carte(p).length, p.eseguite.length], [attese, 2], nome);
  }
});

// ------------------------------------------------ C5-2 the line of `guarda` ------------------------------------------------
test('C5-2 (K4-P6f): Full access, a «Payment successful» notice shows behind the purchase dialog during a wait and goes away: the next click is another payment, a new card', async () => {
  const acquisto = (avviso) => ({ frenoArmato: true, app: 'chrome', dominio: 'negozio.example', titolo: 'Cassa', elementi: [
    ...(avviso ? [el('a', 'voce', 'Pagamento riuscito')] : []), el('w', 'finestra', 'Conferma acquisto', { modale: true }),
    el('t0', 'testo', 'Confermi l\'acquisto? Questa operazione non può essere annullata.', { finestra: 'w' }), el('t1', 'testo', 'Totale 499,00 €', { finestra: 'w' }),
    el('b1', 'pulsante', 'Paga ora', { finestra: 'w' }), el('b2', 'pulsante', 'Annulla', { finestra: 'w' })] });
  let k = 0; let avvisoAllaCattura = -1;
  const p = porte({
    risposte: () => { k += 1; return k === 1 || k === 3 ? uno(BUIO) : (k === 2 ? uno({ tipo: 'aspetta', secondi: 1 }) : null); },
    guarda: (q) => acquisto(q.catture === avvisoAllaCattura),
    agisci: (azione, b, q) => { if (q.eseguite.length === 0) avvisoAllaCattura = q.catture + 1; return { esito: 'non-verificabile' }; },
  });
  const r = await corsa(p, PIENO, 'compra le cuffie');
  assert.deepEqual([r.esito, carte(p).length, p.eseguite.filter((t) => t === 'clic').length], ['riuscito', 2, 2], JSON.stringify(r.storia));
  // a payment page with a «To» field (a gift card to an address) that stays the same: still ONE card for the same payment in Full access
  const regalo = () => ({ ...acquisto(false), elementi: [el('a', 'campo', 'A', { valore: 'giulia@esempio.it' }), ...acquisto(false).elementi] });
  let j = 0;
  const p2 = porte({ risposte: () => (++j <= 3 ? uno(BUIO) : null), guarda: regalo });
  await corsa(p2, PIENO, 'compra le cuffie');
  assert.deepEqual([carte(p2).length, p2.eseguite.length], [1, 3]);
});

// ------------------------------------------------ C5-3 8c without the reference ------------------------------------------------
const MOD = (extra = []) => ({ frenoArmato: true, app: 'chrome', dominio: 'modulo.example', titolo: 'Modulo', elementi: [el('c0', 'campo', 'Nome'), el('sa', 'pulsante', 'Salva'), ...extra] });
const rifiutaSalva = (azione, b) => (b?.ref === 'sa' ? { esito: 'rifiutata', motivo: 'altro' } : { esito: 'non-verificabile' });
const SALVA = { tipo: 'premi', ref: 'sa' };

test('C5-3 (8c, 3-a): the same useless click on an element the helper renumbers at every capture is not progress: closed at 6 requests, as before round 4', async () => {
  const p = porte({ risposte: (q) => (q.richieste % 2 ? uno({ tipo: 'clic', ref: `r${q.catture}` }) : uno(SALVA)), guarda: (q) => MOD([el(`r${q.catture}`, 'voce', 'Voce 1')]), agisci: rifiutaSalva });
  const r = await corsa(p, PIENO, 'salva il modulo');
  assert.deepEqual([r.esito, r.motivo, p.richieste], ['non-riuscito', 'elemento-non-risponde', 6], JSON.stringify(r.storia.slice(-3)));
});

test('C5-3 (8c, 3-c): the same field written again with another text is progress at most 3 times: closed at 5 requests (3 before round 4, 20 in round 4)', async () => {
  // last round (the reviewer's form a): a corrected field is progress, up to 3 times per element, so a healthy task that corrects an
  // email 5 times ends well; the price is 2 more requests on this broken loop
  const p = porte({ risposte: (q) => uno({ tipo: 'scrivi', ref: 'c0', testo: `tentativo ${q.richieste}` }, SALVA), guarda: () => MOD(), agisci: rifiutaSalva });
  const r = await corsa(p, PIENO, 'salva il modulo');
  assert.deepEqual([r.esito, r.motivo, p.richieste], ['non-riuscito', 'elemento-non-risponde', 5], JSON.stringify(r.storia.slice(-3)));
});

test('C5-3 (8c, K4-8c-b): a click on a NEW box is progress: «Save» refused three times NOT in a row with three boxes ticked in between ends well', async () => {
  const stato = { spuntate: new Set(), salvato: false };
  const caselle = ['Accetto i termini', 'Ho più di 18 anni', 'Confermo i dati'];
  const piano = [SALVA, { tipo: 'clic', ref: 'k0' }, SALVA, { tipo: 'clic', ref: 'k1' }, SALVA, { tipo: 'clic', ref: 'k2' }, SALVA];
  let i = 0;
  const p = porte({ risposte: () => (i < piano.length ? uno(piano[i++]) : null), guarda: () => MOD(caselle.map((n, k) => el(`k${k}`, 'casella', n))),
    agisci: (azione, b) => {
      if (b?.ruolo === 'casella') { stato.spuntate.add(b.ref); return { esito: 'non-verificabile' }; }
      if (b?.ref === 'sa') { if (stato.spuntate.size < 3) return { esito: 'rifiutata', motivo: 'altro' }; stato.salvato = true; }
      return { esito: 'non-verificabile' };
    } });
  const r = await corsa(p, PIENO, 'compila e salva');
  assert.deepEqual([r.esito, r.motivo, stato.salvato], ['riuscito', 'completato', true], JSON.stringify(r.storia.slice(-3)));
});

// ------------------------------------------------ C5-4 8d and the page reader ------------------------------------------------
test('C5-4 (8d, 6-b): a reader of 16 pages that differ only in plain text, [Next, Next] per request, «Next» back one capture later: all 16 pages, as before round 4', async () => {
  const st = { pag: 0, via: -1 };
  const p = porte({ risposte: () => (st.pag >= 16 ? null : uno({ tipo: 'premi', ref: 'av' }, { tipo: 'premi', ref: 'av' })),
    guarda: (q) => ({ frenoArmato: true, app: 'lettore', titolo: 'Libro', elementi: [el('t', 'testo', `Pagina ${st.pag}: testo del capitolo ${st.pag}`), el('ind', 'pulsante', 'Indietro'),
      ...(q.catture > st.via ? [el('av', 'pulsante', 'Avanti')] : [])] }),
    agisci: (azione, b, q) => { st.pag += 1; st.via = q.catture + 1; return { esito: 'non-verificabile' }; } });
  const r = await corsa(p, PIENO, 'leggi il libro');
  assert.deepEqual([r.esito, r.motivo, st.pag], ['riuscito', 'completato', 16], JSON.stringify(r.storia.slice(-3)));
});

test('C5-4 (8d, K4-8d-a): a document whose pages differ only in the window title (page-down with the keyboard), a late «Mark» button: a new screen every page', async () => {
  const st = { pag: 1 };
  const p = porte({ risposte: () => (st.pag >= 6 ? null : uno({ tipo: 'tasti', combinazione: 'pagedown' }, { tipo: 'premi', ref: 'e9' })),
    guarda: (q) => ({ frenoArmato: true, app: 'lettore-pdf', titolo: `Relazione.pdf — pagina ${st.pag}`, elementi: [el('l', 'immagine', 'Pagina'),
      ...(q.catture % 2 === 1 ? [el('e9', 'pulsante', 'Segna')] : [])] }),
    agisci: (azione) => { if (azione.tipo === 'tasti') st.pag += 1; return { esito: 'non-verificabile' }; } });
  const r = await corsa(p, PIENO, 'leggi il documento');
  assert.deepEqual([r.esito, r.motivo, st.pag, carte(p).length], ['riuscito', 'completato', 6, 0], JSON.stringify(r.storia.slice(-3)));
});
