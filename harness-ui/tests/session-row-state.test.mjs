import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

/*
 * ⭐⭐⭐ 02/9 — lo stato della riga sessione. Prima la riga diceva solo
 * «concluso» o «in corso»: una sessione FALLITA e una RIUSCITA si
 * leggevano IDENTICHE. Il server mandava già tutto (`ultimoEsito`,
 * `interrotta`, `inAttesaApprovazione`, `modello`, `usage`) e la riga ne
 * usava due campi su otto.
 * Ricerca e confronto completi in
 * `.claude/DOSSIER-LISTA-SESSIONI-CONFRONTO-2026-09-02.md`.
 */

test('SESSION-ROW-STATE-01 — i cinque stati esistono e vengono dai campi veri del server', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  const app = await source('frontend/src/legacy/app.js');
  const inizio = app.indexOf('function statoSessione');
  const fine = app.indexOf('\n  async function', inizio);
  const corpo = app.slice(inizio, fine);
  assert.ok(inizio >= 0 && fine > inizio, 'statoSessione deve essere individuabile');
  for (const campo of ['inAttesaApprovazione', 'conclusa', 'interrotta', 'ultimoEsito']) {
    assert.ok(corpo.includes(campo), `lo stato deve leggere ${campo}`);
  }
  for (const classe of ['attesa', 'vivo', 'interrotto', 'errore', 'successo', 'ignoto']) {
    assert.ok(corpo.includes(`'${classe}'`), `manca lo stato ${classe}`);
  }
});

test('SESSION-ROW-STATE-02 — «in attesa di approvazione» viene PRIMA di tutto', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⛔ L'ordine dei controlli è la parte che conta: è l'unico stato che
   * CHIEDE qualcosa alla persona, e non deve annegare fra gli altri.
   * Verificato dal vivo: una sessione `conclusa:true` +
   * `inAttesaApprovazione:true` dà «in attesa», non «conclusa».
   */
  const app = await source('frontend/src/legacy/app.js');
  const inizio = app.indexOf('function statoSessione');
  const corpo = app.slice(inizio, app.indexOf('\n  async function', inizio));
  assert.ok(corpo.indexOf('inAttesaApprovazione') < corpo.indexOf('!sessione.conclusa'), 'l\'attesa di approvazione deve essere il primo controllo');
  assert.ok(corpo.indexOf('interrotta') < corpo.indexOf("ultimoEsito === 'errore'"), 'interrotta va prima dell\'esito: fermata a metà non è finita');
});

test('SESSION-ROW-STATE-03 — AL CONTRARIO: nessun esito registrato NON diventa «successo»', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⛔ Le sessioni registrate prima che l'esito esistesse non ce l'hanno.
   * Chiamarle «riuscite» sarebbe inventare un fatto — dicono «esito non
   * registrato», che è la verità.
   */
  const app = await source('frontend/src/legacy/app.js');
  const inizio = app.indexOf('function statoSessione');
  const corpo = app.slice(inizio, app.indexOf('\n  async function', inizio));
  assert.match(corpo, /esito non registrato/);
  assert.match(corpo, /ultimoEsito === 'successo'/, 'il successo si scrive solo se dichiarato');
});

test('SESSION-ROW-STATE-04 — token e giri solo se contati davvero, mai uno zero finto', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /const giri = sessione\.usage\?\.giri;/);
  assert.match(app, /Number\.isFinite\(giri\) && giri > 0/);
});

test('SESSION-ROW-STATE-05 — lo stato non è distinguibile SOLO dal colore', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⛔ Un «conclusa con errore» leggibile solo dal rosso è invisibile a chi
   * non distingue i colori. Il pallino accompagna sempre la parola per
   * esteso, che è nel testo dello stato.
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /session-stato-punto/);
  assert.match(app, /conclusa con errore/);
  assert.match(app, /in attesa di approvazione/);
});

test('SESSION-ROW-STATE-06 — il pallino «in corso» si CALMA sotto motion ridotto, non si ferma', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  // Fermo sarebbe indistinguibile da una sessione conclusa: stesso
  // principio già applicato al line-loader della risposta.
  const css = await source('frontend/src/styles/index.css');
  assert.match(css, /@keyframes sessionePulsa/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?session-stato\[data-session-state="vivo"\][^}]*animation:\s*sessionePulsa/s);
  assert.doesNotMatch(css, /session-stato\[data-session-state="vivo"\] \.session-stato-punto \{ animation: none/);
});
