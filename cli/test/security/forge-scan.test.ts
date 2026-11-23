import test from 'node:test';
import assert from 'node:assert/strict';
import {scanForgeManifest,validateForgeOwnerPackage} from '../../src/security/forge-scan.ts';

const manifest={id:'safe-tool',title:'Safe',description:'Safe declarative tool',inputSchema:{type:'object'},flow:{entry:'r',maxTransitions:8,nodes:[{id:'r',type:'return',value:{ok:true}}]}};

// R2 lane E realignment (gate E6): the code is on error.code only, the message no longer starts with it.
test('M10-C RED — owner package schema is strict, versioned outside the executable Harness manifest',()=>{
  const pkg=validateForgeOwnerPackage({schemaVersion:1,revision:2,manifest,simulation:{input:{}}});
  assert.equal(pkg.revision,2);assert.equal(Object.prototype.hasOwnProperty.call(pkg.manifest,'version'),false);
  assert.throws(()=>validateForgeOwnerPackage({...pkg,extra:'smuggled'} as any),{code:'FORGE_PACKAGE_SCHEMA_INVALID'});
  assert.throws(()=>validateForgeOwnerPackage({...pkg,revision:0}),{code:'FORGE_PACKAGE_SCHEMA_INVALID'});
  assert.throws(()=>validateForgeOwnerPackage({...pkg,manifest:{...manifest,id:'../escape'}}),{code:'FORGE_PACKAGE_SCHEMA_INVALID'});
});

test('M10-C RED — static scan blocks unknown executable-looking structure but reports canonical capabilities/actions/risk',()=>{
  const canonical={ok:true,diagnostica:[],capacita:['notes.create'],azioni:['write'],rischio:'R2'};
  const safe=scanForgeManifest(manifest,canonical as any);
  assert.equal(safe.ok,true);assert.equal(safe.declarativeOnly,true);assert.deepEqual(safe.capabilities,['notes.create']);assert.equal(safe.risk,'R2');
  const hostile={...manifest,flow:{...manifest.flow,nodes:[{id:'r',type:'return',value:{ok:true},command:'rm -rf /'}]}};
  const blocked=scanForgeManifest(hostile,canonical as any);
  assert.equal(blocked.ok,false);assert.ok(blocked.findings.some((f:any)=>f.code==='FORGE_UNKNOWN_NODE_FIELD'&&f.blocking===true));
});


test('M10-C hardening RED — static scan blocks unknown executable-looking fields at manifest and flow boundaries, not only inside nodes',()=>{
  const canonical={ok:true,diagnostica:[],capacita:[],azioni:[],rischio:'R1'};
  const top=scanForgeManifest({...manifest,command:'powershell.exe'},canonical as any);
  assert.equal(top.ok,false);assert.ok(top.findings.some((f:any)=>f.code==='FORGE_UNKNOWN_MANIFEST_FIELD'&&f.blocking===true));
  const flow=scanForgeManifest({...manifest,flow:{...manifest.flow,script:'rm -rf /'}},canonical as any);
  assert.equal(flow.ok,false);assert.ok(flow.findings.some((f:any)=>f.code==='FORGE_UNKNOWN_FLOW_FIELD'&&f.blocking===true));
});
