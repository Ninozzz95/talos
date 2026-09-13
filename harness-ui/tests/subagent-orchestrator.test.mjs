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

/*
 * ⛔ 13/09/2026 — questa prova è stata SDOPPIATA, e la ragione va detta perché cambia cosa misura.
 *   Prima era una sola e diceva «la forma WSL è rifiutata perché non esiste sul disco»: due cose
 *   diverse sotto un nome solo, e la seconda faceva passare la prima. Ora la forma ha il suo
 *   controllo (`percorsoDellaFigliaUsabile`) e l'esistenza il suo, quindi servono due prove.
 * ⛔ E la madre di prova era scritta `'C:\progetto'`: in JavaScript `\p` NON è un escape, quindi
 *   quella stringa valeva `C:progetto` — una forma «unità senza radice», non un percorso Windows.
 *   La prova girava su una premessa che non era quella che dichiarava. Corretta a `'C:\\progetto'`.
 */
test('⛔⛔⛔ AL CONTRARIO — delegaSottoTask: il percorso in forma WSL è rifiutato PER LA FORMA, prima del disco, e avviaESeguiFn MAI chiamata', async () => {
  const sessioni = new Map([['padre-1', vocePadre({ cartella: 'C:\\progetto' })]]);
  let chiamata = false;
  const orch = creaSubagentOrchestrator({
    sessioni,
    // ⛔ Il disco dice SÌ a tutto: se la prova resta verde, il no viene dalla forma e da niente altro.
    cartellaEsisteFn: () => true,
    /*
     * ⛔⛔⛔ 13/09/2026, revisione avversariale: questo finto NON concludeva. Se la guardia
     *   salta, la delega non viene piu' rifiutata, la Promise resta PENDENTE PER SEMPRE e
     *   `node --test` (che di serie non ha alcun timeout) resta appeso invece di stampare un
     *   rosso. MISURATO: spegnendo `percorsoDellaFigliaUsabile` questa prova non falliva, si
     *   impiccava - dieci minuti senza una riga. Una prova che si impicca non protegge: blocca
     *   la pipeline, e chi la guarda non sa nemmeno quale guardia sia caduta. Ora conclude,
     *   quindi l'assert qui sotto arriva e diventa ROSSO.
     */
    avviaESeguiFn: (opzioni) => {
      chiamata = true;
      opzioni?.onConclusioneFn?.({ ok: true, esito: { detto: 'mai', comeFinita: 'concluso' } });
      return { sessionId: 'mai' };
    },
  });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/mnt/c/progetto' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /forma di un altro sistema operativo/);
  assert.match(esito.motivo, /C:\\progetto/, 'il rifiuto deve DIRE quale sia il percorso giusto, o il modello indovina');
  assert.equal(chiamata, false, 'una cartella di un altro sistema non deve MAI far partire un figlio destinato a morire');
});

test('⛔⛔⛔ AL CONTRARIO — delegaSottoTask: cartella della forma GIUSTA ma che non esiste sul disco — rifiutata, avviaESeguiFn MAI chiamata', async () => {
  const sessioni = new Map([['padre-1', vocePadre({ cartella: 'C:\\progetto' })]]);
  let chiamata = false;
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: (p) => p === 'C:\\progetto',
    /*
     * ⛔⛔⛔ 13/09/2026, revisione avversariale: questo finto NON concludeva. Se la guardia
     *   salta, la delega non viene piu' rifiutata, la Promise resta PENDENTE PER SEMPRE e
     *   `node --test` (che di serie non ha alcun timeout) resta appeso invece di stampare un
     *   rosso. MISURATO: spegnendo `percorsoDellaFigliaUsabile` questa prova non falliva, si
     *   impiccava - dieci minuti senza una riga. Una prova che si impicca non protegge: blocca
     *   la pipeline, e chi la guarda non sa nemmeno quale guardia sia caduta. Ora conclude,
     *   quindi l'assert qui sotto arriva e diventa ROSSO.
     */
    avviaESeguiFn: (opzioni) => {
      chiamata = true;
      opzioni?.onConclusioneFn?.({ ok: true, esito: { detto: 'mai', comeFinita: 'concluso' } });
      return { sessionId: 'mai' };
    },
  });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: 'C:\\non-esiste' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /non esiste su questo computer/);
  assert.match(esito.motivo, /C:\\progetto/, 'anche qui il rifiuto porta la cartella buona');
  assert.equal(chiamata, false, 'una cartella inesistente non deve MAI far partire un figlio destinato a morire');
});

/*
 * ⛔⛔⛔ 13/09/2026 - aggiunta dalla REVISIONE AVVERSARIALE.
 *   Il commento accanto a questo rifiuto prometteva "non consiglio la cartella della madre quando
 *   e' LEI a non esistere: sarebbe un consiglio falso", ma la condizione scritta era
 *   `dove === padre.cartella`, che copre solo il caso in cui il modello RIPETE la cartella della
 *   madre. Qui il disco nega ENTRAMBE: il motivo deve nominare quella proposta e NON consigliare
 *   l'altra.
 */
test('⛔⛔⛔ AL CONTRARIO - se anche la cartella della MADRE e sparita, il rifiuto NON la consiglia: un consiglio falso e peggio di nessun consiglio', async () => {
  const sessioni = new Map([['padre-1', vocePadre({ cartella: 'C:\\progetto' })]]);
  let chiamata = false;
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: () => false, // il disco ha perso tutte e due
    avviaESeguiFn: (opzioni) => {
      chiamata = true;
      opzioni?.onConclusioneFn?.({ ok: true, esito: { detto: 'mai', comeFinita: 'concluso' } });
      return { sessionId: 'mai' };
    },
  });
  const esito = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: 'C:\\progetto\\sotto' });
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /non esiste su questo computer/);
  assert.ok(!esito.motivo.includes('usa esattamente'),
    `il rifiuto consiglia una cartella che il disco ha appena negato: ${esito.motivo}`);
  assert.equal(chiamata, false);
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
  assert.deepEqual(opzioniRicevute.task, { consegna: 'scrivi un modulo', consegnaCorta: 'scrivi un modulo' } /* 09/09: la forma corta nasce qui — senza il marcatore «Compito:» del kernel resta la stringa intera, che è giusto: non si indovina un preambolo che non c'è */);
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

/*
 * ⛔⛔⛔ 08/09/2026 — LA FIGLIA NON DEVE FINIRE NELLA RADICE DEL DISCO.
 *
 * Misurato sulla run vera dell'owner: le due sessioni delegate giravano in `C:\`. La cartella
 * corretta veniva passata di qui, e `cartellaEffettivaPerPermessi` (session-registry) la allargava
 * a `parsePath(cartella).root` perché la delega non dichiarava `cartellaGiaScelta`. La figlia
 * eredita «Full access» dalla madre — ed è giusto — ma NON HA NIENTE DA CUI ALLARGARSI: la sua
 * cartella è per definizione quella della madre, già scelta da una persona.
 *
 * Danno misurato prima della cura, su 37 chiamate: `EPERM mkdir 'C:\'`, `ENOENT 'C:\package.json'`,
 * sei `document_create` falliti di fila, zero file scritti nel workspace.
 *
 * Ricerca 08/09/2026 (dev.to, «Giving an AI agent permission to spawn sub-agents without losing
 * control»): il workspace di una delega si risolve «against the parent's root», e l'eredità va
 * «downgraded by default» — «if every subagent inherits the parent token, it recreates sudo with
 * better branding».
 *
 * ⛔ Questa prova FALLISCE sul codice di prima: è il suo unico motivo di esistere.
 */
test('DELEGA: la figlia dichiara cartellaGiaScelta, o il registro la allarga alla radice del disco', () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  let visto = null;
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: () => true,
    avviaESeguiFn: (argomenti) => { visto = argomenti; return { sessionId: 'figlia-1' }; },
  });
  void orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'scrivi due righe' }); // la promessa si chiude a figlia conclusa: qui serve solo l'avvio

  assert.ok(visto, 'la delega non ha nemmeno provato ad avviare la figlia');
  assert.equal(visto.cartellaGiaScelta, true,
    'senza questa bandiera «Full access» viene tradotto nella radice del disco, e la figlia lavora in C:\\');
  assert.equal(visto.cartella, vocePadre().cartella,
    'la figlia lavora dove lavora la madre: non una cartella diversa, non una piu larga');
});

test('AL CONTRARIO — la cartella non viene inventata: resta quella della madre, carattere per carattere', () => {
  const madre = vocePadre();
  const sessioni = new Map([['padre-1', madre]]);
  let visto = null;
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: () => true,
    avviaESeguiFn: (argomenti) => { visto = argomenti; return { sessionId: 'figlia-2' }; },
  });
  void orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'leggi un file' });
  assert.equal(visto?.cartella, madre.cartella);
  assert.notEqual(visto?.cartella, 'C:\\', 'la radice del disco non e mai una cartella di lavoro legittima per una figlia');
});

/*
 * ⛔ 09/09 — trovato nella FOTO della scheda «Agenti» durante il giro vero della delega (D2, glm-5.3-flash
 * sul 4174): le due schede portavano lo STESSO nome, «Sei una sessione di lavoro autonoma; non hai altro
 * …». È il preambolo del kernel, identico per ogni figlia; il compito vero comincia dopo il marcatore
 * «Compito:», a 700+ caratteri di distanza (la consegna misurata nel JSONL del giro era 825 caratteri).
 * La barra a sinistra era già curata: la scheda no, perché legge `elencaFigli` e non `elenca()`.
 * ⛔ `task` resta la consegna intera — il foglio «Albero sessione» la mostra per esteso.
 */
test('elencaFigli: accanto alla consegna intera esce il COMPITO, o due deleghe diverse diventano la stessa riga', () => {
  const preambolo = 'Sei una sessione di lavoro autonoma; non hai altro contesto oltre a questo messaggio. '
    + 'Non chiedere conferme, non fare domande: porta a termine il lavoro e poi riassumi in poche righe.\n\n';
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    ['f1', { cartella: '/x', padreId: 'padre-1', conclusa: true, task: { consegna: `${preambolo}Compito: crea un file chiamato parte1.md con tre righe sul registro dei processi` }, avviataAlle: '2026-09-09T20:31:00.000Z' }],
    ['f2', { cartella: '/x', padreId: 'padre-1', conclusa: true, task: { consegna: `${preambolo}Compito: crea un file chiamato parte2.md con tre righe sugli allarmi` }, avviataAlle: '2026-09-09T20:32:00.000Z' }],
  ]);
  const figli = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => ({ sessionId: 'mai' }) }).elencaFigli('padre-1');

  assert.equal(figli[0].taskCorto, 'crea un file chiamato parte1.md con tre righe sul registro dei processi');
  assert.equal(figli[1].taskCorto, 'crea un file chiamato parte2.md con tre righe sugli allarmi');
  assert.notEqual(figli[0].taskCorto, figli[1].taskCorto, 'due deleghe diverse portano due nomi diversi');
  assert.ok(figli[0].task.startsWith(preambolo), 'la consegna intera NON viene accorciata: il foglio dell’albero la mostra tutta');
  /*
   * ⛔ AL CONTRARIO, e è il caso che conta a schermo: alla scheda arrivano i primi 52 caratteri. Se il
   * nome corto non ci fosse, i due sarebbero il medesimo troncamento del preambolo — esattamente ciò che
   * si vedeva nella foto.
   */
  assert.equal(figli[0].task.slice(0, 52), figli[1].task.slice(0, 52), 'la prova che il ripiego su `task` NON basta');
  assert.notEqual(figli[0].taskCorto.slice(0, 52), figli[1].taskCorto.slice(0, 52));
});

test('elencaFigli: una figlia ripristinata dal disco (senza consegnaCorta) ricava lo stesso il compito; una senza consegna non inventa niente', () => {
  const sessioni = new Map([
    ['padre-1', vocePadre()],
    /* ripristinata: il registro rilegge `task.consegna` dal JSONL e `consegnaCorta` non c’è mai stata */
    ['ripresa', { cartella: '/x', padreId: 'padre-1', conclusa: true, task: { consegna: 'Preambolo lungo qualunque.\nCompito: conta le righe di parte1.md' }, avviataAlle: '2026-09-09T20:31:00.000Z' }],
    ['muta', { cartella: '/x', padreId: 'padre-1', conclusa: true, task: null, avviataAlle: '2026-09-09T20:33:00.000Z' }],
  ]);
  const figli = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true, avviaESeguiFn: () => ({ sessionId: 'mai' }) }).elencaFigli('padre-1');
  assert.equal(figli[0].taskCorto, 'conta le righe di parte1.md');
  assert.equal(figli[1].taskCorto, null, 'senza consegna il campo è null, e la scheda mostra la sua frase di ripiego');
  assert.equal(figli[1].task, null);
});
