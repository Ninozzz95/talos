/*
 * R-24 (Performance 29/10/2026, corsa H-bloccate r1; owner 29/10 sera D2, OK della CLI): il modello copiava la forma di una chiamata
 *   precedente e la parola da cercare scivolava in `continua` («rifiutoAnticipato», «testo», «a», «x»): nove «NOT FOUND. There is no
 *   search …» di fila. Ora vale come riferimento solo `r<numero>`; un altro valore senza `testo` né `nome` si cerca come `testo` con una
 *   nota; con `testo`/`nome` si ignora; un `r<n>` sconosciuto riceve l'elenco delle ricerche della sessione; i segnaposto di R-01
 *   vengono PRIMA di tutto (la CLI: se no «undefined» diventa una ricerca vera); lo schema porta `pattern`.
 * Ricerca: `RICERCA-R23-R25-ONE-UP-2026-10-29.md` §R-24 (Codex `shell_spec.rs:110-150`, Claude Code `ht()` «Did you mean…»).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ATTREZZI_OPENAI, cercaNelProgetto } from '../src/kernel/talosHarness.mjs';
import { creaRegistroRicerche, riferimentoDiRicerca } from '../src/kernel/ricerche-in-corso.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-r24-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  mkdirSync(join(radice, 'src'), { recursive: true });
  writeFileSync(join(radice, 'src', 'modulo.mjs'), 'export const AGO_R24 = 1;\nconst r12abc = 2;\n');
  writeFileSync(join(radice, 'src', 'segnaposto.mjs'), 'let x = undefined;\nlet y = null;\n');
  writeFileSync(join(radice, 'leggimi.md'), 'AGO_R24 anche qui\n');
  const disco = {
    async elenca(dentro = '') {
      const voci = await readdir(dentro ? join(radice, dentro) : radice, { withFileTypes: true });
      return voci.map((v) => ({ nome: v.name, cartella: v.isDirectory(), byte: 0 }));
    },
    async leggi(percorso) { return readFile(join(radice, ...percorso.split('/')), 'utf8'); },
  };
  return { radice, disco };
}
/* Una ricerca viva finta nel registro: resta «in corso» finché la prova non finisce. */
function conUnaRicercaViva(ricerche, parametri = { testo: 'needle', chiaveNome: '' }, tipo = 'testo') {
  return ricerche.registra({ finita: new Promise(() => {}), ferma() {}, uscita: () => '', tipo, parametri });
}
const NOTA_CERCATA = /^NOTE: "continua" was "AGO_R24", which is not a search id \(those look like "r1"\), so it was searched as "testo"\./u;

test('R24-01 LA PAROLA SCIVOLATA: continua senza testo né nome si cerca come testo, con la nota in testa', async (t) => {
  const { radice, disco } = progetto(t);
  const esito = await cercaNelProgetto(disco, { dentro: 'src', offset: 0, continua: 'AGO_R24' }, { radice, ricerche: creaRegistroRicerche() });
  assert.match(esito, NOTA_CERCATA);
  assert.match(esito, /src\/modulo\.mjs:1:export const AGO_R24 = 1;/u);
  assert.doesNotMatch(esito, /leggimi\.md/u, '`dentro` vale anche per la parola scivolata');
  assert.doesNotMatch(esito, /NOT FOUND|There is no search/u);
  // e senza ripgrep (camminata JS)
  const prima = process.env.TALOS_RG_PATH;
  process.env.TALOS_RG_PATH = join(radice, 'rg-che-non-esiste.exe');
  t.after(() => { if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima; });
  const senzaRg = await cercaNelProgetto(disco, { continua: 'AGO_R24' }, { radice, ricerche: creaRegistroRicerche() });
  assert.match(senzaRg, NOTA_CERCATA);
  assert.match(senzaRg, /src\/modulo\.mjs/u);
});

test('R24-02 CON TESTO: un continua che non è un id si ignora con la nota dei segnaposto, e si cerca il testo', async (t) => {
  const { radice, disco } = progetto(t);
  const ricerche = creaRegistroRicerche();
  const senza = await cercaNelProgetto(disco, { testo: 'AGO_R24', dentro: 'src' }, { radice, ricerche });
  for (const continua of ['x', 'rifiutoAnticipato']) {
    const esito = await cercaNelProgetto(disco, { testo: 'AGO_R24', dentro: 'src', continua }, { radice, ricerche });
    assert.match(esito, new RegExp(`^NOTE: "continua" was "${continua}": that is not a search id, so it was ignored\\.`, 'u'));
    assert.equal(esito.split('\n').slice(1).join('\n'), senza, 'dopo la nota, la stessa risposta');
  }
  const conNome = await cercaNelProgetto(disco, { nome: 'modulo', continua: 'x' }, { radice, ricerche });
  assert.match(conNome, /ignored\./u);
  assert.match(conNome, /src\/modulo\.mjs/u);
  assert.doesNotMatch(conNome, /segnaposto\.mjs/u, 'con nome, «x» non diventa una ricerca');
});

test('R24-03 ID SCONOSCIUTO: il NOT FOUND elenca le ricerche della sessione con la loro domanda', async (t) => {
  const { radice, disco } = progetto(t);
  const ricerche = creaRegistroRicerche();
  const vuoto = await cercaNelProgetto(disco, { continua: 'r9' }, { radice, ricerche });
  assert.match(vuoto, /^NOT FOUND\. There is no search "r9" in this session: .* No search is kept in this session right now\. Nothing was searched; run the search again with "testo" or "nome", without "continua"\.$/u);
  assert.equal(conUnaRicercaViva(ricerche), 'r1');
  assert.equal(conUnaRicercaViva(ricerche, { chiaveNome: '.mjs' }, 'nomi'), 'r2');
  const esito = await cercaNelProgetto(disco, { continua: 'r9' }, { radice, ricerche });
  assert.match(esito, /^NOT FOUND\. There is no search "r9" in this session/u);
  assert.match(esito, /Searches kept in this session: r2 for nome "\.mjs" \(running\), r1 for testo "needle" \(running\); continue one of them with its id\./u);
  assert.match(esito, /without "continua"\.$/u, 'la via per ripartire resta in fondo (R01-03)');
});

test('R24-04 FORMA: solo r<numero> è un riferimento; «r12abc» si cerca come testo', async (t) => {
  for (const [valore, atteso] of [['r1', 'r1'], [' r1 ', 'r1'], ['R3', 'r3'], ['r0', 'r0'], ['r12abc', null], ['1', null], ['r', null], ['rr1', null], ['r1 r2', null], ['', null], [7, null]]) {
    assert.equal(riferimentoDiRicerca(valore), atteso, JSON.stringify(valore));
  }
  const { radice, disco } = progetto(t);
  const esito = await cercaNelProgetto(disco, { dentro: 'src', continua: 'r12abc' }, { radice, ricerche: creaRegistroRicerche() });
  assert.match(esito, /^NOTE: "continua" was "r12abc", which is not a search id/u);
  assert.match(esito, /src\/modulo\.mjs:2:const r12abc = 2;/u);
});

test('R24-05 SEGNAPOSTO PRIMA (CLI): «undefined», «null», soli spazi non diventano mai una ricerca vera', async (t) => {
  const { radice, disco } = progetto(t);
  for (const continua of ['undefined', 'null', ' NULL ', '   ']) {
    const esito = await cercaNelProgetto(disco, { dentro: 'src', offset: 0, continua }, { radice, ricerche: creaRegistroRicerche() });
    assert.match(esito, /give at least one of "testo" or "nome"\./u, JSON.stringify(continua));
    assert.doesNotMatch(esito, /segnaposto\.mjs|searched as "testo"/u, `${JSON.stringify(continua)} non si cerca come testo`);
  }
  const vuota = await cercaNelProgetto(disco, { dentro: 'src', continua: '' }, { radice, ricerche: creaRegistroRicerche() });
  assert.equal(vuota, 'give at least one of "testo" or "nome".', 'la stringa vuota resta assente in silenzio');
});

test('R24-06 SCHEMA: continua porta il pattern dell\'id e dice dove va il testo', () => {
  const continua = ATTREZZI_OPENAI.find((a) => a.function.name === 'cerca').function.parameters.properties.continua;
  assert.equal(continua.pattern, '^r[0-9]+$');
  assert.match(continua.description, /Never put the text to look for here: that goes in "testo"\./u);
  assert.ok(new RegExp(continua.pattern, 'u').test('r1') && !new RegExp(continua.pattern, 'u').test('r12abc'));
});
