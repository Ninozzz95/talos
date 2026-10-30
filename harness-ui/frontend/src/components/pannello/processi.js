/*
 * PANNELLO v2 — la scheda PROCESSI. Il vantaggio più netto di tutto il pannello: CPU e memoria PER PROCESSO, che nessun
 * concorrente letto ha (RICERCA §5), più chi sembra fermo in cima, con il perché e una sola azione.
 *
 * Prende il posto di `disegnaProcessi` (inspector.js:1185). ⛔ Quella funzione aggiorna PER RIGA (mai `replaceChildren` di
 *   tutte le card, P0-E punto 9): qui il ridisegno è intero ma conserva scorrimento, fuoco, righe aperte e ricerca
 *   (`disegnaScheda`, comune.js), ed è coalescato su un fotogramma come lo è già `aggiornaInspectorDaStato`. Il TETTO di 40
 *   righe + «Carica altri» di oggi (`TETTO_PROCESSI`, inspector.js:375) è diventato la barra delle pagine (29/10 sera).
 *
 * ── I DATI ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * dati.processi = `processiDagliEventi(...)` già filtrata dei tolti (legacy/app.js:12943; inspector.js:2176). Campi letti:
 *                 id, comando, descrizione, stato (uno dei 14 di `STATI_PROCESSO`), chi ('tu'|'agente'), giro, avviatoA,
 *                 durataMs, uscita, cwd, fermoDaMs, fileSfondo, sfondoDa, adottato, pid, rifiutato.
 * dati.risorse  = `state.realSession.risorseProcessi`: Map toolCallId → { cpuPercento, memoriaByte }
 *                 (GET /api/v1/sessions/:id/processes/resources, letta ogni 5 s SOLO a scheda aperta: legacy/app.js:6920-6936).
 * dati.storiaCpu = Map toolCallId → number[] — ⚠️ CLIENT NUOVO: gli ultimi 12 campioni di `cpuPercento` (un minuto), da tenere
 *                 in `leggiRisorseProcessi` a ogni lettura. Nessuna rotta nuova.
 * dati.porte    = Map toolCallId → [{ porta, url }] — ⚠️ DATI NUOVI dal server: le porte in ascolto dell'albero del processo
 *                 (MAPPA.md, P-05). Senza, la riga non mostra il chip del Browser e non promette niente.
 * dati.adesso   = istante in ms (fisso nelle prove).
 *
 * ── LE AZIONI ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * azioni.ferma(id) / sfonda(id) / togli(id) = `fermaProcesso` / `sfondaProcesso` / `togliProcesso` (legacy/app.js:6846, :6862,
 *                 :6878): tornano `{ ok, messaggio }`, e l'esito si scrive nella riga.
 * azioni.mostraUscita(p)   = ⚠️ CABLAGGIO: porta alla card del comando in chat (lettore `creaLettoreOutput`, legacy/app.js:22855)
 * azioni.apriNelBrowser(u) = `apriNelBrowserVivo({ url })` (legacy/app.js:18880)
 * azioni.apriTerminale()   = il pulsante «Terminale» della testata della chat (schermo `terminale`)
 * azioni.apriMenu(voci, dove) = `apriMenuAzioniLibreria` (legacy/app.js:21359)
 */
import { t, tn } from '../lingua.js';
import { STATI_PROCESSO } from './fonti.js';
import { ICONA_FAMIGLIA, NOME_FAMIGLIA, analizzaComando } from '../comando-shell.js';
import {
  el, icona, bottone, statoUi, disegnaScheda, testa, sezione, riga, vuoto, scheletro, fatti, codice, scintilla, durata,
  oraBreve, eseguiNellaRiga, chiediConferma, normalizza, bloccoDiTesta, bottoneIcona, perSessione,
} from './comune.js';

export const TETTO = 40; // la misura di OGGI (`TETTO_PROCESSI`, inspector.js:375); nel v2 la pagina la decide lo spazio (`elencoPaginato`)
const SOGLIA_FERMO_MS = 60_000; // `SOGLIA_ATTESA_MS`, inspector.js:389
const FERMABILE = new Set(['in-corso', 'in-attesa']); // inspector.js:650
/* ⛔ si ferma anche un comando IN SFONDO finché vive (oggi `FERMABILE_O_SFONDO`, inspector.js:715; server A6-bis R2): il kit l'aveva perso */
const FERMABILE_O_SFONDO = new Set([...FERMABILE, 'in-sfondo']);
const TOGLIBILE = new Set(['riuscito', 'fallito', 'annullato', 'ucciso', 'non-eseguito', 'interrotto', 'perso', 'finito-ignoto']); // :714
/* chi ha mandato un comando in sottofondo, con le parole del dettaglio di oggi (`CHI_SFONDA`, inspector.js) */
const CHI_SFONDA = Object.freeze({ persona: 'processi.process.byYou', 'tempo-scaduto': 'processi.process.byTimeout', modello: 'processi.process.byModel' });
const TONO = Object.freeze({ accent: 'corso', warning: 'avviso', success: 'ok', danger: 'errore', '': 'neutro' });

/*
 * ⭐ Owner 29/10/2026 sera (risposta del coordinatore, opzione consigliata): «il TIPO del comando va nell'icona, chi l'ha lanciato
 *   nelle parole». La famiglia di oggi (`ICONA_FAMIGLIA[p.famiglia] || ICONA_FAMIGLIA.generico`, comando-shell.js:74, e
 *   inspector.js:558: quella DICHIARATA dall'attrezzo vince sull'analisi del testo, OSS-2), con `data-famiglia` sulla riga e
 *   l'aria-label di oggi (`processi.process.commandAria`): un'icona che dice qualcosa ha la sua alternativa in parole (WCAG 1.1.1;
 *   Clarity «Icons · Accessibility», core.clarity.design, letto il 29/10/2026). Gli stati che hanno un'icona loro (sembra fermo, aspetta il consenso,
 *   fermato) tengono quella del bozzetto. Il parser si chiama una volta per testo (una mappa piccola: 40 righe a ridisegno).
 */
const FAMIGLIE_LETTE = new Map();
function famigliaDi(p) {
  if (p.famiglia) return p.famiglia;
  const testo = typeof p.comando === 'string' ? p.comando : '';
  if (!FAMIGLIE_LETTE.has(testo)) {
    let f = 'generico';
    try { f = analizzaComando(testo)?.famiglia || 'generico'; } catch { /* un comando che il parser non legge è «comando», come oggi */ }
    if (FAMIGLIE_LETTE.size > 500) FAMIGLIE_LETTE.clear();
    FAMIGLIE_LETTE.set(testo, f);
  }
  return FAMIGLIE_LETTE.get(testo);
}
const STATI_CON_ICONA_PROPRIA = new Set(['in-consenso', 'annullato', 'ucciso']);

const adessoDi = (dati) => (typeof dati?.adesso === 'function' ? dati.adesso() : Number.isFinite(dati?.adesso) ? dati.adesso : Date.now());
/* i numeri nella lingua dei numeri dell'app («1,2%» in italiano, «1.2%» in inglese), come la scheda di oggi */
const numero = (n, decimali) => new Intl.NumberFormat(globalThis.document?.documentElement?.lang || undefined, { maximumFractionDigits: decimali, minimumFractionDigits: decimali }).format(n);
/* la durata di un comando FINITO con la precisione di oggi (inspector.js:481: «<0,1 s», «18,1 s»), sotto il minuto; oltre, «4 min 5 s» */
const durataComando = (ms) => (!Number.isFinite(ms) || ms < 0 ? '' : ms < 100 ? `<${new Intl.NumberFormat(globalThis.document?.documentElement?.lang || undefined, { maximumFractionDigits: 1 }).format(0.1)} s` : ms < 60_000 ? `${new Intl.NumberFormat(globalThis.document?.documentElement?.lang || undefined, { maximumFractionDigits: 1 }).format(ms / 1000)} s` : durata(ms));
const memoria = (byte) => { const mb = byte / 1_048_576; return mb >= 1024 ? `${numero(mb / 1024, 1)} GB` : `${numero(Math.round(mb), 0)} MB`; };

/** Il modello di vista, PURO. */
export function modelloProcessi(dati = {}) {
  const adesso = adessoDi(dati);
  const visti = new Set();
  const righe = [];
  for (const p of Array.isArray(dati.processi) ? dati.processi : []) {
    if (!p || visti.has(p.id)) continue; // un id una volta sola, come `contaProcessiAttivi` (inspector.js:1893)
    visti.add(p.id);
    const stato = STATI_PROCESSO[p.stato] ? p.stato : 'in-corso';
    const s = STATI_PROCESSO[stato];
    const ris = dati.risorse instanceof Map ? dati.risorse.get(String(p.id)) : null;
    const fermo = stato !== 'in-sfondo' && s.vivo && Number.isFinite(p.fermoDaMs) && p.fermoDaMs >= SOGLIA_FERMO_MS;
    righe.push({
      id: String(p.id), p, stato, parola: s.etichetta, tono: fermo ? 'avviso' : TONO[s.tono] ?? 'neutro', vivo: s.vivo,
      famiglia: famigliaDi(p),
      icona: fermo ? 'i-pausa' : STATI_CON_ICONA_PROPRIA.has(stato) ? s.icona : ICONA_FAMIGLIA[famigliaDi(p)] || ICONA_FAMIGLIA.generico,
      nome: (p.descrizione || '').trim() || p.comando || '—', comando: p.comando || '', haDescrizione: Boolean((p.descrizione || '').trim()),
      chi: p.chi === 'tu' ? t('pannello.processi.daTe') : t('pannello.processi.dallAgente', { giro: p.giro ?? '—' }),
      fermo, fermoS: fermo ? Math.round(p.fermoDaMs / 1000) : null,
      attenzione: fermo || stato === 'in-consenso',
      cpu: Number.isFinite(ris?.cpuPercento) ? ris.cpuPercento : null, memoriaByte: Number.isFinite(ris?.memoriaByte) ? ris.memoriaByte : null,
      storiaCpu: dati.storiaCpu instanceof Map ? dati.storiaCpu.get(String(p.id)) ?? [] : [],
      porte: dati.porte instanceof Map ? dati.porte.get(String(p.id)) ?? [] : [],
      avviatoA: Number.isFinite(p.avviatoA) ? p.avviatoA : null,
      durataMs: Number.isFinite(p.durataMs) ? p.durataMs : null,
      uscita: Number.isFinite(p.uscita) ? p.uscita : null,
    });
  }
  const accesi = righe.filter((r) => r.vivo && r.stato !== 'in-consenso');
  const memoriaTotale = accesi.reduce((s, r) => s + (r.memoriaByte ?? 0), 0);
  return {
    righe, adesso,
    attenzione: righe.filter((r) => r.attenzione),
    accesi: accesi.filter((r) => !r.attenzione),
    finiti: righe.filter((r) => !r.vivo),
    conto: { accesi: accesi.length, server: accesi.filter((r) => r.porte.length).length, memoria: memoriaTotale, attenzione: righe.filter((r) => r.attenzione).length, finiti: righe.filter((r) => !r.vivo).length },
  };
}

/** Il conto sulla scheda: chi gira (come `contaProcessiAttivi`), e il pallino se qualcuno sembra fermo o aspetta il consenso. */
export function contoProcessi(dati = {}) {
  const m = modelloProcessi(dati);
  return {
    numero: m.conto.accesi || null,
    attenzione: m.conto.attenzione,
    descrizione: [m.conto.accesi ? tn('pannello.processi.accesiOne', 'pannello.processi.accesiMany', m.conto.accesi) : null, m.conto.attenzione ? tn('pannello.processi.fermiOne', 'pannello.processi.fermiMany', m.conto.attenzione) : null].filter(Boolean).join(' · '),
  };
}

export function disegnaProcessiV2(contenitore, dati = {}, azioni = {}, { interno = false } = {}) {
  const ui = statoUi(contenitore);
  perSessione(ui, dati.sessione); // al cambio di conversazione niente righe aperte, filtri o conferme di quella prima
  ui.dati = dati; ui.azioni = azioni;
  ui.ridisegna = () => disegnaProcessiV2(contenitore, ui.dati, ui.azioni, { interno: true });
  if (!ui.ambito) ui.ambito = 'accesi';
  disegnaScheda(contenitore, (d) => costruisci(d, ui, dati, azioni), { interno });
}

function costruisci(d, ui, dati, azioni) {
  if (dati.inCaricamento === true && !dati.processi?.length) return [scheletro(d)];
  const m = modelloProcessi(dati);
  const testo = normalizza(ui.cerca.testo.trim());
  /* il filtro per STATO di oggi (i 14 stati, `STATI_RARI_FILTRO` inspector.js:656): resta, in un menu con gli stati che ci sono */
  const filtroStato = ui.filtroStato && m.righe.some((r) => r.stato === ui.filtroStato) ? ui.filtroStato : null;
  const passa = (r) => (!testo || normalizza(`${r.nome} ${r.comando}`).includes(testo)) && (!filtroStato || r.stato === filtroStato);
  const statiPresenti = [...new Set(m.righe.map((r) => r.stato))].sort((a, b) => Object.keys(STATI_PROCESSO).indexOf(a) - Object.keys(STATI_PROCESSO).indexOf(b));
  const filtra = m.righe.length ? bottoneIcona(d, {
    id: 'i-list', etichetta: filtroStato ? t('pannello.processi.filtroAttivo', { stato: STATI_PROCESSO[filtroStato].etichetta }) : t('pannello.processi.filtraPerStato'),
    premuto: Boolean(filtroStato), chiave: 'filtra-stato', haMenu: true,
    fai: (e, b) => azioni.apriMenu?.([
      { chiave: 'tutti', etichetta: t('pannello.processi.tuttiGliStati', { n: m.righe.length }), icona: filtroStato ? 'i-minus' : 'i-check', aziona: () => { ui.filtroStato = null; ui.ridisegna(); } },
      ...statiPresenti.map((s, i) => ({ chiave: s, separaPrima: i === 0, etichetta: `${STATI_PROCESSO[s].etichetta} · ${m.righe.filter((r) => r.stato === s).length}`, icona: s === filtroStato ? 'i-check' : STATI_PROCESSO[s].icona, aziona: () => { ui.filtroStato = s; ui.ambito = 'tutti'; ui.ridisegna(); } })),
    ], { ancoraEl: b }),
  }) : null;
  const ambito = ui.ambito;
  const conto = [];
  if (m.conto.server) conto.push(tn('pannello.processi.serverOne', 'pannello.processi.serverMany', m.conto.server));
  if (m.conto.memoria) conto.push(t('pannello.processi.memoriaTotale', { memoria: memoria(m.conto.memoria) }));
  if (m.conto.attenzione) conto.push({ testo: tn('pannello.processi.fermiOne', 'pannello.processi.fermiMany', m.conto.attenzione), tono: 'avviso' });
  if (!conto.length && m.conto.finiti) conto.push(tn('pannello.processi.finitiOne', 'pannello.processi.finitiMany', m.conto.finiti));
  const fermabili = m.righe.filter((r) => FERMABILE_O_SFONDO.has(r.stato));
  const intestazione = testa(d, ui, {
    quando: t('pannello.processi.questaConversazione'),
    titolo: m.conto.accesi ? tn('pannello.processi.titoloOne', 'pannello.processi.titoloMany', m.conto.accesi) : t('pannello.processi.titoloNessuno'),
    conto: filtroStato ? [...conto, { testo: t('pannello.processi.filtroAttivo', { stato: STATI_PROCESSO[filtroStato].etichetta }) }] : conto,
    azioni: filtra ? [filtra] : [],
    cerca: m.righe.length ? { segnaposto: t('pannello.processi.cercaSegnaposto') } : null,
    ambito: m.righe.length ? { etichetta: t('pannello.processi.ambitoEtichetta'), voci: [
      { id: 'accesi', etichetta: t('pannello.processi.ambitoAccesi'), conto: m.conto.accesi + m.attenzione.filter((r) => r.stato === 'in-consenso').length },
      { id: 'finiti', etichetta: t('pannello.processi.ambitoFiniti'), conto: m.conto.finiti },
      { id: 'tutti', etichetta: t('pannello.processi.ambitoTutti'), conto: m.righe.length },
    ] } : null,
    menu: [
      fermabili.length && azioni.ferma ? { chiave: 'ferma-tutti', etichetta: t('pannello.processi.fermaTutti'), icona: 'i-stop', pericolo: true, aziona: () => chiediConferma(ui, '__tutti', {
        domanda: tn('pannello.processi.fermaTuttiDomandaOne', 'pannello.processi.fermaTuttiDomandaMany', fermabili.length), conseguenza: t('pannello.processi.fermaTuttiConseguenza'), etichetta: t('pannello.processi.fermaTutti'),
        /* chi si ferma si decide al clic su «Conferma», non all'apertura della conferma: un comando finito nel frattempo non riceve uno stop */
        fai: () => { for (const r of modelloProcessi(ui.dati).righe.filter((x) => FERMABILE_O_SFONDO.has(x.stato))) void eseguiNellaRiga(ui, r.id, () => azioni.ferma(r.id), { inCorso: t('pannello.processi.fermoInCorso'), fatto: t('pannello.processi.fermato') }); },
      }) } : null,
      azioni.apriTerminale ? { chiave: 'terminale', etichetta: t('pannello.processi.apriTerminale'), icona: 'i-terminal', separaPrima: fermabili.length > 0, aziona: () => azioni.apriTerminale() } : null,
    ].filter(Boolean),
  });
  const pezzi = [intestazione];
  pezzi.push(bloccoDiTesta(d, ui, '__tutti'));
  if (!m.righe.length) {
    pezzi.push(vuoto(d, { testo: t('pannello.processi.vuoto'), azione: azioni.apriTerminale ? { etichetta: t('pannello.processi.apriTerminale'), fai: () => azioni.apriTerminale() } : null }));
    return pezzi;
  }
  const mostraVivi = ambito !== 'finiti';
  const mostraFiniti = ambito !== 'accesi';
  const att = mostraVivi ? m.attenzione.filter(passa) : [];
  const vivi = mostraVivi ? m.accesi.filter(passa) : [];
  const finiti = mostraFiniti ? m.finiti.filter(passa) : [];
  pezzi.push(
    sezione(d, { ui, chiave: 'attenzione', titolo: t('pannello.comune.richiedeAttenzione'), conto: att.length, attenzione: true }, att.map((r) => rigaProcesso(d, ui, r, azioni, true))),
    sezione(d, { ui, chiave: 'accesi', titolo: t('pannello.processi.ambitoAccesi'), conto: vivi.length, spina: true }, vivi.map((r) => rigaProcesso(d, ui, r, azioni, false))),
    sezione(d, { ui, chiave: 'finiti', titolo: t('pannello.processi.ambitoFiniti'), conto: finiti.length, spina: true }, finiti.map((r) => rigaProcesso(d, ui, r, azioni, false))),
  );
  /* ⭐ 29/10 sera: il tetto di 40 + «Mostra altri» di oggi (`TETTO_PROCESSI`) è diventato la barra delle pagine di ogni sezione */
  if (!att.length && !vivi.length && !finiti.length) {
    pezzi.push(vuoto(d, testo
      ? { testo: t('pannello.comune.nessunRisultato', { testo: ui.cerca.testo }), azione: { etichetta: t('pannello.comune.togliFiltri'), fai: () => { ui.cerca.testo = ''; ui.ridisegna(); } } }
      : { testo: ambito === 'accesi' ? t('pannello.processi.nessunoAcceso') : t('pannello.processi.nessunoFinito'), azione: { etichetta: t('pannello.processi.ambitoTutti'), fai: () => { ui.ambito = 'tutti'; ui.ridisegna(); } } }));
  }
  return pezzi;
}

function rigaProcesso(d, ui, r, azioni, attenzione) {
  let perche = null;
  if (attenzione && r.fermo) perche = t('pannello.processi.sembraFermo', { s: r.fermoS });
  else if (attenzione && r.stato === 'in-consenso') perche = t('pannello.processi.aspettaConsenso');
  const chip = r.porte.length && r.vivo && azioni.apriNelBrowser ? chipPorta(d, r.porte[0], azioni) : null;
  if (chip) perche = perche ? [perche, chip] : chip;
  const perchebox = Array.isArray(perche) ? (() => { const b = el(d, 'span', 'pn-perche__corpo'); b.append(d.createTextNode(perche[0]), perche[1]); return b; })() : perche;
  /* una riga sola: il comando quando il nome è la descrizione, altrimenti chi l'ha lanciato (che dice anche l'icona); il resto è nel dettaglio */
  /* owner 29/10 sera: il tipo è nell'icona, CHI l'ha lanciato resta scritto nella riga — anche accanto al comando, quando il nome è la
     descrizione (il comando cede per primo, «da te» resta) */
  const comandoEl = r.haDescrizione ? codice(d, r.comando) : null;
  const sotto = r.haDescrizione ? el(d, 'span', 'pn-sotto__comando') : el(d, 'span', 'pn-tronca', r.chi);
  if (comandoEl) { sotto.append(comandoEl, el(d, 'span', 'pn-sotto__chi', r.chi)); sotto.title = `${r.comando} · ${r.chi}`; }
  let lato = null; let latoSotto = null;
  if (r.vivo && r.stato !== 'in-consenso') {
    const misura = [r.cpu !== null ? `${r.cpu < 10 ? numero(r.cpu, 1) : numero(Math.round(r.cpu), 0)}%` : null, r.memoriaByte !== null ? memoria(r.memoriaByte) : null].filter(Boolean).join(' · ');
    lato = misura || null;
    if (r.storiaCpu.length > 1) latoSotto = scintilla(d, r.storiaCpu, t('pannello.processi.cpuUltimoMinuto'));
  } else if (!r.vivo) {
    const badge = el(d, 'span', 'pn-badge', r.uscita !== null ? t('pannello.processi.uscita', { codice: r.uscita }) : r.parola);
    badge.dataset.tono = r.tono;
    lato = badge;
  }
  const azioniRiga = [];
  if (attenzione && r.fermo && FERMABILE.has(r.stato) && azioni.ferma) azioniRiga.push(bottone(d, { etichetta: t('pannello.processi.ferma'), chiave: 'ferma', fai: () => fermaRiga(ui, r, azioni) }));
  const nodo = riga(d, ui, {
    chiave: r.id, tono: r.tono, icona: r.icona, parolaStato: r.parola, nome: r.nome, mono: !r.haDescrizione, vivo: r.vivo && !r.attenzione,
    perche: perchebox, sotto,
    dal: r.vivo && r.stato !== 'in-consenso' && r.avviatoA !== null && !lato ? r.avviatoA : undefined,
    lato: lato ?? (!r.vivo && r.durataMs !== null ? durataComando(r.durataMs) : null),
    latoSotto,
    azioni: azioniRiga,
    menu: () => vociProcesso(ui, r, azioni),
    dettaglio: () => dettaglioProcesso(d, ui, r, azioni),
  });
  nodo.dataset.c = 'ProcessRow'; // il nome di componente di oggi
  nodo.dataset.famiglia = r.famiglia; // come la riga di oggi (inspector.js:1078)
  /* l'indicazione non è SOLO un'icona: chi legge con uno screen reader sente la famiglia e il comando (inspector.js:1120) */
  const doveIlComando = comandoEl ?? nodo.querySelector('.pn-nome');
  if (r.comando) doveIlComando?.setAttribute('aria-label', t('processi.process.commandAria', { famiglia: NOME_FAMIGLIA[r.famiglia] || t('processi.process.familyGeneric'), comando: r.comando }));
  nodo.dataset.stato = r.stato;
  return nodo;
}

function chipPorta(d, porta, azioni) {
  const c = el(d, 'button', 'pn-chip pn-chip--porta');
  c.type = 'button';
  c.dataset.controllo = 'apri-browser';
  c.title = t('pannello.processi.apriNelBrowser', { indirizzo: `localhost:${porta.porta}` });
  c.setAttribute('aria-label', c.title);
  c.append(el(d, 'span', 'pn-chip__verde'), el(d, 'span', 'pn-tronca', `localhost:${porta.porta}`), icona(d, 'i-globe'));
  c.addEventListener('click', (e) => { e.stopPropagation(); azioni.apriNelBrowser(porta.url); });
  return c;
}

function fermaRiga(ui, r, azioni) {
  return eseguiNellaRiga(ui, r.id, () => azioni.ferma(r.id), { inCorso: t('pannello.processi.fermoInCorso'), fatto: t('pannello.processi.fermato') });
}

function vociProcesso(ui, r, azioni) {
  const voci = [];
  if (azioni.mostraUscita) voci.push({ chiave: 'uscita', etichetta: t('pannello.processi.mostraUscita'), icona: 'i-doc', aziona: () => azioni.mostraUscita(r.p) });
  if (r.porte.length && r.vivo && azioni.apriNelBrowser) voci.push({ chiave: 'browser', etichetta: t('pannello.processi.apriNelBrowserBreve'), icona: 'i-globe', aziona: () => azioni.apriNelBrowser(r.porte[0].url) });
  if (FERMABILE.has(r.stato) && azioni.sfonda) voci.push({ chiave: 'sfondo', etichetta: t('pannello.processi.sfonda'), icona: 'i-sfondo', aziona: () => eseguiNellaRiga(ui, r.id, () => azioni.sfonda(r.id), { inCorso: t('pannello.processi.sfondoInCorso'), fatto: t('pannello.processi.sfondato') }) });
  if (FERMABILE_O_SFONDO.has(r.stato) && azioni.ferma) voci.push({ chiave: 'ferma', etichetta: t('pannello.processi.ferma'), icona: 'i-stop', pericolo: true, separaPrima: voci.length > 0, aziona: () => fermaRiga(ui, r, azioni) });
  if (TOGLIBILE.has(r.stato) && azioni.togli) voci.push({ chiave: 'togli', etichetta: t('pannello.processi.togli'), icona: 'i-trash', separaPrima: voci.length > 0, aziona: () => eseguiNellaRiga(ui, r.id, () => azioni.togli(r.id), { inCorso: t('pannello.processi.togliInCorso'), fatto: t('pannello.processi.tolto') }) });
  return voci;
}

function dettaglioProcesso(d, ui, r, azioni) {
  const box = el(d, 'div', 'pn-dettaglio__corpo');
  const cmd = el(d, 'pre', 'pn-comando');
  cmd.textContent = r.comando || '—';
  box.append(cmd);
  box.append(fatti(d, [
    [t('pannello.processi.stato'), r.parola],
    [t('pannello.processi.avviato'), r.avviatoA !== null ? oraBreve(r.avviatoA) : null],
    [t('pannello.processi.durata'), r.durataMs !== null ? (r.vivo ? durata(r.durataMs) : durataComando(r.durataMs)) : null],
    [t('pannello.processi.uscitaTermine'), r.uscita !== null && !r.vivo ? String(r.uscita) : null],
    [t('pannello.processi.cartella'), r.p.cwd || null],
    [t('pannello.processi.chi'), r.chi],
    [t('pannello.processi.fileUscita'), r.p.fileSfondo || null],
    [t('pannello.processi.porte'), r.porte.length ? r.porte.map((p) => p.porta).join(', ') : null],
    /* niente perso (il dettaglio di oggi, inspector.js:529-548): chi l'ha mandato in sottofondo, l'orfano ripreso e il suo PID, la
       descrizione intera quando il nome è la descrizione */
    [t('processi.process.detailBackgroundedBy'), r.p.sfondoDa ? (CHI_SFONDA[r.p.sfondoDa] ? t(CHI_SFONDA[r.p.sfondoDa]) : String(r.p.sfondoDa)) : null],
    [t('processi.process.detailTracking'), r.p.adottato === true && r.vivo ? t('processi.process.reattached') : null],
    [t('processi.process.detailPid'), r.p.adottato === true && Number.isSafeInteger(r.p.pid) ? String(r.p.pid) : null],
    [t('processi.process.detailDescription'), r.haDescrizione ? r.p.descrizione.trim() : null],
  ]));
  const piede = el(d, 'div', 'pn-piede');
  if (azioni.mostraUscita) piede.append(bottone(d, { etichetta: t('pannello.processi.mostraUscita'), variante: 'secondary', chiave: 'mostra-uscita', fai: () => azioni.mostraUscita(r.p) }));
  if (FERMABILE_O_SFONDO.has(r.stato) && azioni.ferma && !r.fermo) piede.append(bottone(d, { etichetta: t('pannello.processi.ferma'), variante: 'ghost', chiave: 'ferma-dettaglio', fai: () => fermaRiga(ui, r, azioni) }));
  box.append(piede);
  return box;
}
