import {creaProviderCard} from '../src/components/provider-card.js';
import {PROVIDER_CARD} from './fixtures/provider-card.js';
import {creaRuntimeModello} from '../src/components/runtime-modelli.js';
import {RUNTIME_MODELLI} from './fixtures/runtime-modelli.js';
import {creaMisuraMemoria} from '../src/components/misura-memoria.js';
import {CAPACITA_MEMORIA,RUNTIME_MEMORIA} from './fixtures/misura-memoria.js';
import {aggiornaCatalogoModelli} from '../src/components/catalogo-modelli.js';
import {CATALOGO_MODELLI} from './fixtures/catalogo-modelli.js';
import {aggiornaFonteRicerca} from '../src/components/fonte-ricerca.js';
import {FONTE_RICERCA} from './fixtures/fonte-ricerca.js';
import {montaImpostazioni} from '../src/components/impostazioni.js';
import {IMPOSTAZIONI} from './fixtures/impostazioni.js';
import {aggiornaDoctor} from '../src/components/doctor.js';
import {DOCTOR,ADESSO_DOCTOR} from './fixtures/doctor.js';
import {aggiornaEstensioni,collegaSchedeCapability,mostraSchedaCapability} from '../src/components/estensioni.js';
import {ESTENSIONI} from './fixtures/estensioni.js';
import { aggiornaPaginaCapability } from '../src/components/capability.js';
import { ATTREZZI } from './fixtures/capability.js';
import { aggiornaPaginaAutomazioni } from '../src/components/automazioni.js';
import { AUTOMAZIONI, ADESSO as ADESSO_AUTOMAZIONI } from './fixtures/automazioni.js';
import { aggiornaPaginaOfficina } from '../src/components/officina.js';
import { STRUMENTI_FORGIATI } from './fixtures/officina.js';
import { aggiornaPaginaRicerca } from '../src/components/ricerca.js';
import { RICERCHE } from './fixtures/ricerca.js';
import { aggiornaPaginaLibreria } from '../src/components/libreria.js';
import { LIBRERIA, LIBRERIA_ANTEPRIMA, leggiFileDiProva } from './fixtures/libreria.js';
import { aggiornaPaginaAttivita } from '../src/components/attivita.js';
import { ATTIVITA } from './fixtures/attivita.js';
import { aggiornaPaginaMemoria } from '../src/components/memoria.js';
import { MEMORIE } from './fixtures/memoria.js';
import { aggiornaBoard } from '../src/components/board.js';
import { ADESSO_BOARD, SESSIONI_BOARD, METRICHE_BOARD, CARTELLE_BOARD } from './fixtures/board.js';
import template from '../index.template.html';
/* 11/09 — lotti C · E · F · G: le sezioni elenco+dettaglio, lo studio dei temi e la modale. */
/* ⛔ Nomi con l'alias `td`: le funzioni si chiamano come quelle dei sei componenti originali (è
   il punto — l'aggancio in `legacy/app.js` è di sole righe di import), e qui convivono con
   quelle vecchie, che restano importate per i laboratori `MemoryRow`/`TaskRow`/`LibraryRow`/`ReportRow`. */
import {
  montaNote as montaNoteTd, aggiornaPaginaMemoria as memoriaTd, aggiornaPaginaAttivita as attivitaTd,
  aggiornaPaginaLibreria as libreriaTd, aggiornaPaginaRicerca as ricercaTd, montaProgetti as progettiTd,
} from '../src/components/sezioni-adattatori.js';
import { apriStudioTemi, montaScorciatoiaTemi } from '../src/components/theme-studio.js';
import { confermaModale } from '../src/components/modale-td.js';
import { NOTE, ADESSO_NOTE } from './fixtures/note.js';
/* 12/09 lotto CRUD — la rete in memoria che accende i comandi di scrittura nelle tre sezioni. */
import { reteDiProva } from './fixtures/crud.js';
import { PROGETTI } from './fixtures/progetti.js';
/* 11/09 lotto L7 — la Ricerca approfondita col suo dentro: rapporto, affermazioni, fonti. */
import { RICERCHE as RICERCHE_L7, leggiRapportoFinto, apriMenuDiProva, reteRicercheDiProva } from './fixtures/ricerche.js';
import { creaApprovazione, creaArtefatto, creaAttesa, creaAttivita, creaAzioniMessaggio, creaBloccoCodice, creaFallimentoAttrezzo, creaFileToccati, creaMessaggioTalos, creaMessaggioUtente, creaNotaSistema, creaRicevuta, creaRigaAttrezzo, creaTurno } from '../src/components/conversazione.js';
import { renderizzaMarkdown } from '../src/components/markdown.js'; // BC-29 (12/09): il render vero, lo stesso della chat
import { aggiornaPiedeChat } from '../src/components/chat-foot.js';
import { aggiornaDiffReview, creaRigaFileReview, riassuntoReview } from '../src/components/review.js';
import { creaStatoVuoto } from '../src/components/stato-vuoto.js';
import { REVIEW } from './fixtures/review.js';
import { VUOTA } from './fixtures/vuota.js';
import { SPAZI_DI_LAVORO, STRUMENTI, creaNavItem } from '../src/components/nav-item.js';
import { CONVERSAZIONE } from './fixtures/conversazione.js';
import { PIEDE } from './fixtures/piede.js';
import { TOAST } from './fixtures/toast.js';
import { MODELLI_INSTALLATI, RUNTIME_INSTALLATI, FIT_INSTALLATI } from './fixtures/modelli-installati.js';
import { RISULTATI_HF, DETTAGLIO_HF, STIMA_HF } from './fixtures/hf-catalogo.js';
import { DOWNLOAD, STIME_DOWNLOAD } from './fixtures/download-coda.js';
import { INSPECTOR } from './fixtures/inspector.js';
import { SCHEDE_TERMINALE, CORNICE_TERMINALE } from './fixtures/terminale.js';
import { LETTURE_BROWSER, STATO_BROWSER } from './fixtures/browser.js';
import { creaBrowser } from '../src/components/browser.js';
import { creaSchedeTerminale } from '../src/components/terminale.js';
import { aggiornaInspector } from '../src/components/inspector.js';
import { aggiornaCodaDownload } from '../src/components/download-coda.js';
import { aggiornaHf } from '../src/components/hf-catalogo.js';
import { aggiornaInstallati } from '../src/components/modelli-installati.js';
import { NOTIFICHE, ORA_NOTIFICA, ETICHETTA_MOCKUP } from './fixtures/notifiche.js';
import { aggiornaPannelloNotifiche } from '../src/components/notifiche.js';
import { creaToast } from '../src/components/toast.js';
import { creaSessionItem } from '../src/components/session-item.js';
import { aggiornaTopbar } from '../src/components/topbar.js';
import { creaWorkspaceFooter } from '../src/components/workspace-footer.js';
import { CONTEGGI } from './fixtures/luoghi.js';
import { ADESSO, CORRENTE, FISSATE, SESSIONI } from './fixtures/sessioni.js';
import { TESTATA } from './fixtures/testata.js';
import { WORKSPACE } from './fixtures/workspace.js';

/*
 * IL LABORATORIO DEI COMPONENTI — la parità «a partire dai dati».
 *
 * Il cancello di Fase 0 confronta il mockup con il markup STATICO della app.
 * Qui si confronta il mockup con ciò che i componenti PRODUCONO dai dati:
 * la pagina è il template della app (stesso corpo, stesso CSS), e per il
 * componente chiesto in `?componente=` il laboratorio sostituisce il
 * contenuto d'esempio del mockup con quello reso dal componente a partire da
 * fixture scritte nella forma vera dell'API. Se le due immagini coincidono,
 * il componente riproduce il disegno approvato; se no, il diff dice dove.
 *
 * ⛔ Niente `app.js` qui: si prova il componente, non il monolite.
 */
const documento = new DOMParser().parseFromString(template, 'text/html');
// Stessa forma della app: i figli del template stanno DIRETTAMENTE nel body
// (che è un flex a colonna con overflow nascosto) — un contenitore in mezzo
// farebbe crescere la griglia a misura di contenuto invece che di viewport.
document.getElementById('app')?.remove();
for (const nodo of [...documento.body.children]) {
  if (nodo.tagName === 'SCRIPT') continue;
  document.body.append(document.importNode(nodo, true));
}
document.documentElement.setAttribute('data-vista', 'sessione');
document.documentElement.setAttribute('data-schermo', 'chat');

/*
 * ⛔⛔ 11/09 — IL VELO D'AVVIO SPEGNE ANCHE IL CANCELLO DI PARITÀ, non solo le foto.
 *
 *   Il debito era già dichiarato («il cancello di parità apre le stesse pagine: va guardato prima
 *   di fidarsi del suo verde», rapporto dei lotti C/E/F/G) e qui si chiude: `#talosAvvio` arriva
 *   col template, ma la regola `#talosAvvio{position:fixed;inset:0}` vive nell'inline <style> di
 *   `index.template.html` che `lab/index.html` NON ha. Fuori dal `position:fixed` è un blocco alto
 *   8.697 px dentro un body flex da 900: la shell riceve 0 px e ogni schermata diventa **invisibile**.
 *   ⇒ `npx playwright test --config=playwright.componenti.config.mjs` cadeva su OGNI componente con
 *   «element is not visible» allo scatto — misurato oggi su `TaskRow`, che nessuno aveva toccato.
 *   Toglierlo QUI, una volta, all'ingresso, invece che dentro `mostraSchermo`: le pagine dei
 *   componenti (`ReportRow`, `TaskRow`, …) non passano da lì.
 * ⛔ Nessun laboratorio disegna il velo di proposito: l'unica cosa che si perde è un blocco inerte.
 */
document.getElementById('talosAvvio')?.remove();

/*
 * BC-29 — il testo che le due foto (nota e chat) devono rendere IDENTICO: un recinto con lingua e
 * una citazione, i due difetti della foto dell'owner del 12/09.
 */
const MARKDOWN_DI_PROVA = [
  'Ho lasciato il comando pronto:',
  '',
  '```bash',
  'npm run test:unit',
  '```',
  '',
  '> Una citazione occupa tutte le righe che portano il marcatore,',
  '> e la riga vuota la chiude.',
  '>',
  '> > Un secondo maggiore la annida: cambia il tono del filetto, non il rientro.',
  '',
  'Il resto della nota resta `testo` normale.',
].join('\n');

const componente = new URLSearchParams(location.search).get('componente') || '';

/*
 * Una schermata-pagina si guarda come la guarda la app: la chat via, `data-vista="pagina"` (che
 * toglie la colonna dei dettagli) e `data-schermo` col nome giusto. È la stessa regia di `setView`
 * in `legacy/app.js:1384-1388` — qui a mano, perché il laboratorio non carica il monolite.
 */
function mostraSchermo(id, nome) {
  /*
   * ⛔ TROVATO DALLA PRIMA SERIE DI FOTO, tutte nere: `#talosAvvio` — il velo d'avvio — nel
   *   laboratorio resta acceso, perché `src/avvio.js` è un entry a parte che qui non viene
   *   caricato. Senza il suo foglio è alto 8.697 px dentro un `body` flex da 900: la shell riceve
   *   zero spazio e la app diventa invisibile. Si toglie qui, dove si decide cosa guardare.
   */
  document.getElementById('talosAvvio')?.remove();
  /* ⛔ `#centro` PORTA ANCHE LUI la classe `.talos-screen`: nasconderlo svuota la finestra, e la
     prima serie di foto è uscita tutta nera per questo. Si escludono i contenitori. */
  for (const pane of document.querySelectorAll('#centro > .talos-screen')) pane.hidden = pane.id !== id;
  document.documentElement.setAttribute('data-vista', 'pagina');
  document.documentElement.setAttribute('data-schermo', nome);
  return document.getElementById(id);
}
/* La pila dei toast vera della app, per far vedere l'annullamento del lotto E senza il monolite. */
function notificaDiProva(titolo, messaggio, opzioni = {}) {
  const regione = document.querySelector('#regioneToast');
  for (const finto of regione.querySelectorAll('.talos-toast')) finto.remove();
  const { scheda, azione } = creaToast({ id: Date.now(), titolo, messaggio, tono: opzioni.tono, azione: opzioni.azione });
  if (azione && typeof opzioni.azione?.esegui === 'function') azione.addEventListener('click', () => { opzioni.azione.esegui(); scheda.remove(); });
  regione.append(scheda);
  regione.hidden = false;
  return scheda;
}

/*
 * Il banco del CRUD (12/09): monta una delle tre sezioni con la rete in memoria, e porta la
 * schermata nello stato che si vuole fotografare — elenco, dettaglio, modulo nuovo, modulo di
 * modifica, conferma d'eliminazione.
 * ⛔ Ogni stato si raggiunge coi GESTI VERI (si preme il pulsante, si apre il menu, si sceglie
 *   «Elimina»): una foto di uno stato costruito a mano proverebbe che il disegno esiste, non che
 *   ci si arrivi. È la stessa ragione per cui il banco della Ricerca clicca la scheda.
 */
const SEZIONI_CRUD = {
  note: { id: 'schermoNote', risorsa: 'notes', monta: montaNoteTd, dati: () => NOTE, extra: { adesso: ADESSO_NOTE } },
  memoria: { id: 'schermoMemoria', risorsa: 'memory', monta: memoriaTd, dati: () => MEMORIE, extra: {} },
  attivita: { id: 'schermoAttivita', risorsa: 'tasks', monta: attivitaTd, dati: () => ATTIVITA, extra: {} },
};

async function montaCrud(quale, { apri = null, nuova = false, modifica = false, elimina = false, salvaVuoto = false, modoTesto = false } = {}) {
  const def = SEZIONI_CRUD[quale];
  const schermo = mostraSchermo(def.id, quale);
  const { rete, elenco } = reteDiProva({ [def.risorsa]: def.dati() });
  const opzioni = {
    ...def.extra,
    sessionId: 'fx-lab',
    rete,
    notifica: notificaDiProva,
    onMenu: apriMenuDiProva,
    onCopia: () => notificaDiProva('Copiata', 'La voce è negli appunti.'),
    /*
     * ⭐ 12/09 (BC-29) — QUI C'ERA `null`, e il laboratorio mostrava il RIPIEGO.
     *   `prosaInNodi` senza `rendiMarkdown` fa la lettura strutturale minima (titoli, citazioni,
     *   paragrafi): una foto di questa sezione provava che il ripiego funziona, non che la nota si
     *   legge come nella app — dove `legacy/app.js` inietta il render della chat. Il motivo era che
     *   il laboratorio non carica il monolite; da oggi non serve più, perché il render è un
     *   componente (`components/markdown.js`), e il recinto passa dallo stesso blocco della chat.
     */
    rendiMarkdown: rendiMarkdownDiProva,
    onAggiorna: () => def.monta(schermo, elenco(def.risorsa), opzioni),
    onCambiata: () => def.monta(schermo, elenco(def.risorsa), opzioni),
  };
  def.monta(schermo, elenco(def.risorsa), opzioni);
  const respira = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

  if (nuova) {
    schermo.querySelector('[data-nuova]').click();
    await respira();
    if (salvaVuoto) {
      /* Si preme «Salva» su un modulo vuoto: è l'unico momento in cui gli errori possono comparire
         (MDN: nessuna accusa prima di un tentativo), ed è ciò che questa foto deve mostrare. */
      [...schermo.querySelectorAll('.td-detail-footer .talos-button')].find((b) => b.textContent === 'Salva').click();
      await respira();
    }
    return schermo;
  }
  if (!apri) return schermo;
  schermo.querySelector(`.td-card[data-item="${apri}"] .td-card-open`).click();
  await respira();
  if (modoTesto) {
    schermo.querySelector('.td-voce-modi [data-modo="testo"]').click();
    await respira();
  }
  if (modifica) {
    [...schermo.querySelectorAll('.td-detail-footer .talos-button')].find((b) => b.textContent === 'Modifica').click();
    await respira();
  }
  if (elimina) {
    [...schermo.querySelectorAll('.td-detail-footer .talos-button')].find((b) => b.textContent === 'Tutte le azioni').click();
    await respira();
    [...document.querySelectorAll('.ft-actions-menu-item')].find((b) => b.textContent.includes('Elimina')).click();
    await respira();
  }
  return schermo;
}

/* Il banco della Ricerca approfondita: monta, aspetta il rapporto, apre la scheda chiesta.
 *
 * ⭐ 12/09 L5 — `azioni: true` accende la rete: senza, la sezione non disegna nemmeno una voce di
 *   menu di scrittura (un comando che non può funzionare non si mostra), quindi le foto del menu
 *   nuovo, dell'esito della ri-verifica e della conferma di eliminazione non esisterebbero.
 * ⛔ L'elenco si COPIA prima di darlo alla rete finta: `elimina` toglie davvero una riga, e una
 *   pagina del laboratorio non deve poter cambiare quello che vede la pagina dopo.
 */
async function montaRicerca({ apri = null, vista = 'rapporto', menu = false, righe = false, azioni = false, premi = null } = {}) {
  const schermo = mostraSchermo('schermoRicerca', 'ricerca');
  const elenco = azioni ? RICERCHE_L7.map((r) => ({ ...r })) : RICERCHE_L7;
  const opzioni = {
    leggiRapporto: leggiRapportoFinto,
    onMenu: apriMenuDiProva,
    onApriSessione: () => {},
    notifica: notificaDiProva,
    ...(azioni ? { sessionId: 'fx-lab', rete: reteRicercheDiProva(elenco) } : {}),
  };
  ricercaTd(schermo, elenco, opzioni);
  if (righe) schermo.querySelector('[data-vista="elenco"]').click();
  if (!apri) return schermo;
  schermo.querySelector(`.td-card[data-item="${apri}"] .td-card-open`).click();
  /* Due giri di microtask: uno per la lettura del file, uno per il ridisegno che ne segue. */
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((fatto) => setTimeout(fatto, 0));
  if (vista) schermo.querySelector(`.td-viste [data-vista="${vista}"]`)?.click();
  if (menu || premi) schermo.querySelector('.td-detail-meta .td-tools button').click();
  if (premi) {
    /* ⛔ Si preme la voce VERA del menu, non si chiama la funzione: così la foto prova anche che
       l'etichetta e l'azione sono legate, che è metà di quello che c'è da guardare. */
    [...document.querySelectorAll('.ft-actions-menu-item')].find((b) => b.textContent.includes(premi))?.click();
    await new Promise((fatto) => setTimeout(fatto, 0));
    await new Promise((fatto) => setTimeout(fatto, 0));
  }
  return schermo;
}

/*
 * 11/09 — il CONTENUTO di un file nel dettaglio della Libreria, sui quattro tipi e nei due modi.
 * ⛔ `leggiFile` è l'iniezione: nel laboratorio il testo arriva dalla fixture, in produzione dalla
 *   rotta `GET /library/:voceId/file`. Stessa forma, nessuna rete qui dentro.
 * ⛔ Il modo si sceglie CLICCANDO la scheda «Testo», non impostando uno stato: così la foto prova
 *   anche che l'interruttore funziona, non solo che il pannello sa disegnarsi.
 */
/*
 * Il render Markdown del laboratorio: lo STESSO della chat e della app (`components/markdown.js`),
 * col blocco di codice della conversazione. ⛔ Un secondo render qui renderebbe le foto inutili —
 * proverebbero il laboratorio, non il prodotto.
 */
const rendiMarkdownDiProva = (testo) => renderizzaMarkdown(testo, {
  bloccoCodice: (codice, linguaggio, chiuso) => creaBloccoCodice({ testo: codice, linguaggio, chiuso }),
});

async function montaLibreriaFile({ apri = 'lib-md', modo = 'anteprima' } = {}) {
  const schermo = mostraSchermo('schermoLibreria', 'libreria');
  libreriaTd(schermo, LIBRERIA_ANTEPRIMA, {
    sessionId: 'fx-lab', notifica: notificaDiProva, onMenu: () => {}, leggiFile: leggiFileDiProva,
    /* ⭐ 12/09 (BC-29) — come per le Note: qui non si passava niente e il laboratorio mostrava il
       RIPIEGO strutturale di `prosaInNodi`, mentre la app inietta il render della chat
       (`legacy/app.js:5083` e `:5295`). Il recinto e la citazione della fixture si vedono solo così. */
    rendiMarkdown: rendiMarkdownDiProva,
  });
  schermo.querySelector(`.td-card[data-item="${apri}"] .td-card-open`).click();
  /* Due giri di microtask: uno per la lettura del file, uno per il ridisegno che ne segue. */
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((fatto) => setTimeout(fatto, 0));
  if (modo) schermo.querySelector(`.td-file-modi [data-modo="${modo}"]`)?.click();
  return schermo;
}

const LABORATORI = {
 ProviderCard(){document.querySelector('#veloFornitori [data-c=ProviderCard]').replaceWith(creaProviderCard(PROVIDER_CARD[4],{aperta:true}));},
 RuntimeCard(){document.querySelector('#panel-runtime [data-c=RuntimeCard]').replaceWith(creaRuntimeModello(RUNTIME_MODELLI[0]));},
 MemoryMeter(){document.querySelector('#panel-runtime [data-c=MemoryMeter]').replaceWith(creaMisuraMemoria({capacita:CAPACITA_MEMORIA,runtimes:RUNTIME_MEMORIA}));},
 CatalogoModelli(){const p=document.querySelector('#panel-catalogo');p.querySelector('[data-catalog-list]').replaceChildren();p.querySelector('[data-catalog-detail]').replaceChildren();aggiornaCatalogoModelli(p,CATALOGO_MODELLI);},
 FonteRicerca(){const s=document.querySelector('#setting-source-preview [data-settings-reuse]');s.replaceChildren();aggiornaFonteRicerca(s,FONTE_RICERCA);},
 SettingsNav(){document.querySelector('#schermoImpostazioni [role=tablist]').replaceChildren();montaImpostazioni(document.querySelector('#schermoImpostazioni'),IMPOSTAZIONI);},
 SettingRow(){montaImpostazioni(document.querySelector('#schermoImpostazioni'),IMPOSTAZIONI);},
 CheckCard(){aggiornaDoctor(document.querySelector('#schermoDoctor'),DOCTOR,{ricevutoAlle:ADESSO_DOCTOR});},
  ExtensionList_skills() {const s=document.querySelector('#schermoCapability');collegaSchedeCapability(s,()=>{});mostraSchedaCapability(s,'skills');aggiornaEstensioni(s.querySelector('[data-cap-panel=skills]'),ESTENSIONI.skills,{tipo:'skills',ambito:'fixture'});},
  ExtensionList_mcp() {const s=document.querySelector('#schermoCapability');collegaSchedeCapability(s,()=>{});mostraSchedaCapability(s,'mcp');aggiornaEstensioni(s.querySelector('[data-cap-panel=mcp]'),ESTENSIONI.mcp,{tipo:'mcp',ambito:'fixture'});},
  ExtensionList_plugins() {const s=document.querySelector('#schermoCapability');collegaSchedeCapability(s,()=>{});mostraSchedaCapability(s,'plugins');aggiornaEstensioni(s.querySelector('[data-cap-panel=plugins]'),ESTENSIONI.plugins,{tipo:'plugins',ambito:'fixture'});},
  ExtensionList_hooks() {const s=document.querySelector('#schermoCapability');collegaSchedeCapability(s,()=>{});mostraSchedaCapability(s,'hooks');aggiornaEstensioni(s.querySelector('[data-cap-panel=hooks]'),ESTENSIONI.hooks,{tipo:'hooks',ambito:'fixture'});},
  ToolList() { aggiornaPaginaCapability(document.querySelector('#schermoCapability'), ATTREZZI, {ambito:'fixture'}); },
  AutomationRow() { aggiornaPaginaAutomazioni(document.querySelector('#schermoAutomazioni'), AUTOMAZIONI, { adesso: ADESSO_AUTOMAZIONI }); },
  ForgeList() { aggiornaPaginaOfficina(document.querySelector('#schermoOfficina'), STRUMENTI_FORGIATI); },
  ReportRow() { aggiornaPaginaRicerca(document.querySelector('#schermoRicerca'), RICERCHE); },
  /*
   * ⛔ 12/09 — SENZA `sessionId` LA RIGA NON È QUELLA DELLA APP. `azioniLibreria()` torna `null`
   *   senza sessione, e senza servizio la riga non disegna NESSUNA azione: il laboratorio mostrava
   *   un gruppo azioni vuoto, cioè una riga che nel prodotto non esiste. Col `sessionId` (e un
   *   `onMenu` finto, come le altre pagine di Libreria qui sotto) torna la riga vera: un bottone
   *   solo, «⋯», più le quattro azioni pronte per il menu — la forma decisa dall'owner il 10/09
   *   («non mettere i pulsanti uno accanto all'altro, usa i tre puntini + dropdown»).
   */
  LibraryRow() { aggiornaPaginaLibreria(document.querySelector('#schermoLibreria'), LIBRERIA, { sessionId: 'fx-lab', onMenu: () => {} }); },
  TaskRow() { aggiornaPaginaAttivita(document.querySelector('#schermoAttivita'), ATTIVITA); },
  MemoryRow() { aggiornaPaginaMemoria(document.getElementById('schermoMemoria'), MEMORIE); },
  Board() {
    aggiornaBoard(document.getElementById('schermoBoard'), SESSIONI_BOARD, {adesso:ADESSO_BOARD,metriche:METRICHE_BOARD,cartelle:CARTELLE_BOARD,cartelleCaricate:true});
  },
  EmptyState() {
    const vecchia = document.querySelector('#schermoVuota .talos-conversation__column.talos-empty');
    vecchia.replaceWith(creaStatoVuoto(VUOTA));
  },
  Review() {
    const schermo = document.getElementById('schermoReview');
    const elenco = schermo.querySelector('.talos-review__schede .talos-tabs__list');
    for (const finto of elenco.querySelectorAll('.talos-review__scheda')) finto.remove();
    for (const voce of REVIEW.voci) elenco.append(creaRigaFileReview(voce, { attiva: voce.path === REVIEW.corrente }));
    aggiornaDiffReview(schermo.querySelector('.talos-review__diff'), REVIEW.voci.find((v) => v.path === REVIEW.corrente));
    schermo.querySelector('.talos-topbar__path').textContent = riassuntoReview(REVIEW.voci);
  },
  NotificationPanel() {
    const pannello = document.querySelector('#pannelloNotifiche');
    const { righe } = aggiornaPannelloNotifiche(pannello, NOTIFICHE, { ora: ORA_NOTIFICA });
    // il mockup scrive il PERCHÉ («Vuole scrivere fuori dalla cartella») al posto dell'etichetta generica
    righe[0].querySelector('.talos-list-row__sub').textContent = `${ETICHETTA_MOCKUP} · ${ORA_NOTIFICA()}`;
    pannello.hidden = false;
  },
  Inspector() {
    aggiornaInspector(document.querySelector('#inspectorSessione'), INSPECTOR);
  },
  Inspector_processi() {
    aggiornaInspector(document.querySelector('#inspectorSessione'), INSPECTOR);
  },
  Browser() { // 06/9 K-I: le due letture del mockup, la seconda attiva
    const schede = LETTURE_BROWSER.map((l, i) => ({ ...l, id: `lettura-${i}`, tipo: 'lettura', origine: 'agente' }));
    creaBrowser(document.querySelector('#schermoBrowser'), { modoIniziale: 'testo' }).aggiorna({ schede, attiva: schede[STATO_BROWSER.attiva].id, note: {}, richiesta: null });
    /*
     * ⛔ 12/09 — `modoIniziale` NON SOPRAVVIVE PIÙ al primo `aggiorna`. Owner 11/09: «anche se cambio
     *   scheda mentre sono in modalità sorgente… la navigazione deve essere sempre in modalità
     *   pagina» ⇒ `browser.js` riazzera il modo a «pagina» a ogni cambio di scheda attiva, e la prima
     *   chiamata (da `attiva: null` a una scheda) È un cambio di scheda. Il laboratorio mostrava
     *   quindi la cornice VIVA di example.org — cioè una richiesta di rete dentro il cancello — al
     *   posto del testo dell'agente che il mockup disegna.
     * ⇒ Lo stato si raggiunge col GESTO VERO, premendo «Testo dell'agente»: è come ci arriva una
     *   persona, e prova anche che il pulsante funziona.
     */
    document.querySelector('#schermoBrowser [data-browser-modo="testo"]')?.click();
  },
  Terminale() { // 06/9 B1: le schede e il piede; il corpo resta quello del mockup
    creaSchedeTerminale(document.querySelector('#schermoTerminale .talos-terminal')).aggiorna({ schede: SCHEDE_TERMINALE, ...CORNICE_TERMINALE });
  },
  CodaDownload() {
    aggiornaCodaDownload(document.querySelector('#panel-download'), DOWNLOAD, { stime: STIME_DOWNLOAD });
  },
  CatalogoHf() {
    const panel = document.querySelector('#panel-hf');
    panel.querySelector('#listaHf').dataset.hfLista = '';
    aggiornaHf(panel, RISULTATI_HF, { selezionato: 'Qwen/Qwen3-8B-GGUF', detail: DETTAGLIO_HF, stima: STIMA_HF, altri: true });
  },
  ModelliInstallati() {
    const panel = document.querySelector('#panel-installati');
    aggiornaInstallati(panel, MODELLI_INSTALLATI, { runtime: RUNTIME_INSTALLATI, fit: FIT_INSTALLATI, selezionato: 'qwen8' });
  },
  SezioneNote: () => montaCrud('note'),
  SezioneNote_dettaglio: () => montaCrud('note', { apri: 'nota-cache' }),
  SezioneNote_vuota() {
    montaNoteTd(mostraSchermo('schermoNote', 'note'), [], { adesso: ADESSO_NOTE });
  },
  SezioneMemoria: () => montaCrud('memoria', { apri: 'fx-policy' }),
  SezioneAttivita: () => montaCrud('attivita', { apri: 'task-ledger' }),

  /* ───────── 12/09, lotto CRUD: le tre superfici di scrittura, per ognuna delle tre sezioni ───────── */
  /* La nota in Markdown, col suo interruttore: è la vista che l'ordine dell'owner nomina. */
  SezioneNote_markdown: () => montaCrud('note', { apri: 'nota-markdown' }),
  SezioneNote_markdown_testo: () => montaCrud('note', { apri: 'nota-markdown', modoTesto: true }),
  SezioneNote_nuova: () => montaCrud('note', { nuova: true }),
  SezioneNote_modifica: () => montaCrud('note', { apri: 'nota-cache', modifica: true }),
  SezioneNote_elimina: () => montaCrud('note', { apri: 'nota-cache', elimina: true }),
  SezioneMemoria_nuova: () => montaCrud('memoria', { nuova: true }),
  SezioneMemoria_modifica: () => montaCrud('memoria', { apri: 'fx-policy', modifica: true }),
  SezioneMemoria_elimina: () => montaCrud('memoria', { apri: 'fx-policy', elimina: true }),
  SezioneAttivita_nuova: () => montaCrud('attivita', { nuova: true }),
  SezioneAttivita_modifica: () => montaCrud('attivita', { apri: 'task-ledger', modifica: true }),
  SezioneAttivita_elimina: () => montaCrud('attivita', { apri: 'task-ledger', elimina: true }),
  /* Il modulo che ha già SBAGLIATO: è la foto che dice se l'errore si legge, e dove sta. */
  SezioneNote_moduloInvalido: () => montaCrud('note', { nuova: true, salvaVuoto: true }),
  SezioneLibreria() {
    const schermo = mostraSchermo('schermoLibreria', 'libreria');
    libreriaTd(schermo, LIBRERIA, { sessionId: 'fx-lab', notifica: notificaDiProva, onMenu: () => {} });
    schermo.querySelector('.td-card .td-card-open').click();
  },
  /*
   * 11/09 lotto L7 — la Ricerca approfondita. `leggiRapporto` è la stessa forma che avrà in
   * produzione (`GET /library/:voceId/file` → testo), qui servita dalla fixture: il rapporto
   * arriva DOPO, in una promessa, e la sezione si ridisegna da sola quando è pronto. Le pagine
   * sono `async` per questo — si aspetta il ridisegno, non si fotografa il «Leggo il rapporto…».
   */
  SezioneRicerca: () => montaRicerca(),
  SezioneRicerca_vuota() {
    ricercaTd(mostraSchermo('schermoRicerca', 'ricerca'), [], {});
  },
  SezioneRicerca_rapporto: () => montaRicerca({ apri: 'ric-conclusa' }),
  SezioneRicerca_senza: () => montaRicerca({ apri: 'ric-bloccata' }),
  SezioneRicerca_affermazioni: () => montaRicerca({ apri: 'ric-conclusa', vista: 'affermazioni' }),
  SezioneRicerca_fonti: () => montaRicerca({ apri: 'ric-conclusa', vista: 'fonti' }),
  SezioneRicerca_piano: () => montaRicerca({ apri: 'ric-conclusa', vista: 'piano' }),
  SezioneRicerca_andata: () => montaRicerca({ apri: 'ric-bloccata', vista: 'andata' }),
  SezioneRicerca_senza_record: () => montaRicerca({ apri: 'ric-senza-record' }),
  SezioneRicerca_menu: () => montaRicerca({ apri: 'ric-conclusa', menu: true }),
  /* 11/09 — la prova NEI DUE VERSI del difetto della foto del 4174: `ric-conclusa` è `done` col
     record (il pannello Rapporto è pieno), `ric-scusa` è `senza-rapporto` con un file depositato
     (il pannello deve dire che un rapporto non c'è e mostrare la scusa solo come allegato). */
  SezioneRicerca_scusa: () => montaRicerca({ apri: 'ric-scusa', vista: 'rapporto' }),
  SezioneRicerca_scusa_menu: () => montaRicerca({ apri: 'ric-scusa', vista: 'rapporto', menu: true }),
  SezioneRicerca_elenco: () => montaRicerca({ vista: null, righe: true }),
  /*
   * ⭐⭐⭐ 12/09 L5 — LE AZIONI DI SCRITTURA. Quattro pagine, e ognuna guarda uno stato diverso:
   *   il menu di una ricerca VIVA (pausa), di una IN PAUSA (ripresa) e di una CONCLUSA
   *   (ri-verifica), più l'esito della ri-verifica e la conferma dell'eliminazione.
   * ⛔ Le foto si fanno in chiaro E in scuro, a 1440 e a 1024 (regola dell'owner dell'11/09).
   */
  SezioneRicerca_menu_viva: () => montaRicerca({ apri: 'ric-viva', vista: 'andata', menu: true, azioni: true }),
  SezioneRicerca_menu_pausa: () => montaRicerca({ apri: 'ric-in-pausa', vista: 'andata', menu: true, azioni: true }),
  SezioneRicerca_menu_conclusa: () => montaRicerca({ apri: 'ric-conclusa', vista: 'rapporto', menu: true, azioni: true }),
  SezioneRicerca_riverifica: () => montaRicerca({ apri: 'ric-conclusa', vista: 'fonti', azioni: true, premi: 'Controlla se le fonti' }),
  SezioneRicerca_riverifica_no: () => montaRicerca({ apri: 'ric-senza-record', vista: 'fonti', azioni: true, premi: 'Controlla se le fonti' }),
  SezioneRicerca_elimina: () => montaRicerca({ apri: 'ric-conclusa', vista: 'rapporto', azioni: true, premi: 'Elimina la ricerca' }),
  /* ⭐ 12/09 L5-bis — la suite di esportazioni (owner: «completa»), nei due stati che contano:
     col riepilogo delle verifiche (tutte accese) e senza (le quattro di dati SPENTE col motivo). */
  SezioneRicerca_esporta: () => montaRicerca({ apri: 'ric-conclusa', vista: 'rapporto', azioni: true, premi: 'Esporta' }),
  SezioneRicerca_esporta_spente: () => montaRicerca({ apri: 'ric-senza-record', vista: 'rapporto', azioni: true, premi: 'Esporta' }),
  SezioneRicerca_piano_pieno: () => montaRicerca({ apri: 'ric-conclusa', vista: 'piano', azioni: true }),
  SezioneRicerca_andata_speso: () => montaRicerca({ apri: 'ric-in-pausa', vista: 'andata', azioni: true }),
  SezioneProgetti() {
    const schermo = mostraSchermo('schermoProgetti', 'progetti');
    progettiTd(schermo, PROGETTI, { onApriSessione: () => {} });
    schermo.querySelector('.td-card .td-card-open').click();
  },
  SezioneLibreria_md: () => montaLibreriaFile({ apri: 'lib-md', modo: 'anteprima' }),
  SezioneLibreria_md_testo: () => montaLibreriaFile({ apri: 'lib-md', modo: 'testo' }),
  SezioneLibreria_csv: () => montaLibreriaFile({ apri: 'lib-csv', modo: 'anteprima' }),
  SezioneLibreria_csv_testo: () => montaLibreriaFile({ apri: 'lib-csv', modo: 'testo' }),
  SezioneLibreria_pdf: () => montaLibreriaFile({ apri: 'lib-pdf', modo: 'anteprima' }),
  SezioneLibreria_pdf_testo: () => montaLibreriaFile({ apri: 'lib-pdf', modo: 'testo' }),
  SezioneLibreria_docx: () => montaLibreriaFile({ apri: 'lib-docx', modo: 'anteprima' }),
  SezioneLibreria_docx_testo: () => montaLibreriaFile({ apri: 'lib-docx', modo: 'testo' }),
  SezioneLibreria_elenco() {
    /* C-bis: la stessa Libreria in vista RIGHE — la copertina del file sparisce, resta la riga. */
    const schermo = mostraSchermo('schermoLibreria', 'libreria');
    libreriaTd(schermo, LIBRERIA, { sessionId: 'fx-lab', notifica: notificaDiProva, onMenu: () => {} });
    schermo.querySelector('[data-vista="elenco"]').click();
  },
  async SezioneNote_elenco() {
    const schermo = await montaCrud('note');
    schermo.querySelector('[data-vista="elenco"]').click();
  },
  SezioneElenco() {
    /* La stessa sezione in vista ELENCO: è la seconda metà del segmento, e va guardata. */
    const schermo = mostraSchermo('schermoMemoria', 'memoria');
    memoriaTd(schermo, MEMORIE, {});
    schermo.querySelector('[data-vista="elenco"]').click();
  },
  ThemeStudio() {
    mostraSchermo('schermoImpostazioni', 'impostazioni');
    apriStudioTemi();
  },
  ScorciatoiaTemi() {
    const schermo = mostraSchermo('schermoImpostazioni', 'impostazioni');
    montaScorciatoiaTemi(schermo);
  },
  ModaleConferma() {
    mostraSchermo('schermoImpostazioni', 'impostazioni');
    confermaModale({
      titolo: 'Rimetto tutte le preferenze ai valori iniziali?',
      domanda: 'Tema, densità, lingua, preferenze della chat e cartelle ricordate tornano come appena installato.',
      conseguenza: 'Le conversazioni e i file NON vengono toccati.',
      etichettaConferma: 'Ripristina',
      onConferma: () => {},
    });
  },
  ToastAnnulla() {
    mostraSchermo('schermoChat', 'chat');
    notificaDiProva('Rinominato', '«contratto-eventi.json» adesso si chiama «contratto-eventi-v2.json».', { tono: 'riuscito', azione: { etichetta: 'Annulla', esegui: () => {} } });
  },
  Toast() {
    const regione = document.querySelector('#regioneToast');
    regione.replaceChildren(...TOAST.map((t) => creaToast(t).scheda));
    regione.hidden = false;
  },
  ChatFooter() {
    /* Prima si svuota ciò che il mockup scrive a mano, poi il componente lo riscrive dai dati. */
    const piede = document.querySelector('#schermoChat .talos-chat-foot');
    /* ⛔ 12/09 — SI SVUOTA SOLO CIÒ CHE IL COMPONENTE RISCRIVE. `.talos-chip__label` prendeva TUTTE
       le pill, compresa quella del Terminale (PO-09), che è statica: nessuno la riempiva più e il
       laboratorio mostrava una pill senza nome. Il cancello dei componenti lo ha visto come una
       parola in meno rispetto al mockup — cioè come un difetto della app, che non era.
       ⇒ Solo le due pill che `aggiornaPiedeChat` scrive davvero: modello e permesso. */
    for (const el of piede.querySelectorAll('[data-run-what], [data-run-meta], [data-open-sheet="model"] .talos-chip__label, [data-open-sheet="permissions"] .talos-chip__label, [data-runtime-giri] .talos-mono, [data-runtime-costo] .talos-mono, .talos-statusbar span')) el.textContent = '';
    piede.querySelector('[data-open-sheet="permissions"]').classList.remove('talos-badge--warning');
    aggiornaPiedeChat(piede, PIEDE);
  },
  Conversazione() {
    const colonna = document.querySelector('#schermoChat .talos-conversation__column');
    for (const finto of colonna.querySelectorAll(':scope > .talos-turn')) finto.remove();
    for (const t of CONVERSAZIONE) {
      const turno = creaTurno({ numeri: t.numeri });
      if (t.tipo === 'utente') {
        turno.append(creaMessaggioUtente({ testo: t.testo, ora: t.ora }));
        colonna.append(turno);
        continue;
      }
      const messaggio = creaMessaggioTalos({ modello: t.modello, ora: t.ora, paragrafi: t.paragrafi });
      if (t.attivita) {
        const a = creaAttivita({ id: t.attivita.id, riassunto: t.attivita.riassunto, tempo: t.attivita.tempo, token: t.attivita.token });
        for (const r of t.attivita.righe) {
          const riga = creaRigaAttrezzo(r);
          a.contenitore.append(riga.riga);
          if (riga.corpo) { riga.corpo.textContent = r.corpo || ''; if (r.aperto) riga.riga.setAttribute('aria-expanded', 'true'); a.contenitore.append(riga.corpo); }
        }
        if (t.attivita.fallimento) a.contenitore.append(creaFallimentoAttrezzo(t.attivita.fallimento));
        messaggio.append(a.card);
      }
      if (t.nota) messaggio.append(creaNotaSistema(t.nota));
      if (t.approvazione) messaggio.append(creaApprovazione(t.approvazione).scheda);
      if (t.ricevuta) messaggio.append(creaRicevuta(t.ricevuta));
      if (t.fileToccati) messaggio.append(creaFileToccati(t.fileToccati));
      if (t.artefatto) messaggio.append(creaArtefatto(t.artefatto).card);
      if (t.attesa) messaggio.append(creaAttesa(t.attesa).blocco);
      if (t.azioni) messaggio.append(creaAzioniMessaggio());
      turno.append(messaggio);
      colonna.append(turno);
    }
  },
  /*
   * ⭐ 12/09 (BC-29) — LO STESSO MARKDOWN, DENTRO LA BOLLA DELLA CHAT.
   *   Serve a provare che la cura delle note non ha toccato la conversazione: qui il render è lo
   *   stesso (`components/markdown.js`) e la struttura è quella che `legacy/app.js` costruisce a
   *   ogni risposta — `.talos-message > .talos-message__copy > .assistant-copy`. Una foto di questa
   *   pagina accanto a quella della nota dice se le due superfici sono d'accordo.
   */
  Conversazione_markdown() {
    const colonna = document.querySelector('#schermoChat .talos-conversation__column');
    for (const finto of colonna.querySelectorAll(':scope > .talos-turn')) finto.remove();
    const turno = creaTurno({ numeri: '1 / 1' });
    const messaggio = creaMessaggioTalos({ modello: 'glm-5.3-flash', ora: '18:42' });
    const article = document.createElement('div');
    article.className = 'talos-message__copy';
    const copia = document.createElement('div');
    copia.className = 'assistant-copy';
    copia.append(renderizzaMarkdown(MARKDOWN_DI_PROVA, {
      bloccoCodice: (codice, linguaggio, chiuso) => creaBloccoCodice({ testo: codice, linguaggio, chiuso }),
    }));
    article.append(copia);
    messaggio.append(article);
    turno.append(messaggio);
    colonna.append(turno);
  },
  Topbar() {
    /* Prima si svuota ciò che il mockup scrive a mano, poi il componente lo riscrive dai dati. */
    const topbar = document.querySelector('#schermoChat .talos-topbar');
    topbar.querySelector('h1').textContent = '';
    topbar.querySelector('.talos-topbar__path').textContent = '';
    for (const badge of topbar.querySelectorAll('.talos-tabs__count')) badge.remove();
    aggiornaTopbar(topbar, TESTATA);
  },
  WorkspaceFooter() {
    const finto = document.querySelector('.talos-sidebar .talos-sidebar__foot');
    finto.replaceWith(creaWorkspaceFooter(WORKSPACE));
  },
  NavItem() {
    /*
     * 11/09, lotto A — le voci rifatte dal componente dentro i DUE gruppi del mockup. Prima stavano
     * attorno al disclosure «Altro», che non esiste più: il laboratorio segue il template, o smette
     * di mostrare la app vera senza dirlo a nessuno.
     * ⛔ Il gruppo «Strumenti» si apre qui: nel prodotto nasce chiuso per non schiacciare le
     *   sessioni, ma la vetrina dei componenti esiste per far VEDERE le voci.
     */
    const lavoro = document.getElementById('gruppoLavoro');
    const strumenti = document.getElementById('gruppoStrumenti');
    for (const finta of document.querySelectorAll('.td-sidebar-nav .talos-nav-item')) finta.remove();
    for (const luogo of SPAZI_DI_LAVORO) lavoro.append(creaNavItem(luogo, { conteggio: CONTEGGI[luogo.conteggio || luogo.vaia] }));
    for (const luogo of STRUMENTI) strumenti.append(creaNavItem(luogo, { conteggio: CONTEGGI[luogo.vaia] }));
    strumenti.hidden = false;
    document.getElementById('testataGruppoStrumenti')?.setAttribute('aria-expanded', 'true');
  },
  SessionItem() {
    const fissate = document.querySelector('.talos-sidebar__block:has(.talos-eyebrow[data-t="fissate"])');
    const sessioni = document.querySelector('.talos-sidebar__sessions');
    for (const finta of document.querySelectorAll('.talos-sidebar .talos-session-item')) finta.remove();
    for (const s of FISSATE) fissate.append(creaSessionItem(s, { adesso: ADESSO }));
    for (const s of SESSIONI) sessioni.append(creaSessionItem(s, { adesso: ADESSO, corrente: s.sessionId === CORRENTE }));
    const conto = sessioni.querySelector('.talos-sidebar__block-head .talos-nav-item__count');
    if (conto) conto.textContent = '69'; // il conteggio del mockup è dell'intero store, non delle righe mostrate
  },
};

if (componente && !LABORATORI[componente]) throw new Error(`componente di laboratorio sconosciuto: ${componente}`);
/* ⛔ 11/09 (L7): una pagina può essere ASINCRONA — il rapporto di una ricerca arriva da una
   promessa. `visualReady` si alza solo quando la pagina ha finito, o la foto coglierebbe il
   «Leggo il rapporto…» e nessuno capirebbe perché il pannello è vuoto. */
if (componente) {
  Promise.resolve(LABORATORI[componente]()).then(() => { document.documentElement.dataset.visualReady = 'true'; });
} else {
  document.documentElement.dataset.visualReady = 'true';
}
