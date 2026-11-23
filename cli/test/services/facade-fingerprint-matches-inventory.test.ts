/*
 * 0.6.9 (stress test of 0.6.8, F-C-001, S2, reproduced on the published 0.6.8 by the bugfixer): in a trusted project whose MCP server
 * runs `node srv.cjs` (or whose hook runs `node tools/hk.cjs`), `talos mcp trust/test` and `hook trust/dry-run` always failed with
 * MCP_TRUST_INVALIDATED / HOOK_TRUST_INVALIDATED: the facades pinned the declaration alone, the project inventory pinned it with the
 * project scripts it runs. These tests use the facades' OWN fingerprint (none injected, unlike the facade unit tests) against the
 * real inventory: the trust goes through, and a script changed after the review is still refused.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createMcpFacade} from '../../src/services/mcp-facade.ts';
import {createHookFacade} from '../../src/services/hook-facade.ts';
import {inventoryProjectResources} from '../../src/security/project-resource-inventory.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';
import {PROJECT_CONFIG_FILES} from '../../src/security/project-config-positions.ts';

const SERVER={id:'local',comando:'node',argomenti:['srv.cjs'],allowlist:['echo'],hash:'legacy-local'};
const PLAIN={id:'plain',comando:'node',argomenti:['--version'],allowlist:['echo'],hash:'legacy-plain'};
const HOOK={id:'h1',eventi:['pre_tool_call'],comando:'node tools/hk.cjs',hash:'legacy-h1'};

async function project(){
  const root=await mkdtemp(join(tmpdir(),'talos-facade-fp-'));
  await mkdir(join(root,'tools'),{recursive:true});
  await mkdir(join(root,'.talos'),{recursive:true});
  await writeFile(join(root,'srv.cjs'),'console.log("V1")\n');
  await writeFile(join(root,'tools','hk.cjs'),'console.log("hook V1")\n');
  await writeFile(join(root,PROJECT_CONFIG_FILES.mcp[0]!),JSON.stringify({server:[SERVER,PLAIN].map(({hash:_hash,...row})=>row)}));
  await writeFile(join(root,PROJECT_CONFIG_FILES.hooks[0]!),JSON.stringify({hooks:[{id:HOOK.id,eventi:HOOK.eventi,comando:HOOK.comando}]}));
  return root;
}
/* the authority's view as the project trust reviewed it: every resource trusted at the inventory's fingerprint of that moment */
async function reviewedAuthority(root:string){
  const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  const rows=await inventoryProjectResources(workspace);
  const snapshot={
    trusted:true,reason:'PROJECT_TRUSTED',storeSchema:'v2',migrationRequired:false,rollbackAvailable:false,workspace,nestedRepositories:[],
    resources:rows.map(row=>({key:`${row.kind}:${row.id}`,kind:row.kind,id:row.id,relativePath:row.relativePath,state:'trusted',current:row,currentFingerprint:row.fingerprint,trustedFingerprint:row.fingerprint}))
  } as any;
  const grants:string[]=[];
  return{grants,api:{
    inspect:async()=>snapshot,
    verifyScope:async()=>true,
    trustScope:async(scope:any)=>{grants.push(`${scope.kind}:${scope.id}`);return{changed:false,snapshot};},
    untrustScope:async()=>({changed:false,snapshot}),
    quarantineStatus:async()=>null,
    compatibilityRoots:async()=>({hooks:join(root,'compat-hooks'),mcp:join(root,'compat-mcp'),plugins:join(root,'compat-plugins')})
  } as any};
}
const options=(root:string)=>({projectRoot:root,repoRoot:root,paths:{trust:{projects:join(root,'trust'),mcp:join(root,'legacy')},sessionsRoot:join(root,'sessions')} as any});

test('F-C-001 — `mcp trust` of a server that runs a project script goes through with the facade\'s own fingerprint',async()=>{
  const root=await project();
  try{
    const auth=await reviewedAuthority(root);
    const facade=createMcpFacade(options(root),{authority:auth.api,loadServers:async()=>({server:[SERVER,PLAIN]}),trustCompatibility:async()=>{},untrustCompatibility:async()=>{}} as any);
    await facade.trust('local');
    await facade.trust('plain');
    assert.deepEqual(auth.grants,['mcp:local','mcp:plain']);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('F-C-001 — a server script changed after the review is still refused',async()=>{
  const root=await project();
  try{
    const auth=await reviewedAuthority(root);
    await writeFile(join(root,'srv.cjs'),'console.log("V2: changed after the review")\n');
    const facade=createMcpFacade(options(root),{authority:auth.api,loadServers:async()=>({server:[SERVER]}),trustCompatibility:async()=>{},untrustCompatibility:async()=>{}} as any);
    await assert.rejects(()=>facade.trust('local'),(error:any)=>error?.code==='MCP_TRUST_INVALIDATED');
    assert.deepEqual(auth.grants,[]);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('F-C-001 — `hook trust` of a hook that runs a project script goes through, and a changed script is refused',async()=>{
  const root=await project();
  try{
    const auth=await reviewedAuthority(root);
    const deps=()=>({authority:auth.api,loadHooks:async()=>({hooks:[HOOK]}),executeHook:async()=>({consentito:true}),trustCompatibility:async()=>{},untrustCompatibility:async()=>{},listSessionIds:async()=>[]}) as any;
    await createHookFacade(options(root),deps()).trust('h1');
    assert.deepEqual(auth.grants,['hook:h1']);
    await writeFile(join(root,'tools','hk.cjs'),'console.log("hook V2")\n');
    await assert.rejects(()=>createHookFacade(options(root),deps()).trust('h1'),(error:any)=>error?.code==='HOOK_TRUST_INVALIDATED');
  }finally{await rm(root,{recursive:true,force:true});}
});
