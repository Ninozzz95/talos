/*
 * PANNELLO v2 — la scheda FILE, ALTERNATIVA MINIMA (MAPPA §5, «File, alternativa minima»). L'esploratore di oggi resta quello di
 * `legacy/app.js` (testa, viste, ricerca, albero, selezione, F2, trascinamento, lettore), con gli stessi id e le stesse prove: questo
 * modulo NON lo ridisegna. Porta solo le AGGIUNTE del kit (pannello-destro-2026-10-29/kit-v2, src/components/pannello/file.js):
 *   (a) le due viste in più del selettore di oggi, «Toccati in questa richiesta» e «Toccati in questa conversazione», con le righe v2
 *       (chi ha scritto o letto, in quale giro, collisioni, «Vedi le differenze»);
 *   (c) la striscia «N file scritti da due · Vedi» sopra l'albero, solo con collisioni;
 *   e il conto sulla scheda («File N •»).
 * Il modello (`modelloFile`) e il disegno delle righe sono quelli del kit, copiati senza cambiare la forma.
 */
import { t, tn, elenco as elencoParole } from '../lingua.js';
import { nomeDellAgente } from './fonti.js';
import { el, bottone, statoUi, disegnaScheda, sezione, riga, vuoto, fatti, codice, differenze, nomeECartella, perSessione } from './comune.js';

/* ───────────────────────────── il modello delle AGGIUNTE (puro) ───────────────────────────── */

export function modelloFile(dati = {}, ambito = 'richiesta') {
  const giroDa = Number.isFinite(dati.richiesta?.giroDa) ? dati.richiesta.giroDa : null;
  const perPercorso = new Map();
  const voce = (path) => {
    if (!perPercorso.has(path)) perPercorso.set(path, { path, scrittoDa: [], lettoDa: [], agentiScrittori: [], giro: null, giroLettura: null, nuovo: false, aggiunte: null, rimozioni: null, collisione: null, diQuestaRichiesta: false });
    return perPercorso.get(path);
  };
  const conversazione = t('pannello.file.questaConversazione');
  for (const f of Array.isArray(dati.scritti) ? dati.scritti : []) {
    if (typeof f?.path !== 'string') continue;
    const v = voce(f.path);
    v.scrittoDa.push(conversazione);
    v.giro = Number.isFinite(f.giro) ? f.giro : v.giro;
    v.nuovo = v.nuovo || f.nuovo === true;
    if (Number.isFinite(f.aggiunte)) v.aggiunte = f.aggiunte;
    if (Number.isFinite(f.rimozioni)) v.rimozioni = f.rimozioni;
    if (giroDa === null || (Number.isFinite(f.giro) && f.giro >= giroDa)) v.diQuestaRichiesta = true;
  }
  for (const f of Array.isArray(dati.letti) ? dati.letti : []) {
    if (typeof f?.path !== 'string') continue;
    const v = voce(f.path);
    if (!v.lettoDa.includes(conversazione)) v.lettoDa.push(conversazione);
    v.giroLettura = Number.isFinite(f.giro) ? Math.max(f.giro, v.giroLettura ?? 0) : v.giroLettura;
    if (giroDa === null || (Number.isFinite(f.giro) && f.giro >= giroDa)) v.diQuestaRichiesta = true;
  }
  for (const a of Array.isArray(dati.agenti) ? dati.agenti : []) {
    const nome = nomeDellAgente(a, 40) || t('pannello.agenti.senzaNome');
    const corrente = a?.richiesta?.corrente !== false;
    for (const f of a?.attivita?.file ?? []) {
      if (typeof f?.percorso !== 'string') continue;
      const v = voce(f.percorso);
      if ((f.scritto || f.creato) && !v.scrittoDa.includes(`«${nome}»`)) { v.scrittoDa.push(`«${nome}»`); v.agentiScrittori.push(nome); }
      else if (f.letto && !v.lettoDa.includes(`«${nome}»`) && !v.scrittoDa.includes(`«${nome}»`)) v.lettoDa.push(`«${nome}»`);
      if (f.creato) v.nuovo = true;
      if (corrente) v.diQuestaRichiesta = true;
    }
    for (const c of Array.isArray(a?.collisioni) ? a.collisioni : []) if (typeof c?.percorso === 'string') voce(c.percorso).collisione = 'agenti';
  }
  for (const v of perPercorso.values()) if (!v.collisione && v.scrittoDa.length > 1) v.collisione = 'scrittori';
  const tutte = [...perPercorso.values()];
  const nellAmbito = (v) => ambito !== 'richiesta' || v.diQuestaRichiesta;
  const scritti = tutte.filter((v) => v.scrittoDa.length).sort((a, b) => (b.giro ?? -1) - (a.giro ?? -1) || a.path.localeCompare(b.path));
  const letti = tutte.filter((v) => !v.scrittoDa.length).sort((a, b) => (b.giroLettura ?? -1) - (a.giroLettura ?? -1) || a.path.localeCompare(b.path));
  const daGuardare = scritti.filter((v) => v.collisione);
  return {
    perPercorso, giroDa,
    daGuardare: daGuardare.filter(nellAmbito),
    /* chi è «da guardare» sta in cima UNA volta sola, come gli agenti: non si ripete fra gli scritti */
    scritti: scritti.filter((v) => nellAmbito(v) && !v.collisione),
    letti: letti.filter(nellAmbito),
    conti: {
      richiesta: tutte.filter((v) => v.diQuestaRichiesta).length,
      conversazione: tutte.length,
      scritti: scritti.filter((v) => nellAmbito(v) && !v.collisione).length, letti: letti.filter(nellAmbito).length, daGuardare: daGuardare.filter(nellAmbito).length,
    },
  };
}

/** Il conto sulla scheda (aggiunta): i file toccati dalla richiesta in corso; il pallino se due hanno scritto lo stesso file. */
export function contoFile(dati = {}) {
  const m = modelloFile(dati, 'richiesta');
  const n = m.conti.richiesta;
  return { numero: n || null, attenzione: m.conti.daGuardare, descrizione: [n ? tn('pannello.file.toccatiOne', 'pannello.file.toccatiMany', n) : null, m.conti.daGuardare ? tn('pannello.file.daGuardareOne', 'pannello.file.daGuardareMany', m.conti.daGuardare) : null].filter(Boolean).join(' · ') };
}

/* le viste del selettore: le due di oggi (`VISTE_FILE`, legacy/app.js:20177) e, sotto, le due AGGIUNTE */
export const VISTE = Object.freeze([
  { id: 'tutti', chiave: 'app.files.viewAll', icona: 'i-folder' },
  { id: 'modificati', chiave: 'app.files.viewModified', icona: 'i-file' },
  { id: 'richiesta', chiave: 'pannello.file.vistaRichiesta', icona: 'i-history', aggiunta: true },
  { id: 'conversazione', chiave: 'pannello.file.vistaConversazione', icona: 'i-list', aggiunta: true },
]);

/* ───────────────────────────── il disegno ───────────────────────────── */

function vistaToccati(d, ui, m, azioni, ambito) {
  const pezzi = [el(d, 'p', 'talos-inspector__hint pn-file-sottotitolo', ambito === 'richiesta' && Number.isFinite(ui.dati.richiesta?.at)
    ? t('pannello.file.sottotitoloRichiesta', { ora: new Date(ui.dati.richiesta.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) })
    : t('pannello.file.sottotitoloConversazione'))];
  pezzi.push(
    sezione(d, { ui, chiave: 'attenzione', titolo: t('pannello.comune.richiedeAttenzione'), conto: m.daGuardare.length, attenzione: true }, m.daGuardare.map((v) => rigaFile(d, ui, v, azioni, true))),
    sezione(d, { ui, chiave: 'scritti', titolo: t('pannello.file.scritti'), conto: m.scritti.length, spina: true }, m.scritti.map((v) => rigaFile(d, ui, v, azioni, false))),
    sezione(d, { ui, chiave: 'letti', titolo: t('pannello.file.letti'), conto: m.letti.length, spina: true }, m.letti.map((v) => rigaFile(d, ui, v, azioni, false))),
  );
  if (!m.daGuardare.length && !m.scritti.length && !m.letti.length) {
    pezzi.push(vuoto(d, ambito === 'richiesta'
      ? { testo: t('pannello.file.vuotoRichiesta'), azione: { etichetta: t('pannello.file.vediConversazione'), fai: () => azioni.scegliVista?.('conversazione') } }
      : { testo: t('pannello.file.vuotoConversazione'), azione: { etichetta: t('app.files.viewAll'), fai: () => azioni.scegliVista?.('tutti') } }));
  }
  return pezzi.filter(Boolean);
}

function come(v) {
  if (v.scrittoDa.length) return v.nuovo ? t('pannello.file.creato') : t('pannello.file.modificato');
  return t('pannello.file.letto');
}

function rigaFile(d, ui, v, azioni, attenzione) {
  const { nome, cartella } = nomeECartella(v.path);
  const giro = v.scrittoDa.length ? v.giro : v.giroLettura;
  const chi = v.scrittoDa.length ? v.scrittoDa : v.lettoDa;
  const sotto = [come(v), Number.isFinite(giro) ? t('pannello.file.giro', { n: giro }) : null, chi.length ? t('pannello.file.da', { chi: elencoParole(chi) }) : null].filter(Boolean).join(' · ');
  const perche = attenzione
    ? (v.collisione === 'agenti' ? t('pannello.file.collisioneAgenti', { chi: elencoParole(v.scrittoDa) }) : t('pannello.file.collisioneScrittori', { chi: elencoParole(v.scrittoDa) }))
    : null;
  return riga(d, ui, {
    chiave: `${attenzione ? 'g:' : ''}${v.path}`, tono: attenzione ? 'avviso' : v.scrittoDa.length ? 'ok' : 'neutro',
    icona: attenzione ? 'i-alert' : v.scrittoDa.length ? (v.nuovo ? 'i-plus' : 'i-file') : 'i-eye', parolaStato: come(v),
    nome, nomeSotto: cartella, mono: true, sotto, perche,
    lato: v.scrittoDa.length && (Number.isFinite(v.aggiunte) || Number.isFinite(v.rimozioni)) ? differenze(d, v.aggiunte, v.rimozioni) : null,
    azioni: attenzione && azioni.vediDifferenze ? [bottone(d, { etichetta: t('pannello.file.vediDifferenze'), chiave: 'differenze', fai: () => azioni.vediDifferenze(v.path) })] : [],
    apriMenu: azioni.menuRiga ? (dove) => azioni.menuRiga(v.path, { cartella: false, nome }, dove) : null,
    dettaglio: () => {
      const box = el(d, 'div', 'pn-dettaglio__corpo');
      box.append(codice(d, v.path));
      box.append(fatti(d, [
        [t('pannello.file.come'), come(v)],
        [t('pannello.file.scrittoDa'), v.scrittoDa.length ? elencoParole(v.scrittoDa) : null],
        [t('pannello.file.lettoDa'), v.lettoDa.length ? elencoParole(v.lettoDa) : null],
        [t('pannello.file.giroTermine'), Number.isFinite(giro) ? String(giro) : null],
      ]));
      const piede = el(d, 'div', 'pn-piede');
      if (azioni.apriFile) piede.append(bottone(d, { etichetta: t('pannello.file.apri'), variante: 'secondary', chiave: 'apri', fai: () => azioni.apriFile(v.path, nome) }));
      if (v.scrittoDa.length && azioni.vediDifferenze && !attenzione) piede.append(bottone(d, { etichetta: t('pannello.file.vediDifferenze'), variante: 'ghost', chiave: 'differenze-dettaglio', fai: () => azioni.vediDifferenze(v.path) }));
      box.append(piede);
      return box;
    },
  });
}

/**
 * (a) Le viste «Toccati in questa richiesta / conversazione», nel contenitore che l'app mette accanto a  * (). Stessa grammatica delle altre schede (sezioni, righe, pagine, pieghe ricordate).
 */
export function disegnaToccati(contenitore, dati = {}, azioni = {}, ambito = 'richiesta', { interno = false } = {}) {
  const ui = statoUi(contenitore);
  perSessione(ui, dati.sessione);
  ui.dati = dati; ui.azioni = azioni; ui.vistaToccati = ambito;
  ui.ridisegna = () => disegnaToccati(contenitore, ui.dati, ui.azioni, ui.vistaToccati, { interno: true });
  disegnaScheda(contenitore, (d) => vistaToccati(d, ui, modelloFile(dati, ambito), azioni, ambito), { interno });
}

/** (c) La striscia sopra l'albero, solo quando due hanno scritto lo stesso file: «2 file scritti da due: a.js, b.js · Vedi». */
export function strisciaCollisioni(d, dati = {}, vedi = null) {
  const m = modelloFile(dati, 'richiesta');
  if (!m.daGuardare.length) return null;
  const s = el(d, 'div', 'talos-callout pn-file-striscia');
  s.dataset.tono = 'avviso';
  s.setAttribute('role', 'status');
  const nomi = m.daGuardare.map((v) => nomeECartella(v.path).nome);
  s.append(el(d, 'span', 'pn-tronca', tn('pannello.file.strisciaOne', 'pannello.file.strisciaMany', m.daGuardare.length, { file: elencoParole(nomi) })));
  if (vedi) s.append(bottone(d, { etichetta: t('pannello.file.strisciaVedi'), variante: 'ghost', chiave: 'striscia-vedi', fai: vedi }));
  return s;
}
