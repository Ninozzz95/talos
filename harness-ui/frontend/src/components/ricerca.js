/** ReportRow del mockup: metadati GET /research. WAI Tabs/Disclosure, 05/09/2026. */
import {statoRicercaApprofondita,statoDellaVoce,articoloData} from './ricerca-dettaglio.js';
/*
 * ⛔ 11/09, lotto L7 — QUI NON C'E' PIU' UNA SECONDA TABELLA DI STATI.
 *   Ne esisteva una di cinque voci; la rotta adesso ne manda otto (i tre del cancello di consegna:
 *   `senza-rapporto`, `bloccata-dal-permesso`, `giri-esauriti`). Con due tabelle, questa riga
 *   avrebbe detto «Stato non registrato» proprio sui tre stati nati per dire la verità — e nessun
 *   test sarebbe diventato rosso. Le parole stanno in un posto solo, `ricerca-dettaglio.js`.
 */
/*
 * ⭐ BC-44 (12/09) — accetta la VOCE oltre alla stringa, e continua ad accettare la stringa.
 *   Motivo: «Interrotta dal fornitore» non si può dedurre da `stato` da solo — vuole
 *   `motivoErrore.transitorio`, che sta sulla voce. Con la sola stringa la riga dell'elenco
 *   direbbe «Non riuscita» e la scheda «Interrotta dal fornitore»: due parole per lo stesso
 *   oggetto sulla stessa schermata, cioè la crepa che la nota qui sopra esiste per impedire.
 * ⛔ La tabella resta UNA e resta in `ricerca-dettaglio.js`: qui si sceglie solo quale domanda
 *   porle.
 */
export function statoRicerca(voceOStato){
 const s=(voceOStato&&typeof voceOStato==='object')?statoDellaVoce(voceOStato):statoRicercaApprofondita(voceOStato);
 return {testo:s.parola,tono:s.tono};
}
export function testiRicerca(ricerca){
 /* ⛔ 11/09: la rotta manda `domanda`; fino a ieri mandava `titolo`. Si leggono ENTRAMBI, o il
    giorno del cambio tutta la cronologia diventa «Ricerca senza titolo» e nessun test se ne accorge. */
 const scritta=[ricerca?.domanda,ricerca?.titolo].find(v=>typeof v==='string'&&v.trim());
 const titolo=scritta?scritta.trim():'Ricerca senza titolo';
 const data=typeof ricerca?.avviataAlle==='string'?new Date(ricerca.avviataAlle):null,valida=data&&Number.isFinite(data.getTime());
 /* ⛔ «Avviata l'11/09», non «il 11»: l'articolo si elide davanti a otto e undici. La regola sta
    in `articoloData`, in un posto solo, e vale anche per le schede della sezione. */
 return {titolo,avviata:valida?data.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):null,dataBreve:valida?'Avviata '+articoloData(ricerca?.avviataAlle)+data.toLocaleDateString('it-IT'):'Data non registrata'};
}
export function riepilogoRicerche(ricerche){return ricerche.length+(ricerche.length===1?' ricerca elencata':' ricerche elencate');}
export function filtraRicerche(ricerche,{query='',stato='tutte'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return ricerche.filter(r=>(stato==='tutte'||r?.stato===stato)&&(!q||[testiRicerca(r).titolo,statoRicerca(r).testo].join(' ').toLocaleLowerCase('it').includes(q)));
}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
export function creaReportRow(ricerca,{document:doc=globalThis.document,aperta=false,onEspandi,onApriRapporto}={}){
 const t=testiRicerca(ricerca),stato=statoRicerca(ricerca);
 const riga=el(doc,'div','talos-list-row');riga.dataset.c='ReportRow';riga.dataset.researchId=ricerca?.id||'';riga.setAttribute('role','listitem');
 const icona=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-globe');svg.append(use);icona.append(svg);
 const testo=el(doc,'span','talos-list-row__text'),titolo=el(doc,'span','talos-list-row__title',t.titolo),sotto=el(doc,'span','talos-list-row__sub');titolo.title=t.titolo;testo.append(titolo,sotto);
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:''),stato.testo));
 /*
  * ⛔ 11/09, lotto L7 — il pulsante non è più `hidden` «in attesa della fase 3»: esiste quando c'è
  *   davvero un rapporto da aprire (`reportLibraryId`) e quando qualcuno sa dove portarci
  *   (`onApriRapporto`). Senza una delle due non compare: un bottone spento da diciotto giorni e
  *   un bottone che promette una schermata che non si apre sono lo stesso difetto.
  */
 const apri=el(doc,'button','talos-button talos-button--ghost talos-button--sm','Apri il rapporto');apri.type='button';
 apri.hidden=!(ricerca?.reportLibraryId&&typeof onApriRapporto==='function');
 apri.setAttribute('aria-label','Apri il rapporto di '+t.titolo);
 apri.addEventListener('click',()=>onApriRapporto?.(ricerca));
 const dettagli=el(doc,'button','talos-button talos-button--ghost talos-button--sm');dettagli.type='button';
 function mostra(){riga.dataset.aperta=String(aperta);sotto.textContent=aperta&&t.avviata?'Avviata '+articoloData(ricerca?.avviataAlle)+t.avviata:t.dataBreve;dettagli.textContent=aperta?'Chiudi':'Dettagli';dettagli.setAttribute('aria-expanded',String(aperta));dettagli.setAttribute('aria-label',(aperta?'Chiudi i dettagli di ':'Dettagli di ')+t.titolo);}
 dettagli.addEventListener('click',()=>{aperta=!aperta;mostra();onEspandi?.(aperta);});mostra();aside.append(apri,dettagli);riga.append(icona,testo,aside);return riga;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaRicerca(schermo,ricerche,opzioni={}){
 let pagina=PAGINE.get(schermo);
 if(!pagina){
  pagina={ricerche:[],opzioni:{},query:'',stato:'tutte',aperte:new Set()};PAGINE.set(schermo,pagina);
  const tabs=[...schermo.querySelectorAll('[data-research-stato]')];
  for(const tab of tabs){
   tab.addEventListener('click',()=>{pagina.stato=tab.dataset.researchStato;renderRicerca(schermo,pagina);});
   tab.addEventListener('keydown',e=>{if(!['Home','End','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(tab),scelta=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];scelta.click();scelta.focus();});
  }
  schermo.querySelector('[data-research-query]').addEventListener('input',e=>{pagina.query=e.target.value;renderRicerca(schermo,pagina);});
  schermo.querySelector('[data-research-refresh]').addEventListener('click',()=>pagina.opzioni.onAggiorna?.());
 }
 pagina.ricerche=ricerche;pagina.opzioni={...pagina.opzioni,...opzioni};renderRicerca(schermo,pagina);
}
function renderRicerca(schermo,pagina){
 const {ricerche,opzioni}=pagina,visibili=filtraRicerche(ricerche,pagina),doc=schermo.ownerDocument;
 for(const tab of schermo.querySelectorAll('[data-research-stato]')){const attivo=pagina.stato===tab.dataset.researchStato;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 schermo.querySelector('[data-research-refresh]').disabled=Boolean(opzioni.caricamento);
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?'Ricerche non disponibili':opzioni.caricamento?'Caricamento ricerche…':riepilogoRicerche(ricerche);
 const esito=schermo.querySelector('[data-research-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?'Caricamento ricerche…':visibili.length===ricerche.length?riepilogoRicerche(ricerche):visibili.length+' di '+ricerche.length+' ricerche elencate');esito.setAttribute('role',opzioni.errore?'alert':'status');
 const lista=schermo.querySelector('[data-research-list]'),attivo=doc.activeElement?.closest('[data-research-id]')?.dataset.researchId;lista.setAttribute('role',visibili.length?'list':'group');
 lista.replaceChildren(...visibili.map(r=>creaReportRow(r,{document:doc,aperta:pagina.aperte.has(r.id),onEspandi:aperta=>{if(aperta)pagina.aperte.add(r.id);else pagina.aperte.delete(r.id);}})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?'Caricamento ricerche…':ricerche.length?'Nessuna ricerca corrisponde ai filtri.':'Nessuna ricerca avviata in questo progetto.')));
 if(attivo)[...lista.querySelectorAll('[data-research-id]')].find(n=>n.dataset.researchId===attivo)?.querySelector('button:not([hidden])')?.focus({preventScroll:true});
}
