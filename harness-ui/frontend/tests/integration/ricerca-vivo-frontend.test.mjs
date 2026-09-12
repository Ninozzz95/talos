import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpApp } from '../../../src/http-app.mjs';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { cartellaDellaRicerca } from '../../../src/research-store.mjs';
import { servizioRicerche } from '../../src/components/sezioni-adattatori.js';
import { vociMenuRicerca, paroleErroreRicerca, ricercheInCorso } from '../../src/components/ricerca-dettaglio.js';

/*
 * ⭐⭐⭐ IL BANCO DELLE AZIONI DELLA RICERCA APPROFONDITA — 12/09/2026, lotto L5 lato sezione.
 *
 * ⛔ PERCHÉ ESISTE, quando le rotte hanno già i loro diciassette test lato backend: quelli provano
 *   che il SERVER risponde bene a richieste scritte a mano nel test. Qui gli indirizzi li compone
 *   la porta VERA del frontend (`servizioRicerche`), le voci di menu le decide il codice VERO della
 *   sezione (`vociMenuRicerca`) sugli stati che il server manda davvero, e le frasi d'errore
 *   escono da `paroleErroreRicerca` sul `code` vero della busta. È la prova di PARITÀ fra le due
 *   metà: un percorso sbagliato, un corpo che la rotta rifiuta, una voce di menu offerta in uno
 *   stato in cui il server dice 409 — niente di tutto questo si vedrebbe provando le due metà
 *   separatamente.
 *
 * ⛔ SERVER VERO su porta libera, REGISTRO VERO, magazzini su disco TEMPORANEO. ⛔ Mai la 4174
 *   (l'istanza dell'owner), mai un giro col modello: `avviaSessioneFn` è finto e non tocca la rete,
 *   e `leggiPaginaFn` è iniettata — senza, la ri-verifica uscirebbe DAVVERO in rete dalla macchina
 *   che esegue la suite, cioè misurerebbe l'ambiente invece dell'oggetto.
 * ⛔ E la ricerca la avvia `onRicercaAvvia`, la stessa porta da cui la avvia il modello con
 *   `research_start`: senza, questo banco non direbbe niente sulla sessione figlia né sul giornale.
 */

const DOMANDA = 'Come stanno evolvendo gli harness agentici desktop nel 2026';

/** La rete della app: la stessa forma di `apiScrivi`/`apiGet` in `src/legacy/app.js`. */
function reteSu(base) {
  async function manda(metodo, percorso, corpo) {
    const risposta = await fetch(`${base}${percorso}`, {
      method: metodo,
      headers: { Accept: 'application/json', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    const busta = await risposta.json();
    if (!risposta.ok || !busta?.ok) {
      /* ⛔ Il `.code` è l'unica parte VERA che esce da un 400/404/409: `public-problem.mjs`
         riscrive il messaggio. Se questo banco lo scartasse, proverebbe una rete che non esiste. */
      const errore = new Error(busta?.error?.message || 'Richiesta locale non riuscita');
      errore.code = busta?.error?.code || 'INTERNAL_ERROR';
      errore.stato = risposta.status;
      throw errore;
    }
    return busta.data;
  }
  return {
    post: (p, c) => manda('POST', p, c),
    patch: (p, c) => manda('PATCH', p, c),
    elimina: (p) => manda('DELETE', p),
    leggi: (p) => manda('GET', p),
    elenca: (p) => manda('GET', p),
  };
}

async function banco(t, { leggiPaginaFn = async () => ({ url: '', stato: 200, corpo: '' }) } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-ric-fe-'));
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-ric-fe-store-'));
  t.after(() => {
    rmSync(radice, { recursive: true, force: true });
    rmSync(cartellaStore, { recursive: true, force: true });
  });
  const avvii = [];
  const chiusure = new Map();
  const registro = createSessionRegistry({
    cartellaStore,
    guardaWorkspaceFn: () => () => {},
    cartelleProgetto: [{ id: '0', percorso: radice, nome: 'progetto' }],
    preparaEsecuzioneLiberaFn: () => ({ cartella: radice, comandoProva: null, task: { id: 'libero', consegna: 'lavora' } }),
    cartellaEsisteFn: () => true,
    modello: 'm',
    chiave: 'k',
    leggiPaginaFn: (url) => leggiPaginaFn(url),
    avviaSessioneFn: (input) => {
      avvii.push(input);
      if (!input?.task?.ricercaId) return new Promise(() => {});
      return new Promise((risolvi) => {
        /* ⛔ `RunFinished` PRIMA di risolvere: è l'EVENTO — non il ritorno della promessa — a
           segnare `voce.conclusa`. Un banco che non lo riproduce misura un prodotto che non c'è. */
        const chiudi = (risultato) => {
          input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
          risolvi(risultato);
        };
        chiusure.set(input.task.ricercaId, chiudi);
        input.segnaleStop.addEventListener('abort', () => chiudi({ ok: true, esito: { comeFinita: 'interrotto', messaggiFinali: null } }), { once: true });
      });
    },
  });
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry: registro,
  });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { radice, registro, base, rete: reteSu(base), avvii, chiusure };
}

/** Avvia una sessione madre e, da dentro, una ricerca vera con la porta del modello. */
async function conRicercaViva(b) {
  const avvio = b.registro.avviaLibero({ cartellaId: '0', consegna: 'lavora' });
  assert.ok(avvio.sessionId, 'la sessione madre deve partire');
  const madre = b.avvii.find((i) => !i?.task?.ricercaId);
  const esito = await madre.onRicercaAvvia({ question: DOMANDA, depth: 'deep' });
  assert.equal(esito.ok, true, esito.esito);
  return { sessionId: avvio.sessionId, ricercaId: esito.id };
}

/**
 * ⛔⛔ SI ASPETTA UNA CONDIZIONE, MAI UN NUMERO DI MILLISECONDI: un'attesa a tempo misura quanto
 *   era carica la macchina, non l'oggetto. (Stessa scelta, e stessa ragione, del banco di L5.)
 */
async function finoA(condizione, cosa, limite = 5_000) {
  const scadenza = Date.now() + limite;
  for (;;) {
    const visto = await condizione();
    if (visto) return visto;
    if (Date.now() > scadenza) throw new assert.AssertionError({ message: `mai arrivato: ${cosa}` });
    await new Promise((r) => setTimeout(r, 10));
  }
}

/* ═══════════════════════════════════════════════════════ IL GIRO INTERO, COME LO FA LA SEZIONE */

test('BANCO-RICERCA: pausa → ripresa → ri-verifica → elimina, con la porta VERA della sezione', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);
  const s = servizioRicerche({ sessionId, rete: b.rete });
  assert.ok(s, 'con sessione e rete la porta esiste');

  /* ---- 0. L'ELENCO, che è quello che la sezione disegna ---- */
  const elenco = await b.rete.elenca(`/api/v1/sessions/${sessionId}/research`);
  assert.equal(elenco.totale, 1);
  const viva = elenco.ricerche[0];
  assert.equal(viva.stato, 'running');
  assert.equal(viva.padreId, sessionId, 'la ricerca sa da quale conversazione è partita');
  // ⛔ L'orologio della sezione si accende su QUESTO elenco: è la condizione vera, non una finta.
  assert.equal(ricercheInCorso(elenco.ricerche).length, 1);

  /* ---- 1. IL MENU su una ricerca viva: solo pausa (+ elimina) ---- */
  const iniezioni = { onPausa: () => {}, onRiprendi: () => {}, onRiverifica: () => {}, onElimina: () => {} };
  assert.deepEqual(vociMenuRicerca(viva, iniezioni).map((v) => v.chiave), ['pausa', 'elimina'],
    'sullo stato che il SERVER manda, la sezione offre esattamente la pausa');

  /* ---- 2. PAUSA: la risposta è la voce aggiornata, e al punto sicuro lo stato cambia ---- */
  const dopoPausa = await s.pausa(ricercaId);
  assert.ok(dopoPausa.ricerca, 'la risposta porta la voce aggiornata (contratto §4.3)');
  assert.equal(dopoPausa.ricerca.id, ricercaId);
  const ferma = await finoA(async () => {
    const r = (await s.leggi(ricercaId)).ricerca;
    return r.stato === 'paused' ? r : null;
  }, 'il punto sicuro della pausa');
  assert.equal(ferma.conclusaAlle, null, 'una pausa non finalizza niente');
  assert.equal(ferma.giornale.stato, 'paused');

  /* ---- 3. IL MENU si è ROVESCIATO da solo: adesso c'è «Riprendi» e non più «Metti in pausa» ---- */
  assert.deepEqual(vociMenuRicerca(ferma, iniezioni).map((v) => v.chiave), ['ripresa', 'elimina']);

  /* ---- 4. PAUSA di nuovo → 409, e la sezione lo dice con la frase della PAUSA ---- */
  await assert.rejects(() => s.pausa(ricercaId), (errore) => {
    assert.equal(errore.stato, 409);
    assert.equal(errore.code, 'RESEARCH_CONFLICT');
    assert.match(paroleErroreRicerca(errore.code, 'pausa'), /^Non sta girando/);
    return true;
  });

  /* ---- 5. RIPRESA: riparte davvero, e la sessione figlia viene riavviata ---- */
  const avviiPrima = b.avvii.length;
  const dopoRipresa = await s.ripresa(ricercaId);
  assert.ok(dopoRipresa.ricerca);
  assert.equal(b.avvii.length, avviiPrima + 1, 'la ricerca riparte per davvero, non solo sulla carta');
  assert.ok(b.avvii.at(-1).messaggiIniziali[0].content.includes(DOMANDA), 'la consegna di ripresa porta la domanda');

  /* ---- 6. RI-VERIFICA su una ricerca senza rapporto → 409 ONESTO, con la frase giusta ---- */
  await assert.rejects(() => s.riverifica(ricercaId), (errore) => {
    assert.equal(errore.stato, 409);
    assert.equal(errore.code, 'RESEARCH_RECHECK_UNAVAILABLE');
    assert.match(paroleErroreRicerca(errore.code, 'riverifica'), /passaggi citati/);
    /* ⛔ E la frase del 409 della ri-verifica NON è quella del 409 della pausa: due «no» diversi
       si leggono diversi, o la persona non sa che cosa è successo. */
    assert.notEqual(paroleErroreRicerca(errore.code, 'riverifica'), paroleErroreRicerca('RESEARCH_CONFLICT', 'pausa'));
    return true;
  });

  /* ---- 7. ELIMINA: la cartella sparisce DAVVERO dal disco ---- */
  const cartella = cartellaDellaRicerca(b.radice, ricercaId);
  assert.equal(existsSync(cartella), true, 'prima c’era');
  const eliminata = await s.elimina(ricercaId);
  assert.equal(eliminata.eliminata, true);
  assert.equal(existsSync(cartella), false, 'e adesso non c’è più: la conferma diceva il vero');
  assert.equal((await b.rete.elenca(`/api/v1/sessions/${sessionId}/research`)).totale, 0);

  /* ---- 8. IL VERSO CONTRARIO: una seconda eliminazione è un 404, non un «fatto» ---- */
  await assert.rejects(() => s.elimina(ricercaId), (errore) => {
    assert.equal(errore.stato, 404);
    assert.equal(errore.code, 'RESEARCH_NOT_FOUND');
    assert.match(paroleErroreRicerca(errore.code, 'elimina'), /non c’è più/);
    return true;
  });
});

test('BANCO-RICERCA: la porta non esiste senza sessione o senza rete — e il menu resta di sola lettura', async (t) => {
  const b = await banco(t);
  assert.equal(servizioRicerche({ sessionId: null, rete: b.rete }), null);
  assert.equal(servizioRicerche({ sessionId: 's', rete: {} }), null);
  assert.equal(servizioRicerche({ sessionId: 's', rete: { post: () => {} } }), null, 'serve anche la DELETE');
  assert.ok(servizioRicerche({ sessionId: 's', rete: b.rete }));
  /* ⛔ Senza porta la sezione NON disegna i comandi: è la stessa regola della riga di Libreria. */
  assert.deepEqual(vociMenuRicerca({ id: 'r', domanda: 'D', stato: 'running' }, {}).map((v) => v.chiave), []);
});

test('BANCO-RICERCA: gli indirizzi li compone la porta, e la rotta li accetta tutti e cinque', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);
  /*
   * ⛔ Il valore di questo test è il 405/404 che NON arriva: se `servizioRicerche` scrivesse
   *   `/pause` invece di `/pausa`, o dimenticasse `research`, ogni chiamata cadrebbe fuori
   *   dall'inventario delle rotte e nessun test di unità se ne accorgerebbe.
   * ⛔ E il corpo: le tre azioni mandano `{}`, che la rotta dichiara lecito. Qualunque chiave in
   *   più è un 400 — provato qui sotto, perché una porta che mandasse `{forza:true}` fallirebbe
   *   solo in produzione.
   */
  const s = servizioRicerche({ sessionId, rete: b.rete });
  assert.ok((await s.leggi(ricercaId)).ricerca, 'GET della voce');
  assert.ok((await s.pausa(ricercaId)).ricerca, 'POST pausa');
  await finoA(async () => (await s.leggi(ricercaId)).ricerca.stato === 'paused', 'il punto sicuro');
  assert.ok((await s.ripresa(ricercaId)).ricerca, 'POST ripresa');
  await assert.rejects(() => s.riverifica(ricercaId), (e) => e.stato === 409, 'POST riverifica arriva (e risponde 409 onesto)');

  // ⛔ IL VERSO CONTRARIO: un corpo con una chiave viene rifiutato, e la pausa NON avviene.
  const conChiave = await fetch(`${b.base}/api/v1/sessions/${sessionId}/research/${ricercaId}/pausa`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forza: true }),
  });
  assert.equal(conChiave.status, 400);
  assert.ok((await s.leggi(ricercaId)).ricerca.stato !== 'paused', 'un rifiuto dopo l’effetto non sarebbe un rifiuto');
});
