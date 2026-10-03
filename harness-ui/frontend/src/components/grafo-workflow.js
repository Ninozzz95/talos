/*
 * ⭐ F3-42 (25/09/2026) — il DIAGRAMMA del workflow al centro della chat, sui dati v2 del backend F3-21/F3-51d.
 *   Struttura R4 approvata dall'owner il 23/09 (testata, card della sessione principale, colonne per fase, dettaglio in basso;
 *   `Downloads/talos/R4-UI-MOCKUP-LIVELLI-2026-09-23.md`). Decisioni che lo reggono (memoria `decisioni-owner-f3-workflow-ui-25-09`):
 *   · D26 un agente è un PASSO della Definition; · D27 i dati si DERIVANO dai fatti, nessuna % per passo; · D28 icona di fase
 *   dai ruoli; · D29 avanzamento = terminati/totale, errori a parte; · D30 una vista sola (il run, se c'è); · D32 la vista
 *   Lettura = albero ARIA fasi → passi (WAI-ARIA APG «Tree View», letto il 25/09/2026); · decisione 9: la card in alto è la
 *   sessione PRINCIPALE, vera, NON contata fra gli agenti.
 *
 * ⭐⭐ Refactor dei grafi (decisioni owner 24-31, 25-26/09/2026): il livello nuovo, PORTATO dal prototipo approvato
 *   («eccezionale», `prototypes/grafi-v2`, commit ab51d6166) sui dati veri:
 *   · tela con pan e zoom a passi del 10% e la percentuale, minimappa, solo i visibili nel DOM, card compatte sotto il 55% e
 *     blocchi di colore sotto il 30%, gruppi che si APRONO SUL POSTO (griglia oltre 12 passi) — `grafo/tela.js`;
 *   · disposizione ELK nel suo worker (elkjs 0.12.0, EPL-2.0 OR GPL-3.0-or-later), colonne allineate — `grafo/disposizione.js`;
 *   · vista Tempo, Gantt coi tempi morti compressi — `grafo/tempo.js`;
 *   · riproduzione FEDELE dalla storia pubblica degli stati (decisione 29, rotta `…/history`);
 *   · Percorso (eseguito, fronte, bloccati da un problema) e focus a monte e a valle (rotta `…/lineage`);
 *   · archi solo per i gruppi aperti (decisione 30), gli altri contati fra le fasi.
 *   Restano quelli di prima, uguali: i controlli del run (F3-52), il dettaglio con le evidenze e il compito, la Lettura ad
 *   albero, la ricerca, il dal vivo (`client.segui`), il rail che apre e segue la selezione (F3-50).
 */
import ELK from 'elkjs/lib/elk-api.js';

import { nomeUmanoAttrezzo } from './nomi-attrezzi.js';
import { apriConfermaRun, azioniDelRun, conseguenzeAnnulla, righeAumento, testoAmbiguo, testoErroreRun, TESTO_RIUSCITO } from './controlli-run.js'; // F3-52
import {
  durataDelPasso, formattaDurata, ICONA_TONO, iconaDelPasso, livelloPer, maiuscola, modelloDelPasso, PAGINA_ELENCO, percentualeFase,
  statoDelRun, statoPasso, TONO_RUN,
} from './grafo/comuni.js';
import { chiaveCella, disponi, formaDelleFasi } from './grafo/disposizione.js';
import { creaFonte } from './grafo/fonte.js';
import { creaTela } from './grafo/tela.js';
import { cifra as cifraLingua, creaTempo, oraBreve, parolaDelPasso } from './grafo/tempo.js';
import { t as tr, tn } from './lingua.js';
import { montaPannelloRisultati } from './workflow-results-panel.js';

// chi importava gli aiuti da qui (rail, prove) continua a trovarli qui
export {
  cifra, conteggiFase, durataDelPasso, formattaDurata, ICONE_RUOLO, iconaDellaFase, iconaDelPasso, livelloPer, MASSIMO_DETTAGLIO, modelloDelPasso,
  PAGINA_ELENCO, percentualeFase, RIGHE_CAMPIONE, SOGLIA_AGENTI, spostaConteggi, STATI_PASSO, STATI_RUN, statoDelRun, tonoFase,
} from './grafo/comuni.js';
export { prossimoZoom } from './grafo/tela.js';

const RILETTURA_MINIMA_MS = 1_000;
const PROBLEMI = new Set(['failed', 'uncertain', 'waiting_human']);
const PROBLEMI_MASSIMI = 50; // le discendenze che si chiedono per il Percorso: oltre, i bloccati si dicono solo di questi
/* Il testo di ogni vista è una CHIAVE del dizionario: si risolve quando si disegna, mai al caricamento del modulo. */
const VISTE = Object.freeze([['dipendenze', 'agenti.workflow.viewDependencies', 'i-branch'], ['tempo', 'agenti.workflow.viewTime', 'i-clock'], ['lettura', 'agenti.workflow.viewReading', 'i-list']]);
/* La parola dello stato del run, nella lingua corrente (le chiavi sono quelle di `STATI_RUN` in `grafo/comuni.js`, che resta la fonte dei toni). */
const CHIAVI_STATO_RUN = Object.freeze({
  created: 'agenti.workflow.runState.created', running: 'agenti.workflow.runState.running', paused: 'agenti.workflow.runState.paused', needs_attention: 'agenti.workflow.runState.needsAttention',
  succeeded: 'agenti.workflow.runState.succeeded', failed: 'agenti.workflow.runState.failed', cancelled: 'agenti.workflow.runState.cancelled', planned: 'agenti.workflow.runState.planned',
  proposed: 'agenti.workflow.runState.proposed', approved: 'agenti.workflow.runState.approved', pausing: 'agenti.workflow.runState.pausing', cancelling: 'agenti.workflow.runState.cancelling',
});
const parolaDelRun = (grezzo) => (CHIAVI_STATO_RUN[grezzo] ? tr(CHIAVI_STATO_RUN[grezzo]) : grezzo);
/* «3 agenti» / «3 agents»: il numero col raggruppamento della lingua, la parola dal dizionario. */
const plurale = (n, uno, molti) => tn(uno, molti, n, { n: cifraLingua(n) });
const AGENTE = ['agenti.graph.agentOne', 'agenti.graph.agentMany'], FASE = ['agenti.workflow.phaseOne', 'agenti.workflow.phaseMany'];
/** Una frase con dei segnaposto che diventano nodi (un `<strong>` per i conteggi): l'ORDINE lo decide la traduzione, non il codice. */
function fraseConNodi(chiave, nodi) {
  const modello = tr(chiave, Object.fromEntries(Object.keys(nodi).map((k) => [k, `{${k}}`])));
  return modello.split(/(\{[a-z]+\})/u).filter(Boolean).map((pezzo) => nodi[pezzo.slice(1, -1)] ?? pezzo);
}
const LENTEZZE = Object.freeze([[10, '×10'], [60, '×60'], [300, '×300']]);
const operaio = () => new URL('vendor/elk/elk-worker.min.js', globalThis.document?.baseURI ?? 'http://localhost/').href;

/**
 * Monta il diagramma dentro `host` (la vista della chat, sotto la testata). Le letture sono tutte GET; gli unici comandi sono
 * quelli del run (F3-52), con le loro conferme. Ritorna `{ elemento, stato, vai, distruggi }`.
 */
export function montaGrafoWorkflow(host, {
  client, sorgente, sessione = {}, onChiudi, onApriSessione, adesso = () => Date.now(),
  pianifica = (f) => (globalThis.requestAnimationFrame ?? setTimeout)(f), storage = globalThis.sessionStorage,
  // F3-50: il rail apre il diagramma su un gruppo o un passo, e ne evidenzia la selezione
  iniziale = null, onSelezione = null,
  // F3-52: il gestore degli overlay della app (fuoco e uscita della conferma) e, per le prove, chi genera i commandId
  gestoreOverlay = () => null, uuid = null,
  // refactor dei grafi: il motore di disposizione (nelle prove unitarie, `elk.bundled.js`, senza worker)
  creaElk = () => new ELK({ workerUrl: operaio() }),
} = {}) {
  const d = host.ownerDocument;
  const finestra = d.defaultView;
  const el = (tag, classe, testo) => { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; };
  const icona = (nome, classe = '') => {
    const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `i ${classe}`.trim()); svg.setAttribute('aria-hidden', 'true');
    const use = d.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${nome}`); svg.append(use);
    return svg;
  };
  const bottone = (testo, classe, aria) => { const b = el('button', classe, testo); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); return b; };
  const chiaveMemoria = `talos.grafo-workflow.v1:${sessione.id ?? ''}`;
  let ricordato = {};
  try { const grezzo = storage?.getItem(chiaveMemoria); if (grezzo && grezzo.length < 4096) ricordato = JSON.parse(grezzo) ?? {}; } catch { /* storage non disponibile */ }
  const vistaRicordata = ricordato.vista === 'diagramma' ? 'dipendenze' : ricordato.vista;
  const run = sorgente.tipo === 'run';

  const stato = {
    sorgente, errore: null, carica: true,
    vista: VISTE.some(([id]) => id === vistaRicordata) && (run || vistaRicordata !== 'tempo') ? vistaRicordata : 'dipendenze',
    aperti: new Set(iniziale?.gruppo ? [iniziale.gruppo] : []), apertiScelti: Boolean(iniziale?.gruppo),
    selezionato: iniziale?.passo ?? null, faseSelezionata: iniziale?.gruppo ?? null, dettaglio: null, evidenze: null, lignaggio: null,
    query: '', cercaAperta: false, percorso: false, focus: null, bloccati: new Set(),
    t: null, riproduce: false, velocita: 60,
    espansi: new Set(iniziale?.gruppo ? [iniziale.gruppo] : []), mostrati: new Map(), fuocoAlbero: null,
    aggiornatoAlle: null, inVolo: null, fotogrammi: 0, disposto: false,
  };
  let ultimaSelezione = null;
  let morto = false, chiudiFlusso = () => {}, chiudiEvidenze = () => {}, rilettura = null, ultimaRilettura = 0, orologio = null;
  let generazione = 0, versioneDisposizione = 0;
  const elk = creaElk();
  const fonte = creaFonte({ client, sorgente, onCambio: () => programmaAggiorna() });

  /* ——— la struttura fissa: testata R4, riga dei comandi, area delle viste, riproduzione, dettaglio ——— */
  const root = el('section', 'talos-grafo talos-wfg');
  root.dataset.c = 'GrafoAgenti'; root.dataset.sorgente = 'workflow';
  root.setAttribute('aria-label', tr('agenti.delegations.title'));
  const cima = el('header', 'talos-wfg__cima');
  const titoli = el('div', 'talos-wfg__titoli');
  const titolo = el('h2', 'talos-wfg__titolo', tr('agenti.delegations.title'));
  const sommario = el('p', 'talos-wfg__sommario');
  const descrizione = el('p', 'talos-wfg__descrizione');
  const fuocoChip = el('p', 'gv-fuoco'); fuocoChip.hidden = true;
  titoli.append(titolo, sommario, descrizione, fuocoChip);
  const lato = el('div', 'talos-wfg__lato');
  const aggiornato = el('div', 'talos-wfg__aggiornato');
  const aggiornatoTesto = el('span', 'talos-wfg__aggiornato-ora');
  const statoRun = el('span', 'talos-wfg__stato-run'); statoRun.setAttribute('role', 'status');
  aggiornato.append(aggiornatoTesto, statoRun);
  const torna = bottone(tr('agenti.delegations.backToChat'), 'talos-button talos-button--secondary talos-button--sm talos-wfg__torna');
  torna.addEventListener('click', () => onChiudi?.());
  /* F3-52, decisione owner 21: i comandi del run accanto a «Torna alla chat» — un pulsante secondo lo stato e un «…» con gli
     altri (anche col tasto destro sulla card della sessione), Annulla in fondo e separato (NN/g, «Dangerous UX»). */
  const comandiRun = el('div', 'talos-wfg__run'); comandiRun.hidden = true;
  const principaleRun = bottone('', 'talos-button talos-button--secondary talos-button--sm talos-wfg__run-principale');
  principaleRun.dataset.focusKey = 'run:principale';
  const menuRun = el('div', 'talos-wfg__menu-run');
  const altroRun = bottone('', 'talos-wfg__icona-bottone', tr('agenti.workflow.runCommandsMore')); altroRun.append(icona('i-more'));
  altroRun.setAttribute('aria-haspopup', 'menu'); altroRun.setAttribute('aria-expanded', 'false'); altroRun.dataset.focusKey = 'run:menu';
  const vociRun = el('div', 'talos-wfg__menu talos-wfg__menu--destra'); vociRun.setAttribute('role', 'menu'); vociRun.setAttribute('aria-label', tr('agenti.workflow.runCommands')); vociRun.hidden = true;
  menuRun.append(altroRun, vociRun);
  comandiRun.append(principaleRun, menuRun);
  const esitoRun = el('p', 'talos-wfg__esito-run'); esitoRun.setAttribute('role', 'status'); esitoRun.hidden = true;
  const riga1 = el('div', 'talos-wfg__lato-riga'); riga1.append(aggiornato, comandiRun, torna);
  lato.append(riga1, esitoRun);
  cima.append(titoli, lato);

  /* ⛔ foto del 26/09 a 1440 nella colonna dell'app: con i comandi accanto al titolo, il titolo finiva in una colonna di una
     parola per riga. I comandi del diagramma stanno su una riga loro, intera: a sinistra CHE COSA si guarda (vista, percorso),
     a destra COME (cerca, zoom, adatta, gruppi) — decisione owner 12: la riga dei comandi c'è a ogni scala. */
  const comandi = el('div', 'gv-comandi'); comandi.setAttribute('role', 'toolbar'); comandi.setAttribute('aria-label', tr('agenti.delegations.controlsLabel'));
  const viste = el('div', 'gv-viste'); viste.setAttribute('role', 'radiogroup'); viste.setAttribute('aria-label', tr('agenti.workflow.view'));
  const vociVista = new Map(VISTE.map(([id, chiave, ic]) => {
    const b = bottone('', 'gv-vista'); b.setAttribute('role', 'radio'); b.append(icona(ic), el('span', null, tr(chiave)));
    b.dataset.vista = id; b.dataset.focusKey = `vista:${id}`;
    if (id === 'tempo' && !run) { b.disabled = true; b.title = tr('agenti.workflow.timeNotStarted'); }
    b.addEventListener('click', () => scegliVista(id));
    viste.append(b);
    return [id, b];
  }));
  viste.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const ammesse = VISTE.map(([id]) => id).filter((id) => !vociVista.get(id).disabled);
    const i = ammesse.indexOf(stato.vista);
    const prossima = ammesse[(i + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1) + ammesse.length) % ammesse.length];
    scegliVista(prossima); vociVista.get(prossima).focus();
  });
  const percorso = bottone('', 'talos-wfg__icona-bottone gv-percorso'); percorso.setAttribute('aria-pressed', 'false');
  percorso.append(icona('i-history'), el('span', null, tr('agenti.workflow.path')));
  percorso.title = run ? tr('agenti.workflow.pathHint')
    : tr('agenti.workflow.pathNotStarted');
  percorso.disabled = !run;
  percorso.addEventListener('click', () => { stato.percorso = !stato.percorso; percorso.setAttribute('aria-pressed', String(stato.percorso)); void calcolaBloccati(); evidenzia(); });
  const campoCerca = el('input', 'talos-wfg__cerca nopan'); campoCerca.type = 'search'; campoCerca.placeholder = tr('agenti.workflow.searchPlaceholder');
  campoCerca.setAttribute('aria-label', tr('agenti.workflow.searchLabel')); campoCerca.hidden = true;
  const cerca = bottone('', 'talos-wfg__icona-bottone', tr('agenti.delegations.searchButton')); cerca.append(icona('i-search'));
  const meno = bottone('', 'talos-wfg__icona-bottone', tr('agenti.workflow.zoomOut10')); meno.append(icona('i-minus'));
  const percento = bottone('100%', 'talos-wfg__icona-bottone gv-percento', tr('agenti.delegations.zoomReset'));
  const piu = bottone('', 'talos-wfg__icona-bottone', tr('agenti.workflow.zoomIn10')); piu.append(icona('i-plus'));
  const adatta = bottone('', 'talos-wfg__icona-bottone', tr('agenti.delegations.fit')); adatta.append(icona('i-fit'));
  const menuGruppi = el('div', 'talos-wfg__menu-vista');
  const altroGruppi = bottone('', 'talos-wfg__icona-bottone', tr('agenti.workflow.groups')); altroGruppi.append(icona('i-layers'));
  altroGruppi.setAttribute('aria-haspopup', 'menu'); altroGruppi.setAttribute('aria-expanded', 'false');
  const vociGruppi = el('div', 'talos-wfg__menu talos-wfg__menu--destra'); vociGruppi.setAttribute('role', 'menu'); vociGruppi.setAttribute('aria-label', tr('agenti.workflow.groups')); vociGruppi.hidden = true;
  const voceGruppi = (testo, azione) => {
    const b = bottone(testo, 'talos-wfg__menu-voce'); b.setAttribute('role', 'menuitem'); b.tabIndex = -1;
    b.addEventListener('click', () => { chiudiMenu(altroGruppi, vociGruppi, { fuoco: true }); azione(); });
    vociGruppi.append(b);
  };
  voceGruppi(tr('agenti.workflow.openAllGroups'), () => { stato.aperti = new Set(fonte.panoramica.groups.map((g) => g.phaseId)); stato.apertiScelti = true; void ridisponi(); });
  voceGruppi(tr('agenti.workflow.closeAllGroups'), () => { stato.aperti = new Set(); stato.apertiScelti = true; void ridisponi(); });
  voceGruppi(tr('agenti.workflow.openWhereWorking'), () => { stato.aperti = apertiDiPartenza(); stato.apertiScelti = true; void ridisponi(); });
  altroGruppi.addEventListener('click', () => (vociGruppi.hidden ? apriMenu(altroGruppi, vociGruppi) : chiudiMenu(altroGruppi, vociGruppi)));
  menuGruppi.append(altroGruppi, vociGruppi);
  const comandiSinistra = el('div', 'gv-comandi-gruppo'); comandiSinistra.append(viste, percorso);
  const comandiDestra = el('div', 'gv-comandi-gruppo'); comandiDestra.append(campoCerca, cerca, meno, percento, piu, adatta, menuGruppi);
  comandi.append(comandiSinistra, comandiDestra);
  const esitoCerca = el('p', 'talos-wfg__esito-cerca'); esitoCerca.setAttribute('role', 'status');
  const avviso = el('p', 'talos-wfg__avviso'); avviso.setAttribute('role', 'status');

  const area = el('div', 'gv-area');
  const lettura = el('div', 'talos-wfg__lettura gv-lettura'); lettura.hidden = true;

  /* la riproduzione (solo per un run): sullo stesso asse compresso della vista Tempo, dalla storia degli stati */
  const rip = el('div', 'gv-rip'); rip.setAttribute('role', 'group'); rip.setAttribute('aria-label', tr('agenti.workflow.playbackLabel')); rip.hidden = !run;
  rip.dataset.pronta = 'false';
  const ripGioca = bottone('', 'gv-rip-gioca', tr('agenti.workflow.playRun')); ripGioca.append(icona('i-play'));
  const ripVelocita = el('div', 'gv-rip-velocita'); ripVelocita.setAttribute('role', 'radiogroup'); ripVelocita.setAttribute('aria-label', tr('agenti.workflow.speedLabel'));
  for (const [v, testo] of LENTEZZE) {
    const b = bottone(testo, 'gv-rip-v'); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v === stato.velocita));
    b.title = v === 60 ? tr('agenti.workflow.speedMinute') : tr('agenti.delegations.speedFaster', { v });
    b.addEventListener('click', () => { stato.velocita = v; for (const x of ripVelocita.children) x.setAttribute('aria-checked', String(x === b)); });
    ripVelocita.append(b);
  }
  const ripBinario = el('div', 'gv-rip-binario nopan');
  ripBinario.tabIndex = 0; ripBinario.setAttribute('role', 'slider'); ripBinario.setAttribute('aria-label', tr('agenti.workflow.sliderLabel'));
  const ripVuoti = el('div', 'gv-rip-vuoti');
  const ripPieno = el('div', 'gv-rip-pieno');
  const ripManiglia = el('div', 'gv-rip-maniglia');
  ripBinario.append(ripVuoti, ripPieno, ripManiglia);
  const ripTesto = el('span', 'gv-rip-testo', tr('agenti.workflow.loadingHistory'));
  const ripVivo = bottone(tr('agenti.delegations.backToLive'), 'talos-button talos-button--secondary talos-button--sm gv-rip-vivo'); ripVivo.hidden = true;
  const ripNota = el('span', 'gv-rip-nota', tr('agenti.workflow.replayNote'));
  rip.append(ripGioca, ripVelocita, ripBinario, ripTesto, ripVivo, ripNota);

  /* il dettaglio in basso (R4): chi · Evidenze recenti · Task corrente · «…» */
  const dettaglio = el('section', 'talos-wfg__dettaglio gv-dettaglio'); dettaglio.hidden = true; dettaglio.setAttribute('aria-label', tr('agenti.delegations.detailLabel'));
  const detChi = el('div', 'talos-wfg__dettaglio-chi');
  const detProve = el('section', 'talos-wfg__dettaglio-colonna'); detProve.setAttribute('aria-label', tr('agenti.delegations.recentEvidence'));
  const detCompito = el('section', 'talos-wfg__dettaglio-colonna'); detCompito.setAttribute('aria-label', tr('agenti.delegations.currentTask'));
  const detAltro = el('div', 'talos-wfg__dettaglio-altro');
  const menuAgente = bottone('', 'talos-wfg__icona-bottone', tr('agenti.delegations.agentActions')); menuAgente.append(icona('i-more'));
  menuAgente.setAttribute('aria-haspopup', 'menu'); menuAgente.setAttribute('aria-expanded', 'false'); menuAgente.dataset.focusKey = 'dettaglio:menu';
  const vociAgente = el('div', 'talos-wfg__menu talos-wfg__menu--destra'); vociAgente.setAttribute('role', 'menu'); vociAgente.hidden = true;
  const voceAgente = (testo, azione) => {
    const b = el('button', 'talos-wfg__menu-voce', testo); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.tabIndex = -1;
    b.addEventListener('click', () => { chiudiMenu(menuAgente, vociAgente); azione(); });
    vociAgente.append(b);
    return b;
  };
  const apriConversazione = voceAgente(tr('agenti.workflow.openConversation'), () => {
    const riga = { ...(fonte.riga(stato.selezionato) ?? {}), ...(stato.dettaglio ?? {}) };
    if (riga.stepSessionId) onApriSessione?.(riga.stepSessionId, riga);
  });
  voceAgente(tr('agenti.delegations.closeDetail'), () => { stato.selezionato = null; stato.dettaglio = null; chiudiEvidenze(); chiudiEvidenze = () => {}; evidenzia(); disegnaDettaglio(); avvisaSelezione(); });
  menuAgente.addEventListener('click', () => (vociAgente.hidden ? apriMenu(menuAgente, vociAgente) : chiudiMenu(menuAgente, vociAgente)));
  detAltro.append(menuAgente, vociAgente);
  dettaglio.append(detChi, detProve, detCompito, detAltro);
  root.append(cima, comandi, esitoCerca, avviso, area, rip, dettaglio);
  host.append(root);
  /* le tre viste nell'area */
  const tela = creaTela(area, {
    icona,
    onSeleziona: (id, { apri = false } = {}) => { seleziona(id); if (apri) dettaglio.querySelector('button')?.focus(); },
    onGruppo: (phaseId, apri, blocco) => { if (apri) stato.aperti.add(phaseId); else stato.aperti.delete(phaseId); stato.apertiScelti = true; void ridisponi({ da: apri ? blocco : null, fuoco: apri ? phaseId : null }); },
    onZoom: (k) => { if (stato.vista === 'dipendenze') percento.textContent = `${Math.round(k * 100)}%`; },
    onMancano: (phaseId, da, a) => fonte.chiedi(phaseId, da, a),
  });
  const tempo = creaTempo(area, {
    icona,
    onSeleziona: (id) => seleziona(id),
    onZoom: (k) => { if (stato.vista === 'tempo') percento.textContent = `${Math.round(k * 100)}%`; },
  });
  tempo.elemento.hidden = true;
  area.append(lettura);
  // Il foglio vive nella sola tela: testata, navigazione e dettaglio restano operabili.
  const pannelloRisultati = montaPannelloRisultati(area, {
    client, sorgente,
    onRitorno: () => {
      const trigger = dettaglio.querySelector('[data-azione="apri-risultati"]');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
    },
  });

  /* ——— i dati per le viste ——— */
  const ricorda = () => { try { storage?.setItem(chiaveMemoria, JSON.stringify({ vista: stato.vista })); } catch { /* storage non disponibile */ } };
  const statoDi = (nodeId) => fonte.statoDi(nodeId, stato.t);
  const corrisponde = (testo) => !stato.query || String(testo ?? '').toLocaleLowerCase('it-IT').includes(stato.query.toLocaleLowerCase('it-IT'));
  const tempoCorrente = () => stato.t;
  let asseCache = { chiave: null, asse: null };
  function asse() {
    const t1 = adesso();
    const chiave = `${fonte.versioneStoria}|${Math.floor(t1 / 1000)}`;
    if (asseCache.chiave !== chiave) asseCache = { chiave, asse: fonte.asse(t1) };
    return asseCache.asse;
  }
  /** La durata di un passo: dal vivo dalla riga (D27); in riproduzione dal suo ultimo tentativo cominciato prima di `t`. */
  function durataDi(nodeId, st) {
    if (st === 'pending' || st === 'blocked' || st === 'planned') return null;
    if (stato.t === null) return formattaDurata(durataDelPasso({ ...(fonte.riga(nodeId) ?? {}), state: st }, adesso()));
    const tt = (fonte.tentativi().get(nodeId) ?? []).filter((x) => x.da <= stato.t).at(-1);
    return tt ? formattaDurata(Math.min(tt.a ?? stato.t, stato.t) - tt.da) : null;
  }
  const grezzoDelRun = () => (stato.t === null ? statoDelRun(fonte.panoramica, { tipo: sorgente.tipo, revisione: fonte.revisione }) : fonte.statoDelRunAl(stato.t) ?? 'running');
  function datiSessione() {
    const p = fonte.panoramica;
    let durata = null;
    if (run) {
      // la durata del COORDINAMENTO è quella del run: dall'avvio all'ultimo fatto (finito) o a adesso (in corso)
      const inizio = Date.parse(fonte.inizioDelRun() ?? sorgente.createdAt ?? '');
      const fine = stato.t ?? (['succeeded', 'failed', 'cancelled'].includes(p?.status) ? Date.parse(fonte.meta?.generatedAt ?? '') : adesso());
      durata = Number.isFinite(inizio) && Number.isFinite(fine) ? formattaDurata(Math.max(0, fine - inizio)) : null;
    }
    const titoloSessione = fonte.revisione?.title || sessione.nome || tr('agenti.delegations.mainSession');
    return { titolo: titoloSessione, durata, sotto: sessione.modello ? tr('agenti.workflow.mainSessionWithModel', { modello: sessione.modello }) : tr('agenti.delegations.mainSession') };
  }
  function datiViste() {
    return {
      panoramica: fonte.panoramica,
      sessione: datiSessione,
      statoRun: () => { const g = grezzoDelRun(); return { parola: parolaDelRun(g), tono: TONO_RUN[g] ?? 'neutro' }; },
      conteggi: (phaseId) => fonte.conteggi(phaseId, stato.t),
      riga: (id) => fonte.riga(id),
      cella: (phaseId, i) => fonte.cella(phaseId, i),
      chiaveDi: (id) => {
        const posto = id ? fonte.posto(id) : null;
        if (!posto) return id;
        return formaDelleFasi(fonte.panoramica, stato.aperti).get(posto.phaseId) === 'griglia' ? chiaveCella(posto.phaseId, posto.indice) : id;
      },
      statoDi, durataDi,
      modelloDi: (riga) => modelloDelPasso(riga, sessione.modello),
      corrisponde: (id, q) => { const r = fonte.riga(id); const n = q.toLocaleLowerCase('it-IT'); return Boolean(r) && [r.label, r.taskPreview].some((x) => String(x ?? '').toLocaleLowerCase('it-IT').includes(n)); },
      bloccatoDaProblema: (id) => stato.bloccati.has(id) && ['pending', 'blocked'].includes(statoDi(id)),
    };
  }
  function datiTempo() {
    return {
      panoramica: fonte.panoramica, asse, tentativi: () => fonte.tentativi(), campata: (p) => fonte.campata(p),
      cella: (phaseId, i) => fonte.cella(phaseId, i), chiedi: (phaseId, da, a) => fonte.chiedi(phaseId, da, a), posto: (id) => fonte.posto(id),
      statoDi, conteggi: (phaseId) => fonte.conteggi(phaseId, stato.t), selezionato: () => stato.selezionato, tempoCorrente,
      spento: (id) => Boolean((stato.focus && !stato.focus.insieme.has(id)) || (stato.query && !datiViste().corrisponde(id, stato.query))),
    };
  }

  /* ——— caricamento e disposizione ——— */
  /** Dove si apre la prima volta: tutti i gruppi fino alla soglia misurata (F3-42, 25 passi), altrimenti dove si lavora. */
  function apertiDiPartenza() {
    const p = fonte.panoramica;
    if (livelloPer(p.total) === 'agenti') return new Set(p.groups.map((g) => g.phaseId));
    const peso = (g) => (g.counts?.running ?? 0) + (g.counts?.leased ?? 0) + (g.attention ?? 0) * 5;
    const migliore = [...p.groups].sort((a, b) => peso(b) - peso(a))[0];
    return new Set(migliore ? [migliore.phaseId] : []);
  }
  async function carica({ primaVolta = false } = {}) {
    const mia = ++generazione;
    try {
      const primaVersione = fonte.panoramica?.graphVersion ?? null;
      await fonte.caricaPanoramica();
      if (morto || mia !== generazione) return;
      stato.aggiornatoAlle = fonte.meta?.generatedAt ?? stato.aggiornatoAlle;
      stato.errore = null; stato.carica = false;
      if (primaVolta) {
        // fino alla soglia (25 passi, F3-42) tutto aperto anche se il rail porta su un gruppo o un passo — come il livello «agenti»
        // di prima; oltre, il gruppo chiesto dal rail, o dove si lavora (misurato con la sonda del 26/09: dal rail a 14 passi si
        // apriva il solo gruppo del passo, e un clic su un altro agente del rail portava la tela all'80% e fuori dalle altre fasi)
        if (livelloPer(fonte.panoramica.total) === 'agenti' || !stato.apertiScelti || !fonte.panoramica.groups.some((g) => stato.aperti.has(g.phaseId))) stato.aperti = apertiDiPartenza();
        await ridisponi({ primaVolta: true });
        if (morto) return;
        const vistaAperta = tela.vista;
        if (!stato.selezionato) await sceltaIniziale();
        else seleziona(stato.selezionato, { muovi: false });
        // ⛔ giro vero del 26/09 sul 4174 (3 fasi, 5 passi): la vista d'apertura si calcolava PRIMA che la scelta iniziale aprisse
        //   il dettaglio, che accorcia la tela di ~170 px: il contenuto, centrato sull'altezza di prima, usciva tagliato in basso.
        //   Come xyflow, che mette in coda il `fitView` finché ciò da cui dipende non è pronto (`fitViewQueued && nodesInitialized`,
        //   packages/react/src/store/index.ts:130, clone 3d35b57 del 24/09/2026), la vista si rifà UNA volta a dettaglio aperto —
        //   solo se nel frattempo nessuno ha mosso la tela.
        const ora = tela.vista;
        if (!morto && ora.x === vistaAperta.x && ora.y === vistaAperta.y && ora.zoom === vistaAperta.zoom) await vistaIniziale();
        segui();
        if (iniziale) mostra(iniziale);
        orologio = setInterval(battito, 1_000);
      } else if (primaVersione !== null && fonte.panoramica.graphVersion !== primaVersione) await ridisponi();
      else aggiornaViste();
      if (run) void aggiornaStoria();
    } catch (errore) {
      if (morto || mia !== generazione) return;
      stato.carica = false;
      stato.errore = errore?.status === 404 ? tr('agenti.workflow.errorNotFound') : tr('agenti.workflow.errorRead');
      disegnaTesta();
    }
  }
  async function aggiornaStoria() {
    try {
      const cresciuta = await fonte.aggiornaStoria();
      if (morto) return;
      rip.dataset.pronta = String(fonte.storia.length > 0);
      if (cresciuta) { disegnaRiproduzione(); if (stato.percorso) await calcolaBloccati(); aggiornaViste(); }
      else aggiornaRiproduzione();
    } catch { /* la storia si ritenta alla prossima rilettura; il diagramma dal vivo non ne dipende */ }
  }
  /** La vista d'apertura, sulla disposizione e sull'area di adesso. */
  async function vistaIniziale() {
    const disp = tela.disposizione;
    const p = fonte.panoramica;
    if (!disp || !p) return;
    await tela.adatta({ anima: false });
    // ⛔ foto del 26/09: a 200 e 5.000 passi «Adatta» dà il 15% e non si legge niente. Si parte LEGGIBILI sul gruppo aperto;
    //   «Adatta» resta a un clic (e a «0» da tastiera) per la vista d'insieme.
    // ⛔ 26/09, prova nel browser sul prodotto: l'area qui è più bassa che nel prototipo (testata dell'app, dettaglio), e a
    //   14 passi «Adatta» scendeva sotto il 55%: si partiva al 80% con la terza colonna e la sessione TAGLIATE. Con tutte le
    //   fasi aperte (fino alla soglia di 25 passi) si adatta la LARGHEZZA con la cima in alto — la struttura R4 intera,
    //   sessione e colonne, come il mockup 14; sotto il 55% le card sono compatte (decisione 31). Oltre, la regola del prototipo.
    const aperto = disp.blocchi.find((b) => b.tipo !== 'gruppo');
    const tutteAperte = p.groups.every((g) => stato.aperti.has(g.phaseId));
    if (tela.zoom < 0.55 && !(tutteAperte && tela.adattaInLarghezza({ minimo: 0.3 })) && aperto) await tela.mostraInAlto(aperto.id, 0.8);
  }
  /** Una disposizione nuova (gruppi aperti o chiusi, struttura cambiata). Con `da` le card crescono dal blocco che si apre. */
  async function ridisponi({ da = null, fuoco = null, primaVolta = false } = {}) {
    const mia = ++versioneDisposizione;
    const p = fonte.panoramica;
    if (!p) return;
    fonte.dimentica();
    try {
      const forme = formaDelleFasi(p, stato.aperti);
      const fasiSottografo = p.groups.filter((g) => forme.get(g.phaseId) === 'fase').map((g) => g.phaseId);
      const righeFase = new Map(await Promise.all(fasiSottografo.map(async (phaseId) => [phaseId, await fonte.righeFase(phaseId)])));
      const archi = await fonte.archiPer(fasiSottografo);
      const disp = await disponi(elk, { panoramica: p, righeFase, archi }, stato.aperti);
      if (morto || mia !== versioneDisposizione) return;
      tela.impostaDati(datiViste());
      tela.imposta(disp, { da });
      stato.disposto = true;
      if (!tempo.elemento.hidden) tempo.imposta(datiTempo());
      disegnaTesta();
      if (stato.vista === 'lettura') disegnaLettura();
      if (primaVolta) await vistaIniziale();
      if (fuoco) { const b = disp.blocchi.find((q) => q.phaseId === fuoco); if (b) tela.mostraInAlto(b.id, Math.max(0.8, tela.zoom)); }
      evidenzia();
    } catch (errore) {
      if (morto || mia !== versioneDisposizione) return;
      stato.errore = errore?.status === 404 ? tr('agenti.workflow.errorNotFound') : tr('agenti.workflow.errorLayout');
      disegnaTesta();
    }
  }
  /** All'apertura si sceglie chi lavora DENTRO un gruppo aperto: selezionare un passo che non si vede non dice niente. */
  const sceltaIniziale = () => scegliIn(fonte.panoramica.groups.filter((g) => stato.aperti.has(g.phaseId)));
  /* chi lavora dentro queste fasi (se no chi chiede attenzione, se no il primo): all'apertura, e quando il rail porta il
     diagramma su un GRUPPO (decisione owner 19) — così rail e diagramma evidenziano quel gruppo, e il dettaglio dice qualcosa */
  async function scegliIn(fasi) {
    const caricate = fasi.flatMap((g) => (fonte.cella(g.phaseId, 0) ? Array.from({ length: Math.min(g.total, 50) }, (_, i) => fonte.cella(g.phaseId, i)).filter(Boolean) : []));
    let scelta = caricate.find((r) => statoPasso(statoDi(r.nodeId) ?? r.state).tono === 'corso') ?? caricate.find((r) => r.attentionCount > 0);
    if (!scelta && run && fasi[0]) {
      // una griglia grande: il server dice chi lavora (pagina «per stato», F3-42), senza scaricare tutte le sue pagine
      try {
        const campione = await client.gruppo(sorgente, fasi[0].phaseId, { offset: 0, limit: 4, perStato: true, arricchisci: false });
        scelta = campione.items.find((r) => statoPasso(r.state).tono === 'corso') ?? campione.items[0] ?? null;
      } catch { /* senza campione si resta senza selezione */ }
    }
    scelta ??= caricate[0] ?? null;
    if (scelta && !morto) seleziona(scelta.nodeId, { muovi: false, riga: scelta });
  }
  let aggiornaProgrammato = false;
  function programmaAggiorna() {
    if (aggiornaProgrammato || morto) return;
    aggiornaProgrammato = true;
    pianifica(() => { aggiornaProgrammato = false; if (!morto) aggiornaViste({ soloRighe: true }); });
  }
  /** Gli stati sono cambiati (vivo, rilettura, riproduzione, righe arrivate): si rinfrescano le viste in loco. */
  function aggiornaViste({ soloRighe = false } = {}) {
    if (!fonte.panoramica) return;
    tela.impostaDati(datiViste());
    if (stato.vista === 'dipendenze') tela.aggiorna();
    if (stato.vista === 'tempo') tempo.imposta(datiTempo());
    if (stato.vista === 'lettura') disegnaLettura();
    if (!soloRighe) { disegnaTesta(); disegnaRun(); }
    if (stato.selezionato) disegnaDettaglio();
    aggiornaRiproduzione();
  }
  function programmaRilettura() {
    if (rilettura || morto) return;
    const attesa = Math.max(0, RILETTURA_MINIMA_MS - (adesso() - ultimaRilettura));
    rilettura = setTimeout(() => { rilettura = null; ultimaRilettura = adesso(); void carica(); }, attesa);
  }
  function segui() {
    chiudiFlusso();
    if (!run || !fonte.panoramica) return;
    chiudiFlusso = client.segui(sorgente, {
      after: fonte.panoramica.lastSeq ?? 0,
      onUpdate: (fotogramma) => {
        if (morto) return;
        stato.fotogrammi += 1;
        stato.aggiornatoAlle = new Date(adesso()).toISOString();
        if (fotogramma.resync) { programmaRilettura(); return; }
        // righe in loco (RP §8.14: un aggiornamento di telemetria non ridisegna la struttura); i conteggi per fase si spostano
        // con le card (`spostaConteggi`), e la panoramica riletta (al più una al secondo, ETag) resta la fonte di verità
        const toccati = fonte.applicaFotogramma(fotogramma);
        if (stato.t === null) aggiornaViste();
        if (stato.selezionato && toccati.includes(stato.selezionato)) void apriDettaglio(stato.selezionato, { silenzioso: true });
        programmaRilettura();
      },
      onFine: () => { if (!morto) programmaRilettura(); },
    });
  }
  /* il vivo: le durate dei passi in corso crescono da sole (una volta al secondo, solo i visibili e solo se qualcuno lavora) */
  function battito() {
    if (morto || d.hidden || stato.t !== null || !fonte.panoramica) return;
    if (fonte.panoramica.status !== 'running' && !fonte.righeCaricate().some((r) => statoPasso(r.state).tono === 'corso')) return;
    if (stato.vista === 'dipendenze') tela.aggiorna();
    if (stato.selezionato) disegnaDettaglio();
  }

  /* ——— testata ——— */
  function disegnaTesta() {
    const p = fonte.panoramica;
    avviso.textContent = stato.carica ? tr('agenti.workflow.loading') : stato.errore ?? '';
    avviso.hidden = !stato.carica && !stato.errore;
    root.dataset.vista = stato.vista;
    for (const [id, b] of vociVista) { b.setAttribute('aria-checked', String(id === stato.vista)); b.tabIndex = id === stato.vista ? 0 : -1; }
    const diagramma = stato.vista !== 'lettura';
    for (const b of [meno, percento, piu, adatta]) b.disabled = !diagramma;
    menuGruppi.hidden = stato.vista !== 'dipendenze';
    percorso.hidden = stato.vista === 'lettura';
    cerca.setAttribute('aria-expanded', String(stato.cercaAperta));
    campoCerca.hidden = !stato.cercaAperta;
    if (!p) return;
    // il livello di partenza (F3-42, decisione 6): fino a 25 passi tutto aperto, «agenti»; oltre, per gruppi
    root.dataset.livello = livelloPer(p.total);
    const forte = (testo) => el('strong', null, testo);
    sommario.replaceChildren(...fraseConNodi('agenti.workflow.summary', { agenti: forte(plurale(p.total, ...AGENTE)), fasi: forte(plurale(p.groups.length, ...FASE)) }));
    descrizione.textContent = run
      ? tr('agenti.workflow.descriptionRun')
      : tr('agenti.workflow.descriptionProposal');
    const alle = stato.t === null ? oraBreve(stato.aggiornatoAlle) : null;
    aggiornatoTesto.textContent = stato.t !== null ? tr('agenti.workflow.replayAt', { ora: oraBreve(stato.t) }) : alle ? tr('agenti.delegations.lastUpdate', { ora: alle }) : '';
    const grezzo = grezzoDelRun();
    const terminati = stato.t === null ? p.terminated : p.groups.reduce((somma, g) => somma + (fonte.conteggi(g.phaseId, stato.t)?.terminated ?? 0), 0);
    const punto = el('span', 'talos-wfg__punto'); punto.dataset.tono = TONO_RUN[grezzo] ?? 'neutro';
    statoRun.replaceChildren(punto, el('span', null, `${parolaDelRun(grezzo)}${run ? ` · ${tr('agenti.graph.finishedOf', { fatti: cifraLingua(terminati ?? 0), totale: cifraLingua(p.total) })}` : ''}`));
    if (stato.focus) {
      fuocoChip.hidden = false;
      const r = fonte.riga(stato.focus.nodeId);
      const n = stato.focus.insieme.size - 1;
      const via = bottone('', 'gv-fuoco-via', tr('agenti.workflow.removeFocus')); via.append(icona('i-x'));
      via.addEventListener('click', () => togliFocus());
      fuocoChip.replaceChildren(icona('i-branch'), el('span', null, tr(stato.focus.verso === 'monte' ? 'agenti.workflow.focusUpstream' : 'agenti.workflow.focusDownstream', { nome: r?.label ?? '', agenti: plurale(n, ...AGENTE) })), via);
    } else fuocoChip.hidden = true;
  }

  /* ——— selezione, focus, dettaglio (R4: chi · Evidenze recenti · Task corrente · «…») ——— */
  function seleziona(nodeId, { muovi = true, riga = null } = {}) {
    if (!nodeId) return;
    if (stato.selezionato && stato.selezionato !== nodeId) pannelloRisultati.chiudi({ restituisciFuoco: false });
    stato.selezionato = nodeId;
    stato.fuocoAlbero = `passo:${nodeId}`;
    stato.lignaggio = null;
    const posto = fonte.posto(nodeId) ?? (riga?.phaseId ? { phaseId: riga.phaseId } : null);
    stato.faseSelezionata = posto?.phaseId ?? fonte.riga(nodeId)?.phaseId ?? null;
    if (posto && !stato.aperti.has(posto.phaseId) && muovi) {
      stato.aperti.add(posto.phaseId);
      void ridisponi().then(() => tela.vaiA(nodeId, { soloSeFuori: true }));
    }
    evidenzia();
    disegnaDettaglio();
    if (stato.vista === 'tempo' && muovi) tempo.vaiA(nodeId);
    if (stato.vista === 'lettura') disegnaLettura();
    void apriDettaglio(nodeId);
    void Promise.all([fonte.discendenza(nodeId, 'monte'), fonte.discendenza(nodeId, 'valle')]).then(([monte, valle]) => {
      if (morto || stato.selezionato !== nodeId) return;
      stato.lignaggio = { monte: monte.size, valle: valle.size };
      disegnaDettaglio();
    }, () => {});
    avvisaSelezione();
  }
  async function impostaFocus(nodeId, verso) {
    if (stato.focus?.nodeId === nodeId && stato.focus.verso === verso) { togliFocus(); return; }
    try {
      const insieme = new Set(await fonte.discendenza(nodeId, verso));
      if (morto) return;
      insieme.add(nodeId);
      stato.focus = { nodeId, verso, insieme };
      evidenzia(); disegnaTesta(); disegnaDettaglio();
    } catch { dillo(tr('agenti.workflow.errorDependencies'), true); }
  }
  function togliFocus() { stato.focus = null; evidenzia(); disegnaTesta(); disegnaDettaglio(); }
  /** Percorso: chi è bloccato da un problema = a valle di un passo non riuscito, da verificare o che aspetta te, e non partito. */
  async function calcolaBloccati() {
    if (!stato.percorso || !run || !fonte.storia.length) { stato.bloccati = new Set(); return; }
    const problemi = fonte.passiAl(stato.t, PROBLEMI).slice(0, PROBLEMI_MASSIMI);
    const insiemi = await Promise.all(problemi.map((id) => fonte.discendenza(id, 'valle').catch(() => new Set())));
    if (morto) return;
    stato.bloccati = new Set(insiemi.flatMap((s) => [...s]));
    evidenzia();
  }
  function evidenzia() {
    tela.impostaEvidenza({ percorso: stato.percorso, focus: stato.focus, query: stato.query, selezionato: stato.selezionato });
    if (stato.vista === 'tempo' && !tempo.elemento.hidden) tempo.aggiorna();
  }
  async function apriDettaglio(nodeId, { silenzioso = false } = {}) {
    const giaQuesto = stato.dettaglio?.nodeId === nodeId;
    if (!giaQuesto) { stato.dettaglio = { nodeId, carica: true }; stato.evidenze = null; chiudiEvidenze(); chiudiEvidenze = () => {}; if (!silenzioso) disegnaDettaglio(); }
    try {
      const info = await client.passo(sorgente, nodeId);
      if (morto || stato.selezionato !== nodeId) return;
      const primaSessione = stato.dettaglio?.stepSessionId ?? null;
      stato.dettaglio = { ...info, nodeId, carica: false };
      pannelloRisultati.aggiorna(stato.dettaglio);
      if (info.stepSessionId && info.stepSessionId !== primaSessione) {
        chiudiEvidenze();
        chiudiEvidenze = client.evidenze(info.stepSessionId, (voci) => { if (!morto && stato.selezionato === nodeId) { stato.evidenze = voci; disegnaDettaglio(); } });
      }
      disegnaDettaglio();
    } catch {
      if (morto || stato.selezionato !== nodeId) return;
      stato.dettaglio = { nodeId, carica: false };
      disegnaDettaglio();
    }
  }
  function pillola(statoGrezzo, classe = '') {
    const { tono } = statoPasso(statoGrezzo);
    const parola = parolaDelPasso(statoGrezzo);
    const p = el('span', `talos-wfg__pill ${classe}`.trim()); p.dataset.tono = tono;
    if (ICONA_TONO[tono]) p.append(icona(ICONA_TONO[tono], 'talos-wfg__pill-icona'));
    p.append(el('span', null, parola));
    return p;
  }
  function disegnaDettaglio() {
    const info = stato.dettaglio;
    if (!stato.selezionato || !info) { dettaglio.hidden = true; chiudiMenu(menuAgente, vociAgente); return; }
    dettaglio.hidden = false;
    const riga = { ...(fonte.riga(stato.selezionato) ?? {}), ...info };
    const st = statoDi(stato.selezionato) ?? riga.state;
    const segno = el('span', 'talos-wfg__dettaglio-icona'); segno.append(icona(iconaDelPasso(riga)));
    const testi = el('div', 'talos-wfg__dettaglio-testi');
    const testa = el('div', 'talos-wfg__dettaglio-testa');
    testa.append(el('h3', 'talos-wfg__dettaglio-nome', riga.label ?? riga.nodeId), pillola(st));
    testi.append(testa);
    // chi, con che modello, quanto, e QUANDO (dai tentativi della storia: inizio, fine o «in corso»)
    const tentativo = (fonte.tentativi().get(stato.selezionato) ?? []).filter((x) => stato.t === null || x.da <= stato.t).at(-1);
    const fine = tentativo && tentativo.a !== null && (stato.t === null || tentativo.a <= stato.t) ? tentativo.a : null;
    const quando = !run ? null : tentativo ? `${oraBreve(tentativo.da)}${fine !== null ? `–${oraBreve(fine)}` : ` → ${tr('agenti.timeline.stillRunning')}`}` : tr('agenti.workflow.notStartedYet');
    const sotto = [modelloDelPasso(riga, sessione.modello), durataDi(stato.selezionato, st), quando].filter(Boolean).join(' · ');
    if (sotto) testi.append(el('span', 'talos-wfg__passo-modello', sotto));
    // il focus a monte e a valle (decisione owner 24), coi conti della discendenza letta dal server
    const focus = el('div', 'gv-dettaglio-focus');
    for (const [verso, testo] of [['monte', tr('agenti.workflow.dependsOn')], ['valle', tr('agenti.workflow.waitsForIt')]]) {
      const n = stato.lignaggio?.[verso];
      const b = bottone(n === undefined ? testo : `${testo} (${cifraLingua(n)})`, 'talos-wfg__link');
      b.dataset.focusKey = `focus:${verso}`;
      b.setAttribute('aria-pressed', String(stato.focus?.nodeId === stato.selezionato && stato.focus.verso === verso));
      b.disabled = n === 0;
      b.addEventListener('click', () => { void impostaFocus(stato.selezionato, verso); });
      focus.append(b);
    }
    testi.append(focus);
    // ⛔ niente anteprima del compito qui: il compito sta nella colonna «Task corrente» (foto sul 4174, 25/09: era scritto due volte)
    detChi.replaceChildren(segno, testi);

    const provaTesta = el('h4', 'talos-wfg__dettaglio-titolo'); provaTesta.append(icona('i-doc'), el('span', null, tr('agenti.delegations.recentEvidence')));
    const elenco = el('ul', 'talos-wfg__evidenze');
    if (!run) elenco.append(el('li', 'talos-wfg__vuoto', tr('agenti.workflow.evidenceNotStarted')));
    else if (!riga.stepSessionId) elenco.append(el('li', 'talos-wfg__vuoto', tr('agenti.workflow.evidenceNoSession')));
    else if (!stato.evidenze) elenco.append(el('li', 'talos-wfg__vuoto', tr('agenti.workflow.evidenceReading')));
    else if (stato.evidenze.length === 0) elenco.append(el('li', 'talos-wfg__vuoto', tr('agenti.delegations.noToolsYet')));
    else for (const prova of stato.evidenze) {
      const voce = el('li', 'talos-wfg__evidenza');
      voce.append(icona(prova.esito ? 'i-check' : 'i-clock'), el('span', 'talos-wfg__evidenza-nome', maiuscola(nomeUmanoAttrezzo(prova.nome))));
      if (prova.oggetto) {
        // ⛔ foto del 26/09 a 1024: sotto i 900 px il percorso andava a capo DENTRO il nome del file («processor.p» / «y»).
        //   Un punto di a capo dopo ogni separatore (`<wbr>`, HTML Living Standard): si va a capo fra le cartelle.
        const oggetto = el('code', 'talos-wfg__evidenza-oggetto');
        for (const pezzo of prova.oggetto.split(/(?<=[/\\])/u)) oggetto.append(pezzo, d.createElement('wbr'));
        oggetto.title = prova.oggetto; voce.append(oggetto);
      }
      if (!prova.esito) voce.append(el('span', 'talos-wfg__evidenza-quando', tr('agenti.timeline.stillRunning')));
      elenco.append(voce);
    }
    // ⛔ in riproduzione le evidenze restano quelle del vivo: gli eventi persistiti della sessione non hanno un orario
    //   (`session-registry.mjs:1605`), quindi non si possono fermare all'istante rigiocato — si dice, non si finge
    if (stato.t !== null && run) elenco.append(el('li', 'talos-wfg__vuoto', tr('agenti.workflow.evidenceReplayNote')));
    const outputParts = [provaTesta, elenco];
    if (run && !info.carica && (info.totalOutputs > 0 || info.outputs?.length > 0)) {
      const total = Number.isSafeInteger(info.totalOutputs) ? info.totalOutputs : (info.outputs?.length ?? 0);
      outputParts.push(el('h4', 'talos-wfg__dettaglio-titolo', tr('agenti.workflow.resultsTitle', { n: cifraLingua(total) })));
      const tipi = new Set((info.outputs ?? []).map(ref => ref?.kind).filter(Boolean));
      outputParts.push(el('p', 'talos-wfg__result-compact', [
        tn('agenti.workflow.resultsCountOne', 'agenti.workflow.resultsCountMany', total, { n: cifraLingua(total) }),
        tipi.size ? [...tipi].join(', ') : tr('agenti.results.typeUnknown'),
        tr('agenti.workflow.resultsHint'),
      ].join(' · ')));
      const open = bottone(tr('agenti.workflow.openResults'), 'talos-wfg__link talos-wfg__result-trigger');
      open.dataset.azione = 'apri-risultati';
      open.setAttribute('aria-controls', pannelloRisultati.elemento.id);
      open.setAttribute('aria-expanded', String(pannelloRisultati.apertoPer() === info.nodeId));
      open.addEventListener('click', (evento) => {
        // La app ha un disclosure delegato: questo pulsante gestisce già il proprio pannello.
        evento.stopPropagation();
        pannelloRisultati.apri({ ...info, label: riga.label ?? riga.nodeId });
        open.setAttribute('aria-expanded', 'true');
      });
      outputParts.push(open);
    }
    detProve.replaceChildren(...outputParts);

    const compitoTesta = el('h4', 'talos-wfg__dettaglio-titolo'); compitoTesta.append(icona('i-eye'), el('span', null, tr('agenti.delegations.currentTask')));
    const righe = String(info.instructions ?? '').split(/\r?\n/u).map((r) => r.trim()).filter(Boolean);
    const parti = [compitoTesta];
    if (righe.length) {
      const primo = el('p', 'talos-wfg__compito-titolo', righe[0]); primo.title = righe[0];
      parti.push(primo);
      if (righe.length > 1) { const resto = el('p', 'talos-wfg__compito-resto', righe.slice(1).join(' ')); resto.title = resto.textContent; parti.push(resto); }
    } else parti.push(el('p', 'talos-wfg__vuoto', info.carica ? tr('agenti.workflow.taskReading') : tr('agenti.workflow.taskUnavailable')));
    detCompito.replaceChildren(...parti);
    apriConversazione.disabled = !riga.stepSessionId || typeof onApriSessione !== 'function';
  }
  /* F3-50: il rail evidenzia ciò che qui è scelto — il passo selezionato e la sua fase */
  function avvisaSelezione() {
    const fase = stato.selezionato ? (fonte.posto(stato.selezionato)?.phaseId ?? fonte.riga(stato.selezionato)?.phaseId ?? stato.faseSelezionata ?? stato.dettaglio?.phaseId ?? null) : null;
    const selezione = { gruppo: fase, passo: stato.selezionato };
    const chiave = `${selezione.gruppo ?? ''}|${selezione.passo ?? ''}`;
    if (chiave === ultimaSelezione) return;
    ultimaSelezione = chiave;
    onSelezione?.(selezione);
  }
  /* porta in vista il passo, o il gruppo (senza rubare il fuoco a chi ha cliccato nel rail) */
  function mostra({ gruppo = null, passo = null } = {}) {
    pianifica(() => {
      if (morto) return;
      if (passo && fonte.posto(passo)) tela.vaiA(passo, { soloSeFuori: true });
      else if (gruppo) tela.mostraInAlto(gruppo, Math.max(0.8, tela.zoom));
      if (stato.vista === 'tempo' && passo) tempo.vaiA(passo);
    });
  }

  /* ——— D32: la vista Lettura — lo stesso contenuto come albero ARIA (APG «Tree View»): fasi di livello 1 espandibili, passi di
     livello 2; frecce su/giù fra le voci visibili, destra apre o scende, sinistra chiude o risale, Home/Fine, Invio sceglie,
     ricerca per iniziale. Un solo tabindex=0 (fuoco itinerante). I passi arrivano a pagine, «Mostra altri» ne aggiunge 20. ——— */
  function disegnaLettura() {
    const p = fonte.panoramica;
    if (!p) return;
    const albero = el('ul', 'talos-wfg__albero-lettura'); albero.setAttribute('role', 'tree'); albero.setAttribute('aria-label', tr('agenti.workflow.readingTreeLabel'));
    const voci = [];
    p.groups.forEach((gruppo, indice) => {
      const fase = el('li', 'talos-wfg__voce talos-wfg__voce--fase'); fase.setAttribute('role', 'treeitem');
      const aperta = stato.espansi.has(gruppo.phaseId);
      fase.setAttribute('aria-expanded', String(aperta)); fase.setAttribute('aria-level', '1');
      fase.setAttribute('aria-setsize', String(p.groups.length)); fase.setAttribute('aria-posinset', String(indice + 1));
      fase.dataset.phaseId = gruppo.phaseId; fase.dataset.chiave = `fase:${gruppo.phaseId}`;
      const c = fonte.conteggi(gruppo.phaseId, stato.t);
      const cento = c && run ? percentualeFase({ progress: c.progress }) : null;
      // il NOME della fase viene per primo: la ricerca per iniziale (APG) confronta l'inizio del testo, e «Fase N» è uguale per tutte
      const agentiDellaFase = plurale(gruppo.total, ...AGENTE);
      fase.append(el('span', 'talos-wfg__voce-testo', cento === null
        ? tr('agenti.workflow.readingPhaseNotStarted', { nome: gruppo.label, i: indice + 1, n: p.groups.length, agenti: agentiDellaFase })
        : tr('agenti.workflow.readingPhaseProgress', { nome: gruppo.label, i: indice + 1, n: p.groups.length, agenti: agentiDellaFase, fatti: cifraLingua(c.terminated), totale: cifraLingua(gruppo.total) })));
      voci.push(fase);
      if (aperta) {
        const gruppoAria = el('ul', 'talos-wfg__voce-figli'); gruppoAria.setAttribute('role', 'group');
        const quanti = Math.min(gruppo.total, stato.mostrati.get(gruppo.phaseId) ?? PAGINA_ELENCO);
        for (let i = 0; i < quanti; i += 1) {
          const riga = fonte.cella(gruppo.phaseId, i);
          if (!riga) { fonte.chiedi(gruppo.phaseId, i, quanti - 1); break; }
          const passo = el('li', 'talos-wfg__voce'); passo.setAttribute('role', 'treeitem'); passo.setAttribute('aria-level', '2');
          passo.setAttribute('aria-setsize', String(gruppo.total)); passo.setAttribute('aria-posinset', String(i + 1));
          passo.dataset.nodoId = riga.nodeId; passo.dataset.chiave = `passo:${riga.nodeId}`; passo.dataset.padre = `fase:${gruppo.phaseId}`;
          passo.setAttribute('aria-selected', String(stato.selezionato === riga.nodeId));
          const st = statoDi(riga.nodeId) ?? riga.state;
          passo.textContent = [riga.label, parolaDelPasso(st), modelloDelPasso(riga, sessione.modello), durataDi(riga.nodeId, st)].filter(Boolean).join(' · ');
          gruppoAria.append(passo); voci.push(passo);
        }
        if (quanti < gruppo.total) {
          const resto = gruppo.total - quanti;
          const altri = el('li', 'talos-wfg__voce talos-wfg__voce--altri', tr('agenti.workflow.readingShowMore', { n: cifraLingua(Math.min(PAGINA_ELENCO, resto)), resto: cifraLingua(resto) }));
          altri.setAttribute('role', 'treeitem'); altri.setAttribute('aria-level', '2'); altri.dataset.chiave = `altri:${gruppo.phaseId}`; altri.dataset.padre = `fase:${gruppo.phaseId}`;
          altri.dataset.altri = gruppo.phaseId;
          gruppoAria.append(altri); voci.push(altri);
        }
        fase.append(gruppoAria);
      }
      albero.append(fase);
    });
    const attiva = voci.find((v) => v.dataset.chiave === stato.fuocoAlbero) ?? voci[0];
    for (const voce of voci) voce.tabIndex = voce === attiva ? 0 : -1;
    albero.addEventListener('keydown', (evento) => tastoAlbero(evento, voci));
    // il fuoco dato col clic (o da un lettore di schermo) diventa il fuoco itinerante: al ridisegno si torna lì, non alla prima voce
    albero.addEventListener('focusin', (evento) => {
      const voce = evento.target.closest?.('[role="treeitem"]'); if (!voce) return;
      stato.fuocoAlbero = voce.dataset.chiave;
      for (const v of voci) v.tabIndex = v === voce ? 0 : -1;
    });
    albero.addEventListener('click', (evento) => { const voce = evento.target.closest('[role="treeitem"]'); if (voce) void attivaVoce(voce, { click: true }); });
    const aveva = lettura.contains(d.activeElement) ? d.activeElement?.dataset?.chiave : null;
    lettura.replaceChildren(albero);
    if (aveva) albero.querySelector(`[data-chiave="${cssEscape(aveva)}"]`)?.focus({ preventScroll: true });
  }
  const cssEscape = (testo) => (globalThis.CSS?.escape ?? ((t) => String(t).replace(/["\\]/gu, '\\$&')))(testo);
  function vaiAVoce(voce) { if (!voce) return; stato.fuocoAlbero = voce.dataset.chiave; for (const v of lettura.querySelectorAll('[role="treeitem"]')) v.tabIndex = v === voce ? 0 : -1; voce.focus(); }
  async function espandi(phaseId, aperta) {
    if (aperta) {
      stato.espansi.add(phaseId);
      await fonte.pagina(phaseId, 0).catch(() => null);
    } else stato.espansi.delete(phaseId);
    disegnaLettura();
    lettura.querySelector(`[data-chiave="${cssEscape(stato.fuocoAlbero ?? `fase:${phaseId}`)}"]`)?.focus();
  }
  async function attivaVoce(voce, { click = false } = {}) {
    stato.fuocoAlbero = voce.dataset.chiave;
    if (voce.dataset.phaseId && voce.getAttribute('aria-level') === '1') { await espandi(voce.dataset.phaseId, voce.getAttribute('aria-expanded') !== 'true'); return; }
    if (voce.dataset.altri) {
      const phaseId = voce.dataset.altri;
      const prima = Math.min(fonte.panoramica.groups.find((g) => g.phaseId === phaseId).total, stato.mostrati.get(phaseId) ?? PAGINA_ELENCO);
      stato.mostrati.set(phaseId, prima + PAGINA_ELENCO);
      await Promise.all([fonte.pagina(phaseId, Math.floor(prima / 50)), fonte.pagina(phaseId, Math.floor((prima + PAGINA_ELENCO - 1) / 50))].map((x) => x.catch(() => null)));
      stato.fuocoAlbero = `passo:${fonte.cella(phaseId, prima)?.nodeId}`;
      disegnaLettura();
      lettura.querySelector('[role="treeitem"][tabindex="0"]')?.focus();
      return;
    }
    if (voce.dataset.nodoId) {
      seleziona(voce.dataset.nodoId);
      if (!click) lettura.querySelector(`[data-chiave="${cssEscape(`passo:${voce.dataset.nodoId}`)}"]`)?.focus();
    }
  }
  function tastoAlbero(evento, voci) {
    const voce = evento.target.closest('[role="treeitem"]'); if (!voce) return;
    const i = voci.indexOf(voce);
    const padre = () => voci.find((v) => v.dataset.chiave === voce.dataset.padre);
    switch (evento.key) {
      case 'ArrowDown': evento.preventDefault(); vaiAVoce(voci[i + 1]); break;
      case 'ArrowUp': evento.preventDefault(); vaiAVoce(voci[i - 1]); break;
      case 'Home': evento.preventDefault(); vaiAVoce(voci[0]); break;
      case 'End': evento.preventDefault(); vaiAVoce(voci.at(-1)); break;
      case 'ArrowRight':
        evento.preventDefault();
        if (voce.getAttribute('aria-expanded') === 'false') void espandi(voce.dataset.phaseId, true);
        else if (voce.getAttribute('aria-expanded') === 'true') vaiAVoce(voci[i + 1]);
        break;
      case 'ArrowLeft':
        evento.preventDefault();
        if (voce.getAttribute('aria-expanded') === 'true') void espandi(voce.dataset.phaseId, false);
        else vaiAVoce(padre());
        break;
      case 'Enter': case ' ': evento.preventDefault(); void attivaVoce(voce); break;
      default:
        if (evento.key.length === 1 && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
          const lettera = evento.key.toLocaleLowerCase('it-IT');
          const ordine = [...voci.slice(i + 1), ...voci.slice(0, i + 1)];
          const trovata = ordine.find((v) => v.textContent.trim().toLocaleLowerCase('it-IT').startsWith(lettera));
          if (trovata) { evento.preventDefault(); vaiAVoce(trovata); }
        }
    }
  }

  /* ——— le viste ——— */
  function scegliVista(v) {
    if (v === 'tempo' && !run) return;
    stato.vista = v; ricorda();
    tela.elemento.hidden = v !== 'dipendenze';
    tempo.elemento.hidden = v !== 'tempo';
    lettura.hidden = v !== 'lettura';
    percento.textContent = `${Math.round((v === 'tempo' ? tempo.zoom : tela.zoom) * 100)}%`;
    if (v === 'lettura') {
      if (stato.espansi.size === 0 && fonte.panoramica?.groups[0]) {
        const fase = fonte.posto(stato.selezionato)?.phaseId ?? [...stato.aperti][0] ?? fonte.panoramica.groups[0].phaseId;
        stato.espansi.add(fase);
        void fonte.pagina(fase, 0).then(() => { if (stato.vista === 'lettura') disegnaLettura(); }, () => {});
      }
      disegnaLettura();
    } else lettura.replaceChildren(); // una vista sola nel DOM: fasi e passi non si contano due volte
    if (v === 'tempo' && fonte.panoramica) { tempo.imposta(datiTempo()); if (stato.selezionato) tempo.vaiA(stato.selezionato); }
    if (v === 'dipendenze' && stato.disposto) tela.ridisegna();
    disegnaTesta();
  }
  meno.addEventListener('click', () => (stato.vista === 'tempo' ? tempo.passo(-1) : tela.passo(-1)));
  piu.addEventListener('click', () => (stato.vista === 'tempo' ? tempo.passo(1) : tela.passo(1)));
  percento.addEventListener('click', () => (stato.vista === 'tempo' ? tempo.adatta() : tela.zoomA(1)));
  adatta.addEventListener('click', () => (stato.vista === 'tempo' ? tempo.adatta() : tela.adatta()));
  let indiceTrovato = 0;
  const trovati = () => fonte.righeCaricate().filter((r) => corrisponde(r.label) || corrisponde(r.taskPreview));
  cerca.addEventListener('click', () => {
    stato.cercaAperta = !stato.cercaAperta;
    if (!stato.cercaAperta) { stato.query = ''; campoCerca.value = ''; esitoCerca.textContent = ''; evidenzia(); }
    disegnaTesta();
    if (stato.cercaAperta) campoCerca.focus(); else cerca.focus();
  });
  campoCerca.addEventListener('input', () => {
    stato.query = campoCerca.value.trim().slice(0, 200); indiceTrovato = 0;
    if (stato.query) {
      const nodi = trovati().length;
      const fasi = fonte.panoramica?.groups.filter((g) => corrisponde(g.label)).length ?? 0;
      esitoCerca.textContent = tr('agenti.workflow.searchResult', { agenti: plurale(nodi, ...AGENTE), fasi: plurale(fasi, ...FASE) });
    } else esitoCerca.textContent = '';
    evidenzia();
  });
  campoCerca.addEventListener('keydown', (e) => {
    /* Esc resta nel campo: prima svuota, poi chiude. ⛔ Senza `stopPropagation` risaliva alla catena degli Esc della app
       (`app.js`, ROOT keydown) e con un giro in corso apriva «Fermo il giro?» (misurato il 02/10; stessa cura del grafo delle deleghe). */
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (campoCerca.value) { campoCerca.value = ''; campoCerca.dispatchEvent(new Event('input')); return; } // la stessa strada di chi cancella a mano
      cerca.click(); return;
    }
    if (e.key !== 'Enter' || !stato.query) return;
    const elenco = trovati();
    if (!elenco.length) return;
    const r = elenco[indiceTrovato++ % elenco.length];
    seleziona(r.nodeId);
    if (stato.vista === 'dipendenze') tela.vaiA(r.nodeId);
  });

  /* ——— la riproduzione ——— */
  let fotogramma = null, ultimo = 0, ultimaVista = 0;
  const posizione = () => (stato.t === null ? asse().lunghezza : asse().versoAsse(stato.t));
  function disegnaRiproduzione() {
    if (!run) return;
    ripVuoti.replaceChildren();
    const a = asse();
    const L = Math.max(1, a.lunghezza);
    for (const s of a.vuoti) {
      const v = el('span', 'gv-rip-vuoto'); v.style.left = `${(s.asseDa / L) * 100}%`; v.style.width = `${Math.max(0.4, ((s.asseA - s.asseDa) / L) * 100)}%`;
      v.title = tr('agenti.workflow.idleCompressed', { durata: formattaDurata(s.a - s.da) });
      ripVuoti.append(v);
    }
    // i segni degli errori: quando un passo è finito «non riuscito» (dalla storia, non dalle righe)
    for (const voce of fonte.storia) {
      if (voce.scope !== 'node' || voce.state !== 'failed') continue;
      const m = el('span', 'gv-rip-segno'); m.dataset.tono = 'errore';
      m.style.left = `${(a.versoAsse(Date.parse(voce.at)) / L) * 100}%`;
      m.title = tr('agenti.workflow.failedAt', { nome: fonte.riga(voce.nodeId)?.label ?? tr('agenti.workflow.anAgent'), ora: oraBreve(voce.at) });
      ripVuoti.append(m);
    }
    aggiornaRiproduzione();
  }
  function aggiornaRiproduzione() {
    if (!run) return;
    const pronta = fonte.storia.length > 0;
    rip.dataset.pronta = String(pronta);
    if (!pronta) return;
    const a = asse();
    const quota = a.lunghezza ? posizione() / a.lunghezza : 1;
    ripPieno.style.width = `${quota * 100}%`;
    ripManiglia.style.left = `${quota * 100}%`;
    const istante = stato.t ?? a.t1;
    const p = fonte.panoramica;
    const terminati = stato.t === null ? p?.terminated ?? 0 : p?.groups.reduce((somma, g) => somma + (fonte.conteggi(g.phaseId, stato.t)?.terminated ?? 0), 0) ?? 0;
    const testo = `${oraBreve(istante)} · ${tr('agenti.graph.finishedOf', { fatti: cifraLingua(terminati), totale: cifraLingua(p?.total ?? 0) })}`;
    ripTesto.textContent = testo;
    ripBinario.setAttribute('aria-valuemin', '0'); ripBinario.setAttribute('aria-valuemax', String(Math.round(a.lunghezza / 60000)));
    ripBinario.setAttribute('aria-valuenow', String(Math.round(posizione() / 60000))); ripBinario.setAttribute('aria-valuetext', testo);
    ripGioca.replaceChildren(icona(stato.riproduce ? 'i-pausa' : 'i-play'));
    ripGioca.setAttribute('aria-label', stato.riproduce ? tr('agenti.delegations.pause') : tr('agenti.workflow.playRun'));
    ripVivo.hidden = stato.t === null;
    rip.dataset.attiva = String(stato.t !== null);
  }
  function vaiAlTempo(t, { forzaViste = true } = {}) {
    stato.t = t;
    aggiornaRiproduzione();
    const istante = finestra?.performance?.now?.() ?? Date.now();
    if (!forzaViste && istante - ultimaVista < 60) return;
    ultimaVista = istante;
    if (stato.percorso) void calcolaBloccati();
    aggiornaViste();
  }
  function fermaRiproduzione() { stato.riproduce = false; if (fotogramma) (finestra?.cancelAnimationFrame ?? clearTimeout)(fotogramma); fotogramma = null; aggiornaRiproduzione(); }
  function gioca() {
    const a = asse();
    stato.riproduce = true;
    if (stato.t === null || a.versoAsse(stato.t) >= a.lunghezza - 1) stato.t = a.t0;
    ultimo = finestra?.performance?.now?.() ?? Date.now();
    const passo = (quando) => {
      if (morto) return;
      const dt = quando - ultimo; ultimo = quando;
      const b = asse();
      const pos = Math.min(b.lunghezza, b.versoAsse(stato.t) + dt * stato.velocita);
      vaiAlTempo(b.dalAsse(pos), { forzaViste: false });
      if (pos >= b.lunghezza) { fermaRiproduzione(); vaiAlTempo(b.t1); return; }
      fotogramma = (finestra?.requestAnimationFrame ?? setTimeout)(passo);
    };
    aggiornaRiproduzione();
    fotogramma = (finestra?.requestAnimationFrame ?? setTimeout)(passo);
  }
  ripGioca.addEventListener('click', () => (stato.riproduce ? fermaRiproduzione() : gioca()));
  ripVivo.addEventListener('click', () => { fermaRiproduzione(); vaiAlTempo(null); });
  function dalPuntatore(e) {
    const r = ripBinario.getBoundingClientRect();
    const quota = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
    const a = asse();
    vaiAlTempo(a.dalAsse(quota * a.lunghezza), { forzaViste: false });
  }
  ripBinario.addEventListener('pointerdown', (e) => { if (!fonte.storia.length) return; fermaRiproduzione(); ripBinario.setPointerCapture?.(e.pointerId); dalPuntatore(e); });
  ripBinario.addEventListener('pointermove', (e) => { if (ripBinario.hasPointerCapture?.(e.pointerId)) dalPuntatore(e); });
  ripBinario.addEventListener('pointerup', () => { if (fonte.storia.length) vaiAlTempo(stato.t ?? asse().t1); });
  ripBinario.addEventListener('keydown', (e) => {
    if (!fonte.storia.length) return;
    const passi = { ArrowRight: 60_000, ArrowLeft: -60_000, PageUp: 600_000, PageDown: -600_000 };
    if (e.key === 'Home') { e.preventDefault(); fermaRiproduzione(); vaiAlTempo(asse().t0); return; }
    if (e.key === 'End') { e.preventDefault(); fermaRiproduzione(); vaiAlTempo(null); return; }
    if (!(e.key in passi)) return;
    e.preventDefault(); fermaRiproduzione();
    const a = asse();
    const pos = Math.min(a.lunghezza, Math.max(0, posizione() + passi[e.key]));
    vaiAlTempo(pos >= a.lunghezza ? null : a.dalAsse(pos));
  });

  /* ——— F3-52: i comandi del run ——— */
  let menuRunVoci = [];
  let esitoChiave = null;
  const chiaveRun = () => { const p = fonte.panoramica; return p ? `${p.status}|${p.pauseRequested === true}|${p.cancelRequested === true}` : ''; };
  function disegnaRun() {
    const { principale, menu } = run ? azioniDelRun(fonte.panoramica) : { principale: null, menu: [] };
    menuRunVoci = menu;
    comandiRun.hidden = !principale && !menu.length;
    principaleRun.hidden = !principale;
    if (principale) { principaleRun.textContent = principale.etichetta; principaleRun.dataset.azione = principale.azione; }
    else delete principaleRun.dataset.azione;
    menuRun.hidden = !menu.length;
    principaleRun.disabled = altroRun.disabled = Boolean(stato.inVolo);
    principaleRun.setAttribute('aria-busy', String(Boolean(stato.inVolo)));
    if (!menu.length) chiudiMenu(altroRun, vociRun);
    // un esito riuscito vale finché lo stato del run non cambia: poi lo dice la testata
    if (esitoRun.dataset.tono === 'ok' && esitoChiave !== null && esitoChiave !== chiaveRun()) { esitoRun.hidden = true; esitoRun.textContent = ''; esitoChiave = null; }
  }
  function dillo(testo, errore) {
    esitoRun.hidden = false; esitoRun.textContent = testo;
    esitoRun.setAttribute('role', errore ? 'alert' : 'status'); esitoRun.dataset.tono = errore ? 'errore' : 'ok';
    esitoChiave = errore ? null : chiaveRun();
  }
  function apriMenuRun() {
    if (!menuRunVoci.length || altroRun.disabled) return;
    const voci = [];
    menuRunVoci.forEach((voce, indice) => {
      if (voce.pericolo && indice > 0) { const sep = el('div', 'talos-wfg__menu-separatore'); sep.setAttribute('role', 'separator'); voci.push(sep); }
      const b = el('button', `talos-wfg__menu-voce${voce.pericolo ? ' talos-wfg__menu-voce--pericolo' : ''}`, voce.etichetta);
      b.type = 'button'; b.setAttribute('role', 'menuitem'); b.tabIndex = -1; b.dataset.azione = voce.azione;
      b.addEventListener('click', () => { chiudiMenu(altroRun, vociRun); void esegui(voce.azione, altroRun); });
      voci.push(b);
    });
    vociRun.replaceChildren(...voci);
    apriMenu(altroRun, vociRun);
  }
  async function esegui(azione, opener) {
    if (!azione || stato.inVolo || !run || morto) return;
    const conferma = (opzioni) => apriConfermaRun(d, { sopra: tr('agenti.workflow.confirmAbove'), opener, gestore: gestoreOverlay?.() ?? null, ...opzioni });
    if (azione === 'cancel') {
      // decisione owner 22: la conferma dice le conseguenze, dai conteggi veri
      if (!(await conferma({ titolo: tr('agenti.workflow.cancelTitle'), testo: conseguenzeAnnulla(fonte.panoramica), conferma: tr('agenti.workflow.cancelConfirm'), pericolo: true })) || morto) return;
    }
    if (azione === 'retry') {
      // decisione owner 23: prima il CONTO (anteprima del server, lo stesso numero che il comando applicherà), poi la conferma
      stato.inVolo = azione; disegnaRun();
      const anteprima = await client.anteprimaRiprova(sorgente).catch(() => null);
      stato.inVolo = null; disegnaRun();
      if (morto) return;
      if (!anteprima) { dillo(tr('agenti.workflow.retryCeilingUnknown'), true); return; }
      const n = anteprima.nodeIds?.length ?? 0;
      if (!n) { dillo(tr('agenti.workflow.retryNothing'), false); ultimaRilettura = 0; programmaRilettura(); return; }
      const righe = righeAumento(anteprima.ceilingRaise);
      const testo = `${tn('agenti.workflow.retryIntroOne', 'agenti.workflow.retryIntroMany', n, { n: cifraLingua(n) })} ${righe.length ? tr('agenti.workflow.ceilingRises') : tr('agenti.workflow.ceilingSame')}`;
      if (!(await conferma({ titolo: tn('agenti.workflow.retryTitleOne', 'agenti.workflow.retryTitleMany', n, { n: cifraLingua(n) }), testo, righe, conferma: tr('agenti.workflow.retryConfirm') })) || morto) return;
    }
    stato.inVolo = azione; disegnaRun();
    const esito = await client.comando(sorgente, azione, uuid ? { uuid } : {});
    if (morto) return;
    stato.inVolo = null;
    if (esito.ok) dillo(TESTO_RIUSCITO[azione], false);
    else dillo(esito.ambiguo ? testoAmbiguo(azione) : testoErroreRun(esito.code), true);
    // lo stato vero lo ridice il server, subito (e poi il flusso)
    ultimaRilettura = 0; programmaRilettura();
    disegnaRun();
    const fuoco = !principaleRun.hidden ? principaleRun : !menuRun.hidden ? altroRun : torna;
    fuoco.focus?.();
  }
  principaleRun.addEventListener('click', () => { void esegui(principaleRun.dataset.azione, principaleRun); });
  altroRun.addEventListener('click', () => (vociRun.hidden ? apriMenuRun() : chiudiMenu(altroRun, vociRun)));
  // il tasto destro sul gruppo dei comandi e sulla card della sessione principale apre lo stesso menu (regola owner 10/09)
  for (const bersaglio of [comandiRun, tela.elemento]) {
    bersaglio.addEventListener('contextmenu', (evento) => {
      if (bersaglio === tela.elemento && !evento.target.closest?.('[data-coordinatore]')) return;
      if (!menuRunVoci.length) return;
      evento.preventDefault();
      apriMenuRun();
    });
  }

  /* ——— menu ——— */
  function apriMenu(bottoneMenu, menu) {
    menu.hidden = false; bottoneMenu.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-checked="true"]:not(:disabled)') ?? menu.querySelector('button:not(:disabled)'))?.focus();
  }
  function chiudiMenu(bottoneMenu, menu, { fuoco = false } = {}) {
    if (menu.hidden) return;
    menu.hidden = true; bottoneMenu.setAttribute('aria-expanded', 'false');
    if (fuoco) bottoneMenu.focus();
  }
  function tastiMenu(evento) {
    const menu = evento.target.closest('[role="menu"]'); if (!menu) return;
    const voci = [...menu.querySelectorAll('button:not(:disabled)')];
    const i = voci.indexOf(evento.target);
    const bottoneMenu = menu.previousElementSibling;
    if (evento.key === 'ArrowDown') { evento.preventDefault(); voci[(i + 1) % voci.length]?.focus(); }
    else if (evento.key === 'ArrowUp') { evento.preventDefault(); voci[(i - 1 + voci.length) % voci.length]?.focus(); }
    else if (evento.key === 'Escape') { evento.preventDefault(); evento.stopPropagation(); chiudiMenu(bottoneMenu, menu, { fuoco: true }); }
    else if (evento.key === 'Tab') chiudiMenu(bottoneMenu, menu);
  }
  root.addEventListener('keydown', tastiMenu);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stato.focus && !e.target.closest?.('[role="menu"]') && e.target !== campoCerca) { e.preventDefault(); togliFocus(); } });
  d.addEventListener('pointerdown', chiudiMenuFuori, true);
  function chiudiMenuFuori(evento) {
    if (!vociGruppi.hidden && !menuGruppi.contains(evento.target)) chiudiMenu(altroGruppi, vociGruppi);
    if (!vociRun.hidden && !menuRun.contains(evento.target)) chiudiMenu(altroRun, vociRun);
    if (!vociAgente.hidden && !detAltro.contains(evento.target)) chiudiMenu(menuAgente, vociAgente);
  }

  scegliVista(stato.vista);
  disegnaTesta();
  disegnaRun();
  void carica({ primaVolta: true });

  return {
    elemento: root,
    /** Per le prove e per chi monta: lo stato leggibile, mai modificabile da fuori. */
    stato: () => ({ vista: stato.vista, selezionato: stato.selezionato, aperti: [...stato.aperti], zoom: tela.zoom, inVolo: stato.inVolo ?? null,
      // il gruppo di chi è scelto (per il rail, F3-50), la riproduzione, e per le sonde la rilettura in attesa e i fotogrammi
      gruppoAperto: fonte.posto(stato.selezionato)?.phaseId ?? [...stato.aperti][0] ?? null, istante: stato.t,
      riletturaInAttesa: rilettura !== null, generazione, fotogrammi: stato.fotogrammi, storia: fonte.storia.length,
      // quanti passi ha la disposizione (la tela ne monta solo i visibili: il DOM non li conta tutti, e non deve)
      passi: tela.disposizione?.passi.size ?? 0 }),
    /** F3-50: dal rail, a diagramma già aperto — apre il gruppo e seleziona il passo, come un clic qui dentro. */
    vai({ gruppo = null, passo = null } = {}) {
      if (morto || (!gruppo && !passo)) return;
      if (gruppo) stato.espansi.add(gruppo);
      const apri = Boolean(gruppo) && !stato.aperti.has(gruppo);
      if (apri) { stato.aperti.add(gruppo); stato.apertiScelti = true; }
      // decisione owner 19: un GRUPPO dal rail porta il diagramma su quel gruppo — chi ci lavora diventa la selezione (a meno che
      // la selezione non sia già lì), così il rail evidenzia il gruppo cliccato
      const dopo = () => {
        if (passo) seleziona(passo, { muovi: !gruppo });
        else if (stato.faseSelezionata !== gruppo) void scegliIn(fonte.panoramica.groups.filter((g) => g.phaseId === gruppo));
        mostra({ gruppo, passo });
      };
      if (apri) void ridisponi({ fuoco: passo ? null : gruppo }).then(dopo); else dopo();
    },
    distruggi() {
      if (morto) return;
      morto = true;
      chiudiFlusso(); chiudiEvidenze(); fermaRiproduzione();
      clearTimeout(rilettura); clearInterval(orologio);
      d.removeEventListener('pointerdown', chiudiMenuFuori, true);
      for (const aperta of d.querySelectorAll?.('dialog.talos-wfg-conferma[open]') ?? []) aperta.close();
      tela.distruggi(); tempo.distruggi();
      pannelloRisultati.distruggi();
      try { elk.terminateWorker?.(); } catch { /* nessun worker */ }
      root.remove();
    },
  };
}
