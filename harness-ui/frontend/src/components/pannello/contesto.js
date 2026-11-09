/*
 * PANNELLO v2 — la scheda CONTESTO. Quanto è piena la finestra sul limite che AGISCE (C1, owner 10/10/2026: «un numero solo in
 * tutta l'app»), cosa la occupa con la sua leva accanto, e — nessun concorrente lo fa — la STORIA giro per giro con i riassunti
 * sopra e la soglia disegnata (RICERCA §1, «Debolezze»: Cline la promette a parole e il clic è un TODO).
 *
 * Prende il posto delle quattro card di `#railContesto` (index.template.html:1344-1371) e del loro riempimento
 * (`aggiornaInspector`, inspector.js:2071-2097). La card «Ambiente» (ramo, worktree) passa alla scheda Git, dove quei fatti
 * vivono già (MAPPA.md, C-10).
 *
 * ── I DATI (gli stessi che `aggiornaInspector` riceve già, legacy/app.js:12963-12981) ──────────────────────────────────────
 * dati.usage          = `finestra.perInspector.usage` = `usageDelContesto()` (legacy/app.js:25393): `{ prompt_tokens,
 *                       completion_tokens, stimato? }` dell'ULTIMA chiamata (26/09: non il cumulativo del giro).
 * dati.schedaContesto = `datiSchedaContesto()` (legacy/app.js:25670): `{ budget, politica, ripartizione: { categorie:
 *                       [{ id, tokens }] }, level1, motore, legacy, recordLegacy }`.
 * dati.giri           = `giriPerInspector()` (legacy/app.js:11854): `[{ numero, titolo, attrezzi, inCorso, senzaContatto, tu }]`.
 * dati.invio          = `{ giri, tetto }` (legacy/app.js:12980): le richieste al modello di QUESTO invio contro il tetto.
 * dati.cacheTesto     = `testoRiusoCache(cacheSessione)` (consumo-sessione.js) già scritto: la riga del riuso della cache.
 * dati.cacheRicominciata = l'ultimo `talos.cache-ricominciata` della conversazione (`{ motivo, at, tokenDaRileggere }`), o null.
 * dati.fornitoriEvitati = i fornitori che la sessione evita (decisione 193, `talos.fornitore-evitato`): `[{ fornitore, modello }]`.
 * dati.modello        = il nome corto del modello della conversazione (`state.model`, senza il fornitore: regola 13/10).
 * dati.storiaContesto = ⚠️ DATI NUOVI LATO CLIENT: `[{ giro, at, token, compattazione?: { prima, dopo, conModello } }]`, un punto
 *                       per invio chiuso. Il valore c'è già nel giornale (StateDelta `/usage`, legacy/app.js:24232, rigiocato
 *                       anche alla riapertura): basta tenerne la serie (MAPPA.md, C-05). Senza, il grafico non si disegna.
 * dati.storiaInCaricamento = vero mentre la storia della sessione arriva (A1-bis): niente numeri intermedi.
 * dati.storiaDal       = da quando (ms) la storia arriva: i secondi della riga «in corso» (04/11).
 *
 * ── LE AZIONI (tutte esistono già) ───────────────────────────────────────────────────────────────────────────────────────
 * azioni.riassumi()      = `compactSession` (legacy/app.js:25487) — la conferma la fa la scheda, nella sua testa
 * azioni.vediRichiesta() = il gestore di `#contestoRichiesta` (legacy/app.js:25725): la richiesta spedita al modello
 * azioni.cosaHaTenuto()  = il gestore di `#compattazioniTenuto` (legacy/app.js:25735)
 * azioni.esporta()       = `esportaTrascrizioneSessione('markdown')` (legacy/app.js:25734)
 * azioni.apriAlberoRami() = il velo `veloAlbero` (index.template.html:1371, `data-apre-velo`)
 * azioni.gestisciMcp()   = le impostazioni dei server MCP (Impostazioni → Strumenti)
 * azioni.vaiAlGiro(n)    = ⚠️ CABLAGGIO NUOVO: porta la chat al giro `n` (`.talos-turn-spine__n`), oggi l'indice non è cliccabile
 * azioni.apriMenu(voci, dove) = `apriMenuAzioniLibreria` (legacy/app.js:21359)
 */
import { t, tn } from '../lingua.js';
import { pausaComeInChat } from '../context-separator.js'; // revisore 06/11, punto 5: la pausa con le parole della chat
import { sceltaModelloDalContesto } from '../contesto-automatica.js';
import { limiteCheAgisce, ripartizioneSulLimite, compattazioniDellaConversazione, CHIAVI_CATEGORIA } from './fonti.js';
import {
  el, icona, bottone, statoUi, disegnaScheda, testa, sezione, riga, piega, vuoto, scheletro, kilo, oraBreve, chiediConferma,
  eseguiNellaRiga, bloccoDiTesta, perSessione, cifra,
} from './comune.js';
import { costoDelRiassunto, costoDeiRiassunti, testoCosto, contoTestataRiassunti } from '../spesa-riassunti.js'; // spesa dei riassunti (owner 30/10 sera)

const SVG_NS = 'http://www.w3.org/2000/svg';
const SOGLIA_AVVISO = 85; // Zed `thread_view.rs:4719` `if ratio >= 0.85`
const LEVA = Object.freeze({ tools: 'mcp', mcp: 'mcp', conversation: 'riassumi' });
/* Cache, punto 2 (owner 28/10/2026, contratto con la CLI §2): i motivi di `motivoDellaCacheRicominciata` (kernel/talosHarness.mjs) e la
   loro chiave. Un motivo che questa versione non conosce si dice come tale, non come «il fornitore non ha detto perché». */
const CHIAVI_MOTIVO_CACHE = Object.freeze({
  modello: 'pannello.contesto.cacheMotivoModello', attrezzi: 'pannello.contesto.cacheMotivoAttrezzi',
  'attrezzi-caricati': 'pannello.contesto.cacheMotivoAttrezziCaricati', sistema: 'pannello.contesto.cacheMotivoSistema',
  compattazione: 'pannello.contesto.cacheMotivoCompattazione', pausa: 'pannello.contesto.cacheMotivoPausa',
  sconosciuto: 'pannello.contesto.cacheMotivoSconosciuto',
  /* decisione 183 (04/11/2026): «sconosciuto» resta per gli eventi già scritti; il nucleo ora dice chi l'ha persa */
  fornitore: 'pannello.contesto.cacheMotivoFornitore', 'persa-dal-fornitore': 'pannello.contesto.cacheMotivoPersaDalFornitore',
});

/** L'ultima volta che la cache del fornitore è ripartita da capo (`talos.cache-ricominciata`), o `null`. PURA. */
export function cacheRipartita(evento) {
  if (!evento || typeof evento !== 'object' || typeof evento.motivo !== 'string' || !evento.motivo) return null;
  const at = typeof evento.at === 'string' ? Date.parse(evento.at) : Number.isFinite(evento.at) ? evento.at : Number.NaN;
  const token = Number.isFinite(evento.tokenDaRileggere) && evento.tokenDaRileggere > 0 ? evento.tokenDaRileggere : null;
  return { chiave: Object.hasOwn(CHIAVI_MOTIVO_CACHE, evento.motivo) ? CHIAVI_MOTIVO_CACHE[evento.motivo] : 'pannello.contesto.cacheMotivoAltro', at: Number.isFinite(at) ? at : null, token };
}

/**
 * Decisione 193 (owner 04/11/2026): l'elenco dei fornitori evitati dopo un evento `talos.fornitore-evitato`. PURA. `escluso` aggiunge (senza
 * doppioni); `nessun-fornitore-rimasto` (OpenRouter ha risposto 404: la sessione non evita più per quel modello) toglie quelli del modello.
 */
export function fornitoriEvitatiDopo(elenco, evento) {
  const prima = Array.isArray(elenco) ? elenco : [];
  if (!evento || typeof evento !== 'object') return prima;
  const modello = typeof evento.modello === 'string' ? evento.modello : null;
  if (evento.motivo === 'nessun-fornitore-rimasto') return prima.filter((f) => f.modello !== modello);
  if (evento.escluso !== true || typeof evento.fornitore !== 'string' || !evento.fornitore) return prima;
  if (prima.some((f) => f.fornitore === evento.fornitore && f.modello === modello)) return prima;
  return [...prima, { fornitore: evento.fornitore, modello }];
}

/** Il modello di vista, PURO. Percentuali TRONCATE a un decimale come `percento` (inspector.js:53), così tornano con le parti. */
export function modelloContesto(dati = {}) {
  const sc = dati.schedaContesto ?? null;
  const limite = limiteCheAgisce({ budget: sc?.budget ?? null, politica: sc?.politica ?? null });
  const usati = Number.isFinite(dati.usage?.prompt_tokens) && dati.usage.prompt_tokens > 0 ? dati.usage.prompt_tokens : null;
  const r = ripartizioneSulLimite({ ripartizione: sc?.ripartizione ?? null, usati, limite });
  const percentuale = limite && usati !== null ? Math.floor((usati / limite.soglia) * 1000) / 10 : null;
  const comp = compattazioniDellaConversazione({ motore: sc?.motore ?? null, legacy: sc?.legacy ?? null });
  const storia = Array.isArray(dati.storiaContesto) ? dati.storiaContesto.filter((p) => Number.isFinite(p?.token) && Number.isFinite(p?.giro)) : [];
  const riassunti = storia.filter((p) => p.compattazione).map((p) => ({ giro: p.giro, at: p.at, liberati: Math.max(0, (p.compattazione.prima ?? 0) - (p.compattazione.dopo ?? 0)), conModello: typeof p.compattazione.conModello === 'boolean' ? p.compattazione.conModello : null, dallaRiserva: p.compattazione.dallaRiserva === true,
    /* spesa dei riassunti (owner 30/10 sera): gli id del riassunto (due dopo `migliora`) e quanto sono costati; `null` = riassunto di prima */
    costo: costoDelRiassunto(dati.spesaRiassunti, p.compattazione.ids) })).reverse();
  const stimato = dati.usage?.stimato === true || limite?.fonte === 'fallback';
  const invio = Number.isFinite(dati.invio?.giri) && dati.invio.giri > 0 ? { giri: dati.invio.giri, tetto: Number.isFinite(dati.invio.tetto) && dati.invio.tetto > 0 ? dati.invio.tetto : null } : null;
  return {
    limite, usati, percentuale, stimato, oltre: r.oltre, restanti: r.restanti,
    voci: r.voci.map((v) => ({ ...v, leva: LEVA[v.id] ?? null })),
    numeroRiassunti: comp?.numero ?? riassunti.length,
    ultimoRiassunto: comp?.ultimaAl ? Date.parse(comp.ultimaAl) : null,
    riassunti, storia, invio,
    costoRiassunti: costoDeiRiassunti(dati.spesaRiassunti), // la testata: anche i pagati e mai applicati (sono spesi)
    invioVicino: Boolean(invio?.tetto && invio.giri / invio.tetto >= 0.8), // la regola di tono della pillola dei giri (`statoGiri`)
    attenzione: percentuale !== null && percentuale >= SOGLIA_AVVISO,
    /* Pannello calmo (owner 06/11 14:50): la compattazione automatica è accesa ⇒ oltre la soglia si compatta da sola, niente «Richiede
       attenzione». Solo un `true` detto da `datiSchedaContesto` (motore acceso, legacy, istantanea non ancora arrivata: revisore 06/11);
       `false` solo col motore spento dalla persona; le fixture senza campo restano quelle di oggi. */
    automatica: sc?.automatica === true,
    pausa: pausaDellaCompattazione(sc),
    giri: Array.isArray(dati.giri) ? dati.giri : [],
    cache: cacheRipartita(dati.cacheRicominciata),
    evitati: Array.isArray(dati.fornitoriEvitati) ? [...new Set(dati.fornitoriEvitati.map((f) => f?.fornitore).filter((n) => typeof n === 'string' && n))] : [],
  };
}

/**
 * Coordinatore 06/11/2026 (foto della pausa): dopo un riassunto automatico non riuscito il motore aspetta prima di riprovare
 * (`context.compaction.cooling`, `context-engine/src/engine.mjs:328`, gradini 60/300/900 s) e la chat lo dice. La scheda dice la stessa
 * cosa: solo con l'automatica accesa e finché l'orario del nuovo tentativo è nel futuro; scaduto, torna la riga calma. PURA.
 * Hermes `agent/context_compressor.py:3007` `should_compress_info`: «cooldown» si segnala solo quando serve compattare ed è bloccato.
 */
export function pausaDellaCompattazione(sc) {
  if (sc?.automatica !== true || !sc?.pausa || typeof sc.pausa !== 'object') return null;
  const quando = Date.parse(sc.pausa.retryAfter);
  if (!Number.isFinite(quando) || quando <= Date.now()) return null;
  return { quando, tentativi: Number.isFinite(sc.pausa.attempts) && sc.pausa.attempts > 0 ? sc.pausa.attempts : 1, codice: typeof sc.pausa.code === 'string' && sc.pausa.code ? sc.pausa.code : null };
}

/** Il conto sulla scheda: l'anello della finestra, ambra dall'85%. */
export function contoContesto(dati = {}) {
  const m = modelloContesto(dati);
  if (m.percentuale === null) return { numero: null, attenzione: 0 };
  return { anello: m.percentuale, attenzione: (m.attenzione && !m.automatica) || m.pausa ? 1 : 0, descrizione: t('pannello.contesto.contoScheda', { p: formatta(m.percentuale) }) };
}

const formatta = (p) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(p);

/**
 * `solo` (Context Manager variante B, owner 31/10/2026 notte): le parti da mostrare, cioè le chiavi delle sezioni (`tempo`, `categorie`,
 * `riassunti`…). Senza `solo` la scheda è quella di sempre del pannello di destra. Con `solo` restano SOLO quelle parti, senza testata
 * né indice dei giri: la finestra del Context Manager ne fa le sue pagine coi pezzi veri, mai una copia.
 */
export function disegnaContesto(contenitore, dati = {}, azioni = {}, { interno = false, solo = null } = {}) {
  const ui = statoUi(contenitore);
  perSessione(ui, dati.sessione); // al cambio di conversazione niente conferme o righe aperte di quella prima
  ui.dati = dati; ui.azioni = azioni;
  ui.larghezza = contenitore.clientWidth; // il grafico nel tempo occupa tutta la larghezza (owner 30/10 sera, «troppo piccolo»)
  ui.ridisegna = () => { ui.firmaDati = null; disegnaContesto(contenitore, ui.dati, ui.azioni, { interno: true, solo }); };
  /* ⛔ A16-INDICE-02 (portata al v2): la colonna si sincronizza da decine di punti dell'app, quasi sempre con gli STESSI dati. Una
     scheda ridisegnata per niente rifà l'indice di 1000+ giri e muove il DOM sotto chi legge. ⇒ Coi dati, la lingua e l'altezza di
     prima non si ridisegna; un gesto della persona (piega, pagina, conferma) passa da `ui.ridisegna`, che ridisegna sempre. */
  let firma = null;
  try { firma = JSON.stringify([dati, globalThis.document?.documentElement?.lang ?? '', contenitore.clientHeight, contenitore.clientWidth, solo]); } catch { firma = null; }
  if (!interno && firma !== null && firma === ui.firmaDati && ui.radice?.isConnected && ui.radice.parentNode === contenitore) return;
  ui.firmaDati = firma;
  disegnaScheda(contenitore, (d) => soloLeParti(costruisci(d, ui, dati, azioni), solo), { interno, adatta: !Array.isArray(solo) });
  /* Il grafico nel tempo alla larghezza VERA (owner 30/10 sera, «troppo piccolo»): la stima dal contenitore sbagliava di ~40 px (le
     cornici delle sezioni), e il disegno si scalava lo stesso. Disegnato, si legge la larghezza del suo `svg`: se la tela è diversa, si
     ridisegna UNA volta su quella misura — al giro dopo coincidono, quindi non c'è ciclo. */
  const svg = contenitore.querySelector?.('.pn-grafico svg');
  const vera = svg?.clientWidth ?? 0;
  /* ⛔ al più DUE correzioni di fila: se ogni ridisegno facesse comparire e sparire la barra di scorrimento, la larghezza del pannello
     cambierebbe a ogni giro e la correzione (sincrona) si richiamerebbe senza fine. Il conto riparte a ogni disegno che NON è una
     correzione (l'app, l'osservatore, un gesto). */
  if (!ui.inCorrezione) ui.correzioniGrafico = 0;
  if (vera > 0 && Math.abs(vera - (svg.viewBox?.baseVal?.width ?? vera)) > 2 && (ui.larghezzaGrafico !== vera || ui.larghezzaGraficoPer !== contenitore.clientWidth) && (ui.correzioniGrafico ?? 0) < 2) {
    ui.correzioniGrafico = (ui.correzioniGrafico ?? 0) + 1;
    ui.larghezzaGrafico = vera;
    ui.larghezzaGraficoPer = contenitore.clientWidth; // vale solo per QUESTA larghezza del pannello (vedi sotto, `misurata`)
    ui.inCorrezione = true;
    try { ui.ridisegna(); } finally { ui.inCorrezione = false; }
  }
}

/* Spesa dei riassunti (owner 30/10 sera): col costo la riga «liberati … · col modello · costato …» non sta nel pannello a 1920×1080 e il
   costo — l'informazione nuova — finiva tagliato («costato …», foto del 30/10). Il costo va su una riga sua, nel blocco a due righe che il
   pannello ha già (`pn-sotto__blocco`, agenti.js `rigaSotto`); le parole restano quelle del bozzetto. Senza costo, la riga di sempre. */
function sottoDelRiassunto(d, prima, costo) {
  if (!costo) return prima;
  const box = el(d, 'span', 'pn-sotto__blocco');
  box.append(el(d, 'span', 'pn-tronca', prima), el(d, 'span', 'pn-tronca', costo));
  box.lastChild.dataset.costoRiassunto = '';
  return box;
}

function chiediRiassunto(ui, azioni) {
  chiediConferma(ui, '__riassumi', {
    domanda: t('pannello.contesto.riassumiDomanda'), conseguenza: t('pannello.contesto.riassumiConseguenza'), etichetta: t('pannello.contesto.riassumiAdesso'), pericolo: false,
    fai: () => eseguiNellaRiga(ui, '__riassumi', () => azioni.riassumi(), { inCorso: t('pannello.contesto.riassumoInCorso'), fatto: (r) => (Number.isFinite(r?.liberati) ? tn('pannello.contesto.riassuntoFattoOne', 'pannello.contesto.riassuntoFattoMany', r.liberati, { k: kilo(r.liberati) }) : t('pannello.contesto.riassuntoFattoSenzaNumero')) }),
  });
}

/** Le parti chieste: una sezione per la sua chiave, una nota o una barra per la parte a cui appartiene (`data-parte`). */
function soloLeParti(pezzi, solo) {
  if (!Array.isArray(solo)) return pezzi;
  return pezzi.filter((p) => p && solo.includes(p.dataset?.sezione ?? p.dataset?.parte));
}

function costruisci(d, ui, dati, azioni) {
  /* 04/11 (owner dal vivo): mentre la chat rigioca la sua storia la scheda lo dice, coi secondi (storia a fette, `collegaEventiSessione`) */
  if (dati.storiaInCaricamento === true && !dati.usage) {
    return [riga(d, ui, { chiave: 'storia-in-corso', tono: 'corso', vivo: true, icona: 'i-list', nome: t('pannello.contesto.storiaInCorso'), sotto: t('pannello.contesto.storiaInCorsoSotto'), dal: dati.storiaDal }), scheletro(d)];
  }
  const m = modelloContesto(dati);
  const segno = m.stimato ? '~' : '';
  const conto = [];
  if (m.limite && m.usati !== null) conto.push(t('pannello.contesto.usatiDi', { usati: `${segno}${kilo(m.usati)}`, soglia: `${segno}${kilo(m.limite.soglia)}` }));
  else if (m.usati !== null) conto.push(t('pannello.contesto.limiteIgnoto'));
  if (m.numeroRiassunti) conto.push(tn('pannello.contesto.riassuntiOne', 'pannello.contesto.riassuntiMany', m.numeroRiassunti));
  if (m.invio) conto.push(m.invio.tetto ? { testo: t('pannello.contesto.invioDi', { n: m.invio.giri, tetto: m.invio.tetto }), tono: m.invioVicino ? 'avviso' : null } : tn('pannello.contesto.invioOne', 'pannello.contesto.invioMany', m.invio.giri));
  const titolo = m.pausa ? t('chat.context.separator.summaryFailed', { tentativi: '', riprova: '' }) : m.percentuale !== null
    ? (m.oltre ? t(m.automatica ? 'pannello.contesto.titoloOltreAutomatica' : 'pannello.contesto.titoloOltre') : t('pannello.contesto.titoloPercento', { p: `${segno}${formatta(m.percentuale)}` }))
    : m.usati !== null ? tn('pannello.contesto.titoloTokenOne', 'pannello.contesto.titoloTokenMany', m.usati, { k: kilo(m.usati) }) : t('pannello.contesto.titoloVuoto');
  const menu = [
    azioni.riassumi ? { chiave: 'riassumi', etichetta: t('pannello.contesto.riassumiAdesso'), icona: 'i-compatta', aziona: () => chiediRiassunto(ui, azioni) } : null,
    azioni.vediRichiesta ? { chiave: 'richiesta', etichetta: t('pannello.contesto.vediRichiesta'), icona: 'i-eye', aziona: () => azioni.vediRichiesta() } : null,
    azioni.cosaHaTenuto ? { // niente perso: oggi «Mostra cosa ha tenuto» c'è sempre (il record può esserci anche a conto zero, C1-SCHEDA-07)
      chiave: 'tenuto', etichetta: t('pannello.contesto.cosaHaTenuto'), icona: 'i-list', aziona: () => azioni.cosaHaTenuto() } : null,
    azioni.esporta ? { chiave: 'esporta', etichetta: t('pannello.contesto.esporta'), icona: 'i-download', separaPrima: true, aziona: () => azioni.esporta() } : null,
    azioni.apriAlberoRami ? { chiave: 'rami', etichetta: t('pannello.contesto.apriAlberoRami'), icona: 'i-branch', aziona: () => azioni.apriAlberoRami() } : null,
  ].filter(Boolean);
  const pezzi = [
    testa(d, ui, { quando: [t('pannello.contesto.questaConversazione'), dati.modello].filter(Boolean).join(' · '), titolo, conto, menu }),
    bloccoDiTesta(d, ui, '__riassumi'),
  ];
  if (m.usati === null && !m.storia.length) {
    pezzi.push(conParte(vuoto(d, { testo: t('pannello.contesto.vuoto'), azione: azioni.vediRichiesta ? { etichetta: t('pannello.contesto.vediRichiesta'), fai: () => azioni.vediRichiesta() } : null }), 'tempo'));
    /* ⛔ anche senza misure l'indice dei giri e l'albero dei rami ci sono (oggi la card dell'indice c'è sempre: ATTIVITA-CONTRATTO) */
    return pezziDopoIDettagli(d, ui, m, azioni, [...pezzi, ...pieghePerDettagli(d, ui, dati)]);
  }
  /* ⭐ 29/10 sera: anche il grafico è una sezione che si piega (e che si ripiega da sola se lo spazio non basta) */
  if (m.storia.length > 1 && m.limite) pezzi.push(sezione(d, { ui, chiave: 'tempo', titolo: t('pannello.contesto.nelTempo') }, [grafico(d, ui, m)]));
  else if (m.limite) pezzi.push(conParte(barraSola(d, m), 'tempo'));

  /* ── da guardare: la finestra quasi piena, con l'azione accanto (Zed «Start New Thread», Cline «Compatta») ── */
  if (m.pausa) {
    /* Coordinatore 06/11/2026: in pausa la scheda dice ciò che dice la chat e «Compatta ora» torna primario: è l'unico modo di compattare
       prima del nuovo tentativo. Revisore 06/11 (punto 5): la frase è QUELLA della chat (`pausaComeInChat`, causa e rimedio), e quando
       la causa è il modello del riassunto c'è lo stesso «Scegli un altro modello», primario: «Compatta ora» riuserebbe lo stesso modello. */
    const chat = pausaComeInChat({ code: m.pausa.codice, attempts: m.pausa.tentativi, retryAfter: new Date(m.pausa.quando).toISOString() });
    const scegli = bottone(d, { etichetta: t('chat.context.separator.chooseModel'), chiave: 'scegli-modello', fai: () => sceltaModelloDalContesto(d) });
    pezzi.push(sezione(d, { ui, chiave: 'automatica', titolo: t('pannello.contesto.automaticaTitolo') }, [riga(d, ui, {
      chiave: 'compatta-in-pausa', tono: 'avviso', icona: 'i-alert',
      /* il nome corto (quello lungo si tagliava a 1920×1080, foto del 06/11); il perché è la frase della chat, parola per parola */
      nome: t('pannello.contesto.pausaNome'),
      perche: chat.testo,
      azioni: [chat.scegli ? scegli : null, azioni.riassumi ? bottone(d, { etichetta: t('pannello.contesto.riassumiAdesso'), chiave: 'riassumi', variante: chat.scegli ? 'secondary' : undefined, fai: () => chiediRiassunto(ui, azioni) }) : null].filter(Boolean),
    })]));
  } else if (m.attenzione && m.automatica) {
    /* Pannello calmo (owner 06/11 14:50): con la compattazione automatica accesa niente da guardare, una riga che dice che ci pensa da
       sola; «Compatta ora» resta, secondario (Hermes `context_compressor.py:3007` compatta da solo al prossimo giro, senza chiedere). */
    pezzi.push(sezione(d, { ui, chiave: 'automatica', titolo: t('pannello.contesto.automaticaTitolo') }, [riga(d, ui, {
      chiave: 'compatta-da-sola', tono: 'neutro', icona: 'i-compatta', nome: t('pannello.contesto.automaticaNome'),
      perche: m.oltre ? t('pannello.contesto.automaticaOltrePerche') : t('pannello.contesto.automaticaVicinaPerche'),
      azioni: azioni.riassumi ? [bottone(d, { etichetta: t('pannello.contesto.riassumiAdesso'), chiave: 'riassumi', variante: 'secondary', fai: () => chiediRiassunto(ui, azioni) })] : [],
    })]));
  } else if (m.attenzione) {
    pezzi.push(sezione(d, { ui, chiave: 'attenzione', titolo: t('pannello.comune.richiedeAttenzione'), conto: 1, attenzione: true }, [riga(d, ui, {
      chiave: 'quasi-piena', tono: 'avviso', icona: 'i-alert', nome: m.oltre ? t('pannello.contesto.oltreNome') : t('pannello.contesto.quasiPienaNome'),
      perche: m.oltre ? tn('pannello.contesto.oltrePercheOne', 'pannello.contesto.oltrePercheMany', -m.restanti, { k: kilo(-m.restanti) }) : tn('pannello.contesto.quasiPienaPercheOne', 'pannello.contesto.quasiPienaPercheMany', m.restanti, { k: kilo(m.restanti), soglia: kilo(m.limite.soglia) }),
      azioni: azioni.riassumi ? [bottone(d, { etichetta: t('pannello.contesto.riassumiAdesso'), chiave: 'riassumi', fai: () => chiediRiassunto(ui, azioni) })] : [],
    })]));
  }

  /* ── cosa occupa la finestra: una riga per categoria, ognuna con la sua leva ── */
  pezzi.push(sezione(d, { ui, chiave: 'categorie', titolo: t('pannello.contesto.cosaOccupa'), conto: m.voci.length || null }, m.voci.map((v) => {
    const barra = el(d, 'div', 'pn-barretta');
    const pieno = el(d, 'span');
    pieno.style.width = `${Math.max(1, v.percentuale ?? 0)}%`;
    pieno.dataset.categoria = v.id;
    barra.append(pieno);
    const consiglio = v.leva === 'mcp' && (v.percentuale ?? 0) >= 20 ? t('pannello.contesto.consiglioMcp') : null;
    const perche = el(d, 'span', 'pn-perche__corpo');
    if (consiglio) perche.append(el(d, 'span', 'pn-consiglio', consiglio));
    perche.append(barra);
    return riga(d, ui, {
      chiave: `cat-${v.id}`, tono: 'neutro', icona: v.id === 'conversation' ? 'i-list' : v.id === 'memory' ? 'i-book-marked' : v.id === 'mcp' || v.id === 'tools' ? 'i-settings' : 'i-doc',
      nome: t(CHIAVI_CATEGORIA[v.id]), sotto: tn('pannello.contesto.tokenStimatiOne', 'pannello.contesto.tokenStimatiMany', v.tokens, { k: kilo(v.tokens) }), perche,
      lato: v.percentuale === null ? null : `${formatta(Math.floor(v.percentuale * 10) / 10)}%`,
      menu: v.leva === 'mcp' && azioni.gestisciMcp ? () => [{ chiave: 'mcp', etichetta: t('pannello.contesto.gestisciMcp'), icona: 'i-settings', aziona: () => azioni.gestisciMcp() }]
        : v.leva === 'riassumi' && azioni.riassumi ? () => [{ chiave: 'riassumi', etichetta: t('pannello.contesto.riassumiAdesso'), icona: 'i-compatta', aziona: () => chiediRiassunto(ui, azioni) }] : null,
    });
  })));
  if (m.limite && m.restanti !== null && !m.oltre) {
    const libero = el(d, 'p', 'pn-nota', t('pannello.contesto.liberoPrimaDelRiassunto', { k: kilo(m.restanti) }));
    if (dati.cacheTesto) libero.append(d.createTextNode(` · ${t('pannello.contesto.cache', { testo: dati.cacheTesto })}`));
    pezzi.push(conParte(libero, 'categorie'));
  }
  if (m.cache) {
    const motivo = t(m.cache.chiave);
    const frase = m.cache.at !== null ? t('pannello.contesto.cacheRipartitaAlle', { ora: oraBreve(m.cache.at), motivo }) : t('pannello.contesto.cacheRipartita', { motivo });
    const nota = el(d, 'p', 'pn-nota', m.cache.token !== null ? `${frase} ${tn('pannello.contesto.cacheRilettiOne', 'pannello.contesto.cacheRilettiMany', m.cache.token, { k: kilo(m.cache.token) })}` : frase);
    nota.dataset.contestoCache = '';
    pezzi.push(conParte(nota, 'cache')); // FE-039: nel Context Manager «una nota sotto i numeri»; senza `solo` resta dov'era
  }
  /* decisione 193: una nota per fornitore evitato, sotto quella della cache e con la stessa forma (niente avvisi, niente carte) */
  for (const nome of m.evitati) {
    const nota = el(d, 'p', 'pn-nota', t('pannello.contesto.cacheFornitoreEvitato', { nome }));
    nota.dataset.contestoFornitoreEvitato = '';
    pezzi.push(conParte(nota, 'cache'));
  }

  /* ── i riassunti, il più recente in cima ── */
  const righeRiassunti = m.riassunti.length
    ? m.riassunti.map((x) => riga(d, ui, {
      chiave: `riassunto-${x.giro}`, tono: 'ok', icona: 'i-compatta', nome: t('pannello.contesto.riassuntoAlGiro', { n: x.giro }),
      sotto: sottoDelRiassunto(d, [tn('pannello.contesto.liberatiOne', 'pannello.contesto.liberatiMany', x.liberati, { k: kilo(x.liberati) }), x.conModello === true ? t(x.dallaRiserva ? 'pannello.contesto.dallaRiserva' : 'pannello.contesto.colModello') : x.conModello === false ? t('pannello.contesto.senzaModello') : null].filter(Boolean).join(' · '), // senza il dato non si dice «col modello»
        testoCosto(x.costo, kilo)),
      lato: oraBreve(x.at), primaria: () => azioni.vaiAlGiro?.(x.giro),
      menu: azioni.cosaHaTenuto ? () => [{ chiave: 'tenuto', etichetta: t('pannello.contesto.cosaHaTenuto'), icona: 'i-list', aziona: () => azioni.cosaHaTenuto() }, ...(azioni.vaiAlGiro ? [{ chiave: 'giro', etichetta: t('pannello.contesto.vaiAlGiro'), icona: 'i-arrow-left', aziona: () => azioni.vaiAlGiro(x.giro) }] : [])] : null,
    }))
    : m.numeroRiassunti ? [riga(d, ui, { chiave: 'riassunti', tono: 'ok', icona: 'i-compatta', nome: tn('pannello.contesto.riassuntiOne', 'pannello.contesto.riassuntiMany', m.numeroRiassunti), sotto: m.ultimoRiassunto ? t('pannello.contesto.ultimoAlle', { ora: oraBreve(m.ultimoRiassunto) }) : '', primaria: () => azioni.cosaHaTenuto?.() })] : [];
  pezzi.push(sezione(d, { ui, chiave: 'riassunti', titolo: t('pannello.contesto.riassunti'), conto: contoTestataRiassunti(m.numeroRiassunti, m.costoRiassunti, kilo, cifra), spina: true }, righeRiassunti));

  pezzi.push(...pieghePerDettagli(d, ui, dati));
  return pezziDopoIDettagli(d, ui, m, azioni, pezzi);
}

/* ── niente perso: le righe di oggi delle card «Finestra del contesto» e «Compattazioni», chiuse (inspector.js le prepara) ── */
function pieghePerDettagli(d, ui, dati) {
  const pezzi = [];
  const det = dati.dettagli ?? null;
  if (det?.finestra?.length) {
    pezzi.push(piega(d, ui, {
      chiave: 'dettagli-finestra', titolo: t('modello.inspector.contextWindow'), sotto: det.perche || '',
      contenuto: () => {
        const righe = det.finestra.map((r) => kvDiOggi(d, r));
        if (det.perche) { const p = el(d, 'p', 'talos-inspector__hint', det.perche); p.dataset.contestoPerche = ''; righe.push(p); }
        return righe;
      },
    }));
  }
  if (det?.compattazioni?.length) {
    pezzi.push(piega(d, ui, { chiave: 'dettagli-compattazioni', titolo: t('modello.inspector.compactions'), contenuto: () => det.compattazioni.map((r) => kvDiOggi(d, r)) }));
  }
  return pezzi;
}

function pezziDopoIDettagli(d, ui, m, azioni, pezzi) {

  /* ── l'indice dei giri e l'albero dei rami, chiusi ── */
  if (m.giri.length) {
    const tu = m.giri.filter((g) => g.tu).length;
    pezzi.push(conNome(piega(d, ui, {
      chiave: 'giri', titolo: t('pannello.contesto.indiceGiri'),
      sotto: [tn('pannello.contesto.giriOne', 'pannello.contesto.giriMany', m.giri.length - tu), tu ? tn('pannello.contesto.messaggiOne', 'pannello.contesto.messaggiMany', tu) : null].filter(Boolean).join(' · '),
      contenuto: () => [...m.giri].reverse().map((g) => riga(d, ui, {
        chiave: `giro-${g.numero}`, tono: g.inCorso ? 'corso' : g.senzaContatto ? 'avviso' : 'neutro', icona: g.tu ? 'i-user' : 'i-list',
        nome: `${g.numero} · ${g.titolo || (g.tu ? t('pannello.contesto.messaggio') : t('pannello.contesto.giro'))}`,
        lato: g.tu ? null : g.inCorso ? t('processi.inspector.turnRunning') : Number.isFinite(g.attrezzi) && g.attrezzi ? tn('pannello.contesto.attrezziOne', 'pannello.contesto.attrezziMany', g.attrezzi) : null,
        primaria: azioni.vaiAlGiro ? () => azioni.vaiAlGiro(g.numero) : null,
      })),
    }), 'TurnIndex'));
  }
  if (azioni.apriAlberoRami) {
    pezzi.push(piega(d, ui, { chiave: 'rami', titolo: t('pannello.contesto.alberoRami'), sotto: t('pannello.contesto.alberoRamiSotto'), contenuto: () => vuoto(d, { testo: t('pannello.contesto.alberoRamiTesto'), azione: { etichetta: t('pannello.contesto.apriAlberoRami'), fai: () => azioni.apriAlberoRami() } }) }));
  }
  return pezzi;
}

/** Una riga di oggi (`kv` di inspector.js): chiave e valore, «stima» con la «~» della classe delle stime, «a-capo» che va a capo. */
function kvDiOggi(d, r) {
  const riga = el(d, 'div', 'talos-kv');
  const classe = r[2] === 'stima' ? ' talos-measure--estimate' : r[2] === 'a-capo' ? ' talos-kv__v--a-capo' : '';
  riga.append(el(d, 'span', 'talos-kv__k', r[0]), el(d, 'span', `talos-kv__v${classe}`, r[1]));
  return riga;
}

/** Senza storia: la barra della finestra per categoria, con la tacca della soglia (come la panoramica, contesto-scheda.js:73). */
function barraSola(d, m) {
  const box = el(d, 'div', 'pn-grafico pn-grafico--barra');
  const barra = el(d, 'div', 'pn-barra-finestra');
  barra.setAttribute('role', 'img');
  barra.setAttribute('aria-label', t('pannello.contesto.titoloPercento', { p: formatta(m.percentuale ?? 0) }));
  for (const v of m.voci) { const s = el(d, 'span'); s.dataset.categoria = v.id; s.style.width = `${Math.min(100, v.percentuale ?? 0)}%`; barra.append(s); }
  box.append(barra, el(d, 'div', 'pn-grafico__legenda', t('pannello.contesto.storiaInArrivo')));
  return box;
}

/**
 * Il contesto NEL TEMPO: un punto per invio, la soglia del riassunto tratteggiata, e dove un riassunto ha liberato spazio. Passando
 * col puntatore (o con le frecce, a grafico col fuoco) si legge il giro: «giro 9 · 49k».
 */
function grafico(d, ui, m) {
  /* Owner 30/10/2026 sera, con la foto: «troppo piccolo il grafico». La tela era fissa (300×98) dentro un `svg` alto 96 px: in un pannello
     largo il grafico restava di ~300 px, centrato fra due vuoti. Ora la tela è larga quanto il pannello (la larghezza è già nella firma
     della scheda: cambiandola si ridisegna) e l'altezza cresce con lei, entro un tetto; il testo resta alla sua misura (scala 1:1). */
  /* ⛔ 31/10/2026 (PNCTX-GRAFICO-01 rossa sotto carico nella suite del blocco): la misura del disegno di prima vale solo se il pannello è
     ancora largo come quando è stata presa. Allargato o stretto, si riparte dalla stima del contenitore e il controllo dopo il disegno
     la corregge — riusarla disegnava il grafico alla larghezza vecchia. */
  const misurata = Number.isFinite(ui.larghezzaGrafico) && ui.larghezzaGrafico > 0 && ui.larghezzaGraficoPer === ui.larghezza ? ui.larghezzaGrafico : null;
  const W = Math.max(200, Math.round(misurata ?? ((Number.isFinite(ui.larghezza) && ui.larghezza > 0 ? ui.larghezza : 324) - 24)));
  const H = Math.min(200, Math.max(110, Math.round(W * 0.3))), B = 14; // anche nel pannello stretto più alto di prima (84)
  const scala = Math.max(m.limite.finestra ?? m.limite.soglia, ...m.storia.map((p) => p.token)) * 1.04;
  const x = (i) => 6 + (i * (W - 12)) / Math.max(1, m.storia.length - 1);
  const y = (v) => H - (v / scala) * (H - 6);
  const box = el(d, 'div', 'pn-grafico');
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + B}`);
  svg.style.height = `${H + B}px`; // l'altezza della tela, non i 96 px fissi di prima (pannello.css)
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('pannello.contesto.graficoEtichetta', { n: m.storia.length, r: m.riassunti.length }));
  svg.setAttribute('tabindex', '0');
  const nodo = (tag, attr) => { const n = d.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attr)) n.setAttribute(k, String(v)); svg.append(n); return n; };
  const punti = m.storia.map((p, i) => `${x(i).toFixed(1)},${y(p.token).toFixed(1)}`).join(' ');
  nodo('polygon', { class: 'pn-grafico__area', points: `${x(0)},${H} ${punti} ${x(m.storia.length - 1)},${H}` });
  nodo('polyline', { class: 'pn-grafico__linea', points: punti });
  const ys = y(m.limite.soglia);
  nodo('line', { class: 'pn-grafico__soglia', x1: 0, x2: W, y1: ys, y2: ys });
  const ts = nodo('text', { x: W - 2, y: ys - 3, 'text-anchor': 'end' }); ts.textContent = t('pannello.contesto.sogliaGrafico', { k: kilo(m.limite.soglia) });
  const ultimo = m.storia.length - 1;
  /* le etichette sotto l'asse non si sovrappongono: una che cadrebbe a meno di 34 unità dalla precedente si salta (resta la tacca) */
  let ultimaX = -Infinity;
  const etichetta = (xx, testo, ancora) => { if (xx - ultimaX < 34) return; ultimaX = xx; const tt = nodo('text', { x: xx, y: H + 11, 'text-anchor': ancora }); tt.textContent = testo; };
  m.storia.forEach((p, i) => {
    if (!p.compattazione) return;
    nodo('line', { class: 'pn-grafico__taglio', x1: x(i), x2: x(i), y1: y(p.compattazione.prima ?? p.token) - 2, y2: H });
    etichetta(x(i), t('pannello.contesto.giroCorto', { n: p.giro }), i === ultimo ? 'end' : 'middle');
  });
  etichetta(x(ultimo), t('pannello.contesto.ora'), 'end');
  const cursore = nodo('line', { class: 'pn-grafico__cursore', x1: 0, x2: 0, y1: 0, y2: H });
  const puntino = nodo('circle', { class: 'pn-grafico__punto', r: 3, cx: x(ultimo), cy: y(m.storia[ultimo].token) });
  box.append(svg);
  const lettura = el(d, 'div', 'pn-grafico__legenda');
  lettura.setAttribute('aria-live', 'polite');
  const scrivi = (i) => {
    const p = m.storia[i];
    cursore.setAttribute('x1', x(i)); cursore.setAttribute('x2', x(i)); cursore.removeAttribute('visibility');
    puntino.setAttribute('cx', x(i)); puntino.setAttribute('cy', y(p.token));
    svg.dataset.cursore = String(i);
    lettura.textContent = p.compattazione
      ? t('pannello.contesto.letturaRiassunto', { n: p.giro, k: kilo(p.token), liberati: kilo(Math.max(0, (p.compattazione.prima ?? 0) - (p.compattazione.dopo ?? 0))) })
      : t('pannello.contesto.lettura', { n: p.giro, k: kilo(p.token), ora: oraBreve(p.at) });
  };
  const riposo = () => { delete svg.dataset.cursore; cursore.setAttribute('visibility', 'hidden'); puntino.setAttribute('cx', x(ultimo)); puntino.setAttribute('cy', y(m.storia[ultimo].token)); lettura.textContent = t('pannello.contesto.legenda'); };
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    scrivi(Math.max(0, Math.min(ultimo, Math.round(((fx - 6) / (W - 12)) * ultimo))));
  });
  svg.addEventListener('pointerleave', riposo);
  svg.addEventListener('blur', riposo);
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = Number(svg.dataset.cursore ?? ultimo) + (e.key === 'ArrowRight' ? 1 : -1);
    scrivi(Math.max(0, Math.min(ultimo, i)));
  });
  riposo();
  box.append(lettura);
  return box;
}

/** Il nome di componente di oggi sulla piega (`data-c`, come `ProcessRow` e `AgentRow`): le prove e gli strumenti lo cercano lì. */
/** A quale parte appartiene un pezzo senza sezione sua (per `solo`). */
function conParte(nodo, parte) { if (nodo?.dataset) nodo.dataset.parte = parte; return nodo; }
function conNome(nodo, nome) { if (nodo?.dataset) nodo.dataset.c = nome; return nodo; }
