/*
 * Revisione UX della candidata, 04/11/2026 (Frontend), righe 39, 40 e 42, le parti che si provano senza browser (la prova nel DOM vivo
 * è `tests/browser/ux-38-42-chat.spec.mjs`). Ogni controllo anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { impostaLingua } from '../../src/components/lingua.js';
import { spiegaErrore, vestizioneErrore } from '../../src/components/errori.js';
import { creaNotaErrore } from '../../src/components/conversazione.js';
import { bersaglioDellaRicerca } from '../../src/components/bersaglio-suggerimento.js';
import { TESTI } from '../../src/i18n/testi/index.js';
import { documento } from './aiuto-dom-blocchi.mjs';

const testoDi = (nodo) => nodo.textContent.replace(/\s+/gu, ' ');

test('UX-39 the Stop card: one title that says what happened, never repeated below it', () => {
  try {
    for (const [lingua, titolo, badge] of [['it', 'Hai fermato il giro', 'Fermato'], ['en', 'You stopped the turn', 'Stopped']]) {
      impostaLingua(lingua);
      const spiegazione = spiegaErrore('⛔ stopped on request.', 'fermato');
      const vestizione = vestizioneErrore(spiegazione);
      assert.deepEqual(vestizione, { badge, titolo, tono: 'accent' });
      const doc = documento();
      const nota = creaNotaErrore({ ...vestizione, spiegazione }, { document: doc });
      const testo = testoDi(nota);
      assert.equal(testo.split(titolo).length - 1, 1, `${lingua}: «${titolo}» una volta sola (${testo})`);
      assert.ok(!/TALOS · /u.test(testo), `${lingua}: niente «TALOS · …» (${testo})`);
      assert.ok(testo.includes(spiegazione.perche), `${lingua}: cosa resta fatto`);
      assert.ok(testo.includes(spiegazione.rimedi[0]), `${lingua}: cosa fare`);
    }
    /* AL CONTRARIO: un guasto vero tiene titolo E frase, perché la frase dice una cosa che il titolo non dice */
    impostaLingua('it');
    const guasto = spiegaErrore('fetch failed', 'internal-error');
    const doc = documento();
    const nota = creaNotaErrore({ ...vestizioneErrore(guasto), spiegazione: guasto }, { document: doc });
    assert.ok(testoDi(nota).includes('TALOS · errore'));
    assert.ok(testoDi(nota).includes(guasto.cosa), 'la frase del guasto resta');
  } finally { impostaLingua('it'); }
});

test('UX-40 decision 192: after a search the suggestion names the searched text only when it is a whole word of what the person wrote', () => {
  const chiesto = 'Qual è la parola segreta nel file allegato?';
  assert.equal(bersaglioDellaRicerca({ testo: 'segret' }, chiesto), '', 'un pezzo di parola («segret» dentro «segreta») non va mai a schermo');
  assert.equal(bersaglioDellaRicerca({ testo: 'segreta' }, chiesto), 'segreta', 'la parola intera sì');
  assert.equal(bersaglioDellaRicerca({ testo: 'Segreta' }, chiesto), 'Segreta', 'maiuscole e minuscole non contano; si mostra come l ha cercato');
  assert.equal(bersaglioDellaRicerca({ testo: 'girasole' }, 'Parlami del GIRASOLE'), 'girasole', 'anche quando le maiuscole le ha scritte la persona');
  assert.equal(bersaglioDellaRicerca({ testo: '  file allegato  ' }, chiesto), 'file allegato', 'più parole di fila, intere');
  assert.equal(bersaglioDellaRicerca({ testo: 'parola segret' }, chiesto), '', 'l ultima tagliata: niente');
  assert.equal(bersaglioDellaRicerca({ testo: 'la' }, 'Leggi la nota'), 'la');
  assert.equal(bersaglioDellaRicerca({ testo: 'la' }, 'Lavora sul file'), '', '«la» dentro «Lavora» non è una parola');
  assert.equal(bersaglioDellaRicerca({ testo: 'girasole', nome: '*.txt' }, 'cerca girasole nei .txt'), 'girasole', 'il testo prima del nome');
  assert.equal(bersaglioDellaRicerca({ nome: '*.md' }, 'trova i file *.md'), '*.md', 'un nome scritto dalla persona');
  assert.equal(bersaglioDellaRicerca({ nome: '*.md' }, 'trova la documentazione'), '', 'un nome inventato dal modello: niente');
  assert.equal(bersaglioDellaRicerca({ testo: 'é' }, 'perché'), '', 'le lettere accentate contano come lettere');
  /* AL CONTRARIO: senza il testo della persona non c'è niente con cui confrontare ⇒ niente suggerimento */
  assert.equal(bersaglioDellaRicerca({ testo: 'segreta' }), '');
  assert.equal(bersaglioDellaRicerca({ testo: 'segreta' }, ''), '');
  assert.equal(bersaglioDellaRicerca({}, chiesto), '');
  assert.equal(bersaglioDellaRicerca(null, chiesto), '');
  assert.equal(bersaglioDellaRicerca({ testo: 42 }, chiesto), '');
  const voce = (lingua) => TESTI[lingua]['app.suggestion.searchFound'];
  assert.equal(voce('it'), 'Cosa hai trovato cercando «{bersaglio}»?');
  assert.equal(voce('en'), 'What did you find searching for “{bersaglio}”?');
  for (const lingua of ['it', 'en']) assert.ok(!/"/u.test(voce(lingua)), `${lingua}: niente virgolette dritte`);
  assert.equal(TESTI.it['app.suggestion.digDeeper'], undefined, '«Approfondisci» un pezzo di parola non si propone più');
  /* il filo nella chat del PC: il testo della persona è la domanda del giro, e un bersaglio vuoto non fa nessun suggerimento */
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /case 'cerca': \{[^\n]*\n\s*const cercato = bersaglioDellaRicerca\(ultimo\.argomenti, state\.realSession\.ultimaDomanda\);\s*return cercato \? tr\('app\.suggestion\.searchFound', \{ bersaglio: cercato \}\) : null;/u);
});

test('UX-42 the attachment tray writes the total only when there is more than one attachment', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /totale\.hidden = allegatiComposer\.length < 2;/u);
});

/* Revisione del blocco UI (04/11/2026, R4): unendo la riga 39 con la candidata, `creaNotaErrore` deve tenere DUE condizioni: la frase
   che ripete il titolo non si scrive (riga 39), e la scheda nata dall'attrezzo (decisione 116 C, `senzaFrase`) non ha un paragrafo vuoto.
   Prima di questa prova il mutante che toglieva la condizione della 116 C sopravviveva. */
test('UX-39-116C the tool-born ChatGPT card has no empty sentence paragraph, while a card with a sentence keeps it', async () => {
  const { creaSchedaDallAttrezzo } = await import('../../src/components/accesso-chatgpt-scheda.js');
  const doc = documento();
  const scheda = creaSchedaDallAttrezzo({ document: doc, azioni: [], toolCallId: 'call_1' });
  assert.equal(scheda.querySelectorAll('p.assistant-copy').length, 0, 'decisione 116 C: niente paragrafo vuoto nella scheda nata dall attrezzo');
  const diretta = creaNotaErrore({ titolo: 'T', spiegazione: { cosa: '', rimedi: [], senzaFrase: true } }, { document: doc });
  assert.equal(diretta.querySelectorAll('p.assistant-copy').length, 0, 'la stessa regola chiamando creaNotaErrore da sola');
  /* AL CONTRARIO: una frase vera resta, anche con `senzaFrase` (vince il testo), e senza `senzaFrase` la forma di sempre non cambia */
  const conFrase = creaNotaErrore({ titolo: 'T', spiegazione: { cosa: 'Qualcosa è andato storto.', rimedi: [], senzaFrase: true } }, { document: doc });
  assert.deepEqual([...conFrase.querySelectorAll('p.assistant-copy')].map((p) => p.textContent), ['Qualcosa è andato storto.']);
  const diSempre = creaNotaErrore({ titolo: 'T', spiegazione: { cosa: '', rimedi: [] } }, { document: doc });
  assert.equal(diSempre.querySelectorAll('p.assistant-copy').length, 1, 'senza senzaFrase il paragrafo resta com era');
  /* e la riga 39 resta viva insieme alla 116 C: la frase uguale al titolo non si ripete */
  const ripete = creaNotaErrore({ titolo: 'Hai fermato il giro', spiegazione: { cosa: 'Hai fermato il giro.', rimedi: [] } }, { document: doc });
  assert.equal(ripete.querySelectorAll('p.assistant-copy').length, 0, 'riga 39: la frase che ripete il titolo non si scrive');
});
