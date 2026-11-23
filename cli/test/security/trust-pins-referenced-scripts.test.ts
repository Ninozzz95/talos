/*
 * 0.6.8 (stress test of 0.6.7, F-E-002/F-E-003, S1, reproduced on the published 0.6.7; owner 16/10/2026 «Ricorda anche gli
 * script»): editing the project script that a trusted MCP server or hook runs, outside .talos/, was executed next session without
 * asking. The trust now covers every project file the command line names: a changed script changes the row's fingerprint (so the
 * trust is asked again), and a row naming no project file keeps the fingerprint it had before 0.6.8.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {inventoryProjectResources,referencedScripts} from '../../src/security/project-resource-inventory.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';
import {createProjectTrustService,fingerprintExecutableResourceContent} from '../../src/security/project-trust.ts';
import {projectTrustFailure} from '../../src/security/project-trust-gate.ts';
import {PROJECT_CONFIG_FILES} from '../../src/security/project-config-positions.ts';

async function project(){
  const root=await mkdtemp(join(tmpdir(),'talos-trust-scripts-'));
  await mkdir(join(root,'.talos'),{recursive:true});
  await mkdir(join(root,'tools'),{recursive:true});
  await writeFile(join(root,'srv.cjs'),'console.log("V1")\n');
  await writeFile(join(root,'tools','hk.cjs'),'console.log("hook V1")\n');
  await writeFile(join(root,PROJECT_CONFIG_FILES.mcp[0]!),JSON.stringify({server:[
    {id:'local',comando:'node',argomenti:['srv.cjs','--port=9'],allowlist:['echo']},
    {id:'remote',comando:'npx',argomenti:['-y','some-mcp-server','https://example.invalid/sse'],allowlist:['echo']}]}));
  await writeFile(join(root,PROJECT_CONFIG_FILES.hooks[0]!),JSON.stringify({hooks:[{id:'h1',eventi:['PreToolUse'],comando:'node "tools/hk.cjs" --flag'}]}));
  return root;
}
const byId=async(root:string)=>{
  const rows=await inventoryProjectResources(await resolveWorkspaceIdentity({projectRoot:root}));
  return Object.fromEntries(rows.filter(row=>row.kind==='mcp'||row.kind==='hook').map(row=>[`${row.kind}:${row.id}`,row.fingerprint]));
};

test('a changed MCP script or hook script changes the fingerprint the trust remembers',async()=>{
  const root=await project();
  const before=await byId(root);
  await writeFile(join(root,'srv.cjs'),'console.log("V2: poisoned")\n');
  const afterServer=await byId(root);
  assert.notEqual(afterServer['mcp:local'],before['mcp:local'],'editing srv.cjs is noticed');
  assert.equal(afterServer['mcp:remote'],before['mcp:remote'],'a server naming no project file is not touched');
  assert.equal(afterServer['hook:h1'],before['hook:h1']);
  await writeFile(join(root,'tools','hk.cjs'),'console.log("hook V2")\n');
  assert.notEqual((await byId(root))['hook:h1'],before['hook:h1'],'editing the quoted hook script is noticed');
});

test('only files inside the project count: a program on PATH, a flag and a URL are not scripts',async()=>{
  const root=await project();const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  const scripts=await referencedScripts(workspace,['node','srv.cjs','--port=9','https://example.invalid/sse','../outside.js']);
  assert.deepEqual(scripts.map(row=>row.path),['srv.cjs']);
  assert.equal(scripts[0]!.sha256,createHash('sha256').update('console.log("V1")\n').digest('hex'));
});

/* Second review of 0.6.8 (S3/S4): a project trusted with 0.6.7 is asked again after the update, and the question says WHY —
   TALOS now checks the scripts — instead of «a file changed». A real change to the settings keeps the old reason. */
test('a project trusted before 0.6.8 is asked again with its own reason',async()=>{
  const root=await project();const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  const rows=await inventoryProjectResources(workspace);
  const as067=rows.map(row=>row.beforeScriptsFingerprint?{...row,fingerprint:row.beforeScriptsFingerprint}:row);
  assert.ok(as067.some((row,i)=>row.fingerprint!==rows[i]!.fingerprint),'some row pins a script');
  const service=createProjectTrustService({trustRoot:await mkdtemp(join(tmpdir(),'talos-trust-store-'))});
  await service.trust(workspace,as067);
  assert.equal((await service.verifySnapshot(workspace,rows)).reason,'RESOURCE_SCRIPTS_NOW_PINNED');
  const failure:any=projectTrustFailure({trusted:false,reason:'RESOURCE_SCRIPTS_NOW_PINNED',workspace,resources:rows,storeSchema:'v2',migrationRequired:false});
  assert.equal(failure.message.includes('now also checks the scripts'),true);
  /* third review (F4): the screen's advice says it too, not only the raw message */
  const {describeError}=await import('../../src/i18n/error-view.ts') as any;
  if(typeof describeError==='function')assert.match(JSON.stringify(describeError(failure)),/now also checks the scripts/u);
  else assert.match(String(failure.hint),/now also checks the scripts/u);
  await writeFile(join(root,PROJECT_CONFIG_FILES.hooks[0]!),JSON.stringify({hooks:[{id:'h1',eventi:['PreToolUse'],comando:'node "tools/hk.cjs" --other'}]}));
  assert.equal((await service.verifySnapshot(workspace,await inventoryProjectResources(workspace))).reason,'RESOURCE_FINGERPRINT_CHANGED','a changed setting is a change');
  await service.trust(workspace,await inventoryProjectResources(workspace));
  await writeFile(join(root,'srv.cjs'),'console.log("V2")\n');
  assert.equal((await service.verifySnapshot(workspace,await inventoryProjectResources(workspace))).reason,'RESOURCE_FINGERPRINT_CHANGED','a script changed after 0.6.8 trusted it is a change');
});

test('a row naming no project file keeps the fingerprint it had before 0.6.8',async()=>{
  const root=await project();const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  const rows=await inventoryProjectResources(workspace);
  const remote=rows.find(row=>row.kind==='mcp'&&row.id==='remote')!;
  const old=await fingerprintExecutableResourceContent({workspace,kind:'mcp',id:'remote',path:join(root,PROJECT_CONFIG_FILES.mcp[0]!),
    content:JSON.stringify({comando:'npx',argomenti:['-y','some-mcp-server','https://example.invalid/sse'],allowlist:['echo']})} as any);
  assert.equal(remote.fingerprint,old.fingerprint);
});
