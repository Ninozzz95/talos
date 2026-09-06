import assert from 'node:assert/strict';
import test from 'node:test';

import {
  creaSubagentOrchestrator,
  esitoDelegaDaEventi,
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
function vocePadre({ cartella = '/padre', profonditaDelega = 0, modello = null, reasoning = null, permessi = null, permessiPerAttrezzo = null } = {}) {
  // 06/9: il figlio eredita modello/sforzo/permessi della madre — la voce di prova li porta come la vera
  return { cartella, profonditaDelega, conclusa: false, padreId: null, modello, reasoning, permessi, permessiPerAttrezzo };
}

test('contaFigliAttivi: 0 senza figli, ignora sessioni con padreId diverso o assente', () => {
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    ['estranea', { cartella: '/altro', padreId: null, conclusa: false }],
    ['figlio-di-altro-padre', { cartella: '/x', padreId: 'padre-2', conclusa: false }],
  ]);
  const orch = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => ({ sessionId: 'mai' }) });
  assert.equal(orch.contaFigliAttivi('padre-1'), 0);
});

test('contaFigliAttivi: conta SOLO i figli non conclusi dello stesso padre', () => {
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    ['figlio-attivo-1', { cartella: '/f1', padreId: 'padre-1', conclusa: false }],
    ['figlio-attivo-2', { cartella: '/f2', padreId: 'padre-1', conclusa: false }],
    ['figlio-concluso', { cartella: '/f3', padreId: 'padre-1', conclusa: true }],
  ]);
  const orch = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => ({ sessionId: 'mai' }) });
  assert.equal(orch.contaFigliAttivi('padre-1'), 2, 'un figlio concluso non conta più come attivo');
});

test('elencaFigli: elenco vero, ordinato per avvio, include task/conclusa/esitoDelega', () => {
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    ['figlio-b', { cartella: '/b', padreId: 'padre-1', conclusa: true, task: { consegna: 'compito B' }, avviataAlle: '2026-08-28T10:00:00.000Z', esitoDelega: 'concluso' }],
    ['figlio-a', { cartella: '/a', padreId: 'padre-1', conclusa: false, task: { consegna: 'compito A' }, avviataAlle: '2026-08-28T09:00:00.000Z', esitoDelega: null }],
    ['estraneo', { cartella: '/e', padreId: 'padre-2', conclusa: false, task: { consegna: 'non mio' }, avviataAlle: '2026-08-28T08:00:00.000Z' }],
  ]);
  const orch = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => ({ sessionId: 'mai' }) });
  const figli = orch.elencaFigli('padre-1');
  assert.deepEqual(figli.map((f) => f.sessionId), ['figlio-a', 'figlio-b'], 'ordinati per avviataAlle, il più vecchio prima');
  assert.equal(figli[0].task, 'compito A');
  assert.equal(figli[0].conclusa, false);
  assert.equal(figli[1].esitoDelega, 'concluso');
});

test('⛔ T05-D3: un figlio ucciso dalla morte del processo esce con interrotta:true — non «in corso» per sempre', () => {
  /*
   * Senza questo campo la scheda Agenti e il foglio dell'albero dicevano «In corso» a un
   * sotto-agente che nessuno stava più eseguendo, e non avevano NIENTE con cui dire il vero:
   * il dato non usciva da qui. Il registro lo sa (`interrotta: !conclusa` al ripristino).
   */
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    ['morto', { cartella: '/m', padreId: 'padre-1', conclusa: false, interrotta: true, task: { consegna: 'ucciso dal riavvio' }, avviataAlle: '2026-09-06T09:00:00.000Z' }],
    ['vivo', { cartella: '/v', padreId: 'padre-1', conclusa: false, task: { consegna: 'davvero in corso' }, avviataAlle: '2026-09-06T10:00:00.000Z' }],
  ]);
  const figli = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => ({ sessionId: 'mai' }) }).elencaFigli('padre-1');
  assert.equal(figli[0].interrotta, true, 'il figlio morto lo dichiara');
  assert.equal(figli[1].interrotta, false, 'AL CONTRARIO — un figlio vivo non diventa interrotto, e il campo c’è sempre');
});

test('⛔⛔⛔ delegaSottoTask: sessione padre inesistente — rifiutato, avviaESeguiFn MAI chiamata', async () => {
  const sessioni = new Map();
  let chiamata = false;
  const orch = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'fantasma', task: 'x', cartella: '/y' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /non esiste più/);
  assert.equal(chiamata, false);
});

test('⭐⭐⭐ 06/9 — delegaSottoTask: cartella UGUALE al padre, o assente, PARTE nella cartella del padre', async () => {
  /*
   * ⛔⛔⛔ Fino al 06/9 questo test pinnava il divieto («rifiutato, avviaESeguiFn MAI chiamata»).
   * Capovolto su una MISURA: dal vivo, un giro con una sola delega ha prodotto quattro sessioni
   * figlie, otto giri, 76,8k token, tutte fallite — il modello vedeva un rifiuto sul caso normale
   * (delegare un pezzo dello STESSO progetto) e aggirava riscrivendo il percorso in forma WSL
   * (`/mnt/c/…`), che passava il confronto e su Windows non esiste.
   * Stato dell'arte (Hermes Agent «Subagent delegation», 06/09/2026): per difetto i sotto-agenti
   * condividono la cartella del padre.
   */
  const sessioni = new Map([['padre-1', vocePadre({ cartella: '/progetto', modello: 'z-ai/glm-5.3-flash', reasoning: 'high', permessi: 'Full access' })]]);
  const viste = [];
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: () => true,
    avviaESeguiFn: (opzioni) => {
      viste.push(opzioni);
      opzioni.onConclusioneFn({ ok: true, esito: { detto: 'fatto', comeFinita: 'concluso' } });
      return { sessionId: `figlio-${viste.length}` };
    },
  });
  const uguale = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/progetto' });
  assert.equal(uguale.esito, 'concluso');
  assert.equal(viste[0].cartella, '/progetto');
  // e senza cartella si lavora dove lavora il padre
  const assente = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'y' });
  assert.equal(assente.esito, 'concluso');
  assert.equal(viste[1].cartella, '/progetto');
  // ⭐ il figlio EREDITA il modello della madre: prima partiva col modello di difetto, e nessuno lo diceva
  assert.equal(viste[0].modelloRichiesta, 'z-ai/glm-5.3-flash');
  assert.equal(viste[0].reasoningRichiesto, 'high');
  assert.equal(viste[0].permessiRichiesti, 'Full access');
});

test('⛔⛔⛔ AL CONTRARIO — delegaSottoTask: cartella che NON esiste sul disco (il percorso in forma WSL) — rifiutata, avviaESeguiFn MAI chiamata', async () => {
  const sessioni = new Map([['padre-1', vocePadre({ cartella: 'C:\progetto' })]]);
  let chiamata = false;
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: (p) => p === 'C:\progetto',
    avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; },
  });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/mnt/c/progetto' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /non esiste su questo computer/);
  assert.equal(chiamata, false, 'una cartella inesistente non deve MAI far partire un figlio destinato a morire');
});

test(`⛔⛔⛔ delegaSottoTask: profondità oltre il limite (${LIMITE_PROFONDITA_DELEGA}) — rifiutato col numero VERO nel motivo`, async () => {
  const sessioni = new Map([['padre-1', vocePadre({ profonditaDelega: LIMITE_PROFONDITA_DELEGA })]]);
  let chiamata = false;
  const orch = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
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
    cartellaEsisteFn: () => true,
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
  const orch = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
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
    cartellaEsisteFn: () => true,
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
    cartellaEsisteFn: () => true,
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
    cartellaEsisteFn: () => true,
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

test('⛔ J RED — ok:true non basta se ogni tool fallisce e non esiste alcuna evidenza del lavoro', () => {
  const r = esitoDelegaDaRisultato(
    { ok: true, esito: { detto: 'Ho completato il test.', comeFinita: 'concluso' } },
    [
      { type: 'ToolCallResult', content: 'error: ENOENT: no such file or directory' },
      { type: 'ToolCallResult', content: 'exit 1 [sandbox: wsl2]' },
      { type: 'RunFinished', outcome: { type: 'success' } },
    ],
  );
  assert.equal(r.esito, 'fallito');
  assert.match(r.motivo, /evidenza verificabile/i);
});

test('⭐⭐ J — una StateDelta /file/ è evidenza sufficiente per mantenere concluso', () => {
  const r = esitoDelegaDaRisultato(
    { ok: true, esito: { detto: 'File scritto.', comeFinita: 'concluso' } },
    [
      { type: 'StateDelta', delta: [{ op: 'add', path: '/file/test/gioco.test.mjs', value: 'testo' }] },
      { type: 'RunFinished', outcome: { type: 'success' } },
    ],
  );
  assert.equal(r.esito, 'concluso');
});

test('⛔ J — una tool-call riuscita senza file non basta quando il task chiede una modifica', () => {
  const r = esitoDelegaDaRisultato(
    { ok: true, esito: { detto: 'Ho aggiunto il test.', comeFinita: 'concluso' } },
    [
      { type: 'ToolCallResult', content: 'Saved the note «controllo completato».' },
      { type: 'RunFinished', outcome: { type: 'success' } },
    ],
    { task: 'Aggiungi un test al file test/gioco.test.mjs e verifica la suite.' },
  );
  assert.equal(r.esito, 'fallito');
  assert.match(r.motivo, /scritture o artefatti/i);
});

test('⭐⭐ J — il callback associa il verdetto e l evidenza alla figlia anche se arriva prima del return', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: () => true,
    avviaESeguiFn: (opzioni) => {
      sessioni.set('figlio-vero', {
        padreId: 'padre-1',
        conclusa: true,
        eventi: [
          { type: 'ToolCallResult', content: 'error: ENOENT: no such file or directory' },
          { type: 'RunFinished', outcome: { type: 'success' } },
        ],
      });
      opzioni.onConclusioneFn({ ok: true, esito: { detto: 'fatto', comeFinita: 'concluso' } });
      return { sessionId: 'figlio-vero' };
    },
  });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'scrivi un file', cartella: '/figlio' });
  assert.equal(esito.esito, 'fallito');
  assert.equal(sessioni.get('figlio-vero').esitoDelega, 'fallito');
  assert.equal(sessioni.get('figlio-vero').evidenzaDelega.toolCallsFalliti, 1);
});

test('⭐⭐ J — il ripristino da eventi distingue RunFinished senza prova operativa da una scrittura reale', () => {
  assert.equal(esitoDelegaDaEventi([
    { type: 'ToolCallResult', content: 'exit 1 [sandbox: wsl2]' },
    { type: 'RunFinished', outcome: { type: 'success' } },
  ]), 'fallito');
  assert.equal(esitoDelegaDaEventi([
    { type: 'StateDelta', delta: [{ op: 'replace', path: '/file/src/modulo.js', value: 'ok' }] },
    { type: 'RunFinished', outcome: { type: 'success' } },
  ]), 'concluso');
  assert.equal(esitoDelegaDaEventi([
    { type: 'ToolCallResult', content: 'Saved the note «controllo completato».' },
    { type: 'RunFinished', outcome: { type: 'success' } },
  ], { task: { consegna: 'Modifica il file test/gioco.test.mjs aggiungendo un test.' } }), 'fallito');
  assert.equal(esitoDelegaDaEventi([{ type: 'RunError', code: 'internal-error', message: 'no' }]), 'fallito');
});

test('⛔ AL CONTRARIO — esitoDelegaDaRisultato: risultato null/undefined non lancia, fallito onesto', () => {
  const r = esitoDelegaDaRisultato(null);
  assert.equal(r.esito, 'fallito');
  assert.match(r.motivo, /sconosciuto/);
});
