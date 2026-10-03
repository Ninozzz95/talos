import { t, tn, linguaCorrenteDiT } from './lingua.js';
/* Numeri e date nella lingua dell'interfaccia (come fanno gli altri componenti): italiano → it-IT, inglese → en-US. */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
// RuntimeCard: stato del servizio separato dalla disponibilità e dalla RAM.
const nomi={ollama:'Ollama',lmstudio:'LM Studio','llama.cpp':'llama.cpp'};
/*
 * ⛔ NIENTE CODICI A SCHERMO — owner 04/09/2026: «mai `web_search`, `tool_create`… a schermo», e
 *   la mappa nome-tecnico → nome-umano sta in UN POSTO SOLO. Il posto è questo file, che è già il
 *   vocabolario del runtime (i nomi dei motori, le fasi dello stato, l'indirizzo).
 * ⛔ MISURATO, NON SUPPOSTO: la foto `lab-sistema_1440p_real.png` del 18/09/2026 mostrava
 *   «Dettaglio: RUNTIME_UNREACHABLE» sotto le carte di Ollama e LM Studio — il codice che il
 *   server usa come CONTRATTO, arrivato intatto fino allo schermo.
 * ⭐ LA RICERCA DICE LA STESSA COSA (18/09/2026): l'euristica 9 di Nielsen è «messaggi in lingua
 *   piana, NESSUN codice d'errore, che indichino il problema e suggeriscano una soluzione»
 *   (Heuristic Evaluation Workbook, `trepo.tuni.fi/…/JahnukainenOtto.pdf`); le linee guida SBMI
 *   dicono di evitare «obscure codes e.g. system crashed, error code 147»; e la regola pratica
 *   del 2026 è «tieni i codici nei LOG, non nella interfaccia; se un codice deve comparire —
 *   per il supporto — mettilo via come dettaglio secondario in piccolo» (Security Boulevard,
 *   luglio 2026).
 * ⛔ Le frasi sono QUELLE DEL SERVER (`src/public-problem.mjs`, campi `explanation` e `action`),
 *   non inventate: è lo stesso vocabolario letto di qua del muro. Se là cambiano, qui si riallinea.
 * ⛔ E il codice grezzo NON si butta: resta nel `title`, che è «il dettaglio secondario» ammesso.
 */
const DETTAGLI_RUNTIME={
 get RUNTIME_UNREACHABLE() { return t('modelli.runtime.unreachableDetail'); },
 get RUNTIME_NOT_AVAILABLE() { return t('modelli.runtime.unavailableDetail'); },
};
/** ⛔ Un CODICE NUDO si traduce; un MESSAGGIO si lascia com'è.
 *  `failureReason` non porta solo codici: il runtime compatibile con OpenAI ci scrive dentro il
 *  guasto vero («runtime ollama unreachable: connect ECONNREFUSED»). Sostituire quello con una
 *  frase generica sarebbe PERDERE l'informazione — cioè una regressione travestita da traduzione.
 *  Perciò si traduce solo ciò che ha la forma di un codice, e solo se è nella mappa. */
const codiceNudo=/^[A-Z][A-Z0-9_]{3,}$/;
export function dettaglioRuntime(grezzo){
 const tradotto=DETTAGLI_RUNTIME[grezzo];
 if(tradotto)return tradotto;
 if(codiceNudo.test(grezzo))return t('modelli.runtime.unexpectedResponse');
 return grezzo;
}
export function datiRuntimeModello(r={}){
 const raggiunto=r.state==='observed',models=Array.isArray(r.models)?r.models:[];
 const errore=r.modelsError||r.failureReason||'';
 const locale=r.runtimeId==='llama.cpp',fasi={unavailable:t('modelli.runtime.notStarted'),stopped:t('modelli.runtime.notStarted'),loading:t('modelli.runtime.loading'),stopping:t('modelli.runtime.stopping'),failed:t('modelli.runtime.startFailed')};
 const stato=raggiunto?(locale?(r.runtimeState==='ready'?t('modelli.runtime.reached'):fasi[r.runtimeState]||t('modelli.runtime.stateUnknown')):t('modelli.runtime.reached')):t('modelli.runtime.unreached');
 // R-03 (13/09): il motore locale in parole della persona — «scheda grafica (Vulkan) · nome» o
 // «processore»; l'avviso solo sullo stato REALE (un ripiego con la CPU poi fallita non dice
 // «gira»); la memoria esaurita non è un ripiego fatto, è una proposta da confermare nel menu.
 const m=locale&&r.motore&&typeof r.motore==='object'?r.motore:null;
 const dispositivi=Array.isArray(m?.dispositivi)?m.dispositivi.filter(Boolean):[];
 const motore=!m?'':m.variante==='vulkan'?t('modelli.runtime.gpuEngine')+(dispositivi.length?' · '+dispositivi.join(', '):''):m.variante==='cpu'?t('modelli.runtime.cpuEngine'):t('modelli.runtime.manualEngine');
 const pronto=r.runtimeState==='ready';
 const avvisoMotore=!m?'':(m.ripiego&&pronto)?t('modelli.runtime.cpuFallback'):(m.ripiego&&r.runtimeState==='failed')?t('modelli.runtime.cpuFallbackFailed'):(m.proposta?.a==='cpu')?t('modelli.runtime.cpuProposal'):'';
 const riprovaGrafica=Boolean(m?.ripiego&&pronto);
 return {nome:nomi[r.runtimeId]||r.runtimeId||t('modelli.runtime.unknownEngine'),stato,tono:raggiunto&&(!locale||r.runtimeState==='ready')&&!errore?'success':'warning',motore,avvisoMotore,riprovaGrafica,modelli:!raggiunto?t('modelli.runtime.availabilityUnverified'):r.modelsError?t('modelli.runtime.modelsReadFailed'):models.length?tn('modelli.runtime.oneModelAvailable', 'modelli.runtime.manyModelsAvailable', models.length):t('modelli.runtime.noModels'),nomi:raggiunto&&!r.modelsError?models.map(m=>m.name||m.id).filter(Boolean):[],caricamento:raggiunto&&r.runtimeId==='llama.cpp'?(r.runtimeState==='ready'?t('modelli.runtime.modelLoaded'):['stopped','unavailable'].includes(r.runtimeState)?t('modelli.runtime.noModelLoaded'):t('modelli.runtime.notDetected')):t('modelli.runtime.notDetected'),indirizzo:r.baseUrl||t('modelli.runtime.addressNotExposed'),data:typeof r.observedAt==='string'&&!Number.isNaN(Date.parse(r.observedAt))?new Date(r.observedAt).toLocaleString(localeUI(),{timeZone:'Europe/Rome'}):t('modelli.runtime.dateNotDetected'),errore};
}
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
export function creaRuntimeModello(runtime){
 const d=datiRuntimeModello(runtime),card=el('article','talos-card talos-card--pad talos-runtime-card');card.dataset.c='RuntimeCard';card.dataset.runtimeId=runtime.runtimeId||'';card.dataset.runtimeState=runtime.state||'unknown';
 const head=el('div','talos-cluster'),name=el('h3','talos-lab__heading',d.nome);name.dataset.runtimeName='';const badge=el('span','talos-badge talos-badge--sm talos-badge--'+d.tono,d.stato);badge.dataset.c='Badge';head.append(name,badge);card.append(head);
 const status=el('p','talos-muted',d.modelli);status.dataset.runtimeModels='';card.append(status);
 if(d.nomi.length){const list=el('ul','talos-runtime-card__models');for(const name of d.nomi)list.append(el('li','',name));card.append(list);}
 for(const [label,value,key]of [[t('modelli.runtime.loadingLabel'),d.caricamento,'loaded'],[t('modelli.runtime.addressLabel'),d.indirizzo,'address'],[t('modelli.runtime.checkLabel'),d.data,'date']]){const row=el('div','talos-kv'),v=el('span','talos-kv__v',value);v.dataset.runtimeValue=key;row.append(el('span','talos-kv__k',label),v);card.append(row);}
 if(d.motore){const row=el('div','talos-kv'),v=el('span','talos-kv__v',d.motore.replace(t('modelli.runtime.enginePrefix'), ''));v.dataset.runtimeValue='engine';row.append(el('span','talos-kv__k',t('modelli.runtime.localEngineLabel')),v);card.append(row);}
 if(d.avvisoMotore){const avviso=el('p','talos-muted talos-runtime-card__avviso',d.avvisoMotore);avviso.setAttribute('role','status');avviso.dataset.runtimeEngineNotice='';card.append(avviso);}
 if(d.riprovaGrafica){const riprova=el('button','talos-button talos-button--secondary talos-button--sm',t('modelli.runtime.retryGpu'));riprova.type='button';riprova.dataset.c='Button';riprova.dataset.runtimeRetryGpu='';riprova.addEventListener('click',()=>{riprova.disabled=true;card.dispatchEvent(new CustomEvent('talos:riprova-motore',{bubbles:true,detail:{runtimeId:runtime.runtimeId,modelId:runtime.modelId||null}}));});card.append(riprova);}
 if(d.errore){const error=el('p','talos-muted talos-runtime-card__error',t('modelli.runtime.errorDetail', { detail: dettaglioRuntime(d.errore) }));error.dataset.runtimeError='';error.title=d.errore;card.append(error);}return card;
}
export function aggiornaElencoRuntime(list,runtimes=[],{caricamento=false,errore=null}={}){
 if(!list)return;list.className='talos-runtime-list';list.setAttribute('aria-busy',String(caricamento));
 if(caricamento||errore||!runtimes.length){const empty=el('p','talos-muted',caricamento?t('modelli.runtime.checkingEngines'):errore?t('modelli.runtime.readFailed', { error: errore.message||errore }):t('modelli.runtime.noConfiguredEngines'));empty.dataset.c='EmptyState';if(errore)empty.setAttribute('role','alert');list.replaceChildren(empty);return;}
 list.replaceChildren(...runtimes.map(creaRuntimeModello));
}
export function montaPannelloRuntime(gate){
 if(!gate)return;gate.classList.add('talos-runtime-panel');
 gate.querySelector('h4')?.classList.add('talos-lab__heading');
 const status=gate.querySelector('#modelLabRuntimeStatus');if(status){status.className='talos-badge talos-badge--sm';status.dataset.c='Badge';status.setAttribute('role','status');}
 for(const control of gate.querySelectorAll('select,textarea')){const label=control.closest('label');if(label){label.className='talos-field talos-field--stack';label.htmlFor=control.id;label.querySelector('span')?.classList.add('talos-label');}control.className=control.tagName==='TEXTAREA'?'talos-textarea':'talos-select';}
 for(const button of gate.querySelectorAll('button')){button.className='talos-button talos-button--'+(button.id==='modelLabRunButton'?'primary':'secondary')+' talos-button--sm';button.dataset.c='Button';}
 const backend=gate.querySelector('#modelLabRuntimeSelect')?.closest('label')?.querySelector('span');if(backend)backend.textContent=t('modelli.runtime.engineLabel');
}
