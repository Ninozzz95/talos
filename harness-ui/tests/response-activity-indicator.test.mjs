import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

test('RESPONSE-ACTIVITY-DOTS-08 — i tre punti hanno un movimento CSS evidente, sfalsato e compositabile', async () => {
  const css = await source('public/styles.css');
  assert.match(css, /\.talos-line-loader-node\s*\{[^}]*transform-box:\s*fill-box[^}]*animation:\s*talosLineNodePulse[^}]*infinite/s);
  assert.match(css, /\.talos-line-loader-node:nth-of-type\(2\)[^}]*animation-delay:/s);
  assert.match(css, /\.talos-line-loader-node:nth-of-type\(3\)[^}]*animation-delay:/s);
  assert.match(css, /@keyframes\s+talosLineNodePulse\s*\{[^}]*transform:/s);
});

test('RESPONSE-ACTIVITY-LIFECYCLE-02 — la riga crea solo tre punti e tempo, senza barre decorative, e cancella sempre il timer', async () => {
  const app = await source('public/app.js');
  assert.doesNotMatch(app, /talos-line-loader-head/);
  assert.doesNotMatch(app, /talos-line-loader-sweep/);
  assert.doesNotMatch(app, /run-activity-shimmer/);
  assert.match(app, /run-activity-elapsed/);
  assert.match(app, /attesaTimer/);
  assert.match(app, /clearInterval\(state\.realSession\.attesaTimer\)/);
});

test('RESPONSE-ACTIVITY-REDUCED-03 — movimento ridotto ferma i punti ma mantiene un marchio leggibile', async () => {
  const css = await source('public/styles.css');
  assert.match(css, /reduce-motion[^\n{]*\.talos-line-loader-node[^}]*animation:\s*none/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.talos-line-loader-node[^}]*animation:\s*none/s);
  assert.doesNotMatch(css, /run-activity-shimmer/);
});

test('RESPONSE-ACTIVITY-INVERSE-04 — una nuova sessione passa dal cleanup comune, senza timer orfano', async () => {
  const app = await source('public/app.js');
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
