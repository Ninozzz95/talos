/*
 * R-28 di Performance (29/10/2026 notte): su un progetto grande ogni `scrivi`/`file_edit` costava 2-6 s, perché il cancello semantico
 * rianalizzava TUTTI i sorgenti a ogni scrittura, anche di un `.txt`. Owner 29/10 notte: cancello veloce (strada A, poi il Rust fatto in
 * casa, misurati). Contratto con la CLI: stesso esito `{stato, perche, copertura, fatto}`, stessi messaggi.
 * A1 — un file che il cancello non sa giudicare (fuori da ESTENSIONI_SORGENTE) non fa partire nessuna analisi: l'esito è quello di
 * sempre («presente»: il prima e il dopo dei sorgenti sono identici), a costo zero.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { premessaDellaScrittura } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function progettoGrande(t, quanti = 250) {
  const c = mkdtempSync(join(tmpdir(), 'talos-cancello-'));
  t.after(() => rimuoviCartellaDiProva(c));
  mkdirSync(join(c, 'src'));
  for (let i = 0; i < quanti; i++) {
    writeFileSync(join(c, 'src', `m${i}.ts`), `import { f${(i + 1) % quanti} } from './m${(i + 1) % quanti}';\nexport function f${i}(x: number): number {\n  const y = x * ${i};\n  return y > 0 ? y : f${(i + 1) % quanti}(y + 1);\n}\n`);
  }
  writeFileSync(join(c, 'note.txt'), 'prima\n');
  return c;
}
const tempo = async (fn) => { const t0 = performance.now(); const r = await fn(); return { r, ms: performance.now() - t0 }; };

test('CANC-A1-01 un .txt non fa partire il cancello: esito «presente», esisteva e contenutoPrima veri, e costa una frazione di un sorgente', async (t) => {
  const c = progettoGrande(t);
  await premessaDellaScrittura(c, 'src/m1.ts', 'export const caldo = 1;\n'); // scalda il compilatore: il confronto è fra due chiamate calde
  const txt = await tempo(() => premessaDellaScrittura(c, 'note.txt', 'dopo\n'));
  const ts = await tempo(() => premessaDellaScrittura(c, 'src/m2.ts', 'import { f3 } from "./m3";\nexport function f2(x: number): number { return f3(x); }\n'));
  assert.equal(txt.r.stato, 'presente');
  assert.equal(txt.r.esisteva, true);
  assert.equal(txt.r.contenutoPrima, 'prima\n');
  assert.equal(ts.r.stato, 'presente', 'premessa: il sorgente valido passa');
  assert.ok(txt.ms * 5 < ts.ms, `il .txt deve costare molto meno di un sorgente: ${txt.ms.toFixed(1)} ms contro ${ts.ms.toFixed(1)} ms`);
});

test('CANC-A1-02 AL CONTRARIO: un sorgente con un riferimento inventato resta «assente», e un .txt nuovo dice esisteva:false', async (t) => {
  const c = progettoGrande(t, 20);
  const rotto = await premessaDellaScrittura(c, 'src/m1.ts', 'export function f1(x: number) { return nonEsiste(x); }\n');
  assert.equal(rotto.stato, 'assente');
  assert.match(rotto.perche, /unresolved reference/u);
  const nuovo = await premessaDellaScrittura(c, 'docs/nuovo.md', '# ciao\n');
  assert.equal(nuovo.stato, 'presente');
  assert.equal(nuovo.esisteva, false);
  assert.equal(nuovo.contenutoPrima, null);
});
