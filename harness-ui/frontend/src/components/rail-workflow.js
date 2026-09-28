/*
 * ⭐ F3-50 (25/09/2026) — il RAIL «Agenti» sui dati v2 del workflow (mockup R4 14/200/5.000, colonna di destra): «Richiede
 *   attenzione», la ricerca, l'interruttore Gruppi/Agenti, l'elenco e i totali. Decisione owner D30: se la sessione ha un run
 *   (o una proposta) il rail mostra quello, altrimenti le deleghe classiche di sempre (`inspector.js`, `disegnaAgenti`).
 *   Owner 25/09: il rail e il dettaglio dell'agente passano PRIMA dalla Workflow UI, poi ATLAS F5.
 *   · Decisioni owner 25/09 sera (ricerca `.claude/RICERCA-10x4-F3-50-RAIL-2026-09-25.md`):
 *     16. «Richiede attenzione» = le DECISIONI (passi che aspettano la persona) e gli ERRORI (non riusciti e da verificare).
 *         I passi in coda dietro un'attività precedente sono flusso normale: stanno nell'elenco e nei totali, non qui
 *         (Hermes `apps/desktop/src/app/agents/index.tsx:212-249`, Claude Code «Agent view», KiroCrew #12991).
 *     17. la card degli errori si vede SEMPRE, anche a zero (mockup 200: «0 errori · Nessun errore attivo»).
 *     18. una card e «Vedi tutto (N)» portano all'ELENCO FILTRATO qui nel rail; il clic su un passo apre il diagramma su di lui.
 *     19. a diagramma CHIUSO un link «Apri diagramma» in cima al rail (prende il posto di «Apri visuale diagramma» del rail
 *         classico); a diagramma aperto non si vede, come nel mockup.
 *     20. ma TIENE IL SUO POSTO: toglierlo faceva salire il rail di ~22 px sotto il puntatore appena si apriva il diagramma
 *         da una riga (foto sul 4174 del 25/09: il passaggio del mouse finiva sulla riga sotto quella cliccata).
 *   · L'evidenziazione di una riga è la SELEZIONE del diagramma (mockup 14: Agente 06 bordato al centro e nel rail).
 *   · Ogni riga dice un FATTO del registro. Nessuna percentuale per agente (D27); l'avanzamento di un gruppo è
 *     terminati/totale (D29).
 *   · Il flusso del run è condiviso (`workflow-graph-client.js`, `flussiPerCostruttore`) e resta aperto anche a scheda
 *     chiusa, perché il numero sulla scheda «Agenti» è in tempo reale (owner 20/09); a scheda chiusa però si rilegge solo
 *     la panoramica, niente pagine e niente DOM — un pannello nascosto non rende vero `document.hidden` (Hermes
 *     #106686), quindi la visibilità la dice chi monta.
 *   · Gli elementi cliccabili sono stabili e i figli non prendono il puntatore (la lezione di F3-42: un fotogramma fra
 *     pressione e rilascio mangiava il clic).
 */
import { SOGLIA_AGENTI, STATI_PASSO, cifra, conteggiFase, iconaDellaFase, percentualeFase, tonoFase } from './grafo-workflow.js';

export const PAGINA_RAIL = 25;
const RILETTURA_MINIMA_MS = 1_000;
const RUN_FINITI = new Set(['succeeded', 'failed', 'cancelled']);
const statoPasso = (stato) => STATI_PASSO[stato] ?? { parola: 'Stato sconosciuto', tono: 'neutro' };
const plurale = (n, uno, molti) => `${cifra(n)} ${n === 1 ? uno : molti}`;
const somma = (counts, stati) => stati.reduce((tot, st) => tot + (counts?.[st] ?? 0), 0);

/** I filtri dell'elenco (decisione owner 18): dalle card di «Richiede attenzione» e da «Vedi tutto». */
export const FILTRI_RAIL = Object.freeze({
  decisioni: Object.freeze({ titolo: 'Decisioni in attesa', stati: Object.freeze(['waiting_human']), vuoto: 'Nessuna decisione in attesa.' }),
  errori: Object.freeze({ titolo: 'Errori', stati: Object.freeze(['failed', 'uncertain']), vuoto: 'Nessun errore attivo.' }),
  attenzione: Object.freeze({ titolo: 'Richiede attenzione', stati: Object.freeze(['failed', 'uncertain', 'waiting_human']), vuoto: 'Niente richiede attenzione adesso.' }),
});
/*
 * In una pagina di fase ordinata «per stato» (read-model F3-42, `PESO_DELLO_STATO`) questi stati stanno IN TESTA, a classi:
 * prima non riusciti e da verificare (peso 0), poi chi aspetta la persona e chi è in verifica (peso 1); a parità di peso
 * vale l'ordine del grafo, quindi una classe si legge per intero. Dai conteggi della panoramica si sa QUANTE righe leggere.
 */
const CLASSI_IN_TESTA = Object.freeze([['failed', 'uncertain'], ['waiting_human', 'reconciling']]);
export function contaFiltro(panoramica, chiave) {
  return (panoramica?.groups ?? []).reduce((tot, g) => tot + somma(g.counts, FILTRI_RAIL[chiave].stati), 0);
}
export function testaDaLeggere(gruppo, chiave) {
  const stati = FILTRI_RAIL[chiave].stati;
  let fino = -1;
  CLASSI_IN_TESTA.forEach((classe, indice) => { if (classe.some((st) => stati.includes(st))) fino = indice; });
  return somma(gruppo?.counts, CLASSI_IN_TESTA.slice(0, fino + 1).flat());
}

/** Le voci di «Richiede attenzione», dai conteggi veri della panoramica (decisioni owner 16 e 17). */
export function vociAttenzione(panoramica) {
  const decisioni = contaFiltro(panoramica, 'decisioni');
  const errori = contaFiltro(panoramica, 'errori');
  const voci = [];
  if (decisioni > 0) voci.push({ chiave: 'decisioni', tono: 'avviso', icona: 'i-alert', titolo: plurale(decisioni, 'decisione in attesa', 'decisioni in attesa'), sotto: 'Attende una decisione' });
  voci.push({ chiave: 'errori', tono: 'errore', icona: 'i-x', titolo: plurale(errori, 'errore', 'errori'), sotto: errori > 0 ? 'Richiede intervento' : 'Nessun errore attivo' });
  return { voci, daVedere: decisioni + errori };
}

/** I passi che lavorano adesso: il numero sulla scheda «Agenti», come `contaAgentiAttivi` per le deleghe classiche. */
export function contaAttivi(panoramica) {
  return (panoramica?.groups ?? []).reduce((tot, g) => tot + conteggiFase(g.counts).inCorso, 0);
}

/**
 * Monta il rail dentro `contenitore`. `visibile()` dice se il pannello si vede (solo allora si leggono le pagine e si
 * disegna); `onApri({ gruppo, passo })` apre il diagramma su quel gruppo o quel passo (`null`: il diagramma e basta);
 * `onConteggio(n)` riceve i passi
 * attivi a ogni lettura della panoramica.
 */
export function montaRailWorkflow(contenitore, {
  client, sorgente, onApri, onConteggio, visibile = () => true, adesso = () => Date.now(),
  pianifica = (f) => (globalThis.requestAnimationFrame ?? setTimeout)(f),
} = {}) {
  const d = contenitore.ownerDocument;
  const el = (tag, classe, testo) => { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; };
  const icona = (nome, classe = '') => {
    const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `i ${classe}`.trim()); svg.setAttribute('aria-hidden', 'true');
    const use = d.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${nome}`); svg.append(use);
    return svg;
  };
  const bottone = (classe, testo) => { const b = el('button', classe, testo); b.type = 'button'; return b; };
  const nuovaLista = () => ({ righe: [], visti: new Set(), cursore: { fase: 0, offset: 0 }, finite: false });
  const stato = { panoramica: null, lista: nuovaLista(), modo: null, filtro: null, query: '', errore: null, carica: true, evidenza: null };
  let morto = false, seguendo = false, chiudiFlusso = () => {}, rilettura = null, ultimaRilettura = 0, generazione = 0, visto = null, ultimoConteggio = null;

  /* ——— struttura fissa ——— */
  const root = el('section', 'talos-wfr'); root.dataset.c = 'WorkflowRail'; root.setAttribute('aria-label', 'Agenti del workflow');
  const porta = bottone('talos-wfr__link talos-wfr__porta', null);
  porta.append(icona('i-coordina'), el('span', null, 'Apri diagramma'));
  porta.addEventListener('click', () => onApri?.(null));
  const testaAttenzione = el('div', 'talos-wfr__testa');
  const vediTutto = bottone('talos-wfr__link', 'Vedi tutto');
  testaAttenzione.append(el('h3', 'talos-wfr__titolo', 'Richiede attenzione'), vediTutto);
  const attenzione = el('ul', 'talos-wfr__attenzione'); attenzione.setAttribute('aria-label', 'Richiede attenzione');
  const campo = el('div', 'talos-wfr__campo');
  const cerca = el('input', 'talos-wfr__cerca'); cerca.type = 'search'; cerca.placeholder = 'Cerca agenti, gruppi o stato…';
  cerca.setAttribute('aria-label', 'Cerca agenti, gruppi o stato');
  campo.append(icona('i-search', 'talos-wfr__lente'), cerca);
  const interruttore = el('div', 'talos-wfr__modi'); interruttore.setAttribute('role', 'group'); interruttore.setAttribute('aria-label', 'Mostra per');
  const modoGruppi = bottone('talos-wfr__modo', 'Gruppi'); modoGruppi.dataset.modo = 'gruppi';
  const modoAgenti = bottone('talos-wfr__modo', 'Agenti'); modoAgenti.dataset.modo = 'agenti';
  interruttore.append(modoGruppi, modoAgenti);
  const testaElenco = el('div', 'talos-wfr__testa talos-wfr__testa--elenco');
  const titoloElenco = el('h3', 'talos-wfr__titolo');
  const contoElenco = el('span', 'talos-wfr__conto');
  const togliFiltro = bottone('talos-wfr__togli', null); togliFiltro.append(el('span', null, 'Mostra tutti'), icona('i-x'));
  togliFiltro.setAttribute('aria-label', 'Togli il filtro e mostra tutti gli agenti');
  testaElenco.append(titoloElenco, contoElenco, togliFiltro);
  const elenco = el('ul', 'talos-wfr__elenco');
  const altri = bottone('talos-wfr__link talos-wfr__altri', 'Mostra altri');
  const esito = el('p', 'talos-wfr__esito'); esito.setAttribute('role', 'status');
  const totali = el('section', 'talos-wfr__totali'); totali.setAttribute('aria-label', 'Totali del workflow');
  root.append(porta, testaAttenzione, attenzione, campo, interruttore, testaElenco, elenco, altri, esito, totali);
  contenitore.append(root);

  /* ——— dati ——— */
  const avvisaConteggio = () => {
    const n = contaAttivi(stato.panoramica);
    if (n !== ultimoConteggio) { ultimoConteggio = n; onConteggio?.(n); }
  };
  /** Aggiunge a `lista` fino a `quante` righe: in ordine di grafo, o — con un filtro — dalla testa delle pagine «per stato». */
  async function riempi(lista, quante) {
    const p = stato.panoramica; if (!p) return;
    const chiave = stato.filtro, filtro = chiave ? FILTRI_RAIL[chiave] : null;
    let mancano = quante;
    while (mancano > 0 && lista.cursore.fase < p.groups.length) {
      const g = p.groups[lista.cursore.fase];
      const fine = filtro ? testaDaLeggere(g, chiave) : g.total;
      if (lista.cursore.offset >= fine) { lista.cursore = { fase: lista.cursore.fase + 1, offset: 0 }; continue; }
      const limit = Math.min(50, fine - lista.cursore.offset, filtro ? 50 : mancano);
      const pagina = await client.gruppo(sorgente, g.phaseId, { offset: lista.cursore.offset, limit, perStato: Boolean(filtro), arricchisci: false });
      if (morto) return;
      // un run vivo cambia sotto i piedi fra una pagina e l'altra: niente doppioni
      const nuove = pagina.items.filter((r) => !lista.visti.has(r.nodeId) && (!filtro || filtro.stati.includes(r.state)));
      for (const r of nuove) { lista.visti.add(r.nodeId); lista.righe.push(r); }
      mancano -= nuove.length;
      lista.cursore = pagina.nextOffset === null || !pagina.items.length
        ? { fase: lista.cursore.fase + 1, offset: 0 }
        : { fase: lista.cursore.fase, offset: lista.cursore.offset + pagina.items.length };
    }
    lista.finite = lista.cursore.fase >= p.groups.length;
  }
  /** `elenco:false` = scheda nascosta: solo la panoramica, per il numero sulla scheda. */
  async function carica({ elenco: conElenco = true } = {}) {
    const mia = ++generazione;
    try {
      const { data } = await client.panoramica(sorgente);
      if (morto || mia !== generazione) return;
      stato.panoramica = data;
      avvisaConteggio();
      if (!stato.modo) stato.modo = data.total <= SOGLIA_AGENTI ? 'agenti' : 'gruppi';
      if (!conElenco) return;
      if (stato.modo === 'agenti') {
        // si rilegge dall'inizio tanto quanto era caricato, così uno stato cambiato si vede
        const lista = nuovaLista();
        await riempi(lista, Math.max(PAGINA_RAIL, stato.lista.righe.length));
        if (morto || mia !== generazione) return;
        stato.lista = lista;
      }
      stato.errore = null; stato.carica = false;
    } catch {
      if (morto || mia !== generazione) return;
      stato.carica = false;
      stato.errore = 'Non riesco a leggere gli agenti del workflow. Riprovo al prossimo aggiornamento.';
    }
    disegna();
  }
  function programmaRilettura() {
    if (rilettura || morto) return;
    const attesa = Math.max(0, RILETTURA_MINIMA_MS - (adesso() - ultimaRilettura));
    rilettura = setTimeout(() => { rilettura = null; ultimaRilettura = adesso(); void carica({ elenco: visibile() }); }, attesa);
  }
  /* uno solo, e solo per un run che non è finito: il server chiude il flusso di un run finito (204) */
  function segui() {
    if (morto || seguendo || sorgente.tipo !== 'run' || !stato.panoramica || RUN_FINITI.has(stato.panoramica.status)) return;
    seguendo = true;
    chiudiFlusso = client.segui(sorgente, {
      after: stato.panoramica.lastSeq ?? 0,
      onUpdate: () => programmaRilettura(),
      onFine: () => { seguendo = false; chiudiFlusso = () => {}; programmaRilettura(); },
    });
  }

  /* ——— disegno (in loco dove si clicca) ——— */
  const corrisponde = (...testi) => !stato.query || testi.some((t) => String(t ?? '').toLocaleLowerCase('it-IT').includes(stato.query));
  const voceAttenzione = new Map();
  function disegnaAttenzione() {
    const { voci, daVedere } = vociAttenzione(stato.panoramica);
    vediTutto.textContent = `Vedi tutto (${cifra(daVedere)})`;
    vediTutto.hidden = daVedere === 0;
    vediTutto.setAttribute('aria-pressed', String(stato.filtro === 'attenzione'));
    const chiavi = voci.map((v) => v.chiave).join('|');
    if (attenzione.dataset.chiavi !== chiavi) {
      attenzione.dataset.chiavi = chiavi; voceAttenzione.clear();
      attenzione.replaceChildren(...voci.map((v) => {
        const li = el('li');
        const b = bottone('talos-wfr__voce-attenzione'); b.dataset.chiave = v.chiave;
        b.addEventListener('click', () => scegliFiltro(b.dataset.chiave));
        li.append(b); voceAttenzione.set(v.chiave, b); return li;
      }));
    }
    for (const v of voci) {
      const b = voceAttenzione.get(v.chiave);
      b.dataset.tono = v.tono;
      b.dataset.zero = String(v.titolo.startsWith('0 '));
      b.setAttribute('aria-pressed', String(stato.filtro === v.chiave));
      const segno = el('span', 'talos-wfr__segno'); segno.append(icona(v.icona));
      const testi = el('span', 'talos-wfr__testi'); testi.append(el('span', 'talos-wfr__voce-titolo', v.titolo), el('span', 'talos-wfr__voce-sotto', v.sotto));
      b.replaceChildren(segno, testi, icona('i-chevron-right', 'talos-wfr__freccia'));
      b.setAttribute('aria-label', `${v.titolo}: ${v.sotto}. Mostra solo questi nell'elenco`);
    }
  }
  // righe stabili per id: si rifanno solo quando cambia QUALI righe ci sono; lo stato si riempie in loco
  const righeVive = new Map();
  function rigaGruppo(gruppo) {
    const b = bottone('talos-wfr__gruppo'); b.dataset.phaseId = gruppo.phaseId;
    b.addEventListener('click', () => onApri?.({ gruppo: b.dataset.phaseId }));
    riempiGruppo(b, gruppo);
    return b;
  }
  function riempiGruppo(b, gruppo) {
    const cento = percentualeFase(gruppo);
    b.dataset.tono = tonoFase(gruppo);
    const segno = el('span', 'talos-wfr__segno'); segno.append(icona(iconaDellaFase(gruppo)));
    const testi = el('span', 'talos-wfr__testi');
    const barra = el('span', 'talos-wfr__barra');
    const traccia = el('span', 'talos-wfr__barra-traccia'); const pieno = el('span', 'talos-wfr__barra-pieno'); pieno.style.width = `${cento ?? 0}%`;
    traccia.append(pieno); barra.append(traccia, el('span', 'talos-wfr__barra-valore', cento === null ? '—' : `${cento}%`));
    testi.append(el('span', 'talos-wfr__voce-titolo', gruppo.label), el('span', 'talos-wfr__voce-sotto', plurale(gruppo.total, 'agente', 'agenti')), barra);
    b.replaceChildren(segno, testi, icona('i-chevron-right', 'talos-wfr__freccia'));
    b.setAttribute('aria-label', `${gruppo.label}: ${plurale(gruppo.total, 'agente', 'agenti')}, ${cento === null ? 'non ancora avviato' : `${cifra(gruppo.terminated)} terminati su ${cifra(gruppo.total)}`}. Apri nel diagramma`);
  }
  function rigaAgente(riga) {
    const b = bottone('talos-wfr__agente'); b.dataset.nodoId = riga.nodeId; b.dataset.phaseId = riga.phaseId;
    b.addEventListener('click', () => onApri?.({ passo: b.dataset.nodoId, gruppo: b.dataset.phaseId }));
    riempiAgente(b, riga);
    return b;
  }
  function riempiAgente(b, riga) {
    const { parola, tono } = statoPasso(riga.state);
    b.dataset.tono = tono;
    b.replaceChildren(el('span', 'talos-wfr__punto'), el('span', 'talos-wfr__nome', riga.label), el('span', 'talos-wfr__stato', parola));
    b.setAttribute('aria-label', `${riga.label}: ${parola}. Apri nel diagramma`);
  }
  function applicaEvidenza() {
    const e = stato.evidenza;
    for (const [id, b] of righeVive) {
      const scelta = Boolean(e) && (stato.modo === 'gruppi' ? e.gruppo === id : e.passo === id);
      if (scelta) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
  }
  let firmaElenco = null;
  function disegnaElenco() {
    const p = stato.panoramica;
    for (const b of [modoGruppi, modoAgenti]) b.setAttribute('aria-pressed', String(b.dataset.modo === stato.modo));
    togliFiltro.hidden = !stato.filtro;
    if (stato.modo === 'gruppi') {
      titoloElenco.textContent = 'Gruppi del workflow';
      contoElenco.textContent = cifra(p.groups.length);
      const gruppi = p.groups.filter((g) => corrisponde(g.label));
      const firma = `g|${gruppi.map((g) => g.phaseId).join(',')}`;
      if (firma !== firmaElenco) {
        firmaElenco = firma; righeVive.clear();
        elenco.replaceChildren(...gruppi.map((g) => { const li = el('li'); const b = rigaGruppo(g); righeVive.set(g.phaseId, b); li.append(b); return li; }));
      } else for (const g of gruppi) riempiGruppo(righeVive.get(g.phaseId), g);
      altri.hidden = true;
      esito.textContent = stato.query && !gruppi.length ? 'Nessun gruppo per questa ricerca.' : '';
    } else {
      const filtro = stato.filtro ? FILTRI_RAIL[stato.filtro] : null;
      const totale = filtro ? contaFiltro(p, stato.filtro) : p.total;
      titoloElenco.textContent = filtro ? filtro.titolo : 'Agenti della sessione';
      contoElenco.textContent = cifra(totale);
      const righe = stato.lista.righe.filter((r) => corrisponde(r.label, statoPasso(r.state).parola));
      const firma = `a|${stato.filtro ?? ''}|${righe.map((r) => r.nodeId).join(',')}`;
      if (firma !== firmaElenco) {
        firmaElenco = firma; righeVive.clear();
        elenco.replaceChildren(...righe.map((r) => { const li = el('li'); const b = rigaAgente(r); righeVive.set(r.nodeId, b); li.append(b); return li; }));
      } else for (const r of righe) riempiAgente(righeVive.get(r.nodeId), r);
      const restano = Math.max(0, totale - stato.lista.righe.length);
      altri.hidden = stato.lista.finite || restano === 0;
      altri.textContent = `Mostra altri (${cifra(restano)} ancora)`;
      if (filtro && !stato.lista.righe.length && stato.lista.finite) esito.textContent = filtro.vuoto;
      else esito.textContent = stato.query ? `${plurale(righe.length, 'agente', 'agenti')} fra i ${cifra(stato.lista.righe.length)} caricati` : '';
    }
    applicaEvidenza();
  }
  function disegnaTotali() {
    const p = stato.panoramica;
    const cella = (etichetta, valore, { icona: nome = null, tono = null } = {}) => {
      const c = el('div', 'talos-wfr__totale');
      if (tono) c.dataset.tono = tono;
      const e = el('span', 'talos-wfr__totale-etichetta');
      if (nome) e.append(icona(nome)); else if (tono) e.append(el('span', 'talos-wfr__punto'));
      e.append(el('span', null, etichetta));
      c.append(e, el('strong', 'talos-wfr__totale-valore', cifra(valore)));
      return c;
    };
    const conti = conteggiFase(p.groups.reduce((acc, g) => { for (const [k, v] of Object.entries(g.counts ?? {})) acc[k] = (acc[k] ?? 0) + v; return acc; }, {}));
    totali.dataset.livello = p.total <= SOGLIA_AGENTI ? 'agenti' : 'gruppi';
    totali.replaceChildren(...(p.total <= SOGLIA_AGENTI
      ? [cella('Totale agenti', p.total, { icona: 'i-robot' }), cella('In esecuzione', conti.inCorso, { tono: 'corso' }),
        cella('Completati', conti.conclusi, { tono: 'ok' }), cella('In attesa', conti.inAttesa, { tono: 'attesa' })]
      : [cella('Totale agenti logici', p.total, { icona: 'i-robot' }), cella('Gruppi visibili', p.groups.length, { icona: 'i-layers' })]));
  }
  function disegna() {
    if (morto) return;
    root.dataset.stato = stato.carica ? 'carica' : stato.errore ? 'errore' : 'pronto';
    root.dataset.modo = stato.modo ?? '';
    if (!stato.panoramica) {
      attenzione.replaceChildren(); attenzione.dataset.chiavi = ''; elenco.replaceChildren(); firmaElenco = null; righeVive.clear();
      totali.replaceChildren(); altri.hidden = true; vediTutto.hidden = true; togliFiltro.hidden = true;
      esito.textContent = stato.carica ? 'Carico gli agenti del workflow…' : stato.errore ?? '';
      return;
    }
    disegnaAttenzione(); disegnaElenco(); disegnaTotali();
    if (stato.errore) esito.textContent = stato.errore;
  }

  /* ——— gesti ——— */
  /* l'elenco nuovo si legge ACCANTO a quello a schermo e lo sostituisce quando è pronto: svuotarlo prima faceva sparire le
     righe per un istante, con «Mostra altri» sopra un elenco vuoto (lettura del codice, 25/09) */
  async function ricaricaElenco({ fuoco = null } = {}) {
    const mia = ++generazione;
    const lista = nuovaLista();
    try {
      await riempi(lista, PAGINA_RAIL);
      if (morto || mia !== generazione) return;
      stato.lista = lista; stato.errore = null;
    } catch {
      if (morto || mia !== generazione) return;
      // ciò che è arrivato è del filtro nuovo: meglio poche righe giuste che le vecchie sotto il titolo nuovo
      stato.lista = lista;
      stato.errore = 'Non riesco a leggere gli agenti del workflow. Riprovo al prossimo aggiornamento.';
    }
    firmaElenco = null;
    disegna();
    fuoco?.focus?.();
  }
  function scegliFiltro(chiave) {
    const origine = chiave === 'attenzione' ? vediTutto : voceAttenzione.get(chiave);
    stato.filtro = stato.filtro === chiave ? null : chiave;
    stato.modo = 'agenti';
    void ricaricaElenco({ fuoco: origine });
  }
  vediTutto.addEventListener('click', () => scegliFiltro('attenzione'));
  togliFiltro.addEventListener('click', () => { stato.filtro = null; void ricaricaElenco({ fuoco: modoAgenti }); });
  cerca.addEventListener('input', () => { stato.query = cerca.value.trim().toLocaleLowerCase('it-IT').slice(0, 200); disegna(); });
  interruttore.addEventListener('click', (evento) => {
    const b = evento.target.closest?.('[data-modo]'); if (!b) return;
    if (b.dataset.modo === stato.modo && !stato.filtro) return;
    // l'interruttore mostra sempre TUTTO: sceglierlo toglie il filtro delle card
    stato.modo = b.dataset.modo; stato.filtro = null; firmaElenco = null;
    if (stato.modo === 'agenti') void ricaricaElenco({ fuoco: b }); else disegna();
  });
  altri.addEventListener('click', () => {
    const mia = generazione, lista = stato.lista, prima = lista.righe.length;
    void riempi(lista, PAGINA_RAIL).then(() => {
      if (morto || mia !== generazione) return;
      disegna();
      pianifica(() => elenco.children[prima]?.querySelector('button')?.focus());
    }, () => {});
  });

  disegna();
  visto = visibile();
  void carica({ elenco: visto }).then(segui);

  return {
    elemento: root,
    /** Chi monta lo chiama quando la visibilità del pannello può essere cambiata: agisce solo sul passaggio. */
    visibilita() {
      const ora = visibile();
      if (ora === visto) return;
      visto = ora;
      if (ora) void carica().then(segui);
    },
    /** Una rilettura della panoramica (fine giro, comando della card): a scheda nascosta aggiorna solo il numero. */
    aggiorna() { void carica({ elenco: visibile() }).then(segui); },
    /** La selezione del diagramma (`{ gruppo, passo }` o `null` quando si chiude). */
    evidenzia(selezione) { stato.evidenza = selezione ? { gruppo: selezione.gruppo ?? null, passo: selezione.passo ?? null } : null; applicaEvidenza(); },
    /** Il diagramma è aperto? Solo a diagramma chiuso il rail offre la sua porta (decisione owner 19). */
    diagramma(aperto) { porta.dataset.nascosta = String(Boolean(aperto)); porta.tabIndex = aperto ? -1 : 0; },
    stato: () => ({ modo: stato.modo, filtro: stato.filtro, righe: stato.lista.righe.length, evidenza: stato.evidenza }),
    distruggi() { if (morto) return; morto = true; seguendo = false; chiudiFlusso(); clearTimeout(rilettura); root.remove(); },
  };
}
