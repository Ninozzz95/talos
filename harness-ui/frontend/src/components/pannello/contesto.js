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
 * dati.modello        = il nome corto del modello della conversazione (`state.model`, senza il fornitore: regola 13/10).
 * dati.storiaContesto = ⚠️ DATI NUOVI LATO CLIENT: `[{ giro, at, token, compattazione?: { prima, dopo, conModello } }]`, un punto
 *                       per invio chiuso. Il valore c'è già nel giornale (StateDelta `/usage`, legacy/app.js:24232, rigiocato
 *                       anche alla riapertura): basta tenerne la serie (MAPPA.md, C-05). Senza, il grafico non si disegna.
 * dati.storiaInCaricamento = vero mentre la storia della sessione arriva (A1-bis): niente numeri intermedi.
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
import { limiteCheAgisce, ripartizioneSulLimite, compattazioniDellaConversazione, CHIAVI_CATEGORIA } from './fonti.js';
import {
  el, icona, bottone, statoUi, disegnaScheda, testa, sezione, riga, piega, vuoto, scheletro, kilo, oraBreve, chiediConferma,
  eseguiNellaRiga, bloccoDiTesta, perSessione,
} from './comune.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SOGLIA_AVVISO = 85; // Zed `thread_view.rs:4719` `if ratio >= 0.85`
const LEVA = Object.freeze({ tools: 'mcp', mcp: 'mcp', conversation: 'riassumi' });

/** Il modello di vista, PURO. Percentuali TRONCATE a un decimale come `percento` (inspector.js:53), così tornano con le parti. */
export function modelloContesto(dati = {}) {
  const sc = dati.schedaContesto ?? null;
  const limite = limiteCheAgisce({ budget: sc?.budget ?? null, politica: sc?.politica ?? null });
  const usati = Number.isFinite(dati.usage?.prompt_tokens) && dati.usage.prompt_tokens > 0 ? dati.usage.prompt_tokens : null;
  const r = ripartizioneSulLimite({ ripartizione: sc?.ripartizione ?? null, usati, limite });
  const percentuale = limite && usati !== null ? Math.floor((usati / limite.soglia) * 1000) / 10 : null;
  const comp = compattazioniDellaConversazione({ motore: sc?.motore ?? null, legacy: sc?.legacy ?? null });
  const storia = Array.isArray(dati.storiaContesto) ? dati.storiaContesto.filter((p) => Number.isFinite(p?.token) && Number.isFinite(p?.giro)) : [];
  const riassunti = storia.filter((p) => p.compattazione).map((p) => ({ giro: p.giro, at: p.at, liberati: Math.max(0, (p.compattazione.prima ?? 0) - (p.compattazione.dopo ?? 0)), conModello: typeof p.compattazione.conModello === 'boolean' ? p.compattazione.conModello : null })).reverse();
  const stimato = dati.usage?.stimato === true || limite?.fonte === 'fallback';
  const invio = Number.isFinite(dati.invio?.giri) && dati.invio.giri > 0 ? { giri: dati.invio.giri, tetto: Number.isFinite(dati.invio.tetto) && dati.invio.tetto > 0 ? dati.invio.tetto : null } : null;
  return {
    limite, usati, percentuale, stimato, oltre: r.oltre, restanti: r.restanti,
    voci: r.voci.map((v) => ({ ...v, leva: LEVA[v.id] ?? null })),
    numeroRiassunti: comp?.numero ?? riassunti.length,
    ultimoRiassunto: comp?.ultimaAl ? Date.parse(comp.ultimaAl) : null,
    riassunti, storia, invio,
    invioVicino: Boolean(invio?.tetto && invio.giri / invio.tetto >= 0.8), // la regola di tono della pillola dei giri (`statoGiri`)
    attenzione: percentuale !== null && percentuale >= SOGLIA_AVVISO,
    giri: Array.isArray(dati.giri) ? dati.giri : [],
  };
}

/** Il conto sulla scheda: l'anello della finestra, ambra dall'85%. */
export function contoContesto(dati = {}) {
  const m = modelloContesto(dati);
  if (m.percentuale === null) return { numero: null, attenzione: 0 };
  return { anello: m.percentuale, attenzione: m.attenzione ? 1 : 0, descrizione: t('pannello.contesto.contoScheda', { p: formatta(m.percentuale) }) };
}

const formatta = (p) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(p);

export function disegnaContesto(contenitore, dati = {}, azioni = {}, { interno = false } = {}) {
  const ui = statoUi(contenitore);
  perSessione(ui, dati.sessione); // al cambio di conversazione niente conferme o righe aperte di quella prima
  ui.dati = dati; ui.azioni = azioni;
  ui.ridisegna = () => { ui.firmaDati = null; disegnaContesto(contenitore, ui.dati, ui.azioni, { interno: true }); };
  /* ⛔ A16-INDICE-02 (portata al v2): la colonna si sincronizza da decine di punti dell'app, quasi sempre con gli STESSI dati. Una
     scheda ridisegnata per niente rifà l'indice di 1000+ giri e muove il DOM sotto chi legge. ⇒ Coi dati, la lingua e l'altezza di
     prima non si ridisegna; un gesto della persona (piega, pagina, conferma) passa da `ui.ridisegna`, che ridisegna sempre. */
  let firma = null;
  try { firma = JSON.stringify([dati, globalThis.document?.documentElement?.lang ?? '', contenitore.clientHeight, contenitore.clientWidth]); } catch { firma = null; }
  if (!interno && firma !== null && firma === ui.firmaDati && ui.radice?.isConnected && ui.radice.parentNode === contenitore) return;
  ui.firmaDati = firma;
  disegnaScheda(contenitore, (d) => costruisci(d, ui, dati, azioni), { interno });
}

function chiediRiassunto(ui, azioni) {
  chiediConferma(ui, '__riassumi', {
    domanda: t('pannello.contesto.riassumiDomanda'), conseguenza: t('pannello.contesto.riassumiConseguenza'), etichetta: t('pannello.contesto.riassumiAdesso'), pericolo: false,
    fai: () => eseguiNellaRiga(ui, '__riassumi', () => azioni.riassumi(), { inCorso: t('pannello.contesto.riassumoInCorso'), fatto: (r) => (Number.isFinite(r?.liberati) ? tn('pannello.contesto.riassuntoFattoOne', 'pannello.contesto.riassuntoFattoMany', r.liberati, { k: kilo(r.liberati) }) : t('pannello.contesto.riassuntoFattoSenzaNumero')) }),
  });
}

function costruisci(d, ui, dati, azioni) {
  if (dati.storiaInCaricamento === true && !dati.usage) return [scheletro(d)];
  const m = modelloContesto(dati);
  const segno = m.stimato ? '~' : '';
  const conto = [];
  if (m.limite && m.usati !== null) conto.push(t('pannello.contesto.usatiDi', { usati: `${segno}${kilo(m.usati)}`, soglia: `${segno}${kilo(m.limite.soglia)}` }));
  else if (m.usati !== null) conto.push(t('pannello.contesto.limiteIgnoto'));
  if (m.numeroRiassunti) conto.push(tn('pannello.contesto.riassuntiOne', 'pannello.contesto.riassuntiMany', m.numeroRiassunti));
  if (m.invio) conto.push(m.invio.tetto ? { testo: t('pannello.contesto.invioDi', { n: m.invio.giri, tetto: m.invio.tetto }), tono: m.invioVicino ? 'avviso' : null } : tn('pannello.contesto.invioOne', 'pannello.contesto.invioMany', m.invio.giri));
  const titolo = m.percentuale !== null
    ? (m.oltre ? t('pannello.contesto.titoloOltre') : t('pannello.contesto.titoloPercento', { p: `${segno}${formatta(m.percentuale)}` }))
    : m.usati !== null ? tn('pannello.contesto.titoloTokenOne', 'pannello.contesto.titoloTokenMany', m.usati, { k: kilo(m.usati) }) : t('pannello.contesto.titoloVuoto');
  const menu = [
    azioni.riassumi ? { chiave: 'riassumi', etichetta: t('pannello.contesto.riassumiAdesso'), icona: 'i-layers', aziona: () => chiediRiassunto(ui, azioni) } : null,
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
    pezzi.push(vuoto(d, { testo: t('pannello.contesto.vuoto'), azione: azioni.vediRichiesta ? { etichetta: t('pannello.contesto.vediRichiesta'), fai: () => azioni.vediRichiesta() } : null }));
    /* ⛔ anche senza misure l'indice dei giri e l'albero dei rami ci sono (oggi la card dell'indice c'è sempre: ATTIVITA-CONTRATTO) */
    return pezziDopoIDettagli(d, ui, m, azioni, [...pezzi, ...pieghePerDettagli(d, ui, dati)]);
  }
  /* ⭐ 29/10 sera: anche il grafico è una sezione che si piega (e che si ripiega da sola se lo spazio non basta) */
  if (m.storia.length > 1 && m.limite) pezzi.push(sezione(d, { ui, chiave: 'tempo', titolo: t('pannello.contesto.nelTempo') }, [grafico(d, ui, m)]));
  else if (m.limite) pezzi.push(barraSola(d, m));

  /* ── da guardare: la finestra quasi piena, con l'azione accanto (Zed «Start New Thread», Cline «Compatta») ── */
  if (m.attenzione) {
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
      chiave: `cat-${v.id}`, tono: 'neutro', icona: v.id === 'conversation' ? 'i-list' : v.id === 'memory' ? 'i-brain' : v.id === 'mcp' || v.id === 'tools' ? 'i-settings' : 'i-doc',
      nome: t(CHIAVI_CATEGORIA[v.id]), sotto: tn('pannello.contesto.tokenStimatiOne', 'pannello.contesto.tokenStimatiMany', v.tokens, { k: kilo(v.tokens) }), perche,
      lato: v.percentuale === null ? null : `${formatta(Math.floor(v.percentuale * 10) / 10)}%`,
      menu: v.leva === 'mcp' && azioni.gestisciMcp ? () => [{ chiave: 'mcp', etichetta: t('pannello.contesto.gestisciMcp'), icona: 'i-settings', aziona: () => azioni.gestisciMcp() }]
        : v.leva === 'riassumi' && azioni.riassumi ? () => [{ chiave: 'riassumi', etichetta: t('pannello.contesto.riassumiAdesso'), icona: 'i-layers', aziona: () => chiediRiassunto(ui, azioni) }] : null,
    });
  })));
  if (m.limite && m.restanti !== null && !m.oltre) {
    const libero = el(d, 'p', 'pn-nota', t('pannello.contesto.liberoPrimaDelRiassunto', { k: kilo(m.restanti) }));
    if (dati.cacheTesto) libero.append(d.createTextNode(` · ${t('pannello.contesto.cache', { testo: dati.cacheTesto })}`));
    pezzi.push(libero);
  }

  /* ── i riassunti, il più recente in cima ── */
  const righeRiassunti = m.riassunti.length
    ? m.riassunti.map((x) => riga(d, ui, {
      chiave: `riassunto-${x.giro}`, tono: 'ok', icona: 'i-layers', nome: t('pannello.contesto.riassuntoAlGiro', { n: x.giro }),
      sotto: [tn('pannello.contesto.liberatiOne', 'pannello.contesto.liberatiMany', x.liberati, { k: kilo(x.liberati) }), x.conModello === true ? t('pannello.contesto.colModello') : x.conModello === false ? t('pannello.contesto.senzaModello') : null].filter(Boolean).join(' · '), // senza il dato non si dice «col modello»
      lato: oraBreve(x.at), primaria: () => azioni.vaiAlGiro?.(x.giro),
      menu: azioni.cosaHaTenuto ? () => [{ chiave: 'tenuto', etichetta: t('pannello.contesto.cosaHaTenuto'), icona: 'i-list', aziona: () => azioni.cosaHaTenuto() }, ...(azioni.vaiAlGiro ? [{ chiave: 'giro', etichetta: t('pannello.contesto.vaiAlGiro'), icona: 'i-arrow-left', aziona: () => azioni.vaiAlGiro(x.giro) }] : [])] : null,
    }))
    : m.numeroRiassunti ? [riga(d, ui, { chiave: 'riassunti', tono: 'ok', icona: 'i-layers', nome: tn('pannello.contesto.riassuntiOne', 'pannello.contesto.riassuntiMany', m.numeroRiassunti), sotto: m.ultimoRiassunto ? t('pannello.contesto.ultimoAlle', { ora: oraBreve(m.ultimoRiassunto) }) : '', primaria: () => azioni.cosaHaTenuto?.() })] : [];
  pezzi.push(sezione(d, { ui, chiave: 'riassunti', titolo: t('pannello.contesto.riassunti'), conto: m.numeroRiassunti, spina: true }, righeRiassunti));

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
  const W = 300, H = 84, B = 14;
  const scala = Math.max(m.limite.finestra ?? m.limite.soglia, ...m.storia.map((p) => p.token)) * 1.04;
  const x = (i) => 6 + (i * (W - 12)) / Math.max(1, m.storia.length - 1);
  const y = (v) => H - (v / scala) * (H - 6);
  const box = el(d, 'div', 'pn-grafico');
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + B}`);
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
function conNome(nodo, nome) { if (nodo?.dataset) nodo.dataset.c = nome; return nodo; }
