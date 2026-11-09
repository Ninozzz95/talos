import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import * as bacheca from '../../src/components/board.js';
const { testiBoard } = bacheca;
const contoDellaBacheca = (...a) => bacheca.contoDellaBacheca(...a); // al contrario, sulla base: «non è una funzione», non un import rotto
import { compatto } from '../../src/components/costi-consumo.js';
import { sessioniRadice } from '../../src/components/session-item.js';
import { testiPiede } from '../../src/components/workspace-footer.js';

/*
 * Revisione UX della candidata del 04/11/2026, righe 24-27 (le righe 21-23 toccano il disegno e stanno nella prova del browser
 * `tests/browser/cure-ux-21-27.spec.mjs`). Ogni prova anche al contrario: il valore vecchio NON deve più esserci.
 */
const modello = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');

test('UX24-MILIONI: la Bacheca oltre il milione scrive «M» come i Costi, mai «13.022,3k»', () => {
  impostaLingua('it');
  try {
    const t13 = testiBoard({ usage: { prompt_tokens: 13_000_000, completion_tokens: 22_300 } }, {});
    assert.equal(t13.token, '13 M');
    assert.equal(t13.token, compatto(13_022_300), 'un formato solo, quello dei Costi');
    assert.doesNotMatch(t13.token, /k$/u);
    // sotto il milione resta in migliaia, con lo spazio dei Costi
    assert.equal(testiBoard({ usage: { prompt_tokens: 89_470, completion_tokens: 2_635 } }, {}).token, '92,1 k');
    // il salto d'unità: mai «1.000 k» né «1.000» per un valore che si arrotonda all'unità dopo (Hermes `compactNumber`)
    assert.equal(compatto(999_960), '1 M');
    assert.equal(compatto(999_949), '999,9 k');
    assert.equal(compatto(999.96), '1 k');
    assert.equal(compatto(999), '999');
    // un dato che non c'è resta «—», non «0»
    assert.equal(testiBoard({}, {}).token, '—');
  } finally { impostaLingua('it'); }
  impostaLingua('en');
  try { assert.equal(compatto(12_600_000), '12.6 M'); } finally { impostaLingua('it'); }
});

test('UX25-NOTA: la nota della Bacheca usa il nome della colonna («Giri»), in italiano e in inglese', () => {
  impostaLingua('it');
  try {
    const it = t('modello.board.marksDataThatWas');
    assert.match(it, /Giri, Token e Cache/u);
    assert.doesNotMatch(it, /Richieste/u);
  } finally { impostaLingua('it'); }
  impostaLingua('en');
  try {
    const en = t('modello.board.marksDataThatWas');
    assert.match(en, /Turns, Tokens and Cache/u);
    assert.doesNotMatch(en, /Requests/u);
  } finally { impostaLingua('it'); }
  // il modello HTML (prima del cambio di lingua) dice la stessa cosa
  assert.match(modello, /data-t="modello\.board\.marksDataThatWas"[^>]*>«—» indica un dato non registrato\. Giri, Token e Cache contano /u);
});

test('UX26-CONTO: la barra conta le sessioni che apri tu, la Bacheca anche i sotto-agenti, e lo dice', () => {
  // gli stessi dati finti della misura (`strumento-26.mjs`): 30 radici con progetto, 13 senza, 25 figlie, 4 orfane di delega
  const finte = [];
  for (let i = 0; i < 30; i += 1) finte.push({ sessionId: `p${i}`, padreId: null, profonditaDelega: 0, progetto: `prog${i % 11}` });
  for (let i = 0; i < 13; i += 1) finte.push({ sessionId: `l${i}`, padreId: null, profonditaDelega: 0, progetto: null });
  for (let i = 0; i < 25; i += 1) finte.push({ sessionId: `f${i}`, padreId: `p${i % 30}`, profonditaDelega: 1 });
  for (let i = 0; i < 4; i += 1) finte.push({ sessionId: `o${i}`, padreId: null, profonditaDelega: 1 });
  // l'indizio «la barra conta solo le sessioni dentro un progetto» è smentito: conta anche le 13 senza progetto
  assert.equal(sessioniRadice(finte).length, 43);
  assert.equal(finte.length, 72);
  impostaLingua('it');
  try {
    assert.equal(contoDellaBacheca(finte), '72 sessioni, di cui 29 di sotto-agenti');
    assert.equal(contoDellaBacheca(finte.slice(0, 44)), '44 sessioni, di cui 1 di un sotto-agente');
    // al contrario: senza sotto-agenti nessuna coda, e un elenco che non c'è non rompe
    assert.equal(contoDellaBacheca(finte.slice(0, 43)), '43 sessioni');
    assert.equal(contoDellaBacheca(null), '0 sessioni');
  } finally { impostaLingua('it'); }
  impostaLingua('en');
  try { assert.equal(contoDellaBacheca(finte), '72 sessions, 29 of them from sub-agents'); } finally { impostaLingua('it'); }
});

test('UX27-SPAZIO: «workspace» diventa «spazio di lavoro» nei quattro testi italiani; il marchio resta', () => {
  impostaLingua('it');
  try {
    for (const chiave of ['modello.sidebar.localWorkspace', 'modello.settings.restoreTheWorkspaceAt',
      'impostazioni.search.workspaceRestore.title', 'varie.footer.localWorkspace']) {
      const it = t(chiave);
      assert.doesNotMatch(it, /workspace/iu, `${chiave}: «${it}»`);
      assert.match(it, /[Ss]pazio di lavoro/u, `${chiave}: «${it}»`);
    }
    assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: 'local:x' }).titolo, 'Spazio di lavoro locale');
  } finally { impostaLingua('it'); }
  impostaLingua('en');
  try {
    assert.match(t('modello.sidebar.localWorkspace'), /workspace/iu, 'l’inglese resta «workspace»');
  } finally { impostaLingua('it'); }
  // il modello HTML: niente «Workspace locale» né «Riprendi il workspace»; la ricerca delle Impostazioni trova ancora «workspace»
  assert.doesNotMatch(modello, />Workspace locale</u);
  assert.doesNotMatch(modello, /Riprendi il workspace/u);
  assert.match(modello, /data-setting-search="Riprendi lo spazio di lavoro all’avvio [^"]*workspace/u);
});
