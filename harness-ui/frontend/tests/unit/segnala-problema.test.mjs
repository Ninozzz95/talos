import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INDIRIZZO_NUOVA_SEGNALAZIONE, MODELLO_GITHUB, TETTO_INDIRIZZO, ETICHETTE_DEL_TIPO,
  indirizzoSegnalazione, righeDiagnostica, testoDaCopiare, creaCartaBozza,
} from '../../src/components/segnala-problema.js';
import { impostaLingua } from '../../src/components/lingua.js';

/*
 * «Segnala un problema» (owner 29/10/2026, bozzetto approvato): le parti pure della finestra — l'indirizzo di GitHub (codifica, tetto
 *   sul corpo CODIFICATO, campi del modello `desktop.yml`, tipo → etichetta nel titolo) e le righe della diagnostica.
 *   GitHub: «Creating an issue from a URL query» (docs.github.com, letta il 29/10/2026) — `template=` e i campi del modulo per `id`;
 *   `labels=` vuole il permesso di mettere etichette (chi non ce l'ha riceve 404), quindi il tipo va nel TITOLO; oltre il limite 414.
 */
const DIAG = 'TALOS desktop 0.1.38 (Windows 11, x64)\nModello: glm';

test('SEGN-UI-01 — l\'indirizzo: modello del repo, titolo con l\'etichetta del tipo, i campi del modulo per id, codificati', () => {
  assert.equal(INDIRIZZO_NUOVA_SEGNALAZIONE, 'https://github.com/Ninozzz95/talos/issues/new');
  assert.equal(MODELLO_GITHUB, 'desktop.yml');
  assert.deepEqual(ETICHETTE_DEL_TIPO, { bug: '[Bug]', wrong_answer: '[Wrong answer]', idea: '[Idea]' });
  const r = indirizzoSegnalazione({ tipo: 'wrong_answer', titolo: 'Risposta & conti sbagliati?', descrizione: 'Ha detto 2+2=5 #male', diagnostica: DIAG });
  const u = new URL(r.url);
  assert.equal(`${u.origin}${u.pathname}`, INDIRIZZO_NUOVA_SEGNALAZIONE);
  assert.deepEqual([...u.searchParams.keys()], ['template', 'title', 'cosa', 'diagnostica']);
  assert.equal(u.searchParams.get('template'), 'desktop.yml');
  assert.equal(u.searchParams.get('title'), '[Wrong answer] Risposta & conti sbagliati?');
  assert.equal(u.searchParams.get('cosa'), 'Ha detto 2+2=5 #male');
  assert.equal(u.searchParams.get('diagnostica'), DIAG);
  assert.doesNotMatch(r.url, /labels=/u, 'nessuna etichetta nell\'indirizzo: chi non ha il permesso riceverebbe 404');
  assert.doesNotMatch(r.url.split('?')[1], /[&#]male|=5 /u, 'i caratteri speciali sono codificati');
  assert.deepEqual([r.tagliata, r.diagnosticaFuori], [false, false]);
  // senza diagnostica (casella tolta) il campo non c'è proprio
  assert.equal(new URL(indirizzoSegnalazione({ tipo: 'idea', titolo: 'x', descrizione: '', diagnostica: null }).url).searchParams.has('diagnostica'), false);
  assert.equal(new URL(indirizzoSegnalazione({ tipo: 'idea', titolo: 'x', descrizione: '' }).url).searchParams.get('title'), '[Idea] x');
});

test('SEGN-UI-02 — il tetto è sul corpo CODIFICATO: una descrizione lunga si accorcia (e lo dice), la diagnostica resta', () => {
  assert.equal(TETTO_INDIRIZZO, 6000);
  // 3.000 «è» = 3.000 caratteri ma ~18.000 codificati: il conto sui caratteri passerebbe, quello vero no
  const lunga = 'è'.repeat(3000);
  const r = indirizzoSegnalazione({ tipo: 'bug', titolo: 'Lungo', descrizione: lunga, diagnostica: DIAG });
  assert.ok(r.url.length <= TETTO_INDIRIZZO, `${r.url.length}`);
  assert.equal(r.tagliata, true);
  assert.equal(r.diagnosticaFuori, false);
  const cosa = new URL(r.url).searchParams.get('cosa');
  assert.ok(cosa.endsWith('…') && cosa.length > 500, 'accorciata il meno possibile');
  // il più grande che entra: un carattere in più (coi suoi puntini) non entrerebbe
  const unoInPiu = indirizzoSegnalazione({ tipo: 'bug', titolo: 'Lungo', descrizione: `${lunga.slice(0, cosa.length)}…`, diagnostica: DIAG, tetto: Infinity });
  assert.ok(unoInPiu.url.length > TETTO_INDIRIZZO);
  // una coppia di surrogati non si spezza
  const emoji = indirizzoSegnalazione({ tipo: 'bug', titolo: 'x', descrizione: '😀'.repeat(2000), diagnostica: null });
  assert.doesNotMatch(new URL(emoji.url).searchParams.get('cosa'), /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
});

test('SEGN-UI-03 — se la diagnostica non ci sta accanto a una descrizione utile, esce dall\'indirizzo e la finestra dice di incollarla', () => {
  const diagGrande = 'D'.repeat(5800);
  const r = indirizzoSegnalazione({ tipo: 'bug', titolo: 'x', descrizione: 'y'.repeat(800), diagnostica: diagGrande });
  assert.ok(r.url.length <= TETTO_INDIRIZZO);
  assert.equal(r.diagnosticaFuori, true);
  assert.equal(new URL(r.url).searchParams.has('diagnostica'), false);
  assert.equal(new URL(r.url).searchParams.get('cosa'), 'y'.repeat(800), 'la descrizione resta intera');
});

test('SEGN-UI-04 — il testo da copiare: intero (niente taglio), con o senza diagnostica', () => {
  impostaLingua('it');
  const lunga = 'z'.repeat(9000);
  const testo = testoDaCopiare({ tipo: 'bug', titolo: 'T', descrizione: lunga, diagnostica: DIAG });
  assert.ok(testo.startsWith('[Bug] T\n\n'));
  assert.ok(testo.includes(lunga));
  assert.ok(testo.endsWith(`Diagnostica:\n${DIAG}`));
  assert.equal(testoDaCopiare({ tipo: 'idea', titolo: 'T', descrizione: 'd', diagnostica: null }), '[Idea] T\n\nd');
});

test('SEGN-UI-05 — le righe della diagnostica, nella lingua dell\'interfaccia; ciò che non si sa lo dice', () => {
  const d = {
    versione: '0.1.38', installata: true, sistema: { piattaforma: 'windows', nome: 'Windows 11', arch: 'x64' },
    sessione: { modello: 'z-ai/glm-5.3-flash', fornitore: 'openrouter', sforzo: 'medium', permesso: 'Workspace write', terminale: true },
    errori: [{ codice: 'SHELL_TIMEOUT', alle: '2026-10-29T10:42:00.000Z' }, { codice: 'SHELL_TIMEOUT', alle: '2026-10-29T10:47:00.000Z' }, { codice: 'RUNTIME_UNREACHABLE', alle: null }],
    motoreLocale: false, remoto: null,
  };
  impostaLingua('it');
  const it = righeDiagnostica(d);
  assert.equal(it.length, 5);
  assert.equal(it[0], 'TALOS desktop 0.1.38 (Windows 11, x64)');
  assert.equal(it[1], 'Modello: z-ai/glm-5.3-flash via openrouter · sforzo Medio');
  assert.equal(it[2], 'Accesso: Scrive nel progetto · Terminale acceso');
  assert.match(it[3], /^Ultimi errori: SHELL_TIMEOUT ×2 \(\d\d:\d\d, \d\d:\d\d\) · RUNTIME_UNREACHABLE$/u);
  assert.equal(it[4], 'Motore locale: spento · Controllo remoto: non noto');
  impostaLingua('en');
  const en = righeDiagnostica({ ...d, installata: false, sessione: null, errori: [], versione: null });
  assert.deepEqual(en, [
    'TALOS, version unknown, from source (Windows 11, x64)',
    'No conversation open',
    'Last errors: none',
    'Local engine: off · Remote control: unknown',
  ]);
  impostaLingua('it');
});

/* Un DOM minimo per la carta: elementi con classe, testo, attributi, figli ed eventi (il frontend non ha una libreria DOM per Node). */
function documentoMinimo() {
  const crea = (tag) => {
    const el = {
      tagName: tag.toUpperCase(), className: '', dataset: {}, attributi: {}, figli: [], ascoltatori: {}, _testo: '', type: '',
      get textContent() { return this._testo + this.figli.map((f) => f.textContent).join(''); },
      set textContent(v) { this._testo = String(v); this.figli = []; },
      setAttribute(k, v) { this.attributi[k] = String(v); }, getAttribute(k) { return this.attributi[k] ?? null; },
      append(...n) { this.figli.push(...n); }, replaceChildren(...n) { this.figli = [...n]; this._testo = ''; },
      addEventListener(tipo, fn) { (this.ascoltatori[tipo] ??= []).push(fn); },
      click() { for (const fn of this.ascoltatori.click ?? []) fn({}); },
      tutti() { return [this, ...this.figli.flatMap((f) => (f.tutti ? f.tutti() : []))]; },
    };
    return el;
  };
  return { createElement: crea };
}
const trova = (radice, chiave) => radice.tutti().find((n) => chiave in n.dataset);

test('SEGN-UI-06 — la carta della bozza: tipo e titolo, «Rivedi e apri» chiama chi apre, «Scarta» lascia la riga che lo dice', () => {
  impostaLingua('it');
  const doc = documentoMinimo();
  let rivista = 0; let scartata = 0;
  const carta = creaCartaBozza(doc, { toolCallId: 'call-1', kind: 'wrong_answer', title: 'Conti sbagliati' }, { onRivedi: () => { rivista += 1; }, onScarta: () => { scartata += 1; } });
  assert.equal(carta.dataset.segnalazioneBozza, 'call-1');
  assert.equal(carta.getAttribute('aria-label'), 'Bozza di segnalazione');
  assert.match(carta.textContent, /^Bozza di segnalazione · Risposta sbagliata«Conti sbagliati»Rivedi e apriScarta$/u);
  trova(carta, 'segnalaRivedi').click();
  assert.equal(rivista, 1);
  trova(carta, 'segnalaScarta').click();
  assert.equal(scartata, 1);
  assert.equal(carta.dataset.scartata, 'si');
  assert.equal(trova(carta, 'segnalaRivedi'), undefined, 'dopo «Scarta» non si apre più niente da qui');
  assert.match(carta.textContent, /Bozza scartata: non è stato aperto niente\.$/u);
  // rigiocando la storia una bozza già scartata nasce scartata; un tipo sconosciuto vale «Problema»
  const vecchia = creaCartaBozza(doc, { toolCallId: 'c2', kind: 'boh', title: 'x' }, { scartata: true });
  assert.equal(trova(vecchia, 'segnalaRivedi'), undefined);
  assert.match(vecchia.textContent, /^Bozza di segnalazione · Problema/u);
  impostaLingua('en');
  assert.match(creaCartaBozza(doc, { kind: 'idea', title: 'x' }).textContent, /^Draft report · Idea“x”Review and openDiscard$/u);
  impostaLingua('it');
});
