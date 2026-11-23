import assert from 'node:assert/strict';
import test from 'node:test';
import {trustCenterModel,renderTrustCenterLines,inertTrustCenterText} from '../../src/tui/overlays/trust-center.ts';
import {projectTrustPromptModel} from '../../src/tui/project-trust-prompt.ts';

function snapshot(overrides:any={}){
  return{
    trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED',storeSchema:'v2',migrationRequired:false,rollbackAvailable:false,
    workspace:{canonicalRoot:'/repo/project',requestedRoot:'/repo/project',gitRoot:'/repo/project',nestedRepository:false,identityHash:'abc'},
    resources:[
      {key:'context:AGENTS.md',kind:'context',id:'AGENTS.md',relativePath:'AGENTS.md',state:'trusted',currentFingerprint:'a',trustedFingerprint:'a'},
      {key:'plugin:.harness-ui-plugins/demo/run.js',kind:'plugin',id:'.harness-ui-plugins/demo/run.js',relativePath:'.harness-ui-plugins/demo/run.js',state:'changed',currentFingerprint:'b',trustedFingerprint:'a'},
      {key:'mcp:.harness-ui-mcp.json',kind:'mcp',id:'.harness-ui-mcp.json',relativePath:'.harness-ui-mcp.json',state:'trusted',currentFingerprint:'c',trustedFingerprint:'c'}
    ],
    nestedRepositories:[{relativePath:'.harness-ui-plugins/demo',root:'/repo/project/.harness-ui-plugins/demo',resources:['.harness-ui-plugins/demo/run.js']}],
    ...overrides
  };
}

test('trust center separates permission mode, project trust and resource trust',()=>{
  const model=trustCenterModel(snapshot() as any,{permissionMode:'default'});
  assert.equal(model.title,'TALOS · Security & trust');
  assert.match(model.projectSection.join('\n'),/NOT TRUSTED/u);
  assert.match(model.permissionSection.join('\n'),/Permission mode: default/u);
  assert.match(model.resourceSection.join('\n'),/plugin.*changed.*run\.js/iu);
  assert.match(model.resourceSection.join('\n'),/context.*trusted.*AGENTS\.md/iu);
  assert.match(model.nestedSection.join('\n'),/Nested repository.*\.harness-ui-plugins\/demo/iu);
  assert.match(model.actions.join('\n'),/talos project status/u);
  assert.match(model.actions.join('\n'),/talos project trust/u);
});

test('migration and rollback actions appear only when they are actually available',()=>{
  const legacy=trustCenterModel(snapshot({trusted:true,reason:'PROJECT_TRUSTED',storeSchema:'v1',migrationRequired:true,rollbackAvailable:false,resources:snapshot().resources.map((row:any)=>({...row,state:'trusted'}))}) as any,{permissionMode:'plan'});
  const legacyLines=renderTrustCenterLines(legacy).join('\n');
  assert.match(legacyLines,/legacy v1/iu);
  assert.match(legacyLines,/migrate-trust/u);
  assert.doesNotMatch(legacyLines,/rollback-trust-migration/u);
  assert.match(legacyLines,/Permission mode: plan/u);

  const migrated=trustCenterModel(snapshot({trusted:true,reason:'PROJECT_TRUSTED',storeSchema:'v2',migrationRequired:false,rollbackAvailable:true,resources:snapshot().resources.map((row:any)=>({...row,state:'trusted'}))}) as any,{permissionMode:'default'});
  const migratedLines=renderTrustCenterLines(migrated).join('\n');
  assert.doesNotMatch(migratedLines,/migrate-trust/u);
  assert.match(migratedLines,/rollback-trust-migration/u);
});

test('terminal-control and bidi text is inert in project, resource and nested labels',()=>{
  const bad='/repo/\u001b[2J\u202ehidden';
  const value=snapshot({
    workspace:{...snapshot().workspace,canonicalRoot:bad,requestedRoot:bad},
    resources:[{...snapshot().resources[1],relativePath:'bad\u0007file\u2066.js'}],
    nestedRepositories:[{relativePath:'vendor\u0007repo\u2066',root:'/x',resources:[]}]
  });
  const lines=renderTrustCenterLines(trustCenterModel(value as any,{permissionMode:'default'})).join('\n');
  for(const raw of ['\u001b','\u202e','\u0007','\u2066'])assert.equal(lines.includes(raw),false);
  assert.match(lines,/\\u001b/u);
  assert.match(lines,/\\u202e/u);
  assert.match(lines,/\\u0007/u);
  assert.equal(inertTrustCenterText('plain/path'),'plain/path');
});

test('removed resources are visible instead of disappearing from review',()=>{
  const value=snapshot({resources:[...snapshot().resources,{key:'hook:old',kind:'hook',id:'old',relativePath:'.harness-ui-hooks.json',state:'removed',trustedFingerprint:'old'}]});
  const lines=renderTrustCenterLines(trustCenterModel(value as any,{permissionMode:'default'})).join('\n');
  assert.match(lines,/hook.*removed.*\.harness-ui-hooks\.json/iu);
});


test('granular hook and MCP decisions show their ids even when they share one config path',()=>{
  const shared='.harness-ui-mcp.json';
  const value=snapshot({resources:[
    {key:'mcp:docs',kind:'mcp',id:'docs',relativePath:shared,state:'trusted',currentFingerprint:'a',trustedFingerprint:'a'},
    {key:'mcp:search',kind:'mcp',id:'search',relativePath:shared,state:'changed',currentFingerprint:'b',trustedFingerprint:'a'}
  ]});
  const center=trustCenterModel(value as any,{permissionMode:'default'}).resourceSection.join('\n');
  assert.match(center,/mcp · docs · trusted · \.harness-ui-mcp\.json/u);
  assert.match(center,/mcp · search · changed · \.harness-ui-mcp\.json/u);

  const assessment:any={
    trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED',
    workspace:value.workspace,
    resources:[
      {workspaceIdentityHash:'abc',kind:'mcp',id:'docs',relativePath:shared,fingerprint:'a'},
      {workspaceIdentityHash:'abc',kind:'mcp',id:'search',relativePath:shared,fingerprint:'b'}
    ],
    storeSchema:'v2',migrationRequired:false
  };
  const prompt=projectTrustPromptModel({assessment,nestedRepositories:[]}).resources.join('\n');
  assert.match(prompt,/mcp · docs · \.harness-ui-mcp\.json/u);
  assert.match(prompt,/mcp · search · \.harness-ui-mcp\.json/u);
});
