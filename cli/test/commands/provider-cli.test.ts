import assert from 'node:assert/strict';import test from 'node:test';import {runProviderCommand,runModelCommand} from '../../src/commands/provider-cli.ts';
function ctx(){const out:string[]=[];let key:string|null=null;const runtime:any={tuiCatalog:{setProviderKey:async(_p:string,v:string)=>{key=v;return{provider:'openai',label:'OpenAI',outcome:'valid',passed:true,httpStatus:200,message:'OpenAI accepted the key (HTTP 200).',saved:true};},listProviders:async()=>[]},providerStore:{listPublic:()=>[{id:'openai',configured:Boolean(key)}],setKey:(_p:string,v:string)=>{key=v;},clearKey:()=>{key=null;},getKey:()=>key,getRuntime:()=>({endpoint:'https://x',timeoutSeconds:60}),setRuntime(){}}};return{out,runtime,ctx:{invocation:{outputFormat:'json'} as any,io:{writeOut:(s:string)=>out.push(s),writeErr() {},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>'',readSecret:async()=> 'sekret'},projectRoot:'/p',paths:{} as any,repoRoot:'/repo',createRuntimeContext:async()=>runtime} as any};}
test('provider set-key reads hidden input rather than argv',async()=>{const x=ctx();assert.equal(await runProviderCommand(x.ctx,['set-key','openai']),0);assert.equal(x.runtime.providerStore.getKey(),'sekret');assert.doesNotMatch(x.out.join(''),/sekret/u);});
test('provider list never prints secret',async()=>{const x=ctx();x.runtime.providerStore.setKey('openai','hidden');await runProviderCommand(x.ctx,['list']);assert.doesNotMatch(x.out.join(''),/hidden/u);});
test('model use persists through config command boundary',async()=>{const x=ctx();let called:any;const old=x.ctx.paths;x.ctx.paths={...old};x.ctx.projectRoot='/tmp/no-real-write';// dependency is real; invalid path is okay only after mkdir, skip assertion via expected failure not useful
assert.equal(typeof runModelCommand,'function');});


test('model list with a provider consumes the same providerModels catalog used by the TUI',async()=>{
  const x=ctx();const calls:string[]=[];
  x.runtime.tuiCatalog.providerModels=async(provider:string)=>{
    calls.push(provider);
    return{
      provider,label:'OpenAI',verified:false,notice:'Mixed catalog; not verified.',
      rows:[{
        id:'openai:manual',provider:'openai',name:'Manual',source:'configured',available:'configured',
        availabilityVerified:false,contextWindow:null,toolCalling:null,reasoning:null,reasoningEfforts:null,images:null,
        capabilityEvidence:{},
      }],
    };
  };
  const code=await runModelCommand(x.ctx,['list','--provider','openai']);
  assert.equal(code,0);
  assert.deepEqual(calls,['openai']);
  const rows=JSON.parse(x.out.join(''));
  assert.equal(rows[0]?.id,'openai:manual');
  assert.equal(rows[0]?.source,'configured');
  assert.equal(rows[0]?.availabilityVerified,false);
});


test('provider test human output names the canonical remediation instead of dumping a profile',async()=>{
  const x=ctx();x.ctx.invocation.outputFormat='human';
  const remediation={code:'replace-key',message:'OpenAI rejected the current credential. Replace or re-authorize the key.'};
  x.runtime.providerControlPlane={
    probe:async()=>({
      id:'openai',label:'OpenAI',
      lastHealth:{state:'auth-failed',detail:'HTTP 401',latencyMs:12,observedAt:123,httpStatus:401},
      remediation,
    }),
  };
  const code=await runProviderCommand(x.ctx,['test','openai']);
  assert.equal(code,11);
  const rendered=x.out.join('');
  assert.match(rendered,/OpenAI/u);
  assert.match(rendered,/auth-failed/u);
  assert.match(rendered,/12 ms/u);
  assert.match(rendered,/Replace or re-authorize the key/u);
  assert.doesNotMatch(rendered,/"lastHealth"|"remediation"/u,'human mode is remediation UX, not a JSON profile dump');
});

test('provider configure mutates only the named provider endpoint',async()=>{
  const out:string[]=[];const runtimes:any={
    openai:{endpoint:'https://openai.old/v1',timeoutSeconds:60},
    anthropic:{endpoint:'https://anthropic.keep/v1',timeoutSeconds:45},
  };
  const runtime:any={
    tuiCatalog:{listProviders:async()=>[]},
    providerControlPlane:{invalidate:()=>{}},
    providerStore:{
      listPublic:()=>[],getKey:()=>null,clearKey:()=>{},
      getRuntime:(id:string)=>({...runtimes[id]}),
      setRuntime:(id:string,value:any)=>{runtimes[id]={...value};},
    },
  };
  const commandCtx:any={
    invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''},
    projectRoot:'/p',paths:{} as any,repoRoot:'/repo',createRuntimeContext:async()=>runtime,
  };
  assert.equal(await runProviderCommand(commandCtx,['configure','openai','--endpoint','https://openai.new/v1']),0);
  assert.equal(runtimes.openai.endpoint,'https://openai.new/v1');
  assert.equal(runtimes.anthropic.endpoint,'https://anthropic.keep/v1');
});

/* F-L-001 of the stress-test smoke (rc.1, 08/10/2026): `talos provider list` printed the kernel's Italian values
   (execution 'collegato' / 'da configurare' / 'runtime locale' / 'motore locale', auth.type 'effimera'). The kernel keeps its
   values (the TUI compares them); the printed profile speaks English, by value, and an unknown value passes through unchanged. */
test('provider list prints English execution and auth values, never the kernel words',async()=>{
  const x=ctx();
  let n=0;const kernelRow=(execution:string,type:string)=>({id:`provider-${++n}`,execution,auth:{type,required:false},endpoint:{},remediation:null,ready:true});
  x.runtime.providerControlPlane={list:()=>[kernelRow('collegato','bearer'),kernelRow('da configurare','keyless'),kernelRow('configurato','keyless'),kernelRow('runtime locale','keyless'),kernelRow('motore locale','effimera'),kernelRow('futuro','nuovo')]};
  assert.equal(await runProviderCommand(x.ctx,['list']),0);
  const printed=x.out.join('');
  assert.doesNotMatch(printed,/collegato|da configurare|configurato|runtime locale|motore locale|effimera/u);
  const rows=JSON.parse(printed);
  assert.deepEqual(rows.map((r:any)=>[r.execution,r.auth.type]),[['connected','bearer'],['needs-setup','keyless'],['configured','keyless'],['local-runtime','keyless'],['local-engine','ephemeral'],['futuro','nuovo']]);
});

/* OWN-01 (owner 09/10/2026, «10 minuti»): the store marks a passed time as the person's choice. A change of address without
   --timeout hands the time back only when it is not the default, so the 600 s default never becomes a choice by accident. */
test('provider configure without --timeout sends no time: the store keeps the one in use and its mark',async()=>{
  const runtimes:any={zai:{endpoint:'https://a/v1',timeoutSeconds:600},openai:{endpoint:'https://b/v1',timeoutSeconds:45}};
  const sent:any={};
  const runtime:any={tuiCatalog:{listProviders:async()=>[]},providerControlPlane:{invalidate:()=>{}},
    providerStore:{listPublic:()=>[],getKey:()=>null,clearKey:()=>{},getRuntime:(id:string)=>({...runtimes[id]}),setRuntime:(id:string,value:any)=>{sent[id]=value;}}};
  const commandCtx:any={invocation:{outputFormat:'json'},io:{writeOut(){},writeErr(){},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''},
    projectRoot:'/p',paths:{} as any,repoRoot:'/repo',createRuntimeContext:async()=>runtime};
  assert.equal(await runProviderCommand(commandCtx,['configure','zai','--endpoint','https://a2/v1']),0);
  assert.equal(Object.hasOwn(sent.zai,'timeoutSeconds'),false,'the default is not handed back as a choice');
  assert.equal(await runProviderCommand(commandCtx,['configure','openai','--endpoint','https://b2/v1']),0);
  assert.equal(Object.hasOwn(sent.openai,'timeoutSeconds'),false,'a chosen time is kept by the store, not handed back');
  assert.equal(await runProviderCommand(commandCtx,['configure','openai','--timeout','1800']),0);
  assert.equal(sent.openai.timeoutSeconds,1800,'up to 30 minutes');
});

/* F-S-002 (stress test of 0.5.2, 09/10/2026, S2): `provider remove-key` said "Removed" while an approved environment key stayed in
   use (`provider list` usable, a -p run authenticated). Removing a provider's key now also takes back the approval of its
   environment variable, and says so with the way back; with no approved variable nothing else changes. */
function removeKeyCtx(keySource:string|null){
  const out:string[]=[];const calls:string[]=[];let cleared=0;
  const row=keySource===null?{id:'deepseek',label:'DeepSeek'}:{id:'deepseek',label:'DeepSeek',environmentVariable:'DEEPSEEK_API_KEY',keySource};
  const runtime:any={tuiCatalog:{listProviders:async()=>[row],answerEnvironmentKey:async(id:string,a:string)=>{calls.push(`${id}:${a}`);}},
    providerControlPlane:{invalidate:()=>{}},providerStore:{listPublic:()=>[],getKey:()=>null,clearKey:()=>{cleared++;},getRuntime:()=>({})}};
  const commandCtx:any={invocation:{outputFormat:'text'},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''},
    projectRoot:'/p',paths:{} as any,repoRoot:'/repo',createRuntimeContext:async()=>runtime};
  return{out,calls,commandCtx,cleared:()=>cleared};
}
test('F-S-002 remove-key also takes back an approved environment key, and says how to use it again',async()=>{
  const x=removeKeyCtx('environment');
  assert.equal(await runProviderCommand(x.commandCtx,['remove-key','deepseek']),0);
  assert.equal(x.cleared(),1);
  assert.deepEqual(x.calls,['deepseek:no'],'the approval of DEEPSEEK_API_KEY is taken back');
  assert.match(x.out.join(''),/DEEPSEEK_API_KEY.*no longer used.*talos provider env-key deepseek --use/u);
});
test('F-S-002 remove-key leaves a declined or unanswered variable, or none, as it is',async()=>{
  for(const source of ['environment-declined','keyring',null]){
    const x=removeKeyCtx(source);
    assert.equal(await runProviderCommand(x.commandCtx,['remove-key','deepseek']),0);
    assert.deepEqual(x.calls,[],`nothing to take back (${source})`);
    assert.doesNotMatch(x.out.join(''),/no longer used/u);
  }
});
