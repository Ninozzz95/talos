/*
 * Decisione 116, variante C (owner 04/11/2026; forma `FORMA-116-RINNOVO-C-2026-11-04.md`) — il PC:
 *   - la riga VIVA «Rinnovo l'accesso a ChatGPT…» sul canale dei ritentativi, coi secondi che passano;
 *   - la riga QUIETA (`talos.accesso-chatgpt`) nel posto della compattazione, una per evento (la rigiocata non la raddoppia);
 *   - la scheda dello stato 3 senza codice e senza «Testo del server»: «Accedi e riprendi» o «Riprova», e «Altro modello…»;
 *   - la ripresa UNA volta dopo l'accesso riuscito; nessuna se annullato o se un giro è in corso;
 *   - (Desktop 14:41, allineamento col telefono) la scheda di un giro già ripreso resta come FRASE senza pulsanti, anche dopo un reload;
 *   - la carta dei permessi di `chatgpt_account` `sign_in` con la sua frase;
 *   - i testi in inglese e in italiano.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { riduciRetry, testoRetry } from '../../src/components/provider-retry.js';
import { spiegaErrore } from '../../src/components/errori.js';
import { creaNotaErrore } from '../../src/components/conversazione.js';
import * as separatore from '../../src/components/context-separator.js'; // namespace: each test reds on its own
const aggiornaRigaAccessoChatgpt = (...a) => separatore.aggiornaRigaAccessoChatgpt(...a);
const testoRigaAccessoChatgpt = (...a) => separatore.testoRigaAccessoChatgpt(...a);
import * as scheda from '../../src/components/accesso-chatgpt-scheda.js'; // namespace: a missing export reds only its test
const { creaRipresaDopoAccesso, creaSchedeAccesso, schedaDallAttrezzo, schedaPerCodice } = scheda;
import { testiCartaFornitori, creaBloccoCartaFornitori } from '../../src/components/fornitori-carta.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';
import { documento, clic } from './aiuto-dom-blocchi.mjs';

const start = { type: 'RunStarted', runId: 'run1', threadId: 'thread1' };
const viva = (extra = {}, sequenza = 2) => ({ type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: sequenza, value: {
  schema: 'talos.provider-retry.v1', runId: 'run1', threadId: 'thread1', requestId: 'req-rinnovo', fase: 'invio',
  tentativo: 1, tentativiMassimi: 1, at: 100_000, canale: 'rinnovo-accesso', ...extra,
} });
const conLingua = (lingua, corpo) => { impostaLingua(lingua); try { return corpo(); } finally { impostaLingua('it'); } };

test('R116-FE-01 — the live row: the renewal channel enters the retry banner with its title, its reason and the seconds since it began', () => {
  const s = riduciRetry(riduciRetry(null, start), viva());
  assert.ok(s.retry, 'the renewal event passes the validation');
  assert.equal(s.retry.canale, 'rinnovo-accesso');
  const en = testoRetry(s.retry, 103_400, true);
  assert.equal(en.titolo, 'Renewing your ChatGPT sign-in');
  assert.equal(en.motivo, 'The sign-in expired during the turn: TALOS renews it and picks up on its own.');
  assert.equal(en.tempo, '3 s');
  const it = testoRetry(s.retry, 100_000, false);
  assert.equal(it.titolo, 'Rinnovo l’accesso a ChatGPT');
  assert.equal(it.tempo, '0 s');
  assert.doesNotMatch(JSON.stringify([en, it]), /401|HTTP|CHATGPT_/u, 'no status, no code');
  // the end of the renewal closes it
  assert.equal(riduciRetry(s, viva({ fase: 'fine' }, 3)).retry, null);
});

test('R116-FE-02 AL CONTRARIO — a renewal row with a status, without its start time or with a waiting phase does not enter', () => {
  const s = riduciRetry(null, start);
  for (const storta of [{ httpStatus: 401 }, { at: undefined }, { at: 'adesso' }, { fase: 'attesa', retryAt: 200_000 }, { tentativo: 0 }, { tentativiMassimi: 0 }, { requestId: '' }]) {
    assert.equal(riduciRetry(s, viva(storta)).retry, null, JSON.stringify(storta));
  }
  // the phone fields are additive: the PC ignores them
  assert.ok(riduciRetry(s, viva({ chiedeTokenAllApp: true, impronta: '0123456789abcdef' })).retry);
});

test('R116-FE-03 — the card of state 3: the sign-in that no longer works ⇒ «Sign in and resume»; ChatGPT out of reach ⇒ «Try again»; no code, no «Server text»', () => {
  conLingua('en', () => {
    for (const codice of ['CHATGPT_ACCESSO_NON_VALIDO', 'CHATGPT_ACCESSO_SCADUTO']) {
      const s = spiegaErrore('The ChatGPT sign-in is no longer valid.', codice);
      assert.equal(s.schedaAccesso, 'accedi', codice);
      assert.equal(s.perche, 'TALOS tried to renew your ChatGPT sign-in, but it is no longer valid.');
      assert.equal(s.senzaTestoDelServer, true);
      assert.deepEqual(s.rimedi, [], 'the buttons are the remedies');
    }
    for (const codice of ['CHATGPT_RETE', 'CHATGPT_RINNOVO_FALLITO']) {
      const s = spiegaErrore('down', codice);
      assert.equal(s.schedaAccesso, 'riprova', codice);
      assert.equal(s.perche, 'I can’t reach ChatGPT to renew the sign-in. Your sign-in is kept: try again in a moment.');
      assert.equal(s.senzaTestoDelServer, true);
    }
    // AL CONTRARIO: the usage limit and the other plan codes stay the note of today
    const limite = spiegaErrore('limit', 'CHATGPT_LIMITE_DEL_PIANO');
    assert.equal(limite.schedaAccesso, undefined);
    assert.notEqual(limite.senzaTestoDelServer, true);
  });
  assert.equal(schedaPerCodice('CHATGPT_ACCESSO_NON_VALIDO'), 'accedi');
  assert.equal(schedaPerCodice('CHATGPT_RETE'), 'riprova');
  assert.equal(schedaPerCodice('CHATGPT_LIMITE_DEL_PIANO'), null);
  assert.equal(schedaPerCodice(undefined), null);
});

test('R116-FE-04 — the card is drawn without «Server text» when the explanation says so; with the server text otherwise (as today)', () => {
  const doc = documento();
  const senza = creaNotaErrore({ spiegazione: { cosa: 'x', perche: 'y', rimedi: [], tecnico: '[CHATGPT_ACCESSO_NON_VALIDO] raw', senzaTestoDelServer: true } },
    { document: doc, azioni: [['Sign in and resume', () => {}], ['Other model…', () => {}]] });
  assert.equal(senza.querySelectorAll('details').length, 0, 'no «Server text»');
  assert.doesNotMatch(senza.textContent, /CHATGPT_|raw/u);
  assert.equal(senza.querySelectorAll('button').length, 2);
  const con = creaNotaErrore({ spiegazione: { cosa: 'x', perche: 'y', rimedi: [], tecnico: '[CHATGPT_LIMITE_DEL_PIANO] raw' } }, { document: doc });
  assert.equal(con.querySelectorAll('details').length, 1, 'AL CONTRARIO: the other notes keep it');
});

test('R116-FE-05 — the resume after the sign-in: once, only when armed, only with no turn running, only for the same conversation', async () => {
  const riprese = [];
  let inCorso = false;
  const ripresa = creaRipresaDopoAccesso({ riprendi: async (perche) => { riprese.push(perche); }, giroInCorso: () => inCorso });
  assert.equal(await ripresa.accessoRiuscito({ sessionId: 's1' }), false, 'not armed: a sign-in from the Providers screen alone resumes nothing');
  ripresa.arma({ sessionId: 's1' });
  assert.equal(await ripresa.accessoRiuscito({ sessionId: 's1' }), true);
  assert.equal(await ripresa.accessoRiuscito({ sessionId: 's1' }), false, 'signed in twice ⇒ one resume');
  assert.deepEqual(riprese, ['accesso-rifatto']);
  ripresa.arma({ sessionId: 's1' });
  ripresa.annulla(); // the sign-in was cancelled
  assert.equal(await ripresa.accessoRiuscito({ sessionId: 's1' }), false);
  ripresa.arma({ sessionId: 's1' });
  inCorso = true;
  assert.equal(await ripresa.accessoRiuscito({ sessionId: 's1' }), false, 'a turn is running: no second turn');
  inCorso = false;
  ripresa.arma({ sessionId: 's1' });
  assert.equal(await ripresa.accessoRiuscito({ sessionId: 's2' }), false, 'another conversation is open: it does not resume this one');
  assert.deepEqual(riprese, ['accesso-rifatto']);
});

/* La conversazione rigiocata dopo un reload, come la ridisegna app.js: la nota dell'errore nasce al RunError, ogni RunStarted chiude la
   scheda viva (`schedeAccesso.giroNuovo()`, accanto alla carta del rifiuto). */
function rigioca(eventi, { doc, schede }) {
  const chat = doc.createElement('div');
  for (const e of eventi) {
    if (e.type === 'RunStarted') schede.giroNuovo();
    if (e.type === 'RunError') {
      const spiegazione = spiegaErrore(e.message, e.code);
      const tipo = spiegazione.schedaAccesso;
      const nota = creaNotaErrore({ spiegazione }, { document: doc, azioni: tipo ? [[tipo === 'accedi' ? 'Accedi e riprendi' : 'Riprova', () => {}], ['Altro modello…', () => {}]] : [] });
      chat.append(nota);
      if (tipo) schede.apri(nota, { tipo, sessionId: 's1' });
    }
    if (e.type === 'CUSTOM' && e.name === separatore.EVENTO_ACCESSO_CHATGPT) aggiornaRigaAccessoChatgpt(chat, e.value, { sessionId: 's1', document: doc });
  }
  return chat;
}

test('R116-FE-06 (Desktop 14:41) — after a reload the old card has no buttons: it reads «no longer valid» → «Signed in again, picking up from here»; only the last turn keeps them', () => {
  const doc = documento();
  const ripresa = creaRipresaDopoAccesso({ riprendi: async () => {} });
  const schede = creaSchedeAccesso({ ripresa });
  const eventi = [
    { type: 'RunStarted', runId: 'r1', threadId: 's1' },
    { type: 'RunError', runId: 'r1', code: 'CHATGPT_ACCESSO_NON_VALIDO', message: 'The ChatGPT sign-in is no longer valid.' },
    { type: 'RunStarted', runId: 'r2', threadId: 's1' },
    { type: 'CUSTOM', name: 'talos.accesso-chatgpt', value: { schema: 'talos.accesso-chatgpt.v1', threadId: 's1', runId: 'r2', esito: 'rientrato', allInvio: false, testo: 'Signed in again, picking up from here', at: '2026-11-04T14:00:00.000Z' } },
    { type: 'RunFinished', runId: 'r2' },
  ];
  const chat = conLingua('it', () => rigioca(eventi, { doc, schede }));
  const note = chat.querySelectorAll('.talos-system-note');
  assert.equal(note.length, 1);
  assert.equal(note[0].querySelectorAll('button').length, 0, 'the card of a resumed turn is a sentence, without buttons');
  assert.match(note[0].textContent, /non vale più/u);
  assert.equal(ripresa.armata(), false, 'and a later sign-in from the Providers screen resumes nothing');
  assert.match(chat.textContent, /Accesso rifatto, riprendo da qui/u);
  // AL CONTRARIO: when the failed turn is the last one, the card keeps its buttons (after a reload too) and arms the resume
  const doc2 = documento();
  const ripresa2 = creaRipresaDopoAccesso({ riprendi: async () => {} });
  const ultima = conLingua('it', () => rigioca(eventi.slice(0, 2), { doc: doc2, schede: creaSchedeAccesso({ ripresa: ripresa2 }) }));
  assert.equal(ultima.querySelectorAll('.talos-system-note')[0].querySelectorAll('button').length, 2);
  assert.equal(ripresa2.armata(), true);
});

test('R116-FE-06b — app.js closes the live card at every RunStarted, next to the refusal card, and resumes after a sign-in from the Providers screen too', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /chiudiCartaRifiuto\(\{ consegna: domandaDelGiro, modello: evento\.contesto\?\.modello \}\); \/\/ FE-051\s*\n\s*schedeAccesso\.giroNuovo\(\);/u);
  assert.match(app, /ripresaDopoAccesso\.accessoRiuscito\(\{ sessionId: state\.realSession\.id \}\)/u, 'the sign-in from the Providers screen resumes an armed card');
  assert.match(app, /ripresaDopo: 'rete-tornata'/u, '«Try again» resumes with its reason');
  assert.match(app, /schedaDallAttrezzo\(/u, 'the card born from the model tool');
});

test('R116-FE-07 — the quiet row: one per event (the replay does not double it), the sentence of each outcome in both languages', () => {
  const doc = documento();
  const chat = doc.createElement('div');
  const valore = { schema: 'talos.accesso-chatgpt.v1', esito: 'ripreso', allInvio: false, at: '2026-11-04T14:00:00.000Z' };
  aggiornaRigaAccessoChatgpt(chat, valore, { sessionId: 's1', document: doc });
  aggiornaRigaAccessoChatgpt(chat, valore, { sessionId: 's1', document: doc });
  assert.equal(chat.querySelectorAll('[data-accesso-chatgpt]').length, 1);
  aggiornaRigaAccessoChatgpt(chat, { ...valore, at: '2026-11-04T14:05:00.000Z', esito: 'rinnovato' }, { sessionId: 's1', document: doc });
  assert.equal(chat.querySelectorAll('[data-accesso-chatgpt]').length, 2);
  assert.equal(aggiornaRigaAccessoChatgpt(chat, { ...valore, esito: 'inventato', at: 'x' }, { sessionId: 's1', document: doc }), null, 'an unknown outcome draws nothing');
  const attese = {
    en: { rinnovato: 'ChatGPT sign-in renewed, continuing', ripreso: 'The ChatGPT sign-in had expired: renewed, picking up from here',
      rientrato: 'Signed in again, picking up from here', rientratoInvio: 'Signed in again, sending your message',
      raggiunto: 'ChatGPT reached again, picking up from here', raggiuntoInvio: 'ChatGPT reached again, sending your message' },
    it: { rinnovato: 'Accesso a ChatGPT rinnovato, continuo', ripreso: 'L’accesso a ChatGPT era scaduto: rinnovato, riprendo da qui',
      rientrato: 'Accesso rifatto, riprendo da qui', rientratoInvio: 'Accesso rifatto, mando il tuo messaggio',
      raggiunto: 'ChatGPT di nuovo raggiungibile, riprendo da qui', raggiuntoInvio: 'ChatGPT di nuovo raggiungibile, mando il tuo messaggio' },
  };
  for (const lingua of ['en', 'it']) {
    conLingua(lingua, () => {
      const a = attese[lingua];
      assert.equal(testoRigaAccessoChatgpt({ esito: 'rinnovato' }), a.rinnovato);
      assert.equal(testoRigaAccessoChatgpt({ esito: 'ripreso' }), a.ripreso);
      assert.equal(testoRigaAccessoChatgpt({ esito: 'rientrato', allInvio: false }), a.rientrato);
      assert.equal(testoRigaAccessoChatgpt({ esito: 'rientrato', allInvio: true }), a.rientratoInvio);
      assert.equal(testoRigaAccessoChatgpt({ esito: 'raggiunto', allInvio: false }), a.raggiunto);
      assert.equal(testoRigaAccessoChatgpt({ esito: 'raggiunto', allInvio: true }), a.raggiuntoInvio);
    });
  }
});

test('R116-FE-08 — the card born from the model tool: only chatgpt_account sign_in that succeeded AND whose result says the card is there (schedaChatgpt)', () => {
  const si = { schedaChatgpt: true };
  assert.equal(schedaDallAttrezzo({ nome: 'chatgpt_account', argomenti: { action: 'sign_in' }, ...si }), true);
  assert.equal(schedaDallAttrezzo({ nome: 'chatgpt_account', argomenti: { action: ' SIGN_IN ' }, ...si }), true);
  assert.equal(schedaDallAttrezzo({ nome: 'chatgpt_account', argomenti: { action: 'sign_in' }, fallita: true, ...si }), false, 'an error result: no card');
  assert.equal(schedaDallAttrezzo({ nome: 'chatgpt_account', argomenti: { action: 'sign_in' }, negata: true, ...si }), false, 'the card was denied: no card');
  assert.equal(schedaDallAttrezzo({ nome: 'chatgpt_account', argomenti: { action: 'status' }, ...si }), false);
  assert.equal(schedaDallAttrezzo({ nome: 'provider_allow', argomenti: { action: 'sign_in' }, ...si }), false);
  // Desktop 15:31: without the signal («Nothing to do» with a valid sign-in, a guest that gives only text, an old guest) no card
  for (const segno of [undefined, false, 'true', 1]) assert.equal(schedaDallAttrezzo({ nome: 'chatgpt_account', argomenti: { action: 'sign_in' }, schedaChatgpt: segno }), false, String(segno));
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /schedaDallAttrezzo\(\{ nome: info\.nome, argomenti: info\.argomentiParsati, fallita: fallito, negata: dettoNo, schedaChatgpt: evento\.schedaChatgpt \}\)/u, 'app.js reads the signal from the ToolCallResult');
});

test('R116-FE-09 — the permission card of sign_in says what it does, without the before → after of the disconnection', () => {
  conLingua('en', () => {
    const t = testiCartaFornitori({ tipo: 'chatgpt_account', azione: 'sign_in', fornitore: 'chatgpt', email: 'nino@example.com' });
    assert.equal(t.perche, 'Put the ChatGPT sign-in in the conversation? You sign in from it, and the turn picks up after.');
    assert.equal(t.bersaglio, 'nino@example.com');
    const blocco = creaBloccoCartaFornitori(documento(), { tipo: 'chatgpt_account', azione: 'sign_in' });
    assert.equal(blocco.textContent, '');
    // AL CONTRARIO: disconnect stays as today
    assert.match(testiCartaFornitori({ tipo: 'chatgpt_account', fornitore: 'chatgpt' }).perche, /^Disconnect ChatGPT\?/u);
  });
});

test('R116-FE-10 — every new text exists in English and in Italian, keys without hyphens, and never a code in them', () => {
  const chiavi = ['renewed', 'resumed', 'renewingTitle', 'renewingReason', 'seconds', 'signedInAgain', 'signedInAgainSending', 'reachedAgain',
    'reachedAgainSending', 'triedToRenew', 'cannotReach', 'signInAndResume', 'tryAgain'].map((k) => `chat.chatgptAccess.${k}`);
  for (const k of [...chiavi, 'varie.providerCard.chatgptSignIn']) {
    assert.equal(typeof TESTI.en[k], 'string', `EN ${k}`);
    assert.equal(typeof TESTI.it[k], 'string', `IT ${k}`);
    assert.doesNotMatch(k, /-/u);
    assert.doesNotMatch(`${TESTI.en[k]} ${TESTI.it[k]}`, /CHATGPT_|401|HTTP/u);
  }
  assert.equal(TESTI.en['chat.chatgptAccess.signInAndResume'], 'Sign in and resume');
  assert.equal(TESTI.it['chat.chatgptAccess.signInAndResume'], 'Accedi e riprendi');
});

test('R116-FE-11 — the live card: a click on its first button is the person\'s gesture (a click is wired), and closing it removes the buttons from the DOM', () => {
  const doc = documento();
  let cliccato = 0;
  const nota = creaNotaErrore({ spiegazione: { cosa: 'x', perche: 'y', rimedi: [], senzaTestoDelServer: true } }, { document: doc, azioni: [['Accedi e riprendi', () => { cliccato += 1; }]] });
  clic(nota.querySelectorAll('button')[0]);
  assert.equal(cliccato, 1);
  const schede = creaSchedeAccesso();
  schede.apri(nota, { tipo: 'accedi' });
  schede.giroNuovo();
  assert.equal(nota.querySelectorAll('button').length, 0);
  assert.equal(nota.dataset.schedaAccessoChiusa, '');
  assert.equal(schede.viva(), null);
});

test('R116-FE-12 (Desktop 15:07, with the Mobile) — the card born from the tool has no «tried to renew» sentence and no new text; the state-3 card has it', () => {
  for (const lingua of ['en', 'it']) {
    conLingua(lingua, () => {
      const tentato = TESTI[lingua]['chat.chatgptAccess.triedToRenew'];
      const doc = documento();
      const dallAttrezzo = scheda.creaSchedaDallAttrezzo({ document: doc, toolCallId: 'call-1',
        azioni: [[TESTI[lingua]['chat.chatgptAccess.signInAndResume'], () => {}], [TESTI[lingua]['chat.retry.planLimit.otherModel'], () => {}]] });
      assert.ok(!dallAttrezzo.textContent.includes(tentato), `${lingua}: no renewal was tried`);
      assert.equal(dallAttrezzo.querySelectorAll('.assistant-copy').length, 0, 'no sentence at all, not even an empty one');
      assert.match(dallAttrezzo.textContent, lingua === 'en' ? /ChatGPT plan/u : /Piano ChatGPT/u, 'the plan dressing');
      assert.equal(dallAttrezzo.querySelectorAll('button').length, 2, '«Sign in and resume» + «Other model…»');
      assert.equal(dallAttrezzo.querySelectorAll('details').length, 0);
      assert.equal(dallAttrezzo.dataset.schedaAccessoAttrezzo, 'call-1');
      // AL CONTRARIO: the card of state 3 (a renewal was tried and the sign-in no longer works) says it
      const stato3 = creaNotaErrore({ spiegazione: spiegaErrore('x', 'CHATGPT_ACCESSO_NON_VALIDO') }, { document: doc, azioni: [] });
      assert.ok(stato3.textContent.includes(tentato), `${lingua}: the state-3 card says it`);
    });
  }
});

/*
 * ⭐ Cure della revisione R116 (agente W2 del Desktop, 04/11/2026): D2 (l'esito dell'accesso si legge dallo stato), D4 (nessuna
 *   conversazione aperta ⇒ nessuna ripresa; il disarmo al cambio di conversazione è chiamato), D5 (accesso riuscito a giro in corso ⇒ la
 *   ripresa parte a giro finito, una volta) e D6 (la guardia «nessun giro in corso» legge il giro VERO, non il segno della striscia).
 */
function timerFinto() {
  let adesso = 0; let prossimoId = 1; const attese = new Map();
  return {
    ora: () => adesso,
    setTimeout: (fn, ms) => { const id = prossimoId++; attese.set(id, { fn, quando: adesso + ms }); return id; },
    clearTimeout: (id) => { attese.delete(id); },
    async avanza(ms) {
      adesso += ms;
      for (const [id, a] of [...attese]) if (a.quando <= adesso) { attese.delete(id); a.fn(); }
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    },
    quante: () => attese.size,
  };
}
const { seguiEsitoAccesso } = scheda;
const mettiFuoco = () => { const ascoltatori = new Set(); return { ascoltaFuoco: (fn) => { ascoltatori.add(fn); return () => ascoltatori.delete(fn); }, fuoco: async () => { for (const fn of [...ascoltatori]) fn(); for (let i = 0; i < 20; i += 1) await Promise.resolve(); }, quanti: () => ascoltatori.size }; };

test('R116-FE-13 (D2 di R116, forma §3) — back on TALOS before the sign-in finished: the state is read again until the sign-in is over, then ONE outcome', async () => {
  const timer = timerFinto();
  const f = mettiFuoco();
  const stati = [{ accessoInCorso: true, collegato: false }, { accessoInCorso: false, collegato: true, pianoAbilitato: true, ultimoEsito: { ok: true } }];
  const letti = [];
  const termini = [];
  seguiEsitoAccesso({ leggiStato: async () => { const s = stati[Math.min(letti.length, stati.length - 1)]; letti.push(s); return s; }, alTermine: async (s) => { termini.push(s); },
    ascoltaFuoco: f.ascoltaFuoco, ora: timer.ora, timer, ogniMs: 2000 });
  await f.fuoco(); // the person comes back while the sign-in is still open (two-factor code)
  assert.equal(termini.length, 0, 'still in progress: nothing decided');
  assert.equal(f.quanti(), 1, 'still listening after the first focus');
  await f.fuoco(); // the sign-in is over
  assert.equal(termini.length, 1, 'one outcome');
  assert.equal(termini[0].ultimoEsito.ok, true);
  await f.fuoco();
  await timer.avanza(10_000);
  assert.equal(termini.length, 1, 'never twice');
  assert.equal(f.quanti(), 0, 'it stops listening');
  assert.equal(timer.quante(), 0, 'and stops reading');
  // no focus at all: the state is read every 2 s (the sign-in finished in the browser while the person stayed on TALOS)
  const t2 = timerFinto();
  let volte = 0;
  const fine2 = [];
  seguiEsitoAccesso({ leggiStato: async () => { volte += 1; return volte < 3 ? { accessoInCorso: true } : { accessoInCorso: false, collegato: true, pianoAbilitato: true, ultimoEsito: { ok: true } }; },
    alTermine: async (s) => { fine2.push(s); }, ora: t2.ora, timer: t2 });
  for (let i = 0; i < 4; i += 1) await t2.avanza(2000);
  assert.equal(fine2.length, 1);
});

test('R116-FE-13b AL CONTRARIO — a reading that fails decides nothing; a sign-in that never ends stops at the life of the attempt with no outcome', async () => {
  const timer = timerFinto();
  const termini = [];
  let n = 0;
  seguiEsitoAccesso({ leggiStato: async () => { n += 1; if (n === 1) throw new Error('rete'); return { accessoInCorso: true }; }, alTermine: async (s) => { termini.push(s); },
    ora: timer.ora, timer, ogniMs: 1000, entroMs: 5000 });
  for (let i = 0; i < 8; i += 1) await timer.avanza(1000);
  assert.deepEqual(termini, []);
  assert.equal(timer.quante(), 0, 'stopped after the life of the attempt');
  assert.ok(n >= 4 && n <= 6, `read ${n} times`);
  // ferma(): a new sign-in stops the old one
  const t3 = timerFinto();
  const fine3 = [];
  const s = seguiEsitoAccesso({ leggiStato: async () => ({ accessoInCorso: false, ultimoEsito: { ok: true } }), alTermine: async (x) => { fine3.push(x); }, ora: t3.ora, timer: t3 });
  s.ferma();
  await t3.avanza(5000);
  assert.deepEqual(fine3, []);
});

test('R116-FE-13c (D2) — app.js follows the sign-in from the state route, resumes only on THIS sign-in succeeding, and no longer detaches at the first focus', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const corpo = app.slice(app.indexOf('async function avviaAccessoChatgpt('), app.indexOf('async function scollegaChatgpt('));
  assert.match(corpo, /seguiEsitoAccesso\(\{ leggiStato: \(\) => apiGet\('\/api\/v1\/auth\/chatgpt\/stato'\), alTermine,/u);
  assert.match(corpo, /if \(letto\?\.ultimoEsito\?\.ok === true\) void ripresaDopoAccesso\.accessoRiuscito\(\{ sessionId: state\.realSession\.id \}\);/u);
  assert.doesNotMatch(corpo, /removeEventListener\('focus', alRitorno\)/u, 'no single-shot focus');
  assert.match(corpo, /seguitoAccesso\?\.ferma\(\);/u, 'a new sign-in stops following the old one');
});

test('R116-FE-14 (D4 di R116) — armed for conversation A: no conversation open (a new chat) or another one ⇒ no resume; app.js calls dimentica() when the conversation changes', async () => {
  const riprese = [];
  const r = creaRipresaDopoAccesso({ riprendi: async (perche) => { riprese.push(perche); }, giroInCorso: () => false });
  r.arma({ sessionId: 'sessione-A' });
  assert.equal(await r.accessoRiuscito({ sessionId: null }), false);
  assert.equal(r.armata(), false, 'disarmed');
  r.arma({ sessionId: 'sessione-A' });
  assert.equal(await r.accessoRiuscito({ sessionId: 'sessione-B' }), false);
  assert.deepEqual(riprese, []);
  // AL CONTRARIO: the same conversation resumes
  r.arma({ sessionId: 'sessione-A' });
  assert.equal(await r.accessoRiuscito({ sessionId: 'sessione-A' }), true);
  assert.deepEqual(riprese, ['accesso-rifatto']);
  const schede = creaSchedeAccesso({ ripresa: r });
  schede.apri({ querySelectorAll: () => [] }, { tipo: 'accedi', sessionId: 'sessione-A' });
  assert.equal(r.armata(), true);
  schede.dimentica();
  assert.equal(r.armata(), false);
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const nuova = app.slice(app.indexOf('function nuovaGenerazioneSessione('), app.indexOf('function nuovaGenerazioneSessione(') + 4000);
  assert.match(nuova, /if \(!continua\) schedeAccesso\.dimentica\(\);/u, 'another conversation or a new chat disarms; a resume (continua) does not');
});

test('R116-FE-15 (D5 di R116) — signed in while a turn runs: the resume stays armed and starts when the turn ends, once; a new turn first ⇒ none', async () => {
  const riprese = [];
  let inCorso = true;
  const r = creaRipresaDopoAccesso({ riprendi: async (perche) => { riprese.push(perche); }, giroInCorso: () => inCorso });
  r.arma({ sessionId: 'sessione-A' });
  assert.equal(await r.accessoRiuscito({ sessionId: 'sessione-A' }), false, 'no resume while the turn runs');
  assert.equal(r.armata(), true, 'still armed');
  inCorso = false;
  assert.equal(await r.giroFinito({ sessionId: 'sessione-A' }), true);
  assert.deepEqual(riprese, ['accesso-rifatto']);
  assert.equal(await r.giroFinito({ sessionId: 'sessione-A' }), false, 'once');
  assert.deepEqual(riprese, ['accesso-rifatto']);
  // AL CONTRARIO: the end of a turn with no sign-in done resumes nothing
  r.arma({ sessionId: 'sessione-A' });
  assert.equal(await r.giroFinito({ sessionId: 'sessione-A' }), false);
  assert.equal(r.armata(), true, 'still waiting for the sign-in');
  // AL CONTRARIO: another turn started first (its RunStarted closes the card) ⇒ no resume
  const schede = creaSchedeAccesso({ ripresa: r });
  inCorso = true;
  schede.apri({ querySelectorAll: () => [] }, { tipo: 'accedi', sessionId: 'sessione-A' });
  await r.accessoRiuscito({ sessionId: 'sessione-A' });
  schede.giroNuovo();
  inCorso = false;
  assert.equal(await r.giroFinito({ sessionId: 'sessione-A' }), false);
  assert.deepEqual(riprese, ['accesso-rifatto']);
  // AL CONTRARIO: the turn ended in another conversation
  r.arma({ sessionId: 'sessione-A' });
  inCorso = true;
  await r.accessoRiuscito({ sessionId: 'sessione-A' });
  inCorso = false;
  assert.equal(await r.giroFinito({ sessionId: 'sessione-B' }), false);
  assert.deepEqual(riprese, ['accesso-rifatto']);
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const fini = app.match(/state\.realSession\.eventoTerminaleVisto = !state\.realSession\.redirectPendingId;\s*\n\s*syncRunComposerState\(\);\s*\n(?:\s*\/\*[\s\S]*?\*\/\s*\n)?\s*(?:if \(evento\.code === 'fermato'\) ripresaDopoAccesso\.annulla\(\);\s*\n\s*else )?void ripresaDopoAccesso\.giroFinito\(\{ sessionId: state\.realSession\.id \}\);/gu) ?? [];
  assert.equal(fini.length, 2, 'RunFinished and RunError both call giroFinito, after the end of the turn is recorded');
  // C1 of the chat block review (04/11): in the RunError branch the person's Stop disarms instead (the browser proof is R116-B-01)
  assert.equal(app.match(/if \(evento\.code === 'fermato'\) ripresaDopoAccesso\.annulla\(\);\s*\n\s*else void ripresaDopoAccesso\.giroFinito\(/gu)?.length ?? 0, 1,
    'the RunError branch: a Stop disarms the resume, every other end resumes once');
  // AL CONTRARIO: annulla after a sign-in done during the turn ⇒ the end of the turn resumes nothing; arming again works
  r.arma({ sessionId: 'sessione-A' });
  inCorso = true;
  await r.accessoRiuscito({ sessionId: 'sessione-A' });
  inCorso = false;
  r.annulla();
  assert.equal(await r.giroFinito({ sessionId: 'sessione-A' }), false);
  assert.deepEqual(riprese, ['accesso-rifatto'], 'the Stop is not undone');
});

test('R116-FE-16 (W2, found while curing R116) — «no turn running» reads the real turn, not the strip flag that is true from start-up', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /running: true,/u, 'the strip flag starts true: it cannot say whether a turn runs');
  const blocco = app.slice(app.indexOf('const ripresaDopoAccesso = creaRipresaDopoAccesso('), app.indexOf('function montaSchedaAccessoDallAttrezzo('));
  assert.match(blocco, /giroInCorso: \(\) => runRealeAttivo\(\),/u);
  assert.match(blocco, /if \(!runRealeAttivo\(\)\) void resumeSession\('', \[\], \{ ripresaDopo: 'rete-tornata' \}\);/u, '«Try again» too');
  assert.doesNotMatch(blocco, /state\.running/u);
});
