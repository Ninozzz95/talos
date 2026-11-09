/*
 * PERF 30/10/2026 — `cerca` con più termini (R-33; proposta PROPOSTA-CERCA-PIU-TERMINI-2026-10-30.md, approvata dall'owner; forma del
 * Desktop: campo NUOVO `oppure`, `testo` invariato; condizioni di CLI e Mobile). Misura che l'ha chiesto: campagna pubblica-ebb04d2c1,
 * «bloccate», 20 ricerche di TALOS contro 7 di Claude Code, una frase letterale ciascuna e 5 a vuoto (ripgrep `--fixed-strings`).
 * Le due strade si provano entrambe: ripgrep (PC) e la camminata JS (telefono, ripgrep forzato assente con `TALOS_RG_PATH`).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cercaNelProgetto, ATTREZZI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function discoVero(radice) {
  return {
    async elenca(dentro = '') {
      const { readdir, stat } = await import('node:fs/promises');
      const voci = await readdir(dentro ? join(radice, dentro) : radice, { withFileTypes: true });
      return Promise.all(voci.map(async (v) => ({ nome: v.name, cartella: v.isDirectory(), byte: v.isDirectory() ? 0 : (await stat(join(radice, dentro, v.name)).catch(() => ({ size: 0 }))).size })));
    },
    async leggi(percorso) { const { readFile } = await import('node:fs/promises'); return readFile(join(radice, ...percorso.split('/')), 'utf8'); },
  };
}
function albero(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-oppure-'));
  t.after(() => rimuoviCartellaDiProva(c));
  mkdirSync(join(c, 'src'), { recursive: true });
  writeFileSync(join(c, 'src', 'uno.mjs'), 'const ALFA = 1 // primo\n');
  writeFileSync(join(c, 'src', 'due.mjs'), 'const BETA = 2 // secondo\n');
  writeFileSync(join(c, 'src', 'tre.mjs'), 'const GAMMA = 3 // terzo\n');
  writeFileSync(join(c, 'src', 'quattro.mjs'), 'niente qui\n');
  return c;
}
const strade = [['ripgrep', null], ['camminata JS (telefono)', 'rg-inesistente-oppure.exe']];
for (const [strada, rgFinto] of strade) {
  const conRg = async (_t, fn) => {
    const prima = process.env.TALOS_RG_PATH;
    if (rgFinto) process.env.TALOS_RG_PATH = join(tmpdir(), rgFinto);
    try { return await fn(); } finally { if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima; }
  };

  test(`OPP-01 [${strada}] un termine solo: l'uscita è IDENTICA con e senza il campo nuovo assente (prova d'oro)`, async (t) => {
    const c = albero(t);
    await conRg(t, async () => {
      const a = await cercaNelProgetto(discoVero(c), { testo: 'alfa' }, { radice: c });
      const b = await cercaNelProgetto(discoVero(c), { testo: 'alfa', oppure: undefined }, { radice: c });
      assert.equal(b, a);
      assert.match(a, /src\/uno\.mjs/u);
    });
  });

  test(`OPP-02 [${strada}] tre termini in una chiamata: ogni file col suo termine c'è, quello senza no`, async (t) => {
    const c = albero(t);
    await conRg(t, async () => {
      const r = await cercaNelProgetto(discoVero(c), { testo: 'alfa', oppure: ['beta', 'GAMMA'] }, { radice: c });
      for (const f of ['uno', 'due', 'tre']) assert.match(r, new RegExp(`src/${f}\\.mjs`, 'u'), `${f} manca: ${r.slice(0, 300)}`);
      assert.doesNotMatch(r, /quattro\.mjs/u);
    });
  });

  test(`OPP-03 [${strada}] solo «oppure» (senza testo) funziona; un elenco vuoto, una voce vuota o il 9° termine si RIFIUTANO, mai «trova tutto»`, async (t) => {
    const c = albero(t);
    await conRg(t, async () => {
      const r = await cercaNelProgetto(discoVero(c), { oppure: ['beta', 'gamma'] }, { radice: c });
      assert.match(r, /due\.mjs/u); assert.match(r, /tre\.mjs/u); assert.doesNotMatch(r, /uno\.mjs/u);
      for (const male of [[], [''], ['  '], [42], Array.from({ length: 9 }, (_, i) => `t${i}`), 'beta']) {
        const rifiuto = await cercaNelProgetto(discoVero(c), { testo: 'alfa', oppure: male }, { radice: c });
        assert.match(rifiuto, /^INVALID\. "oppure"/u, `${JSON.stringify(male)}: ${String(rifiuto).slice(0, 120)}`);
        assert.match(rifiuto, /nothing was searched/u);
      }
    });
  });

  test(`OPP-05 [${strada}] un «continua» scivolato con «oppure» si ignora e i termini viaggiano nella chiamata ripetuta; nessun risultato si dice per tutti i termini`, async (t) => {
    const c = albero(t);
    await conRg(t, async () => {
      const r = await cercaNelProgetto(discoVero(c), { oppure: ['beta', 'gamma'], continua: 'undefined' }, { radice: c });
      assert.match(r, /^NOTE: "continua" was "undefined"/u);
      assert.match(r, /due\.mjs/u); assert.match(r, /tre\.mjs/u);
      const r2 = await cercaNelProgetto(discoVero(c), { oppure: ['beta'], continua: 'parola' }, { radice: c });
      assert.match(r2, /^NOTE: "continua" was "parola": that is not a search id, so it was ignored/u);
      assert.match(r2, /due\.mjs/u); assert.doesNotMatch(r2, /uno\.mjs/u);
      const vuoto = await cercaNelProgetto(discoVero(c), { testo: 'zzz', oppure: ['yyy'] }, { radice: c });
      assert.match(vuoto, /no file matches/u);
      if (!rgFinto) assert.match(vuoto, /no file matches "zzz" or "yyy"/u);
    });
  });

  test(`OPP-06 [${strada}] un doppione che cambia solo per le maiuscole si cerca una volta sola (revisione del Desktop, M8)`, async (t) => {
    const c = albero(t);
    await conRg(t, async () => {
      const r = await cercaNelProgetto(discoVero(c), { testo: 'Zzq', oppure: ['zzq', 'ZZQ '] }, { radice: c });
      assert.match(r, /no file matches/u);
      if (!rgFinto) assert.match(r, /no file matches "Zzq" \(/u, `un termine solo nella riga, il primo come scritto: ${r.slice(0, 120)}`);
      const uno = await cercaNelProgetto(discoVero(c), { testo: 'Alfa', oppure: ['alfa'] }, { radice: c });
      assert.equal(uno, await cercaNelProgetto(discoVero(c), { testo: 'Alfa' }, { radice: c }), 'con il doppione l\'uscita è quella del termine solo');
    });
  });
}

test('OPP-04 lo schema: `oppure` è un campo nuovo facoltativo (elenco di testi, al più 8), `testo` resta una stringa; `continua` non suggerisce più un id da imitare', () => {
  const cerca = ATTREZZI_OPENAI.find((a) => a.function.name === 'cerca').function.parameters;
  assert.equal(cerca.properties.testo.type, 'string');
  assert.deepEqual({ type: cerca.properties.oppure.type, items: cerca.properties.oppure.items.type, max: cerca.properties.oppure.maxItems, min: cerca.properties.oppure.minItems }, { type: 'array', items: 'string', max: 8, min: 1 });
  assert.equal(cerca.required.includes('oppure'), false);
  assert.doesNotMatch(cerca.properties.continua.description, /e\.g\. "r1"/u);
  assert.match(cerca.properties.continua.description, /never make one up/u);
  for (const v of Object.values(cerca.properties)) assert.equal(Object.hasOwn(v, 'oneOf') || Object.hasOwn(v, 'anyOf'), false, 'niente unioni di tipi');
});
