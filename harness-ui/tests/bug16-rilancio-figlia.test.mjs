/*
 * ⛔⭐ BUG-16 (05/10/2026) — il rilancio post-mortem delle FIGLIE (piano §4) e le classificazioni
 * dell'esito incerto esaurito (piano §5). Il kernel ritenta da solo fino a 10 reinvii a giro; quando
 * anche quel budget è esaurito lancia PROVIDER_OUTCOME_UNKNOWN_ESAURITO. All'orchestratore:
 *  · figlia in LETTURA senza scritture né artefatti ⇒ UN rilancio: la STESSA sessione riparte
 *    (stesso childId, stessa voce, storia intatta — la cache del prefisso non si rompe);
 *  · figlia in MODIFICA, o con scritture/artefatti nell'evidenza ⇒ NESSUN rilancio, consegna onesta
 *    con `rilanciabile: false` e la ragione;
 *  · tetto: 1 rilancio per figlia, mai un ciclo.
 * La classificazione per il workflow (agent-session.classeDelFallimento) e per le ricerche
 * (research-orchestrator.classificaErroreDiCorsa) riconosce il nuovo codice.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaSubagentOrchestrator } from '../src/subagent-orchestrator.mjs';
import { classeDelFallimento } from '../src/workflow/adapters/agent-session.mjs';
import { classificaErroreDiCorsa } from '../src/research-orchestrator.mjs';

const ESAURITO = {
  ok: false, esito: null,
  erroreInterno: 'La risposta del fornitore si è interrotta e il suo esito è rimasto incerto anche dopo '
    + '10 reinvii automatici senza effetti intermedi. La richiesta può essere stata prodotta e pagata: '
    + 'riprendi esplicitamente quando vuoi continuare.',
  codiceErrore: 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO',
};
const RILANCIO = 'La risposta del fornitore si è interrotta e il suo esito è rimasto incerto: riprendi e completa il compito da dove l’hai lasciato.';

function vocePadre({ cartella = '/progetto' } = {}) {
  return { cartella, profonditaDelega: 0, conclusa: false, padreId: null, modello: null, reasoning: null, permessi: null, permessiPerAttrezzo: null };
}

/** Orchestratore con avviaESeguiFn finta: registra le chiamate, crea la voce, e consegna in modo
 *  sincrono l'esito programmato di ogni corsa (lo stesso schema dei test subagent-orchestrator). */
function orchDiProva({ sessioni, esiti = [], eventi = [], notifiche = {} }) {
  const chiamate = [];
  const ids = [];
  const conclusive = [];
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: () => true,
    avviaESeguiFn: (opzioni) => {
      chiamate.push(opzioni);
      const id = opzioni.sessionId ?? `figlio-${chiamate.length}`;
      ids.push(id);
      if (!sessioni.has(id)) sessioni.set(id, { cartella: '/p', padreId: 'padre-1', conclusa: false, eventi, messaggiFinali: [] });
      const esito = esiti[chiamate.length - 1];
      if (esito) opzioni.onConclusioneFn(esito);
      return { sessionId: id };
    },
    onFiglioConclusoFn: (payload) => conclusive.push(payload),
    ...notifiche,
  });
  return { orch, chiamate, ids, conclusive };
}
const aspettaNotifiche = () => new Promise((fatto) => setImmediate(fatto));

test('BUG16-RILANCIO-LETTURA: figlia in lettura morta con esito incerto esaurito ⇒ un rilancio della STESSA sessione, consegna che lo dichiara', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  const { orch, chiamate, ids, conclusive } = orchDiProva({
    sessioni,
    esiti: [ESAURITO, { ok: true, esito: { detto: 'fatto al secondo giro', comeFinita: 'concluso' } }],
  });
  const avvio = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'leggi il file e riassumi', modalita: 'lettura' });
  assert.equal(avvio.esito, 'avviato');
  await aspettaNotifiche();
  assert.equal(chiamate.length, 2, 'prima corsa + rilancio');
  assert.equal(chiamate[1].sessionId, ids[0], 'la ripresa torna nella STESSA sessione figlia');
  assert.equal(chiamate[1].voceEsistente, sessioni.get(ids[0]), 'stessa voce: storia e cache del prefisso intatte');
  assert.equal(chiamate[1].task, RILANCIO);
  assert.equal(chiamate[1].padreId, 'padre-1', 'il rilancio resta una figlia dello stesso padre');
  assert.equal(conclusive.length, 1);
  assert.equal(conclusive[0].risultato.esito, 'concluso');
  assert.equal(conclusive[0].risultato.rilanciata, 1);
  assert.match(conclusive[0].risultato.riassunto, /rilanciata una volta dopo un esito incerto/u);
  assert.equal(sessioni.get(ids[0]).rilanciDelega, 1);
});

test('BUG16-NIENTE-RILANCIO-MODIFICA: figlia in modifica con esito incerto ⇒ nessun rilancio, consegna onesta con rilanciabile:false', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  const { orch, chiamate, conclusive } = orchDiProva({ sessioni, esiti: [ESAURITO] });
  const avvio = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'scrivi il report', modalita: 'modifica' });
  assert.equal(avvio.esito, 'avviato');
  await aspettaNotifiche();
  assert.equal(chiamate.length, 1, 'una figlia che poteva scrivere non si rilancia mai');
  assert.equal(conclusive.length, 1);
  assert.equal(conclusive[0].risultato.esito, 'fallito');
  assert.equal(conclusive[0].risultato.rilanciabile, false);
  assert.match(conclusive[0].risultato.motivoRilancio, /lettura pura/u);
  assert.match(conclusive[0].risultato.motivo, /10 reinvii automatici/u, 'il messaggio del kernel arriva onesto alla madre');
  assert.equal(conclusive[0].risultato.rilanciata, undefined);
});

test('BUG16-RILANCIO-BLOCCATO-DA-SCRITTURE: figlia in lettura ma con scritture nell\'evidenza ⇒ nessun rilancio', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  const { orch, chiamate, conclusive } = orchDiProva({
    sessioni,
    esiti: [ESAURITO],
    eventi: [{ type: 'StateDelta', delta: [{ path: '/file/a.txt', change: 'add' }] }],
  });
  await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'leggi e riassumi', modalita: 'lettura' });
  await aspettaNotifiche();
  assert.equal(chiamate.length, 1, 'una scrittura è un effetto reale: il reinvio non è sicuro');
  assert.equal(conclusive[0].risultato.esito, 'fallito');
  assert.equal(conclusive[0].risultato.rilanciabile, false);
});

test('BUG16-TETTO-UNO: anche la figlia rilanciata muore con esito incerto ⇒ nessun terzo giro, tetto detto nella consegna', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  const { orch, chiamate, conclusive } = orchDiProva({ sessioni, esiti: [ESAURITO, ESAURITO] });
  await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'leggi il file e riassumi', modalita: 'lettura' });
  await aspettaNotifiche();
  assert.equal(chiamate.length, 2, 'il tetto è UN rilancio, mai un ciclo');
  assert.equal(conclusive[0].risultato.esito, 'fallito');
  assert.equal(conclusive[0].risultato.rilanciata, 1);
  assert.equal(conclusive[0].risultato.rilanciabile, false);
  assert.match(conclusive[0].risultato.motivoRilancio, /tetto/u);
  assert.match(conclusive[0].risultato.motivo, /rilanciata una volta dopo un esito incerto/u);
});

test('BUG16-RILANCIO-SOLO-ESAURITO: un esito incerto SENZA cap esaurito non tocca all\'orchestratore (già gestito dal kernel)', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  const { orch, chiamate } = orchDiProva({
    sessioni,
    esiti: [{ ok: false, esito: null, erroreInterno: 'La risposta del fornitore si è interrotta e l’esito della richiesta è incerto.', codiceErrore: 'PROVIDER_OUTCOME_UNKNOWN' }],
  });
  await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'leggi il file e riassumi', modalita: 'lettura' });
  await aspettaNotifiche();
  assert.equal(chiamate.length, 1, 'solo _ESAURITO apre il rilancio post-mortem');
});

test('BUG16-CLASSI: _ESAURITO è transitorio di rete ritentabile per il passo workflow; UNKNOWN resta internal; le ricerche dicono esito-incerto', () => {
  assert.deepEqual(
    classeDelFallimento({ codiceErrore: 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO', classeErrore: 'traffico' }),
    { errorClass: 'transient_network', retryable: true },
    'senza il mapping esplicito erediterebbe traffico e maschererebbe da rate_limit',
  );
  assert.deepEqual(
    classeDelFallimento({ codiceErrore: 'PROVIDER_OUTCOME_UNKNOWN', classeErrore: 'esito-incerto' }),
    { errorClass: 'internal', retryable: false },
    'con effetti già prodotti il passo non si rifà',
  );
  assert.equal(classificaErroreDiCorsa({ codice: 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO' }).classe, 'esito-incerto');
});

test('BUG16-RILANCIO-AVVIO-RIFIUTATO: l\'avvio del rilancio è rifiutato ⇒ retrocessione del contatore, consegna che dice la verità (RISERVA-2.1 della review gen.2)', async () => {
  // (a) voce presente: il rifiuto dell'avvio retrocede il contatore e la consegna è onesta.
  {
    const sessioni = new Map([['padre-1', vocePadre()]]);
    const chiamate = [];
    const ids = [];
    const conclusive = [];
    const creazioni = [];
    const orch = creaSubagentOrchestrator({
      sessioni,
      cartellaEsisteFn: () => true,
      avviaESeguiFn: (opzioni) => {
        chiamate.push(opzioni);
        const id = opzioni.sessionId ?? `figlio-${chiamate.length}`;
        ids.push(id);
        if (!sessioni.has(id)) sessioni.set(id, { cartella: '/p', padreId: 'padre-1', conclusa: false, eventi: [], messaggiFinali: [] });
        if (chiamate.length === 1) opzioni.onConclusioneFn(ESAURITO);
        return chiamate.length === 1
          ? { sessionId: id }
          : { erroreAvvio: 'session-deleted: la voce della figlia è stata cancellata a metà corsa' };
      },
      onFiglioCreatoFn: (payload) => creazioni.push(payload),
      onFiglioConclusoFn: (payload) => conclusive.push(payload),
    });
    const avvio = await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'leggi il file e riassumi', modalita: 'lettura' });
    assert.equal(avvio.esito, 'avviato');
    await aspettaNotifiche();
    assert.equal(chiamate.length, 2, 'il rilancio è stato TENTATO: prima corsa, poi avvio rifiutato');
    const voce = sessioni.get(ids[0]);
    assert.equal(voce.rilanciDelega, 0, 'la retrocessione riporta il contatore a 0: il tetto NON è consumato');
    assert.equal(conclusive.length, 1, 'una sola consegna: la prima verità, com\'è');
    const esito = conclusive[0].risultato;
    assert.equal(esito.esito, 'fallito');
    assert.equal(esito.rilanciata, undefined, 'nessun rilancio è mai partito: la consegna non può dire «rilanciata»');
    assert.equal(esito.rilanciabile, false);
    assert.match(esito.motivoRilancio, /il rilancio non è partito: session-deleted/u, 'motivo onesto, col motivo del rifiuto');
    assert.match(esito.motivo, /10 reinvii automatici/u, 'il messaggio del kernel arriva onesto alla madre');
    assert.equal(creazioni.filter((n) => n.rilanciata).length, 0, 'nessuna notifica «figlia rilanciata»: non è mai partita');
  }
  // (b) voce assente dalla mappa (cancellata a metà corsa): la consegna onesta arriva comunque, nessun crash.
  {
    const sessioni = new Map([['padre-1', vocePadre()]]);
    const chiamate = [];
    const conclusive = [];
    const orch = creaSubagentOrchestrator({
      sessioni,
      cartellaEsisteFn: () => true,
      avviaESeguiFn: (opzioni) => {
        chiamate.push(opzioni);
        const id = opzioni.sessionId ?? `figlio-${chiamate.length}`;
        if (chiamate.length > 1 && !sessioni.has(id)) sessioni.set(id, { cartella: '/p', padreId: 'padre-1', conclusa: false, eventi: [], messaggiFinali: [] });
        if (chiamate.length === 1) opzioni.onConclusioneFn(ESAURITO);
        return chiamate.length === 1 ? { sessionId: id } : { erroreAvvio: 'provider-not-ready' };
      },
      onFiglioConclusoFn: (payload) => conclusive.push(payload),
    });
    await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'leggi il file e riassumi', modalita: 'lettura' });
    await aspettaNotifiche();
    assert.equal(chiamate.length, 2, 'senza voce l\'evidenza è nulla ⇒ zero effetti ⇒ il rilancio viene comunque tentato');
    assert.equal(conclusive.length, 1, 'la consegna onesta arriva comunque');
    const esito = conclusive[0].risultato;
    assert.equal(esito.esito, 'fallito');
    assert.equal(esito.rilanciata, undefined);
    assert.equal(esito.rilanciabile, false);
    assert.match(esito.motivoRilancio, /il rilancio non è partito: provider-not-ready/u);
  }
});
