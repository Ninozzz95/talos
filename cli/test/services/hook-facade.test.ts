import assert from 'node:assert/strict';
import test from 'node:test';
import {createHookFacade} from '../../src/services/hook-facade.ts';

const hook={id:'audit',eventi:['pre_tool_call','session_end'],comando:'node audit.mjs',hash:'legacy-audit'};

function snapshot(state:'trusted'|'changed'|'added'='trusted'){
  const current={workspaceIdentityHash:'workspace-1',kind:'hook' as const,id:'audit',relativePath:'.harness-ui-hooks.json',fingerprint:'fp-current'};
  return{
    trusted:state==='trusted',reason:state==='trusted'?'PROJECT_TRUSTED':'RESOURCE_FINGERPRINT_CHANGED',
    storeSchema:'v2',migrationRequired:false,rollbackAvailable:false,
    workspace:{canonicalRoot:'/project',identityHash:'workspace-1'},nestedRepositories:[],
    resources:[{key:'hook:audit',kind:'hook',id:'audit',relativePath:'.harness-ui-hooks.json',state,current,currentFingerprint:'fp-current',trustedFingerprint:state==='trusted'?'fp-current':'fp-old'}]
  } as any;
}
function fakeAuthority(initial=snapshot()){
  let current=initial;let quarantined:any=null;const calls:any[]=[];
  return{
    calls,
    api:{
      inspect:async()=>current,
      verifyScope:async()=>current.resources[0]?.state==='trusted'&&!quarantined,
      trustScope:async(scope:any,options:any)=>{calls.push(['trust',scope,options?.expected]);current=snapshot('trusted');return{changed:true,snapshot:current};},
      untrustScope:async(scope:any)=>{calls.push(['untrust',scope]);current=snapshot('added');return{changed:true,snapshot:current};},
      quarantineScope:async(scope:any,options:any)=>{calls.push(['quarantine',scope,options]);quarantined={active:true,reason:options?.reason??null,quarantinedAt:'2026-09-21T10:00:00.000Z',reviewedFingerprint:'fp-current'};current=snapshot('added');return{changed:true,snapshot:current,record:quarantined};},
      releaseQuarantine:async(scope:any)=>{calls.push(['release',scope]);const changed=Boolean(quarantined);quarantined=null;return{changed};},
      quarantineStatus:async()=>quarantined,
      compatibilityRoots:async()=>({hooks:'/compat-hooks',mcp:'/compat-mcp',plugins:'/compat-plugins'})
    } as any
  };
}
function deps(authority:any,extra:any={}){
  return{
    authority:authority.api,
    loadHooks:async()=>({hooks:[hook]}),
    fingerprintHook:async()=> 'fp-current',
    executeHook:async()=>({consentito:true,motivo:'ok'}),
    trustCompatibility:async()=>{},
    untrustCompatibility:async()=>{},
    listSessionIds:async()=>[],
    readSession:async()=>null,
    ...extra
  } as any;
}

test('M8-B RED — passive hook list exposes fingerprint and quarantine without executing hooks',async()=>{
  const auth=fakeAuthority();let executions=0;
  const facade=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(auth,{executeHook:async()=>{executions++;return{consentito:true};}}));
  const rows=await facade.list();
  assert.equal(executions,0);assert.equal(rows.length,1);
  assert.equal(rows[0]?.trust.currentFingerprint,'fp-current');
  assert.equal(rows[0]?.trust.trustedFingerprint,'fp-current');
  assert.equal(rows[0]?.quarantine.active,false);
  assert.deepEqual(rows[0]?.events,['pre_tool_call','session_end']);
});

test('M8-B RED — malformed hook config is normalized fail-closed',async()=>{
  const auth=fakeAuthority();
  const facade=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(auth,{loadHooks:async()=>{throw Object.assign(new Error('bad hooks'),{code:'HOOK_MALFORMED'});}}));
  await assert.rejects(()=>facade.list(),(error:any)=>error?.code==='HOOK_CONFIG_MALFORMED');
});

test('F-K-001 — dry run and trust name the shell operators a hook command carries; a plain command carries none',async()=>{
  const echoHook={...hook,comando:'echo x > file-s3.txt'};
  const facade=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(fakeAuthority(),{loadHooks:async()=>({hooks:[echoHook]})}));
  assert.deepEqual((await facade.dryRun('audit',{eventType:'pre_tool_call'})).shellOperators,['>']);
  assert.deepEqual((await facade.trust('audit') as any).shellOperators,['>']);
  const plain=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(fakeAuthority()));
  assert.equal((await plain.dryRun('audit',{eventType:'pre_tool_call'})).shellOperators,undefined);
});

test('M8-B RED — dry run requires a current trusted non-quarantined fingerprint and a declared event',async()=>{
  const auth=fakeAuthority();const seen:any[]=[];
  const facade=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(auth,{executeHook:async(input:any)=>{seen.push(input);return{consentito:true,motivo:'checked'};}}));
  const result=await facade.dryRun('audit',{eventType:'pre_tool_call',action:'write'});
  assert.equal(result.realProcess,true);assert.equal(result.syntheticEvent,true);
  assert.equal(result.result.consentito,true);
  assert.deepEqual(seen,[{hook,evento:{tipo:'pre_tool_call',azione:'write',dryRun:true},cartella:'/project'}]);
  await assert.rejects(()=>facade.dryRun('audit',{eventType:'post_tool_call'}),(error:any)=>error?.code==='HOOK_EVENT_NOT_DECLARED');

  const changed=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(auth,{fingerprintHook:async()=> 'different'}));
  await assert.rejects(()=>changed.dryRun('audit',{eventType:'pre_tool_call'}),(error:any)=>error?.code==='HOOK_TRUST_INVALIDATED');
});

test('M8-B RED — quarantine blocks dry-run and release never restores trust',async()=>{
  const auth=fakeAuthority();let executions=0;let mirrorRemovals=0;
  const facade=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(auth,{
    executeHook:async()=>{executions++;return{consentito:true};},
    untrustCompatibility:async()=>{mirrorRemovals++;}
  }));
  await facade.quarantine('audit','manual review');
  await assert.rejects(()=>facade.dryRun('audit',{eventType:'pre_tool_call'}),(error:any)=>error?.code==='HOOK_QUARANTINED');
  assert.equal(executions,0);assert.equal(mirrorRemovals,1);
  await facade.releaseQuarantine('audit');
  assert.equal(await auth.api.verifyScope({kind:'hook',id:'audit'}),false);
});

test('M8-B RED — trust is review-bound and mirrors only after the unified grant',async()=>{
  const auth=fakeAuthority(snapshot('added'));const order:string[]=[];
  const facade=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(auth,{
    trustCompatibility:async(target:any)=>order.push('mirror:'+target.id)
  }));
  await facade.trust('audit');
  assert.equal(auth.calls[0]?.[0],'trust');
  assert.equal(auth.calls[0]?.[2]?.resources?.[0]?.currentFingerprint,'fp-current');
  assert.deepEqual(order,['mirror:audit']);
});

test('M8-B RED — last executions use persisted HookInvoked only and never invent event timestamps',async()=>{
  const auth=fakeAuthority();
  const sessions:any={
    s1:[
      {tipo:'intestazione',sessionId:'s1',cartella:'/project',avviataAlle:'2026-09-21T09:00:00.000Z'},
      {type:'HookInvoked',_sequenza:7,hookId:'audit',tipo:'pre_tool_call',azione:'write',esito:{consentito:false,motivo:'blocked'}},
      {type:'TextMessageEnd',_sequenza:8,messageId:'m1'}
    ],
    other:[
      {tipo:'intestazione',sessionId:'other',cartella:'/other-project',avviataAlle:'2026-09-21T10:00:00.000Z'},
      {type:'HookInvoked',_sequenza:1,hookId:'audit',tipo:'pre_tool_call',azione:'delete',esito:{consentito:true}}
    ]
  };
  const facade=createHookFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any},deps(auth,{
    listSessionIds:async()=>['other','s1'],
    readSession:async(id:string)=>sessions[id]
  }));
  const history=await facade.history('audit',{limit:5});
  assert.equal(history.length,1);
  assert.deepEqual(history[0],{
    sessionId:'s1',sessionStartedAt:'2026-09-21T09:00:00.000Z',sequence:7,
    eventType:'pre_tool_call',action:'write',result:{consentito:false,motivo:'blocked'},executedAt:null
  });
});

test('M8-B hardening RED — hook launch summaries redact known environment secrets',async()=>{
  const auth=fakeAuthority();
  const secretHook={...hook,comando:'node audit.mjs --token sekret'};
  const facade=createHookFacade({
    projectRoot:'/project',repoRoot:'/repo',
    paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any,
    env:{API_TOKEN:'sekret'}
  },deps(auth,{loadHooks:async()=>({hooks:[secretHook]})}));
  const rows=await facade.list();
  assert.equal(rows.length,1);
  assert.equal(rows[0]?.launch.command.includes('sekret'),false);
  assert.match(rows[0]?.launch.command??'',/\[REDACTED:/u);
});
