import assert from 'node:assert/strict';
import test from 'node:test';
import {createPluginFacade} from '../../src/services/plugin-facade.ts';

const plugin={
  id:'demo',nome:'Demo',descrizione:'demo plugin',
  tools:[{nome:'run',descrizione:'run',comando:'node run.js'}],
  hooks:[{id:'audit',eventi:['pre_tool_call'],comando:'node hook.js'}],
  hash:'legacy-package-hash'
};
const safeGuard={verdict:'caution',findings:[{severity:'caution',code:'LOCAL_COMMAND_EXECUTION',origin:'tool:run',message:'executes a local command'}],capabilities:['process']};
const dangerousGuard={verdict:'dangerous',findings:[{severity:'dangerous',code:'REMOTE_PIPE_EXECUTION',origin:'run.js',message:'downloads and executes remote content in one step'}],capabilities:['network','process']};

function snapshot(state:'trusted'|'changed'|'added'='trusted'){
  const rows=[
    ['plugin:.harness-ui-plugins/demo/plugin.json','.harness-ui-plugins/demo/plugin.json','fp-manifest'],
    ['plugin:.harness-ui-plugins/demo/run.js','.harness-ui-plugins/demo/run.js','fp-run']
  ];
  return{
    trusted:state==='trusted',reason:state==='trusted'?'PROJECT_TRUSTED':'RESOURCE_FINGERPRINT_CHANGED',
    storeSchema:'v2',migrationRequired:false,rollbackAvailable:false,
    workspace:{canonicalRoot:'/project',identityHash:'workspace-1'},nestedRepositories:[],
    resources:rows.map(([key,relativePath,fingerprint],index)=>({
      key,kind:'plugin',id:relativePath,relativePath,
      state:index===1?state:'trusted',
      current:{workspaceIdentityHash:'workspace-1',kind:'plugin',id:relativePath,relativePath,fingerprint},
      currentFingerprint:fingerprint,
      trustedFingerprint:state==='trusted'?fingerprint:(index===1?'fp-old':fingerprint)
    }))
  } as any;
}
function authority(initial=snapshot()){
  let current=initial;let quarantine:any=null;const calls:any[]=[];
  return{
    calls,
    api:{
      inspect:async()=>current,
      verifyScope:async()=>current.resources.every((row:any)=>row.state==='trusted')&&!quarantine,
      trustScope:async(scope:any,options:any)=>{calls.push(['trust',scope,options?.expected]);current=snapshot('trusted');return{changed:true,snapshot:current};},
      untrustScope:async(scope:any)=>{calls.push(['untrust',scope]);current=snapshot('added');return{changed:true,snapshot:current};},
      quarantineScope:async(scope:any,options:any)=>{calls.push(['quarantine',scope,options]);quarantine={active:true,reason:options?.reason??null,quarantinedAt:'2026-09-21T10:00:00.000Z',reviewedFingerprint:'fp-manifest'};current=snapshot('added');return{changed:true,snapshot:current,record:quarantine};},
      releaseQuarantine:async(scope:any)=>{calls.push(['release',scope]);const changed=Boolean(quarantine);quarantine=null;return{changed};},
      quarantineStatus:async()=>quarantine,
      compatibilityRoots:async()=>({hooks:'/hooks',mcp:'/mcp',plugins:'/plugins'})
    } as any
  };
}
function deps(auth:any,extra:any={}){
  return{
    authority:auth.api,
    loadPlugins:async()=>({plugin:[plugin],falliti:[]}),
    scanPlugin:async()=>safeGuard,
    listInstalledPackages:async()=>[],
    pathExists:async()=>false,
    trustCompatibility:async()=>{},
    untrustCompatibility:async()=>{},
    ...extra
  } as any;
}
function input(){return{projectRoot:'/project',repoRoot:'/repo',paths:{trust:{projects:'/trust'},sessionsRoot:'/sessions'} as any};}

test('M8-C RED — passive list exposes Guard fingerprint diff and quarantine without executing plugin code',async()=>{
  const auth=authority();let scans=0;
  const facade=createPluginFacade(input(),deps(auth,{scanPlugin:async(_plugin:any,_review:any)=>{scans++;return safeGuard;}}));
  const rows=await facade.list();
  assert.equal(rows.length,1);assert.equal(scans,1);
  assert.equal(rows[0]?.id,'demo');
  assert.equal(rows[0]?.registry.state,'loaded');
  assert.equal(rows[0]?.guard?.verdict,'caution');
  assert.equal(rows[0]?.trust.effectiveTrusted,true);
  assert.equal(rows[0]?.fingerprints.currentSetDigest.length,64);
  assert.equal(rows[0]?.fingerprints.trustedSetDigest.length,64);
  assert.deepEqual(rows[0]?.fingerprints.changedPaths,[]);
  assert.equal(rows[0]?.quarantine.active,false);
});

test('M8-C RED — registry failures remain visible and never receive a fabricated safe Guard verdict',async()=>{
  const auth=authority(snapshot('added'));let scans=0;
  const facade=createPluginFacade(input(),deps(auth,{
    loadPlugins:async()=>({plugin:[],falliti:[{pluginId:'broken',codice:'PLUGIN_MALFORMED',messaggio:'bad manifest',frase:'Package cannot load'}]}),
    scanPlugin:async()=>{scans++;return safeGuard;}
  }));
  const rows=await facade.list();
  assert.equal(scans,0);
  // Since bc28c0fcc list() also shows plugin ids found in the trust snapshot (here demo, as missing);
  // no row, failed or missing, may carry a Guard verdict that was never computed.
  const broken=rows.find(row=>row.id==='broken');
  assert.ok(broken);
  assert.equal(broken.registry.state,'failed');
  assert.equal(broken.registry.code,'PLUGIN_MALFORMED');
  assert.equal(broken.guard,null);
  assert.equal(broken.trust.effectiveTrusted,false);
  assert.deepEqual(rows.map(row=>[row.id,row.registry.state,row.guard]).sort(),[['broken','failed',null],['demo','missing',null]]);
});

test('M8-C RED — managed provenance keeps persistent package evidence but marks a vanished recorded ZIP source unverified',async()=>{
  const auth=authority();
  const record={
    id:'demo',name:'Demo extension',version:'1.2.3',source:'/tmp/talos-ext-deleted',
    components:{plugin:{id:'demo',hash:'legacy'}}
  };
  const facade=createPluginFacade(input(),deps(auth,{
    listInstalledPackages:async()=>[record],
    pathExists:async(path:string)=>path.replaceAll('\\','/').endsWith('/.talos-cli/extensions/demo/package')
  }));
  const row=(await facade.list())[0]!;
  assert.equal(row.provenance.kind,'managed-extension');
  assert.equal(row.provenance.extension?.version,'1.2.3');
  assert.equal(row.provenance.packageCopyPresent,true);
  assert.equal(row.provenance.recordedSource,'/tmp/talos-ext-deleted');
  assert.equal(row.provenance.recordedSourceAvailable,false);
  assert.equal(row.provenance.recordedSourceAuthority,'advisory-only');
});

test('M8-C RED — plugin with no managed extension record is explicitly unmanaged',async()=>{
  const auth=authority();
  const row=(await createPluginFacade(input(),deps(auth)).list())[0]!;
  assert.equal(row.provenance.kind,'unmanaged-project-plugin');
  assert.equal(row.provenance.extension,null);
});

test('M8-C RED — dangerous Guard overrides a nominal authority trust answer in the visible effective state',async()=>{
  const auth=authority();
  const facade=createPluginFacade(input(),deps(auth,{scanPlugin:async()=>dangerousGuard}));
  const row=(await facade.list())[0]!;
  assert.equal(row.guard?.verdict,'dangerous');
  assert.equal(row.trust.scopeTrusted,true);
  assert.equal(row.trust.effectiveTrusted,false);
});

test('M8-C RED — dangerous or review-changed Guard refuses before unified trust and compatibility mirror',async()=>{
  const auth=authority();const order:string[]=[];
  const facade=createPluginFacade(input(),deps(auth,{
    scanPlugin:async(_plugin:any,review:any)=>{assert.equal(review.resources.length,2);return dangerousGuard;},
    trustCompatibility:async()=>order.push('mirror')
  }));
  await assert.rejects(()=>facade.trust('demo'),(error:any)=>error?.code==='PLUGIN_DANGEROUS');
  assert.equal(auth.calls.some((row:any)=>row[0]==='trust'),false);
  assert.deepEqual(order,[]);
});

test('M8-C RED — successful trust is snapshot-bound and mirrors only after unified authority',async()=>{
  const auth=authority(snapshot('added'));const order:string[]=[];
  const original=auth.api.trustScope;
  auth.api.trustScope=async(scope:any,options:any)=>{order.push('authority');return original(scope,options);};
  const facade=createPluginFacade(input(),deps(auth,{
    scanPlugin:async(_plugin:any,review:any)=>{assert.equal(review.workspaceIdentityHash,'workspace-1');return safeGuard;},
    trustCompatibility:async(target:any)=>order.push('mirror:'+target.id)
  }));
  const result=await facade.trust('demo');
  assert.equal(result.changed,true);
  assert.equal(auth.calls.find((row:any)=>row[0]==='trust')?.[2]?.resources?.length,2);
  assert.deepEqual(order,['authority','mirror:demo']);
});

test('M8-C RED — revoke and quarantine remove compatibility authority; quarantine release never re-trusts',async()=>{
  const auth=authority();let removals=0;
  const facade=createPluginFacade(input(),deps(auth,{untrustCompatibility:async()=>{removals++;}}));
  await facade.untrust('demo');
  assert.equal(removals,1);
  const auth2=authority();removals=0;
  const facade2=createPluginFacade(input(),deps(auth2,{untrustCompatibility:async()=>{removals++;}}));
  await facade2.quarantine('demo','owner review');
  assert.equal(removals,1);
  assert.equal((await facade2.list())[0]?.quarantine.active,true);
  await facade2.releaseQuarantine('demo');
  assert.equal(removals,2);
  assert.equal(await auth2.api.verifyScope({kind:'plugin',id:'demo'}),false);
});

test('M8-C hardening RED — managed extension state with unreadable installed record remains visible as invalid provenance',async()=>{
  const auth=authority(snapshot('added'));
  const facade=createPluginFacade(input(),deps(auth,{
    loadPlugins:async()=>({plugin:[],falliti:[]}),
    listInstalledPackages:async()=>[],
    listManagedStateIds:async()=>['orphan'],
    pathExists:async(path:string)=>path.replaceAll('\\','/').includes('/.talos-cli/extensions/orphan')
  }));
  const rows=await facade.list();
  const row=rows.find((entry:any)=>entry.id==='orphan');
  assert.ok(row,'managed state directory must remain visible even when installed.json could not be parsed');
  assert.equal(row.provenance.kind,'managed-state-invalid');
  assert.equal(row.registry.state,'missing');
  assert.equal(row.trust.effectiveTrusted,false);
});

test('M8-C hardening RED — structurally corrupt installed records degrade to managed-state-invalid instead of hiding the Plugin Center',async()=>{
  const auth=authority(snapshot('added'));
  const facade=createPluginFacade(input(),deps(auth,{
    loadPlugins:async()=>({plugin:[plugin],falliti:[]}),
    listInstalledPackages:async()=>{throw new TypeError('invalid installed extension record');},
    listManagedStateIds:async()=>['demo'],
    pathExists:async(path:string)=>path.replaceAll('\\','/').includes('/.talos-cli/extensions/demo')
  }));
  const row=(await facade.list()).find((entry:any)=>entry.id==='demo');
  assert.ok(row);
  assert.equal(row.provenance.kind,'managed-state-invalid');
  assert.equal(row.trust.effectiveTrusted,false);
});
