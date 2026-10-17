/*
 * 15/10/2026 sera (bugfixer) — seconda revisione avversaria del titolo: la regola unica dei nomi corti (1769fe08e,
 * `src/titolo-breve.mjs` + la copia del client in `session-item.js`). Le ROSSE sono difetti; le VERDI dicono ciò che regge.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { contaGrafemi, titoloBreve, TITOLO_MASSIMO } from '../src/titolo-breve.mjs';
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

test('REV2-TITOLO-03 — [VERDE] la regola è idempotente: il nome derivato rifà `titoloBreve` su una `consegnaCorta` già tagliata e non cambia niente', () => {
  for (const testo of corpus(4000, 99)) {
    const una = titoloBreve(testo);
    assert.equal(titoloBreve(una), una, JSON.stringify(testo));
  }
});

test('REV2-TITOLO-04 — [CURATO 15/10, era S5] un testo lungo di sola punteggiatura (una riga «-----», «!!!!», «……») diventa un nome di UN carattere: «…»', () => {
  for (const testo of ['-'.repeat(120), '!'.repeat(100), '…'.repeat(90), `${'.'.repeat(60)} ${'?'.repeat(60)}`]) {
    const nome = titoloBreve(testo);
    assert.notEqual(nome, '…', `${JSON.stringify(testo.slice(0, 12))}… ⇒ «${nome}»: la pulizia della punteggiatura in fondo ha mangiato tutto il taglio`);
  }
});

test('REV2-TITOLO-07 — [CURATO 15/10, era S5] il nome di una sessione entra nel registro degli agenti tagliato a 160 UNITÀ (`taskCorto`, session-registry.mjs:3625): ora che un nome può superarle, una bandiera si spezza', async () => {
  let fine; const attesa = new Promise((r) => { fine = r; });
  let onEvento = null;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => { onEvento = input.onEvento; input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return attesa; },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero');
  const lungo = `ab ${'🏴󠁧󠁢󠁳󠁣󠁴󠁿'.repeat(20)}`; // 22 grafemi, 3 + 14×20 = 283 unità
  assert.deepEqual(await registro.rinomina(sessionId, lungo), { ok: true }, 'premessa: il server accetta il nome (22 grafemi)');
  onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); fine({ ok: true });
  await new Promise((r) => { setTimeout(r, 50); });
  const letto = await registro.timelineAgenti(sessionId);
  const nodi = JSON.stringify(letto);
  const taskCorti = [...nodi.matchAll(/"taskCorto":"((?:[^"\\]|\\.)*)"/gu)].map((m) => JSON.parse(`"${m[1]}"`));
  assert.ok(taskCorti.some((t) => t !== 'c'), `premessa: il registro degli agenti ha la sessione (${nodi.slice(0, 200)})`);
  const grafemiDi = (x) => Array.from(new Intl.Segmenter('it', { granularity: 'grapheme' }).segment(x), (g) => g.segment);
  for (const t of taskCorti.filter((x) => x !== 'c')) { // 'c' è la consegna, prima della rinomina
    const parti = grafemiDi(t);
    assert.deepEqual(parti, grafemiDi(lungo).slice(0, parti.length), `taskCorto di ${t.length} unità su ${lungo.length}: l'ultimo pezzo ${JSON.stringify(parti.at(-1))} è una bandiera spezzata`);
  }
});
