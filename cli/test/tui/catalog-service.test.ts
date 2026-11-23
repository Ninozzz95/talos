import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';

function fixtureDeps(options:{providers?:string[];publicIds?:string[];onProbe?:(id:string)=>void;blockProbe?:boolean}={}):TuiCatalogDeps{
  const ids=options.providers??['openai','anthropic','gemini','ollama','deepseek'];
  const registry=Object.fromEntries(ids.map(id=>[id,{id,etichetta:id,destinazioneChat:true,descrizione:id,auth:{tipo:id==='ollama'?'keyless':'bearer'},chiaveObbligatoria:id!=='ollama'&&id!=='esterno',credenziale:id!=='ollama'&&id!=='esterno',wire:id==='ollama'?'locale':id==='esterno'?'acp':'openai-chat',esecuzione:id==='ollama'?'runtime locale':'collegato',cloud:false,modelliDiRiserva:[{id:'m1',nome:`${id} m1`,toolCalling:true}]}]));
  return{
    publicProviders:()=>(options.publicIds??ids).map(id=>({id,label:id,requiresKey:id!=='ollama',keyConfigured:id==='ollama',supportsEndpoint:true,supportsOAuth:false,execution:id==='ollama'?'locale':'collegato',endpoint:id==='ollama'?'http://127.0.0.1:11434':`https://${id}.invalid`})),
    registry,runtimeFor:()=>({}),keyFor:()=>null,setKey:()=>{},clearKey:()=>{},persistModel:async()=>{},
    createProbe:(signal?:AbortSignal)=>({
      prova:async(id:string)=>{options.onProbe?.(id);if(options.blockProbe)await new Promise<void>((resolve,reject)=>{if(signal?.aborted){reject(signal.reason??new DOMException('Aborted','AbortError'));return;}signal?.addEventListener('abort',()=>reject(signal.reason??new DOMException('Aborted','AbortError')),{once:true});});return{provider:id,esito:'collegato',motivo:'ok',millisecondi:1};},
      elencaModelli:async(id:string)=>({provider:id,fonte:'documentazione',modelli:[{id:`${id}:m1`,nome:`${id} m1`,provider:id,toolCalling:true,capacita:{toolCall:true,reasoning:null}}]})
    })
  };
}

test('providers come from chat registry even when keyless destinations are absent from credential-store public rows',async()=>{
  const ids=['openai','anthropic','gemini','ollama','deepseek','esterno'];
  const svc=createTuiCatalogService(fixtureDeps({providers:ids,publicIds:['openai','anthropic','gemini','deepseek','esterno']}));
  const rows=await svc.listProviders();
  for(const id of ids)assert.ok(rows.some(r=>r.id===id),`missing ${id}`);
  assert.equal(rows.find(r=>r.id==='ollama')?.local,true);
});

test('listModels without provider does not run provider probes',async()=>{
  let probes=0;
  const svc=createTuiCatalogService(fixtureDeps({onProbe:()=>{probes++;}}));
  const rows=await svc.listModels();
  assert.ok(rows.length>0);
  assert.equal(probes,0);
});

test('provider-specific refresh composes caller abort signal into fetch',async()=>{
  const controller=new AbortController();
  const svc=createTuiCatalogService(fixtureDeps({blockProbe:true}));
  const pending=svc.probeProvider('openai',controller.signal);
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
});

test('model selection persists only through project-user boundary and provider keys are write-only',async()=>{
  let selected='';let secret='';let cleared='';
  // B1 slice 25: the kernel's acceptance carries `credenzialeVerificata:true` (provider-probe.mjs:225-235), the only answer that saves.
  const deps=fixtureDeps();deps.createKeyProbe=()=>({prova:async(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:true,httpStatus:200})});deps.persistModel=async id=>{selected=id;};deps.setKey=(id,value)=>{secret=`${id}:${value}`;};deps.clearKey=id=>{cleared=id;};
  const svc=createTuiCatalogService(deps);
  await svc.selectModel('openai:gpt','project-user');await svc.setProviderKey('openai','sekret');await svc.clearProviderKey('openai');
  assert.equal(selected,'openai:gpt');assert.equal(secret,'openai:sekret');assert.equal(cleared,'openai');
});


test('providerModels tells the truth for a mixed live plus configured catalog',async()=>{
  const deps=fixtureDeps({providers:['openai']});
  (deps.registry.openai as any).modelliDiRiserva=[];
  deps.runtimeFor=()=>({modelli:[{id:'manual-model',nome:'Manual model'}]});
  deps.createProbe=()=>({
    prova:async()=>({provider:'openai',esito:'collegato',motivo:'ok',millisecondi:3}),
    // Successful direct-provider catalog: the kernel live boundary intentionally carries no `fonte`.
    elencaModelli:async()=>({
      provider:'openai',
      modelli:[{
        id:'openai:live-model',nome:'Live model',provider:'openai',
        capacita:{toolCall:true,reasoning:null},
        contextLength:64_000,
      }],
    }),
  });

  const list=await createTuiCatalogService(deps).providerModels('openai');
  const live=list.rows.find((row:any)=>row.id==='openai:live-model') as any;
  const configured=list.rows.find((row:any)=>row.id==='openai:manual-model') as any;

  assert.ok(live);
  assert.equal(live.source,'live');
  assert.equal(live.availabilityVerified,true);
  assert.equal(live.capabilityEvidence.toolCalling.source,'live');

  assert.ok(configured);
  assert.equal(configured.source,'configured');
  assert.equal(configured.availabilityVerified,false);
  assert.equal(configured.toolCalling,null);

  assert.equal(list.verified,false,'one configured-only extra prevents a globally verified list');
  assert.match(list.notice,/not verified|configured/i);
});


test('refresh keeps observed live capability evidence above registry documentation and uses docs only as fallback',async()=>{
  const deps=fixtureDeps({providers:['openai']});
  (deps.registry.openai as any).modelliDiRiserva=[];
  (deps.registry.openai as any).richiestaCompatibile={
    fonte:'https://docs.example.test/reasoning',data:'2026-09-12',
    modelli:{
      live:{livelliRagionamento:['high']},
      fill:{livelliRagionamento:['max']},
    },
  };
  deps.createProbe=()=>({
    prova:async()=>({provider:'openai',esito:'collegato'}),
    elencaModelli:async()=>({
      provider:'openai',
      modelli:[
        {id:'openai:live',nome:'Live',reasoning:{supportedEfforts:['low']}},
        {id:'openai:fill',nome:'Fill'},
      ],
    }),
  });

  const rows=await createTuiCatalogService(deps).listModels({provider:'openai',refresh:true});
  const live=rows.find((row:any)=>row.id==='openai:live') as any;
  const fill=rows.find((row:any)=>row.id==='openai:fill') as any;

  assert.equal(live.source,'live');
  assert.equal(live.availabilityVerified,true);
  assert.deepEqual(live.reasoningEfforts,['low']);
  assert.equal(live.capabilityEvidence.reasoningEfforts.source,'live');

  assert.equal(fill.source,'live','documented capability fallback does not downgrade live availability');
  assert.equal(fill.availabilityVerified,true);
  assert.deepEqual(fill.reasoningEfforts,['max']);
  assert.equal(fill.capabilityEvidence.reasoningEfforts.source,'documented');
  assert.equal(fill.capabilityEvidence.reasoningEfforts.evidenceUrl,'https://docs.example.test/reasoning');
});


test('provider probe transports canonical remediation and readiness code without re-deriving them',async()=>{
  const deps=fixtureDeps({providers:['openai']});
  const remediation={code:'replace-key',message:'OpenAI rejected the current credential. Replace or re-authorize the key.'};
  deps.controlPlane={
    list:()=>[],
    get:()=>{throw new Error('not used');},
    probe:async()=>({
      id:'openai',label:'OpenAI',description:'',auth:{required:true,type:'bearer',source:'saved',configured:true,usable:true,environmentVariable:null},
      endpoint:{value:'https://api.openai.com/v1',host:'api.openai.com',configured:false,supportsCustom:true,valid:true},
      execution:'collegato',runtimeConfigured:true,local:false,cloud:false,supportsOAuth:false,
      cooldown:{active:false,cause:null,until:null,keys:1},
      lastHealth:{state:'auth-failed',detail:'HTTP 401',latencyMs:12,observedAt:123,httpStatus:401},
      remediation,ready:false,
    }),
    invalidate:()=>{},
    readiness:()=>({ready:false,provider:'openai',code:'PROVIDER_AUTH_FAILED',message:remediation.message,remediation}),
  } as any;

  const result=await createTuiCatalogService(deps).probeProvider('openai');
  assert.equal(result.provider,'openai');
  assert.equal(result.state,'unavailable');
  assert.equal(result.latencyMs,12);
  assert.deepEqual(result.remediation,remediation,'catalog transport preserves the control-plane decision');
  assert.equal(result.readinessCode,'PROVIDER_AUTH_FAILED');
});

/*
 * Review of 13/10/2026 (bugfixer), findings 1 and 2: `listing` says, for a machine, what kind of list this is. The runtime's list
 * of models a sub-agent may be given (runtime/usable-models.ts) decides from it: a provider that cannot be read now and a provider
 * that has no live list at all answered with the same rows and differed only in the sentence.
 */
test('providerModels says what kind of list it is: live, known-only (no live list at all), unreachable',async()=>{
  const deps=fixtureDeps({providers:['openai']});
  assert.equal((await createTuiCatalogService(deps).providerModels('openai')).listing,'known-only','the provider answered from its documentation: it has no live list');
  deps.createProbe=()=>({prova:async()=>({}),elencaModelli:async()=>({provider:'openai',modelli:[{id:'openai:live-model',nome:'Live',provider:'openai'}]})});
  assert.equal((await createTuiCatalogService(deps).providerModels('openai')).listing,'live');
  deps.createProbe=()=>({prova:async()=>({}),elencaModelli:async()=>({provider:'openai',modelli:[]})});
  const empty=await createTuiCatalogService(deps).providerModels('openai');
  assert.equal(empty.listing,'live','the provider listed nothing: a live list with nothing in it, not a provider without one');assert.equal(empty.rows.some(row=>row.availabilityVerified),false);
  deps.createProbe=()=>({prova:async()=>({}),elencaModelli:async()=>{throw Object.assign(new Error('openai catalog unreachable.'),{code:'CATALOG_UNREACHABLE'});}});
  const down=await createTuiCatalogService(deps).providerModels('openai');
  assert.equal(down.listing,'unreachable');assert.ok(down.rows.length>0,'the known rows are still shown to the person');assert.equal(down.verified,false);
});
