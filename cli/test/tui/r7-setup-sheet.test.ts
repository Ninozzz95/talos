/*
 * Stage 7.10d (mockup PANELS.setup; owner 03/10 «foglio a schede + Check vero, a costo minimo», «chiave + 1 token sempre,
 * strumenti a richiesta», «stesso foglio anche al primo avvio») in the REAL app: /setup is the four-tab sheet. A provider is
 * picked on tab 1, its key asked on tab 2 (masked, saved only once the provider accepted it, never on screen or in the output),
 * its models listed on tab 3, and choosing one chooses the provider too and runs Check: the key against its provider, one token
 * from the model when the kernel can, and whether a message would leave now. An environment key is used only on a yes.
 * Mount: the REAL TuiApp (r5a-s-fixture.ts) with a catalog of its own, a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep,v2} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B',UP='\x1b[A',ESC='\x1b',RIGHT='\x1b[C';
let n=0;const project=()=>{const root=join(env.root,`setup-sheet-${++n}`);mkdirSync(root,{recursive:true});return root;};
const flat=(text:string)=>text.replace(/\s+/gu,' ');

const provider=(id:string,label:string,extra:Record<string,unknown>={})=>({id,label,description:label,configured:false,requiresKey:true,authType:'api-key',local:false,cloud:true,endpointHost:null,supportsEndpoint:false,supportsOAuth:false,execution:'remote',keySource:'missing',environmentVariable:null,...extra});
function catalogOf({providers,chosen=null}:{providers:any[];chosen?:string|null}){
  const calls:string[]=[];let current=chosen;const keys=new Set<string>();
  const rows=()=>providers.map(row=>keys.has(row.id)?{...row,configured:true,keySource:'saved'}:row);
  const catalog:any={
    listProviders:async()=>rows(),chosenProvider:async()=>current,
    chooseProvider:async(id:string)=>{calls.push(`choose ${id}`);current=id;},
    probeProvider:async(id:string)=>{calls.push(`probe ${id}`);return{provider:id,state:'available',detail:'ok',latencyMs:312,remediation:null,readinessCode:null};},
    keyTestNotice:()=>null,
    setProviderKey:async(id:string,secret:string)=>{calls.push(`key ${id}`);if(secret!=='sk-good-key')return{provider:id,label:id,outcome:'invalid',passed:false,httpStatus:401,message:'The provider refused this key (401).',saved:false};keys.add(id);return{provider:id,label:id,outcome:'valid',passed:true,httpStatus:200,message:'ok',saved:true};},
    answerEnvironmentKey:async(id:string,answer:string)=>{calls.push(`env ${id} ${answer}`);if(answer==='yes')keys.add(id);},
    listModels:async()=>[],
    providerModels:async(id:string)=>({provider:id,label:'OpenAI',verified:true,notice:'',rows:[
      {id:`${id}:gpt-6-mini`,name:'gpt-6-mini',provider:id,contextWindow:262_144,toolCalling:true,availabilityVerified:true},
      {id:`${id}:gpt-6`,name:'gpt-6',provider:id,contextWindow:1_000_000,toolCalling:true,availabilityVerified:true}]}),
    selectModel:async(id:string)=>{calls.push(`select ${id}`);},
    readiness:async(model:string)=>({ready:true,provider:current,model}),
  };
  return{catalog,calls};
}

test('stage 7.10d /setup: provider → key (refused, then saved) → model → Check, then Esc says ready',async()=>{
  const {catalog,calls}=catalogOf({providers:[provider('openai','OpenAI'),provider('ollama','Ollama',{requiresKey:false,local:true,cloud:false,keySource:'not-required',configured:true})]});
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,props:{catalog}});
  try{
    await app.type('/setup');app.press(ENTER);
    let s=await app.waitFor('the sheet',x=>/── Setup provider, key, model · step by step/u.test(x.text));
    assert.match(s.text,/1 Provider {3}2 Key {3}3 Model {3}4 Check/u);
    /* the usable providers first (providerPickerItems): the local engine, then OpenAI */
    assert.match(s.text,/› ○ Ollama · no key\n\s+○ OpenAI/u);
    app.press(DOWN);await sleep(40);app.press(ENTER);
    s=await app.waitFor('the key tab',x=>/› OpenAI API key/u.test(x.text));
    assert.match(s.text,/never in a file, never shown again\./u);
    await app.type('sk-bad');app.press(ENTER);
    s=await app.waitFor('the refusal',x=>/The provider refused this key \(401\)\./u.test(x.text));
    assert.match(s.text,/› OpenAI API key +▍/u,'the field is empty again');
    await app.type('sk-good-key');app.press(ENTER);
    s=await app.waitFor('the model tab',x=>/● gpt-6-mini|○ gpt-6-mini/u.test(x.text));
    assert.match(s.text,/262k context · good with tools/u);
    assert.doesNotMatch(calls.join(' '),/choose/u,'the provider is chosen only with a model of it');
    app.press(ENTER);
    s=await app.waitFor('the checks',x=>/✓ Key works +312 ms/u.test(x.text)&&/Ready\. Esc and start talking\./u.test(x.text));
    assert.match(s.text,/Model answers +not checked: this TALOS cannot ask the model yet/u);
    assert.match(s.text,/Tools work +r runs it · ~12k tokens/u);
    assert.match(s.text,/ r run the tools check · ~12k tokens/u,'its cost is said before it runs');
    assert.deepEqual(calls.filter(call=>/^(choose|select)/u.test(call)),['choose openai','select openai:gpt-6-mini']);
    app.press(ESC);
    s=await app.waitFor('the end',x=>!/── Setup/u.test(x.text)&&/✓ Ready · openai:gpt-6-mini/u.test(x.text));
    assert.ok(!app.written().includes('sk-good-key')&&!app.written().includes('sk-bad'),'no key ever reaches the terminal');
  }finally{app.unmount();}
});

test('stage 7.10d /setup Check: one token from the model when the kernel can',async()=>{
  const {catalog}=catalogOf({providers:[provider('openai','OpenAI',{configured:true,keySource:'saved'})],chosen:'openai'});
  const asked:string[]=[];
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,props:{catalog},runtimeExtra:{
    capabilities:()=>({forkBeforeRun:false,modelCheck:true}),
    checkModel:async(model:string)=>{asked.push(model);return{answers:true,firstTokenMs:800,ms:950};},
  }});
  try{
    await app.type('/setup');app.press(ENTER);
    await app.waitFor('the sheet',x=>/● OpenAI/u.test(x.text));
    app.press('\t');app.press('\t');
    await app.waitFor('the model tab',x=>/gpt-6-mini/u.test(x.text));
    app.press(ENTER);
    const s=await app.waitFor('the checks',x=>/✓ Model answers +first token in 0\.8 s/u.test(x.text));
    assert.match(s.text,/A key is stored|Ready\./u);
    assert.deepEqual(asked,['openai:gpt-6-mini']);
  }finally{app.unmount();}
});

test('stage 7.10d /setup Check: r runs the tools check in a throwaway session that is deleted after',async()=>{
  const {catalog}=catalogOf({providers:[provider('openai','OpenAI',{configured:true,keySource:'saved'})],chosen:'openai'});
  const calls:string[]=[];const done={status:'completed',receipt:{status:null,allowed:null,via:null,reason:null,risk:null},enforcement:null};
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,props:{catalog},runtimeExtra:{
    start:async(input:any)=>{calls.push(`start ${input.permissionMode}`);return 'tmp-check';},
    subscribe:(id:string,sink:(event:any)=>void)=>{
      if(id==='tmp-check')setTimeout(()=>{const e=(type:string,data:Record<string,unknown>)=>sink(v2(id,type,data));
        e('tool.started',{toolCallId:'a',toolName:'leggi'});e('tool.completed',{toolCallId:'a',content:'# demo',...done});
        e('approval.required',{requestId:'q',azione:{tipo:'comando',comando:'pwd'}});
        e('tool.started',{toolCallId:'b',toolName:'shell'});e('tool.completed',{toolCallId:'b',content:'/p',...done});e('run.completed',{});},50);
      return()=>{};
    },
    answerApproval:async(id:string,requestId:string,approved:boolean)=>{calls.push(`approve ${id} ${requestId} ${approved}`);},
    cancel:async(id:string)=>{calls.push(`cancel ${id}`);},
    deleteSession:async(id:string)=>{calls.push(`delete ${id}`);},
  }});
  try{
    await app.type('/setup');app.press(ENTER);
    await app.waitFor('the sheet',x=>/● OpenAI/u.test(x.text));
    app.press('\t');await sleep(40);app.press('\t');
    await app.waitFor('the model tab',x=>/gpt-6-mini/u.test(x.text));
    app.press(ENTER);
    await app.waitFor('the offer',x=>/r runs it · ~12k tokens/u.test(x.text));
    await app.type('r');
    await app.waitFor('the tools check',x=>/✓ Tools work +read a file, ran a command/u.test(x.text));
    assert.deepEqual(calls,['start default','approve tmp-check q true','cancel tmp-check','delete tmp-check']);
  }finally{app.unmount();}
});

test('stage 7.10d /setup Check: a model that does not answer is not «Ready», and says why',async()=>{
  const {catalog}=catalogOf({providers:[provider('openai','OpenAI',{configured:true,keySource:'saved'})],chosen:'openai'});
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,props:{catalog},runtimeExtra:{
    capabilities:()=>({forkBeforeRun:false,modelCheck:true}),
    checkModel:async()=>({answers:false,firstTokenMs:null,ms:120,code:'MODEL_NOT_FOUND',reason:'The provider does not have this model.'}),
  }});
  try{
    await app.type('/setup');app.press(ENTER);
    await app.waitFor('the sheet',x=>/● OpenAI/u.test(x.text));
    app.press('\t');await sleep(40);app.press('\t');
    await app.waitFor('the model tab',x=>/gpt-6-mini/u.test(x.text));
    app.press(ENTER);
    const s=await app.waitFor('the checks',x=>/✗ Model answers +The provider does not have this model\./u.test(x.text)&&/Not ready yet/u.test(x.text));
    assert.doesNotMatch(s.text,/Ready\. Esc and start talking\./u);
    assert.doesNotMatch(s.text,/r run the tools check/u,'no tools check with a model that does not answer');
  }finally{app.unmount();}
});

test('stage 7.10d /setup: an environment key is used only on a yes, and the key tab says so',async()=>{
  const {catalog,calls}=catalogOf({providers:[provider('openai','OpenAI',{keySource:'environment-unanswered',environmentVariable:'OPENAI_API_KEY'})]});
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,props:{catalog}});
  try{
    await app.type('/setup');app.press(ENTER);
    await app.waitFor('the sheet',x=>/○ OpenAI/u.test(x.text));
    app.press(ENTER);
    let s=await app.waitFor('the question',x=>/Environment key +No \(recommended\) +Use OPENAI_API_KEY/u.test(x.text));
    assert.match(flat(s.text),/OPENAI_API_KEY was found in the environment\./u);
    app.press(RIGHT);await sleep(40);app.press(ENTER);
    s=await app.waitFor('the models',x=>/gpt-6-mini/u.test(x.text));
    assert.ok(calls.includes('env openai yes'));
    assert.ok(!calls.some(call=>call.startsWith('key ')),'no key typed, none tested');
  }finally{app.unmount();}
});

test('stage 7.10d /setup: a local engine needs no key; nothing typed with no key is refused in place',async()=>{
  const {catalog,calls}=catalogOf({providers:[provider('openai','OpenAI'),provider('ollama','Ollama',{requiresKey:false,local:true,cloud:false,keySource:'not-required',configured:true})]});
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,props:{catalog}});
  try{
    await app.type('/setup');app.press(ENTER);
    await app.waitFor('the sheet',x=>/○ OpenAI/u.test(x.text));
    app.press(DOWN);await sleep(40);app.press(ENTER);await app.waitFor('the key tab',x=>/› OpenAI API key/u.test(x.text));
    app.press(ENTER);
    await app.waitFor('asked again',x=>/Type or paste the key first\./u.test(x.text));
    app.press('\x1b[Z');await sleep(60);
    app.press(UP);await sleep(40);app.press(ENTER);
    let s=await app.waitFor('no key needed',x=>/Ollama runs on this computer: no key needed\./u.test(x.text));
    assert.match(s.text,/ enter next   tab next tab   esc close/u);assert.doesNotMatch(s.text,/↑\/↓ field/u,'a form of no fields shows only its button');
    app.press(ENTER);
    s=await app.waitFor('its models',x=>/gpt-6-mini/u.test(x.text));
    assert.ok(!calls.some(call=>call.startsWith('key ')));
    void s;
  }finally{app.unmount();}
});

/* 14/10/2026 (owner: «the Z.AI key only to the address you chose», «Te lo chiede quando metti la chiave»): in the REAL app, the
   Key tab asks the Z.AI address first, and the address is chosen BEFORE the key is tested (the test is a request with the key). */
test('/setup with Z.AI: the address is asked on the Key tab and chosen before the key is tested',async()=>{
  const {catalog,calls}=catalogOf({providers:[provider('zai','Z.AI',{addressChosen:false,address:null})]});
  let chosen=false;
  const listed=catalog.listProviders;catalog.listProviders=async()=>(await listed()).map((row:any)=>row.id==='zai'&&chosen?{...row,addressChosen:true,address:'GLM Coding Plan (China)'}:row);
  catalog.chooseProviderAddress=async(id:string,endpoint:string)=>{calls.push(`address ${id} ${endpoint}`);chosen=true;};
  const app=await mountR5a({cols:160,rows:40,root:project(),paths:env.paths,props:{catalog}});
  try{
    await app.type('/setup');app.press(ENTER);
    await app.waitFor('the sheet',x=>/── Setup provider, key, model · step by step/u.test(x.text));
    app.press(ENTER);
    let s=await app.waitFor('the key tab with the address',x=>/› Z\.AI address +GLM Coding Plan \(Recommended\)/u.test(x.text));
    assert.match(s.text,/Z\.AI API key/u);
    /* the choice in use is shown by its style, not its words: the address chosen is read from the catalog call below */
    app.press(RIGHT);await sleep(40);app.press(RIGHT);await sleep(40);
    app.press(DOWN);await sleep(40);
    await app.type('sk-good-key');app.press(ENTER);
    await app.waitFor('the key saved',()=>calls.includes('key zai'));
    /* the sentence that says the choice goes to the transcript, under the open sheet; zai-address-screen.test.ts reads it on /provider */
    assert.deepEqual(calls.filter(call=>/^(address|key)/u.test(call)),['address zai https://open.bigmodel.cn/api/coding/paas/v4','key zai'],'the address first, then the key');
  }finally{app.unmount();}
});
