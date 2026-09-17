import {extendCatalog} from './catalog-data.mjs';
import {emptyCatalogFilters,validateSavedViews} from './catalog-engine.mjs';
/** Dominio del prototipo. Nessuna API, credenziale o preferenza del prodotto. */
export const STORAGE_KEY = 'talos.calm-lab.prototype.v3';
export const DEFAULT_PREFS = Object.freeze({mode:'dark',density:'comfortable',motion:true,resume:true,textSize:16});
export const DEMO_MODELS = Object.freeze(extendCatalog([
 {id:'local:qwen8',name:'Qwen3 8B',family:'Qwen',glyph:'qwen',destination:'local',provider:'llama.cpp',size:5.2,context:32768,required:8.1,fit:'compatible',installed:true,tasks:['general','code'],description:'Un modello locale per esplorare il flusso quotidiano: scegliere, verificare e poi usare.',license:'Apache 2.0',file:'Qwen3-8B-Q4_K_M.gguf',tools:null},
 {id:'local:gemma',name:'Gemma 3 12B',family:'Google',glyph:'gemma',destination:'local',provider:'llama.cpp',size:8.1,context:131072,required:17.8,fit:'compatible',installed:true,tasks:['write','general'],description:'Un secondo modello locale, per valutare una scelta diversa senza perdere il contesto.',license:'Gemma',file:'gemma-3-12b-Q4_K_M.gguf',tools:null},
 {id:'local:qwen32',name:'Qwen3 32B',family:'Qwen',glyph:'qwen',destination:'local',provider:'llama.cpp',size:19.8,context:32768,required:23.9,fit:'incompatible',installed:false,tasks:['code','general'],description:'Lo scenario con memoria insufficiente rende visibile il limite prima di un’azione.',license:'Apache 2.0',file:'Qwen3-32B-Q4_K_M.gguf',tools:null},
 {id:'openrouter:aion2',name:'Aion-2.0',family:'AionLabs',glyph:'cloud',destination:'cloud',provider:'OpenRouter',size:null,context:131072,required:null,fit:'unknown',installed:false,tasks:['write'],description:'Una voce cloud del catalogo di esempio. La selezione richiede una conferma esplicita della destinazione dei dati.',license:'Da verificare',file:null,tools:true},
 {id:'openrouter:aionmini',name:'Aion-3.0 Mini',family:'AionLabs',glyph:'cloud',destination:'cloud',provider:'OpenRouter',size:null,context:131072,required:null,fit:'unknown',installed:false,tasks:['write','general'],description:'Un’alternativa cloud. Prezzi e disponibilità correnti non sono verificati da questo prototipo.',license:'Da verificare',file:null,tools:true},
]));
export const SETTINGS_INDEX = Object.freeze([
 {label:'Modalità colore',section:'appearance',target:'color-mode',hint:'Aspetto e movimento',keywords:'tema scuro chiaro sistema dark light colori'},
 {label:'Densità delle liste',section:'appearance',target:'density',hint:'Aspetto e movimento',keywords:'compatta comoda confortevole spazio densita'},
 {label:'Movimento dell’interfaccia',section:'appearance',target:'motion',hint:'Aspetto e movimento',keywords:'animazioni riduci movimento transizioni accessibilita'},
 {label:'Dimensione del testo',section:'appearance',target:'text-size',hint:'Aspetto e movimento',keywords:'font caratteri testo grande piccolo dimensione interfaccia'},
 {label:'Riprendi il workspace all’avvio',section:'appearance',target:'resume',hint:'Aspetto e movimento · Avanzate',keywords:'avvio ultimo spazio sessione startup'},
 {label:'Laboratorio modelli',section:'models',target:'model-query',hint:'Intelligenza · Modelli',keywords:'llm modello catalogo api installati locale cloud hugging face'},
 {label:'Provider e accessi',section:'models',tab:'providers',target:'providers-title',hint:'Laboratorio · Provider',keywords:'chiave api key credenziali fornitore collegamento accesso'},
 {label:'Download',section:'models',tab:'downloads',target:'downloads-title',hint:'Laboratorio · Download',keywords:'scarica coda pausa riprendi installazione'},
 {label:'Memoria e runtime',section:'models',tab:'system',target:'system-title',hint:'Laboratorio · Sistema',keywords:'ram gpu vram hardware memoria modello motore diagnostica spazio disco'},
]);
export function normalize(value) {return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').trim();}
export function searchSettings(query) {const terms=normalize(query).split(/\s+/).filter(Boolean);return SETTINGS_INDEX.filter(x=>terms.every(t=>normalize(`${x.label} ${x.hint} ${x.keywords}`).includes(t)));}
export function filterModels(models,{query='',filter='all',task='all',favorites=[]}={}) {
 const terms=normalize(query).split(/\s+/).filter(Boolean);
 return models.filter(m=>terms.every(t=>normalize(`${m.name} ${m.family} ${m.provider} ${m.file||''}`).includes(t)) && (filter==='all'||filter===m.destination||(filter==='installed'&&m.installed)||(filter==='favorites'&&favorites.includes(m.id))) && (task==='all'||m.tasks.includes(task)));
}
export function validatePrefs(raw) {
 if (!raw || typeof raw!=='object' || Array.isArray(raw)) return {...DEFAULT_PREFS};
 return {mode:['dark','light','system'].includes(raw.mode)?raw.mode:DEFAULT_PREFS.mode,density:['comfortable','compact'].includes(raw.density)?raw.density:DEFAULT_PREFS.density,motion:typeof raw.motion==='boolean'?raw.motion:DEFAULT_PREFS.motion,resume:typeof raw.resume==='boolean'?raw.resume:DEFAULT_PREFS.resume,textSize:[14,16,18].includes(raw.textSize)?raw.textSize:DEFAULT_PREFS.textSize};
}
export function loadSnapshot(storage) {
 try {const saved=JSON.parse(storage.getItem(STORAGE_KEY)||'null');if(!saved || saved.version!==1)return {prefs:validatePrefs(null),favorites:['local:qwen8'],defaultId:'local:qwen8'};
 return {prefs:validatePrefs(saved.prefs),favorites:Array.isArray(saved.favorites)?[...new Set(saved.favorites.filter(id=>DEMO_MODELS.some(m=>m.id===id)))]:[],savedViews:validateSavedViews(saved.savedViews),defaultId:DEMO_MODELS.some(m=>m.id===saved.defaultId)?saved.defaultId:'local:qwen8'};
 } catch {return {prefs:validatePrefs(null),favorites:['local:qwen8'],defaultId:'local:qwen8'};}
}
export function saveSnapshot(storage,state) {
 try {storage.setItem(STORAGE_KEY,JSON.stringify({version:1,savedViews:validateSavedViews(state.savedViews),prefs:validatePrefs(state.prefs),favorites:state.favorites.filter(id=>DEMO_MODELS.some(m=>m.id===id)),defaultId:state.defaultId}));return true;}catch{return false;}
}
export function createState(snapshot) {return {...snapshot,savedViews:validateSavedViews(snapshot.savedViews),catalogFilters:emptyCatalogFilters(),filtersOpen:false,section:'models',tab:'models',filter:'all',task:'all',query:'',selectedId:null,detailId:null,detailTab:'card',cardStatus:'ready',catalogReturn:null,detailScroll:{},compare:[],scenario:'ready',models:structuredClone(DEMO_MODELS),downloads:[],providerStatus:'connected',advanced:false,saveStatus:'local',probe:'idle',demoRun:'idle',prompt:'Descrivi un piano in tre passi per riorganizzare un progetto.',temperature:0.7,contextSize:8192};}
export function availability(model,state) {
 if(state.scenario==='offline'&&model.destination==='cloud')return {label:'Non raggiungibile',tone:'warning',usable:false,reason:'La rete dello scenario è assente. Nessun passaggio automatico al locale.'};
 if(model.destination==='cloud'&&state.providerStatus!=='connected')return {label:'Accesso da verificare',tone:'warning',usable:false,reason:'Verifica prima il provider. Una credenziale presente non prova il collegamento.'};
 if(model.destination==='cloud')return {label:'Disponibile',tone:'success',usable:true,reason:'Disponibilità simulata, non verificata con il servizio.'};
 if(model.destination==='local'&&(!model.file||!model.format))return {label:'Profilo incompleto',tone:'warning',usable:false,reason:'Formato o file non noto. Non è possibile preparare questo profilo.'};
 if(!model.installed)return {label:'Da scaricare',tone:'muted',usable:false,reason:'Il modello non è installato nello scenario.'};
 if(state.scenario==='error')return {label:'Runtime non raggiunto',tone:'danger',usable:false,reason:'Il runtime locale dello scenario non risponde.'};
 if(model.fit==='unknown')return {label:'Compatibilità da verificare',tone:'warning',usable:false,reason:'Una stima mancante non prova la compatibilità.'};
 if(model.fit==='incompatible')return {label:'RAM insufficiente',tone:'warning',usable:false,reason:'La stima di esempio supera il budget RAM dello scenario.'};
 return {label:'Sul dispositivo',tone:'success',usable:true,reason:'Installato nello scenario. La stima non garantisce l’esecuzione reale.'};
}
export function updateDownload(job,action) {
 const next={...job};
 if(action==='pause'&&job.status==='running')next.status='paused';
 if(action==='resume'&&['paused','error'].includes(job.status))next.status='running';
 if(action==='cancel'&&!['completed','cancelled'].includes(job.status))next.status='cancelled';
 if(action==='tick'&&job.status==='running'){next.progress=Math.min(100,job.progress+8);if(next.progress===100)next.status='completed';}
 return next;
}
export function escapeHTML(value) {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function fmt(value) {return new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(value);}

export function fmtPrice(value){return value===null||value===undefined?'Non noto':new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:6}).format(value);}
