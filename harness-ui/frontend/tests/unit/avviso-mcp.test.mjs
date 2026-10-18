/*
 * Owner 17/10/2026 («Avviso in chat + stato in Estensioni»): un server MCP che non parte si dice in chat UNA volta finché l'esito non
 * cambia, e la scheda Estensioni mostra l'ultimo esito accanto al server, col motivo nella lingua dell'interfaccia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaRicordoAvvisiMcp, nuoviServerNonPartiti, testoNotaMcp, motivoMcp } from '../../src/components/avviso-mcp.js';
import { t } from '../../src/components/lingua.js';
import { datiEstensione } from '../../src/components/estensioni.js';

const giu = (serverId, motivo = 'boom', extra = {}) => ({ serverId, hash: 'h', esito: 'non-partito', motivo, ...extra });
const su = (serverId) => ({ serverId, hash: 'h', esito: 'collegato' });

test('MCP-AVVISO-01 — a failure is said once per session, again only when it changes or after the server came back', () => {
  const ricordo = creaRicordoAvvisiMcp();
  const ids = (esiti) => esiti.map((e) => e.serverId);
  assert.deepEqual(ids(nuoviServerNonPartiti(ricordo, 's1', { esiti: [giu('git'), su('fs')] })), ['git']);
  assert.deepEqual(ids(nuoviServerNonPartiti(ricordo, 's1', { esiti: [giu('git'), su('fs')] })), [], 'same failure, next turn: silent');
  assert.deepEqual(ids(nuoviServerNonPartiti(ricordo, 's1', { esiti: [giu('git', 'altro motivo')] })), ['git'], 'a different reason is news');
  assert.deepEqual(ids(nuoviServerNonPartiti(ricordo, 's1', { esiti: [su('git')] })), []);
  assert.deepEqual(ids(nuoviServerNonPartiti(ricordo, 's1', { esiti: [giu('git', 'altro motivo')] })), ['git'], 'back up, then down again: said again');
  assert.deepEqual(ids(nuoviServerNonPartiti(ricordo, 's2', { esiti: [giu('git', 'altro motivo')] })), ['git'], 'another session has its own memory');
});

test('MCP-AVVISO-02 — AL CONTRARIO: a malformed value, a missing session or all-started servers say nothing', () => {
  const ricordo = creaRicordoAvvisiMcp();
  assert.deepEqual(nuoviServerNonPartiti(ricordo, 's1', null), []);
  assert.deepEqual(nuoviServerNonPartiti(ricordo, null, { esiti: [giu('git')] }), []);
  assert.deepEqual(nuoviServerNonPartiti(ricordo, 's1', { esiti: [su('a'), su('b'), { serverId: '', esito: 'non-partito' }, { esito: 'non-partito' }] }), []);
});

test('MCP-AVVISO-03 — Extensions: the last outcome fills the Connection row; a server that did not start shows a warning badge', () => {
  const base = { id: 'git', comando: 'uvx', argomenti: [], allowlist: [], fidato: true };
  const nonPartito = datiEstensione('mcp', { ...base, connessione: { esito: 'non-partito', motivo: 'FRASE-GREZZA',
    motivoChiave: 'server.program.notOnPath', motivoParams: { command: 'uvx', example: '.\\uvx' } } });
  const riga = nonPartito.righe.at(-1)[1];
  /* il motivo passa dal dizionario coi suoi valori, mai la frase grezza del server */
  assert.match(riga, /uvx.*PATH.*\.\\uvx/su);
  assert.equal(riga.includes('FRASE-GREZZA'), false);
  assert.equal(nonPartito.attenzione, true);
  const partito = datiEstensione('mcp', { ...base, connessione: { esito: 'collegato' } });
  const mai = datiEstensione('mcp', { ...base, connessione: null });
  assert.notEqual(partito.righe.at(-1)[1], mai.righe.at(-1)[1]);
  /* AL CONTRARIO: started or never started keep the trust badge, no warning */
  assert.equal(partito.attenzione, undefined);
  assert.equal(mai.attenzione, undefined);
  assert.equal(partito.stato, datiEstensione('mcp', base).stato);
});

test('MCP-AVVISO-04 — the note names the place with its REAL names (sidebar + tab), never a name that drifts', () => {
  const { titolo, testo } = testoNotaMcp(giu('docs', 'RAW', { motivoChiave: 'server.program.notOnPath', motivoParams: { command: 'x', example: './x' } }));
  assert.match(titolo, /docs/u);
  assert.ok(testo.includes(`${t('modello.sidebar.capability')} › ${t('modello.capability.connectors')}`), testo);
  assert.equal(testo.includes('RAW'), false, 'the reason goes through the dictionary');
});

/* Revisione D (bugfixer, 17/10/2026) */
test('MCP-AVVISO-05 — a detail that changes every turn (a time, a pid) does not make the same failure news again', () => {
  const ricordo = creaRicordoAvvisiMcp();
  const elenco = (dettaglio) => giu('git', `listing the tools failed: ${dettaglio}`, { motivoChiave: 'server.mcp.toolListFailed', motivoParams: { detail: dettaglio } });
  let detti = 0;
  for (const ms of [30001, 30002, 30007, 29998, 30011]) detti += nuoviServerNonPartiti(ricordo, 's', { esiti: [elenco(`timeout after ${ms} ms`)] }).length;
  assert.equal(detti, 1, 'five turns, one note');
  /* senza chiave: i numeri non contano */
  for (const ms of [101, 202]) detti += nuoviServerNonPartiti(ricordo, 's', { esiti: [giu('fs', `exited with code ${ms}`)] }).length;
  assert.equal(detti, 2);
  /* AL CONTRARIO: un motivo davvero diverso (un'altra chiave, o un altro comando) è una notizia */
  assert.equal(nuoviServerNonPartiti(ricordo, 's', { esiti: [giu('git', 'x', { motivoChiave: 'server.program.notOnPath', motivoParams: { command: 'git' } })] }).length, 1);
  assert.equal(nuoviServerNonPartiti(ricordo, 's', { esiti: [giu('git', 'x', { motivoChiave: 'server.program.notOnPath', motivoParams: { command: 'uvx' } })] }).length, 1);
});

test('MCP-AVVISO-06 — the reason shown loses bidi and control characters, stays on one line and ends with a full stop', () => {
  const m = motivoMcp(giu('git', 'run rm\u202Eexe.txt\nnow'));
  assert.equal(/[\u202A-\u202E\u2066-\u2069\u0000-\u001F]/u.test(m), false, JSON.stringify(m));
  assert.ok(m.endsWith('.'), m);
  assert.equal(motivoMcp(giu('git', 'gi\u00e0 chiuso.')), 'gi\u00e0 chiuso.', 'no double full stop');
  const { testo } = testoNotaMcp(giu('git', 'timeout after 3 ms'));
  assert.match(testo, /ms\. \S/u, 'a full stop between the reason and the next sentence');
  /* riverifica D: anche il NOME del server nel titolo perde i caratteri che ingannano */
  assert.equal(/[‪-‮]/u.test(testoNotaMcp({ ...giu('x'), serverId: 'gi‮t' }).titolo), false);
});
