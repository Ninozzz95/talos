/*
 * L6 — il budget deterministico per pagina.
 *
 * ⛔ Nessuna rete, nessun file: questa funzione è pura di proposito, perché è
 * quella che decide che cosa il modello VEDE e una decisione del genere non può
 * dipendere da come è andata una richiesta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TALOS_RESEARCH_HEAD_SHARE,
  TALOS_RESEARCH_PAGE_BUDGET,
  talosResearchPageBudget,
} from '../../src/research/page-budget.mjs';

/** Una pagina finta ma con la forma di una vera: righe, e un centro riconoscibile. */
function pagina(caratteri, centro = 'IL PASSAGGIO NEL MEZZO') {
  const riga = 'testo di riempimento con parole vere e spazi normali. ';
  let testo = '';
  while (testo.length < caratteri) testo += riga;
  testo = testo.slice(0, caratteri);
  const meta = Math.floor(caratteri / 2);
  return testo.slice(0, meta) + centro + testo.slice(meta + centro.length);
}

test('il budget per pagina', async (t) => {
  await t.test('una pagina che ci sta arriva INTERA, senza marcatore', () => {
    const corta = pagina(3_000);
    const esito = talosResearchPageBudget(corta);

    assert.equal(esito.window, corta);
    assert.equal(esito.truncated, false);
    assert.equal(esito.marker, null);
    assert.equal(esito.omitted, 0);
    // ⛔ Un marcatore su una pagina non tagliata insegnerebbe al modello a
    // diffidare di pagine complete: il taglio si dichiara SOLO quando c'è.
    assert.equal(esito.shown, esito.total);
  });

  await t.test('sopra il tetto mostra testa e coda, e il conto torna alla lettera', () => {
    const lunga = pagina(84_312);
    const esito = talosResearchPageBudget(lunga);

    assert.equal(esito.truncated, true);
    assert.equal(esito.total, 84_312);
    assert.ok(esito.shown <= TALOS_RESEARCH_PAGE_BUDGET, `mostrati ${esito.shown} sopra il tetto`);
    // Contati, mai stimati: è l'invariante che rende il marcatore credibile.
    assert.equal(esito.omitted, esito.total - esito.shown);

    // La testa è la tesi della pagina, la coda le note: 75/25, non metà e metà.
    const atteso = Math.round(TALOS_RESEARCH_PAGE_BUDGET * TALOS_RESEARCH_HEAD_SHARE);
    assert.ok(esito.window.startsWith(lunga.slice(0, atteso - 200)), 'la testa non è la testa della pagina');
    assert.ok(esito.window.endsWith(lunga.slice(-1_000)), 'la coda non è la coda della pagina');
  });

  await t.test('il marcatore dice QUANTO, mai CHE COSA ha tagliato', () => {
    const esito = talosResearchPageBudget(pagina(84_312));

    // La lezione D-10G, 10/09: «l'elenco completo dei test» scritto su qualunque
    // troncamento, visto dall'owner su una pagina web. Un marcatore che nomina
    // il contenuto mente appena il contenuto non è quello.
    assert.match(esito.marker, /visti \d+ caratteri su 84312/);
    assert.match(esito.marker, /\d+ tolti dal mezzo/);
    assert.doesNotMatch(esito.marker, /elenco|riassunto|contenuto secondario|il resto non serve/i);
  });

  await t.test('senza un deposito NON inventa una chiamata che nessun attrezzo accetta', () => {
    const esito = talosResearchPageBudget(pagina(84_312));

    // ⛔ `leggi` oggi non ha né offset né lunghezza (talosHarness.mjs:1446-1451):
    // scriverla sarebbe un cancello inerte, cioè un'istruzione che il modello
    // proverà e che fallirà, bruciando un giro per colpa nostra.
    assert.doesNotMatch(esito.marker, /leggi\(|read_file|percorso=/);
    assert.match(esito.marker, /conservato nel dossier/);
  });

  await t.test('col deposito dice il percorso, e la chiamata solo se gliela danno vera', () => {
    const soloPercorso = talosResearchPageBudget(pagina(84_312), {
      reference: { percorso: 'fonti/a1b2c3.txt' },
    });
    assert.match(soloPercorso.marker, /Il testo intero è in fonti\/a1b2c3\.txt\./);
    assert.doesNotMatch(soloPercorso.marker, /Per sfogliare/);

    const conChiamata = talosResearchPageBudget(pagina(84_312), {
      reference: { percorso: 'fonti/a1b2c3.txt', chiamata: 'leggi(percorso="fonti/a1b2c3.txt", da=11250, quanti=4000)' },
    });
    assert.match(conChiamata.marker, /Per sfogliare il mezzo: leggi\(percorso="fonti\/a1b2c3\.txt", da=11250, quanti=4000\)/);
  });

  await t.test('deterministico: due giri identici danno gli stessi byte', () => {
    const lunga = pagina(84_312);
    assert.equal(talosResearchPageBudget(lunga).window, talosResearchPageBudget(lunga).window);

    /*
     * ⛔ E nessun separatore di migliaia: `toLocaleString` cambia con la lingua
     * della macchina, e la cache del prompt dei fornitori lavora su prefisso
     * ESATTO — due macchine che scrivono «15.000» e «15,000» non condividono
     * nulla. (platform.claude.com/docs/en/build-with-claude/prompt-caching,
     * letta l'11/09/2026.)
     */
    assert.match(talosResearchPageBudget(lunga).marker, /su 84312/);
  });

  await t.test('taglia sui confini di riga quando ce ne sono', () => {
    const righe = `${Array.from({ length: 4_000 }, (_, i) => `riga numero ${i} con un po' di testo`).join('\n')}\n`;
    const esito = talosResearchPageBudget(righe, { cap: 15_000 });

    const testa = esito.window.slice(0, esito.window.indexOf('\n\n…'));
    // L'ultima riga mostrata è intera: mezza riga di markdown è rumore.
    assert.ok(righe.includes(`${testa}\n`), 'la testa non finisce su un confine di riga');
  });

  await t.test('un testo senza spazi né righe si taglia netto invece di non tagliare', () => {
    const compatto = 'x'.repeat(50_000);
    const esito = talosResearchPageBudget(compatto, { cap: 1_000, headShare: 0.75 });

    assert.equal(esito.shown, 1_000);
    assert.equal(esito.omitted, 49_000);
  });

  /*
   * ⛔ LA PROVA AL CONTRARIO che giustifica tutto il resto del lotto: un
   * passaggio che sta nel mezzo NON è nella finestra. Se la verifica delle
   * citazioni guardasse qui invece che nel testo intero, una citazione onesta
   * risulterebbe inventata. Il seguito di questa prova è in
   * `collector-cache.test.mjs`, dove `talosResearchLocate` lo ritrova.
   */
  await t.test('un passaggio nel mezzo NON è nella finestra: per questo la verifica non deve leggerla', () => {
    const lunga = pagina(84_312, 'LA FRASE CHE IL MODELLO CITERA');
    const esito = talosResearchPageBudget(lunga);

    assert.ok(lunga.includes('LA FRASE CHE IL MODELLO CITERA'));
    assert.ok(!esito.window.includes('LA FRASE CHE IL MODELLO CITERA'));
  });
});
