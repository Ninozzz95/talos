/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchRun.test.ts,
 * più quattro casi miei in coda (segnati «⭐ MIO»), fra cui il giornale
 * troncato a metà riga.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TALOS_RESEARCH_TERMINAL,
  talosResearchApply,
  talosResearchIdempotencyKey,
  talosResearchIsResting,
  talosResearchIsTerminal,
  talosResearchNextStep,
  talosResearchProgressOf,
  talosResearchRecover,
  talosResearchReplay,
  talosResearchSpent,
  talosResearchStepIdFor,
  talosResearchWorkLeft,
} from '../../src/research/run.mjs';

const T0 = '2026-08-02T00:00:00.000Z';
const T1 = '2026-08-02T00:00:10.000Z';
const T2 = '2026-08-02T00:00:20.000Z';
const T3 = '2026-08-02T00:00:30.000Z';

/** @type {import('../../src/research/run.mjs').TalosResearchEvent} */
const started = {
  kind: 'run_started',
  at: T0,
  id: 'run-1',
  sessionId: 'chat-9',
  question: 'quale tablet conviene',
  depth: 'deep',
  engine: 'device',
};

/** @type {import('../../src/research/run.mjs').TalosResearchEvent} */
const approved = {
  kind: 'plan_approved',
  at: T0,
  branches: [{ id: 'b1', question: 'prezzi attuali', estimate: { tokens: 9000, searches: 3, pages: 5 } }],
};

/**
 * @param {string} stepId
 * @param {string} at
 * @returns {import('../../src/research/run.mjs').TalosResearchEvent}
 */
function search(stepId, at) {
  return { kind: 'step_started', at, stepId, branchId: 'b1', stepKind: 'search' };
}

/**
 * @param {string} stepId
 * @param {string} at
 * @param {number} [searches]
 * @param {number} [tokens]
 * @returns {import('../../src/research/run.mjs').TalosResearchEvent}
 */
function finished(stepId, at, searches = 1, tokens = 1200) {
  return { kind: 'step_finished', at, stepId, spend: { tokens, searches, pages: 0 }, resultRef: `vault:${stepId}` };
}

test('un giro di ricerca ucciso e ripreso', async (t) => {
  await t.test('è lo stesso stato per quante volte si rigiochi la sua storia', () => {
    const journal = [started, approved, search('s1', T1), finished('s1', T2)];

    // Il determinismo qui non è una gentilezza: lo stato non è conservato, è
    // RICAVATO, quindi un replay che derivasse cambierebbe in silenzio quello
    // che il giro crede di aver già pagato.
    assert.deepEqual(talosResearchReplay(journal), talosResearchReplay(journal));
  });

  /*
   * IL test per cui questo disegno esiste.
   *
   * Il processo viene ucciso fra la fine di una ricerca e qualunque altra cosa.
   * Sulla via del ritorno il giro non deve offrire di nuovo quella ricerca: era
   * stata pagata. Fermare un giro di Deep Research su ChatGPT vuol dire
   * ricominciare da zero — è il comportamento che qui si rifiuta.
   */
  await t.test('non offre mai un passo già finito, comunque sia morto il processo', () => {
    const run = talosResearchReplay([started, approved, search('s1', T1), finished('s1', T2)]);

    const recovered = talosResearchRecover(run, T3);

    assert.equal(recovered.steps[0].state, 'done');
    assert.equal(talosResearchNextStep(recovered), null);
    assert.deepEqual(talosResearchSpent(recovered), { tokens: 1200, searches: 1, pages: 0 });
  });

  await t.test('offre di nuovo il passo che stava ancora girando, e dice che è un secondo tentativo', () => {
    // Avviato e mai finito: nessuno sa se il fornitore abbia risposto.
    const run = talosResearchReplay([started, approved, search('s1', T1)]);

    const recovered = talosResearchRecover(run, T2);
    const next = talosResearchNextStep(recovered);

    assert.equal(recovered.steps[0].state, 'interrupted');
    assert.equal(next?.id, 's1');
    // Il conteggio è prova di quello che è successo, e NON deve cambiare il
    // nome del passo — vedi la chiave qui sotto.
    assert.equal(next?.attempts, 1);
  });

  await t.test('chiama un passo riprovato con lo stesso nome, così un fornitore può deduplicarlo', () => {
    const first = talosResearchIdempotencyKey('run-1', 's1');
    const afterRetry = talosResearchIdempotencyKey('run-1', 's1');

    // Di proposito NON giro+passo+tentativo, che è quello che la letteratura
    // sull'esecuzione durevole raccomanda. Là la chiave separa i tentativi
    // perché il secondo giri; qui l'utente paga a ricerca di tasca sua, quindi
    // due tentativi di un passo logico devono essere riconoscibili come la
    // stessa cosa. Documentata come una divergenza, non una svista.
    assert.equal(afterRetry, first);
    assert.notEqual(talosResearchIdempotencyKey('run-1', 's2'), first);
    assert.notEqual(talosResearchIdempotencyKey('run-2', 's1'), first);
  });

  /*
   * I giornali prendono duplicati. Una riga viene aggiunta, il processo muore
   * prima della conferma, e la scrittura viene rigiocata al prossimo avvio.
   * Contarla due volte riporterebbe denaro che l'utente non ha mai speso — e il
   * numero glielo si mostra, quindi deve essere vero.
   */
  await t.test('non addebita due volte un passo la cui fine è stata registrata due volte', () => {
    const once = talosResearchReplay([started, approved, search('s1', T1), finished('s1', T2)]);
    const twice = talosResearchReplay([
      started, approved, search('s1', T1), finished('s1', T2), finished('s1', T3),
    ]);

    assert.deepEqual(talosResearchSpent(twice), talosResearchSpent(once));
    assert.equal(twice.steps.length, 1);
  });

  await t.test('rifiuta di riavviare un giro che ha già speso denaro', () => {
    const run = talosResearchReplay([started, approved, search('s1', T1), finished('s1', T2), started]);

    // Un `run_started` ripetuto — la forma che prende una prima scrittura
    // duplicata — non deve spazzare via il piano e le ricevute.
    assert.equal(run.steps.length, 1);
    assert.equal(talosResearchSpent(run).tokens, 1200);
  });

  await t.test('ignora un passo che è fallito dopo che il giro era già fatto', () => {
    const run = talosResearchReplay([
      started, approved, search('s1', T1), finished('s1', T2), finished('s1', T3),
    ]);

    const late = talosResearchApply(run, { kind: 'step_failed', at: T3, stepId: 's1', error: 'timeout' });

    // È finito. Un fallimento tardivo per lo stesso passo è rumore di un
    // secondo tentativo che ha perso la gara, non un motivo per buttare via un
    // risultato pagato.
    assert.equal(late?.steps[0].state, 'done');
    assert.equal(late?.steps[0].resultRef, 'vault:s1');
  });

  await t.test('sopravvive a una storia che non riesce a interpretare invece di rifiutarsi di caricare', () => {
    // Un evento di passo senza un passo corrispondente: il giro deve rigiocare
    // lo stesso. Un giornale che non si carica è un giro il cui lavoro pagato è
    // perso, che è peggio di un evento ignorato in silenzio.
    const run = talosResearchReplay([started, approved, finished('ghost', T1)]);

    assert.notEqual(run, null);
    assert.equal(run?.steps.length, 0);
  });

  await t.test('non offre niente una volta che il giro è cancellato, qualunque cosa resti in sospeso', () => {
    const run = talosResearchReplay([
      started, approved, search('s1', T1), { kind: 'run_cancelled', at: T2 },
    ]);

    assert.equal(talosResearchNextStep(talosResearchRecover(run, T3)), null);
  });

  await t.test('porta con sé dove sta girando, perché è quello che gli permette di spostarsi', () => {
    // R1b: uno stato che si serializza è uno stato che può migrare su un
    // server. Il campo è parte del giornale dal primo evento, quindi un giro
    // non deve essere ri-pianificato per cambiare motore.
    const run = talosResearchReplay([{ ...started, engine: 'cloud' }]);

    assert.equal(run.engine, 'cloud');
  });
});

test('quanto avanti dice di essere un giro', async (t) => {
  /*
   * La sintesi conta fra i passi finiti, quindi un totale preso dal solo piano
   * annunciava «2 di 1» nel momento in cui il rapporto veniva scritto. Adesso
   * una funzione sola risponde a questo, per la stazione e per la notifica: due
   * modi di ricavare lo stesso numero è il modo in cui erano in disaccordo.
   */
  await t.test('conta il rapporto una volta che il giro ne ha uno', () => {
    const run = talosResearchReplay([
      started, approved, search('s1', T1), finished('s1', T2),
      { kind: 'step_started', at: T2, stepId: 'synthesis', branchId: 'synthesis', stepKind: 'synthesise' },
      finished('synthesis', T3),
    ]);

    assert.deepEqual(talosResearchProgressOf(run), { done: 2, total: 2 });
  });

  await t.test('non conta un rapporto che non è stato cominciato', () => {
    // L'altra direzione della stessa bugia: un denominatore che comprende
    // lavoro che potrebbe non essere mai tentato fa sembrare incompleto un giro
    // finito.
    const run = talosResearchReplay([started, approved, search('s1', T1)]);

    assert.deepEqual(talosResearchProgressOf(run), { done: 0, total: 1 });
  });
});

/*
 * Mettere in pausa, cancellare e rinominare — aggiunto il 2026-08-03 dopo che
 * la ricerca sul lavoro lungo ha trovato che Android non ha affatto la nozione
 * di una pausa: gli stati di WorkManager sono
 * ENQUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/BLOCKED, CANCELLED è terminale, e
 * chiamarlo quando una persona ha chiesto una pausa butterebbe via una ricerca
 * che aveva pagato.
 */
test('fermare una ricerca senza perderla', async (t) => {
  const ready = [started, approved];

  /** @param {readonly import('../../src/research/run.mjs').TalosResearchEvent[]} events */
  function fold(events) {
    return talosResearchReplay(events);
  }

  await t.test('tiene separati «chiesto di fermarsi» e «fermo», perché in mezzo c\'è del denaro', () => {
    // La pausa può cadere mentre un passo è in volo e già pagato.
    const asking = fold([...ready, search('s1', T1), { kind: 'run_pause_requested', at: T2 }]);
    assert.equal(asking.status, 'pause_requested');

    const rested = fold([...ready, search('s1', T1), { kind: 'run_pause_requested', at: T2 },
      finished('s1', T3), { kind: 'run_paused', at: T3 }]);
    assert.equal(rested.status, 'paused');
    // Drenato, non buttato: il passo che era in volo è messo a registro.
    assert.equal(rested.steps[0].state, 'done');
    assert.equal(talosResearchSpent(rested).searches, 1);
  });

  await t.test('non prenota nessun passo nuovo mentre riposa — imposto dove si decide il lavoro', () => {
    // Un passo che era a metà volo quando il processo è morto: il recupero lo
    // marca `interrupted`, che è l'unico stato che vale la pena riprovare,
    // quindi questo è il caso più forte — C'È del lavoro lì pronto da prendere.
    const killed = talosResearchRecover(fold([...ready, search('s1', T1)]), T2);

    const resting = talosResearchApply(killed, { kind: 'run_pause_requested', at: T2 });
    assert.equal(talosResearchNextStep(resting), null);

    const paused = talosResearchApply(killed, { kind: 'run_paused', at: T2 });
    assert.equal(talosResearchNextStep(paused), null);

    // …ed è ancora lì, intatto, nel momento in cui la persona riprende.
    const back = talosResearchApply(paused, { kind: 'run_resumed', at: T3 });
    assert.equal(back.status, 'collecting');
    assert.equal(talosResearchNextStep(back)?.id, 's1');
    assert.equal(talosResearchNextStep(back)?.state, 'interrupted');
  });

  await t.test('DEVE ancora il lavoro su cui si è fermato', () => {
    // Una domanda diversa da «cosa dovrebbe fare il motore adesso»: disegnare
    // un piano vuoto per un giro che sta per essere ripreso sarebbe una bugia
    // sull'ampiezza.
    const paused = fold([...ready, { kind: 'run_paused', at: T1 }]);
    assert.deepEqual(talosResearchWorkLeft(paused).map((branch) => branch.id), ['b1']);

    const cancelled = fold([...ready, { kind: 'run_cancelled', at: T1 }]);
    assert.deepEqual(talosResearchWorkLeft(cancelled), []);
  });

  await t.test('tratta una seconda pausa come la stessa pausa, non come una più forte', () => {
    // Due tocchi, oppure un tocco e una rigiocata di un giornale scritto due
    // volte.
    const twice = fold([...ready, { kind: 'run_paused', at: T1 }, { kind: 'run_pause_requested', at: T2 }]);
    assert.equal(twice.status, 'paused');
  });

  await t.test('rifiuta di riaprire o ri-fermare un giro che è finito', () => {
    // Raggiungibile: l'azione di una notifica vecchia che arriva dopo la fine
    // del giro. Cancellato vuol dire cancellato — una ripresa che lo riaprisse
    // spenderebbe denaro su una ricerca che la persona ha chiuso.
    const cancelled = fold([...ready, { kind: 'run_cancelled', at: T1 }]);
    assert.equal(talosResearchApply(cancelled, { kind: 'run_resumed', at: T2 }).status, 'cancelled');
    assert.equal(talosResearchApply(cancelled, { kind: 'run_pause_requested', at: T2 }).status, 'cancelled');

    const done = fold([...ready, { kind: 'run_finished', at: T1 }]);
    assert.equal(talosResearchApply(done, { kind: 'run_paused', at: T2 }).status, 'done');
  });

  await t.test('rinomina l\'ETICHETTA e mai la domanda che è stata pagata', () => {
    const named = fold([...ready, { kind: 'run_renamed', at: T1, title: '  Tablet 2026  ' }]);
    assert.equal(named.title, 'Tablet 2026');
    // Il fatto resta: l'esportazione, il piano e la provenienza ci si appoggiano.
    assert.equal(named.question, 'quale tablet conviene');

    // Vuoto non è un titolo — ripristina la domanda come etichetta, che è anche
    // quello che scrive «Ripristina il titolo originale».
    assert.equal(talosResearchApply(named, { kind: 'run_renamed', at: T2, title: '   ' }).title, null);
    assert.equal(talosResearchApply(named, { kind: 'run_renamed', at: T2, title: null }).title, null);
  });

  await t.test('comincia senza alcun titolo, invece che con una copia della domanda', () => {
    // Una copia deriverebbe nel momento in cui qualcosa toccasse uno dei due, e
    // renderebbe «ha un titolo suo» una domanda senza risposta.
    assert.equal(fold(ready).title, null);
  });
});

/*
 * ⭐ MIO — i quattro casi che il mobile non provava.
 *
 * Il primo è quello che il disegno di L4 chiede esplicitamente: un giornale
 * troncato a metà riga deve caricarsi lo stesso. `run.mjs` non legge dal disco
 * — è aritmetica su una lista — quindi qui si prova l'invariante al livello che
 * questo file possiede davvero: il giornale arriva come testo JSONL, l'ultima
 * riga è mozzata (il processo è morto a metà `appendFile`), e lo stato che ne
 * esce è quello dell'ultimo evento COMPLETO, con la spesa di quello e non di
 * più. Provare la lettura del file spetta a L4, e lo dico invece di far finta
 * che questo test la copra.
 */
test('⭐ MIO — un giornale troncato a metà riga si carica lo stesso', () => {
  const righe = [started, approved, search('s1', T1), finished('s1', T2)]
    .map((evento) => JSON.stringify(evento));
  // Il processo è morto DENTRO la quinta scrittura: mezza riga, niente `\n`.
  const jsonl = righe.join('\n') + '\n' + JSON.stringify(search('s2', T3)).slice(0, 30);

  /** @type {import('../../src/research/run.mjs').TalosResearchEvent[]} */
  const eventi = [];
  for (const riga of jsonl.split('\n')) {
    if (!riga.trim()) continue;
    // ⛔ La riga mozzata si SALTA, non fa saltare il caricamento: «un giro che
    //   non si può rigiocare è lavoro pagato perso».
    try { eventi.push(JSON.parse(riga)); } catch { /* riga mozzata: la si lascia */ }
  }

  const run = talosResearchReplay(eventi);

  assert.notEqual(run, null);
  assert.equal(eventi.length, 4);
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].state, 'done');
  // ⛔ E la spesa è quella dell'ultimo evento completo: la riga mozzata non
  //   porta denaro, e nemmeno lo inventa.
  assert.deepEqual(talosResearchSpent(run), { tokens: 1200, searches: 1, pages: 0 });
  // Il passo mozzato non esiste: al prossimo giro si riparte da lì, pulito.
  assert.equal(talosResearchNextStep(run), null);
});

test('⭐ MIO — `talosResearchApply` non lancia MAI, su nessun evento', () => {
  // La promessa è scritta nel commento («ignorati invece di lanciare») e ogni
  // ramo la rispetta separatamente: qui si prova tutta la superficie in una
  // volta, contro uno stato in cui nessuno di quegli eventi ha senso.
  const appena = talosResearchReplay([started]);

  /** @type {import('../../src/research/run.mjs').TalosResearchEvent[]} */
  const fuoriPosto = [
    { kind: 'step_finished', at: T1, stepId: 'mai-visto', spend: { tokens: 5, searches: 1, pages: 0 }, resultRef: null },
    { kind: 'step_failed', at: T1, stepId: 'mai-visto', error: 'x' },
    { kind: 'run_paused', at: T1 },
    { kind: 'run_resumed', at: T1 },
    { kind: 'run_pause_requested', at: T1 },
    { kind: 'run_renamed', at: T1, title: null },
    { kind: 'run_finished', at: T1 },
    { kind: 'run_cancelled', at: T1 },
    // Un evento di un formato che questa versione non conosce: arriva da un
    // giornale scritto da una versione più nuova. `default` lo ignora.
    /** @type {any} */ ({ kind: 'quello-che-verra', at: T1 }),
  ];

  for (const evento of fuoriPosto) {
    assert.doesNotThrow(() => talosResearchApply(appena, evento), `evento ${evento.kind}`);
  }
  // ⛔ E un evento qualunque su uno stato NULLO torna null, non un giro
  //   inventato dal nulla: solo `run_started` può creare un giro.
  assert.equal(talosResearchApply(null, { kind: 'run_paused', at: T1 }), null);
  assert.equal(talosResearchApply(null, finished('s1', T1)), null);
});

test('⭐ MIO — i dieci stati, e chi è terminale o a riposo', () => {
  // I due predicati decidono se il motore prenota lavoro: una svista qui
  // farebbe girare un giro cancellato, oppure terrebbe fermo uno vivo.
  assert.deepEqual([...TALOS_RESEARCH_TERMINAL], ['done', 'cancelled', 'failed']);

  for (const stato of ['done', 'cancelled', 'failed']) {
    assert.equal(talosResearchIsTerminal(stato), true, stato);
    assert.equal(talosResearchIsResting(stato), false, stato);
  }
  for (const stato of ['paused', 'pause_requested']) {
    assert.equal(talosResearchIsResting(stato), true, stato);
    // ⛔ A riposo NON è terminale: il giro si riprende, e confonderli
    //   butterebbe via una ricerca pagata.
    assert.equal(talosResearchIsTerminal(stato), false, stato);
  }
  for (const stato of ['planning', 'awaiting_plan_approval', 'collecting', 'synthesising', 'verifying']) {
    assert.equal(talosResearchIsTerminal(stato), false, stato);
    assert.equal(talosResearchIsResting(stato), false, stato);
  }
});

test('⭐ MIO — l\'id del passo è DERIVATO, e `workLeft` ci si appoggia', () => {
  // «Un id di passo che venisse da un contatore sarebbe un nome nuovo a ogni
  // tentativo»: qui si prova che il nome è funzione del solo ramo+tipo, e che
  // `workLeft` riconosce come fatto proprio quel nome e non un altro.
  assert.equal(talosResearchStepIdFor('b1', 'search'), 'b1:search');
  assert.equal(talosResearchStepIdFor('b1', 'search'), talosResearchStepIdFor('b1', 'search'));
  assert.notEqual(talosResearchStepIdFor('b1', 'read'), talosResearchStepIdFor('b1', 'search'));

  const run = talosResearchReplay([
    started, approved,
    { kind: 'step_started', at: T1, stepId: 'b1:search', branchId: 'b1', stepKind: 'search' },
    finished('b1:search', T2),
  ]);

  assert.deepEqual(talosResearchWorkLeft(run), []);
  // ⛔ E per un TIPO diverso il ramo è ancora da fare: «fatto» è per passo, non
  //   per ramo.
  assert.deepEqual(talosResearchWorkLeft(run, 'read').map((b) => b.id), ['b1']);
});
