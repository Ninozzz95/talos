/**
 * automazioni-sezione.js — la pagina Automazioni nella STESSA grammatica di Libreria, Note, Memoria e Attività: l'impianto
 * `sezione-elenco-dettaglio.js` (elenco a schede o a righe a sinistra, dettaglio in un pannello che si apre a DESTRA).
 *
 * ⛔⛔ Owner, 08/10/2026: «la sezione automazioni deve avere lo stesso linguaggio visivo della sezione libreria note etc, layout
 *   stile card o riga e pannello laterale che si apre a destra etc, non negoziabile». La prima versione v2 espandeva la riga in
 *   basso («Dettagli»), come la vecchia riga v1: un linguaggio suo, e l'owner l'ha visto subito.
 *   ⇒ Qui non c'è struttura né stile nuovi: è un adattatore come `aggiornaPaginaMemoria` e `aggiornaPaginaAttivita`
 *   (`sezioni-adattatori.js`). Ricerca, ordine, schede/righe, filtri a pastiglie coi conteggi, pannello, divisorio, «espandi»,
 *   chiusura, stato vuoto: tutto dell'impianto.
 * ⛔ «Da guardare» non è più una scheda a sé: è un FILTRO (le automazioni con giri non letti), e i giri si leggono e si segnano
 *   nel pannello, dove c'è lo storico.
 * ⛔ Azioni: in fondo al pannello «Esegui ora» (o «Ferma il giro»), «Modifica» e «Tutte le azioni» — la stessa coppia di Note e
 *   Memoria («Modifica» + «Tutte le azioni»), più l'azione principale di un'automazione. «Tutte le azioni», il «⋯» della scheda
 *   e il tasto destro aprono lo STESSO menu.
 */
import { t as traduci, tn } from './lingua.js';
import { montaSezione, statoSezione } from './sezione-elenco-dettaglio.js';
import { rigaCoordinazione, testiAutomazione } from './automazioni.js';
import { parolePianificazione, dataBreve, testiAutomazioneV2, creaRigaGiro } from './automazioni-v2.js';

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}
function bottone(doc, testo, { variante = 'secondary', esegui, disabilitato = false } = {}) {
  const b = nodo(doc, 'button', `talos-button talos-button--${variante} talos-button--sm`, testo);
  b.type = 'button';
  b.disabled = disabilitato;
  if (esegui) b.addEventListener('click', esegui);
  return b;
}
function kv(doc, k, v) { const n = nodo(doc, 'div', 'talos-kv'); n.append(nodo(doc, 'span', 'talos-kv__k', k), nodo(doc, 'span', 'talos-kv__v', v)); return n; }
function anteprima(testo, quanti = 160) {
  const t = String(testo ?? '').replace(/\s+/gu, ' ').trim();
  return t.length > quanti ? `${t.slice(0, quanti).trimEnd()}…` : t;
}
/** Il «⋯» della scheda, con la classe di casa (`td-card-azioni`, la stessa di Note e Memoria). */
function bottoneMenu(doc, titolo, apri) {
  const b = nodo(doc, 'button', 'td-card-azioni');
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-label', traduci('sezioni.automations.v2.menu.label', { name: titolo }));
  b.dataset.autoMenu = '';
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
  const uso = doc.createElementNS('http://www.w3.org/2000/svg', 'use'); uso.setAttribute('href', '#i-more'); svg.append(uso);
  b.append(svg);
  b.addEventListener('click', (e) => { e.stopPropagation(); apri({ ancoraEl: b }); });
  return b;
}

/** Il tasto destro sulla scheda: registrato UNA volta per schermata, legge le voci e il menu dell'ultimo disegno. */
const ULTIMO = new WeakMap();
function collegaTastoDestro(schermo) {
  if (ULTIMO.has(schermo)) return;
  ULTIMO.set(schermo, {});
  schermo.addEventListener('contextmenu', (e) => {
    const scheda = e.target?.closest?.('.td-card[data-item]');
    if (!scheda || e.target.closest('input,textarea')) return;
    const { voci, onMenu } = ULTIMO.get(schermo) || {};
    const voce = voci?.find((a) => String(a?.id) === scheda.dataset.item);
    if (!voce || typeof onMenu !== 'function') return;
    e.preventDefault();
    onMenu(voce, { x: e.clientX, y: e.clientY });
  });
}

const FILTRI = (nonLettiDi) => [
  { id: 'tutte', etichetta: traduci('sezioni.automations.v2.section.filter.all') },
  { id: 'attive', etichetta: traduci('sezioni.automations.v2.section.filter.active'), quando: (a) => a?.attiva === true },
  { id: 'pausa', etichetta: traduci('sezioni.automations.v2.section.filter.paused'), quando: (a) => a?.attiva !== true },
  { id: 'da-guardare', etichetta: traduci('sezioni.automations.v2.section.filter.review'), quando: (a) => nonLettiDi(a?.id) > 0 },
];

/**
 * @param {HTMLElement} schermo `#schermoAutomazioni`
 * @param {object[]} elenco le voci di `GET /api/v1/automations` (v1 e v2)
 * @param {object} opzioni `errore`, `caricamento`, `salvataggio`, `salvataggioId`, `daGuardare` (giri non letti), `giri` (Map id →
 *   {stato, items}), e i comandi: `onAggiorna`, `onNuova`, `onMenu(a, dove)`, `onCaricaGiri(a)`, `onEsegui`, `onFerma`, `onModifica`,
 *   `onToggle(a, attiva)`, `onCoordinazione(a, accesa)`, `onApriGiro(a, giro)`, `onGiroLetto(a, giro)`,
 *   `onProposta(a, giro, 'approva'|'scarta')` (decisione 13), `onElimina` (v1).
 * @returns {number} le voci visibili
 */
export function aggiornaPaginaAutomazioni(schermo, elenco, opzioni = {}) {
  if (!schermo) return 0;
  const doc = schermo.ownerDocument || globalThis.document;
  const lista = Array.isArray(elenco) ? elenco : [];
  const daGuardare = Array.isArray(opzioni.daGuardare) ? opzioni.daGuardare : [];
  const nonLettiDi = (id) => daGuardare.filter((g) => g.automazioneId === id).length;
  const salvataggio = Boolean(opzioni.salvataggio);
  collegaTastoDestro(schermo);
  ULTIMO.set(schermo, { voci: lista, onMenu: opzioni.onMenu });

  const nomeDi = (a) => (a?.versione === 2 ? testiAutomazioneV2(a).nome : testiAutomazione(a).nome);
  const statoDi = (a) => {
    if (a?.giroInCorso) return { testo: traduci('sezioni.automations.v2.row.running'), tono: 'accent' };
    return a?.attiva === true ? { testo: traduci('sezioni.automations.status.active'), tono: 'success' } : { testo: traduci('sezioni.automations.status.paused'), tono: '' };
  };
  const numeroAttive = lista.filter((a) => a?.attiva === true).length;
  const riepilogo = `${tn('sezioni.automations.summary.countOne', 'sezioni.automations.summary.countMany', lista.length)} · ${tn('sezioni.automations.summary.activeOne', 'sezioni.automations.summary.activeMany', numeroAttive)}`;

  const visibili = montaSezione(schermo, {
    chiave: 'automazioni',
    nome: traduci('sezioni.automations.v2.section.name'),
    icona: 'clock',
    famiglia: 'td-automation',
    sostantivo: 'automazione',
    voci: lista,
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: traduci('sezioni.automations.loading'),
    onAggiorna: opzioni.onAggiorna,
    filtri: FILTRI(nonLettiDi),
    idDi: (a) => a?.id,
    titoloDi: nomeDi,
    quandoDi: (a) => a?.modificataAlle ?? a?.creataAlle ?? null,
    cercaIn: (a) => `${nomeDi(a)} ${a?.istruzioni ?? a?.taskId ?? ''}`,
    sommarioBarra: (_n, { errore, caricamento }) => (errore ? traduci('sezioni.automations.unavailable') : caricamento ? traduci('sezioni.automations.loading') : riepilogo),
    sommarioStato: (n, totale) => (n === totale ? riepilogo : traduci('sezioni.automations.filteredOfTotal', { shown: n, total: totale })),
    scheda: (a, { doc: d, etichetta }) => {
      const s = statoDi(a);
      const quanti = nonLettiDi(a?.id);
      const alto = [etichetta(s.testo, s.tono)];
      if (quanti) { const b = etichetta(tn('sezioni.automations.v2.row.unreadOne', 'sezioni.automations.v2.row.unreadMany', quanti), 'accent'); b.dataset.autoNonLetti = ''; alto.push(b); }
      if (a?.versione !== 2) alto.push(etichetta(traduci('sezioni.automations.v2.row.legacy'), ''));
      const v2 = a?.versione === 2;
      const t2 = v2 ? testiAutomazioneV2(a) : null;
      return {
        dati: { versione: v2 ? '2' : '1' },
        alto,
        corpo: [nodo(d, 'p', 'td-excerpt', v2 ? anteprima(a.istruzioni) : traduci('sezioni.automations.v2.row.legacyHint'))],
        basso: v2
          ? [nodo(d, 'span', '', t2.quando)] // una voce sola: due si troncavano entrambe (foto 08/10); il prossimo giro sta nel pannello
          : [nodo(d, 'span', '', testiAutomazione(a).intervallo ?? '')],
        adorno: bottoneMenu(d, nomeDi(a), (dove) => opzioni.onMenu?.(a, dove)),
      };
    },
    dettaglio: (a, { doc: d, etichetta }) => {
      const s = statoDi(a);
      if (a?.versione !== 2) {
        const t1 = testiAutomazione(a);
        const meta1 = nodo(d, 'div', 'td-detail-meta');
        meta1.append(etichetta(s.testo, s.tono), etichetta(traduci('sezioni.automations.v2.row.legacy'), ''));
        return [
          meta1,
          nodo(d, 'h2', '', t1.nome),
          kv(d, traduci('sezioni.automations.row.nextRun'), t1.prossima),
          kv(d, traduci('sezioni.automations.row.lastRun'), t1.ultima),
          nodo(d, 'p', 'td-subtle', traduci('sezioni.automations.v2.section.legacyNote')),
          kv(d, traduci('sezioni.automations.row.task'), a?.taskId ?? ''),
          kv(d, traduci('sezioni.automations.row.model'), t1.modello ?? ''),
          ...rigaCoordinazione(d, a, t1.nome, { salvataggio, onCoordinazione: opzioni.onCoordinazione }),
        ];
      }
      const t2 = testiAutomazioneV2(a);
      const giri = opzioni.giri?.get?.(a.id) ?? null;
      if (!giri) queueMicrotask(() => opzioni.onCaricaGiri?.(a)); // lo storico si chiede quando il pannello si apre, una volta
      const meta = nodo(d, 'div', 'td-detail-meta');
      meta.append(etichetta(s.testo, s.tono), nodo(d, 'span', '', t2.origine), nodo(d, 'span', '', dataBreve(a.creataAlle)));
      const storico = nodo(d, 'div', 'talos-automation__storico');
      storico.dataset.autoStorico = '';
      if (!giri || giri.stato === 'caricamento') storico.append(nodo(d, 'p', 'td-subtle', traduci('sezioni.automations.v2.row.historyLoading')));
      else if (giri.stato === 'errore') { const e = nodo(d, 'p', 'td-subtle', traduci('sezioni.automations.v2.row.historyFailed', { reason: giri.errore })); e.setAttribute('role', 'alert'); storico.append(e); }
      else if (!giri.items?.length) storico.append(nodo(d, 'p', 'td-subtle', traduci('sezioni.automations.v2.row.historyEmpty')));
      else for (const giro of giri.items) storico.append(creaRigaGiro(giro, { document: d, onApri: opzioni.onApriGiro && ((g) => opzioni.onApriGiro(a, g)), onLetto: opzioni.onGiroLetto && ((g) => opzioni.onGiroLetto(a, g)),
        onProposta: opzioni.onProposta && ((g, decisione) => opzioni.onProposta(a, g, decisione)), onMenuGiro: opzioni.onMenuGiro }));
      return [
        meta,
        nodo(d, 'h2', '', t2.nome),
        nodo(d, 'h3', '', traduci('sezioni.automations.v2.section.detail.when')),
        // righe chiave/valore come «Dove e come»: una frase coi punti si leggeva male (foto 08/10)
        kv(d, traduci('sezioni.automations.v2.section.detail.schedule'), t2.quando), // «Orario»: non ripete il titolo «Quando»
        kv(d, traduci('sezioni.automations.v2.row.next'), t2.prossimo),
        kv(d, traduci('sezioni.automations.v2.row.last'), t2.ultimo),
        nodo(d, 'h3', '', traduci('sezioni.automations.v2.row.instructions')),
        nodo(d, 'div', 'td-prose', a.istruzioni ?? ''),
        nodo(d, 'h3', '', traduci('sezioni.automations.v2.section.detail.where')),
        kv(d, traduci('sezioni.automations.v2.row.folder'), a.cartella ?? ''),
        kv(d, traduci('sezioni.automations.row.model'), t2.modello),
        kv(d, traduci('sezioni.automations.v2.row.permissions'), t2.permessi),
        kv(d, traduci('sezioni.automations.v2.row.repeat'), t2.ripeti),
        ...rigaCoordinazione(d, a, t2.nome, { salvataggio, onCoordinazione: opzioni.onCoordinazione }),
        nodo(d, 'h3', '', traduci('sezioni.automations.v2.section.detail.runs')),
        storico,
        // la regola dei giri persi e di «Da guardare» (era sotto l'elenco vecchio): accanto allo storico, dove serve
        nodo(d, 'p', 'td-subtle', traduci('modello.automations.v2Scope')),
      ];
    },
    azioniDettaglio: (a, { doc: d }) => {
      const menu = (e) => opzioni.onMenu?.(a, { ancoraEl: e?.currentTarget || null });
      const tutte = bottone(d, traduci('sezioni.common.allActions'), { esegui: menu });
      tutte.dataset.autoTutteLeAzioni = '';
      if (a?.versione !== 2) {
        const accendi = bottone(d, traduci(a?.attiva ? 'sezioni.automations.v2.section.action.pause' : 'sezioni.automations.v2.section.action.turnOn'),
          { esegui: () => opzioni.onToggle?.(a, !a?.attiva), disabilitato: salvataggio });
        return [accendi, tutte];
      }
      const principale = a.giroInCorso
        ? bottone(d, traduci('sezioni.automations.v2.menu.stop'), { esegui: () => opzioni.onFerma?.(a), disabilitato: salvataggio })
        : bottone(d, traduci('sezioni.automations.v2.menu.runNow'), { variante: 'primary', esegui: () => opzioni.onEsegui?.(a), disabilitato: salvataggio });
      principale.dataset.autoAzionePrincipale = '';
      const modifica = bottone(d, traduci('sezioni.automations.v2.menu.edit'), { esegui: () => opzioni.onModifica?.(a), disabilitato: salvataggio });
      modifica.dataset.autoModifica = '';
      return [principale, modifica, tutte];
    },
    notaPiede: () => (salvataggio ? traduci('sezioni.common.saving') : ''),
    vuoto: {
      titolo: traduci('sezioni.automations.v2.section.empty.title'),
      testo: traduci('sezioni.automations.v2.section.empty.text'),
      azione: typeof opzioni.onNuova === 'function'
        ? (d) => bottone(d, traduci('sezioni.automations.v2.sheet.titleNew'), { variante: 'primary', esegui: () => opzioni.onNuova() })
        : undefined,
    },
  });
  collocaNuova(schermo);
  return visibili;
}

/*
 * «Nuova automazione» sta nella TESTATA, a destra del titolo, piccola — come «Nuova nota» (owner 08/10/2026: «Come Note»).
 * È lo stesso nodo e lo stesso gestore di sempre (`[data-automation-action="new"]`, `app.js`): cambia solo il posto. E come in
 * Note (`collocaNuova` di `sezioni-adattatori.js`), quando l'elenco si nasconde — sezione stretta col dettaglio aperto — il
 * bottone torna nella barra in alto, così non sparisce; un ResizeObserver sull'elenco lo riporta nella testata quando riappare.
 */
const osservatoriNuova = new WeakMap();
function collocaNuova(schermo) {
  const b = schermo.querySelector('[data-automation-action="new"]');
  const master = schermo.querySelector('.td-section[data-section="automazioni"] .td-master');
  const intro = master?.querySelector('.td-intro');
  if (!b || !master || !intro) return;
  /* la taglia di «Nuova nota» (`talos-button--sm`, 29 px): la `--md` che il guscio dà al bottone vecchio lo teneva a 36 (misurato) */
  b.classList.remove('talos-button--md');
  b.classList.add('talos-button--sm');
  const metti = () => {
    const topbar = schermo.querySelector('.talos-topbar');
    if (master.getClientRects().length === 0 && topbar) {
      let strumenti = topbar.querySelector('.td-tools');
      if (!strumenti) { strumenti = nodo(schermo.ownerDocument, 'div', 'td-tools'); topbar.append(strumenti); }
      if (b.parentNode !== strumenti) strumenti.append(b);
    } else if (b.parentNode !== intro) {
      intro.append(b);
    }
  };
  metti();
  const Osservatore = schermo.ownerDocument.defaultView?.ResizeObserver;
  const gia = osservatoriNuova.get(schermo);
  if (typeof Osservatore !== 'function' || gia?.master === master) return;
  gia?.osservatore.disconnect();
  const osservatore = new Osservatore(() => collocaNuova(schermo));
  osservatore.observe(master);
  osservatoriNuova.set(schermo, { master, osservatore });
}

/** Per le prove e per chi deve aprire il pannello di una voce da fuori (es. una notifica): la seleziona e ridisegna. */
export function apriAutomazioneNelPannello(schermo, id) {
  const st = statoSezione(schermo);
  if (!st) return false;
  st.selezione = String(id);
  return true;
}
