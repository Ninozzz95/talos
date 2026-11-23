import assert from 'node:assert/strict';
import test from 'node:test';
import {createProviderControlPlane} from '../../src/provider/control-plane.ts';

const NOW=1_790_000_000_000;

function fixture(overrides:Record<string,unknown>={}){
  const secret='sk-secret-must-never-enter-profile';
  const fingerprint='a'.repeat(64);
  const publicRows:any[]=[{
    id:'openai',label:'OpenAI',requiresKey:true,keyConfigured:true,origineChiave:'custodia',
    pool:[{impronta:fingerprint,nome:'Chiave 1',priorita:0,origine:'custodia',stato:'disponibile',inPanchinaFino:null,causa:null}],
    supportsEndpoint:true,endpoint:'https://api.example.test/v1',endpointConfigured:true,timeoutSeconds:60,
    supportsOAuth:false,execution:'collegato',
  }];
  const registry:any={
    openai:{
      id:'openai',etichetta:'OpenAI',descrizione:'Direct provider',destinazioneChat:true,
      chiaveObbligatoria:true,indirizzoModificabile:true,esecuzione:'collegato',
      wire:'openai-responses',baseUrl:'https://api.openai.com/v1',
      auth:{tipo:'bearer',nomeVariabile:['OPENAI_API_KEY']},oauth:null,
    },
  };
  let probeResult:any={provider:'openai',esito:'collegato',motivo:'OpenAI answered.',millisecondi:37,credenzialeVerificata:true};
  const deps:any={
    publicProviders:()=>publicRows,
    registry,
    runtimeFor:()=>({endpoint:'https://api.example.test/v1',endpointConfigured:true,timeoutSeconds:60}),
    keyFor:()=>secret,
    environmentKey:()=>({state:'accepted',variable:'OPENAI_API_KEY'}),
    createProbe:()=>({prova:async()=>probeResult}),
    now:()=>NOW,
    ...overrides,
  };
  return{secret,fingerprint,publicRows,registry,deps,setProbe:(value:any)=>{probeResult=value;}};
}

test('one public provider profile carries auth, endpoint, health, cooldown and remediation without key material',async()=>{
  const f=fixture();
  const plane=createProviderControlPlane(f.deps);
  const before=plane.get('openai');

  assert.equal(before.id,'openai');
  assert.equal(before.auth.required,true);
  assert.equal(before.auth.source,'saved');
  assert.equal(before.auth.usable,true);
  assert.equal(before.endpoint.value,'https://api.example.test/v1');
  assert.equal(before.endpoint.host,'api.example.test');
  assert.equal(before.lastHealth.state,'unknown','no probe means unknown, never invented healthy');
  assert.equal(before.lastHealth.latencyMs,null);
  assert.equal(before.lastHealth.observedAt,null);
  assert.deepEqual(before.cooldown,{active:false,cause:null,until:null,keys:1});
  assert.equal(before.remediation.code,'none');
  assert.equal(before.ready,true);

  const serialized=JSON.stringify(before);
  assert.equal(serialized.includes(f.secret),false,'public DTO never contains key bytes');
  assert.equal(serialized.includes(f.fingerprint),false,'public DTO does not copy reversible/identity credential evidence');
  assert.equal(serialized.includes('Authorization'),false);

  const after=await plane.probe('openai');
  assert.equal(after.lastHealth.state,'available');
  assert.equal(after.lastHealth.latencyMs,37);
  assert.equal(after.lastHealth.observedAt,NOW);
  assert.equal(plane.get('openai').lastHealth.latencyMs,37,'last observed health is shared by later snapshots in this CLI instance');
});

test('readiness and probe share the same decision for auth failure and produce an exact remediation',async()=>{
  const f=fixture();
  f.setProbe({provider:'openai',esito:'non-autorizzato',motivo:'OpenAI refused the credential.',httpStatus:401,millisecondi:12,credenzialeVerificata:false});
  const plane=createProviderControlPlane(f.deps);

  const probed=await plane.probe('openai');
  assert.equal(probed.lastHealth.state,'auth-failed');
  assert.equal(probed.lastHealth.latencyMs,12);
  assert.equal(probed.remediation.code,'replace-key');
  assert.match(probed.remediation.message,/OpenAI/i);

  const readiness=plane.readiness('openai');
  assert.equal(readiness.ready,false);
  if(readiness.ready)assert.fail('auth-failed provider cannot be ready');
  assert.equal(readiness.code,'PROVIDER_AUTH_FAILED');
  assert.deepEqual(readiness.remediation,probed.remediation,'probe and readiness expose one decision model');
});

test('a stored but fully benched key is not usable and exposes cooldown evidence without probing',()=>{
  const until=NOW+60_000;
  const f=fixture({
    keyFor:()=>null,
    publicProviders:()=>[{
      id:'openai',label:'OpenAI',requiresKey:true,keyConfigured:true,origineChiave:'custodia',
      pool:[{impronta:'b'.repeat(64),stato:'in-panchina',inPanchinaFino:until,causa:'traffico'}],
      supportsEndpoint:true,endpoint:'https://api.example.test/v1',endpointConfigured:true,execution:'collegato',
    }],
  });
  const plane=createProviderControlPlane(f.deps);
  const profile=plane.get('openai');

  assert.equal(profile.auth.source,'saved');
  assert.equal(profile.auth.configured,true);
  assert.equal(profile.auth.usable,false);
  assert.deepEqual(profile.cooldown,{active:true,cause:'rate limit',causeCode:'traffico',until,keys:1},'INC503: the kernel\'s class travels beside the words');
  assert.equal(profile.ready,false);
  assert.equal(profile.remediation.code,'wait-or-add-key');
  assert.equal(profile.lastHealth.state,'unknown','bench evidence is readiness evidence, not a fabricated network probe');

  const readiness=plane.readiness('openai');
  assert.equal(readiness.ready,false);
  if(readiness.ready)assert.fail('benched provider cannot be ready');
  assert.equal(readiness.code,'PROVIDER_KEY_BENCHED');
  assert.deepEqual(readiness.remediation,profile.remediation);
});

test('keyless providers never invent auth failure, health or latency',()=>{
  const registry:any={
    local:{
      id:'local',etichetta:'Local',descrizione:'Local runtime',destinazioneChat:true,
      chiaveObbligatoria:false,indirizzoModificabile:true,esecuzione:'locale',
      wire:'locale',baseUrl:'http://127.0.0.1:11434/v1',auth:{tipo:'keyless',nomeVariabile:[]},oauth:null,
    },
  };
  const plane=createProviderControlPlane({
    publicProviders:()=>[{id:'local',label:'Local',requiresKey:false,keyConfigured:false,pool:[],supportsEndpoint:true,endpoint:'http://127.0.0.1:11434/v1',endpointConfigured:false,execution:'locale'}],
    registry,
    runtimeFor:()=>({endpoint:'http://127.0.0.1:11434/v1',endpointConfigured:false}),
    keyFor:()=>null,
    environmentKey:()=>null,
    createProbe:()=>({prova:async()=>{throw new Error('must not run in this test');}}),
    now:()=>NOW,
  } as any);
  const profile=plane.get('local');

  assert.equal(profile.auth.required,false);
  assert.equal(profile.auth.source,'not-required');
  assert.equal(profile.auth.usable,true);
  assert.equal(profile.lastHealth.state,'unknown');
  assert.equal(profile.lastHealth.latencyMs,null);
  assert.equal(profile.remediation.code,'none');
  assert.equal(Object.hasOwn(profile as any,'key'),false);
  assert.equal(Object.hasOwn(profile.auth as any,'value'),false);
  assert.equal(Object.hasOwn(profile.auth as any,'secret'),false);
  assert.equal(Object.hasOwn(profile.auth as any,'token'),false);
});

for(const [status,remedy] of [[401,'check-endpoint'],[403,'inspect-provider']] as const){
  test(`P2-CLI-KEYLESS-${status} reports endpoint access without asking to replace a nonexistent key`,async()=>{
    const registry:any={ollama:{
      id:'ollama',etichetta:'Ollama',descrizione:'Local runtime',destinazioneChat:true,
      chiaveObbligatoria:false,indirizzoModificabile:true,esecuzione:'locale',
      wire:'openai-chat',baseUrl:'http://127.0.0.1:11434/v1',auth:{tipo:'keyless',nomeVariabile:[]},oauth:null,
    }};
    const plane=createProviderControlPlane({
      publicProviders:()=>[{id:'ollama',label:'Ollama',requiresKey:false,keyConfigured:false,pool:[],supportsEndpoint:true,endpoint:'http://127.0.0.1:11434/v1',execution:'locale'}],
      registry,
      runtimeFor:()=>({endpoint:'http://127.0.0.1:11434/v1'}),
      keyFor:()=>null,
      createProbe:()=>({prova:async()=>({provider:'ollama',esito:'non-autorizzato',credenzialeVerificata:null,httpStatus:status,motivo:`Ollama HTTP ${status}`,millisecondi:11})}),
      now:()=>NOW,
    } as any);
    const profile=await plane.probe('ollama');
    assert.equal(profile.lastHealth.state,'access-denied');
    assert.equal(profile.lastHealth.httpStatus,status);
    assert.equal(profile.remediation.code,remedy);
    assert.doesNotMatch(profile.remediation.message,/replace|reauthoriz|key/iu);
    assert.equal(profile.ready,false);
    const decision=plane.readiness('ollama');
    assert.equal(decision.ready,false);
    if(decision.ready)assert.fail('denied local endpoint cannot be ready');
    assert.equal(decision.code,'PROVIDER_HEALTH_ERROR');
    assert.deepEqual(decision.remediation,profile.remediation);
  });
}


test('credential or runtime changes can invalidate stale observed health without inventing a replacement observation',async()=>{
  const f=fixture();
  f.setProbe({provider:'openai',esito:'non-autorizzato',motivo:'refused',httpStatus:401,millisecondi:9,credenzialeVerificata:false});
  const plane=createProviderControlPlane(f.deps);
  assert.equal((await plane.probe('openai')).lastHealth.state,'auth-failed');
  assert.equal(plane.readiness('openai').ready,false);

  plane.invalidate('openai');
  const profile=plane.get('openai');
  assert.equal(profile.lastHealth.state,'unknown');
  assert.equal(profile.lastHealth.latencyMs,null);
  assert.equal(profile.lastHealth.observedAt,null);
  assert.equal(profile.ready,true);
});

test('endpointless ACP provider is valid only when its own runtime is configured',()=>{
  let configured=false;
  const registry:any={
    esterno:{
      id:'esterno',etichetta:'External agent',descrizione:'ACP agent',destinazioneChat:true,
      chiaveObbligatoria:false,indirizzoModificabile:false,esecuzione:'da configurare sul computer',
      wire:'acp',baseUrl:null,auth:{tipo:'keyless',nomeVariabile:[]},oauth:null,
    },
  };
  const plane=createProviderControlPlane({
    publicProviders:()=>[{id:'esterno',label:'External agent',requiresKey:false,keyConfigured:false,pool:[],supportsEndpoint:false,execution:configured?'configurato':'da configurare'}],
    registry,
    runtimeFor:()=>({agente:configured?{comando:'agent'}:null}),
    keyFor:()=>null,
    createProbe:()=>({prova:async()=>({provider:'esterno',esito:'non-provabile',motivo:'not configured',millisecondi:null})}),
  } as any);

  const missing=plane.get('esterno');
  assert.equal(missing.endpoint.value,null);
  assert.equal(missing.endpoint.valid,true,'ACP does not require an HTTP endpoint');
  assert.equal(missing.runtimeConfigured,false);
  assert.equal(missing.ready,false);
  assert.equal(missing.remediation.code,'configure-provider');
  const decision=plane.readiness('esterno');
  assert.equal(decision.ready,false);
  if(decision.ready)assert.fail('unconfigured ACP cannot be ready');
  assert.equal(decision.code,'PROVIDER_NOT_CONFIGURED');

  configured=true;
  plane.invalidate('esterno');
  const ready=plane.get('esterno');
  assert.equal(ready.runtimeConfigured,true);
  assert.equal(ready.ready,true);
});

/* «Continue with ChatGPT» (owner 13/10/2026): a provider signed in to (the kernel's `auth.tipo: 'oauth-pkce'`) is ready only when the
   person is signed in AND the plan is enabled; it never says "ready" because it needs no API key. Measured before: after the
   realignment to r4 `talos provider list` called the ChatGPT plan configured and usable with nobody signed in. */
function planFixture(plan:{connected:boolean;planEnabled:boolean}|null){
  const f=fixture({
    publicProviders:()=>[{id:'chatgpt',label:'ChatGPT plan',requiresKey:false,keyConfigured:false,supportsEndpoint:false,supportsOAuth:true,execution:'collegato'}],
    keyFor:()=>null,environmentKey:()=>null,
    runtimeFor:()=>({}),
    ...(plan===undefined?{}:{signedIn:(id:string)=>id==='chatgpt'?plan:null}),
  });
  f.registry.chatgpt={id:'chatgpt',etichetta:'ChatGPT plan',descrizione:'OpenAI models paid by the ChatGPT plan of the signed-in person.',destinazioneChat:true,
    chiaveObbligatoria:false,indirizzoModificabile:false,esecuzione:'collegato',wire:'openai-responses',baseUrl:'https://api.openai.com/v1',
    auth:{tipo:'oauth-pkce',nomeVariabile:[]},oauth:{flusso:'chatgpt-piano',consumi:'https://chatgpt.com/settings/usage'}};
  return createProviderControlPlane(f.deps).get('chatgpt');
}
test('ChatGPT plan: nobody signed in is not ready, and the remedy is to sign in',()=>{
  const profile=planFixture({connected:false,planEnabled:false});
  assert.equal(profile.auth.type,'oauth-pkce');
  assert.equal(profile.auth.required,true,'a sign-in is required, even if no key is');
  assert.equal(profile.auth.usable,false);assert.equal(profile.auth.configured,false);assert.equal(profile.auth.source,'missing');
  assert.equal(profile.ready,false);
  assert.equal(profile.remediation.code,'sign-in');
  assert.match(profile.remediation.message,/talos provider login chatgpt/u);
  assert.doesNotMatch(profile.remediation.message,/API key|set-key/u,'the plan has no key to set');
});
test('ChatGPT plan: signed in with the plan enabled is ready; signed in without the plan is not, and says why',()=>{
  const ready=planFixture({connected:true,planEnabled:true});
  assert.equal(ready.auth.usable,true);assert.equal(ready.auth.configured,true);assert.equal(ready.auth.source,'saved');assert.equal(ready.ready,true);
  assert.equal(ready.remediation.code,'none');
  const noPlan=planFixture({connected:true,planEnabled:false});
  assert.equal(noPlan.auth.configured,true);assert.equal(noPlan.auth.usable,false);assert.equal(noPlan.ready,false);
  assert.equal(noPlan.remediation.code,'sign-in');
  assert.match(noPlan.remediation.message,/not enabled/u);
});
test('ChatGPT plan: its test never goes to the kernel probe, which does not know it',async()=>{
  const asked:string[]=[];
  const f=fixture({publicProviders:()=>[],keyFor:()=>null,environmentKey:()=>null,runtimeFor:()=>({}),signedIn:()=>({connected:true,planEnabled:true}),
    createProbe:()=>({prova:async(id:string)=>{asked.push(id);throw Object.assign(new Error('unknown provider'),{code:'PROVIDER_INVALID'});},elencaModelli:async()=>({})}),
    signInProbe:async(id:string)=>({provider:id,esito:'collegato',millisecondi:12})});
  f.registry.chatgpt={id:'chatgpt',etichetta:'ChatGPT plan',destinazioneChat:true,chiaveObbligatoria:false,esecuzione:'collegato',baseUrl:'https://api.openai.com/v1',auth:{tipo:'oauth-pkce',nomeVariabile:[]}};
  const plane=createProviderControlPlane(f.deps);
  const profile=await plane.probe('chatgpt');
  assert.deepEqual(asked,[]);assert.equal(profile.lastHealth.state,'available');assert.equal(profile.lastHealth.latencyMs,12);assert.equal(profile.ready,true);
  /* with no probe of its own it is "not testable", still without the kernel */
  const {signInProbe:_none,...bare}=f.deps as any;
  assert.equal((await createProviderControlPlane(bare).probe('chatgpt')).lastHealth.state,'unprobeable');assert.deepEqual(asked,[]);
});
test('ChatGPT plan: where the sign-in cannot be known (no keyring) it is not ready, never "usable"',()=>{
  const unknown=planFixture(null);
  assert.equal(unknown.auth.usable,false);assert.equal(unknown.ready,false);
});
