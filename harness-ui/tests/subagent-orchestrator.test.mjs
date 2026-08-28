import assert from 'node:assert/strict';
import test from 'node:test';

import {
  creaSubagentOrchestrator,
  esitoDelegaDaRisultato,
  LIMITE_FIGLI_CONCORRENTI,
  LIMITE_PROFONDITA_DELEGA,
} from '../src/subagent-orchestrator.mjs';

/*
 * ⭐⭐⭐ FASE C (28/8) — sub-agenti, piano elegant-spinning-dongarra.md.
 * `sessioni` è una Map finta, stesso schema minimo della vera (usata
 * da session-registry.mjs) — questo modulo opera SOLO su ciò che gli
 * viene iniettato, mai un secondo registro nascosto.
 */
function vocePadre({ cartella = '/padre', profonditaDelega = 0 } = {}) {
  return { cartella, profonditaDelega, conclusa: false, padreId: null };
}

test('contaFigliAttivi: 0 senza figli, ignora sessioni con padreId diverso o assente', () => {
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    ['estranea', { cartella: '/altro', padreId: null, conclusa: false }],
    ['figlio-di-altro-padre', { cartella: '/x', padreId: 'padre-2', conclusa: false }],
  ]);
  const orch = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: () => ({ sessionId: 'mai' }) });
  assert.equal(orch.contaFigliAttivi('padre-1'), 0);
});

test('contaFigliAttivi: conta SOLO i figli non conclusi dello stesso padre', () => {
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    ['figlio-attivo-1', { cartella: '/f1', padreId: 'padre-1', conclusa: false }],
    ['figlio-attivo-2', { cartella: '/f2', padreId: 'padre-1', conclusa: false }],
    ['figlio-concluso', { cartella: '/f3', padreId: 'padre-1', conclusa: true }],
  ]);
  const orch = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: () => ({ sessionId: 'mai' }) });
  assert.equal(orch.contaFigliAttivi('padre-1'), 2, 'un figlio concluso non conta più come attivo');
});

test('elencaFigli: elenco vero, ordinato per avvio, include task/conclusa/esitoDelega', () => {
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    ['figlio-b', { cartella: '/b', padreId: 'padre-1', conclusa: true, task: { consegna: 'compito B' }, avviataAlle: '2026-08-28T10:00:00.000Z', esitoDelega: 'concluso' }],
    ['figlio-a', { cartella: '/a', padreId: 'padre-1', conclusa: false, task: { consegna: 'compito A' }, avviataAlle: '2026-08-28T09:00:00.000Z', esitoDelega: null }],
    ['estraneo', { cartella: '/e', padreId: 'padre-2', conclusa: false, task: { consegna: 'non mio' }, avviataAlle: '2026-08-28T08:00:00.000Z' }],
  ]);
  const orch = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: () => ({ sessionId: 'mai' }) });
  const figli = orch.elencaFigli('padre-1');
  assert.deepEqual(figli.map((f) => f.sessionId), ['figlio-a', 'figlio-b'], 'ordinati per avviataAlle, il più vecchio prima');
  assert.equal(figli[0].task, 'compito A');
  assert.equal(figli[0].conclusa, false);
  assert.equal(figli[1].esitoDelega, 'concluso');
});

test('⛔⛔⛔ delegaSottoTask: sessione padre inesistente — rifiutato, avviaESeguiFn MAI chiamata', async () => {
  const sessioni = new Map();
  let chiamata = false;
  const orch = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'fantasma', task: 'x', cartella: '/y' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /non esiste più/);
  assert.equal(chiamata, false);
});

test('⛔⛔⛔ delegaSottoTask: cartella UGUALE al padre — rifiutato, avviaESeguiFn MAI chiamata', async () => {
  const sessioni = new Map([['padre-1', vocePadre({ cartella: '/stessa' })]]);
  let chiamata = false;
  const orch = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/stessa' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /diversa da quella del padre/);
  assert.equal(chiamata, false);
});

test(`⛔⛔⛔ delegaSottoTask: profondità oltre il limite (${LIMITE_PROFONDITA_DELEGA}) — rifiutato col numero VERO nel motivo`, async () => {
  const sessioni = new Map([['padre-1', vocePadre({ profonditaDelega: LIMITE_PROFONDITA_DELEGA })]]);
  let chiamata = false;
  const orch = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/diversa' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, new RegExp(`limite ${LIMITE_PROFONDITA_DELEGA}`));
  assert.equal(chiamata, false);
});

test(`⭐⭐ AL CONTRARIO — delegaSottoTask: profondità ESATTAMENTE al limite (${LIMITE_PROFONDITA_DELEGA - 1} → ${LIMITE_PROFONDITA_DELEGA}) è AMMESSA`, async () => {
  const sessioni = new Map([['padre-1', vocePadre({ profonditaDelega: LIMITE_PROFONDITA_DELEGA - 1 })]]);
  let profonditaRicevuta;
  const orch = creaSubagentOrchestrator({
    sessioni,
    avviaESeguiFn: (opzioni) => { profonditaRicevuta = opzioni.profonditaDelega; return { sessionId: 'figlio-vero' }; },
  });
  orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/diversa' }); // non attesa: la Promise resta pending finché onConclusioneFn non scatta, non serve qui
  assert.equal(profonditaRicevuta, LIMITE_PROFONDITA_DELEGA, 'esattamente al tetto, non oltre — un errore di uno-di-troppo qui bloccherebbe metà della profondità concessa');
});

test(`⛔⛔⛔ delegaSottoTask: ${LIMITE_FIGLI_CONCORRENTI}° figlio già attivo — l'undicesimo è rifiutato, avviaESeguiFn MAI chiamata`, async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  for (let i = 0; i < LIMITE_FIGLI_CONCORRENTI; i += 1) {
    sessioni.set(`figlio-${i}`, { cartella: `/f${i}`, padreId: 'padre-1', conclusa: false });
  }
  let chiamata = false;
  const orch = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/undicesimo' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, new RegExp(`${LIMITE_FIGLI_CONCORRENTI} figli concorrenti`));
  assert.equal(chiamata, false);
});

test('⭐⭐⭐ delegaSottoTask: avvio riuscito — avviaESeguiFn riceve task/cartella/padreId/profonditaDelega VERI', async () => {
  const sessioni = new Map([['padre-1', vocePadre({ profonditaDelega: 0 })]]);
  let opzioniRicevute;
  const orch = creaSubagentOrchestrator({
    sessioni,
    avviaESeguiFn: (opzioni) => {
      opzioniRicevute = opzioni;
      opzioni.onConclusioneFn({ ok: true, esito: { detto: 'fatto per davvero', comeFinita: 'concluso' } });
      return { sessionId: 'figlio-vero' };
    },
  });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'scrivi un modulo', cartella: '/figlio' });
  assert.equal(opzioniRicevute.cartella, '/figlio');
  assert.deepEqual(opzioniRicevute.task, { consegna: 'scrivi un modulo' });
  assert.equal(opzioniRicevute.padreId, 'padre-1');
  assert.equal(opzioniRicevute.profonditaDelega, 1);
  assert.equal(esito.esito, 'concluso');
  assert.equal(esito.riassunto, 'fatto per davvero');
});

test('⛔⛔ AL CONTRARIO — la Promise resta PENDING finché onConclusioneFn non scatta, mai risolta subito da sola', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  let onConclusioneCatturata;
  const orch = creaSubagentOrchestrator({
    sessioni,
    avviaESeguiFn: (opzioni) => { onConclusioneCatturata = opzioni.onConclusioneFn; return { sessionId: 'figlio-vero' }; },
  });
  let risolta = false;
  const promessa = orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/figlio' }).then((e) => { risolta = true; return e; });
  await new Promise((r) => setImmediate(r));
  assert.equal(risolta, false, 'senza onConclusioneFn chiamata, la delega non deve MAI risolversi da sola');
  onConclusioneCatturata({ ok: true, esito: { detto: 'ora sì', comeFinita: 'concluso' } });
  const esito = await promessa;
  assert.equal(risolta, true);
  assert.equal(esito.riassunto, 'ora sì');
});

test('⛔⛔⛔ AL CONTRARIO — avviaESeguiFn che rifiuta SUBITO (es. chiave API assente): la delega si risolve, mai appesa in eterno', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  const orch = creaSubagentOrchestrator({
    sessioni,
    avviaESeguiFn: () => ({ erroreAvvio: 'Chiave API non configurata sul server (OPENROUTER_API_KEY)', code: 'CONFIG_INVALID' }),
  });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/figlio' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /Chiave API non configurata/);
});

/*
 * ⭐⭐⭐ esitoDelegaDaRisultato — pura, i tre esiti che agent-service.avviaSessione
 * può produrre (vedi la sua doc: {ok, esito, erroreInterno}).
 */
test('esitoDelegaDaRisultato: ok:true → concluso, riassunto = esito.detto VERO', () => {
  const r = esitoDelegaDaRisultato({ ok: true, esito: { detto: 'ho finito il lavoro', comeFinita: 'concluso' } });
  assert.deepEqual(r, { riassunto: 'ho finito il lavoro', esito: 'concluso' });
});

test('esitoDelegaDaRisultato: ok:true ma detto vuoto/assente → riassunto onesto, mai una stringa vuota silenziosa', () => {
  const r = esitoDelegaDaRisultato({ ok: true, esito: { detto: '', comeFinita: 'concluso' } });
  assert.match(r.riassunto, /non ha lasciato un riassunto/);
});

test("esitoDelegaDaRisultato: esito presente ma NON ok (giri-esauriti/fermato) → fallito, motivo cita comeFinita VERO", () => {
  const r = esitoDelegaDaRisultato({ ok: false, esito: { detto: null, comeFinita: 'giri-esauriti' } });
  assert.equal(r.esito, 'fallito');
  assert.match(r.riassunto, /giri-esauriti/);
});

test('⛔ AL CONTRARIO — esitoDelegaDaRisultato: nessun esito (erroreInterno) → fallito col motivo VERO, mai un riassunto inventato', () => {
  const r = esitoDelegaDaRisultato({ ok: false, esito: null, erroreInterno: 'talosLavora ha lanciato inaspettatamente' });
  assert.equal(r.esito, 'fallito');
  assert.equal(r.riassunto, null);
  assert.equal(r.motivo, 'talosLavora ha lanciato inaspettatamente');
});

test('⛔ AL CONTRARIO — esitoDelegaDaRisultato: risultato null/undefined non lancia, fallito onesto', () => {
  const r = esitoDelegaDaRisultato(null);
  assert.equal(r.esito, 'fallito');
  assert.match(r.motivo, /sconosciuto/);
});
