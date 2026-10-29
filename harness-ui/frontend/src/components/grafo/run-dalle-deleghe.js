/*
 * ⭐ UI deleghe (owner 12/10/2026, «il design originale deve rimanere ma essere esaltato») — l'ADATTATORE che fa passare
 *   l'albero dei sotto-agenti dal diagramma del Workflow (`grafo-workflow.js`, approvato il 26/09): stessa tela, stessa vista
 *   Tempo, stessa riproduzione, stesso dettaglio. Qui niente interfaccia: solo la forma dei dati.
 *
 *   Il diagramma legge tutto da un `client` (contratto in `grafo/fonte.js`: panoramica, revisione, gruppo, archi, storia,
 *   discendenza, passo). Questo modulo costruisce quelle letture dai fatti che il prodotto ha GIÀ sulle figlie
 *   (`GET …/children`, `GET /sessions`: `sessionId`, `padreId`, `avviataAlle`, `conclusaAlle`, `conclusa`, `interrotta`,
 *   `esitoDelega`, `motivoChiusura`, `modello`, `taskCorto`, attese di permesso e di domanda):
 *     · un LOTTO di delega = i figli dello stesso padre nati a pochi secondi l'uno dall'altro (`FINESTRA_LOTTO_MS`): è ciò
 *       che il modello fa quando delega in parallelo nello stesso giro. Il giro del padre non è fra i fatti della figlia
 *       (`subagent-orchestrator.mjs`, `snapshotFiglio`): Hermes, sui backend senza `delegationId`, usa la stessa euristica
 *       «forma + tempo» (`apps/desktop/src/app/agents/index.tsx:186-204`, clone del 07/10/2026);
 *     · il lotto è la «fase» del diagramma, l'agente il «passo», padre→figlio l'arco; la conversazione è il primo lotto, da sola;
 *     · la storia degli stati (riproduzione, vista Tempo) si ricava da nascita e fine di ogni agente: sono i due soli istanti
 *       che il prodotto registra per una figlia. Un agente fermo in attesa di te lo è «adesso», senza un istante suo.
 *   ⛔ Solo fatti dichiarati: un istante che manca non si inventa (l'agente resta senza durata), un esito che manca è «in corso».
 */
import { attivitaDellAgente, attivitaRecente, contiDellAgente, passiDellAgente, PASSI_RECENTI, totaliDelleRighe } from './attivita.js';
import { suUnaRiga } from '../testo-a-schermo.js';

export const FINESTRA_LOTTO_MS = 20_000;
export const LOTTO_PRINCIPALE = 'principale';
export const TERMINALI = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded', 'set_aside']);
export const ATTENZIONE = new Set(['failed', 'uncertain', 'reconciling']);
const istante = (s) => (typeof s === 'string' && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null);
const idValido = (v) => typeof v === 'string' && v.length > 0 && v.length <= 256;

/*
 * IL NOME A SCHERMO DI UN AGENTE È UN NOME, NON LA CONSEGNA. Misurato il 13/10/2026 sui dati veri (sola lettura, 9 agenti in 2
 * conversazioni): il `taskCorto` di `GET …/children` è la consegna INTERA — da 537 a 7.550 caratteri, 8 su 9 su più righe. Sulla
 * scheda lo tagliava lo stile, ma lo stesso testo finiva intero nel suggerimento, nel nome che legge il lettore di schermo, negli
 * annunci e nelle frasi sopra la tela («solo «…» e gli agenti che ha avviato»). Qui diventa un nome: spazi e a capo ridotti a uno
 * spazio, al più `massimo` caratteri e i puntini se è stato tagliato. 160 è lo stesso tetto che il registro dà al nome nei suoi
 * record (`session-registry.mjs`, `nodoTimeline`: `.slice(0, 160)`). Il testo intero resta in `taskPreview` (la colonna «Task
 * corrente» del dettaglio), e la ricerca lo guarda.
 */
/**
 * L3-17 (owner 16/10/2026, «un nome solo ovunque») — IL nome di un agente, per ogni superficie: diagramma, pannello Agenti,
 * dettaglio, carte dei permessi, conversazione della figlia. Il nome della delega dato dal server (quello della barra, col «-N»
 * fra sorelle), o per le deleghe di prima il compito; sempre su una riga e al più `NOME_MASSIMO`. Il testo intero si legge dove
 * serve leggerlo (la consegna nel dettaglio), mai come nome.
 */
export function nomeDellAgente(agente, massimo = NOME_MASSIMO) {
  /* NOME-REV-04 (bugfixer, 16/10): si va al candidato dopo quando uno, ripulito, resta vuoto — un nome fatto solo di caratteri che
     ingannano (U+202E, U+2066…, che la rinomina accetta) faceva sparire l'agente invece di ripiegare sul compito. */
  /* Revisione del bugfixer (16/10, dopo NOME-REV-04): `trim()` e `\s` non tolgono U+200B-U+200D, U+2060 (né la classe dei
     caratteri che ingannano): un nome fatto solo di loro restava «pieno» e l'agente spariva lo stesso. Vale come vuoto. */
  for (const testo of [agente?.nome, agente?.taskCorto, agente?.task]) {
    const nome = typeof testo === 'string' ? nomeBreve(testo, massimo) : '';
    if (HA_UN_SEGNO_VISIBILE.test(nome)) return nome;
  }
  return '';
}

export const NOME_MASSIMO = 160;
const HA_UN_SEGNO_VISIBILE = /[^\s\u200B-\u200D\u2060\uFEFF]/u;
export const NOME_IN_UNA_FRASE = 60;
export function nomeBreve(testo, massimo = NOME_MASSIMO) {
  const intero = typeof testo === 'string' ? testo : '';
  /* si guarda solo l'inizio (una consegna da migliaia di caratteri non si ripulisce tutta per tenerne 160), ma l'inizio del TESTO:
     una consegna che comincia con centinaia di spazi o di righe vuote dava «…» come nome (seconda passata del bugfixer). */
  const daDove = intero.search(/\S/u);
  if (daDove < 0) return '';
  const finestra = intero.slice(daDove, daDove + massimo * 4);
  /* i caratteri che a schermo ingannano (controlli, inversione della scrittura: `testo-a-schermo.js`) non entrano nel nome: un
     U+202E nella consegna capovolgeva la scheda, il suggerimento, il nome letto e le parole del prodotto dopo il nome. Gli a
     capo sono controlli anche loro: PRIMA diventano spazi, poi il resto si toglie. */
  const pulito = suUnaRiga(finestra);
  // «tagliato» si decide sul testo: gli spazi in coda oltre la finestra non sono testo lasciato fuori
  if (pulito.length <= massimo && !/\S/u.test(intero.slice(daDove + massimo * 4))) return pulito;
  let taglio = pulito.slice(0, massimo - 1);
  const ultimo = taglio.charCodeAt(taglio.length - 1);
  if (ultimo >= 0xD800 && ultimo <= 0xDBFF) taglio = taglio.slice(0, -1); // mai a metà di una coppia surrogata
  return `${taglio.trimEnd()}…`;
}
/** Il testo da cui viene il nome di un agente, com'è nei fatti (può essere lunghissimo). */
const nomeIntero = (a) => a?.taskCorto || a?.nome || a?.taskDelega || (typeof a?.task === 'string' ? a.task : '') || '';

/** L'id del nodo di una sessione nel diagramma: suo per sempre, qualunque cosa si stia guardando (vedi `riga`, più sotto). */
export const idDelNodo = (sessionId) => `s-${sessionId}`;

/** Lo stato di un agente nelle parole dei passi del Workflow (`grafo/comuni.js`, `STATI_PASSO`). Stessa regola di `statoAgente`. */
export function statoDelPasso(a = {}) {
  if (a.interrotta === true || a.motivoChiusura === 'fermata') return 'cancelled';
  /* in pausa: riparte quando lo dici tu, dal suo menu. ⛔ 21/10/2026 (revisione di L3-15): una figlia in pausa ha il giro CHIUSO
     (`conclusa: true`, `ultimoEsito: 'errore'` dal RunError «in-pausa», come la scrivono `c3-pausa-non-e-un-errore` e
     `c3-menu-delega`). Letta dopo `conclusa`, la pausa diventava «fallito» e «da controllare» nel diagramma: si legge prima. */
  if (a.esitoDelega === 'in-pausa' || a.motivoChiusura === 'in-pausa') return 'waiting_human';
  if (a.conclusa !== true) {
    /* revisione a blocco 3 (24/10/2026, S3 vecchio): la madre la costruisce la finestra col NUMERO delle carte aperte — un numero > 0
       vale come il `true` del server (come `grafo-agenti.js`), così il nodo radice dice «Aspetta te» e non «In corso» */
    if (a.inAttesaApprovazione === true || (Number.isFinite(a.inAttesaApprovazione) && a.inAttesaApprovazione > 0) || a.inAttesaDomanda === true || a.inAttesaPiano === true || a.approvalPendingCount > 0 || a.questionPendingCount > 0) return 'waiting_human';
    return istante(a.avviataAlle) === null ? 'pending' : 'running';
  }
  /* ⛔ 13/10/2026, trovato portando le prove della classica: dopo un ERRORE della conversazione la scheda in cima diceva
     «Riuscito». L'esito di una conversazione sta in `ultimoEsito` ('errore'), quello di una delega in `esitoDelega`
     ('fallito'): la classica li leggeva tutti e due (`grafo-agenti.js`, `stato`), qui se ne leggeva uno. Basta che UNO dei due
     dica fallimento: un `ultimoEsito` buono non copre un verdetto di delega fallita, né il contrario. */
  if ([a.esitoDelega, a.ultimoEsito].some((e) => e && /fall|error|rifiut/iu.test(String(e)))) return 'failed';
  if (a.esitoDelega === 'incerto' || a.motivoChiusura === 'esito-incerto') return 'uncertain';
  return 'succeeded';
}

const ruoloDi = (a) => (a.modalita === 'sola-lettura' || a.permessi === 'Read only' ? 'researcher' : a.modalita ? 'implementer' : null);

/**
 * Dai fatti delle sessioni al «run» che il diagramma sa leggere.
 * @param {{ corrente: object, sessioni?: object[], figli?: object[] }} dati  gli stessi di `modelloGrafoAgenti`
 * @param {{ etichettaLotto?: (n: number, lotto: { da: string, padre: object, quando: number|null, agenti: number }) => string,
 *           orarioLotto?: (lotto: { quando: number|null }) => string,
 *           etichettaPrincipale?: string, nomeSenzaTitolo?: string, finestraMs?: number,
 *           richieste?: { id: string, at: number, testo?: string }[], richiesta?: string|null }} opzioni
 *   `richieste`: le richieste della PERSONA in questa conversazione (id, istante in ms, testo). Ogni lotto avviato dalla
 *   conversazione appartiene all'ultima richiesta che lo precede; i lotti dei sotto-agenti seguono il loro agente.
 *   `richiesta`: quale mostrare — un id, `'tutte'`, oppure niente (allora l'ULTIMA che ha delegato). Senza `richieste` non si
 *   divide niente: tutto insieme, come prima.
 */
export function runDalleDeleghe({ corrente = {}, sessioni = [], figli = [] } = {}, {
  etichettaLotto = (n) => `Delegation ${n}`, orarioLotto = () => '', etichettaPrincipale = 'Main session', nomeSenzaTitolo = 'Untitled', finestraMs = FINESTRA_LOTTO_MS,
  richieste = [], richiesta = null,
  stato: statoChiesto = 'all', isolato: isolatoChiesto = null, ambito = 'sessione', etichettaCartella = 'Same folder',
} = {}) {
  const radice = corrente.sessionId;
  const mappa = new Map();
  for (const a of sessioni) if (idValido(a?.sessionId)) mappa.set(a.sessionId, { ...a });
  if (idValido(radice)) mappa.set(radice, { ...mappa.get(radice), ...corrente });
  for (const a of figli) if (idValido(a?.sessionId) && a.sessionId !== radice) mappa.set(a.sessionId, { ...mappa.get(a.sessionId), ...a, padreId: a.padreId ?? radice });
  // solo la radice e i suoi discendenti, in ampiezza: un antenato che manca stacca il ramo (non lo si appende alla radice)
  const perPadre = new Map();
  for (const a of mappa.values()) if (idValido(a.padreId) && a.padreId !== a.sessionId && mappa.has(a.padreId)) {
    if (!perPadre.has(a.padreId)) perPadre.set(a.padreId, []);
    perPadre.get(a.padreId).push(a);
  }
  const ordine = (x, y) => (istante(x.avviataAlle) ?? Infinity) - (istante(y.avviataAlle) ?? Infinity) || String(x.sessionId).localeCompare(String(y.sessionId), 'en');
  const lotti = [];
  const profondita = new Map([[radice, 0]]);
  const coda = idValido(radice) && mappa.has(radice) ? [radice] : [];
  for (let i = 0; i < coda.length; i += 1) {
    const padre = coda[i];
    const nati = [...(perPadre.get(padre) ?? [])].sort(ordine);
    let aperto = null;
    for (const a of nati) {
      if (profondita.has(a.sessionId)) continue; // un ciclo nei dati non fa girare all'infinito
      profondita.set(a.sessionId, profondita.get(padre) + 1);
      coda.push(a.sessionId);
      const t = istante(a.avviataAlle);
      /* un lotto nuovo quando: è il primo; la nascita dista più della finestra dall'ultima; oppure si passa da figli CON un
         orario a figli SENZA (o viceversa). I figli senza orario dello stesso padre stanno INSIEME in un lotto solo: senza il
         fatto non si può dire che siano nati in momenti diversi (prima ognuno apriva un lotto suo: 199 lotti da uno, misurato
         il 12/10/2026 sulla prova a 200 agenti). */
      if (!aperto || (t === null) !== (aperto.ultimo === null) || (t !== null && t - aperto.ultimo > finestraMs)) {
        aperto = { da: padre, quando: t, ultimo: t, agenti: [] };
        lotti.push(aperto);
      }
      aperto.agenti.push(a); aperto.ultimo = t ?? aperto.ultimo;
    }
  }
  /* ⛔ Owner 12/10/2026 sera: «le deleghe si accodano a quella passata… bisogna differenziare le deleghe passate dalle deleghe
     nuove». Ogni lotto appartiene a UNA richiesta della persona. I lotti sono ancora in ordine d'ampiezza (un padre prima dei
     suoi figli): quelli avviati dalla conversazione prendono l'ultima richiesta che li precede (senza orario, o nati prima della
     prima richiesta nota: la prima), gli altri la richiesta dell'agente che li ha avviati. */
  const richiesteNote = [...(Array.isArray(richieste) ? richieste : [])].filter((r) => idValido(r?.id) && Number.isFinite(r.at)).sort((x, y) => x.at - y.at);
  const richiestaDiAgente = new Map();
  for (const l of lotti) {
    if (!richiesteNote.length) l.richiesta = null;
    else if (l.da === radice) l.richiesta = (l.quando === null ? null : [...richiesteNote].reverse().find((r) => r.at <= l.quando))?.id ?? richiesteNote[0].id;
    else l.richiesta = richiestaDiAgente.get(l.da) ?? richiesteNote[0].id;
    for (const a of l.agenti) richiestaDiAgente.set(a.sessionId, l.richiesta);
  }
  const elencoRichieste = richiesteNote.map((r) => {
    const suoi = lotti.filter((l) => l.richiesta === r.id).flatMap((l) => l.agenti);
    const stati = suoi.map(statoDelPasso);
    return { id: r.id, at: new Date(r.at).toISOString(), testo: typeof r.testo === 'string' ? r.testo : '', total: suoi.length,
      terminated: stati.filter((x) => TERMINALI.has(x)).length, attention: stati.filter((x) => ATTENZIONE.has(x)).length };
  }).filter((r) => r.total > 0);
  // quale si mostra: quella chiesta se esiste, `tutte`, altrimenti l'ULTIMA che ha delegato
  const richiestaMostrata = !elencoRichieste.length ? null
    : richiesta === 'tutte' ? 'tutte' : elencoRichieste.some((r) => r.id === richiesta) ? richiesta : elencoRichieste.at(-1).id;
  const agentiInTutto = lotti.reduce((n, l) => n + l.agenti.length, 0);
  /* 13/10/2026 (bugfixer, review): la conversazione è VIVA finché lavora uno qualunque dei suoi agenti — anche uno che la
     richiesta scelta, il filtro per stato o il ramo isolato tolgono dal diagramma. Si guarda qui, PRIMA di ogni filtro: con
     «Finiti» o con un ramo isolato la scheda in cima diceva «Riuscito» mentre un agente nascosto lavorava ancora. */
  const unAgenteLavora = lotti.some((l) => l.agenti.some((a) => !TERMINALI.has(statoDelPasso(a))));
  /* 21/10/2026 (revisione di dc09fad37, S5): una figlia IN PAUSA non lavora — la conversazione non la «aspetta» (riparte quando lo
     dice la persona, dal suo menu). Resta invece in `unAgenteLavora`: col run in pausa la scheda in cima non dice «Riuscito». */
  const agentiAlLavoro = lotti.reduce((n, l) => n + l.agenti.filter((a) => !TERMINALI.has(statoDelPasso(a)) && a.esitoDelega !== 'in-pausa' && a.motivoChiusura !== 'in-pausa').length, 0);
  const agentiDellaConversazione = new Set(lotti.flatMap((l) => l.agenti.map((a) => a.sessionId)));
  if (richiestaMostrata && richiestaMostrata !== 'tutte') {
    const tenuti = lotti.filter((l) => l.richiesta === richiestaMostrata);
    lotti.length = 0; lotti.push(...tenuti);
  }
  // i lotti in ordine di nascita (a parità: prima chi sta più in alto nell'albero), numerati da 1
  lotti.sort((x, y) => (x.quando ?? Infinity) - (y.quando ?? Infinity) || profondita.get(x.da) - profondita.get(y.da));
  /* il NUMERO di un lotto è suo e non cambia quando un filtro ne nasconde altri: «Delegation 2» resta «Delegation 2». */
  lotti.forEach((l, k) => { l.numero = k + 1; });
  /* ⛔ Owner 13/10/2026 (mockup approvato) — AMBITO «cartella» (era della vista classica, `grafo-agenti.js:102`): le ALTRE
     conversazioni della stessa cartella, che non stanno nell'albero di questa, in un gruppo loro in fondo, senza frecce (non le
     ha avviate questa conversazione). Senza una cartella nota non c'è niente da aggiungere. */
  const cartellaNota = typeof corrente.cartella === 'string' && corrente.cartella !== '';
  if (ambito === 'cartella' && cartellaNota) {
    const altre = [...mappa.values()].filter((a) => a.cartella === corrente.cartella && !profondita.has(a.sessionId)).sort(ordine);
    if (altre.length) lotti.push({ da: null, quando: null, ultimo: null, agenti: altre, richiesta: null, cartella: true, numero: null });
  }
  /* FILTRO PER STATO e «ISOLA UN RAMO» (owner 13/10/2026: gli agenti fuori dal filtro SPARISCONO, il diagramma si ricompone).
     I conti per stato si prendono PRIMA di filtrare — sono le voci del menu — e `inTutto` dice quanti agenti c'erano. Un ramo
     isolato è l'agente scelto più tutti quelli che ha avviato; un id che qui non c'è non isola niente. */
  const famiglia = (s) => (s === 'running' || s === 'pending' ? 'working' : s === 'waiting_human' ? 'waiting' : ATTENZIONE.has(s) ? 'failed' : 'finished');
  const primaDelFiltro = lotti.flatMap((l) => l.agenti);
  const statoScelto = ['working', 'waiting', 'failed', 'finished'].includes(statoChiesto) ? statoChiesto : 'all';
  let ramo = null;
  if (idValido(isolatoChiesto) && primaDelFiltro.some((a) => a.sessionId === isolatoChiesto)) {
    ramo = new Set([isolatoChiesto]); const daVedere = [isolatoChiesto];
    while (daVedere.length) for (const x of perPadre.get(daVedere.pop()) ?? []) if (!ramo.has(x.sessionId)) { ramo.add(x.sessionId); daVedere.push(x.sessionId); }
  }
  /* 13/10/2026 (bugfixer, review): i conti del menu si prendono DENTRO il ramo isolato (e prima del filtro per stato). Il menu
     spegne le voci a zero «perché svuoterebbero il diagramma» (`grafo-workflow.js`): contando tutta la conversazione, con un
     ramo isolato una voce accesa («Falliti · 2») portava a un diagramma vuoto. `inTutto` resta il totale: «N di M». */
  const nelRamo = ramo ? primaDelFiltro.filter((a) => ramo.has(a.sessionId)) : primaDelFiltro;
  const conti = { all: nelRamo.length, working: 0, waiting: 0, failed: 0, finished: 0 };
  for (const a of nelRamo) conti[famiglia(statoDelPasso(a))] += 1;
  if (ramo || statoScelto !== 'all') {
    for (const l of lotti) l.agenti = l.agenti.filter((a) => (!ramo || ramo.has(a.sessionId)) && (statoScelto === 'all' || famiglia(statoDelPasso(a)) === statoScelto));
    const pieni = lotti.filter((l) => l.agenti.length > 0);
    lotti.length = 0; lotti.push(...pieni);
  }
  // dentro una frase («solo «…» e gli agenti che ha avviato») il nome è più corto ancora
  // L3-17 (NOME-REV-01): il nome è quello unico dell'agente (`nomeDellAgente`), non il compito; il testo intero resta per il dettaglio
  const nomeDi = (a) => nomeDellAgente(a, NOME_IN_UNA_FRASE) || nomeBreve(nomeIntero(a), NOME_IN_UNA_FRASE) || nomeSenzaTitolo;
  const filtro = { stato: statoScelto, isolato: ramo ? isolatoChiesto : null, isolatoNome: ramo ? nomeDi(mappa.get(isolatoChiesto)) : null,
    ambito: ambito === 'cartella' && cartellaNota ? 'cartella' : 'sessione', cartellaNota, conti,
    inTutto: primaDelFiltro.length, mostrati: lotti.reduce((n, l) => n + l.agenti.length, 0) };
  const nodoDi = new Map(); // sessionId → nodeId
  const righe = new Map();
  const archi = [];
  const riga = (a, phaseId, indice, da) => {
    const stato = statoDelPasso(a);
    /* la riga di una CONVERSAZIONE (`GET /sessions`, misurata sul 4177 il 12/10) non ha `conclusaAlle`: quando è conclusa, la sua
       fine dichiarata è l'ultima risposta (`ultimaRispostaAlle`). Una figlia ha `conclusaAlle` e si usa solo quella. */
    const inizio = istante(a.avviataAlle); const fine = istante(a.conclusaAlle) ?? (da === null && a.conclusa === true ? istante(a.ultimaRispostaAlle) : null);
    /* ⛔ L'ID DI UN NODO SEGUE LA SESSIONE, NON IL POSTO (13/10/2026, seconda passata del bugfixer, S1: «un comando dato dal
       dettaglio parte per l'agente sbagliato»). Era posizionale (`lotto-1-0002`): con un filtro acceso, quando un agente usciva
       dal diagramma chi gli stava dietro ne prendeva l'id, e tutto ciò che il diagramma ricorda per id — la scelta, il
       dettaglio, il focus, la storia — passava a un ALTRO agente; «Metti in pausa» dal dettaglio di C partiva per D. Era la
       terza volta della stessa causa (la storia che seguiva il posto, la scelta dopo un filtro). «Use a stable ID based on the
       data», mai l'indice: react.dev, learn/rendering-lists (letto il 13/10/2026); Hermes dà alla riga di un sotto-agente
       `key={child.id}` (apps/desktop/src/app/agents/index.tsx:432, clone del 24/09/2026). Il prefisso tiene l'id fuori dai nomi
       dei gruppi (`lotto-N`, `cartella`). */
    const nodeId = idDelNodo(a.sessionId);
    nodoDi.set(a.sessionId, nodeId);
    const intero = nomeIntero(a); const nome = nomeDellAgente(a) || nomeBreve(intero); // L3-17 (NOME-REV-01)
    return { nodeId, phaseId, sessionId: a.sessionId,
      label: nome || nomeSenzaTitolo,
      kind: 'agent', role: da === null ? 'integrator' : ruoloDi(a), state: stato, priority: 0,
      updatedAt: a.ultimaAttivitaAlle ?? a.conclusaAlle ?? a.avviataAlle ?? null, dependencyCount: da === null ? 0 : 1, childCount: (perPadre.get(a.sessionId) ?? []).length,
      attentionCount: ATTENZIONE.has(stato) ? 1 : 0, startedAt: inizio === null ? null : new Date(inizio).toISOString(),
      // T8: una fine dichiarata PRIMA dell'inizio (orologio corretto all'indietro) non si mostra così: al più coincide con l'inizio
      finishedAt: TERMINALI.has(stato) && fine !== null ? new Date(inizio !== null ? Math.max(fine, inizio) : fine).toISOString() : null,
      durationMs: TERMINALI.has(stato) && inizio !== null && fine !== null && fine >= inizio ? fine - inizio : null,
      stepSessionId: a.sessionId, model: a.modello ?? null, effectiveModel: a.modello ? { provider: null, model: a.modello } : null,
      // della conversazione il «compito» è la sua richiesta: la consegna, o il titolo che la riassume
      // …e se il nome è stato tagliato e un compito a parte non c'è, il testo intero resta qui: si legge nel dettaglio e si cerca
      taskPreview: a.taskDelega ?? (typeof a.task === 'string' ? a.task : null) ?? (da === null ? (a.consegna ?? a.taskCorto ?? a.nome ?? null) : null) ?? (nome !== intero.trim() && intero !== '' ? intero : null), avvio: a.avvio ?? a.avvioDelega ?? null,
      /* i file che l'agente ha toccato (`attivita.file` della delega: percorso, letto, scritto, creato), solo quelli ben formati;
         `filesCut`: quanti il server ne ha lasciati fuori dall'elenco (`fileTagliati`). Senza il fatto: `null`, non un elenco vuoto. */
      files: Array.isArray(a.attivita?.file) ? a.attivita.file.filter((f) => typeof f?.percorso === 'string' && f.percorso !== '').map((f) => ({ path: f.percorso, read: f.letto === true, written: f.scritto === true, created: f.creato === true })) : null,
      filesCut: Number.isSafeInteger(a.attivita?.fileTagliati) && a.attivita.fileTagliati > 0 ? a.attivita.fileTagliati : 0,
      /* owner 13/10/2026 — che cosa fa adesso, i suoi conti, i suoi ultimi passi (`grafo/attivita.js`): solo FATTI, le parole le
         mette chi disegna. Un conto che il server non dichiara resta `null` (non si sa), mai zero. */
      activity: attivitaDellAgente(a, stato), ...(({ calls, files, filesPartial, tokens }) => ({ calls, fileCount: files, filesPartial, tokens }))(contiDellAgente(a)),
      steps: passiDellAgente(a) };
  };
  /* Owner 12/10/2026 sera: la conversazione NON è un gruppo del diagramma — è la scheda in cima (quella del «coordinatore» del
     Workflow), da cui partono le frecce verso i lotti che ha avviato. Prima stava anche in un gruppo «Questa conversazione»:
     due schede per la stessa cosa. Qui se ne calcolano i fatti (`conversazione`), e nessuna riga. */
  const gruppiGrezzi = [];
  const conversazione = coda.length ? riga(mappa.get(radice), LOTTO_PRINCIPALE, 0, null) : null;
  /* la conversazione che non sta facendo niente di suo ma ha agenti al lavoro sta ASPETTANDO loro: è ciò che fa adesso */
  if (conversazione && agentiAlLavoro > 0 && ['last', 'none', 'between'].includes(conversazione.activity?.kind)) conversazione.activity = { kind: 'waitingAgents', count: agentiAlLavoro };
  nodoDi.delete(radice);
  /* chi scrive il titolo di un lotto riceve il padre col nome già breve (in `taskCorto` e `nome`, i campi che legge): «Deleghe di
     <consegna intera>» era un titolo da migliaia di caratteri */
  const padreColNomeBreve = (p) => (p ? { ...p, ...(typeof p.taskCorto === 'string' ? { taskCorto: nomeBreve(p.taskCorto, NOME_IN_UNA_FRASE) } : {}), ...(typeof p.nome === 'string' ? { nome: nomeBreve(p.nome, NOME_IN_UNA_FRASE) } : {}) } : p);
  lotti.forEach((l) => {
    const phaseId = l.cartella ? 'cartella' : `lotto-${l.numero}`;
    const elenco = l.agenti.map((a, i) => riga(a, phaseId, i, l.da));
    righe.set(phaseId, elenco);
    gruppiGrezzi.push({ phaseId, daConversazione: l.da === radice, label: l.cartella ? etichettaCartella : etichettaLotto(l.numero, { da: l.da, padre: padreColNomeBreve(mappa.get(l.da)), quando: l.quando, agenti: l.agenti.length }),
      ora: (l.quando === null ? '' : orarioLotto({ quando: l.quando })) || null });
  });
  for (const l of lotti) for (const a of l.agenti) {
    const da = nodoDi.get(l.da); const verso = nodoDi.get(a.sessionId);
    if (da && verso) archi.push({ edgeId: `e-${da}-${verso}`, fromNodeId: da, toNodeId: verso, type: 'control' });
  }
  archi.sort((x, y) => x.edgeId.localeCompare(y.edgeId, 'en'));
  const tutte = [...righe.values()].flat();
  const faseDi = new Map(tutte.map((r) => [r.nodeId, r.phaseId]));
  const groups = gruppiGrezzi.map((g, order) => {
    const elenco = righe.get(g.phaseId);
    const counts = {}; const roles = {};
    for (const r of elenco) { counts[r.state] = (counts[r.state] ?? 0) + 1; if (r.role) roles[r.role] = (roles[r.role] ?? 0) + 1; }
    const terminated = elenco.filter((r) => TERMINALI.has(r.state)).length;
    return { phaseId: g.phaseId, label: g.label, ora: g.ora ?? null, order, daConversazione: g.daConversazione === true, total: elenco.length, terminated, attention: elenco.filter((r) => ATTENZIONE.has(r.state)).length,
      counts, progress: elenco.length ? terminated / elenco.length : null, roles, kinds: { agent: elenco.length } };
  });
  const ordineLotto = new Map(groups.map((g) => [g.phaseId, g.order]));
  const connessioni = new Map();
  for (const arco of archi) {
    const da = faseDi.get(arco.fromNodeId); const verso = faseDi.get(arco.toNodeId);
    if (da === verso) continue;
    const chiave = `${da}>${verso}`;
    if (!connessioni.has(chiave)) connessioni.set(chiave, { fromPhaseId: da, toPhaseId: verso, total: 0, types: { control: 0 } });
    connessioni.get(chiave).total += 1; connessioni.get(chiave).types.control += 1;
  }
  // la storia: nascita e fine di ciascuno, in ordine d'ora (a parità la nascita prima della fine, poi l'ordine del grafo)
  const voci = [];
  tutte.forEach((r, i) => {
    if (r.startedAt) voci.push({ at: r.startedAt, scope: 'node', nodeId: r.nodeId, phaseId: r.phaseId, state: 'running', _o: [0, i] });
    if (r.finishedAt) voci.push({ at: r.finishedAt, scope: 'node', nodeId: r.nodeId, phaseId: r.phaseId, state: r.state, _o: [1, i] });
  });
  voci.sort((x, y) => Date.parse(x.at) - Date.parse(y.at) || x._o[0] - y._o[0] || x._o[1] - y._o[1]);
  const primo = voci[0]?.at ?? null;
  const viva = unAgenteLavora;
  const storia = [...(primo ? [{ at: primo, scope: 'run', state: 'running' }] : []), ...voci.map(({ _o, ...v }) => v)].map((v, i) => ({ seq: i + 1, ...v }));
  // l'impronta della STRUTTURA (chi c'è, sotto chi, in quale lotto): cambia ⇒ il diagramma rilegge righe e archi
  // (l'id del nodo non dice più il lotto: entra il lotto, così un agente che cambia lotto cambia la struttura)
  const struttura = tutte.map((r) => `${r.sessionId}@${r.phaseId}`).join('|');
  let impronta = 0;
  for (let i = 0; i < struttura.length; i += 1) impronta = (impronta * 31 + struttura.charCodeAt(i)) | 0;
  const panoramica = { schema: 'talos.workflow-graph-view.v2', runId: `deleghe:${radice ?? ''}`, graphVersion: impronta, lastSeq: storia.length, revision: `${impronta}:${storia.length}`,
    // lo stato in cima è quello della CONVERSAZIONE: viva se lei o un suo agente lavora; altrimenti com'è finita lei
    status: !conversazione ? 'succeeded' : ['failed', 'cancelled'].includes(conversazione.state) ? conversazione.state
      : viva || !TERMINALI.has(conversazione.state) ? 'running' : 'succeeded', phaseSource: 'delegations',
    total: tutte.length, terminated: tutte.filter((r) => TERMINALI.has(r.state)).length, attention: tutte.filter((r) => ATTENZIONE.has(r.state)).length,
    // gli agenti delegati (la conversazione non è fra le righe: questi coincidono coi totali, e restano per chi li legge)
    /* 13/10/2026: con l'ambito «cartella» le altre conversazioni NON sono agenti delegati — foto vera: la testata diceva
       «8 agents in 4 batches, started by this conversation» con 6 agenti e 2 conversazioni di altri. Si contano a parte. */
    delegated: { total: tutte.filter((r) => r.phaseId !== 'cartella').length, terminated: tutte.filter((r) => r.phaseId !== 'cartella' && TERMINALI.has(r.state)).length },
    folder: { total: tutte.filter((r) => r.phaseId === 'cartella').length },
    /* i totali degli agenti delegati che si vedono (owner 13/10/2026): somma di ciò che si sa, e quanti lo dichiarano */
    totals: totaliDelleRighe(tutte.filter((r) => r.phaseId !== 'cartella')),
    conversazione,
    /* le richieste della persona che hanno delegato (in ordine), quale si sta guardando e quale è l'ultima della conversazione
       (anche se non ha delegato): il diagramma ne fa il selettore. `agentiInTutto` è il conto di «Tutte le richieste». */
    richieste: elencoRichieste, richiesta: richiestaMostrata, ultimaRichiesta: richiesteNote.at(-1)?.id ?? null, agentiInTutto,
    /* che cosa si sta guardando (owner 13/10/2026): lo stato scelto, il ramo isolato, l'ambito; `conti` sono le voci del menu
       dello stato (prima del filtro), `mostrati` su `inTutto` è la riga «Showing N of M agents». */
    filtro,
    groups, groupConnections: [...connessioni.values()].sort((x, y) => ordineLotto.get(x.fromPhaseId) - ordineLotto.get(y.fromPhaseId) || ordineLotto.get(x.toPhaseId) - ordineLotto.get(y.toPhaseId)) };
  // `richiestaDi`: per OGNI agente della conversazione (anche fuori dalla richiesta mostrata), l'id della sua richiesta
  // `agenti`: OGNI agente della conversazione, anche quelli che richiesta, stato o ramo tolgono dal diagramma (per la riproduzione)
  return { panoramica, righe, tutte, archi, storia, nodoDi, lotti: lotti.length, conversazione, richiestaDi: richiestaDiAgente, agenti: agentiDellaConversazione };
}

/**
 * Il `client` che `montaGrafoWorkflow` si aspetta, sopra `runDalleDeleghe`. `leggi()` dà i fatti freschi (gli stessi di
 * `montaGrafoAgenti`: `{ corrente, sessioni, figli }`); ogni lettura della panoramica li rilegge, le altre usano quell'istantanea.
 * Le forme sono quelle delle rotte vere (`workflow-graph-client.js`): pagine `{ offset, limit, total, nextOffset, items }`.
 */
/**
 * Dalla cronologia osservata del registro (`talos.agent-timeline.v1`: a ogni evento, lo stato dell'agente COM'ERA) alla storia
 * che il diagramma sa rigiocare (`{ at, scope, nodeId, phaseId, state }`). Un agente che oggi non è nel diagramma (filtro, altra
 * richiesta) non ha un passo e si salta; uno stato ripetuto non fa una voce nuova. La radice dà lo stato del «run».
 */
export function storiaDallaCronologia(record, { radice, nodoDi, faseDi, agenti = null }) {
  const voci = []; const ultimo = new Map(); let run = null; let madre = null;
  /* 13/10/2026 (bugfixer, review): lo stato di OGNI agente della conversazione (`agenti`), anche di quelli che il diagramma non
     mostra (filtro, altra richiesta): decidono anche loro se la conversazione lavora ancora, come dal vivo. Un agente del
     registro che la conversazione oggi non ha più (eliminato) resta fuori, come prima: non terrebbe il run in corso per sempre. */
  const diTutti = new Map();
  /* lo stato del run a questo punto della storia, con la regola del vivo: un errore o uno stop della conversazione restano tali;
     altrimenti è in corso finché lei o un suo agente (di quelli nel diagramma) lavora, e solo dopo è riuscito */
  const statoDelRun = () => {
    if (madre === 'failed' || madre === 'cancelled') return madre;
    const vivi = [...diTutti.values()].some((s) => !TERMINALI.has(s));
    return vivi || madre === null || !TERMINALI.has(madre) ? 'running' : 'succeeded';
  };
  /* T8 (terza passata; era RIPRESA-REPLAY-CLOCK della vista classica, cancellata senza erede): l'orologio del sistema può
     tornare indietro fra due record (corretto a mano, o sincronizzato), la storia rigiocata no — l'istante di una voce non
     precede mai quello della voce prima. Senza, un agente «finiva prima di cominciare» («16:02 → 16:01 · null»). */
  let nonPrimaDi = -Infinity;
  for (const r of record) {
    const a = r?.node; const letto = typeof r?.at === 'string' ? Date.parse(r.at) : NaN;
    if (!a || !idValido(a.sessionId) || !Number.isFinite(letto)) continue;
    const quando = letto >= nonPrimaDi ? r.at : new Date(nonPrimaDi).toISOString();
    nonPrimaDi = Math.max(nonPrimaDi, letto);
    const stato = statoDelPasso(a);
    if (a.sessionId === radice) madre = stato;
    else {
      const nodeId = nodoDi.get(a.sessionId);
      if ((!nodeId && !agenti?.has(a.sessionId)) || diTutti.get(a.sessionId) === stato) continue;
      diTutti.set(a.sessionId, stato);
      if (nodeId && ultimo.get(nodeId) !== stato) {
        ultimo.set(nodeId, stato);
        voci.push({ at: quando, scope: 'node', nodeId, phaseId: faseDi.get(nodeId) ?? null, state: stato });
      }
    }
    const delRun = statoDelRun();
    if (delRun !== run) { run = delRun; voci.push({ at: quando, scope: 'run', state: delRun }); }
  }
  return voci.map((v, i) => ({ seq: i + 1, ...v }));
}

export function creaClientDeleghe({ leggi, leggiCronologia = null, opzioni = {}, titolo = 'Delegations', obiettivo = null } = {}) {
  let run = null;
  /* la cronologia osservata, letta a pagine e tenuta (cresce soltanto): `errore` è l'ultima lettura fallita, `fonte` dice da dove
     viene la storia che si sta rigiocando — 'registro', oppure 'fatti' (nascita e fine di adesso) quando il registro non c'è. */
  /* `parziale` (owner 13/10/2026, D9): il registro ha dichiarato almeno una volta che la sua storia ha dei buchi (`coverage:
     'partial'`: record persi prima dell'archivio, una riga del file non leggibile, un salto nella numerazione). Non torna più
     falso: i record tenuti qui sono quelli, e un buco già letto resta un buco. */
  const cronologia = { record: [], lastSeq: 0, errore: null, fonte: typeof leggiCronologia === 'function' ? 'registro' : 'fatti', lettura: null, parziale: false };
  const leggiLaCronologia = () => {
    if (cronologia.lettura) return cronologia.lettura;
    cronologia.lettura = (async () => {
      try {
        let after = cronologia.lastSeq; let through;
        do {
          const pagina = await leggiCronologia({ after, ...(through == null ? {} : { through }), limit: 250 });
          if (pagina?.schema !== 'talos.agent-timeline.v1' || !Number.isSafeInteger(pagina.through) || pagina.through < after || !Array.isArray(pagina.items)) throw new Error('HISTORY_INVALID');
          through ??= pagina.through;
          for (const r of pagina.items) if (Number.isSafeInteger(r?.seq) && r.seq > cronologia.lastSeq) { cronologia.record.push(r); cronologia.lastSeq = r.seq; }
          if (pagina.next != null && (!Number.isSafeInteger(pagina.next) || pagina.next <= after || pagina.next > through)) throw new Error('HISTORY_INVALID');
          /* senza NESSUN record il registro non ha una storia da rigiocare, qualunque copertura dichiari: si rigioca dai fatti.
             Con `partial` o `complete` e zero record (un file della cronologia senza una riga valida: `agent-timeline.mjs`,
             `ripristina`) la riproduzione restava su «Carico la storia…» per sempre (seconda passata del bugfixer). */
          cronologia.fonte = cronologia.record.length === 0 ? 'fatti' : 'registro';
          if (pagina.coverage === 'partial') cronologia.parziale = true;
          after = pagina.next;
        } while (after != null);
        cronologia.errore = null;
      } catch (errore) { cronologia.errore = errore?.message || 'HISTORY_UNAVAILABLE'; throw errore; }
      finally { cronologia.lettura = null; }
    })();
    return cronologia.lettura;
  };
  /* la richiesta che la persona ha scelto di guardare (`null` = di serie: l'ultima che ha delegato). I fatti letti possono portare
     le richieste della conversazione (`richieste`): arrivano da chi legge, perché cambiano a ogni messaggio. */
  let richiestaScelta = null;
  /* stato, ramo isolato e ambito scelti dalla persona (owner 13/10/2026); valgono dalla prossima lettura, come la richiesta */
  const scelta = { stato: 'all', isolato: null, ambito: 'sessione' };
  /* owner 13/10/2026 (D14): il nome dell'agente il cui ramo era isolato e che un cambio di richiesta ha tolto — `null` = niente da
     dire. Resta in `filtro.isolamentoTolto` fino alla prossima scelta della persona (o finché lei chiude l'avviso). */
  let isolamentoTolto = null;
  /* ciò che la app dice della sua ULTIMA lettura dal server (`datiGrafoAgenti`: `errore`, `aggiornato`). I fatti arrivano dalla
     memoria della app, quindi «leggerli» riesce sempre: se la lettura VERA è fallita lo sa solo lei, e va detto a chi guarda. */
  let datiLetti = { errore: null, aggiornato: null };
  const fresco = async () => {
    const fatti = await leggi();
    /* T7 (terza passata): il motivo arriva dal server e va a schermo — breve e senza i caratteri che ingannano, come un nome
       (un U+202E capovolgeva anche «Riprovo da solo.», uno stack d'errore faceva un avviso di 972 px che toglieva la tela) */
    const motivoLetto = typeof fatti?.errore === 'string' ? nomeBreve(fatti.errore) : '';
    datiLetti = { errore: motivoLetto !== '' ? motivoLetto : null, aggiornato: typeof fatti?.aggiornato === 'string' && fatti.aggiornato !== '' ? fatti.aggiornato : null };
    run = runDalleDeleghe(fatti, { ...opzioni, richieste: fatti?.richieste ?? opzioni.richieste ?? [], richiesta: richiestaScelta, ...scelta });
    if (run?.panoramica?.filtro) run.panoramica.filtro.isolamentoTolto = isolamentoTolto;
    return run;
  };
  const attuale = async () => run ?? fresco();
  const pagina = (tutte, { offset = 0, limit = 50 } = {}) => ({ offset, limit, total: tutte.length, nextOffset: offset + limit < tutte.length ? offset + limit : null, items: tutte.slice(offset, offset + limit) });
  const PESO = { failed: 0, uncertain: 0, waiting_human: 1, reconciling: 1, leased: 2, running: 2, pending: 3, blocked: 3, ready: 3, retry_wait: 3, succeeded: 5 };
  return {
    /* un filtro che non lascia nessuno NON è «nessuna delega»: il diagramma resta, e la riga sopra la tela dice 0 su N */
    /* `ancheVuota` (13/10/2026): chi sa disegnare lo stato vuoto chiede la sorgente anche senza agenti; di serie resta `null`
       («niente da mostrare»), come prima. */
    sorgente: async ({ ancheVuota = false } = {}) => { const r = await fresco(); return ancheVuota || r.tutte.length > 0 || (r.panoramica.filtro?.inTutto ?? 0) > 0 ? { tipo: 'run', runId: r.panoramica.runId, workflowId: null, version: null, status: r.panoramica.status, createdAt: r.storia[0]?.at ?? null, deleghe: true } : null; },
    revisione: async () => { const r = await attuale(); return { schema: 'talos.workflow-proposal-view.v2', status: 'approved', workflowId: null, version: null, title: titolo, objective: obiettivo, phases: r.panoramica.groups.map((g) => ({ id: g.phaseId, label: g.label, total: g.total })) }; },
    panoramica: async () => { const r = await fresco(); return { data: r.panoramica, meta: null }; },
    gruppo: async (_s, phaseId, { offset = 0, limit = 50, perStato = false } = {}) => {
      const r = await attuale();
      const elenco = r.righe.get(phaseId) ?? [];
      const ordinato = perStato ? elenco.map((x, i) => ({ x, i })).sort((a, b) => (PESO[a.x.state] ?? 4) - (PESO[b.x.state] ?? 4) || a.i - b.i).map((v) => v.x) : elenco;
      return { phaseId, ...pagina(ordinato, { offset, limit }) };
    },
    archi: async (_s, phaseIds) => {
      const r = await attuale(); const fasi = new Set(phaseIds);
      const faseDi = new Map(r.tutte.map((x) => [x.nodeId, x.phaseId]));
      return fasi.size ? r.archi.filter((a) => fasi.has(faseDi.get(a.fromNodeId)) && fasi.has(faseDi.get(a.toNodeId))) : [];
    },
    storia: async (_s, { offset = 0 } = {}) => {
      const r = await attuale();
      let voci = r.storia;
      if (typeof leggiCronologia === 'function') {
        await leggiLaCronologia(); // se fallisce, chi chiama lo sa (`erroreCronologia`) e può riprovare: non si finge una storia
        if (cronologia.fonte === 'registro') voci = storiaDallaCronologia(cronologia.record, { radice: r.conversazione?.sessionId ?? null, nodoDi: r.nodoDi, agenti: r.agenti, faseDi: new Map(r.tutte.map((x) => [x.nodeId, x.phaseId])) });
      }
      return { items: voci.slice(offset), total: voci.length, lastSeq: voci.length, status: r.panoramica.status };
    },
    /* la storia dipende da CHE COSA si guarda (i fatti di chi si vede; le mappe con cui si legge la cronologia): a ogni cambio
       di struttura la sorgente del diagramma la rilegge da capo e la sostituisce (`fonte.js`). Gli id dei nodi seguono la
       sessione: finché arriva quella nuova, la storia di prima resta attribuita agli agenti giusti. */
    storiaLegataAllaStruttura: true,
    /** L'ultima lettura della cronologia è fallita? (`null` = no) — per la riga «Riprova» della riproduzione. */
    erroreCronologia: () => cronologia.errore,
    /** Da dove viene la storia rigiocata: 'registro' (osservata e salvata) o 'fatti' (nascita e fine di adesso). */
    fonteDellaStoria: () => cronologia.fonte,
    /** La storia del registro ha dei buchi? `{ parziale, da }`: `da` è l'ora del primo record che c'è (da lì si rigioca), o null. */
    coperturaDellaStoria: () => ({ parziale: cronologia.fonte === 'registro' && cronologia.parziale, da: cronologia.record[0]?.at ?? null }),
    discendenza: async (_s, nodeId, direzione) => {
      const r = await attuale();
      const vicini = new Map();
      for (const a of r.archi) {
        const [da, verso] = direzione === 'monte' ? [a.toNodeId, a.fromNodeId] : [a.fromNodeId, a.toNodeId];
        if (!vicini.has(da)) vicini.set(da, []);
        vicini.get(da).push(verso);
      }
      const visti = new Set([nodeId]); const coda = [nodeId];
      while (coda.length) for (const x of vicini.get(coda.pop()) ?? []) if (!visti.has(x)) { visti.add(x); coda.push(x); }
      visti.delete(nodeId);
      return r.tutte.map((x) => x.nodeId).filter((id) => visti.has(id));
    },
    /** Il passo del diagramma che corrisponde a una sessione (per aprirlo dal rail), o null. */
    nodoDellaSessione: async (sessionId) => (await attuale()).nodoDi.get(sessionId) ?? null,
    /** RIV-T3-01 (riverifica, 14/10/2026): la richiesta di un agente della conversazione, anche fuori da quella mostrata (il
     *  pannello Agenti le divide e la persona può scegliere un agente di una passata), o null. */
    richiestaDellAgente: async (sessionId) => (await attuale()).richiestaDi?.get(sessionId) ?? null,
    /** La sessione di un passo (per il pannello Agenti che segue la selezione), dall'ultima lettura; null se non c'è. */
    sessioneDelNodo: (nodeId) => run?.tutte.find((x) => x.nodeId === nodeId)?.sessionId ?? null,
    conversazione: () => run?.conversazione ?? null,
    /** L'ultima lettura dal server: `errore` se è fallita (a schermo restano i fatti di prima), `aggiornato` = l'ora dell'ultima
     *  riuscita, o dell'ultimo evento in diretta. */
    statoDeiDati: () => datiLetti,
    /* «Attività recenti»: gli ultimi passi di tutte le righe che si vedono; `finoA` in riproduzione (millisecondi) */
    attivitaRecente: (finoA = null) => attivitaRecente(run?.tutte ?? [], PASSI_RECENTI, finoA),
    /** Le righe dell'ultima lettura (per aggiornare le schede già a schermo quando la struttura non è cambiata). */
    righe: () => run?.tutte ?? [],
    /** Sceglie la richiesta da guardare: un id, `'tutte'`, o `null` per tornare a quella di serie. Vale dalla prossima lettura. */
    scegliRichiesta: (id) => {
      const nuova = id ?? null;
      /* D14: cambiando richiesta il ramo isolato si TOGLIE — prima restava ricordato e tornava da solo rimettendo la richiesta di
         prima: un filtro che riappare senza un gesto. Se in quel momento isolava davvero qualcosa, lo si dice (col suo nome). */
      if (nuova !== richiestaScelta && scelta.isolato !== null) { const f = run?.panoramica?.filtro; isolamentoTolto = f?.isolato != null ? (f.isolatoNome ?? '') : null; scelta.isolato = null; }
      else if (nuova !== richiestaScelta) isolamentoTolto = null;
      richiestaScelta = nuova; run = null;
    },
    richiestaScelta: () => richiestaScelta,
    /** Lo stato da mostrare: 'all' | 'working' | 'waiting' | 'failed' | 'finished'. */
    scegliStato: (stato) => { scelta.stato = typeof stato === 'string' ? stato : 'all'; isolamentoTolto = null; run = null; },
    /** Isola un agente e quelli che ha avviato (la sua sessione), o `null` per tornare a tutti. */
    isola: (sessionId) => { scelta.isolato = sessionId ?? null; isolamentoTolto = null; run = null; },
    /** L'ambito: 'sessione' (questa conversazione) o 'cartella' (anche le altre conversazioni della stessa cartella). */
    scegliAmbito: (ambito) => { scelta.ambito = ambito === 'cartella' ? 'cartella' : 'sessione'; isolamentoTolto = null; run = null; },
    /** Toglie stato e ramo isolato («Show all»); l'ambito resta. */
    mostraTutti: () => { scelta.stato = 'all'; scelta.isolato = null; isolamentoTolto = null; run = null; },
    /** La persona ha letto l'avviso «il ramo non è più isolato»: non si dice più (niente rilettura: cambia solo l'avviso). */
    scordaIsolamentoTolto: () => { isolamentoTolto = null; if (run?.panoramica?.filtro) run.panoramica.filtro.isolamentoTolto = null; },
    filtro: () => run?.panoramica?.filtro ?? null,
    passo: async (_s, nodeId) => { const r = await attuale(); const x = r.tutte.find((y) => y.nodeId === nodeId); return x ? { ...x, attempt: 1, resultRefIds: [], instructions: x.taskPreview ?? null } : { nodeId }; },
  };
}
