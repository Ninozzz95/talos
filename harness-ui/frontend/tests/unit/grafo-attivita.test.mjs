/*
 * Owner 13/10/2026 — le tre cose della vista classica portate nel diagramma delle deleghe: «che cosa fa adesso», i conti,
 * l'attività recente di tutti. Qui i FATTI (`grafo/attivita.js`), dai dati della delega nella forma vera di `GET …/children`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { attivitaDellAgente, attivitaRecente, contiDellAgente, passiDellAgente, PASSI_RECENTI, testoAttivita, testoDelPasso, totaliDelleRighe } from '../../src/components/grafo/attivita.js';

const T0 = Date.parse('2026-10-13T12:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const passo = (s, attrezzo = 'leggi', percorso = 'src/a.js') => ({ tipo: 'attrezzo', attrezzo, percorso, quando: at(s) });
const parole = { tr: (chiave, p = {}) => `${chiave}${Object.keys(p).length ? JSON.stringify(p) : ''}`, nomeAttrezzo: (id) => `nome di ${id}`, verbo: (id) => [`Fatto-${id}`, `Fa-${id}`],
  iconaAttrezzo: (id) => `i-${id}`, ora: (iso) => iso.slice(11, 16) };

test('ATTIVITA-GRAFO-01 — chi lavora dice che cosa fa: ragiona, risponde, usa un attrezzo (col bersaglio della chiamata IN VOLO), o sta fra due operazioni', () => {
  assert.deepEqual(attivitaDellAgente({ operazioneCorrente: { status: 'running', kind: 'reasoning' } }, 'running'), { kind: 'reasoning' });
  assert.deepEqual(attivitaDellAgente({ operazioneCorrente: { status: 'running', kind: 'response' } }, 'running'), { kind: 'responding' });
  const conAttrezzo = { attivita: { attrezzoCorrente: 'scrivi', bersaglioCorrente: 'test/nuovo.test.js', passi: [passo(10, 'leggi', 'src/vecchio.js')] } };
  assert.deepEqual(attivitaDellAgente(conAttrezzo, 'running'), { kind: 'tool', tool: 'scrivi', target: 'test/nuovo.test.js' });
  // AL CONTRARIO: senza il bersaglio dichiarato NON si prende quello dell'ultimo passo finito (sarebbe un altro file)
  assert.deepEqual(attivitaDellAgente({ attivita: { attrezzoCorrente: 'scrivi', passi: [passo(10, 'scrivi', 'src/vecchio.js')] } }, 'running'), { kind: 'tool', tool: 'scrivi', target: null });
  assert.deepEqual(attivitaDellAgente({ attivita: { attrezzoCorrente: null, passi: [passo(10)] } }, 'running'), { kind: 'between' });
  // un'operazione dichiarata ma non in corso non conta
  assert.deepEqual(attivitaDellAgente({ operazioneCorrente: { status: 'done', kind: 'reasoning' }, attivita: {} }, 'running'), { kind: 'between' });
});

test('ATTIVITA-GRAFO-02 — chi è fermo dice QUANDO ha fatto l’ultima cosa; senza un’ora non se ne inventa una', () => {
  const fermo = { attivita: { attrezzoCorrente: 'leggi', passi: [passo(10), { tipo: 'fine', quando: at(42) }] } };
  for (const stato of ['succeeded', 'failed', 'cancelled', 'waiting']) assert.deepEqual(attivitaDellAgente(fermo, stato), { kind: 'last', at: at(42) }, stato);
  // l'ultimo passo CON un'ora, anche se dopo ce n'è uno senza
  assert.deepEqual(attivitaDellAgente({ attivita: { passi: [passo(10), { tipo: 'attrezzo', attrezzo: 'leggi', quando: null }] } }, 'succeeded'), { kind: 'last', at: at(10) });
  assert.deepEqual(attivitaDellAgente({ attivita: { passi: [{ tipo: 'fine', quando: null }] } }, 'succeeded'), { kind: 'none' });
  assert.deepEqual(attivitaDellAgente({}, 'succeeded'), { kind: 'none' });
  assert.deepEqual(attivitaDellAgente(null, 'succeeded'), { kind: 'none' });
});

test('ATTIVITA-GRAFO-03 — i conti: ciò che il server dichiara; ciò che manca resta null, mai zero', () => {
  assert.deepEqual(contiDellAgente({ attivita: { chiamate: 9, file: [{}, {}], fileTagliati: 0 }, usageSessione: { prompt_tokens: 38000, completion_tokens: 2100 } }), { calls: 9, files: 2, filesPartial: false, tokens: 40100 });
  // file tagliati dal server: il conto è parziale; i soli contatori (`numeroFile`) valgono come l'elenco
  assert.deepEqual(contiDellAgente({ attivita: { chiamate: 0, numeroFile: 7, fileTagliati: 3 } }), { calls: 0, files: 7, filesPartial: true, tokens: null });
  // i token si dicono solo con tutti e due gli addendi
  assert.equal(contiDellAgente({ usageSessione: { prompt_tokens: 10 } }).tokens, null);
  assert.deepEqual(contiDellAgente({}), { calls: null, files: null, filesPartial: false, tokens: null });
  assert.deepEqual(contiDellAgente({ attivita: { chiamate: -1, numeroFile: 1.5 } }), { calls: null, files: null, filesPartial: false, tokens: null });
});

test('ATTIVITA-GRAFO-04 — i totali sommano ciò che si sa e dicono quanti agenti lo dichiarano', () => {
  const elenco = (...percorsi) => percorsi.map((path) => ({ path, read: true, written: false, created: false }));
  const righe = [{ calls: 9, fileCount: 2, files: elenco('src/a.js', 'src/b.js'), filesPartial: false, tokens: 40100 }, { calls: 4, fileCount: 3, files: elenco('src/c.js', 'src/d.js', 'src/e.js'), filesPartial: true, tokens: null }, { calls: null, fileCount: null, files: null, tokens: null }];
  assert.deepEqual(totaliDelleRighe(righe), { agents: 3, calls: 13, callsKnown: 2, files: 5, filesKnown: 2, filesPartial: true, tokens: 40100, tokensKnown: 1 });
  // ⛔ i file sono quelli DISTINTI: due agenti sullo stesso file fanno un file toccato, non due (era RIPRESA-GRAFO-TELEMETRIA della classica)
  const stessi = totaliDelleRighe([{ fileCount: 1, files: elenco('src/a.js') }, { fileCount: 2, files: elenco('src/a.js', 'src/b.js') }]);
  assert.equal(stessi.files, 2); assert.equal(stessi.filesKnown, 2); assert.equal(stessi.filesPartial, false);
  // chi dichiara solo QUANTI file (senza l'elenco) non si confronta: il totale è un minimo, e parziale
  const compatto = totaliDelleRighe([{ fileCount: 1, files: elenco('src/a.js') }, { fileCount: 70, files: null }]);
  assert.equal(compatto.files, 70); assert.equal(compatto.filesPartial, true);
  assert.deepEqual(totaliDelleRighe([]), { agents: 0, calls: null, callsKnown: 0, files: null, filesKnown: 0, filesPartial: false, tokens: null, tokensKnown: 0 });
  // zero dichiarato è un numero, non un «non si sa»
  assert.equal(totaliDelleRighe([{ calls: 0, fileCount: 0, files: [], tokens: 0 }]).calls, 0);
  assert.equal(totaliDelleRighe([{ calls: 0, fileCount: 0, files: [], tokens: 0 }]).files, 0);
});

test('ATTIVITA-GRAFO-05 — i passi di un agente: solo quelli con l’ora, gli ultimi otto, con le parole dei fatti', () => {
  const tanti = Array.from({ length: 12 }, (_, i) => passo(i * 10, 'leggi', `src/f${i}.js`));
  const p = passiDellAgente({ attivita: { passi: [{ tipo: 'avvio', quando: at(-5) }, ...tanti, { tipo: 'attrezzo', attrezzo: 'leggi', percorso: 'x', quando: null }, { tipo: 'errore', quando: at(200) }, { tipo: 'sconosciuto', quando: at(300) }] } });
  assert.equal(p.length, PASSI_RECENTI);
  assert.deepEqual(p.at(-1), { at: at(200), kind: 'failed', tool: null, target: null });
  assert.deepEqual(p.at(-2), { at: at(110), kind: 'tool', tool: 'leggi', target: 'src/f11.js' });
  assert.deepEqual(passiDellAgente({ attivita: { passi: [{ tipo: 'avvio', quando: at(1) }, { tipo: 'fine', quando: at(2) }] } }).map((x) => x.kind), ['started', 'finished']);
  // un passo d'attrezzo senza nome non si mostra (non c'è niente da dire)
  assert.deepEqual(passiDellAgente({ attivita: { passi: [{ tipo: 'attrezzo', attrezzo: '', quando: at(1) }] } }), []);
  assert.deepEqual(passiDellAgente({}), []);
});

test('ATTIVITA-GRAFO-06 — l’attività recente di tutti: dal più nuovo, otto in tutto, e in riproduzione solo fino a quell’istante', () => {
  const righe = [
    { nodeId: 'n-a', sessionId: 'a', label: 'Agente A', steps: [{ at: at(10), kind: 'tool', tool: 'leggi', target: 'a.js' }, { at: at(50), kind: 'finished', tool: null, target: null }] },
    { nodeId: 'n-b', sessionId: 'b', label: 'Agente B', steps: [{ at: at(30), kind: 'tool', tool: 'scrivi', target: 'b.js' }, { at: at(50), kind: 'failed', tool: null, target: null }] },
    { nodeId: 'n-c', sessionId: 'c', label: 'Agente C' },
  ];
  const tutti = attivitaRecente(righe);
  assert.deepEqual(tutti.map((v) => `${v.label}:${v.kind}`), ['Agente A:finished', 'Agente B:failed', 'Agente B:tool', 'Agente A:tool']);
  assert.deepEqual(tutti[2], { at: at(30), kind: 'tool', tool: 'scrivi', target: 'b.js', nodeId: 'n-b', sessionId: 'b', label: 'Agente B' });
  assert.deepEqual(attivitaRecente(righe, 2).map((v) => v.label), ['Agente A', 'Agente B']);
  // in riproduzione, a metà storia: solo ciò che era già successo
  assert.deepEqual(attivitaRecente(righe, PASSI_RECENTI, T0 + 30_000).map((v) => `${v.label}:${v.kind}`), ['Agente B:tool', 'Agente A:tool']);
  assert.deepEqual(attivitaRecente(righe, PASSI_RECENTI, T0 + 5_000), []);
  assert.deepEqual(attivitaRecente([]), []);
});

test('ATTIVITA-GRAFO-07 — le parole: il verbo al presente col NOME del file sulla scheda, il nome dell’attrezzo (con la maiuscola) quando un file non c’è, e chi lavora si legge «vivo»', () => {
  assert.deepEqual(testoAttivita({ kind: 'tool', tool: 'scrivi', target: 'test/unit/prezzi.test.js' }, parole), { testo: 'Fa-scrivi prezzi.test.js', vivo: true });
  assert.deepEqual(testoAttivita({ kind: 'tool', tool: 'esegui', target: null }, parole), { testo: 'Nome di esegui', vivo: true });
  assert.deepEqual(testoAttivita({ kind: 'reasoning' }, parole), { testo: 'agenti.delegations.opReasoning', vivo: true });
  assert.deepEqual(testoAttivita({ kind: 'between' }, parole), { testo: 'agenti.delegations.betweenOperations', vivo: true });
  assert.deepEqual(testoAttivita({ kind: 'waitingAgents', count: 1 }, parole), { testo: 'agenti.workflow.activityWaitingOne{"n":1}', vivo: true });
  assert.deepEqual(testoAttivita({ kind: 'waitingAgents', count: 3 }, parole), { testo: 'agenti.workflow.activityWaitingMany{"n":3}', vivo: true });
  assert.deepEqual(testoAttivita({ kind: 'last', at: at(42) }, parole), { testo: 'agenti.delegations.lastActivityAt{"ora":"12:00"}', vivo: false });
  assert.deepEqual(testoAttivita({ kind: 'none' }, parole), { testo: 'agenti.delegations.noActivityRecorded', vivo: false });
  assert.equal(testoAttivita(null, parole), null);
  // un passo già fatto: il verbo al passato e il percorso intero; senza percorso, il nome dell'attrezzo
  assert.deepEqual(testoDelPasso({ kind: 'tool', tool: 'leggi', target: 'src/a.js' }, parole), { icona: 'i-leggi', che: 'Fatto-leggi', dove: 'src/a.js' });
  assert.deepEqual(testoDelPasso({ kind: 'tool', tool: 'shell', target: null }, parole), { icona: 'i-shell', che: 'Nome di shell', dove: null });
  assert.deepEqual(testoDelPasso({ kind: 'failed' }, parole), { icona: 'i-alert', che: 'agenti.delegations.eventError', dove: null });
  assert.deepEqual(testoDelPasso({ kind: 'started' }, parole).che, 'agenti.delegations.eventStarted');
  assert.deepEqual(testoDelPasso({ kind: 'finished' }, parole).che, 'agenti.delegations.eventFinished');
});

test('ATTIVITA-GRAFO-06b — l’elenco «tenendo solo i migliori» dà ESATTAMENTE ciò che dava l’ordinamento intero, anche a parità d’ora (300 scene a caso, con e senza istante)', () => {
  // il riferimento: l'implementazione di prima (tutto in un elenco, ordinato rileggendo l'ora)
  const diPrima = (righe, quante, finoA) => {
    const voci = [];
    righe.forEach((r, i) => { (r.steps ?? []).forEach((p, j) => { if (finoA === null || Date.parse(p.at) <= finoA) voci.push({ ...p, nodeId: r.nodeId, sessionId: r.sessionId, label: r.label, _o: [i, j] }); }); });
    voci.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a._o[0] - b._o[0] || b._o[1] - a._o[1]);
    return voci.slice(0, quante).map(({ _o, ...v }) => v);
  };
  let seme = 20261013; const caso = (n) => { seme = (seme * 1664525 + 1013904223) % 4294967296; return Math.floor((seme / 4294967296) * n); };
  for (let scena = 0; scena < 300; scena += 1) {
    const righe = Array.from({ length: caso(7) }, (_, i) => ({ nodeId: `n-${i}`, sessionId: `s-${i}`, label: `Agente ${i}`,
      // poche ore possibili: molte parità, dentro la riga e fra righe
      ...(caso(5) === 0 ? {} : { steps: Array.from({ length: caso(9) }, () => ({ at: at(caso(6) * 10), kind: ['tool', 'started', 'finished', 'failed'][caso(4)], tool: caso(2) ? 'leggi' : null, target: null })) }) }));
    const quante = 1 + caso(9); const finoA = caso(3) === 0 ? null : T0 + caso(7) * 10_000 - 5_000;
    assert.deepEqual(attivitaRecente(righe, quante, finoA), diPrima(righe, quante, finoA), `scena ${scena}`);
  }
});
