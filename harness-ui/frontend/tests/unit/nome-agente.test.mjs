/*
 * L3-17 (owner 16/10/2026, «un nome solo ovunque») — il nome di un agente è UNO: quello della barra (il `nome` della delega dal
 * server, col «-N» fra sorelle), o per le deleghe di prima il compito; su una riga e al più 160. La scheda, l'etichetta per il
 * lettore di schermo e il diagramma lo leggono dalla stessa funzione. Ogni controllo anche AL CONTRARIO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nomeDellAgente, NOME_MASSIMO, runDalleDeleghe } from '../../src/components/grafo/run-dalle-deleghe.js';
import { modelloGrafoAgenti } from '../../src/components/grafo-agenti.js';

const lungo = `Scrivi il rapporto\n${'parola '.repeat(1100)}`; // ~7.700 caratteri, come le consegne misurate sul 4174

test('NOME-AGENTE-CLIENT-01 — il nome della delega vince; senza, il compito; mai la consegna intera su più righe', () => {
  assert.equal(nomeDellAgente({ nome: 'Controlla i test-2', taskCorto: 'Controlla i test', task: 'Sei…\nCompito: Controlla i test' }), 'Controlla i test-2');
  assert.equal(nomeDellAgente({ nome: null, taskCorto: 'Leggi il registro' }), 'Leggi il registro', 'una delega di prima');
  const daLunga = nomeDellAgente({ taskCorto: lungo });
  assert.ok(daLunga.length <= NOME_MASSIMO, `${daLunga.length}`);
  assert.ok(!daLunga.includes('\n') && daLunga.endsWith('…'), 'su una riga, e dice che è tagliato');
  assert.equal(nomeDellAgente({}), '', 'AL CONTRARIO: niente nome, niente invenzioni');
  assert.equal(nomeDellAgente(null), '');
});

test('NOME-AGENTE-CLIENT-02 — il diagramma usa lo stesso nome; la ricerca trova ancora le parole oltre il taglio', () => {
  const corrente = { sessionId: 'madre', nome: 'La madre' };
  const figli = [{ sessionId: 'f1', padreId: 'madre', nome: 'Controlla i test-2', taskCorto: 'Controlla i test' },
    { sessionId: 'f2', padreId: 'madre', taskCorto: `${'x '.repeat(100)}parolaInFondo` }];
  const modello = modelloGrafoAgenti({ corrente, sessioni: [corrente], figli });
  const nodi = new Map((modello.nodi ?? modello.nodes ?? []).map((n) => [n.id, n]));
  assert.equal(nodi.get('f1')?.nome, 'Controlla i test-2');
  const cercato = modelloGrafoAgenti({ corrente, sessioni: [corrente], figli }, { query: 'parolainfondo' });
  assert.ok((cercato.nodi ?? cercato.nodes ?? []).some((n) => n.id === 'f2'), 'la parola oltre i 160 caratteri del nome si trova ancora');
});

test('NOME-AGENTE-CLIENT-03 — ogni superficie dichiarata legge il nome dalla funzione sola (mutanti K2-K5 della revisione)', async () => {
  const { readFileSync } = await import('node:fs');
  const leggi = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
  const app = leggi('legacy/app.js');
  assert.equal((app.match(/chi: nomeDellAgente\(agente \?\? agentiInDiretta\.get\(childId\)\) \|\| null/gu) ?? []).length, 2, 'le due carte del permesso della figlia');
  assert.match(app, /nome: nomeDellAgente\(figlia\) \|\| tr\('app\.delegations\.noTaskRecorded'\)/u, 'la conversazione della figlia');
  assert.match(app, /passaASessione\(figlia\.sessionId, figlia\.sessionId, nomeDellAgente\(figlia\) \|\| figlia\.sessionId/u, 'il titolo della sessione aperta');
  assert.equal((app.match(/tronca\(nomeDellAgente\(figlio\) \|\| tr\('app\.delegations\.taskUnrecorded'\)/gu) ?? []).length, 2, 'il foglio e il velo «Albero»');
  assert.match(leggi('components/dettaglio-agente.js'), /nome\.textContent = nomeDellAgente\(dati\)/u, 'la testata del dettaglio');
  const inspector = leggi('components/inspector.js');
  assert.match(inspector, /const nome = nomeDellAgente\(a\) \|\| tr\('processi\.agents\.noTaskShort'\)/u, 'la riga del pannello');
  assert.match(inspector, /tronca\(nomeDellAgente\(a\) \|\| tr\('agenti\.agent\.noTaskRecorded'\), 52\)/u, 'la scheda');
});

test('NOME-AGENTE-CLIENT-04 — un nome fatto solo di invisibili a larghezza zero ripiega sul compito (revisione 16/10)', () => {
  for (const invisibile of ['\u200B', '\u200C\u200D', '\u2060', ' \u200B \uFEFF ']) {
    assert.equal(nomeDellAgente({ nome: invisibile, taskCorto: 'Leggi il registro' }), 'Leggi il registro', JSON.stringify(invisibile));
  }
  assert.equal(nomeDellAgente({ nome: '\u200Bciao' }), '\u200Bciao', 'AL CONTRARIO: un nome con un segno visibile resta com\'è');
});

test('NOME-AGENTE-CLIENT-05 — la frase del ramo isolato e il suggerimento della testata leggono il nome dell\'agente (mutanti N2, N7)', async () => {
  const corrente = { sessionId: 'madre', nome: 'La madre' };
  const figli = [{ sessionId: 'f1', padreId: 'madre', nome: 'Controlla i test-2', taskCorto: 'Controlla i test' }];
  const r = runDalleDeleghe({ corrente, sessioni: [corrente], figli }, { isolato: 'f1' });
  assert.equal(r.panoramica.filtro.isolatoNome, 'Controlla i test-2', 'nella frase, il nome numerato e non il compito');
  const { readFileSync } = await import('node:fs');
  const dettaglio = readFileSync(new URL('../../src/components/dettaglio-agente.js', import.meta.url), 'utf8');
  assert.match(dettaglio, /nome\.title = senzaInganniSuPiuRighe\(dati\.task \|\| dati\.taskCorto \|\| ''\)/u,
    'il suggerimento porta il compito anche quando `task` è omesso perché uguale a `taskCorto`');
});
