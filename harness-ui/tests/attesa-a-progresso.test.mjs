import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaAttesaAProgresso } from './aiuto/attesa-a-progresso.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * L'aiuto condiviso delle attese dei workflow (01/10/2026, PR pubblica #45): la scadenza conta il tempo SENZA progresso delle
 * cartelle dati registrate. Qui il «disco» è una cartella vera in cui si scrive a ritmo noto, e la condizione diventa vera DOPO
 * il budget: a orologio cadrebbe, a progresso no; ferma, cade al suo tempo; con `{ progresso: false }` resta a orologio.
 */
function cartellaChe(t, { scriviOgniMs = 0 } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-attesa-progresso-'));
  writeFileSync(join(cartella, 'giornale.jsonl'), '');
  const timer = scriviOgniMs > 0 ? setInterval(() => appendFileSync(join(cartella, 'giornale.jsonl'), '{"fatto":1}\n'), scriviOgniMs) : null;
  t.after(() => { if (timer) clearInterval(timer); rimuoviCartellaDiProva(cartella); });
  return cartella;
}
const veraDopo = (ms) => { const quando = Date.now() + ms; return () => Date.now() >= quando; };

test('ATTESA-PROGRESSO-01: una cartella che riceve scritture tiene viva l attesa oltre il budget', async t => {
  const { aspettaChe, segui } = creaAttesaAProgresso({ ms: 300 });
  segui(cartellaChe(t, { scriviOgniMs: 100 }));
  assert.equal(await aspettaChe(veraDopo(900)), true, 'il run è vivo: l attesa si sposta finché scrive');
});

test('ATTESA-PROGRESSO-02: una cartella ferma fa cadere l attesa al suo tempo', async t => {
  const { aspettaChe, segui } = creaAttesaAProgresso({ ms: 300 });
  segui(cartellaChe(t));
  const inizio = Date.now();
  assert.equal(await aspettaChe(veraDopo(5_000)), false);
  const durata = Date.now() - inizio;
  assert.ok(durata >= 300 && durata < 1_500, `un run fermo cade dopo il budget, non dopo ${durata} ms`);
});

test('ATTESA-PROGRESSO-03: con { progresso: false } l attesa resta a orologio anche se la cartella scrive', async t => {
  const { aspettaChe, segui } = creaAttesaAProgresso({ ms: 300 });
  segui(cartellaChe(t, { scriviOgniMs: 100 }));
  assert.equal(await aspettaChe(veraDopo(900), 300, { progresso: false }), false);
});

test('ATTESA-PROGRESSO-04: senza cartelle registrate è un attesa a orologio', async () => {
  const { aspettaChe } = creaAttesaAProgresso({ ms: 300 });
  assert.equal(await aspettaChe(veraDopo(900)), false);
});

test('ATTESA-PROGRESSO-05: un run che scrive senza mai arrivare cade al tetto, non aspetta per sempre', async t => {
  const { aspettaChe, segui } = creaAttesaAProgresso({ ms: 300, tetto: 700 });
  segui(cartellaChe(t, { scriviOgniMs: 100 }));
  const inizio = Date.now();
  assert.equal(await aspettaChe(veraDopo(5_000)), false);
  const durata = Date.now() - inizio;
  assert.ok(durata >= 700 && durata < 2_000, `il tetto ferma l attesa dopo ${durata} ms`);
});
