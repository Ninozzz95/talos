import test from 'node:test';
import assert from 'node:assert/strict';
import { kilo, righeAmbiente, righeFinestra, righeGiri, righeFile, datiProcesso, processiDagliEventi, comandoDagliArgomenti, titoloRispostaDaTurno, SELETTORE_RISPOSTA_TURNO } from '../../src/components/inspector.js';
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


/*
 * ⛔⛔⛔ CB-03 (06/9) — «Indice dei giri» stampava il RAGIONAMENTO del modello, in
 * inglese, col ragionamento SPENTO. Misurato su una sessione vera con
 * `z-ai/glm-5.3-flash` (sonda `.gravi/sonde/03-indice-giri.mjs`): l'indice diceva
 * «3 · The user asks in Italian:» / «6 · Simple: 31 × 12 =» dove le risposte erano
 * «17 × 23 = 391» e «31 × 12 = 372».
 * Le prove sotto usano un turno FINTO che risponde come il DOM vero: `.assistant-copy`
 * da sola trova il ragionamento (è il primo blocco del turno e porta la stessa
 * classe-gancio), il corpo del messaggio di TALOS trova la risposta.
 */
function turnoFinto({ ragionamento = '', risposta = '' } = {}) {
  return {
    querySelector(selettore) {
      if (selettore === SELETTORE_RISPOSTA_TURNO) return risposta ? { textContent: risposta } : null;
      // com'era prima: la classe-gancio, che il ragionamento porta per primo
      if (selettore.includes('.assistant-copy')) return ragionamento ? { textContent: ragionamento } : null;
      return null;
    },
  };
}

test('CB-03: il titolo del giro è la RISPOSTA, mai il ragionamento (che col suo interruttore spento non è nemmeno a schermo)', () => {
  const turno = turnoFinto({ ragionamento: 'The user asks in Italian: answer in one line', risposta: '17 × 23 = 391' });
  assert.equal(titoloRispostaDaTurno(turno), '17 × 23 = 391');
  assert.ok(!titoloRispostaDaTurno(turno).includes('The user'), '⛔ questa era la stringa che si leggeva a schermo');
  assert.equal(SELETTORE_RISPOSTA_TURNO, '.talos-message__copy .assistant-copy', 'il selettore nomina il corpo del messaggio, non una classe-gancio condivisa');
});

test('⛔ AL CONTRARIO — un turno con SOLO ragionamento non presta il suo testo: nessun titolo, e chi chiama ripiega su «Risposta»', () => {
  assert.equal(titoloRispostaDaTurno(turnoFinto({ ragionamento: 'The user explicitly says: don’t' })), '');
  assert.equal(titoloRispostaDaTurno(null), '');
  assert.equal(titoloRispostaDaTurno({}), '');
  assert.equal(titoloRispostaDaTurno(turnoFinto({ risposta: '   ' })), '', 'uno spazio non è una risposta');
});

test('CB-03: il titolo si ferma a cinque parole e non spezza il testo a metà carattere', () => {
  assert.equal(titoloRispostaDaTurno(turnoFinto({ risposta: 'uno due tre quattro cinque sei sette' })), 'uno due tre quattro cinque');
  assert.equal(titoloRispostaDaTurno(turnoFinto({ risposta: 'a\n\n  b\tc' })), 'a b c', 'gli a capo del markdown non diventano parole vuote');
});
