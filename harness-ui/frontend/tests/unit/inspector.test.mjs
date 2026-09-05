import test from 'node:test';
import assert from 'node:assert/strict';
import { kilo, righeAmbiente, righeFinestra, righeGiri, righeFile, datiProcesso, processiDagliEventi, comandoDagliArgomenti } from '../../src/components/inspector.js';
import { INSPECTOR } from '../../lab/fixtures/inspector.js';

// 06/09 B2 — la colonna dei dettagli dice il vero: dati del monolite, «—» dove mancano.

test('INSP-AMBIENTE: quattro righe, e «—» quando il dato non c\'è', () => {
  assert.deepEqual(righeAmbiente(INSPECTOR.contesto), [['Ramo', 'lane/harness-desktop'], ['Worktree', 'AVM-harness-desktop'], ['Non salvate', '2 file'], ['Repo annidati', '1 · fiducia separata']]);
  assert.deepEqual(righeAmbiente({ branch: null, repoAnnidati: [] }), [['Ramo', '—'], ['Worktree', '—'], ['Non salvate', '—'], ['Repo annidati', 'nessuno']]);
  assert.deepEqual(righeAmbiente(null)[3], ['Repo annidati', '—']);
});

test('INSP-FINESTRA: le parole del mockup dai token; senza finestra niente percentuali inventate', () => {
  const f = righeFinestra(INSPECTOR.usage, INSPECTOR.finestra, INSPECTOR.ripartizione);
  assert.equal(f.titoloDestra, '200k');
  // le cifre del mockup: parti troncate al decimo, «Libera» = finestra meno tutto, percentuale che chiude a 100
  assert.deepEqual(f.righe.map((r) => r.slice(0, 2)), [['Attrezzi', '7,5k · 3,7%'], ['Istruzioni', '4,1k · 2,0%'], ['Memoria', '1,8k · 0,9%'], ['Conversazione', '41,2k · 20,6%'], ['Libera', '145,4k · 72,8%']]);
  const senza = righeFinestra({ prompt_tokens: 1000, completion_tokens: 200 }, null, null);
  assert.equal(senza.titoloDestra, 'finestra non dichiarata');
  assert.deepEqual(senza.righe.map((r) => r.slice(0, 2)), [['Conversazione', '1,2k'], ['Libera', '—']]);
  assert.deepEqual(righeFinestra(null, null, null).righe.map((r) => r.slice(0, 2)), [['Conversazione', '—'], ['Libera', '—']]);
  assert.equal(kilo(145_400), '145,4k');
  assert.equal(kilo(400), '0,4k');
});

test('INSP-GIRI e FILE', () => {
  const g = righeGiri(INSPECTOR.giri);
  assert.deepEqual(g[0].slice(0, 2), ['1 · La richiesta', '0,4k']);
  assert.deepEqual(g[4], ['7 · Suite completa', 'in corso', 'accent']);
  assert.deepEqual(righeGiri([{ numero: 2, titolo: 'Lettura', attrezzi: 3 }])[0].slice(0, 2), ['2 · Lettura', '3 attrezzi']);
  assert.deepEqual(righeFile(INSPECTOR.file), [['src/session-registry.mjs', '+18 −2'], ['tests/session-registry.test.mjs', '+64'], ['src/http-app.mjs', '+30']]);
});

test('INSP-PROCESSI: dagli eventi degli attrezzi al comando con durata e uscita; il comando viene dagli argomenti JSON', () => {
  const eventi = [
    { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'shell', ricevutoA: 1000, giro: 5 },
    { type: 'ToolCallArgs', toolCallId: 'a', delta: '{"command":"npm run ' },
    { type: 'ToolCallArgs', toolCallId: 'a', delta: 'verify:all"}' },
    { type: 'ToolCallResult', toolCallId: 'a', ricevutoA: 19_100 },
    { type: 'ToolCallStart', toolCallId: 'b', toolCallName: 'leggi', ricevutoA: 20_000, giro: 5 },
    { type: 'ToolCallStart', toolCallId: 'c', toolCallName: 'shell', ricevutoA: 30_000, giro: 7 },
    { type: 'ToolCallArgs', toolCallId: 'c', delta: '{"command":"node --test tests/*.test.mjs"}' },
  ];
  const p = processiDagliEventi(eventi, { adesso: 71_000 });
  assert.equal(p.length, 2, 'solo i comandi, non «leggi»');
  assert.equal(p[0].comando, 'node --test tests/*.test.mjs');
  assert.equal(p[0].stato, 'in-corso');
  assert.equal(p[0].fermoDaMs, 41_000);
  assert.equal(p[1].comando, 'npm run verify:all');
  assert.equal(p[1].durataMs, 18_100);
  assert.equal(p[1].uscita, 0);
  const d = datiProcesso(p[1]);
  assert.equal(d.misura, '18,1 s · uscita 0');
  assert.equal(d.chi, 'agente · giro 5');
  assert.equal(datiProcesso({ comando: 'x', stato: 'in-corso', fermoDaMs: 74_000 }).fermo, 'Nessuna uscita da 74 secondi. Il processo è vivo: potrebbe aspettare un input. TALOS non lo ferma da solo.');
  assert.equal(comandoDagliArgomenti('{"cmd":"ls"}'), 'ls');
  assert.equal(comandoDagliArgomenti('non json'), 'non json');
});
