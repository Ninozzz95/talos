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

import { iconaSpecie, nomeLeggibileAttrezzo, nomeUmanoAttrezzo, specieAttrezzo, verboAttrezzo } from './nomi-attrezzi.js';
import { nomeModelloUmano } from './chat-foot.js';
import { senzaInganni, senzaInganniSuPiuRighe } from './testo-a-schermo.js';
import { compatto } from './costi-consumo.js';
import { testoAttivita, testoDelPasso } from './grafo/attivita.js';
import { apriConfermaRun, azioniDelRun, conseguenzeAnnulla, passoRisolvibile, righeAumento, testoAmbiguo, testoErroreRun, TESTO_RIUSCITO } from './controlli-run.js'; // F3-52, C3
import {
  durataDelPasso, formattaDurata, ICONA_TONO, iconaDelPasso, livelloPer, maiuscola, modelloDelPasso, PAGINA_ELENCO, percentualeFase,
  STATI_TERMINALI, statoDelRun, statoPasso, TONO_RUN,
} from './grafo/comuni.js';
import { chiaveCella, disponi, formaDelleFasi } from './grafo/disposizione.js';
import { creaFonte } from './grafo/fonte.js';
import { creaTela } from './grafo/tela.js';
import { cifra as cifraLingua, creaTempo, oraBreve, parolaDelPasso } from './grafo/tempo.js';
import { elenco as elencoInLingua, t as tr, tn } from './lingua.js';
import { montaPannelloRisultati } from './workflow-results-panel.js';
import { mostraCaricamentoVivo } from './caricamento-vivo.js'; // owner 29/10/2026: oltre 2 s il caricamento diventa la riga viva

/* le parole dell'attività degli agenti (deleghe, owner 13/10/2026): il nome umano di un attrezzo, mai l'id tecnico a schermo */
const paroleAttivita = { tr, ora: oraBreve, nomeAttrezzo: nomeLeggibileAttrezzo, verbo: verboAttrezzo, iconaAttrezzo: (id) => iconaSpecie(specieAttrezzo(id)) };

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
  succeeded_with_set_aside: 'agenti.workflow.runState.succeededWithSetAside',
});
const parolaDelRun = (grezzo) => (CHIAVI_STATO_RUN[grezzo] ? tr(CHIAVI_STATO_RUN[grezzo]) : grezzo);
/* Nel diagramma delle DELEGHE la scheda in cima è la conversazione, e il suo stato si dice con le parole della barra laterale
   («in corso», «conclusa», «interrotta»), non con quelle del run di un Workflow («In esecuzione», «Riuscito», «Annullato»):
   owner 14/10/2026, «Quelle delle deleghe». */
const CHIAVI_STATO_CONVERSAZIONE = Object.freeze({
  running: 'agenti.workflow.conversationState.running', succeeded: 'agenti.workflow.conversationState.succeeded',
  failed: 'agenti.workflow.conversationState.failed', cancelled: 'agenti.workflow.conversationState.cancelled',
});
/* «3 agenti» / «3 agents»: il numero col raggruppamento della lingua, la parola dal dizionario. */
const plurale = (n, uno, molti) => tn(uno, molti, n, { n: cifraLingua(n) });
const AGENTE = ['agenti.graph.agentOne', 'agenti.graph.agentMany'], FASE = ['agenti.workflow.phaseOne', 'agenti.workflow.phaseMany'];
const LOTTO = ['agenti.workflow.batchOne', 'agenti.workflow.batchMany'];
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
  iniziale = null, onSelezione = null, onMenuAgente = null, onApriFile = null,
  // F3-52: il gestore degli overlay della app (fuoco e uscita della conferma) e, per le prove, chi genera i commandId
  gestoreOverlay = () => null, uuid = null,
  // C3 (09/10/2026): monta il selettore dei modelli della chat in un contenitore; `alScelto(id)` alla scelta (decisione owner 09/10)
  montaSelettoreModello = null,
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
  /* UI deleghe (owner 12/10/2026): la sorgente è l'albero dei sotto-agenti visto come un run (`grafo/run-dalle-deleghe.js`).
     Stesso diagramma, con due differenze: le parole (lotti, non fasi) e nessun comando del run o del passo — pausa, annulla,
     riprova e «segna fatto» sono del motore dei Workflow; un agente delegato si comanda dalla sua riga nel rail, come oggi. */
  const deleghe = sorgente.deleghe === true;
  /** Lo stato in cima (testata e scheda): del run in un Workflow, della conversazione nelle deleghe. */
  const parolaDelloStato = (grezzo) => (deleghe && CHIAVI_STATO_CONVERSAZIONE[grezzo] ? tr(CHIAVI_STATO_CONVERSAZIONE[grezzo]) : parolaDelRun(grezzo));
  /* ⛔ DELEGHE — DOPO UNA RICARICA IL DIAGRAMMA TORNA COM'ERA (14/10/2026). La vista classica ricordava nella scheda ciò che la
     persona stava guardando (`grafo-agenti.js`, `opzioni`: ambito, ricerca, stato, agente scelto — era RIPRESA-GRAFO-NAVIGAZIONE);
     il diagramma nuovo ricordava solo la vista, e una ricarica riportava tutti gli agenti, senza filtro e senza ricerca.
     ⛔ Ogni valore ricordato si CONVALIDA sui fatti di adesso prima di applicarlo (`carica`, prima volta): uno stato che non ha
     più agenti svuoterebbe il diagramma, un agente che non si vede più non si sceglie. Ciò che è rimasto indietro torna al
     valore di serie, in silenzio (filtri tenuti nello stato E riletti alla ricarica, con le regole per azzerarli: Red Hat
     SRVKP-9607, letto il 14/10/2026). Hermes tiene questo stato solo in memoria (`useState`,
     apps/desktop/src/app/agents/index.tsx:219 e 350, clone 865ba906 del 07/10/2026): lì una ricarica lo perde.
     ⛔ NON si ricordano i lotti chiusi: il nome di un lotto segue il suo POSTO (`lotto-N`), e dopo una ricarica potrebbe
     indicarne un altro — la stessa causa dei tre difetti degli id posizionali (`run-dalle-deleghe.js`, `idDelNodo`). */
  const stringa = (v, massimo) => (typeof v === 'string' && v !== '' && v.length <= massimo ? v : null);
  const daRiprendere = deleghe ? { ambito: ricordato.ambito === 'cartella' ? 'cartella' : null, stato: stringa(ricordato.filtro, 40),
    cerca: stringa(typeof ricordato.cerca === 'string' ? ricordato.cerca.trim() : null, 200), scelto: stringa(ricordato.scelto, 200) } : null;
  let memoriaPronta = !deleghe; // le scelte ricordate non si riscrivono prima di averle riprese (la prima lettura)
  let sceltoDaPersona = null; // l'agente scelto DALLA PERSONA (non quello che il diagramma sceglie da solo aprendosi, o con «Segui»)

  const stato = {
    sorgente, errore: null, carica: true,
    vista: VISTE.some(([id]) => id === vistaRicordata) && (run || vistaRicordata !== 'tempo') ? vistaRicordata : 'dipendenze',
    aperti: new Set(iniziale?.gruppo ? [iniziale.gruppo] : []), apertiScelti: Boolean(iniziale?.gruppo),
    selezionato: iniziale?.passo ?? null, faseSelezionata: iniziale?.gruppo ?? null, dettaglio: null, evidenze: null, lignaggio: null,
    query: daRiprendere?.cerca ?? '', cercaAperta: Boolean(daRiprendere?.cerca), percorso: false, focus: null, bloccati: new Set(),
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
  root.dataset.c = 'GrafoAgenti'; root.dataset.sorgente = deleghe ? 'deleghe' : 'workflow';
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
    b.title = tr(chiave); // quando il diagramma è stretto la voce non scelta è solo un'icona: il nome sta qui
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
  /* «Segui» (deleghe; era della vista classica, `grafo-agenti.js:223`): la vista resta sull'agente che ha cominciato a lavorare per
     ultimo e si sposta da sola quando ne parte un altro. Un clic della persona su una scheda lo spegne: ha scelto lei dove guardare. */
  const bottoneSegui = bottone('', 'talos-wfg__icona-bottone gv-percorso', tr('agenti.delegations.followLabel')); bottoneSegui.setAttribute('aria-pressed', 'false');
  bottoneSegui.append(icona('i-robot'), el('span', null, tr('agenti.delegations.follow'))); bottoneSegui.title = tr('agenti.delegations.followHint'); bottoneSegui.hidden = !deleghe;
  bottoneSegui.dataset.segui = '';
  bottoneSegui.addEventListener('click', () => { stato.segui = !stato.segui; bottoneSegui.setAttribute('aria-pressed', String(stato.segui)); if (stato.segui) seguiIlLavoro(); });
  // nelle deleghe i gruppi sono «lotti», non «fasi»: lo dicono anche il campo della ricerca e la riga del suo esito
  const campoCerca = el('input', 'talos-wfg__cerca nopan'); campoCerca.type = 'search'; campoCerca.placeholder = tr(deleghe ? 'agenti.workflow.searchPlaceholderBatches' : 'agenti.workflow.searchPlaceholder');
  campoCerca.setAttribute('aria-label', tr(deleghe ? 'agenti.workflow.searchLabelBatches' : 'agenti.workflow.searchLabel')); campoCerca.hidden = true;
  if (stato.query) campoCerca.value = stato.query;
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
  /* ⛔ Owner 12/10/2026 sera («bisogna differenziare le deleghe passate dalle deleghe nuove» ⇒ «Una richiesta alla volta»): il
     diagramma mostra le deleghe di UNA richiesta della persona, di serie l'ultima che ha delegato. Qui si sceglie un'altra
     richiesta, o tutte. Compare solo se le richieste che hanno delegato sono più d'una. */
  const menuRichieste = el('div', 'talos-wfg__menu-vista'); menuRichieste.dataset.richieste = ''; menuRichieste.hidden = true;
  const altroRichieste = bottone('', 'talos-wfg__icona-bottone gv-percorso', tr('agenti.workflow.requestMenu'));
  const nomeRichiesta = el('span', null, ''); altroRichieste.append(icona('i-history'), nomeRichiesta);
  altroRichieste.setAttribute('aria-haspopup', 'menu'); altroRichieste.setAttribute('aria-expanded', 'false');
  const vociRichieste = el('div', 'talos-wfg__menu'); vociRichieste.setAttribute('role', 'menu'); vociRichieste.setAttribute('aria-label', tr('agenti.workflow.requestMenu')); vociRichieste.hidden = true;
  altroRichieste.addEventListener('click', () => (vociRichieste.hidden ? apriMenu(altroRichieste, vociRichieste) : chiudiMenu(altroRichieste, vociRichieste)));
  menuRichieste.append(altroRichieste, vociRichieste);
  const titoloRichiesta = (r, p) => (r.id === p.ultimaRichiesta ? tr('agenti.workflow.requestThis') : tr('agenti.workflow.requestAt', { ora: oraBreve(r.at) ?? '' }));
  function disegnaRichieste() {
    const p = fonte.panoramica; const elenco = deleghe ? (p?.richieste ?? []) : [];
    menuRichieste.hidden = elenco.length < 2;
    if (menuRichieste.hidden) return;
    const scelta = elenco.find((r) => r.id === p.richiesta);
    nomeRichiesta.textContent = scelta ? titoloRichiesta(scelta, p) : tr('agenti.workflow.requestAll');
    menuRichieste.dataset.richiesta = p.richiesta ?? '';
    /* 13/10/2026 (bugfixer, review): questa funzione gira a OGNI aggiornamento dal vivo. Ricostruendo le voci a menu aperto, il
       fuoco di chi usa la tastiera cadeva sul `<body>` (e da lì un Esc arriva alla pagina). Le voci si rifanno solo se sono
       cambiate, e se si rifanno il fuoco torna alla voce dov'era. */
    const firmaRichieste = JSON.stringify([p.richiesta, p.ultimaRichiesta, p.agentiInTutto, elenco.map((r) => [r.id, r.at, r.testo, r.total, r.terminated])]);
    if (vociRichieste.dataset.firma === firmaRichieste) return;
    vociRichieste.dataset.firma = firmaRichieste;
    const richiestaAFuoco = vociRichieste.contains(d.activeElement) ? d.activeElement.dataset.richiestaId : null;
    const voce = (id, testo, dettaglio) => {
      const b = bottone('', 'talos-wfg__menu-voce'); b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(p.richiesta === id)); b.tabIndex = -1; b.dataset.richiestaId = id;
      b.append(el('span', null, testo), ...(dettaglio ? [el('span', 'talos-muted', dettaglio)] : []));
      b.title = testo; // il titolo intero anche quando si tronca
      b.addEventListener('click', () => { chiudiMenu(altroRichieste, vociRichieste, { fuoco: true }); if (p.richiesta !== id) void mostraRichiesta(id); });
      return b;
    };
    const conto = (r) => `${tn('agenti.graph.agentOne', 'agenti.graph.agentMany', r.total, { n: cifraLingua(r.total) })} · ${r.terminated === r.total ? tr('agenti.workflow.requestAllDone') : tr('agenti.graph.finishedOf', { fatti: cifraLingua(r.terminated), totale: cifraLingua(r.total) })}`;
    // la più recente in cima: è quella che si cerca per prima
    vociRichieste.replaceChildren(...[...elenco].reverse().map((r) => voce(r.id, `${titoloRichiesta(r, p)}${r.testo ? ` · ${r.testo}` : ''}`, conto(r))),
      voce('tutte', tr('agenti.workflow.requestAll'), tn('agenti.graph.agentOne', 'agenti.graph.agentMany', p.agentiInTutto ?? 0, { n: cifraLingua(p.agentiInTutto ?? 0) })));
    if (richiestaAFuoco != null) ([...vociRichieste.querySelectorAll('button')].find((b) => b.dataset.richiestaId === richiestaAFuoco) ?? vociRichieste.querySelector('button'))?.focus({ preventScroll: true });
  }
  async function mostraRichiesta(id) {
    client.scegliRichiesta?.(id);
    await rileggiDopoUnaScelta();
  }
  /** Dopo una scelta su CHE COSA si guarda (richiesta, stato, ramo isolato, ambito): si rilegge e si ricompone il diagramma.
   *  `tieni`: la sessione da riselezionare dopo (i passi cambiano id quando le righe cambiano). */
  async function rileggiDopoUnaScelta({ tieni = null } = {}) {
    stato.selezionato = null; stato.faseSelezionata = null; stato.focus = null; stato.lignaggio = null; stato.t = null;
    /* niente è più scelto: il dettaglio si chiude SUBITO. Restava aperto sull'agente di prima anche quando la richiesta nuova non
       lo mostrava più (foto del 13/10/2026: diagramma con due agenti, dettaglio di un terzo). Con `tieni` si riapre dopo. */
    stato.dettaglio = null; disegnaDettaglio();
    onSelezione?.(null);
    await fonte.caricaPanoramica();
    if (morto) return;
    stato.aperti = apertiDiPartenza(); stato.apertiScelti = false;
    await ridisponi();
    if (morto) return;
    aggiornaViste();
    await vistaIniziale();
    if (run) void aggiornaStoria();
    /* la scelta tenuta si porta IN VISTA: dopo «Mostra tutti» l'agente scelto (prima l'unico mostrato) poteva essere l'ultimo di
       un lotto più alto della tela, col dettaglio aperto su una scheda che non si vedeva (foto del 14/10/2026) */
    if (tieni) { const nodo = await client.nodoDellaSessione?.(tieni); if (nodo && !morto) { seleziona(nodo); mostra({ passo: nodo }); } }
    if (!morto) ricorda();
  }
  /* ⛔ Owner 13/10/2026 (mockup approvato; ciò che resta fuori SPARISCE): le ultime funzioni che aveva solo la vista classica.
     AMBITO — lo stesso gruppo a scelta delle viste, davanti a tutto: questa conversazione, o tutta la cartella. */
  const ambiti = el('div', 'gv-viste'); ambiti.setAttribute('role', 'radiogroup'); ambiti.setAttribute('aria-label', tr('agenti.workflow.scopeLabel')); ambiti.dataset.ambito = ''; ambiti.hidden = !deleghe;
  const vociAmbito = new Map([['sessione', 'agenti.workflow.scopeConversation', 'i-branch'], ['cartella', 'agenti.workflow.scopeFolder', 'i-folder']].map(([id, chiave, ic]) => {
    const b = bottone('', 'gv-vista'); b.setAttribute('role', 'radio'); b.append(icona(ic), el('span', null, tr(chiave))); b.dataset.ambitoId = id; b.title = tr(id === 'sessione' ? 'agenti.workflow.scopeConversationHint' : chiave);
    b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true') return; if (fonte.panoramica?.filtro?.ambito === id) return; client.scegliAmbito?.(id); void rileggiDopoUnaScelta(); });
    ambiti.append(b);
    return [id, b];
  }));
  ambiti.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    /* le frecce portano il fuoco anche sull'opzione spenta (non la scelgono): col fuoco il suggerimento del prodotto dice perché
       è spenta, a chi guarda e a chi ascolta (`components/tooltip.js`: si apre anche col fuoco e si lega con aria-describedby) */
    const qui = d.activeElement?.dataset?.ambitoId ?? fonte.panoramica?.filtro?.ambito ?? 'sessione';
    const b = vociAmbito.get(qui === 'cartella' ? 'sessione' : 'cartella');
    b.focus();
    if (b.getAttribute('aria-disabled') !== 'true') b.click();
  });
  /* FILTRO PER STATO — un pulsante con menu: le voci portano i conti (presi prima del filtro), acceso dice che cosa filtra. */
  const STATI_FILTRO = [['all', 'agenti.workflow.stateAll'], ['working', 'agenti.workflow.stateWorking'], ['waiting', 'agenti.workflow.stateWaiting'], ['failed', 'agenti.workflow.stateFailed'], ['finished', 'agenti.workflow.stateFinished']];
  const menuStato = el('div', 'talos-wfg__menu-vista'); menuStato.dataset.filtroStato = ''; menuStato.hidden = !deleghe;
  const altroStato = bottone('', 'talos-wfg__icona-bottone gv-percorso', tr('agenti.workflow.stateMenu'));
  const nomeStato = el('span', null, ''); altroStato.append(icona('i-list'), nomeStato);
  altroStato.setAttribute('aria-haspopup', 'menu'); altroStato.setAttribute('aria-expanded', 'false'); altroStato.setAttribute('aria-pressed', 'false');
  const vociStato = el('div', 'talos-wfg__menu'); vociStato.setAttribute('role', 'menu'); vociStato.setAttribute('aria-label', tr('agenti.workflow.stateMenu')); vociStato.hidden = true;
  altroStato.addEventListener('click', () => (vociStato.hidden ? apriMenu(altroStato, vociStato) : chiudiMenu(altroStato, vociStato)));
  menuStato.append(altroStato, vociStato);
  /* QUANDO QUALCOSA È NASCOSTO una riga sola lo dice, sopra la tela, con l'uscita: la barra dei comandi resta su una riga
     (misurato sul mockup: con una pastiglia in barra andava su due righe a 1304 px). */
  const mostrati = el('p', 'talos-wfg__mostrati'); mostrati.setAttribute('role', 'status'); mostrati.hidden = true; mostrati.dataset.mostrati = '';
  const mostratiQuanti = el('strong', null, ''); const mostratiPerche = el('span', null, '');
  /* D14: «il ramo di X non è più isolato: hai cambiato richiesta», con «Chiudi» */
  const avvisoTolto = el('span', null, ''); avvisoTolto.dataset.isolamentoTolto = ''; avvisoTolto.hidden = true;
  const chiudiTolto = bottone(tr('agenti.workflow.branchReleasedDismiss'), 'talos-wfg__link'); chiudiTolto.dataset.azione = 'chiudi-isolamento-tolto'; chiudiTolto.hidden = true;
  chiudiTolto.addEventListener('click', () => { client.scordaIsolamentoTolto?.(); disegnaFiltro(); });
  const mostraTutti = bottone(tr('agenti.workflow.showAll'), 'talos-wfg__link'); mostraTutti.dataset.azione = 'mostra-tutti';
  mostraTutti.addEventListener('click', () => { const tieni = fonte.riga(stato.selezionato)?.stepSessionId ?? null; client.mostraTutti?.(); void rileggiDopoUnaScelta({ tieni }); });
  mostrati.append(mostratiQuanti, mostratiPerche, mostraTutti, avvisoTolto, chiudiTolto);
  function disegnaFiltro() {
    const f = deleghe ? (fonte.panoramica?.filtro ?? null) : null;
    if (!f) { mostrati.hidden = true; return; }
    for (const [id, b] of vociAmbito) { b.setAttribute('aria-checked', String(id === f.ambito)); b.tabIndex = id === f.ambito ? 0 : -1; }
    /* D15: spenta con `aria-disabled` (non `disabled`): resta raggiungibile con le frecce, e il suo suggerimento dice perché */
    const cartella = vociAmbito.get('cartella'); cartella.setAttribute('aria-disabled', String(!f.cartellaNota)); cartella.title = f.cartellaNota ? tr('agenti.workflow.scopeFolderHint') : tr('agenti.workflow.scopeFolderUnknown');
    const acceso = f.stato !== 'all';
    const nomeDelloStato = (id) => tr(STATI_FILTRO.find(([x]) => x === id)?.[1] ?? 'agenti.workflow.stateAll');
    nomeStato.textContent = acceso ? `${nomeDelloStato(f.stato)} · ${cifraLingua(f.conti[f.stato] ?? 0)}` : tr('agenti.workflow.stateAll');
    altroStato.setAttribute('aria-pressed', String(acceso)); menuStato.dataset.statoScelto = f.stato;
    /* come per le richieste: le voci si rifanno solo se cambiano (stato scelto, conti), e il fuoco torna dov'era */
    const firmaStato = JSON.stringify([f.stato, f.conti]);
    const statoAFuoco = vociStato.contains(d.activeElement) ? d.activeElement.dataset.statoId : null;
    if (vociStato.dataset.firma !== firmaStato) {
    vociStato.dataset.firma = firmaStato;
    vociStato.replaceChildren(...STATI_FILTRO.map(([id, chiave]) => {
      const b = bottone('', 'talos-wfg__menu-voce'); b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(f.stato === id)); b.tabIndex = -1; b.dataset.statoId = id;
      b.append(el('span', null, tr(chiave)), el('span', 'talos-wfg__menu-conto', cifraLingua(f.conti[id] ?? 0)));
      b.disabled = id !== 'all' && f.stato !== id && (f.conti[id] ?? 0) === 0; // uno stato senza agenti non si sceglie: svuoterebbe il diagramma
      b.addEventListener('click', () => { chiudiMenu(altroStato, vociStato, { fuoco: true }); if (f.stato !== id) { client.scegliStato?.(id); void rileggiDopoUnaScelta(); } });
      return b;
    }));
    if (statoAFuoco != null) ([...vociStato.querySelectorAll('button:not(:disabled)')].find((b) => b.dataset.statoId === statoAFuoco) ?? vociStato.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
    }
    const nascosti = f.mostrati < f.inTutto || f.isolato !== null || acceso;
    const tolto = f.isolamentoTolto ?? null;
    mostrati.hidden = !nascosti && tolto === null;
    mostratiQuanti.hidden = !nascosti; mostratiPerche.hidden = !nascosti; mostraTutti.hidden = !nascosti;
    avvisoTolto.hidden = tolto === null; chiudiTolto.hidden = tolto === null;
    avvisoTolto.textContent = tolto === null ? '' : tolto !== '' ? tr('agenti.workflow.branchReleased', { nome: tolto }) : tr('agenti.workflow.branchReleasedUnnamed');
    if (nascosti) {
      mostratiQuanti.textContent = tn('agenti.workflow.showingOfOne', 'agenti.workflow.showingOfMany', f.mostrati, { n: cifraLingua(f.mostrati), tot: cifraLingua(f.inTutto) });
      const perche = [f.isolato !== null ? tr('agenti.workflow.showingBranch', { nome: f.isolatoNome ?? '' }) : null, acceso ? tr('agenti.workflow.showingState', { stato: nomeDelloStato(f.stato) }) : null].filter(Boolean);
      mostratiPerche.textContent = perche.length ? ` — ${perche.join(' · ')}` : '';
    }
  }
  const comandiSinistra = el('div', 'gv-comandi-gruppo'); comandiSinistra.append(ambiti, menuRichieste, viste, percorso, bottoneSegui, menuStato);
  /*
   * «ATTIVITÀ RECENTI» (owner 13/10/2026, mockup approvato: variante A) — una colonna a destra della tela con gli ultimi passi
   * di TUTTI gli agenti che si vedono, accesa e spenta da questo pulsante (la scelta si ricorda). Nella classica era l'elenco
   * «Recenti»; Hermes ha l'attività solo agente per agente (`apps/desktop/src/app/agents/index.tsx:359`, clone del 07/10).
   * A diagramma stretto la colonna non si apre da sola: il pulsante la mostra sopra la tela finché serve.
   */
  const CHIAVE_ATTIVITA = 'talos.harness.desktop.deleghe-attivita.v1';
  /* la scelta vale per TUTTE le conversazioni e resta dopo la chiusura: sta nella memoria lunga del browser (quella della tela,
     `storage`, è della sola scheda) */
  const memoriaLunga = (() => { try { return finestra?.localStorage ?? null; } catch { return null; } })();
  let attivitaAperta = deleghe; try { if (memoriaLunga?.getItem(CHIAVE_ATTIVITA) === '0') attivitaAperta = false; } catch { /* memoria non disponibile */ }
  const bottoneAttivita = bottone('', 'talos-wfg__icona-bottone gv-attivita-bottone', tr('agenti.workflow.activityTitle')); bottoneAttivita.append(icona('i-history'));
  bottoneAttivita.title = tr('agenti.workflow.activityTitle'); bottoneAttivita.dataset.attivita = ''; bottoneAttivita.hidden = !deleghe;
  /* la colonna prende il suo posto dalla NASCITA (vuota finché i fatti non arrivano): la prima vista si adatta alla tela già
     stretta. Nascendo nascosta compariva dopo, e il diagramma appena adattato finiva col lotto di destra contro il bordo
     (revisione del bugfixer, foto a 1920); e un clic sul pulsante prima del primo disegno capovolgeva la scelta ricordata. */
  const colonnaAttivita = el('aside', 'gv-attivita'); colonnaAttivita.setAttribute('aria-label', tr('agenti.workflow.activityTitle')); colonnaAttivita.hidden = !attivitaAperta;
  const titoloAttivita = el('h3', 'talos-wfg__dettaglio-titolo'); titoloAttivita.append(icona('i-history'), el('span', null, tr('agenti.workflow.activityTitle')));
  const elencoAttivita = el('ul', 'talos-wfg__evidenze gv-attivita-elenco');
  colonnaAttivita.append(titoloAttivita, elencoAttivita);
  const comandiDestra = el('div', 'gv-comandi-gruppo'); comandiDestra.append(campoCerca, cerca, meno, percento, piu, adatta, menuGruppi, bottoneAttivita);
  comandi.append(comandiSinistra, comandiDestra);
  const esitoCerca = el('p', 'talos-wfg__esito-cerca'); esitoCerca.setAttribute('role', 'status');
  const avviso = el('p', 'talos-wfg__avviso'); avviso.setAttribute('role', 'status');

  const area = el('div', 'gv-area');
  const lettura = el('div', 'talos-wfg__lettura gv-lettura'); lettura.hidden = true;

  /* la riproduzione (solo per un run): sullo stesso asse compresso della vista Tempo, dalla storia degli stati */
  const rip = el('div', 'gv-rip'); rip.setAttribute('role', 'group'); rip.setAttribute('aria-label', tr(deleghe ? 'agenti.workflow.playbackLabelDelegations' : 'agenti.workflow.playbackLabel')); rip.hidden = !run;
  rip.dataset.pronta = 'false';
  const ripGioca = bottone('', 'gv-rip-gioca', tr(deleghe ? 'agenti.workflow.playDelegations' : 'agenti.workflow.playRun')); ripGioca.append(icona('i-play'));
  const ripVelocita = el('div', 'gv-rip-velocita'); ripVelocita.setAttribute('role', 'radiogroup'); ripVelocita.setAttribute('aria-label', tr('agenti.workflow.speedLabel'));
  for (const [v, testo] of LENTEZZE) {
    const b = bottone(testo, 'gv-rip-v'); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v === stato.velocita));
    b.title = v === 60 ? tr('agenti.workflow.speedMinute') : tr('agenti.delegations.speedFaster', { v });
    b.addEventListener('click', () => { stato.velocita = v; for (const x of ripVelocita.children) x.setAttribute('aria-checked', String(x === b)); });
    ripVelocita.append(b);
  }
  const ripBinario = el('div', 'gv-rip-binario nopan');
  ripBinario.tabIndex = 0; ripBinario.setAttribute('role', 'slider'); ripBinario.setAttribute('aria-label', tr(deleghe ? 'agenti.workflow.sliderLabelDelegations' : 'agenti.workflow.sliderLabel'));
  const ripVuoti = el('div', 'gv-rip-vuoti');
  const ripPieno = el('div', 'gv-rip-pieno');
  const ripManiglia = el('div', 'gv-rip-maniglia');
  ripBinario.append(ripVuoti, ripPieno, ripManiglia);
  const ripTesto = el('span', 'gv-rip-testo');
  mostraCaricamentoVivo(ripTesto, tr(deleghe ? 'agenti.workflow.loadingHistoryDelegations' : 'agenti.workflow.loadingHistory'));
  const ripVivo = bottone(tr('agenti.delegations.backToLive'), 'talos-button talos-button--secondary talos-button--sm gv-rip-vivo'); ripVivo.hidden = true;
  const ripNota = el('span', 'gv-rip-nota', tr('agenti.workflow.replayNote'));
  /* la storia non si è potuta leggere (deleghe: la cronologia del registro): si dice, e si può riprovare — non si finge una
     riproduzione su una storia vuota (owner 13/10/2026, era RIPRESA-REPLAY-ERRORE della vista classica) */
  const ripErrore = el('span', 'gv-rip-errore'); ripErrore.setAttribute('role', 'status'); ripErrore.hidden = true;
  const ripErroreTesto = el('span', null, tr('agenti.workflow.historyUnavailable'));
  const ripRiprova = bottone(tr('agenti.workflow.historyRetry'), 'talos-wfg__link'); ripRiprova.dataset.azione = 'riprova-storia';
  /* «Riprova» rilegge DAVVERO: se una lettura è già in volo (quella del battito, magari partita col server ancora rotto) il clic
     la aspetta e, se l'errore resta, ne fa partire una nuova subito — non fra cinque secondi (gara trovata dalla prova
     DELEGHE-DIAGRAMMA-28, una corsa su tre, il 13/10/2026). */
  ripRiprova.addEventListener('click', async () => { await aggiornaStoria({ subito: true }); if (!morto && rip.dataset.storia === 'errore') await aggiornaStoria({ subito: true }); });
  ripErrore.append(ripErroreTesto, ripRiprova);
  rip.append(ripGioca, ripVelocita, ripBinario, ripTesto, ripVivo, ripErrore, ripNota);

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
  /* ⭐ C3 (09/10/2026) — le azioni della PERSONA su un passo fallito, nel menu ⋯ e col tasto destro sulla card (decisione owner
     09/10: più di due azioni ⇒ menu). Visibili solo quando il server le accetterebbe (`passoRisolvibile`). */
  const vociSulPasso = [
    ['mark-done', tr('agenti.workflow.step.markDone')],
    ['set-aside', tr('agenti.workflow.step.setAside')],
    ['retry-other-model', tr('agenti.workflow.step.otherModel')],
    // C3 tappa 2b: solo su un passo INCERTO (vedi la visibilità in `disegnaDettaglio`)
    ['resume-verify', tr('agenti.workflow.step.resumeVerify')],
  ].map(([azione, testo]) => { const b = voceAgente(testo, () => { void eseguiSulPasso(azione); }); b.dataset.azionePasso = azione; return b; });
  const separatorePasso = el('div', 'talos-wfg__menu-separatore'); separatorePasso.setAttribute('role', 'separator');
  vociAgente.append(separatorePasso);
  const apriConversazione = voceAgente(tr('agenti.workflow.openConversation'), () => {
    const riga = { ...(fonte.riga(stato.selezionato) ?? {}), ...(stato.dettaglio ?? {}) };
    if (riga.stepSessionId) onApriSessione?.(riga.stepSessionId, riga);
  });
  voceAgente(tr('agenti.delegations.closeDetail'), () => { stato.selezionato = null; stato.dettaglio = null; chiudiEvidenze(); chiudiEvidenze = () => {}; evidenzia(); disegnaDettaglio(); avvisaSelezione(); });
  /* ⛔ La sessione su cui agiscono «⋯» e «Isola» è quella dell'oggetto che dà il NOME al dettaglio (`disegnaDettaglio` fonde la
     riga con `stato.dettaglio`, che vince): mai una seconda lettura per id, che può dire un altro agente. Seconda cintura della
     cura di SECONDA-POSIZIONE-03 (la prima: gli id seguono la sessione, `grafo/run-dalle-deleghe.js`). */
  const sessioneDelDettaglio = () => (stato.selezionato ? ({ ...(fonte.riga(stato.selezionato) ?? {}), ...(stato.dettaglio ?? {}) }).stepSessionId ?? null : null);
  /* nelle deleghe le azioni su un agente sono quelle della DELEGA (apri, ferma, pausa, riprendi): un menu solo, lo stesso del
     pannello Agenti, ancorato a questo pulsante. Senza quel canale resta il menu del diagramma. */
  menuAgente.addEventListener('click', () => {
    const sessioneDelPasso = deleghe && typeof onMenuAgente === 'function' ? sessioneDelDettaglio() : null;
    if (sessioneDelPasso) { onMenuAgente(sessioneDelPasso, { ancora: menuAgente }); return; }
    if (vociAgente.hidden) apriMenu(menuAgente, vociAgente); else chiudiMenu(menuAgente, vociAgente);
  });
  /* «Isola» (owner 13/10/2026): solo questo agente e quelli che ha avviato; si esce dalla riga «Showing…» sopra la tela. */
  const isolaRamo = bottone('', 'talos-wfg__icona-bottone', tr('agenti.workflow.isolateBranch')); isolaRamo.append(icona('i-branch')); isolaRamo.title = tr('agenti.workflow.isolateBranch');
  isolaRamo.dataset.azione = 'isola'; isolaRamo.hidden = !deleghe;
  isolaRamo.addEventListener('click', () => { const sessione = sessioneDelDettaglio(); if (!sessione) return; client.isola?.(sessione); void rileggiDopoUnaScelta({ tieni: sessione }); });
  detAltro.append(isolaRamo, menuAgente, vociAgente);
  /* i FILE toccati dall'agente (owner 13/10/2026, era della vista classica): una colonna fra le evidenze e il compito */
  const detFile = el('section', 'talos-wfg__dettaglio-colonna'); detFile.setAttribute('aria-label', tr('agenti.workflow.filesLabel')); detFile.dataset.file = ''; detFile.hidden = true;
  dettaglio.append(detChi, detProve, detFile, detCompito, detAltro);
  // nelle deleghe la tela ha accanto la colonna «Attività recenti»: le due stanno in un palco, il resto è com'era
  const palco = deleghe ? el('div', 'gv-palco') : null;
  if (palco) palco.append(area, colonnaAttivita);
  root.append(cima, comandi, mostrati, esitoCerca, avviso, palco ?? area, rip, dettaglio);
  host.append(root);
  /* le tre viste nell'area */
  const tela = creaTela(area, {
    icona, lotti: deleghe, onSessione: deleghe ? () => { const c = client.conversazione?.(); if (c) onApriSessione?.(c.sessionId, c); } : null,
    onSeleziona: (id, { apri = false } = {}) => { if (stato.segui) { stato.segui = false; bottoneSegui.setAttribute('aria-pressed', 'false'); } seleziona(id); if (apri) dettaglio.querySelector('button')?.focus(); },
    onGruppo: (phaseId, apri, blocco) => { if (apri) stato.aperti.add(phaseId); else stato.aperti.delete(phaseId); stato.apertiScelti = true; void ridisponi({ da: apri ? blocco : null, fuoco: apri ? phaseId : null }); },
    onZoom: (k) => { if (stato.vista === 'dipendenze') percento.textContent = `${Math.round(k * 100)}%`; },
    onMancano: (phaseId, da, a) => fonte.chiedi(phaseId, da, a),
  });
  const tempo = creaTempo(area, {
    icona, deleghe,
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
  /** La memoria della scheda. La vista è quella scelta dalla persona (messa da parte finché il diagramma delle deleghe è vuoto);
   *  per le deleghe anche ambito, filtro per stato, ricerca e l'agente scelto da lei. Prima della prima lettura le scelte
   *  ricordate si riscrivono com'erano: non sono ancora state riprese. */
  const ricorda = () => {
    const voce = { vista: vistaSospesa ?? stato.vista };
    if (deleghe && !memoriaPronta) Object.assign(voce, { ambito: ricordato.ambito, filtro: ricordato.filtro, cerca: ricordato.cerca, scelto: ricordato.scelto });
    else if (deleghe) {
      const f = fonte.panoramica?.filtro ?? null;
      const scelto = sceltoDaPersona && sceltoDaPersona === stato.selezionato ? (client.sessioneDelNodo?.(sceltoDaPersona) ?? null) : null;
      Object.assign(voce, { ambito: f?.ambito === 'cartella' ? 'cartella' : undefined, filtro: f && f.stato !== 'all' ? f.stato : undefined, cerca: stato.query || undefined, scelto: scelto ?? undefined });
    }
    try { storage?.setItem(chiaveMemoria, JSON.stringify(voce)); } catch { /* storage non disponibile */ }
  };
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
    /* nelle deleghe la scheda in cima è la CONVERSAZIONE: il suo titolo, la sua durata, il suo modello */
    const c = deleghe ? fonte.panoramica?.conversazione : null;
    if (c) {
      /* 13/10/2026 (bugfixer, review): in RIPRODUZIONE la durata è quella dell'istante che si guarda — dalla nascita della
         conversazione a `t`, mai oltre la sua fine. Prima era sempre quella di adesso («52 min» alle 10:16 rigiocate). Un
         istante prima della nascita non ha durata. */
      const nata = Date.parse(c.startedAt ?? '');
      const finita = Date.parse(c.finishedAt ?? '');
      const dc = stato.t !== null
        ? (Number.isFinite(nata) && stato.t >= nata ? formattaDurata(Math.min(stato.t, Number.isFinite(finita) ? finita : stato.t) - nata) : null)
        : c.durationMs != null ? formattaDurata(c.durationMs) : c.startedAt ? formattaDurata(durataDelPasso({ ...c }, adesso())) : null;
      /* owner 13/10/2026: la scheda in cima dice che cosa fa la conversazione adesso («Waiting for 2 agents»), poi il modello.
         In riproduzione i fatti di adesso non valgono: resta la riga di prima. */
      const cheFa = stato.t === null ? testoAttivita(c.activity, paroleAttivita) : null;
      /* il modello col nome corto, come sulle schede degli agenti e nella lista delle sessioni (13/10/2026: la scheda in cima
         diceva «z-ai/glm-5.3-flash» accanto ad agenti che dicevano «glm-5.3-flash»); l'intero resta nel suggerimento */
      const corto = c.model ? (nomeModelloUmano(c.model) || c.model) : null;
      const riga = (modello) => (cheFa ? [cheFa.testo, modello].filter(Boolean).join(' · ')
        : modello ? tr('agenti.workflow.mainSessionWithModel', { modello }) : tr('agenti.delegations.mainSession'));
      return { titolo: c.label, durata: dc, sotto: riga(corto), sottoIntero: riga(c.model) };
    }
    return { titolo: titoloSessione, durata, sotto: sessione.modello ? tr('agenti.workflow.mainSessionWithModel', { modello: sessione.modello }) : tr('agenti.delegations.mainSession') };
  }
  function datiViste() {
    return {
      panoramica: fonte.panoramica,
      sessione: datiSessione,
      statoRun: () => { const g = grezzoDelRun(); return { parola: parolaDelloStato(g), tono: TONO_RUN[g] ?? 'neutro' }; },
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
      // deleghe, dal vivo: che cosa fa l'agente (in riproduzione i fatti di adesso non valgono: la scheda resta col modello)
      ...(deleghe ? { attivitaDi: (riga) => (stato.t === null && riga?.activity ? testoAttivita(riga.activity, paroleAttivita) : null),
        // sulla scheda, accanto allo stato: «glm-5.3-flash», come nella lista delle sessioni (stessa funzione)
        modelloCortoDi: (riga) => { const m = modelloDelPasso(riga, sessione.modello); return m ? (nomeModelloUmano(m) || m) : null; } } : {}),
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
      const primaRichiesta = fonte.panoramica?.richiesta ?? null;
      const gruppiNoti = new Set((fonte.panoramica?.groups ?? []).map((g) => g.phaseId));
      // il nome dell'agente scelto, PRIMA di rileggere: se dopo non c'è più, si dice chi era
      const nomeScelto = deleghe && stato.selezionato ? (stato.dettaglio?.label ?? fonte.riga(stato.selezionato)?.label ?? null) : null;
      await fonte.caricaPanoramica();
      if (morto || mia !== generazione) return;
      stato.aggiornatoAlle = fonte.meta?.generatedAt ?? stato.aggiornatoAlle;
      /* deleghe: l'ora è quella dell'ultima lettura RIUSCITA dal server (la sa la app), non quella di questo ridisegno */
      const letti = client.statoDeiDati?.() ?? null;
      if (letti?.aggiornato) stato.aggiornatoAlle = letti.aggiornato;
      stato.errore = null; stato.carica = false;
      if (primaVolta && daRiprendere) {
        /* le scelte ricordate, sui fatti di adesso: prima l'ambito (cambia i conti), poi lo stato — solo se ha ancora agenti */
        const f0 = fonte.panoramica.filtro;
        if (daRiprendere.ambito === 'cartella' && f0?.cartellaNota && f0.ambito !== 'cartella') { client.scegliAmbito?.('cartella'); await fonte.caricaPanoramica(); if (morto || mia !== generazione) return; }
        const f1 = fonte.panoramica.filtro;
        const statoRicordato = STATI_FILTRO.some(([id]) => id === daRiprendere.stato) && daRiprendere.stato !== 'all' ? daRiprendere.stato : null;
        if (statoRicordato && f1 && f1.stato !== statoRicordato && (f1.conti?.[statoRicordato] ?? 0) > 0) {
          client.scegliStato?.(statoRicordato); await fonte.caricaPanoramica(); if (morto || mia !== generazione) return;
          /* T3 (terza passata): chi arriva su un agente PRECISO — dal pannello, dalla chat — ha già scelto. Un filtro ricordato
             che lo nasconde non si riprende: si apriva un dettaglio col suo id tecnico («s-a · In attesa») e senza la sua scheda. */
          if (iniziale?.passo && client.sessioneDelNodo?.(iniziale.passo) == null) { client.scegliStato?.('all'); await fonte.caricaPanoramica(); if (morto || mia !== generazione) return; }
        }
      }
      if (primaVolta) {
        // fino alla soglia (25 passi, F3-42) tutto aperto anche se il rail porta su un gruppo o un passo — come il livello «agenti»
        // di prima; oltre, il gruppo chiesto dal rail, o dove si lavora (misurato con la sonda del 26/09: dal rail a 14 passi si
        // apriva il solo gruppo del passo, e un clic su un altro agente del rail portava la tela all'80% e fuori dalle altre fasi)
        if (livelloPer(fonte.panoramica.total) === 'agenti' || !stato.apertiScelti || !fonte.panoramica.groups.some((g) => stato.aperti.has(g.phaseId))) stato.aperti = apertiDiPartenza();
        await ridisponi({ primaVolta: true });
        if (morto) return;
        const vistaAperta = tela.vista;
        /* l'agente che la persona aveva scelto prima della ricarica: solo se si vede ancora, dentro un lotto aperto (chi arriva dal
           rail su un agente preciso ha già scelto: vince lui) */
        let sceltaRipresa = false;
        if (!stato.selezionato && daRiprendere?.scelto) {
          const riga = client.righe?.().find((r) => r.sessionId === daRiprendere.scelto) ?? null;
          if (riga && stato.aperti.has(riga.phaseId)) { stato.selezionato = riga.nodeId; sceltaRipresa = true; }
        }
        memoriaPronta = true;
        if (!stato.selezionato) await sceltaIniziale();
        else seleziona(stato.selezionato, { muovi: false });
        // ⛔ giro vero del 26/09 sul 4174 (3 fasi, 5 passi): la vista d'apertura si calcolava PRIMA che la scelta iniziale aprisse
        //   il dettaglio, che accorcia la tela di ~170 px: il contenuto, centrato sull'altezza di prima, usciva tagliato in basso.
        //   Come xyflow, che mette in coda il `fitView` finché ciò da cui dipende non è pronto (`fitViewQueued && nodesInitialized`,
        //   packages/react/src/store/index.ts:130, clone 3d35b57 del 24/09/2026), la vista si rifà UNA volta a dettaglio aperto —
        //   solo se nel frattempo nessuno ha mosso la tela.
        const ora = tela.vista;
        if (!morto && ora.x === vistaAperta.x && ora.y === vistaAperta.y && ora.zoom === vistaAperta.zoom) await vistaIniziale();
        /* T5 (terza passata): l'agente RIPRESO dalla memoria si porta nella tela se la vista d'apertura lo lascia fuori — un lotto
           più alto della tela, la scelta sull'ultimo: il dettaglio era aperto su una scheda che non si vedeva. (Era la riga
           tolta dopo il mutante V2: con sei agenti stavano tutti nella tela, e nessuna prova la difendeva.) */
        if (!morto && sceltaRipresa && stato.selezionato && stato.vista === 'dipendenze') tela.vaiA(stato.selezionato, { soloSeFuori: true });
        segui();
        if (iniziale) mostra(iniziale);
        /* (D18, terza passata) qui NON si riscrive la memoria: la scrive `avvisaSelezione` appena il diagramma sceglie un agente.
           Riscriverla a diagramma VUOTO cancellava ciò che era ricordato proprio quando i fatti possono non essere arrivati. */
        if (deleghe && stato.query) { diciQuantiTrovati(); evidenzia(); }
        orologio = setInterval(battito, 1_000);
      } else {
        /* T4 (terza passata): la richiesta mostrata è cambiata DA SOLA — le richieste si sono sapute adesso (alla ricarica di una
           conversazione lunga la storia arriva dopo gli agenti), o ne è nata una nuova; la persona non ne ha scelta una. Il
           filtro per stato valeva per ciò che si guardava prima: se QUI non ha nessuno cade in silenzio, come un valore
           ricordato rimasto indietro. Prima restava acceso su «0 agenti in 0 lotti», e la memoria lo riproponeva a ogni ricarica.
           ⛔ RIV-T4-01 (riverifica, 14/10): si guarda PRIMA di chiedersi se la struttura è cambiata. Un filtro già vuoto sulla
           richiesta di prima (l'unico «non riuscito» ripartito con «Riprova») e vuoto anche sulla nuova dà zero schede prima e
           dopo: l'impronta della struttura non cambia, e la regola, che stava nel ramo «struttura cambiata», non scattava. */
        const richiestaCambiataDaSola = deleghe && (fonte.panoramica.richiesta ?? null) !== primaRichiesta && (client.richiestaScelta?.() ?? null) === null;
        if (richiestaCambiataDaSola) {
          const f = fonte.panoramica.filtro;
          if (f && f.stato !== 'all' && (f.mostrati ?? 0) === 0) { client.scegliStato?.('all'); await fonte.caricaPanoramica(); if (morto || mia !== generazione) return; }
        }
        if (primaVersione !== null && fonte.panoramica.graphVersion !== primaVersione) {
          /* ⛔ RIV-T4-04 (riverifica, 14/10): una richiesta cambiata DA SOLA è un'altra cosa da guardare, e si apre come a ogni
             apertura. Gli id dei lotti seguono il posto (`lotto-N`) e non si confrontano fra due richieste: con trenta agenti si
             era aperto il solo «lotto-3»; la richiesta nuova ne aveva dieci rinumerati da «lotto-1», nessuno «nuovo», e restavano
             tutti chiusi — col dettaglio sull'agente scelto, la cui scheda non si vedeva. */
          if (richiestaCambiataDaSola) { stato.aperti = apertiDiPartenza(); stato.apertiScelti = false; }
          /* un gruppo NATO adesso (deleghe: un lotto nuovo) si apre come gli altri finché il diagramma è al livello «agenti»:
             altrimenti comparirebbe chiuso proprio il lotto che sta lavorando. Oltre la soglia resta com'è: sceglie la persona. */
          else if (livelloPer(fonte.panoramica.total) === 'agenti') for (const g of fonte.panoramica.groups) if (!gruppiNoti.has(g.phaseId)) stato.aperti.add(g.phaseId);
          /* dal VUOTO al primo agente: è la prima vista vera del diagramma, e si adatta come all'apertura (la tela era ferma
             sulla sola scheda della conversazione, al centro); e così una richiesta cambiata da sola */
          await ridisponi({ primaVolta: richiestaCambiataDaSola || gruppiNoti.size === 0 });
          if (morto || mia !== generazione) return;
          /* ⛔ deleghe: la struttura è cambiata per il LAVORO (con un filtro acceso un agente ha cambiato stato ed è uscito, o è
             stato eliminato). La scelta segue l'agente — gli id seguono la sessione — e se l'agente scelto non è più fra quelli
             mostrati si TOGLIE e lo si dice: mai il dettaglio di un agente che non si vede, mai la scelta su un altro. */
          if (deleghe) {
            const cE = (nodeId) => client.sessioneDelNodo?.(nodeId) != null;
            const focusTolto = Boolean(stato.focus) && !cE(stato.focus.nodeId);
            if (focusTolto) stato.focus = null;
            if (stato.selezionato && !cE(stato.selezionato)) {
              /* uscita perché la richiesta mostrata è cambiata da sola: l'agente non è «sparito», si guarda un'altra richiesta.
                 Si sceglie come a ogni apertura (chi lavora, se no chi chiede attenzione); solo se non c'è nessuno da scegliere
                 si dice, col suo nome, che la scelta è stata tolta. */
              if (richiestaCambiataDaSola) { await sceltaIniziale(); if (morto || mia !== generazione) return; }
              if (stato.selezionato && !cE(stato.selezionato)) togliLaSceltaSparita(nomeScelto);
            }
            else if (focusTolto) { evidenzia(); disegnaTesta(); disegnaDettaglio(); }
          }
        }
        else { if (deleghe && typeof client.righe === 'function') fonte.aggiornaRighe(client.righe()); aggiornaViste(); }
      }
      if (run) void aggiornaStoria();
    } catch (errore) {
      if (morto || mia !== generazione) return;
      stato.carica = false;
      stato.errore = errore?.status === 404 ? tr('agenti.workflow.errorNotFound') : tr('agenti.workflow.errorRead');
      disegnaTesta();
    }
  }
  /* Una storia che non si legge NON si ritenta a ogni rilettura del diagramma: l'attesa cresce (1 s, 2 s, 5 s, 15 s, poi una volta
     al minuto) e torna a zero alla prima lettura riuscita. Misurato il 13/10/2026 con la rotta della cronologia che risponde 503:
     8-9 riletture in 12 secondi, con o senza agenti al lavoro, senza fine. «Riprova» (`subito`) non aspetta mai. */
  const ATTESE_DOPO_UN_ERRORE_MS = [1_000, 2_000, 5_000, 15_000, 60_000];
  let erroriStoriaDiFila = 0, storiaNonPrimaDi = 0;
  async function aggiornaStoria({ subito = false } = {}) {
    if (!subito && erroriStoriaDiFila > 0 && adesso() < storiaNonPrimaDi) return;
    try {
      const cresciuta = await fonte.aggiornaStoria();
      if (morto) return;
      erroriStoriaDiFila = 0;
      rip.dataset.pronta = String(fonte.storia.length > 0);
      segnaLaStoria();
      if (cresciuta) { disegnaRiproduzione(); if (stato.percorso) await calcolaBloccati(); aggiornaViste(); }
      else aggiornaRiproduzione();
    } catch {
      // la storia si ritenta più avanti, sempre più di rado; il diagramma dal vivo non ne dipende
      erroriStoriaDiFila += 1;
      storiaNonPrimaDi = adesso() + ATTESE_DOPO_UN_ERRORE_MS[Math.min(erroriStoriaDiFila, ATTESE_DOPO_UN_ERRORE_MS.length) - 1];
      if (morto) return;
      segnaLaStoria();
      /* la sorgente può aver svuotato una storia che non valeva più (struttura cambiata, rilettura fallita): le viste lo dicono */
      const pronta = String(fonte.storia.length > 0);
      if (rip.dataset.pronta !== pronta) { rip.dataset.pronta = pronta; disegnaRiproduzione(); aggiornaViste(); }
    }
  }
  /** Che storia si sta rigiocando, detto com'è: dal registro, dai soli fatti di adesso, o non letta (con «Riprova»). */
  function segnaLaStoria() {
    const errore = deleghe ? (client.erroreCronologia?.() ?? null) : null;
    ripErrore.hidden = errore === null;
    ripNota.hidden = errore !== null;
    rip.dataset.storia = errore !== null ? 'errore' : deleghe ? (client.fonteDellaStoria?.() ?? 'fatti') : 'registro';
    /* owner 13/10/2026 (D9): una storia a buchi si dichiara, con l'ora da cui comincia — il server lo dice apposta («mai con un
       buco silenzioso», `agent-timeline.mjs`), e qui diventava «Rigiocata dalla storia degli stati del registro» e basta */
    const copertura = deleghe && rip.dataset.storia === 'registro' ? (client.coperturaDellaStoria?.() ?? null) : null;
    if (copertura?.parziale) {
      rip.dataset.copertura = 'partial';
      ripNota.textContent = copertura.da ? tr('agenti.workflow.replayNotePartial', { ora: oraBreve(copertura.da) }) : tr('agenti.workflow.replayNotePartialUnknown');
    } else {
      delete rip.dataset.copertura;
      ripNota.textContent = tr(rip.dataset.storia === 'fatti' ? 'agenti.workflow.replayNoteFacts' : 'agenti.workflow.replayNote');
    }
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
      // senza righe nessun altro passa dalla colonna dell'attività: restava bianca finché non nasceva un agente
      if (deleghe) disegnaAttivita();
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
    if (scelta && !morto) seleziona(scelta.nodeId, { muovi: false, riga: scelta, daSolo: true });
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
    if (!soloRighe) { disegnaTesta(); disegnaRun(); sistemaBarra(); }
    if (stato.selezionato) disegnaDettaglio();
    aggiornaRiproduzione();
    if (deleghe) disegnaAttivita();
    if (stato.segui) seguiIlLavoro();
  }
  /*
   * LA BARRA SU UNA RIGA (deleghe) — a diagramma largo la barra deve stare su una riga. Con le etichette lunghe (una richiesta
   * passata, «Richiesta delle 20:24») non ci stava e gli attrezzi andavano a capo (misurato sul 4174 il 13/10/2026). Qui lo si
   * MISURA: si parte sempre dalla forma piena (niente oscillazioni) e, se l'ultimo gruppo è andato a capo, si passa alla
   * compatta (`data-compatta`: nelle scelte a segmenti resta scritta solo la voce scelta). A diagramma stretto i gruppi non
   * hanno una scatola loro (`display: contents`, due righe ordinate): lì non si tocca niente.
   */
  let larghezzaBarra = -1, firmaBarra = '';
  function sistemaBarra() {
    if (!deleghe || morto) return;
    const larghezza = Math.round(comandi.getBoundingClientRect().width);
    const firma = [...comandi.querySelectorAll(':scope > .gv-comandi-gruppo > *')].map((x) => `${x.hidden ? 0 : 1}${(x.textContent ?? '').length}`).join(',');
    if (larghezza === larghezzaBarra && firma === firmaBarra) return;
    larghezzaBarra = larghezza; firmaBarra = firma;
    delete comandi.dataset.compatta;
    const gruppi = [...comandi.querySelectorAll(':scope > .gv-comandi-gruppo')].filter((x) => x.offsetParent && x.getBoundingClientRect().width > 0);
    if (gruppi.length < 2) return;
    if (gruppi.at(-1).getBoundingClientRect().top > gruppi[0].getBoundingClientRect().top + 4) comandi.dataset.compatta = 'true';
  }
  /* ⛔ MAI dentro la consegna dell'osservatore: `sistemaBarra` cambia la forma della barra, cioè di ciò che l'osservatore guarda
     ⇒ «ResizeObserver loop completed with undelivered notifications» fra gli errori di pagina (revisione del bugfixer, R1: a
     1920, cambiando richiesta e ridimensionando, in italiano e in inglese). Si misura al fotogramma dopo, una volta sola. */
  let barraInAttesa = null;
  const osservaBarra = deleghe && finestra?.ResizeObserver ? new finestra.ResizeObserver(() => {
    if (barraInAttesa !== null || morto) return;
    barraInAttesa = (finestra.requestAnimationFrame ?? setTimeout)(() => { barraInAttesa = null; sistemaBarra(); });
  }) : null;
  osservaBarra?.observe(comandi);
  /* ——— deleghe: le parole dell'attività, i conti, la colonna «Attività recenti» (owner 13/10/2026) ——— */
  /** I conti di un agente in una riga: «14 calls · 2 files · 58k tokens» — solo quelli che si sanno; niente se non se ne sa nessuno. */
  function fraseDeiConti(riga) {
    const voci = [
      riga.calls != null ? tn('agenti.delegations.callsOne', 'agenti.delegations.callsMany', riga.calls) : null,
      riga.fileCount != null ? tn('agenti.delegations.filesOne', 'agenti.delegations.filesMany', riga.fileCount, { piu: riga.filesPartial ? '+' : '' }) : null,
      riga.tokens != null ? tr('agenti.delegations.tokensCompact', { n: compatto(riga.tokens) }) : null,
    ].filter(Boolean);
    return voci.length ? voci.join(' · ') : null;
  }
  /** I totali in una frase: «So far: 44 calls, 9 files touched and 199k tokens. …». Un numero che manca per qualche agente è «almeno». */
  function fraseDeiTotali(t) {
    if (!t || t.agents === 0) return null;
    const almeno = (testo, noti) => (noti < t.agents ? tr('agenti.workflow.totalsAtLeast', { cosa: testo }) : testo);
    const voci = [
      t.calls != null ? almeno(tn('agenti.workflow.totalsCallsOne', 'agenti.workflow.totalsCallsMany', t.calls, { n: cifraLingua(t.calls) }), t.callsKnown) : null,
      t.files != null ? almeno(tn('agenti.workflow.totalsFilesOne', 'agenti.workflow.totalsFilesMany', t.files, { n: cifraLingua(t.files) }), t.filesPartial ? -1 : t.filesKnown) : null,
      t.tokens != null ? almeno(tr('agenti.delegations.tokensCompact', { n: compatto(t.tokens) }), t.tokensKnown) : null,
    ].filter(Boolean);
    return voci.length ? tr('agenti.workflow.totalsSoFar', { elenco: elencoInLingua(voci) }) : null;
  }
  let firmaAttivita = null;
  /** La colonna: si ricostruisce solo se il contenuto cambia (mai sotto la tastiera), e allora il fuoco torna sulla stessa voce. */
  function disegnaAttivita() {
    const stretta = colonnaAttivita.dataset.forzata === 'true';
    colonnaAttivita.hidden = !(attivitaAperta || stretta);
    bottoneAttivita.setAttribute('aria-pressed', String(!colonnaAttivita.hidden && finestra.getComputedStyle(colonnaAttivita).display !== 'none'));
    if (colonnaAttivita.hidden) return;
    const voci = client.attivitaRecente?.(stato.t) ?? [];
    const firma = voci.map((v) => `${v.at}|${v.nodeId}|${v.kind}|${v.tool ?? ''}|${v.target ?? ''}|${v.label}`).join('\n');
    if (firma === firmaAttivita) return;
    firmaAttivita = firma;
    const voceAFuoco = elencoAttivita.contains(d.activeElement) ? d.activeElement.closest('.gv-attivita-voce') : null;
    const aFuoco = voceAFuoco?.dataset.chiave ?? null;
    elencoAttivita.replaceChildren(...voci.map((v) => {
      const parole = testoDelPasso(v, paroleAttivita);
      /* un PULSANTE vero dentro la voce d'elenco (revisione del bugfixer): `li role=button` toglieva alla voce il suo ruolo e
         lasciava l'elenco con figli che non erano voci. La chiave porta anche il bersaglio: due passi dello stesso agente nello
         stesso istante su due file sono due voci. */
      const riga = el('li', 'gv-attivita-riga');
      const li = bottone('', 'talos-wfg__evidenza gv-attivita-voce');
      li.dataset.nodoId = v.nodeId; li.dataset.chiave = `${v.at}|${v.nodeId}|${v.kind}|${v.tool ?? ''}|${v.target ?? ''}`;
      const quando = el('span', 'gv-attivita-ora', oraBreve(v.at));
      const testi = el('span', 'gv-attivita-testi');
      const cosa = el('span', 'gv-attivita-cosa', parole.che);
      if (parole.dove) { cosa.append(' ', el('code', 'talos-wfg__evidenza-oggetto', parole.dove)); cosa.title = `${parole.che} ${parole.dove}`; }
      testi.append(el('span', 'talos-wfg__evidenza-nome', v.label), cosa);
      li.append(quando, icona(parole.icona), testi);
      li.setAttribute('aria-label', `${oraBreve(v.at)}, ${v.label}: ${parole.dove ? `${parole.che} ${parole.dove}` : parole.che}`);
      riga.append(li);
      return riga;
    }));
    if (!voci.length) elencoAttivita.append(el('li', 'talos-wfg__vuoto', tr('agenti.workflow.activityEmpty')));
    /* il fuoco torna sulla stessa voce; se è uscita dall'elenco (sono arrivati passi più nuovi) va alla prima, e senza voci al
       pulsante della colonna: mai sul corpo della pagina, dove chi usa la tastiera perde il posto (revisione del bugfixer, R2) */
    if (voceAFuoco) {
      const tutte = [...elencoAttivita.querySelectorAll('.gv-attivita-voce')];
      (tutte.find((n) => n.dataset.chiave === aFuoco) ?? tutte[0] ?? bottoneAttivita).focus({ preventScroll: true });
    }
  }
  // una voce porta al suo agente: lo sceglie (il dettaglio è il suo) e lo mette nella vista
  const apriVoceAttivita = (evento) => {
    const voce = evento.target.closest?.('.gv-attivita-voce');
    if (!voce) return;
    seleziona(voce.dataset.nodoId);
    /* la scheda entra nella vista spostandola il meno possibile, senza toccare lo zoom: se si vede già, il diagramma resta com'è
       (`tela.mostra`). Il dettaglio che si apre toglie altezza alla tela: la misura si prende dopo, a disposizione fatta. */
    if (stato.vista === 'dipendenze') tela.mostra(voce.dataset.nodoId);
  };
  elencoAttivita.addEventListener('click', apriVoceAttivita); // un pulsante vero: Invio e Spazio arrivano come clic
  /* a diagramma stretto la colonna sta SOPRA la tela: Esc la chiude e il fuoco torna al suo pulsante (revisione del bugfixer, R3).
     Il tasto si ferma qui: non deve chiudere anche il diagramma o arrivare alla chat. Affiancata alla tela non copre niente, ed
     Esc resta quello di sempre. */
  colonnaAttivita.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape' || colonnaAttivita.dataset.forzata !== 'true') return;
    evento.preventDefault(); evento.stopPropagation();
    colonnaAttivita.dataset.forzata = 'false'; firmaAttivita = null;
    disegnaAttivita();
    bottoneAttivita.focus({ preventScroll: true });
  });
  bottoneAttivita.addEventListener('click', () => {
    // a diagramma stretto la colonna è nascosta dallo stile anche se «aperta»: il pulsante la mostra sopra la tela, e la toglie
    const nascostaDalloStile = attivitaAperta && !colonnaAttivita.hidden && finestra.getComputedStyle(colonnaAttivita).display === 'none';
    if (nascostaDalloStile || colonnaAttivita.dataset.forzata === 'true') colonnaAttivita.dataset.forzata = colonnaAttivita.dataset.forzata === 'true' ? 'false' : 'true';
    else { attivitaAperta = !attivitaAperta; try { memoriaLunga?.setItem(CHIAVE_ATTIVITA, attivitaAperta ? '1' : '0'); } catch { /* memoria non disponibile */ } }
    firmaAttivita = null;
    disegnaAttivita();
    // la tela ha cambiato larghezza: si riadatta (è un gesto della persona sul diagramma, come «Adatta»)
    if (stato.vista === 'dipendenze' && colonnaAttivita.dataset.forzata !== 'true') (finestra.requestAnimationFrame ?? setTimeout)(() => { void tela.adatta({ anima: false }); });
  });
  /** «Segui»: l'agente che lavora e ha cominciato per ultimo; se nessuno lavora, la vista resta dov'è. */
  function seguiIlLavoro() {
    if (stato.t !== null) return;
    const vivi = fonte.righeCaricate().filter((r) => statoDi(r.nodeId) === 'running').sort((a, b) => Date.parse(b.startedAt ?? '') - Date.parse(a.startedAt ?? ''));
    const scelto = vivi[0]?.nodeId;
    if (!scelto) return;
    if (scelto !== stato.selezionato) seleziona(scelto, { daSolo: true });
    if (fonte.posto(scelto)) tela.vaiA(scelto, { soloSeFuori: true });
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
        /* ⛔ Nel Workflow un fotogramma È un dato nuovo dal server. Nelle deleghe è solo «rileggi i fatti della app», e arriva
           anche dopo una lettura FALLITA: col server giù la testata diceva «Ultimo aggiornamento <adesso>» a ogni battito
           (14/10/2026; la vista classica mostrava l'ora dell'ultima lettura riuscita). Lì l'ora la dà `statoDeiDati`. */
        if (typeof client.statoDeiDati !== 'function') stato.aggiornatoAlle = new Date(adesso()).toISOString();
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
    /* deleghe: la lettura dal server è fallita — le schede restano quelle di prima, e lo si DICE (come il pannello Agenti accanto,
       e come faceva la vista classica: «Dati non aggiornati»). Si riprova da soli a ogni battito: non c'è niente da premere. */
    const datiFermi = deleghe && !stato.carica && !stato.errore ? (client.statoDeiDati?.().errore ?? null) : null;
    if (stato.carica) mostraCaricamentoVivo(avviso, tr('agenti.workflow.loading'), { chiave: `diagramma-workflow:${deleghe ? 'deleghe' : 'workflow'}` }); // si ridisegna a ogni aggiornamento
    else avviso.textContent = stato.errore ?? (datiFermi ? tr('agenti.workflow.staleData', { errore: datiFermi }) : '');
    avviso.hidden = !stato.carica && !stato.errore && !datiFermi;
    if (datiFermi) avviso.dataset.motivo = 'dati-fermi'; else delete avviso.dataset.motivo;
    root.dataset.vista = stato.vista;
    for (const [id, b] of vociVista) { b.setAttribute('aria-checked', String(id === stato.vista)); b.tabIndex = id === stato.vista ? 0 : -1; }
    const diagramma = stato.vista !== 'lettura';
    for (const b of [meno, percento, piu, adatta]) b.disabled = !diagramma;
    menuGruppi.hidden = stato.vista !== 'dipendenze';
    disegnaRichieste();
    disegnaFiltro();
    percorso.hidden = stato.vista === 'lettura';
    cerca.setAttribute('aria-expanded', String(stato.cercaAperta));
    campoCerca.hidden = !stato.cercaAperta;
    if (!p) return;
    // il livello di partenza (F3-42, decisione 6): fino a 25 passi tutto aperto, «agenti»; oltre, per gruppi
    root.dataset.livello = livelloPer(p.total);
    const forte = (testo) => el('strong', null, testo);
    /* LO STATO VUOTO (deleghe, 13/10/2026): la conversazione non ha avviato NESSUN agente (`agentiInTutto` si conta prima di
       richiesta, stato e ramo: un filtro che non lascia nessuno NON è questo caso). La testata lo dice e dice quando comparirà
       qualcosa. Se poi sulla tela non c'è proprio niente (nemmeno le altre conversazioni della cartella), i comandi che
       agiscono sugli agenti — stato, «Segui», percorso, riproduzione — non hanno su che cosa agire e non si mostrano.
       Appena nasce un agente tutto torna: questa funzione gira a ogni rilettura. */
    const senzaAgenti = deleghe && (p.agentiInTutto ?? p.delegated?.total ?? p.total ?? 0) === 0;
    const vuoto = senzaAgenti && (p.total ?? 0) === 0 && (p.filtro?.inTutto ?? 0) === 0;
    root.dataset.vuoto = String(vuoto);
    if (deleghe) {
      // la riproduzione rigioca gli agenti di QUESTA conversazione: senza agenti non c'è niente da rigiocare, nemmeno nell'ambito
      // «Cartella» (diceva «0 di 0 terminati»)
      bottoneSegui.hidden = vuoto; menuStato.hidden = vuoto; rip.hidden = !run || senzaAgenti; viste.hidden = vuoto; cerca.hidden = vuoto;
      if (vuoto) { percorso.hidden = true; menuGruppi.hidden = true; campoCerca.hidden = true; }
      /* nello stato vuoto si guarda la TELA (la scheda della conversazione): «Tempo» e «Lettura» senza agenti erano due
         riquadri bianchi (foto del 13/10/2026). La vista scelta dalla persona si mette da parte senza toccare ciò che è
         ricordato, e torna appena nasce un agente. `scegliVista` ridisegna la testata da sé. */
      if (vuoto && stato.vista !== 'dipendenze') { vistaSospesa = stato.vista; scegliVista('dipendenze', { memoria: false }); return; }
      if (!vuoto && vistaSospesa) { const v = vistaSospesa; vistaSospesa = null; scegliVista(v, { memoria: false }); return; }
    }
    const altreDellaCartella = (p.folder?.total ?? 0) > 0 ? [` · ${tn('agenti.workflow.summaryFolderOne', 'agenti.workflow.summaryFolderMany', p.folder.total, { n: cifraLingua(p.folder.total) })}`] : [];
    // nelle deleghe la conversazione è il primo gruppo, da sola: non è né un agente delegato né un lotto
    sommario.replaceChildren(...(senzaAgenti ? [tr('agenti.workflow.summaryNoAgents'), ...altreDellaCartella] : deleghe
      ? [...fraseConNodi('agenti.workflow.summaryDelegations', { agenti: forte(plurale(p.delegated?.total ?? p.total, ...AGENTE)), lotti: forte(plurale(p.groups.filter((g) => g.phaseId !== 'cartella').length, ...LOTTO)) }),
        // le altre conversazioni della cartella non sono agenti di questa: si dicono a parte
        ...altreDellaCartella]
      : fraseConNodi('agenti.workflow.summary', { agenti: forte(plurale(p.total, ...AGENTE)), fasi: forte(plurale(p.groups.length, ...FASE)) })));
    descrizione.textContent = senzaAgenti ? tr('agenti.workflow.descriptionNoAgents') : deleghe ? (stato.t === null ? fraseDeiTotali(p.totals) : null) ?? tr('agenti.workflow.descriptionDelegations') : run
      ? tr('agenti.workflow.descriptionRun')
      : tr('agenti.workflow.descriptionProposal');
    const alle = stato.t === null ? oraBreve(stato.aggiornatoAlle) : null;
    aggiornatoTesto.textContent = stato.t !== null ? tr('agenti.workflow.replayAt', { ora: oraBreve(stato.t) }) : alle ? tr('agenti.delegations.lastUpdate', { ora: alle }) : '';
    aggiornatoTesto.dataset.alle = stato.t === null ? (stato.aggiornatoAlle ?? '') : ''; // l'istante intero (a schermo ci sono solo ore e minuti)
    const grezzo = grezzoDelRun();
    // nelle deleghe si contano gli agenti delegati, non la conversazione che li ha avviati (`delegated`, dall'adattatore)
    const gruppiContati = p.groups;
    const terminati = stato.t === null ? (deleghe ? p.delegated?.terminated : p.terminated) : gruppiContati.reduce((somma, g) => somma + (fonte.conteggi(g.phaseId, stato.t)?.terminated ?? 0), 0);
    const punto = el('span', 'talos-wfg__punto'); punto.dataset.tono = TONO_RUN[grezzo] ?? 'neutro';
    // senza agenti non si contano «0 di 0 terminati»: resta lo stato della conversazione
    statoRun.replaceChildren(punto, el('span', null, `${parolaDelloStato(grezzo)}${run && !senzaAgenti ? ` · ${tr('agenti.graph.finishedOf', { fatti: cifraLingua(terminati ?? 0), totale: cifraLingua(deleghe ? p.delegated?.total ?? 0 : p.total) })}` : ''}`));
    if (stato.focus) {
      fuocoChip.hidden = false;
      const r = fonte.riga(stato.focus.nodeId);
      const n = stato.focus.insieme.size - 1;
      const via = bottone('', 'gv-fuoco-via', tr('agenti.workflow.removeFocus')); via.append(icona('i-x'));
      via.addEventListener('click', () => togliFocus());
      // deleghe (owner 13/10/2026, D10): fra agenti non c'è una dipendenza, c'è chi ha avviato chi
      const chiave = stato.focus.verso === 'monte' ? (deleghe ? 'agenti.workflow.focusStartedBy' : 'agenti.workflow.focusUpstream') : (deleghe ? 'agenti.workflow.focusItStarted' : 'agenti.workflow.focusDownstream');
      fuocoChip.replaceChildren(icona('i-branch'), el('span', null, tr(chiave, { nome: r?.label ?? '', agenti: plurale(n, ...AGENTE) })), via);
    } else fuocoChip.hidden = true;
  }

  /* ——— selezione, focus, dettaglio (R4: chi · Evidenze recenti · Task corrente · «…») ——— */
  /** L'agente scelto non è più fra quelli mostrati (deleghe, dopo una rilettura): niente scelta, dettaglio chiuso, e una riga lo dice. */
  function togliLaSceltaSparita(nome) {
    const fuocoDentro = dettaglio.contains(d.activeElement);
    pannelloRisultati.chiudi({ restituisciFuoco: false });
    stato.selezionato = null; stato.faseSelezionata = null; stato.lignaggio = null; stato.dettaglio = null; stato.evidenze = null;
    chiudiEvidenze(); chiudiEvidenze = () => {};
    evidenzia(); disegnaTesta(); disegnaDettaglio(); avvisaSelezione();
    if (stato.vista === 'lettura') disegnaLettura();
    if (fuocoDentro) tela.elemento.focus({ preventScroll: true }); // il dettaglio si è chiuso sotto la tastiera: il fuoco non cade sulla pagina
    dillo(nome ? tr('agenti.workflow.selectionGone', { nome }) : tr('agenti.workflow.selectionGoneUnnamed'));
    esitoRun.dataset.motivo = 'scelta-tolta';
  }
  function seleziona(nodeId, { muovi = true, riga = null, daSolo = false } = {}) {
    if (!nodeId) return;
    sceltoDaPersona = daSolo ? null : nodeId; // `daSolo`: l'ha scelto il diagramma (all'apertura, o con «Segui»)
    // la riga «non è più fra gli agenti mostrati» ha fatto il suo: una scelta nuova la toglie
    if (esitoRun.dataset.motivo === 'scelta-tolta') { esitoRun.hidden = true; esitoRun.textContent = ''; delete esitoRun.dataset.motivo; esitoChiave = null; }
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
    const parola = parolaDelPasso(statoGrezzo, { deleghe });
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
    /* T9 (terza passata): un passo APPENA finito ha lo stato terminale (dal fotogramma) e il tentativo ancora aperto finché la
       storia non si rilegge. Se la riga porta la sua ora di fine vale quella: la fine «non si sa» solo se non la dice nessuno. */
    const dichiarata = tentativo && tentativo.a === null && STATI_TERMINALI.has(st) ? Date.parse(riga.finishedAt ?? '') : NaN;
    const fine = tentativo && tentativo.a !== null && (stato.t === null || tentativo.a <= stato.t) ? tentativo.a
      : Number.isFinite(dichiarata) ? Math.max(dichiarata, tentativo.da) : null;
    /* deleghe: la storia del registro può avere dei buchi (D9) — nessun record di un agente che pure ha lavorato, o solo quello
       della sua fine (un tentativo lungo zero). Allora inizio e fine si dicono dai FATTI della scheda: mai «non ancora partito»
       accanto a «Concluso», né «16:01–16:01» per un agente partito alle 16:00 (foto del 13/10/2026). */
    /* ⛔ «→ in corso» si dice solo di chi È al lavoro nell'istante che si guarda. Un agente FERMATO (o fallito) di cui non si sa
       l'ora di fine — il processo è morto a metà, o il registro non l'ha — diceva «16:00 → in corso» accanto a «Interrotto»
       (foto del 14/10/2026). Senza una fine si dice solo quando è partito. */
    const senzaFine = STATI_TERMINALI.has(st) ? '' : ` → ${tr('agenti.timeline.stillRunning')}`;
    const daiFatti = () => {
      const da = Date.parse(riga.startedAt ?? '');
      if (!deleghe || !Number.isFinite(da) || (stato.t !== null && da > stato.t)) return null;
      const a = Date.parse(riga.finishedAt ?? ''); const finito = Number.isFinite(a) && (stato.t === null || a <= stato.t);
      return `${oraBreve(da)}${finito ? `–${oraBreve(a)}` : senzaFine}`;
    };
    const lungoZero = tentativo && tentativo.a !== null && tentativo.a === tentativo.da;
    const quando = !run ? null
      : tentativo && !lungoZero ? `${oraBreve(tentativo.da)}${fine !== null ? `–${oraBreve(fine)}` : senzaFine}`
        : daiFatti() ?? (tentativo ? `${oraBreve(tentativo.da)}${fine !== null ? `–${oraBreve(fine)}` : senzaFine}` : tr('agenti.workflow.notStartedYet'));
    // C2b: come è partito un agente delegato — da solo, o consentito dalla persona con la carta (senza il dato, niente)
    const partito = !deleghe ? null : riga.avvio === 'da-solo' ? tr('agenti.delegations.startedOnItsOwn') : riga.avvio === 'consentito' ? tr('agenti.delegations.startedAllowed') : null;
    const sotto = [modelloDelPasso(riga, sessione.modello), durataDi(stato.selezionato, st), quando, partito].filter(Boolean).join(' · ');
    if (sotto) testi.append(el('span', 'talos-wfg__passo-modello', sotto));
    // deleghe, dal vivo: i conti dell'agente (chiamate, file, token) — solo quelli che il server dichiara
    { const conti = deleghe && stato.t === null ? fraseDeiConti(riga) : null; if (conti) { const n = el('span', 'talos-wfg__passo-modello', conti); n.dataset.conti = ''; testi.append(n); } }
    // il focus a monte e a valle (decisione owner 24), coi conti della discendenza letta dal server
    const focus = el('div', 'gv-dettaglio-focus');
    /* deleghe (owner 13/10/2026, D10): «Avviato da» / «Ha avviato». Un agente avviato dalla conversazione ha 0 e 0 (la freccia dalla
       conversazione non è un arco fra agenti): a zero la riga non si mostra, e nemmeno finché il conto non è arrivato — mai una
       riga che compare e poi sparisce. Resta, anche a conto ignoto, la riga del focus acceso (serve a spegnerlo). */
    const parole = deleghe ? [['monte', tr('agenti.workflow.startedBy')], ['valle', tr('agenti.workflow.itStarted')]] : [['monte', tr('agenti.workflow.dependsOn')], ['valle', tr('agenti.workflow.waitsForIt')]];
    for (const [verso, testo] of parole) {
      const n = stato.lignaggio?.[verso];
      if (deleghe && !(n > 0) && !(stato.focus?.nodeId === stato.selezionato && stato.focus.verso === verso)) continue;
      const b = bottone(n === undefined ? testo : `${testo} (${cifraLingua(n)})`, 'talos-wfg__link');
      b.dataset.focusKey = `focus:${verso}`;
      b.setAttribute('aria-pressed', String(stato.focus?.nodeId === stato.selezionato && stato.focus.verso === verso));
      b.disabled = n === 0;
      b.addEventListener('click', () => { void impostaFocus(stato.selezionato, verso); });
      focus.append(b);
    }
    if (focus.childElementCount) testi.append(focus);
    // C3: un passo fallito dice dove sono le azioni; uno chiuso dalla persona dice come
    const risolvibile = run && !deleghe && stato.t === null && passoRisolvibile(fonte.panoramica, st);
    for (const b of vociSulPasso) b.hidden = !risolvibile || (b.dataset.azionePasso === 'resume-verify' && st !== 'uncertain');
    separatorePasso.hidden = !risolvibile;
    const notaPersona = risolvibile ? tr(st === 'uncertain' ? 'agenti.workflow.step.uncertainHint' : 'agenti.workflow.step.failedHint')
      : riga.resolution === 'marked-done' ? tr('agenti.workflow.step.markedDoneByYou')
        : riga.resolution === 'set-aside' ? tr('agenti.workflow.step.setAsideByYou')
          : riga.resolution === 'skipped-after-set-aside' ? tr('agenti.workflow.step.skippedAfterSetAside') : null;
    if (notaPersona) { const nota = el('p', 'talos-wfg__passo-nota', notaPersona); nota.dataset.nota = risolvibile ? 'azioni' : 'persona'; testi.append(nota); }
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
    disegnaFileDelPasso(riga);

    const compitoTesta = el('h4', 'talos-wfg__dettaglio-titolo'); compitoTesta.append(icona('i-eye'), el('span', null, tr('agenti.delegations.currentTask')));
    // la consegna è scritta dal modello: a schermo senza i caratteri che ingannano (`testo-a-schermo.js`), riga per riga
    const righe = senzaInganniSuPiuRighe(String(info.instructions ?? '')).split(/\r?\n/u).map((r) => r.trim()).filter(Boolean);
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
    ricorda();
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
          passo.textContent = [riga.label, parolaDelPasso(st, { deleghe }), modelloDelPasso(riga, sessione.modello), durataDi(riga.nodeId, st)].filter(Boolean).join(' · ');
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
  let vistaSospesa = null; // la vista scelta dalla persona, messa da parte finché il diagramma delle deleghe è vuoto
  function scegliVista(v, { memoria = true } = {}) {
    if (v === 'tempo' && !run) return;
    stato.vista = v; if (memoria) ricorda();
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
  /* T6 (terza passata): nelle deleghe le righe stanno tutte nella memoria dell'adattatore — si cerca fra TUTTE, anche nei lotti
     chiusi (oltre 25 agenti il diagramma ne apre uno solo, e la ricerca diceva «0 agenti» di un agente che c'era; la vista
     classica lo trovava). Un Workflow resta sulle righe caricate: le sue pagine le dà il server. */
  const trovati = () => (deleghe && typeof client.righe === 'function' ? client.righe() : fonte.righeCaricate()).filter((r) => corrisponde(r.label) || corrisponde(r.taskPreview));
  cerca.addEventListener('click', () => {
    stato.cercaAperta = !stato.cercaAperta;
    if (!stato.cercaAperta) { stato.query = ''; campoCerca.value = ''; esitoCerca.textContent = ''; evidenzia(); ricorda(); }
    disegnaTesta();
    if (stato.cercaAperta) campoCerca.focus(); else cerca.focus();
  });
  function diciQuantiTrovati() {
    if (!stato.query) { esitoCerca.textContent = ''; return; }
    const nodi = trovati().length;
    const fasi = fonte.panoramica?.groups.filter((g) => corrisponde(g.label)).length ?? 0;
    // nelle deleghe si cerca fra TUTTI gli agenti (T6): «fra quelli caricati» resta la frase del Workflow, dove è vera
    esitoCerca.textContent = tr(deleghe ? 'agenti.workflow.searchResultAll' : 'agenti.workflow.searchResult', { agenti: plurale(nodi, ...AGENTE), fasi: plurale(fasi, ...(deleghe ? LOTTO : FASE)) });
  }
  campoCerca.addEventListener('input', () => {
    stato.query = campoCerca.value.trim().slice(0, 200); indiceTrovato = 0;
    diciQuantiTrovati();
    evidenzia();
    ricorda();
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
    seleziona(r.nodeId, { riga: r }); // con la riga: se il suo lotto è chiuso si apre, e la tela va lì
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
    const terminati = stato.t === null ? (deleghe ? p?.delegated?.terminated : p?.terminated) ?? 0
      : p?.groups?.reduce((somma, g) => somma + (fonte.conteggi(g.phaseId, stato.t)?.terminated ?? 0), 0) ?? 0;
    const testo = `${oraBreve(istante)} · ${tr('agenti.graph.finishedOf', { fatti: cifraLingua(terminati), totale: cifraLingua((deleghe ? p?.delegated?.total : p?.total) ?? 0) })}`;
    ripTesto.textContent = testo;
    ripBinario.setAttribute('aria-valuemin', '0'); ripBinario.setAttribute('aria-valuemax', String(Math.round(a.lunghezza / 60000)));
    ripBinario.setAttribute('aria-valuenow', String(Math.round(posizione() / 60000))); ripBinario.setAttribute('aria-valuetext', testo);
    ripGioca.replaceChildren(icona(stato.riproduce ? 'i-pausa' : 'i-play'));
    /* 13/10/2026: in PAUSA a metà storia il pulsante RIPRENDE da lì (`gioca` riparte da capo solo dal vivo o dalla fine), e lo
       dice: prima diceva sempre «dall'inizio». Vale anche per il Workflow. */
    const riprende = stato.t !== null && a.versoAsse(stato.t) < a.lunghezza - 1;
    const etichettaGioca = stato.riproduce ? tr('agenti.delegations.pause') : riprende ? tr('agenti.workflow.resumePlayback') : tr(deleghe ? 'agenti.workflow.playDelegations' : 'agenti.workflow.playRun');
    ripGioca.setAttribute('aria-label', etichettaGioca); ripGioca.title = etichettaGioca;
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
    const { principale, menu, nota = null } = run && !deleghe ? azioniDelRun(fonte.panoramica) : { principale: null, menu: [] };
    menuRunVoci = menu;
    /* owner 10/10/2026: un run di un'altra finestra TALOS non ha comandi qui; la riga sotto la testata dice dove si comandano */
    const altraFinestra = run && fonte.panoramica?.soloLettura === true;
    if (altraFinestra && nota) { esitoRun.hidden = false; esitoRun.textContent = nota; esitoRun.setAttribute('role', 'status'); esitoRun.dataset.tono = 'nota'; }
    else if (esitoRun.dataset.tono === 'nota') { esitoRun.hidden = true; esitoRun.textContent = ''; delete esitoRun.dataset.tono; }
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
    /*
     * ⭐ C3 tappa 3 (09/10/2026, owner «quanto serve per finire») — «Alza il tetto e riprendi»: prima la CIFRA (anteprima del
     *   server, `aumentoPerFinire`), voce per voce, poi la conferma; il comando porta quella cifra, e se intanto è cambiata il
     *   server la rifiuta e lo si dice. Se il tetto di adesso basta già, la conferma lo dice e il run riprende senza alzarlo.
     */
    let opzioniComando = uuid ? { uuid } : {};
    if (azione === 'raise-ceiling') {
      stato.inVolo = azione; disegnaRun();
      const anteprima = await client.anteprimaTetto(sorgente).catch(() => null);
      stato.inVolo = null; disegnaRun();
      if (morto) return;
      if (!anteprima?.amount) { dillo(tr('agenti.workflow.ceilingUnknown'), true); return; }
      const righe = righeAumento(anteprima.amount);
      const n = anteprima.nodeIds?.length ?? 0;
      const rimasti = tn('agenti.workflow.ceilingLeftOne', 'agenti.workflow.ceilingLeftMany', n, { n: cifraLingua(n) });
      // la stima PRIMA, così «il tetto sale di:» sta subito sopra le cifre
      const testo = `${tr('agenti.workflow.ceilingReached')} ${righe.length ? `${tr('agenti.workflow.ceilingEstimate')} ${rimasti}` : tr('agenti.workflow.ceilingEnough')}`;
      if (!(await conferma({ titolo: tr(righe.length ? 'agenti.workflow.ceilingTitle' : 'agenti.workflow.ceilingTitleSame'), testo, righe,
        conferma: tr(righe.length ? 'agenti.workflow.ceilingConfirm' : 'agenti.workflow.ceilingConfirmSame') })) || morto) return;
      opzioniComando = { ...opzioniComando, amount: anteprima.amount };
    }
    stato.inVolo = azione; disegnaRun();
    const esito = await client.comando(sorgente, azione, opzioniComando);
    if (morto) return;
    stato.inVolo = null;
    if (esito.ok) dillo(TESTO_RIUSCITO[azione], false);
    // la cifra non è più quella detta (il run ha speso nel frattempo): si riapre per vedere quella nuova
    else if (azione === 'raise-ceiling' && esito.code === 'WORKFLOW_RUN_STATE_CONFLICT') dillo(tr('agenti.workflow.ceilingChanged'), true);
    else dillo(esito.ambiguo ? testoAmbiguo(azione) : testoErroreRun(esito.code), true);
    // lo stato vero lo ridice il server, subito (e poi il flusso)
    ultimaRilettura = 0; programmaRilettura();
    disegnaRun();
    const fuoco = !principaleRun.hidden ? principaleRun : !menuRun.hidden ? altroRun : torna;
    fuoco.focus?.();
  }
  /*
   * ⭐ C3 (09/10/2026) — un'azione della persona sul passo selezionato. La conferma dice che cosa succede ai passi che lo
   *   aspettano; «Segna come fatto» chiede il riassunto (vuoto = pulsante spento, come Hermes), «Rifai con un altro modello» la
   *   lista corta dei modelli già in uso più «Altro modello…» col selettore della chat (decisione owner 09/10).
   */
  function modelliGiaInUso(nodeId) {
    const delPasso = modelloDelPasso({ ...(fonte.riga(nodeId) ?? {}), ...(stato.dettaglio?.nodeId === nodeId ? stato.dettaglio : {}) }, sessione.modello);
    const voci = new Map();
    if (sessione.modello && sessione.modello !== delPasso) voci.set(sessione.modello, tr('agenti.workflow.step.usedInSession'));
    for (const r of fonte.righeCaricate()) {
      const m = modelloDelPasso(r, null);
      if (m && m !== delPasso && !voci.has(m)) voci.set(m, tr('agenti.workflow.step.usedInRun'));
    }
    return [...voci].map(([valore, dettaglio]) => ({ valore, testo: valore, dettaglio }));
  }
  async function eseguiSulPasso(azione) {
    const nodeId = stato.selezionato;
    if (!nodeId || stato.inVolo || !run || deleghe || morto || !passoRisolvibile(fonte.panoramica, statoDi(nodeId))) return;
    const label = fonte.riga(nodeId)?.label ?? stato.dettaglio?.label ?? nodeId;
    const base = { sopra: tr('agenti.workflow.confirmAbove'), opener: menuAgente, gestore: gestoreOverlay?.() ?? null };
    const opzioni = {};
    if (azione === 'mark-done') {
      const campo = { etichetta: tr('agenti.workflow.step.summaryLabel'), segnaposto: tr('agenti.workflow.step.summaryPlaceholder'), massimo: 4_000, valore: '' };
      if (!(await apriConfermaRun(d, { ...base, titolo: tr('agenti.workflow.step.markDoneTitle', { label }), testo: tr('agenti.workflow.step.markDoneText'),
        campo, conferma: tr('agenti.workflow.step.markDoneConfirm') })) || morto) return;
      opzioni.summary = campo.valore.trim();
    } else if (azione === 'resume-verify') {
      if (!(await apriConfermaRun(d, { ...base, titolo: tr('agenti.workflow.step.resumeVerifyTitle', { label }), testo: tr('agenti.workflow.step.resumeVerifyText'),
        conferma: tr('agenti.workflow.step.resumeVerifyConfirm') })) || morto) return;
    } else if (azione === 'set-aside') {
      if (!(await apriConfermaRun(d, { ...base, titolo: tr('agenti.workflow.step.setAsideTitle', { label }), testo: tr('agenti.workflow.step.setAsideText'),
        conferma: tr('agenti.workflow.step.setAsideConfirm'), pericolo: true })) || morto) return;
    } else {
      // review del bugfixer (osservazione): senza modelli già in uso e senza selettore la conferma sarebbe vuota e il pulsante acceso
      if (!modelliGiaInUso(nodeId).length && typeof montaSelettoreModello !== 'function') { dillo(tr('agenti.workflow.step.noOtherModel'), true); return; }
      const scelte = { etichetta: tr('agenti.workflow.step.modelsLabel'), voci: modelliGiaInUso(nodeId), valore: null,
        ...(typeof montaSelettoreModello === 'function' ? { altro: { testo: tr('agenti.workflow.step.anotherModel'), monta: montaSelettoreModello } } : {}) };
      if (!(await apriConfermaRun(d, { ...base, titolo: tr('agenti.workflow.step.otherModelTitle', { label }), testo: tr('agenti.workflow.step.otherModelText'),
        scelte, conferma: tr('agenti.workflow.step.otherModelConfirm') })) || morto || !scelte.valore) return;
      opzioni.model = scelte.valore;
    }
    stato.inVolo = azione; disegnaRun();
    const esito = await client.azioneSulPasso(sorgente, nodeId, azione, { ...opzioni, ...(uuid ? { uuid } : {}) });
    if (morto) return;
    stato.inVolo = null;
    if (esito.ok) {
      dillo(azione === 'mark-done' ? tr('agenti.workflow.step.ackMarkedDone') : azione === 'set-aside' ? tr('agenti.workflow.step.ackSetAside')
        : azione === 'resume-verify' ? tr('agenti.workflow.step.ackResumeVerify')
        : tr('agenti.workflow.step.ackOtherModel', { model: opzioni.model }), false);
    } else {
      dillo(esito.ambiguo ? (['retry-other-model', 'resume-verify'].includes(azione) ? tr('agenti.workflow.step.unclearOtherModel') : testoAmbiguo(azione)) : testoErroreRun(esito.code), true);
    }
    ultimaRilettura = 0; programmaRilettura();
    disegnaRun();
    void apriDettaglio(nodeId, { silenzioso: true });
    menuAgente.focus?.();
  }
  // il tasto destro su una card FALLITA apre le sue azioni (regola owner 10/09: il menu ⋯ e il tasto destro sono lo stesso menu)
  tela.elemento.addEventListener('contextmenu', (evento) => {
    const carta = evento.target.closest?.('[data-nodo-id]');
    const nodeId = carta?.dataset.nodoId;
    if (!nodeId || !run || deleghe || stato.t !== null || !passoRisolvibile(fonte.panoramica, statoDi(nodeId))) return;
    evento.preventDefault();
    if (stato.selezionato !== nodeId) seleziona(nodeId, { muovi: false });
    disegnaDettaglio();
    apriMenu(menuAgente, vociAgente);
  });
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
    if (menu === vociAgente) {
      ancoraAlPulsante(bottoneMenu, menu);
      /* review del bugfixer (09/10, Y3, misurato dal vivo): in posizione fissa il menu restava dov'era quando la finestra cambiava
         misura o un antenato scorreva — 220/301 px lontano dal suo pulsante. Come un menu contestuale: si chiude. */
      sganciaMenuFisso();
      const ascolto = new AbortController();
      sganciaMenuFisso = () => ascolto.abort();
      /* Lo scorrimento di un antenato del pulsante (o della pagina) RIANCORA il menu, non lo chiude: il pannello del dettaglio
         scorre anche da solo quando il suo contenuto arriva dopo l'apertura, e chiudere lì chiudeva il menu sotto il dito (suite
         intera del 09/10, sotto carico). Gli altri scorrimenti (la tela) non lo toccano. Il cambio di misura della finestra lo chiude. */
      const segui = (evento) => {
        const chi = evento.target;
        if (chi === d || chi === d.documentElement || (typeof chi?.contains === 'function' && chi.contains(bottoneMenu))) ancoraAlPulsante(bottoneMenu, menu);
      };
      finestra?.addEventListener('resize', () => chiudiMenu(bottoneMenu, menu), { signal: ascolto.signal });
      d.addEventListener('scroll', segui, { capture: true, passive: true, signal: ascolto.signal });
    }
    // C3: il menu del passo ha voci NASCOSTE (le azioni sul passo fallito); il fuoco va alla prima voce che si vede, o un Esc
    // finirebbe alla pagina (e apre «Fermo il giro?»: misurato nella prova C3-STEP-ACTIONS-UI). Senza far scorrere il pannello.
    (menu.querySelector('[aria-checked="true"]:not(:disabled):not([hidden])') ?? menu.querySelector('button:not(:disabled):not([hidden])'))?.focus({ preventScroll: true });
  }
  /*
   * C3 (09/10/2026, foto a 1920×1080): il menu del dettaglio sta dentro un pannello con `overflow: auto` in fondo allo schermo; con
   *   le azioni sul passo fallito è lungo sei righe e veniva TAGLIATO dal bordo. Si ancora al pulsante in posizione fissa (fuori dal
   *   ritaglio del pannello), allineato al suo bordo destro, e si apre verso l'alto quando sotto non c'è posto.
   */
  function ancoraAlPulsante(bottone, menu) {
    const r = bottone.getBoundingClientRect();
    // prima la posizione fissa, POI le misure: da fisso il menu non va più a capo e cambia larghezza (foto del 09/10: sbordava)
    menu.style.position = 'fixed';
    menu.style.insetInlineEnd = 'auto';
    menu.style.left = '0px'; menu.style.top = '0px';
    const alto = menu.offsetHeight;
    const largo = menu.offsetWidth;
    const altezzaFinestra = finestra?.innerHeight ?? d.documentElement.clientHeight;
    const sotto = altezzaFinestra - r.bottom - 8;
    menu.style.left = `${Math.max(8, r.right - largo)}px`;
    menu.style.top = `${sotto >= alto + 6 || r.top < alto + 14 ? r.bottom + 6 : r.top - alto - 6}px`;
  }
  let sganciaMenuFisso = () => {};
  function chiudiMenu(bottoneMenu, menu, { fuoco = false } = {}) {
    if (menu.hidden) return;
    if (menu === vociAgente) { sganciaMenuFisso(); sganciaMenuFisso = () => {}; }
    menu.hidden = true; bottoneMenu.setAttribute('aria-expanded', 'false');
    if (fuoco) bottoneMenu.focus();
  }
  function tastiMenu(evento) {
    const menu = evento.target.closest('[role="menu"]'); if (!menu) return;
    const voci = [...menu.querySelectorAll('button:not(:disabled):not([hidden])')];
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
  /** La colonna «Files · N»: creato, modificato o letto, col percorso; un clic apre il file accanto al diagramma. */
  function disegnaFileDelPasso(riga) {
    const file = deleghe && Array.isArray(riga?.files) ? riga.files : [];
    detFile.hidden = file.length === 0;
    dettaglio.classList.toggle('talos-wfg__dettaglio--file', file.length > 0);
    if (!file.length) { detFile.replaceChildren(); delete detFile.dataset.firma; return; }
    /* 13/10/2026 (bugfixer, review): il dettaglio si ridisegna ogni secondo mentre qualcuno lavora (`battito`). Rifacendo l'elenco
       ogni volta, una riga col fuoco lo perdeva entro un secondo: la colonna non si poteva usare da tastiera. Si rifà solo se i
       file sono cambiati, e allora il fuoco torna alla riga dello stesso percorso. */
    const firmaFile = JSON.stringify([riga.stepSessionId, riga.filesCut ?? 0, file.map((f) => [f.path, f.created, f.written, f.read])]);
    if (detFile.dataset.firma === firmaFile) return;
    detFile.dataset.firma = firmaFile;
    const fileAFuoco = detFile.contains(d.activeElement) ? d.activeElement.dataset.percorso : null;
    const testa = el('h4', 'talos-wfg__dettaglio-titolo'); testa.append(icona('i-folder'), el('span', null, tr('agenti.workflow.filesTitle', { n: cifraLingua(file.length + (riga.filesCut ?? 0)) })));
    const elenco = el('ul', 'talos-wfg__evidenze');
    // prima ciò che ha cambiato il progetto (creati, modificati), poi le sole letture: è l'ordine in cui si guarda
    const peso = (f) => (f.created ? 0 : f.written ? 1 : 2);
    for (const f of [...file].sort((x, y) => peso(x) - peso(y))) {
      const voce = el('li', 'talos-wfg__evidenza talos-wfg__file'); voce.dataset.percorso = f.path;
      const verbo = tr(f.created ? 'agenti.workflow.fileCreated' : f.written ? 'agenti.workflow.fileChanged' : 'agenti.workflow.fileRead');
      const oggetto = el('code', 'talos-wfg__evidenza-oggetto');
      /* a schermo (riga e suggerimento) il percorso SENZA i caratteri che ingannano: «foto‹inversione›gpj.exe» si leggeva
         «fotoexe.jpg» (seconda passata del bugfixer). È un file toccato davvero: resta nell'elenco, e per aprirlo vale il
         percorso vero (`f.path`, anche in `data-percorso`). */
      const aSchermo = senzaInganni(f.path);
      for (const pezzo of aSchermo.split(/(?<=[/\\])/u)) oggetto.append(pezzo, d.createElement('wbr'));
      voce.append(icona(f.created ? 'i-code' : f.written ? 'i-edit' : 'i-eye'), el('span', 'talos-wfg__evidenza-nome', verbo), oggetto);
      if (typeof onApriFile === 'function') {
        voce.setAttribute('role', 'button'); voce.tabIndex = 0; voce.title = tr('agenti.workflow.fileOpenHint', { percorso: aSchermo });
        const apri = () => onApriFile({ sessionId: riga.stepSessionId, percorso: f.path });
        voce.addEventListener('click', apri);
        voce.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri(); } });
        voce.append(icona('i-chevron-right'));
      }
      elenco.append(voce);
    }
    if ((riga.filesCut ?? 0) > 0) elenco.append(el('li', 'talos-wfg__vuoto', tn('agenti.workflow.filesMoreOne', 'agenti.workflow.filesMoreMany', riga.filesCut, { n: cifraLingua(riga.filesCut) })));
    detFile.replaceChildren(testa, elenco);
    if (fileAFuoco != null) [...elenco.querySelectorAll('.talos-wfg__file')].find((v) => v.dataset.percorso === fileAFuoco)?.focus({ preventScroll: true });
  }
  function chiudiMenuFuori(evento) {
    if (!vociGruppi.hidden && !menuGruppi.contains(evento.target)) chiudiMenu(altroGruppi, vociGruppi);
    if (!vociRichieste.hidden && !menuRichieste.contains(evento.target)) chiudiMenu(altroRichieste, vociRichieste);
    if (!vociStato.hidden && !menuStato.contains(evento.target)) chiudiMenu(altroStato, vociStato);
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
    /** RIV-T3-01 (riverifica, 14/10/2026): dal pannello Agenti, a diagramma aperto, un agente che il diagramma non mostra — di
     *  un'ALTRA richiesta (il pannello le divide), o nascosto dal filtro per stato: si guarda la sua richiesta, come dal menu delle
     *  richieste, e lo si sceglie in vista. Chi arriva su un agente PRECISO ha già scelto (la regola di T3): un filtro per stato
     *  che lo nasconde cade — misurato: senza, la richiesta cambiava e il diagramma restava su «0 agenti», senza nessuno scelto.
     *  `false` solo se la sua richiesta non si sa (chi chiama ripiega sulla sua scheda nel pannello, come prima). Un agente che non si
     *  trova nemmeno lì non chiede altro: la sua scheda nel pannello si apre comunque al clic (misurato), e un controllo in più che
     *  nessuna prova distingue (il mutante sopravvissuto del 14/10) non resta. */
    async vaiAllAgente(sessionId) {
      if (morto || !deleghe) return false;
      const richiesta = await client.richiestaDellAgente?.(sessionId);
      if (morto || richiesta == null) return false;
      client.scegliRichiesta?.(richiesta);
      await rileggiDopoUnaScelta({ tieni: sessionId });
      if (!morto && client.sessioneDelNodo?.(stato.selezionato) !== sessionId && (fonte.panoramica?.filtro?.stato ?? 'all') !== 'all') {
        client.scegliStato?.('all');
        await rileggiDopoUnaScelta({ tieni: sessionId });
      }
      return true;
    },
    distruggi() {
      if (morto) return;
      morto = true;
      chiudiFlusso(); chiudiEvidenze(); fermaRiproduzione();
      clearTimeout(rilettura); clearInterval(orologio);
      osservaBarra?.disconnect?.();
      d.removeEventListener('pointerdown', chiudiMenuFuori, true);
      for (const aperta of d.querySelectorAll?.('dialog.talos-wfg-conferma[open]') ?? []) aperta.close();
      tela.distruggi(); tempo.distruggi();
      pannelloRisultati.distruggi();
      sganciaMenuFisso(); // C3: gli ascolti del menu fisso del dettaglio, se era aperto
      try { elk.terminateWorker?.(); } catch { /* nessun worker */ }
      root.remove();
    },
  };
}
