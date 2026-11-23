import assert from 'node:assert/strict';
import test from 'node:test';
import {createMcpFacade} from '../../src/services/mcp-facade.ts';

function snapshot(state:'trusted'|'changed'|'added'='trusted'){
  const current={
    workspaceIdentityHash:'workspace-1',kind:'mcp' as const,id:'alpha',
    relativePath:'.harness-ui-mcp.json',fingerprint:'fp-current'
  };
  return {
    trusted:state==='trusted',reason:state==='trusted'?'PROJECT_TRUSTED':'RESOURCE_FINGERPRINT_CHANGED',
    storeSchema:'v2',migrationRequired:false,rollbackAvailable:false,
    workspace:{canonicalRoot:'/project',identityHash:'workspace-1'},
    nestedRepositories:[],
    resources:[{
      key:'mcp:alpha',kind:'mcp',id:'alpha',relativePath:'.harness-ui-mcp.json',state,
      current,currentFingerprint:'fp-current',trustedFingerprint:state==='trusted'?'fp-current':'fp-old'
    }]
  } as any;
}

function authority(initial:any){
  let current=initial;
  const calls:any[]=[];
  return {
    calls,
    api:{
      inspect:async()=>current,
      verifyScope:async()=>current.resources.some((row:any)=>row.kind==='mcp'&&row.id==='alpha'&&row.state==='trusted'),
      trustScope:async(scope:any,options:any)=>{calls.push(['trust',scope,options?.expected]);current=snapshot('trusted');return{changed:true,snapshot:current};},
      untrustScope:async(scope:any)=>{calls.push(['untrust',scope]);current={...snapshot('added'),trusted:false,reason:'RESOURCE_SET_CHANGED'};return{changed:true,snapshot:current};},
      compatibilityRoots:async()=>({hooks:'/hooks',mcp:'/mcp-compat',plugins:'/plugins'})
    } as any
  };
}

const server={id:'alpha',comando:'node',argomenti:['server.mjs'],allowlist:['ping','missing'],hash:'legacy-alpha'};

test('M8-A RED — passive MCP inspection exposes unified fingerprints and permission allowlist without probing',async()=>{
  const auth=authority(snapshot());
  let probes=0;
  const facade=createMcpFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust',mcp:'/legacy'}} as any},{
    authority:auth.api,
    loadServers:async()=>({server:[server]}),
    probeServer:async()=>{probes++;throw new Error('PASSIVE_LIST_MUST_NOT_PROBE');},
    trustCompatibility:async()=>{},
    untrustCompatibility:async()=>{}
  } as any);
  const rows=await facade.list();
  assert.equal(probes,0);
  assert.equal(rows.length,1);
  assert.equal(rows[0]?.id,'alpha');
  assert.equal(rows[0]?.trust.currentFingerprint,'fp-current');
  assert.equal(rows[0]?.trust.trustedFingerprint,'fp-current');
  assert.equal(rows[0]?.trust.state,'trusted');
  assert.deepEqual(rows[0]?.permission.configuredAllowlist,['ping','missing']);
  assert.deepEqual(rows[0]?.permission.effectiveTools,[]);
  assert.equal(rows[0]?.permission.perCallApproval,'not-applied');
  assert.equal(rows[0]?.health.state,'not-probed');
});

test('M8-A RED — changed/untrusted MCP scope fails before active probe construction',async()=>{
  const auth=authority(snapshot('changed'));
  let probes=0;
  const facade=createMcpFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust',mcp:'/legacy'}} as any},{
    authority:auth.api,
    loadServers:async()=>({server:[server]}),
    probeServer:async()=>{probes++;return{} as any;},
    trustCompatibility:async()=>{},
    untrustCompatibility:async()=>{}
  } as any);
  await assert.rejects(()=>facade.probe('alpha'),(error:any)=>error?.code==='MCP_TRUST_REQUIRED'||error?.code==='PROJECT_TRUST_REQUIRED');
  assert.equal(probes,0);
});

test('M8-A RED — target-only probe reports official capabilities, effective tools, degradation and bounded safe logs',async()=>{
  const auth=authority(snapshot());
  const seen:string[]=[];
  const facade=createMcpFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust',mcp:'/legacy'}} as any},{
    authority:auth.api,
    loadServers:async()=>({server:[server,{...server,id:'beta',hash:'legacy-beta'}]}),
    probeServer:async(target:any)=>{
      seen.push(target.id);
      return{
        latencyMs:12,serverInfo:{name:'demo',version:'1.2.3'},protocolVersion:'2026-07-28',protocolEra:'modern',
        capabilities:{tools:{listChanged:true},logging:{},experimental:{vendorFeature:{}}},
        tools:[{name:'ping',description:'Ping',inputSchema:{type:'object'}}],
        logs:[
          {source:'protocol',level:'info',text:'ready\u001b[2J'},
          {source:'stderr',level:'stderr',text:'token sekret\nnext'}
        ]
      };
    },
    trustCompatibility:async()=>{},
    untrustCompatibility:async()=>{},
    fingerprintServer:async()=> 'fp-current',
    secretValues:['sekret']
  } as any);
  const row=await facade.probe('alpha');
  assert.deepEqual(seen,['alpha']);
  assert.equal(row.health.state,'degraded');
  assert.equal(row.health.latencyMs,12);
  assert.deepEqual(row.permission.effectiveTools,['ping']);
  assert.deepEqual(row.permission.missingAllowlistedTools,['missing']);
  assert.equal(row.capabilities?.tools,true);
  assert.equal(row.capabilities?.logging,true);
  assert.deepEqual(row.capabilities?.experimental,['vendorFeature']);
  assert.equal(row.server?.name,'demo');
  assert.equal(row.protocol?.version,'2026-07-28');
  const encoded=JSON.stringify(row.logs);
  assert.equal(encoded.includes('\u001b'),false,'raw ESC must not survive');
  assert.equal(encoded.includes('sekret'),false,'known secrets must be redacted');
  assert.equal(row.logs.every((entry:any)=>!entry.text.includes('\n')),true,'logs must be single-line terminal-safe rows');
});

test('M8-A RED — trust is review-bound and compatibility mirror follows unified authority',async()=>{
  const auth=authority(snapshot('added'));
  const order:string[]=[];
  const facade=createMcpFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust',mcp:'/legacy'}} as any},{
    authority:auth.api,
    loadServers:async()=>({server:[server]}),
    probeServer:async()=>{throw new Error('unused');},
    trustCompatibility:async(target:any)=>{order.push('mirror:'+target.id);},
    untrustCompatibility:async()=>{},
    fingerprintServer:async()=> 'fp-current'
  } as any);
  const result=await facade.trust('alpha');
  assert.equal(result.changed,true);
  assert.equal(auth.calls[0]?.[0],'trust');
  assert.equal(auth.calls[0]?.[2]?.resources?.[0]?.currentFingerprint,'fp-current');
  assert.deepEqual(order,['mirror:alpha']);
});

test('M8-A RED — untrust revokes unified scope and removes compatibility authority',async()=>{
  const auth=authority(snapshot());
  const order:string[]=[];
  const facade=createMcpFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust',mcp:'/legacy'}} as any},{
    authority:auth.api,
    loadServers:async()=>({server:[server]}),
    probeServer:async()=>{throw new Error('unused');},
    trustCompatibility:async()=>{},
    untrustCompatibility:async(id:string)=>{order.push('remove:'+id);}
  } as any);
  const result=await facade.untrust('alpha');
  assert.equal(result.changed,true);
  assert.equal(auth.calls[0]?.[0],'untrust');
  assert.deepEqual(order,['remove:alpha']);
});

test('M8-A hardening RED — trusted row with loaded-config fingerprint mismatch fails before spawn',async()=>{
  const auth=authority(snapshot());
  let probes=0;
  const facade=createMcpFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust',mcp:'/legacy'}} as any},{
    authority:auth.api,
    loadServers:async()=>({server:[server]}),
    fingerprintServer:async()=> 'different-fingerprint',
    probeServer:async()=>{probes++;return{} as any;},
    trustCompatibility:async()=>{},
    untrustCompatibility:async()=>{}
  } as any);
  await assert.rejects(()=>facade.probe('alpha'),(error:any)=>error?.code==='MCP_TRUST_INVALIDATED');
  assert.equal(probes,0);
});

test('M8-A hardening RED — malformed registry state is normalized to a closed MCP configuration error',async()=>{
  const auth=authority(snapshot());
  const facade=createMcpFacade({projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust',mcp:'/legacy'}} as any},{
    authority:auth.api,
    loadServers:async()=>{throw Object.assign(new Error('bad registry'),{code:'RESOURCE_CONFIG_MALFORMED'});},
    probeServer:async()=>{throw new Error('unused');},
    trustCompatibility:async()=>{},
    untrustCompatibility:async()=>{}
  } as any);
  await assert.rejects(()=>facade.list(),(error:any)=>error?.code==='MCP_CONFIG_MALFORMED');
});

test('M8-A hardening RED — default probe owns protocol logs, piped stderr and closes a client whose connect fails',async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/services/mcp-facade.ts',import.meta.url),'utf8'));
  assert.match(source,/setNotificationHandler\?\.\('notifications\/message'/u);
  assert.match(source,/redactObject\(params\.data,secrets\)/u);
  assert.match(source,/stderr:'pipe'/u);
  assert.match(source,/class CapturingClient extends ClientBase[\s\S]{0,900}async connect\(/u);
  assert.match(source,/async connect\([\s\S]{0,700}this\.close\(\)/u);
  assert.match(source,/finally[\s\S]{0,300}connection\?\.chiudi/u);
});
