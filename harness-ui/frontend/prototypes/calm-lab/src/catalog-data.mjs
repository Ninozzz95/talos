/** Fixture di ricerca, non caratteristiche aggiornate dei modelli omonimi. */
export function extendCatalog(base) {
 const existing = base.map((m,i)=>({...m,
  parametersB:[8.2,12,32.8,null,null][i],activeParametersB:null,architecture:i<3?'dense':null,
  author:m.family,repo:i===0?'Qwen/Qwen3-8B-GGUF':i===1?'google/gemma-3-12b-it':i===2?'Qwen/Qwen3-32B-GGUF':null,
  languages:i<3?['it','en','multi']:null,capabilities:i<3?null:['tools'],
  access:i===1?'approval':i<3?'open':'account',format:i<3?'GGUF':null,quantization:i<3?'Q4_K_M':null,
  priceInput:null,priceOutput:null,updatedAt:null,fixture:true,synthetic:false,
 }));
 // Modelli volutamente fittizi: esercitano le faccette senza inventare schede HF reali.
 const rows = [
  ['nano','Lumen 1B · demo',1,'Lumen','dense',null,1.1,2.4,8192,'Q8_0',['general','write'],['json'],['it','en'],'Apache 2.0','open'],
  ['small','Lumen 3B · demo',3,'Lumen','dense',null,2.1,4.5,32768,'Q4_K_M',['general','write'],['json','tools'],['it','en'],'Apache 2.0','open'],
  ['coder','Atlas Code 7B · demo',7,'Atlas','dense',null,4.6,7.3,32768,'Q5_K_M',['code'],['tools','json'],['en'],'MIT','open'],
  ['vision','Vela Vision 14B · demo',14,'Vela','dense',null,9.6,16.4,65536,'Q5_K_M',['general','write'],['vision','json'],['it','en','multi'],'Licenza personalizzata','approval'],
  ['moe','Atlas MoE 30B-A3B · demo',30,'Atlas','moe',3,18.3,25.4,131072,'Q4_K_M',['code','general'],['tools','reasoning','json'],['it','en','multi'],'Apache 2.0','open'],
  ['large','Atlas 70B · demo',70,'Atlas','dense',null,42.5,54.2,131072,'Q4_K_M',['general','code'],['tools','reasoning'],['en','multi'],'Licenza personalizzata','approval'],
  ['xl','Vela MoE 120B-A12B · demo',120,'Vela','moe',12,71.2,86.8,262144,'Q4_K_M',['general'],['tools','reasoning','vision'],['multi'],'Apache 2.0','open'],
  ['embed','Lumen Embed 0,6B · demo',0.6,'Lumen','dense',null,1.3,2.6,8192,'F16',['embedding'],[],['en'],'MIT','open'],
  ['unknown','Archivio senza metadati · demo',null,'Archivio',null,null,null,null,null,null,['general'],null,null,'Da verificare',null],
 ];
 const extra=rows.map(([id,name,parametersB,author,architecture,activeParametersB,size,required,context,quantization,tasks,capabilities,languages,license,access],i)=>({
  id:'fixture:'+id,name,parametersB,author,family:author,architecture,activeParametersB,size,required,context,quantization,tasks,capabilities,languages,license,access,
  destination:'local',provider:'llama.cpp',glyph:'qwen',installed:false,fit:required===null?'unknown':required<=18.6?'compatible':'incompatible',
  format:id==='unknown'?null:'GGUF',file:id==='unknown'?null:`${id}-${quantization}.gguf`,tools:capabilities===null?null:capabilities.includes('tools'),
  repo:null,description:'Modello fittizio per collaudare ricerca e filtri. Non è scaricabile da un repository reale.',
  priceInput:null,priceOutput:null,updatedAt:id==='unknown'?null:`2026-09-${String(5+i).padStart(2,'0')}`,fixture:true,synthetic:true,
 }));
 extra.push({id:'fixture:cloud',name:'Vela Cloud · demo',family:'Vela',author:'Vela',parametersB:null,activeParametersB:null,architecture:null,destination:'cloud',provider:'OpenRouter',glyph:'cloud',size:null,required:null,context:262144,fit:'unknown',installed:false,tasks:['general','write'],capabilities:['tools','vision','json'],languages:['it','en'],license:'Servizio cloud · demo',access:'account',file:null,format:null,quantization:null,tools:true,priceInput:0.25,priceOutput:1.2,updatedAt:'2026-09-12',fixture:true,synthetic:true,repo:null,description:'Servizio fittizio con prezzi di esempio in USD per milione di token. Nessun addebito o chiamata.'});
 return [...existing,...extra];
}
