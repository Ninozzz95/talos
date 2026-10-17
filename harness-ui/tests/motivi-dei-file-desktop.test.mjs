/*
 * 16/10/2026 — la metà Desktop di `motivi-dei-file.test.mjs`: per ogni motivo dei rifiuti dell'albero il dizionario dell'interfaccia
 *   ha la voce `errori.QUERY_INVALID.<motivo>` con LO STESSO inglese del server e un italiano vero, e `fraseDelMotivo` la dice nella
 *   lingua della persona (prima la persona leggeva «Query non valida»). Ogni controllo anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { FRASI_DEI_MOTIVI_DEI_FILE } from '../src/motivi-dei-file.mjs';
import { toPublicProblem } from '../src/public-problem.mjs';
import { TESTI } from '../frontend/src/i18n/testi/index.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';
import { fraseDelMotivo } from '../frontend/src/components/errori.js';
import { eFraseItaliana } from '../frontend/scripts/cancello/testi-a-schermo.mjs';

const chiave = (motivo) => `errori.QUERY_INVALID.${motivo.replace(/-/g, '_')}`;
/** Il rifiuto come lo vede il client: la busta d'errore del server (`errorEnvelope`), con `reason`. */
const busta = (motivo, explanation = toPublicProblem(Object.assign(new Error(FRASI_DEI_MOTIVI_DEI_FILE[motivo]), { code: 'QUERY_INVALID', reason: motivo })).explanation) =>
  ({ code: 'QUERY_INVALID', problem: { code: 'QUERY_INVALID', message: 'Invalid query', explanation, reason: motivo } });

test('MOTIVI-FILE-DESKTOP-01 — ogni motivo ha la sua voce: lo stesso inglese del server, e un italiano', () => {
  for (const [motivo, inglese] of Object.entries(FRASI_DEI_MOTIVI_DEI_FILE)) {
    assert.equal(TESTI.en[chiave(motivo)], inglese, motivo);
    assert.ok(typeof TESTI.it[chiave(motivo)] === 'string' && TESTI.it[chiave(motivo)] !== inglese, `${motivo}: manca l'italiano`);
    assert.ok(eFraseItaliana(TESTI.it[chiave(motivo)]), `${motivo}: «${TESTI.it[chiave(motivo)]}» non sembra italiano`);
  }
});

test('MOTIVI-FILE-DESKTOP-02 — fraseDelMotivo dice la frase nella lingua della persona; AL CONTRARIO, senza la frase pubblicata dal server, niente', (t) => {
  t.after(() => impostaLingua('en'));
  impostaLingua('it');
  assert.equal(fraseDelMotivo(busta('move-into-itself')), 'Non puoi spostare un elemento dentro sé stesso o dentro una sua sottocartella');
  assert.equal(fraseDelMotivo(busta('folder-not-found')), 'Cartella non trovata');
  impostaLingua('en');
  assert.equal(fraseDelMotivo(busta('folder-not-found')), 'Folder not found');
  // AL CONTRARIO: la spiegazione generica del codice (il server non l'ha pubblicata per la persona) non diventa la frase del motivo
  assert.equal(fraseDelMotivo(busta('folder-not-found', 'The request contains an invalid parameter.')), '');
  assert.equal(fraseDelMotivo({ code: 'QUERY_INVALID', problem: { code: 'QUERY_INVALID', explanation: 'Folder not found' } }), '', 'senza motivo');
  assert.equal(fraseDelMotivo({ code: 'QUERY_INVALID', problem: { code: 'QUERY_INVALID', reason: 'motivo-inventato', explanation: 'x' } }), '');
  assert.equal(fraseDelMotivo(null), '');
});

test('MOTIVI-FILE-DESKTOP-03 — la chiave del fornitore che manca (15/10) passa ancora da qui: stessa frase di prima', (t) => {
  t.after(() => impostaLingua('en'));
  impostaLingua('it');
  const problema = { code: 'CONFIG_INVALID', message: 'Invalid configuration', reason: 'provider-key-missing-named', params: { provider: 'OpenRouter' },
    explanation: 'The OpenRouter key is missing: connect it from the provider settings.' };
  assert.equal(fraseDelMotivo({ code: 'CONFIG_INVALID', problem: problema }), 'Manca la chiave di OpenRouter: collegala dalle impostazioni dei fornitori.');
});

test('MOTIVI-FILE-DESKTOP-04 — i sei gestori dell\'albero (rinomina, elimina, crea, sposta ×2, copia) passano da messaggioErroreUtente, non da error.message', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../frontend/src/legacy/app.js', import.meta.url), 'utf8');
  for (const chiaveToast of ['app.common.renameFailed', 'app.common.deleteFailed', 'app.common.createFailed', 'app.files.moveFailed', 'app.common.copyFailed']) {
    assert.ok(!app.includes(`toast(tr('${chiaveToast}'), error.message)`), `${chiaveToast}: mostra ancora error.message («Query non valida»)`);
    assert.ok(app.includes(`toast(tr('${chiaveToast}'), messaggioErroreUtente(error)`), `${chiaveToast}: AL CONTRARIO, il gestore c'è ancora`);
  }
  assert.match(app, /const delMotivo = fraseDelMotivo\(error\);\n\s*if \(delMotivo\) return delMotivo;/u, 'messaggioErroreUtente chiede prima la frase del motivo');
});
