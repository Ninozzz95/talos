/** CP10 — Motore puro: nessun DOM, rete o inferenza. Le dimensioni dei file sono GiB. */
export const SIZE_BANDS = Object.freeze([
 {id:'tiny',label:'Fino a 3B',min:0,max:3},
 {id:'small',label:'Oltre 3–8B',min:3,max:8},
 {id:'medium',label:'Oltre 8–14B',min:8,max:14},
 {id:'large',label:'Oltre 14–35B',min:14,max:35},
 {id:'xl',label:'Oltre 35–70B',min:35,max:70},
 {id:'xxl',label:'Oltre 70B',min:70,max:Infinity},
 {id:'unknown',label:'Parametri non noti'},
]);
export const FACET_OPTIONS = Object.freeze({
 destination:[['local','Locali'],['cloud','Cloud']],status:[['installed','Installati'],['not-installed','Da scaricare'],['downloading','In download']],
 fit:[['fits','Entro 18,6 GiB · stima'],['exceeds','Oltre il budget demo'],['unknown','RAM non stimata']],
 tasks:[['general','Quotidiano'],['code','Sviluppo'],['write','Scrittura'],['embedding','Embedding']],
 capabilities:[['tools','Strumenti / function calling'],['vision','Immagini in ingresso'],['reasoning','Ragionamento'],['json','Output JSON'],['audio','Audio']],
 formats:[['GGUF','GGUF'],['safetensors','Safetensors'],['unknown','Formato non noto']],
 quant:[['Q4_K_M','Q4_K_M'],['Q5_K_M','Q5_K_M'],['Q8_0','Q8_0'],['F16','F16'],['unknown','Quantizzazione non nota']],
 languages:[['it','Italiano'],['en','Inglese'],['multi','Multilingue dichiarato'],['unknown','Lingua non nota']],
 access:[['open','Senza richiesta di accesso'],['approval','Accettazione / autorizzazione'],['account','Account provider'],['unknown','Accesso da verificare']],
 arch:[['dense','Dense'],['moe','Mixture of Experts'],['unknown','Architettura non nota']],
});
export const CATALOG_SORTS = Object.freeze([['catalog','Ordine del catalogo'],['params-asc','Parametri: meno → più'],['params-desc','Parametri: più → meno'],['file-asc','File: più leggeri'],['ram-asc','Stima RAM: crescente'],['context-desc','Contesto: maggiore'],['updated-desc','Aggiornati di recente · demo'],['name','Nome A–Z'],['price-asc','Costo input: crescente · demo']]);
export function emptyCatalogFilters(){return {destination:[],status:[],favorite:false,sizes:[],minParams:'',maxParams:'',basis:'total',minContext:'',maxFile:'',maxRam:'',fit:[],tasks:[],capabilities:[],formats:[],quant:[],authors:[],providers:[],licenses:[],languages:[],access:[],arch:[],maxInput:'',maxOutput:'',includeUnknown:false,sort:'catalog'};}
const CF_ARRAYS=['destination','status','sizes','fit','tasks','capabilities','formats','quant','authors','providers','licenses','languages','access','arch'];
const CF_NUMBERS=['minParams','maxParams','minContext','maxFile','maxRam','maxInput','maxOutput'];
const cfNormalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').trim();
const cfKnown=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function validateCatalogFilters(raw){
 const f=emptyCatalogFilters();if(!raw||typeof raw!=='object'||Array.isArray(raw))return f;
 for(const key of CF_ARRAYS){if(!Array.isArray(raw[key]))continue;const allowed=key==='sizes'?SIZE_BANDS.map(x=>x.id):FACET_OPTIONS[key]?.map(x=>x[0]);f[key]=[...new Set(raw[key].filter(x=>typeof x==='string'&&x.length>0&&x.length<=100&&(!allowed||allowed.includes(x))))].slice(0,24);}
 for(const key of CF_NUMBERS){if(raw[key]!==''&&raw[key]!==null&&raw[key]!==undefined){const n=Number(raw[key]);if(Number.isFinite(n)&&n>=0&&n<=1e9)f[key]=String(n);}}
 f.basis=raw.basis==='active'?'active':'total';f.favorite=raw.favorite===true;f.includeUnknown=raw.includeUnknown===true;
 f.sort=CATALOG_SORTS.some(([v])=>v===raw.sort)?raw.sort:'catalog';return f;
}
export function catalogInputErrors(raw){const f=validateCatalogFilters(raw);const errors=[];if(f.minParams!==''&&f.maxParams!==''&&Number(f.minParams)>Number(f.maxParams))errors.push('Il minimo di parametri supera il massimo.');return errors;}
export function parameterValue(m,basis='total'){if(basis==='active'){if(m.architecture==='moe')return cfKnown(m.activeParametersB)?m.activeParametersB:null;if(m.architecture!=='dense')return null;}return cfKnown(m.parametersB)?m.parametersB:null;}
function cfRange(value,min,max,unknown){if(!cfKnown(value))return unknown;return (min===''||value>=Number(min))&&(max===''||value<=Number(max));}
function cfValues(value){return value===null||value===undefined||value===''?['unknown']:Array.isArray(value)?(value.length?value:['none']):[value];}
function cfAny(selected,value){return !selected.length||selected.some(x=>cfValues(value).includes(x));}
export function catalogArtifacts(m){if(Array.isArray(m.artifacts))return m.artifacts;return m.destination==='local'?[{id:m.id+':profile',file:m.file,format:m.format,quantization:m.quantization,size:m.size,required:m.required}]:[];}
export function matchingArtifacts(m,raw){const f=validateCatalogFilters(raw);return catalogArtifacts(m).filter(a=>
 cfAny(f.formats,a.format)&&cfAny(f.quant,a.quantization)&&
 (f.maxFile===''||cfRange(a.size,'',f.maxFile,f.includeUnknown))&&
 (f.maxRam===''||cfRange(a.required,'',f.maxRam,f.includeUnknown))&&
 (!f.fit.length||f.fit.includes(cfKnown(a.required)?a.required<=18.6?'fits':'exceeds':'unknown')));
}
export function modelMatchesCatalog(m,raw,{query='',favorites=[],downloads=[]}={}){
 const f=validateCatalogFilters(raw);if(catalogInputErrors(f).length)return false;
 const terms=cfNormalize(query).split(/\s+/).filter(Boolean);
 if(!terms.every(t=>cfNormalize(`${m.name} ${m.family} ${m.author||''} ${m.provider} ${m.repo||''} ${m.file||''}`).includes(t)))return false;
 if(!cfAny(f.destination,m.destination)||!cfAny(f.tasks,m.tasks)||!cfAny(f.authors,m.author)||!cfAny(f.providers,m.provider)||!cfAny(f.licenses,m.license)||!cfAny(f.languages,m.languages)||!cfAny(f.access,m.access)||!cfAny(f.arch,m.architecture))return false;
 if(f.favorite&&!favorites.includes(m.id))return false;
 if(f.status.length&&!f.status.some(x=>x==='installed'?m.installed:x==='not-installed'?m.destination==='local'&&!m.installed:x==='downloading'&&downloads.some(j=>j.modelId===m.id&&['running','paused','error'].includes(j.status))))return false;
 if(f.capabilities.length&&!f.capabilities.every(x=>Array.isArray(m.capabilities)&&m.capabilities.includes(x)))return false;
 const p=parameterValue(m,f.basis);
 if(f.sizes.length&&!f.sizes.some(id=>{const b=SIZE_BANDS.find(x=>x.id===id);return id==='unknown'?p===null:p!==null&&(p>b.min||(b.min===0&&p===0))&&p<=b.max;})){
  if(!(p===null&&f.includeUnknown))return false;
 }
 if((f.minParams!==''||f.maxParams!=='')&&!cfRange(p,f.minParams,f.maxParams,f.includeUnknown))return false;
 if(f.minContext!==''&&!cfRange(m.context,f.minContext,'',f.includeUnknown))return false;
 const artifactFilter=f.formats.length||f.quant.length||f.maxFile!==''||f.maxRam!==''||f.fit.length;
 // Il cloud non viene presentato come compatibile con la RAM locale, neppure includendo dati ignoti.
 if(artifactFilter&&(m.destination!=='local'||!matchingArtifacts(m,f).length))return false;
 const priceFilter=f.maxInput!==''||f.maxOutput!=='';
 if(priceFilter&&(m.destination!=='cloud'||(f.maxInput!==''&&!cfRange(m.priceInput,'',f.maxInput,f.includeUnknown))||(f.maxOutput!==''&&!cfRange(m.priceOutput,'',f.maxOutput,f.includeUnknown))))return false;
 return true;
}
export function selectCatalog(models,raw,context={}){
 const f=validateCatalogFilters(raw);const list=models.filter(m=>modelMatchesCatalog(m,f,context));
 const firstNumber=(m,key)=>{const values=matchingArtifacts(m,f).map(a=>a[key]).filter(cfKnown);return values.length?Math.min(...values):null;};
 const sorts={'params-asc':[m=>parameterValue(m,f.basis),1],'params-desc':[m=>parameterValue(m,f.basis),-1],'file-asc':[m=>firstNumber(m,'size'),1],'ram-asc':[m=>firstNumber(m,'required'),1],'context-desc':[m=>cfKnown(m.context)?m.context:null,-1],'updated-desc':[m=>m.updatedAt?Date.parse(m.updatedAt):null,-1],'price-asc':[m=>m.destination==='cloud'&&cfKnown(m.priceInput)?m.priceInput:null,1]};
 if(f.sort==='name')return list.sort((a,b)=>a.name.localeCompare(b.name,'it'));
 if(sorts[f.sort]){const [get,dir]=sorts[f.sort];return list.sort((a,b)=>{const av=get(a),bv=get(b);if(av===null||!Number.isFinite(av))return bv===null||!Number.isFinite(bv)?0:1;if(bv===null||!Number.isFinite(bv))return -1;return dir*(av-bv);});}
 return list;
}
export function facetCount(models,raw,key,value,context={}){
 const f=validateCatalogFilters(raw);if(key==='sizes'){f.minParams='';f.maxParams='';}
 if(key==='favorite')f.favorite=true;else if(key==='capabilities')f.capabilities=[...new Set([...f.capabilities,value])];else f[key]=Array.isArray(f[key])?[value]:value;
 return selectCatalog(models,f,context).length;
}
export function toggleCatalogFacet(raw,key,value){const f=validateCatalogFilters(raw);if(Array.isArray(f[key]))f[key]=f[key].includes(value)?f[key].filter(x=>x!==value):[...f[key],value];else if(typeof f[key]==='boolean')f[key]=!f[key];return validateCatalogFilters(f);}
const CF_NAMES={destination:'Destinazione',status:'Stato',favorite:'Preferiti',sizes:'Parametri',minParams:'Parametri min.',maxParams:'Parametri max.',minContext:'Contesto min.',maxFile:'File max.',maxRam:'RAM max.',fit:'Memoria',tasks:'Attività',capabilities:'Capacità',formats:'Formato',quant:'Quantizzazione',authors:'Autore',providers:'Provider',licenses:'Licenza',languages:'Lingua',access:'Accesso',arch:'Architettura',maxInput:'Input max.',maxOutput:'Output max.'};
export function activeCatalogFilters(raw){const f=validateCatalogFilters(raw);const chips=[];for(const [key,name]of Object.entries(CF_NAMES)){
 const v=f[key];if(Array.isArray(v))for(const value of v){const label=key==='sizes'?SIZE_BANDS.find(x=>x.id===value)?.label:FACET_OPTIONS[key]?.find(x=>x[0]===value)?.[1];chips.push({key,value,label:`${name}: ${label||value}`});}
 else if(v===true)chips.push({key,value:true,label:'Solo preferiti'});
 else if(typeof v!=='boolean'&&v!==''){const unit=key.includes('Params')?'B':['maxRam','maxFile'].includes(key)?' GiB':key==='minContext'?' token':' $/M';chips.push({key,value:v,label:`${name}: ${v}${unit}`});}
 }if(f.includeUnknown)chips.push({key:'includeUnknown',value:true,label:'Dati numerici non noti inclusi'});if(f.basis==='active')chips.push({key:'basis',value:'active',label:'Misura: parametri attivi (MoE)'});return chips;}
export function removeCatalogFilter(raw,key,value){const f=validateCatalogFilters(raw);if(key==='basis')f.basis='total';else if(Array.isArray(f[key]))f[key]=f[key].filter(x=>x!==value);else if(typeof f[key]==='boolean')f[key]=false;else if(key in CF_NAMES)f[key]='';return f;}
export function compactCatalogFilters(raw){const f=validateCatalogFilters(raw),d=emptyCatalogFilters();return Object.fromEntries(Object.entries(f).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(d[k])));}
export function validateSavedViews(raw){if(!Array.isArray(raw))return [];return raw.slice(0,12).filter(v=>v&&typeof v.name==='string'&&v.name.trim()).map((v,i)=>({id:'view-'+i,name:v.name.trim().slice(0,60),query:typeof v.query==='string'?v.query.slice(0,240):'',filters:validateCatalogFilters(v.filters)}));}
