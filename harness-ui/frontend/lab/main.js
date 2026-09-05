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
import { LIBRERIA } from './fixtures/libreria.js';
import { aggiornaPaginaAttivita } from '../src/components/attivita.js';
import { ATTIVITA } from './fixtures/attivita.js';
import { aggiornaPaginaMemoria } from '../src/components/memoria.js';
import { MEMORIE } from './fixtures/memoria.js';
import { aggiornaBoard } from '../src/components/board.js';
import { ADESSO_BOARD, SESSIONI_BOARD, METRICHE_BOARD, CARTELLE_BOARD } from './fixtures/board.js';
import template from '../index.template.html';
import { creaApprovazione, creaArtefatto, creaAttesa, creaAttivita, creaAzioniMessaggio, creaFallimentoAttrezzo, creaFileToccati, creaMessaggioTalos, creaMessaggioUtente, creaNotaSistema, creaRicevuta, creaRigaAttrezzo, creaTurno } from '../src/components/conversazione.js';
import { aggiornaPiedeChat } from '../src/components/chat-foot.js';
import { aggiornaDiffReview, creaRigaFileReview, riassuntoReview } from '../src/components/review.js';
import { creaStatoVuoto } from '../src/components/stato-vuoto.js';
import { REVIEW } from './fixtures/review.js';
import { VUOTA } from './fixtures/vuota.js';
import { LUOGHI, LUOGHI_ALTRI, creaNavItem } from '../src/components/nav-item.js';
import { CONVERSAZIONE } from './fixtures/conversazione.js';
import { PIEDE } from './fixtures/piede.js';
import { TOAST } from './fixtures/toast.js';
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

const componente = new URLSearchParams(location.search).get('componente') || '';

const LABORATORI = {
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
  LibraryRow() { aggiornaPaginaLibreria(document.querySelector('#schermoLibreria'), LIBRERIA); },
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
  Toast() {
    const regione = document.querySelector('#regioneToast');
    regione.replaceChildren(...TOAST.map((t) => creaToast(t).scheda));
    regione.hidden = false;
  },
  ChatFooter() {
    /* Prima si svuota ciò che il mockup scrive a mano, poi il componente lo riscrive dai dati. */
    const piede = document.querySelector('#schermoChat .talos-chat-foot');
    for (const el of piede.querySelectorAll('[data-run-what], [data-run-meta], .talos-chip__label, [data-runtime-giri] .talos-mono, [data-runtime-costo] .talos-mono, .talos-statusbar span')) el.textContent = '';
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
    /* Le voci dei Luoghi rifatte dal componente: le prime cinque prima di «Altro», le altre dentro #luoghiAltri. */
    const altro = document.getElementById('altroLuoghi');
    const altri = document.getElementById('luoghiAltri');
    for (const finta of document.querySelectorAll('.talos-sidebar .talos-nav-item:not(#altroLuoghi)')) finta.remove();
    for (const luogo of LUOGHI) altro.before(creaNavItem(luogo, { conteggio: CONTEGGI[luogo.vaia] }));
    for (const luogo of LUOGHI_ALTRI) altri.append(creaNavItem(luogo, { conteggio: CONTEGGI[luogo.vaia || luogo.conteggio] }));
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
if (componente) LABORATORI[componente]();
document.documentElement.dataset.visualReady = 'true';
