import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import {
  cartellaDellaRicerca, creaRicerca, elencaRicerche, leggiRicerca, percorsoVoceLegacy, scriviRapporto,
} from '../src/research-store.mjs';
import { talosResearchReportDocument } from '../src/research/report.mjs';

/*
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * L5 (12/09/2026) — LE ROTTE DELLA RICERCA APPROFONDITA, DALLA PORTA VERA
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ Server VERO su una porta libera, registro VERO (`createSessionRegistry`), magazzino VERO su
 *   un disco TEMPORANEO. Mai la 4174, mai i dati dell'owner, mai un giro col modello: la sessione
 *   la fa partire un `avviaSessioneFn` finto che non chiama nessuna rete.
 * ⛔ E la ricerca la avvia `onRicercaAvvia`, cioè ESATTAMENTE la porta da cui la avvia il modello
 *   con `research_start` — non `creaRicerca` a mano. È la differenza fra provare che le rotte
 *   parlano con QUALCOSA e provare che parlano con la stessa cosa che usa il modello: senza,
 *   nessuno di questi test direbbe niente sulla sessione figlia, sul giornale, sulla ripresa.
 * ⛔ `leggiPaginaFn` è iniettata in ogni banco: senza, la prova della ri-verifica uscirebbe in
 *   RETE dalla macchina che esegue la suite — misurare l'ambiente invece dell'oggetto.
 */

const DOMANDA = 'Come stanno evolvendo gli harness agentici desktop nel 2026';

/** Un rapporto col record recintato, scritto dallo scrittore VERO del motore (mai una stringa a mano). */
function rapportoRecintato({ passaggio = 'gli harness convergono sul controllo del computer', fonti = 1 } = {}) {
  return talosResearchReportDocument({
    question: DOMANDA,
    summary: 'Convergono su controllo del computer, permessi per attrezzo e memoria persistente.',
    judge: null,
    claims: Array.from({ length: fonti }, (_v, i) => ({
      claim: { text: `Affermazione ${i + 1}.`, sourceIndex: i + 1, quote: 'q' },
      passage: passaggio,
      checks: { claimSupported: 'unchecked' },
    })),
    sources: Array.from({ length: fonti }, (_v, i) => ({
      url: `https://esempio.invalid/fonte-${i + 1}`, title: `Fonte ${i + 1}`, publishedAt: null, obtained: 'page',
    })),
  });
}

/**
 * Il banco: due cartelle temporanee (il progetto e lo store delle sessioni), un registro vero,
 * un server vero. `avvii` raccoglie ogni chiamata ad `avviaSessioneFn`, che è come si osserva
 * dall'esterno se una sessione è davvero ripartita.
 */
async function banco(t, { leggiPaginaFn = async () => ({ url: '', stato: 200, corpo: '' }) } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-l5-'));
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-l5-store-'));
  t.after(() => {
    rmSync(radice, { recursive: true, force: true });
    rmSync(cartellaStore, { recursive: true, force: true });
  });
  const stato = { radice, cartellaStore, leggiPaginaFn, avvii: [], chiusure: new Map() };
  const registro = creaRegistro(stato);
  const base = await servi(t, registro);
  return { ...stato, registro, base, riavvia: async () => {
    /*
     * ⛔ IL RIAVVIO VERO, non un `sessioni.clear()`: un registro NUOVO sullo STESSO disco, che
     *   ripopola le sue sessioni da `cartellaStore` — cioè con `interrotta:true` e
     *   `messaggiFinali:null`, che è esattamente lo stato in cui `riprendi()` deve cadere sulla
     *   via B (il giornale) invece che sulla via A (la conversazione in memoria).
     */
    const nuovo = creaRegistro(stato);
    await nuovo.ripristina();
    return { registro: nuovo, base: await servi(t, nuovo) };
  } };
}

function creaRegistro(stato) {
  return createSessionRegistryReale({
    cartellaStore: stato.cartellaStore,
    guardaWorkspaceFn: () => () => {},
    cartelleProgetto: [{ id: '0', percorso: stato.radice, nome: 'progetto' }],
    preparaEsecuzioneLiberaFn: () => ({ cartella: stato.radice, comandoProva: null, task: { id: 'libero', consegna: 'lavora' } }),
    cartellaEsisteFn: () => true,
    modello: 'm',
    chiave: 'k',
    leggiPaginaFn: (url) => stato.leggiPaginaFn(url),
    avviaSessioneFn: (input) => {
      stato.avvii.push(input);
      /*
       * ⛔ La sessione della RICERCA si può concludere: è ciò che rende osservabile il cancello
       *   di consegna (`onConclusioneRicerca`) senza un modello. La madre invece resta viva per
       *   sempre, come una chat aperta.
       * ⛔⛔ E la conclusione emette `RunFinished` PRIMA di risolvere, perché è l'EVENTO — non il
       *   ritorno della promessa — a segnare `voce.conclusa` (`session-registry.mjs`: «if
       *   (evento.type === 'RunFinished' || 'RunError') voce.conclusa = true»). Trovato
       *   provandolo: senza l'evento, una ricerca messa in pausa restava «running» a schermo pur
       *   avendo `run_paused` nel giornale. Un banco che non riproduce l'evento misurerebbe un
       *   prodotto che non esiste.
       */
      if (!input?.task?.ricercaId) return new Promise(() => {});
      return new Promise((risolvi) => {
        const chiudi = (risultato) => {
          input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
          risolvi(risultato);
        };
        stato.chiusure.set(input.task.ricercaId, chiudi);
        input.segnaleStop.addEventListener('abort', () => chiudi({ ok: true, esito: { comeFinita: 'interrotto', messaggiFinali: null } }), { once: true });
      });
    },
  });
}

async function servi(t, registro) {
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry: registro,
  });
  const server = createServer(app);
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  return `http://127.0.0.1:${server.address().port}`;
}

const chiama = (base, percorso, metodo = 'GET', corpo) => fetch(`${base}${percorso}`, {
  method: metodo,
  ...(corpo === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }),
});

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
 * ⛔⛔ SI ASPETTA UNA CONDIZIONE, MAI UN NUMERO DI MILLISECONDI. La prima stesura di questo file
 *   dormiva 60 ms e passava — finché la suite intera non l'ha eseguito sotto carico, e allora una
 *   conclusione non ancora scritta ha fatto leggere «paused» dove ci si aspettava
 *   «senza-rapporto». Un'attesa a tempo non misura l'oggetto: misura quanto era carica la
 *   macchina. Qui si guarda la cosa vera, ogni 10 ms, e si fallisce dicendo cosa si è visto.
 */
async function finoA(condizione, cosa, limite = 5_000) {
  const scadenza = Date.now() + limite;
  let ultimo;
  for (;;) {
    ultimo = await condizione();
    if (ultimo) return ultimo;
    if (Date.now() > scadenza) throw new assert.AssertionError({ message: `mai arrivato: ${cosa}` });
    await new Promise((risolvi) => setTimeout(risolvi, 10));
  }
}

/** La scheda della ricerca, letta dalla rotta vera. */
const dettaglio = async (b, sessionId, ricercaId) => (await (await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}`)).json()).data.ricerca;

/** La ricerca finisce come finisce una vera: `RunFinished`, poi l'esito che il cancello giudica. */
async function concludi(b, sessionId, ricercaId, comeFinita = 'concluso', ultimo = 'Ho depositato il rapporto.') {
  b.chiusure.get(ricercaId)({ ok: true, esito: { comeFinita, messaggiFinali: [{ role: 'assistant', content: ultimo }] } });
  return finoA(async () => {
    const r = await dettaglio(b, sessionId, ricercaId);
    return r.conclusaAlle ? r : null;
  }, 'la conclusione scritta sul disco');
}

/* ───────────────────────────── 1. I METODI E L'INVENTARIO ───────────────────────────── */

test('⭐⭐⭐ L5 — le due rotte nuove dichiarano i metodi VERI, e il 405 porta l\'Allow esatto', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);
  const voce = `/api/v1/sessions/${sessionId}/research/${ricercaId}`;

  const postSullaVoce = await chiama(b.base, voce, 'POST', {});
  assert.equal(postSullaVoce.status, 405, 'la voce non si crea con una POST: si crea dalla chat');
  assert.deepEqual(
    postSullaVoce.headers.get('allow').split(', ').sort(),
    ['DELETE', 'GET', 'HEAD'],
    '⛔ l\'Allow dice i metodi di QUESTA rotta, non l\'unione di quelli della famiglia',
  );

  const getSullAzione = await chiama(b.base, `${voce}/pausa`);
  assert.equal(getSullAzione.status, 405, 'un\'azione non si legge');
  assert.equal(getSullAzione.headers.get('allow'), 'POST');

  const inventata = await chiama(b.base, `${voce}/spegni`, 'POST');
  assert.equal(inventata.status, 404, '⛔ una rotta che non esiste è 404, non 405: la porta non c\'è, non è chiusa');
});

/* ────────────────────────── 2. LE TRE ASSENZE, TRE RISPOSTE ────────────────────────── */

test('⛔⛔⛔ L5 — «la sessione non c\'è» e «la ricerca non c\'è» sono due 404 DIVERSI', async (t) => {
  const b = await banco(t);
  const { sessionId } = await conRicercaViva(b);

  const sessioneIgnota = await chiama(b.base, '/api/v1/sessions/mai-vista/research/qualunque');
  assert.equal(sessioneIgnota.status, 404);
  assert.equal((await sessioneIgnota.json()).error.code, 'NOT_FOUND');

  const ricercaIgnota = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/mai-fatta`);
  assert.equal(ricercaIgnota.status, 404);
  const problema = (await ricercaIgnota.json()).error;
  assert.equal(problema.code, 'RESEARCH_NOT_FOUND', '⛔ una risposta che non le distingue manda a cercare nel posto sbagliato');
  /*
   * ⛔⛔ LA VORAGINE DI O-49, provata invece che ricordata: un codice senza una voce in
   *   `public-problem.mjs` cade sulla copia di INTERNAL_ERROR, e a schermo una ricerca appena
   *   cancellata diventa «Si è verificato un problema imprevisto · Apri Doctor» — falso due
   *   volte. La prima stesura di questa rotta faceva esattamente questo: si vede solo
   *   interrogando la rotta vera.
   */
  assert.equal(problema.message, 'Questa ricerca non esiste più');
  assert.equal(problema.title, 'Ricerca non trovata');
  assert.doesNotMatch(problema.explanation, /imprevisto/, '⛔ non è imprevisto, ed è l’unica cosa che Doctor non può spiegare');

  for (const azione of ['pausa', 'ripresa', 'riverifica']) {
    const risposta = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/mai-fatta/${azione}`, 'POST');
    assert.equal(risposta.status, 404, `${azione} su una ricerca inesistente`);
    assert.equal((await risposta.json()).error.code, 'RESEARCH_NOT_FOUND');
  }
  const cancellata = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/mai-fatta`, 'DELETE');
  assert.equal(cancellata.status, 404);
  assert.equal((await cancellata.json()).error.code, 'RESEARCH_NOT_FOUND');
});

test('⛔⛔ L5, VERSO CONTRARIO — un id che potrebbe attraversare una cartella è 400 PRIMA di toccare il disco', async (t) => {
  const b = await banco(t);
  const { sessionId } = await conRicercaViva(b);
  /*
   * ⛔ `%2E%2E` da SOLO non è in questo elenco, e il motivo è un fatto misurato provandolo: un
   *   segmento che è *interamente* un punto o due punti — anche percent-codificato — viene
   *   risolto dalla normalizzazione WHATWG del percorso PRIMA che il server lo veda, quindi
   *   l'indirizzo che arriva qui non nomina più nessuna ricerca e la risposta giusta è 404.
   *   Metterlo fra i 400 avrebbe preteso dalla rotta una difesa che non le compete.
   *   Quelli qui sotto invece arrivano interi, ed è `decodeURIComponent` a svelarli.
   */
  for (const ostile of ['a%2Fb', 'C%3A%5CWindows', 'ric.1', '%2E%2E%2Ffuori', 'x'.repeat(65)]) {
    const risposta = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ostile}`);
    assert.equal(risposta.status, 400, `${ostile} non deve arrivare al magazzino`);
    assert.equal((await risposta.json()).error.code, 'RESEARCH_INVALID');
  }
  assert.equal(existsSync(join(b.radice, '..', 'meta.json')), false, 'e niente è stato letto o scritto fuori');
});

test('⛔⛔ L5 — corpo con una chiave non ammessa: 400, e la chiave viene NOMINATA (l\'azione non avviene)', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);
  const risposta = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/pausa`, 'POST', { forza: true });
  assert.equal(risposta.status, 400);
  const corpo = await risposta.json();
  assert.equal(corpo.error.code, 'QUERY_INVALID');

  // ⛔ E la pausa NON è avvenuta: un rifiuto dopo l'effetto non è un rifiuto.
  const dopo = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}`);
  assert.equal((await dopo.json()).data.ricerca.stato, 'running');

  const conQuery = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}?davvero=1`, 'POST');
  assert.equal(conQuery.status, 405, 'la query non salva una POST sulla voce');
  const getConQuery = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}?davvero=1`);
  assert.equal(getConQuery.status, 400);
  assert.equal((await getConQuery.json()).error.code, 'QUERY_INVALID');
});

/* ─────────────────────── 3. ELENCO E DETTAGLIO — IL CONTRATTO ─────────────────────── */

test('⭐⭐⭐⭐ L5 — ELENCO: i campi del contratto c\'erano già, quello che mancava era `totale` (e da L8 sono quindici: c\'è anche `modello`)', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);

  const risposta = await chiama(b.base, `/api/v1/sessions/${sessionId}/research`);
  assert.equal(risposta.status, 200);
  const dati = (await risposta.json()).data;
  assert.equal(dati.totale, 1, '⛔ la pagina è tagliata a 20: senza `totale` nessuno saprebbe che ne mancano');
  assert.equal(dati.errore, null);
  assert.equal(dati.ricerche.length, 1);
  assert.deepEqual(
    Object.keys(dati.ricerche[0]).sort(),
    ['avviataAlle', 'bilancio', 'conclusaAlle', 'domanda', 'id', 'modello', 'modelloGiudice', 'motivo', 'nome', 'padreId', 'proveDistinte', 'question', 'reportLibraryId', 'stato', 'titolo', 'ultimoMessaggio'],
    /*
     * ⛔ Il contratto a SEDICI campi: quattordici di L4, `modello` (L8) e `modelloGiudice`
     *   (L9, 12/09/2026) — chi è stato SCELTO a giudicare questa corsa, che è un fatto diverso
     *   da chi ha giudicato davvero (quello sta nel record del rapporto, campo `giudice`).
     *   Il test è diventato ROSSO quando è cresciuto, che è esattamente il suo mestiere — una
     *   crescita che scivola dentro in silenzio è un frontend che si rompe più tardi, altrove.
     */
    '⛔ il contratto della rotta, verificato e non duplicato: se cresce, questo test diventa rosso invece di divergere in silenzio',
  );
  assert.equal(dati.ricerche[0].id, ricercaId);
  assert.equal(dati.ricerche[0].padreId, sessionId, '§6.6 — la ricerca è figlia della chat che l\'ha ordinata');
  assert.equal(dati.ricerche[0].bilancio, null, '⛔ `null` e «tutto a zero» non sono la stessa cosa su una ricerca mai misurata');
});

test('⭐⭐⭐⭐ L5 — DETTAGLIO: piano, passi, spesa, giornale, e le affermazioni GIÀ STRUTTURATE (non un markdown da ri-parsare)', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);
  // Il deposito (`research_deposit`) e poi la conclusione: è l'ordine vero di una corsa che consegna.
  await scriviRapporto({ cartella: b.radice, id: ricercaId, testo: rapportoRecintato({ fonti: 2 }) });
  await concludi(b, sessionId, ricercaId);

  const risposta = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}`);
  assert.equal(risposta.status, 200);
  const ricerca = (await risposta.json()).data.ricerca;

  assert.equal(ricerca.stato, 'done', 'un rapporto col record recintato passa il cancello');
  assert.equal(ricerca.motivo, null);
  assert.equal(ricerca.contenutoRespinto, null);
  assert.match(ricerca.contenutoRapporto, /talos-research-report/);
  assert.deepEqual(ricerca.bilancio, { totali: 2, sostenute: 0, inParte: 0, nonSostenute: 0, contese: 0, nonVerificate: 2 });
  assert.equal(ricerca.proveDistinte, 2);

  assert.equal(ricerca.affermazioni.length, 2);
  assert.equal(ricerca.affermazioni[0].verdettoUmano, 'non verificata', '⛔ la parola esce da `talosResearchSupportLabel`: due frasari sono due verdetti');
  assert.equal(ricerca.affermazioni[0].giudice, null, '⛔ un modello non timbra sé stesso');
  assert.equal(ricerca.affermazioni[0].contrarie, null, '⛔ «non guardato» non è «guardato, nessuna»');
  assert.match(ricerca.affermazioni[0].passaggio, /controllo del computer/);
  assert.deepEqual(ricerca.fonti.map((f) => f.url), ['https://esempio.invalid/fonte-1', 'https://esempio.invalid/fonte-2']);
  assert.equal(ricerca.fonti[0].ottenuta, 'page');
  assert.equal(ricerca.giudice, null);

  /*
   * ⭐⭐⭐⭐ L9 (12/09/2026) — QUESTA RIGA DICEVA IL VERO IERI, E OGGI DIREBBE IL FALSO.
   *
   * L5 asseriva `piano: []` con la glossa «nessun passo di raccolta è agganciato: `[]` onesto,
   * mai un piano finto». Era esatto: `plan.mjs` era portato e non chiamato da nessuno. Da L9
   * `avvia()` costruisce il piano PRIMA che la figlia parli, lo scrive su disco e lo mette nel
   * giornale — quindi qui ci sono quattro rami (profondità `deep`), ognuno con la sua stima.
   *
   * ⛔ `passi: []` invece resta vero IN QUESTA PROVA, e va detto perché: la figlia è finta e
   *   non ha chiamato né `web_search` né `naviga`. I passi nascono dalle chiamate vere degli
   *   attrezzi (`raccolta-viva.mjs`), non dall'avvio — e un passo scritto all'avvio sarebbe
   *   lavoro dichiarato che nessuno ha fatto.
   * ⛔ `spesa` a zero per la stessa ragione, e `costoAtteso` invece NON è zero: è il «costo
   *   detto prima» (§6.8, +1.5), e il divario fra i due è esso stesso una misura.
   */
  assert.equal(ricerca.piano.length, 4, 'L9 — profondità `deep`: quattro linee di indagine, dal motore portato');
  assert.deepEqual(ricerca.piano.map((r) => r.id), ['b1', 'b2', 'b3', 'b4']);
  assert.ok(ricerca.piano.every((r) => typeof r.question === 'string' && r.question.length > 0));
  assert.ok(ricerca.costoAtteso.searches > 0 && ricerca.costoAtteso.pages > 0 && ricerca.costoAtteso.tokens > 0,
    '⛔ il costo si dice PRIMA: una corsa che costa ~15× una chat non si scopre dopo');
  assert.deepEqual(ricerca.passi, [], '⛔ la figlia finta non ha cercato niente: nessun passo inventato per riempire la scheda');
  assert.equal(ricerca.giornale.righeSaltate, 0);
  assert.equal(ricerca.giornale.stato, 'done', 'il giornale è stato rigiocato: `run_started` → `run_finished`');
  assert.ok(ricerca.giornale.eventi >= 2, 'e gli eventi si contano: «si è caricato» e «si è caricato per intero» non sono la stessa frase');
  assert.deepEqual(ricerca.spesa, { tokens: 0, searches: 0, pages: 0 });
});

test('⛔⛔⛔ L5 — la SCUSA depositata esce da `contenutoRespinto`, mai da `contenutoRapporto`, e le affermazioni sono `null`', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);
  await scriviRapporto({ cartella: b.radice, id: ricercaId, testo: 'La sessione è in sola lettura, quindi non posso creare documenti direttamente.' });
  await concludi(b, sessionId, ricercaId, 'concluso', 'La sessione è in sola lettura, quindi non posso creare documenti direttamente.');

  const ricerca =(await (await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}`)).json()).data.ricerca;
  assert.equal(ricerca.stato, 'senza-rapporto');
  assert.equal(ricerca.contenutoRapporto, null, '⛔ se uscisse dal campo «il rapporto», il frontend la disegnerebbe come tale');
  assert.match(ricerca.contenutoRespinto, /sola lettura/, '⛔ ma non si butta: è il prodotto di una corsa pagata');
  assert.equal(ricerca.affermazioni, null, '⛔ `null`, non `[]`: «non lo sappiamo» non è «nessuna»');
  assert.equal(ricerca.fonti, null);
  assert.equal(ricerca.bilancio, null);
  assert.match(ricerca.motivo, /\S/, 'e il perché è scritto, in italiano');
});

/* ──────────────────────── 4. PAUSA, RIPRESA DOPO UN RIAVVIO ──────────────────────── */

test('⭐⭐⭐⭐ L5 — PAUSA: la richiesta e il punto sicuro sono due righe del giornale, e la risposta è la voce aggiornata', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);

  const pausa = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/pausa`, 'POST');
  assert.equal(pausa.status, 200);
  /*
   * ⛔ La risposta è la VOCE AGGIORNATA, non la frase inglese dell'attrezzo (quella è scritta per
   *   il modello e non deve finire su uno schermo italiano).
   * ⛔ Sullo STATO in questa risposta il test non pretende niente, e non è pigrizia: la pausa è
   *   una RICHIESTA, e il passaggio a «in pausa» avviene al punto sicuro, cioè quando la corsa ci
   *   arriva — qui il banco ci arriva subito, una corsa vera con un passo in volo no. Pretendere
   *   un valore preciso significherebbe scrivere nel test una promessa che il prodotto non fa.
   */
  const dopoLaChiamata = (await pausa.json()).data.ricerca;
  assert.equal(dopoLaChiamata.id, ricercaId);
  assert.ok(['running', 'paused'].includes(dopoLaChiamata.stato), dopoLaChiamata.stato);
  const dopoLaPausa = await finoA(async () => {
    const r = await dettaglio(b, sessionId, ricercaId);
    return r.stato === 'paused' ? r : null;
  }, 'il punto sicuro della pausa');
  assert.equal(dopoLaPausa.stato, 'paused', '⛔ e al punto sicuro lo stato cambia davvero');
  assert.match(dopoLaPausa.motivo, /\S/);
  assert.equal(dopoLaPausa.giornale.stato, 'paused', 'il giornale porta `run_pause_requested` e poi `run_paused`: due righe, perché in mezzo c\'è del denaro');
  assert.equal(dopoLaPausa.conclusaAlle, null, '⛔ una pausa non finalizza niente: `terminata` resta nulla e la ricerca è riprendibile');
});

test('⭐⭐⭐⭐ L5 §6.6 — RIAVVIO E RIPRESA: un registro NUOVO sullo stesso disco riparte DAL GIORNALE', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);

  /*
   * ── Il riavvio VERO: la corsa viene uccisa mentre lavora (nessun `RunFinished` persistito),
   *    e un registro nuovo la ripristina `interrotta`, senza conversazione in memoria. È il caso
   *    per cui esiste la via B: fino a L4, da qui il server rispondeva «start a new one», cioè
   *    ripagare tutto — 484.171 token, sulla ricerca dell'11/09.
   */
  const dopo = await b.riavvia();
  const primaDellaRipresa = b.avvii.length;
  const ripresa = await chiama(dopo.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/ripresa`, 'POST');
  assert.equal(ripresa.status, 200, '⛔ prima d\'oggi qui non c\'era nessuna rotta, e dal server «start a new one»');
  assert.equal((await ripresa.json()).data.ricerca.id, ricercaId);

  const ripartita = b.avvii.slice(primaDellaRipresa).find((i) => i?.task?.ricercaId === ricercaId);
  assert.ok(ripartita, 'la sessione della ricerca è ripartita per davvero');
  const consegna = ripartita.messaggiIniziali[0].content;
  assert.match(consegna, new RegExp(DOMANDA.slice(0, 30)), '⛔ la domanda viene dal GIORNALE, non da un campo in memoria');
  assert.match(consegna, /0 tokens, 0 searches, 0 pages/, '⛔ quanto è già stato speso si dice: è ciò che impedisce di ripagarlo');
});

test('⭐⭐⭐⭐ L5, cura 12/09 — PAUSA + RIAVVIO: la ripresa RIESCE, perché lo stato lo dice il GIORNALE e non il registro vivo', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);

  await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/pausa`, 'POST');
  await finoA(async () => {
    const r = await dettaglio(b, sessionId, ricercaId);
    return r.giornale.stato === 'paused' ? r : null;
  }, 'il punto sicuro della pausa');

  /*
   * ⛔⛔⛔ IL CASO CHE PRIMA VENIVA RIFIUTATO. Il punto sicuro di una pausa conclude il giro
   *   (`RunFinished`), quindi dopo un riavvio la sessione torna `conclusa: true` e
   *   `ripristina()` calcola `interrotta: !conclusa` ⇒ **false**. La vecchia guardia leggeva
   *   quel campo e rispondeva «That research is still running: nothing to resume» — falso, e
   *   per giunta negato proprio a chi la pausa l'aveva chiesta. Il giornale invece dice
   *   `paused`, e un riavvio non lo cancella.
   */
  const dopo = await b.riavvia();
  const primaDellaRipresa = b.avvii.length;
  const ripresa = await chiama(dopo.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/ripresa`, 'POST');
  assert.equal(ripresa.status, 200, '⛔ una ricerca messa in pausa DEVE potersi riprendere: è l’unica ragione per cui si mette in pausa');

  const ripartita = b.avvii.slice(primaDellaRipresa).find((i) => i?.task?.ricercaId === ricercaId);
  assert.ok(ripartita, 'ed è ripartita per davvero, dal giornale');
  assert.match(ripartita.messaggiIniziali[0].content, new RegExp(DOMANDA.slice(0, 30)), 'la domanda viene dal giornale');
  const riletta = await dettaglio(b, sessionId, ricercaId);
  assert.equal(riletta.giornale.stato, 'collecting', '⛔ e il giornale porta `run_resumed`: un secondo riavvio lo vedrebbe');
});

test('⛔⛔ L5, cura 12/09 — VERSO CONTRARIO: una ricerca che sta DAVVERO girando non si riprende, e lo dice', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);

  /*
   * Nessuna pausa, nessun riavvio: il giro è vivo, il giornale dice `collecting`, il registro
   * dice `interrotta: false`. ⛔ La seconda metà della guardia RESTA e deve restare: un processo
   * morto a metà giro non lascia nessun evento, quindi l’unico a saperlo è il registro. Le due
   * fonti non si sostituiscono, si sommano — e senza la metà vecchia questa riga passerebbe.
   */
  const prima = b.avvii.length;
  const ripresa = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/ripresa`, 'POST');
  assert.equal(ripresa.status, 409, '⛔ allargare la guardia non deve far ripartire un giro già in corso: sarebbe pagarlo due volte');
  assert.equal((await ripresa.json()).error.code, 'RESEARCH_CONFLICT');
  assert.equal(b.avvii.length, prima, 'e nessuna sessione è stata avviata');
  assert.equal((await dettaglio(b, sessionId, ricercaId)).stato, 'running');
});

test('⛔⛔⛔ L5, cura 12/09 — VERSO CONTRARIO: una ricerca ANNULLATA resta rifiutata anche dopo un riavvio', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);

  await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}`, 'DELETE');
  // (la DELETE toglie tutto: qui serve invece una ricerca ANNULLATA, cioè con `run_cancelled` nel giornale)
  const seconda = await conRicercaViva(b);
  const madre = b.avvii.find((i) => !i?.task?.ricercaId);
  await madre.onRicercaAnnulla({ id: seconda.ricercaId });
  await finoA(async () => {
    const r = await dettaglio(b, sessionId, seconda.ricercaId);
    return r.stato === 'cancelled' ? r : null;
  }, 'l’annullamento scritto sul disco');

  const dopo = await b.riavvia();
  const prima = b.avvii.length;
  const ripresa = await chiama(dopo.base, `/api/v1/sessions/${sessionId}/research/${seconda.ricercaId}/ripresa`, 'POST');
  assert.equal(ripresa.status, 409, '⛔ cancellato vuol dire cancellato: una ripresa spenderebbe denaro su un giro che la persona ha chiuso');
  assert.equal(b.avvii.length, prima);
});

test('⛔⛔ L5, VERSO CONTRARIO — una ricerca che non sta girando non si mette in pausa: 409, non 404 e non 200', async (t) => {
  const b = await banco(t);
  const { sessionId } = await conRicercaViva(b);
  // Una ricerca che esiste sul disco ma che nessun processo sta eseguendo (il caso di ogni riavvio).
  await creaRicerca({ cartella: b.radice, id: 'ric-ferma', domanda: 'una domanda vecchia' });

  const pausa = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/ric-ferma/pausa`, 'POST');
  assert.equal(pausa.status, 409, '⛔ «a request conflict with the current state of the target resource»: esiste, ma non è nello stato per questo');
  assert.equal((await pausa.json()).error.code, 'RESEARCH_CONFLICT');

  const ripresa = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/ric-ferma/ripresa`, 'POST');
  assert.equal(ripresa.status, 409, 'e senza giornale non si riprende: lo dice, non inventa un `run_started`');
  assert.equal((await ripresa.json()).error.code, 'RESEARCH_CONFLICT');
});

/* ───────────────────────── 5. LA RI-VERIFICA, E LA SUA ONESTÀ ───────────────────────── */

test('⛔⛔⛔ L5 §6.8 — RI-VERIFICA senza un rapporto verificabile: 409 col MOTIVO, mai «tutto intatto»', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);

  const senzaRapporto = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/riverifica`, 'POST');
  assert.equal(senzaRapporto.status, 409);
  assert.equal((await senzaRapporto.json()).error.code, 'RESEARCH_RECHECK_UNAVAILABLE');

  // Un rapporto SENZA passaggi citati: c'è, passa il cancello, e non c'è niente da ri-trovare.
  await scriviRapporto({ cartella: b.radice, id: ricercaId, testo: rapportoRecintato({ passaggio: '' }) });
  const senzaPassaggi = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/riverifica`, 'POST');
  assert.equal(senzaPassaggi.status, 409, '⛔ «citata» non è «ritrovata»: senza passaggi non c\'è misura possibile');
  assert.equal((await senzaPassaggi.json()).error.code, 'RESEARCH_RECHECK_UNAVAILABLE');
});

test('⛔⛔⛔ L5 §6.8, VERSO CONTRARIO — una ricerca VECCHIA (rapporto in prosa) non si finge ricontrollabile', async (t) => {
  const b = await banco(t);
  const { sessionId } = await conRicercaViva(b);
  /*
   * Una voce nata prima dell'11/09: la forma vecchia (`<id>.json`, nessun `formato`), con un
   * rapporto in prosa che il cancello accetta col ripiego. È lavoro vero e pagato — ma non porta
   * i passaggi citati, quindi non c'è nulla da andare a ri-trovare. Dire «ricontrollata, tutto a
   * posto» su una di queste sarebbe la bugia più facile di tutta la funzione.
   */
  writeFileSync(percorsoVoceLegacy(b.radice, 'antica'), JSON.stringify({
    id: 'antica', domanda: 'una domanda di agosto', titolo: null, avviataAlle: '2026-08-30T10:00:00.000Z',
    terminata: 'done', reportLibraryId: null,
  }));
  await scriviRapporto({ cartella: b.radice, id: 'antica', testo: '# Una domanda di agosto\n\nUna risposta in prosa.\n\n## Fonti\n\n- https://esempio.invalid/vecchia\n' });

  const risposta = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/antica/riverifica`, 'POST');
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'RESEARCH_RECHECK_UNAVAILABLE');
  // E la sua scheda resta leggibile: il rifiuto riguarda il CONTROLLO, non il rapporto.
  const ricerca = (await (await chiama(b.base, `/api/v1/sessions/${sessionId}/research/antica`)).json()).data.ricerca;
  assert.equal(ricerca.stato, 'done', '⛔ il ripiego vale ancora per chi non poteva avere il record: mai timbrare «senza rapporto» su lavoro pagato');
  assert.equal(ricerca.affermazioni, null, 'ma strutturato non c\'è niente, e lo dice');
});

test('⭐⭐⭐⭐ L5 §6.8 «+1.1» — RI-VERIFICA vera: il passaggio ancora nella pagina, quello sparito, e la pagina irraggiungibile', async (t) => {
  const lette = [];
  const b = await banco(t, {
    leggiPaginaFn: async (url) => {
      lette.push(url);
      if (url.endsWith('fonte-1')) return { url, stato: 200, corpo: 'Premessa. gli harness convergono sul controllo del computer. Coda.' };
      if (url.endsWith('fonte-2')) return { url, stato: 200, corpo: 'La pagina è stata riscritta e non dice più niente del genere.' };
      return { url, stato: 503, corpo: '' };
    },
  });
  const { sessionId, ricercaId } = await conRicercaViva(b);
  await scriviRapporto({ cartella: b.radice, id: ricercaId, testo: rapportoRecintato({ fonti: 3 }) });

  const risposta = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/riverifica`, 'POST');
  assert.equal(risposta.status, 200);
  const r = (await risposta.json()).data.riverifica;

  assert.deepEqual(lette, [
    'https://esempio.invalid/fonte-1', 'https://esempio.invalid/fonte-2', 'https://esempio.invalid/fonte-3',
  ], '⛔ IN SEQUENZA, e con il lettore validato del kernel: mai una raffica di richieste parallele verso siti di altri');

  assert.equal(r.fonti[0].passaggiRitrovati, 1, 'il passaggio citato è ancora lì');
  assert.equal(r.fonti[0].passaggiPersi, 0);
  assert.equal(r.fonti[1].passaggiRitrovati, 0, '⛔ la pagina risponde 200 e NON dice più quella cosa: è il caso pericoloso');
  assert.equal(r.fonti[1].passaggiPersi, 1);
  assert.equal(r.fonti[2].stato, 'irraggiungibile');
  assert.equal(r.fonti[2].passaggiPersi, 0, '⛔ non si è potuto guardare: diverso dall\'aver guardato e non aver trovato');

  /*
   * ⛔⛔ L'ASSERZIONE PIÙ IMPORTANTE DI QUESTO FILE. `recheck.mjs`, con una mappa di testi tenuti
   *   vuota, torna `survived: 1` e `state: 'intact'` per costruzione — cioè timbrerebbe «intatta»
   *   una pagina che nessuno ha confrontato. La rotta NON lo pubblica: dice `non-misurabile` e
   *   `sopravvissuto: null`, e scrive perché.
   */
  assert.equal(r.fonti[0].stato, 'non-misurabile');
  assert.equal(r.fonti[0].sopravvissuto, null, '⛔ `null`, mai `1`: uno e «non misurato» non sono lo stesso numero');
  assert.equal(r.misurabile, false);
  assert.match(r.avvertenza, /non era stato tenuto/);
  assert.equal(r.testiTenuti, 0);
  assert.deepEqual(r.bilancio, {
    fonti: 3, intatte: 0, cambiate: 0, irraggiungibili: 1, nonMisurabili: 2,
    passaggiCitati: 3, passaggiRitrovati: 1, passaggiPersi: 1,
  });
  assert.equal(r.troncata, false);
  assert.equal(r.fontiTotali, 3);
  assert.equal(typeof r.fattaAlle, 'string');
});

/* ──────────────────────────────── 6. LA CANCELLAZIONE ──────────────────────────────── */

test('⭐⭐⭐ L5 — DELETE: la cartella intera sparisce dal disco, e un secondo colpo è 404 (non «fatto»)', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);
  await scriviRapporto({ cartella: b.radice, id: ricercaId, testo: rapportoRecintato() });
  assert.ok(existsSync(cartellaDellaRicerca(b.radice, ricercaId)));

  const prima = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}`, 'DELETE');
  assert.equal(prima.status, 200, '⛔ 200 con la busta standard, non 204: una risposta muta sarebbe l\'unica eccezione di questa API');
  const corpo = (await prima.json()).data;
  assert.equal(corpo.eliminata, true);
  assert.equal(corpo.id, ricercaId);
  assert.equal(existsSync(cartellaDellaRicerca(b.radice, ricercaId)), false, 'la cartella — giornale, fonti, rapporto — è andata davvero');
  assert.deepEqual(await elencaRicerche({ cartella: b.radice }), []);
  assert.equal(await leggiRicerca({ cartella: b.radice, id: ricercaId }), null);

  const seconda = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}`, 'DELETE');
  assert.equal(seconda.status, 404, '⛔ il magazzino resta idempotente per il MODELLO; alla persona che guarda un elenco vecchio si dice che non c\'è più');
  assert.equal((await seconda.json()).error.code, 'RESEARCH_NOT_FOUND');
});
