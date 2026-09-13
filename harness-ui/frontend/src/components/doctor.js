import { plurale } from './plurale.js'; // BH-12: «1 ricordi» — il plurale vive in un posto solo
// 05/9 Fase 2: Doctor; il grado di certezza segue il dato, non la sua presenza.
const GRAVITA={danger:'Guasto',warning:'Avviso',info:'Nota',success:'OK'};
const ORDINE={danger:0,warning:1,info:2,success:3};
const oggetto=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const testo=v=>typeof v==='string'?v:'';
function valida(r){
 const errore=()=>{throw new Error('La risposta della diagnosi non è valida.');};
 if(!oggetto(r)||!['chiaveApi','git','naviga'].every(k=>typeof r[k]==='boolean')||!['desktop','wsl2','none'].includes(r.shell))errore();
 const tipi={labs:{accesi:'array'},ricercaWeb:{fonte:'string',pronta:'boolean'},cartelleProgetto:{disponibili:'boolean',conteggio:'number'},providers:{storeAvailable:'boolean',items:'array'},ownerRuntime:{configurato:'boolean',pronto:'boolean'},catalogoTask:{disponibile:'boolean'},sessioniPersistenza:{corrotte:'array'}};
 for(const [k,shape] of Object.entries(tipi)){if(!(k in r))continue;if(!oggetto(r[k]))errore();for(const [f,t] of Object.entries(shape)){const v=r[k][f];if(t==='array'?!Array.isArray(v):typeof v!==t||(t==='number'&&(!Number.isFinite(v)||v<0)))errore();}if('dettaglio' in r[k]&&typeof r[k].dettaglio!=='string')errore();}
 if(r.labs&&!r.labs.accesi.every(v=>typeof v==='string'))errore();
 if(r.providers&&!r.providers.items.every(p=>oggetto(p)&&typeof p.id==='string'&&typeof p.label==='string'&&typeof p.keyConfigured==='boolean'))errore();
 const s=r.sessioniPersistenza;if(s){if(!s.corrotte.every(v=>typeof v==='string'))errore();if('scartate'in s&&(!Array.isArray(s.scartate)||!s.scartate.every(v=>oggetto(v)&&typeof v.sessionId==='string'&&typeof v.motivo==='string'&&(!('dettaglio'in v)||typeof v.dettaglio==='string'))))errore();if('ultimaLettura'in s&&(!oggetto(s.ultimaLettura)||!['ripristinate','totali'].every(k=>Number.isInteger(s.ultimaLettura[k])&&s.ultimaLettura[k]>=0)))errore();}
}
export function controlliDoctor(r){
 valida(r);const c=[];const add=(id,titolo,gravita,...righe)=>c.push({id,titolo,gravita,righe:righe.flat().filter(Boolean)});const ignoto=(id,titolo)=>add(id,titolo,'info','Non osservato: questa risposta non include il controllo.');
 add('chiave','Chiave API',r.chiaveApi?'info':'warning',r.chiaveApi?'Configurata. La validità presso il fornitore non è verificata da questo controllo.':'Chiave API non configurata. Verifica il fornitore scelto nelle impostazioni.');
 add('shell','Ambiente dei comandi',r.shell==='none'?'danger':r.shell==='wsl2'?'success':'info',r.shell==='none'?'Nessun ambiente disponibile.':r.shell==='wsl2'?'Comando diagnostico eseguito in WSL2.':'Comando diagnostico eseguito nell’ambiente desktop; questo controllo non attesta l’isolamento WSL2.');
 add('git','Git',r.git?'success':'warning',r.git?'Il comando git --version è terminato correttamente.':'Git non trovato o controllo del comando fallito.');
 add('browser','Navigazione web',r.naviga?'info':'warning',r.naviga?'Attrezzo disponibile. Questo controllo non apre una pagina e non verifica la connessione.':'Attrezzo di navigazione non disponibile.');
 if(r.ownerRuntime)add('runtime','Servizio agente',r.ownerRuntime.pronto?'success':'warning',r.ownerRuntime.configurato?'Configurato.':'Non configurato.',r.ownerRuntime.dettaglio|| (r.ownerRuntime.pronto?'Pronto secondo il servizio.':'Il servizio non è pronto.'));else ignoto('runtime','Servizio agente');
 if(r.catalogoTask)add('catalogo','Attività predefinite',r.catalogoTask.disponibile?'success':'warning',r.catalogoTask.dettaglio||(r.catalogoTask.disponibile?'Catalogo disponibile.':'Catalogo non disponibile.'));else ignoto('catalogo','Attività predefinite');
 if(r.cartelleProgetto)add('cartelle','Cartelle di progetto',r.cartelleProgetto.disponibili?'success':'warning',r.cartelleProgetto.conteggio+' cartelle consentite.',r.cartelleProgetto.dettaglio);else ignoto('cartelle','Cartelle di progetto');
 if(r.ricercaWeb)add('ricerca','Ricerca web',r.ricercaWeb.pronta||r.ricercaWeb.fonte==='off'?'info':'warning',r.ricercaWeb.etichetta||r.ricercaWeb.fonte,r.ricercaWeb.dettaglio,'Stato della configurazione; nessuna ricerca viene eseguita qui.');else ignoto('ricerca','Ricerca web');
 if(r.providers)add('fornitori','Fornitori e portachiavi',r.providers.storeAvailable?'info':'warning',r.providers.storeAvailable?'Portachiavi disponibile.':'Portachiavi non disponibile.',r.providers.items.map(p=>p.label+': '+(p.keyConfigured?'chiave configurata':p.requiresKey===false?'chiave facoltativa':'chiave assente')+(testo(p.execution)?' · '+p.execution: '')), 'La configurazione non conferma una chiamata al modello.');else ignoto('fornitori','Fornitori e portachiavi');
 if(r.labs)add('labs','Funzioni sperimentali','info',r.labs.dettaglio||('Attive: '+(r.labs.accesi.join(', ')||'nessuna')+'.'));else ignoto('labs','Funzioni sperimentali');
 if(r.sessioniPersistenza){const s=r.sessioniPersistenza,scarti=s.scartate||[],nonElencate=s.corrotte.filter(id=>!scarti.some(v=>v.sessionId===id));add('sessioni','Ripristino delle sessioni',s.corrotte.length||scarti.some(v=>['corrotta','lettura-fallita'].includes(v.motivo))?'danger':scarti.length?'warning':'success',s.dettaglio||(s.ultimaLettura?s.ultimaLettura.ripristinate+' ripristinate su '+s.ultimaLettura.totali+'.':'Numero delle sessioni ripristinate non osservato.'),scarti.map(v=>v.sessionId+' · '+v.motivo+(v.dettaglio?' · '+v.dettaglio:'')),nonElencate.map(id=>id+' · corrotta'));}else ignoto('sessioni','Ripristino delle sessioni');
 return c.sort((a,b)=>ORDINE[a.gravita]-ORDINE[b.gravita]);
}
export function contaGravitaDoctor(voci){const n={success:0,info:0,warning:0,danger:0};for(const v of voci)n[v.gravita]++;return n;}
function nodo(doc,tag,classe,valore){const e=doc.createElement(tag);if(classe)e.className=classe;if(valore!==undefined)e.textContent=valore;return e;}
export function creaCheckCard(voce,opzioni={}){const d=opzioni.document||globalThis.document;const card=nodo(d,'div','talos-card talos-check-card'+(voce.gravita==='success'?'':' talos-check-card--'+voce.gravita));card.dataset.c='CheckCard';card.dataset.doctorId=voce.id;const stripe=nodo(d,'span','talos-check-card__stripe');stripe.setAttribute('aria-hidden','true');const body=nodo(d,'div','talos-check-card__body');const title=nodo(d,'div','talos-check-card__title',GRAVITA[voce.gravita]+' · '+voce.titolo);body.append(title,...voce.righe.map(r=>nodo(d,'p','',r)));card.append(stripe,body);return card;}
const schermi=new WeakMap();
export function aggiornaDoctor(s,risultato,opzioni={}){
 let st=schermi.get(s);if(!st){st={};schermi.set(s,st);s.querySelector('[data-doctor-refresh]').addEventListener('click',()=>st.opzioni.onRicontrolla?.());s.querySelector('[data-doctor-export]').addEventListener('click',()=>{if(st.risultato&&!st.opzioni.caricamento)st.opzioni.onEsporta?.();});}st.opzioni=opzioni;st.risultato=risultato;
 const loading=!!opzioni.caricamento,errore=opzioni.errore||'',voci=risultato?controlliDoctor(risultato):[],n=contaGravitaDoctor(voci);const q=sel=>s.querySelector(sel);
 q('[data-doctor-refresh]').disabled=loading;q('[data-doctor-refresh]').textContent=loading?'Controllo…':'Ricontrolla';q('[data-doctor-export]').disabled=!risultato||loading;
 q('[data-doctor-tempo]').textContent=opzioni.ricevutoAlle?'Ricevuto '+new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}).format(new Date(opzioni.ricevutoAlle)):'Controllo non eseguito';
 q('[data-doctor-esito]').textContent=loading?'Controllo in corso…':risultato?plurale(voci.length,'controllo')+' · '+(n.warning+n.danger)+' da rivedere'+(errore?' · ultimo risultato conservato.':'.'):'Nessun risultato disponibile.';
 q('[data-doctor-errore]').textContent=errore;q('[data-doctor-errore]').hidden=!errore;q('[data-doctor-counts]').hidden=!risultato;
 for(const [k,v] of Object.entries(n))q('[data-doctor-count='+k+']').textContent=String(v);
 const lista=q('[data-doctor-list]');lista.setAttribute('aria-busy',String(loading));lista.replaceChildren(...voci.map(v=>creaCheckCard(v,{document:s.ownerDocument})));
}
