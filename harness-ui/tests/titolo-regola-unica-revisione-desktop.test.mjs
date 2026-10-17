/*
 * 15/10/2026 sera (bugfixer) — seconda revisione avversaria del titolo: la regola unica dei nomi corti (1769fe08e,
 * `src/titolo-breve.mjs` + la copia del client in `session-item.js`). Le ROSSE sono difetti; le VERDI dicono ciò che regge.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { contaGrafemi, titoloBreve, TITOLO_MASSIMO } from '../src/titolo-breve.mjs';
import { nomeConSuffisso, titoloDalPrimoMessaggio } from '../frontend/src/components/session-item.js';
import { createSessionRegistry } from '../src/session-registry.mjs';

/** Un generatore deterministico (mulberry32): lo stesso seme dà lo stesso corpus, e un rosso si riproduce. */
function generatore(seme) {
  let a = seme >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PEZZI = [
  'parola', 'ab', 'x', 'è', 'e\u0301', 'ñ', '日本語', '请阅读', '한국어', '\u1100\u1161\u11A8', 'क्ष', 'कृपया', 'नमस्ते', 'ไทย', 'مرحبا', 'שלום',
  '🚀', '👨‍👩‍👧‍👦', '🇮🇹', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '👍🏽', '1️⃣', '❤️', '🧑🏾‍💻', '𠀀', '𝒳',
  ' ', ' ', ' ', '  ', '\n', '\t', '\r\n', '\u00A0', '\u3000', '\u2009', '\u2028', '\uFEFF', '\u1680', '\u200B', '\u200D',
  ',', '.', '…', '!', '?', ';', ':', '-', '—', '–', '...', '«', '»', '"', '(', ')', '/', 'C:\\x\\y', 'https://esempio.it/a/b',
  '\uD800', '\uDC00',
];
function corpus(n, seme = 20261015) {
  const r = generatore(seme);
  const testi = [];
  for (let i = 0; i < n; i += 1) {
    const lunghezza = Math.floor(r() * 140);
    let s = '';
    for (let j = 0; j < lunghezza; j += 1) s += PEZZI[Math.floor(r() * PEZZI.length)];
    testi.push(s);
  }
  return testi;
}

test('REV2-TITOLO-01 — [VERDE] parità a tappeto: 4.000 testi misti (grafemi composti, Indic, Hangul, RTL, ogni spazio, surrogati soli), tetti e riserve diversi — client e server danno lo stesso nome', () => {
  let confronti = 0;
  for (const testo of corpus(4000)) {
    for (const [massimo, riserva] of [[80, 0], [80, 2], [80, 3], [40, 0], [10, 1], [3, 2]]) {
      assert.equal(titoloDalPrimoMessaggio(testo, massimo, { riserva }), titoloBreve(testo, massimo, { riserva }), JSON.stringify({ testo, massimo, riserva }));
      confronti += 1;
    }
  }
  assert.equal(confronti, 24000);
});

test('REV2-TITOLO-02 — [VERDE] su tutto il corpus: ogni nome del client (anche con «-2», «-12») sta nel tetto che conta il server, e il suffisso non finisce mai dopo i puntini', () => {
  for (const testo of corpus(4000, 7)) {
    const base = titoloDalPrimoMessaggio(testo);
    for (const nome of [base, nomeConSuffisso(base, '-2'), nomeConSuffisso(base, '-12')]) {
      assert.ok(contaGrafemi(nome.trim()) <= TITOLO_MASSIMO, JSON.stringify({ testo, nome }));
      assert.doesNotMatch(nome, /…-\d+$/u, JSON.stringify(nome));
    }
  }
});

test('REV2-TITOLO-05 — [VERDE, da sapere] un testo CORTO che finisce coi suoi «…», con un doppione, si chiama «Vediamo-2…»: il suffisso scavalca i puntini della persona', () => {
  assert.equal(nomeConSuffisso('Vediamo…', '-2'), 'Vediamo-2…');
  assert.equal(nomeConSuffisso('Vediamo', '-2'), 'Vediamo-2');
});

test('REV2-TITOLO-06 — [CURATO 15/10, era S5] i due campi di rinomina limitano a 80 UNITÀ UTF-16 (`maxlength`), il server ora accetta 80 GRAFEMI: un nome con emoji non si può allungare a mano, e una frase hindi di 74 grafemi (117 unità) non si può scrivere', () => {
  const modello = readFileSync(new URL('../frontend/index.template.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../frontend/src/legacy/app.js', import.meta.url), 'utf8');
  const campoVelo = /<input id="rinominaSessioneNome"[^>]*>/u.exec(modello)?.[0] ?? '';
  const campoFoglio = /<input class="sheet-input" id="renameSessionInput"[^>]*>/u.exec(app)?.[0] ?? '';
  assert.ok(campoVelo && campoFoglio, 'premessa: i due campi ci sono');
  const hindi = 'कृपया फ़ोल्डर में दोनों दस्तावेज़ पढ़ें और बताएं कि क्या मेरा विचार अवधारणात्मक रूप से सही है और आगे बढ़ना समझदारी है'; // 74 grafemi, 117 unità
  assert.ok(contaGrafemi(hindi) <= TITOLO_MASSIMO && hindi.length > 80, `premessa: ${contaGrafemi(hindi)} grafemi, ${hindi.length} unità`);
  for (const campo of [campoVelo, campoFoglio]) {
    assert.doesNotMatch(campo, /maxlength="80"/u, `${campo.slice(0, 60)}…: \`maxlength\` conta unità UTF-16, il server grafemi (session-registry.mjs:12969)`);
  }
});
