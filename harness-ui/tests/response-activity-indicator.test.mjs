import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

test('RESPONSE-ACTIVITY-DOTS-08 — il loader è quello del MOBILE: una linea che attraversa i tre nodi, non tre pallini che pulsano', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⛔⛔⛔ 02/9 — contratto CAMBIATO per ordine diretto dell'owner: "il logo
   * non è animato come il mobile, ci deve essere una linea che attraversa
   * i dot, usa direttamente la stessa identica immagine animata del
   * mobile". La versione precedente di questo test congelava la
   * divergenza desktop (tre pallini che pulsano con `talosLineNodePulse`,
   * `transform-box: fill-box`, nessuna linea) — cioè proprio ciò che
   * l'owner ha bocciato. Ora si prova la geometria e le animazioni VERE
   * del mobile (`mobile/src/style.css`, F4-#24/F5-#30): traccia, sweep e
   * riempimento dei nodi sfalsato.
   */
  const css = await source('frontend/src/styles/index.css');
  assert.match(css, /\.talos-line-loader-track\s*\{[^}]*stroke-opacity:\s*\.18/s);
  assert.match(css, /\.talos-line-loader-sweep\s*\{[^}]*stroke-dasharray:\s*88[^}]*animation:\s*talosLineSweep[^}]*infinite/s);
  assert.match(css, /\.talos-line-loader-node\s*\{[^}]*fill:\s*transparent[^}]*animation:\s*talosLineNodeFill[^}]*infinite/s);
  assert.match(css, /\.talos-line-loader-node:nth-of-type\(2\)[^}]*animation-delay:\s*\.36s/s);
  assert.match(css, /\.talos-line-loader-node:nth-of-type\(3\)[^}]*animation-delay:\s*\.73s/s);
  assert.match(css, /@keyframes\s+talosLineSweep\s*\{[^}]*stroke-dashoffset:/s);
  assert.match(css, /@keyframes\s+talosLineNodeFill\s*\{[^}]*fill:/s);
  // ⛔ AL CONTRARIO: il vecchio pulse desktop non deve sopravvivere da nessuna parte.
  assert.doesNotMatch(css, /talosLineNodePulse/);
});

test('RESPONSE-ACTIVITY-DOTS-08b — l’SVG costruito da app.js ha la geometria esatta del mobile', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  // ⭐ Il CSS da solo non basta: se app.js non disegna la linea, non c'è
  // nulla da animare. Qui si prova che gli elementi esistono davvero.
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /viewBox['"]?,\s*['"]0 0 96 16['"]/);
  assert.match(app, /talos-line-loader-track/);
  assert.match(app, /talos-line-loader-sweep/);
  assert.match(app, /\[16,\s*48,\s*80\]/); // i tre nodi, alle stesse ascisse del mobile
});

test('RESPONSE-ACTIVITY-LIFECYCLE-02 — la riga porta linea, nodi e tempo, senza barre decorative, e cancella sempre il timer', async () => {
  const app = await source('frontend/src/legacy/app.js');
  assert.doesNotMatch(app, /talos-line-loader-head/);
  assert.doesNotMatch(app, /run-activity-shimmer/);
  assert.match(app, /run-activity-elapsed/);
  assert.match(app, /attesaTimer/);
  assert.match(app, /clearInterval\(state\.realSession\.attesaTimer\)/);
});

test('RESPONSE-ACTIVITY-STAMPATO-05 — la ruota si chiude quando il testo è STAMPATO, mai all’arrivo del primo delta', async () => {
  /*
   * ⛔⛔⛔ 02/9 — owner: "il logo di caricamento deve esistere fino a
   * quando la risposta viene STREAMMATA E STAMPATA". Il primo delta
   * ARRIVATO non è testo a schermo: il render è programmato su
   * requestAnimationFrame. Questo test blocca il ritorno indietro —
   * `nascondiAttesaRisposta` non deve stare nel case TextMessageContent,
   * e deve stare dopo il render incrementale, sotto `mostrato > 0`.
   */
  const app = await source('frontend/src/legacy/app.js');
  const iCase = app.indexOf("case 'TextMessageContent'");
  const iFineCase = app.indexOf("case 'TextMessageEnd'", iCase);
  assert.ok(iCase >= 0 && iFineCase > iCase, 'il case TextMessageContent deve essere individuabile');
  assert.doesNotMatch(app.slice(iCase, iFineCase), /nascondiAttesaRisposta\(\)/);
  assert.match(app, /if \(statoRender\.mostrato > 0\) \{\s*[^}]*nascondiAttesaRisposta\(\);/s);
});

test('RESPONSE-ACTIVITY-REDUCED-03 — movimento ridotto CALMA i punti, non li congela: un respiro leggibile, non il pulse pieno', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⛔ 02/9 — contratto CAMBIATO deliberatamente rispetto alla versione
   * precedente di questo test (che pretendeva `animation: none`): owner,
   * "il logo di caricamento non è animato" — su questa macchina
   * `prefers-reduced-motion: reduce` è VERO a livello di sistema (misurato
   * via CDP), quindi il congelamento totale del "sta ancora lavorando"
   * si vedeva davvero come un loader rotto. Ricerca web: un indicatore di
   * stato essenziale resta vivo (più calmo, non fermo) sotto motion
   * ridotto — vedi il commento sopra `@keyframes talosLineNodeBreath` in
   * styles.css. Qui si prova che la sostituzione è quella giusta: la
   * keyframe usata è `talosLineNodeBreath` (sola opacità, niente scale),
   * mai più `talosLineNodePulse` (il pulse pieno) né `none`.
   */
  const css = await source('frontend/src/styles/index.css');
  assert.match(css, /reduce-motion\s+\.talos-line-loader-sweep\s*\{[^}]*animation:\s*talosLineSweep/s);
  assert.match(css, /reduce-motion\s+\.talos-line-loader-node\s*\{[^}]*animation:\s*talosLineNodeFill/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.talos-line-loader-sweep[^}]*animation:\s*talosLineSweep/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.talos-line-loader-node[^}]*animation:\s*talosLineNodeFill/s);
  // ⛔ AL CONTRARIO — la forma che riprodurrebbe il difetto: sotto motion
  // ridotto il loader NON deve mai essere spento del tutto.
  assert.doesNotMatch(css, /\.talos-line-loader-(?:sweep|node)[^}]*animation:\s*none/s);
  assert.doesNotMatch(css, /run-activity-shimmer/);
});

test('RESPONSE-ACTIVITY-INVERSE-04 — una nuova sessione passa dal cleanup comune, senza timer orfano', async () => {
  const app = await source('frontend/src/legacy/app.js');
  const start = app.indexOf('function nuovaGenerazioneSessione');
  const end = app.indexOf('\n  function ', start + 1);
  const body = app.slice(start, end);
  assert.ok(start >= 0 && end > start, 'nuovaGenerazioneSessione deve essere individuabile come funzione isolata');
  assert.ok(body.indexOf('nascondiAttesaRisposta();') >= 0, 'la funzione deve chiamare il cleanup comune');
  assert.ok(
    body.indexOf('nascondiAttesaRisposta();') < body.indexOf("$('#conversation').replaceChildren();"),
    'il timer deve essere cancellato prima che il DOM venga svuotato',
  );
});
